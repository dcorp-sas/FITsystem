'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api';

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
    seats: 'Hasta 500 socios con app',
    monthly: 75000,
    annual: 750000,
    popular: true,
    features: ['Todos los módulos', 'App del socio incluida', 'Reportes por sede', 'Soporte prioritario'],
  },
  {
    tag: 'ENTERPRISE',
    name: 'Empresa',
    seats: 'Socios ilimitados con app',
    monthly: 140000,
    annual: 1400000,
    features: ['Sedes y reportes avanzados', 'Onboarding acompañado', 'Soporte dedicado', 'Migración asistida'],
  },
];

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

function CheckoutModal({
  plan,
  period,
  onClose,
}: {
  plan: PlanDef;
  period: Period;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', gymName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = period === 'ANNUAL' ? plan.annual : plan.monthly;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ initPoint: string }>('/billing/checkout', {
        method: 'POST',
        body: { plan: plan.tag, period, ...form },
      });
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la compra. Probá de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text">Comprar plan {plan.name}</h3>
            <p className="mt-1 text-sm text-text-muted">
              {period === 'ANNUAL' ? 'Anual (2 meses gratis)' : 'Mensual'} · {ars.format(amount)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-line p-1.5 text-text-muted hover:text-text">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            required
            placeholder="Tu nombre y apellido"
            value={form.buyerName}
            onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
            className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
          />
          <input
            type="email"
            required
            placeholder="Email"
            value={form.buyerEmail}
            onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })}
            className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
          />
          <input
            type="tel"
            placeholder="Teléfono (opcional)"
            value={form.buyerPhone}
            onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })}
            className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
          />
          <input
            placeholder="Nombre del gimnasio (opcional)"
            value={form.gymName}
            onChange={(e) => setForm({ ...form, gymName: e.target.value })}
            className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
          />

          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            <Icon name="card" size={18} />
            {loading ? 'Redirigiendo a MercadoPago…' : `Pagar ${ars.format(amount)}`}
          </button>
          <p className="text-center text-xs text-text-muted">
            Pago seguro con MercadoPago. Al aprobarse se emite tu clave de licencia y te llega por email.
          </p>
        </form>
      </div>
    </div>
  );
}

export function LandingPlans({ setupUrl, trialDays }: { setupUrl: string; trialDays: number }) {
  const [period, setPeriod] = useState<Period>('ANNUAL');
  const [checkout, setCheckout] = useState<{ plan: PlanDef; period: Period } | null>(null);

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
            <span className="rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-semibold text-success">2 meses gratis</span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-4">
        {/* Prueba gratis */}
        <div className="relative flex flex-col rounded-2xl border border-line bg-surface p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">TRIAL</div>
          <h3 className="mt-1 text-lg font-bold text-text">Prueba</h3>
          <div className="mt-4">
            <div className="text-2xl font-bold text-text">Gratis</div>
            <div className="text-xs text-text-muted">{trialDays} días</div>
          </div>
          <ul className="mt-5 flex-1 space-y-2.5">
            {['Todos los módulos', 'Hasta 10 socios con app', 'Sin tarjeta', 'Soporte por email'].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-text-muted">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>
          <a
            href={setupUrl}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-line text-sm font-medium text-text transition-colors hover:bg-surface-alt"
          >
            Descargar gratis
          </a>
        </div>

        {/* Planes pagos */}
        {PLANS.map((plan) => {
          const amount = period === 'ANNUAL' ? plan.annual : plan.monthly;
          return (
            <div
              key={plan.tag}
              className={`relative flex flex-col rounded-2xl border bg-surface p-6 ${
                plan.popular ? 'border-primary/60 shadow-xl shadow-primary/10' : 'border-line'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">
                  Más elegido
                </span>
              )}
              <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.tag}</div>
              <h3 className="mt-1 text-lg font-bold text-text">{plan.name}</h3>
              <div className="mt-4">
                <div className="text-2xl font-bold text-text">{ars.format(amount)}</div>
                <div className="text-xs text-text-muted">
                  {period === 'ANNUAL' ? 'por año' : 'por mes'} · ARS
                </div>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                  {plan.seats}
                </li>
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-text-muted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setCheckout({ plan, period })}
                className={`mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
                  plan.popular
                    ? 'bg-primary text-white hover:bg-primary-dark'
                    : 'border border-line text-text hover:bg-surface-alt'
                }`}
              >
                <Icon name="card" size={16} />
                Comprar {period === 'ANNUAL' ? 'anual' : 'mensual'}
              </button>
            </div>
          );
        })}
      </div>

      {checkout && (
        <CheckoutModal plan={checkout.plan} period={checkout.period} onClose={() => setCheckout(null)} />
      )}
    </div>
  );
}
