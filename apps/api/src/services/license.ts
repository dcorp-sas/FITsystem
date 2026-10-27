import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../lib/http.js';
import { issue, verifyKey, verifyCert, type Verifier } from '@fitsystem/license';
import type { License } from '@prisma/client';
import crypto from 'node:crypto';

/**
 * Huella de la clave publica de licencias configurada (para comparar con la que
 * imprime el Licensador al arrancar). Si no coincide, las claves no validaran.
 */
export function licensePublicKeyFingerprint(): string {
  return crypto.createHash('sha256').update(String(env.LICENSE_PUBLIC_KEY)).digest('hex').slice(0, 16);
}

export const LICENSE_PLANS = {
  TRIAL: { seats: 10, days: env.LICENSE_TRIAL_DAYS },
  BASIC: { seats: 100, days: 365 },
  PRO: { seats: 300, days: 365 },
  ENTERPRISE: { seats: 500, days: 3650 },
} as const;

export type LicensePlanName = keyof typeof LICENSE_PLANS;

function verifiers(): Verifier[] {
  const list: Verifier[] = [];
  if (env.LICENSE_PUBLIC_KEY) {
    try {
      list.push({ type: 'ed25519', key: JSON.parse(Buffer.from(env.LICENSE_PUBLIC_KEY, 'base64').toString('utf8')) });
    } catch {
      /* clave publica invalida: se ignora */
    }
  }
  if (env.LICENSE_SECRET) list.push(env.LICENSE_SECRET);
  return list;
}

function issueSigner(): Verifier {
  if (env.LICENSE_PRIVATE_KEY) {
    try {
      return { type: 'ed25519', key: JSON.parse(Buffer.from(env.LICENSE_PRIVATE_KEY, 'base64').toString('utf8')) };
    } catch {
      /* clave privada invalida */
    }
  }
  if (env.LICENSE_SECRET) return env.LICENSE_SECRET;
  throw new HttpError(500, 'No hay firmante configurado (definí LICENSE_SECRET o LICENSE_PRIVATE_KEY)');
}

/*
 * Claves con el mismo formato robusto que el Licensador (referencia GastroOne):
 *   FIT-<payload base64url>-<firma HMAC/Ed25519>
 * El payload incluye cliente, plan, asientos, días de validez y nonce.
 */

export interface ParsedLicense {
  plan: LicensePlanName;
  seats: number;
  expiresAt: Date;
  client: string | null;
}

function parseOrThrow(key: string, allowExpired = false): ParsedLicense & { exp: number } {
  const result = verifyKey(key, verifiers());
  if (!result.ok) throw new HttpError(400, result.error);
  if (!allowExpired && result.exp < Date.now()) throw new HttpError(400, 'La licencia está vencida');
  const payload = result.payload as { c?: unknown; p?: unknown; s?: unknown };
  const plan = String(payload.p ?? '').toUpperCase();
  if (!(plan in LICENSE_PLANS)) throw new HttpError(400, 'Plan de licencia desconocido');
  const seats = Number(payload.s ?? LICENSE_PLANS[plan as LicensePlanName].seats);
  if (!Number.isInteger(seats) || seats < 0) throw new HttpError(400, 'Cantidad de asientos inválida');
  return {
    plan: plan as LicensePlanName,
    seats,
    expiresAt: new Date(result.exp),
    client: payload.c ? String(payload.c) : null,
    exp: result.exp,
  };
}

/** Verifica firma y límites de una licencia para replicar su estado a la nube. */
export function parseSyncedLicenseKey(key: string): ParsedLicense & { exp: number } {
  return parseOrThrow(key, true);
}

export function generateLicenseKey(
  plan: LicensePlanName,
  seats?: number,
  expiresAt?: Date,
  client?: string,
): string {
  const config = LICENSE_PLANS[plan];
  const finalSeats = seats ?? config.seats;
  const days = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000))
    : config.days;
  return issue({ client: client ?? 'Cliente', plan, seats: finalSeats, days, issued: Date.now() }, issueSigner());
}

export function parseLicenseKey(key: string): ParsedLicense {
  const parsed = parseOrThrow(key);
  return { plan: parsed.plan, seats: parsed.seats, expiresAt: parsed.expiresAt, client: parsed.client };
}

/**
 * Normaliza el ancla de primera ejecución enviada por el escritorio (registro de
 * Windows). Solo se aceptan fechas pasadas y razonables: una fecha futura se
 * ignora (no permite adelantar ni atrasar el vencimiento de la prueba).
 */
function clampTrialStart(value?: string | null): Date | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t > now) return null;
  if (t < now - 10 * 365 * 86400000) return null;
  return new Date(t);
}

async function getOrCreateLicense(installationId: string, machineName?: string | null, firstRunAt?: string | null) {
  const anchor = clampTrialStart(firstRunAt);
  const existing = await prisma.license.findUnique({ where: { installationId } });
  if (existing) {
    // La prueba solo puede acortarse, nunca extenderse: si el ancla (registro de
    // Windows) es anterior al inicio registrado, adelantamos el vencimiento.
    const updates: { activatedAt?: Date; expiresAt?: Date; machineName?: string } = {};
    if (existing.plan === 'TRIAL' && anchor) {
      const currentStart = existing.activatedAt?.getTime() ?? Date.now();
      if (anchor.getTime() < currentStart) {
        updates.activatedAt = anchor;
        const anchoredExpiry = anchor.getTime() + env.LICENSE_TRIAL_DAYS * 86400000;
        if (!existing.expiresAt || anchoredExpiry < existing.expiresAt.getTime()) {
          updates.expiresAt = new Date(anchoredExpiry);
        }
      }
    }
    if (machineName && !existing.machineName) updates.machineName = machineName;
    if (Object.keys(updates).length) {
      return prisma.license.update({ where: { id: existing.id }, data: updates });
    }
    return existing;
  }
  const start = clampTrialStart(firstRunAt) ?? new Date();
  const trialExpiry = new Date(start.getTime() + env.LICENSE_TRIAL_DAYS * 86400000);
  return prisma.license.create({
    data: {
      installationId,
      plan: 'TRIAL',
      seats: LICENSE_PLANS.TRIAL.seats,
      status: 'TRIAL',
      machineName: machineName ?? null,
      expiresAt: trialExpiry,
      activatedAt: start,
    },
  });
}

export function isUsable(status: string, expiresAt: Date | null): boolean {
  if (status === 'SUSPENDED' || status === 'EXPIRED') return false;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  return true;
}

/* Activación en línea contra el Licensador: devuelve un certificado firmado. */
async function remoteActivate(
  key: string,
  installationId: string,
  client?: string | null,
): Promise<
  | { ok: true; cert: string; license: ParsedLicense }
  | { ok: false; error: string; status: number | null }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${env.LICENSE_SERVER}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, installId: installationId, sede: client ?? '' }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      cert?: string;
      error?: string;
      client?: string;
      plan?: string;
      seats?: number;
      exp?: number;
    };
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}`, status: res.status };
    const plan = String(data.plan ?? '').toUpperCase();
    const seats = Number(data.seats);
    const expiresAt = new Date(Number(data.exp));
    if (!data.cert || !(plan in LICENSE_PLANS) || !Number.isInteger(seats) || seats < 1 || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: 'El servicio devolvió una autorización incompleta', status: res.status };
    }
    // El Licensador es la autoridad que valida la firma de la clave. Su respuesta
    // llega por HTTPS y contiene los atributos que acaba de autorizar. No se
    // vuelve a verificar el certificado con una clave local posiblemente vieja
    // (o una clave HMAC que deliberadamente no se distribuye en el instalador).
    return {
      ok: true,
      cert: data.cert,
      license: { plan: plan as LicensePlanName, seats, expiresAt, client: data.client ?? client ?? null },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message, status: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function activateLicense(installationId: string, licenseKey: string, machineName?: string | null) {
  let parsed: ParsedLicense | null = null;
  let localVerificationError: unknown;
  try {
    parsed = parseOrThrow(licenseKey);
  } catch (error) {
    localVerificationError = error;
  }
  let cert: string | null = null;
  let source = 'local';
  if (env.LICENSE_SERVER) {
    const remote = await remoteActivate(licenseKey, installationId, parsed?.client);
    if (remote.ok) {
      parsed = remote.license;
      cert = remote.cert;
      source = 'online';
    } else if (remote.status === 403 || remote.status === 409 || remote.status === 410) {
      // Un rechazo explícito por revocación o límite de activaciones no se puede
      // convertir en una licencia local ignorando la respuesta de la autoridad.
      throw new HttpError(remote.status, remote.error);
    } else if (!parsed) {
      const reason = remote.status
        ? `El Licensador rechazó la clave (HTTP ${remote.status}): ${remote.error}`
        : `No se pudo contactar al Licensador para verificar la clave: ${remote.error}`;
      throw new HttpError(remote.status && remote.status < 500 ? 400 : 503, reason);
    }
    // Si el Licensador no está disponible, una firma local válida conserva el
    // funcionamiento offline. Una clave no verificable localmente nunca se
    // activa sin confirmación en línea.
  }
  if (!parsed) throw localVerificationError;

  const license = await prisma.license.upsert({
    where: { installationId },
    create: {
      installationId,
      licenseKey,
      plan: parsed.plan,
      seats: parsed.seats,
      status: 'ACTIVE',
      client: parsed.client,
      machineName: machineName ?? null,
      activatedAt: new Date(),
      expiresAt: parsed.expiresAt,
      lastCheckAt: new Date(),
      cert,
      source,
    },
    update: {
      licenseKey,
      plan: parsed.plan,
      seats: parsed.seats,
      status: 'ACTIVE',
      client: parsed.client,
      activatedAt: new Date(),
      expiresAt: parsed.expiresAt,
      lastCheckAt: new Date(),
      cert,
      source,
    },
  });

  await prisma.licenseEvent.create({
    data: { licenseId: license.id, type: 'ACTIVATED', seats: license.seats, detail: `Plan ${parsed.plan} (${source})` },
  });

  return license;
}

/* Revalidación silenciosa: cada 15 días consulta el Licensador; si el asiento
   fue revocado, suspende la licencia. Sin internet, se conserva la copia local. */
async function maybeRevalidate(license: {
  id: string;
  licenseKey: string | null;
  installationId: string;
  cert: string | null;
  source: string | null;
  lastCheckAt: Date | null;
}) {
  if (!env.LICENSE_SERVER || !license.cert || !license.licenseKey) return;
  const last = license.lastCheckAt ? license.lastCheckAt.getTime() : 0;
  // Ventana de revalidación: corta a propósito para detectar a tiempo el corte
  // por falta de pago de una suscripción. Configurable con LICENSE_REVALIDATE_HOURS.
  const windowMs = Math.max(1, Number(process.env.LICENSE_REVALIDATE_HOURS || 3)) * 3600000;
  if (Date.now() - last < windowMs) return;
  try {
    const res = await fetch(`${env.LICENSE_SERVER}/api/license/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: license.licenseKey, installId: license.installationId }),
    });
    if (res.status === 410) {
      await prisma.license.update({ where: { id: license.id }, data: { status: 'SUSPENDED', lastCheckAt: new Date() } });
      return;
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { cert?: string };
      const check = data.cert ? verifyCert(data.cert, verifiers()) : { ok: false } as const;
      await prisma.license.update({
        where: { id: license.id },
        data: { lastCheckAt: new Date(), ...(check.ok && data.cert ? { cert: data.cert } : {}) },
      });
    }
  } catch {
    /* sin internet: se conserva la licencia local hasta el vencimiento */
  }
}

export async function validateLicense(
  installationId: string,
  licenseKey?: string | null,
  opts?: { machineName?: string | null; firstRunAt?: string | null },
): Promise<License> {
  const license = await getOrCreateLicense(installationId, opts?.machineName, opts?.firstRunAt);
  let status = license.status;

  if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    status = 'EXPIRED';
  } else if (status === 'EXPIRED') {
    status = license.licenseKey ? 'ACTIVE' : 'TRIAL';
  }

  const updated = await prisma.license.update({
    where: { id: license.id },
    data: { status, lastCheckAt: new Date(), ...(licenseKey ? { licenseKey } : {}) },
  });

  await maybeRevalidate(updated);

  const fresh = await prisma.license.findUnique({ where: { id: license.id } });
  return fresh ?? updated;
}

export async function seatUsage(organizationId: string) {
  return prisma.portalAccount.count({ where: { organizationId, isActive: true } });
}

/**
 * Garantiza que la organizacion tenga una licencia (TRIAL si aun no activo).
 * Se usa en modo nube, donde la licencia vive por organizacion.
 */
export async function ensureOrgLicense(organizationId: string) {
  const existing = await prisma.license.findUnique({ where: { organizationId } });
  if (existing) return existing;
  const trialExpiry = new Date(Date.now() + env.LICENSE_TRIAL_DAYS * 86400000);
  return prisma.license.create({
    data: {
      organizationId,
      installationId: `org:${organizationId}`,
      plan: 'TRIAL',
      seats: LICENSE_PLANS.TRIAL.seats,
      status: 'TRIAL',
      activatedAt: new Date(),
      expiresAt: trialExpiry,
    },
  });
}

/**
 * Replica a la nube la licencia firmada de la instalación de escritorio.
 * El sync key autentica el gimnasio y el ID debe coincidir con el que ese mismo
 * canal vinculó; el plan, los asientos y el vencimiento se derivan de la clave
 * firmada, nunca de valores declarados por el cliente.
 */
export async function syncInstallationLicense(
  organizationId: string,
  installationId: string,
  licenseKey: string,
  reportedStatus: string,
  machineName?: string | null,
): Promise<{ synced: boolean; plan: string; expiresAt: Date }> {
  const linkedInstallation = await prisma.setting.findUnique({
    where: { organizationId_category_key: { organizationId, category: 'SYNC', key: 'INSTALLATION_ID' } },
    select: { value: true },
  });
  if (!linkedInstallation || linkedInstallation.value !== installationId) {
    throw new HttpError(403, 'La licencia no coincide con la instalación vinculada al gimnasio');
  }

  const parsed = parseSyncedLicenseKey(licenseKey);
  const status = reportedStatus === 'SUSPENDED'
    ? 'SUSPENDED'
    : reportedStatus === 'EXPIRED' || parsed.exp < Date.now()
      ? 'EXPIRED'
      : 'ACTIVE';
  const now = new Date();
  const byInstallation = await prisma.license.findUnique({ where: { installationId } });
  const byOrganization = await prisma.license.findUnique({ where: { organizationId } });
  if (byInstallation?.organizationId && byInstallation.organizationId !== organizationId) {
    throw new HttpError(409, 'La instalación ya está vinculada a otro gimnasio');
  }
  if (byInstallation && byOrganization && byInstallation.id !== byOrganization.id) {
    throw new HttpError(409, 'Hay dos registros de licencia para el gimnasio; requiere revisión');
  }
  if (
    byOrganization &&
    byOrganization.installationId !== installationId &&
    byOrganization.licenseKey &&
    byOrganization.licenseKey !== licenseKey &&
    byOrganization.source !== 'desktop-sync' &&
    isUsable(byOrganization.status, byOrganization.expiresAt)
  ) {
    throw new HttpError(409, 'El gimnasio ya tiene otra licencia activa; requiere revisión antes de reemplazarla');
  }

  const existing = byInstallation ?? byOrganization;
  const keyFingerprint = crypto.createHash('sha256').update(licenseKey).digest('hex');
  const data = {
    installationId,
    organizationId,
    // No se persiste en la nube la clave reutilizable; el servidor verifica su
    // firma en cada push y conserva solo una huella para auditoría/idempotencia.
    licenseKey: null,
    signature: keyFingerprint,
    plan: parsed.plan,
    seats: parsed.seats,
    status,
    client: parsed.client,
    machineName: machineName ?? existing?.machineName ?? null,
    activatedAt: existing?.activatedAt ?? now,
    expiresAt: parsed.expiresAt,
    lastCheckAt: now,
    source: 'desktop-sync',
  };
  const saved = existing
    ? await prisma.license.update({ where: { id: existing.id }, data })
    : await prisma.license.create({ data });

  const changed = !existing || existing.signature !== keyFingerprint || existing.status !== status;
  if (changed) {
    await prisma.licenseEvent.create({
      data: { licenseId: saved.id, type: 'SYNCED', seats: parsed.seats, detail: `Licencia ${status} recibida de la instalación ${installationId}` },
    });
  }
  invalidateLicenseGuard(organizationId);
  return { synced: true, plan: parsed.plan, expiresAt: parsed.expiresAt };
}

interface GuardCacheEntry {
  usable: boolean;
  message?: string;
  at: number;
}
const guardCache = new Map<string, GuardCacheEntry>();
const GUARD_TTL_MS = 30_000;

/**
 * Enforcement de licencia: lanza 402 si la licencia de la instalacion (desktop)
 * o de la organizacion (nube) esta vencida o suspendida. Lecturas nunca se
 * bloquean; solo las operaciones de escritura pasan por aca.
 */
export async function assertLicenseUsable(organizationId: string): Promise<void> {
  const key = env.LICENSE_INSTALLATION_ID ? `inst:${env.LICENSE_INSTALLATION_ID}` : `org:${organizationId}`;
  const cached = guardCache.get(key);
  if (cached && Date.now() - cached.at < GUARD_TTL_MS) {
    if (!cached.usable) throw new HttpError(402, cached.message || 'Licencia vencida');
    return;
  }

  const license = env.LICENSE_INSTALLATION_ID
    ? await prisma.license.findUnique({ where: { installationId: env.LICENSE_INSTALLATION_ID } })
    : await ensureOrgLicense(organizationId);

  // Sin licencia de instalacion aun, no se bloquea (el desktop muestra activacion).
  if (!license) {
    guardCache.set(key, { usable: true, at: Date.now() });
    return;
  }

  const usable = isUsable(license.status, license.expiresAt);
  const message = usable
    ? undefined
    : 'Tu licencia esta vencida o suspendida. Activala o renovala para seguir operando.';
  guardCache.set(key, { usable, message, at: Date.now() });
  if (!usable) throw new HttpError(402, message!);
}

/** Invalida el cache de enforcement (tras activar/renovar). */
export function invalidateLicenseGuard(organizationId?: string): void {
  if (!organizationId) {
    guardCache.clear();
    return;
  }
  guardCache.delete(`org:${organizationId}`);
  guardCache.delete(`inst:${organizationId}`);
}

/**
 * Bloqueo duro del producto de escritorio: si la licencia de la instalación no
 * es usable (prueba vencida o licencia suspendida) se deniega toda operación del
 * panel, tanto lectura como escritura. La activación y la app del socio quedan
 * exceptuadas para poder renovar / operar. El ancla de la prueba vive fuera de la
 * base (registro de Windows) para que no se reinicie al reinstalar.
 */
export async function assertInstallationUsable(): Promise<void> {
  const id = env.LICENSE_INSTALLATION_ID;
  if (!id) return;
  const key = `inst:${id}`;
  const cached = guardCache.get(key);
  if (cached && Date.now() - cached.at < GUARD_TTL_MS) {
    if (!cached.usable) throw new HttpError(402, cached.message || 'Licencia vencida');
    return;
  }
  const license = await prisma.license.findUnique({ where: { installationId: id } });
  if (!license) {
    guardCache.set(key, { usable: true, at: Date.now() });
    return;
  }
  const usable = isUsable(license.status, license.expiresAt);
  const message = usable
    ? undefined
    : 'La prueba gratuita finalizó. Activá tu licencia para seguir usando FIT system™.';
  guardCache.set(key, { usable, message, at: Date.now() });
  if (!usable) throw new HttpError(402, message!);
}

export function licenseInfo(license: {
  plan: string;
  seats: number;
  status: string;
  expiresAt: Date | null;
  licenseKey: string | null;
  client?: string | null;
  source?: string | null;
}) {
  const now = Date.now();
  const daysLeft = license.expiresAt ? Math.ceil((license.expiresAt.getTime() - now) / 86400000) : null;
  return {
    plan: license.plan,
    seats: license.seats,
    status: license.status,
    client: license.client ?? null,
    expiresAt: license.expiresAt,
    daysLeft,
    isUsable: isUsable(license.status, license.expiresAt),
    hasKey: Boolean(license.licenseKey) || license.source === 'desktop-sync',
  };
}
