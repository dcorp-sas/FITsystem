import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { membershipSchema, membershipFreezeSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { addDays, daysBetween } from '@fitsystem/utils';
import { notifyEvent } from '../services/notifications.js';

function computeEndDate(start: Date, durationDays: number): Date {
  return addDays(start, Math.max(1, durationDays) - 1);
}

export function membershipRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Listado de membresias, con filtros de vencimiento
  app.get('/memberships', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { status?: string; expiringDays?: string; search?: string };
      const orgId = req.user.organizationId;
      const where: Record<string, unknown> = { organizationId: orgId };
      if (query.status) where.status = query.status;
      if (query.expiringDays) {
        const days = Number(query.expiringDays);
        const now = new Date();
        where.status = { in: ['ACTIVE', 'FROZEN'] };
        where.endDate = { lte: addDays(now, days), gte: now };
      }
      if (query.search) {
        where.member = {
          OR: [
            { firstName: { contains: query.search } },
            { lastName: { contains: query.search } },
            { memberCode: { contains: query.search } },
          ],
        };
      }
      const memberships = await prisma.membership.findMany({
        where,
        orderBy: { endDate: 'asc' },
        include: {
          member: true,
          plan: true,
          payments: { where: { concept: 'MEMBERSHIP' }, orderBy: { paidAt: 'desc' }, take: 3 },
        },
      });
      const items = memberships.map((m) => ({
        id: m.id,
        memberId: m.memberId,
        planId: m.planId,
        planName: m.plan.name,
        planColor: m.plan.color,
        member: { id: m.member.id, name: `${m.member.firstName} ${m.member.lastName}`, phone: m.member.phone, email: m.member.email, memberCode: m.member.memberCode },
        startDate: m.startDate,
        endDate: m.endDate,
        status: m.status,
        price: m.price,
        discount: m.discount,
        autoRenew: m.autoRenew,
        frozenDays: m.frozenDays,
        daysLeft: daysBetween(new Date(), m.endDate),
      }));
      return ok(reply, items);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Alta de membresia (calcula vencimiento segun plan)
  app.post('/memberships', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(membershipSchema, request.body);
      const orgId = req.user.organizationId;
      const plan = await prisma.plan.findFirst({ where: { id: input.planId, organizationId: orgId } });
      if (!plan) throw new HttpError(404, 'Plan no encontrado');
      const member = await prisma.member.findFirst({ where: { id: input.memberId, organizationId: orgId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      // Si ya tiene membresia activa, cancelar las anteriores activas para el mismo plan
      await prisma.membership.updateMany({
        where: { memberId: input.memberId, organizationId: orgId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });

      const startDate = new Date(input.startDate);
      const endDate = input.endDate ? new Date(input.endDate) : computeEndDate(startDate, plan.durationDays);
      const membership = await prisma.membership.create({
        data: {
          organizationId: orgId,
          branchId: input.branchId,
          memberId: input.memberId,
          planId: plan.id,
          startDate,
          endDate,
          price: input.price ?? plan.price,
          discount: input.discount ?? 0,
          autoRenew: input.autoRenew ?? false,
          status: input.status ?? 'ACTIVE',
          soldById: req.user.id,
        },
      });

      await prisma.member.update({ where: { id: member.id }, data: { status: 'ACTIVE' } });
      await logActivity(req, 'CREATE', 'MEMBERSHIP', membership.id, undefined, { member: member.id, plan: plan.name, endDate: endDate.toISOString() });
      await notifyEvent(req.user.organizationId, member.id, 'WELCOME', { member, plan, endDate });
      return ok(reply, membership, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Renovacion: crea nueva membresia desde el vencimiento actual
  app.post('/memberships/:id/renew', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const body = request.body as { months?: number };
      const existing = await prisma.membership.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: { plan: true, member: true },
      });
      if (!existing) throw new HttpError(404, 'Membresia no encontrada');

      const now = new Date();
      const startDate = existing.endDate > now ? addDays(existing.endDate, 1) : now;
      const endDate = computeEndDate(startDate, existing.plan.durationDays);

      const membership = await prisma.membership.create({
        data: {
          organizationId: existing.organizationId,
          branchId: existing.branchId,
          memberId: existing.memberId,
          planId: existing.planId,
          startDate,
          endDate,
          price: existing.price,
          discount: existing.discount,
          autoRenew: existing.autoRenew,
          status: 'ACTIVE',
          soldById: req.user.id,
        },
      });

      await logActivity(req, 'RENEW', 'MEMBERSHIP', membership.id, undefined, { member: existing.memberId, plan: existing.plan.name, endDate: endDate.toISOString() });
      await notifyEvent(req.user.organizationId, existing.memberId, 'RENEWAL_REMINDER', { member: existing.member, plan: existing.plan, endDate });
      return ok(reply, membership, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Congelar membresia (pausa)
  app.post('/memberships/:id/freeze', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(membershipFreezeSchema, request.body);
      const existing = await prisma.membership.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: { plan: true, member: true },
      });
      if (!existing) throw new HttpError(404, 'Membresia no encontrada');
      if (!existing.plan.allowFreeze) throw new HttpError(400, 'Este plan no permite pausas');

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end <= start) throw new HttpError(400, 'Fecha de fin debe ser posterior al inicio');
      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      if (existing.plan.maxFreezeDays > 0 && days > existing.plan.maxFreezeDays) {
        throw new HttpError(400, `Este plan permite maximo ${existing.plan.maxFreezeDays} dias de pausa`);
      }

      // Correr el vencimiento hacia adelante
      const newEndDate = addDays(existing.endDate, days);
      const [freeze] = await prisma.$transaction([
        prisma.membershipFreeze.create({
          data: {
            membershipId: id,
            startDate: start,
            endDate: end,
            days,
            reason: input.reason || null,
            fee: input.fee ?? existing.plan.freezeFee,
            createdBy: req.user.id,
          },
        }),
        prisma.membership.update({ where: { id }, data: { status: 'FROZEN', frozenDays: existing.frozenDays + days, endDate: newEndDate } }),
        prisma.member.update({ where: { id: existing.memberId }, data: { status: 'FROZEN' } }),
      ]);

      await logActivity(req, 'FREEZE', 'MEMBERSHIP', id, undefined, { days, newEndDate: newEndDate.toISOString() });
      return ok(reply, { freeze, endDate: newEndDate }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Reactivar membresia congelada
  app.post('/memberships/:id/unfreeze', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.membership.findFirst({
        where: { id, organizationId: req.user.organizationId, status: 'FROZEN' },
      });
      if (!existing) throw new HttpError(404, 'Membresia congelada no encontrada');

      const membership = await prisma.membership.update({ where: { id }, data: { status: 'ACTIVE' } });
      await prisma.member.update({ where: { id: existing.memberId }, data: { status: 'ACTIVE' } });
      await logActivity(req, 'UNFREEZE', 'MEMBERSHIP', id);
      return ok(reply, membership);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cancelar membresia
  app.post('/memberships/:id/cancel', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.membership.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Membresia no encontrada');
      const membership = await prisma.membership.update({ where: { id }, data: { status: 'CANCELLED' } });
      await logActivity(req, 'CANCEL', 'MEMBERSHIP', id);
      return ok(reply, membership);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default membershipRoutes;