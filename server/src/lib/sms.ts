import twilio from "twilio";
import { logger } from "./logger";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

const isConfigured = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);

const client = isConfigured
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!client) {
    logger.warn({ to }, "Twilio not configured — SMS not sent");
    return false;
  }

  try {
    await client.messages.create({
      from: TWILIO_PHONE_NUMBER,
      to,
      body,
    });
    logger.info({ to }, "SMS sent successfully");
    return true;
  } catch (err) {
    logger.error({ err, to }, "Failed to send SMS");
    return false;
  }
}

export async function sendOtpSms(phone: string, otp: string): Promise<boolean> {
  return sendSms(phone, `Your Bia'net verification code is: ${otp}. It expires in 10 minutes.`);
}
