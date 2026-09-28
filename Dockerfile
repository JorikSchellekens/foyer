# ---- deps & build ----
FROM oven/bun:1.3-slim AS build
WORKDIR /app

# OpenSSL for Prisma engines
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY prisma ./prisma
# Retried: Coolify builds intermittently fail with "Fail extracting tarball
# for next" (a truncated download), which a second attempt gets past
RUN for i in 1 2 3 4; do bun install --frozen-lockfile && exit 0; \
      echo "bun install failed (attempt $i), retrying"; rm -rf node_modules; sleep 5; done; exit 1
RUN bunx prisma generate

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so the build never needs live services
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-secret"
RUN bun run build

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# Full node_modules so the Prisma CLI has all its transitive deps at runtime
# for `migrate deploy`; the standalone server ignores what it doesn't use.
COPY --from=build /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
