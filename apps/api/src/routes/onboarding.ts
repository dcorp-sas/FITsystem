import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ok, fail, validate, type AuthedRequest } from '../lib/http.js';
import { getRawSetting, upsertSettings } from '../services/settings.js';
import { onboardingToggleSchema } from '@fitsystem/validators';

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  hint?: string;
}

/**
 * Onboarding guiado: checklists de configuracion que se calculan a partir del
 * estado real (integraciones, catalogos) y se pueden marcar manualmente.
 */
export function onboardingRoutes(app: FastifyInstance) {
  app.get('/onboarding', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;

      const [mpToken, arcaCuit, arcaPtoVta, arcaCert, waToken, waAlias, printDest, printPrinter, printPoint] = await Promise.all([
        getRawSetting(orgId, 'MERCADOPAGO', 'ACCESS_TOKEN'),
        getRawSetting(orgId, 'ARCA', 'CUIT'),
        getRawSetting(orgId, 'ARCA', 'PTO_VENTA'),
        getRawSetting(orgId, 'ARCA', 'CERT'),
        getRawSetting(orgId, 'WHATSAPP', 'CLOUD_TOKEN'),
        getRawSetting(orgId, 'WHATSAPP', 'TRANSFER_ALIAS'),
        getRawSetting(orgId, 'PRINT', 'DEST_URL'),
        getRawSetting(orgId, 'PRINT', 'PRINTER_NAME'),
        getRawSetting(orgId, 'PRINT', 'DESTINATION'),
      ]);

      const [members, plans, payments] = await prisma.$transaction([
        prisma.member.count({ where: { organizationId: orgId } }),
        prisma.plan.count({ where: { organizationId: orgId } }),
        prisma.payment.count({ where: { organizationId: orgId } }),
      ]);

      const item = (key: string, title: string, description: string, done: boolean, hint?: string): ChecklistItem => ({
        key,
        title,
        description,
        done,
        hint,
      });

      const items: ChecklistItem[] = [
        item('mercadopago', 'Conectar MercadoPago', 'Carga el Access Token para cobrar con QR y Point.', Boolean(mpToken), 'Ajustes > MercadoPago'),
        item('arca', 'Configurar ARCA', 'Define CUIT, punto de venta y certificado para facturar.', Boolean(arcaCuit && arcaPtoVta), 'Ajustes > ARCA'),
        item('arcaCert', 'Cargar certificado fiscal', 'Subi el certificado (.p12 o PEM) para emitir comprobantes reales.', Boolean(arcaCert), 'Ajustes > ARCA'),
        item('whatsapp', 'Conectar WhatsApp', 'Carga el token de WhatsApp Cloud o un alias de transferencia.', Boolean(waToken || waAlias), 'Ajustes > WhatsApp'),
        item('printer', 'Configurar impresora', 'Elegi destino de impresion: red, terminal Point o ambas.', Boolean((printDest || printPrinter) && printPoint), 'Ajustes > Impresion'),
        item('plan', 'Crear un plan', 'Carga al menos un plan de cuota.', plans >= 1, 'Planes'),
        item('member', 'Dar de alta un socio', 'Importa o crea tu primer socio.', members >= 1, 'Socios'),
        item('payment', 'Registrar un cobro', 'Cobra una cuota para probar el flujo completo.', payments >= 1, 'Pagos'),
      ];

      // Merge con marcas manuales guardadas en GENERAL.ONBOARDING_<key>.
      for (const it of items) {
        const manual = await getRawSetting(orgId, 'GENERAL', `ONBOARDING_${it.key}`);
        if (manual === 'true') it.done = true;
        else if (manual === 'false') it.done = false;
      }

      const done = items.filter((i) => i.done).length;
      return ok(reply, { items, done, total: items.length, completed: done === items.length });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/onboarding/toggle', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(onboardingToggleSchema, request.body);
      await upsertSettings(req.user.organizationId, 'GENERAL', { [`ONBOARDING_${input.key}`]: input.done ? 'true' : 'false' });
      return ok(reply, { key: input.key, done: input.done });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default onboardingRoutes;
