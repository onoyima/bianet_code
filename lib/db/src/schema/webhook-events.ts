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

export const webhookEventsTable = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 50 }).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventId: varchar("event_id", { length: 255 }).unique(),
  payload: jsonb("payload").notNull(),
  signatureValid: text("signature_valid").notNull().default("false"),
  processed: text("processed").notNull().default("false"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(
  webhookEventsTable,
).omit({ id: true, createdAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
