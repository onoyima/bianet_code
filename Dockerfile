FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY server/package.json server/
COPY scripts/package.json scripts/
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
ENV NODE_ENV=production
USER appuser
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
