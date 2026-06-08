import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql, getTableColumns } from "drizzle-orm";
import {
  db,
  seedListingsTable,
  escrowTransactionsTable,
  shipmentsTable,
  ledgerEntriesTable,
} from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { authorize } from "../../../middlewares/authorize";
import { seedLimiter } from "../../../middlewares/rate-limit";
import {
  calculateEscrowBreakdown,
  buildDepositLedgerEntries,
  buildReleaseToSellerLedgerEntries,
} from "../../../lib/financial";
import {
  validateEscrowTransition,
  EscrowTransitionError,
  type EscrowStatus,
} from "../../../lib/escrow";
import {
  haversineDistanceKm,
  latLngBoundingBox,
  buildPostgisNearbyQuery,
} from "../../../lib/geo";
import {
  notifyEscrowFunded,
  notifyEscrowReleased,
  notifyEscrowDisputed,
  notifyShipmentUpdate,
  createNotification,
} from "../../../lib/notifications";
import { generateVerificationCode } from "../../../lib/crypto";
import { verifyPin } from "../../../lib/crypto";
import { db as drizzleDb, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.use(seedLimiter);

// ─── LISTINGS ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/seed/listings
 */
router.post(
  "/v1/seed/listings",
  authenticate,
  authorize("FARMER", "AGRI_SUPPLIER", "TRADER", "COOPERATIVE_MANAGER", "SUPER_ADMIN", "ADMIN_MODERATOR"),
  async (req, res): Promise<void> => {
    const sellerId = req.user!.sub;
    const {
      title, description, price, currency = "NGN",
      quantity, unit, category, imageUrls, latitude, longitude, state,
    } = req.body as {
      title?: string; description?: string; price?: string; currency?: string;
      quantity?: string; unit?: string; category?: string; imageUrls?: string[];
      latitude?: number; longitude?: number; state?: string;
    };

    if (!title || !description || !price || !quantity || !unit || !category ||
        latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: "title, description, price, quantity, unit, category, latitude, longitude are required" });
      return;
    }

    const [listing] = await db
      .insert(seedListingsTable)
      .values({
        sellerId,
        title,
        description,
        price,
        currency,
        quantity,
        unit,
        category,
        imageUrls: imageUrls ?? [],
        latitude,
        longitude,
        state: state ?? null,
        status: "ACTIVE",
      })
      .returning();

    res.status(201).json(listing);
  },
);

/**
 * GET /api/v1/seed/listings/nearby
 * Geospatial search — uses PostGIS ST_DWithin when available,
 * falls back to Haversine formula on bounding-box pre-filtered rows.
 */
router.get(
  "/v1/seed/listings/nearby",
  authenticate,
  async (req, res): Promise<void> => {
    const lat = parseFloat(String(req.query["lat"]));
    const lng = parseFloat(String(req.query["lng"]));
    const radiusKm = parseFloat(String(req.query["radius_km"] ?? "50"));
    const category = req.query["category"] as string | undefined;
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: "lat and lng are required numeric query parameters" });
      return;
    }

    const usePostgis = process.env["POSTGIS_ENABLED"] === "true";

    if (usePostgis) {
      const { filter, distanceSql } = buildPostgisNearbyQuery(lat, lng, radiusKm);

      const conditions = [
        eq(seedListingsTable.status, "ACTIVE"),
        filter,
      ];

      if (category) {
        conditions.push(eq(seedListingsTable.category, category));
      }

      const columns = getTableColumns(seedListingsTable);
      const rows = await db
        .select({
          ...columns,
          distanceKm: distanceSql,
        })
        .from(seedListingsTable)
        .where(and(...conditions))
        .orderBy(distanceSql)
        .limit(limit)
        .offset((page - 1) * limit);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(seedListingsTable)
        .where(and(...conditions));

      res.json({
        data: rows,
        meta: {
          page,
          limit,
          total: Number(countResult.count),
          totalPages: Math.ceil(Number(countResult.count) / limit),
        },
      });
    } else {
      const { minLat, maxLat, minLng, maxLng } = latLngBoundingBox(lat, lng, radiusKm);

      const conditions = [
        eq(seedListingsTable.status, "ACTIVE"),
        gte(seedListingsTable.latitude, minLat),
        lte(seedListingsTable.latitude, maxLat),
        gte(seedListingsTable.longitude, minLng),
        lte(seedListingsTable.longitude, maxLng),
      ];

      if (category) {
        conditions.push(eq(seedListingsTable.category, category));
      }

      const rows = await db
        .select()
        .from(seedListingsTable)
        .where(and(...conditions))
        .orderBy(desc(seedListingsTable.createdAt))
        .limit(limit * 3)
        .offset(0);

      // Compute exact Haversine distance and filter/sort
      const withDistance = rows
        .map((r) => ({
          ...r,
          distanceKm: haversineDistanceKm(lat, lng, r.latitude, r.longitude),
        }))
        .filter((r) => r.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const offset = (page - 1) * limit;
      const paginated = withDistance.slice(offset, offset + limit);

      res.json({
        data: paginated,
        meta: {
          page,
          limit,
          total: withDistance.length,
          totalPages: Math.ceil(withDistance.length / limit),
        },
      });
    }
  },
);

/**
 * GET /api/v1/seed/listings/:id
 */
router.get(
  "/v1/seed/listings/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const [listing] = await db
      .select()
      .from(seedListingsTable)
      .where(eq(seedListingsTable.id, rawId))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    // Increment view count (fire-and-forget)
    db.update(seedListingsTable)
      .set({ viewCount: sql`${seedListingsTable.viewCount} + 1` })
      .where(eq(seedListingsTable.id, rawId))
      .catch(() => {});

    res.json({ ...listing, distanceKm: null });
  },
);

/**
 * PATCH /api/v1/seed/listings/:id
 */
router.patch(
  "/v1/seed/listings/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const userId = req.user!.sub;

    const [listing] = await db
      .select()
      .from(seedListingsTable)
      .where(eq(seedListingsTable.id, rawId))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const isAdmin = ["SUPER_ADMIN", "ADMIN_MODERATOR"].includes(req.user!.role);
    if (listing.sellerId !== userId && !isAdmin) {
      res.status(403).json({ error: "Forbidden — not your listing" });
      return;
    }

    const VALID_SEED_STATUSES = new Set([
      "ACTIVE", "INACTIVE", "SOLD", "EXPIRED", "DELETED",
    ]);
    const { title, description, price, quantity, status, imageUrls } = req.body as {
      title?: string; description?: string; price?: string;
      quantity?: string; status?: string; imageUrls?: string[];
    };

    if (status !== undefined && !VALID_SEED_STATUSES.has(status)) {
      res.status(400).json({ error: `Invalid status. Allowed: ${[...VALID_SEED_STATUSES].join(", ")}` });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates["title"] = title;
    if (description !== undefined) updates["description"] = description;
    if (price !== undefined) updates["price"] = price;
    if (quantity !== undefined) updates["quantity"] = quantity;
    if (status !== undefined) updates["status"] = status;
    if (imageUrls !== undefined) updates["imageUrls"] = imageUrls;

    const [updated] = await db
      .update(seedListingsTable)
      .set(updates)
      .where(eq(seedListingsTable.id, rawId))
      .returning();

    res.json({ ...updated, distanceKm: null });
  },
);

/**
 * DELETE /api/v1/seed/listings/:id
 */
router.delete(
  "/v1/seed/listings/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const userId = req.user!.sub;

    const [listing] = await db
      .select()
      .from(seedListingsTable)
      .where(eq(seedListingsTable.id, rawId))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const isAdmin = ["SUPER_ADMIN", "ADMIN_MODERATOR"].includes(req.user!.role);
    if (listing.sellerId !== userId && !isAdmin) {
      res.status(403).json({ error: "Forbidden — not your listing" });
      return;
    }

    await db.delete(seedListingsTable).where(eq(seedListingsTable.id, rawId));
    res.sendStatus(204);
  },
);

// ─── ORDERS ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/seed/orders
 * Place an order — initialise escrow transaction.
 */
router.post(
  "/v1/seed/orders",
  authenticate,
  async (req, res): Promise<void> => {
    const buyerId = req.user!.sub;
    const { listingId, quantity: _qty, insurance = false, originAddress, destinationAddress } = req.body as {
      listingId?: string;
      quantity?: string;
      insurance?: boolean;
      originAddress?: string;
      destinationAddress?: string;
    };

    if (!listingId) {
      res.status(400).json({ error: "listingId is required" });
      return;
    }

    const [listing] = await db
      .select()
      .from(seedListingsTable)
      .where(and(eq(seedListingsTable.id, listingId), eq(seedListingsTable.status, "ACTIVE")))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found or not active" });
      return;
    }

    if (listing.sellerId === buyerId) {
      res.status(400).json({ error: "Cannot purchase your own listing" });
      return;
    }

    const amount = parseFloat(listing.price as string);
    const breakdown = calculateEscrowBreakdown(amount, insurance);

    const [escrow] = await db.transaction(async (tx) => {
      const [e] = await tx
        .insert(escrowTransactionsTable)
        .values({
          platform: "SEED",
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          amount: amount.toFixed(2),
          currency: listing.currency,
          platformCommissionRate: breakdown.platformCommissionRate,
          platformCommission: breakdown.platformCommission,
          logisticsFee: breakdown.logisticsFee,
          insuranceFee: breakdown.insuranceFee,
          netSellerPayout: breakdown.netSellerPayout,
          status: "AWAITING_DEPOSIT",
        })
        .returning();

      if (!e) throw new Error("Escrow creation failed");

      const entries = buildDepositLedgerEntries(e.id, breakdown, listing.currency);
      await tx.insert(ledgerEntriesTable).values(entries);

      // Generate shipment with verification code and optional addresses
      const verificationCode = generateVerificationCode(8);
      await tx.insert(shipmentsTable).values({
        escrowId: e.id,
        status: "PENDING",
        verificationCode,
        originAddress: originAddress ?? null,
        destinationAddress: destinationAddress ?? null,
      });

      return [e];
    }, { isolationLevel: "serializable" });

    // Notify seller
    await notifyEscrowFunded(listing.sellerId, escrow!.id, amount.toFixed(2));

    res.status(201).json(escrow);
  },
);

/**
 * POST /api/v1/seed/orders/:id/confirm-delivery
 * Buyer confirms delivery — triggers escrow release.
 */
router.post(
  "/v1/seed/orders/:id/confirm-delivery",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const buyerId = req.user!.sub;
    const { verificationCode, pin } = req.body as {
      verificationCode?: string;
      pin?: string;
    };

    if (!verificationCode || !pin) {
      res.status(400).json({ error: "verificationCode and pin are required" });
      return;
    }

    const [escrow] = await db
      .select()
      .from(escrowTransactionsTable)
      .where(eq(escrowTransactionsTable.id, rawId))
      .limit(1);

    if (!escrow) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (escrow.buyerId !== buyerId) {
      res.status(403).json({ error: "Only the buyer can confirm delivery" });
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

    // Verify PIN
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, buyerId))
      .limit(1);

    if (!user?.transactionPinHash) {
      res.status(400).json({ error: "Transaction PIN not set. Please set your PIN first." });
      return;
    }

    const pinValid = await verifyPin(pin, user.transactionPinHash);
    if (!pinValid) {
      res.status(400).json({ error: "Invalid transaction PIN" });
      return;
    }

    // Verify shipment code
    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.escrowId, rawId))
      .limit(1);

    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }

    if (shipment.verificationCode !== verificationCode.toUpperCase()) {
      res.status(400).json({ error: "Invalid delivery verification code" });
      return;
    }

    // Require shipment to be at least IN_TRANSIT before buyer confirms delivery
    const ALLOWED_CONFIRM_STATUSES = new Set(["PICKED_UP", "IN_TRANSIT", "ASSIGNED"]);
    if (!ALLOWED_CONFIRM_STATUSES.has(shipment.status)) {
      res.status(400).json({
        error: `Cannot confirm delivery for shipment in status "${shipment.status}". Shipment must be assigned, picked up, or in transit.`,
      });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(escrowTransactionsTable)
        .set({ status: "FUNDS_RELEASED", releasedAt: new Date() })
        .where(eq(escrowTransactionsTable.id, rawId))
        .returning();

      if (u) {
        const releaseEntries = buildReleaseToSellerLedgerEntries(
          rawId,
          u.netSellerPayout as string,
          u.currency,
        );
        await tx.insert(ledgerEntriesTable).values(releaseEntries);
      }

      await tx
        .update(shipmentsTable)
        .set({ status: "DELIVERED", deliveredAt: new Date() })
        .where(eq(shipmentsTable.escrowId, rawId));

      return [u];
    }, { isolationLevel: "serializable" });

    await notifyEscrowReleased(escrow.sellerId, rawId, escrow.netSellerPayout as string);

    res.json(updated);
  },
);

/**
 * POST /api/v1/seed/orders/:id/dispute
 */
router.post(
  "/v1/seed/orders/:id/dispute",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const userId = req.user!.sub;
    const { reason } = req.body as { reason?: string };

    if (!reason || reason.length < 20) {
      res.status(400).json({ error: "reason must be at least 20 characters" });
      return;
    }

    const [escrow] = await db
      .select()
      .from(escrowTransactionsTable)
      .where(eq(escrowTransactionsTable.id, rawId))
      .limit(1);

    if (!escrow) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      res.status(403).json({ error: "Not a party to this transaction" });
      return;
    }

    try {
      validateEscrowTransition(escrow.status as EscrowStatus, "IN_DISPUTE");
    } catch (e) {
      if (e instanceof EscrowTransitionError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    const [updated] = await db
      .update(escrowTransactionsTable)
      .set({ status: "IN_DISPUTE", disputeReason: reason })
      .where(eq(escrowTransactionsTable.id, rawId))
      .returning();

    await notifyEscrowDisputed(escrow.buyerId, escrow.sellerId, rawId);

    res.json(updated);
  },
);

export default router;
