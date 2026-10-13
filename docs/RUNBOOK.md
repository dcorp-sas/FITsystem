# FIT System — Runbook de operación

Guía para desplegar, operar y recuperar el sistema. **No contiene secretos**:
las credenciales y claves viven fuera del repositorio (ver
[Secretos](#secretos-y-claves)).

## Arquitectura

Monorepo con pnpm + Turborepo.

| App / paquete | Rol | URL de producción |
| --- | --- | --- |
| `apps/api` | API REST (Fastify + Prisma) | https://fitsystem-api.onrender.com |
| `apps/web` | Panel del gimnasio (Next.js) | https://fitsystem-web.onrender.com |
| `apps/mobile` | App/PWA del socio (Expo) | https://fitsystem-socios.onrender.com |
| `apps/desktop` | App de escritorio (Electron) | GitHub Releases |
| `apps/licensador` | Licenciamiento (Node + Ed25519) | https://fitsystem-licensador.onrender.com |
| `packages/*` | `config`, `license`, `types`, `ui`, `utils`, `validators` | — |

Base de datos: PostgreSQL en Render (`fitsystem-db`). El plan free no incluye
backups ni export por API, por eso se usa el export propio (ver
[Backups](#backups-y-restauración)).

## Comandos

```bash
pnpm install          # instalar
pnpm dev              # levantar todas las apps
pnpm build            # build de todo
pnpm typecheck        # chequeo de tipos (todas las apps)
pnpm test             # tests (packages/license, packages/validators)
pnpm --filter @fitsystem/api start   # API en local
```

## Despliegue (Render)

El archivo `render.yaml` define los servicios. Un `git push` a `main` redeploya
automáticamente los servicios con auto-deploy; si no, se dispara a mano.

Variables de entorno sensibles (`sync: false` en `render.yaml`) se configuran en
el panel de Render del servicio, o por API:

```bash
# Definir/actualizar una variable (valor PLANO, no base64)
curl -X PUT "https://api.render.com/v1/services/<SERVICE_ID>/env-vars/<KEY>" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<valor>"}'

# Disparar un deploy (cambiar variables NO redeploya solo)
curl -X POST "https://api.render.com/v1/services/<SERVICE_ID>/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}'
```

IDs de servicio (Render): API `srv-db65sgg473hc73d871c0`, socios
`srv-db5sk4navr4c739ub6d0`, web `srv-db5hj80473hc73b6teqg`, licensador
`srv-db5h3p0473hc73b54vt0`. **No tocar** los servicios `gastroone*`.

> El plan free “duerme” por inactividad: el primer request puede tardar ~50 s.

## Secretos y claves

Se guardan **fuera del repositorio** (archivo local seguro del responsable).
Nunca se versionan.

- `JWT_SECRET` (API): genera con `generateValue: true` en Render. Debe tener ≥32
  caracteres; la API rechaza valores débiles en producción.
- `ADMIN_USER` / `ADMIN_PASS` (licensador): acceso al panel de licencias.
- `LICENSE_PRIVATE_KEY` / `LICENSE_PUBLIC_KEY` (Ed25519): firma/verificación de
  licencias. La pública está embebida como fallback en la API/apps.
- `PROVIDER_BACKUP_TOKEN`: token compartido entre API y licensador para el
  respaldo remoto del estado del licensador.
- `RENDER_API_KEY`: para la API de Render y el workflow de backup.

### Rotación de credenciales

1. Generar un valor nuevo (ej. `openssl rand -hex 24`).
2. `PUT /services/<ID>/env-vars/<KEY>` con el valor **plano**.
2. Disparar un deploy y esperar estado `live`.
3. Verificar el login/uso con el valor nuevo y confirmar que el viejo falla.
4. Actualizar el archivo de claves local.

> El licensador bloquea el login tras 10 intentos fallidos en 15 min por IP
> (`LOGIN_MAX_FAILS`, `LOGIN_WINDOW_MS`). Para desbloquear antes de tiempo,
   reiniciar el servicio (`POST /services/<ID>/restart`).

## Backups y restauración

Export/import propio (funciona en el plan free, que no da backups):

```bash
# Exportar toda la base a un JSON
RENDER_API_KEY=<clave> node scripts/db-export.mjs
# o con la URL directa:
DATABASE_URL="postgres://..." node scripts/db-export.mjs

# Restaurar (upsert por PK, idempotente: se puede repetir)
node scripts/db-import.mjs --file backups/fitsystem-<fecha>.json --url "postgres://..."
```

- Salida en `backups/` (ignorado por git).
- El workflow `.github/workflows/backup.yml` corre semanalmente y sube el dump
  como artefacto. Requiere el secreto de repositorio `RENDER_API_KEY`; si no
  está, se saltea sin fallar.
- El licensador, además, respalda su estado en Postgres vía `PROVIDER_BACKUP_TOKEN`
  (su disco es efímero en el plan free).

## Observabilidad

- `scripts/uptime-check.mjs` verifica web, socios, `api/health` y
  `licensador/api/health`. El workflow `.github/workflows/uptime.yml` lo corre
  cada 15 min y abre/actualiza un issue con la etiqueta `uptime` si algo falla
  (también mantiene despiertos los servicios free).
- Health: API `GET /health`; licensador `GET /api/health`.

## Auto-update de la app de escritorio

- Configurado con `electron-updater` (provider GitHub). El manifiesto
  `latest.yml` y el `.blockmap` los publica `.github/workflows/release.yml`.
- Para publicar una versión: subir la versión en `apps/desktop/package.json` y
  crear un tag `vX.Y.Z` (ej. `v0.3.0`).
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
  `curl -sI https://fitsystem-licensador.onrender.com/api/health`.
