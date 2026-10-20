import type { FastifyInstance } from 'fastify';
import { rateLimit } from '../lib/ratelimit.js';
import { HttpError, fail, ok } from '../lib/http.js';
import { prisma } from '../db.js';
import { requireProviderToken } from './provider.js';

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

const KEEP_DAYS = 400;
const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resumen diario de los ultimos `days` dias, rellenando los dias sin datos. */
function buildSeries(dates: Date[], days: number): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = dayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const series: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(today.getTime() - i * DAY_MS));
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

export function metricsRoutes(app: FastifyInstance) {
  // Beacon de visita de la landing (una por carga de pagina).
  app.post(
    '/metrics/visit',
    { onRequest: [rateLimit({ max: 60, windowMs: 60_000, keyPrefix: 'visit' })] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as { path?: unknown; referer?: unknown };
        const path = typeof body.path === 'string' ? body.path.slice(0, 300) : '/';
        const referer = typeof body.referer === 'string' ? body.referer.slice(0, 300) : null;
        const host = request.headers.host ?? '';
        const external = referer && !referer.includes(host) ? 'referido' : 'directo';
        await prisma.pageView.create({ data: { path: path || '/', source: external, referer } });
        return ok(reply, { ok: true });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Redireccion contada de descarga. La web apunta los botones aca y este
  // endpoint registra el hit y manda al asset real de GitHub Releases.
  app.get('/metrics/download/go', async (request, reply) => {
    const query = request.query as { asset?: string };
    const asset = typeof query.asset === 'string' && DOWNLOADS[query.asset] ? query.asset : 'setup';
    const target = DOWNLOADS[asset] as string;
    try {
      await prisma.downloadHit.create({ data: { asset } });
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

      const since = new Date(Date.now() - (days - 1) * DAY_MS);
      since.setHours(0, 0, 0, 0);
      const purgeBefore = new Date(Date.now() - KEEP_DAYS * DAY_MS);

      const [views, downloads, viewsByDay, downloadsByDay] = await Promise.all([
        prisma.pageView.count(),
        prisma.downloadHit.count(),
        prisma.pageView.findMany({ where: { at: { gte: since } }, select: { at: true } }),
        prisma.downloadHit.findMany({ where: { at: { gte: since } }, select: { at: true, asset: true } }),
      ]);

      const [viewsToday, downloadsToday] = await Promise.all([
        prisma.pageView.count({ where: { at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
        prisma.downloadHit.count({ where: { at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      ]);

      const byAsset = { setup: 0, portable: 0 };
      for (const hit of downloadsByDay) {
        if (hit.asset === 'portable') byAsset.portable += 1;
        else byAsset.setup += 1;
      }

      const sources = await prisma.pageView.groupBy({
        by: ['source'],
        _count: { _all: true },
        where: { at: { gte: since } },
      });

      // Los conteos totales van por encima de la ventana: lo pedido es "cuanta
      // gente entra y cuanta descarga" desde el inicio, no solo los ultimos dias.
      const purge = await prisma.pageView.deleteMany({ where: { at: { lt: purgeBefore } } }).catch(() => ({ count: 0 }));

      return ok(reply, {
        days,
        totals: { views, downloads, viewsToday, downloadsToday, purgedOldViews: purge.count },
        series: {
          views: buildSeries(viewsByDay.map((v) => v.at), days),
          downloads: buildSeries(downloadsByDay.map((d) => d.at), days),
        },
        byAsset,
        sources: sources.map((s) => ({ source: s.source, count: s._count._all })),
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
