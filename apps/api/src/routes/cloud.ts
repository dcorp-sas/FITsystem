import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { getCloudConfig, runCloudSync, runCloudPull, connectCloud, disconnectCloud } from '../services/cloud-sync.js';

const connectSchema = z
  .object({
    url: z.string().url(),
    organizationName: z.string().min(1).max(120),
    slug: z.string().min(2).max(60).optional(),
    currency: z.string().length(3).optional(),
    key: z.string().min(8).optional(),
  })
  .refine((v) => Boolean(v.key) || v.organizationName.trim().length > 0, {
    message: 'Falta el nombre del gimnasio',
  });

function asHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  return new HttpError(400, error instanceof Error ? error.message : 'Error de sincronizacion');
}

export function cloudRoutes(app: FastifyInstance) {
  const auth = app.authenticate;
  const admin = app.requireRoles(['OWNER', 'ADMIN']);

  app.get('/cloud/status', { onRequest: [auth] }, async (_request, reply) => {
    try {
      const cfg = await getCloudConfig();
      return ok(reply, {
        connected: cfg.connected,
        url: cfg.url,
        lastSyncAt: cfg.lastSyncAt,
        lastError: cfg.lastError,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/cloud/connect', { onRequest: [auth, admin] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(connectSchema, request.body);
      const result = await connectCloud({
        ...input,
        organizationName: input.organizationName || req.user.name,
      });
      return ok(reply, result);
    } catch (error) {
      return fail(reply, asHttpError(error));
    }
  });

  app.post('/cloud/sync', { onRequest: [auth, admin] }, async (_request, reply) => {
    try {
      const pushed = await runCloudSync();
      const pulled = await runCloudPull();
      return ok(reply, { pushed, pulled });
    } catch (error) {
      return fail(reply, asHttpError(error));
    }
  });

  app.post('/cloud/disconnect', { onRequest: [auth, admin] }, async (_request, reply) => {
    try {
      const result = await disconnectCloud();
      return ok(reply, result);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default cloudRoutes;
