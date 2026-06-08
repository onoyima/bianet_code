import {
  pgTable,
  text,
  varchar,
  boolean,
  uuid,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const logisticsProvidersTable = pgTable("logistics_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 100 }),
  fleetSize: integer("fleet_size").notNull().default(0),
  coverageStates: text("coverage_states").array(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  isVerified: boolean("is_verified").notNull().default(false),
  verificationDocUrl: text("verification_doc_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLogisticsProviderSchema = createInsertSchema(
  logisticsProvidersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLogisticsProvider = z.infer<typeof insertLogisticsProviderSchema>;
export type LogisticsProvider = typeof logisticsProvidersTable.$inferSelect;
