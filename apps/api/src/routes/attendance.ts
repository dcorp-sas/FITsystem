import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { attendanceCheckinSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { startOfDay, endOfDay, fullName } from '@fitsystem/utils';

async function findActiveMembership(orgId: string, memberId: string) {
  return prisma.membership.findFirst({
    where: {
      organizationId: orgId,
      memberId,
      status: 'ACTIVE',
      endDate: { gte: new Date() },
    },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  });
}

export function attendanceRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Check-in (QR, manual, face, etc.) con validacion de membresia
  app.post('/attendance/checkin', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(attendanceCheckinSchema, request.body);
      const orgId = req.user.organizationId;

      let memberId = input.memberId ?? null;
      if (!memberId && input.qr) {
        const code = String(input.qr).trim();
        const member = await prisma.member.findFirst({
          where: {
            organizationId: orgId,
            OR: [{ memberCode: code }, { documentNumber: code }],
          },
        });
        memberId = member?.id ?? null;
      }
      if (!memberId) return reject('SOCIO_NO_ENCONTRADO');

      const member = await prisma.member.findFirst({
        where: { id: memberId, organizationId: orgId },
        include: {
          memberships: {
            where: { status: 'ACTIVE', endDate: { gte: new Date() } },
            orderBy: { endDate: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      });
      if (!member) return reject('SOCIO_NO_ENCONTRADO');

      if (member.status === 'SUSPENDED') return reject('SOCIO_SUSPENDIDO', member);
      if (member.status === 'INACTIVE') return reject('SOCIO_INACTIVO', member);
      if (member.status === 'FROZEN') return reject('SOCIO_CONGELADO', member);

      const membership = member.memberships[0];
      if (!membership) return reject('SIN_MEMBRESIA', member);

      // Registrar entrada
      const today = startOfDay();
      const alreadyToday = await prisma.attendance.findFirst({
        where: { memberId: member.id, checkedInAt: { gte: today, lte: endOfDay() } },
      });
      const isFirstToday = !alreadyToday;

      const attendance = await prisma.attendance.create({
        data: {
          organizationId: orgId,
          branchId: member.branchId,
          memberId: member.id,
          membershipId: membership.id,
          method: input.method,
          status: 'ALLOWED',
          checkedInAt: new Date(),
          registeredById: req.user.id,
        },
      });

      if (isFirstToday) {
        await prisma.member.update({
          where: { id: member.id },
          data: { totalVisits: { increment: 1 }, lastVisitAt: new Date() },
        });
      }

      await logActivity(req, 'CHECKIN', 'ATTENDANCE', attendance.id, undefined, { member: member.id, method: input.method });

      return ok(reply, {
        allowed: true,
        member: {
          id: member.id,
          memberCode: member.memberCode,
          name: fullName(member.firstName, member.lastName),
          photoUrl: member.photoUrl,
        },
        plan: membership.plan.name,
        planColor: membership.plan.color,
        membershipEndDate: membership.endDate,
        attendanceId: attendance.id,
        checkedInAt: attendance.checkedInAt,
      }, 201);

      function reject(reason: string, m?: { id: string; memberCode: string; firstName: string; lastName: string; photoUrl: string | null }) {
        const messages: Record<string, string> = {
          SOCIO_NO_ENCONTRADO: 'Socio no encontrado',
          SOCIO_SUSPENDIDO: 'Socio suspendido',
          SOCIO_INACTIVO: 'Socio dado de baja',
          SOCIO_CONGELADO: 'Membresia pausada',
          SIN_MEMBRESIA: 'Sin membresia activa',
        };
        const reasonMsg = messages[reason] ?? 'Acceso rechazado';

        return ok(reply, {
          allowed: false,
          reason,
          message: reasonMsg,
          member: m
            ? { id: m.id, memberCode: m.memberCode, name: fullName(m.firstName, m.lastName), photoUrl: m.photoUrl }
            : null,
        }, 200);
      }
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Entradas del dia (dashboard)
  app.get('/attendance/today', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const today = startOfDay();
      const [entries, count] = await Promise.all([
        prisma.attendance.findMany({
          where: { organizationId: orgId, checkedInAt: { gte: today, lte: endOfDay() } },
          orderBy: { checkedInAt: 'desc' },
          include: {
            member: { select: { id: true, firstName: true, lastName: true, photoUrl: true, memberCode: true } },
            membership: { include: { plan: { select: { name: true, color: true } } } },
          },
        }),
        prisma.attendance.count({
          where: { organizationId: orgId, checkedInAt: { gte: today, lte: endOfDay() } },
        }),
      ]);
      const unique = new Set(entries.map((e) => e.memberId)).size;
      return ok(reply, { count: unique, rawCount: count, items: entries });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Historial por rango
  app.get('/attendance', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string; memberId?: string; page?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.from || query.to) {
        where.checkedInAt = {
          gte: query.from ? startOfDay(new Date(query.from)) : undefined,
          lte: query.to ? endOfDay(new Date(query.to)) : undefined,
        };
      }
      if (query.memberId) where.memberId = query.memberId;
      const page = Math.max(1, Number(query.page || 1));
      const [total, items] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.findMany({
          where,
          orderBy: { checkedInAt: 'desc' },
          skip: (page - 1) * 50,
          take: 50,
          include: { member: { select: { firstName: true, lastName: true, memberCode: true } } },
        }),
      ]);
      return ok(reply, { total, page, items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Horarios pico (concentracion por hora)
  app.get('/attendance/peak-hours', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string };
      const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(addDays(new Date(), -30));
      const to = query.to ? endOfDay(new Date(query.to)) : endOfDay();
      const rows = await prisma.attendance.findMany({
        where: { organizationId: req.user.organizationId, checkedInAt: { gte: from, lte: to } },
        select: { checkedInAt: true },
      });
      const buckets: Record<string, number> = {};
      for (const r of rows) {
        const h = new Date(r.checkedInAt).getHours();
        const key = `${String(h).padStart(2, '0')}:00`;
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
      const peak = Object.entries(buckets)
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count);
      return ok(reply, { from, to, peak, byHour: buckets });
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

export default attendanceRoutes;