import {
  pgTable,
  text,
  varchar,
  uuid,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const KYC_DOCUMENT_STATUSES = [
  "PENDING_SUBMISSION",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

export const kycDocumentsTable = pgTable("kyc_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  cacNumber: varchar("cac_number", { length: 100 }),
  taxClearanceUrl: text("tax_clearance_url"),
  exportLicenseUrl: text("export_license_url"),
  governmentIdUrl: text("government_id_url"),
  businessDocUrl: text("business_doc_url"),
  biometricData: text("biometric_data"),
  additionalDocs: jsonb("additional_docs"),
  status: varchar("status", { length: 50 }).notNull().default("PENDING_SUBMISSION"),
  reviewedById: uuid("reviewed_by_id").references(() => usersTable.id),
  reviewerNotes: text("reviewer_notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertKycDocumentSchema = createInsertSchema(
  kycDocumentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;
export type KycDocument = typeof kycDocumentsTable.$inferSelect;
