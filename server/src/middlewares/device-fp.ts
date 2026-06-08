import type { Request, Response, NextFunction } from "express";

const FP_HEADERS = [
  "user-agent",
  "accept-language",
  "sec-ch-ua",
  "sec-ch-ua-platform",
  "sec-ch-ua-mobile",
];

function hashFingerprint(input: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function captureDeviceFingerprint(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const parts: string[] = [];
  for (const h of FP_HEADERS) {
    const val = req.headers[h];
    if (val) parts.push(`${h}=${Array.isArray(val) ? val.join(",") : val}`);
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  parts.push(`ip=${ip}`);

  const raw = parts.join("|");
  (req as Request & { deviceFingerprint?: string }).deviceFingerprint =
    hashFingerprint(raw);

  next();
}

declare global {
  namespace Express {
    interface Request {
      deviceFingerprint?: string;
    }
  }
}
