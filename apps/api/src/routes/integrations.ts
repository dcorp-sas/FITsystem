import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { mpQrCreateSchema, mpPointCreateSchema, arcaInvoiceSchema, arcaCreditNoteSchema, arcaPointOfSaleSchema, mpPointPollSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { getRawSetting, getSettings } from '../services/settings.js';
import { notifyEvent } from '../services/notifications.js';
import { whatsappLink } from '../services/whatsapp.js';
import {
  connectWhatsApp,
  getWhatsAppStatusEnsuring,
  logoutWhatsApp,
  sendWhatsAppLinked,
} from '../services/whatsapp-client.js';
import { getSmtpConfig } from '../services/email.js';
import {
  getArcaConfig,
  arcaEmitir,
  arcaEmitirNotaCredito,
  arcaTest,
  arcaDummy,
  resolveCbteTipo,
  resolveCreditNoteTipo,
  CBTE_LABEL,
} from '../services/arca.js';
import { getMpConfig, mpPing, getPosTerminals, createPointIntent, getPointIntent } from '../services/mercadopago.js';
import { printTicket, listPrinters, printTicketAuto, printViaPoint, buildReceiptTicket } from '../services/print.js';
import { env } from '../env.js';

/**
 * Verifica la firma `x-signature` de MercadoPago (formato `ts=...,v1=...`).
 * Manifiesto: `id:<dataId>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256.
 */
function verifyMpSignature(secret: string, header: string | undefined, requestId: string | string[] | undefined, dataId: string): boolean {
  if (!header) return false;
  const ts = /(?:^|,)ts=([^,]+)/.exec(header)?.[1];
  const v1 = /(?:^|,)v1=([^,]+)/.exec(header)?.[1];
  if (!ts || !v1) return false;
  const rid = Array.isArray(requestId) ? requestId[0] : requestId ?? '';
  const manifest = `id:${dataId};request-id:${rid};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Marca una orden de MercadoPago como cobrada: completa el pago, registra el
 * movimiento de caja, activa la membresia y notifica al socio. Idempotente.
 */
async function completeMpOrder(orgId: string, paymentId: string, userId?: string | null) {
  const order = await prisma.payment.findFirst({ where: { id: paymentId, organizationId: orgId } });
  if (!order) return null;
  if (order.status === 'COMPLETED') return order;

  const session = await prisma.cashSession.findFirst({
    where: { organizationId: orgId, branchId: order.branchId, status: 'OPEN' },
  });
  const [payment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', providerStatus: 'approved', paidAt: new Date() },
    }),
    prisma.cashMovement.create({
      data: {
        organizationId: orgId,
        branchId: order.branchId,
        cashSessionId: session?.id ?? null,
        type: 'INCOME',
        category: order.concept || 'MEMBERSHIP',
        method: order.method,
        amount: order.amount,
        description: `Cobro ${order.method} ${order.reference ?? ''}`.trim(),
        memberId: order.memberId,
        userId: userId ?? null,
        referenceId: order.id,
      },
    }),
  ]);

  if (order.membershipId) {
    await prisma.membership.update({ where: { id: order.membershipId }, data: { status: 'ACTIVE' } });
  }
  if (order.memberId) {
    const member = await prisma.member.findUnique({ where: { id: order.memberId } });
    if (member) await notifyEvent(orgId, member.id, 'PAYMENT_CONFIRMATION', { member, amount: order.amount });
  }

  if ((await getRawSetting(orgId, 'PRINT', 'PRINT_ON_PAYMENT')) === 'true') {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    let memberName: string | null = null;
    if (order.memberId) {
      const m = await prisma.member.findUnique({ where: { id: order.memberId } });
      memberName = m ? `${m.firstName} ${m.lastName}` : null;
    }
    await printTicketAuto(orgId, buildReceiptTicket({
      organization: org?.name ?? 'FIT system™',
      member: memberName,
      concept: order.concept,
      method: order.method,
      amount: order.amount,
      reference: order.invoiceNumber ?? order.reference,
      date: new Date(),
    }));
  }
  return payment;
}

/**
 * Marca una intencion de pago del portal (app de socios) como pagada: crea el
 * pago, registra el movimiento de caja, activa la membresia y notifica al socio.
 * Idempotente (si ya estaba PAID no hace nada).
 */
async function completeMpIntent(orgId: string, intentId: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, organizationId: orgId } });
  if (!intent) return null;
  if (intent.status === 'PAID') return intent;

  const member = await prisma.member.findUnique({ where: { id: intent.memberId } });
  const branchId = member?.branchId;
  let paymentId = intent.paidPaymentId ?? null;

  if (!paymentId && branchId) {
    const session = await prisma.cashSession.findFirst({
      where: { organizationId: orgId, branchId, status: 'OPEN' },
    });
    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: intent.memberId,
          membershipId: intent.membershipId,
          concept: intent.concept || 'MEMBERSHIP',
          method: 'MERCADOPAGO',
          status: 'COMPLETED',
          amount: intent.amount,
          currency: intent.currency,
          reference: intent.externalRef,
          providerId: intent.providerId,
          providerStatus: 'approved',
          providerData: JSON.stringify({ intentId: intent.id, source: 'PORTAL' }),
          paidAt: new Date(),
        },
      }),
      prisma.cashMovement.create({
        data: {
          organizationId: orgId,
          branchId,
          cashSessionId: session?.id ?? null,
          type: 'INCOME',
          category: intent.concept || 'MEMBERSHIP',
          method: 'MERCADOPAGO',
          amount: intent.amount,
          description: `Cobro online ${intent.externalRef ?? ''}`.trim(),
          memberId: intent.memberId,
          referenceId: intent.id,
        },
      }),
    ]);
    paymentId = payment.id;
  }

  if (intent.membershipId) {
    await prisma.membership.update({ where: { id: intent.membershipId }, data: { status: 'ACTIVE' } });
  }
  if (member) await notifyEvent(orgId, member.id, 'PAYMENT_CONFIRMATION', { member, amount: intent.amount });

  return prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PAID', paidPaymentId: paymentId },
  });
}

export function integrationRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Estado de configuracion de integraciones (sin secretos)
  app.get('/integrations/status', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const settings = await getSettings(req.user.organizationId);
      const mp = settings.MERCADOPAGO ?? {};
      const wa = settings.WHATSAPP ?? {};
      const waSession = await getWhatsAppStatusEnsuring(req.user.organizationId);
      const print = settings.PRINT ?? {};
      const smtp = await getSmtpConfig(req.user.organizationId);
      const arcaCfg = await getArcaConfig(req.user.organizationId);
      return ok(reply, {
        mercadopago: {
          configured: Boolean(mp.ACCESS_TOKEN || mp.PUBLIC_KEY || mp.POINT_ACCESS_TOKEN || mp.QR_ACCESS_TOKEN || mp.STATIC_QR_PAYLOAD),
          accessTokenMasked: mp.ACCESS_TOKEN || mp.POINT_ACCESS_TOKEN || mp.QR_ACCESS_TOKEN ? '****' : '',
          publicKey: mp.PUBLIC_KEY ?? mp.POINT_PUBLIC_KEY ?? '',
          hasStaticQr: Boolean(mp.STATIC_QR_PAYLOAD),
          pointEnabled: mp.POINT_ENABLED === 'true',
          pointDeviceId: mp.POINT_DEVICE_ID ?? '',
          hasPointToken: Boolean(mp.POINT_ACCESS_TOKEN),
          hasQrToken: Boolean(mp.QR_ACCESS_TOKEN),
          qrPosId: mp.QR_POS_ID ?? '',
          qrPosExternalId: mp.QR_POS_EXTERNAL_ID ?? '',
          qrFixedEnabled: mp.QR_FIXED_ENABLED === 'true',
        },
        arca: {
          configured: Boolean(arcaCfg.cuit && arcaCfg.ptoVta),
          enabled: arcaCfg.enabled,
          simulate: false,
          mode: arcaCfg.hasCert && arcaCfg.hasKey ? 'real' : 'mock',
          cuit: arcaCfg.cuit,
          puntoVenta: arcaCfg.ptoVta,
          environment: arcaCfg.entorno === 'produccion' ? 'PRODUCCION' : 'HOMOLOGACION',
          cbteTipo: arcaCfg.cbteTipo,
          cbteLabel: CBTE_LABEL[arcaCfg.cbteTipo] ?? String(arcaCfg.cbteTipo),
          creditNoteLabel: CBTE_LABEL[resolveCreditNoteTipo(arcaCfg)] ?? 'Nota de credito C',
          condicionReceptor: arcaCfg.condicionReceptor,
          hasCertificate: arcaCfg.hasCert,
          certSubject: arcaCfg.certSubject,
          certNotAfter: arcaCfg.certNotAfter,
        },
        whatsapp: {
          configured: Boolean(wa.BUSINESS_PHONE || wa.WA_URL_BASE),
          businessPhone: wa.BUSINESS_PHONE ?? '',
          waUrlBase: wa.WA_URL_BASE ?? 'https://wa.me',
          defaultMessage: wa.DEFAULT_MESSAGE ?? '',
          cloudConfigured: Boolean(wa.CLOUD_TOKEN && wa.PHONE_NUMBER_ID),
          useAutomation: wa.USE_AUTOMATION === 'true',
          linked: waSession.status === 'connected',
          connection: waSession.status,
          linkedNumber: waSession.linkedNumber ?? '',
        },
        print: {
          configured: Boolean(print.PRINTER_NAME || print.DEST_URL || print.POINT_DEVICE_ID),
          destination: print.DESTINATION ?? 'server',
          defaultPrinter: print.PRINTER_NAME ?? '',
          destUrl: print.DEST_URL ?? '',
          pointDeviceId: print.POINT_DEVICE_ID ?? '',
          ticketTemplate: print.TICKET_TEMPLATE ?? 'default',
          printOnPayment: print.PRINT_ON_PAYMENT === 'true',
        },
        email: {
          configured: Boolean(smtp),
          host: smtp?.host ?? '',
          port: smtp?.port ?? 587,
          from: smtp?.from ?? '',
        },
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Configuracion de MercadoPago (sin secretos) + estado de la conexion.
  app.get('/integrations/mercadopago/config', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const cfg = await getMpConfig(req.user.organizationId);
      let terminals: unknown[] = [];
      let terminalsError: string | null = null;
      if (cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken) {
        try {
          terminals = await getPosTerminals(cfg);
        } catch (err) {
          terminalsError = (err as Error).message;
        }
      }
      return ok(reply, {
        publicKey: cfg.publicKey,
        pointEnabled: cfg.pointEnabled,
        hasAccessToken: Boolean(cfg.accessToken),
        point: { hasToken: Boolean(cfg.point.accessToken), publicKey: cfg.point.publicKey, deviceId: cfg.point.deviceId },
        qr: { hasToken: Boolean(cfg.qr.accessToken), publicKey: cfg.qr.publicKey, posId: cfg.qr.posId, posExternalId: cfg.qr.posExternalId, fixedEnabled: cfg.qr.fixedEnabled },
        hasWebhookSecret: Boolean(cfg.webhookSecret),
        transferAlias: cfg.transferAlias,
        returnUrl: cfg.returnUrl,
        terminals,
        terminalsError,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Prueba de conexion con MercadoPago (users/me + terminales).
  app.post('/integrations/mercadopago/ping', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const cfg = await getMpConfig(req.user.organizationId);
      const result = await mpPing(cfg);
      return ok(reply, result);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Lista las terminales Point de la cuenta.
  app.get('/integrations/mercadopago/terminals', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const force = (request.query as { refresh?: string }).refresh === 'true';
      const cfg = await getMpConfig(req.user.organizationId);
      const terminals = await getPosTerminals(cfg, force);
      return ok(reply, terminals);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Enlace click-to-chat de WhatsApp (wa.me) para un socio o un telefono suelto.
  app.get('/integrations/whatsapp/link', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const q = request.query as { memberId?: string; message?: string; phone?: string };
      let phone = q.phone ?? '';
      if (!phone && q.memberId) {
        const member = await prisma.member.findFirst({
          where: { id: q.memberId, organizationId: req.user.organizationId },
        });
        phone = member?.phone ?? '';
      }
      const link = await whatsappLink(req.user.organizationId, phone, q.message ?? '');
      return ok(reply, { link, phone });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- WhatsApp: vinculación por QR (Baileys) ----------
  // Estado de la sesión vinculada; incluye el QR (data URL) mientras espera.
  app.get('/integrations/whatsapp/status', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const session = await getWhatsAppStatusEnsuring(req.user.organizationId);
      const qr = session.qr
        ? await QRCode.toDataURL(session.qr, { width: 512, margin: 1, color: { dark: '#0b1120', light: '#ffffff' } })
        : null;
      return ok(reply, { status: session.status, qr, linkedNumber: session.linkedNumber ?? '', error: session.lastError ?? '' });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Inicia la vinculación: genera el QR para escanear desde el teléfono.
  app.post('/integrations/whatsapp/connect', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const session = await connectWhatsApp(req.user.organizationId);
      const qr = session.qr
        ? await QRCode.toDataURL(session.qr, { width: 512, margin: 1, color: { dark: '#0b1120', light: '#ffffff' } })
        : null;
      return ok(reply, { status: session.status, qr, linkedNumber: session.linkedNumber ?? '', error: session.lastError ?? '' });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cierra la sesión vinculada y borra las credenciales.
  app.post('/integrations/whatsapp/logout', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const session = await logoutWhatsApp(req.user.organizationId);
      await logActivity(req, 'DELETE', 'WHATSAPP_SESSION', req.user.organizationId, undefined, {});
      return ok(reply, { status: session.status, qr: null, linkedNumber: '', error: '' });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Envía un mensaje de prueba por la sesión vinculada.
  app.post('/integrations/whatsapp/test', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const body = (request.body ?? {}) as { phone?: string; message?: string };
      const phone = body.phone || (await getRawSetting(req.user.organizationId, 'WHATSAPP', 'BUSINESS_PHONE')) || '';
      if (!phone) throw new HttpError(400, 'Indicá un número de teléfono');
      const message = body.message || 'Prueba de WhatsApp de FIT system™: la conexión funciona.';
      const result = await sendWhatsAppLinked(req.user.organizationId, phone, message);
      if (!result.ok) throw new HttpError(502, result.error ?? 'No se pudo enviar');
      await logActivity(req, 'CREATE', 'WHATSAPP_TEST', null, undefined, { phone });
      return ok(reply, { ok: true, providerId: result.providerId ?? null });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- MercadoPago: QR estatico ----------
  // Genera una imagen QR (PNG data URL) que se puede imprimir/mostrar.
  app.get('/integrations/mercadopago/static-qr', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { branchId?: string; amount?: string };
      const orgId = req.user.organizationId;
      const branchId = query.branchId || req.user.branchId || '';

      const configured = await getRawSetting(orgId, 'MERCADOPAGO', 'STATIC_QR_PAYLOAD');
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      const payload =
        configured ||
        `fitsystem://pay?org=${orgId}&branch=${branchId}&merchant=${encodeURIComponent(org?.name ?? 'FIT system™')}`;
      const amount = query.amount ? Number(query.amount) : undefined;
      const finalPayload = amount && amount > 0 ? `${payload}&amount=${amount}` : payload;

      const dataUrl = await QRCode.toDataURL(finalPayload, {
        width: 512,
        margin: 1,
        color: { dark: '#0b1120', light: '#ffffff' },
      });
      return ok(reply, { payload: finalPayload, image: dataUrl, branchId });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Genera un QR dinamico de cobro (equivalente a un "order" de MercadoPago)
  app.post('/integrations/mercadopago/qr', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(mpQrCreateSchema, request.body);
      const orgId = req.user.organizationId;
      const branchId = req.user.branchId;
      if (!branchId) throw new HttpError(400, 'Se necesita una sede');

      const orderId = `QR-${Date.now().toString(36).toUpperCase()}`;
      let payload = `fitsystem://pay?order=${orderId}&org=${orgId}&amount=${input.amount.toFixed(2)}&desc=${encodeURIComponent(input.description)}`;
      let providerId = orderId;
      let checkoutUrl: string | null = null;

      // Sin credenciales no se genera una orden: no se simula el cobro.
      const mpCfg = await getMpConfig(orgId);
      const accessToken = mpCfg.qr.accessToken || mpCfg.accessToken;
      if (!accessToken) {
        throw new HttpError(400, 'MercadoPago no configurado: cargá el Access Token para generar el QR');
      }

      const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ title: input.description, quantity: 1, unit_price: input.amount, currency_id: 'ARS' }],
          external_reference: input.externalReference ?? orderId,
          ...(env.PUBLIC_URL
            ? {
                notification_url: `${env.PUBLIC_URL}/api/integrations/mercadopago/webhook`,
                back_urls: { success: `${env.WEB_ORIGIN}/payments`, failure: `${env.WEB_ORIGIN}/payments`, pending: `${env.WEB_ORIGIN}/payments` },
                auto_return: 'approved',
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new HttpError(502, `MercadoPago rechazó la orden (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }
      const data = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
      checkoutUrl = data.init_point ?? data.sandbox_init_point ?? null;
      providerId = data.id ?? orderId;
      if (!checkoutUrl) throw new HttpError(502, 'MercadoPago no devolvió un link de pago');
      payload = checkoutUrl;

      const image = await QRCode.toDataURL(payload, { width: 512, margin: 1 });

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: input.memberId || null,
          membershipId: input.membershipId || null,
          concept: input.concept ?? 'MEMBERSHIP',
          method: 'MERCADOPAGO_QR',
          status: 'PENDING',
          amount: input.amount,
          reference: orderId,
          providerId,
          providerStatus: 'pending',
          providerData: JSON.stringify({ description: input.description, externalReference: input.externalReference, checkoutUrl, real: true }),
          receivedById: req.user.id,
          notes: `QR de cobro: ${input.description}`,
        },
      });
      await logActivity(req, 'CREATE', 'MP_QR_ORDER', payment.id, undefined, { orderId, amount: input.amount, real: true });
      return ok(reply, { orderId, payload, image, paymentId: payment.id, checkoutUrl, status: 'PENDING', real: true }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- MercadoPago: POINT (terminal gestionada por el sistema) ----------
  app.post('/integrations/mercadopago/point', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(mpPointCreateSchema, request.body);
      const orgId = req.user.organizationId;
      const branchId = req.user.branchId;
      if (!branchId) throw new HttpError(400, 'Se necesita una sede');

      const mpCfg = await getMpConfig(orgId);
      const deviceId = input.deviceId || mpCfg.point.deviceId || '';
      if (!mpCfg.point.accessToken && !mpCfg.qr.accessToken && !mpCfg.accessToken) {
        throw new HttpError(400, 'MercadoPago no configurado');
      }
      if (!deviceId) throw new HttpError(400, 'Sin terminal Point configurada');
      const orderId = `PT-${Date.now().toString(36).toUpperCase()}`;

      const result = await createPointIntent(mpCfg, {
        amount: input.amount,
        description: input.description,
        externalReference: input.externalReference ?? orderId,
        deviceId,
        idempotencyKey: orderId,
      });
      if (result.error || !result.id) {
        throw new HttpError(502, result.error || 'MercadoPago no creó la intención de cobro');
      }
      const intentId = result.id;
      const providerData: Record<string, unknown> = {
        deviceId,
        description: input.description,
        externalReference: input.externalReference,
        intentId,
        state: result.state,
      };

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: input.memberId || null,
          membershipId: input.membershipId || null,
          concept: input.concept ?? 'MEMBERSHIP',
          method: 'MERCADOPAGO_POINT',
          status: 'PENDING',
          amount: input.amount,
          reference: orderId,
          providerId: intentId ?? orderId,
          providerStatus: 'pending',
          providerData: JSON.stringify(providerData),
          receivedById: req.user.id,
          notes: `Cobro en POINT ${deviceId || '(sin terminal)'}: ${input.description}`,
        },
      });
      await logActivity(req, 'CREATE', 'MP_POINT_ORDER', payment.id, undefined, { orderId, deviceId, amount: input.amount, real: true });
      return ok(reply, { orderId, deviceId, paymentId: payment.id, status: 'PENDING', intentId, state: result.state }, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Consulta el estado de un pago enviado a una terminal Point y lo completa si fue aprobado.
  app.get('/integrations/mercadopago/point/poll', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { intentId } = validate(mpPointPollSchema, request.query);
      const orgId = req.user.organizationId;
      const mpCfg = await getMpConfig(orgId);
      if (!mpCfg.point.accessToken && !mpCfg.qr.accessToken && !mpCfg.accessToken) throw new HttpError(400, 'MercadoPago no configurado');

      const status = await getPointIntent(mpCfg, intentId);

      let payment = await prisma.payment.findFirst({ where: { organizationId: orgId, providerId: intentId } });
      if (status.approved && payment) {
        payment = (await completeMpOrder(orgId, payment.id, req.user.id)) ?? payment;
      }
      return ok(reply, { state: status.state, mpStatus: status.mpStatus, approved: status.approved, payment });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Lista de ordenes QR/POINT pendientes o recientes
  app.get('/integrations/mercadopago/orders', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orders = await prisma.payment.findMany({
        where: {
          organizationId: req.user.organizationId,
          method: { in: ['MERCADOPAGO_QR', 'MERCADOPAGO_POINT', 'MERCADOPAGO_LINK'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { member: { select: { firstName: true, lastName: true } } },
      });
      return ok(reply, orders);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Consulta una orden QR/POINT por su id (para polling desde el punto de venta).
  app.get('/integrations/mercadopago/orders/:id', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const order = await prisma.payment.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: { member: { select: { firstName: true, lastName: true } } },
      });
      if (!order) throw new HttpError(404, 'Orden no encontrada');
      return ok(reply, order);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Confirmar cobro de una orden (marca pago completado y registra caja)
  app.post('/integrations/mercadopago/orders/:id/confirm', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const order = await prisma.payment.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!order) throw new HttpError(404, 'Orden no encontrada');
      if (order.status === 'COMPLETED') throw new HttpError(409, 'La orden ya fue cobrada');

      const payment = await completeMpOrder(req.user.organizationId, id, req.user.id);
      await logActivity(req, 'CONFIRM', 'MP_ORDER', id, { status: 'PENDING' }, { status: 'COMPLETED' });
      return ok(reply, payment);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Webhook publico de MercadoPago: completa la orden cuando el pago fue aprobado.
  // No usa auth; se protege con ?token=<MERCADOPAGO.WEBHOOK_SECRET> opcional.
  app.post('/integrations/mercadopago/webhook', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number }; external_reference?: string };
      const paymentId = body.data?.id != null ? String(body.data.id) : null;

      // Buscar la orden/intencion local: por external_reference, o por providerId (id de MP).
      let order = null as Awaited<ReturnType<typeof prisma.payment.findFirst>>;
      let intent = null as Awaited<ReturnType<typeof prisma.paymentIntent.findFirst>>;
      if (body.external_reference) {
        order = await prisma.payment.findFirst({ where: { reference: body.external_reference } });
        if (!order) {
          intent = await prisma.paymentIntent.findFirst({ where: { externalRef: body.external_reference } });
        }
      }
      if (!order && !intent && paymentId) {
        order = await prisma.payment.findFirst({ where: { providerId: paymentId } });
        if (!order) {
          intent = await prisma.paymentIntent.findFirst({ where: { providerId: paymentId } });
        }
      }
      if (!order && !intent) return ok(reply, { received: true, matched: false });

      const orgId = (order ?? intent)!.organizationId;
      const localRef = order?.reference ?? intent?.externalRef ?? null;

      // 1) Si hay secreto configurado, exigir firma valida de MercadoPago.
      const secret = await getRawSetting(orgId, 'MERCADOPAGO', 'WEBHOOK_SECRET');
      if (secret) {
        const sig = request.headers['x-signature'] as string | undefined;
        const reqId = request.headers['x-request-id'] as string | string[] | undefined;
        if (!verifyMpSignature(secret, sig, reqId, paymentId ?? localRef ?? '')) {
          throw new HttpError(401, 'Firma de webhook invalida');
        }
      }

      // 2) Nunca completar sin confirmar el pago contra la API de MercadoPago.
      //    Si no hay ACCESS_TOKEN o id de pago, la orden queda pendiente y se
      //    confirma desde el panel (o se reintenta). Antes se aprobaba por defecto.
      const mpCfg = await getMpConfig(orgId);
      const accessToken = mpCfg.point.accessToken || mpCfg.qr.accessToken || mpCfg.accessToken;
      if (!accessToken || !paymentId) {
        return ok(reply, { received: true, matched: true, approved: false, pending: true });
      }
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return ok(reply, { received: true, matched: true, approved: false, pending: true });
      }
      const data = (await res.json()) as { status?: string; external_reference?: string | null };
      // Si MP reporta una referencia distinta a la local, no completar.
      if (data.external_reference && localRef && data.external_reference !== localRef) {
        return ok(reply, { received: true, matched: true, approved: false, pending: true });
      }
      const approved = data.status === 'approved';
      if (approved) {
        if (order) await completeMpOrder(orgId, order.id, null);
        else if (intent) await completeMpIntent(orgId, intent.id);
      }
      return ok(reply, { received: true, matched: true, approved, source: order ? 'ORDER' : 'PORTAL' });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- ARCA (ex AFIP): comprobantes (CAE real si hay certificado) ----------
  app.post('/integrations/arca/invoices', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'ACCOUNTANT'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(arcaInvoiceSchema, request.body);
      const orgId = req.user.organizationId;

      const cfg = await getArcaConfig(orgId, req.user.branchId);
      if (!cfg.cuit || !cfg.ptoVta) throw new HttpError(400, 'Configure CUIT y Punto de Venta en Configuracion > ARCA');

      const payment = await prisma.payment.findFirst({
        where: { id: input.paymentId, organizationId: orgId },
        include: { member: true },
      });
      if (!payment) throw new HttpError(404, 'Pago no encontrado');
      if (payment.invoiceNumber) throw new HttpError(409, `El pago ya tiene comprobante ${payment.invoiceNumber}`);

      const iva = payment.amount * 0.21;
      const net = payment.amount - iva;
      const cbteTipo = resolveCbteTipo(cfg, input.invoiceType);
      const tipoLabel = CBTE_LABEL[cbteTipo] ?? String(cbteTipo);
      const result = await arcaEmitir(orgId, {
        invoiceType: input.invoiceType,
        total: payment.amount,
        neto: net,
        iva,
        customerTaxId: input.customerTaxId || payment.member?.documentNumber || undefined,
        branchId: payment.branchId,
      });

      const fullNumber = `${String(result.ptoVta).padStart(5, '0')}-${String(result.numero).padStart(8, '0')}`;
      const cae = result.simulated ? null : result.cae;
      const caeVenc = result.simulated ? null : result.venc;

      let providerData: Record<string, unknown> = {};
      try {
        providerData = payment.providerData ? (JSON.parse(payment.providerData) as Record<string, unknown>) : {};
      } catch {
        providerData = {};
      }
      providerData.arca = {
        mode: result.mode,
        estado: result.estado,
        cbteTipo,
        tipoLabel,
        cae: result.cae,
        caeVenc: result.venc,
        cuit: cfg.cuit,
        puntoVenta: result.ptoVta,
        qrUrl: result.qrUrl,
      };

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceNumber: fullNumber, invoiceStatus: 'ISSUED', providerData: JSON.stringify(providerData) },
      });

      await logActivity(req, 'ISSUE', 'ARCA_INVOICE', payment.id, undefined, { invoiceNumber: fullNumber, amount: payment.amount, mode: result.mode, cae: result.cae });

      return ok(
        reply,
        {
          invoiceNumber: fullNumber,
          type: tipoLabel,
          cbteTipo,
          puntoVenta: result.ptoVta,
          cuit: cfg.cuit,
          cae,
          caeVenc,
          qrUrl: result.qrUrl,
          estado: result.estado,
          simulated: result.simulated,
          mode: result.mode,
          date: new Date(),
          amount: payment.amount,
          net,
          iva,
          customer: payment.member
            ? {
                name: `${payment.member.firstName} ${payment.member.lastName}`,
                taxId: input.customerTaxId || payment.member.documentNumber || '',
              }
            : { name: 'Consumidor Final', taxId: '' },
          payment: updated,
        },
        201,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- ARCA: notas de credito (anulacion de comprobantes) ----------
  app.post('/integrations/arca/credit-notes', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'ACCOUNTANT'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(arcaCreditNoteSchema, request.body);
      const orgId = req.user.organizationId;

      const payment = await prisma.payment.findFirst({
        where: { id: input.paymentId, organizationId: orgId },
        include: { member: true },
      });
      if (!payment) throw new HttpError(404, 'Pago no encontrado');
      if (!payment.invoiceNumber) throw new HttpError(400, 'El pago no tiene comprobante emitido');

      let providerData: Record<string, unknown> = {};
      try {
        providerData = payment.providerData ? (JSON.parse(payment.providerData) as Record<string, unknown>) : {};
      } catch {
        providerData = {};
      }
      const arcaData = (providerData.arca ?? {}) as Record<string, unknown>;
      if (arcaData.creditNote) throw new HttpError(409, 'El comprobante ya tiene una nota de credito');

      const cfg = await getArcaConfig(orgId, payment.branchId);
      const [ptoVtaStr, nroStr] = String(payment.invoiceNumber).split('-');
      const originalPtoVta = Number(arcaData.puntoVenta ?? ptoVtaStr) || cfg.ptoVta;
      const originalNro = Number(nroStr) || 0;
      const originalCbteTipo = Number(arcaData.cbteTipo) || cfg.cbteTipo;
      const fecha = payment.paidAt ?? payment.createdAt;
      const fechaYmd = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;

      const iva = payment.amount * 0.21;
      const net = payment.amount - iva;
      const ncTipo = resolveCreditNoteTipo(cfg, input.invoiceType);
      const ncLabel = CBTE_LABEL[ncTipo] ?? String(ncTipo);
      const assoc = { tipo: originalCbteTipo, ptoVta: originalPtoVta, nro: originalNro, fecha: fechaYmd };
      const emitOpts = {
        invoiceType: input.invoiceType,
        total: payment.amount,
        neto: net,
        iva,
        customerTaxId: input.customerTaxId || payment.member?.documentNumber || undefined,
        branchId: payment.branchId,
        assoc,
      };

      const result = await arcaEmitirNotaCredito(orgId, emitOpts);

      const ncNumber = `${String(result.ptoVta).padStart(5, '0')}-${String(result.numero).padStart(8, '0')}`;
      providerData.arca = {
        ...arcaData,
        creditNote: {
          mode: result.mode,
          estado: result.estado,
          cbteTipo: ncTipo,
          tipoLabel: ncLabel,
          number: ncNumber,
          cae: result.cae,
          caeVenc: result.venc,
          qrUrl: result.qrUrl,
          assoc,
          reason: input.reason ?? 'Anulacion',
          issuedAt: new Date().toISOString(),
        },
      };

      await prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceStatus: 'CREDITED', providerData: JSON.stringify(providerData) },
      });
      await logActivity(req, 'ISSUE', 'ARCA_CREDIT_NOTE', payment.id, undefined, { number: ncNumber, amount: payment.amount, mode: result.mode });

      return ok(
        reply,
        {
          number: ncNumber,
          type: ncLabel,
          cbteTipo: ncTipo,
          puntoVenta: result.ptoVta,
          cae: result.simulated ? null : result.cae,
          caeVenc: result.simulated ? null : result.venc,
          qrUrl: result.qrUrl,
          estado: result.estado,
          simulated: result.simulated,
          mode: result.mode,
          assoc,
          reason: input.reason ?? 'Anulacion',
          amount: payment.amount,
        },
        201,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- ARCA: puntos de venta por sucursal ----------
  app.get('/integrations/arca/points-of-sale', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const globalCfg = await getArcaConfig(orgId);
      const branches = await prisma.branch.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } });
      const pointsOfSale = await Promise.all(
        branches.map(async (branch) => {
          const own = await getRawSetting(orgId, 'ARCA', `PTO_VENTA_${branch.id}`);
          const ownNum = Number(own || '') || 0;
          const pointOfSale = ownNum > 0 ? ownNum : globalCfg.ptoVta;
          return { branchId: branch.id, branchName: branch.name, pointOfSale, inherited: !(ownNum > 0) };
        }),
      );
      return ok(reply, { globalPointOfSale: globalCfg.ptoVta, pointsOfSale });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Asigna un punto de venta AFIP a una sucursal (0 = usar el global).
  app.put('/integrations/arca/points-of-sale', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'ACCOUNTANT'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(arcaPointOfSaleSchema, request.body);
      const orgId = req.user.organizationId;
      const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId: orgId } });
      if (!branch) throw new HttpError(404, 'Sucursal no encontrada');
      if (input.pointOfSale > 0) {
        await prisma.setting.upsert({
          where: { organizationId_category_key: { organizationId: orgId, category: 'ARCA', key: `PTO_VENTA_${branch.id}` } },
          create: { organizationId: orgId, category: 'ARCA', key: `PTO_VENTA_${branch.id}`, value: String(input.pointOfSale) },
          update: { value: String(input.pointOfSale) },
        });
      } else {
        await prisma.setting.deleteMany({ where: { organizationId: orgId, category: 'ARCA', key: `PTO_VENTA_${branch.id}` } });
      }
      await logActivity(req, 'UPDATE', 'ARCA_POS', branch.id, undefined, { pointOfSale: input.pointOfSale });
      return ok(reply, { branchId: branch.id, pointOfSale: input.pointOfSale });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Prueba de conexion con ARCA (WSAA). No emite comprobante.
  app.post('/integrations/arca/test', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'ACCOUNTANT'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const result = await arcaTest(req.user.organizationId);
      return ok(reply, result);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Estado de servidores de ARCA (FEDummy).
  app.get('/integrations/arca/dummy', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'ACCOUNTANT'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const result = await arcaDummy(req.user.organizationId);
      return ok(reply, result);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/integrations/arca/invoices', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const invoices = await prisma.payment.findMany({
        where: { organizationId: req.user.organizationId, invoiceNumber: { not: null } },
        orderBy: { paidAt: 'desc' },
        take: 100,
        include: { member: { select: { firstName: true, lastName: true, documentNumber: true } } },
      });
      return ok(reply, invoices);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- Impresion termica (servidor local de la app de escritorio) ----------
  app.get('/integrations/print/printers', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const result = await listPrinters(req.user.organizationId);
      return ok(reply, result);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Imprime un ticket de prueba para verificar la conexion con la impresora.
  app.post('/integrations/print/test', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const result = await printTicket(req.user.organizationId, {
        organization: org?.name ?? 'FIT system™',
        title: 'PRUEBA DE IMPRESION',
        date: new Date().toISOString(),
        lines: [
          { label: 'Estado:', value: 'Conexion OK' },
          { label: 'Sede:', value: req.user.branchId ?? '-' },
        ],
        total: '$0.00',
        footer: 'Si ves este ticket, la impresora funciona',
      });
      if (!result.ok) throw new HttpError(502, result.error ?? 'No se pudo imprimir');
      await logActivity(req, 'CREATE', 'PRINT_TEST', null, undefined, {});
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Imprime el comprobante de un pago.
  app.post('/integrations/print/receipt/:paymentId', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { paymentId } = request.params as { paymentId: string };
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, organizationId: req.user.organizationId },
        include: { member: { select: { firstName: true, lastName: true } }, organization: true },
      });
      if (!payment) throw new HttpError(404, 'Pago no encontrado');
      const result = await printTicket(req.user.organizationId, buildReceiptTicket({
        organization: payment.organization?.name ?? 'FIT system™',
        member: payment.member ? `${payment.member.firstName} ${payment.member.lastName}` : null,
        concept: payment.concept,
        method: payment.method,
        amount: payment.amount,
        reference: payment.invoiceNumber ?? payment.reference,
        date: payment.paidAt ?? payment.createdAt,
      }));
      if (!result.ok) throw new HttpError(502, result.error ?? 'No se pudo imprimir');
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Imprime el comprobante de un pago en la impresora de la terminal Point.
  app.post('/integrations/print/receipt/:paymentId/point', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { paymentId } = request.params as { paymentId: string };
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, organizationId: req.user.organizationId },
        include: { member: { select: { firstName: true, lastName: true } }, organization: true },
      });
      if (!payment) throw new HttpError(404, 'Pago no encontrado');
      const result = await printViaPoint(req.user.organizationId, buildReceiptTicket({
        organization: payment.organization?.name ?? 'FIT system™',
        member: payment.member ? `${payment.member.firstName} ${payment.member.lastName}` : null,
        concept: payment.concept,
        method: payment.method,
        amount: payment.amount,
        reference: payment.invoiceNumber ?? payment.reference,
        date: payment.paidAt ?? payment.createdAt,
      }), (request.body as { deviceId?: string } | undefined)?.deviceId);
      if (!result.ok) throw new HttpError(502, result.error ?? 'No se pudo imprimir en la terminal Point');
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Imprime un ticket de prueba en la impresora de la terminal Point.
  app.post('/integrations/print/test/point', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const result = await printViaPoint(req.user.organizationId, {
        organization: org?.name ?? 'FIT system™',
        title: 'PRUEBA POINT',
        date: new Date().toISOString(),
        lines: [
          { label: 'Estado:', value: 'Conexion OK' },
          { label: 'Sede:', value: req.user.branchId ?? '-' },
        ],
        total: '$0.00',
        footer: 'Impreso por la terminal Point',
      });
      if (!result.ok) throw new HttpError(502, result.error ?? 'No se pudo imprimir en la terminal Point');
      return ok(reply, { ok: true });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default integrationRoutes;