#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';

/*
 * Exporta toda la base PostgreSQL a un archivo JSON portable.
 * Funciona en el plan free de Render (que no habilita los exports de su API).
 *
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/db-export.mjs
 *   # o, tomando la URL externa desde la API de Render:
 *   RENDER_API_KEY="rnd_..." node scripts/db-export.mjs
 *
 * Salida: backups/fitsystem-<fecha>.json
 * Restaurar: node scripts/db-import.mjs --file <archivo.json>
 */

import pg from 'pg';

const POSTGRES_ID = process.env.RENDER_POSTGRES_ID || 'dpg-db65s7g473hc73d85vo0-a';
const OUT_DIR = process.env.BACKUP_DIR || 'backups';

async function resolveUrl() {
  const direct = process.env.DATABASE_URL || process.env.TARGET_DATABASE_URL;
  if (direct) return direct;
  const token = process.env.RENDER_API_KEY;
  if (!token) {
    console.error('Defini DATABASE_URL, o bien RENDER_API_KEY para obtenerla desde Render.');
    process.exit(1);
  }
  const res = await fetch(`https://api.render.com/v1/postgres/${POSTGRES_ID}/connection-info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`No se pudo obtener la conexion: HTTP ${res.status} ${await res.text()}`);
  const info = await res.json();
  const url = info.externalConnectionString || info.internalConnectionString;
  if (!url) throw new Error('Render no devolvio connectionString.');
  return url;
}

function sslOpts(url) {
  if (process.env.PGSSLMODE === 'disable' || /sslmode=disable/.test(url)) return false;
  return { rejectUnauthorized: false };
}

async function main() {
  const url = await resolveUrl();
  const client = new pg.Client({ connectionString: url, ssl: sslOpts(url) });
  await client.connect();
  try {
    const tablesRes = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = {};
    let totalRows = 0;
    for (const { tablename } of tablesRes.rows) {
      const colsRes = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [tablename],
      );
      const pkRes = await client.query(
        `SELECT a.attname AS col
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [`public."${tablename}"`],
      );
      const rowsRes = await client.query(`SELECT * FROM "public"."${tablename}"`);
      tables[tablename] = {
        columns: colsRes.rows.map((r) => r.column_name),
        primaryKey: pkRes.rows.map((r) => r.col),
        rows: rowsRes.rows,
      };
      totalRows += rowsRes.rows.length;
      console.log(`  ${tablename}: ${rowsRes.rows.length} filas`);
    }

    const dump = {
      format: 'fitsystem-db-json',
      version: 1,
      createdAt: new Date().toISOString(),
      tables,
    };
    mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${OUT_DIR}/fitsystem-${stamp}.json`;
    writeFileSync(file, JSON.stringify(dump, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    console.log(`\nExport OK: ${file} (${Object.keys(tables).length} tablas, ${totalRows} filas)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});