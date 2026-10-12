import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { newsPostSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { assertBranchInOrg } from '../lib/scope.js';
import { logActivity } from '../lib/activity.js';

export function newsRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/news', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const items = await prisma.newsPost.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { publishedAt: 'desc' },
      });
      return ok(reply, { items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/news/:id', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const post = await prisma.newsPost.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!post) throw new HttpError(404, 'Novedad no encontrada');
      return ok(reply, post);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/news', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(newsPostSchema, request.body);
      if (input.branchId) await assertBranchInOrg(req.user.organizationId, input.branchId);
      const post = await prisma.newsPost.create({
        data: {
          organizationId: req.user.organizationId,
          branchId: input.branchId || req.user.branchId || null,
          title: input.title,
          body: input.body,
          imageUrl: input.imageUrl || null,
          isPublished: input.isPublished ?? true,
          expiresAt: input.expiresAt || null,
          publishedAt: new Date(),
          createdById: req.user.id,
        },
      });
      await logActivity(req, 'CREATE', 'NEWS', post.id, undefined, { title: post.title });
      return ok(reply, post, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/news/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(newsPostSchema, request.body);
      const existing = await prisma.newsPost.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Novedad no encontrada');
      const post = await prisma.newsPost.update({
        where: { id },
        data: {
          branchId: input.branchId || null,
          title: input.title,
          body: input.body,
          imageUrl: input.imageUrl || null,
          isPublished: input.isPublished ?? existing.isPublished,
          expiresAt: input.expiresAt || null,
        },
      });
      await logActivity(req, 'UPDATE', 'NEWS', id, existing, post);
      return ok(reply, post);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/news/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.newsPost.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!existing) throw new HttpError(404, 'Novedad no encontrada');
      await prisma.newsPost.delete({ where: { id } });
      await logActivity(req, 'DELETE', 'NEWS', id);
      return ok(reply, { deleted: true });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default newsRoutes;
