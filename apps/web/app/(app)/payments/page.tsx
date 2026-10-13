'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@fitsystem/utils';
import { PAYMENT_METHOD_LABELS, PAYMENT_CONCEPT_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/labels';
import type { Payment } from '@/lib/types';
import { PaymentFormModal } from '@/components/payment-form';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface Summary {
  total: number;
  count: number;
  pending: number;
  byMethod: Record<string, number>;
  byConcept: Record<string, number>;
}

interface PendingData {
  debts: { id: string; memberId: string; memberName: string; memberCode: string; phone?: string | null; planName: string; dueDate: string; overdueDays: number; amount: number }[];
  expiring: { id: string; memberId: string; memberName: string; memberCode: string; phone?: string | null; planName: string; dueDate: string; daysLeft: number; amount: number }[];
}

export default function PaymentsPage() {
  const toast = useToast();
  const { user, organization } = useAuth();
  const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const currency = organization?.currency || 'ARS';

  const [tab, setTab] = useState<'list' | 'debts'>('list');
  const [items, setItems] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState<PendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [creditTarget, setCreditTarget] = useState<Payment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        http.get<{ items: Payment[] }>('/payments', { method, status, from, to, pageSize: 50 }),
        http.get<Summary>('/payments/summary', { from, to }),
      ]);
      setItems(res.items);
      setSummary(sum);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar pagos');
    } finally {
      setLoading(false);
    }
  }, [method, status, from, to, toast]);

  useEffect(() => {
    if (tab === 'list') load();
  }, [tab, load]);

  useEffect(() => {
    if (tab !== 'debts') return;
    http
      .get<PendingData>('/payments/pending')
      .then(setPending)
      .catch(() => undefined);
  }, [tab]);

  async function onVoid(id: string) {
    if (!window.confirm('¿Anular este pago? Se registrará una contra-operación.')) return;
    try {
      await http.post(`/payments/${id}/void`);
      toast.success('Pago anulado');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error');
    }
  }

  async function onPrint(id: string) {
    try {
      await http.post(`/integrations/print/receipt/${id}`);
      toast.success('Comprobante enviado a la impresora');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo imprimir');
    }
  }

  return (
    <div>
      <PageHeader
        title="Cobranzas"
        subtitle="Pagos, ingresos y deudas"
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={16} /> Registrar pago
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Ingresos del período" value={formatMoney(summary?.total ?? 0, currency)} accent="green" />
        <StatCard label="Pagos registrados" value={summary?.count ?? 0} accent="blue" />
        <StatCard label="Pendientes" value={summary?.pending ?? 0} accent="yellow" />
        <StatCard label="Deudas activas" value={pending?.debts.length ?? '-'} accent="red" />
      </div>

      <div className="mt-5 mb-4 flex gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          onClick={() => setTab('list')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${tab === 'list' ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-alt'}`}
        >
          Historial de pagos
        </button>
        <button
          onClick={() => setTab('debts')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${tab === 'debts' ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-alt'}`}
        >
          Deudas y por vencer
        </button>
      </div>

      {tab === 'list' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Field label="Desde">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Medio de pago">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {loading ? (
            <div className="flex justify-center py-20 text-text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <Table head={['Referencia', 'Socio', 'Concepto', 'Medio', 'Monto', 'Estado', 'Fecha', '']} empty="Sin pagos">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-surface-alt/40">
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{p.reference}</td>
                  <td className="px-4 py-3 text-text">
                    {p.member ? `${p.member.firstName} ${p.member.lastName}` : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color="blue">{PAYMENT_CONCEPT_LABELS[p.concept] ?? p.concept}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                  <td className="px-4 py-3 font-semibold text-text">{formatMoney(p.amount, currency)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} label={PAYMENT_STATUS_LABELS[p.status]} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(p.paidAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {p.status === 'COMPLETED' && (
                        <Button size="sm" variant="ghost" onClick={() => onPrint(p.id)}>
                          Imprimir
                        </Button>
                      )}
                      {isAdmin && p.status === 'COMPLETED' && p.invoiceNumber && (
                        <Button size="sm" variant="ghost" onClick={() => setCreditTarget(p)}>
                          Nota de crédito
                        </Button>
                      )}
                      {isAdmin && p.status === 'COMPLETED' && (
                        <Button size="sm" variant="ghost" onClick={() => onVoid(p.id)}>
                          Anular
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {tab === 'debts' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={`Cuotas vencidas (${pending?.debts.length ?? 0})`} padded={false}>
            {!pending?.debts.length ? (
              <div className="p-6 text-center text-sm text-text-muted">Sin deudas 🎉</div>
            ) : (
              <ul className="divide-y divide-line">
                {pending.debts.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-text">{d.memberName}</div>
                      <div className="text-xs text-text-muted">
                        {d.planName} · {d.memberCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-danger">{formatMoney(d.amount, currency)}</div>
                      <Badge color="red">{d.overdueDays} días</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Próximos vencimientos (${pending?.expiring.length ?? 0})`} padded={false}>
            {!pending?.expiring.length ? (
              <div className="p-6 text-center text-sm text-text-muted">Sin vencimientos próximos</div>
            ) : (
              <ul className="divide-y divide-line">
                {pending.expiring.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-text">{d.memberName}</div>
                      <div className="text-xs text-text-muted">
                        {d.planName} · {d.memberCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-text">{formatMoney(d.amount, currency)}</div>
                      <Badge color={d.daysLeft <= 2 ? 'red' : 'yellow'}>{d.daysLeft} días</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <PaymentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <CreditNoteModal
        payment={creditTarget}
        onClose={() => setCreditTarget(null)}
        onSaved={() => {
          setCreditTarget(null);
          load();
        }}
      />
    </div>
  );
}

function CreditNoteModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [invoiceType, setInvoiceType] = useState('C');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payment) {
      setInvoiceType('C');
      setReason('');
    }
  }, [payment]);

  if (!payment) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!payment) return;
    setSaving(true);
    try {
      const res = await http.post<{ number: string; tipoLabel?: string; mode?: string }>('/integrations/arca/credit-notes', {
        paymentId: payment.id,
        invoiceType,
        reason: reason || undefined,
      });
      toast.success(`Nota de crédito ${res.number} emitida`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al emitir la nota de crédito');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text">Nota de crédito</h2>
        <p className="mt-1 text-sm text-text-muted">
          Anula el comprobante {payment.invoiceNumber} del pago {payment.reference}.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Tipo de nota de crédito">
            <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
              <option value="C">Nota de crédito C</option>
              <option value="B">Nota de crédito B</option>
              <option value="A">Nota de crédito A</option>
            </Select>
          </Field>
          <Field label="Motivo (opcional)">
            <Input value={reason} placeholder="Anulación" onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Emitir nota de crédito
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}