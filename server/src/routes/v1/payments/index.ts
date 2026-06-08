import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, escrowTransactionsTable, usersTable, profilesTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { initializePayment, generatePaymentReference } from "../../../lib/payment";
import { processPaymentSuccess } from "../../../lib/webhook-handler";

const router: IRouter = Router();

/**
 * POST /api/v1/payments/initialize
 * Initialize a payment for a given escrow transaction.
 * Body: { escrowId, provider?: "PAYSTACK" | "FLUTTERWAVE" }
 */
router.post("/v1/payments/initialize", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { escrowId, provider = "PAYSTACK" } = req.body as {
    escrowId?: string;
    provider?: "PAYSTACK" | "FLUTTERWAVE";
  };

  if (!escrowId) {
    res.status(400).json({ error: "escrowId is required" });
    return;
  }

  const [escrow] = await db
    .select()
    .from(escrowTransactionsTable)
    .where(eq(escrowTransactionsTable.id, escrowId))
    .limit(1);

  if (!escrow) {
    res.status(404).json({ error: "Escrow transaction not found" });
    return;
  }

  if (escrow.buyerId !== userId) {
    res.status(403).json({ error: "Only the buyer can initiate payment" });
    return;
  }

  if (escrow.status !== "AWAITING_DEPOSIT") {
    res.status(400).json({ error: `Cannot pay for escrow in status: ${escrow.status}` });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);

  const email = user.email ?? `${profile?.firstName ?? "user"}+${userId}@bianet.ng`.toLowerCase();
  const paymentReference = generatePaymentReference();

  // Save payment reference on the escrow
  await db
    .update(escrowTransactionsTable)
    .set({ paymentReference })
    .where(eq(escrowTransactionsTable.id, escrowId));

  const result = await initializePayment(
    parseFloat(escrow.amount as string),
    escrow.currency,
    paymentReference,
    email,
    provider,
  );

  res.json(result);
});

/**
 * GET /api/v1/payments/demo
 * Simulate a successful payment in demo mode (no real provider).
 * Query params: reference, amount, currency
 */
router.get("/v1/payments/demo", async (req, res): Promise<void> => {
  const reference = req.query["reference"] as string;
  const amount = req.query["amount"] as string;

  if (!reference) {
    res.status(400).json({ error: "reference is required" });
    return;
  }

  await processPaymentSuccess(reference, parseFloat(amount || "0"), "DEMO");

  // Serve a simple HTML page that tells the user payment was simulated
  res.type("html").send(`
    <!DOCTYPE html>
    <html><head><title>Payment Demo</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
      .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
      h1 { color: #16a34a; margin-bottom: 0.5rem; }
      p { color: #666; }
    </style>
    </head><body>
    <div class="card">
      <h1>Payment Simulated</h1>
      <p>Reference: <code>${reference}</code></p>
      <p>Amount: <strong>${amount || "—"}</strong></p>
      <p>This is a demo payment. Close this tab and return to the app.</p>
    </div>
    </body></html>
  `);
});

export default router;
