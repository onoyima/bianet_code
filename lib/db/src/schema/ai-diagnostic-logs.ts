import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const aiDiagnosticLogsTable = pgTable("ai_diagnostic_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  imageUrl: text("image_url"),
  diseaseName: varchar("disease_name", { length: 255 }),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  isHealthy: text("is_healthy"),
  treatmentOrganic: text("treatment_organic"),
  treatmentChemical: text("treatment_chemical"),
  rawResponse: jsonb("raw_response"),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  cropType: varchar("crop_type", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiDiagnosticLogSchema = createInsertSchema(
  aiDiagnosticLogsTable,
).omit({ id: true, createdAt: true });
export type InsertAiDiagnosticLog = z.infer<typeof insertAiDiagnosticLogSchema>;
export type AiDiagnosticLog = typeof aiDiagnosticLogsTable.$inferSelect;
