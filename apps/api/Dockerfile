# FIT System - API (Fastify + Prisma) con PostgreSQL.
# Contexto de build: la RAIZ del monorepo (necesita workspaces pnpm).
#   docker build -f apps/api/Dockerfile -t fitsystem-api .
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Todo el monorepo (node_modules/dist/.env quedan fuera via .dockerignore).
COPY . .

RUN pnpm install --frozen-lockfile --prod=false \
    && pnpm --filter @fitsystem/api prisma:generate:pg \
    && pnpm --filter @fitsystem/api build

EXPOSE 3001

# Aplica el esquema a Postgres y arranca la API.
CMD ["sh", "-lc", "pnpm --filter @fitsystem/api db:push:pg && pnpm --filter @fitsystem/api start"]
