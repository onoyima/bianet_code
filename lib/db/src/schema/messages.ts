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
import { usersTable } from "./users";
import { escrowTransactionsTable } from "./escrow-transactions";

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id").references(() => escrowTransactionsTable.id),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => usersTable.id),
  receiverId: uuid("receiver_id")
    .notNull()
    .references(() => usersTable.id),
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 30 }).notNull().default("TEXT"),
  attachmentUrl: text("attachment_url"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
