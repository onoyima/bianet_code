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

export const bartarListingsTable = pgTable("bartar_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  commodity: varchar("commodity", { length: 255 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  moistureLevel: numeric("moisture_level", { precision: 5, scale: 2 }),
  qualityGrade: varchar("quality_grade", { length: 50 }),
  price: numeric("price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  shippingTerms: varchar("shipping_terms", { length: 100 }),
  destination: text("destination").array(),
  originCountry: varchar("origin_country", { length: 100 }).notNull().default("Nigeria"),
  description: text("description"),
  imageUrls: text("image_urls").array(),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  isVerifiedExporter: text("is_verified_exporter").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertBartarListingSchema = createInsertSchema(
  bartarListingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBartarListing = z.infer<typeof insertBartarListingSchema>;
export type BartarListing = typeof bartarListingsTable.$inferSelect;
