import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { notificationLimiter } from "../../../middlewares/rate-limit";

const router: IRouter = Router();

router.use(notificationLimiter);

/**
 * GET /api/v1/notifications
 */
router.get("/v1/notifications", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
  const offset = (page - 1) * limit;
  const isReadFilter = req.query["isRead"];

  const conditions = [eq(notificationsTable.userId, userId)];
  if (isReadFilter !== undefined) {
    conditions.push(eq(notificationsTable.isRead, isReadFilter === "true"));
  }

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(notificationsTable, and(...conditions)) })
    .from(notificationsTable);

  res.json({
    data: rows,
    meta: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * PATCH /api/v1/notifications/:id/read
 */
router.patch(
  "/v1/notifications/:id/read",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const userId = req.user!.sub;

    const [notif] = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, rawId),
          eq(notificationsTable.userId, userId),
        ),
      )
      .limit(1);

    if (!notif) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    const [updated] = await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notificationsTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

/**
 * PATCH /api/v1/notifications/read-all
 */
router.patch(
  "/v1/notifications/read-all",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false),
        ),
      );

    res.json({ message: "All notifications marked as read." });
  },
);

export default router;
