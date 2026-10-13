import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { portalAccountSchema, portalInviteSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { fullName } from '@fitsystem/utils';
import { generatePassword } from '../services/portal-account.js';
import { sendCredentials } from '../services/onboarding.js';

function generateActivationCode(): string {
  return String(randomInt(0, 100000000)).padStart(8, '0');
}

async function maxSeats(organizationId: string): Promise<number> {
  const license = await prisma.license.findUnique({ where: { organizationId } });
  return license?.seats ?? 0;
}

export function portalAdminRoutes(app: FastifyInstance) {
  const auth = app.authenticate;
  const staff = app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST']);

  // Estado del portal de socios + asientos
  app.get('/portal-accounts', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const search = (request.query as { search?: string }).search?.trim();

      const members = await prisma.member.findMany({
        where: {
          organizationId: req.user.organizationId,
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search } },
                  { lastName: { contains: search } },
                  { documentNumber: { contains: search } },
                  { memberCode: { contains: search } },
                  { email: { contains: search } },
                ],
              }
            : {}),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 500,
        include: { portalAccount: true },
      });

      const total = await maxSeats(req.user.organizationId);
      const used = members.filter((m) => m.portalAccount?.isActive).length;

      const items = members.map((m) => ({
        memberId: m.id,
        memberCode: m.memberCode,
        name: fullName(m.firstName, m.lastName),
        email: m.portalAccount?.email ?? m.email ?? null,
        phone: m.phone ?? null,
        status: m.status,
        hasAccount: Boolean(m.portalAccount),
        isActive: m.portalAccount?.isActive ?? false,
        accountId: m.portalAccount?.id ?? null,
        activationPending: Boolean(m.portalAccount?.activationCode),
        lastLoginAt: m.portalAccount?.lastLoginAt ?? null,
      }));

      return ok(reply, { items, seats: { used, total } });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Habilitar / crear la cuenta del portal para un socio
  app.post('/members/:id/portal', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(portalAccountSchema, request.body);

      const member = await prisma.member.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      const existing = await prisma.portalAccount.findUnique({ where: { memberId: id } });
      if (!existing || !existing.isActive) {
        const used = await prisma.portalAccount.count({ where: { organizationId: req.user.organizationId, isActive: true } });
        const total = await maxSeats(req.user.organizationId);
        if (total > 0 && used >= total) {
          throw new HttpError(409, 'Alcanzaste el limite de asientos de la app movil. Amplia tu licencia.');
        }
      }

      const email = input.email || member.email || existing?.email || null;
      const activationCode = input.generateCode || !input.password ? generateActivationCode() : null;
      const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : existing?.passwordHash ?? null;

      const account = await prisma.portalAccount.upsert({
        where: { memberId: id },
        create: {
          organizationId: req.user.organizationId,
          memberId: id,
          email,
          documentNumber: member.documentNumber,
          passwordHash,
          activationCode,
          isActive: true,
        },
        update: {
          email,
          documentNumber: member.documentNumber,
          ...(input.password ? { passwordHash } : {}),
          ...(activationCode ? { activationCode } : {}),
          isActive: true,
        },
      });

      await logActivity(req, existing ? 'UPDATE' : 'CREATE', 'PORTAL_ACCOUNT', account.id, undefined, { memberId: id });
      return ok(reply, {
        account: { id: account.id, email: account.email, activationCode: account.activationCode, isActive: account.isActive },
      }, existing ? 200 : 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Regenerar codigo de activacion / resetear clave
  app.post('/portal-accounts/:id/reset', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(portalAccountSchema, request.body);

      const account = await prisma.portalAccount.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!account) throw new HttpError(404, 'Cuenta del portal no encontrada');

      const activationCode = input.password ? null : generateActivationCode();
      const data: Record<string, unknown> = { isActive: true };
      if (input.email) data.email = input.email;
      if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);
      if (activationCode) data.activationCode = activationCode;

      const updated = await prisma.portalAccount.update({ where: { id }, data });
      await logActivity(req, 'RESET', 'PORTAL_ACCOUNT', id);
      return ok(reply, {
        account: { id: updated.id, email: updated.email, activationCode: updated.activationCode, isActive: updated.isActive },
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Enviar/reenviar credenciales de acceso al socio (email). Resetea la clave.
  app.post('/members/:id/portal/invite', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(portalInviteSchema, request.body ?? {});

      const member = await prisma.member.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      const existing = await prisma.portalAccount.findUnique({ where: { memberId: id } });
      if (!existing || !existing.isActive) {
        const used = await prisma.portalAccount.count({ where: { organizationId: req.user.organizationId, isActive: true } });
        const total = await maxSeats(req.user.organizationId);
        if (total > 0 && used >= total) {
          throw new HttpError(409, 'Alcanzaste el limite de asientos de la app movil. Amplia tu licencia.');
        }
      }

      const email = input.email || member.email || existing?.email || null;
      if (!email) throw new HttpError(400, 'El socio no tiene email cargado');

      const username = member.documentNumber || member.memberCode;
      const password = generatePassword(8);
      const passwordHash = await bcrypt.hash(password, 10);

      const account = await prisma.portalAccount.upsert({
        where: { memberId: id },
        create: {
          organizationId: req.user.organizationId,
          memberId: id,
          email,
          documentNumber: member.documentNumber,
          passwordHash,
          activationCode: null,
          isActive: true,
        },
        update: { email, documentNumber: member.documentNumber, passwordHash, activationCode: null, isActive: true },
      });

      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const sent = await sendCredentials(req.user.organizationId, email, {
        memberName: fullName(member.firstName, member.lastName),
        gymName: org?.name ?? 'tu gimnasio',
        username,
        password,
      });

      await logActivity(req, 'INVITE', 'PORTAL_ACCOUNT', account.id, undefined, { memberId: id, emailSent: sent.ok });
      return ok(reply, {
        username,
        password,
        email,
        emailSent: sent.ok,
        emailError: sent.ok ? null : sent.error ?? 'No se pudo enviar el email',
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Deshabilitar la cuenta del portal
  app.delete('/portal-accounts/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const account = await prisma.portalAccount.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!account) throw new HttpError(404, 'Cuenta del portal no encontrada');
      await prisma.portalAccount.update({ where: { id }, data: { isActive: false, activationCode: null } });
      await logActivity(req, 'DISABLE', 'PORTAL_ACCOUNT', id);
      return ok(reply, { disabled: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // (staff) Listado de socios para selectores
  app.get('/portal-accounts/members', { onRequest: [auth, staff] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const members = await prisma.member.findMany({
        where: { organizationId: req.user.organizationId, status: 'ACTIVE' },
        orderBy: [{ lastName: 'asc' }],
        take: 1000,
        select: { id: true, firstName: true, lastName: true, memberCode: true },
      });
      return ok(reply, { items: members.map((m) => ({ ...m, name: fullName(m.firstName, m.lastName) })) });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default portalAdminRoutes;
