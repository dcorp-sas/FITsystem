import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate, ok, fail, HttpError } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { ensureOrgLicense } from '../services/license.js';

/*
 * Sincronizacion escritorio -> nube.
 *
 * El sistema principal (app de escritorio) sigue funcionando con su base local
 * (offline-first) y empuja sus datos a la nube con una clave por organizacion.
 * La app del socio y el panel web leen de la nube, asi comparten los mismos
 * socios, credenciales y cuotas.
 *
 * Autenticacion: header `x-sync-key`, que se resuelve a una organizacion via la
 * setting SYNC/KEY (no secreta). Conexion inicial: POST /api/sync/connect.
 */

const connectSchema = z.object({
  organizationName: z.string().min(1).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug invalido').optional(),
  currency: z.string().min(3).max(3).optional(),
  taxId: z.string().max(40).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().max(40).nullish(),
});

// Filas completas de Prisma (mismos campos que el esquema). Se validan como
// registros flexibles y Prisma rechaza cualquier campo desconocido.
const row = z.record(z.string(), z.unknown());

const pushSchema = z.object({
  organization: z
    .object({
      name: z.string().min(1).max(120).optional(),
      taxId: z.string().max(40).nullish(),
      email: z.string().max(160).nullish(),
      phone: z.string().max(40).nullish(),
      address: z.string().max(200).nullish(),
      logoUrl: z.string().max(500).nullish(),
      currency: z.string().min(3).max(3).optional(),
    })
    .optional(),
  branches: z.array(row).max(200).optional(),
  plans: z.array(row).max(500).optional(),
  members: z.array(row).max(20000).optional(),
  memberships: z.array(row).max(40000).optional(),
  portalAccounts: z.array(row).max(20000).optional(),
  instructors: z.array(row).max(1000).optional(),
  gymClasses: z.array(row).max(1000).optional(),
  classSessions: z.array(row).max(5000).optional(),
  reservations: z.array(row).max(50000).optional(),
  attendance: z.array(row).max(50000).optional(),
  payments: z.array(row).max(20000).optional(),
  sales: z.array(row).max(20000).optional(),
  cashSessions: z.array(row).max(5000).optional(),
  cashMovements: z.array(row).max(20000).optional(),
  stockMovements: z.array(row).max(20000).optional(),
  products: z.array(row).max(5000).optional(),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'gimnasio';
}

async function orgFromSyncKey(request: { headers: Record<string, unknown> }): Promise<string> {
  const key = String(request.headers['x-sync-key'] ?? '').trim();
  if (!key) throw new HttpError(401, 'Falta la clave de sincronizacion');
  const setting = await prisma.setting.findFirst({
    where: { category: 'SYNC', key: 'KEY', value: key },
    select: { organizationId: true },
  });
  if (!setting) throw new HttpError(401, 'Clave de sincronizacion invalida');
  return setting.organizationId;
}

export function syncRoutes(app: FastifyInstance) {
  // Conexion de un sistema de escritorio: crea la organizacion en la nube y
  // devuelve la clave de sincronizacion (una sola vez).
  app.post(
    '/sync/connect',
    { onRequest: [rateLimit({ max: 10, windowMs: 60 * 60 * 1000, keyPrefix: 'sync-connect' })] },
    async (request, reply) => {
      try {
        const input = validate(connectSchema, request.body);
        const slug = input.slug || slugify(input.organizationName);

        const existing = await prisma.organization.findUnique({ where: { slug } });
        if (existing) throw new HttpError(409, 'El nombre corto ya esta en uso');

        const org = await prisma.organization.create({
          data: {
            name: input.organizationName,
            slug,
            currency: input.currency || 'ARS',
            taxId: input.taxId ?? null,
            email: input.email ?? null,
            phone: input.phone ?? null,
          },
        });

        await prisma.branch.create({
          data: { organizationId: org.id, name: 'Sede Central', code: 'SC' },
        });

        await ensureOrgLicense(org.id).catch(() => undefined);

        const syncKey = `sk_${randomBytes(24).toString('hex')}`;
        await prisma.setting.upsert({
          where: { organizationId_category_key: { organizationId: org.id, category: 'SYNC', key: 'KEY' } },
          create: { organizationId: org.id, category: 'SYNC', key: 'KEY', value: syncKey, isSecret: false },
          update: { value: syncKey, isSecret: false },
        });

        return ok(
          reply,
          {
            organizationId: org.id,
            syncKey,
            organization: { id: org.id, name: org.name, slug: org.slug, currency: org.currency },
          },
          201,
        );
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Empuja (upsert por id) las entidades indicadas. Idempotente: se puede repetir.
  app.post('/sync/push', async (request, reply) => {
    try {
      const res = await orgFromSyncKey(request); const organizationId = typeof (res as any) === 'string' ? (res as any) : (res as any).orgId;
      const input = validate(pushSchema, request.body);

      if (input.organization) {
        const { name, taxId, email, phone, address, logoUrl, currency } = input.organization;
        await prisma.organization
          .update({
            where: { id: organizationId },
            data: {
              ...(name ? { name } : {}),
              ...(taxId !== undefined ? { taxId: taxId ?? null } : {}),
              ...(email !== undefined ? { email: email ?? null } : {}),
              ...(phone !== undefined ? { phone: phone ?? null } : {}),
              ...(address !== undefined ? { address: address ?? null } : {}),
              ...(logoUrl !== undefined ? { logoUrl: logoUrl ?? null } : {}),
              ...(currency ? { currency } : {}),
            },
          })
          .catch(() => undefined);
      }

      const counts = {
        branches: 0,
        plans: 0,
        members: 0,
        memberships: 0,
        portalAccounts: 0,
        instructors: 0,
        gymClasses: 0,
        classSessions: 0,
        reservations: 0,
        attendance: 0,
      };

      await prisma.$transaction(
        async (tx) => {
          for (const b of input.branches ?? []) {
            const data = { ...(b as Record<string, unknown>), organizationId };
            await tx.branch.upsert({ where: { id: String(b.id) }, create: data as never, update: data as never });
            counts.branches++;
          }
          for (const p of input.plans ?? []) {
            const data = { ...(p as Record<string, unknown>), organizationId };
            await tx.plan.upsert({ where: { id: String(p.id) }, create: data as never, update: data as never });
            counts.plans++;
          }
          for (const m of input.members ?? []) {
            const data = { ...(m as Record<string, unknown>), organizationId };
            await tx.member.upsert({ where: { id: String(m.id) }, create: data as never, update: data as never });
            counts.members++;
          }
          for (const ms of input.memberships ?? []) {
            const data: Record<string, unknown> = { ...(ms as Record<string, unknown>), organizationId };
            // El usuario vendedor es local al escritorio; en la nube no existe.
            delete data.soldById;
            await tx.membership.upsert({ where: { id: String(ms.id) }, create: data as never, update: data as never });
            counts.memberships++;
          }
          for (const a of input.portalAccounts ?? []) {
            const memberId = String(a.memberId);
            const data = { ...(a as Record<string, unknown>), organizationId };
            await tx.portalAccount.upsert({
              where: { memberId },
              create: data as never,
              update: data as never,
            });
            counts.portalAccounts++;
          }
        },
        { timeout: 120000, maxWait: 15000 },
      );

      // Catalogo de clases y actividad (ingresos/reservas). Se procesan fuera de
      // la transaccion y con upsert por fila para que una fila con conflicto no
      // aborte todo el push. Orden: instructores -> clases -> sesiones -> reservas.
      for (const ins of input.instructors ?? []) {
        const data: Record<string, unknown> = { ...(ins as Record<string, unknown>), organizationId };
        delete data.userId; // el usuario es local al escritorio
        try {
          await prisma.instructor.upsert({ where: { id: String(ins.id) }, create: data as never, update: data as never });
          counts.instructors++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const gc of input.gymClasses ?? []) {
        const data = { ...(gc as Record<string, unknown>), organizationId };
        try {
          await prisma.gymClass.upsert({ where: { id: String(gc.id) }, create: data as never, update: data as never });
          counts.gymClasses++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const cs of input.classSessions ?? []) {
        const data = { ...(cs as Record<string, unknown>) };
        try {
          await prisma.classSession.upsert({ where: { id: String(cs.id) }, create: data as never, update: data as never });
          counts.classSessions++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const r of input.reservations ?? []) {
        const sessionId = String(r.sessionId);
        const memberId = String(r.memberId);
        const data = { ...(r as Record<string, unknown>) };
        delete data.createdById; // el usuario es local al escritorio
        try {
          await prisma.reservation.upsert({
            where: { sessionId_memberId: { sessionId, memberId } },
            create: { ...data, id: String(r.id), sessionId, memberId } as never,
            update: { status: String(r.status ?? 'RESERVED') } as never,
          });
          counts.reservations++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const a of input.attendance ?? []) {
        const data: Record<string, unknown> = { ...(a as Record<string, unknown>), organizationId };
        delete data.registeredById; // el usuario es local al escritorio
        try {
          await prisma.attendance.upsert({ where: { id: String(a.id) }, create: data as never, update: data as never });
          counts.attendance++;
        } catch {
          /* fila no sincronizable */
        }
      }

      return ok(reply, { ok: true, syncedAt: new Date().toISOString(), counts });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // El escritorio descarga lo que hicieron los socios desde la app (ingresos y
  // reservas) para reflejarlo en el sistema local. `since` limita los ingresos
  // nuevos; las reservas incluyen siempre las de sesiones futuras (cupo vivo).
  app.get('/sync/pull', async (request, reply) => {
    try {
      const res = await orgFromSyncKey(request); const organizationId = typeof (res as any) === 'string' ? (res as any) : (res as any).orgId;
      const query = request.query as { since?: string };
      const since = query.since ? new Date(query.since) : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const attendance = await prisma.attendance.findMany({
        where: { organizationId, checkedInAt: { gte: since } },
        select: {
          id: true,
          branchId: true,
          memberId: true,
          membershipId: true,
          method: true,
          status: true,
          rejectionReason: true,
          checkedInAt: true,
          checkedOutAt: true,
        },
        orderBy: { checkedInAt: 'asc' },
        take: 20000,
      });

      const reservations = await prisma.reservation.findMany({
        where: {
          member: { organizationId },
          OR: [{ createdAt: { gte: since } }, { session: { startAt: { gte: now } } }],
        },
        select: { id: true, sessionId: true, memberId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      });

      return ok(reply, { attendance, reservations, serverTime: now.toISOString() });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default syncRoutes;








