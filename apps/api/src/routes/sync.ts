import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate, ok, fail, HttpError } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { ensureOrgLicense } from '../services/license.js';
import { bindInstallation, ensureGenericAdmin, recordSyncResult } from '../services/installation.js';

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
  // ID de instalacion del escritorio: identifica al gimnasio al ingresar al
  // panel remoto (login con el usuario generico admin/admin123).
  installationId: z.string().max(120).nullish(),
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

        const branch = await prisma.branch.create({
          data: { organizationId: org.id, name: 'Sede Central', code: 'SC' },
        });

        await ensureOrgLicense(org.id).catch(() => undefined);
        await ensureGenericAdmin({ id: org.id, slug: org.slug }, branch.id).catch(() => undefined);
        await bindInstallation(org.id, input.installationId ?? '').catch(() => undefined);

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
    let failedOrgId: string | null = null;
    try {
      const res = await orgFromSyncKey(request); const organizationId = typeof (res as any) === 'string' ? (res as any) : (res as any).orgId;
      failedOrgId = organizationId;
      const input = validate(pushSchema, request.body);

      // El escritorio manda su ID de instalacion para quedar vinculado al
      // gimnasio en la nube (asi el login del panel remoto resuelve el gimnasio).
      await bindInstallation(
        organizationId,
        String((request.headers as Record<string, unknown>)['x-installation-id'] ?? ''),
      ).catch(() => undefined);

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
        payments: 0,
        sales: 0,
        cashSessions: 0,
        cashMovements: 0,
        stockMovements: 0,
        products: 0,
      };

      // El sistema admite un solo local. Las filas de versiones anteriores que
      // traigan varias sedes se consolidan en la sede primaria durante el push.
      let primaryBranch = await prisma.branch.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
      if (!primaryBranch) {
        primaryBranch = await prisma.branch.create({ data: { organizationId, name: 'Sede Central', code: 'SC' } });
      }
      const primaryBranchId = primaryBranch.id;
      const branchIdMap = new Map<string, string>(
        (input.branches ?? []).map((branch) => [String(branch.id), primaryBranchId] as [string, string]),
      );
      const remapBranch = (data: Record<string, unknown>) => {
        const branchId = data.branchId;
        if (typeof branchId === 'string') {
          data.branchId = branchIdMap.get(branchId) ?? primaryBranchId;
        }
        return data;
      };

      await prisma.$transaction(
        async (tx) => {
          counts.branches = input.branches?.length ? 1 : 0;
          for (const p of input.plans ?? []) {
            const data = { ...(p as Record<string, unknown>), organizationId };
            await tx.plan.upsert({ where: { id: String(p.id) }, create: data as never, update: data as never });
            counts.plans++;
          }
          for (const m of input.members ?? []) {
            const data = remapBranch({ ...(m as Record<string, unknown>), organizationId });
            await tx.member.upsert({ where: { id: String(m.id) }, create: data as never, update: data as never });
            counts.members++;
          }
          for (const ms of input.memberships ?? []) {
            const data: Record<string, unknown> = remapBranch({ ...(ms as Record<string, unknown>), organizationId });
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
        const data = remapBranch({ ...(gc as Record<string, unknown>), organizationId });
        try {
          await prisma.gymClass.upsert({ where: { id: String(gc.id) }, create: data as never, update: data as never });
          counts.gymClasses++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const cs of input.classSessions ?? []) {
        const data = remapBranch({ ...(cs as Record<string, unknown>) });
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
        const data: Record<string, unknown> = remapBranch({ ...(a as Record<string, unknown>), organizationId });
        delete data.registeredById; // el usuario es local al escritorio
        try {
          await prisma.attendance.upsert({ where: { id: String(a.id) }, create: data as never, update: data as never });
          counts.attendance++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const p of input.payments ?? []) {
        const data: Record<string, unknown> = remapBranch({ ...(p as Record<string, unknown>), organizationId });
        delete data.receivedById; // el usuario es local al escritorio
        try {
          await prisma.payment.upsert({ where: { id: String(p.id) }, create: data as never, update: data as never });
          counts.payments++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const s of input.sales ?? []) {
        const data: Record<string, unknown> = remapBranch({ ...(s as Record<string, unknown>), organizationId });
        delete data.userId; // el usuario es local al escritorio
        try {
          await prisma.sale.upsert({ where: { id: String(s.id) }, create: data as never, update: data as never });
          counts.sales++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const cs of input.cashSessions ?? []) {
        const data: Record<string, unknown> = remapBranch({ ...(cs as Record<string, unknown>), organizationId });
        delete data.openedById; // el usuario es local al escritorio
        delete data.closedById;
        try {
          await prisma.cashSession.upsert({ where: { id: String(cs.id) }, create: data as never, update: data as never });
          counts.cashSessions++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const cm of input.cashMovements ?? []) {
        const data: Record<string, unknown> = remapBranch({ ...(cm as Record<string, unknown>), organizationId });
        delete data.userId; // el usuario es local al escritorio
        try {
          await prisma.cashMovement.upsert({ where: { id: String(cm.id) }, create: data as never, update: data as never });
          counts.cashMovements++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const sm of input.stockMovements ?? []) {
        const data: Record<string, unknown> = remapBranch({ ...(sm as Record<string, unknown>), organizationId });
        delete data.userId; // el usuario es local al escritorio
        try {
          await prisma.stockMovement.upsert({ where: { id: String(sm.id) }, create: data as never, update: data as never });
          counts.stockMovements++;
        } catch {
          /* fila no sincronizable */
        }
      }
      for (const pr of input.products ?? []) {
        const data: Record<string, unknown> = { ...(pr as Record<string, unknown>), organizationId };
        try {
          await prisma.product.upsert({ where: { id: String(pr.id) }, create: data as never, update: data as never });
          counts.products++;
        } catch {
          /* fila no sincronizable */
        }
      }

      await recordSyncResult(organizationId).catch(() => undefined);
      return ok(reply, { ok: true, syncedAt: new Date().toISOString(), counts });
    } catch (error) {
      if (failedOrgId) {
        const message = error instanceof Error ? error.message : String(error);
        await recordSyncResult(failedOrgId, message).catch(() => undefined);
      }
      return fail(reply, error);
    }
  });

  // El escritorio descarga lo que hicieron los socios desde la app (ingresos y
  // reservas) para reflejarlo en el sistema local. `since` limita los ingresos
  // nuevos; las reservas incluyen siempre las de sesiones futuras (cupo vivo).
  app.get('/sync/pull', async (request, reply) => {
    try {
      const res = await orgFromSyncKey(request);
      const organizationId = typeof (res as any) === 'string' ? (res as any) : (res as any).orgId;
      const query = request.query as { since?: string };
      const since = query.since ? new Date(query.since) : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const attendance = await prisma.attendance.findMany({
        where: { organizationId, checkedInAt: { gte: since } },
        select: {
          id: true, branchId: true, memberId: true, membershipId: true, method: true, status: true, rejectionReason: true, checkedInAt: true, checkedOutAt: true,
        },
        orderBy: { checkedInAt: 'asc' },
        take: 20000,
      });

      const reservations = await prisma.reservation.findMany({
        where: { member: { organizationId }, OR: [{ createdAt: { gte: since } }, { session: { startAt: { gte: now } } }] },
        select: { id: true, sessionId: true, memberId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      });

      const payments = await prisma.payment.findMany({
        where: { organizationId, paidAt: { gte: since } },
        select: { id: true, branchId: true, memberId: true, membershipId: true, concept: true, method: true, status: true, amount: true, currency: true, reference: true, providerId: true, paidAt: true, notes: true },
        orderBy: { paidAt: 'asc' },
        take: 20000,
      });

      const sales = await prisma.sale.findMany({
        where: { organizationId, createdAt: { gte: since } },
        select: { id: true, branchId: true, memberId: true, userId: true, number: true, subtotal: true, discount: true, total: true, method: true, status: true, paymentId: true, notes: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      });

      const cashSessions = await prisma.cashSession.findMany({
        where: { organizationId, openedAt: { gte: since } },
        select: { id: true, branchId: true, openedById: true, closedById: true, status: true, openedAt: true, closedAt: true, openingAmount: true, closingAmount: true, expectedAmount: true, difference: true, notes: true },
        orderBy: { openedAt: 'asc' },
        take: 5000,
      });

      const cashMovements = await prisma.cashMovement.findMany({
        where: { organizationId, createdAt: { gte: since } },
        select: { id: true, branchId: true, cashSessionId: true, type: true, category: true, method: true, amount: true, description: true, memberId: true, userId: true, referenceId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      });

      const stockMovements = await prisma.stockMovement.findMany({
        where: { organizationId, createdAt: { gte: since } },
        select: { id: true, branchId: true, productId: true, type: true, quantity: true, unitCost: true, reason: true, referenceId: true, userId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      });

      const products = await prisma.product.findMany({
        where: { organizationId },
        select: { id: true, categoryId: true, name: true, sku: true, barcode: true, description: true, cost: true, price: true, stock: true, minStock: true, unit: true, imageUrl: true, isActive: true, expiresAt: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      });

      return ok(reply, { attendance, reservations, payments, sales, cashSessions, cashMovements, stockMovements, products, serverTime: now.toISOString() });
    } catch (error) {
      return fail(reply, error);
    }
  });

}
export default syncRoutes;



