import { prisma } from '../db.js';
import { getRawSetting, upsertSettings } from './settings.js';

/**
 * Cuenta interna del PROVEEDOR (FIT System).
 *
 * El servicio de facturación (ARCA) guarda su configuración en `Setting`, y esa
 * tabla siempre pertenece a una organización. Para no mezclar la facturación del
 * producto con la de un gimnasio, usamos una organización oculta con un slug
 * reservado. Nunca se muestra como cliente en el panel.
 */
export const PROVIDER_ORG_SLUG = '__proveedor__';
const PROVIDER_CATEGORY = 'ARCA';

let cachedId: string | null = null;

export async function providerOrgId(): Promise<string> {
  if (cachedId) return cachedId;
  const existing = await prisma.organization.findUnique({
    where: { slug: PROVIDER_ORG_SLUG },
    select: { id: true },
  });
  if (existing) {
    cachedId = existing.id;
    return cachedId;
  }
  try {
    const created = await prisma.organization.create({
      data: {
        name: 'FIT System (proveedor)',
        slug: PROVIDER_ORG_SLUG,
        currency: 'ARS',
        isActive: false,
        email: 'ventas@fitsystem.com.ar',
      },
      select: { id: true },
    });
    cachedId = created.id;
    return cachedId;
  } catch {
    // Carrera entre dos requests: el otro proceso ya la creó.
    const again = await prisma.organization.findUnique({
      where: { slug: PROVIDER_ORG_SLUG },
      select: { id: true },
    });
    if (!again) throw new Error('No se pudo crear la cuenta interna del proveedor');
    cachedId = again.id;
    return cachedId;
  }
}

export async function getProviderArcaSetting(key: string): Promise<string | null> {
  const orgId = await providerOrgId();
  return getRawSetting(orgId, PROVIDER_CATEGORY, key);
}

export async function saveProviderArcaSettings(values: Record<string, string>, secrets: string[] = []): Promise<void> {
  const orgId = await providerOrgId();
  await upsertSettings(orgId, PROVIDER_CATEGORY, values, secrets);
}
