import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, cartItemsTable, seedListingsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";

const router: IRouter = Router();

/**
 * POST /api/v1/cart
 * Add an item to the cart.
 */
router.post("/v1/cart", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { listingId, quantity = 1 } = req.body as {
    listingId?: string;
    quantity?: number;
  };

  if (!listingId) {
    res.status(400).json({ error: "listingId is required" });
    return;
  }

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  const [listing] = await db
    .select({ id: seedListingsTable.id, status: seedListingsTable.status })
    .from(seedListingsTable)
    .where(eq(seedListingsTable.id, listingId))
    .limit(1);

  if (!listing || listing.status !== "ACTIVE") {
    res.status(404).json({ error: "Listing not found or not active" });
    return;
  }

  const [existing] = await db
    .select({ id: cartItemsTable.id })
    .from(cartItemsTable)
    .where(
      and(eq(cartItemsTable.userId, userId), eq(cartItemsTable.listingId, listingId)),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(cartItemsTable)
      .set({ quantity: qty })
      .where(eq(cartItemsTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [item] = await db
    .insert(cartItemsTable)
    .values({ userId, listingId, quantity: qty })
    .returning();

  res.status(201).json(item);
});

/**
 * GET /api/v1/cart
 * View all items in the cart.
 */
router.get("/v1/cart", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;

  const items = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.userId, userId))
    .orderBy(desc(cartItemsTable.createdAt));

  const enriched = await Promise.all(
    items.map(async (item) => {
      const [listing] = await db
        .select()
        .from(seedListingsTable)
        .where(eq(seedListingsTable.id, item.listingId))
        .limit(1);
      return { ...item, listing };
    }),
  );

  res.json({ data: enriched, count: enriched.length });
});

/**
 * DELETE /api/v1/cart/:id
 * Remove an item from the cart.
 */
router.delete(
  "/v1/cart/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [item] = await db
      .select({ id: cartItemsTable.id })
      .from(cartItemsTable)
      .where(
        and(eq(cartItemsTable.id, rawId), eq(cartItemsTable.userId, userId)),
      )
      .limit(1);

    if (!item) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, rawId));
    res.sendStatus(204);
  },
);

/**
 * POST /api/v1/cart/checkout
 * Convert cart items into orders (create escrow for each).
 */
router.post(
  "/v1/cart/checkout",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const { originAddress, destinationAddress } = req.body as {
      originAddress?: string;
      destinationAddress?: string;
    };

    const items = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.userId, userId));

    if (items.length === 0) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

    const results: Array<{ listingId: string; escrowId: string; status: string }> = [];
    const errors: Array<{ listingId: string; error: string }> = [];

    for (const item of items) {
      try {
        const [listing] = await db
          .select()
          .from(seedListingsTable)
          .where(
            and(
              eq(seedListingsTable.id, item.listingId),
              eq(seedListingsTable.status, "ACTIVE"),
            ),
          )
          .limit(1);

        if (!listing) {
          errors.push({ listingId: item.listingId, error: "Listing not found or not active" });
          continue;
        }

        if (listing.sellerId === userId) {
          errors.push({ listingId: item.listingId, error: "Cannot purchase your own listing" });
          continue;
        }

        const { calculateEscrowBreakdown, buildDepositLedgerEntries } = await import(
          "../../../lib/financial"
        );
        const { generateVerificationCode } = await import("../../../lib/crypto");
        const { notifyEscrowFunded } = await import("../../../lib/notifications");

        const amount = parseFloat(listing.price as string) * item.quantity;
        const breakdown = calculateEscrowBreakdown(amount, false);

        const [escrow] = await db.transaction(async (tx) => {
          const { escrowTransactionsTable, ledgerEntriesTable, shipmentsTable } = await import(
            "@workspace/db"
          );

          const [e] = await tx
            .insert(escrowTransactionsTable)
            .values({
              platform: "SEED",
              listingId: listing.id,
              buyerId: userId,
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

          const verificationCode = generateVerificationCode(8);
          await tx.insert(shipmentsTable).values({
            escrowId: e.id,
            status: "PENDING",
            verificationCode,
            originAddress: originAddress ?? null,
            destinationAddress: destinationAddress ?? null,
          });

          await tx.delete(cartItemsTable).where(eq(cartItemsTable.id, item.id));

          return [e];
        }, { isolationLevel: "serializable" });

        await notifyEscrowFunded(listing.sellerId, escrow!.id, amount.toFixed(2));

        results.push({
          listingId: item.listingId,
          escrowId: escrow!.id,
          status: "AWAITING_DEPOSIT",
        });
      } catch (err) {
        errors.push({ listingId: item.listingId, error: String(err) });
      }
    }

    res.status(results.length > 0 ? 201 : 400).json({ results, errors });
  },
);

export default router;
