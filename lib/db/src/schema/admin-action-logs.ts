import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const adminActionLogsTable = pgTable("admin_action_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => usersTable.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: uuid("entity_id"),
  payloadBefore: jsonb("payload_before"),
  payloadAfter: jsonb("payload_after"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  result: varchar("result", { length: 20 }).notNull().default("SUCCESS"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminActionLogSchema = createInsertSchema(
  adminActionLogsTable,
).omit({ id: true, createdAt: true });
export type InsertAdminActionLog = z.infer<typeof insertAdminActionLogSchema>;
export type AdminActionLog = typeof adminActionLogsTable.$inferSelect;
