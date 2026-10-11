import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { branchSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';

export function branchRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/branches', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const branches = await prisma.branch.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: true, memberships: true } } },
      });
      return ok(reply, branches);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/branches', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(branchSchema, request.body);
      const branch = await prisma.branch.create({
        data: { organizationId: req.user.organizationId, ...input },
      });
      await logActivity(req, 'CREATE', 'BRANCH', branch.id);
      return ok(reply, branch, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/branches/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(branchSchema, request.body);
      const branch = await prisma.branch.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!branch) throw new HttpError(404, 'Sede no encontrada');
      const updated = await prisma.branch.update({ where: { id }, data: input });
      await logActivity(req, 'UPDATE', 'BRANCH', id);
      return ok(reply, updated);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default branchRoutes;