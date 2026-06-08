import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, shipmentsTable, escrowTransactionsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";

const router: IRouter = Router();

/**
 * GET /api/v1/shipments/:escrowId
 * Get shipment tracking info for a buyer or seller.
 */
router.get(
  "/v1/shipments/:escrowId",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["escrowId"])
      ? req.params["escrowId"][0]
      : req.params["escrowId"];
    const userId = req.user!.sub;

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

    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.escrowId, rawId))
      .limit(1);

    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }

    res.json(shipment);
  },
);

export default router;
