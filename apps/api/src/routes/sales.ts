import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { saleSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { assertBranchInOrg, assertMemberInOrg } from '../lib/scope.js';
import { logActivity } from '../lib/activity.js';
import { round2 } from '@fitsystem/utils';

export function saleRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/sales', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string; page?: string; pageSize?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.from || query.to) {
        where.createdAt = {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        };
      }
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));
      const [total, sales] = await Promise.all([
        prisma.sale.count({ where }),
        prisma.sale.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            items: true,
            member: { select: { firstName: true, lastName: true } },
            user: { select: { name: true } },
          },
        }),
      ]);
      return ok(reply, { total, page, pageSize, items: sales });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/sales', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(saleSchema, request.body);
      const orgId = req.user.organizationId;
      await assertBranchInOrg(orgId, input.branchId);
      if (input.memberId) await assertMemberInOrg(orgId, input.memberId);

      const products = await prisma.product.findMany({
        where: { id: { in: input.items.map((i) => i.productId) }, organizationId: orgId },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      for (const item of input.items) {
        const p = productMap.get(item.productId);
        if (!p) throw new HttpError(400, `Producto no encontrado: ${item.productId}`);
        if (p.stock < item.quantity) throw new HttpError(400, `Stock insuficiente de ${p.name} (disponible ${p.stock})`);
      }

      let subtotal = 0;
      const itemsData = input.items.map((item) => {
        const p = productMap.get(item.productId)!;
        const lineSubtotal = round2(p.price * item.quantity);
        subtotal += lineSubtotal;
        return { productId: p.id, name: p.name, quantity: item.quantity, unitPrice: p.price, subtotal: lineSubtotal };
      });
      const discount = input.discount ?? 0;
      const total = round2(Math.max(0, subtotal - discount));

      const count = await prisma.sale.count({ where: { organizationId: orgId } });
      const number = `V-${String(count + 1).padStart(6, '0')}`;

      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            organizationId: orgId,
            branchId: input.branchId,
            memberId: input.memberId || null,
            userId: req.user.id,
            number,
            subtotal: round2(subtotal),
            discount,
            total,
            method: input.method,
            status: 'COMPLETED',
            notes: input.notes || null,
            items: { create: itemsData },
          },
          include: { items: true },
        });

        for (const item of itemsData) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              organizationId: orgId,
              branchId: input.branchId,
              productId: item.productId,
              type: 'SALE',
              quantity: item.quantity,
              unitCost: productMap.get(item.productId)!.cost,
              reason: `Venta ${number}`,
              referenceId: created.id,
              userId: req.user.id,
            },
          });
        }

        const payment = await tx.payment.create({
          data: {
            organizationId: orgId,
            branchId: input.branchId,
            memberId: input.memberId || null,
            concept: 'PRODUCT',
            method: input.method,
            status: 'COMPLETED',
            amount: total,
            reference: number,
            receivedById: req.user.id,
            notes: `Venta minishop ${number}`,
          },
        });

        await tx.sale.update({ where: { id: created.id }, data: { paymentId: payment.id } });

        const openSession = await tx.cashSession.findFirst({
          where: { organizationId: orgId, branchId: input.branchId, status: 'OPEN' },
        });
        await tx.cashMovement.create({
          data: {
            organizationId: orgId,
            branchId: input.branchId,
            cashSessionId: openSession?.id ?? null,
            type: 'INCOME',
            category: 'PRODUCT_SALE',
            method: input.method,
            amount: total,
            description: `Venta minishop ${number}`,
            memberId: input.memberId || null,
            userId: req.user.id,
            referenceId: created.id,
          },
        });

        return created;
      });

      await logActivity(req, 'CREATE', 'SALE', sale.id, undefined, { number, total });
      return ok(reply, sale, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default saleRoutes;