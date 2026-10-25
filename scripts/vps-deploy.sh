#!/usr/bin/env bash
# Deploy de producción con rollback de imágenes y builds solo para servicios modificados.
set -Eeuo pipefail
cd /opt/fitsystem

git fetch --prune origin main
git reset --hard origin/main

# Primera ejecución: última versión que completó un deploy correctamente.
BASE_SHA="$(cat /opt/fitsystem/.deployed_sha 2>/dev/null || echo d15eb22510ec919b02e2f8108bba764bb8a61500)"
if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  BASE_SHA="$(git rev-parse HEAD^)"
fi
CURRENT_SHA="$(git rev-parse HEAD)"
CHANGED="$(git diff --name-only "$BASE_SHA" "$CURRENT_SHA")"
echo "=== deploy ${BASE_SHA:0:7} -> ${CURRENT_SHA:0:7} ==="
printf '%s\n' "$CHANGED"

# Un cambio de dependencias o paquetes compartidos obliga a reconstruir todo.
if printf '%s\n' "$CHANGED" | grep -Eq '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|packages/)'; then
  NEED_API=1; NEED_WEB=1; NEED_SOCIOS=1; NEED_LICENSADOR=1
else
  NEED_API=0; NEED_WEB=0; NEED_SOCIOS=0; NEED_LICENSADOR=0
  printf '%s\n' "$CHANGED" | grep -Eq '^(apps/api/)' && NEED_API=1 || true
  printf '%s\n' "$CHANGED" | grep -Eq '^(apps/web/|content/)' && NEED_WEB=1 || true
  printf '%s\n' "$CHANGED" | grep -Eq '^(apps/mobile/)' && NEED_SOCIOS=1 || true
  printf '%s\n' "$CHANGED" | grep -Eq '^(apps/licensador/)' && NEED_LICENSADOR=1 || true
fi

STAMP="$(date +%s)"
SERVICES=(api web socios licensador)

# Guardar referencias de las imágenes previas antes de compilar.
for svc in "${SERVICES[@]}"; do
  image="fitsystem-${svc}:latest"
  rollback="fitsystem-${svc}:rollback-${STAMP}"
  if docker image inspect "$image" >/dev/null 2>&1; then
    docker tag "$image" "$rollback"
    echo "Imagen de rollback guardada: $rollback"
  fi
done

restore_on_failure() {
  status=$?
  if [ "$status" -ne 0 ]; then
    trap - EXIT
    echo "=== deploy falló (exit $status); restaurando imágenes anteriores ===" >&2
    for svc in "${SERVICES[@]}"; do
      rollback="fitsystem-${svc}:rollback-${STAMP}"
      if docker image inspect "$rollback" >/dev/null 2>&1; then
        docker tag "$rollback" "fitsystem-${svc}:latest" || true
      fi
    done
    docker compose -f docker-compose.prod.yml up -d db || true
    for svc in api web socios licensador; do
      docker compose -f docker-compose.prod.yml up -d --no-deps "$svc" || true
    done
    docker compose -f docker-compose.prod.yml ps || true
    docker compose -f docker-compose.prod.yml logs --tail=80 api web socios licensador >&2 || true
  fi
  exit "$status"
}
trap restore_on_failure EXIT

docker builder prune -af --filter "until=24h" >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

if [ "$NEED_API" -eq 0 ] && [ "$NEED_WEB" -eq 0 ] && [ "$NEED_SOCIOS" -eq 0 ] && [ "$NEED_LICENSADOR" -eq 0 ]; then
  echo "=== no hay imágenes modificadas; se mantienen los servicios activos ==="
else
  # No detener la versión que está atendiendo tráfico durante la compilación.
  # Si un build falla, el trap restaura etiquetas previas y los contenedores
  # actuales siguen disponibles. Las imágenes nuevas se aplican al final.
  echo "=== se construirá en serie sin apagar la versión activa ==="
fi

if [ "$NEED_API" -eq 1 ]; then
  echo "=== build api ==="
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build api
else
  echo "=== api sin cambios; se reutiliza la imagen existente ==="
fi
if [ "$NEED_WEB" -eq 1 ]; then
  echo "=== build web ==="
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build --no-cache web
else
  echo "=== web sin cambios; se reutiliza la imagen existente ==="
fi
if [ "$NEED_SOCIOS" -eq 1 ]; then
  echo "=== build socios ==="
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build socios
else
  echo "=== socios sin cambios; se reutiliza la imagen existente ==="
fi
if [ "$NEED_LICENSADOR" -eq 1 ]; then
  echo "=== build licensador ==="
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml build licensador
else
  echo "=== licensador sin cambios; se reutiliza la imagen existente ==="
fi

# Liberar espacio de build antes de crear contenedores nuevos.
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
df -h /
docker system df || true

docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
for svc in api web socios licensador; do
  echo "=== start $svc ==="
  if ! docker compose -f docker-compose.prod.yml up -d --no-deps "$svc"; then
    docker compose -f docker-compose.prod.yml logs --tail=120 "$svc" >&2 || true
    exit 1
  fi
done

docker compose -f docker-compose.prod.yml ps
for svc in api web socios licensador; do
  if [ -z "$(docker compose -f docker-compose.prod.yml ps --status running -q "$svc")" ]; then
    echo "=== error: $svc no quedó ejecutándose ===" >&2
    docker compose -f docker-compose.prod.yml logs --tail=120 "$svc" >&2 || true
    exit 1
  fi
done

echo "$CURRENT_SHA" > /opt/fitsystem/.deployed_sha
for svc in "${SERVICES[@]}"; do
  docker image rm "fitsystem-${svc}:rollback-${STAMP}" >/dev/null 2>&1 || true
done
echo "=== deploy ok: $CURRENT_SHA ==="
