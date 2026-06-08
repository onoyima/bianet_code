import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  doublePrecision,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const LISTING_STATUSES = [
  "ACTIVE",
  "SOLD",
  "EXPIRED",
  "SUSPENDED",
  "DRAFT",
] as const;

export const seedListingsTable = pgTable("seed_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  imageUrls: text("image_urls").array(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }).notNull().default("Nigeria"),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertSeedListingSchema = createInsertSchema(
  seedListingsTable,
).omit({ id: true, createdAt: true, updatedAt: true, viewCount: true });
export type InsertSeedListing = z.infer<typeof insertSeedListingSchema>;
export type SeedListing = typeof seedListingsTable.$inferSelect;
