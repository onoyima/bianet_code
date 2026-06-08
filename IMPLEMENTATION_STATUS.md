# Bia'net Platform — Implementation Status vs Specification

**Generated**: 2026-06-01
**Spec source**: `attached_assets/Bianet_Ultimate_Backend_Architecture_Prompt_V2_1779640032892.docx`
**Stack note**: Spec prescribes NestJS + Prisma + PostgreSQL + PostGIS + Redis + Winston + Sentry + Supabase Storage. The actual codebase uses **Express 5 + Drizzle ORM** (deliberate user choice). This document audits against the spec's **features and endpoints**, not its framework choices.

---

## 1. USER ROLES & AUTHENTICATION

| Requirement | Status | Location |
|-------------|--------|----------|
| JWT access tokens | ✅ Implemented | `server/src/lib/auth.ts` |
| Refresh tokens with rotation | ✅ Implemented | `server/src/lib/auth.ts` (7-day TTL, hash stored) |
| Role-based access control (guards) | ✅ Implemented | `server/src/middlewares/authorize.ts` |
| OTP generation (6-digit numeric) | ✅ Implemented | `server/src/lib/crypto.ts` |
| OTP hashing (SHA-256) | ✅ Implemented | `server/src/lib/crypto.ts` |
| OTP expiry (10 min) | ✅ Implemented | `server/src/routes/v1/auth/index.ts:44` |
| Twilio SMS dispatch | ✅ Implemented | `server/src/lib/sms.ts` |
| Password hashing (bcrypt) | ✅ Implemented | `server/src/lib/crypto.ts` |
| Transaction PIN (4-6 digits, bcrypt) | ✅ Implemented | `server/src/lib/crypto.ts` |
| Phone-based login (E.164) | ✅ Implemented | `server/src/routes/v1/auth/index.ts` |
| Language selection at registration | ✅ Implemented | Stored in `users.language` — en/ha/ig/yo |
| Device fingerprint capture | ✅ Implemented | `server/src/middlewares/device-fp.ts` |
| IP tracking on auth actions | ✅ Implemented | All auth routes log IP |
| IP tracking on admin actions | ✅ Implemented | `server/src/middlewares/admin-log.ts` |
| ❌ Role whitelist on registration | ✅ Fixed | `server/src/routes/v1/auth/index.ts` — `ALLOWED_ROLES` Set |
| ❌ Phone enumeration via registration | ✅ Fixed | Generic error: "Registration failed. Please try again." |
| ❌ Password complexity requirements | ❌ **Missing** | Only min 8 chars — no uppercase/digit/special requirement |
| ❌ Account lockout after failed attempts | ❌ **Missing** | Rate limited (5 req/5min) but no permanent/per-timer lockout |
| ❌ Session blacklist (global token revocation) | ❌ **Missing** | Logout revokes single token only |
| ❌ Biometric verification (spec §17) | ❌ **Missing** | Not implemented |
| ❌ OAuth / social login | ❌ **Missing** | Not implemented |

### Auth API Endpoints

| Endpoint | Status | Route file |
|----------|--------|------------|
| `POST /api/v1/auth/otp/send` | ✅ | `auth/index.ts:31` |
| `POST /api/v1/auth/register` | ✅ | `auth/index.ts:77` |
| `POST /api/v1/auth/login` | ✅ | `auth/index.ts:213` |
| `POST /api/v1/auth/refresh` | ✅ | `auth/index.ts:296` |
| `POST /api/v1/auth/logout` | ✅ | `auth/index.ts:369` |

---

## 2. DATABASE TABLES (18 total)

All 18 tables from the schema index exist in the database via Drizzle:

| Table | Status | Schema file | Notes |
|-------|--------|-------------|-------|
| `users` | ✅ | `lib/db/src/schema/users.ts` | Roles, phone, language, KYC status |
| `profiles` | ✅ | `lib/db/src/schema/profiles.ts` | firstName, lastName, avatar, business, state |
| `otp_verifications` | ✅ | `lib/db/src/schema/otp-verifications.ts` | Hashed OTP, purpose, expiry, usedAt |
| `refresh_tokens` | ✅ | `lib/db/src/schema/refresh-tokens.ts` | Hash, expiry, revokedAt, IP, user-agent |
| `kyc_documents` | ✅ | `lib/db/src/schema/kyc-documents.ts` | CAC, docs, verification status |
| `seed_listings` | ✅ | `lib/db/src/schema/seed-listings.ts` | Price, quantity, location, viewCount |
| `bartar_listings` | ✅ | `lib/db/src/schema/bartar-listings.ts` | Commodity, grade, quantity, origin, destination |
| `escrow_transactions` | ✅ | `lib/db/src/schema/escrow-transactions.ts` | Platform, parties, amounts, status, breakdown |
| `ledger_entries` | ✅ | `lib/db/src/schema/ledger-entries.ts` | Account type, debit, credit, currency, description |
| `shipments` | ✅ | `lib/db/src/schema/shipments.ts` | Verification code, status, timestamps |
| `messages` | ✅ | `lib/db/src/schema/messages.ts` | TradeId, sender, receiver, content, read status |
| `trade_contracts` | ✅ | `lib/db/src/schema/trade-contracts.ts` | Terms, party signatures, PDF URL |
| `notifications` | ✅ | `lib/db/src/schema/notifications.ts` | Type, message, isRead, user reference |
| `ai_diagnostic_logs` | ✅ | `lib/db/src/schema/ai-diagnostic-logs.ts` | Disease, confidence, treatment, language |
| `admin_action_logs` | ✅ | `lib/db/src/schema/admin-action-logs.ts` | Admin ID, action, entity, changes, IP |
| `webhook_events` | ✅ | `lib/db/src/schema/webhook-events.ts` | Provider, event ID, status, raw payload |
| `logistics_providers` | ✅ | `lib/db/src/schema/logistics-providers.ts` | Company, fleet, coverage, verification |
| `educational_content` | ✅ | `lib/db/src/schema/educational-content.ts` | Title, description, contentType, language |

### Database Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ PostGIS extension not enabled | Medium | `POSTGIS_ENABLED=false`; Haversine fallback works but is slower on large datasets |
| ❌ No GiST spatial indexes | Medium | Required for performant PostGIS radial queries at scale |
| ❌ No migration history tracking | Low | Drizzle push works but no formal migration files |

---

## 3. AI DIAGNOSTIC SYSTEM

| Requirement | Status | Location |
|-------------|--------|----------|
| Image upload | ✅ | `server/src/middlewares/upload.ts` (multer) |
| MIME type + payload validation | ✅ | Upload middleware validates file type/size |
| Plant.id API integration | ✅ | `ai/index.ts:106` |
| Disease classification | ✅ | Returns disease name, confidence, treatments |
| Diagnostic log storage | ✅ | `ai/index.ts:137-154` |
| Rate limiting (3 per 10 min) | ✅ | `rate-limit.ts:40` |
| Multilingual translation (en/ha/ig/yo) | ✅ | `ai/index.ts` — translation maps for mock + Plant.id results |
| Diagnostic history (paginated) | ✅ | `GET /api/v1/ai/history` |
| Aggregated anonymous analytics | ❌ **Missing** | Logs stored but no aggregation endpoint |
| ❌ Upload error message leak | ✅ Fixed | Generic messages: "File too large (max 10MB)" / "Upload failed" |
| ❌ Hardcoded language bug | ✅ Fixed | `"en" ? "en" : "en"` → actual `lang` variable |

### AI API Endpoints

| Endpoint | Status |
|----------|--------|
| `POST /api/v1/ai/diagnose` | ✅ |
| `GET /api/v1/ai/history` | ✅ |

---

## 4. SEED PLATFORM (Marketplace)

| Requirement | Status | Location |
|-------------|--------|----------|
| Listing CRUD (create, read, update, delete) | ✅ | `seed/index.ts:44-314` |
| Authorization for listing creation (specific roles) | ✅ | `authorize(FARMER, AGRI_SUPPLIER, ...)` |
| Ownership checks on PATCH/DELETE | ✅ | `seed/index.ts:247-248` |
| Admin override on PATCH/DELETE | ✅ | `seed/index.ts:247` |
| View count increment | ✅ | `seed/index.ts:217-220` |
| Nearby geospatial search | ✅ | `seed/index.ts:93-194` (PostGIS + Haversine fallback) |
| Category filter on nearby search | ✅ | `seed/index.ts:119-121` |
| Paginated results | ✅ | `seed/index.ts:101-102` |
| Status whitelist validation on PATCH | ✅ | `VALID_SEED_STATUSES` set |
| Order placement with escrow | ✅ | `seed/index.ts:322-396` |
| Serializable isolation on escrow creation | ✅ | `seed/index.ts:390` |
| Escrow breakdown (commission, logistics, insurance) | ✅ | `financial.ts` |
| Double-entry ledger entries on deposit | ✅ | `seed/index.ts:378` |
| Shipment creation with verification code | ✅ | `seed/index.ts:382-388` |
| Delivery confirmation (PIN + verification code) | ✅ | `seed/index.ts:403-493` |
| Escrow state machine enforcement | ✅ | `seed/index.ts:436` |
| Dispute initiation | ✅ | `seed/index.ts:499-547` |
| Seller notification on escrow events | ✅ | `notifications.ts` library |
| ❌ Listing status whitelisted | ✅ Fixed | `["ACTIVE","INACTIVE","SOLD","EXPIRED","DELETED"]` |
| ❌ No type validation on price/quantity/lat/lng | Partial | Checked for presence but not numeric type |

### Seed Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ Reviews / ratings on listings | Medium | Spec mentions rating/pricing/seller profile |
| ❌ Cart / checkout flow | Medium | Spec mentions "adds items to cart" |
| ❌ Category/filter-based discovery (no cart) | Low | Can filter via `?category=` on nearby |
| ❌ Agricultural analytics endpoint | Low | Spec mentions "agricultural analytics" |
| ❌ Educational content integration | Medium | Table + schema exist, no routes serve it |
| ❌ Logistics provider assignment | Medium | Shipment created PENDING, no assignment route |
| ❌ Shipment status progression (PICKED_UP, IN_TRANSIT) | Medium | Only PENDING → DELIVERED — no intermediate states |
| ❌ Escrow release-to-seller ledger entries | Medium | `buildReleaseToSellerLedgerEntries` exists but unused |
| ❌ Refund processing ledger entries | Medium | `buildRefundLedgerEntries` exists but unused |
| ❌ Insurance payment integration | Low | Insurance fee calculated but no payment gateway invoked |

### Seed API Endpoints

| Endpoint | Status |
|----------|--------|
| `POST /api/v1/seed/listings` | ✅ |
| `GET /api/v1/seed/listings/nearby` | ✅ |
| `GET /api/v1/seed/listings/:id` | ✅ |
| `PATCH /api/v1/seed/listings/:id` | ✅ |
| `DELETE /api/v1/seed/listings/:id` | ✅ |
| `POST /api/v1/seed/orders` | ✅ |
| `POST /api/v1/seed/orders/:id/confirm-delivery` | ✅ |
| `POST /api/v1/seed/orders/:id/dispute` | ✅ |
| ❌ `GET /api/v1/seed/listings/discover` | Missing |
| ❌ `POST /api/v1/seed/listings/:id/review` | Missing |
| ❌ `PATCH /api/v1/shipments/:id/status` | Missing |
| ❌ `POST /api/v1/seed/orders/:id/refund` | Missing |

---

## 5. BARTAR PLATFORM (Commodity Exchange)

| Requirement | Status | Location |
|-------------|--------|----------|
| KYC submission (CAC, docs) | ✅ | `bartar/index.ts:34-89` |
| KYC status check | ✅ | `bartar/index.ts:91-113` |
| KYC state machine (UNVERIFIED → APPROVED/REJECTED) | ✅ | Status transitions enforced in admin |
| KYC gate on listing creation (EXPORTER) | ✅ | `bartar/index.ts:120-127` |
| Listing CRUD (commodity, grade, quantity, etc.) | ✅ | `bartar/index.ts:115-316` |
| Ownership checks + admin override | ✅ | `bartar/index.ts:237-256, 289-308` |
| Whitelist for PATCH fields | ✅ | `bartar/index.ts:263-270` |
| Escrow creation with breakdown | ✅ | `bartar/index.ts:319-402` |
| KYC gate on escrow creation (IMPORTER) | ✅ | `bartar/index.ts:347-354` |
| Escrow confirmation (delivery) | ✅ | `bartar/index.ts:432-489` |
| Contract generation | ✅ | `bartar/index.ts:531-573` |
| Contract signing with PIN | ✅ | `bartar/index.ts:576-650` |
| Terms min length validation | ✅ | 50 chars for contract, 20 for dispute |

### Bartar Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ PDF contract file generation | Medium | Contract stored in DB only, `contentUrl` is generated but no file written |
| ❌ Trade negotiation / counter-offer flow | Medium | Spec mentions price/shipping/terms negotiation |
| ❌ Batch listing import | Low | Bartar handles bulk trade but no CSV/import |
| ❌ Export/import analytics | Low | No trade volume/trend endpoints |
| ❌ Government API integration for KYC (CAC verification) | Medium | CAC number accepted but not verified against any registry |
| ❌ Shipping document upload (Bill of Lading, SGS cert) | Medium | Spec mentions these verification steps |
| ❌ Inspection milestone tracking | Low | Spec mentions "inspection milestones" |

### Bartar API Endpoints

| Endpoint | Status |
|----------|--------|
| `POST /api/v1/bartar/kyc` | ✅ |
| `GET /api/v1/bartar/kyc/status` | ✅ |
| `POST /api/v1/bartar/listings` | ✅ |
| `GET /api/v1/bartar/listings` | ✅ |
| `GET /api/v1/bartar/listings/:id` | ✅ |
| `PATCH /api/v1/bartar/listings/:id` | ✅ |
| `DELETE /api/v1/bartar/listings/:id` | ✅ |
| `POST /api/v1/bartar/escrow` | ✅ |
| `GET /api/v1/bartar/escrow/:id` | ✅ |
| `POST /api/v1/bartar/escrow/:id/confirm` | ✅ |
| ❌ `POST /api/v1/bartar/escrow/:id/refund` | Missing |
| ❌ `POST /api/v1/bartar/contracts/:id/pdf` | Missing |
| ❌ `GET /api/v1/bartar/analytics` | Missing |

---

## 6. ADMIN PLATFORM (Governance)

| Requirement | Status | Location |
|-------------|--------|----------|
| KYC list (paginated, filterable) | ✅ | `admin/index.ts:34-70` |
| KYC status update (APPROVED/REJECTED/UNDER_REVIEW) | ✅ | `admin/index.ts:71-119` |
| Escrow arbitration (decision + notes) | ✅ | `admin/index.ts:120-190` |
| User suspension | ✅ | `admin/index.ts:318-363` |
| Audit log viewing (paginated, filterable) | ✅ | `admin/index.ts:191-282` |
| Admin action logging middleware | ✅ | `server/src/middlewares/admin-log.ts` |
| Role guards (SUPER_ADMIN, ADMIN_MODERATOR) | ✅ | `admin/index.ts:28` |

### Admin Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ Dashboard analytics/stats endpoint | Medium | No `GET /api/v1/admin/stats` |
| ❌ Activity/usage reports | Low | |
| ❌ Fraud detection heuristics | Medium | Spec mentions "fraud detection" |
| ❌ Admin user creation/deletion | Low | Can suspend but not create/delete |
| ❌ Export audit logs (CSV/PDF) | Low | |

### Admin API Endpoints

| Endpoint | Status |
|----------|--------|
| `GET /api/v1/admin/kyc` | ✅ |
| `PATCH /api/v1/admin/kyc/:id/status` | ✅ |
| `POST /api/v1/admin/escrow/:id/arbitrate` | ✅ |
| `GET /api/v1/admin/logs` | ✅ |
| `PATCH /api/v1/admin/users/:id/suspend` | ✅ |
| ❌ `GET /api/v1/admin/stats` | Missing |
| ❌ `GET /api/v1/admin/users` | Missing |

---

## 7. FINANCIAL & ESCROW SYSTEM

| Requirement | Status | Location |
|-------------|--------|----------|
| Escrow state machine (7 states) | ✅ | `server/src/lib/escrow.ts` |
| Transition validation | ✅ | `validateEscrowTransition()` |
| Terminal status enforcement | ✅ | `isTerminalStatus()` |
| Platform commission (5%) | ✅ | `financial.ts` |
| Logistics fee (2%) | ✅ | `financial.ts` |
| Insurance fee (₦500 flat) | ✅ | `financial.ts` |
| Net seller payout calculation | ✅ | `financial.ts` |
| Double-entry ledger on deposit | ✅ | `buildDepositLedgerEntries()` |
| Double-entry ledger on release | ✅ | `buildReleaseToSellerLedgerEntries()` |
| Double-entry ledger on refund | ✅ | `buildRefundLedgerEntries()` |
| Ledger balance validation | ✅ | `validateLedgerBalance()` |
| Serializable isolation on critical tx | ✅ | `seed/index.ts:390` |
| Webhook deduplication (webhook_events table) | ✅ | `webhooks/index.ts` |

### Financial Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ Escrow release route (release to seller) | Medium | Logic exists but no endpoint calls it |
| ❌ Refund processing route | Medium | Logic exists but no endpoint calls it |
| ❌ Payout to seller via Paystack Transfer API | Medium | No payout integration |
| ❌ Transaction history for user | Low | Ledger entries stored but no user-facing endpoint |

---

## 8. PAYMENT WEBHOOKS

| Requirement | Status | Location |
|-------------|--------|----------|
| Paystack webhook reception | ✅ | `webhooks/index.ts:85-170` |
| Paystack HMAC signature verification | ✅ | `timingSafeEqual` comparison |
| Flutterwave webhook reception | ✅ | `webhooks/index.ts:171-240` |
| Flutterwave `verif-hash` header check | ✅ | `webhooks/index.ts:214-217` |
| Raw body capture for signature verification | ✅ | `app.ts:71-73` |
| Idempotency via `webhook_events` table | ✅ | `webhooks/index.ts:95-112` |
| Escrow state update on payment success | ✅ | `processPaymentSuccess()` |
| Notification dispatch on webhook events | ✅ | Notification triggers |
| ❌ Mobile money / USSD / bank transfer webhooks | ❌ **Missing** | Only Paystack + Flutterwave implemented |
| ❌ Webhook retry logic | Low | Failures logged but not retried |

---

## 9. MESSAGING & NOTIFICATIONS

| Requirement | Status | Location |
|-------------|--------|----------|
| WebSocket server | ✅ | `server/src/lib/ws.ts` |
| Trade-specific chat rooms | ✅ | `ws.ts` — room per trade |
| Message pagination | ✅ | `messages/index.ts:16-53` |
| Read receipts | ✅ | `messages/index.ts:60-83` |
| Real-time read receipt push | ✅ | `pushReadReceipt()` |
| Unread count | ✅ | `messages/index.ts:90-107` |
| Notifications list (paginated) | ✅ | `notifications/index.ts:11-46` |
| Mark single notification read | ✅ | `notifications/index.ts:49-81` |
| Mark all notifications read | ✅ | `notifications/index.ts:85-107` |
| Escrow event notifications | ✅ | `notifications.ts` library |
| ❌ Negative `limit` value bug | ✅ Fixed | `Math.max(1, Math.min(...))` |
| ❌ Invalid `before` date crash | ✅ Fixed | Returns 400 instead of 500 |

---

## 10. SECURITY

| Requirement | Status | Location |
|-------------|--------|----------|
| Helmet security headers | ✅ | `app.ts:16-28` |
| CSP configuration | ✅ | `app.ts:19-25` |
| CORS with allowed origins | ✅ | `app.ts:31-42` |
| JWT access tokens (15-min expiry) | ✅ | `auth.ts` |
| JWT refresh tokens (7-day rotation) | ✅ | `auth.ts` |
| bcrypt password hashing | ✅ | `crypto.ts` |
| OTP hashing (SHA-256) | ✅ | `crypto.ts` |
| Transaction PIN hashing (bcrypt) | ✅ | `crypto.ts` |
| General rate limiter (100/60s) | ✅ | `rate-limit.ts:6` |
| Auth rate limiter (5/5min) | ✅ | `rate-limit.ts:18` |
| OTP rate limiter (3/5min) | ✅ | `rate-limit.ts:29` |
| AI rate limiter (3/10min) | ✅ | `rate-limit.ts:40` |
| Webhook rate limiter (300/60s) | ✅ | `rate-limit.ts:51` |
| Refresh token rate limiter (10/15min) | ✅ | `rate-limit.ts:57` |
| Input sanitization (XSS) | ✅ | `server/src/middlewares/sanitize.ts` |
| Device fingerprint | ✅ | `server/src/middlewares/device-fp.ts` |
| CSRF cookie + verification | ✅ | `server/src/middlewares/csrf.ts` |
| Custom rate-limit store (in-memory + optional Redis) | ✅ | `server/src/lib/rate-limit-store.ts` |
| Raw body capture for webhooks | ✅ | `app.ts:71-73` |
| IP tracking on auth | ✅ | `auth/index.ts` |
| IP tracking on admin actions | ✅ | `admin-log.ts` |

### Security Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ❌ Per-route rate limiters on all non-auth endpoints | **High** | Admin, seed, bartar, users, messages, notifications: only global 100/min |
| ❌ Account lockout after N failed login attempts | Medium | Rate limiting only, no permanent lockout |
| ❌ Password complexity (uppercase, digit, special char) | Low | Only min 8 chars |
| ❌ Global session blacklist / force-logout-all | Low | Logout revokes single token |
| ❌ Biometric verification (spec §17) | Low | Not implemented |
| ❌ Government API verification for KYC | Medium | No CAC/identity verification API integration |
| ❌ AES-256 at-rest encryption for sensitive fields | Low | DB-level encryption not configured |
| ❌ Rate limit on password reset flow | Low | No password reset endpoint exists |

---

## 11. INFRASTRUCTURE & DEVOPS

| Requirement | Status |
|-------------|--------|
| Node.js TypeScript | ✅ |
| PostgreSQL database | ✅ |
| ❌ Dockerfile | Missing |
| ❌ docker-compose.yml | Missing |
| ❌ CI/CD pipeline (GitHub Actions) | Missing |
| ❌ Nginx reverse proxy config | Missing |
| ❌ PM2 process manager config | Missing |
| ❌ Sentry error monitoring | Missing — Pino logging only |
| ❌ Supabase Storage integration | Missing — files saved to local `/uploads/` |
| ❌ CDN configuration | Missing |
| ❌ Prometheus metrics endpoint | Missing |
| ❌ Uptime monitoring configuration | Missing |
| ❌ Deployment runbook beyond env vars | Missing — spec §20 has detailed steps not followed |
| ❌ Redis (actually running) | Missing — optional code support, not deployed |

---

## 12. ORPHANED RESOURCES (Tables with no routes)

| Table | Routes | Impact |
|-------|--------|--------|
| `educational_content` | ❌ None | No CRUD endpoints for educational content |
| `logistics_providers` | ❌ None | No registration or management endpoints |

---

## 13. WEB FRONTEND (Reference Only — Not Spec-Mandated)

The `web/` workspace has 22 page files and ~60 UI components. Pages observed:

| Page | Status |
|------|--------|
| Auth (login, register) | ✅ Route present |
| Seed (index, detail, new, order) | ✅ Routes present |
| Bartar (index, detail, new, kyc, escrow) | ✅ Routes present |
| AI diagnose | ✅ Route present |
| Admin (kyc, logs, users) | ✅ Routes present |
| Messages (index, chat) | ✅ Routes present |
| Notifications | ✅ Route present |
| Profile | ✅ Route present |
| Dashboard | ✅ Route present |
| Home | ✅ Route present |
| Not found | ✅ Route present |

*Note: Some pages may be UI shells without full API integration.*

---

## 14. PRIORITIZED REMAINING WORK

### Critical (0 items)
All critical issues resolved.

### High
| # | Item | Effort |
|---|------|--------|
| 1 | Per-route rate limiters on admin, seed, bartar, users, messages, notifications endpoints | Small |
| 2 | Logistics provider registration + assignment routes | Medium |
| 3 | Escrow release-to-seller endpoint (use existing `buildReleaseToSellerLedgerEntries`) | Small |
| 4 | Refund processing endpoint (use existing `buildRefundLedgerEntries`) | Small |
| 5 | Educational content CRUD routes | Medium |

### Medium
| # | Item | Effort |
|---|------|--------|
| 6 | Shipment status progression (PICKED_UP, IN_TRANSIT) with notifications | Medium |
| 7 | Reviews/ratings for seed listings | Medium |
| 8 | Contract PDF file generation | Medium |
| 9 | Admin analytics/stats dashboard endpoint | Medium |
| 10 | Government API integration for KYC (CAC verification) | Large |
| 11 | Account lockout after failed login attempts | Small |
| 12 | PostGIS + GiST index enablement | Small |
| 13 | Cart/checkout flow for seed marketplace | Medium |
| 14 | Docker + docker-compose setup | Medium |
| 15 | CI/CD pipeline (GitHub Actions) | Medium |
| 16 | Trade negotiation / counter-offer endpoints | Medium |

### Low
| # | Item | Effort |
|---|------|--------|
| 17 | Agricultural / trade analytics aggregation | Medium |
| 18 | Shipment document upload (Bill of Lading, SGS certs) | Medium |
| 19 | Batch listing import for Bartar | Medium |
| 20 | Password complexity requirements | Small |
| 21 | CSV/PDF export for audit logs | Small |
| 22 | Sentry error monitoring integration | Small |
| 23 | Prometheus metrics endpoint | Small |
| 24 | Deployment runbook documentation | Small |
| 25 | Mobile money / USSD webhook endpoints | Medium |
