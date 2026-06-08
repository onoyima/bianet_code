import { db, notificationsTable } from "@workspace/db";
import { logger } from "./logger";

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(
  payload: NotificationPayload,
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      entityType: payload.entityType,
      entityId: payload.entityId,
      isRead: false,
    });
  } catch (err) {
    logger.error({ err, payload }, "Failed to create notification");
  }
}

export async function notifyEscrowFunded(
  sellerId: string,
  escrowId: string,
  amount: string,
): Promise<void> {
  await createNotification({
    userId: sellerId,
    title: "Payment Secured",
    body: `₦${amount} has been held in escrow. Prepare your shipment.`,
    type: "ESCROW_FUNDED",
    entityType: "escrow",
    entityId: escrowId,
  });
}

export async function notifyEscrowReleased(
  sellerId: string,
  escrowId: string,
  netPayout: string,
): Promise<void> {
  await createNotification({
    userId: sellerId,
    title: "Funds Released",
    body: `Your payment of ₦${netPayout} has been released.`,
    type: "ESCROW_RELEASED",
    entityType: "escrow",
    entityId: escrowId,
  });
}

export async function notifyEscrowDisputed(
  buyerId: string,
  sellerId: string,
  escrowId: string,
): Promise<void> {
  await Promise.all([
    createNotification({
      userId: buyerId,
      title: "Dispute Opened",
      body: "Your dispute has been submitted. An admin will review it.",
      type: "ESCROW_DISPUTED",
      entityType: "escrow",
      entityId: escrowId,
    }),
    createNotification({
      userId: sellerId,
      title: "Dispute Raised",
      body: "A dispute has been raised on your transaction. Funds are frozen.",
      type: "ESCROW_DISPUTED",
      entityType: "escrow",
      entityId: escrowId,
    }),
  ]);
}

export async function notifyKycApproved(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: "KYC Approved",
    body: "Your KYC documents have been verified. You can now create listings.",
    type: "KYC_APPROVED",
  });
}

export async function notifyKycRejected(
  userId: string,
  notes: string,
): Promise<void> {
  await createNotification({
    userId,
    title: "KYC Rejected",
    body: `Your KYC submission was rejected. Reason: ${notes}`,
    type: "KYC_REJECTED",
  });
}

export async function notifyShipmentUpdate(
  buyerId: string,
  escrowId: string,
  status: string,
): Promise<void> {
  const statusMessages: Record<string, string> = {
    ASSIGNED: "A logistics provider has been assigned to your order.",
    PICKED_UP: "Your order has been picked up.",
    IN_TRANSIT: "Your order is in transit.",
    DELIVERED: "Your order has been delivered. Please confirm receipt.",
  };
  await createNotification({
    userId: buyerId,
    title: "Shipment Update",
    body: statusMessages[status] ?? `Shipment status: ${status}`,
    type: "SHIPMENT_UPDATE",
    entityType: "escrow",
    entityId: escrowId,
  });
}
