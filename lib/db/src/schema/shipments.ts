import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { escrowTransactionsTable } from "./escrow-transactions";
import { usersTable } from "./users";

export const SHIPMENT_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
] as const;

export const shipmentsTable = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  escrowId: uuid("escrow_id")
    .notNull()
    .references(() => escrowTransactionsTable.id),
  logisticsProviderId: uuid("logistics_provider_id").references(
    () => usersTable.id,
  ),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  trackingCode: varchar("tracking_code", { length: 100 }).unique(),
  verificationCode: varchar("verification_code", { length: 20 }),
  originAddress: text("origin_address"),
  destinationAddress: text("destination_address"),
  billOfLadingUrl: text("bill_of_lading_url"),
  sgsCertificateUrl: text("sgs_certificate_url"),
  shippingManifestUrl: text("shipping_manifest_url"),
  inspectionReportUrl: text("inspection_report_url"),
  estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;
