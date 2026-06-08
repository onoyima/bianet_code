# Bia'net Platform

Enterprise-grade backend for the Bia'net ecosystem — a Nigerian agritech and commodity exchange platform powering the **Seed marketplace** (farmers/consumers/traders) and **Bartar commodity trade** (exporters/importers), with a full admin governance layer.

## Features

- **Seed Platform** — AI crop disease diagnosis, geospatial produce discovery, escrow-backed transactions, delivery verification, dispute resolution
- **Bartar Platform** — KYC verification pipeline, commodity listings (sesame, ginger, cocoa, cashew, etc.), escrow trade settlement, international shipment verification
- **Admin Platform** — KYC moderation dashboard, escrow arbitration, user management, immutable audit logging, fraud detection
- **Real-time Messaging** — WebSocket-based chat with per-trade rooms, read receipts, typing indicators
- **Contract-first API** — OpenAPI 3.1 spec drives code generation (Zod schemas, React Query hooks)
- **Escrow State Machine** — Explicit transition table, double-entry ledger, immutable logs
- **Geospatial Search** — Haversine formula (no PostGIS required), with optional PostGIS fallback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+, TypeScript 5.9 |
| **Package Manager** | npm 10+ (workspaces) |
| **API** | Express 5 |
| **Database** | PostgreSQL 15+ with Drizzle ORM |
| **Validation** | Zod + drizzle-zod |
| **API Codegen** | Orval (OpenAPI → Zod + TanStack Query hooks) |
| **Build** | esbuild (API), Vite (web) |
| **Auth** | JWT (HS256), bcryptjs, OTP via Twilio |
| **Payments** | Paystack, Flutterwave |
| **AI** | Plant.id API |
| **Container** | Docker + docker-compose (postgis/postgres) |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env

# 3. Generate JWT secrets (run twice, paste into .env)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Push DB schema (first time only)
npm run -w lib/db push

# 5. Run the API server
npm run -w server dev

# 6. Run the web app (another terminal, needs PORT + BASE_PATH)
PORT=5173 BASE_PATH=/ npm run -w web dev
```

Test the API:
```bash
curl http://localhost:8080/api/healthz
# → {"status":"ok"}
```

## Prerequisites

- **Node.js 20+**
- **npm 10+** (ships with Node.js)
- **PostgreSQL 15+** (or use the docker-compose setup)

## Project Structure

```
├── server/                  ← Express API server (port 8080)
│   ├── src/lib/             ← Auth, crypto, SMS, geo, escrow, notifications
│   ├── src/middlewares/     ← authenticate, authorize, rate-limit, admin-log, upload
│   └── src/routes/v1/       ← auth, seed, bartar, admin, ai, messages, notifications, webhooks
├── web/                     ← React + Vite frontend (port 5173)
│   └── src/                 ← shadcn/ui components, pages, hooks
├── mobile/                  ← UI sandbox for prototyping
├── lib/
│   ├── db/                  ← Drizzle ORM schemas (17 tables) + migrations
│   │   └── src/schema/      ← One file per domain (users, seed, bartar, escrow, etc.)
│   ├── api-spec/            ← OpenAPI 3.1 spec + Orval codegen config
│   ├── api-zod/             ← Generated Zod validation schemas
│   └── api-client-react/    ← Generated TanStack Query hooks
├── scripts/                 ← Utility scripts (tsx)
├── Dockerfile               ← Multi-stage production build
├── docker-compose.yml       ← API + PostGIS Postgres
├── .npmrc                   ← legacy-peer-deps=true
└── tsconfig.json            ← Root TypeScript config (project references)
```

## Available Scripts

### Root Workspace

| Script | Description |
|--------|-------------|
| `npm run typecheck` | TypeScript check across all packages |
| `npm run build` | Typecheck + build API server |
| `npm run build:web` | Build web frontend (needs `PORT` + `BASE_PATH` env) |
| `npm run build:sandbox` | Build mockup sandbox (needs `PORT` + `BASE_PATH` env) |
| `npm run typecheck:libs` | TypeScript check for shared libraries |

### Per-Package (use `npm run -w <path>`)

| Package | Script | Description |
|---------|--------|-------------|
| `server` | `npm run -w server dev` | Start API dev server |
| `server` | `npm run -w server build` | Build API bundle (esbuild) |
| `web` | `PORT=5173 BASE_PATH=/ npm run -w web dev` | Start Vite dev server |
| `web` | `PORT=5173 BASE_PATH=/ npm run -w web build` | Build web bundle |
| `mobile` | `PORT=3001 BASE_PATH=/ npm run -w mobile dev` | Start mobile dev server |
| `lib/db` | `npm run -w lib/db push` | Push Drizzle schema to DB |
| `lib/db` | `npm run -w lib/db generate` | Generate Drizzle migrations |
| `lib/api-spec` | `npm run -w lib/api-spec codegen` | Regenerate code from OpenAPI spec |

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Full Postgres connection string |
| `JWT_SECRET` | ✅ | 64-byte hex for access token signing |
| `JWT_REFRESH_SECRET` | ✅ | 64-byte hex for refresh token signing |
| `PORT` | ✅ | API server port (default: 8080) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `ALLOWED_ORIGINS` | No | CORS origins |
| `TWILIO_ACCOUNT_SID` | No | Twilio SMS sender |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | Twilio sender phone number |
| `PAYSTACK_SECRET_KEY` | No | Paystack webhook verification |
| `FLUTTERWAVE_SECRET_KEY` | No | Flutterwave webhook verification |
| `PLANT_ID_API_KEY` | No | AI crop diagnosis |
| `POSTGIS_ENABLED` | No | Set `true` for PostGIS spatial queries |
| `REDIS_URL` | No | Redis for caching/rate-limiting |
| `LOG_LEVEL` | No | `trace`, `debug`, `info`, `warn`, `error` |

## Development

### TypeScript & Codegen

```bash
# Full typecheck across all packages
npm run typecheck

# Regenerate API hooks + Zod schemas (after editing openapi.yaml)
npm run -w lib/api-spec codegen

# Build all packages
npm run build
```

### Database Schema

```bash
# Push schema changes to the database (dev)
npm run -w lib/db push

# Generate migration files
npm run -w lib/db generate
```

### Running Services

Use separate terminals:

```bash
# Terminal 1: API
npm run -w server dev

# Terminal 2: Web (requires PORT + BASE_PATH env vars)
PORT=5173 BASE_PATH=/ npm run -w web dev
```

### WebSocket (Real-time Messaging)

```
ws://localhost:8080/api/ws?token=<JWT_ACCESS_TOKEN>
```

Test with [wscat](https://github.com/websockets/wscat):
```bash
npx wscat -c "ws://localhost:8080/api/ws?token=YOUR_TOKEN"
```

## Docker Deployment

```bash
# Start both API and PostGIS database
docker-compose up --build

# Or build the API image separately
docker build -t bianet-api .
docker run -p 8080:8080 --env-file .env bianet-api
```

The docker-compose provides:
- `api` — Node.js API server (port 8080, connects to PostGIS)
- `db` — PostgreSQL 16 with PostGIS 3.4 (port 5432, persistent volume)

## API Overview

### Authentication
```
POST /api/v1/auth/otp/send         — Send OTP
POST /api/v1/auth/register         — Register
POST /api/v1/auth/login            — Login
POST /api/v1/auth/refresh          — Refresh tokens
POST /api/v1/auth/logout           — Logout
```

### Seed Marketplace
```
POST   /api/v1/seed/listings         — Create listing
GET    /api/v1/seed/listings/nearby  — Geospatial search
GET    /api/v1/seed/listings/:id     — Get listing
PATCH  /api/v1/seed/listings/:id     — Update listing
DELETE /api/v1/seed/listings/:id     — Delete listing
POST   /api/v1/seed/orders           — Place order (init escrow)
POST   /api/v1/seed/orders/:id/confirm-delivery  — Release escrow
POST   /api/v1/seed/orders/:id/dispute           — Raise dispute
```

### Bartar Commodity Trade
```
POST  /api/v1/bartar/kyc            — Submit KYC
GET   /api/v1/bartar/kyc/status     — KYC status
POST  /api/v1/bartar/listings       — Create commodity listing
GET   /api/v1/bartar/listings       — List commodity listings
POST  /api/v1/bartar/escrow         — Init trade escrow
POST  /api/v1/bartar/escrow/:id/confirm  — Confirm + release
POST  /api/v1/bartar/contracts      — Generate trade contract
POST  /api/v1/bartar/contracts/:id/sign  — Sign contract
```

### Admin
```
GET    /api/v1/admin/kyc                  — List KYC submissions
PATCH  /api/v1/admin/kyc/:id/status       — Approve/reject KYC
POST   /api/v1/admin/escrow/:id/arbitrate — Arbitrate dispute
GET    /api/v1/admin/logs                 — Audit logs
GET    /api/v1/admin/users                — List users
PATCH  /api/v1/admin/users/:id/suspend    — Suspend/restore user
```

### Other Endpoints
```
POST  /api/v1/ai/diagnose     — AI crop diagnosis
GET   /api/v1/notifications   — Get notifications
GET   /api/v1/messages/:tradeId — Message history
WS    /api/ws                 — WebSocket connection
POST  /api/v1/webhooks/paystack    — Paystack webhook
POST  /api/v1/webhooks/flutterwave — Flutterwave webhook
GET   /api/healthz            — Health check
```

### Rate Limiting

| Route Group | Limit |
|-------------|-------|
| General | 100 requests/min |
| Auth | 5 requests/5min |
| OTP | 3 requests/5min |
| AI Diagnosis | 3 requests/10min |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `DATABASE_URL` not set | Copy `.env.example` to `.env` and fill in |
| `ECONNREFUSED` on DB | Check DB is running and `DATABASE_URL` is correct |
| Schema out of sync | Run `npm run -w lib/db push` |
| Codegen type errors | Run `npm run -w lib/api-spec codegen` |
| Web build: `PORT` / `BASE_PATH` required | Set both env vars: `PORT=3000 BASE_PATH=/` |
| Neon SSL error | Append `?sslmode=require` to `DATABASE_URL` |
| `npm install` fails | Ensure `.npmrc` has `legacy-peer-deps=true`; try `npm cache clean --force` first |

## Architecture Decisions

- **Contract-first API**: OpenAPI spec defines all contracts; Zod schemas and React Query hooks auto-generated via Orval
- **Escrow state machine**: Explicit transition table prevents invalid state changes; all transitions logged immutably
- **Double-entry ledger**: Every escrow deposit creates balanced ledger entries (debit/credit always balanced)
- **Webhook idempotency**: All external webhooks checked against `webhook_events` table before processing
- **Haversine geospatial search**: Nearby produce listings use bounding-box pre-filter + Haversine distance (PostGIS optional)
- **Security**: Helmet headers + per-endpoint rate limiting + RBAC guards on protected routes
- **Serializable isolation**: Financial transactions use `SERIALIZABLE` isolation level to prevent race conditions
