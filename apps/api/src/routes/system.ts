import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ok, fail, validate, HttpError, type AuthedRequest } from '../lib/http.js';
import { upsertSettings } from '../services/settings.js';
import { getObservabilityConfig, pruneOldData, sendAlert } from '../services/observability.js';
import { observabilityUpdateSchema, retentionPurgeSchema } from '@fitsystem/validators';
import { logActivity } from '../lib/activity.js';

const ADMIN = ['OWNER', 'ADMIN'];

/**
 * Observabilidad integrada (errores en base + panel + webhook) y privacidad
 * (retencion/borrado y exportacion de datos por organizacion).
 */
export function systemRoutes(app: FastifyInstance) {
  // Lista de errores registrados (paginado y filtrable por nivel).
  app.get('/system/errors', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const q = request.query as { level?: string; limit?: string; offset?: string };
      const take = Math.min(200, Math.max(1, Number(q.limit) || 50));
      const skip = Math.max(0, Number(q.offset) || 0);
      const where = {
        organizationId: req.user.organizationId,
        ...(q.level ? { level: q.level } : {}),
      };
      const [items, total] = await prisma.$transaction([
        prisma.errorLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        prisma.errorLog.count({ where }),
      ]);
      return ok(reply, { items, total, limit: take, offset: skip });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Borra el historial de errores de la organizacion.
  app.delete('/system/errors', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const result = await prisma.errorLog.deleteMany({ where: { organizationId: req.user.organizationId } });
      await logActivity(req, 'DELETE', 'ERROR_LOG', null, undefined, { removed: result.count });
      return ok(reply, { removed: result.count });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Configuracion de observabilidad + resumen.
  app.get('/system/observability', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const cfg = await getObservabilityConfig(req.user.organizationId);
      const since = new Date(Date.now() - 7 * 86400000);
      const [errors7d, last] = await prisma.$transaction([
        prisma.errorLog.count({ where: { organizationId: req.user.organizationId, createdAt: { gte: since } } }),
        prisma.errorLog.findFirst({ where: { organizationId: req.user.organizationId }, orderBy: { createdAt: 'desc' } }),
      ]);
      return ok(reply, { ...cfg, errors7d, lastErrorAt: last?.createdAt ?? null });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Actualiza la configuracion de observabilidad.
  app.put('/system/observability', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(observabilityUpdateSchema, request.body);
      const values: Record<string, string> = {};
      if (input.OBS_WEBHOOK_URL !== undefined) values.OBS_WEBHOOK_URL = input.OBS_WEBHOOK_URL;
      if (input.OBS_ALERTS_ENABLED !== undefined) values.OBS_ALERTS_ENABLED = input.OBS_ALERTS_ENABLED;
      if (input.OBS_MIN_LEVEL !== undefined) values.OBS_MIN_LEVEL = input.OBS_MIN_LEVEL;
      if (input.OBS_RETENTION_DAYS !== undefined) values.OBS_RETENTION_DAYS = String(input.OBS_RETENTION_DAYS);
      if (Object.keys(values).length) await upsertSettings(req.user.organizationId, 'GENERAL', values);
      await logActivity(req, 'UPDATE', 'OBSERVABILITY', null, undefined, values);
      const cfg = await getObservabilityConfig(req.user.organizationId);
      return ok(reply, cfg);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Envia una alerta de prueba al webhook configurado.
  app.post('/system/observability/test', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const cfg = await getObservabilityConfig(req.user.organizationId);
      if (!cfg.webhookUrl) throw new HttpError(400, 'Configure la URL de webhook primero');
      const sent = await sendAlert(cfg.webhookUrl, { level: 'info', message: 'Alerta de prueba de FIT system™' });
      if (!sent) throw new HttpError(502, 'No se pudo enviar la alerta (verifique la URL)');
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Aplica la retencion de datos: borra logs/actividad/notificaciones viejos.
  app.post('/system/retention/purge', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(retentionPurgeSchema, request.body ?? {});
      const cfg = await getObservabilityConfig(req.user.organizationId);
      const days = input.retentionDays ?? cfg.retentionDays;
      const result = await pruneOldData(req.user.organizationId, days);
      await logActivity(req, 'DELETE', 'RETENTION', null, undefined, { days, ...result });
      return ok(reply, { retentionDays: days, ...result });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Exportacion completa de los datos de la organizacion (portabilidad/privacidad).
  app.get('/org/export', { onRequest: [app.authenticate, app.requireRoles(ADMIN)] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const [organization, branches, users, members, plans, memberships, payments, products, sales, cashSessions, cashMovements, attendance] =
        await prisma.$transaction([
          prisma.organization.findUnique({ where: { id: orgId } }),
          prisma.branch.findMany({ where: { organizationId: orgId } }),
          prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } }),
          prisma.member.findMany({ where: { organizationId: orgId } }),
          prisma.plan.findMany({ where: { organizationId: orgId } }),
          prisma.membership.findMany({ where: { organizationId: orgId } }),
          prisma.payment.findMany({ where: { organizationId: orgId } }),
          prisma.product.findMany({ where: { organizationId: orgId } }),
          prisma.sale.findMany({ where: { organizationId: orgId } }),
          prisma.cashSession.findMany({ where: { organizationId: orgId } }),
          prisma.cashMovement.findMany({ where: { organizationId: orgId } }),
          prisma.attendance.findMany({ where: { organizationId: orgId } }),
        ]);
      await logActivity(req, 'EXPORT', 'ORGANIZATION', orgId, undefined, {});
      return ok(reply, {
        exportedAt: new Date().toISOString(),
        organization,
        branches,
        users,
        members,
        plans,
        memberships,
        payments,
        products,
        sales,
        cashSessions,
        cashMovements,
        attendance,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default systemRoutes;
