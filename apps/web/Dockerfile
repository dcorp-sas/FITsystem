# FIT System - Web (Next.js, landing + panel).
# Contexto de build: la RAIZ del monorepo (necesita workspaces pnpm).
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com -t fitsystem-web .
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production \
    PORT=3000

# Las variables NEXT_PUBLIC_* se incrustan en el build: hay que pasarlas como build-args.
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_SOCIOS_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCIOS_URL=$NEXT_PUBLIC_SOCIOS_URL

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY . .

# Limita el heap de V8 solo durante el build: en el VPS (2 GB) el build de
# Next.js puede quedarse sin memoria y dejar el contenedor viejo sin actualizar.
RUN pnpm install --frozen-lockfile --prod=false \
    && NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @fitsystem/web build

EXPOSE 3000

CMD ["sh", "-lc", "pnpm --filter @fitsystem/web exec next start -p ${PORT:-3000}"]
