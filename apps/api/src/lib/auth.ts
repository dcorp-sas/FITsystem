import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { HttpError } from './http.js';
import type { AuthedRequest, PortalAuthedRequest } from './http.js';

export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  const authenticate: preHandlerHookHandler = async (request, _reply) => {
    const req = request as AuthedRequest;
    try {
      const { sub } = await request.jwtVerify<{ sub: string }>();
      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user || !user.isActive) {
        throw new HttpError(401, 'Sesion invalida o usuario inactivo');
      }
      req.user = {
        id: user.id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(401, 'Token invalido o expirado');
    }
  };

  app.decorate('authenticate', authenticate);

  const authenticatePortal: preHandlerHookHandler = async (request, _reply) => {
    const req = request as PortalAuthedRequest;
    try {
      const payload = await request.jwtVerify<{ sub: string; typ?: string }>();
      if (payload.typ !== 'portal') throw new HttpError(401, 'Token invalido');
      const account = await prisma.portalAccount.findUnique({ where: { id: payload.sub } });
      if (!account || !account.isActive) {
        throw new HttpError(401, 'Cuenta inactiva o inexistente');
      }
      req.portalAccount = {
        id: account.id,
        organizationId: account.organizationId,
        memberId: account.memberId,
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(401, 'Token invalido o expirado');
    }
  };

  app.decorate('authenticatePortal', authenticatePortal);

  app.decorate('requireRoles', (roles: string[]): preHandlerHookHandler => {
    return async (request) => {
      const req = request as AuthedRequest;
      if (!req.user) throw new HttpError(401, 'No autenticado');
      if (!roles.includes(req.user.role)) {
        throw new HttpError(403, 'No tenes permisos para esta accion');
      }
    };
  });

  app.decorate('scopeBranch', async (request: FastifyRequest) => {
    const req = request as AuthedRequest;
    if (req.user.branchId) {
      request.body = { ...(request.body as object), branchId: req.user.branchId } as never;
    }
  });
}