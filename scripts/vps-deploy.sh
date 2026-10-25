#!/usr/bin/env bash
# Build y deploy en el VPS de produccion. Lo lanza .github/workflows/deploy-vps.yml
# por SSH, dentro del propio VPS.
#
# El VPS tiene solo 2 GB de RAM: NO se pueden compilar las imagenes en paralelo
# (el build de Next muere por falta de memoria, exit 137). Por eso se paran los
# servicios de la app y se construye UNA imagen por vez.
set -e

cd /opt/fitsystem

git fetch --prune origin main
git reset --hard origin/main

# La cache de build de Docker crece en cada despliegue y puede llenar el disco
# del VPS (30 GB): se poda antes de construir. Si el disco igual esta ajustado,
# se hace una poda total.
docker builder prune -af --filter "until=24h" >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
used=$(df --output=pcent / | tail -1 | tr -dc "0-9")
if [ "${used:-0}" -ge 75 ]; then docker builder prune -af >/dev/null 2>&1 || true; fi

# Liberar memoria antes de compilar.
docker compose -f docker-compose.prod.yml stop web api socios licensador >/dev/null 2>&1 || true

for svc in api web socios licensador; do
  echo "=== build $svc ==="
  if [ "$svc" = "web" ]; then
    # Las rutas de Next.js se generan en build; no reutilizar una imagen web
    # anterior o el deploy puede terminar sin publicar páginas nuevas.
    COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build --no-cache web
  else
    COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build "$svc"
  fi
done

docker compose -f docker-compose.prod.yml up -d
docker image prune -f >/dev/null 2>&1 || true
docker compose -f docker-compose.prod.yml ps

for svc in api web; do
  if [ -z "$(docker compose -f docker-compose.prod.yml ps --status running -q "$svc")" ]; then
    echo "=== error: $svc no quedó ejecutándose ===" >&2
    docker compose -f docker-compose.prod.yml logs --tail=120 "$svc" >&2 || true
    exit 1
  fi
done
echo "=== deploy ok ==="
