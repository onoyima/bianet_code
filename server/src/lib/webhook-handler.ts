import { eq } from "drizzle-orm";
import { db, escrowTransactionsTable } from "@workspace/db";
import {
  validateEscrowTransition,
  EscrowTransitionError,
  type EscrowStatus,
} from "./escrow";
import { notifyEscrowFunded } from "./notifications";
import { logger } from "./logger";

export async function processPaymentSuccess(
  reference: string,
  _amount: number,
  provider: string,
): Promise<void> {
  const [escrow] = await db
    .select()
    .from(escrowTransactionsTable)
    .where(eq(escrowTransactionsTable.paymentReference, reference))
    .limit(1);

  if (!escrow) {
    logger.warn({ reference, provider }, "processPaymentSuccess: no escrow found for reference");
    return;
  }

  try {
    validateEscrowTransition(escrow.status as EscrowStatus, "FUNDS_HELD");
  } catch (e) {
    if (e instanceof EscrowTransitionError) {
      logger.warn({ reference, status: escrow.status }, "processPaymentSuccess: duplicate or invalid transition");
      return;
    }
    throw e;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(escrowTransactionsTable)
      .set({
        status: "FUNDS_HELD",
        depositedAt: new Date(),
        paymentProvider: provider,
      })
      .where(eq(escrowTransactionsTable.id, escrow.id));
  }, { isolationLevel: "serializable" });

  await notifyEscrowFunded(escrow.sellerId, escrow.id, escrow.amount as string);
}
