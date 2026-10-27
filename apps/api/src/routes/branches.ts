import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ok, fail, type AuthedRequest } from '../lib/http.js';

export function branchRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/branches', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const branch = await prisma.branch.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { members: true, memberships: true } } },
      });
      return ok(reply, branch ? [branch] : []);
    } catch (error) {
      return fail(reply, error);
    }
  });

}

export default branchRoutes;
