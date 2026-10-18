# FIT System — Runbook de operación

Guía para desplegar, operar y recuperar el sistema. **No contiene secretos**:
las credenciales y claves viven fuera del repositorio (ver
[Secretos](#secretos-y-claves)).

## Arquitectura

Monorepo con pnpm + Turborepo. Producción corre en un VPS (Ubuntu 24.04) con
Docker Compose y Caddy como reverse proxy / TLS (Let's Encrypt).

| App / paquete | Rol | URL de producción |
| --- | --- | --- |
| `apps/api` | API REST (Fastify + Prisma) | https://api.fitsystem.com.ar |
| `apps/web` | Panel del gimnasio + landing (Next.js) | https://fitsystem.com.ar |
| `apps/mobile` | App/PWA del socio (Expo) | https://socios.fitsystem.com.ar |
| `apps/desktop` | App de escritorio (Electron) | GitHub Releases |
| `apps/licensador` | Licenciamiento (Node + Ed25519) | https://licensador.fitsystem.com.ar |
| `packages/*` | `config`, `license`, `types`, `ui`, `utils`, `validators` | — |

Base de datos: PostgreSQL en el VPS (contenedor `db`). El detalle de la
infraestructura (rutas, puertos, Caddy, TLS) está en [VPS.md](./VPS.md).

## Comandos

```bash
pnpm install          # instalar
pnpm dev              # levantar todas las apps
pnpm build            # build de todo
pnpm typecheck        # chequeo de tipos (todas las apps)
pnpm test             # tests (packages/license, packages/validators)
pnpm --filter @fitsystem/api start   # API en local
```

## Despliegue (VPS)

El deploy es automático: `.github/workflows/deploy-vps.yml` entra por SSH al VPS
en cada `push` a `main`, actualiza el clon en `/opt/fitsystem`
(`git fetch && git reset --hard origin/main`) y reconstruye los contenedores
(`docker compose -f docker-compose.prod.yml up -d --build`).

Requiere los secretos del repositorio `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY`
(`VPS_PORT` opcional). Si faltan, el workflow se saltea sin fallar.

Manual (si hace falta):

```bash
ssh root@<VPS_HOST>
cd /opt/fitsystem
git fetch --prune origin main && git reset --hard origin/main
COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.prod.yml up -d --build
```

El archivo `/opt/fitsystem/.env` **no** está en el repo (está en `.gitignore`):
se conserva entre despliegues. Variables nuevas se agregan ahí y, si el
contenedor las necesita, se declaran en el bloque `environment` de
`docker-compose.prod.yml` (si no, `docker compose` no las inyecta).

> El VPS tiene 2 vCPU / 2 GiB: los builds van secuenciales
> (`COMPOSE_PARALLEL_LIMIT=1`). Evitar builds simultáneos.

## Secretos y claves

Se guardan **fuera del repositorio** (el `.env` del VPS y el archivo local seguro
del responsable). Nunca se versionan.

- `JWT_SECRET` (API): debe tener ≥32 caracteres; la API rechaza valores débiles
  en producción.
- `POSTGRES_PASSWORD`: contraseña del usuario `fitsystem` de Postgres.
- `ADMIN_USER` / `ADMIN_PASS` (licensador): acceso al panel de licencias.
- `LICENSE_PRIVATE_KEY` / `LICENSE_PUBLIC_KEY` (Ed25519): firma/verificación de
  licencias. La pública está embebida como fallback en la API/apps.
- `PROVIDER_BACKUP_TOKEN`: token compartido entre API y licensador para el
  respaldo remoto del estado del licensador.
- `PLATFORM_MP_*`: credenciales de MercadoPago de la plataforma (pago de
  licencias desde la landing).
- `PLATFORM_SMTP_*` / `PLATFORM_BREVO_API_KEY`: correo saliente del contacto de
  la landing.
- `VAPID_*`: claves de Web Push para el panel.

### Rotación de credenciales

1. Generar un valor nuevo (ej. `openssl rand -hex 24`).
2. Actualizar la variable en `/opt/fitsystem/.env` (para el licensador, además
   `LICENSOR_*` en el bloque `environment` de `docker-compose.prod.yml`).
3. Redesplegar (`git push` a `main` o el comando manual) para recrear los
   contenedores.
4. Verificar el login/uso con el valor nuevo y confirmar que el viejo falla.
5. Actualizar el archivo de claves local.

> El licensador bloquea el login tras 10 intentos fallidos en 15 min por IP
> (`LOGIN_MAX_FAILS`, `LOGIN_WINDOW_MS`). Para desbloquear antes de tiempo,
> reiniciar el contenedor (`docker compose -f docker-compose.prod.yml restart licensador`).

## Backups y restauración

Volcado de Postgres del VPS:

```bash
# Desde el VPS, con el stack levantado
cd /opt/fitsystem && ./scripts/backup-db.sh        # backups/db-<fecha>.sql.gz
KEEP=30 ./scripts/backup-db.sh                      # conserva las ultimas 30 copias
```

Restaurar:

```bash
gunzip -c backups/db-XXXX.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U fitsystem -d fitsystem
```

- El workflow `.github/workflows/backup.yml` corre semanalmente, ejecuta el script
  en el VPS por SSH y sube el `.sql.gz` como artefacto (copia fuera del VPS).
  Requiere los mismos secretos `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`.
- Export/import JSON (migración o copia lógica) sigue disponible:

  ```bash
  DATABASE_URL="postgres://..." node scripts/db-export.mjs
  node scripts/db-import.mjs --file backups/fitsystem-<fecha>.json --url "postgres://..."
  ```

- El licensador, además, respalda su estado en Postgres vía `PROVIDER_BACKUP_TOKEN`.

## Observabilidad

- `scripts/uptime-check.mjs` verifica web, socios, `api/health` y
  `licensador/api/health`. El workflow `.github/workflows/uptime.yml` lo corre
  cada 15 min y abre/actualiza un issue con la etiqueta `uptime` si algo falla.
- Health: API `GET /health`; licensador `GET /api/health`.

## Auto-update de la app de escritorio

- Configurado con `electron-updater` (provider GitHub). El manifiesto
  `latest.yml` y el `.blockmap` los publica `.github/workflows/release.yml`.
- Para publicar una versión: `pnpm release <patch|minor|major>` (sube la versión
  en los 3 lugares, commitea, pushea y crea el tag `vX.Y.Z`), lo que dispara el
  workflow de release.
- Sin firma de código, Windows mostrará avisos de SmartScreen (el auto-update
  funciona igual).

## MercadoPago (cobro online de la app de socios)

- Configurar en el panel del gimnasio: `MERCADOPAGO.ACCESS_TOKEN`, y opcional
  `MERCADOPAGO.WEBHOOK_SECRET`, `MERCADOPAGO.RETURN_URL`.
- La API necesita `PUBLIC_URL` (para el webhook) y `SOCIOS_URL` (retorno a la
  app). Webhook: `POST /api/integrations/mercadopago/webhook`.
- Al aprobarse el pago, el webhook reconcilia la intención del portal (crea el
  pago, registra caja, activa la membresía y notifica).

## Notificaciones push

- App de socios (Expo): el cliente pide permiso y registra el token
  (`/api/portal/push-token`). Requiere un development build de EAS (no funciona
  en la PWA web ni en Expo Go).
- El envío server-side usa el servicio de push de Expo (`services/push.ts`).

## Recuperación / troubleshooting

- **401 en el panel**: la sesión venció o `JWT_SECRET` cambió → volver a entrar.
- **El licensador pierde datos tras deploy**: verificar `PROVIDER_BACKUP_TOKEN`
  y el respaldo remoto (`/api/backup`, `/api/restore`).
- **Webhook de MercadoPago no completa**: revisar `PUBLIC_URL`,
  `MERCADOPAGO.WEBHOOK_SECRET` y que el pago esté aprobado en MP.
- **Restaurar la base**: ver [Backups](#backups-y-restauración).
- **Auditoría rápida de cabeceras de seguridad**:
  `curl -sI https://licensador.fitsystem.com.ar/api/health`.
