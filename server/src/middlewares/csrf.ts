import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const secret = process.env.CSRF_SECRET ?? "bianet-csrf-secret-change-in-production";
  const cookieToken = req.cookies?.["X-CSRF-Token"];
  const headerToken = req.headers["x-csrf-token"] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }

  const expected = require("crypto")
    .createHash("sha256")
    .update(`${secret}:${new Date().toISOString().slice(0, 10)}`)
    .digest("hex");

  if (cookieToken !== expected) {
    res.status(403).json({ error: "CSRF token mismatch" });
    return;
  }

  next();
}
