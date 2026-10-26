import type { FastifyInstance } from 'fastify';
import { rateLimit } from '../lib/ratelimit.js';
import { HttpError, fail, ok } from '../lib/http.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { requireProviderToken } from './provider.js';
import { normalizeDownloadIp } from './provider-ops.js';

/*
 * Metricas del sitio: visitas a la landing y descargas del escritorio.
 *
 * - POST /metrics/visit y GET /metrics/download/go son PUBLICOS (los usa la web).
 * - GET /metrics/summary es del proveedor: lo consume el Panel de control FS con
 *   el header x-provider-token. Devuelve totales, series diarias y desglose.
 *
 * La escritura va limitada por IP para que un bot no infle los numeros.
 */

const DOWNLOADS: Record<string, string> = {
  setup: 'https://github.com/dcorp-sas/FITsystem/releases/latest/download/FIT-System-Setup.exe',
  portable: 'https://github.com/dcorp-sas/FITsystem/releases/latest/download/FIT-System-Portable.exe',
};

const DAY_MS = 86_400_000;
const BOT_USER_AGENT = /bot|crawler|spider|slurp|preview|facebookexternalhit|linkedinbot|twitterbot/i;

let githubCache: { at: number; value: { version: string; setup: number; portable: number } | null } | null = null;

function dayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function argentinaDayStart(date: Date): Date {
  return new Date(`${dayKey(date)}T00:00:00-03:00`);
}

function validVisitorId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function ownWebsiteHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const value of [env.SITE_URL, ...env.WEB_ORIGINS]) {
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // Ignore malformed optional origins.
    }
  }
  return hosts;
}

function refererHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value).hostname.toLowerCase().slice(0, 200) || null;
  } catch {
    return null;
  }
}

async function latestGitHubDownloads(): Promise<{ version: string; setup: number; portable: number } | null> {
  if (githubCache && Date.now() - githubCache.at < 15 * 60_000) return githubCache.value;
  try {
    const response = await fetch('https://api.github.com/repos/dcorp-sas/FITsystem/releases/latest', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'FIT-System-control-panel' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const release = (await response.json()) as {
      tag_name?: string;
      assets?: Array<{ name?: string; download_count?: number }>;
    };
    const totals = { version: release.tag_name || 'última versión', setup: 0, portable: 0 };
    for (const asset of release.assets || []) {
      const name = String(asset.name || '').toLowerCase();
      const count = Math.max(0, Number(asset.download_count) || 0);
      if (name.includes('setup') && name.endsWith('.exe')) totals.setup += count;
      if (name.includes('portable') && name.endsWith('.exe')) totals.portable += count;
    }
    githubCache = { at: Date.now(), value: totals };
    return totals;
  } catch {
    // Aggregate download counts are supplemental; local click tracking must remain available.
    githubCache = { at: Date.now(), value: null };
    return null;
  }
}

export function metricsRoutes(app: FastifyInstance) {
  // Beacon de visita de la landing (una por carga de pagina).
  app.post(
    '/metrics/visit',
    { onRequest: [rateLimit({ max: 60, windowMs: 60_000, keyPrefix: 'visit' })] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as { path?: unknown; referer?: unknown; visitorId?: unknown };
        const path = typeof body.path === 'string' ? body.path.slice(0, 300) : '/';
        const referer = refererHost(body.referer);
        const userAgent = String(request.headers['user-agent'] || '');
        if (BOT_USER_AGENT.test(userAgent)) return ok(reply, { ok: true, tracked: false });
        let source = 'directo';
        if (referer) source = ownWebsiteHosts().has(referer) ? 'interno' : 'referido';
        const visitorId = validVisitorId(body.visitorId);
        await prisma.pageView.create({ data: { path: path || '/', source, referer, visitorId } });
        return ok(reply, { ok: true, tracked: true });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Redireccion contada de descarga. La web apunta los botones aca y este
  // endpoint registra el hit y manda al asset real de GitHub Releases.
  app.get(
    '/metrics/download/go',
    { onRequest: [rateLimit({ max: 30, windowMs: 60_000, keyPrefix: 'download' })] },
    async (request, reply) => {
    const query = request.query as { asset?: string; source?: string; src?: string; visitorId?: string };
    const asset = typeof query.asset === 'string' && DOWNLOADS[query.asset] ? query.asset : 'setup';
    const target = DOWNLOADS[asset] as string;
    try {
      const userAgent = String(request.headers['user-agent'] || '').slice(0, 400) || null;
      const prefetch = /prefetch/i.test(String(request.headers.purpose || request.headers['sec-purpose'] || ''));
      const ip = normalizeDownloadIp(request.ip);
      const referer = refererHost(request.headers.referer || request.headers.referrer);
      const source = String(query.source || query.src || 'sitio').slice(0, 40) || 'sitio';
      if (!prefetch && !BOT_USER_AGENT.test(userAgent || '')) {
        await prisma.downloadHit.create({ data: { asset, source, visitorId: validVisitorId(query.visitorId), ip, userAgent, referer } });
      }
    } catch {
      /* la descarga no debe fallar porque no se pudo registrar */
    }
    return reply.redirect(target, 302);
  });

  // Resumen para el Panel de control FS (token de proveedor).
  app.get('/metrics/summary', async (request, reply) => {
    try {
      requireProviderToken(request);
      const query = request.query as { days?: string };
      const days = Math.min(180, Math.max(7, Number(query.days) || 30));

      const todayStart = argentinaDayStart(new Date());
      const since = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
      const [views, downloads, github] = await Promise.all([
        prisma.pageView.findMany({ where: { at: { gte: since } }, select: { at: true, visitorId: true, source: true } }),
        prisma.downloadHit.findMany({ where: { at: { gte: since } }, select: { at: true, asset: true, visitorId: true } }),
        latestGitHubDownloads(),
      ]);

      const today = todayStart;
      const viewsToday = views.filter((v) => v.at >= today).length;
      const downloadsToday = downloads.filter((d) => d.at >= today).length;
      const uniqueVisitors = new Set(views.map((v) => v.visitorId).filter((id): id is string => Boolean(id))).size;
      const uniqueDownloaders = new Set(downloads.map((d) => d.visitorId).filter((id): id is string => Boolean(id))).size;
      const uniqueVisitorsToday = new Set(views.filter((v) => v.at >= today).map((v) => v.visitorId).filter((id): id is string => Boolean(id))).size;
      const uniqueDownloadersToday = new Set(downloads.filter((d) => d.at >= today).map((d) => d.visitorId).filter((id): id is string => Boolean(id))).size;

      const byAsset = { setup: 0, portable: 0 };
      for (const hit of downloads) {
        if (hit.asset === 'portable') byAsset.portable += 1;
        else byAsset.setup += 1;
      }

      const sourcesMap = new Map<string, number>();
      for (const view of views) {
        const source = view.source === 'web' ? 'directo' : view.source;
        sourcesMap.set(source, (sourcesMap.get(source) ?? 0) + 1);
      }
      const byDay = (rows: Array<{ at: Date }>) => {
        const map = new Map<string, number>();
        for (const row of rows) {
          const key = dayKey(row.at);
          map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
      };
      const viewsPerDay = byDay(views);
      const downloadsPerDay = byDay(downloads);
      const visitorsPerDay = new Map<string, Set<string>>();
      for (const view of views) {
        if (!view.visitorId) continue;
        const key = dayKey(view.at);
        if (!visitorsPerDay.has(key)) visitorsPerDay.set(key, new Set());
        visitorsPerDay.get(key)!.add(view.visitorId);
      }
      const downloadersPerDay = new Map<string, Set<string>>();
      for (const download of downloads) {
        if (!download.visitorId) continue;
        const key = dayKey(download.at);
        if (!downloadersPerDay.has(key)) downloadersPerDay.set(key, new Set());
        downloadersPerDay.get(key)!.add(download.visitorId);
      }
      const daysSeries = (values: Map<string, number>) => {
        const series: { date: string; count: number }[] = [];
        const now = todayStart;
        for (let i = days - 1; i >= 0; i--) {
          const key = dayKey(new Date(now.getTime() - i * DAY_MS));
          series.push({ date: key, count: values.get(key) ?? 0 });
        }
        return series;
      };

      return ok(reply, {
        days,
        totals: {
          views: views.length,
          uniqueVisitors,
          legacyViews: views.filter((v) => !v.visitorId).length,
          downloads: downloads.length,
          uniqueDownloaders,
          viewsToday,
          uniqueVisitorsToday,
          downloadsToday,
          uniqueDownloadersToday,
        },
        series: {
          views: daysSeries(viewsPerDay),
          visitors: daysSeries(new Map([...visitorsPerDay].map(([key, ids]) => [key, ids.size]))),
          downloads: daysSeries(downloadsPerDay),
          downloaders: daysSeries(new Map([...downloadersPerDay].map(([key, ids]) => [key, ids.size]))),
        },
        byAsset,
        sources: [...sourcesMap].map(([source, count]) => ({ source, count })),
        githubDownloads: github,
        attribution: { visitorId: 'anonymous-browser-id', legacyViewsWithoutId: views.filter((v) => !v.visitorId).length },
        assets: {
          setup: DOWNLOADS.setup,
          portable: DOWNLOADS.portable,
        },
      });
    } catch (error) {
      if (error instanceof HttpError) return fail(reply, error);
      return fail(reply, error);
    }
  });

  // El resumen es de lectura del proveedor; no expone escritura publica adicional.
}

export default metricsRoutes;
