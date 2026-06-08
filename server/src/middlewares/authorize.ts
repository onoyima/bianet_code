import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@workspace/db";

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (roles.length > 0 && !roles.includes(user.role as UserRole)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
      });
      return;
    }
    next();
  };
}
