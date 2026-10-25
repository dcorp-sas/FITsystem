import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';

const KEEP_BACKUPS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function getLocalDatabasePath(): string | null {
  const value = process.env.DATABASE_URL || '';
  if (!value.startsWith('file:')) return null;
  try {
    return fileURLToPath(value.split('?')[0] || value);
  } catch {
    return null;
  }
}

function nextFourAmDelay(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

async function createLocalBackup(dbPath: string): Promise<void> {
  const folder = path.join(path.dirname(dbPath), 'backups');
  await fs.mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(folder, `fitsystem-${stamp}.db`);
  const escapedTarget = target.replace(/'/g, "''");

  // SQLite VACUUM INTO crea una copia consistente incluso cuando la base está
  // en uso; copiar solo el archivo .db podría omitir transacciones del WAL.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size < 1024) {
    await fs.rm(target, { force: true });
    throw new Error('La copia local quedó vacía o incompleta');
  }

  const files = (await fs.readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^fitsystem-.*\.db$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const old of files.slice(KEEP_BACKUPS)) {
    await fs.rm(path.join(folder, old), { force: true });
  }
  console.log(`[backup] copia local creada: ${target} (${Math.round(stat.size / 1024)} KB); rotación: ${KEEP_BACKUPS}`);
}

/**
 * Solo se activa en instalaciones locales SQLite (desktop). En el servidor
 * PostgreSQL se usa el workflow de backup de infraestructura.
 */
export function startLocalBackupScheduler(): void {
  const dbPath = getLocalDatabasePath();
  if (!dbPath) return;

  const run = async () => {
    try {
      await createLocalBackup(dbPath);
    } catch (error) {
      console.error('[backup] falló la copia local automática:', error);
    }
  };

  // Primera copia tras el arranque y luego una copia diaria a las 04:00 local.
  setTimeout(() => {
    void run();
    const scheduleNext = () => {
      setTimeout(() => {
        void run();
        scheduleNext();
      }, DAY_MS);
    };
    setTimeout(() => {
      void run();
      scheduleNext();
    }, nextFourAmDelay());
  }, 60_000);
}
