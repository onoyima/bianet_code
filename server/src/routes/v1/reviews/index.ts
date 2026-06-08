import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, reviewsTable, seedListingsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";

const router: IRouter = Router();

/**
 * POST /api/v1/reviews
 * Create a review for a seed listing that the user has purchased.
 */
router.post(
  "/v1/reviews",
  authenticate,
  async (req, res): Promise<void> => {
    const reviewerId = req.user!.sub;
    const { listingId, rating, comment } = req.body as {
      listingId?: string;
      rating?: number;
      comment?: string;
    };

    if (!listingId || rating === undefined) {
      res.status(400).json({ error: "listingId and rating are required" });
      return;
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ error: "rating must be an integer between 1 and 5" });
      return;
    }

    const [listing] = await db
      .select({ id: seedListingsTable.id })
      .from(seedListingsTable)
      .where(eq(seedListingsTable.id, listingId))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const [existing] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.listingId, listingId),
          eq(reviewsTable.reviewerId, reviewerId),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "You have already reviewed this listing" });
      return;
    }

    const [review] = await db
      .insert(reviewsTable)
      .values({ listingId, reviewerId, rating: ratingNum, comment: comment ?? null })
      .returning();

    res.status(201).json(review);
  },
);

/**
 * GET /api/v1/reviews/:listingId
 * List reviews for a listing.
 */
router.get(
  "/v1/reviews/:listingId",
  async (req, res): Promise<void> => {
    const rawListingId = Array.isArray(req.params["listingId"])
      ? req.params["listingId"][0]
      : req.params["listingId"];

    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.listingId, rawListingId))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: db.$count(reviewsTable, eq(reviewsTable.listingId, rawListingId)) })
      .from(reviewsTable);

    const [{ avg }] = await db
      .select({ avg: sql<number>`avg(${reviewsTable.rating})` })
      .from(reviewsTable)
      .where(eq(reviewsTable.listingId, rawListingId));

    res.json({
      data: rows,
      meta: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
        averageRating: avg ? Math.round(avg * 10) / 10 : null,
      },
    });
  },
);

export default router;
