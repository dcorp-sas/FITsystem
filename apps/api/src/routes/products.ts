import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { productSchema, productCategorySchema, stockMovementSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';

export function productRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/products', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { search?: string; lowStock?: string; categoryId?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.search) {
        where.OR = [
          { name: { contains: query.search } },
          { sku: { contains: query.search } },
          { barcode: { contains: query.search } },
        ];
      }
      if (query.categoryId) where.categoryId = query.categoryId;
      const products = await prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { category: true, _count: { select: { saleItems: true } } },
      });
      const lowStock = query.lowStock
        ? products.filter((p) => p.minStock > 0 && p.stock <= p.minStock)
        : products;
      const stats = {
        outOfStock: products.filter((p) => p.stock <= 0).length,
        lowStock: products.filter((p) => p.minStock > 0 && p.stock <= p.minStock).length,
        inventoryValue: products.reduce((s, p) => s + p.cost * p.stock, 0),
        potentialValue: products.reduce((s, p) => s + p.price * p.stock, 0),
      };
      return ok(reply, { items: lowStock, stats });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/products/categories', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const cats = await prisma.productCategory.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { name: 'asc' },
      });
      return ok(reply, cats);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/products/categories', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(productCategorySchema, request.body);
      const cat = await prisma.productCategory.create({
        data: { organizationId: req.user.organizationId, name: input.name },
      });
      await logActivity(req, 'CREATE', 'PRODUCT_CATEGORY', cat.id);
      return ok(reply, cat, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/products', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(productSchema, request.body);
      const product = await prisma.product.create({
        data: {
          organizationId: req.user.organizationId,
          categoryId: input.categoryId || null,
          name: input.name,
          sku: input.sku || null,
          barcode: input.barcode || null,
          description: input.description || null,
          cost: input.cost ?? 0,
          price: input.price,
          stock: input.stock ?? 0,
          minStock: input.minStock ?? 0,
          unit: input.unit || 'unidad',
          imageUrl: input.imageUrl || null,
          isActive: input.isActive ?? true,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await logActivity(req, 'CREATE', 'PRODUCT', product.id);
      return ok(reply, product, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/products/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(productSchema, request.body);
      const existing = await prisma.product.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Producto no encontrado');
      const product = await prisma.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId || null,
          name: input.name,
          sku: input.sku || null,
          barcode: input.barcode || null,
          description: input.description || null,
          cost: input.cost ?? existing.cost,
          price: input.price,
          stock: input.stock ?? existing.stock,
          minStock: input.minStock ?? existing.minStock,
          unit: input.unit || existing.unit,
          imageUrl: input.imageUrl || null,
          isActive: input.isActive ?? existing.isActive,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await logActivity(req, 'UPDATE', 'PRODUCT', id);
      return ok(reply, product);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Movimiento de stock (entrada/salida/ajuste)
  app.post('/products/:id/stock', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(stockMovementSchema, request.body);
      const product = await prisma.product.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!product) throw new HttpError(404, 'Producto no encontrado');
      const branchId = req.user.branchId;
      if (!branchId) throw new HttpError(400, 'Indica la sede del movimiento');

      const delta = input.type === 'IN' || input.type === 'RETURN' ? input.quantity : -input.quantity;
      const updated = await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            organizationId: req.user.organizationId,
            branchId,
            productId: id,
            type: input.type,
            quantity: input.quantity,
            unitCost: input.unitCost ?? product.cost,
            reason: input.reason || null,
            userId: req.user.id,
          },
        }),
        prisma.product.update({
          where: { id },
          data: { stock: Math.max(0, product.stock + delta) },
        }),
      ]);
      await logActivity(req, 'STOCK', 'PRODUCT', id, undefined, { type: input.type, quantity: input.quantity });
      return ok(reply, updated[1], 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/products/:id/stock', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const movements = await prisma.stockMovement.findMany({
        where: { productId: id, organizationId: req.user.organizationId },
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } },
        take: 100,
      });
      return ok(reply, movements);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default productRoutes;