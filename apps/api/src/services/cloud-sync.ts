import { prisma } from '../db.js';
import { env } from '../env.js';
import { getRawSetting, upsertSettings } from './settings.js';

/*
 * Sincronizacion del sistema local (escritorio) hacia la nube.
 *
 * El panel de escritorio sigue operando 100% offline con su base SQLite. La
 * conexion a la nube es automatica: la URL es fija (env.CLOUD_URL) y la clave
 * de sincronizacion se aprovisiona sola la primera vez. Cuando esta conectado,
 * empuja socios, cuentas del portal, planes, membresias y sedes a la API en la
 * nube para que la app del socio y el panel web vean los mismos datos.
 * La configuracion de bajo nivel vive en settings CLOUD/*.
 */

const CLOUD = 'CLOUD';

export interface CloudConfig {
  orgId: string;
  url: string | null;
  key: string | null;
  lastSyncAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  connected: boolean;
}

async function localOrgId(): Promise<string> {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!org) throw new Error('No hay organizacion local');
  return org.id;
}

export async function getCloudConfig(): Promise<CloudConfig> {
  const orgId = await localOrgId();
  const [urlSetting, key, lastSyncAt, lastPullAt, lastError] = await Promise.all([
    getRawSetting(orgId, CLOUD, 'SYNC_URL'),
    getRawSetting(orgId, CLOUD, 'SYNC_KEY'),
    getRawSetting(orgId, CLOUD, 'LAST_SYNC_AT'),
    getRawSetting(orgId, CLOUD, 'LAST_PULL_AT'),
    getRawSetting(orgId, CLOUD, 'LAST_ERROR'),
  ]);
  const url = urlSetting || env.CLOUD_URL || null;
  return {
    orgId,
    url: url ? url.replace(/\/+$/, '') : null,
    key: key || null,
    lastSyncAt: lastSyncAt || null,
    lastPullAt: lastPullAt || null,
    lastError: lastError || null,
    connected: Boolean(url && key),
  };
}

/*
 * Garantiza que el escritorio este conectado a la nube. La URL es fija
 * (env.CLOUD_URL): si todavia no hay clave, la pide sola a /api/sync/connect y
 * la guarda. No requiere intervencion del usuario (no hay pestana "Nube").
 */
export async function ensureCloudConnected(): Promise<boolean> {
  const orgId = await localOrgId();
  const base = (env.CLOUD_URL || '').replace(/\/+$/, '');
  if (!base) return false;

  const existingKey = await getRawSetting(orgId, CLOUD, 'SYNC_KEY');
  if (existingKey) {
    const currentUrl = await getRawSetting(orgId, CLOUD, 'SYNC_URL');
    if (currentUrl !== base) await upsertSettings(orgId, CLOUD, { SYNC_URL: base });
    return true;
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, currency: true } });
  try {
    const response = await fetch(`${base}/api/sync/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationName: org?.name || 'Mi gimnasio',
        currency: org?.currency || undefined,
        ...(env.LICENSE_INSTALLATION_ID ? { installationId: env.LICENSE_INSTALLATION_ID } : {}),
      }),
    });
    const json = (await response.json().catch(() => null)) as
      | { data?: { syncKey?: string; organizationId?: string }; message?: string }
      | null;
    if (!response.ok || !json?.data?.syncKey) {
      const message = json?.message || `No se pudo conectar a la nube (HTTP ${response.status})`;
      await upsertSettings(orgId, CLOUD, { LAST_ERROR: message.slice(0, 500) });
      console.error('[cloud-sync]', message);
      return false;
    }
    await upsertSettings(orgId, CLOUD, {
      SYNC_URL: base,
      SYNC_KEY: json.data.syncKey,
      ENABLED: 'true',
      LAST_ERROR: '',
      ...(json.data.organizationId ? { CLOUD_ORG_ID: json.data.organizationId } : {}),
    });
    console.log('[cloud-sync] conectado automaticamente a la nube');
    return true;
  } catch (error) {
    console.error('[cloud-sync] no se pudo conectar:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function buildPayload(orgId: string, memberIds?: string[]) {
  const orgWhere = { organizationId: orgId };
  const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [organization, branches, plans, instructors, gymClasses, classSessions] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.branch.findMany({ where: orgWhere }),
    prisma.plan.findMany({ where: orgWhere }),
    prisma.instructor.findMany({ where: orgWhere }),
    prisma.gymClass.findMany({ where: orgWhere }),
    prisma.classSession.findMany({
      where: { gymClass: { organizationId: orgId }, startAt: { gte: recent } },
      orderBy: { startAt: 'asc' },
      take: 2000,
    }),
  ]);

  const scopedMembers = memberIds && memberIds.length > 0;
  const members = await prisma.member.findMany({
    where: scopedMembers ? { organizationId: orgId, id: { in: memberIds } } : orgWhere,
  });
  const ids = members.map((m) => m.id);
  const [memberships, portalAccounts, reservations, attendance, payments, sales, cashSessions, cashMovements, stockMovements] = ids.length
    ? await Promise.all([
        prisma.membership.findMany({ where: { memberId: { in: ids } } }),
        prisma.portalAccount.findMany({ where: { memberId: { in: ids } } }),
        prisma.reservation.findMany({ where: { memberId: { in: ids }, session: { startAt: { gte: recent } } } }),
        prisma.attendance.findMany({ where: { memberId: { in: ids }, checkedInAt: { gte: recent } } }),
        prisma.payment.findMany({ where: { memberId: { in: ids }, paidAt: { gte: recent } } }),
        prisma.sale.findMany({ where: { memberId: { in: ids }, createdAt: { gte: recent } } }),
        prisma.cashSession.findMany({ where: orgWhere }),
        prisma.cashMovement.findMany({ where: { memberId: { in: ids }, createdAt: { gte: recent } } }),
        prisma.stockMovement.findMany({ where: { organizationId: orgId, createdAt: { gte: recent } } }),
    prisma.product.findMany({ where: orgWhere }),
      ])
    : [[], [], [], [], [], [], [], [], [], []];

  return {
    organization: organization
      ? {
          name: organization.name,
          taxId: organization.taxId,
          email: organization.email,
          phone: organization.phone,
          address: organization.address,
          logoUrl: organization.logoUrl,
          currency: organization.currency,
        }
      : undefined,
    branches,
    plans,
    members,
    memberships,
    portalAccounts,
    instructors,
    gymClasses,
    classSessions,
    reservations,
    attendance,
    payments,
    sales,
    cashSessions,
    cashMovements,
    stockMovements,
  };
}

export async function runCloudSync(opts?: { memberIds?: string[] }) {
  const cfg = await getCloudConfig();
  if (!cfg.url || !cfg.key) throw new Error('La nube no esta configurada');
  const payload = await buildPayload(cfg.orgId, opts?.memberIds);

  const response = await fetch(`${cfg.url.replace(/\/+$/, '')}/api/sync/push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-key': cfg.key,
      // Vincula esta instalacion con el gimnasio en la nube: el login del panel
      // remoto usa este ID para resolver el gimnasio.
      ...(env.LICENSE_INSTALLATION_ID ? { 'x-installation-id': env.LICENSE_INSTALLATION_ID } : {}),
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as { data?: unknown; message?: string } | null;

  if (!response.ok) {
    const message = json?.message || `Error HTTP ${response.status}`;
    await upsertSettings(cfg.orgId, CLOUD, { LAST_ERROR: message.slice(0, 500) });
    throw new Error(message);
  }

  await upsertSettings(cfg.orgId, CLOUD, { LAST_SYNC_AT: new Date().toISOString(), LAST_ERROR: '' });
  return json?.data ?? { ok: true };
}

/*
 * Trae desde la nube lo que generaron los socios en la app (ingresos y reservas)
 * y lo refleja en la base local. Se hace upsert por id (asistencias) y por la
 * clave socio+sesion (reservas) para no duplicar filas ni pisar el trabajo local.
 */
export async function runCloudPull() {
  const cfg = await getCloudConfig();
  if (!cfg.url || !cfg.key) throw new Error('La nube no esta configurada');
  const since = cfg.lastPullAt || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const response = await fetch(
    `${cfg.url.replace(/\/+$/, '')}/api/sync/pull?since=${encodeURIComponent(since)}`,
    { headers: { 'x-sync-key': cfg.key } },
  );
  const json = (await response.json().catch(() => null)) as
    | { data?: { attendance?: Array<Record<string, unknown>>; reservations?: Array<Record<string, unknown>> }; message?: string }
    | null;

  if (!response.ok) {
    const message = json?.message || `Error HTTP ${response.status}`;
    await upsertSettings(cfg.orgId, CLOUD, { LAST_ERROR: message.slice(0, 500) });
    throw new Error(message);
  }

  const orgId = cfg.orgId;
  let attendance = 0;
  let reservations = 0;

  for (const a of json?.data?.attendance ?? []) {
    const data: Record<string, unknown> = { ...a, organizationId: orgId };
    delete data.registeredById;
    try {
      await prisma.attendance.upsert({ where: { id: String(a.id) }, create: data as never, update: data as never });
      attendance++;
    } catch {
      /* socio/sede/membresia faltante localmente */
    }
  }

  for (const r of json?.data?.reservations ?? []) {
    const sessionId = String(r.sessionId);
    const memberId = String(r.memberId);
    const status = String(r.status ?? 'RESERVED');
    const createdAt = r.createdAt ? new Date(String(r.createdAt)) : new Date();
    try {
      await prisma.reservation.upsert({
        where: { sessionId_memberId: { sessionId, memberId } },
        create: { id: String(r.id), sessionId, memberId, status, createdAt },
        update: { status },
      });
      reservations++;
    } catch {
      /* sesion/socio faltante localmente */
    }
  }

  await upsertSettings(orgId, CLOUD, { LAST_PULL_AT: new Date().toISOString() });
  return { attendance, reservations };
}

export async function connectCloud(input: {
  url: string;
  organizationName: string;
  slug?: string;
  currency?: string;
  key?: string;
}) {
  const orgId = await localOrgId();
  const base = input.url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('La direccion debe empezar con http:// o https://');

  if (input.key) {
    await upsertSettings(orgId, CLOUD, { SYNC_URL: base, SYNC_KEY: input.key.trim(), ENABLED: 'true' });
  } else {
    const response = await fetch(`${base}/api/sync/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationName: input.organizationName,
        slug: input.slug,
        currency: input.currency,
        ...(env.LICENSE_INSTALLATION_ID ? { installationId: env.LICENSE_INSTALLATION_ID } : {}),
      }),
    });
    const json = (await response.json().catch(() => null)) as
      | { data?: { syncKey?: string; organizationId?: string }; message?: string }
      | null;
    if (!response.ok || !json?.data?.syncKey) {
      throw new Error(json?.message || `No se pudo conectar (HTTP ${response.status})`);
    }
    await upsertSettings(orgId, CLOUD, {
      SYNC_URL: base,
      SYNC_KEY: json.data.syncKey,
      ENABLED: 'true',
      ...(json.data.organizationId ? { CLOUD_ORG_ID: json.data.organizationId } : {}),
    });
  }

  const result = await runCloudSync();
  await runCloudPull().catch(() => undefined);
  return { connected: true, result };
}

export async function disconnectCloud() {
  const orgId = await localOrgId();
  await upsertSettings(orgId, CLOUD, {
    SYNC_URL: '',
    SYNC_KEY: '',
    ENABLED: '',
    CLOUD_ORG_ID: '',
    LAST_PULL_AT: '',
    LAST_ERROR: '',
  });
  return { connected: false };
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Programa un push (con debounce) tras cambios locales. Solo en escritorio. */
export function scheduleCloudSync() {
  if (!env.LICENSE_INSTALLATION_ID) return;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void (async () => {
      try {
        if (!(await ensureCloudConnected())) return;
        const cfg = await getCloudConfig();
        if (!cfg.connected) return;
        await runCloudSync();
        console.log('[cloud-sync] sincronizado');
      } catch (error) {
        console.error('[cloud-sync]', error instanceof Error ? error.message : error);
      }
    })();
  }, 5000);
  timer.unref?.();
}

/** Push periodico de respaldo (solo en escritorio). */
export function startCloudSyncScheduler() {
  if (!env.LICENSE_INSTALLATION_ID) return;
  const run = async () => {
    try {
      if (!(await ensureCloudConnected())) return;
      const cfg = await getCloudConfig();
      if (!cfg.connected) return;
      await runCloudSync();
      await runCloudPull();
    } catch (error) {
      console.error('[cloud-sync]', error instanceof Error ? error.message : error);
    }
  };
  setTimeout(run, 15000);
  setInterval(run, 10 * 60 * 1000);
}





