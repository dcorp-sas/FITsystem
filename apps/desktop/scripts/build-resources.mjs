import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const root = path.resolve(desktopDir, '../..');
const staging = path.join(desktopDir, 'build-resources');
const stagingApi = path.join(staging, 'api');
const stagingWeb = path.join(staging, 'web');

function run(cmdline, extraEnv = {}) {
  console.log(`\n> ${cmdline}`);
  execSync(cmdline, { stdio: 'inherit', cwd: root, env: { ...process.env, ...extraEnv } });
}

function dirSize(dir) {
  let total = 0;
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return Math.round((total / 1024 / 1024) * 10) / 10;
}

function findGeneratedPrisma() {
  const store = path.join(root, 'node_modules', '.pnpm');
  for (const dir of fs.readdirSync(store)) {
    if (!dir.startsWith('@prisma+client@')) continue;
    const candidate = path.join(store, dir, 'node_modules', '.prisma');
    const clientDir = path.join(candidate, 'client');
    if (!fs.existsSync(clientDir)) continue;
    const hasEngine = fs
      .readdirSync(clientDir)
      .some((f) => /^query_engine.*\.node$/.test(f) || /^libquery_engine.*\.node$/.test(f));
    if (hasEngine) return candidate;
  }
  throw new Error(
    'No se encontro el cliente generado de Prisma con su engine. Ejecuta "prisma generate" en apps/api.',
  );
}

console.log('== Generando recursos para FIT System desktop ==');
console.log('Root:', root);
console.log('Staging:', staging);

console.log('\n[1/7] Limpiando staging...');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

console.log('\n[2/7] Generando cliente Prisma y compilando API...');
run('pnpm --filter @fitsystem/api exec prisma generate');
run('pnpm --filter @fitsystem/api build');

console.log('\n[3/7] Compilando web (Next.js)...');
run('pnpm --filter @fitsystem/web build', { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001' });

console.log('\n[4/7] Empaquetando API (deploy plano)...');
run(
  `pnpm --filter @fitsystem/api deploy "${stagingApi}" --prod --config.node-linker=hoisted`,
);

console.log('\n[5/7] Empaquetando web (deploy plano)...');
run(
  `pnpm --filter @fitsystem/web deploy "${stagingWeb}" --prod --config.node-linker=hoisted`,
);

console.log('\n[6/7] Copiando cliente Prisma y esquema SQL...');
run(
  `pnpm --filter @fitsystem/api exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > "${path.join(stagingApi, 'schema.sql')}"`,
);

const generated = findGeneratedPrisma();
const destPrisma = path.join(stagingApi, 'node_modules', '.prisma');
fs.rmSync(destPrisma, { recursive: true, force: true });
fs.cpSync(generated, destPrisma, { recursive: true });

const engineOk = fs
  .readdirSync(path.join(destPrisma, 'client'))
  .some((f) => /^query_engine.*\.node$/.test(f));
console.log('Engine Prisma presente:', engineOk);

console.log('\n[7/7] Purgando archivos no necesarios en runtime...');
const pruneTargets = [
  path.join(stagingWeb, '.next', 'cache'),
  path.join(stagingApi, 'node_modules', 'prisma'),
  path.join(stagingApi, 'node_modules', '@prisma', 'engines'),
  path.join(stagingApi, 'node_modules', '@prisma', 'fetch-engine'),
  path.join(stagingApi, 'node_modules', '@prisma', 'get-platform'),
  path.join(stagingApi, '.env'),
  path.join(stagingApi, 'prisma', 'dev.db'),
  path.join(stagingApi, 'prisma', 'dev.db-journal'),
];
for (const target of pruneTargets) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('removido:', path.relative(root, target));
  }
}
const swcDir = path.join(stagingWeb, 'node_modules', '@next');
if (fs.existsSync(swcDir)) {
  for (const entry of fs.readdirSync(swcDir)) {
    if (entry.startsWith('swc-')) {
      fs.rmSync(path.join(swcDir, entry), { recursive: true, force: true });
      console.log('removido:', path.relative(root, path.join(swcDir, entry)));
    }
  }
}

console.log('\n== Listo ==');
console.log('API:', stagingApi, `(${dirSize(stagingApi)} MB)`);
console.log('WEB:', stagingWeb, `(${dirSize(stagingWeb)} MB)`);
console.log('Total:', dirSize(staging), 'MB');
