import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logger } from "./logger";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  logger.warn(
    "JWT_SECRET or JWT_REFRESH_SECRET not set — using insecure defaults for development only",
  );
}

const ACCESS_SECRET = JWT_SECRET ?? "dev-access-secret-do-not-use-in-prod";
const REFRESH_SECRET =
  JWT_REFRESH_SECRET ?? "dev-refresh-secret-do-not-use-in-prod";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: "HS256",
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "refresh" }, REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
