// Genera prisma/schema.postgres.prisma a partir de schema.prisma para desplegar
// la API con PostgreSQL (Render). Asi el esquema tiene una unica fuente de verdad.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'prisma');
const src = join(dir, 'schema.prisma');
const out = join(dir, 'schema.postgres.prisma');

const content = readFileSync(src, 'utf8');
if (!/provider\s*=\s*"sqlite"/.test(content)) {
  console.error('[pg-schema] no se encontro provider = "sqlite" en schema.prisma');
  process.exit(1);
}

const pg = content.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
writeFileSync(out, pg);
console.log('[pg-schema] generado prisma/schema.postgres.prisma');
