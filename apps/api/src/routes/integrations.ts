import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { mpQrCreateSchema, mpPointCreateSchema, arcaInvoiceSchema, mpPointPollSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { getRawSetting, getSettings } from '../services/settings.js';
import { notifyEvent } from '../services/notifications.js';
import { whatsappLink } from '../services/whatsapp.js';
import { getSmtpConfig } from '../services/email.js';
import { getArcaConfig, arcaMode, arcaEmitir, arcaTest, arcaDummy, type CbteTipo } from '../services/arca.js';
import { printTicket, listPrinters, buildReceiptTicket } from '../services/print.js';
import { env } from '../env.js';

async function nextSequence(orgId: string, category: string, key: string): Promise<number> {
  const current = await getRawSetting(orgId, category, key);
  const next = Number(current || '0') + 1;
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId: orgId, category, key } },
    create: { organizationId: orgId, category, key, value: String(next) },
    update: { value: String(next) },
  });
  return next;
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
    await printTicket(orgId, buildReceiptTicket({
      organization: org?.name ?? 'FIT System',
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

export function integrationRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Estado de configuracion de integraciones (sin secretos)
  app.get('/integrations/status', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const settings = await getSettings(req.user.organizationId);
      const mp = settings.MERCADOPAGO ?? {};
      const arca = settings.ARCA ?? {};
      const wa = settings.WHATSAPP ?? {};
      const print = settings.PRINT ?? {};
      const smtp = await getSmtpConfig(req.user.organizationId);
      const arcaCfg = await getArcaConfig(req.user.organizationId);
      return ok(reply, {
        mercadopago: {
          configured: Boolean(mp.ACCESS_TOKEN || mp.PUBLIC_KEY || mp.STATIC_QR_PAYLOAD),
          accessTokenMasked: mp.ACCESS_TOKEN ? '****' : '',
          publicKey: mp.PUBLIC_KEY ?? '',
          hasStaticQr: Boolean(mp.STATIC_QR_PAYLOAD),
          pointEnabled: mp.POINT_ENABLED === 'true',
          pointDeviceId: mp.POINT_DEVICE_ID ?? '',
        },
        arca: {
          configured: Boolean(arca.CUIT && arca.PUNTO_VENTA),
          mode: arcaCfg.hasCert && arcaCfg.hasKey ? 'real' : 'mock',
          cuit: arca.CUIT ?? '',
          puntoVenta: arca.PUNTO_VENTA ?? '',
          environment: arca.ENVIRONMENT ?? 'HOMOLOGACION',
          hasCertificate: arcaCfg.hasCert,
        },
        whatsapp: {
          configured: Boolean(wa.BUSINESS_PHONE || wa.WA_URL_BASE),
          businessPhone: wa.BUSINESS_PHONE ?? '',
          waUrlBase: wa.WA_URL_BASE ?? 'https://wa.me',
          defaultMessage: wa.DEFAULT_MESSAGE ?? '',
          cloudConfigured: Boolean(wa.CLOUD_TOKEN && wa.PHONE_NUMBER_ID),
          useAutomation: wa.USE_AUTOMATION === 'true',
        },
        print: {
          configured: Boolean(print.PRINTER_NAME || print.DEST_URL),
          defaultPrinter: print.PRINTER_NAME ?? '',
          destUrl: print.DEST_URL ?? '',
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
        `fitsystem://pay?org=${orgId}&branch=${branchId}&merchant=${encodeURIComponent(org?.name ?? 'FIT System')}`;
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

      // Si hay Access Token, creamos una preferencia real en MercadoPago.
      const accessToken = await getRawSetting(orgId, 'MERCADOPAGO', 'ACCESS_TOKEN');
      if (accessToken) {
        try {
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
          if (res.ok) {
            const data = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
            checkoutUrl = data.init_point ?? data.sandbox_init_point ?? null;
            providerId = data.id ?? orderId;
            if (checkoutUrl) payload = checkoutUrl;
          }
        } catch {
          // Sin conexion o token invalido: se usa el QR local simulado.
        }
      }

      const image = await QRCode.toDataURL(payload, { width: 512, margin: 1 });

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: input.memberId || null,
          concept: 'MEMBERSHIP',
          method: 'MERCADOPAGO_QR',
          status: 'PENDING',
          amount: input.amount,
          reference: orderId,
          providerId,
          providerStatus: 'pending',
          providerData: JSON.stringify({ description: input.description, externalReference: input.externalReference, checkoutUrl, real: Boolean(checkoutUrl) }),
          receivedById: req.user.id,
          notes: `QR de cobro: ${input.description}`,
        },
      });
      await logActivity(req, 'CREATE', 'MP_QR_ORDER', payment.id, undefined, { orderId, amount: input.amount, real: Boolean(checkoutUrl) });
      return ok(reply, { orderId, payload, image, paymentId: payment.id, checkoutUrl, status: 'PENDING' }, 201);
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

      const deviceId = input.deviceId || (await getRawSetting(orgId, 'MERCADOPAGO', 'POINT_DEVICE_ID')) || '';
      const accessToken = await getRawSetting(orgId, 'MERCADOPAGO', 'ACCESS_TOKEN');
      const orderId = `PT-${Date.now().toString(36).toUpperCase()}`;

      let intentId: string | null = null;
      let providerData: Record<string, unknown> = { deviceId, description: input.description, externalReference: input.externalReference };

      if (accessToken && deviceId) {
        try {
          const res = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'X-Idempotency-Key': orderId },
            body: JSON.stringify({
              amount: input.amount,
              description: input.description,
              external_reference: input.externalReference ?? orderId,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { id?: string; state?: string };
            intentId = data.id ?? null;
            providerData = { ...providerData, intentId, state: data.state };
          } else {
            const err = (await res.json().catch(() => ({}))) as { message?: string };
            providerData = { ...providerData, error: err.message || `HTTP ${res.status}` };
          }
        } catch (err) {
          providerData = { ...providerData, error: (err as Error).message };
        }
      }

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          branchId,
          memberId: input.memberId || null,
          concept: 'MEMBERSHIP',
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
      await logActivity(req, 'CREATE', 'MP_POINT_ORDER', payment.id, undefined, { orderId, deviceId, amount: input.amount, real: Boolean(intentId) });
      return ok(
        reply,
        {
          orderId,
          deviceId: deviceId || null,
          paymentId: payment.id,
          status: 'PENDING',
          real: Boolean(intentId),
          intentId,
          instructions: deviceId
            ? `Cobrar $${input.amount.toFixed(2)} en la terminal ${deviceId}`
            : 'Configura el ID de la terminal Point en Ajustes > MercadoPago',
        },
        201,
      );
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
      const accessToken = await getRawSetting(orgId, 'MERCADOPAGO', 'ACCESS_TOKEN');
      if (!accessToken) throw new HttpError(400, 'MercadoPago no configurado');

      const res = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${intentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new HttpError(400, `MercadoPago respondio HTTP ${res.status}`);
      const data = (await res.json()) as { state?: string; payment?: { id?: number; status?: string } };
      const approved = data.payment?.status === 'approved';

      let payment = await prisma.payment.findFirst({ where: { organizationId: orgId, providerId: intentId } });
      if (approved && payment) {
        payment = (await completeMpOrder(orgId, payment.id, req.user.id)) ?? payment;
      }
      return ok(reply, { state: data.state ?? null, mpStatus: data.payment?.status ?? null, approved, payment });
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

      // Buscar la orden local: por external_reference, o por providerId (id de MP).
      let order = null as Awaited<ReturnType<typeof prisma.payment.findFirst>>;
      if (body.external_reference) {
        order = await prisma.payment.findFirst({ where: { reference: body.external_reference } });
      }
      if (!order && paymentId) {
        order = await prisma.payment.findFirst({ where: { providerId: paymentId } });
      }
      if (!order) return ok(reply, { received: true, matched: false });

      const secret = await getRawSetting(order.organizationId, 'MERCADOPAGO', 'WEBHOOK_SECRET');
      if (secret) {
        const token = (request.query as { token?: string } | undefined)?.token;
        if (token !== secret) throw new HttpError(401, 'Token de webhook invalido');
      }

      // Si MP envía el estado, verificar que esté aprobado antes de completar.
      let approved = true;
      const accessToken = await getRawSetting(order.organizationId, 'MERCADOPAGO', 'ACCESS_TOKEN');
      if (accessToken && paymentId) {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { status?: string };
          approved = data.status === 'approved';
        }
      }
      if (approved) await completeMpOrder(order.organizationId, order.id, null);
      return ok(reply, { received: true, matched: true, approved });
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

      const cuit = await getRawSetting(orgId, 'ARCA', 'CUIT');
      const puntoVenta = await getRawSetting(orgId, 'ARCA', 'PUNTO_VENTA');
      if (!cuit || !puntoVenta) throw new HttpError(400, 'Configure CUIT y Punto de Venta en Configuracion > ARCA');

      const payment = await prisma.payment.findFirst({
        where: { id: input.paymentId, organizationId: orgId },
        include: { member: true },
      });
      if (!payment) throw new HttpError(404, 'Pago no encontrado');
      if (payment.invoiceNumber) throw new HttpError(409, `El pago ya tiene comprobante ${payment.invoiceNumber}`);

      const iva = payment.amount * 0.21;
      const net = payment.amount - iva;

      const mode = await arcaMode(orgId);
      let fullNumber: string;
      let cae: string | null = null;
      let caeVenc: string | null = null;

      if (mode === 'real') {
        const result = await arcaEmitir(orgId, {
          tipo: input.invoiceType as CbteTipo,
          total: payment.amount,
          neto: net,
          iva,
        });
        fullNumber = `${String(result.ptoVta).padStart(5, '0')}-${String(result.numero).padStart(8, '0')}`;
        cae = result.cae;
        caeVenc = result.venc;
      } else {
        const seq = await nextSequence(orgId, 'ARCA', `SEQ_${input.invoiceType}`);
        fullNumber = `${String(puntoVenta).padStart(5, '0')}-${String(seq).padStart(8, '0')}`;
      }

      let providerData: Record<string, unknown> = {};
      try {
        providerData = payment.providerData ? (JSON.parse(payment.providerData) as Record<string, unknown>) : {};
      } catch {
        providerData = {};
      }
      providerData.arca = { mode, cae, caeVenc, cuit, puntoVenta: Number(puntoVenta) };

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceNumber: fullNumber, invoiceStatus: 'ISSUED', providerData: JSON.stringify(providerData) },
      });

      await logActivity(req, 'ISSUE', 'ARCA_INVOICE', payment.id, undefined, { invoiceNumber: fullNumber, amount: payment.amount, mode, cae });

      return ok(
        reply,
        {
          invoiceNumber: fullNumber,
          type: input.invoiceType,
          puntoVenta,
          cuit,
          cae,
          caeVenc,
          mode,
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
        organization: org?.name ?? 'FIT System',
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
        organization: payment.organization?.name ?? 'FIT System',
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
}

export default integrationRoutes;