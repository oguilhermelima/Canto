FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Install dependencies ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/providers/package.json ./packages/providers/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/
COPY tooling/eslint/package.json ./tooling/eslint/
COPY tooling/prettier/package.json ./tooling/prettier/
COPY tooling/tailwind/package.json ./tooling/tailwind/
COPY tooling/typescript/package.json ./tooling/typescript/
# BuildKit cache mount: pnpm content-addressable store survives across
# builds, so unchanged dependencies skip the network entirely. Default
# store on Linux for the root user is /root/.local/share/pnpm/store.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ──
FROM deps AS builder
COPY . .
ENV SKIP_ENV_VALIDATION=true
# BuildKit cache mount on Turbo's local cache. Persists task outputs
# (Next build, package transpiles) across builds — unchanged inputs hit
# the cache and skip recomputation.
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm run build

# ── Production runner ──
FROM base AS runner
ENV NODE_ENV=production

# Bun runs the worker (native TS, no transpile cost in prod). Web still runs
# on Node via Next standalone — both binaries live in the same image.
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/.npmrc ./

# Web standalone + static
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Worker source + tsconfig (Bun executes TS directly with bundler-style
# resolution, so we keep .ts source and skip the tsc emit step) plus its
# pnpm workspace node_modules (symlinks into the .pnpm store).
COPY --from=builder /app/apps/worker/src ./apps/worker/src
COPY --from=builder /app/apps/worker/tsconfig.json ./apps/worker/
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

# Shared packages (needed at runtime by worker) + root node_modules (pnpm .pnpm store)
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
