#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/*
 * Importa un dump JSON generado por scripts/db-export.mjs dentro de una base
 * PostgreSQL destino. Hace upsert por clave primaria (idempotente), por lo que
 * se puede correr varias veces sin duplicar filas.
 *
 * Uso:
 *   node scripts/db-import.mjs --file backups/fitsystem-XXXX.json --url "postgres://..."
 *   DATABASE_URL="postgres://..." node scripts/db-import.mjs --file backups/xxx.json
 */

import pg from 'pg';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = arg('file');
const POSTGRES_ID = process.env.RENDER_POSTGRES_ID || 'dpg-db65s7g473hc73d85vo0-a';

async function resolveUrl() {
  const direct = arg('url') || process.env.DATABASE_URL || process.env.TARGET_DATABASE_URL;
  if (direct) return direct;
  const token = process.env.RENDER_API_KEY;
  if (!token) return undefined;
  const res = await fetch(`https://api.render.com/v1/postgres/${POSTGRES_ID}/connection-info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  const info = await res.json();
  return info.externalConnectionString || info.internalConnectionString;
}

if (!file) {
  console.error('Uso: node scripts/db-import.mjs --file <dump.json> [--url <postgres-url>]');
  console.error('     (o defini DATABASE_URL, o RENDER_API_KEY para tomar la URL de Render)');
  process.exit(1);
}

const sslOf = (url) =>
  process.env.PGSSLMODE === 'disable' || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false };

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const dump = JSON.parse(readFileSync(file, 'utf8'));
  if (dump.format !== 'fitsystem-db-json') throw new Error('Formato de dump desconocido.');

  const url = await resolveUrl();
  if (!url) throw new Error('No hay base destino: pasa --url, DATABASE_URL o RENDER_API_KEY.');

  const client = new pg.Client({ connectionString: url, ssl: sslOf(url) });
  await client.connect();
  try {
    for (const [table, def] of Object.entries(dump.tables)) {
      const { columns, primaryKey, rows } = def;
      if (!rows.length) {
        console.log(`  ${table}: sin filas`);
        continue;
      }
      const cols = columns.map((c) => `"${c}"`).join(', ');
      const conflict = primaryKey.length
        ? `ON CONFLICT (${primaryKey.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ` +
          columns
            .filter((c) => !primaryKey.includes(c))
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(', ')
        : 'ON CONFLICT DO NOTHING';

      let done = 0;
      for (const part of chunk(rows, 200)) {
        const values = [];
        const tuples = part.map((row) => {
          const ph = columns.map((c) => {
            values.push(row[c]);
            return `$${values.length}`;
          });
          return `(${ph.join(', ')})`;
        });
        const sql = `INSERT INTO "public"."${table}" (${cols}) VALUES ${tuples.join(', ')} ${conflict}`;
        await client.query(sql, values);
        done += part.length;
      }
      console.log(`  ${table}: ${done} filas importadas`);
    }
    console.log('\nImport completado.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});