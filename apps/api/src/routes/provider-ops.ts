import type { FastifyInstance } from 'fastify';
import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
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
import { generateActivationCode } from '../services/portal-account.js';
import { getWhatsAppRuntimeStatus } from '../services/whatsapp-client.js';
import { ensureCloudConnected, getCloudConfig, runCloudPull, runCloudSync } from '../services/cloud-sync.js';

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
const caseSlaHours = (priority: string) => priority === 'URGENT' ? 1 : priority === 'HIGH' ? 4 : priority === 'LOW' ? 72 : 24;

async function probeHttpService(url: string): Promise<{ status: 'online' | 'offline' | 'sin configurar'; detail: string }> {
  if (!url) return { status: 'sin configurar', detail: 'Falta la dirección del servicio' };
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(7_000) });
    return { status: response.ok ? 'online' : 'offline', detail: `HTTP ${response.status} · ${Date.now() - started} ms` };
  } catch (error) {
    return { status: 'offline', detail: (error as Error).message.slice(0, 180) };
  }
}

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

/** Geolocaliza las IPs pendientes; prefiere IP-API Pro y tiene un fallback gratuito con atribución. */
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
    const byIp = new Map<string, GeoEntry>();
    const failures: string[] = [];
    if (env.IP_API_KEY) {
      const url = new URL('https://pro.ip-api.com/batch');
      url.searchParams.set('fields', 'status,message,country,regionName,city,isp,org,as,query');
      url.searchParams.set('key', env.IP_API_KEY);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ips),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ips: ips.length, updated: 0, error: `IP-API Pro HTTP ${res.status}` };
      for (const entry of (await res.json()) as GeoEntry[]) if (entry?.query && entry.status === 'success') byIp.set(entry.query, entry);
    } else {
      // IPData permite uso comercial con atribución, sin clave, y limita
      // la precisión ciudad a 1.000 búsquedas por día por IP de salida.
      for (let i = 0; i < ips.length; i += 8) {
        await Promise.all(ips.slice(i, i + 8).map(async (ip) => {
          try {
            const res = await fetch(`https://ipdata.free/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(8_000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const geo = (await res.json()) as { ip?: string; country?: string; region?: string; city?: string; org?: string; asn?: string };
            if (geo.ip !== ip) throw new Error('respuesta sin coincidencia de IP');
            byIp.set(ip, { query: ip, status: 'success', country: geo.country, regionName: geo.region, city: geo.city, org: geo.org, as: geo.asn });
          } catch (error) {
            failures.push(`${ip}: ${(error as Error).message}`);
          }
        }));
      }
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
    return { ips: ips.length, updated, ...(failures.length ? { error: `${failures.length} IP(s) no se pudieron consultar: ${failures.slice(0, 3).join('; ')}` } : {}) };
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
  app.post('/provider/diagnostics/snapshots', { onRequest: [rateLimit({ max: 30, windowMs: 60_000, keyPrefix: 'provider-health-snapshot' })] }, async (request, reply) => {
    try {
      requireProviderToken(request);
      const input = (request.body ?? {}) as { source?: unknown; checks?: unknown; alerts?: unknown };
      const checks = Array.isArray(input.checks) ? input.checks.slice(0, 40) : [];
      const alerts = Array.isArray(input.alerts) ? input.alerts.slice(0, 100) : [];
      if (!checks.length) throw new HttpError(400, 'El diagnóstico no contiene mediciones');
      const safeChecks = checks.map((item) => {
        const row = item as Record<string, unknown>;
        const status = String(row.status ?? 'skip');
        if (!['ok', 'warn', 'fail', 'skip'].includes(status)) throw new HttpError(400, 'Estado de medición inválido');
        return { name: String(row.name ?? 'Servicio').slice(0, 100), status, detail: String(row.detail ?? '').slice(0, 500) };
      });
      const safeAlerts = alerts.map((item) => {
        const row = item as Record<string, unknown>;
        const level = String(row.level ?? 'info');
        if (!['crit', 'warn', 'info'].includes(level)) throw new HttpError(400, 'Nivel de alerta inválido');
        return { area: String(row.area ?? 'General').slice(0, 100), title: String(row.title ?? 'Incidencia').slice(0, 180), detail: String(row.detail ?? '').slice(0, 700), level };
      });
      const now = new Date();
      const source = String(input.source ?? 'panel').slice(0, 40);
      await prisma.providerHealthSnapshot.create({ data: { source, checks: JSON.stringify(safeChecks), alerts: JSON.stringify(safeAlerts), capturedAt: now } });

      const activeAlerts = safeAlerts.filter((alert) => alert.level === 'crit' || alert.level === 'warn');
      const fingerprints = activeAlerts.map((alert) => createHash('sha256')
        .update(`${alert.area}|${alert.title.toLocaleLowerCase().replace(/[0-9]+(?:[.,][0-9]+)?%?/g, '#')}`)
        .digest('hex'));
      const open = await prisma.providerHealthIncident.findMany({ where: { status: 'OPEN' }, select: { fingerprint: true, title: true } });
      const activeSet = new Set(fingerprints);
      // El monitor VPS es autoridad para sus propios incidentes. Un chequeo
      // del escritorio no puede resolver una falla que sigue ocurriendo en la VPS.
      const recovered = open.filter((incident) => !incident.fingerprint.startsWith('srv:') && !activeSet.has(incident.fingerprint));
      if (recovered.length) await prisma.providerHealthIncident.updateMany({
        where: { fingerprint: { in: recovered.map((incident) => incident.fingerprint) }, status: 'OPEN' },
        data: { status: 'RESOLVED', resolvedAt: now, lastSeenAt: now },
      });

      const prior = new Set(open.map((incident) => incident.fingerprint));
      for (let i = 0; i < activeAlerts.length; i++) {
        const alert = activeAlerts[i]!;
        const fingerprint = fingerprints[i]!;
        await prisma.providerHealthIncident.upsert({
          where: { fingerprint },
          create: { fingerprint, area: alert.area, title: alert.title, detail: alert.detail, level: alert.level, status: 'OPEN', occurrences: 1, firstSeenAt: now, lastSeenAt: now },
          update: { area: alert.area, title: alert.title, detail: alert.detail, level: alert.level, status: 'OPEN', occurrences: { increment: 1 }, lastSeenAt: now, resolvedAt: null },
        });
      }
      // Retención acotada para que el historial no crezca sin límite.
      if (now.getUTCMinutes() < 5) {
        const cutoff = new Date(now.getTime() - 30 * DAY_MS);
        await prisma.providerHealthSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } });
        await prisma.providerHealthIncident.deleteMany({ where: { status: 'RESOLVED', resolvedAt: { lt: cutoff } } });
      }
      return ok(reply, {
        capturedAt: now.toISOString(),
        newIncidents: activeAlerts.filter((_, index) => !prior.has(fingerprints[index]!)),
        recovered: recovered.map((incident) => incident.title),
        openCount: activeSet.size,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/diagnostics/history', async (request, reply) => {
    try {
      requireProviderToken(request);
      const query = (request.query ?? {}) as { hours?: string; limit?: string };
      const hours = Math.min(720, Math.max(1, Number(query.hours) || 168));
      const limit = Math.min(6000, Math.max(1, Number(query.limit) || 4500));
      const since = new Date(Date.now() - hours * 60 * 60_000);
      const [snapshots, incidents] = await Promise.all([
        prisma.providerHealthSnapshot.findMany({ where: { capturedAt: { gte: since } }, orderBy: { capturedAt: 'desc' }, take: limit }),
        prisma.providerHealthIncident.findMany({ orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }], take: 300 }),
      ]);
      return ok(reply, {
        generatedAt: new Date().toISOString(),
        hours,
        snapshots: snapshots.map((row) => ({ id: row.id, source: row.source, capturedAt: row.capturedAt.toISOString(), checks: JSON.parse(row.checks), alerts: JSON.parse(row.alerts) })),
        incidents: incidents.map((row) => ({ fingerprint: row.fingerprint, area: row.area, title: row.title, detail: row.detail, level: row.level, status: row.status, occurrences: row.occurrences, firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/provider/support/cases', async (request, reply) => {
    try {
      requireProviderToken(request);
      const legacyCases = await prisma.providerSupportCase.findMany({
        where: { dueAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } }, select: { id: true, priority: true, createdAt: true, status: true }, take: 500,
      });
      if (legacyCases.length) await prisma.$transaction(legacyCases.map((item) => prisma.providerSupportCase.update({
        where: { id: item.id }, data: {
          dueAt: new Date(item.createdAt.getTime() + caseSlaHours(item.priority) * 60 * 60_000),
          ...(item.status === 'OPEN' ? {} : { firstResponseAt: item.createdAt }),
        },
      })));
      const query = (request.query ?? {}) as { status?: string; priority?: string; assignedTo?: string; organizationId?: string; q?: string; overdue?: string; limit?: string };
      const limit = Math.min(200, Math.max(1, Number(query.limit) || 100));
      const status = String(query.status || '').toUpperCase();
      const priority = String(query.priority || '').toUpperCase();
      const search = String(query.q || '').trim().slice(0, 120);
      const where = {
        ...(status && ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].includes(status) ? { status } : {}),
        ...(priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) ? { priority } : {}),
        ...(query.assignedTo ? { assignedTo: { contains: String(query.assignedTo).slice(0, 120) } } : {}),
        ...(query.organizationId ? { organizationId: String(query.organizationId).slice(0, 120) } : {}),
        ...(search ? { OR: ['title', 'summary', 'clientName', 'installationId'].map((field) => ({ [field]: { contains: search } })) } : {}),
        ...(query.overdue === 'true' ? { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] }, dueAt: { lt: new Date() } } : {}),
      };
      const cases = await prisma.providerSupportCase.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { updatedAt: 'desc' }], take: limit,
        include: { events: { orderBy: { createdAt: 'desc' }, take: 50 } },
      });
      return ok(reply, { generatedAt: new Date().toISOString(), cases });
    } catch (error) { return fail(reply, error); }
  });

  app.get('/provider/clients/:organizationId/telemetry', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { organizationId } = request.params as { organizationId: string };
      const query = (request.query ?? {}) as { limit?: string };
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 40));
      const [events, versions, incidents] = await Promise.all([prisma.clientTelemetryEvent.findMany({
        where: { organizationId }, orderBy: { createdAt: 'desc' }, take: limit,
        select: { id: true, source: true, appVersion: true, eventType: true, screen: true, requestPath: true, fingerprint: true, statusCode: true, durationMs: true, message: true, stack: true, createdAt: true },
      }), prisma.clientTelemetryEvent.groupBy({
        by: ['source', 'appVersion'], where: { organizationId, appVersion: { not: null } },
        _max: { createdAt: true }, _count: { _all: true }, orderBy: { _max: { createdAt: 'desc' } }, take: 30,
      }), prisma.clientTelemetryEvent.groupBy({
        by: ['fingerprint', 'source', 'appVersion', 'eventType', 'requestPath', 'statusCode'],
        where: { organizationId, eventType: { not: 'screen' }, fingerprint: { not: null } },
        _min: { createdAt: true }, _max: { createdAt: true }, _count: { _all: true },
        orderBy: [{ _count: { fingerprint: 'desc' } }, { _max: { createdAt: 'desc' } }], take: 50,
      })]);
      return ok(reply, { organizationId, events, versions, incidents });
    } catch (error) { return fail(reply, error); }
  });

  app.post('/provider/support/cases', async (request, reply) => {
    try {
      requireProviderToken(request);
      const input = (request.body ?? {}) as Record<string, unknown>;
      const title = String(input.title ?? '').trim().slice(0, 180);
      if (!title) throw new HttpError(400, 'El caso necesita un título');
      const priority = String(input.priority ?? 'NORMAL').toUpperCase();
      if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) throw new HttpError(400, 'Prioridad inválida');
      const message = String(input.message ?? input.summary ?? '').trim().slice(0, 4000);
      const actor = String(input.actor || 'Panel FS').trim().slice(0, 120) || 'Panel FS';
      const supportCase = await prisma.providerSupportCase.create({
        data: {
          organizationId: input.organizationId ? String(input.organizationId).slice(0, 120) : null,
          installationId: input.installationId ? String(input.installationId).slice(0, 120) : null,
          clientName: input.clientName ? String(input.clientName).slice(0, 160) : null,
          title, summary: message, priority,
          dueAt: new Date(Date.now() + caseSlaHours(priority) * 60 * 60_000),
          assignedTo: input.assignedTo ? String(input.assignedTo).slice(0, 120) : null,
          events: { create: { kind: 'CREATED', actor, message: message || 'Caso creado desde el Panel FS.' } },
        },
        include: { events: true },
      });
      return ok(reply, { supportCase }, 201);
    } catch (error) { return fail(reply, error); }
  });

  app.patch('/provider/support/cases/:id', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { id } = request.params as { id: string };
      const input = (request.body ?? {}) as Record<string, unknown>;
      const actor = String(input.actor || 'Panel FS').trim().slice(0, 120) || 'Panel FS';
      const current = await prisma.providerSupportCase.findUnique({ where: { id } });
      if (!current) throw new HttpError(404, 'Caso no encontrado');
      const data: Record<string, unknown> = {};
      const events: Array<{ kind: string; message: string; details?: string }> = [];
      if (input.status !== undefined) {
        const status = String(input.status).toUpperCase();
        if (!['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Estado de caso inválido');
        if (status !== current.status) {
          if (['RESOLVED', 'CLOSED'].includes(status) && input.recoveryVerified !== true && !current.verifiedAt) throw new HttpError(400, 'Antes de resolver o cerrar, confirmá la recuperación y registrá qué comprobaste');
          data.status = status;
          data.resolvedAt = ['RESOLVED', 'CLOSED'].includes(status) ? new Date() : null;
          if (['OPEN', 'IN_PROGRESS', 'WAITING'].includes(status) && ['RESOLVED', 'CLOSED'].includes(current.status)) {
            data.verifiedAt = null;
            data.verificationNote = null;
            data.dueAt = new Date(Date.now() + caseSlaHours(current.priority) * 60 * 60_000);
            data.firstResponseAt = null;
          }
          events.push({ kind: 'STATUS', message: `Estado cambiado a ${status}.` });
        }
      }
      if (input.recoveryVerified === true) {
        const effectiveStatus = String(input.status ?? current.status).toUpperCase();
        if (!['RESOLVED', 'CLOSED'].includes(effectiveStatus)) throw new HttpError(400, 'La recuperación solo se puede confirmar al resolver o cerrar el caso');
        const note = String(input.verificationNote || '').trim().slice(0, 2000);
        if (note.length < 8) throw new HttpError(400, 'Describí brevemente cómo confirmaste que el problema quedó resuelto');
        data.verifiedAt = new Date();
        data.verificationNote = note;
        events.push({ kind: 'RECOVERY_VERIFIED', message: `Recuperación comprobada: ${note}` });
      }
      if (input.priority !== undefined) {
        const priority = String(input.priority).toUpperCase();
        if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) throw new HttpError(400, 'Prioridad inválida');
        if (priority !== current.priority) {
          data.priority = priority;
          if (!['RESOLVED', 'CLOSED'].includes(current.status)) data.dueAt = new Date(Date.now() + caseSlaHours(priority) * 60 * 60_000);
          events.push({ kind: 'PRIORITY', message: `Prioridad cambiada a ${priority}. Nuevo objetivo de respuesta: ${caseSlaHours(priority)} h.` });
        }
      }
      if (input.assignedTo !== undefined) {
        const assignedTo = String(input.assignedTo || '').trim().slice(0, 120) || null;
        if (assignedTo !== current.assignedTo) { data.assignedTo = assignedTo; events.push({ kind: 'ASSIGNMENT', message: assignedTo ? `Asignado a ${assignedTo}.` : 'Se quitó la asignación.' }); }
      }
      if (input.message !== undefined) {
        const message = String(input.message || '').trim().slice(0, 4000);
        if (message) {
          events.push({ kind: 'NOTE', message });
          if (!current.firstResponseAt) data.firstResponseAt = new Date();
        }
      }
      if (input.status !== undefined && ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].includes(String(input.status).toUpperCase()) && !current.firstResponseAt) data.firstResponseAt = new Date();
      if (input.diagnostics !== undefined) {
        if (!input.diagnostics || typeof input.diagnostics !== 'object' || Array.isArray(input.diagnostics)) throw new HttpError(400, 'El paquete de diagnóstico no tiene un formato válido');
        const diagnostics = input.diagnostics as Record<string, unknown>;
        if (diagnostics.reportType !== 'FIT_SYSTEM_DIAGNOSTICS') throw new HttpError(400, 'El archivo no es un paquete de diagnóstico de FIT System');
        const reportInstallationId = String(diagnostics.installationId || '');
        if (current.installationId && reportInstallationId && current.installationId !== reportInstallationId) throw new HttpError(409, 'El paquete corresponde a otra instalación');
        const details = JSON.stringify(diagnostics);
        if (details.length > 20_000) throw new HttpError(413, 'El paquete supera el tamaño permitido');
        events.push({ kind: 'DIAGNOSTIC', message: `Paquete importado · capturado ${String(diagnostics.capturedAt || 'sin fecha')}.`, details });
        if (!current.firstResponseAt) data.firstResponseAt = new Date();
        if (!current.installationId && reportInstallationId) data.installationId = reportInstallationId;
      }
      const supportCase = await prisma.$transaction(async (tx) => {
        for (const event of events) await tx.providerSupportCaseEvent.create({ data: { caseId: id, actor, ...event } });
        return tx.providerSupportCase.update({ where: { id }, data, include: { events: { orderBy: { createdAt: 'desc' }, take: 50 } } });
      });
      return ok(reply, { supportCase });
    } catch (error) { return fail(reply, error); }
  });

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

  app.post('/provider/desktop/heartbeat', { onRequest: [rateLimit({ max: 120, windowMs: 60_000, keyPrefix: 'desktop-heartbeat' })] }, async (request, reply) => {
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
      const parsedSyncAt = input.cloudSyncLastAt == null ? null : new Date(String(input.cloudSyncLastAt));
      if (parsedSyncAt && Number.isNaN(parsedSyncAt.getTime())) throw new HttpError(400, 'Fecha de sincronización inválida');
      const countOrNull = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
      const cloudSyncConnected = typeof input.cloudSyncConnected === 'boolean' ? input.cloudSyncConnected : null;
      const cloudSyncError = input.cloudSyncError == null ? null : String(input.cloudSyncError).slice(0, 500);
      const portalAccounts = countOrNull(input.portalAccounts);
      const activePortalAccounts = countOrNull(input.activePortalAccounts);
      let diagnosticsJson: string | null = null;
      if (input.diagnostics && typeof input.diagnostics === 'object' && !Array.isArray(input.diagnostics)) {
        diagnosticsJson = JSON.stringify(input.diagnostics);
        if (diagnosticsJson.length > 20_000) throw new HttpError(413, 'El diagnóstico local supera el tamaño permitido');
      } else if (input.localDiagnostics && typeof input.localDiagnostics === 'object' && !Array.isArray(input.localDiagnostics)) {
        diagnosticsJson = JSON.stringify({ localDiagnostics: input.localDiagnostics });
        if (diagnosticsJson.length > 20_000) throw new HttpError(413, 'El diagnóstico local supera el tamaño permitido');
      }
      const result = input.commandResult && typeof input.commandResult === 'object'
        ? input.commandResult as Record<string, unknown>
        : null;
      const now = new Date();
      await prisma.desktopHeartbeat.upsert({
        where: { installationId },
        create: { installationId, appVersion, licensePlan, licenseStatus, licenseKnown, hasLicense, licenseExpiresAt: parsedExpiry, cloudSyncConnected, cloudSyncLastAt: parsedSyncAt, cloudSyncError, portalAccounts, activePortalAccounts, ...(diagnosticsJson ? { diagnostics: diagnosticsJson, diagnosticsAt: now } : {}), lastSeenAt: now },
        update: {
          appVersion, licensePlan, licenseStatus, licenseKnown, hasLicense, licenseExpiresAt: parsedExpiry, lastSeenAt: now,
          ...(input.cloudSyncConnected !== undefined ? { cloudSyncConnected } : {}),
          ...(input.cloudSyncLastAt !== undefined ? { cloudSyncLastAt: parsedSyncAt } : {}),
          ...(input.cloudSyncError !== undefined ? { cloudSyncError } : {}),
          ...(input.portalAccounts !== undefined ? { portalAccounts } : {}),
          ...(input.activePortalAccounts !== undefined ? { activePortalAccounts } : {}),
          ...(diagnosticsJson ? { diagnostics: diagnosticsJson, diagnosticsAt: now } : {}),
        },
      });
      if (result && typeof result.id === 'string') {
        const resultText = JSON.stringify({
          ok: Boolean(result.ok),
          message: String(result.message ?? '').slice(0, 500),
        });
        await prisma.desktopHeartbeat.updateMany({
          where: { installationId, pendingCommandId: result.id },
          data: { pendingCommandId: null, pendingCommand: null, lastCommandResult: resultText, lastCommandAt: now },
        });
      }
      const current = await prisma.desktopHeartbeat.findUnique({ where: { installationId } });
      let pendingCommand: { id: string; action: string } | null = null;
      if (current?.pendingCommand) {
        try {
          const parsed = JSON.parse(current.pendingCommand) as { id: string; action: string; requestedAt?: string };
          const requestedAt = parsed.requestedAt ? new Date(parsed.requestedAt).getTime() : 0;
          if (!requestedAt || Date.now() - requestedAt > 24 * 60 * 60_000) {
            await prisma.desktopHeartbeat.updateMany({
              where: { installationId, pendingCommandId: parsed.id },
              data: { pendingCommandId: null, pendingCommand: null, lastCommandResult: JSON.stringify({ ok: false, message: 'El reintento venció después de 24 horas sin señal' }), lastCommandAt: now },
            });
          } else pendingCommand = { id: parsed.id, action: parsed.action };
        } catch { /* comando corrupto: queda visible para soporte */ }
      }
      return ok(reply, { received: true, at: now.toISOString(), pendingCommand });
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
        cloudSyncConnected: row.cloudSyncConnected,
        cloudSyncLastAt: row.cloudSyncLastAt?.toISOString() ?? null,
        cloudSyncError: row.cloudSyncError,
        portalAccounts: row.portalAccounts,
        activePortalAccounts: row.activePortalAccounts,
        pendingCommand: Boolean(row.pendingCommandId),
        lastCommandResult: row.lastCommandResult ? JSON.parse(row.lastCommandResult) : null,
        lastCommandAt: row.lastCommandAt?.toISOString() ?? null,
        diagnosticsAt: row.diagnosticsAt?.toISOString() ?? null,
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

  app.post('/provider/desktop/installations/:installationId/sync', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { installationId } = request.params as { installationId: string };
      if (!/^inst_[a-f0-9]{32}$/i.test(installationId)) throw new HttpError(400, 'ID de instalación inválido');
      const row = await prisma.desktopHeartbeat.findUnique({ where: { installationId } });
      if (!row || Date.now() - row.lastSeenAt.getTime() > 24 * 60 * 60_000) {
        throw new HttpError(409, 'La instalación no envió ninguna señal en las últimas 24 horas');
      }
      if (row.pendingCommandId) throw new HttpError(409, 'Ya hay una acción pendiente para esta instalación');
      const id = randomUUID();
      const command = JSON.stringify({ id, action: 'sync-now', requestedAt: new Date().toISOString() });
      const queued = await prisma.desktopHeartbeat.updateMany({
        where: { installationId, pendingCommandId: null },
        data: { pendingCommandId: id, pendingCommand: command, lastCommandResult: null, lastCommandAt: null },
      });
      if (!queued.count) throw new HttpError(409, 'Ya hay una acción pendiente para esta instalación');
      return ok(reply, { queued: true, commandId: id, installationId });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/desktop/installations/:installationId/diagnostics', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { installationId } = request.params as { installationId: string };
      if (!/^inst_[a-f0-9]{32}$/i.test(installationId)) throw new HttpError(400, 'ID de instalación inválido');
      const row = await prisma.desktopHeartbeat.findUnique({ where: { installationId } });
      if (!row) throw new HttpError(404, 'La instalación todavía no envió una señal al panel');
      if (Date.now() - row.lastSeenAt.getTime() > 24 * 60 * 60_000) throw new HttpError(409, 'La instalación está sin conexión; la solicitud no puede llegar al equipo');
      if (row.pendingCommandId) throw new HttpError(409, 'La instalación ya tiene una acción pendiente');
      const versionParts = row.appVersion.split('.').map((part) => Number(part));
      const supportsDiagnosticsCommand = versionParts.length >= 3 && (versionParts[0]! > 0 || versionParts[1]! > 3 || versionParts[2]! >= 68);
      const action = supportsDiagnosticsCommand ? 'diagnostics-now' : 'sync-now';
      const id = randomUUID();
      const command = JSON.stringify({ id, action, requestedAt: new Date().toISOString() });
      const queued = await prisma.desktopHeartbeat.updateMany({
        where: { installationId, pendingCommandId: null },
        data: { pendingCommandId: id, pendingCommand: command, lastCommandResult: null, lastCommandAt: null },
      });
      if (!queued.count) throw new HttpError(409, 'La instalación ya tiene una acción pendiente');
      return ok(reply, {
        queued: true, commandId: id, installationId, action,
        message: action === 'diagnostics-now'
          ? 'Diagnóstico local de solo lectura solicitado; se recibirá en la próxima señal.'
          : `Esta versión (${row.appVersion}) no tiene el comando de diagnóstico. Se encoló un reintento de sincronización compatible para actualizar las señales locales.`,
      });
    } catch (error) { return fail(reply, error); }
  });

  app.get('/provider/desktop/installations/:installationId/diagnostics', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { installationId } = request.params as { installationId: string };
      const row = await prisma.desktopHeartbeat.findUnique({ where: { installationId }, select: { diagnostics: true, diagnosticsAt: true, appVersion: true, lastSeenAt: true } });
      if (!row) throw new HttpError(404, 'No hay información de esta instalación');
      return ok(reply, {
        installationId, appVersion: row.appVersion, lastSeenAt: row.lastSeenAt.toISOString(),
        capturedAt: row.diagnosticsAt?.toISOString() ?? null,
        diagnostics: row.diagnostics ? JSON.parse(row.diagnostics) : null,
      });
    } catch (error) { return fail(reply, error); }
  });

  // Diagnóstico local solicitado por el escritorio. Solo responde en una API
  // instalada y exige su secreto local, que nunca sale de ese equipo.
  app.get('/provider/desktop/local-diagnostics', async (request, reply) => {
    try {
      const token = String(request.headers['x-desktop-diagnostics-token'] ?? '');
      if (!env.LICENSE_INSTALLATION_ID || !env.JWT_SECRET || token !== env.JWT_SECRET) {
        throw new HttpError(403, 'No autorizado');
      }
      const dbCheck = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`
        .then(() => true).catch(() => false);
      const databaseIntegrity = dbCheck && env.DATABASE_URL.startsWith('file:')
        ? await prisma.$queryRawUnsafe<Array<{ quick_check: string }>>('PRAGMA quick_check(100)').catch(() => [])
        : null;
      let cloud: Awaited<ReturnType<typeof getCloudConfig>> | null = null;
      if (dbCheck) cloud = await getCloudConfig().catch(() => null);
      const orgId = cloud?.orgId;
      const [portalAccounts, activePortalAccounts, instructors, instructorUsers, members, recentErrors] = await Promise.all([
        orgId ? prisma.portalAccount.count({ where: { organizationId: orgId } }).catch(() => null) : Promise.resolve(null),
        orgId ? prisma.portalAccount.count({ where: { organizationId: orgId, isActive: true } }).catch(() => null) : Promise.resolve(null),
        orgId ? prisma.instructor.count({ where: { organizationId: orgId } }).catch(() => null) : Promise.resolve(null),
        orgId ? prisma.user.count({ where: { organizationId: orgId, role: 'INSTRUCTOR', isActive: true } }).catch(() => null) : Promise.resolve(null),
        orgId ? prisma.member.count({ where: { organizationId: orgId } }).catch(() => null) : Promise.resolve(null),
        orgId ? prisma.errorLog.findMany({
          where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
          orderBy: { createdAt: 'desc' }, take: 8,
          select: { level: true, message: true, path: true, method: true, statusCode: true, createdAt: true },
        }).catch(() => []) : Promise.resolve([]),
      ]);
      const lastSuccessfulSync = cloud?.lastSyncAt ? new Date(cloud.lastSyncAt).getTime() : 0;
      const syncRecent = lastSuccessfulSync > 0 && Date.now() - lastSuccessfulSync <= 30 * 60_000;
      return ok(reply, {
        // SYNC_URL + SYNC_KEY solo prueban que hay configuración. Una señal
        // sana requiere un push reciente confirmado por la API remota.
        cloudSyncConnected: Boolean(cloud?.connected && syncRecent && !cloud.lastError),
        cloudSyncLastAt: cloud?.lastSyncAt ?? null,
        cloudSyncError: cloud?.lastError
          || (!dbCheck ? 'La base local no respondió; no se pudo consultar la configuración de nube' : !cloud ? 'No se pudo leer la configuración de nube' : !cloud.url ? 'No hay una dirección de nube configurada' : !cloud.key ? 'Todavía no se obtuvo la clave de sincronización' : !syncRecent ? 'Sin confirmación de sincronización exitosa en los últimos 30 minutos' : null),
        portalAccounts,
        activePortalAccounts,
        localDiagnostics: {
          capturedAt: new Date().toISOString(),
          localApi: { status: 'online', uptimeSeconds: Math.round(process.uptime()), nodeVersion: process.version },
          database: {
            status: dbCheck ? 'online' : 'offline', detail: dbCheck ? 'Consulta SELECT 1 correcta' : 'La base local no respondió a SELECT 1',
            integrity: databaseIntegrity === null ? 'no comprobada' : databaseIntegrity.length && databaseIntegrity.every((row) => row.quick_check === 'ok') ? 'correcta' : 'requiere revisión',
          },
          cloudSync: { status: cloud?.connected && syncRecent && !cloud.lastError ? 'online' : 'attention', lastSuccessAt: cloud?.lastSyncAt ?? null, error: cloud?.lastError || (!dbCheck ? 'No se pudo consultar la configuración de nube' : !syncRecent ? 'Sin sincronización confirmada en los últimos 30 minutos' : null) },
          records: { members, portalAccounts, activePortalAccounts, instructors, activeInstructorUsers: instructorUsers },
          recentErrors: recentErrors.map((row) => ({
            level: row.level, path: row.path, method: row.method, statusCode: row.statusCode, at: row.createdAt.toISOString(),
            message: row.message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
              .replace(/\b(?:\+?54)?[\d ()-]{8,}\b/g, '[teléfono]')
              .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [secreto]')
              .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s&,;]+/gi, '$1=[secreto]')
              .slice(0, 300),
          })),
        },
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Acciones de soporte autorizadas por la empresa, ejecutadas localmente en
  // la instalación del cliente. Por ahora solo permite reintentar la nube.
  app.post('/provider/desktop/local-support-command', async (request, reply) => {
    try {
      const token = String(request.headers['x-desktop-diagnostics-token'] ?? '');
      if (!env.LICENSE_INSTALLATION_ID || !env.JWT_SECRET || token !== env.JWT_SECRET) throw new HttpError(403, 'No autorizado');
      const input = (request.body ?? {}) as { action?: unknown };
      if (input.action !== 'sync-now') throw new HttpError(400, 'Acción de soporte no permitida');
      const configured = await ensureCloudConnected();
      if (!configured) {
        const config = await getCloudConfig();
        throw new HttpError(503, config.lastError || 'No se pudo establecer conexión con la nube');
      }
      const pushed = await runCloudSync();
      const pulled = await runCloudPull();
      return ok(reply, { action: 'sync-now', pushed, pulled, completedAt: new Date().toISOString() });
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
        geolocation: { configured: true, provider: env.IP_API_KEY ? 'IP-API Pro' : 'ipdata.co', attributionRequired: !env.IP_API_KEY },
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
      const requestStarted = Date.now();
      requireProviderToken(request);
      const providerId = await providerOrgId();
      // PostgreSQL LIKE usa '_' como comodín, así que startsWith: '__' genera
      // LIKE '__%' y oculta casi todos los slugs normales. Excluir el prefijo
      // reservado en JavaScript mantiene la comparación literal.
      const orgs = (await prisma.organization.findMany({
        where: { id: { not: providerId } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
      })).filter((org) => !org.slug.startsWith('__'));

      const group = async <T extends Record<string, unknown>>(
        model: keyof typeof prisma,
        args: unknown,
      ): Promise<T[]> => (prisma[model] as unknown as { groupBy: (a: unknown) => Promise<T[]> }).groupBy(args);

      const [users, teacherUsers, teacherLogin, instructors, activeInstructors, members, activeMembers, branches, payments, attendance, classes, products, portal, portalActive, portalLogin, whatsapp, licenses, errors, settingsRows, subs] =
        await Promise.all([
          group<{ organizationId: string; _count: { _all: number } }>('user', {
            by: ['organizationId'],
            where: { isActive: true },
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('user', {
            by: ['organizationId'],
            where: { isActive: true, role: 'INSTRUCTOR' },
            _count: { _all: true },
          }),
          group<{ organizationId: string; _max: { lastLoginAt: Date | null } }>('user', {
            by: ['organizationId'],
            where: { isActive: true, role: 'INSTRUCTOR' },
            _max: { lastLoginAt: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('instructor', {
            by: ['organizationId'],
            _count: { _all: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('instructor', {
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
          group<{ organizationId: string; _max: { lastLoginAt: Date | null } }>('portalAccount', {
            by: ['organizationId'],
            where: { isActive: true },
            _max: { lastLoginAt: true },
          }),
          group<{ organizationId: string; _count: { _all: number } }>('whatsAppAuth', {
            by: ['organizationId'],
            where: { key: 'creds' },
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
        teacherUsers: mapCount(teacherUsers as never),
        instructors: mapCount(instructors as never),
        activeInstructors: mapCount(activeInstructors as never),
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
      const lastPortalLogin = new Map<string, Date | null>();
      for (const row of portalLogin as never as Array<{ organizationId: string; _max: { lastLoginAt: Date | null } }>) {
        lastPortalLogin.set(row.organizationId, row._max.lastLoginAt);
      }
      const lastTeacherLogin = new Map<string, Date | null>();
      for (const row of teacherLogin as never as Array<{ organizationId: string; _max: { lastLoginAt: Date | null } }>) {
        lastTeacherLogin.set(row.organizationId, row._max.lastLoginAt);
      }
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
        const whatsappAuthSaved = (counts.whatsapp.get(org.id) ?? 0) > 0;
        const whatsappRuntime = getWhatsAppRuntimeStatus(org.id);
        const arcaEnabled = s.get('ARCA.ENABLED') === 'true';
        const arcaHasCertificate = Boolean(s.get('ARCA.CERT_P12') || s.get('ARCA.CERT'));
        const arcaHasPrivateKey = Boolean(s.get('ARCA.PRIVATE_KEY') || s.get('ARCA.CERT_P12'));
        const arcaReady = arcaEnabled && Boolean(s.get('ARCA.CUIT')) && Boolean(s.get('ARCA.PUNTO_VENTA')) && arcaHasCertificate && arcaHasPrivateKey;
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
            detail: `${counts.portalActive.get(org.id) ?? 0} cuentas habilitadas / ${counts.portal.get(org.id) ?? 0} · último acceso ${lastPortalLogin.get(org.id)?.toISOString() ?? 'sin accesos registrados'}`,
          },
          {
            id: 'profes',
            label: 'Portal de profesores',
            active: (counts.teacherUsers.get(org.id) ?? 0) > 0 && (counts.activeInstructors.get(org.id) ?? 0) > 0,
            detail: `${counts.teacherUsers.get(org.id) ?? 0} usuarios activos · ${counts.activeInstructors.get(org.id) ?? 0} profesores activos de ${counts.instructors.get(org.id) ?? 0} · último acceso ${lastTeacherLogin.get(org.id)?.toISOString() ?? 'sin accesos registrados'}`,
          },
          {
            id: 'whatsapp',
            label: 'WhatsApp',
            active: whatsappRuntime === 'connected',
            detail: whatsappRuntime === 'connected'
              ? 'Conectada ahora'
              : whatsappAuthSaved
                ? `Credenciales guardadas · estado actual: ${whatsappRuntime}`
                : 'Sin sesión vinculada',
          },
          {
            id: 'arca',
            label: 'Facturación ARCA',
            active: arcaReady,
            detail: !arcaEnabled
              ? 'Deshabilitada'
              : arcaReady
                ? 'Habilitada · certificado, CUIT y punto de venta configurados; requiere prueba de conexión'
                : `Habilitada, configuración incompleta · ${[
                    !s.get('ARCA.CUIT') && 'falta CUIT',
                    !s.get('ARCA.PUNTO_VENTA') && 'falta punto de venta',
                    !arcaHasCertificate && 'falta certificado',
                    !arcaHasPrivateKey && 'falta clave privada',
                  ].filter(Boolean).join(', ')}`,
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
          sync: { lastPushAt, lastError: syncError, installationId: s.get('SYNC.INSTALLATION_ID') || null },
          counts: {
            users: counts.users.get(org.id) ?? 0,
            teacherUsers: counts.teacherUsers.get(org.id) ?? 0,
            instructors: counts.instructors.get(org.id) ?? 0,
            activeInstructors: counts.activeInstructors.get(org.id) ?? 0,
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
          installationId: s.get('SYNC.INSTALLATION_ID') || null,
        };
      });

      const [websiteProbe, sociosProbe, profesProbe, fitoraProbe, licenseProbe, providerArca] = await Promise.all([
        probeHttpService(env.SITE_URL),
        probeHttpService(env.SOCIOS_URL),
        probeHttpService(env.PROFES_URL),
        probeHttpService(env.FITORA_URL),
        env.LICENSE_SERVER
          ? probeHttpService(new URL('/api/health', env.LICENSE_SERVER).toString())
          : Promise.resolve({ status: 'sin configurar' as const, detail: 'LICENSE_SERVER no definido' }),
        getInvoiceSettingsPublic().catch(() => null),
      ]);

      return ok(reply, {
        generatedAt: new Date().toISOString(),
        platform: [
          { id: 'api', name: 'API de la nube', status: 'online', detail: `Atendiendo esta consulta · ${Date.now() - requestStarted} ms` },
          { id: 'web', name: 'Sitio web / tienda', ...websiteProbe, url: env.SITE_URL, detail: `${websiteProbe.detail} · ${env.SITE_URL}` },
          { id: 'socios', name: 'App de socios (PWA)', ...sociosProbe, url: env.SOCIOS_URL, detail: `${sociosProbe.detail} · ${env.SOCIOS_URL}` },
          { id: 'profes', name: 'Portal de Profes', ...profesProbe, url: env.PROFES_URL, detail: `${profesProbe.detail} · ${env.PROFES_URL} · ruta web compartida` },
          { id: 'fitora', name: 'Fitora', ...fitoraProbe, url: env.FITORA_URL, detail: `${fitoraProbe.detail} · ${env.FITORA_URL}` },
          { id: 'panel', name: 'Panel de control FS', status: 'local', detail: 'Este módulo del panel está abierto en este equipo' },
          {
            id: 'licensador',
            name: 'Licensador',
            ...licenseProbe,
            detail: `${licenseProbe.detail} · ${env.LICENSE_SERVER || ''}`,
            url: env.LICENSE_SERVER || undefined,
          },
          {
            id: 'whatsapp',
            name: 'WhatsApp (Baileys)',
            status: clients.some((c) => c.modules.find((m) => m.id === 'whatsapp')?.active) ? 'con sesiones' : 'sin sesiones conectadas',
            detail: `${clients.filter((c) => c.modules.find((m) => m.id === 'whatsapp')?.active).length} conectadas ahora · ${clients.filter((c) => (c.modules.find((m) => m.id === 'whatsapp')?.detail || '').startsWith('Credenciales guardadas')).length} guardadas pero desconectadas`,
          },
          {
            id: 'arca',
            name: 'Facturación ARCA',
            status: !providerArca?.enabled ? 'deshabilitada' : providerArca.certError ? 'con error' : 'habilitada',
            detail: !providerArca?.enabled
              ? 'Facturación del proveedor deshabilitada'
              : providerArca.certError
                ? `Habilitada, pero la comprobación de certificado/WSAA falló: ${providerArca.certError}`
                : `Habilitada · ${providerArca.environment} · certificado ${providerArca.certNotAfter ? `vence ${providerArca.certNotAfter}` : 'detectado'}; conexión comprobada`,
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

  // Detalle operativo de la app de socios por organización. Nunca devolver
  // hashes, códigos de activación, tokens push ni credenciales.
  app.get('/provider/systems/:organizationId/portal', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { organizationId } = request.params as { organizationId: string };
      const providerId = await providerOrgId();
      const organizationRecord = organizationId === providerId ? null : await prisma.organization.findFirst({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true, isActive: true },
      });
      // Do not use startsWith('__') in Prisma: PostgreSQL treats '_' in LIKE
      // patterns as a wildcard, which would reject ordinary customer slugs.
      const organization = organizationRecord?.slug.startsWith('__') ? null : organizationRecord;
      if (!organization) return reply.code(404).send({ ok: false, error: 'Cliente no encontrado' });

      const [accounts, totalAccounts, activeAccounts, neverLoggedIn, pushDevices, webPushDevices,
        instructorUsers, totalInstructorUsers, activeInstructorUsers, instructors, totalInstructors, activeInstructors, activeClasses, lastTeacherLogin, errors] = await Promise.all([
        prisma.portalAccount.findMany({
          where: { organizationId },
          orderBy: [{ lastLoginAt: 'desc' }, { updatedAt: 'desc' }],
          take: 501,
          select: {
            id: true, email: true, isActive: true, activationCode: true,
            lastLoginAt: true, createdAt: true, updatedAt: true,
            member: { select: { memberCode: true, firstName: true, lastName: true, status: true } },
            _count: { select: { pushTokens: true, webPushSubscriptions: true } },
          },
        }),
        prisma.portalAccount.count({ where: { organizationId } }),
        prisma.portalAccount.count({ where: { organizationId, isActive: true } }),
        prisma.portalAccount.count({ where: { organizationId, lastLoginAt: null } }),
        prisma.pushToken.count({ where: { portalAccount: { organizationId } } }),
        prisma.webPushSubscription.count({ where: { portalAccount: { organizationId } } }),
        prisma.user.findMany({
          where: { organizationId, role: 'INSTRUCTOR' },
          orderBy: [{ lastLoginAt: 'desc' }, { name: 'asc' }], take: 300,
          select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true,
            instructor: { select: { id: true, name: true, isActive: true, _count: { select: { classes: true } } } } },
        }),
        prisma.user.count({ where: { organizationId, role: 'INSTRUCTOR' } }),
        prisma.user.count({ where: { organizationId, role: 'INSTRUCTOR', isActive: true } }),
        prisma.instructor.findMany({
          where: { organizationId }, orderBy: { name: 'asc' }, take: 300,
          select: { id: true, name: true, email: true, isActive: true, createdAt: true,
            user: { select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true } },
            _count: { select: { classes: true } } },
        }),
        prisma.instructor.count({ where: { organizationId } }),
        prisma.instructor.count({ where: { organizationId, isActive: true } }),
        prisma.gymClass.count({ where: { organizationId, isActive: true } }),
        prisma.user.findFirst({ where: { organizationId, role: 'INSTRUCTOR', isActive: true, lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } }),
        prisma.errorLog.findMany({
          where: { organizationId, createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
          orderBy: { createdAt: 'desc' }, take: 30,
          select: { id: true, level: true, message: true, path: true, method: true, statusCode: true, createdAt: true },
        }),
      ]);
      const truncated = accounts.length > 500;
      const visibleAccounts = accounts.slice(0, 500);
      return ok(reply, {
        generatedAt: new Date().toISOString(), organization,
        summary: { total: totalAccounts, active: activeAccounts, inactive: totalAccounts - activeAccounts,
          neverLoggedIn, pushDevices: pushDevices + webPushDevices,
          errors30d: errors.length, truncated },
        accounts: visibleAccounts.map(({ activationCode, ...account }) => ({ ...account, activationPending: Boolean(activationCode) })),
        profes: {
          summary: { users: totalInstructorUsers, activeUsers: activeInstructorUsers, instructors: totalInstructors,
            activeInstructors, activeClasses, lastLoginAt: lastTeacherLogin?.lastLoginAt?.toISOString() ?? null,
            usersTruncated: totalInstructorUsers > 300, instructorsTruncated: totalInstructors > 300 },
          users: instructorUsers,
          instructors,
        },
        errors,
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

  app.post('/provider/systems/:organizationId/portal/:accountId/reset', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { organizationId, accountId } = request.params as { organizationId: string; accountId: string };
      const account = await prisma.portalAccount.findFirst({ where: { id: accountId, organizationId } });
      if (!account) throw new HttpError(404, 'Cuenta no encontrada');
      const code = generateActivationCode();
      await prisma.portalAccount.update({ where: { id: accountId }, data: { activationCode: code, isActive: true } });
      return ok(reply, { accountId, activationCode: code });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/provider/systems/:organizationId/portal/:accountId/toggle', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { organizationId, accountId } = request.params as { organizationId: string; accountId: string };
      const body = (request.body ?? {}) as { active?: boolean };
      const active = Boolean(body.active);
      const account = await prisma.portalAccount.findFirst({ where: { id: accountId, organizationId } });
      if (!account) throw new HttpError(404, 'Cuenta no encontrada');
      await prisma.portalAccount.update({ where: { id: accountId }, data: { isActive: active } });
      return ok(reply, { accountId, isActive: active });
    } catch (error) {
      return fail(reply, error);
    }
  });
}
