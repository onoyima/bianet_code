import {
  pgTable,
  text,
  varchar,
  boolean,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const educationalContentTable = pgTable("educational_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  contentType: varchar("content_type", { length: 50 }).notNull(),
  contentUrl: text("content_url").notNull(),
  category: varchar("category", { length: 100 }),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  tags: text("tags").array(),
  authorId: uuid("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertEducationalContentSchema = createInsertSchema(
  educationalContentTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEducationalContent = z.infer<typeof insertEducationalContentSchema>;
export type EducationalContent = typeof educationalContentTable.$inferSelect;
