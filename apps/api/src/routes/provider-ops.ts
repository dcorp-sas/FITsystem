import type { FastifyInstance } from 'fastify';
import { isIP } from 'node:net';
import { fail, ok, HttpError } from '../lib/http.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { requireProviderToken } from './provider.js';
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
  const rows = await prisma.downloadHit.findMany({
    where: { enriched: false, ip: { not: null } },
    orderBy: { at: 'desc' },
    take: 2000,
    select: { id: true, ip: true },
  });
  const ips = [...new Set(rows.map((r) => r.ip).filter((ip): ip is string => Boolean(ip)))].slice(0, Math.min(100, limit));
  if (!ips.length) return { ips: 0, updated: 0 };
  try {
    const res = await fetch('http://ip-api.com/batch?fields=status,message,country,regionName,city,isp,org,as,query', {
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

      const [users, members, activeMembers, branches, payments, attendance, classes, products, portal, whatsapp, licenses, errors, settingsRows, subs] =
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
            active: (counts.portal.get(org.id) ?? 0) > 0,
            detail: `${counts.portal.get(org.id) ?? 0} cuentas`,
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
          },
          modules,
        };
      });

      return ok(reply, {
        generatedAt: new Date().toISOString(),
        platform: [
          { id: 'api', name: 'API de la nube', status: 'online', detail: env.PUBLIC_URL || 'api.fitsystem.com.ar' },
          { id: 'web', name: 'Sitio web / tienda', status: 'online', detail: env.SITE_URL },
          { id: 'panel', name: 'Panel de control FS', status: 'online', detail: 'Cliente de escritorio' },
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
