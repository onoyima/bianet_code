# Bia'net Platform — Configuration & Local Development Guide

## Prerequisites

- **Node.js 20+**
- **pnpm 10+** — `npm install -g pnpm`
- **PostgreSQL 15+**

---

## Step 1 — Clone & Install

```bash
git clone <your-repo-url>
cd <repo-folder>
pnpm install
```

---



## Step 3 — Create Your `.env` File

```bash
cp .env.example .env
```

Then fill in the values from Step 2. At minimum you need:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bianet
JWT_SECRET=<generate-below>
JWT_REFRESH_SECRET=<generate-below>
NODE_ENV=development
LOG_LEVEL=info
PORT=8080
```

### Generate JWT secrets locally

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET
```

---

## Step 4 — Push the DB Schema (first time only)

The schema is managed by Drizzle ORM. If the tables don't exist yet in your database:

```bash
pnpm --filter @workspace/db run push
```

This is safe to run repeatedly — it only applies missing changes.

---

## Step 5 — Run the API Server

```bash
npm run -w server dev
```

The API will start on `http://localhost:8080`.

Test it:
```bash
curl http://localhost:8080/api/healthz
# → {"status":"ok"}
```

---

## Step 6 — Run the Web App

```bash
npm run -w web dev
```

The frontend will start on `http://localhost:5173` (or whichever port Vite assigns).

---

## Environment Variables Reference

| Variable              | Required | Description                                        |
|-----------------------|----------|----------------------------------------------------|
| `DATABASE_URL`        | ✅ Yes   | Full Postgres connection string                    |
| `JWT_SECRET`          | ✅ Yes   | 64-byte hex string for access token signing        |
| `JWT_REFRESH_SECRET`  | ✅ Yes   | 64-byte hex string for refresh token signing       |
| `PORT`                | ✅ Yes   | Port for the API server (default `8080`)           |
| `NODE_ENV`            | ✅ Yes   | `development` or `production`                      |
| `LOG_LEVEL`           | No       | `trace`, `debug`, `info`, `warn`, `error`          |
| `ALLOWED_ORIGINS`     | No       | Comma-separated CORS origins (default: all)        |
| `PAYSTACK_SECRET_KEY` | No       | Paystack secret key for webhook verification       |
| `FLUTTERWAVE_SECRET_KEY` | No    | Flutterwave secret key for webhook verification    |
| `PLANT_ID_API_KEY`    | No       | Plant.id API key for AI crop diagnosis             |
| `SESSION_SECRET`      | No       | Session cookie secret                              |

---

## TypeScript & Codegen

```bash
# Full typecheck
pnpm run typecheck

# Regenerate API hooks + Zod schemas (after editing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Build all packages
pnpm run build
```

---

## Project Structure

```
server/               ← Express API server (port 8080)
web/                  ← React + Vite web app (port 5173)
mobile/               ← Mobile sandbox
lib/
  db/                 ← Drizzle ORM schema + migrations
  api-spec/           ← OpenAPI 3.1 spec + Orval codegen config
  api-zod/            ← Generated Zod validation schemas
  api-client-react/   ← Generated React Query hooks
scripts/              ← Utility scripts
```

---

## WebSocket (Real-time Messaging)

The API exposes a WebSocket endpoint:

```
ws://localhost:8080/api/ws?token=<JWT_ACCESS_TOKEN>
```

Test with [wscat](https://github.com/websockets/wscat):
```bash
npx wscat -c "ws://localhost:8080/api/ws?token=YOUR_TOKEN"
> {"type":"join","tradeId":"YOUR_TRADE_ID"}
> {"type":"message","tradeId":"YOUR_TRADE_ID","content":"Hello!"}
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on DB | Check `DATABASE_URL` is correct and DB is accessible |
| `JWT_SECRET not set` | Add `JWT_SECRET` and `JWT_REFRESH_SECRET` to `.env` |
| Schema out of sync | Run `pnpm --filter @workspace/db run push` |
| Codegen type errors | Run `pnpm --filter @workspace/api-spec run codegen` |
| Neon SSL error | Append `?sslmode=require` to `DATABASE_URL` |
