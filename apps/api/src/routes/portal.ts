import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import {
  portalLoginSchema,
  portalActivateSchema,
  portalPushTokenSchema,
  portalPaymentIntentSchema,
  portalProofSchema,
  portalCheckinSchema,
  portalReserveSchema,
  routineLogSchema,
} from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type PortalAuthedRequest } from '../lib/http.js';
import { env } from '../env.js';
import { rateLimit } from '../lib/ratelimit.js';
import { getRawSetting } from '../services/settings.js';
import { daysBetween, fullName, startOfDay } from '@fitsystem/utils';

interface PortalJwt {
  sub: string;
  typ: 'portal';
}

// Cuentas del portal que podrian corresponder al identificador (DNI, email,
// legajo o telefono). Si no hay coincidencia exacta, reintenta sin distinguir
// mayusculas. Si no se pasa organizationId, busca en TODA la plataforma: asi el
// socio puede ingresar solo con su DNI, sin saber el codigo del gimnasio.
async function findCandidateAccounts(identifier: string, organizationId?: string) {
  const id = identifier.trim();
  const orgFilter = organizationId ? { organizationId } : {};

  const direct = await prisma.portalAccount.findMany({
    where: {
      isActive: true,
      ...orgFilter,
      OR: [
        { documentNumber: id },
        { email: id },
        {
          member: {
            is: {
              OR: [{ documentNumber: id }, { memberCode: id }, { email: id }, { phone: id }],
            },
          },
        },
      ],
    },
    include: { member: true },
  });
  if (direct.length) return direct;

  const lower = id.toLowerCase();
  const all = await prisma.portalAccount.findMany({
    where: { isActive: true, ...orgFilter },
    include: { member: true },
  });
  return all.filter((a) =>
    [
      a.email,
      a.documentNumber,
      a.member.email,
      a.member.documentNumber,
      a.member.memberCode,
      a.member.phone,
    ].some((v) => v != null && v.toLowerCase() === lower),
  );
}

// Devuelve la cuenta cuyo hash coincide con la contrasena (si hay varias
// coincidencias de DNI en distintos gimnasios, gana la que valide la clave).
async function authenticateAccount(identifier: string, password: string, organizationId?: string) {
  const candidates = await findCandidateAccounts(identifier, organizationId);
  for (const account of candidates) {
    if (!account.passwordHash) continue;
    if (await bcrypt.compare(password, account.passwordHash)) return account;
  }
  return null;
}

async function loadContext(organizationId: string, memberId: string) {
  const [org, member, memberships, attendance, news, routines, payments] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.member.findUnique({ where: { id: memberId }, include: { branch: true } }),
    prisma.membership.findMany({
      where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
      orderBy: { endDate: 'desc' },
      take: 1,
      include: { plan: true },
    }),
    prisma.attendance.findMany({ where: { memberId }, orderBy: { checkedInAt: 'desc' }, take: 30 }),
    prisma.newsPost.findMany({
      where: { organizationId, isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 30,
    }),
    prisma.routine.findMany({
      where: { organizationId, isActive: true, OR: [{ memberId }, { isTemplate: true }] },
      orderBy: { updatedAt: 'desc' },
      include: { days: { orderBy: { dayIndex: 'asc' }, include: { exercises: { orderBy: { orderIndex: 'asc' } } } } },
    }),
    prisma.payment.findMany({ where: { memberId }, orderBy: { paidAt: 'desc' }, take: 30 }),
  ]);

  const active = memberships[0];
  const now = new Date();
  const quota = active
    ? {
        membershipId: active.id,
        plan: active.plan.name,
        planColor: active.plan.color,
        status: active.status,
        price: active.price,
        startDate: active.startDate,
        endDate: active.endDate,
        daysLeft: daysBetween(now, active.endDate),
        isExpired: active.endDate.getTime() < now.getTime(),
      }
    : null;

  return { org, member, quota, attendance, news, routines, payments };
}

export function portalRoutes(app: FastifyInstance) {
  const portalAuth = app.authenticatePortal;

  // Login del socio (identificador = email | documento | legajo | telefono)
  app.post('/portal/auth/login', { onRequest: [rateLimit({ max: 10, windowMs: 5 * 60 * 1000, keyPrefix: 'portal-login' })] }, async (request, reply) => {
    try {
      const input = validate(portalLoginSchema, request.body);
      const org = input.organizationSlug
        ? await prisma.organization.findUnique({ where: { slug: input.organizationSlug } })
        : null;
      if (input.organizationSlug && !org) throw new HttpError(401, 'Credenciales invalidas');

      const account = await authenticateAccount(input.identifier, input.password, org?.id);
      if (!account) throw new HttpError(401, 'Credenciales invalidas');

      const member = account.member;
      const resolvedOrg =
        org ?? (await prisma.organization.findUnique({ where: { id: account.organizationId } }));
      if (!resolvedOrg) throw new HttpError(401, 'Credenciales invalidas');

      await prisma.portalAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });

      const token = app.jwt.sign({ sub: account.id, typ: 'portal' } satisfies PortalJwt);
      const ctx = await loadContext(resolvedOrg.id, member.id);
      return ok(reply, {
        token,
        organization: { id: resolvedOrg.id, name: resolvedOrg.name, slug: resolvedOrg.slug, logoUrl: resolvedOrg.logoUrl, currency: resolvedOrg.currency },
        member: { id: member.id, name: fullName(member.firstName, member.lastName), memberCode: member.memberCode, photoUrl: member.photoUrl },
        quota: ctx.quota,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Activacion de la cuenta del socio con codigo (primer acceso)
  app.post('/portal/auth/activate', { onRequest: [rateLimit({ max: 10, windowMs: 10 * 60 * 1000, keyPrefix: 'portal-activate' })] }, async (request, reply) => {
    try {
      const input = validate(portalActivateSchema, request.body);
      const code = input.activationCode.trim();
      const org = input.organizationSlug
        ? await prisma.organization.findUnique({ where: { slug: input.organizationSlug } })
        : null;
      if (input.organizationSlug && !org) throw new HttpError(400, 'Datos de activacion invalidos');

      const candidates = await findCandidateAccounts(input.identifier, org?.id);
      const account = candidates.find((a) => a.activationCode != null && a.activationCode === code);
      if (!account) {
        const alreadyActive = candidates.find((a) => a.activationCode == null && a.passwordHash);
        if (alreadyActive) {
          throw new HttpError(400, 'La cuenta ya esta activada. Pedi un nuevo codigo en tu gimnasio si necesitas recuperar la clave.');
        }
        throw new HttpError(400, 'Datos de activacion invalidos');
      }

      const member = account.member;
      const resolvedOrg =
        org ?? (await prisma.organization.findUnique({ where: { id: account.organizationId } }));
      if (!resolvedOrg) throw new HttpError(400, 'Datos de activacion invalidos');

      const passwordHash = await bcrypt.hash(input.password, 10);
      await prisma.portalAccount.update({
        where: { id: account.id },
        data: { passwordHash, activationCode: null, isActive: true, lastLoginAt: new Date() },
      });

      const token = app.jwt.sign({ sub: account.id, typ: 'portal' } satisfies PortalJwt);
      const ctx = await loadContext(resolvedOrg.id, member.id);
      return ok(reply, {
        token,
        organization: { id: resolvedOrg.id, name: resolvedOrg.name, slug: resolvedOrg.slug, logoUrl: resolvedOrg.logoUrl, currency: resolvedOrg.currency },
        member: { id: member.id, name: fullName(member.firstName, member.lastName), memberCode: member.memberCode, photoUrl: member.photoUrl },
        quota: ctx.quota,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Resumen completo para el home de la app
  app.get('/portal/me', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const ctx = await loadContext(req.portalAccount.organizationId, req.portalAccount.memberId);
      if (!ctx.member) throw new HttpError(404, 'Socio no encontrado');
      return ok(reply, {
        organization: ctx.org && { id: ctx.org.id, name: ctx.org.name, slug: ctx.org.slug, logoUrl: ctx.org.logoUrl, currency: ctx.org.currency },
        member: {
          id: ctx.member.id,
          name: fullName(ctx.member.firstName, ctx.member.lastName),
          memberCode: ctx.member.memberCode,
          photoUrl: ctx.member.photoUrl,
          totalVisits: ctx.member.totalVisits,
          lastVisitAt: ctx.member.lastVisitAt,
          branch: ctx.member.branch?.name ?? null,
        },
        quota: ctx.quota,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Estado de cuota
  app.get('/portal/quota', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const active = await prisma.membership.findFirst({
        where: { memberId: req.portalAccount.memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
        orderBy: { endDate: 'desc' },
        include: { plan: true },
      });
      if (!active) return ok(reply, { quota: null, plans: await prisma.plan.findMany({ where: { organizationId: req.portalAccount.organizationId, isActive: true } }) });
      const now = new Date();
      return ok(reply, {
        quota: {
          membershipId: active.id,
          plan: active.plan.name,
          price: active.price,
          status: active.status,
          startDate: active.startDate,
          endDate: active.endDate,
          daysLeft: daysBetween(now, active.endDate),
          isExpired: active.endDate.getTime() < now.getTime(),
        },
        plans: await prisma.plan.findMany({ where: { organizationId: req.portalAccount.organizationId, isActive: true } }),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Historial de ingresos
  app.get('/portal/checkins', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const items = await prisma.attendance.findMany({
        where: { memberId: req.portalAccount.memberId },
        orderBy: { checkedInAt: 'desc' },
        take: 60,
      });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Novedades
  app.get('/portal/news', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const items = await prisma.newsPost.findMany({
        where: { organizationId: req.portalAccount.organizationId, isPublished: true },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Rutinas asignadas
  app.get('/portal/routines', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const items = await prisma.routine.findMany({
        where: { organizationId: req.portalAccount.organizationId, isActive: true, OR: [{ memberId: req.portalAccount.memberId }, { isTemplate: true }] },
        orderBy: { updatedAt: 'desc' },
        include: { days: { orderBy: { dayIndex: 'asc' }, include: { exercises: { orderBy: { orderIndex: 'asc' } } } } },
      });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Progreso de rutinas: historial del socio
  app.get('/portal/routines/logs', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const query = request.query as { routineId?: string; exerciseId?: string; limit?: string };
      const where: Record<string, unknown> = { memberId: req.portalAccount.memberId };
      if (query.routineId) where.routineId = query.routineId;
      if (query.exerciseId) where.exerciseId = query.exerciseId;
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const items = await prisma.routineLog.findMany({ where, orderBy: { completedAt: 'desc' }, take: limit });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Registrar un ejercicio completado (peso/reps/notas opcionales)
  app.post('/portal/routines/logs', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const input = validate(routineLogSchema, request.body);
      const { organizationId, memberId } = req.portalAccount;
      const log = await prisma.routineLog.create({
        data: {
          organizationId,
          memberId,
          routineId: input.routineId || null,
          exerciseId: input.exerciseId || null,
          exerciseName: input.exerciseName,
          dayIndex: input.dayIndex ?? null,
          sets: input.sets ?? null,
          reps: input.reps || null,
          weight: input.weight || null,
          notes: input.notes || null,
          completedAt: input.completedAt ? new Date(input.completedAt) : new Date(),
        },
      });
      return ok(reply, log, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Historial de pagos
  app.get('/portal/payments', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const [payments, intents] = await Promise.all([
        prisma.payment.findMany({ where: { memberId: req.portalAccount.memberId }, orderBy: { paidAt: 'desc' }, take: 30 }),
        prisma.paymentIntent.findMany({ where: { memberId: req.portalAccount.memberId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      ]);
      return ok(reply, { payments, intents });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Iniciar pago de cuota (MercadoPago o transferencia)
  app.post('/portal/payments/intent', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const input = validate(portalPaymentIntentSchema, request.body);
      const { organizationId, memberId } = req.portalAccount;

      const active = await prisma.membership.findFirst({
        where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
        orderBy: { endDate: 'desc' },
        include: { plan: true },
      });
      // El monto lo define el servidor (precio de la membresia/plan), nunca el cliente.
      const amount = active?.price ?? 0;
      if (amount <= 0) throw new HttpError(400, 'No se pudo determinar el monto a pagar');

      const externalRef = `PI-${randomBytes(6).toString('hex')}`;
      const member = await prisma.member.findUnique({ where: { id: memberId } });

      if (input.method === 'TRANSFER') {
        const intent = await prisma.paymentIntent.create({
          data: {
            organizationId,
            memberId,
            membershipId: active?.id ?? null,
            amount,
            method: 'TRANSFER',
            status: 'PENDING',
            concept: input.concept,
            externalRef,
          },
        });
        const alias = (await getRawSetting(organizationId, 'MERCADOPAGO', 'TRANSFER_ALIAS')) ?? (await getRawSetting(organizationId, 'GENERAL', 'TRANSFER_ALIAS'));
        return ok(reply, { intent, transfer: { alias, amount } }, 201);
      }

      // MercadoPago
      const accessToken = await getRawSetting(organizationId, 'MERCADOPAGO', 'ACCESS_TOKEN');
      let checkoutUrl: string | null = null;
      let providerId: string | null = null;

      // Si ya hay una intencion pendiente y reciente con checkout, se reutiliza
      // para no generar preferencias duplicadas si el socio toca "Pagar" varias veces.
      const recent = await prisma.paymentIntent.findFirst({
        where: {
          organizationId,
          memberId,
          method: 'MERCADOPAGO',
          status: 'PENDING',
          amount,
          checkoutUrl: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) return ok(reply, { intent: recent, checkoutUrl: recent.checkoutUrl });

      if (accessToken) {
        try {
          const returnUrl = (await getRawSetting(organizationId, 'MERCADOPAGO', 'RETURN_URL')) || env.SOCIOS_URL;
          const backUrls = returnUrl ? { success: returnUrl, failure: returnUrl, pending: returnUrl } : undefined;
          const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [{ title: `Cuota ${active?.plan.name ?? ''}`.trim(), quantity: 1, unit_price: amount, currency_id: 'ARS' }],
              external_reference: externalRef,
              payer: member?.email ? { email: member.email } : undefined,
              notification_url: env.PUBLIC_URL ? `${env.PUBLIC_URL}/api/integrations/mercadopago/webhook` : undefined,
              back_urls: backUrls,
              auto_return: backUrls ? 'approved' : undefined,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
            providerId = data.id ?? null;
            checkoutUrl = data.init_point ?? data.sandbox_init_point ?? null;
          }
        } catch {
          // cae al fallback
        }
      }

      const intent = await prisma.paymentIntent.create({
        data: {
          organizationId,
          memberId,
          membershipId: active?.id ?? null,
          amount,
          method: 'MERCADOPAGO',
          status: 'PENDING',
          concept: input.concept,
          externalRef,
          checkoutUrl,
          providerId,
        },
      });

      return ok(reply, { intent, checkoutUrl }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Subir comprobante de transferencia (marca el intent pendiente)
  app.post('/portal/payments/:id/proof', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(portalProofSchema, request.body);
      const intent = await prisma.paymentIntent.findFirst({ where: { id, memberId: req.portalAccount.memberId } });
      if (!intent) throw new HttpError(404, 'Pago no encontrado');
      const updated = await prisma.paymentIntent.update({
        where: { id },
        data: { proofUrl: input.proofUrl, notes: input.notes ?? intent.notes, status: 'PENDING' },
      });
      return ok(reply, { intent: updated });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Check-in del socio desde la app (valida membresia y registra asistencia)
  app.post('/portal/checkin', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const input = validate(portalCheckinSchema, request.body ?? {});
      const { organizationId, memberId } = req.portalAccount;

      const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      if (member.status === 'SUSPENDED') return ok(reply, { allowed: false, reason: 'SOCIO_SUSPENDIDO', message: 'Socio suspendido' });
      if (member.status === 'INACTIVE') return ok(reply, { allowed: false, reason: 'SOCIO_INACTIVO', message: 'Socio dado de baja' });
      if (member.status === 'FROZEN') return ok(reply, { allowed: false, reason: 'SOCIO_CONGELADO', message: 'Membresia pausada' });

      const membership = await prisma.membership.findFirst({
        where: { memberId, organizationId, status: 'ACTIVE', endDate: { gte: new Date() } },
        orderBy: { endDate: 'desc' },
        include: { plan: true },
      });
      if (!membership) return ok(reply, { allowed: false, reason: 'SIN_MEMBRESIA', message: 'Sin membresia activa' });

      const branchId = input.branchId || member.branchId;
      const attendance = await prisma.attendance.create({
        data: {
          organizationId,
          branchId,
          memberId,
          membershipId: membership.id,
          method: input.method,
          status: 'ALLOWED',
          checkedInAt: new Date(),
        },
      });

      const today = startOfDay();
      const todays = await prisma.attendance.count({ where: { memberId, checkedInAt: { gte: today } } });
      if (todays <= 1) {
        await prisma.member.update({ where: { id: memberId }, data: { totalVisits: { increment: 1 }, lastVisitAt: new Date() } });
      }

      return ok(
        reply,
        {
          allowed: true,
          plan: membership.plan.name,
          planColor: membership.plan.color,
          membershipEndDate: membership.endDate,
          attendanceId: attendance.id,
          checkedInAt: attendance.checkedInAt,
          branchId,
        },
        201,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Clases disponibles para reservar
  app.get('/portal/classes', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const { organizationId, memberId } = req.portalAccount;
      const sessions = await prisma.classSession.findMany({
        where: { gymClass: { organizationId, isActive: true }, startAt: { gte: new Date() }, status: 'SCHEDULED' },
        orderBy: { startAt: 'asc' },
        take: 100,
        include: {
          gymClass: { select: { name: true, color: true } },
          instructor: { select: { name: true } },
          reservations: { select: { memberId: true, status: true } },
        },
      });
      const items = sessions.map((s) => {
        const reserved = s.reservations.filter((r) => r.status === 'RESERVED').length;
        const mine = s.reservations.find((r) => r.memberId === memberId && r.status !== 'CANCELLED');
        return {
          id: s.id,
          name: s.gymClass.name,
          color: s.gymClass.color,
          startAt: s.startAt,
          endAt: s.endAt,
          room: s.room,
          instructor: s.instructor?.name ?? null,
          capacity: s.capacity,
          reserved,
          full: reserved >= s.capacity,
          myStatus: mine?.status ?? null,
        };
      });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Reservar (o entrar en lista de espera) una clase
  app.post('/portal/classes/:id/reserve', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const { id } = request.params as { id: string };
      const { organizationId, memberId } = req.portalAccount;
      const session = await prisma.classSession.findFirst({
        where: { id, gymClass: { organizationId } },
        include: { reservations: true },
      });
      if (!session) throw new HttpError(404, 'Clase no encontrada');
      if (session.status !== 'SCHEDULED' || session.startAt.getTime() < Date.now()) {
        throw new HttpError(400, 'La clase ya no esta disponible');
      }
      const mine = session.reservations.find((r) => r.memberId === memberId && r.status !== 'CANCELLED');
      if (mine) return ok(reply, { reservation: mine, already: true });

      const active = session.reservations.filter((r) => r.status === 'RESERVED').length;
      const status = active < session.capacity ? 'RESERVED' : 'WAITLIST';
      const reservation = await prisma.reservation.upsert({
        where: { sessionId_memberId: { sessionId: id, memberId } },
        create: { sessionId: id, memberId, status },
        update: { status },
      });
      return ok(reply, { reservation, waitlisted: status === 'WAITLIST' }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cancelar la reserva
  app.delete('/portal/classes/:id/reserve', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const { id } = request.params as { id: string };
      const { memberId } = req.portalAccount;
      const reservation = await prisma.reservation.findUnique({ where: { sessionId_memberId: { sessionId: id, memberId } } });
      if (reservation && reservation.status !== 'CANCELLED') {
        await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'CANCELLED' } });
      }
      return ok(reply, { cancelled: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Registrar token de push
  app.post('/portal/push-token', { onRequest: [portalAuth] }, async (request, reply) => {
    try {
      const req = request as PortalAuthedRequest;
      const input = validate(portalPushTokenSchema, request.body);
      await prisma.pushToken.upsert({
        where: { token: input.token },
        create: { portalAccountId: req.portalAccount.id, token: input.token, platform: input.platform },
        update: { portalAccountId: req.portalAccount.id, platform: input.platform, lastSeenAt: new Date() },
      });
      return ok(reply, { registered: true });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default portalRoutes;
