import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  logisticsProvidersTable,
  shipmentsTable,
} from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { authorize } from "../../../middlewares/authorize";

const router: IRouter = Router();

/**
 * POST /api/v1/logistics/register
 * Register as a logistics provider.
 */
router.post(
  "/v1/logistics/register",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const { companyName, registrationNumber, fleetSize, coverageStates, phone, email, verificationDocUrl } =
      req.body as {
        companyName?: string;
        registrationNumber?: string;
        fleetSize?: number;
        coverageStates?: string[];
        phone?: string;
        email?: string;
        verificationDocUrl?: string;
      };

    if (!companyName || !phone) {
      res.status(400).json({ error: "companyName and phone are required" });
      return;
    }

    const [existing] = await db
      .select({ id: logisticsProvidersTable.id })
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, userId))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Already registered as logistics provider" });
      return;
    }

    const [provider] = await db
      .insert(logisticsProvidersTable)
      .values({
        userId,
        companyName,
        registrationNumber: registrationNumber ?? null,
        fleetSize: fleetSize ?? 0,
        coverageStates: coverageStates ?? [],
        phone,
        email: email ?? null,
        verificationDocUrl: verificationDocUrl ?? null,
      })
      .returning();

    res.status(201).json(provider);
  },
);

/**
 * GET /api/v1/logistics/profile
 * Get the authenticated user's logistics provider profile.
 */
router.get(
  "/v1/logistics/profile",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    const [provider] = await db
      .select()
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, userId))
      .limit(1);

    if (!provider) {
      res.status(404).json({ error: "Not registered as logistics provider" });
      return;
    }

    res.json(provider);
  },
);

/**
 * PATCH /api/v1/logistics/profile
 * Update logistics provider profile.
 */
router.patch(
  "/v1/logistics/profile",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    const [provider] = await db
      .select({ id: logisticsProvidersTable.id })
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, userId))
      .limit(1);

    if (!provider) {
      res.status(404).json({ error: "Not registered as logistics provider" });
      return;
    }

    const { companyName, fleetSize, coverageStates, phone, email } = req.body as {
      companyName?: string;
      fleetSize?: number;
      coverageStates?: string[];
      phone?: string;
      email?: string;
    };

    const updates: Record<string, unknown> = {};
    if (companyName !== undefined) updates["companyName"] = companyName;
    if (fleetSize !== undefined) updates["fleetSize"] = fleetSize;
    if (coverageStates !== undefined) updates["coverageStates"] = coverageStates;
    if (phone !== undefined) updates["phone"] = phone;
    if (email !== undefined) updates["email"] = email;

    const [updated] = await db
      .update(logisticsProvidersTable)
      .set(updates)
      .where(eq(logisticsProvidersTable.id, provider.id))
      .returning();

    res.json(updated);
  },
);

/**
 * GET /api/v1/logistics/providers
 * List verified logistics providers (admin or any auth user).
 */
router.get(
  "/v1/logistics/providers",
  authenticate,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.isVerified, true))
      .orderBy(desc(logisticsProvidersTable.createdAt));

    res.json({ data: rows });
  },
);

/**
 * POST /api/v1/logistics/shipments/:id/assign
 * Admin assigns a logistics provider to a shipment.
 */
router.post(
  "/v1/logistics/shipments/:id/assign",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN_MODERATOR"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const { providerId } = req.body as { providerId?: string };

    if (!providerId) {
      res.status(400).json({ error: "providerId is required" });
      return;
    }

    const [provider] = await db
      .select({ id: logisticsProvidersTable.id, isVerified: logisticsProvidersTable.isVerified })
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, providerId))
      .limit(1);

    if (!provider) {
      res.status(404).json({ error: "Logistics provider not found" });
      return;
    }

    if (!provider.isVerified) {
      res.status(400).json({ error: "Logistics provider is not verified" });
      return;
    }

    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, rawId))
      .limit(1);

    if (!shipment) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }

    if (shipment.status !== "PENDING") {
      res.status(400).json({ error: `Cannot assign — shipment is ${shipment.status}` });
      return;
    }

    const trackingCode = `BIA-${Date.now().toString(36).toUpperCase()}-${rawId.slice(0, 4).toUpperCase()}`;

    const [updated] = await db
      .update(shipmentsTable)
      .set({
        logisticsProviderId: providerId,
        status: "ASSIGNED",
        trackingCode,
      })
      .where(eq(shipmentsTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

/**
 * PATCH /api/v1/logistics/shipments/:id/status
 * Logistics provider updates shipment status.
 */
router.patch(
  "/v1/logistics/shipments/:id/status",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

    const [provider] = await db
      .select({ id: logisticsProvidersTable.id })
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, userId))
      .limit(1);

    if (!provider) {
      res.status(403).json({ error: "Only logistics providers can update shipment status" });
      return;
    }

    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          eq(shipmentsTable.id, rawId),
          eq(shipmentsTable.logisticsProviderId, userId),
        ),
      )
      .limit(1);

    if (!shipment) {
      res.status(404).json({ error: "Shipment not found or not assigned to you" });
      return;
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      ASSIGNED: ["PICKED_UP", "CANCELLED"],
      PICKED_UP: ["IN_TRANSIT", "RETURNED"],
      IN_TRANSIT: ["DELIVERED", "RETURNED"],
    };

    const { status } = req.body as { status?: string };

    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }

    const allowed = VALID_TRANSITIONS[shipment.status];
    if (!allowed || !allowed.includes(status)) {
      res.status(400).json({
        error: `Invalid transition: ${shipment.status} → ${status}`,
      });
      return;
    }

    const timeFields: Record<string, Date | undefined> = {};
    if (status === "PICKED_UP") timeFields["pickedUpAt"] = new Date();
    if (status === "DELIVERED") timeFields["deliveredAt"] = new Date();

    const [updated] = await db
      .update(shipmentsTable)
      .set({ status, ...timeFields })
      .where(eq(shipmentsTable.id, rawId))
      .returning();

    res.json(updated);
  },
);

/**
 * GET /api/v1/logistics/shipments
 * List shipments assigned to the authenticated provider.
 */
router.get(
  "/v1/logistics/shipments",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;

    const [provider] = await db
      .select({ id: logisticsProvidersTable.id })
      .from(logisticsProvidersTable)
      .where(eq(logisticsProvidersTable.userId, userId))
      .limit(1);

    if (!provider) {
      res.status(403).json({ error: "Only logistics providers can view shipments" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const statusFilter = req.query["status"] as string | undefined;

    const conditions = [eq(shipmentsTable.logisticsProviderId, userId)];
    if (statusFilter) {
      conditions.push(eq(shipmentsTable.status, statusFilter));
    }

    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(and(...conditions))
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: db.$count(shipmentsTable, and(...conditions)) })
      .from(shipmentsTable);

    res.json({
      data: rows,
      meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) },
    });
  },
);

export default router;
