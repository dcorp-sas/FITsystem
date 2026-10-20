import type { FastifyInstance, FastifyRequest } from 'fastify';
import { contactSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError } from '../lib/http.js';
import { sendPlatformEmail, isPlatformEmailConfigured } from '../services/platform-email.js';
import { prisma } from '../db.js';
import { env } from '../env.js';

/** Límite simple en memoria por IP para el formulario público (5 en 10 min). */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(req: FastifyRequest): boolean {
  const ip = req.ip || 'desconocido';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (now - (times[times.length - 1] ?? 0) > WINDOW_MS) hits.delete(key);
  }
  return recent.length > MAX_PER_WINDOW;
}

export function contactRoutes(app: FastifyInstance) {
  // Formulario de contacto del sitio público. Sin autenticación ni licencia.
  app.post('/contact', async (request, reply) => {
    try {
      const input = validate(contactSchema, request.body);
      // Honeypot: si viene completo, es un bot; respondemos OK y no enviamos.
      if (input.company) return ok(reply, { ok: true });
      if (rateLimited(request)) throw new HttpError(429, 'Demasiados mensajes seguidos. Esperá unos minutos.');
      if (!isPlatformEmailConfigured()) {
        throw new HttpError(503, 'El contacto no está disponible en este momento. Escribinos a ' + env.PLATFORM_CONTACT_TO);
      }

      const lines = [
        'Nueva consulta desde el sitio:',
        `- Nombre: ${input.name}`,
        `- Email: ${input.email}`,
        input.phone ? `- Teléfono: ${input.phone}` : '',
        input.gymName ? `- Gimnasio: ${input.gymName}` : '',
        '',
        input.message,
      ].filter(Boolean);

      // Se persiste ANTES de enviar: una consulta no se pierde si el mail falla.
      await prisma.lead
        .create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            gymName: input.gymName || null,
            message: input.message,
            stage: 'nuevo',
            source: 'sitio',
          },
        })
        .catch(() => null);

      const result = await sendPlatformEmail(env.PLATFORM_CONTACT_TO, `Consulta web de ${input.name}`, lines.join('\n'));
      if (!result.ok) {
        throw new HttpError(502, 'No pudimos enviar tu mensaje. Escribinos a ' + env.PLATFORM_CONTACT_TO);
      }
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default contactRoutes;
