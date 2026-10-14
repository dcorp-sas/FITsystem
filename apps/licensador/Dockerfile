# FIT System - Licensador (servicio de licencias del proveedor).
# Requiere Node.js 22.5+ (módulo node:sqlite). Sin dependencias externas.
# Contexto de build: apps/licensador
#   docker build -f apps/licensador/Dockerfile -t fitsystem-licensador .
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=1 \
    LICENSADOR_DATA=/app/data

WORKDIR /app

COPY . .

# El disco del contenedor es efímero salvo que se monte un volumen en /app/data.
VOLUME ["/app/data"]

EXPOSE 3000

# Requiere LICENSE_PRIVATE_KEY (Ed25519) o LICENSE_SECRET, y ADMIN_PASS.
CMD ["node", "server.js"]
