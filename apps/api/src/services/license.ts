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
  PRO: { seats: 500, days: 365 },
  ENTERPRISE: { seats: 100000, days: 3650 },
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

function parseOrThrow(key: string): ParsedLicense & { exp: number } {
  const result = verifyKey(key, verifiers());
  if (!result.ok) throw new HttpError(400, result.error);
  if (result.exp < Date.now()) throw new HttpError(400, 'La licencia está vencida');
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
): Promise<{ ok: true; cert: string; source: 'online' } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${env.LICENSE_SERVER}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, installId: installationId, sede: client ?? '' }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { cert?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    if (!data.cert) return { ok: false, error: 'El servicio no devolvió certificado' };
    const check = verifyCert(data.cert, verifiers());
    if (!check.ok) return { ok: false, error: 'Certificado inválido del servicio' };
    return { ok: true, cert: data.cert, source: 'online' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function activateLicense(installationId: string, licenseKey: string, machineName?: string | null) {
  const parsed = parseOrThrow(licenseKey);

  let cert: string | null = null;
  let source = 'local';
  if (env.LICENSE_SERVER) {
    const remote = await remoteActivate(licenseKey, installationId, parsed.client);
    if (remote.ok) {
      cert = remote.cert;
      source = remote.source;
    }
    /* si el servicio no responde, se activa localmente (modo offline) */
  }

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
  if (Date.now() - last < 15 * 86400000) return;
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
    hasKey: Boolean(license.licenseKey),
  };
}
