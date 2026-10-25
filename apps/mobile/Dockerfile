# FIT System - App del socio (PWA). Etapa 1: export de Expo a web.
# Contexto de build: la RAIZ del monorepo (necesita workspaces pnpm).
#   docker build -f apps/mobile/Dockerfile --build-arg EXPO_PUBLIC_API_URL=https://api.ejemplo.com -t fitsystem-socios .
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production

# EXPO_PUBLIC_* se incrusta en el bundle: hay que pasarla como build-arg.
ARG EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY . .

# Limita el heap de V8 solo durante el build: en el VPS (2 GB) el export de Expo
# puede quedarse sin memoria y dejar el contenedor viejo sin actualizar.
RUN pnpm install --filter @fitsystem/mobile... --frozen-lockfile --prod=false \
    && NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @fitsystem/mobile build:web

# Etapa 2: servir el export estatico. Los headers de seguridad los agrega Caddy.
FROM nginx:1.27-alpine

COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
