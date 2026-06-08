import crypto from "node:crypto";

export interface PaymentInitResult {
  success: boolean;
  paymentReference: string;
  redirectUrl: string | null;
  provider: string;
}

/**
 * Initialize a payment with the given provider.
 * In demo mode (no API keys), returns a simulated redirect URL.
 * The simulated URL includes the payment reference so the
 * frontend can "complete" the payment locally.
 */
export async function initializePayment(
  amount: number,
  currency: string,
  paymentReference: string,
  email: string,
  provider: "PAYSTACK" | "FLUTTERWAVE" = "PAYSTACK",
): Promise<PaymentInitResult> {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";

  if (provider === "PAYSTACK") {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (secretKey) {
      const resp = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100),
          currency,
          reference: paymentReference,
          callback_url: `${baseUrl}/payments/callback?reference=${paymentReference}`,
        }),
      });
      const json = await resp.json() as { status?: boolean; data?: { authorization_url?: string } };
      if (json.status && json.data?.authorization_url) {
        return { success: true, paymentReference, redirectUrl: json.data.authorization_url, provider: "PAYSTACK" };
      }
    }
  }

  if (provider === "FLUTTERWAVE") {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (secretKey) {
      const resp = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: paymentReference,
          amount,
          currency,
          redirect_url: `${baseUrl}/payments/callback?reference=${paymentReference}`,
          customer: { email },
        }),
      });
      const json = await resp.json() as { status?: string; data?: { link?: string } };
      if (json.status === "success" && json.data?.link) {
        return { success: true, paymentReference, redirectUrl: json.data.link, provider: "FLUTTERWAVE" };
      }
    }
  }

  // Demo / fallback mode — simulate a payment redirect
  return {
    success: true,
    paymentReference,
    redirectUrl: `${baseUrl}/payments/demo?reference=${paymentReference}&amount=${amount}&currency=${currency}`,
    provider: "DEMO",
  };
}

export function generatePaymentReference(): string {
  return `BIA-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}
