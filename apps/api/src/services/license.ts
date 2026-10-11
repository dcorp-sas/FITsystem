import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

export const LICENSE_PLANS = {
  TRIAL: { seats: 10, days: env.LICENSE_TRIAL_DAYS },
  BASIC: { seats: 100, days: 365 },
  PRO: { seats: 500, days: 365 },
  ENTERPRISE: { seats: 100000, days: 3650 },
} as const;

export type LicensePlanName = keyof typeof LICENSE_PLANS;

// Formato de clave: FIT-<PLAN>-<SEATS>-<YYYYMMDD>-<FIRMA8>
// La firma es HMAC-SHA256(LICENSE_SECRET, `${PLAN}:${SEATS}:${EXPIRY}`) recortada.
function sign(plan: string, seats: number, expiry: string): string {
  return createHmac('sha256', env.LICENSE_SECRET).update(`${plan}:${seats}:${expiry}`).digest('hex').slice(0, 8).toUpperCase();
}

export function generateLicenseKey(plan: LicensePlanName, seats?: number, expiresAt?: Date): string {
  const config = LICENSE_PLANS[plan];
  const finalSeats = seats ?? config.seats;
  const expiry = (expiresAt ?? new Date(Date.now() + config.days * 86400000)).toISOString().slice(0, 10).replace(/-/g, '');
  return `FIT-${plan}-${finalSeats}-${expiry}-${sign(plan, finalSeats, expiry)}`;
}

export interface ParsedLicense {
  plan: LicensePlanName;
  seats: number;
  expiresAt: Date;
}

export function parseLicenseKey(key: string): ParsedLicense {
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 5 || parts[0] !== 'FIT') {
    throw new HttpError(400, 'Formato de licencia invalido');
  }
  const [, plan, seatsRaw, expiry, sig] = parts as [string, string, string, string, string];
  if (!(plan in LICENSE_PLANS)) throw new HttpError(400, 'Plan de licencia desconocido');

  const seats = Number(seatsRaw);
  if (!Number.isInteger(seats) || seats < 0) throw new HttpError(400, 'Cantidad de asientos invalida');
  if (!/^\d{8}$/.test(expiry)) throw new HttpError(400, 'Fecha de vencimiento invalida');

  const expected = sign(plan, seats, expiry);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(400, 'Firma de licencia invalida');
  }

  const expiresAt = new Date(Date.UTC(Number(expiry.slice(0, 4)), Number(expiry.slice(4, 6)) - 1, Number(expiry.slice(6, 8))));
  return { plan: plan as LicensePlanName, seats, expiresAt };
}

async function getOrCreateLicense(installationId: string, machineName?: string | null) {
  const existing = await prisma.license.findUnique({ where: { installationId } });
  if (existing) return existing;
  const trialExpiry = new Date(Date.now() + env.LICENSE_TRIAL_DAYS * 86400000);
  return prisma.license.create({
    data: {
      installationId,
      plan: 'TRIAL',
      seats: LICENSE_PLANS.TRIAL.seats,
      status: 'TRIAL',
      machineName: machineName ?? null,
      expiresAt: trialExpiry,
      activatedAt: new Date(),
    },
  });
}

export function isUsable(status: string, expiresAt: Date | null): boolean {
  if (status === 'SUSPENDED' || status === 'EXPIRED') return false;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  return true;
}

export async function activateLicense(installationId: string, licenseKey: string, machineName?: string | null) {
  const parsed = parseLicenseKey(licenseKey);
  const license = await prisma.license.upsert({
    where: { installationId },
    create: {
      installationId,
      licenseKey,
      plan: parsed.plan,
      seats: parsed.seats,
      status: 'ACTIVE',
      machineName: machineName ?? null,
      activatedAt: new Date(),
      expiresAt: parsed.expiresAt,
      lastCheckAt: new Date(),
    },
    update: {
      licenseKey,
      plan: parsed.plan,
      seats: parsed.seats,
      status: 'ACTIVE',
      activatedAt: new Date(),
      expiresAt: parsed.expiresAt,
      lastCheckAt: new Date(),
    },
  });

  await prisma.licenseEvent.create({
    data: { licenseId: license.id, type: 'ACTIVATED', seats: license.seats, detail: `Plan ${parsed.plan}` },
  });

  return license;
}

export async function validateLicense(installationId: string, licenseKey?: string | null) {
  const license = await getOrCreateLicense(installationId);
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

  return updated;
}

export async function seatUsage(organizationId: string) {
  return prisma.portalAccount.count({ where: { organizationId, isActive: true } });
}

export function licenseInfo(license: { plan: string; seats: number; status: string; expiresAt: Date | null; licenseKey: string | null }) {
  const now = Date.now();
  const daysLeft = license.expiresAt ? Math.ceil((license.expiresAt.getTime() - now) / 86400000) : null;
  return {
    plan: license.plan,
    seats: license.seats,
    status: license.status,
    expiresAt: license.expiresAt,
    daysLeft,
    isUsable: isUsable(license.status, license.expiresAt),
    hasKey: Boolean(license.licenseKey),
  };
}
