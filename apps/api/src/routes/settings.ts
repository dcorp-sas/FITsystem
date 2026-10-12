import type { FastifyInstance } from 'fastify';
import { settingsUpsertSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { getSettings, upsertSettings } from '../services/settings.js';

const SECRET_KEYS = ['ACCESS_TOKEN', 'SECRET', 'PASSPHRASE', 'PRIVATE_KEY', 'API_KEY', 'TOKEN', 'PASS', 'PASSWORD'];

export function settingsRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get('/settings', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const settings = await getSettings(req.user.organizationId);
      return ok(reply, settings);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/settings/:category', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { category } = request.params as { category: string };
      const input = validate(settingsUpsertSchema, request.body);
      if (input.category !== category.toUpperCase()) throw new HttpError(400, 'Categoria invalida');

      const secrets = Object.keys(input.values).filter((k) => {
        const kk = k.toUpperCase();
        return SECRET_KEYS.some((s) => kk.includes(s)) || kk === 'ACCESS_TOKEN' || kk === 'PRIVATE_KEY' || kk === 'CERT' || kk === 'API_SECRET';
      });
      const updated = await upsertSettings(req.user.organizationId, input.category, input.values, secrets);
      await logActivity(req, 'UPDATE', 'SETTINGS', input.category, undefined, { category: input.category, keys: Object.keys(input.values) });
      return ok(reply, updated);
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default settingsRoutes;