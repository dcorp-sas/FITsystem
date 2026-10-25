import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import {
  PLAN_CATALOG,
  PRODUCT_CATALOG,
  isKnownPlan,
  type BillingPeriod,
  type BillingPlan,
} from './billing.js';
import { issueLicense, isLicensorIssueConfigured, revokeLicense, unrevokeLicense } from './licensing-client.js';

/**
 * Suscripciones de la tienda del sitio (MercadoPago recurrente / "preapproval").
 *
 * El gym arma un carrito (1 plan + N packs de asientos) y autoriza un débito
 * automático mensual. MercadoPago cobra todos los meses y avisa por webhook:
 *  - `subscription_preapproval`: alta/baja/pausa de la suscripción.
 *  - `subscription_authorized_payment`: cada cobro (aprobado o rechazado).
 *
 * Con cada cobro aprobado se habilita/renueva la licencia; si un cobro falla y
 * pasa la tolerancia, la licencia se REVOCA en el Licensador (corte total: el
 * escritorio suspende el panel y la nube corta la app de socios). Al reactivar,
 * se revoca al revés (`unrevoke`) y se crea una nueva suscripción.
 */

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

/** Días de gracia entre un cobro fallido y el corte efectivo. */
const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 5);
/** Validez de la clave emitida (larga: el corte se controla por revocación). */
const LICENSE_DAYS = 3650;

export interface SubscriptionDraft {
  ok: boolean;
  externalRef?: string;
  initPoint?: string;
  amount?: number;
  error?: string;
}

interface MpPreapproval {
  id?: string;
  status?: string;
  external_reference?: string | null;
  payer_id?: number | string | null;
  init_point?: string;
  next_payment_date?: string | null;
  message?: string;
}

interface MpAuthorizedPayment {
  id?: number | string;
  preapproval_id?: string;
  status?: string;
  transaction_amount?: number;
  message?: string;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

async function mpFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PLATFORM_MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function mapPreapprovalStatus(status?: string): SubscriptionStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'authorized':
      return 'ACTIVE';
    case 'paused':
      return 'PAST_DUE';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

/** Importe y asientos totales de un carrito (plan + packs) según el período. */
export function subscriptionQuote(plan: BillingPlan, seatPacks: number, period: BillingPeriod = 'MONTHLY') {
  const packs = Math.max(0, Math.min(50, Math.floor(seatPacks)));
  const base = PLAN_CATALOG[plan][period === 'ANNUAL' ? 'annual' : 'monthly'];
  const packPrice = period === 'ANNUAL'
    ? PRODUCT_CATALOG.SEAT_PACK.amount
    : (PRODUCT_CATALOG.SEAT_PACK.monthlyAmount ?? Math.round(PRODUCT_CATALOG.SEAT_PACK.amount / 10));
  const amount = base + packs * packPrice;
  const seats = PLAN_CATALOG[plan].seats + packs * PRODUCT_CATALOG.SEAT_PACK.seats;
  return { packs, amount, seats };
}

/**
 * Crea una suscripción pendiente y el preapproval en MercadoPago. Devuelve el
 * `init_point` al que hay que redirigir al cliente para autorizar el débito.
 */
export async function createSubscription(input: {
  plan: string;
  seatPacks?: number;
  period?: BillingPeriod;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  gymName?: string | null;
}): Promise<SubscriptionDraft> {
  if (!env.PLATFORM_MP_ACCESS_TOKEN) return { ok: false, error: 'La pasarela de pago no está configurada' };
  if (!isKnownPlan(input.plan)) return { ok: false, error: 'Plan inválido' };
  const requestedPacks = Math.max(0, Math.floor(input.seatPacks ?? 0));
  if (requestedPacks > 2) return { ok: false, error: 'El plan Básico permite hasta 2 packs adicionales. Para mayor capacidad, elegí Pro o Empresa.' };
  if (requestedPacks > 0 && input.plan !== 'BASIC') return { ok: false, error: 'Los packs adicionales están disponibles únicamente en el plan Básico. Para mayor capacidad, elegí Pro o Empresa.' };

  const period: BillingPeriod = input.period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const { packs, amount, seats } = subscriptionQuote(input.plan, input.seatPacks ?? 0, period);
  const externalRef = `FITS-${randomBytes(8).toString('hex')}`;
  const planName = PLAN_CATALOG[input.plan].name;

  const subscription = await prisma.planSubscription.create({
    data: {
      plan: input.plan,
      period,
      seats,
      seatPacks: packs,
      amount,
      currency: 'ARS',
      status: 'PENDING',
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone ?? null,
      gymName: input.gymName ?? null,
      externalRef,
      items: JSON.stringify([
        { tag: input.plan, name: `${planName} (${period === 'ANNUAL' ? 'anual' : 'mensual'})`, qty: 1, unitAmount: PLAN_CATALOG[input.plan][period === 'ANNUAL' ? 'annual' : 'monthly'] },
        ...(packs > 0
          ? [{ tag: 'SEAT_PACK', name: `${PRODUCT_CATALOG.SEAT_PACK.name} (visible los 12 meses)`, qty: packs, unitAmount: period === 'ANNUAL' ? PRODUCT_CATALOG.SEAT_PACK.amount : (PRODUCT_CATALOG.SEAT_PACK.monthlyAmount ?? Math.round(PRODUCT_CATALOG.SEAT_PACK.amount / 10)) }]
          : []),
      ]),
    },
  });

  const reason = `${planName}${packs > 0 ? ` + ${packs} pack(s) de asientos` : ''} — ${period === 'ANNUAL' ? 'anual' : 'mensual'}`;
  const body: Record<string, unknown> = {
    reason,
    external_reference: externalRef,
    payer_email: input.buyerEmail,
    status: 'pending',
    auto_recurring: {
      frequency: period === 'ANNUAL' ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: amount,
      currency_id: 'ARS',
    },
    back_url: `${env.SITE_URL}/pagar?susc=${encodeURIComponent(externalRef)}`,
  };

  const r = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  const data = r.data as MpPreapproval | null;
  if (!r.ok || !data?.id) {
    await prisma.planSubscription.update({
      where: { id: subscription.id },
      data: { notes: `MercadoPago HTTP ${r.status}${data?.message ? `: ${data.message}` : ''}`.slice(0, 500) },
    });
    return { ok: false, error: data?.message || `MercadoPago rechazó la suscripción (HTTP ${r.status})` };
  }

  await prisma.planSubscription.update({
    where: { id: subscription.id },
    data: { providerId: data.id, items: subscription.items },
  });

  return { ok: true, externalRef, initPoint: data.init_point, amount };
}

/** Estado público de una suscripción (para la página de retorno). */
export async function subscriptionStatus(externalRef: string) {
  const sub = await prisma.planSubscription.findUnique({ where: { externalRef } });
  if (!sub) return null;
  return {
    plan: sub.plan,
    period: sub.period,
    status: sub.status,
    amount: sub.amount,
    currency: sub.currency,
    seats: sub.seats,
    seatPacks: sub.seatPacks,
    nextPaymentAt: sub.nextPaymentAt,
    licenseKey: sub.status === 'ACTIVE' ? sub.licenseKey : null,
  };
}

/** Emite la licencia de una suscripción (idempotente) si el Licensador está listo. */
async function ensureSubscriptionLicense(subscriptionId: string): Promise<void> {
  const sub = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || sub.licenseKey || !isLicensorIssueConfigured()) return;
  const issued = await issueLicense({
    client: (sub.gymName || sub.buyerName || 'Cliente web').slice(0, 120),
    plan: sub.plan,
    days: LICENSE_DAYS,
    seats: sub.seats,
    notas: `Suscripción mensual ${sub.externalRef}`,
  });
  if (!issued.ok || !issued.key) {
    console.error('[subscriptions] no se pudo emitir la licencia:', issued.error);
    return;
  }
  await prisma.planSubscription.update({ where: { id: subscriptionId }, data: { licenseKey: issued.key } });
}

/**
 * Aplica un cobro aprobado: activa/renueva la suscripción y su licencia, y
 * programa el próximo vencimiento.
 */
export async function applyApprovedPayment(subscriptionId: string, paymentId: string | null, paidAt = new Date()): Promise<void> {
  const sub = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;
  await ensureSubscriptionLicense(subscriptionId);
  const fresh = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
  if (fresh?.licenseKey) await unrevokeLicense(fresh.licenseKey);
  await prisma.planSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      lastPaymentId: paymentId,
      lastPaymentAt: paidAt,
      nextPaymentAt: addMonths(paidAt, fresh?.period === 'ANNUAL' ? 12 : 1),
    },
  });
}

/** Marca un cobro rechazado: la suscripción queda vencida (con gracia). */
export async function markPaymentFailed(subscriptionId: string, note?: string): Promise<void> {
  const sub = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;
  if (sub.status === 'CANCELLED') return;
  await prisma.planSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'PAST_DUE',
      nextPaymentAt: sub.nextPaymentAt ?? new Date(Date.now() + GRACE_DAYS * 86400000),
      notes: note ? note.slice(0, 500) : sub.notes,
    },
  });
}

/** Cancela (baja) la suscripción en MercadoPago. No corta ya: queda hasta el fin del período. */
export async function cancelSubscription(externalRef: string): Promise<{ ok: boolean; error?: string }> {
  const sub = await prisma.planSubscription.findUnique({ where: { externalRef } });
  if (!sub) return { ok: false, error: 'Suscripción no encontrada' };
  if (sub.providerId && env.PLATFORM_MP_ACCESS_TOKEN) {
    const r = await mpFetch(`/preapproval/${sub.providerId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (!r.ok) {
      const data = r.data as MpPreapproval | null;
      return { ok: false, error: data?.message || `MercadoPago HTTP ${r.status}` };
    }
  }
  await prisma.planSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
  return { ok: true };
}

/**
 * Reactiva una suscripción vencida/cancelada: crea un nuevo preapproval y
 * devuelve el `init_point`. No revive la licencia hasta que MercadoPago apruebe
 * el primer cobro (el webhook llama a `applyApprovedPayment`).
 */
export async function reactivateSubscription(externalRef: string): Promise<SubscriptionDraft> {
  const sub = await prisma.planSubscription.findUnique({ where: { externalRef } });
  if (!sub) return { ok: false, error: 'Suscripción no encontrada' };
  if (!env.PLATFORM_MP_ACCESS_TOKEN) return { ok: false, error: 'La pasarela de pago no está configurada' };

  const planName = PLAN_CATALOG[sub.plan as BillingPlan]?.name ?? sub.plan;
  const period: BillingPeriod = sub.period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const reason = `${planName}${sub.seatPacks > 0 ? ` + ${sub.seatPacks} pack(s) de asientos` : ''} — ${period === 'ANNUAL' ? 'anual' : 'mensual'} (reactivación)`;
  const body = {
    reason,
    external_reference: sub.externalRef,
    payer_email: sub.buyerEmail,
    status: 'pending',
    auto_recurring: {
      frequency: period === 'ANNUAL' ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: sub.amount,
      currency_id: sub.currency,
    },
    back_url: `${env.SITE_URL}/pagar?susc=${encodeURIComponent(sub.externalRef)}`,
  };
  const r = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  const data = r.data as MpPreapproval | null;
  if (!r.ok || !data?.id) {
    return { ok: false, error: data?.message || `MercadoPago rechazó la reactivación (HTTP ${r.status})` };
  }
  await prisma.planSubscription.update({
    where: { id: sub.id },
    data: { providerId: data.id, status: 'PENDING', notes: 'Reactivación solicitada' },
  });
  return { ok: true, externalRef: sub.externalRef, initPoint: data.init_point, amount: sub.amount };
}

/**
 * Lista las suscripciones de la tienda para el Panel de control del proveedor.
 * Ordenadas por actividad reciente. `filter` acota por estado.
 */
export async function listSubscriptions(filter?: string) {
  const rows = await prisma.planSubscription.findMany({
    where: filter && filter !== 'todas' ? { status: filter.toUpperCase() } : undefined,
    orderBy: [{ updatedAt: 'desc' }],
    take: 300,
  });
  return rows.map((s) => ({
    id: s.id,
    externalRef: s.externalRef,
    plan: s.plan,
    planName: PLAN_CATALOG[s.plan as BillingPlan]?.name ?? s.plan,
    period: s.period,
    seats: s.seats,
    seatPacks: s.seatPacks,
    amount: s.amount,
    currency: s.currency,
    status: s.status,
    buyerName: s.buyerName,
    buyerEmail: s.buyerEmail,
    buyerPhone: s.buyerPhone,
    gymName: s.gymName,
    organizationId: s.organizationId,
    providerId: s.providerId,
    lastPaymentAt: s.lastPaymentAt,
    nextPaymentAt: s.nextPaymentAt,
    licenseKey: s.licenseKey,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Cambia el período (mensual <-> anual) de una suscripción. MercadoPago no
 * permite editar la frecuencia de un preapproval existente, así que se da de
 * baja el actual y se crea uno nuevo con la frecuencia pedida, devolviendo el
 * `init_point` para que el cliente lo autorice. La licencia sigue vigente hasta
 * que el nuevo débito se apruebe (el webhook llama a `applyApprovedPayment`).
 */
export async function changeSubscriptionPeriod(externalRef: string, period: BillingPeriod): Promise<SubscriptionDraft> {
  const sub = await prisma.planSubscription.findUnique({ where: { externalRef } });
  if (!sub) return { ok: false, error: 'Suscripción no encontrada' };
  if ((sub.period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') === period) {
    return { ok: false, error: `La suscripción ya está en período ${period === 'ANNUAL' ? 'anual' : 'mensual'}` };
  }
  if (!env.PLATFORM_MP_ACCESS_TOKEN) return { ok: false, error: 'La pasarela de pago no está configurada' };
  const plan = sub.plan as BillingPlan;
  if (!isKnownPlan(sub.plan)) return { ok: false, error: 'Plan inválido' };

  const { amount } = subscriptionQuote(plan, sub.seatPacks, period);
  const planName = PLAN_CATALOG[plan].name;
  const reason = `${planName}${sub.seatPacks > 0 ? ` + ${sub.seatPacks} pack(s) de asientos` : ''} — cambio a ${period === 'ANNUAL' ? 'anual' : 'mensual'}`;

  // Da de baja el preapproval vigente (si existe) antes de crear el nuevo.
  if (sub.providerId) {
    await mpFetch(`/preapproval/${sub.providerId}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  }

  const body = {
    reason,
    external_reference: sub.externalRef,
    payer_email: sub.buyerEmail,
    status: 'pending',
    auto_recurring: {
      frequency: period === 'ANNUAL' ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: amount,
      currency_id: sub.currency,
    },
    back_url: `${env.SITE_URL}/pagar?susc=${encodeURIComponent(sub.externalRef)}`,
  };
  const r = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  const data = r.data as MpPreapproval | null;
  if (!r.ok || !data?.id) {
    return { ok: false, error: data?.message || `MercadoPago rechazó el cambio (HTTP ${r.status})` };
  }
  await prisma.planSubscription.update({
    where: { id: sub.id },
    data: {
      period,
      amount,
      providerId: data.id,
      status: 'PENDING',
      notes: `Cambio de período a ${period === 'ANNUAL' ? 'anual' : 'mensual'} (${new Date().toISOString().slice(0, 10)})`,
    },
  });
  return { ok: true, externalRef: sub.externalRef, initPoint: data.init_point, amount };
}

/** Sincroniza el estado de un preapproval (alta/baja/pausa) consultando MercadoPago. */
export async function syncPreapproval(preapprovalId: string): Promise<void> {
  const sub = await prisma.planSubscription.findFirst({ where: { providerId: preapprovalId } });
  if (!sub) return;
  const r = await mpFetch(`/preapproval/${preapprovalId}`);
  const data = r.data as MpPreapproval | null;
  if (!r.ok || !data) return;

  const status = mapPreapprovalStatus(data.status);
  const updates: Record<string, unknown> = { status };
  if (data.payer_id != null) updates.payerId = String(data.payer_id);
  if (data.next_payment_date) updates.nextPaymentAt = new Date(data.next_payment_date);
  await prisma.planSubscription.update({ where: { id: sub.id }, data: updates });

  if (status === 'ACTIVE') await ensureSubscriptionLicense(sub.id);
}

/** Aplica un cobro recurrente (authorized_payment) reportado por el webhook. */
export async function syncAuthorizedPayment(paymentId: string): Promise<void> {
  const r = await mpFetch(`/authorized_payments/${paymentId}`);
  const data = r.data as MpAuthorizedPayment | null;
  if (!r.ok || !data?.preapproval_id) return;
  const sub = await prisma.planSubscription.findFirst({ where: { providerId: data.preapproval_id } });
  if (!sub) return;
  const approved = (data.status ?? '').toLowerCase() === 'approved';
  if (approved) {
    await applyApprovedPayment(sub.id, paymentId);
  } else {
    await markPaymentFailed(sub.id, `Cobro ${data.status ?? 'rechazado'}`);
  }
}

/**
 * Enforcement periódico (solo en la nube): revoca la licencia de las
 * suscripciones vencidas o dadas de baja pasado el período pagado + tolerancia.
 * Devuelve cuántas licencias cortó.
 */
export async function enforceSubscriptions(now = new Date()): Promise<number> {
  if (env.LICENSE_INSTALLATION_ID) return 0;
  const due = await prisma.planSubscription.findMany({
    where: { status: { in: ['PAST_DUE', 'CANCELLED'] }, licenseKey: { not: null } },
  });
  let cut = 0;
  for (const sub of due) {
    const deadline = (sub.nextPaymentAt ? sub.nextPaymentAt.getTime() : sub.updatedAt.getTime()) + GRACE_DAYS * 86400000;
    if (now.getTime() < deadline) continue;
    if (!sub.licenseKey) continue;
    const revoked = await revokeLicense(sub.licenseKey);
    if (revoked.ok) {
      cut += 1;
      await prisma.planSubscription.update({ where: { id: sub.id }, data: { notes: `Corte por falta de pago (${now.toISOString()})` } });
    } else {
      console.error('[subscriptions] no se pudo revocar la licencia:', sub.externalRef, revoked.error);
    }
  }
  return cut;
}

/** Arranca el enforcement periódico. Solo en modo nube (no en el escritorio). */
export function startSubscriptionEnforcement(intervalMs = 6 * 60 * 60 * 1000): void {
  if (env.LICENSE_INSTALLATION_ID) return;
  const tick = () => {
    enforceSubscriptions().catch((err) => console.error('[subscriptions] enforcement:', (err as Error).message));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
}
