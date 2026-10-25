'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { SubscribeModal, type SubscribeTarget } from '@/components/landing-subscribe';

type PlanTag = 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface PlanDef {
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
    monthly: 39900,
    annual: 39900,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y registro de pagos', 'Soporte por email'],
  },
  {
    tag: 'PRO',
    name: 'Pro',
    seats: 'Hasta 300 socios con app',
    monthly: 64900,
    annual: 64900,
    popular: true,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y registro de pagos', 'Reportes por sede', 'Soporte prioritario'],
  },
  {
    tag: 'ENTERPRISE',
    name: 'Empresa',
    seats: 'Hasta 500 socios con app',
    monthly: 109900,
    annual: 109900,
    features: ['Todos los módulos', 'App del socio incluida', 'Cobros con MercadoPago y registro de pagos', 'Sedes y reportes avanzados', 'Soporte prioritario'],
  },
];

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function LandingPlans({
  setupUrl,
  trialDays,
  plans,
}: {
  setupUrl: string;
  trialDays: number;
  plans?: PlanDef[];
}) {
  const list = plans && plans.length ? plans : PLANS;
  const [subscribe, setSubscribe] = useState<SubscribeTarget | null>(null);

  function buy(plan: PlanDef) {
    setSubscribe({ plan: plan.tag, name: plan.name });
  }

  return (
    <div>
      <p className="mt-10 text-center text-xs leading-relaxed text-text-muted">Importes en ARS por mes. El tratamiento de IVA y el comprobante fiscal aplicable se informan antes de confirmar el pago. Sin permanencia anual: renovás mes a mes.</p>

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
          <p className="mt-3 text-center text-xs leading-5 text-text-muted">¿Necesitás más tiempo para evaluar? <a href="https://wa.me/5492212005382?text=Hola%2C%20necesito%20m%C3%A1s%20tiempo%20para%20probar%20FIT%20system" target="_blank" rel="noreferrer" className="text-primary-light underline">Consultanos por WhatsApp</a>.</p>
        </div>

        {/* Planes pagos */}
        {list.map((plan) => {
          const amount = plan.monthly;
          
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
                  Plan destacado
                </span>
              )}
              <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.tag}</div>
              <h3 className="mt-1 text-lg font-bold text-text">{plan.name}</h3>
              <div className="mt-4">
                <div className="text-3xl font-bold text-text">{ars.format(amount)}</div>
                <div className="text-xs text-text-muted">por mes · ARS</div>
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
                Suscribirme
              </button>
            </div>
          );
        })}
      </div>

      {subscribe && <SubscribeModal plan={subscribe} onClose={() => setSubscribe(null)} />}
    </div>
  );
}
