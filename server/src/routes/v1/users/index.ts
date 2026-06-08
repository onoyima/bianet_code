import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, profilesTable } from "@workspace/db";
import { hashPin, verifyPin } from "../../../lib/crypto";
import { authenticate } from "../../../middlewares/authenticate";
import { userLimiter } from "../../../middlewares/rate-limit";

const router: IRouter = Router();

router.use(userLimiter);

/**
 * GET /api/v1/users/me
 */
router.get("/v1/users/me", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);

  res.json({
    id: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    language: user.language,
    isActive: user.isActive,
    kycStatus: user.kycStatus,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    avatarUrl: profile?.avatarUrl,
    businessName: profile?.businessName,
    state: profile?.state,
    country: profile?.country,
    createdAt: user.createdAt,
  });
});

/**
 * PATCH /api/v1/users/me
 */
router.patch("/v1/users/me", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { firstName, lastName, email, language, avatarUrl, businessName, state } =
    req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      language?: string;
      avatarUrl?: string;
      businessName?: string;
      state?: string;
    };

  await db.transaction(async (tx) => {
    if (email !== undefined || language !== undefined) {
      const updates: Record<string, unknown> = {};
      if (email !== undefined) updates["email"] = email;
      if (language !== undefined) updates["language"] = language;
      await tx
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, userId));
    }

    const profileUpdates: Record<string, unknown> = {};
    if (firstName !== undefined) profileUpdates["firstName"] = firstName;
    if (lastName !== undefined) profileUpdates["lastName"] = lastName;
    if (avatarUrl !== undefined) profileUpdates["avatarUrl"] = avatarUrl;
    if (businessName !== undefined) profileUpdates["businessName"] = businessName;
    if (state !== undefined) profileUpdates["state"] = state;

    if (Object.keys(profileUpdates).length > 0) {
      const [existing] = await tx
        .select({ id: profilesTable.id })
        .from(profilesTable)
        .where(eq(profilesTable.userId, userId))
        .limit(1);

      if (existing) {
        await tx
          .update(profilesTable)
          .set(profileUpdates)
          .where(eq(profilesTable.userId, userId));
      } else {
        await tx.insert(profilesTable).values({
          userId,
          firstName: (profileUpdates["firstName"] as string) ?? "",
          lastName: (profileUpdates["lastName"] as string) ?? "",
          ...profileUpdates,
        });
      }
    }
  });

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);

  res.json({
    id: user!.id,
    phone: user!.phone,
    email: user!.email,
    role: user!.role,
    language: user!.language,
    isActive: user!.isActive,
    kycStatus: user!.kycStatus,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    avatarUrl: profile?.avatarUrl,
    businessName: profile?.businessName,
    state: profile?.state,
    country: profile?.country,
    createdAt: user!.createdAt,
  });
});

/**
 * PATCH /api/v1/users/me/pin
 */
router.patch("/v1/users/me/pin", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.sub;
  const { currentPin, pin } = req.body as {
    currentPin?: string;
    pin?: string;
  };

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ error: "pin must be 4–6 digits" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.transactionPinHash) {
    if (!currentPin) {
      res.status(400).json({ error: "currentPin is required to change PIN" });
      return;
    }
    const valid = await verifyPin(currentPin, user.transactionPinHash);
    if (!valid) {
      res.status(400).json({ error: "Current PIN is incorrect" });
      return;
    }
  }

  const newPinHash = await hashPin(pin);
  await db
    .update(usersTable)
    .set({ transactionPinHash: newPinHash })
    .where(eq(usersTable.id, userId));

  res.json({ message: "Transaction PIN updated successfully." });
});

export default router;
