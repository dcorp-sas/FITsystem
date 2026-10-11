import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { mpQrCreateSchema, mpPointCreateSchema, arcaInvoiceSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { getRawSetting, getSettings } from '../services/settings.js';
import { notifyEvent } from '../services/notifications.js';
import { whatsappLink } from '../services/whatsapp.js';
import { getSmtpConfig } from '../services/email.js';

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
          cuit: arca.CUIT ?? '',
          puntoVenta: arca.PUNTO_VENTA ?? '',
          environment: arca.ENVIRONMENT ?? 'HOMOLOGACION',
          cassaRiferimento: arca.CASSA_RIFERIMENTO ?? '',
        },
        whatsapp: {
          configured: Boolean(wa.BUSINESS_PHONE || wa.WA_URL_BASE),
          businessPhone: wa.BUSINESS_PHONE ?? '',
          waUrlBase: wa.WA_URL_BASE ?? 'https://wa.me',
          defaultMessage: wa.DEFAULT_MESSAGE ?? '',
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

      const deviceId = input.deviceId || (await getRawSetting(orgId, 'MERCADOPAGO', 'POINT_DEVICE_ID')) || 'POINT-01';
      const orderId = `PT-${Date.now().toString(36).toUpperCase()}`;

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
          providerId: orderId,
          providerStatus: 'pending',
          providerData: JSON.stringify({ deviceId, description: input.description, externalReference: input.externalReference }),
          receivedById: req.user.id,
          notes: `Cobro en POINT ${deviceId}: ${input.description}`,
        },
      });
      await logActivity(req, 'CREATE', 'MP_POINT_ORDER', payment.id, undefined, { orderId, deviceId, amount: input.amount });
      return ok(reply, { orderId, deviceId, paymentId: payment.id, status: 'PENDING', instructions: `Cobrar $${input.amount.toFixed(2)} en la terminal ${deviceId}` }, 201);
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

      const [payment] = await prisma.$transaction([
        prisma.payment.update({ where: { id }, data: { status: 'COMPLETED', providerStatus: 'approved', paidAt: new Date() } }),
        prisma.cashMovement.create({
          data: {
            organizationId: req.user.organizationId,
            branchId: order.branchId,
            cashSessionId: (
              await prisma.cashSession.findFirst({ where: { organizationId: req.user.organizationId, branchId: order.branchId, status: 'OPEN' } })
            )?.id ?? null,
            type: 'INCOME',
            category: 'MEMBERSHIP',
            method: order.method,
            amount: order.amount,
            description: `Cobro ${order.method} ${order.reference}`,
            memberId: order.memberId,
            userId: req.user.id,
            referenceId: order.id,
          },
        }),
      ]);

      if (order.membershipId) {
        await prisma.membership.update({ where: { id: order.membershipId }, data: { status: 'ACTIVE' } });
      }
      if (order.memberId) {
        const member = await prisma.member.findUnique({ where: { id: order.memberId } });
        if (member) await notifyEvent(req.user.organizationId, member.id, 'PAYMENT_CONFIRMATION', { member, amount: order.amount });
      }
      await logActivity(req, 'CONFIRM', 'MP_ORDER', id, { status: 'PENDING' }, { status: 'COMPLETED' });
      return ok(reply, payment);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---------- ARCA (ex AFIP): comprobantes internos ----------
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

      const seq = await nextSequence(orgId, 'ARCA', `SEQ_${input.invoiceType}`);
      const invoiceNumber = String(seq).padStart(8, '0');
      const fullNumber = `${String(puntoVenta).padStart(5, '0')}-${invoiceNumber}`;

      const iva = payment.amount * 0.21;
      const net = payment.amount - iva;

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceNumber: fullNumber, invoiceStatus: 'ISSUED' },
      });

      await logActivity(req, 'ISSUE', 'ARCA_INVOICE', payment.id, undefined, { invoiceNumber: fullNumber, amount: payment.amount });

      return ok(
        reply,
        {
          invoiceNumber: fullNumber,
          type: input.invoiceType,
          puntoVenta,
          cuit,
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
}

export default integrationRoutes;