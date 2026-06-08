import { Router, type IRouter } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db, usersTable, profilesTable, otpVerificationsTable, refreshTokensTable } from "@workspace/db";
import { generateOtp, hashOtp, verifyOtpHash, hashPassword, verifyPassword } from "../../../lib/crypto";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
} from "../../../lib/auth";
import { authLimiter, otpLimiter, refreshLimiter } from "../../../middlewares/rate-limit";
import { getLoginLockoutTracker } from "../../../lib/rate-limit-store";
import { authenticate } from "../../../middlewares/authenticate";
import { sendOtpSms } from "../../../lib/sms";
import { logger } from "../../../lib/logger";

const router: IRouter = Router();

function getClientIp(req: Parameters<typeof authenticate>[0]): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

/**
 * POST /api/v1/auth/otp/send
 * Send a one-time password to the given phone number.
 */
router.post("/v1/auth/otp/send", otpLimiter, async (req, res): Promise<void> => {
  const { phone, purpose = "REGISTRATION" } = req.body as {
    phone?: string;
    purpose?: string;
  };

  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  const otp = generateOtp(6);
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(otpVerificationsTable).values({
    phone,
    otpHash,
    purpose,
    expiresAt,
    ipAddress: getClientIp(req),
  });

  req.log.info({ phone, purpose }, "OTP generated");

  // Attempt to send via Twilio SMS
  const smsSent = await sendOtpSms(phone, otp);

  if (!smsSent && process.env.NODE_ENV === "production") {
    logger.error({ phone, purpose }, "OTP SMS delivery failed in production");
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
    return;
  }

  // In non-production, log the OTP for development convenience
  if (process.env.NODE_ENV !== "production") {
    req.log.info({ otp, phone }, "DEV: OTP value (never log in production)");
  }

  res.json({ message: "OTP sent to your phone number." });
});

/**
 * POST /api/v1/auth/register
 * Verify OTP and create a new user account.
 */
const ALLOWED_ROLES = new Set(["FARMER", "AGRI_SUPPLIER", "TRADER", "COOPERATIVE_MANAGER", "BUYER", "SELLER"]);

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/v1/auth/register", authLimiter, async (req, res): Promise<void> => {
  const { phone, otp, password, firstName, lastName, email, role = "FARMER", language = "en" } =
    req.body as {
      phone?: string;
      otp?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: string;
      language?: string;
    };

  if (!phone || !otp || !password || !firstName || !lastName) {
    res.status(400).json({ error: "phone, otp, password, firstName, lastName are required" });
    return;
  }

  if (!PHONE_REGEX.test(phone)) {
    res.status(400).json({ error: "Invalid phone number format (must be E.164)" });
    return;
  }

  if (email && !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  if (!ALLOWED_ROLES.has(role)) {
    res.status(400).json({ error: `Invalid role. Allowed: ${[...ALLOWED_ROLES].join(", ")}` });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const pwErrors: string[] = [];
  if (!/[A-Z]/.test(password)) pwErrors.push("uppercase letter");
  if (!/[a-z]/.test(password)) pwErrors.push("lowercase letter");
  if (!/[0-9]/.test(password)) pwErrors.push("digit");
  if (!/[^A-Za-z0-9]/.test(password)) pwErrors.push("special character");
  if (pwErrors.length > 0) {
    res.status(400).json({
      error: `Password must include at least one ${pwErrors.join(", ")}`,
    });
    return;
  }

  // Verify OTP
  const [otpRecord] = await db
    .select()
    .from(otpVerificationsTable)
    .where(
      and(
        eq(otpVerificationsTable.phone, phone),
        eq(otpVerificationsTable.purpose, "REGISTRATION"),
        isNull(otpVerificationsTable.usedAt),
        gt(otpVerificationsTable.expiresAt, new Date()),
      ),
    )
    .orderBy(otpVerificationsTable.createdAt)
    .limit(1);

  if (!otpRecord || !verifyOtpHash(otp, otpRecord.otpHash)) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  // Check if phone already registered
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Registration failed. Please try again." });
    return;
  }

  const passwordHash = await hashPassword(password);

  // Create user and profile in a transaction
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({
        phone,
        email: email ?? null,
        passwordHash,
        role,
        language,
        isActive: true,
        lastLoginIp: getClientIp(req),
      })
      .returning();

    if (!user) throw new Error("User creation failed");

    await tx.insert(profilesTable).values({
      userId: user.id,
      firstName,
      lastName,
    });

    // Mark OTP as used
    await tx
      .update(otpVerificationsTable)
      .set({ usedAt: new Date() })
      .where(eq(otpVerificationsTable.id, otpRecord.id));

    return user;
  });

  const accessToken = signAccessToken({
    sub: result.id,
    role: result.role,
    phone: result.phone,
  });
  const refreshToken = signRefreshToken(result.id);
  const tokenHash = hashToken(refreshToken);

  await db.insert(refreshTokensTable).values({
    userId: result.id,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
  });

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, result.id))
    .limit(1);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id: result.id,
      phone: result.phone,
      email: result.email,
      role: result.role,
      language: result.language,
      isActive: result.isActive,
      kycStatus: result.kycStatus,
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      avatarUrl: profile?.avatarUrl,
      businessName: profile?.businessName,
      state: profile?.state,
      country: profile?.country,
      createdAt: result.createdAt,
    },
  });
});

/**
 * POST /api/v1/auth/login
 */
router.post("/v1/auth/login", authLimiter, async (req, res): Promise<void> => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone || !password) {
    res.status(400).json({ error: "phone and password are required" });
    return;
  }

  const lockout = getLoginLockoutTracker();

  // Check if account is temporarily locked
  const lockStatus = lockout.isLocked(phone);
  if (lockStatus.locked) {
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${lockStatus.remainingMinutes} minutes.`,
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (!user || !user.passwordHash) {
    lockout.recordFailed(phone);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    lockout.recordFailed(phone);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Successful login — clear lockout
  lockout.recordSuccess(phone);

  if (!user.isActive) {
    res.status(401).json({ error: "Account is suspended. Contact support." });
    return;
  }

  // Update last login
  await db
    .update(usersTable)
    .set({ lastLoginIp: getClientIp(req), lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
  });
  const refreshToken = signRefreshToken(user.id);
  const tokenHash = hashToken(refreshToken);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
  });

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id))
    .limit(1);

  res.json({
    accessToken,
    refreshToken,
    user: {
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
    },
  });
});

/**
 * POST /api/v1/auth/refresh
 */
router.post("/v1/auth/refresh", refreshLimiter, async (req, res): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(401).json({ error: "refreshToken is required" });
    return;
  }

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const tokenHash = hashToken(refreshToken);
  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!stored) {
    res.status(401).json({ error: "Refresh token not found or revoked" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.sub))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or suspended" });
    return;
  }

  // Revoke old token
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.id, stored.id));

  const newAccessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
  });
  const newRefreshToken = signRefreshToken(user.id);
  const newTokenHash = hashToken(newRefreshToken);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tokenHash: newTokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
  });

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

/**
 * POST /api/v1/auth/logout
 */
router.post("/v1/auth/logout", authenticate, async (req, res): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.tokenHash, tokenHash));
  }

  res.json({ message: "Logged out successfully." });
});

/**
 * POST /api/v1/auth/forgot-password
 * Send OTP to phone for password reset.
 */
router.post(
  "/v1/auth/forgot-password",
  otpLimiter,
  async (req, res): Promise<void> => {
    const { phone } = req.body as { phone?: string };

    if (!phone || !PHONE_REGEX.test(phone)) {
      res.status(400).json({ error: "Valid phone number (E.164) is required" });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (!user) {
      res.json({ message: "If the phone is registered, a reset OTP has been sent." });
      return;
    }

    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpVerificationsTable).values({
      phone,
      otpHash,
      purpose: "PASSWORD_RESET",
      expiresAt,
      ipAddress: getClientIp(req),
    });

    const smsSent = await sendOtpSms(phone, otp);

    if (!smsSent && process.env.NODE_ENV === "production") {
      logger.error({ phone }, "Password reset OTP SMS delivery failed in production");
      res.status(500).json({ error: "Failed to send OTP. Please try again." });
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      req.log.info({ otp, phone }, "DEV: Password reset OTP value (never log in production)");
    }

    res.json({ message: "If the phone is registered, a reset OTP has been sent." });
  },
);

/**
 * POST /api/v1/auth/reset-password
 * Verify OTP and set a new password.
 */
router.post(
  "/v1/auth/reset-password",
  authLimiter,
  async (req, res): Promise<void> => {
    const { phone, otp, password } = req.body as {
      phone?: string;
      otp?: string;
      password?: string;
    };

    if (!phone || !otp || !password) {
      res.status(400).json({ error: "phone, otp, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const pwErrors: string[] = [];
    if (!/[A-Z]/.test(password)) pwErrors.push("uppercase letter");
    if (!/[a-z]/.test(password)) pwErrors.push("lowercase letter");
    if (!/[0-9]/.test(password)) pwErrors.push("digit");
    if (!/[^A-Za-z0-9]/.test(password)) pwErrors.push("special character");
    if (pwErrors.length > 0) {
      res.status(400).json({
        error: `Password must include at least one ${pwErrors.join(", ")}`,
      });
      return;
    }

    const [otpRecord] = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.phone, phone),
          eq(otpVerificationsTable.purpose, "PASSWORD_RESET"),
          isNull(otpVerificationsTable.usedAt),
          gt(otpVerificationsTable.expiresAt, new Date()),
        ),
      )
      .orderBy(otpVerificationsTable.createdAt)
      .limit(1);

    if (!otpRecord || !verifyOtpHash(otp, otpRecord.otpHash)) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }

    const passwordHash = await hashPassword(password);

    await db.transaction(async (tx) => {
      const [user] = await tx
        .update(usersTable)
        .set({ passwordHash, lastLoginIp: getClientIp(req) })
        .where(eq(usersTable.phone, phone))
        .returning();

      if (!user) throw new Error("Password reset failed — user not found");

      await tx
        .update(otpVerificationsTable)
        .set({ usedAt: new Date() })
        .where(eq(otpVerificationsTable.id, otpRecord.id));
    });

    res.json({ message: "Password reset successfully." });
  },
);

/**
 * POST /api/v1/auth/change-password
 * Authenticated user changes their password.
 */
router.post(
  "/v1/auth/change-password",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    const pwErrors: string[] = [];
    if (!/[A-Z]/.test(newPassword)) pwErrors.push("uppercase letter");
    if (!/[a-z]/.test(newPassword)) pwErrors.push("lowercase letter");
    if (!/[0-9]/.test(newPassword)) pwErrors.push("digit");
    if (!/[^A-Za-z0-9]/.test(newPassword)) pwErrors.push("special character");
    if (pwErrors.length > 0) {
      res.status(400).json({
        error: `New password must include at least one ${pwErrors.join(", ")}`,
      });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || !user.passwordHash) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(usersTable)
      .set({ passwordHash: newHash })
      .where(eq(usersTable.id, userId));

    res.json({ message: "Password changed successfully." });
  },
);

export default router;
