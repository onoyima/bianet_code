import type { Request, Response, NextFunction } from "express";
import { db, adminActionLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Middleware that logs an admin action after the handler responds.
 * Attach to admin routes: router.patch(..., logAdminAction("KYC_STATUS_UPDATE"), handler)
 */
export function logAdminAction(action: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const result = res.statusCode < 400 ? "SUCCESS" : "FAILURE";
      if (req.user) {
        db.insert(adminActionLogsTable)
          .values({
            adminId: req.user.sub,
            action,
            entityType: req.params["id"] ? "entity" : undefined,
            entityId: (Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"]) ?? undefined,
            payloadAfter: body as Record<string, unknown>,
            ipAddress:
              (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
              req.socket.remoteAddress,
            userAgent: req.headers["user-agent"],
            result,
          })
          .catch((err: unknown) => {
            logger.error({ err, action }, "Failed to write admin action log");
          });
      }
      return originalJson(body);
    };
    next();
  };
}
