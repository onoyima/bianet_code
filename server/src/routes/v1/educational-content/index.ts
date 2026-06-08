import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, educationalContentTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { authorize } from "../../../middlewares/authorize";

const router: IRouter = Router();

/**
 * POST /api/v1/educational-content
 * Create educational content (admin only).
 */
router.post(
  "/v1/educational-content",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN_MODERATOR"),
  async (req, res): Promise<void> => {
    const authorId = req.user!.sub;
    const { title, description, contentType, contentUrl, category, language, tags, isPublished } =
      req.body as {
        title?: string;
        description?: string;
        contentType?: string;
        contentUrl?: string;
        category?: string;
        language?: string;
        tags?: string[];
        isPublished?: boolean;
      };

    if (!title || !description || !contentType || !contentUrl) {
      res.status(400).json({ error: "title, description, contentType, contentUrl are required" });
      return;
    }

    const [content] = await db
      .insert(educationalContentTable)
      .values({
        title,
        description,
        contentType,
        contentUrl,
        category: category ?? null,
        language: language ?? "en",
        tags: tags ?? [],
        authorId,
        isPublished: isPublished ?? false,
        publishedAt: isPublished ? new Date() : null,
      })
      .returning();

    res.status(201).json(content);
  },
);

/**
 * GET /api/v1/educational-content
 * List educational content (paginated, filterable).
 */
router.get(
  "/v1/educational-content",
  authenticate,
  async (req, res): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const category = req.query["category"] as string | undefined;
    const language = req.query["language"] as string | undefined;
    const publishedOnly = req.query["published"] !== "false";

    const conditions = [];
    if (category) conditions.push(eq(educationalContentTable.category, category));
    if (language) conditions.push(eq(educationalContentTable.language, language));
    if (publishedOnly) conditions.push(eq(educationalContentTable.isPublished, true));

    const rows = await db
      .select()
      .from(educationalContentTable)
      .where(and(...conditions))
      .orderBy(desc(educationalContentTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: db.$count(educationalContentTable, and(...conditions)) })
      .from(educationalContentTable);

    res.json({
      data: rows,
      meta: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    });
  },
);

/**
 * GET /api/v1/educational-content/:id
 */
router.get(
  "/v1/educational-content/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [content] = await db
      .select()
      .from(educationalContentTable)
      .where(eq(educationalContentTable.id, rawId))
      .limit(1);

    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    res.json(content);
  },
);

/**
 * PATCH /api/v1/educational-content/:id
 * Update educational content (admin only).
 */
router.patch(
  "/v1/educational-content/:id",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN_MODERATOR"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [content] = await db
      .select({ id: educationalContentTable.id, isPublished: educationalContentTable.isPublished })
      .from(educationalContentTable)
      .where(eq(educationalContentTable.id, rawId))
      .limit(1);

    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const { title, description, contentType, contentUrl, category, language, tags, isPublished } =
      req.body as {
        title?: string;
        description?: string;
        contentType?: string;
        contentUrl?: string;
        category?: string;
        language?: string;
        tags?: string[];
        isPublished?: boolean;
      };

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates["title"] = title;
    if (description !== undefined) updates["description"] = description;
    if (contentType !== undefined) updates["contentType"] = contentType;
    if (contentUrl !== undefined) updates["contentUrl"] = contentUrl;
    if (category !== undefined) updates["category"] = category;
    if (language !== undefined) updates["language"] = language;
    if (tags !== undefined) updates["tags"] = tags;
    if (isPublished !== undefined) {
      updates["isPublished"] = isPublished;
      if (isPublished && !content.isPublished) updates["publishedAt"] = new Date();
    }

    const [updated] = await db
      .update(educationalContentTable)
      .set(updates)
      .where(eq(educationalContentTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

/**
 * DELETE /api/v1/educational-content/:id
 * Delete educational content (admin only).
 */
router.delete(
  "/v1/educational-content/:id",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN_MODERATOR"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [content] = await db
      .select({ id: educationalContentTable.id })
      .from(educationalContentTable)
      .where(eq(educationalContentTable.id, rawId))
      .limit(1);

    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    await db.delete(educationalContentTable).where(eq(educationalContentTable.id, rawId));
    res.sendStatus(204);
  },
);

export default router;
