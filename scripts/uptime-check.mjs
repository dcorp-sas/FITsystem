// Chequeo de disponibilidad (uptime) de los servicios publicos de FIT System.
// Lo ejecuta .github/workflows/uptime.yml de forma programada. Si algun servicio
// no responde, el script termina con codigo 1 y el workflow abre/actualiza un
// issue con la etiqueta "uptime".
//
// Se puede probar localmente:  node scripts/uptime-check.mjs

const targets = [
  { name: 'web', url: process.env.WEB_URL || 'https://fitsystem.com.ar/', expect: 200 },
  { name: 'socios', url: process.env.SOCIOS_URL || 'https://socios.fitsystem.com.ar/', expect: 200 },
  {
    name: 'api',
    url: (process.env.API_URL || 'https://api.fitsystem.com.ar') + '/health',
    expect: 200,
    contains: 'fitsystem-api',
  },
  {
    name: 'licensador',
    url: (process.env.LICENSOR_URL || 'https://licensador.fitsystem.com.ar') + '/api/health',
    expect: 200,
    contains: 'fitsystem-licensador',
  },
];

const TIMEOUT_MS = 60_000;
const RETRIES = 2;
const RETRY_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkOnce(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(target.url, { redirect: 'follow', signal: controller.signal });
    const text = await res.text();
    const ms = Date.now() - started;
    if (res.status !== target.expect) return { ok: false, detail: `HTTP ${res.status} (se esperaba ${target.expect})`, ms };
    if (target.contains && !text.includes(target.contains)) {
      return { ok: false, detail: `respuesta sin "${target.contains}"`, ms };
    }
    return { ok: true, detail: `HTTP ${res.status}`, ms };
  } catch (err) {
    return { ok: false, detail: err?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : String(err?.message || err), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function checkWithRetry(target) {
  let last;
  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    last = await checkOnce(target);
    if (last.ok) return { ...last, attempts: attempt };
    if (attempt <= RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return { ...last, attempts: RETRIES + 1 };
}

const results = await Promise.all(targets.map(checkWithRetry));

let failed = 0;
console.log('Chequeo de uptime - ' + new Date().toISOString());
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  const r = results[i];
  if (!r.ok) failed++;
  const flag = r.ok ? 'OK  ' : 'FAIL';
  console.log(`[${flag}] ${t.name.padEnd(11)} ${r.detail}  (${r.ms}ms${r.attempts > 1 ? `, ${r.attempts} intentos` : ''})  ${t.url}`);
}

if (failed > 0) {
  console.error(`\n${failed}/${targets.length} servicio(s) no respondieron.`);
  process.exit(1);
}
console.log(`\nTodos los servicios (${targets.length}) responden correctamente.`);
