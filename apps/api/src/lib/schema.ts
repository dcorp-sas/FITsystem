import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';

interface TableColumn {
  name: string;
  definition: string;
}

/**
 * Asegura que la base de datos tenga el esquema al dia.
 *
 * En instalaciones de escritorio la base vive en el userData y puede ser de una
 * version anterior. El SQL (`schema.sql`, generado con `prisma migrate diff` en
 * el build) se aplica de forma idempotente sobre SQLite:
 *   1. crea las tablas que falten (las existentes se omiten),
 *   2. agrega columnas nuevas a tablas ya existentes (ALTER TABLE ADD COLUMN),
 *   3. crea los indices que falten.
 */
export async function ensureSchema(): Promise<void> {
  const candidates = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
    path.join(process.cwd(), 'schema.sql'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return;

  const sql = fs.readFileSync(file, 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const createTables = statements.filter((s) => /^CREATE TABLE/i.test(s));
  const rest = statements.filter((s) => !/^CREATE TABLE/i.test(s));

  let created = 0;
  let skipped = 0;
  const runIgnoringExisting = async (statement: string) => {
    try {
      await prisma.$executeRawUnsafe(statement);
      return true;
    } catch (err) {
      const message = (err as Error).message || '';
      if (/already exists|duplicate/i.test(message)) return false;
      console.error('[schema] no se pudo aplicar DDL:', message.split('\n')[0]);
      return false;
    }
  };

  for (const statement of createTables) {
    if (await runIgnoringExisting(statement)) created++;
    else skipped++;
  }

  const altered = await reconcileColumns(createTables);

  for (const statement of rest) {
    if (await runIgnoringExisting(statement)) created++;
    else skipped++;
  }

  if (created > 0 || altered > 0) {
    console.log(
      `[schema] esquema actualizado (${created} objetos creados, ${altered} columnas agregadas, ${skipped} ya existian)`,
    );
  }
}

function parseColumns(statement: string): { table: string; columns: TableColumn[] } | null {
  const match = statement.match(/CREATE TABLE "([^"]+)" \(([\s\S]*)\)\s*$/);
  if (!match || !match[1] || match[2] === undefined) return null;
  const table = match[1];
  const body = match[2];
  const columns: TableColumn[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    const column = line.match(/^"([^"]+)"\s+(.+)$/);
    if (column && column[1]) columns.push({ name: column[1], definition: line });
  }
  return { table, columns };
}

async function reconcileColumns(createTables: string[]): Promise<number> {
  let added = 0;
  for (const statement of createTables) {
    const parsed = parseColumns(statement);
    if (!parsed) continue;

    let existing: Array<{ name: string }>;
    try {
      existing = (await prisma.$queryRawUnsafe(`PRAGMA table_info("${parsed.table}")`)) as Array<{ name: string }>;
    } catch {
      continue;
    }
    const present = new Set(existing.map((row) => row.name));

    for (const column of parsed.columns) {
      if (present.has(column.name)) continue;
      // SQLite no permite agregar columnas PRIMARY KEY / UNIQUE ni con default no constante.
      if (/PRIMARY KEY|UNIQUE/i.test(column.definition)) {
        console.warn(`[schema] ${parsed.table}.${column.name}: SQLite no puede agregar esta columna automaticamente`);
        continue;
      }
      if (/NOT NULL/i.test(column.definition) && /CURRENT_TIMESTAMP/i.test(column.definition)) {
        console.warn(`[schema] ${parsed.table}.${column.name}: default no constante, requiere migracion manual`);
        continue;
      }
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${parsed.table}" ADD COLUMN ${column.definition}`);
        added++;
      } catch (err) {
        console.error(`[schema] no se pudo agregar ${parsed.table}.${column.name}:`, (err as Error).message.split('\n')[0]);
      }
    }
  }
  return added;
}
