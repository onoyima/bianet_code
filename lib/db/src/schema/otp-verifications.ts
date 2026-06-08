import {
  pgTable,
  varchar,
  text,
  uuid,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const otpVerificationsTable = pgTable("otp_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull(),
  otpHash: text("otp_hash").notNull(),
  purpose: varchar("purpose", { length: 50 }).notNull().default("REGISTRATION"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOtpVerificationSchema = createInsertSchema(
  otpVerificationsTable,
).omit({ id: true, createdAt: true });
export type InsertOtpVerification = z.infer<typeof insertOtpVerificationSchema>;
export type OtpVerification = typeof otpVerificationsTable.$inferSelect;
