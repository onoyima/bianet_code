import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  webhookEventsTable,
  escrowTransactionsTable,
  ledgerEntriesTable,
} from "@workspace/db";
import { webhookLimiter } from "../../../middlewares/rate-limit";
import { logger } from "../../../lib/logger";
import { processPaymentSuccess } from "../../../lib/webhook-handler";
import {
  validateEscrowTransition,
  EscrowTransitionError,
  type EscrowStatus,
} from "../../../lib/escrow";

const router: IRouter = Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY ?? "";

function verifyPaystackSignature(rawBody: Buffer, signature: string): boolean {
  if (!PAYSTACK_SECRET) return false;
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

function verifyFlutterwaveSignature(signature: string): boolean {
  if (!FLUTTERWAVE_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", FLUTTERWAVE_SECRET)
    .update(FLUTTERWAVE_SECRET)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ─── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────────

router.post(
  "/v1/webhooks/paystack",
  webhookLimiter,
  async (req, res): Promise<void> => {
    const signature = req.headers["x-paystack-signature"] as string;
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

    const sigValid = rawBody
      ? verifyPaystackSignature(rawBody, signature)
      : false;

    const body = req.body as {
      event?: string;
      data?: {
        reference?: string;
        amount?: number;
        id?: string;
      };
    };
    const eventType = body.event ?? "unknown";
    const eventId = String(body.data?.id ?? body.data?.reference ?? "");

    // Idempotency check
    const [existing] = await db
      .select()
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, "paystack"),
          eq(webhookEventsTable.eventId, eventId),
        ),
      )
      .limit(1);

    if (existing) {
      res.json({ message: "Already processed" });
      return;
    }

    const [webhookRecord] = await db
      .insert(webhookEventsTable)
      .values({
        provider: "paystack",
        eventType,
        eventId: eventId || undefined,
        payload: body as Record<string, unknown>,
        signatureValid: sigValid ? "true" : "false",
        processed: "false",
      })
      .returning();

    if (!sigValid) {
      logger.warn({ eventType, eventId }, "Paystack webhook: invalid signature");
      res.json({ message: "ok" });
      return;
    }

    try {
      if (eventType === "charge.success") {
        const reference = body.data?.reference ?? "";
        const amount = (body.data?.amount ?? 0) / 100; // Paystack amounts are in kobo
        await processPaymentSuccess(reference, amount, "paystack");
      }

      await db
        .update(webhookEventsTable)
        .set({ processed: "true", processedAt: new Date() })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    } catch (err) {
      logger.error({ err, eventType }, "Paystack webhook processing error");
      await db
        .update(webhookEventsTable)
        .set({ errorMessage: String(err) })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    }

    res.json({ message: "ok" });
  },
);

// ─── FLUTTERWAVE WEBHOOK ───────────────────────────────────────────────────────

router.post(
  "/v1/webhooks/flutterwave",
  webhookLimiter,
  async (req, res): Promise<void> => {
    const signature = req.headers["verif-hash"] as string;
    const sigValid = verifyFlutterwaveSignature(signature);

    const body = req.body as {
      event?: string;
      data?: {
        tx_ref?: string;
        amount?: number;
        id?: number;
        status?: string;
      };
    };
    const eventType = body.event ?? "unknown";
    const eventId = String(body.data?.id ?? body.data?.tx_ref ?? "");

    // Idempotency check
    const [existing] = await db
      .select()
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, "flutterwave"),
          eq(webhookEventsTable.eventId, eventId),
        ),
      )
      .limit(1);

    if (existing) {
      res.json({ message: "Already processed" });
      return;
    }

    const [webhookRecord] = await db
      .insert(webhookEventsTable)
      .values({
        provider: "flutterwave",
        eventType,
        eventId: eventId || undefined,
        payload: body as Record<string, unknown>,
        signatureValid: sigValid ? "true" : "false",
        processed: "false",
      })
      .returning();

    if (!sigValid) {
      logger.warn({ eventType, eventId }, "Flutterwave webhook: invalid signature");
      res.json({ message: "ok" });
      return;
    }

    try {
      if (eventType === "charge.completed" && body.data?.status === "successful") {
        const reference = body.data?.tx_ref ?? "";
        const amount = body.data?.amount ?? 0;
        await processPaymentSuccess(reference, amount, "flutterwave");
      }

      await db
        .update(webhookEventsTable)
        .set({ processed: "true", processedAt: new Date() })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    } catch (err) {
      logger.error({ err, eventType }, "Flutterwave webhook processing error");
      await db
        .update(webhookEventsTable)
        .set({ errorMessage: String(err) })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    }

    res.json({ message: "ok" });
  },
);

// ─── MOBILE MONEY WEBHOOK ──────────────────────────────────────────────────────
// Handles callbacks from MTN MoMo, Airtel Money, Orange Money, etc.
// Expects: { transactionId, reference, amount, status, phone, provider }

const MOBILE_MONEY_SECRET = process.env.MOBILE_MONEY_SECRET ?? "";

router.post(
  "/v1/webhooks/mobile-money",
  webhookLimiter,
  async (req, res): Promise<void> => {
    const authHeader = req.headers["authorization"] as string;
    const expectedToken = `Bearer ${MOBILE_MONEY_SECRET}`;
    const sigValid =
      MOBILE_MONEY_SECRET && authHeader
        ? crypto.timingSafeEqual(
            Buffer.from(authHeader),
            Buffer.from(expectedToken),
          )
        : false;

    const { transactionId, reference, amount, status, phone } = req.body as {
      transactionId?: string;
      reference?: string;
      amount?: number;
      status?: string;
      phone?: string;
      provider?: string;
    };

    const eventId = String(transactionId || reference || "");
    const providerName = String(req.body?.provider || req.body?.operator || "mobile-money");

    if (!eventId) {
      res.status(400).json({ error: "transactionId or reference required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, providerName),
          eq(webhookEventsTable.eventId, eventId),
        ),
      )
      .limit(1);

    if (existing) {
      res.json({ message: "Already processed" });
      return;
    }

    const [webhookRecord] = await db
      .insert(webhookEventsTable)
      .values({
        provider: providerName,
        eventType: status || "unknown",
        eventId,
        payload: req.body as Record<string, unknown>,
        signatureValid: sigValid ? "true" : "false",
        processed: "false",
      })
      .returning();

    if (!sigValid) {
      logger.warn(
        { provider: providerName, eventId },
        "Mobile money webhook: invalid signature",
      );
      res.json({ message: "ok" });
      return;
    }

    try {
      if (status === "successful" || status === "completed") {
        const amt = amount ?? 0;
        await processPaymentSuccess(reference || eventId, amt, providerName);
      }

      await db
        .update(webhookEventsTable)
        .set({ processed: "true", processedAt: new Date() })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    } catch (err) {
      logger.error({ err, provider: providerName }, "Mobile money webhook processing error");
      await db
        .update(webhookEventsTable)
        .set({ errorMessage: String(err) })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    }

    res.json({ message: "ok" });
  },
);

// ─── USSD WEBHOOK ───────────────────────────────────────────────────────────────
// Handles USSD payment callbacks from telecom aggregators.
// Expects: { sessionId, phoneNumber, amount, reference, status }

const USSD_SECRET = process.env.USSD_SECRET ?? "";

router.post(
  "/v1/webhooks/ussd",
  webhookLimiter,
  async (req, res): Promise<void> => {
    const authHeader = req.headers["authorization"] as string;
    const expectedToken = `Bearer ${USSD_SECRET}`;
    const sigValid =
      USSD_SECRET && authHeader
        ? crypto.timingSafeEqual(
            Buffer.from(authHeader),
            Buffer.from(expectedToken),
          )
        : false;

    const { sessionId, reference, amount, status, phoneNumber } = req.body as {
      sessionId?: string;
      reference?: string;
      amount?: number;
      status?: string;
      phoneNumber?: string;
    };

    const eventId = String(sessionId || reference || "");
    const providerName = "ussd";

    if (!eventId) {
      res.status(400).json({ error: "sessionId or reference required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, providerName),
          eq(webhookEventsTable.eventId, eventId),
        ),
      )
      .limit(1);

    if (existing) {
      res.json({ message: "Already processed" });
      return;
    }

    const [webhookRecord] = await db
      .insert(webhookEventsTable)
      .values({
        provider: providerName,
        eventType: status || "unknown",
        eventId,
        payload: req.body as Record<string, unknown>,
        signatureValid: sigValid ? "true" : "false",
        processed: "false",
      })
      .returning();

    if (!sigValid) {
      logger.warn({ eventId }, "USSD webhook: invalid signature");
      res.json({ message: "ok" });
      return;
    }

    try {
      if (status === "successful" || status === "completed") {
        const amt = amount ?? 0;
        await processPaymentSuccess(reference || eventId, amt, providerName);
      }

      await db
        .update(webhookEventsTable)
        .set({ processed: "true", processedAt: new Date() })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    } catch (err) {
      logger.error({ err }, "USSD webhook processing error");
      await db
        .update(webhookEventsTable)
        .set({ errorMessage: String(err) })
        .where(eq(webhookEventsTable.id, webhookRecord!.id));
    }

    res.json({ message: "ok" });
  },
);

export default router;
