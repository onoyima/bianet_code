import { Router, type IRouter } from "express";
import { eq, and, desc, ilike } from "drizzle-orm";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}
import {
  db,
  usersTable,
  profilesTable,
  kycDocumentsTable,
  escrowTransactionsTable,
  adminActionLogsTable,
  ledgerEntriesTable,
  seedListingsTable,
  bartarListingsTable,
  educationalContentTable,
} from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { adminLimiter } from "../../../middlewares/rate-limit";
import { authorize } from "../../../middlewares/authorize";
import { logAdminAction } from "../../../middlewares/admin-log";
import {
  validateEscrowTransition,
  EscrowTransitionError,
  type EscrowStatus,
} from "../../../lib/escrow";
import {
  notifyKycApproved,
  notifyKycRejected,
  notifyEscrowReleased,
} from "../../../lib/notifications";
import { buildRefundLedgerEntries, buildReleaseToSellerLedgerEntries } from "../../../lib/financial";

const router: IRouter = Router();

router.use(adminLimiter);

const adminGuard = [authenticate, authorize("SUPER_ADMIN", "ADMIN_MODERATOR")];

// ─── KYC MODERATION ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/kyc
 */
router.get("/v1/admin/kyc", ...adminGuard, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
  const offset = (page - 1) * limit;
  const statusFilter = req.query["status"] as string | undefined;

  const conditions = statusFilter ? [eq(kycDocumentsTable.status, statusFilter)] : [];

  const rows = await db
    .select()
    .from(kycDocumentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(kycDocumentsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(kycDocumentsTable, conditions.length ? and(...conditions) : undefined) })
    .from(kycDocumentsTable);

  res.json({
    data: rows,
    meta: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * PATCH /api/v1/admin/kyc/:id/status
 */
router.patch(
  "/v1/admin/kyc/:id/status",
  ...adminGuard,
  logAdminAction("KYC_STATUS_UPDATE"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const adminId = req.user!.sub;
    const { status, notes } = req.body as {
      status?: string;
      notes?: string | null;
    };

    const allowedStatuses = ["APPROVED", "REJECTED", "UNDER_REVIEW"];
    if (!status || !allowedStatuses.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowedStatuses.join(", ")}` });
      return;
    }

    const [doc] = await db
      .select()
      .from(kycDocumentsTable)
      .where(eq(kycDocumentsTable.id, rawId))
      .limit(1);

    if (!doc) {
      res.status(404).json({ error: "KYC document not found" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(kycDocumentsTable)
        .set({
          status,
          reviewedById: adminId,
          reviewerNotes: notes ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(kycDocumentsTable.id, rawId))
        .returning();

      if (status === "APPROVED" || status === "REJECTED") {
        await tx
          .update(usersTable)
          .set({ kycStatus: status })
          .where(eq(usersTable.id, doc.userId));
      }

      return [u];
    }, { isolationLevel: "serializable" });

    // Send notification
    if (status === "APPROVED") {
      await notifyKycApproved(doc.userId);
    } else if (status === "REJECTED") {
      await notifyKycRejected(doc.userId, notes ?? "No reason provided.");
    }

    res.json(updated);
  },
);

// ─── ESCROW ARBITRATION ────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/escrow/:id/arbitrate
 */
router.post(
  "/v1/admin/escrow/:id/arbitrate",
  ...adminGuard,
  logAdminAction("ESCROW_ARBITRATION"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const { decision, payoutBuyer, payoutSeller, notes } = req.body as {
      decision?: string;
      payoutBuyer?: string | null;
      payoutSeller?: string | null;
      notes?: string;
    };

    const allowedDecisions = ["RELEASE_TO_SELLER", "REFUND_TO_BUYER", "SPLIT"];
    if (!decision || !allowedDecisions.includes(decision)) {
      res.status(400).json({ error: `decision must be one of: ${allowedDecisions.join(", ")}` });
      return;
    }

    if (!notes || notes.length < 20) {
      res.status(400).json({ error: "notes must be at least 20 characters" });
      return;
    }

    const [escrow] = await db
      .select()
      .from(escrowTransactionsTable)
      .where(eq(escrowTransactionsTable.id, rawId))
      .limit(1);

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    try {
      validateEscrowTransition(escrow.status as EscrowStatus, "ARBITRATION_SETTLED");
    } catch (e) {
      if (e instanceof EscrowTransitionError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    const [updated] = await db.transaction(async (tx) => {
      let finalStatus: EscrowStatus = "ARBITRATION_SETTLED";

      if (decision === "RELEASE_TO_SELLER") {
        finalStatus = "FUNDS_RELEASED";
        const entries = buildReleaseToSellerLedgerEntries(
          rawId,
          escrow.netSellerPayout as string,
          escrow.currency,
        );
        await tx.insert(ledgerEntriesTable).values(entries);
      } else if (decision === "REFUND_TO_BUYER") {
        finalStatus = "REFUNDED";
        const entries = buildRefundLedgerEntries(
          rawId,
          escrow.amount as string,
          escrow.currency,
        );
        await tx.insert(ledgerEntriesTable).values(entries);
      }

      const [u] = await tx
        .update(escrowTransactionsTable)
        .set({
          status: finalStatus,
          arbitrationNotes: notes,
          releasedAt: new Date(),
        })
        .where(eq(escrowTransactionsTable.id, rawId))
        .returning();

      return [u];
    }, { isolationLevel: "serializable" });

    if (decision === "RELEASE_TO_SELLER") {
      await notifyEscrowReleased(escrow.sellerId, rawId, escrow.netSellerPayout as string);
    }

    res.json(updated);
  },
);

/**
 * POST /api/v1/admin/escrow/:id/release
 * Force-release escrow to seller (non-disputed).
 */
router.post(
  "/v1/admin/escrow/:id/release",
  ...adminGuard,
  logAdminAction("ESCROW_RELEASE"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [escrow] = await db
      .select()
      .from(escrowTransactionsTable)
      .where(eq(escrowTransactionsTable.id, rawId))
      .limit(1);

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    try {
      validateEscrowTransition(escrow.status as EscrowStatus, "FUNDS_RELEASED");
    } catch (e) {
      if (e instanceof EscrowTransitionError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    const [updated] = await db.transaction(async (tx) => {
      const entries = buildReleaseToSellerLedgerEntries(
        rawId,
        escrow.netSellerPayout as string,
        escrow.currency,
      );
      await tx.insert(ledgerEntriesTable).values(entries);

      const [u] = await tx
        .update(escrowTransactionsTable)
        .set({ status: "FUNDS_RELEASED", releasedAt: new Date() })
        .where(eq(escrowTransactionsTable.id, rawId))
        .returning();

      return [u];
    }, { isolationLevel: "serializable" });

    await notifyEscrowReleased(escrow.sellerId, rawId, escrow.netSellerPayout as string);

    res.json(updated);
  },
);

/**
 * POST /api/v1/admin/escrow/:id/refund
 * Force-refund escrow to buyer (non-disputed).
 */
router.post(
  "/v1/admin/escrow/:id/refund",
  ...adminGuard,
  logAdminAction("ESCROW_REFUND"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [escrow] = await db
      .select()
      .from(escrowTransactionsTable)
      .where(eq(escrowTransactionsTable.id, rawId))
      .limit(1);

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    try {
      validateEscrowTransition(escrow.status as EscrowStatus, "REFUNDED");
    } catch (e) {
      if (e instanceof EscrowTransitionError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    const [updated] = await db.transaction(async (tx) => {
      const entries = buildRefundLedgerEntries(
        rawId,
        escrow.amount as string,
        escrow.currency,
      );
      await tx.insert(ledgerEntriesTable).values(entries);

      const [u] = await tx
        .update(escrowTransactionsTable)
        .set({ status: "REFUNDED" })
        .where(eq(escrowTransactionsTable.id, rawId))
        .returning();

      return [u];
    }, { isolationLevel: "serializable" });

    res.json(updated);
  },
);

// ─── AUDIT LOGS ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/stats
 * Dashboard analytics.
 */
router.get("/v1/admin/stats", ...adminGuard, async (_req, res): Promise<void> => {
  const [userCount] = await db
    .select({ count: db.$count(usersTable) })
    .from(usersTable);

  const [kycPending] = await db
    .select({ count: db.$count(kycDocumentsTable, eq(kycDocumentsTable.verificationStatus, "PENDING")) })
    .from(kycDocumentsTable);

  const [escrowActive] = await db
    .select({ count: db.$count(escrowTransactionsTable, eq(escrowTransactionsTable.status, "FUNDS_HELD")) })
    .from(escrowTransactionsTable);

  const [escrowDisputed] = await db
    .select({ count: db.$count(escrowTransactionsTable, eq(escrowTransactionsTable.status, "IN_DISPUTE")) })
    .from(escrowTransactionsTable);

  const [seedListings] = await db
    .select({ count: db.$count(seedListingsTable) })
    .from(seedListingsTable);

  const [bartarListings] = await db
    .select({ count: db.$count(bartarListingsTable) })
    .from(bartarListingsTable);

  const [eduContent] = await db
    .select({ count: db.$count(educationalContentTable) })
    .from(educationalContentTable);

  res.json({
    totalUsers: Number(userCount.count),
    pendingKyc: Number(kycPending.count),
    activeEscrows: Number(escrowActive.count),
    disputedEscrows: Number(escrowDisputed.count),
    seedListings: Number(seedListings.count),
    bartarListings: Number(bartarListings.count),
    educationalContent: Number(eduContent.count),
  });
});

/**
 * GET /api/v1/admin/logs
 */
router.get("/v1/admin/logs", ...adminGuard, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
  const offset = (page - 1) * limit;
  const adminIdFilter = req.query["adminId"] as string | undefined;
  const actionFilter = req.query["action"] as string | undefined;

  const conditions = [];
  if (adminIdFilter) conditions.push(eq(adminActionLogsTable.adminId, adminIdFilter));
  if (actionFilter) conditions.push(ilike(adminActionLogsTable.action, `%${actionFilter}%`));

  const rows = await db
    .select()
    .from(adminActionLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminActionLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(adminActionLogsTable, conditions.length ? and(...conditions) : undefined) })
    .from(adminActionLogsTable);

  res.json({
    data: rows,
    meta: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * GET /api/v1/admin/logs/export/csv
 * Export audit logs as a CSV file.
 */
router.get("/v1/admin/logs/export/csv", ...adminGuard, async (req, res): Promise<void> => {
  const adminIdFilter = req.query["adminId"] as string | undefined;
  const actionFilter = req.query["action"] as string | undefined;

  const conditions = [];
  if (adminIdFilter) conditions.push(eq(adminActionLogsTable.adminId, adminIdFilter));
  if (actionFilter) conditions.push(ilike(adminActionLogsTable.action, `%${actionFilter}%`));

  const rows = await db
    .select()
    .from(adminActionLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminActionLogsTable.createdAt));

  const csv = toCsv(rows);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
  res.send(csv);
});

// ─── USER MANAGEMENT ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/users
 */
router.get("/v1/admin/users", ...adminGuard, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
  const offset = (page - 1) * limit;
  const roleFilter = req.query["role"] as string | undefined;
  const isActiveFilter = req.query["isActive"];

  const conditions = [];
  if (roleFilter) conditions.push(eq(usersTable.role, roleFilter));
  if (isActiveFilter !== undefined) {
    conditions.push(eq(usersTable.isActive, isActiveFilter === "true"));
  }

  const rows = await db
    .select({
      user: usersTable,
      profile: profilesTable,
    })
    .from(usersTable)
    .leftJoin(profilesTable, eq(usersTable.id, profilesTable.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(usersTable, conditions.length ? and(...conditions) : undefined) })
    .from(usersTable);

  const users = rows.map(({ user, profile }) => ({
    id: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    language: user.language,
    isActive: user.isActive,
    kycStatus: user.kycStatus,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    avatarUrl: profile?.avatarUrl,
    businessName: profile?.businessName,
    state: profile?.state,
    country: profile?.country ?? "Nigeria",
    createdAt: user.createdAt,
  }));

  res.json({
    data: users,
    meta: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * PATCH /api/v1/admin/users/:id/suspend
 */
router.patch(
  "/v1/admin/users/:id/suspend",
  ...adminGuard,
  logAdminAction("USER_SUSPEND"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const { isActive, reason: _reason } = req.body as {
      isActive?: boolean;
      reason?: string | null;
    };

    if (isActive === undefined) {
      res.status(400).json({ error: "isActive is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, rawId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db
      .update(usersTable)
      .set({ isActive })
      .where(eq(usersTable.id, rawId));

    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, rawId))
      .limit(1);

    res.json({
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      language: user.language,
      isActive,
      kycStatus: user.kycStatus,
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      avatarUrl: profile?.avatarUrl,
      businessName: profile?.businessName,
      state: profile?.state,
      country: profile?.country ?? "Nigeria",
      createdAt: user.createdAt,
    });
  },
);

export default router;
