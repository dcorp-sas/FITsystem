'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api';

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

interface PlanInfo {
  tag: string;
  name: string;
  seats: number;
  monthly: number;
}
interface ProductInfo {
  tag: string;
  name: string;
  seats: number;
  amount: number;
  monthlyAmount?: number;
}
interface Catalog {
  configured: boolean;
  plans: PlanInfo[];
  products: ProductInfo[];
}

export interface SubscribeTarget {
  plan: string;
  name: string;
}

/**
 * Carrito de suscripción: el gym elige un plan mensual y suma packs de asientos
 * (recurrentes). Al "suscribirse" se crea el débito automático en MercadoPago y
 * se redirige para autorizarlo.
 */
export function SubscribeModal({ plan, onClose }: { plan: SubscribeTarget; onClose: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [packs, setPacks] = useState(0);
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', gymName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<Catalog>('/billing/plans')
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        if (!data.configured) setUnavailable(true);
      })
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, []);

  const planInfo = catalog?.plans.find((p) => p.tag === plan.plan);
  const packInfo = catalog?.products.find((p) => p.tag === 'SEAT_PACK');
  const base = planInfo?.monthly ?? 0;
  const packUnit = packInfo?.monthlyAmount ?? (packInfo ? Math.round(packInfo.amount / 10) : 0);
  const packSeats = packInfo?.seats ?? 100;
  const total = base + packs * packUnit;
  const seats = (planInfo?.seats ?? 0) + packs * packSeats;

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ externalRef: string; initPoint?: string }>('/billing/subscribe', {
        method: 'POST',
        body: { plan: plan.plan, seatPacks: packs, ...form },
      });
      if (!data.initPoint) {
        setError('MercadoPago no devolvió el enlace de pago. Probá de nuevo.');
        setLoading(false);
        return;
      }
      window.location.assign(data.initPoint);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la suscripción. Probá de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text">Suscribirte a {plan.name}</h3>
            <p className="mt-1 text-sm text-text-muted">Débito automático todos los meses. Cancelás cuando quieras.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-line p-1.5 text-text-muted hover:text-text">
            <Icon name="close" size={18} />
          </button>
        </div>

        {unavailable ? (
          <p className="mt-5 rounded-lg border border-line bg-base px-4 py-6 text-center text-sm text-text-muted">
            La pasarela de pago no está disponible en este momento. Escribinos y coordinamos tu suscripción.
          </p>
        ) : (
          <form onSubmit={subscribe} className="mt-5 space-y-4">
            <div className="rounded-xl border border-line bg-base p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text">
                  Plan {plan.name} · {planInfo?.seats ?? '…'} socios
                </span>
                <span className="font-semibold text-text">{ars.format(base)}/mes</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <div className="text-sm">
                  <div className="text-text">Packs de asientos</div>
                  <div className="text-xs text-text-muted">
                    +{packSeats} socios por {ars.format(packUnit)}/mes
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPacks((n) => Math.max(0, n - 1))}
                    className="h-8 w-8 rounded-lg border border-line text-lg leading-none text-text hover:bg-surface-alt"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-text">{packs}</span>
                  <button
                    type="button"
                    onClick={() => setPacks((n) => Math.min(50, n + 1))}
                    className="h-8 w-8 rounded-lg border border-line text-lg leading-none text-text hover:bg-surface-alt"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                <span className="text-text-muted">{seats} socios con app · total mensual</span>
                <span className="text-base font-bold text-text">{ars.format(total)}/mes</span>
              </div>
            </div>

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

            <label className="flex items-start gap-2 text-xs leading-5 text-text-muted">
              <input type="checkbox" required className="mt-1" />
              <span>Leí y acepto los <a href="/terminos" target="_blank" rel="noreferrer" className="text-primary-light underline">Términos y condiciones</a> y la <a href="/privacidad" target="_blank" rel="noreferrer" className="text-primary-light underline">Política de privacidad</a>. <a href="/arrepentimiento" target="_blank" rel="noreferrer" className="text-primary-light underline">Ver cancelación y reembolsos</a>.</span>
            </label>

            {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading || !catalog}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              <Icon name="card" size={18} />
              {loading ? 'Redirigiendo…' : `Suscribirme · ${ars.format(total)}/mes`}
            </button>
            <p className="text-center text-xs text-text-muted">
              Autorizás el débito automático mensual con MercadoPago. No guardamos los datos de tu tarjeta.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
