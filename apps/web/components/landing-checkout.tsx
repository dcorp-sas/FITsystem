'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon';
import { api, ApiError } from '@/lib/api';

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export interface CheckoutTarget {
  /** Etiqueta enviada al backend: plan (BASIC/PRO/ENTERPRISE) o producto (SEAT_PACK/MP_KIT). */
  plan: string;
  period?: 'MONTHLY' | 'ANNUAL';
  /** Título del formulario de compra, ej. "Comprar plan Pro". */
  title: string;
  /** Detalle debajo del título, ej. "Anual (2 meses gratis) · $750.000". */
  subtitle: string;
  amount: number;
  /** Nota final del modal (según sea licencia o complemento). */
  note?: string;
}

export function CheckoutModal({ target, onClose }: { target: CheckoutTarget; onClose: () => void }) {
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', gymName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ initPoint: string }>('/billing/checkout', {
        method: 'POST',
        body: { plan: target.plan, period: target.period, ...form },
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
            <h3 className="text-lg font-bold text-text">{target.title}</h3>
            <p className="mt-1 text-sm text-text-muted">{target.subtitle}</p>
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
            {loading ? 'Redirigiendo a MercadoPago…' : `Pagar ${ars.format(target.amount)}`}
          </button>
          <p className="text-center text-xs text-text-muted">
            {target.note ?? 'Pago seguro con MercadoPago. Al aprobarse se emite tu clave de licencia y te llega por email.'}
          </p>
        </form>
      </div>
    </div>
  );
}

/** Botón que abre el formulario de compra (Checkout Pro) para un plan o producto. */
export function BuyButton({
  target,
  className,
  icon = 'card',
  children,
}: {
  target: CheckoutTarget;
  className?: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Icon name={icon} size={16} />
        {children}
      </button>
      {open && <CheckoutModal target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
