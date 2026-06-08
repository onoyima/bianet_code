import { Router, type IRouter } from "express";
import { eq, and, ilike, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  kycDocumentsTable,
  bartarListingsTable,
  escrowTransactionsTable,
  ledgerEntriesTable,
  shipmentsTable,
  tradeContractsTable,
} from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { bartarLimiter } from "../../../middlewares/rate-limit";
import { performKycVerification } from "../../../lib/gov-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { calculateEscrowBreakdown, buildDepositLedgerEntries } from "../../../lib/financial";
import {
  validateEscrowTransition,
  EscrowTransitionError,
  type EscrowStatus,
} from "../../../lib/escrow";
import {
  notifyEscrowFunded,
  notifyEscrowReleased,
  notifyKycApproved,
} from "../../../lib/notifications";
import { generateVerificationCode, generateContentHash, verifyPin } from "../../../lib/crypto";

const router: IRouter = Router();

router.use(bartarLimiter);

/**
 * POST /api/v1/bartar/kyc
 */
router.post("/v1/bartar/kyc", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { cacNumber, taxClearanceUrl, exportLicenseUrl, governmentIdUrl, businessDocUrl } =
    req.body as {
      cacNumber?: string;
      taxClearanceUrl?: string;
      exportLicenseUrl?: string;
      governmentIdUrl?: string;
      businessDocUrl?: string;
    };

  if (!cacNumber) {
    res.status(400).json({ error: "cacNumber is required" });
    return;
  }

  // Check for existing KYC under review or approved
  const [existing] = await db
    .select()
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, userId))
    .orderBy(desc(kycDocumentsTable.createdAt))
    .limit(1);

  if (existing && ["APPROVED", "UNDER_REVIEW"].includes(existing.status)) {
    res.status(409).json({
      error: `KYC already ${existing.status.toLowerCase().replace("_", " ")}`,
    });
    return;
  }

  // Perform CAC verification via government API
  const { overall, cacResult, checks } = await performKycVerification({
    cacNumber,
    taxClearanceUrl,
    exportLicenseUrl,
    governmentIdUrl,
    businessDocUrl,
  });

  const kycStatus = overall === "APPROVED" ? "APPROVED" : "REJECTED";
  const adminNotes = [
    `CAC: ${cacResult.verified ? "Verified" : "Failed"}`,
    `Business: ${cacResult.businessName ?? "N/A"}`,
    `Status: ${cacResult.status ?? "N/A"}`,
    `Directors: ${cacResult.directorNames.join(", ") || "N/A"}`,
    ...checks,
  ].join("; ");

  const [doc] = await db
    .insert(kycDocumentsTable)
    .values({
      userId,
      cacNumber,
      taxClearanceUrl: taxClearanceUrl ?? null,
      exportLicenseUrl: exportLicenseUrl ?? null,
      governmentIdUrl: governmentIdUrl ?? null,
      businessDocUrl: businessDocUrl ?? null,
      status: kycStatus,
      submittedAt: new Date(),
      verifiedAt: overall === "APPROVED" ? new Date() : null,
      adminNotes,
    })
    .returning();

  // Update user kycStatus
  await db
    .update(usersTable)
    .set({ kycStatus })
    .where(eq(usersTable.id, userId));

  if (overall === "APPROVED") {
    await notifyKycApproved(userId, doc.id);
  }

  res.status(201).json({ ...doc, cacResult, checks });
});

/**
 * GET /api/v1/bartar/kyc/status
 */
router.get("/v1/bartar/kyc/status", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;

  const [doc] = await db
    .select()
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, userId))
    .orderBy(desc(kycDocumentsTable.createdAt))
    .limit(1);

  if (!doc) {
    res.status(404).json({ error: "No KYC submission found" });
    return;
  }

  res.json(doc);
});

// ─── BARTAR LISTINGS ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/bartar/listings
 * Requires approved KYC for EXPORTER role.
 */
router.post("/v1/bartar/listings", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const role = req.user!.role;

  // Only exporters need approved KYC; admins bypass
  if (role === "EXPORTER") {
    const [kycDoc] = await db
      .select()
      .from(kycDocumentsTable)
      .where(and(eq(kycDocumentsTable.userId, userId), eq(kycDocumentsTable.status, "APPROVED")))
      .limit(1);

    if (!kycDoc) {
      res.status(403).json({
        error: "KYC approval required to create export listings",
      });
      return;
    }
  }

  const {
    commodity, quantity, unit, moistureLevel, qualityGrade,
    price, currency = "USD", shippingTerms, destination, description, imageUrls,
  } = req.body as {
    commodity?: string; quantity?: string; unit?: string; moistureLevel?: string;
    qualityGrade?: string; price?: string; currency?: string; shippingTerms?: string;
    destination?: string[]; description?: string; imageUrls?: string[];
  };

  if (!commodity || !quantity || !unit || !price) {
    res.status(400).json({ error: "commodity, quantity, unit, price are required" });
    return;
  }

  const [user] = await db
    .select({ kycStatus: usersTable.kycStatus })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [listing] = await db
    .insert(bartarListingsTable)
    .values({
      sellerId: userId,
      commodity,
      quantity,
      unit,
      moistureLevel: moistureLevel ?? null,
      qualityGrade: qualityGrade ?? null,
      price,
      currency,
      shippingTerms: shippingTerms ?? null,
      destination: destination ?? [],
      description: description ?? null,
      imageUrls: imageUrls ?? [],
      status: "ACTIVE",
      isVerifiedExporter: user?.kycStatus === "APPROVED" ? "true" : "false",
    })
    .returning();

  res.status(201).json(listing);
});

/**
 * GET /api/v1/bartar/listings
 */
router.get("/v1/bartar/listings", authenticate, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
  const offset = (page - 1) * limit;
  const commodityFilter = req.query["commodity"] as string | undefined;

  const conditions = [eq(bartarListingsTable.status, "ACTIVE")];
  if (commodityFilter) {
    conditions.push(ilike(bartarListingsTable.commodity, `%${commodityFilter}%`));
  }

  const rows = await db
    .select()
    .from(bartarListingsTable)
    .where(and(...conditions))
    .orderBy(desc(bartarListingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(bartarListingsTable, and(...conditions)) })
    .from(bartarListingsTable);

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
 * GET /api/v1/bartar/listings/:id
 */
router.get("/v1/bartar/listings/:id", authenticate, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [listing] = await db
    .select()
    .from(bartarListingsTable)
    .where(eq(bartarListingsTable.id, rawId))
    .limit(1);

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(listing);
});

/**
 * PATCH /api/v1/bartar/listings/:id
 */
router.patch("/v1/bartar/listings/:id", authenticate, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const userId = req.user!.sub;

  const [listing] = await db
    .select()
    .from(bartarListingsTable)
    .where(eq(bartarListingsTable.id, rawId))
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

  if (listing.status !== "ACTIVE" && !isAdmin) {
    res.status(400).json({ error: "Only active listings can be updated" });
    return;
  }

  const allowed = [
    "commodity", "quantity", "unit", "moistureLevel", "qualityGrade",
    "price", "currency", "shippingTerms", "destination", "description", "imageUrls",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(bartarListingsTable)
    .set(updates)
    .where(eq(bartarListingsTable.id, rawId))
    .returning();

  res.json(updated);
});

/**
 * DELETE /api/v1/bartar/listings/:id
 */
router.delete("/v1/bartar/listings/:id", authenticate, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const userId = req.user!.sub;

  const [listing] = await db
    .select()
    .from(bartarListingsTable)
    .where(eq(bartarListingsTable.id, rawId))
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

  await db.delete(bartarListingsTable).where(eq(bartarListingsTable.id, rawId));
  res.sendStatus(204);
});

// ─── ESCROW ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/bartar/escrow
 */
router.post("/v1/bartar/escrow", authenticate, async (req, res): Promise<void> => {
  const buyerId = req.user!.sub;
  const { listingId, amount: rawAmount, currency = "USD", insurance = false } = req.body as {
    listingId?: string; amount?: string; currency?: string; insurance?: boolean;
  };

  if (!listingId || !rawAmount) {
    res.status(400).json({ error: "listingId and amount are required" });
    return;
  }

  const [listing] = await db
    .select()
    .from(bartarListingsTable)
    .where(and(eq(bartarListingsTable.id, listingId), eq(bartarListingsTable.status, "ACTIVE")))
    .limit(1);

  if (!listing) {
    res.status(404).json({ error: "Listing not found or not active" });
    return;
  }

  if (listing.sellerId === buyerId) {
    res.status(400).json({ error: "Cannot purchase your own listing" });
    return;
  }

  // Verify buyer has approved KYC if role is IMPORTER
  if (req.user!.role === "IMPORTER") {
    const [kycDoc] = await db
      .select()
      .from(kycDocumentsTable)
      .where(and(eq(kycDocumentsTable.userId, buyerId), eq(kycDocumentsTable.status, "APPROVED")))
      .limit(1);

    if (!kycDoc) {
      res.status(403).json({ error: "KYC approval required to trade on Bartar" });
      return;
    }
  }

  const amount = parseFloat(rawAmount);
  const breakdown = calculateEscrowBreakdown(amount, insurance);

  const [escrow] = await db.transaction(async (tx) => {
    const [e] = await tx
      .insert(escrowTransactionsTable)
      .values({
        platform: "BARTAR",
        listingId: listing.id,
        buyerId,
        sellerId: listing.sellerId,
        amount: amount.toFixed(2),
        currency,
        platformCommissionRate: breakdown.platformCommissionRate,
        platformCommission: breakdown.platformCommission,
        logisticsFee: breakdown.logisticsFee,
        insuranceFee: breakdown.insuranceFee,
        netSellerPayout: breakdown.netSellerPayout,
        status: "AWAITING_DEPOSIT",
      })
      .returning();

    if (!e) throw new Error("Escrow creation failed");

    const entries = buildDepositLedgerEntries(e.id, breakdown, currency);
    await tx.insert(ledgerEntriesTable).values(entries);

    const verificationCode = generateVerificationCode(8);
    await tx.insert(shipmentsTable).values({
      escrowId: e.id,
      status: "PENDING",
      verificationCode,
    });

    return [e];
  }, { isolationLevel: "serializable" });

  await notifyEscrowFunded(listing.sellerId, escrow!.id, amount.toFixed(2));

  res.status(201).json(escrow);
});

/**
 * GET /api/v1/bartar/escrow/:id
 */
router.get("/v1/bartar/escrow/:id", authenticate, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const userId = req.user!.sub;

  const [escrow] = await db
    .select()
    .from(escrowTransactionsTable)
    .where(eq(escrowTransactionsTable.id, rawId))
    .limit(1);

  if (!escrow) {
    res.status(404).json({ error: "Escrow transaction not found" });
    return;
  }

  const isAdmin = ["SUPER_ADMIN", "ADMIN_MODERATOR"].includes(req.user!.role);
  if (escrow.buyerId !== userId && escrow.sellerId !== userId && !isAdmin) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(escrow);
});

/**
 * POST /api/v1/bartar/escrow/:id/confirm
 */
router.post(
  "/v1/bartar/escrow/:id/confirm",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const buyerId = req.user!.sub;
    const { verificationCode, pin } = req.body as {
      verificationCode?: string; pin?: string;
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
      res.status(404).json({ error: "Escrow not found" });
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

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, buyerId))
      .limit(1);

    if (!user?.transactionPinHash) {
      res.status(400).json({ error: "Transaction PIN not set." });
      return;
    }

    if (!(await verifyPin(pin, user.transactionPinHash))) {
      res.status(400).json({ error: "Invalid transaction PIN" });
      return;
    }

    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.escrowId, rawId))
      .limit(1);

    if (shipment?.verificationCode !== verificationCode.toUpperCase()) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(escrowTransactionsTable)
        .set({ status: "FUNDS_RELEASED", releasedAt: new Date() })
        .where(eq(escrowTransactionsTable.id, rawId))
        .returning();

      await tx
        .update(shipmentsTable)
        .set({ status: "DELIVERED", deliveredAt: new Date() })
        .where(eq(shipmentsTable.escrowId, rawId));

      await tx
        .update(bartarListingsTable)
        .set({ status: "SOLD" })
        .where(eq(bartarListingsTable.id, escrow.listingId));

      return [u];
    }, { isolationLevel: "serializable" });

    await notifyEscrowReleased(escrow.sellerId, rawId, escrow.netSellerPayout as string);

    res.json(updated);
  },
);

// ─── CONTRACTS ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/bartar/contracts
 */
router.post("/v1/bartar/contracts", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { escrowId, terms } = req.body as { escrowId?: string; terms?: string };

  if (!escrowId || !terms || terms.length < 50) {
    res.status(400).json({ error: "escrowId and terms (min 50 chars) are required" });
    return;
  }

  const [escrow] = await db
    .select()
    .from(escrowTransactionsTable)
    .where(eq(escrowTransactionsTable.id, escrowId))
    .limit(1);

  if (!escrow) {
    res.status(404).json({ error: "Escrow not found" });
    return;
  }

  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    res.status(403).json({ error: "Not a party to this transaction" });
    return;
  }

  const contentHash = generateContentHash(terms + escrowId + Date.now());

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const contractsDir = path.resolve(__dirname, "../../../../contracts");
  fs.mkdirSync(contractsDir, { recursive: true });

  const filename = `${contentHash}.html`;
  const filePath = path.join(contractsDir, filename);
  const contentUrl = `/api/v1/bartar/contracts/file/${filename}`;

  const now = new Date().toISOString();
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Trade Contract</title></head>
<body style="font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px">
<h1>Bia'net Trade Contract</h1>
<p><strong>Contract ID:</strong> ${contentHash}</p>
<p><strong>Escrow ID:</strong> ${escrowId}</p>
<p><strong>Generated:</strong> ${now}</p>
<hr>
<pre style="white-space:pre-wrap;font-size:14px;line-height:1.6">${terms}</pre>
<hr>
<p><em>This contract was generated on the Bia'net platform. Both parties have agreed to the terms above.</em></p>
</body>
</html>`;

  fs.writeFileSync(filePath, html, "utf-8");

  const [contract] = await db
    .insert(tradeContractsTable)
    .values({
      escrowId,
      contentHash,
      contentUrl,
      terms,
      generatedById: userId,
    })
    .returning();

  res.status(201).json(contract);
});

/**
 * POST /api/v1/bartar/contracts/:id/sign
 */
router.post("/v1/bartar/contracts/:id/sign", authenticate, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const userId = req.user!.sub;
  const { pin } = req.body as { pin?: string };

  if (!pin) {
    res.status(400).json({ error: "pin is required to sign contract" });
    return;
  }

  const [contract] = await db
    .select()
    .from(tradeContractsTable)
    .where(eq(tradeContractsTable.id, rawId))
    .limit(1);

  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }

  const [escrow] = await db
    .select()
    .from(escrowTransactionsTable)
    .where(eq(escrowTransactionsTable.id, contract.escrowId))
    .limit(1);

  if (!escrow) {
    res.status(404).json({ error: "Associated escrow not found" });
    return;
  }

  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    res.status(403).json({ error: "Not a party to this contract" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user?.transactionPinHash) {
    res.status(400).json({ error: "Transaction PIN not set." });
    return;
  }

  if (!(await verifyPin(pin, user.transactionPinHash))) {
    res.status(400).json({ error: "Invalid transaction PIN" });
    return;
  }

  const isBuyer = escrow.buyerId === userId;
  const now = new Date();
  const updates: Record<string, unknown> = {};

  if (isBuyer && !contract.signedByBuyer) {
    updates["signedByBuyer"] = true;
    updates["buyerSignedAt"] = now;
  } else if (!isBuyer && !contract.signedBySeller) {
    updates["signedBySeller"] = true;
    updates["sellerSignedAt"] = now;
  } else {
    res.status(400).json({ error: "Contract already signed by this party" });
    return;
  }

  const [updated] = await db
    .update(tradeContractsTable)
    .set(updates)
    .where(eq(tradeContractsTable.id, rawId))
    .returning();

  res.json(updated);
});

/**
 * GET /api/v1/bartar/contracts/file/:filename
 * Serve a generated contract HTML file.
 */
router.get(
  "/v1/bartar/contracts/file/:filename",
  async (req, res): Promise<void> => {
    const filename = Array.isArray(req.params["filename"])
      ? req.params["filename"][0]
      : req.params["filename"];

    if (!filename || filename.includes("..") || filename.includes("/")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.resolve(__dirname, "../../../../contracts", filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Contract file not found" });
      return;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    res.type("html").send(content);
  },
);

export default router;
