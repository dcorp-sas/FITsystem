import type { FastifyInstance } from 'fastify';
import { isIP } from 'node:net';
import { fail, ok, HttpError } from '../lib/http.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { requireProviderToken } from './provider.js';
import { rateLimit } from '../lib/ratelimit.js';
import {
  emailProviderInvoice,
  getInvoiceSettingsPublic,
  issuePendingInvoices,
  issueProviderInvoice,
  listProviderInvoices,
  providerInvoiceTest,
  saveInvoiceSettings,
} from '../services/provider-invoicing.js';
import { providerOrgId } from '../services/provider-account.js';

/*
 * Operaciones del Panel de control FS sobre la nube:
 *
 *  - Descargas: quien bajó el instalador, con IP, geolocalización y user-agent.
 *  - Sistemas: matriz de módulos activos por cliente + estado de la plataforma.
 *  - Errores: últimos errores registrados por la API (troubleshooting).
 *  - Facturación: configuración ARCA, emisión, envío por correo y emisión de
 *    comprobantes pendientes de suscripciones ya cobradas.
 *
 * Todo exige el header x-provider-token, igual que el resto de /provider/*.
 */

const DAY_MS = 86_400_000;

export function normalizeDownloadIp(raw: string | undefined | null): string | null {
  const ip = String(raw || '').split(',')[0]?.trim().replace(/^::ffff:/i, '') ?? '';
  const version = isIP(ip);
  if (!version) return null;
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const a = octets[0] ?? 0;
    const b = octets[1] ?? 0;
    // No guardamos loopback, LAN, link-local ni CGNAT.
    if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return null;
  } else {
    const normalized = ip.toLowerCase();
    // No guardamos loopback, ULA ni link-local IPv6.
    if (normalized === '::' || normalized === '::1' || /^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized)) return null;
  }
  return ip.slice(0, 64);
}

interface GeoEntry {
  status?: string;
  message?: string;
  country?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  query?: string;
}

/** Geolocaliza hasta 100 IPs en una sola llamada (endpoint batch de ip-api). */
async function enrichPendingDownloads(limit = 100): Promise<{ ips: number; updated: number; error?: string }> {
  if (!env.IP_API_KEY) {
    return { ips: 0, updated: 0, error: 'Geolocalización deshabilitada: configurá IP_API_KEY con una clave comercial de IP-API.' };
  }
  const rows = await prisma.downloadHit.findMany({
    where: { enriched: false, ip: { not: null } },
    orderBy: { at: 'desc' },
    take: 2000,
    select: { id: true, ip: true },
  });
  const ips = [...new Set(rows.map((r) => r.ip).filter((ip): ip is string => Boolean(ip)))].slice(0, Math.min(100, limit));
  if (!ips.length) return { ips: 0, updated: 0 };
  try {
    const url = new URL('https://pro.ip-api.com/batch');
    url.searchParams.set('fields', 'status,message,country,regionName,city,isp,org,as,query');
    url.searchParams.set('key', env.IP_API_KEY);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ips),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ips: ips.length, updated: 0, error: `ip-api HTTP ${res.status}` };
    const data = (await res.json()) as GeoEntry[];
    const byIp = new Map<string, GeoEntry>();
    for (const entry of data) {
      if (entry?.query) byIp.set(entry.query, entry);
    }
    let updated = 0;
    for (const row of rows) {
      if (!row.ip) continue;
      const geo = byIp.get(row.ip);
      if (!geo) continue;
      await prisma.downloadHit.update({
        where: { id: row.id },
        data: {
          enriched: true,
          country: geo.country?.slice(0, 80) ?? null,
          region: geo.regionName?.slice(0, 80) ?? null,
          city: geo.city?.slice(0, 80) ?? null,
          isp: (geo.isp || geo.org || geo.as || '').slice(0, 120) || null,
        },
      });
      updated++;
    }
    return { ips: ips.length, updated };
  } catch (error) {
    return { ips: ips.length, updated: 0, error: (error as Error).message };
  }
}

function buildDownloadSummary(rows: Array<{ ip: string | null; asset: string; source: string; country: string | null; isp: string | null }>) {
  const uniqueIps = new Set(rows.map((r) => r.ip).filter(Boolean) as string[]);
  const count = (values: Array<string | null>) => {
    const map = new Map<string, number>();
    for (const value of values) map.set(value || 'sin datos', (map.get(value || 'sin datos') ?? 0) + 1);
    return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  };
  return {
    total: rows.length,
    uniqueIps: uniqueIps.size,
    byAsset: count(rows.map((r) => r.asset)),
    bySource: count(rows.map((r) => r.source)),
    byCountry: count(rows.map((r) => r.country)),
    byIsp: count(rows.map((r) => r.isp)).slice(0, 12),
  };
}

interface SystemModule {
  id: string;
  label: string;
  active: boolean;
  detail: string;
}

export function providerOpsRoutes(app: FastifyInstance) {
  app.post('/provider/marketing/brevo', { onRequest: [rateLimit({ max: 180, windowMs: 60_000, keyPrefix: 'provider-brevo-proxy' })] }, async (request, reply) => {
    try {
      requireProviderToken(request);
      if (!env.PLATFORM_BREVO_API_KEY) throw new HttpError(503, 'Brevo no está configurado en el servidor');
      const input = (request.body ?? {}) as { method?: unknown; path?: unknown; body?: unknown };
      const method = String(input.method ?? 'GET').toUpperCase();
      const pathname = String(input.path ?? '');
      if (!pathname.startsWith('/') || pathname.length > 300 || pathname.includes('..') || pathname.includes('//')) {
        throw new HttpError(400, 'Ruta de Brevo inválida');
      }
      const pathOnly = pathname.split('?')[0] ?? '';
      const allowedGet = /^\/(account|senders|contacts(?:\/.*)?|emailCampaigns(?:\/.*)?)$/.test(pathOnly);
      const allowedPost = pathOnly === '/contacts' || pathOnly === '/contacts/lists' || /^\/emailCampaigns\/\d+\/sendNow$/.test(pathOnly);
      if (!(method === 'GET' && allowedGet) && !(method === 'POST' && allowedPost)) {
        throw new HttpError(400, 'Operación de Brevo no habilitada desde el panel');
      }
      const upstream = await fetch(`https://api.brevo.com/v3${pathname}`, {
        method,
        headers: { 'api-key': env.PLATFORM_BREVO_API_KEY, accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify(input.body ?? {}) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await upstream.text();
      let data: unknown = null;
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 500) }; }
      if (!upstream.ok) {
        const message = (data as { message?: string })?.message || `Brevo HTTP ${upstream.status}`;
        return reply.code(502).send({ error: 'BrevoError', message });
      }
      return ok(reply, data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/diagnostics/database', async (request, reply) => {
    const startedAt = Date.now();
    try {
      requireProviderToken(request);
      await prisma.$queryRaw`SELECT 1`;
      return ok(reply, { ok: true, latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() });
    } catch (error) {
      return fail(reply, error);
    }
  });

  /* ----------------------- Latidos de escritorio ----------------------- */

  app.post('/provider/desktop/heartbeat', { onRequest: [rateLimit({ max: 30, windowMs: 60_000, keyPrefix: 'desktop-heartbeat' })] }, async (request, reply) => {
    try {
      const input = (request.body ?? {}) as Record<string, unknown>;
      const installationId = String(input.installationId ?? '').trim();
      const appVersion = String(input.appVersion ?? '').trim();
      if (!/^inst_[a-f0-9]{32}$/i.test(installationId)) throw new HttpError(400, 'ID de instalación inválido');
      if (!appVersion || appVersion.length > 32) throw new HttpError(400, 'Versión de aplicación inválida');
      const licensePlan = input.licensePlan == null ? null : String(input.licensePlan).slice(0, 32);
      const licenseStatus = input.licenseStatus == null ? null : String(input.licenseStatus).slice(0, 32);
      const licenseKnown = Boolean(input.licenseKnown);
      const hasLicense = Boolean(input.hasLicense);
      const parsedExpiry = input.licenseExpiresAt == null ? null : new Date(String(input.licenseExpiresAt));
      if (parsedExpiry && Number.isNaN(parsedExpiry.getTime())) throw new HttpError(400, 'Vencimiento de licencia inválido');
      const now = new Date();
      await prisma.desktopHeartbeat.upsert({
        where: { installationId },
        create: { installationId, appVersion, licensePlan, licenseStatus, licenseKnown, hasLicense, licenseExpiresAt: parsedExpiry, lastSeenAt: now },
        update: { appVersion, licensePlan, licenseStatus, licenseKnown, hasLicense, licenseExpiresAt: parsedExpiry, lastSeenAt: now },
      });
      return ok(reply, { received: true, at: now.toISOString() });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/desktop/installations', async (request, reply) => {
    try {
      requireProviderToken(request);
      const rows = await prisma.desktopHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 1000 });
      const cutoff = Date.now() - 24 * 60 * 60_000;
      const installations = rows.map((row) => ({
        installationId: row.installationId,
        appVersion: row.appVersion,
        licensePlan: row.licensePlan,
        licenseStatus: row.licenseStatus,
        licenseKnown: row.licenseKnown,
        hasLicense: row.hasLicense,
        licenseExpiresAt: row.licenseExpiresAt?.toISOString() ?? null,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        active: row.lastSeenAt.getTime() >= cutoff,
      }));
      return ok(reply, {
        generatedAt: new Date().toISOString(),
        total: installations.length,
        active: installations.filter((row) => row.active).length,
        installations,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  /* ------------------------------ Descargas ------------------------------ */

  app.get('/provider/downloads', async (request, reply) => {
    try {
      requireProviderToken(request);
      const query = (request.query ?? {}) as { days?: string; limit?: string };
      const days = Math.min(365, Math.max(1, Number(query.days) || 90));
      const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
      const since = new Date(Date.now() - days * DAY_MS);
      const [rows, total, allForSummary] = await Promise.all([
        prisma.downloadHit.findMany({ where: { at: { gte: since } }, orderBy: { at: 'desc' }, take: limit }),
        prisma.downloadHit.count({ where: { at: { gte: since } } }),
        prisma.downloadHit.findMany({
          where: { at: { gte: since } },
          select: { ip: true, asset: true, source: true, country: true, isp: true },
        }),
      ]);
      return ok(reply, {
        days,
        total,
        geolocation: { configured: Boolean(env.IP_API_KEY), provider: 'IP-API Pro' },
        summary: buildDownloadSummary(allForSummary),
        rows: rows.map((row) => ({
          id: row.id,
          asset: row.asset,
          source: row.source,
          ip: row.ip,
          userAgent: row.userAgent,
          referer: row.referer,
          country: row.country,
          region: row.region,
          city: row.city,
          isp: row.isp,
          enriched: row.enriched,
          at: row.at.toISOString(),
        })),
        pendingEnrichment: allForSummary.length
          ? await prisma.downloadHit.count({ where: { enriched: false, ip: { not: null } } })
          : 0,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/downloads/enrich', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { limit } = (request.body ?? {}) as { limit?: number };
      return ok(reply, await enrichPendingDownloads(Number(limit) || 100));
    } catch (error) {
      return fail(reply, error);
    }
  });

  /* ------------------------------- Sistemas ------------------------------- */

  app.get('/provider/systems', async (request, reply) => {
    try {
      requireProviderToken(request);
      const providerId = await providerOrgId();
      const orgs = await prisma.organization.findMany({
        where: { id: { not: providerId }, NOT: { slug: { startsWith: '__' } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
      });

      const group = async <T extends Record<string, unknown>>(
        model: keyof typeof prisma,
        args: unknown,
      ): Promise<T[]> => (prisma[model] as unknown as { groupBy: (a: unknown) => Promise<T[]> }).groupBy(args);

      const [users, members, activeMembers, branches, payments, attendance, classes, products, portal, portalActive, whatsapp, licenses, errors, settingsRows, subs] =
        await Promise.all([
          group<{ organizationId: string; _count: { _all: number } }>('user', {
            by: ['organizationId'],
            where: { isActive: true },
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('member', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('member', {
            by: ['organizationId'],
            where: { status: 'ACTIVE' },
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('branch', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number }; _max: { paidAt: Date | null } }>('payment', {
            by: ['organizationId'],
            _count: { _all: true },
            _max: { paidAt: true },
          }),
          group<{ organizationId: string; _count: { _all: number }; _max: { checkedInAt: Date | null } }>('attendance', {
            by: ['organizationId'],
            _count: { _all: true },
            _max: { checkedInAt: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('gymClass', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('product', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('portalAccount', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('portalAccount', {
            by: ['organizationId'],
            where: { isActive: true },
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('whatsAppAuth', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          prisma.license.groupBy({
            by: ['organizationId'],
            where: { organizationId: { not: null } },
            _count: { _all: true },
          }),
          prisma.errorLog.groupBy({
            by: ['organizationId'],
            where: { organizationId: { not: null }, createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } },
            _count: { _all: true },
          }),
          prisma.setting.findMany({
            where: { category: { in: ['ARCA', 'SMTP', 'SYNC', 'CLOUD', 'MERCADOPAGO'] } },
            select: { organizationId: true, category: true, key: true, value: true, isSecret: true },
          }),
          prisma.planSubscription.findMany({
            where: { organizationId: { not: null } },
            select: { organizationId: true, status: true, externalRef: true },
          }),
        ]);

      const mapCount = (rows: Array<{ organizationId?: string | null; _count: { _all: number } }>) => {
        const map = new Map<string, number>();
        for (const row of rows) if (row.organizationId) map.set(row.organizationId, row._count._all);
        return map;
      };
      const counts = {
        users: mapCount(users as never),
        members: mapCount(members as never),
        activeMembers: mapCount(activeMembers as never),
        branches: mapCount(branches as never),
        payments: mapCount(payments as never),
        attendance: mapCount(attendance as never),
        classes: mapCount(classes as never),
        products: mapCount(products as never),
        portal: mapCount(portal as never),
        portalActive: mapCount(portalActive as never),
        whatsapp: mapCount(whatsapp as never),
        licenses: mapCount(
          licenses.map((l) => ({ organizationId: l.organizationId, _count: l._count })) as never,
        ),
        errors: mapCount(
          errors.map((e) => ({ organizationId: e.organizationId, _count: e._count })) as never,
        ),
      };
      const lastPayment = new Map<string, Date | null>();
      for (const row of payments as never as Array<{ organizationId: string; _max: { paidAt: Date | null } }>) {
        lastPayment.set(row.organizationId, row._max.paidAt);
      }
      const lastAttendance = new Map<string, Date | null>();
      for (const row of attendance as never as Array<{ organizationId: string; _max: { checkedInAt: Date | null } }>) {
        lastAttendance.set(row.organizationId, row._max.checkedInAt);
      }

      const settingsByOrg = new Map<string, Map<string, string>>();
      for (const row of settingsRows) {
        if (!settingsByOrg.has(row.organizationId)) settingsByOrg.set(row.organizationId, new Map());
        settingsByOrg.get(row.organizationId)!.set(`${row.category}.${row.key}`, row.isSecret ? '•' : (row.value ?? ''));
      }
      const subsByOrg = new Map<string, Array<{ status: string; externalRef: string }>>();
      for (const sub of subs) {
        if (!sub.organizationId) continue;
        if (!subsByOrg.has(sub.organizationId)) subsByOrg.set(sub.organizationId, []);
        subsByOrg.get(sub.organizationId)!.push({ status: sub.status, externalRef: sub.externalRef });
      }

      const clients = orgs.map((org) => {
        const s = settingsByOrg.get(org.id) ?? new Map<string, string>();
        const lastPushAt = s.get('SYNC.LAST_PUSH_AT') || null;
        const syncError = s.get('SYNC.LAST_ERROR') || null;
        const orgSubs = subsByOrg.get(org.id) ?? [];
        const activeSub = orgSubs.find((sub) => sub.status === 'ACTIVE');
        const modules: SystemModule[] = [
          {
            id: 'desktop',
            label: 'Escritorio / sincronización',
            active: Boolean(lastPushAt),
            detail: lastPushAt ? `Último push ${lastPushAt}` : 'Nunca sincronizó',
          },
          {
            id: 'socios',
            label: 'App de socios (PWA)',
            active: (counts.portalActive.get(org.id) ?? 0) > 0,
            detail: `${counts.portalActive.get(org.id) ?? 0} activas / ${counts.portal.get(org.id) ?? 0} cuentas`,
          },
          {
            id: 'whatsapp',
            label: 'WhatsApp',
            active: (counts.whatsapp.get(org.id) ?? 0) > 0,
            detail: (counts.whatsapp.get(org.id) ?? 0) > 0 ? 'Sesión vinculada' : 'Sin vincular',
          },
          {
            id: 'arca',
            label: 'Facturación ARCA',
            active: s.get('ARCA.ENABLED') === 'true',
            detail: s.get('ARCA.ENABLED') === 'true' ? `CUIT ${s.get('ARCA.CUIT') || '—'}` : 'Desactivada',
          },
          {
            id: 'email',
            label: 'Correo (SMTP)',
            active: Boolean(s.get('SMTP.SMTP_HOST')),
            detail: s.get('SMTP.SMTP_HOST') || 'Sin configurar',
          },
          {
            id: 'mercadopago',
            label: 'MercadoPago',
            active: Boolean(s.get('MERCADOPAGO.ACCESS_TOKEN')),
            detail: s.get('MERCADOPAGO.ACCESS_TOKEN') ? 'Credencial cargada' : 'Sin configurar',
          },
          {
            id: 'suscripcion',
            label: 'Suscripción FIT System',
            active: Boolean(activeSub),
            detail: activeSub ? activeSub.status : orgSubs[0]?.status || 'Sin suscripción',
          },
          {
            id: 'licencia',
            label: 'Licencia local',
            active: (counts.licenses.get(org.id) ?? 0) > 0,
            detail: `${counts.licenses.get(org.id) ?? 0} registro(s)`,
          },
        ];
        const lastActivityAt = [lastPayment.get(org.id), lastAttendance.get(org.id), lastPushAt]
          .filter(Boolean)
          .map((value) => new Date(value as string | Date).getTime())
          .filter((n) => !Number.isNaN(n));
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          isActive: org.isActive,
          createdAt: org.createdAt.toISOString(),
          lastActivityAt: lastActivityAt.length ? new Date(Math.max(...lastActivityAt)).toISOString() : null,
          sync: { lastPushAt, lastError: syncError },
          counts: {
            users: counts.users.get(org.id) ?? 0,
            members: counts.members.get(org.id) ?? 0,
            activeMembers: counts.activeMembers.get(org.id) ?? 0,
            branches: counts.branches.get(org.id) ?? 0,
            payments: counts.payments.get(org.id) ?? 0,
            attendance: counts.attendance.get(org.id) ?? 0,
            classes: counts.classes.get(org.id) ?? 0,
            products: counts.products.get(org.id) ?? 0,
            errors7d: counts.errors.get(org.id) ?? 0,
            portalAccounts: counts.portal.get(org.id) ?? 0,
            activePortalAccounts: counts.portalActive.get(org.id) ?? 0,
          },
          modules,
        };
      });

      return ok(reply, {
        generatedAt: new Date().toISOString(),
        platform: [
          { id: 'api', name: 'API de la nube', status: 'no medido', detail: env.PUBLIC_URL || 'api.fitsystem.com.ar' },
          { id: 'web', name: 'Sitio web / tienda', status: 'no medido', detail: env.SITE_URL },
          { id: 'panel', name: 'Panel de control FS', status: 'no medido', detail: 'Aplicación de escritorio; la API no recibe una señal de disponibilidad' },
          {
            id: 'licensador',
            name: 'Licensador',
            status: env.LICENSE_SERVER ? 'configurado' : 'sin configurar',
            detail: env.LICENSE_SERVER || 'Definí LICENSE_SERVER',
          },
          {
            id: 'whatsapp',
            name: 'WhatsApp (Baileys)',
            status: clients.some((c) => c.modules.find((m) => m.id === 'whatsapp')?.active) ? 'con sesiones' : 'sin sesiones',
            detail: 'Sesiones por gimnasio',
          },
          {
            id: 'arca',
            name: 'Facturación ARCA',
            status: (await getInvoiceSettingsPublic().catch(() => null))?.enabled ? 'habilitada' : 'deshabilitada',
            detail: 'Comprobantes de suscripciones',
          },
        ],
        totals: {
          clients: clients.length,
          withSync: clients.filter((c) => c.sync.lastPushAt).length,
          withErrors: clients.filter((c) => c.counts.errors7d > 0).length,
        },
        clients,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/errors', async (request, reply) => {
    try {
      requireProviderToken(request);
      const query = (request.query ?? {}) as { limit?: string; orgId?: string; level?: string };
      const limit = Math.min(300, Math.max(1, Number(query.limit) || 100));
      const providerId = await providerOrgId();
      const rows = await prisma.errorLog.findMany({
        where: {
          organizationId: query.orgId ? query.orgId : { not: providerId },
          ...(query.level ? { level: query.level } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const orgIds = [...new Set(rows.map((r) => r.organizationId).filter(Boolean) as string[])];
      const orgs = orgIds.length
        ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
        : [];
      const names = new Map(orgs.map((o) => [o.id, o.name]));
      return ok(reply, {
        rows: rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          organizationName: row.organizationId ? names.get(row.organizationId) ?? '—' : 'Plataforma',
          level: row.level,
          message: row.message,
          path: row.path,
          method: row.method,
          statusCode: row.statusCode,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  /* ------------------------------ Facturación ------------------------------ */

  app.get('/provider/invoice-config', async (request, reply) => {
    try {
      requireProviderToken(request);
      return ok(reply, await getInvoiceSettingsPublic());
    } catch (error) {
      return fail(reply, error);
    }
  });

  // El panel admite certificados PKCS#12 de hasta 10 MiB. En JSON/base64
  // ocupan alrededor de 13.4 MiB, por eso esta ruta necesita un límite propio.
  app.put('/provider/invoice-config', { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    try {
      requireProviderToken(request);
      return ok(reply, await saveInvoiceSettings((request.body ?? {}) as never));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/invoice-config/test', async (request, reply) => {
    try {
      requireProviderToken(request);
      return ok(reply, await providerInvoiceTest());
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/invoices', async (request, reply) => {
    try {
      requireProviderToken(request);
      const query = (request.query ?? {}) as { limit?: string };
      return ok(reply, { invoices: await listProviderInvoices(Number(query.limit) || 100) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/invoices', async (request, reply) => {
    try {
      requireProviderToken(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (!body.subscriptionRef && !body.amount) throw new HttpError(400, 'Indicá una suscripción o un importe');
      const invoice = await issueProviderInvoice({
        subscriptionRef: body.subscriptionRef ? String(body.subscriptionRef) : undefined,
        buyerName: body.buyerName ? String(body.buyerName) : undefined,
        buyerEmail: body.buyerEmail ? String(body.buyerEmail) : undefined,
        buyerDocType: body.buyerDocType !== undefined ? Number(body.buyerDocType) : undefined,
        buyerDocNro: body.buyerDocNro ? String(body.buyerDocNro) : undefined,
        amount: body.amount !== undefined ? Number(body.amount) : undefined,
        currency: body.currency ? String(body.currency) : undefined,
        invoiceType: body.invoiceType ? String(body.invoiceType) : undefined,
        sendEmail: Boolean(body.sendEmail),
        force: Boolean(body.force),
      });
      return ok(reply, invoice);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/invoices/:id/email', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { id } = request.params as { id: string };
      return ok(reply, await emailProviderInvoice(id));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/invoices/pending', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { limit } = (request.body ?? {}) as { limit?: number };
      return ok(reply, await issuePendingInvoices(Number(limit) || 10));
    } catch (error) {
      return fail(reply, error);
    }
  });
}
