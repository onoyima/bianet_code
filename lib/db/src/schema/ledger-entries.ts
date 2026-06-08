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
import { escrowTransactionsTable } from "./escrow-transactions";

export const LEDGER_ACCOUNT_TYPES = [
  "ESCROW_HELD",
  "PLATFORM_COMMISSION",
  "LOGISTICS_FEE",
  "INSURANCE_FEE",
  "SELLER_PAYOUT",
  "BUYER_REFUND",
  "ARBITRATION_PAYOUT",
] as const;

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => escrowTransactionsTable.id),
  accountType: varchar("account_type", { length: 50 }).notNull(),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  description: text("description").notNull(),
  entityId: uuid("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLedgerEntrySchema = createInsertSchema(
  ledgerEntriesTable,
).omit({ id: true, createdAt: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
