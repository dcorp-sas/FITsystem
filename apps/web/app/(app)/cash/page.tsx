'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@fitsystem/utils';
import { CASH_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { CashSession, CashMovement } from '@/lib/types';
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
} from '@/components/ui';

export default function CashPage() {
  const toast = useToast();
  const { branches, activeBranchId, organization } = useAuth();
  const currency = organization?.currency || 'ARS';

  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [movement, setMovement] = useState({ type: 'EXPENSE', category: 'SUPPLIES', method: 'CASH', amount: '', description: '' });

  const branchId = activeBranchId || branches[0]?.id || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, sessions] = await Promise.all([
        http.get<CashSession | null>('/cash/sessions/current', { branchId }),
        http.get<CashSession[]>('/cash/sessions'),
      ]);
      setSession(current);
      setHistory(sessions);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar la caja');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function onOpen() {
    try {
      await http.post('/cash/sessions/open', { branchId, openingAmount: Number(openingAmount || 0) });
      toast.success('Caja abierta');
      setOpeningAmount('');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al abrir caja');
    }
  }

  async function onClose() {
    if (!session) return;
    try {
      await http.post(`/cash/sessions/${session.id}/close`, { closingAmount: Number(closingAmount || 0), notes: closeNotes || null });
      toast.success('Caja cerrada');
      setClosingAmount('');
      setCloseNotes('');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cerrar caja');
    }
  }

  async function onAddMovement(e: React.FormEvent) {
    e.preventDefault();
    try {
      await http.post('/cash/movements', {
        branchId,
        type: movement.type,
        category: movement.category,
        method: movement.method,
        amount: Number(movement.amount),
        description: movement.description || null,
      });
      toast.success('Movimiento registrado');
      setMovement((m) => ({ ...m, amount: '', description: '' }));
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al registrar movimiento');
    }
  }

  if (loading && !session && history.length === 0) {
    return (
      <div className="flex justify-center py-24 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const movements: CashMovement[] = session?.movements ?? [];

  return (
    <div>
      <PageHeader title="Caja" subtitle="Apertura, cierre y movimientos" />

      {!session ? (
        <Card title="Abrir caja" className="max-w-md">
          <p className="mb-4 text-sm text-text-muted">No hay una caja abierta en esta sede.</p>
          <div className="flex items-end gap-3">
            <Field label="Monto inicial" className="flex-1">
              <Input type="number" step="0.01" min="0" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Button onClick={onOpen}>Abrir caja</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Monto inicial" value={formatMoney(session.openingAmount, currency)} />
            <StatCard label="Ingresos" value={formatMoney(session.totals?.income ?? 0, currency)} accent="green" />
            <StatCard label="Egresos" value={formatMoney(session.totals?.expense ?? 0, currency)} accent="red" />
            <StatCard label="Esperado en caja" value={formatMoney(session.totals?.expected ?? 0, currency)} accent="blue" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Movimientos de la sesión" padded={false}>
                <Table head={['Tipo', 'Categoría', 'Descripción', 'Medio', 'Monto', 'Hora']} empty="Sin movimientos">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3">
                        <span className={m.type === 'INCOME' ? 'text-success' : 'text-danger'}>
                          {m.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{CASH_CATEGORY_LABELS[m.category] ?? m.category}</td>
                      <td className="px-4 py-3 text-text-muted">{pdescription(m)}</td>
                      <td className="px-4 py-3 text-text-muted">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</td>
                      <td className={`px-4 py-3 font-medium ${m.type === 'INCOME' ? 'text-success' : 'text-danger'}`}>
                        {m.type === 'INCOME' ? '+' : '-'}
                        {formatMoney(m.amount, currency)}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(m.createdAt)}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card title="Registrar movimiento" className="lg:col-span-2">
              <form onSubmit={onAddMovement} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tipo">
                  <Select value={movement.type} onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value }))}>
                    <option value="EXPENSE">Egreso</option>
                    <option value="INCOME">Ingreso</option>
                  </Select>
                </Field>
                <Field label="Categoría">
                  <Select value={movement.category} onChange={(e) => setMovement((m) => ({ ...m, category: e.target.value }))}>
                    {Object.entries(CASH_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Medio">
                  <Select value={movement.method} onChange={(e) => setMovement((m) => ({ ...m, method: e.target.value }))}>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Monto *">
                  <Input type="number" step="0.01" min="0.01" required value={movement.amount} onChange={(e) => setMovement((m) => ({ ...m, amount: e.target.value }))} />
                </Field>
                <Field label="Descripción" className="sm:col-span-2">
                  <Input value={movement.description} onChange={(e) => setMovement((m) => ({ ...m, description: e.target.value }))} />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit">Registrar movimiento</Button>
                </div>
              </form>
            </Card>

            <Card title="Cerrar caja">
              <div className="space-y-4">
                <Field label="Monto de cierre">
                  <Input type="number" step="0.01" min="0" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} />
                </Field>
                <Field label="Notas">
                  <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
                </Field>
                <div className="rounded-lg border border-line bg-surface-alt/50 p-3 text-xs text-text-muted">
                  Esperado en caja: <span className="font-semibold text-text">{formatMoney(session.totals?.expected ?? 0, currency)}</span>
                </div>
                <Button variant="danger" className="w-full" onClick={onClose}>
                  Cerrar caja
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {history.length > 0 && (
        <Card title="Historial de cajas" className="mt-5" padded={false}>
          <Table head={['Apertura', 'Cierre', 'Inicial', 'Esperado', 'Contado', 'Diferencia', 'Operador']} empty="Sin registros">
            {history.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(s.openedAt)}</td>
                <td className="px-4 py-3 text-xs text-text-muted">{s.closedAt ? formatDateTime(s.closedAt) : <span className="text-success">abierta</span>}</td>
                <td className="px-4 py-3">{formatMoney(s.openingAmount, currency)}</td>
                <td className="px-4 py-3">{s.expectedAmount != null ? formatMoney(s.expectedAmount, currency) : '-'}</td>
                <td className="px-4 py-3">{s.closingAmount != null ? formatMoney(s.closingAmount, currency) : '-'}</td>
                <td className={`px-4 py-3 font-medium ${s.difference && s.difference < 0 ? 'text-danger' : s.difference ? 'text-success' : ''}`}>
                  {s.difference != null ? formatMoney(s.difference, currency) : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">{s.openedBy?.name ?? '-'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function pdescription(m: CashMovement) {
  return m.description || '—';
}