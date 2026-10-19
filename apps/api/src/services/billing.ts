import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { issueLicense, isLicensorIssueConfigured } from './licensing-client.js';
import { sendPlatformEmail, isPlatformEmailConfigured } from './platform-email.js';

export type BillingPlan = 'BASIC' | 'PRO' | 'ENTERPRISE';
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';
export type BillingProduct = 'SEAT_PACK' | 'MP_KIT';

export interface PlanDef {
  name: string;
  seats: number;
  monthly: number;
  annual: number;
}

export interface ProductDef {
  name: string;
  desc: string;
  seats: number;
  amount: number;
}

/**
 * Catálogo de planes de la tienda (una sola fuente de verdad). Los importes están
 * en ARS. El anual equivale a 10 meses (2 meses gratis).
 */
export const PLAN_CATALOG: Record<BillingPlan, PlanDef> = {
  BASIC: { name: 'Básico', seats: 100, monthly: 45000, annual: 450000 },
  PRO: { name: 'Pro', seats: 300, monthly: 75000, annual: 750000 },
  ENTERPRISE: { name: 'Empresa', seats: 500, monthly: 140000, annual: 1400000 },
};

/**
 * Productos de pago único (complementos): pack de asientos y kit de cobro
 * presencial. No emiten licencia: se cumplen a mano desde el proveedor.
 */
export const PRODUCT_CATALOG: Record<BillingProduct, ProductDef> = {
  SEAT_PACK: {
    name: 'Pack de asientos (+100 socios)',
    desc: '100 socios adicionales con acceso a la app, por 12 meses.',
    seats: 100,
    amount: 60000,
  },
  MP_KIT: {
    name: 'Kit MercadoPago (Terminal Point + QR)',
    desc: 'Terminal Point y QR de MercadoPago para cobrar en el mostrador.',
    seats: 0,
    amount: 75000,
  },
};

export function isKnownPlan(plan: string): plan is BillingPlan {
  return plan === 'BASIC' || plan === 'PRO' || plan === 'ENTERPRISE';
}

export function isKnownProduct(product: string): product is BillingProduct {
  return product === 'SEAT_PACK' || product === 'MP_KIT';
}

export function isKnownPeriod(period: string): period is BillingPeriod {
  return period === 'MONTHLY' || period === 'ANNUAL';
}

export function planAmount(plan: BillingPlan, period: BillingPeriod): number {
  return PLAN_CATALOG[plan][period === 'ANNUAL' ? 'annual' : 'monthly'];
}

export function planDays(period: BillingPeriod): number {
  return period === 'ANNUAL' ? 365 : 30;
}

export function isBillingConfigured(): boolean {
  return Boolean(env.PLATFORM_MP_ACCESS_TOKEN && env.PLATFORM_MP_PUBLIC_KEY);
}

export function getPlatformPublicKey(): string {
  return env.PLATFORM_MP_PUBLIC_KEY;
}

/** Nombre legible de un plan o producto del catálogo. */
export function itemLabel(item: string): string {
  if (isKnownProduct(item)) return PRODUCT_CATALOG[item].name;
  if (isKnownPlan(item)) return PLAN_CATALOG[item].name;
  return item;
}

export interface PurchaseDraft {
  ok: boolean;
  purchaseId?: string;
  externalRef?: string;
  amount?: number;
  error?: string;
}

/**
 * Crea una compra pendiente (sin cobrar todavía). El pago se procesa luego con
 * `payPurchase` usando el token de tarjeta que genera el checkout embebido.
 */
export async function createPurchase(input: {
  plan: string;
  period?: BillingPeriod | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  gymName?: string | null;
}): Promise<PurchaseDraft> {
  if (!env.PLATFORM_MP_ACCESS_TOKEN) return { ok: false, error: 'La pasarela de pago no está configurada' };

  let amount: number;
  let seats: number;
  let periodStore: string;

  if (isKnownProduct(input.plan)) {
    amount = PRODUCT_CATALOG[input.plan].amount;
    seats = PRODUCT_CATALOG[input.plan].seats;
    periodStore = 'ONCE';
  } else if (isKnownPlan(input.plan)) {
    const period: BillingPeriod = isKnownPeriod(input.period ?? '') ? (input.period as BillingPeriod) : 'ANNUAL';
    const plan = PLAN_CATALOG[input.plan];
    amount = plan[period === 'ANNUAL' ? 'annual' : 'monthly'];
    seats = plan.seats;
    periodStore = period;
  } else {
    return { ok: false, error: 'Producto inválido' };
  }

  const externalRef = `FITP-${randomBytes(8).toString('hex')}`;

  const purchase = await prisma.planPurchase.create({
    data: {
      plan: input.plan,
      period: periodStore,
      seats,
      amount,
      currency: 'ARS',
      status: 'PENDING',
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone ?? null,
      gymName: input.gymName ?? null,
      externalRef,
    },
  });

  return { ok: true, purchaseId: purchase.id, externalRef, amount };
}

export interface PayResult {
  ok: boolean;
  status?: string;
  statusDetail?: string;
  paymentId?: string;
  error?: string;
}

interface MpPayment {
  id?: number;
  status?: string;
  status_detail?: string;
  message?: string;
}

/**
 * Cobra una compra con tarjeta usando el `token` que generó el checkout embebido
 * (Card Payment Brick). El importe se toma de la compra en la base (nunca del
 * cliente). Si queda aprobado, cumple la compra (emite licencia / avisa).
 */
export async function payPurchase(input: {
  externalRef: string;
  token: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string | null;
  payerEmail: string;
  identificationType?: string | null;
  identificationNumber?: string | null;
}): Promise<PayResult> {
  if (!env.PLATFORM_MP_ACCESS_TOKEN) return { ok: false, error: 'La pasarela de pago no está configurada' };

  const purchase = await prisma.planPurchase.findUnique({ where: { externalRef: input.externalRef } });
  if (!purchase) return { ok: false, error: 'No encontramos la compra' };
  if (purchase.status === 'PAID') return { ok: false, error: 'Esta compra ya fue pagada' };

  const body: Record<string, unknown> = {
    transaction_amount: purchase.amount,
    token: input.token,
    description: itemLabel(purchase.plan),
    installments: input.installments,
    payment_method_id: input.paymentMethodId,
    external_reference: purchase.externalRef,
    payer: {
      email: input.payerEmail,
      ...(input.identificationType && input.identificationNumber
        ? { identification: { type: input.identificationType, number: input.identificationNumber } }
        : {}),
    },
  };
  if (input.issuerId) body.issuer_id = Number(input.issuerId);
  if (env.PUBLIC_URL) body.notification_url = `${env.PUBLIC_URL}/api/billing/webhook`;

  try {
    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PLATFORM_MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': purchase.externalRef,
      },
      body: JSON.stringify(body),
    });
    const payment = (await res.json().catch(() => null)) as
      | { id?: number; status?: string; status_detail?: string; message?: string }
      | null;
    if (!res.ok) {
      await prisma.planPurchase.update({
        where: { id: purchase.id },
        data: {
          providerStatus: payment?.status ?? 'rejected',
          notes: `MercadoPago HTTP ${res.status}${payment?.message ? `: ${payment.message}` : ''}`.slice(0, 500),
        },
      });
      return { ok: false, error: payment?.message || `MercadoPago rechazó el pago (HTTP ${res.status})` };
    }

    const paymentId = payment?.id != null ? String(payment.id) : null;
    await prisma.planPurchase.update({
      where: { id: purchase.id },
      data: { providerPaymentId: paymentId, providerStatus: payment?.status ?? null },
    });

    if (payment?.status === 'approved') {
      await fulfillPurchase(purchase.id);
      return { ok: true, status: 'approved', statusDetail: payment.status_detail, paymentId: paymentId ?? undefined };
    }

    return {
      ok: true,
      status: payment?.status,
      statusDetail: payment?.status_detail,
      paymentId: paymentId ?? undefined,
    };
  } catch (err) {
    return { ok: false, error: `No se pudo contactar a MercadoPago: ${(err as Error).message}` };
  }
}

/**
 * Marca la compra como pagada, emite la licencia (si el Licensador está
 * configurado) y avisa por email al comprador y al proveedor. Idempotente.
 */
export async function fulfillPurchase(purchaseId: string): Promise<void> {
  const purchase = await prisma.planPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.status === 'PAID') return;

  const isProduct = isKnownProduct(purchase.plan);

  let licenseKey = purchase.licenseKey;
  if (!isProduct && !licenseKey && isLicensorIssueConfigured()) {
    const plan: BillingPlan = isKnownPlan(purchase.plan) ? purchase.plan : 'PRO';
    const period: BillingPeriod = isKnownPeriod(purchase.period) ? purchase.period : 'ANNUAL';
    const issued = await issueLicense({
      client: (purchase.gymName || purchase.buyerName || 'Cliente web').slice(0, 120),
      plan,
      days: planDays(period),
      seats: purchase.seats,
      notas: `Compra web ${purchase.externalRef}`,
    });
    licenseKey = issued.ok && issued.key ? issued.key : null;
    if (!issued.ok) console.error('[billing] no se pudo emitir la licencia:', issued.error);
  }

  await prisma.planPurchase.update({
    where: { id: purchase.id },
    data: { status: 'PAID', licenseKey },
  });

  if (!isPlatformEmailConfigured()) return;

  const itemName = isProduct
    ? PRODUCT_CATALOG[purchase.plan as BillingProduct].name
    : PLAN_CATALOG[purchase.plan as BillingPlan]?.name ?? purchase.plan;
  const periodLabel =
    purchase.period === 'ANNUAL' ? 'anual' : purchase.period === 'MONTHLY' ? 'mensual' : 'pago único';

  const buyerLines = isProduct
    ? [
        '¡Gracias por tu compra de FIT system™!',
        '',
        `Producto: ${itemName}`,
        `Importe: ARS ${purchase.amount}`,
        `Gimnasio: ${purchase.gymName || '(no indicado)'}`,
        '',
        purchase.plan === 'MP_KIT'
          ? 'Coordinamos el envío y la vinculación del equipo de MercadoPago a tu cuenta.'
          : 'Sumamos los asientos a tu licencia. Si todavía no tenés una, te escribimos para activarla.',
        'En breve nos ponemos en contacto.',
        '',
        '— FIT system™',
      ]
    : [
        '¡Gracias por tu compra de FIT system™!',
        '',
        `Plan: ${itemName} · ${periodLabel}`,
        `Importe: ARS ${purchase.amount}`,
        `Gimnasio: ${purchase.gymName || '(no indicado)'}`,
        '',
        licenseKey
          ? `Tu clave de licencia: ${licenseKey}`
          : 'Registramos tu pago. En breve te enviamos la clave de licencia para activar el sistema.',
        '',
        licenseKey
          ? 'Activala en la app de escritorio: Configuración > Licencia.'
          : 'Si en 24 h no la recibís, respondé a este correo.',
        '',
        '— FIT system™',
      ];
  await sendPlatformEmail(purchase.buyerEmail, 'Tu compra de FIT system™', buyerLines.join('\n'));

  const adminLines = [
    isProduct ? 'Nuevo pedido en el sitio:' : 'Nueva compra en el sitio:',
    `- Gimnasio: ${purchase.gymName || '(no indicado)'}`,
    `- Cliente: ${purchase.buyerName} <${purchase.buyerEmail}>`,
    purchase.buyerPhone ? `- Teléfono: ${purchase.buyerPhone}` : '',
    `- ${isProduct ? 'Producto' : 'Plan'}: ${itemName}${isProduct ? '' : ` / ${purchase.period}`}`,
    `- Importe: ARS ${purchase.amount}`,
    `- Referencia: ${purchase.externalRef}`,
    isProduct
      ? purchase.plan === 'MP_KIT'
        ? '- A cumplir: enviar y vincular el kit MercadoPago'
        : '- A cumplir: sumar los asientos a la licencia'
      : licenseKey
        ? `- Licencia emitida: ${licenseKey}`
        : '- Licencia: PENDIENTE de emitir (revisar Licensador)',
  ].filter(Boolean);
  await sendPlatformEmail(
    env.PLATFORM_CONTACT_TO,
    isProduct ? `Pedido web: ${itemName}` : `Venta web: ${purchase.plan} ${purchase.period}`,
    adminLines.join('\n'),
  );
}

export { isPlatformEmailConfigured };

/** Verifica la firma `x-signature` del webhook del proveedor (opcional). */
export function verifyPlatformWebhookSignature(
  header: string | undefined,
  requestId: string | string[] | undefined,
  dataId: string,
): boolean {
  if (!env.PLATFORM_MP_WEBHOOK_SECRET) return true;
  if (!header) return false;
  const ts = /(?:^|,)ts=([^,]+)/.exec(header)?.[1];
  const v1 = /(?:^|,)v1=([^,]+)/.exec(header)?.[1];
  if (!ts || !v1) return false;
  const rid = Array.isArray(requestId) ? requestId[0] : requestId ?? '';
  const manifest = `id:${dataId};request-id:${rid};ts:${ts};`;
  const expected = createHmac('sha256', env.PLATFORM_MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
