import crypto from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function generateOtp(length = 6): string {
  const digits = "0123456789";
  let otp = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i]! % 10];
  }
  return otp;
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function verifyOtpHash(otp: string, hash: string): boolean {
  const computed = hashOtp(otp);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function generateVerificationCode(length = 8): string {
  return crypto.randomBytes(length).toString("hex").toUpperCase().slice(0, length);
}

export function generateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
