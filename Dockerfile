# ---- deps & build ----
FROM oven/bun:1.3-slim AS build
WORKDIR /app

# OpenSSL for Prisma engines
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
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
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
