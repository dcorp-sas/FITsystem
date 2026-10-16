'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Purchase {
  plan: string;
  period: string;
  status: string;
  amount: number;
  currency: string;
  licenseKey: string | null;
}

const PLAN_LABEL: Record<string, string> = { BASIC: 'Básico', PRO: 'Pro', ENTERPRISE: 'Empresa' };

function formatArs(currency: string, amount: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function PurchaseStatus({ externalRef, estado }: { externalRef: string; estado: string }) {
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(Boolean(externalRef));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!externalRef) return;
    let active = true;
    api<Purchase>(`/billing/purchase/${externalRef}`)
      .then((data) => {
        if (active) setPurchase(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'No pudimos leer tu compra.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [externalRef]);

  if (!externalRef) {
    return (
      <p className="text-sm text-text-muted">
        No encontramos una referencia de compra. Si el problema persiste, escribinos y lo revisamos.
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm text-text-muted">Consultando el estado de tu compra…</p>;
  }
  if (error || !purchase) {
    return <p className="text-sm text-danger">{error ?? 'No pudimos leer tu compra.'}</p>;
  }

  const paid = purchase.status === 'PAID';
  const failed = estado === 'failure' && !paid;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-text">
        {paid ? '¡Pago aprobado!' : failed ? 'El pago no se completó' : 'Pago pendiente'}
      </h1>
      <p className="text-sm text-text-muted">
        {PLAN_LABEL[purchase.plan] ?? purchase.plan} · {purchase.period === 'ANNUAL' ? 'anual' : 'mensual'} ·{' '}
        {new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: purchase.currency,
          maximumFractionDigits: 0,
        }).format(purchase.amount)}
      </p>

      {paid &&
        (purchase.licenseKey ? (
          <div className="mt-4 rounded-xl border border-line bg-base p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">Tu clave de licencia</p>
            <p className="mt-1 break-all font-mono text-sm text-text">{purchase.licenseKey}</p>
            <p className="mt-2 text-xs text-text-muted">
              También te la enviamos por email. Activala en la app: Configuración &gt; Licencia.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">Te enviamos la clave de licencia por email en breve.</p>
        ))}

      {!paid && !failed && (
        <p className="mt-4 text-sm text-text-muted">
          Estamos esperando la confirmación de MercadoPago. Si ya pagaste, en unos minutos se acredita y te llega la
          licencia por email.
        </p>
      )}
      {failed && (
        <p className="mt-4 text-sm text-text-muted">Podés intentarlo de nuevo desde la sección de planes.</p>
      )}
    </div>
  );
}

export default PurchaseStatus;
