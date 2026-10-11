import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { equipmentSchema, maintenanceOrderSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';

export function equipmentRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/equipment', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { status?: string; branchId?: string; search?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.status) where.status = query.status;
      if (query.branchId) where.branchId = query.branchId;
      if (query.search) where.name = { contains: query.search };
      const equipment = await prisma.equipment.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          branch: { select: { name: true } },
          orders: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' } },
        },
      });
      const stats = {
        total: equipment.length,
        operational: equipment.filter((e) => e.status === 'OPERATIONAL').length,
        maintenance: equipment.filter((e) => e.status === 'MAINTENANCE').length,
        outOfService: equipment.filter((e) => e.status === 'OUT_OF_SERVICE').length,
        openOrders: equipment.reduce((s, e) => s + e.orders.length, 0),
      };
      return ok(reply, { items: equipment, stats });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/equipment', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(equipmentSchema, request.body);
      const equipment = await prisma.equipment.create({
        data: {
          organizationId: req.user.organizationId,
          branchId: input.branchId,
          name: input.name,
          category: input.category || null,
          brand: input.brand || null,
          model: input.model || null,
          serialNumber: input.serialNumber || null,
          location: input.location || null,
          purchaseDate: input.purchaseDate ?? null,
          warrantyUntil: input.warrantyUntil ?? null,
          status: input.status || 'OPERATIONAL',
          notes: input.notes || null,
        },
      });
      await logActivity(req, 'CREATE', 'EQUIPMENT', equipment.id);
      return ok(reply, equipment, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/equipment/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(equipmentSchema, request.body);
      const existing = await prisma.equipment.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Equipo no encontrado');
      const equipment = await prisma.equipment.update({
        where: { id },
        data: {
          branchId: input.branchId,
          name: input.name,
          category: input.category || null,
          brand: input.brand || null,
          model: input.model || null,
          serialNumber: input.serialNumber || null,
          location: input.location || null,
          purchaseDate: input.purchaseDate ?? null,
          warrantyUntil: input.warrantyUntil ?? null,
          status: input.status ?? existing.status,
          notes: input.notes || null,
        },
      });
      await logActivity(req, 'UPDATE', 'EQUIPMENT', id);
      return ok(reply, equipment);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/maintenance-orders', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { status?: string };
      const orders = await prisma.maintenanceOrder.findMany({
        where: {
          equipment: { organizationId: req.user.organizationId },
          ...(query.status ? { status: query.status } : {}),
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: { equipment: { select: { id: true, name: true, branchId: true } } },
        take: 200,
      });
      return ok(reply, orders);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/maintenance-orders', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(maintenanceOrderSchema, request.body);
      const equipment = await prisma.equipment.findFirst({
        where: { id: input.equipmentId, organizationId: req.user.organizationId },
      });
      if (!equipment) throw new HttpError(404, 'Equipo no encontrado');
      const order = await prisma.maintenanceOrder.create({
        data: {
          equipmentId: equipment.id,
          type: input.type || 'CORRECTIVE',
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'MEDIUM',
          status: input.status || 'OPEN',
          assignedTo: input.assignedTo || null,
          cost: input.cost ?? 0,
          scheduledAt: input.scheduledAt ?? null,
        },
      });
      // Actualiza estado del equipo si la orden implica mantenimiento
      if (['OPEN', 'IN_PROGRESS'].includes(order.status)) {
        await prisma.equipment.update({ where: { id: equipment.id }, data: { status: 'MAINTENANCE' } });
      }
      await logActivity(req, 'CREATE', 'MAINTENANCE_ORDER', order.id);
      return ok(reply, order, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/maintenance-orders/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(maintenanceOrderSchema, request.body);
      const existing = await prisma.maintenanceOrder.findFirst({
        where: { id, equipment: { organizationId: req.user.organizationId } },
      });
      if (!existing) throw new HttpError(404, 'Orden no encontrada');
      const order = await prisma.maintenanceOrder.update({
        where: { id },
        data: {
          type: input.type ?? existing.type,
          title: input.title,
          description: input.description || null,
          priority: input.priority ?? existing.priority,
          status: input.status ?? existing.status,
          assignedTo: input.assignedTo || null,
          cost: input.cost ?? existing.cost,
          scheduledAt: input.scheduledAt ?? null,
          completedAt: input.status === 'DONE' ? new Date() : existing.completedAt,
        },
      });
      // Si se completa, devolver el equipo a operativo si no tiene mas ordenes abiertas
      if (order.status === 'DONE') {
        const openOrders = await prisma.maintenanceOrder.count({
          where: { equipmentId: order.equipmentId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        });
        if (openOrders === 0) {
          await prisma.equipment.update({ where: { id: order.equipmentId }, data: { status: 'OPERATIONAL' } });
        }
      }
      await logActivity(req, 'UPDATE', 'MAINTENANCE_ORDER', id);
      return ok(reply, order);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default equipmentRoutes;