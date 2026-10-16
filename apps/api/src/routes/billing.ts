import type { FastifyInstance } from 'fastify';
import { checkoutSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError } from '../lib/http.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import {
  PLAN_CATALOG,
  PRODUCT_CATALOG,
  isBillingConfigured,
  createCheckout,
  fulfillPurchase,
  verifyPlatformWebhookSignature,
} from '../services/billing.js';

export function billingRoutes(app: FastifyInstance) {
  // Catálogo de planes y productos de la tienda (público). Una sola fuente de verdad.
  app.get('/billing/plans', async (_request, reply) => {
    return ok(reply, {
      currency: 'ARS',
      configured: isBillingConfigured(),
      plans: Object.entries(PLAN_CATALOG).map(([tag, plan]) => ({ tag, ...plan })),
      products: Object.entries(PRODUCT_CATALOG).map(([tag, product]) => ({ tag, ...product })),
    });
  });

  // Inicia una compra: crea la preferencia de MercadoPago y devuelve el link.
  app.post('/billing/checkout', async (request, reply) => {
    try {
      const input = validate(checkoutSchema, request.body);
      const result = await createCheckout(input);
      if (!result.ok || !result.initPoint) throw new HttpError(502, result.error || 'No se pudo iniciar la compra');
      return ok(reply, { initPoint: result.initPoint, purchaseId: result.purchaseId, externalRef: result.externalRef });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Estado de una compra (para la página de retorno del sitio).
  app.get('/billing/purchase/:ref', async (request, reply) => {
    try {
      const { ref } = request.params as { ref: string };
      const purchase = await prisma.planPurchase.findUnique({ where: { externalRef: ref } });
      if (!purchase) throw new HttpError(404, 'Compra no encontrada');
      return ok(reply, {
        plan: purchase.plan,
        period: purchase.period,
        status: purchase.status,
        amount: purchase.amount,
        currency: purchase.currency,
        licenseKey: purchase.status === 'PAID' ? purchase.licenseKey : null,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Webhook público de MercadoPago de la cuenta del proveedor.
  app.post('/billing/webhook', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number } };
      const paymentId = body.data?.id != null ? String(body.data.id) : null;
      if (!paymentId) return ok(reply, { received: true });

      const sig = request.headers['x-signature'] as string | undefined;
      const reqId = request.headers['x-request-id'] as string | string[] | undefined;
      if (!verifyPlatformWebhookSignature(sig, reqId, paymentId)) {
        throw new HttpError(401, 'Firma de webhook inválida');
      }

      if (!env.PLATFORM_MP_ACCESS_TOKEN) return ok(reply, { received: true, pending: true });

      // Nunca completar sin confirmar el pago contra la API de MercadoPago.
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${env.PLATFORM_MP_ACCESS_TOKEN}` },
      });
      if (!res.ok) return ok(reply, { received: true, pending: true });
      const data = (await res.json()) as { status?: string; external_reference?: string | null };
      const externalRef = data.external_reference ?? null;
      if (!externalRef?.startsWith('FITP-')) return ok(reply, { received: true, matched: false });

      const purchase = await prisma.planPurchase.findUnique({ where: { externalRef } });
      if (!purchase) return ok(reply, { received: true, matched: false });

      const approved = data.status === 'approved';
      await prisma.planPurchase.update({
        where: { id: purchase.id },
        data: { providerPaymentId: paymentId, providerStatus: data.status ?? null },
      });
      if (approved) await fulfillPurchase(purchase.id);
      return ok(reply, { received: true, matched: true, approved });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default billingRoutes;
