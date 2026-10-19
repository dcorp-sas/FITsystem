'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { CheckoutModal, type CheckoutTarget } from '@/components/landing-checkout';
import { SubscribeModal, type SubscribeTarget } from '@/components/landing-subscribe';

type Period = 'MONTHLY' | 'ANNUAL';
type PlanTag = 'BASIC' | 'PRO' | 'ENTERPRISE';

interface PlanDef {
  tag: PlanTag;
  name: string;
  seats: string;
  monthly: number;
  annual: number;
  popular?: boolean;
  features: string[];
}

// Debe coincidir con PLAN_CATALOG del backend (apps/api/src/services/billing.ts).
const PLANS: PlanDef[] = [
  {
    tag: 'BASIC',
    name: 'Básico',
    seats: 'Hasta 100 socios con app',
    monthly: 45000,
    annual: 450000,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y facturación', 'Soporte por email'],
  },
  {
    tag: 'PRO',
    name: 'Pro',
    seats: 'Hasta 300 socios con app',
    monthly: 75000,
    annual: 750000,
    popular: true,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y facturación', 'Reportes por sede', 'Soporte prioritario'],
  },
  {
    tag: 'ENTERPRISE',
    name: 'Empresa',
    seats: 'Hasta 500 socios con app',
    monthly: 140000,
    annual: 1400000,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y facturación', 'Sedes y reportes avanzados', 'Soporte prioritario'],
  },
];

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function LandingPlans({ setupUrl, trialDays }: { setupUrl: string; trialDays: number }) {
  const [period, setPeriod] = useState<Period>('ANNUAL');
  const [checkout, setCheckout] = useState<CheckoutTarget | null>(null);
  const [subscribe, setSubscribe] = useState<SubscribeTarget | null>(null);

  function openCheckout(plan: PlanDef, period: Period) {
    const amount = period === 'ANNUAL' ? plan.annual : plan.monthly;
    setCheckout({
      plan: plan.tag,
      period,
      title: `Comprar plan ${plan.name}`,
      subtitle: `${period === 'ANNUAL' ? 'Anual (2 meses gratis)' : 'Mensual'} · ${ars.format(amount)}`,
      amount,
    });
  }

  function buy(plan: PlanDef) {
    if (period === 'MONTHLY') setSubscribe({ plan: plan.tag, name: plan.name });
    else openCheckout(plan, period);
  }

  return (
    <div>
      <div className="mt-10 flex justify-center">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setPeriod('MONTHLY')}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              period === 'MONTHLY' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setPeriod('ANNUAL')}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              period === 'ANNUAL' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            Anual
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                period === 'ANNUAL' ? 'bg-white/20 text-white' : 'bg-success/20 text-success'
              }`}
            >
              2 meses gratis
            </span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-4">
        {/* Prueba gratis */}
        <div className="relative flex flex-col rounded-2xl border border-dashed border-line bg-surface/50 p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">TRIAL</div>
          <h3 className="mt-1 text-lg font-bold text-text">Prueba</h3>
          <div className="mt-4">
            <div className="text-3xl font-bold text-text">Gratis</div>
            <div className="text-xs text-text-muted">{trialDays} días · sin tarjeta</div>
          </div>
          <ul className="mt-6 flex-1 space-y-3">
            {['Todos los módulos', 'Hasta 10 socios con app', 'Sin tarjeta', 'Soporte por email'].map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-text-muted">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>
          <a
            href={setupUrl}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-line text-sm font-medium text-text transition-colors hover:bg-surface-alt"
          >
            Descargar gratis
          </a>
        </div>

        {/* Planes pagos */}
        {PLANS.map((plan) => {
          const amount = period === 'ANNUAL' ? plan.annual : plan.monthly;
          const monthlyEquivalent = Math.round(plan.annual / 12);
          return (
            <div
              key={plan.tag}
              className={`relative flex flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1 ${
                plan.popular
                  ? 'bg-gradient-to-b from-primary/25 to-surface ring-1 ring-primary/50 ring-glow'
                  : 'border border-line bg-surface'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white shadow-lg shadow-primary/40">
                  Más elegido
                </span>
              )}
              <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.tag}</div>
              <h3 className="mt-1 text-lg font-bold text-text">{plan.name}</h3>
              <div className="mt-4">
                <div className="text-3xl font-bold text-text">{ars.format(amount)}</div>
                <div className="text-xs text-text-muted">
                  {period === 'ANNUAL' ? (
                    <>
                      por año · ARS
                      <span className="ml-1 text-success">≈ {ars.format(monthlyEquivalent)}/mes</span>
                    </>
                  ) : (
                    'por mes · ARS'
                  )}
                </div>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                <li className="flex items-start gap-2.5 text-sm font-medium text-text">
                  <Icon name="members" size={16} className="mt-0.5 shrink-0 text-primary-light" />
                  {plan.seats}
                </li>
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-text-muted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => buy(plan)}
                className={`mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${
                  plan.popular
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-dark'
                    : 'border border-line text-text hover:bg-surface-alt'
                }`}
              >
                <Icon name="card" size={16} />
                {period === 'ANNUAL' ? 'Comprar anual' : 'Suscribirme'}
              </button>
            </div>
          );
        })}
      </div>

      {checkout && <CheckoutModal target={checkout} onClose={() => setCheckout(null)} />}
      {subscribe && <SubscribeModal plan={subscribe} onClose={() => setSubscribe(null)} />}
    </div>
  );
}
