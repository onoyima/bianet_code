import { Router, type IRouter } from "express";
import { eq, and, or, desc, lt, sql } from "drizzle-orm";
import { db, messagesTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { messageLimiter } from "../../../middlewares/rate-limit";
import { pushReadReceipt } from "../../../lib/ws";

const router: IRouter = Router();

router.use(messageLimiter);

/**
 * GET /api/v1/messages/:tradeId
 * Returns paginated message history for a trade.
 * Query params:
 *   limit   — default 50, max 100
 *   before  — ISO timestamp cursor for keyset pagination
 */
router.get(
  "/v1/messages/:tradeId",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const { tradeId } = req.params as { tradeId: string };
    const rawLimit = Number(req.query["limit"] ?? 50);
    const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100));
    const before = req.query["before"] as string | undefined;

    let beforeDate: Date | undefined;
    if (before) {
      beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        res.status(400).json({ error: "Invalid 'before' date format (use ISO 8601)" });
        return;
      }
    }

    // Only participants can read the conversation
    const whereClause = and(
      eq(messagesTable.tradeId, tradeId),
      or(
        eq(messagesTable.senderId, userId),
        eq(messagesTable.receiverId, userId),
      ),
      beforeDate
        ? lt(messagesTable.createdAt, beforeDate)
        : undefined,
    );

    const messages = await db
      .select()
      .from(messagesTable)
      .where(whereClause)
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    res.json({
      messages: messages.reverse(), // chronological order
      hasMore: messages.length === limit,
      nextCursor: messages.length > 0
        ? messages[0]!.createdAt.toISOString()
        : null,
    });
  },
);

/**
 * PATCH /api/v1/messages/:tradeId/read
 * Marks all unread messages in a trade as read for the calling user.
 * Also pushes a real-time read receipt to the room.
 */
router.patch(
  "/v1/messages/:tradeId/read",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const { tradeId } = req.params as { tradeId: string };

    const updated = await db
      .update(messagesTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(messagesTable.tradeId, tradeId),
          eq(messagesTable.receiverId, userId),
          eq(messagesTable.isRead, false),
        ),
      )
      .returning({ id: messagesTable.id });

    // Notify sender in real time
    pushReadReceipt(tradeId, userId, updated.length);

    res.json({ read: updated.length });
  },
);

/**
 * GET /api/v1/messages/unread-count
 * Returns the total unread message count across all trades for the caller.
 */
router.get(
  "/v1/messages/unread-count",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.receiverId, userId),
          eq(messagesTable.isRead, false),
        ),
      );

    res.json({ unreadCount: row?.count ?? 0 });
  },
);

export default router;
