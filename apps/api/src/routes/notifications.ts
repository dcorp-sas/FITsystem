import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { notificationTemplateSchema, sendNotificationSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { notifyEvent, generateReminders } from '../services/notifications.js';

export function notificationRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/notifications', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { status?: string; channel?: string; page?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.status) where.status = query.status;
      if (query.channel) where.channel = query.channel;
      const page = Math.max(1, Number(query.page || 1));
      const [total, items] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * 30,
          take: 30,
          include: { member: { select: { firstName: true, lastName: true, phone: true } } },
        }),
      ]);
      return ok(reply, { total, page, items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/notification-templates', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const templates = await prisma.notificationTemplate.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: [{ event: 'asc' }, { name: 'asc' }],
      });
      return ok(reply, templates);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/notification-templates', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(notificationTemplateSchema, request.body);
      const template = await prisma.notificationTemplate.create({
        data: {
          organizationId: req.user.organizationId,
          name: input.name,
          channel: input.channel,
          event: input.event,
          subject: input.subject || null,
          body: input.body,
          isActive: input.isActive ?? true,
        },
      });
      await logActivity(req, 'CREATE', 'NOTIFICATION_TEMPLATE', template.id);
      return ok(reply, template, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/notification-templates/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(notificationTemplateSchema, request.body);
      const existing = await prisma.notificationTemplate.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Plantilla no encontrada');
      const template = await prisma.notificationTemplate.update({
        where: { id },
        data: {
          name: input.name,
          channel: input.channel,
          event: input.event,
          subject: input.subject || null,
          body: input.body,
          isActive: input.isActive ?? existing.isActive,
        },
      });
      await logActivity(req, 'UPDATE', 'NOTIFICATION_TEMPLATE', id);
      return ok(reply, template);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/notification-templates/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.notificationTemplate.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Plantilla no encontrada');
      await prisma.notificationTemplate.delete({ where: { id } });
      await logActivity(req, 'DELETE', 'NOTIFICATION_TEMPLATE', id);
      return ok(reply, { deleted: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Envio manual (canal interno)
  app.post('/notifications/send', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(sendNotificationSchema, request.body);
      const member = await prisma.member.findFirst({
        where: { id: input.memberId, organizationId: req.user.organizationId },
      });
      if (!member) throw new HttpError(404, 'Socio no encontrado');
      await notifyEvent(req.user.organizationId, member.id, input.event, {
        member,
        message: input.body || '',
      });
      await logActivity(req, 'SEND', 'NOTIFICATION', undefined, undefined, { member: member.id, event: input.event });
      return ok(reply, { sent: true }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Recordatorios automaticos de cuotas por vencer/vencidas
  app.post('/notifications/generate-reminders', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const body = (request.body ?? {}) as { days?: number };
      const days = Math.max(1, Math.min(15, Number(body.days || 3)));
      const created = await generateReminders(req.user.organizationId, days);
      await logActivity(req, 'GENERATE', 'NOTIFICATION', undefined, undefined, { created, days });
      return ok(reply, { created, days });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default notificationRoutes;