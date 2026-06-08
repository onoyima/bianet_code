import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { bartarListingsTable } from "./bartar-listings";

export const negotiationsTable = pgTable("negotiations", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => bartarListingsTable.id, { onDelete: "cascade" }),
  initiatorId: uuid("initiator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  targetId: uuid("target_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  offeredPrice: numeric("offered_price", { precision: 18, scale: 2 }).notNull(),
  offeredQuantity: numeric("offered_quantity", { precision: 18, scale: 4 }).notNull(),
  message: text("message"),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertNegotiationSchema = createInsertSchema(negotiationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
});
export type InsertNegotiation = z.infer<typeof insertNegotiationSchema>;
export type Negotiation = typeof negotiationsTable.$inferSelect;
