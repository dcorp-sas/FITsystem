import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { planSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';

export function planRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/plans', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const plans = await prisma.plan.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { price: 'asc' },
        include: {
          _count: { select: { memberships: { where: { status: { in: ['ACTIVE', 'FROZEN'] } } } } },
        },
      });
      return ok(reply, plans);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/plans', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(planSchema, request.body);
      const plan = await prisma.plan.create({
        data: {
          organizationId: req.user.organizationId,
          name: input.name,
          description: input.description || null,
          type: input.type,
          price: input.price,
          currency: input.currency || 'ARS',
          durationDays: input.durationDays,
          sessionsLimit: input.sessionsLimit ?? null,
          allowFreeze: input.allowFreeze ?? false,
          maxFreezeDays: input.maxFreezeDays ?? 0,
          freezeFee: input.freezeFee ?? 0,
          signupFee: input.signupFee ?? 0,
          color: input.color || '#2563eb',
          isActive: input.isActive ?? true,
        },
      });
      await logActivity(req, 'CREATE', 'PLAN', plan.id);
      return ok(reply, plan, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/plans/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(planSchema, request.body);
      const existing = await prisma.plan.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Plan no encontrado');
      const plan = await prisma.plan.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description || null,
          type: input.type,
          price: input.price,
          currency: input.currency || existing.currency,
          durationDays: input.durationDays,
          sessionsLimit: input.sessionsLimit ?? null,
          allowFreeze: input.allowFreeze ?? existing.allowFreeze,
          maxFreezeDays: input.maxFreezeDays ?? existing.maxFreezeDays,
          freezeFee: input.freezeFee ?? existing.freezeFee,
          signupFee: input.signupFee ?? existing.signupFee,
          color: input.color || existing.color,
          isActive: input.isActive ?? existing.isActive,
        },
      });
      await logActivity(req, 'UPDATE', 'PLAN', id);
      return ok(reply, plan);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default planRoutes;