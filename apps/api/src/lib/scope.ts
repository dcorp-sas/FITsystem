import { prisma } from '../db.js';
import { HttpError } from './http.js';

/**
 * Verifica que una sede pertenezca a la organizacion del usuario antes de usarla
 * en una escritura. Evita referencias cross-tenant via branchId del body.
 */
export async function assertBranchInOrg(organizationId: string, branchId: string | null | undefined) {
  if (!branchId) throw new HttpError(400, 'Sede requerida');
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId } });
  if (!branch) throw new HttpError(400, 'Sede invalida');
  return branch;
}

export async function assertMemberInOrg(organizationId: string, memberId: string | null | undefined) {
  if (!memberId) throw new HttpError(400, 'Socio requerido');
  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new HttpError(404, 'Socio no encontrado');
  return member;
}

export async function assertUserInOrg(organizationId: string, userId: string | null | undefined) {
  if (!userId) throw new HttpError(400, 'Usuario requerido');
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  return user;
}

export async function assertInstructorInOrg(organizationId: string, instructorId: string | null | undefined) {
  if (!instructorId) throw new HttpError(400, 'Profesor requerido');
  const instructor = await prisma.instructor.findFirst({ where: { id: instructorId, organizationId } });
  if (!instructor) throw new HttpError(404, 'Profesor no encontrado');
  return instructor;
}
