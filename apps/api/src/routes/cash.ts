import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { cashMovementSchema, cashSessionOpenSchema, cashSessionCloseSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { startOfDay, endOfDay } from '@fitsystem/utils';

export function cashRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/cash/sessions', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const sessions = await prisma.cashSession.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { openedAt: 'desc' },
        take: 50,
        include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } }, branch: { select: { name: true } } },
      });
      return ok(reply, sessions);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/cash/sessions/current', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const branchId = (request.query as { branchId?: string }).branchId || req.user.branchId || undefined;
      const session = await prisma.cashSession.findFirst({
        where: { organizationId: req.user.organizationId, status: 'OPEN', ...(branchId ? { branchId } : {}) },
        include: { movements: true },
      });
      if (!session) return ok(reply, null);
      const income = session.movements.filter((m) => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
      const expense = session.movements.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
      return ok(reply, {
        ...session,
        totals: { income, expense, expected: session.openingAmount + income - expense },
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/cash/sessions/open', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(cashSessionOpenSchema, request.body);
      const open = await prisma.cashSession.findFirst({
        where: { organizationId: req.user.organizationId, branchId: input.branchId, status: 'OPEN' },
      });
      if (open) throw new HttpError(409, 'Ya hay una caja abierta en esta sede');
      const session = await prisma.cashSession.create({
        data: {
          organizationId: req.user.organizationId,
          branchId: input.branchId,
          openedById: req.user.id,
          openingAmount: input.openingAmount,
        },
      });
      await logActivity(req, 'OPEN', 'CASH_SESSION', session.id);
      return ok(reply, session, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/cash/sessions/:id/close', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(cashSessionCloseSchema, request.body);
      const session = await prisma.cashSession.findFirst({
        where: { id, organizationId: req.user.organizationId, status: 'OPEN' },
        include: { movements: true },
      });
      if (!session) throw new HttpError(404, 'Caja abierta no encontrada');
      const income = session.movements.filter((m) => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
      const expense = session.movements.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
      const expected = session.openingAmount + income - expense;
      const closed = await prisma.cashSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedById: req.user.id,
          closingAmount: input.closingAmount,
          expectedAmount: expected,
          difference: input.closingAmount - expected,
          closedAt: new Date(),
          notes: input.notes || null,
        },
      });
      await logActivity(req, 'CLOSE', 'CASH_SESSION', id, undefined, { expected, difference: closed.difference });
      return ok(reply, closed);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/cash/movements', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string; type?: string; category?: string; branchId?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.type) where.type = query.type;
      if (query.category) where.category = query.category;
      if (query.branchId) where.branchId = query.branchId;
      if (query.from || query.to) {
        where.createdAt = {
          gte: query.from ? startOfDay(new Date(query.from)) : undefined,
          lte: query.to ? endOfDay(new Date(query.to)) : undefined,
        };
      }
      const movements = await prisma.cashMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { member: { select: { firstName: true, lastName: true } } },
      });
      const income = movements.filter((m) => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
      const expense = movements.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
      return ok(reply, { items: movements, totals: { income, expense, balance: income - expense } });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/cash/movements', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(cashMovementSchema, request.body);
      const orgId = req.user.organizationId;
      const openSession = await prisma.cashSession.findFirst({
        where: { organizationId: orgId, branchId: input.branchId, status: 'OPEN' },
      });
      const movement = await prisma.cashMovement.create({
        data: {
          organizationId: orgId,
          branchId: input.branchId,
          cashSessionId: input.cashSessionId || openSession?.id || null,
          type: input.type,
          category: input.category,
          method: input.method,
          amount: input.amount,
          description: input.description || null,
          memberId: input.memberId || null,
          userId: req.user.id,
        },
      });
      await logActivity(req, 'CREATE', 'CASH_MOVEMENT', movement.id, undefined, { type: input.type, amount: input.amount });
      return ok(reply, movement, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Anular movimiento de caja (no se borra, queda registrado)
  app.post('/cash/movements/:id/void', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.cashMovement.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Movimiento no encontrado');
      const movement = await prisma.cashMovement.update({
        where: { id },
        data: category_flip(existing.type),
      });
      await logActivity(req, 'VOID', 'CASH_MOVEMENT', id, existing, movement);
      return ok(reply, movement);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

function category_flip(type: string) {
  return {
    type: type === 'INCOME' ? 'EXPENSE' : 'INCOME',
    description: 'ANULACION',
  };
}

export default cashRoutes;