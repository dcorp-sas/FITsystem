import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { issueLicense, isLicensorIssueConfigured } from './licensing-client.js';
import { sendPlatformEmail, isPlatformEmailConfigured } from './platform-email.js';

export type BillingPlan = 'BASIC' | 'PRO' | 'ENTERPRISE';
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

export interface PlanDef {
  name: string;
  seats: number;
  monthly: number;
  annual: number;
}

/**
 * Catálogo de planes de la tienda (una sola fuente de verdad). Los importes están
 * en ARS. El anual equivale a 10 meses (2 meses gratis).
 */
export const PLAN_CATALOG: Record<BillingPlan, PlanDef> = {
  BASIC: { name: 'Básico', seats: 100, monthly: 45000, annual: 450000 },
  PRO: { name: 'Pro', seats: 500, monthly: 75000, annual: 750000 },
  ENTERPRISE: { name: 'Empresa', seats: 100000, monthly: 140000, annual: 1400000 },
};

export function isKnownPlan(plan: string): plan is BillingPlan {
  return plan === 'BASIC' || plan === 'PRO' || plan === 'ENTERPRISE';
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
  return Boolean(env.PLATFORM_MP_ACCESS_TOKEN);
}

export interface CheckoutResult {
  ok: boolean;
  initPoint?: string;
  purchaseId?: string;
  externalRef?: string;
  error?: string;
}

interface MpPreference {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

/**
 * Crea una compra pendiente y una preferencia de MercadoPago Checkout Pro.
 * Devuelve el `init_point` para redirigir al comprador.
 */
export async function createCheckout(input: {
  plan: BillingPlan;
  period: BillingPeriod;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  gymName?: string | null;
}): Promise<CheckoutResult> {
  if (!isBillingConfigured()) return { ok: false, error: 'La pasarela de pago no está configurada' };

  const amount = planAmount(input.plan, input.period);
  const def = PLAN_CATALOG[input.plan];
  const externalRef = `FITP-${randomBytes(8).toString('hex')}`;

  const purchase = await prisma.planPurchase.create({
    data: {
      plan: input.plan,
      period: input.period,
      seats: def.seats,
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

  const periodLabel = input.period === 'ANNUAL' ? 'anual' : 'mensual';
  const body: Record<string, unknown> = {
    items: [
      {
        title: `FIT System ${def.name} · ${periodLabel}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: amount,
      },
    ],
    payer: { name: input.buyerName, email: input.buyerEmail },
    external_reference: externalRef,
  };
  if (env.PUBLIC_URL) body.notification_url = `${env.PUBLIC_URL}/api/billing/webhook`;
  const base = env.WEB_ORIGIN.split(',')[0]?.trim();
  if (base) {
    body.back_urls = {
      success: `${base}/pagar?estado=success&ref=${externalRef}`,
      failure: `${base}/pagar?estado=failure&ref=${externalRef}`,
      pending: `${base}/pagar?estado=pending&ref=${externalRef}`,
    };
    body.auto_return = 'approved';
  }

  let data: MpPreference | null = null;
  try {
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PLATFORM_MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      await prisma.planPurchase.update({
        where: { id: purchase.id },
        data: { status: 'FAILED', notes: `MercadoPago HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` },
      });
      return { ok: false, error: `MercadoPago rechazó la compra (HTTP ${res.status})` };
    }
    data = (await res.json()) as MpPreference;
  } catch (err) {
    await prisma.planPurchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED', notes: `Error de red: ${(err as Error).message}` },
    });
    return { ok: false, error: 'No se pudo contactar a MercadoPago' };
  }

  const initPoint = data?.init_point ?? data?.sandbox_init_point ?? null;
  if (!initPoint) {
    await prisma.planPurchase.update({ where: { id: purchase.id }, data: { status: 'FAILED', notes: 'Sin init_point' } });
    return { ok: false, error: 'MercadoPago no devolvió un link de pago' };
  }

  await prisma.planPurchase.update({
    where: { id: purchase.id },
    data: { providerId: data?.id ?? null, providerData: JSON.stringify({ initPoint }) },
  });

  return { ok: true, initPoint, purchaseId: purchase.id, externalRef };
}

/**
 * Marca la compra como pagada, emite la licencia (si el Licensador está
 * configurado) y avisa por email al comprador y al proveedor. Idempotente.
 */
export async function fulfillPurchase(purchaseId: string): Promise<void> {
  const purchase = await prisma.planPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.status === 'PAID') return;

  let licenseKey = purchase.licenseKey;
  let issueError: string | null = null;

  if (!licenseKey && isLicensorIssueConfigured()) {
    const plan = isKnownPlan(purchase.plan) ? purchase.plan : 'PRO';
    const period = isKnownPeriod(purchase.period) ? purchase.period : 'ANNUAL';
    const issued = await issueLicense({
      client: (purchase.gymName || purchase.buyerName || 'Cliente web').slice(0, 120),
      plan,
      days: planDays(period),
      seats: purchase.seats,
      notas: `Compra web ${purchase.externalRef}`,
    });
    if (issued.ok && issued.key) licenseKey = issued.key;
    else licenseKey = null;
    if (!issued.ok) console.error('[billing] no se pudo emitir la licencia:', issued.error);
  }

  await prisma.planPurchase.update({
    where: { id: purchase.id },
    data: { status: 'PAID', licenseKey },
  });

  if (!isPlatformEmailConfigured()) return;

  const periodLabel = purchase.period === 'ANNUAL' ? 'anual' : 'mensual';
  const buyerLines = [
    `¡Gracias por tu compra de FIT System!`,
    '',
    `Plan: ${purchase.plan} · ${periodLabel}`,
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
    '— FIT System',
  ];
  await sendPlatformEmail(purchase.buyerEmail, 'Tu compra de FIT System', buyerLines.join('\n'));

  const adminLines = [
    'Nueva compra en el sitio:',
    `- Gimnasio: ${purchase.gymName || '(no indicado)'}`,
    `- Cliente: ${purchase.buyerName} <${purchase.buyerEmail}>`,
    purchase.buyerPhone ? `- Teléfono: ${purchase.buyerPhone}` : '',
    `- Plan: ${purchase.plan} / ${purchase.period}`,
    `- Importe: ARS ${purchase.amount}`,
    `- Referencia: ${purchase.externalRef}`,
    licenseKey ? `- Licencia emitida: ${licenseKey}` : '- Licencia: PENDIENTE de emitir (revisar Licensador)',
  ].filter(Boolean);
  await sendPlatformEmail(env.PLATFORM_CONTACT_TO, `Venta web: ${purchase.plan} ${purchase.period}`, adminLines.join('\n'));
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
