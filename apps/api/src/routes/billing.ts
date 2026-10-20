import type { FastifyInstance } from 'fastify';
import { checkoutSchema, embeddedPaymentSchema, subscriptionSchema, subscriptionRefSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import {
  PLAN_CATALOG,
  PRODUCT_CATALOG,
  isBillingConfigured,
  createPurchase,
  payPurchase,
  fulfillPurchase,
  verifyPlatformWebhookSignature,
} from '../services/billing.js';
import {
  createSubscription,
  subscriptionStatus,
  cancelSubscription,
  reactivateSubscription,
  syncPreapproval,
  syncAuthorizedPayment,
} from '../services/subscriptions.js';
import { isLicensorIssueConfigured, testLicensorLogin } from '../services/licensing-client.js';

export function billingRoutes(app: FastifyInstance) {
  // Catálogo de planes y productos de la tienda (público). Una sola fuente de verdad.
  app.get('/billing/plans', async (request, reply) => {
    const { licensorTest } = (request.query ?? {}) as { licensorTest?: string };
    return ok(reply, {
      currency: 'ARS',
      configured: isBillingConfigured(),
      licenseIssueConfigured: isLicensorIssueConfigured(),
      licenseServerConfigured: Boolean(env.LICENSE_SERVER),
      licensorPassConfigured: Boolean(env.LICENSOR_ADMIN_PASS),
      ...(licensorTest ? { licensorLogin: await testLicensorLogin() } : {}),
      publicKey: isBillingConfigured() ? env.PLATFORM_MP_PUBLIC_KEY : '',
      plans: Object.entries(PLAN_CATALOG).map(([tag, plan]) => ({ tag, ...plan })),
      products: Object.entries(PRODUCT_CATALOG).map(([tag, product]) => ({ tag, ...product })),
    });
  });

  // Registra una compra pendiente. El pago (con tarjeta) se procesa en /billing/pay.
  app.post('/billing/checkout', async (request, reply) => {
    try {
      const input = validate(checkoutSchema, request.body);
      const result = await createPurchase(input);
      if (!result.ok || !result.externalRef) throw new HttpError(502, result.error || 'No se pudo registrar la compra');
      return ok(reply, { externalRef: result.externalRef, amount: result.amount, purchaseId: result.purchaseId });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Procesa el pago embebido: recibe el token del Card Payment Brick y cobra.
  app.post('/billing/pay', async (request, reply) => {
    try {
      const input = validate(embeddedPaymentSchema, request.body);
      const result = await payPurchase(input);
      if (!result.ok) throw new HttpError(402, result.error || 'No se pudo procesar el pago');
      return ok(reply, { status: result.status, statusDetail: result.statusDetail, paymentId: result.paymentId });
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

  // Alta de suscripción mensual (carrito: plan + packs de asientos). Devuelve el
  // init_point de MercadoPago para autorizar el débito recurrente.
  app.post('/billing/subscribe', async (request, reply) => {
    try {
      const input = validate(subscriptionSchema, request.body);
      const result = await createSubscription(input);
      if (!result.ok || !result.externalRef) throw new HttpError(502, result.error || 'No se pudo crear la suscripción');
      return ok(reply, { externalRef: result.externalRef, initPoint: result.initPoint, amount: result.amount });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Estado de una suscripción (para la página de retorno).
  app.get('/billing/subscription/:ref', async (request, reply) => {
    try {
      const { ref } = request.params as { ref: string };
      const status = await subscriptionStatus(ref);
      if (!status) throw new HttpError(404, 'Suscripción no encontrada');
      return ok(reply, status);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Suscripción de la organización del gym (panel: sección Licencia).
  app.get('/billing/subscription', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const sub = await prisma.planSubscription.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) return ok(reply, { hasSubscription: false });
      return ok(reply, {
        hasSubscription: true,
        externalRef: sub.externalRef,
        plan: sub.plan,
        period: sub.period,
        seats: sub.seats,
        seatPacks: sub.seatPacks,
        amount: sub.amount,
        currency: sub.currency,
        status: sub.status,
        nextPaymentAt: sub.nextPaymentAt,
        lastPaymentAt: sub.lastPaymentAt,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Baja: cancela la suscripción en MercadoPago (sigue activa hasta el fin del período).
  app.post('/billing/subscription/cancel', { onRequest: [app.authenticate, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const sub = await prisma.planSubscription.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) throw new HttpError(404, 'No hay una suscripción para dar de baja');
      const result = await cancelSubscription(sub.externalRef);
      if (!result.ok) throw new HttpError(502, result.error || 'No se pudo dar de baja la suscripción');
      return ok(reply, { cancelled: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Reactivación: crea un nuevo débito y devuelve el init_point para autorizarlo.
  app.post('/billing/subscription/reactivate', { onRequest: [app.authenticate, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const sub = await prisma.planSubscription.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) throw new HttpError(404, 'No hay una suscripción para reactivar');
      const result = await reactivateSubscription(sub.externalRef);
      if (!result.ok) throw new HttpError(502, result.error || 'No se pudo reactivar la suscripción');
      return ok(reply, { initPoint: result.initPoint, externalRef: result.externalRef });
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

      // Suscripciones (débito automático): alta/baja del preapproval y cada cobro.
      const type = (body.type ?? '').toLowerCase();
      if (type === 'subscription_preapproval') {
        await syncPreapproval(paymentId);
        return ok(reply, { received: true, subscription: true });
      }
      if (type === 'subscription_authorized_payment') {
        await syncAuthorizedPayment(paymentId);
        return ok(reply, { received: true, payment: true });
      }

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
