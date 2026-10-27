import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { organizationUpdateSchema } from '@fitsystem/validators';
import { validate, ok, fail, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';

export function orgRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/org', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const branch = await prisma.branch.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'asc' },
      });
      const canSeeUsers = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role);
      const users = canSeeUsers
        ? await prisma.user.findMany({
            where: { organizationId: req.user.organizationId },
            select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true, lastLoginAt: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return ok(reply, { organization: org, branches: branch ? [branch] : [], users });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/org', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(organizationUpdateSchema, request.body);
      const org = await prisma.organization.update({
        where: { id: req.user.organizationId },
        data: { ...input, taxId: input.taxId || null },
      });
      await logActivity(req, 'UPDATE', 'ORGANIZATION', org.id);
      return ok(reply, org);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Trazabilidad: historico de actividad
  app.get('/org/activity', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const logs = await prisma.activityLog.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { user: { select: { name: true, email: true } } },
      });
      return ok(reply, logs);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default orgRoutes;
