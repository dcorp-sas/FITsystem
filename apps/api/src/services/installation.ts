import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

/**
 * Vincula una instalación de escritorio (la PC del gimnasio) con su
 * organización en la nube. El panel recibe el ID de instalación y, al ingresar,
 * la nube resuelve a qué gimnasio pertenece (sin mezclar datos entre gimnasios).
 *
 * La vinculación viaja por el canal ya autenticado de sincronización (la
 * `x-sync-key` del gimnasio), así que no se puede vincular una instalación
 * ajena: solo el sistema ya conectado a esa organización puede hacerlo.
 */
const INSTALLATION_KEY = 'INSTALLATION_ID';

/** Usuario y contraseña genéricos visibles para ingresar al panel. */
export const GENERIC_ADMIN_USER = 'admin';
export const GENERIC_ADMIN_PASSWORD = 'admin123';

export async function bindInstallation(organizationId: string, installationId: string): Promise<void> {
  const id = (installationId || '').trim();
  if (!id) return;
  const existing = await prisma.setting.findUnique({
    where: { organizationId_category_key: { organizationId, category: 'SYNC', key: INSTALLATION_KEY } },
    select: { value: true },
  });
  if (existing?.value === id) return;
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId, category: 'SYNC', key: INSTALLATION_KEY } },
    create: { organizationId, category: 'SYNC', key: INSTALLATION_KEY, value: id, isSecret: false },
    update: { value: id },
  });
}

/** Organización de la nube a la que pertenece una instalación de escritorio. */
export async function findOrgByInstallation(installationId: string): Promise<string | null> {
  const id = (installationId || '').trim();
  if (!id) return null;
  const setting = await prisma.setting.findFirst({
    where: { category: 'SYNC', key: INSTALLATION_KEY, value: id },
    select: { organizationId: true },
  });
  return setting?.organizationId ?? null;
}

/** Email del administrador genérico de una organización (único por gimnasio). */
export function genericAdminEmail(orgSlug: string): string {
  const slug = (orgSlug || 'gimnasio').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'gimnasio';
  return `${GENERIC_ADMIN_USER}@${slug}.fitsystem.local`;
}

/**
 * Asegura el administrador genérico (usuario "admin" / "admin123") de un
 * gimnasio, con la contraseña por defecto siempre válida. Se usa al conectar el
 * escritorio con la nube y al ingresar con el usuario genérico, para que
 * cualquier instalación pueda entrar al panel sin configurar nada.
 */
export async function ensureGenericAdmin(
  org: { id: string; slug: string },
  branchId?: string | null,
): Promise<{ id: string; email: string }> {
  const email = genericAdminEmail(org.slug);
  const passwordHash = await bcrypt.hash(GENERIC_ADMIN_PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, isActive: true, role: 'OWNER', organizationId: org.id },
    });
    return { id: existing.id, email };
  }
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: branchId ?? null,
      name: 'Administrador',
      email,
      passwordHash,
      role: 'OWNER',
    },
    select: { id: true, email: true },
  });
  return user;
}
