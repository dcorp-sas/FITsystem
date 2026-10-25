import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { instructorSchema, gymClassSchema, classSessionSchema, reservationSchema, instructorPaymentSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { assertBranchInOrg, assertUserInOrg, assertInstructorInOrg } from '../lib/scope.js';
import { logActivity } from '../lib/activity.js';
import { startOfDay, endOfDay, fullName } from '@fitsystem/utils';

async function requireInstructor(organizationId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: { email: true, branchId: true } });
  if (!user) throw new HttpError(403, 'Usuario de profesor no encontrado en este gimnasio.');
  let instructor = await prisma.instructor.findFirst({ where: { organizationId, userId, isActive: true } });
  // Si no existe vínculo explícito, se permite la coincidencia exacta de email.
  // La comparación en JS funciona tanto con SQLite como con PostgreSQL.
  if (!instructor && user.email) {
    const candidates = await prisma.instructor.findMany({ where: { organizationId, isActive: true, userId: null, email: { not: null } } });
    instructor = candidates.find((candidate) => candidate.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()) ?? null;
  }
  if (!instructor) throw new HttpError(403, 'Tu usuario no está vinculado a un profesor activo. Creá el profesor con el mismo email y asignale una sede a tu usuario.');
  return instructor;

}

export function classRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // ---------------- Profesores --------------
  app.get('/instructors', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const instructorScope = req.user.role === 'INSTRUCTOR'
        ? { id: (await requireInstructor(req.user.organizationId, req.user.id)).id }
        : {};
      const instructors = await prisma.instructor.findMany({
        where: { organizationId: req.user.organizationId, ...instructorScope },
        include: { availability: true, _count: { select: { classes: true } } },
        orderBy: { name: 'asc' },
      });
      return ok(reply, instructors);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/instructors', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(instructorSchema, request.body);
      if (input.branchId) await assertBranchInOrg(req.user.organizationId, input.branchId);
      if (input.userId) await assertUserInOrg(req.user.organizationId, input.userId);
      const instructor = await prisma.instructor.create({
        data: {
          organizationId: req.user.organizationId,
          branchId: input.branchId || null,
          userId: input.userId || null,
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          specialty: input.specialty || null,
          hourlyRate: input.hourlyRate ?? 0,
          classRate: input.classRate ?? 0,
          commissionPct: input.commissionPct ?? 0,
          color: input.color || '#0ea5e9',
          isActive: input.isActive ?? true,
        },
      });
      await logActivity(req, 'CREATE', 'INSTRUCTOR', instructor.id);
      return ok(reply, instructor, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/instructors/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(instructorSchema, request.body);
      const existing = await prisma.instructor.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Profesor no encontrado');
      if (input.branchId) await assertBranchInOrg(req.user.organizationId, input.branchId);
      if (input.userId) await assertUserInOrg(req.user.organizationId, input.userId);
      const instructor = await prisma.instructor.update({
        where: { id },
        data: {
          branchId: input.branchId || null,
          userId: input.userId || null,
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          specialty: input.specialty || null,
          hourlyRate: input.hourlyRate ?? existing.hourlyRate,
          classRate: input.classRate ?? existing.classRate,
          commissionPct: input.commissionPct ?? existing.commissionPct,
          color: input.color || existing.color,
          isActive: input.isActive ?? existing.isActive,
        },
      });
      await logActivity(req, 'UPDATE', 'INSTRUCTOR', id);
      return ok(reply, instructor);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------------- Clases --------------
  app.get('/classes', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      // El portal docente comparte el catálogo de clases de su sede con el sistema principal.
      const classScope = instructor
        ? (instructor.branchId ? { branchId: instructor.branchId } : { instructorId: instructor.id })
        : {};
      const classes = await prisma.gymClass.findMany({
        where: { organizationId: req.user.organizationId, ...classScope },
        include: { instructor: true, _count: { select: { sessions: true } } },
        orderBy: { name: 'asc' },
      });
      return ok(reply, classes);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/classes', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(gymClassSchema, request.body);
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      // Un profesor solo puede dar de alta clases en su propia sede y a su nombre.
      // No se aceptan branchId ni instructorId enviados por el cliente para ampliar permisos.
      const branchId = instructor ? instructor.branchId : input.branchId;
      const instructorId = instructor ? instructor.id : (input.instructorId || null);
      if (!branchId) {
        throw new HttpError(instructor ? 403 : 400, instructor
          ? 'Tu usuario de profesor debe tener una sede asignada para crear clases.'
          : 'Seleccioná una sede para la clase.');
      }
      await assertBranchInOrg(req.user.organizationId, branchId);
      if (instructorId) await assertInstructorInOrg(req.user.organizationId, instructorId);
      const cls = await prisma.gymClass.create({
        data: {
          organizationId: req.user.organizationId,
          branchId,
          instructorId,
          name: input.name,
          description: input.description || null,
          capacity: input.capacity ?? 20,
          durationMin: input.durationMin ?? 60,
          room: input.room || null,
          color: input.color || '#2563eb',
          isActive: input.isActive ?? true,
        },
      });
      await logActivity(req, 'CREATE', 'CLASS', cls.id);
      return ok(reply, cls, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/classes/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(gymClassSchema, request.body);
      const existing = await prisma.gymClass.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Clase no encontrada');
      await assertBranchInOrg(req.user.organizationId, input.branchId);
      if (input.instructorId) await assertInstructorInOrg(req.user.organizationId, input.instructorId);
      const cls = await prisma.gymClass.update({
        where: { id },
        data: {
          branchId: input.branchId,
          instructorId: input.instructorId || null,
          name: input.name,
          description: input.description || null,
          capacity: input.capacity ?? existing.capacity,
          durationMin: input.durationMin ?? existing.durationMin,
          room: input.room || null,
          color: input.color || existing.color,
          isActive: input.isActive ?? existing.isActive,
        },
      });
      await logActivity(req, 'UPDATE', 'CLASS', id);
      return ok(reply, cls);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------------- Sesiones --------------
  app.get('/sessions', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string };
      const from = query.from ? new Date(query.from) : startOfDay();
      const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(addDays(new Date(), 7));
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      const sessions = await prisma.classSession.findMany({
        where: {
          branch: { organizationId: req.user.organizationId },
          ...(instructor?.branchId ? { branchId: instructor.branchId } : {}),
          startAt: { gte: from, lte: to },
          ...(!instructor?.branchId && instructor ? { OR: [{ instructorId: instructor.id }, { instructorId: null, gymClass: { instructorId: instructor.id } }] } : {}),
        },
        orderBy: { startAt: 'asc' },
        include: {
          gymClass: { select: { id: true, name: true, color: true, description: true } },
          instructor: { select: { id: true, name: true, color: true } },
          _count: { select: { reservations: { where: { status: { in: ['RESERVED', 'WAITLIST'] } } } } },
        },
      });
      return ok(reply, sessions);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/sessions', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(classSessionSchema, request.body);
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      const cls = await prisma.gymClass.findFirst({
        where: {
          id: input.classId,
          organizationId: req.user.organizationId,
          ...(instructor ? (instructor.branchId ? { branchId: instructor.branchId } : { instructorId: instructor.id }) : {}),
        },
      });
      if (!cls) throw new HttpError(404, 'Clase no encontrada o fuera de tu sede');
      const startAt = new Date(input.startAt);
      const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + cls.durationMin * 60000);
      const session = await prisma.classSession.create({
        data: {
          classId: cls.id,
          branchId: cls.branchId,
          instructorId: instructor?.id ?? input.instructorId ?? cls.instructorId ?? null,
          startAt,
          endAt,
          capacity: input.capacity ?? cls.capacity,
          room: input.room ?? cls.room,
        },
      });
      await logActivity(req, 'CREATE', 'CLASS_SESSION', session.id);
      return ok(reply, session, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/sessions/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      const session = await prisma.classSession.findFirst({
        where: {
          id,
          branch: { organizationId: req.user.organizationId },
          ...(instructor?.branchId ? { branchId: instructor.branchId } : {}),
          ...(!instructor?.branchId && instructor ? { OR: [{ instructorId: instructor.id }, { instructorId: null, gymClass: { instructorId: instructor.id } }] } : {}),
        },
      });
      if (!session) throw new HttpError(404, 'Sesión no encontrada o fuera de tu sede');
      await prisma.classSession.delete({ where: { id } });
      await logActivity(req, 'DELETE', 'CLASS_SESSION', id);
      return ok(reply, { deleted: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------------- Reservas --------------
  app.get('/sessions/:id/reservations', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const instructor = req.user.role === 'INSTRUCTOR'
        ? await requireInstructor(req.user.organizationId, req.user.id)
        : null;
      const session = await prisma.classSession.findFirst({
        where: {
          id,
          branch: { organizationId: req.user.organizationId },
          ...(instructor ? { OR: [{ instructorId: instructor.id }, { instructorId: null, gymClass: { instructorId: instructor.id } }] } : {}),
        },
      });
      if (!session) throw new HttpError(404, 'Sesion no encontrada o no asignada a tu usuario');
      const reservations = await prisma.reservation.findMany({
        where: { sessionId: id },
        include: { member: { select: { id: true, firstName: true, lastName: true, memberCode: true, phone: true } } },
      });
      return ok(reply, reservations);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/reservations', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(reservationSchema, request.body);
      const session = await prisma.classSession.findFirst({
        where: { id: input.sessionId, branch: { organizationId: req.user.organizationId } },
        include: { reservations: true },
      });
      if (!session) throw new HttpError(404, 'Sesion no encontrada');

      const member = await prisma.member.findFirst({ where: { id: input.memberId, organizationId: req.user.organizationId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      const reservedCount = session.reservations.filter((r) => r.status === 'RESERVED').length;
      const existing = await prisma.reservation.findUnique({
        where: { sessionId_memberId: { sessionId: input.sessionId, memberId: input.memberId } },
      });

      if (existing) {
        const updated = await prisma.reservation.update({
          where: { id: existing.id },
          data: { status: input.status ?? 'RESERVED' },
        });
        await logActivity(req, 'UPDATE', 'RESERVATION', updated.id);
        return ok(reply, updated);
      }

      if (reservedCount >= session.capacity) {
        const wait = await prisma.reservation.create({
          data: { sessionId: input.sessionId, memberId: input.memberId, status: 'WAITLIST', createdById: req.user.id },
        });
        return ok(reply, { ...wait, waitlist: true }, 201);
      }

      const reservation = await prisma.reservation.create({
        data: { sessionId: input.sessionId, memberId: input.memberId, status: input.status ?? 'RESERVED', createdById: req.user.id },
      });
      await logActivity(req, 'CREATE', 'RESERVATION', reservation.id);
      return ok(reply, reservation, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------------- Liquidaciones --------------
  app.get('/instructor-payments', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const payments = await prisma.instructorPayment.findMany({
        where: { instructor: { organizationId: req.user.organizationId } },
        orderBy: { createdAt: 'desc' },
        include: { instructor: { select: { id: true, name: true } } },
        take: 100,
      });
      return ok(reply, payments);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/instructor-payments', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(instructorPaymentSchema, request.body);
      const instructor = await prisma.instructor.findFirst({
        where: { id: input.instructorId, organizationId: req.user.organizationId },
      });
      if (!instructor) throw new HttpError(404, 'Profesor no encontrado');
      const payment = await prisma.instructorPayment.create({
        data: {
          instructorId: instructor.id,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          hours: input.hours ?? 0,
          classesCount: input.classesCount ?? 0,
          rate: input.rate ?? 0,
          commission: input.commission ?? 0,
          amount: input.amount,
          notes: input.notes || null,
        },
      });
      await logActivity(req, 'CREATE', 'INSTRUCTOR_PAYMENT', payment.id, undefined, { amount: input.amount });
      return ok(reply, payment, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

export default classRoutes;