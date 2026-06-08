import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const NOTIFICATION_TYPES = [
  "ORDER_PLACED",
  "PAYMENT_RECEIVED",
  "ESCROW_FUNDED",
  "ESCROW_RELEASED",
  "ESCROW_DISPUTED",
  "SHIPMENT_UPDATE",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "NEW_MESSAGE",
  "CONTRACT_SIGNED",
  "SYSTEM",
] as const;

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("SYSTEM"),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
