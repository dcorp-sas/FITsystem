import { prisma } from '../db.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';

export type SettingsMap = Record<string, string>;

/** Devuelve todas las settings de la org como mapa categoria.key -> valor (sin secretos). */
export async function getSettings(orgId: string): Promise<Record<string, SettingsMap>> {
  const rows = await prisma.setting.findMany({ where: { organizationId: orgId } });
  const result: Record<string, SettingsMap> = {};
  for (const row of rows) {
    if (row.isSecret) continue;
    result[row.category] ??= {};
    result[row.category]![row.key] = row.value ?? '';
  }
  return result;
}

/** Devuelve el valor crudo de una setting (descifra si esta cifrada). */
export async function getRawSetting(orgId: string, category: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { organizationId_category_key: { organizationId: orgId, category, key } },
  });
  if (!row) return null;
  return row.isSecret ? decryptSecret(row.value ?? '') : row.value ?? null;
}

export async function upsertSettings(
  orgId: string,
  category: string,
  values: Record<string, string>,
  secrets: string[] = [],
) {
  const tx = [];
  for (const [key, value] of Object.entries(values)) {
    const isSecret = secrets.includes(key);
    const stored = isSecret ? encryptSecret(value) : value;
    tx.push(
      prisma.setting.upsert({
        where: { organizationId_category_key: { organizationId: orgId, category, key } },
        create: { organizationId: orgId, category, key, value: stored, isSecret },
        update: { value: stored, isSecret },
      }),
    );
  }
  await prisma.$transaction(tx);
  return getSettings(orgId);
}

/**
 * Migra de una sola pasada los secretos guardados en texto plano a cifrado.
 * Idempotente: los valores ya cifrados se omiten. Se ejecuta al iniciar.
 */
export async function migrateSecrets(): Promise<number> {
  const rows = await prisma.setting.findMany({ where: { isSecret: true } });
  let migrated = 0;
  for (const row of rows) {
    const value = row.value ?? '';
    if (!value || value.startsWith('enc:v1:')) continue;
    await prisma.setting.update({ where: { id: row.id }, data: { value: encryptSecret(value) } });
    migrated++;
  }
  if (migrated > 0) console.log(`[secrets] ${migrated} secreto(s) cifrados en reposo`);
  return migrated;
}

export function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}