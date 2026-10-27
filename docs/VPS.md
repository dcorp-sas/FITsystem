# Despliegue en VPS (dominio propio)

Todo el sistema corre en un solo servidor, con Caddy terminando el TLS (certificado
automático de Let's Encrypt) y sirviendo por subdominio. **Reemplaza a Render.**

| Dominio | Servicio | Contenedor |
| --- | --- | --- |
| `fitsystem.com.ar` | Landing + panel (Next.js) | `web:3000` |
| `www.fitsystem.com.ar` | 301 → dominio principal | — |
| `api.fitsystem.com.ar` | API (Fastify + Prisma) | `api:3001` |
| `socios.fitsystem.com.ar` | App del socio (PWA) | `socios:80` |
| `fitora.fitsystem.com.ar` | Fitora (PWA de entrenamiento) | `fitora:80` |
| `profes.fitsystem.com.ar` | Portal de profesores (misma web/API y sesión del gimnasio) | `web:3000` |
| `licensador.fitsystem.com.ar` | Licensador del proveedor | `licensador:3000` |

Archivos del paquete:

- `docker-compose.prod.yml` — stack de producción (Caddy, Postgres, API, web, socios, Fitora, licensador).
- `Caddyfile` — enrutado por subdominio + HTTPS.
- `apps/mobile/Dockerfile` — build de la PWA y servida con nginx.
- `apps/fitora` — submódulo del repositorio FITORA, servido como sitio estático con nginx.
- `.env.vps.example` — plantilla de variables.
- `scripts/backup-db.sh` — copia de seguridad de Postgres.

---

## 1. Requisitos

- Dominio **delegado** (que `Resolve-DnsName <dominio> -Type NS` no devuelva error)
  y la zona DNS configurada en DonWeb con la IP del VPS.
- Docker + Compose v2 en el servidor (`docker compose version`).
- Puertos **80**, **443** y **443/udp** abiertos en el firewall del servidor **y**
  en el grupo de seguridad del proveedor. Sin el 80 Let's Encrypt no puede validar.
- ~2 GB de RAM: los builds de pnpm son pesados.

## 2. Registros DNS (DonWeb → Zona DNS)

Todos los `A` apuntan a la **misma IP del VPS**. Borrá los registros inválidos que
crea "Redirección y parking" (un `CNAME` en el dominio raíz y un `CNAME` apuntando
a una IP no existen).

| Tipo | Nombre | Contenido |
| --- | --- | --- |
| `A` | `fitsystem.com.ar` | IP del VPS |
| `CNAME` | `www.fitsystem.com.ar` | `fitsystem.com.ar` |
| `A` | `api.fitsystem.com.ar` | IP del VPS |
| `A` | `socios.fitsystem.com.ar` | IP del VPS |
| `A` | `fitora.fitsystem.com.ar` | IP del VPS |
| `A` | `profes.fitsystem.com.ar` | IP del VPS |
| `A` | `licensador.fitsystem.com.ar` | IP del VPS |

No hace falta crear registros `TXT` para certificados: Caddy usa HTTP-01 (puerto 80).
Para Zoho Mail sí hacen falta `TXT`/`MX`/`SPF`/`DKIM` aparte (ver `docs/RUNBOOK.md`).

## 3. Preparar el servidor

```bash
# Docker Engine (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"     # cerrar y volver a entrar

git clone <repo> fitsystem && cd fitsystem
git submodule update --init --recursive
```

## 4. Variables de entorno

```bash
cp .env.vps.example .env
```

Completá todos los valores vacíos. Generadores:

```bash
openssl rand -base64 24    # POSTGRES_PASSWORD
openssl rand -hex 24       # JWT_SECRET
openssl rand -hex 32       # SETTINGS_ENC_KEY
openssl rand -hex 24       # PROVIDER_BACKUP_TOKEN
openssl rand -base64 18    # ADMIN_PASS
```

Claves Ed25519 del licensador (imprime `LICENSE_PUBLIC_KEY` y `LICENSE_PRIVATE_KEY`):

```bash
pnpm --filter @fitsystem/license keygen genpair
```

> `PUBLIC_URL`, `SOCIOS_URL`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`,
> `NEXT_PUBLIC_SOCIOS_URL` y `EXPO_PUBLIC_API_URL` tienen que coincidir con los
> subdominios del paso 2. Las `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` se **hornean en el
> bundle**: si las cambiás hay que reconstruir (`up -d --build`).

`.env` nunca se commitea (está en `.gitignore` y en `.dockerignore`).

## 5. Arranque

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy
```

El primer arranque tarda: build de las 4 imágenes + emisión de los certificados.
Mirá en los logs de Caddy la línea `certificate obtained successfully` por cada
subdominio.

## 6. Verificación

```bash
curl -sI https://fitsystem.com.ar/
curl -s  https://api.fitsystem.com.ar/health          # {"status":"ok",...}
curl -sI https://socios.fitsystem.com.ar/
curl -sI https://fitora.fitsystem.com.ar/
curl -s  https://licensador.fitsystem.com.ar/api/health
```

Si algo no responde, revisá `docker compose -f docker-compose.prod.yml logs <servicio>`.

## 7. Copias de seguridad

```bash
./scripts/backup-db.sh              # backups/db-<fecha>.sql.gz, conserva 14
KEEP=30 ./scripts/backup-db.sh      # conserva 30
```

Cron diario a las 04:00:

```bash
crontab -e
# 0 4 * * * cd /ruta/al/fitsystem && ./scripts/backup-db.sh >> /var/log/fitsystem-backup.log 2>&1
```

Las copias quedan en `backups/` (ignorado por git). **Sacalas del VPS** de vez en
cuando (`rsync`/`scp` a otra máquina): un backup en el mismo disco no protege
contra un disco roto.

Restaurar:

```bash
gunzip -c backups/db-XXXX.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U fitsystem -d fitsystem
```

## 8. Migración de datos desde Render

Postgres en Render es 16, igual que el contenedor, así que se puede volcar sin
problemas de versión. Todo desde el VPS:

```bash
mkdir -p backups

# 1) Volcado desde Render (PGSSLMODE porque Render exige TLS)
docker run --rm -e PGSSLMODE=require -e PGPASSWORD='<password-de-render>' \
  postgres:16-alpine \
  pg_dump -h '<host-de-render>' -U '<usuario>' -d '<base>' \
  --no-owner --no-privileges | gzip > backups/render.sql.gz

# 2) Restaurar en el Postgres del VPS
gunzip -c backups/render.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U fitsystem -d fitsystem
```

Alternativa con el export JSON propio (idempotente, hace upsert por clave primaria,
se puede repetir) — sirve si el `pg_dump` directo no conecta. `5432` está publicado
**solo en `127.0.0.1`** del VPS, así que se usa un túnel SSH:

```bash
# En tu máquina:
ssh -N -L 5432:127.0.0.1:5432 usuario@vps &
DATABASE_URL="postgres://fitsystem:PASS@127.0.0.1:5432/fitsystem" \
  node scripts/db-import.mjs --file backups/fitsystem-<fecha>.json
```

## 9. Actualizar el despliegue

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Si cambiaron variables de build (`NEXT_PUBLIC_*`/`EXPO_PUBLIC_*`), este paso ya
reconstruye las imágenes.

## 10. Troubleshooting

- **`NXDOMAIN` / "no existe el dominio"**: la delegación de NIC.ar todavía no
  propagó, o los NS de la zona no coinciden con los de DonWeb.
- **Caddy no emite certificado**: faltan los puertos 80/443 abiertos, o el registro
  `A` no apunta a la IP del VPS. Ver `docker compose ... logs caddy`.
- **Origen no permitido (CORS)**: `WEB_ORIGIN` no incluye ese subdominio.
- **401 en el panel**: la sesión venció o `JWT_SECRET` cambió → volver a entrar.
- **Webhook de MercadoPago no completa**: `PUBLIC_URL` tiene que ser
  `https://api.<dominio>` (el webhook vive en `/api/billing/webhook` y
  `/api/integrations/mercadopago/webhook`).
- **Licensador pierde datos**: verificar `PROVIDER_BACKUP_TOKEN` y que
  `BACKUP_URL` termine en `/api`.
