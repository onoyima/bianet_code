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

export const ESCROW_STATUSES = [
  "AWAITING_DEPOSIT",
  "FUNDS_HELD",
  "FUNDS_RELEASED",
  "IN_DISPUTE",
  "ARBITRATION_SETTLED",
  "REFUNDED",
  "CANCELLED",
] as const;

export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export const ESCROW_PLATFORMS = ["SEED", "BARTAR"] as const;

export const escrowTransactionsTable = pgTable("escrow_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: varchar("platform", { length: 20 }).notNull(),
  listingId: uuid("listing_id").notNull(),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => usersTable.id),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  platformCommissionRate: numeric("platform_commission_rate", { precision: 5, scale: 4 }).notNull().default("0.05"),
  platformCommission: numeric("platform_commission", { precision: 18, scale: 2 }).notNull(),
  logisticsFee: numeric("logistics_fee", { precision: 18, scale: 2 }).notNull().default("0"),
  insuranceFee: numeric("insurance_fee", { precision: 18, scale: 2 }).notNull().default("0"),
  netSellerPayout: numeric("net_seller_payout", { precision: 18, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("AWAITING_DEPOSIT"),
  paymentReference: varchar("payment_reference", { length: 255 }).unique(),
  paymentProvider: varchar("payment_provider", { length: 50 }),
  depositedAt: timestamp("deposited_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
  arbitrationNotes: text("arbitration_notes"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertEscrowTransactionSchema = createInsertSchema(
  escrowTransactionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEscrowTransaction = z.infer<typeof insertEscrowTransactionSchema>;
export type EscrowTransaction = typeof escrowTransactionsTable.$inferSelect;
