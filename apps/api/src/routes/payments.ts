import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { paymentSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { notifyEvent } from '../services/notifications.js';
import { addDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from '@fitsystem/utils';

const CONCEPT_CATEGORY: Record<string, string> = {
  MEMBERSHIP: 'MEMBERSHIP',
  ENROLLMENT: 'ENROLLMENT',
  FREEZE: 'FREEZE',
  PRODUCT: 'PRODUCT_SALE',
  CLASS: 'CLASS',
  OTHER: 'OTHER',
};

export function paymentRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Lista de pagos con filtros
  app.get('/payments', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as {
        from?: string;
        to?: string;
        method?: string;
        memberId?: string;
        status?: string;
        page?: string;
        pageSize?: string;
      };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (req.user.branchId && !['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
        where.branchId = req.user.branchId;
      }
      if (query.memberId) where.memberId = query.memberId;
      if (query.method) where.method = query.method;
      if (query.status) where.status = query.status;
      if (query.from || query.to) {
        where.paidAt = {
          gte: query.from ? startOfDay(new Date(query.from)) : undefined,
          lte: query.to ? endOfDay(new Date(query.to)) : undefined,
        };
      }
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));
      const [total, payments] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          orderBy: { paidAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            member: { select: { id: true, firstName: true, lastName: true, memberCode: true } },
            receivedBy: { select: { name: true } },
          },
        }),
      ]);
      return ok(reply, { total, page, pageSize, items: payments });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Resumen de ingresos por periodo y medio de pago
  app.get('/payments/summary', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string };
      const orgId = req.user.organizationId;
      const from = query.from ? startOfDay(new Date(query.from)) : startOfMonth();
      const to = query.to ? endOfDay(new Date(query.to)) : endOfMonth();
      const fires = await prisma.payment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED', paidAt: { gte: from, lte: to } },
      });
      const byMethod: Record<string, number> = {};
      const byConcept: Record<string, number> = {};
      let total = 0;
      for (const p of fires) {
        total += p.amount;
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
        byConcept[p.concept] = (byConcept[p.concept] ?? 0) + p.amount;
      }
      const pending = await prisma.payment.count({
        where: { organizationId: orgId, status: 'PENDING', paidAt: { gte: from, lte: to } },
      });
      return ok(reply, { from, to, total, count: fires.length, pending, byMethod, byConcept });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Deudas: membresias activas con vencimiento sin pago en el periodo
  app.get('/payments/pending', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const memberships = await prisma.membership.findMany({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'FROZEN'] } },
        include: { member: true, plan: true },
      });
      const now = new Date();
      const debts = memberships
        .map((m) => ({
          id: m.id,
          memberId: m.memberId,
          memberName: `${m.member.firstName} ${m.member.lastName}`,
          memberCode: m.member.memberCode,
          phone: m.member.phone,
          planName: m.plan.name,
          dueDate: m.endDate,
          overdueDays: Math.max(0, Math.ceil((now.getTime() - m.endDate.getTime()) / 86400000)),
          amount: m.price - m.discount,
        }))
        .filter((d) => d.dueDate < now)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      const expiring = memberships
        .map((m) => ({
          id: m.id,
          memberId: m.memberId,
          memberName: `${m.member.firstName} ${m.member.lastName}`,
          memberCode: m.member.memberCode,
          phone: m.member.phone,
          planName: m.plan.name,
          dueDate: m.endDate,
          daysLeft: Math.max(0, Math.ceil((m.endDate.getTime() - now.getTime()) / 86400000)),
          amount: m.price - m.discount,
        }))
        .filter((d) => d.dueDate >= now && d.dueDate <= addDays(now, 7))
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      return ok(reply, { debts, expiring });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Registrar pago (crea movimiento de caja y confirma cobro)
  app.post('/payments', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(paymentSchema, request.body);
      const orgId = req.user.organizationId;
      const branchId = input.membershipId
        ? (await prisma.membership.findFirst({ where: { id: input.membershipId, organizationId: orgId } }))
            ?.branchId ?? req.user.branchId ?? undefined
        : req.user.branchId ?? undefined;

      if (!branchId) throw new HttpError(400, 'Se necesita una sede para registrar el pago');
      const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } });
      if (!branch) throw new HttpError(400, 'Sede invalida');

      const count = await prisma.payment.count({ where: { organizationId: orgId } });
      const reference = input.reference || `RE-${String(count + 1).padStart(6, '0')}`;
      const status = input.status ?? 'COMPLETED';

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: input.memberId ?? null,
          membershipId: input.membershipId ?? null,
          concept: input.concept,
          method: input.method,
          status,
          amount: input.amount,
          currency: 'ARS',
          reference,
          paidAt: new Date(),
          receivedById: req.user.id,
          notes: input.notes || null,
        },
      });

      // Marca membresia pagada/activa si corresponde
      if (input.membershipId && status === 'COMPLETED') {
        await prisma.membership.update({
          where: { id: input.membershipId },
          data: { status: 'ACTIVE' },
        });
      }

      // Movimiento de caja por ingreso
      if (status === 'COMPLETED') {
        const openSession = await prisma.cashSession.findFirst({
          where: { organizationId: orgId, branchId, status: 'OPEN' },
        });
        await prisma.cashMovement.create({
          data: {
            organizationId: orgId,
            branchId,
            cashSessionId: openSession?.id ?? null,
            type: 'INCOME',
            category: CONCEPT_CATEGORY[input.concept] ?? 'OTHER',
            method: input.method,
            amount: input.amount,
            description: `${input.concept} ${input.reference || reference}`,
            memberId: input.memberId ?? null,
            userId: req.user.id,
            referenceId: payment.id,
          },
        });
      }

      await logActivity(req, 'CREATE', 'PAYMENT', payment.id, undefined, {
        amount: input.amount,
        method: input.method,
        concept: input.concept,
      });

      if (input.memberId && status === 'COMPLETED') {
        const member = await prisma.member.findUnique({ where: { id: input.memberId } });
        if (member) {
          await notifyEvent(orgId, member.id, 'PAYMENT_CONFIRMATION', {
            member,
            amount: input.amount,
            plan: (input.membershipId ? await prisma.plan.findFirst({ where: { memberships: { some: { id: input.membershipId } } } }) : null)?.name ?? '',
          });
        }
      }

      return ok(reply, payment, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Anular pago (trazabilidad)
  app.post('/payments/:id/void', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.payment.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Pago no encontrado');
      const payment = await prisma.payment.update({ where: { id }, data: { status: 'CANCELLED' } });
      // Anula el movimiento de caja asociado
      await prisma.cashMovement.updateMany({ where: { referenceId: id }, data: { type: 'EXPENSE', description: `ANULACION de pago ${existing.reference}` } });
      await logActivity(req, 'VOID', 'PAYMENT', id, existing, payment);
      return ok(reply, payment);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default paymentRoutes;