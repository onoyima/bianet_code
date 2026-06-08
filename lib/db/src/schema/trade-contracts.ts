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
import { escrowTransactionsTable } from "./escrow-transactions";
import { usersTable } from "./users";

export const tradeContractsTable = pgTable("trade_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  escrowId: uuid("escrow_id")
    .notNull()
    .unique()
    .references(() => escrowTransactionsTable.id),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  contentUrl: text("content_url").notNull(),
  terms: text("terms").notNull(),
  signedByBuyer: boolean("signed_by_buyer").notNull().default(false),
  signedBySeller: boolean("signed_by_seller").notNull().default(false),
  buyerSignedAt: timestamp("buyer_signed_at", { withTimezone: true }),
  sellerSignedAt: timestamp("seller_signed_at", { withTimezone: true }),
  generatedById: uuid("generated_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTradeContractSchema = createInsertSchema(
  tradeContractsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTradeContract = z.infer<typeof insertTradeContractSchema>;
export type TradeContract = typeof tradeContractsTable.$inferSelect;
