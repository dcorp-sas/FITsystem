import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { routineSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { assertMemberInOrg } from '../lib/scope.js';
import { logActivity } from '../lib/activity.js';
import { sendPushToMember } from '../services/push.js';
import { fullName } from '@fitsystem/utils';

export function routineRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Lista de rutinas (plantillas y/o asignadas a un socio)
  app.get('/routines', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { memberId?: string; template?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.memberId) where.memberId = query.memberId;
      if (query.template === 'true') where.isTemplate = true;

      const routines = await prisma.routine.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, memberCode: true } },
          days: { orderBy: { dayIndex: 'asc' }, include: { exercises: { orderBy: { orderIndex: 'asc' } } } },
        },
      });
      const items = routines.map((r) => ({
        ...r,
        memberName: r.member ? fullName(r.member.firstName, r.member.lastName) : null,
        memberCode: r.member?.memberCode ?? null,
      }));
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/routines/:id', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const routine = await prisma.routine.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: { days: { orderBy: { dayIndex: 'asc' }, include: { exercises: { orderBy: { orderIndex: 'asc' } } } } },
      });
      if (!routine) throw new HttpError(404, 'Rutina no encontrada');
      return ok(reply, routine);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/routines', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(routineSchema, request.body);
      if (input.memberId) await assertMemberInOrg(req.user.organizationId, input.memberId);
      const routine = await prisma.routine.create({
        data: {
          organizationId: req.user.organizationId,
          memberId: input.memberId || null,
          name: input.name,
          description: input.description || null,
          goal: input.goal,
          level: input.level,
          isTemplate: input.isTemplate ?? !input.memberId,
          isActive: input.isActive ?? true,
          createdById: req.user.id,
          days: {
            create: (input.days ?? []).map((d) => ({
              dayIndex: d.dayIndex,
              label: d.label || null,
              notes: d.notes || null,
              exercises: {
                create: (d.exercises ?? []).map((ex, idx) => ({
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  restSec: ex.restSec,
                  weight: ex.weight || null,
                  notes: ex.notes || null,
                  orderIndex: ex.orderIndex ?? idx,
                })),
              },
            })),
          },
        },
        include: { days: { orderBy: { dayIndex: 'asc' }, include: { exercises: true } } },
      });
      await logActivity(req, 'CREATE', 'ROUTINE', routine.id, undefined, { name: routine.name });
      // Si la rutina se asigna a un socio, se le avisa por push.
      if (routine.memberId) {
        void sendPushToMember(
          req.user.organizationId,
          routine.memberId,
          'Nueva rutina disponible',
          `Tu profesor te asignó "${routine.name}". Abrila en la app.`,
        ).catch(() => undefined);
      }
      return ok(reply, routine, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/routines/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(routineSchema, request.body);
      const existing = await prisma.routine.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Rutina no encontrada');
      if (input.memberId) await assertMemberInOrg(req.user.organizationId, input.memberId);

      const routine = await prisma.$transaction(async (tx) => {
        await tx.routineDay.deleteMany({ where: { routineId: id } });
        return tx.routine.update({
          where: { id },
          data: {
            memberId: input.memberId || null,
            name: input.name,
            description: input.description || null,
            goal: input.goal,
            level: input.level,
            isTemplate: input.isTemplate ?? !input.memberId,
            isActive: input.isActive ?? existing.isActive,
            days: {
              create: (input.days ?? []).map((d) => ({
                dayIndex: d.dayIndex,
                label: d.label || null,
                notes: d.notes || null,
                exercises: {
                  create: (d.exercises ?? []).map((ex, idx) => ({
                    name: ex.name,
                    sets: ex.sets,
                    reps: ex.reps,
                    restSec: ex.restSec,
                    weight: ex.weight || null,
                    notes: ex.notes || null,
                    orderIndex: ex.orderIndex ?? idx,
                  })),
                },
              })),
            },
          },
          include: { days: { orderBy: { dayIndex: 'asc' }, include: { exercises: { orderBy: { orderIndex: 'asc' } } } } },
        });
      });

      await logActivity(req, 'UPDATE', 'ROUTINE', id, existing, routine);
      return ok(reply, routine);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/routines/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.routine.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Rutina no encontrada');
      await prisma.routine.delete({ where: { id } });
      await logActivity(req, 'DELETE', 'ROUTINE', id);
      return ok(reply, { deleted: true });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default routineRoutes;
