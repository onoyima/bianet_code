import { Router, type IRouter } from "express";
import { eq, and, or, desc } from "drizzle-orm";
import { db, negotiationsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";

const router: IRouter = Router();

/**
 * POST /api/v1/bartar/listings/:id/negotiate
 * Initiate or update a negotiation (counter-offer) on a Bartar listing.
 */
router.post(
  "/v1/bartar/listings/:id/negotiate",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const rawListingId = Array.isArray(req.params["id"])
      ? req.params["id"][0]
      : req.params["id"];

    const { offeredPrice, offeredQuantity, message } = req.body as {
      offeredPrice?: string | number;
      offeredQuantity?: string | number;
      message?: string;
    };

    if (offeredPrice == null || offeredQuantity == null) {
      res.status(400).json({ error: "offeredPrice and offeredQuantity are required" });
      return;
    }

    const { bartarListingsTable } = await import("@workspace/db");
    const [listing] = await db
      .select({ id: bartarListingsTable.id, sellerId: bartarListingsTable.sellerId })
      .from(bartarListingsTable)
      .where(
        and(
          eq(bartarListingsTable.id, rawListingId),
          eq(bartarListingsTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Active listing not found" });
      return;
    }

    if (listing.sellerId === userId) {
      res.status(400).json({ error: "Cannot negotiate on your own listing" });
      return;
    }

    const [existing] = await db
      .select({ id: negotiationsTable.id })
      .from(negotiationsTable)
      .where(
        and(
          eq(negotiationsTable.listingId, rawListingId),
          eq(negotiationsTable.initiatorId, userId),
          eq(negotiationsTable.status, "PENDING"),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(negotiationsTable)
        .set({
          offeredPrice: String(offeredPrice),
          offeredQuantity: String(offeredQuantity),
          message: message || null,
        })
        .where(eq(negotiationsTable.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }

    const [negotiation] = await db
      .insert(negotiationsTable)
      .values({
        listingId: rawListingId,
        initiatorId: userId,
        targetId: listing.sellerId,
        offeredPrice: String(offeredPrice),
        offeredQuantity: String(offeredQuantity),
        message: message || null,
      })
      .returning();

    res.status(201).json(negotiation);
  },
);

/**
 * GET /api/v1/bartar/negotiations
 * List negotiations involving the current user (as initiator or target).
 */
router.get(
  "/v1/bartar/negotiations",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    const negotiations = await db
      .select()
      .from(negotiationsTable)
      .where(
        or(
          eq(negotiationsTable.initiatorId, userId),
          eq(negotiationsTable.targetId, userId),
        ),
      )
      .orderBy(desc(negotiationsTable.createdAt));

    res.json({ data: negotiations, count: negotiations.length });
  },
);

/**
 * POST /api/v1/bartar/negotiations/:id/accept
 * Accept a counter-offer (only the target/seller can accept).
 */
router.post(
  "/v1/bartar/negotiations/:id/accept",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [negotiation] = await db
      .select()
      .from(negotiationsTable)
      .where(
        and(eq(negotiationsTable.id, rawId), eq(negotiationsTable.status, "PENDING")),
      )
      .limit(1);

    if (!negotiation) {
      res.status(404).json({ error: "Pending negotiation not found" });
      return;
    }

    if (negotiation.targetId !== userId) {
      res.status(403).json({ error: "Only the listing owner can accept this negotiation" });
      return;
    }

    const [updated] = await db
      .update(negotiationsTable)
      .set({ status: "ACCEPTED", respondedAt: new Date() })
      .where(eq(negotiationsTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

/**
 * POST /api/v1/bartar/negotiations/:id/reject
 * Reject a counter-offer (only the target/seller can reject).
 */
router.post(
  "/v1/bartar/negotiations/:id/reject",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [negotiation] = await db
      .select()
      .from(negotiationsTable)
      .where(
        and(eq(negotiationsTable.id, rawId), eq(negotiationsTable.status, "PENDING")),
      )
      .limit(1);

    if (!negotiation) {
      res.status(404).json({ error: "Pending negotiation not found" });
      return;
    }

    if (negotiation.targetId !== userId) {
      res.status(403).json({ error: "Only the listing owner can reject this negotiation" });
      return;
    }

    const [updated] = await db
      .update(negotiationsTable)
      .set({ status: "REJECTED", respondedAt: new Date() })
      .where(eq(negotiationsTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

export default router;
