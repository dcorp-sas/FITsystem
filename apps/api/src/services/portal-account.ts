import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '../db.js';

export function generateActivationCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Genera una clave legible para el socio (sin caracteres ambiguos).
 */
export function generatePassword(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length];
  return out;
}

export async function licenseSeats(organizationId: string): Promise<number> {
  const license = await prisma.license.findUnique({ where: { organizationId } });
  return license?.seats ?? 0;
}

export async function seatsUsed(organizationId: string): Promise<number> {
  return prisma.portalAccount.count({ where: { organizationId, isActive: true } });
}

export interface ProvisionResult {
  created: boolean;
  reason?: 'already' | 'seat_limit';
  username: string;
  password?: string;
}

/**
 * Genera (o habilita) el acceso a la app del socio. El usuario y la clave los
 * crea el sistema principal; respeta el limite de asientos de la licencia.
 */
export async function autoProvisionPortalAccount(params: {
  organizationId: string;
  member: { id: string; email: string | null; documentNumber: string | null; memberCode: string };
}): Promise<ProvisionResult> {
  const { organizationId, member } = params;
  const username = member.documentNumber || member.memberCode;

  const existing = await prisma.portalAccount.findUnique({ where: { memberId: member.id } });
  if (existing?.isActive && existing.passwordHash) {
    return { created: false, reason: 'already', username: existing.email || username };
  }

  const total = await licenseSeats(organizationId);
  const used = await seatsUsed(organizationId);
  if (total > 0 && used >= total) {
    return { created: false, reason: 'seat_limit', username };
  }

  const password = generatePassword(8);
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.portalAccount.upsert({
    where: { memberId: member.id },
    create: {
      organizationId,
      memberId: member.id,
      email: member.email,
      documentNumber: member.documentNumber,
      passwordHash,
      activationCode: null,
      isActive: true,
    },
    update: {
      passwordHash,
      isActive: true,
      ...(member.email ? { email: member.email } : {}),
      documentNumber: member.documentNumber,
    },
  });

  return { created: true, username, password };
}

/**
 * Sincroniza la cuenta del portal del socio cuando se editan sus datos en el
 * sistema principal (DNI, email). Si el socio nunca tuvo cuenta, la crea (con
 * el mismo limite de asientos que el alta). Nunca reactiva una cuenta que el
 * gimnasio deshabilito a proposito.
 */
export async function syncPortalAccount(params: {
  organizationId: string;
  member: { id: string; email: string | null; documentNumber: string | null; memberCode: string };
}): Promise<ProvisionResult> {
  const { organizationId, member } = params;
  const existing = await prisma.portalAccount.findUnique({ where: { memberId: member.id } });

  if (existing) {
    await prisma.portalAccount.update({
      where: { memberId: member.id },
      data: {
        ...(member.documentNumber ? { documentNumber: member.documentNumber } : {}),
        ...(member.email ? { email: member.email } : {}),
      },
    });
    return {
      created: false,
      reason: 'already',
      username: existing.email || member.documentNumber || member.memberCode,
    };
  }

  return autoProvisionPortalAccount({ organizationId, member });
}
