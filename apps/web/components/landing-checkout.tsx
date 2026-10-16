'use client';

import { useEffect, useState } from 'react';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
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
  /** Nota final del checkout (según sea licencia o complemento). */
  note?: string;
}

interface CardFormData {
  token: string;
  issuer_id?: string;
  payment_method_id: string;
  transaction_amount: number;
  installments: number;
  payment_method_option_id?: string;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
}

interface PayResult {
  status?: string;
  statusDetail?: string;
  paymentId?: string;
}

let mpInitialized = false;

export function CheckoutModal({ target, onClose }: { target: CheckoutTarget; onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'pay' | 'result'>('form');
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', gymName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [externalRef, setExternalRef] = useState<string | null>(null);
  const [amount, setAmount] = useState(target.amount);
  const [result, setResult] = useState<{ status?: string; statusDetail?: string } | null>(null);

  // Trae la Public Key del proveedor (y si la pasarela está configurada).
  useEffect(() => {
    let active = true;
    api<{ configured: boolean; publicKey: string }>('/billing/plans')
      .then((data) => {
        if (!active) return;
        if (!data.configured || !data.publicKey) setUnavailable(true);
        else setPublicKey(data.publicKey);
      })
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    if (!mpInitialized) {
      initMercadoPago(publicKey, { locale: 'es-AR' });
      mpInitialized = true;
    }
    setReady(true);
  }, [publicKey]);

  // Paso 1: datos del comprador -> registra la compra y pasa al pago.
  async function startPayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ externalRef: string; amount: number }>('/billing/checkout', {
        method: 'POST',
        body: { plan: target.plan, period: target.period, ...form },
      });
      setExternalRef(data.externalRef);
      if (data.amount) setAmount(data.amount);
      setLoading(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la compra. Probá de nuevo.');
      setLoading(false);
    }
  }

  // Paso 2: el Brick entrega el token; lo enviamos al backend para cobrar.
  async function submitCard(formData: CardFormData): Promise<void> {
    if (!externalRef) throw new Error('Compra no iniciada');
    setError(null);
    try {
      const result = await api<{ status?: string; statusDetail?: string; paymentId?: string }>('/billing/pay', {
        method: 'POST',
        body: {
          externalRef,
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          installments: formData.installments,
          issuerId: formData.issuer_id ?? null,
          payerEmail: formData.payer?.email || form.buyerEmail,
          identificationType: formData.payer?.identification?.type ?? null,
          identificationNumber: formData.payer?.identification?.number ?? null,
        },
      });
      setResult(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo procesar el pago.';
      setError(message);
      throw err;
    }
  }

  const approved = result?.status === 'approved';
  const pending = result?.status === 'in_process' || result?.status === 'pending' || result?.status === 'authorized';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl"
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

        {unavailable ? (
          <p className="mt-5 rounded-lg border border-line bg-base px-4 py-6 text-center text-sm text-text-muted">
            La pasarela de pago no está disponible en este momento. Escribinos y coordinamos tu compra.
          </p>
        ) : result ? (
          <div className="mt-5 space-y-3">
            <p className={`text-base font-semibold ${approved ? 'text-success' : pending ? 'text-text' : 'text-danger'}`}>
              {approved ? '¡Pago aprobado!' : pending ? 'Pago pendiente de confirmación' : 'El pago no se completó'}
            </p>
            <p className="text-sm text-text-muted">
              {approved
                ? target.note ??
                  'Te enviamos la confirmación por email. Al aprobarse se emite tu clave de licencia.'
                : pending
                  ? 'MercadoPago está procesando el pago. Te avisamos por email cuando se acredite.'
                  : 'No pudimos cobrar la tarjeta. Podés intentar con otra tarjeta o medio.'}
            </p>
            {!approved && !pending && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                Reintentar el pago
              </button>
            )}
          </div>
        ) : !externalRef ? (
          <form onSubmit={startPayment} className="mt-5 space-y-3">
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
              {loading ? 'Preparando…' : `Continuar al pago · ${ars.format(target.amount)}`}
            </button>
            <p className="text-center text-xs text-text-muted">Pago seguro con MercadoPago. No guardamos los datos de tu tarjeta.</p>
          </form>
        ) : (
          <div className="mt-5">
            <p className="mb-3 text-center text-sm text-text-muted">Pagás {ars.format(amount)} con tarjeta</p>
            {ready ? (
              <CardPayment
                initialization={{ amount, payer: { email: form.buyerEmail } }}
                customization={{ paymentMethods: { maxInstallments: 12 } }}
                locale="es-AR"
                onSubmit={submitCard}
              />
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Cargando el formulario de pago…</p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <p className="mt-3 text-center text-xs text-text-muted">
              {target.note ?? 'Pago seguro con MercadoPago. Al aprobarse se emite tu clave de licencia y te llega por email.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Botón que abre el checkout embebido (Card Payment Brick) para un plan o producto. */
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
