import { createHash } from 'node:crypto';
import { readFile, statfs } from 'node:fs/promises';
import { prisma } from '../db.js';
import { env } from '../env.js';

const SAMPLE_MS = 5 * 60_000;
const RETENTION_MS = 30 * 86_400_000;

type Check = { name: string; status: 'ok' | 'warn' | 'fail' | 'skip'; detail: string };
type Alert = { level: 'crit' | 'warn'; area: string; title: string; detail: string };

async function httpCheck(name: string, url: string, alerts: Alert[], area: string, headers?: Record<string, string>): Promise<Check> {
  if (!url) return { name, status: 'skip', detail: 'No configurado' };
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    let upstreamDetail = '';
    if (!response.ok && /application\/json/i.test(response.headers.get('content-type') || '')) {
      try {
        const body = await response.clone().json() as { message?: unknown; error?: unknown };
        const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : '';
        if (message) upstreamDetail = ` · ${message.replace(/[\r\n\t]+/g, ' ').slice(0, 240)}`;
      } catch { /* un mensaje HTTP no debe interrumpir el resto del diagnóstico */ }
    }
    const detail = `HTTP ${response.status} · ${Date.now() - started} ms${upstreamDetail}`;
    if (!response.ok) {
      alerts.push({ level: response.status === 401 || response.status === 403 ? 'warn' : 'crit', area, title: `${name} respondió HTTP ${response.status}`, detail });
      return { name, status: 'fail', detail };
    }
    return { name, status: 'ok', detail };
  } catch (error) {
    const detail = (error as Error).message.slice(0, 300);
    alerts.push({ level: 'crit', area, title: `${name} no responde`, detail });
    return { name, status: 'fail', detail };
  }
}

async function cgroupMetric(file: string): Promise<string | null> {
  try { return (await readFile(`/sys/fs/cgroup/${file}`, 'utf8')).trim(); } catch { return null; }
}

function pressureAvg10(raw: string | null): number | null {
  const match = raw?.match(/some avg10=([\d.]+)/);
  return match ? Number(match[1]) : null;
}

async function collectChecks(): Promise<{ checks: Check[]; alerts: Alert[] }> {
  const checks: Check[] = [];
  const alerts: Alert[] = [];

  const dbStarted = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: 'Base de datos', status: 'ok', detail: `PostgreSQL respondió · ${Date.now() - dbStarted} ms` });
  } catch (error) {
    const detail = (error as Error).message.slice(0, 300);
    checks.push({ name: 'Base de datos', status: 'fail', detail });
    alerts.push({ level: 'crit', area: 'Base de datos', title: 'PostgreSQL no responde', detail });
  }

  checks.push(await httpCheck('Sitio web / tienda', env.SITE_URL, alerts, 'Sitio'));
  checks.push(await httpCheck('App de socios', env.SOCIOS_URL, alerts, 'App de socios'));
  checks.push(await httpCheck('Licensador', env.LICENSE_SERVER ? new URL('/api/health', env.LICENSE_SERVER).toString() : '', alerts, 'Licensador'));

  if (env.PLATFORM_BREVO_API_KEY) {
    checks.push(await httpCheck('Brevo', 'https://api.brevo.com/v3/account', alerts, 'Marketing', { 'api-key': env.PLATFORM_BREVO_API_KEY, accept: 'application/json' }));
  } else {
    checks.push({ name: 'Brevo', status: 'skip', detail: 'No hay clave de servidor configurada' });
  }

  try {
    const customerFilter = { NOT: { slug: { startsWith: '__' } } };
    const [organizations, activePortalAccounts, errors7d] = await Promise.all([
      prisma.organization.count({ where: customerFilter }),
      prisma.portalAccount.count({ where: { isActive: true, organization: customerFilter } }),
      prisma.errorLog.count({ where: { level: 'error', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    if (!organizations) checks.push({ name: 'Sistemas por cliente', status: 'skip', detail: 'No hay organizaciones de clientes registradas en la nube' });
    else checks.push({ name: 'Sistemas por cliente', status: 'ok', detail: `${organizations} organizaciones registradas` });
    if (!organizations) checks.push({ name: 'App de socios (cuentas)', status: 'skip', detail: 'Sin clientes registrados para medir' });
    else {
      checks.push({ name: 'App de socios (cuentas)', status: activePortalAccounts ? 'ok' : 'warn', detail: `${activePortalAccounts} cuenta(s) activa(s)` });
      if (!activePortalAccounts) alerts.push({ level: 'warn', area: 'App de socios', title: 'No hay cuentas de socios activas', detail: `${organizations} organización(es) registrada(s); revisar aprovisionamiento del módulo y accesos.` });
    }
    checks.push({ name: 'Errores de clientes · 7 días', status: errors7d ? 'warn' : 'ok', detail: `${errors7d} error(es) registrados` });
    if (errors7d) alerts.push({ level: 'warn', area: 'Aplicaciones de clientes', title: `Errores de clientes en los últimos 7 días (${errors7d})`, detail: 'Abrí el panel para consultar el registro por cliente y el detalle de cada error.' });
  } catch (error) {
    const detail = (error as Error).message.slice(0, 300);
    checks.push({ name: 'Sistemas y App de socios', status: 'fail', detail });
    alerts.push({ level: 'crit', area: 'Base de datos', title: 'No se pudo leer el inventario de clientes', detail });
  }

  const [cpuPressureRaw, memoryCurrentRaw, memoryMaxRaw, memoryPressureRaw, ioPressureRaw] = await Promise.all([
    cgroupMetric('cpu.pressure'), cgroupMetric('memory.current'), cgroupMetric('memory.max'), cgroupMetric('memory.pressure'), cgroupMetric('io.pressure'),
  ]);
  const cpuPressure = pressureAvg10(cpuPressureRaw);
  const memoryPressure = pressureAvg10(memoryPressureRaw);
  const ioPressure = pressureAvg10(ioPressureRaw);
  const memoryCurrent = Number(memoryCurrentRaw);
  const memoryMax = memoryMaxRaw && memoryMaxRaw !== 'max' ? Number(memoryMaxRaw) : NaN;
  const memoryPct = Number.isFinite(memoryCurrent) && Number.isFinite(memoryMax) && memoryMax > 0 ? Math.round(memoryCurrent / memoryMax * 100) : null;
  const resourceDetails = [
    memoryPct == null ? 'RAM cgroup sin límite medible' : `RAM del servicio ${memoryPct}%`,
    cpuPressure == null ? 'CPU PSI no expuesta' : `presión CPU ${cpuPressure.toFixed(1)}%`,
    memoryPressure == null ? '' : `espera RAM ${memoryPressure.toFixed(1)}%`,
    ioPressure == null ? '' : `espera I/O ${ioPressure.toFixed(1)}%`,
  ].filter(Boolean).join(' · ');
  const resourceStatus: Check['status'] = (memoryPct ?? 0) >= 95 || (cpuPressure ?? 0) >= 20 ? 'fail' : (memoryPct ?? 0) >= 85 || (cpuPressure ?? 0) >= 10 || (memoryPressure ?? 0) >= 5 || (ioPressure ?? 0) >= 10 ? 'warn' : cpuPressure == null && memoryPct == null ? 'skip' : 'ok';
  checks.push({ name: 'Recursos del servicio API', status: resourceStatus, detail: resourceDetails });
  if ((memoryPct ?? 0) >= 95) alerts.push({ level: 'crit', area: 'Infraestructura', title: `Memoria del servicio API al ${memoryPct}%`, detail: resourceDetails });
  else if ((memoryPct ?? 0) >= 85) alerts.push({ level: 'warn', area: 'Infraestructura', title: `Memoria del servicio API al ${memoryPct}%`, detail: resourceDetails });
  if ((cpuPressure ?? 0) >= 20) alerts.push({ level: 'crit', area: 'Infraestructura', title: `Presión de CPU del servicio API ${cpuPressure!.toFixed(1)}%`, detail: resourceDetails });
  else if ((cpuPressure ?? 0) >= 10) alerts.push({ level: 'warn', area: 'Infraestructura', title: `Presión de CPU del servicio API ${cpuPressure!.toFixed(1)}%`, detail: resourceDetails });
  try {
    const fs = await statfs('/');
    const diskPct = Math.round((1 - Number(fs.bavail) / Number(fs.blocks)) * 100);
    const status: Check['status'] = diskPct >= 95 ? 'fail' : diskPct >= 85 ? 'warn' : 'ok';
    checks.push({ name: 'Disco visible al servicio API', status, detail: `${diskPct}% utilizado · ${Math.round(Number(fs.bavail) * Number(fs.bsize) / 1_073_741_824)} GB libres` });
    if (diskPct >= 95) alerts.push({ level: 'crit', area: 'Infraestructura', title: `Disco visible al API al ${diskPct}%`, detail: 'Revisá almacenamiento en la VPS.' });
    else if (diskPct >= 85) alerts.push({ level: 'warn', area: 'Infraestructura', title: `Disco visible al API al ${diskPct}%`, detail: 'El espacio disponible empieza a ser bajo.' });
  } catch {
    checks.push({ name: 'Disco visible al servicio API', status: 'skip', detail: 'No se pudo medir desde el contenedor' });
  }

  return { checks, alerts };
}

async function persistSnapshot(checks: Check[], alerts: Alert[]) {
  const now = new Date();
  const source = 'monitor VPS';
  await prisma.providerHealthSnapshot.create({ data: { source, checks: JSON.stringify(checks), alerts: JSON.stringify(alerts), capturedAt: now } });
  const active = alerts.filter((alert) => alert.level === 'crit' || alert.level === 'warn');
  const fingerprints = active.map((alert) => createHash('sha256').update(`${source}|${alert.area}|${alert.title.toLowerCase().replace(/[0-9]+(?:[.,][0-9]+)?%?/g, '#')}`).digest('hex'));
  const open = await prisma.providerHealthIncident.findMany({ where: { status: 'OPEN' }, select: { fingerprint: true, title: true } });
  const current = new Set(fingerprints);
  const recovered = open.filter((incident) => incident.fingerprint.startsWith('srv:') && !current.has(incident.fingerprint));
  if (recovered.length) await prisma.providerHealthIncident.updateMany({ where: { fingerprint: { in: recovered.map((incident) => incident.fingerprint) }, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: now, lastSeenAt: now } });
  const prior = new Set(open.map((incident) => incident.fingerprint));
  for (let index = 0; index < active.length; index++) {
    const alert = active[index]!;
    const fingerprint = `srv:${fingerprints[index]!}`;
    await prisma.providerHealthIncident.upsert({
      where: { fingerprint },
      create: { fingerprint, area: alert.area, title: alert.title, detail: alert.detail, level: alert.level, status: 'OPEN', occurrences: 1, firstSeenAt: now, lastSeenAt: now },
      update: { area: alert.area, title: alert.title, detail: alert.detail, level: alert.level, status: 'OPEN', occurrences: { increment: 1 }, lastSeenAt: now, resolvedAt: null },
    });
  }
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    await prisma.providerHealthSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } });
    await prisma.providerHealthIncident.deleteMany({ where: { status: 'RESOLVED', resolvedAt: { lt: cutoff } } });
  }
  return { newIncidents: active.filter((_, index) => !prior.has(`srv:${fingerprints[index]!}`)), recovered: recovered.map((item) => item.title) };
}

let running = false;

export function startProviderHealthMonitor() {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { checks, alerts } = await collectChecks();
      const result = await persistSnapshot(checks, alerts);
      if (result.newIncidents.length) console.warn(`[provider-health] ${result.newIncidents.length} incidencia(s) nueva(s): ${result.newIncidents.map((item) => item.title).join(' · ')}`);
      if (result.recovered.length) console.info(`[provider-health] ${result.recovered.length} incidencia(s) resuelta(s): ${result.recovered.join(' · ')}`);
    } catch (error) {
      console.error('[provider-health] no se pudo guardar el diagnóstico', error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void run(), 15_000);
  setInterval(() => void run(), SAMPLE_MS);
}
