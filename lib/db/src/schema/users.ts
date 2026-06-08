import {
  pgTable,
  text,
  varchar,
  boolean,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_MODERATOR",
  "FARMER",
  "CONSUMER",
  "TRADER",
  "EXPORTER",
  "IMPORTER",
  "LOGISTICS_PROVIDER",
  "AGRI_SUPPLIER",
  "COOPERATIVE_MANAGER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const KYC_STATUSES = [
  "UNVERIFIED",
  "PENDING_SUBMISSION",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export const LANGUAGES = ["en", "ha", "ig", "yo"] as const;
export type Language = (typeof LANGUAGES)[number];

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash"),
  transactionPinHash: text("transaction_pin_hash"),
  role: varchar("role", { length: 50 }).notNull().default("FARMER"),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  isActive: boolean("is_active").notNull().default(false),
  kycStatus: varchar("kyc_status", { length: 50 }).notNull().default("UNVERIFIED"),
  deviceFingerprint: text("device_fingerprint"),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
