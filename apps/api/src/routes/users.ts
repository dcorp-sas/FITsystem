import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { userSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { assertBranchInOrg } from '../lib/scope.js';
import { logActivity } from '../lib/activity.js';

export function userRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/users', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const users = await prisma.user.findMany({
        where: { organizationId: req.user.organizationId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          branchId: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      });
      return ok(reply, users);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/users', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(userSchema, request.body);
      if (!input.password) throw new HttpError(400, 'Contrasena requerida');
      if (input.role === 'OWNER' && req.user.role !== 'OWNER') throw new HttpError(403, 'Solo un OWNER puede asignar el rol OWNER');
      if (input.branchId) await assertBranchInOrg(req.user.organizationId, input.branchId);
      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await prisma.user.create({
        data: {
          organizationId: req.user.organizationId,
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
          role: input.role,
          branchId: input.branchId || null,
          phone: input.phone || null,
        },
      });
      await logActivity(req, 'CREATE', 'USER', user.id);
      return ok(
        reply,
        { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId },
        201,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/users/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(userSchema, request.body);
      const existing = await prisma.user.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Usuario no encontrado');
      if (input.role === 'OWNER' && req.user.role !== 'OWNER') throw new HttpError(403, 'Solo un OWNER puede asignar el rol OWNER');
      if (input.branchId) await assertBranchInOrg(req.user.organizationId, input.branchId);

      const data: Record<string, unknown> = {
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        branchId: input.branchId || null,
        phone: input.phone || null,
        isActive: input.isActive ?? existing.isActive,
      };
      if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

      const user = await prisma.user.update({ where: { id }, data });
      await logActivity(req, 'UPDATE', 'USER', id);
      return ok(reply, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        isActive: user.isActive,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default userRoutes;