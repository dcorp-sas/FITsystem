import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, ok, fail } from '../lib/http.js';
import { prisma } from '../db.js';
import { requireProviderToken } from './provider.js';

/*
 * CRM del proveedor: consultas del formulario de contacto del sitio y su
 * pipeline comercial. Se protege con el mismo token compartido del respaldo
 * (PROVIDER_BACKUP_TOKEN, header x-provider-token) porque lo consume el Panel
 * de control del proveedor, no los gimnasios.
 *
 * stage: nuevo | contactado | propuesta | cerrado | perdido
 */

const STAGES = ['nuevo', 'contactado', 'propuesta', 'cerrado', 'perdido'];

interface LeadInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  gymName?: unknown;
  message?: unknown;
  stage?: unknown;
  source?: unknown;
  notes?: unknown;
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function leadRoutes(app: FastifyInstance) {
  // Listado + conteo por etapa para el tablero del panel.
  app.get('/leads', async (request: FastifyRequest, reply) => {
    try {
      requireProviderToken(request);
      const query = request.query as { stage?: string; limit?: string };
      const stage = query.stage && STAGES.includes(query.stage) ? query.stage : undefined;
      const limit = Math.min(Number(query.limit) || 200, 500);
      const [leads, grouped] = await Promise.all([
        prisma.lead.findMany({ where: stage ? { stage } : {}, orderBy: { createdAt: 'desc' }, take: limit }),
        prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
      ]);
      const byStage: Record<string, number> = {};
      for (const row of grouped) byStage[row.stage] = row._count._all;
      return ok(reply, { leads, byStage, stages: STAGES });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Crea un lead manual (por ejemplo desde una consulta telefónica).
  app.post('/leads', async (request: FastifyRequest, reply) => {
    try {
      requireProviderToken(request);
      const input = (request.body ?? {}) as LeadInput;
      const name = String(input.name ?? '').trim();
      const email = String(input.email ?? '').trim().toLowerCase();
      if (!name) throw new HttpError(400, 'Falta el nombre');
      if (!email || !emailOk(email)) throw new HttpError(400, 'Email inválido');
      const stage = STAGES.includes(String(input.stage)) ? String(input.stage) : 'nuevo';
      const lead = await prisma.lead.create({
        data: {
          name,
          email,
          phone: input.phone ? String(input.phone).trim() : null,
          gymName: input.gymName ? String(input.gymName).trim() : null,
          message: input.message ? String(input.message).trim() : null,
          notes: input.notes ? String(input.notes).trim() : null,
          stage,
          source: 'manual',
        },
      });
      return ok(reply, { lead });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cambia la etapa del pipeline y/o agrega notas de seguimiento.
  app.patch('/leads/:id', async (request: FastifyRequest, reply) => {
    try {
      requireProviderToken(request);
      const { id } = request.params as { id: string };
      const input = (request.body ?? {}) as LeadInput;
      const existing = await prisma.lead.findUnique({ where: { id } });
      if (!existing) throw new HttpError(404, 'Lead no encontrado');
      const data: Record<string, string | null> = {};
      if (input.stage !== undefined) {
        if (!STAGES.includes(String(input.stage))) throw new HttpError(400, 'Etapa inválida');
        data.stage = String(input.stage);
      }
      if (input.notes !== undefined) data.notes = input.notes === null ? null : String(input.notes);
      if (!Object.keys(data).length) throw new HttpError(400, 'Nada para actualizar');
      const lead = await prisma.lead.update({ where: { id }, data });
      return ok(reply, { lead });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default leadRoutes;
