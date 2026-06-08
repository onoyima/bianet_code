import type { Request, Response, NextFunction } from "express";

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "pin",
  "transactionPinHash",
  "transaction_pin_hash",
  "token",
  "refreshToken",
  "secret",
  "authorization",
]);

const MAX_STRING_LENGTH = 5000;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[max depth]";
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH);
    }
    return value
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        result[k] = v;
      } else {
        result[k] = sanitizeValue(v, depth + 1);
      }
    }
    return result;
  }
  return value;
}

export function sanitizeInput(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body) as Record<string, unknown>;
  }
  if (req.query && typeof req.query === "object") {
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") {
        (req.query as Record<string, string>)[k] = v.slice(0, MAX_STRING_LENGTH);
      }
    }
  }
  next();
}
