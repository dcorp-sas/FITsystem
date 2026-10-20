import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { HttpError, fail } from '../lib/http.js';
import { env } from '../env.js';
import { prisma } from '../db.js';

/*
 * Respaldo remoto del Licensador. El servicio de licencias del proveedor corre
 * en el plan free de Render, con disco EFÍMERO: al reiniciarse pierde licencias,
 * asientos y revocaciones. Aquí guardamos su último snapshot en Postgres (durable)
 * y el Licensador lo restaura al arrancar.
 *
 * El acceso se protege con un token compartido (PROVIDER_BACKUP_TOKEN) que viaja
 * en el header x-provider-token. Sin token configurado, el endpoint no existe.
 */

const SNAPSHOT_KEY = 'licensador';
const MAX_PAYLOAD = 5_000_000;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function requireProviderToken(request: FastifyRequest) {
  if (!env.PROVIDER_BACKUP_TOKEN) throw new HttpError(503, 'Respaldo remoto no configurado');
  const provided = request.headers['x-provider-token'];
  if (typeof provided !== 'string' || !safeEqual(provided, env.PROVIDER_BACKUP_TOKEN)) {
    throw new HttpError(403, 'No autorizado');
  }
}

export function providerRoutes(app: FastifyInstance) {
  // Devuelve el último snapshot del Licensador (lo consume él mismo al arrancar).
  app.get('/provider/backup', async (request, reply) => {
    try {
      requireProviderToken(request);
      const row = await prisma.providerBackup.findUnique({ where: { key: SNAPSHOT_KEY } });
      if (!row) return reply.status(404).send({ error: 'Not Found', message: 'Sin respaldo todavía' });
      return reply.status(200).send(JSON.parse(row.payload));
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Guarda el snapshot enviado por el Licensador.
  app.post('/provider/backup', async (request, reply) => {
    try {
      requireProviderToken(request);
      const body = request.body as { producto?: unknown } | undefined;
      if (!body || typeof body !== 'object' || body.producto !== 'fitsystem-licensador') {
        throw new HttpError(400, 'El cuerpo no es un respaldo del Licensador');
      }
      const payload = JSON.stringify(body);
      if (payload.length > MAX_PAYLOAD) throw new HttpError(413, 'Respaldo demasiado grande');
      await prisma.providerBackup.upsert({
        where: { key: SNAPSHOT_KEY },
        create: { key: SNAPSHOT_KEY, payload },
        update: { payload },
      });
      return reply.status(200).send({ data: { ok: true, bytes: payload.length } });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default providerRoutes;
