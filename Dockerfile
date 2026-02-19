# ─── Stage 1: Build ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo structure
COPY package.json ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
COPY config/ config/

# Install dependencies
RUN cd apps/web && npm install --production=false

# Copy source
COPY apps/web/ apps/web/

# Build Next.js standalone
RUN cd apps/web && npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Data + config + manifests will be mounted as volumes:
#   /app/data       → canonical CMD data (NDJSON, JSON)
#   /app/config     → method_registry.lock.json etc
#   /app/manifests  → evidence manifests + hashes
RUN mkdir -p /app/data /app/config /app/manifests

USER nextjs

EXPOSE 3000

# standalone server.js is at /app/apps/web/server.js
CMD ["node", "apps/web/server.js"]
