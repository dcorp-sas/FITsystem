import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { HttpError, fail, ok } from '../lib/http.js';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { isKnownPeriod } from '../services/billing.js';
import {
  listSubscriptions,
  cancelSubscription,
  reactivateSubscription,
  changeSubscriptionPeriod,
  enforceSubscriptions,
} from '../services/subscriptions.js';

/*
 * Respaldo remoto del Licensador. El servicio de licencias del proveedor corre
 * en el plan free de Render, con disco EFÍMERO: al reiniciarse pierde licencias,
 * asientos y revocaciones. Aquí guardamos su último snapshot en Postgres (durable)
 * y el Licensador lo restaura al arrancar.
 *
 * El acceso se protege con un token compartido (PROVIDER_BACKUP_TOKEN) que viaja
 * en el header x-provider-token. Sin token configurado, el endpoint no existe.
 */

const SNAPSHOT_KEY = 'licensador';
const MAX_PAYLOAD = 5_000_000;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function requireProviderToken(request: FastifyRequest) {
  if (!env.PROVIDER_BACKUP_TOKEN) throw new HttpError(503, 'Respaldo remoto no configurado');
  const provided = request.headers['x-provider-token'];
  if (typeof provided !== 'string' || !safeEqual(provided, env.PROVIDER_BACKUP_TOKEN)) {
    throw new HttpError(403, 'No autorizado');
  }
}

export function providerRoutes(app: FastifyInstance) {
  // Devuelve el último snapshot del Licensador (lo consume él mismo al arrancar).
  app.get('/provider/backup', async (request, reply) => {
    try {
      requireProviderToken(request);
      const row = await prisma.providerBackup.findUnique({ where: { key: SNAPSHOT_KEY } });
      if (!row) return reply.status(404).send({ error: 'Not Found', message: 'Sin respaldo todavía' });
      return reply.status(200).send(JSON.parse(row.payload));
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Guarda el snapshot enviado por el Licensador.
  app.post('/provider/backup', async (request, reply) => {
    try {
      requireProviderToken(request);
      const body = request.body as { producto?: unknown } | undefined;
      if (!body || typeof body !== 'object' || body.producto !== 'fitsystem-licensador') {
        throw new HttpError(400, 'El cuerpo no es un respaldo del Licensador');
      }
      const payload = JSON.stringify(body);
      if (payload.length > MAX_PAYLOAD) throw new HttpError(413, 'Respaldo demasiado grande');
      await prisma.providerBackup.upsert({
        where: { key: SNAPSHOT_KEY },
        create: { key: SNAPSHOT_KEY, payload },
        update: { payload },
      });
      return reply.status(200).send({ data: { ok: true, bytes: payload.length } });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // --- Suscripciones de la tienda (MercadoPago) para el Panel de control FS ---

  // Lista las suscripciones (con filtro opcional por estado).
  app.get('/provider/subscriptions', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { status } = (request.query ?? {}) as { status?: string };
      return ok(reply, { subscriptions: await listSubscriptions(status) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Baja de una suscripción: cancela el débito en MercadoPago (sigue activa
  // hasta el fin del período pagado).
  app.post('/provider/subscriptions/cancel', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { externalRef } = (request.body ?? {}) as { externalRef?: string };
      if (!externalRef) throw new HttpError(400, 'Falta la referencia de la suscripción');
      const result = await cancelSubscription(externalRef);
      if (!result.ok) throw new HttpError(502, result.error || 'No se pudo dar de baja');
      return ok(reply, { cancelled: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Reactivación de una suscripción vencida/cancelada: devuelve el init_point.
  app.post('/provider/subscriptions/reactivate', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { externalRef } = (request.body ?? {}) as { externalRef?: string };
      if (!externalRef) throw new HttpError(400, 'Falta la referencia de la suscripción');
      const result = await reactivateSubscription(externalRef);
      if (!result.ok) throw new HttpError(502, result.error || 'No se pudo reactivar');
      return ok(reply, { initPoint: result.initPoint, externalRef: result.externalRef, amount: result.amount });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Reconfigura una suscripción a la modalidad mensual y devuelve el init_point para autorizar el débito.
  app.post('/provider/subscriptions/period', async (request, reply) => {
    try {
      requireProviderToken(request);
      const { externalRef, period } = (request.body ?? {}) as { externalRef?: string; period?: string };
      if (!externalRef) throw new HttpError(400, 'Falta la referencia de la suscripción');
      if (!period || !isKnownPeriod(period)) throw new HttpError(400, 'Período inválido (MONTHLY)');
      const result = await changeSubscriptionPeriod(externalRef, period);
      if (!result.ok) throw new HttpError(502, result.error || 'No se pudo cambiar el período');
      return ok(reply, { initPoint: result.initPoint, externalRef: result.externalRef, amount: result.amount, period });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Fuerza el enforcement (corte de licencias vencidas) y devuelve cuántas cortó.
  app.post('/provider/subscriptions/enforce', async (request, reply) => {
    try {
      requireProviderToken(request);
      const cut = await enforceSubscriptions();
      return ok(reply, { cut });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // --- Diagnóstico de clientes para el Panel de control FS ---
  //
  // Devuelve, por gimnasio (organización), el pulso de uso y el estado de la
  // sincronización con el escritorio. El panel combina esto con las licencias
  // del Licensador para detectar clientes sin actividad, sin sync o vencidos.
  app.get('/provider/clients', async (request, reply) => {
    try {
      requireProviderToken(request);
      const orgs = await prisma.organization.findMany({
        where: { NOT: { slug: { startsWith: '__' } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, createdAt: true },
      });

      const clients = [];
      for (const org of orgs) {
        const [branches, users, members, activeMembers, plans, classes, attendances, lastAttendance, lastMember, lastPayment, syncRows] =
          await Promise.all([
            prisma.branch.count({ where: { organizationId: org.id } }),
            prisma.user.count({ where: { organizationId: org.id, isActive: true } }),
            prisma.member.count({ where: { organizationId: org.id } }),
            prisma.member.count({ where: { organizationId: org.id, status: 'ACTIVE' } }),
            prisma.plan.count({ where: { organizationId: org.id } }),
            prisma.gymClass.count({ where: { organizationId: org.id } }),
            prisma.attendance.count({ where: { organizationId: org.id } }),
            prisma.attendance.findFirst({
              where: { organizationId: org.id },
              orderBy: { checkedInAt: 'desc' },
              select: { checkedInAt: true },
            }),
            prisma.member.findFirst({
              where: { organizationId: org.id },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
            prisma.payment.findFirst({
              where: { organizationId: org.id },
              orderBy: { paidAt: 'desc' },
              select: { paidAt: true },
            }),
            prisma.setting.findMany({
              where: { organizationId: org.id, category: 'SYNC' },
              select: { key: true, value: true },
            }),
          ]);

        const sync = Object.fromEntries(syncRows.map((s) => [s.key, s.value]));
        clients.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt,
          branches,
          users,
          members,
          activeMembers,
          plans,
          classes,
          attendances,
          lastAttendanceAt: lastAttendance?.checkedInAt ?? null,
          lastMemberAt: lastMember?.createdAt ?? null,
          lastPaymentAt: lastPayment?.paidAt ?? null,
          sync: {
            connected: Boolean(sync.KEY),
            installationId: sync.INSTALLATION_ID ?? null,
            lastPushAt: sync.LAST_PUSH_AT ?? null,
            lastError: sync.LAST_ERROR ?? null,
          },
        });
      }

      return ok(reply, {
        generatedAt: new Date().toISOString(),
        totals: { clients: clients.length, members: clients.reduce((n, c) => n + c.members, 0) },
        clients,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default providerRoutes;
