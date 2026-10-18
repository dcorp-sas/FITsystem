#!/usr/bin/env bash
# Copia de seguridad de Postgres en el VPS.
#
# Uso (desde la raiz del repo, con el stack levantado):
#   ./scripts/backup-db.sh              # genera backups/db-<fecha>.sql.gz
#   KEEP=30 ./scripts/backup-db.sh      # conserva las ultimas 30 copias
#   OUT_DIR=/ruta ./scripts/backup-db.sh
#
# Restaurar:
#   gunzip -c backups/db-XXXX.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T db \
#       psql -U fitsystem -d fitsystem
#
# Cron diario a las 04:00 (ver docs/VPS.md):
#   0 4 * * * cd /ruta/al/repo && ./scripts/backup-db.sh >> /var/log/fitsystem-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

KEEP="${KEEP:-14}"
OUT_DIR="${OUT_DIR:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/db-$STAMP.sql.gz"

mkdir -p "$OUT_DIR"

echo ">> Volcando Postgres -> $FILE"

# -T para escribir desde el stdout del contenedor; pipefail corta si pg_dump falla.
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U fitsystem -d fitsystem --no-owner --no-privileges \
  | gzip > "$FILE"

# Un volcado vacio significa que algo fallo en silencio.
if [ ! -s "$FILE" ]; then
  echo "!! El volcado quedo vacio: $FILE" >&2
  rm -f "$FILE"
  exit 1
fi

echo ">> Conservando las ultimas $KEEP copias en $OUT_DIR/"
ls -1t "$OUT_DIR"/db-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm --

echo ">> Listo: $(du -h "$FILE" | cut -f1) -> $FILE"
