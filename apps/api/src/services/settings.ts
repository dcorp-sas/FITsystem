import { prisma } from '../db.js';

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

/** Devuelve el valor crudo de una setting (para credenciales de integraciones internas). */
export async function getRawSetting(orgId: string, category: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { organizationId_category_key: { organizationId: orgId, category, key } },
  });
  return row?.value ?? null;
}

export async function upsertSettings(
  orgId: string,
  category: string,
  values: Record<string, string>,
  secrets: string[] = [],
) {
  const tx = [];
  for (const [key, value] of Object.entries(values)) {
    tx.push(
      prisma.setting.upsert({
        where: { organizationId_category_key: { organizationId: orgId, category, key } },
        create: { organizationId: orgId, category, key, value, isSecret: secrets.includes(key) },
        update: { value, isSecret: secrets.includes(key) },
      }),
    );
  }
  await prisma.$transaction(tx);
  return getSettings(orgId);
}

export function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}