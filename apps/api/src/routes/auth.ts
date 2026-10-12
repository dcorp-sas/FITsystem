import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { loginSchema, registerOrgSchema, changePasswordSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { slugify } from '@fitsystem/utils';
import { logActivity } from '../lib/activity.js';

const publicUser = (u: {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  branchId: string | null;
}) => u;

export function authRoutes(app: FastifyInstance) {
  // Registro de una organizacion (gimnasio) completa
  app.post('/auth/register', { onRequest: [rateLimit({ max: 5, windowMs: 60 * 60 * 1000, keyPrefix: 'register' })] }, async (request, reply) => {
    try {
      const input = validate(registerOrgSchema, request.body);
      const exists = await prisma.organization.findUnique({ where: { slug: input.slug } });
      if (exists) throw new HttpError(409, 'El nombre corto ya esta en uso');

      const org = await prisma.organization.create({
        data: {
          name: input.organizationName,
          slug: input.slug,
          currency: input.currency,
        },
      });

      const branch = await prisma.branch.create({
        data: {
          organizationId: org.id,
          name: 'Sede Central',
          code: 'SC',
        },
      });

      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await prisma.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          name: input.userName,
          email: input.email,
          passwordHash,
          role: 'OWNER',
        },
      });

      const token = app.jwt.sign({ sub: user.id });
      await logActivity(
        {
          user: { id: user.id, organizationId: org.id, branchId: branch.id, name: user.name, email: user.email, role: user.role },
        } as unknown as AuthedRequest,
        'LOGIN',
        'USER',
        user.id,
      );

      return ok(reply, {
        token,
        user: publicUser(user),
        organization: { id: org.id, name: org.name, slug: org.slug, currency: org.currency },
        branch,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/login', { onRequest: [rateLimit({ max: 10, windowMs: 5 * 60 * 1000, keyPrefix: 'login' })] }, async (request, reply) => {
    try {
      const input = validate(loginSchema, request.body);
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user || !user.isActive) throw new HttpError(401, 'Credenciales invalidas');

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new HttpError(401, 'Credenciales invalidas');

      const token = app.jwt.sign({ sub: user.id });
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
      const branches = await prisma.branch.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        orderBy: { name: 'asc' },
      });

      await logActivity(
        { user: { id: user.id, organizationId: user.organizationId, branchId: user.branchId, name: user.name, email: user.email, role: user.role } } as unknown as AuthedRequest,
        'LOGIN',
        'USER',
        user.id,
      );

      return ok(reply, {
        token,
        user: publicUser(user),
        organization: { id: org?.id, name: org?.name, slug: org?.slug, currency: org?.currency },
        branches,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cambio de contrasena del propio usuario autenticado
  app.post('/auth/change-password', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(changePasswordSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new HttpError(400, 'La contrasena actual no es correcta');
      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      await logActivity(req, 'UPDATE', 'USER', user.id, undefined, { action: 'change_password' });
      return ok(reply, { changed: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Datos de sesion del usuario autenticado
  app.get('/auth/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const branches = await prisma.branch.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { name: 'asc' },
      });
      return ok(reply, { user: req.user, organization: org, branches });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default authRoutes;