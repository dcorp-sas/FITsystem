'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDate } from '@fitsystem/utils';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_CONCEPT_LABELS,
  CASH_CATEGORY_LABELS,
  RISK_LABELS,
} from '@/lib/labels';
import {
  Badge,
  Card,
  Input,
  PageHeader,
  Spinner,
  StatCard,
  Table,
} from '@/components/ui';

interface IncomeData {
  income: number;
  payments: number;
  byDate: Record<string, number>;
  byMethod: Record<string, number>;
  byConcept: Record<string, number>;
  expenses: { total: number; count: number; byCategory: Record<string, number> };
  net: number;
}

interface RetentionRow {
  month: string;
  joined: number;
  left: number;
  renewed: number;
  activeAtEnd: number;
}

interface PlanReport {
  id: string;
  name: string;
  type: string;
  price: number;
  active: number;
  monthlyPotential: number;
  color: string;
}

interface ChurnRow {
  id: string;
  name: string;
  phone?: string | null;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  lastVisitAt?: string | null;
  plan?: string | null;
}

type Tab = 'income' | 'retention' | 'plans' | 'churn';

const TABS: { key: Tab; label: string }[] = [
  { key: 'income', label: 'Ingresos' },
  { key: 'retention', label: 'Retención' },
  { key: 'plans', label: 'Planes' },
  { key: 'churn', label: 'Riesgo de abandono' },
];

export default function ReportsPage() {
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency || 'ARS';
  const [tab, setTab] = useState<Tab>('income');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [income, setIncome] = useState<IncomeData | null>(null);
  const [retention, setRetention] = useState<RetentionRow[]>([]);
  const [plans, setPlans] = useState<PlanReport[]>([]);
  const [churn, setChurn] = useState<ChurnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, ret, pl, ch] = await Promise.all([
        http.get<IncomeData>('/reports/income', { from, to }),
        http.get<RetentionRow[]>('/reports/retention'),
        http.get<PlanReport[]>('/reports/plans'),
        http.get<{ items: ChurnRow[] }>('/reports/churn'),
      ]);
      setIncome(inc);
      setRetention(ret);
      setPlans(pl);
      setChurn(ch.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDay = useMemo(() => Math.max(1, ...Object.values(income?.byDate ?? {})), [income]);

  return (
    <div>
      <PageHeader title="Reportes y estadísticas" subtitle="Análisis del negocio" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'rounded-md px-3 py-1.5 text-xs font-medium transition ' +
                (tab === t.key ? 'bg-primary text-white' : 'text-text-muted hover:text-text')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'income' && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 py-0 text-xs" />
            <span>a</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 py-0 text-xs" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {tab === 'income' && income && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Ingresos" value={formatMoney(income.income, currency)} accent="green" />
                <StatCard label="Egresos" value={formatMoney(income.expenses.total, currency)} accent="red" />
                <StatCard label="Neto" value={formatMoney(income.net, currency)} accent="blue" />
                <StatCard label="Pagos" value={income.payments} accent="sky" />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Ingresos por día" className="lg:col-span-2">
                  {Object.entries(income.byDate).length === 0 ? (
                    <EmptyLine text="Sin movimientos en el período" />
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(income.byDate).map(([date, value]) => (
                        <div key={date} className="flex items-center gap-3 text-xs">
                          <span className="w-24 text-text-muted">{date}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                            <div className="h-full rounded-full bg-primary" style={{ width: (value / maxDay) * 100 + '%' }} />
                          </div>
                          <span className="w-24 text-right text-text-muted">{formatMoney(value, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Por medio de pago">
                  <Breakdown items={income.byMethod} labels={PAYMENT_METHOD_LABELS} currency={currency} />
                </Card>

                <Card title="Por concepto">
                  <Breakdown items={income.byConcept} labels={PAYMENT_CONCEPT_LABELS} currency={currency} />
                </Card>

                <Card title="Egresos por categoría" className="lg:col-span-2">
                  {Object.keys(income.expenses.byCategory).length === 0 ? (
                    <EmptyLine text="Sin egresos en el período" />
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(income.expenses.byCategory).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between text-sm">
                          <span className="text-text-muted">{CASH_CATEGORY_LABELS[k] ?? k}</span>
                          <span className="font-medium text-danger">{formatMoney(v, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {tab === 'retention' && (
            <Card title="Altas, bajas y renovaciones (6 meses)" padded={false}>
              <Table head={['Mes', 'Altas', 'Bajas', 'Renovaciones', 'Activos al cierre']} empty="Sin datos">
                {retention.map((r) => (
                  <tr key={r.month}>
                    <td className="px-4 py-3 font-medium capitalize text-text">{r.month}</td>
                    <td className="px-4 py-3 text-success">{r.joined}</td>
                    <td className="px-4 py-3 text-danger">{r.left}</td>
                    <td className="px-4 py-3 text-text-muted">{r.renewed}</td>
                    <td className="px-4 py-3 text-text">{r.activeAtEnd}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {tab === 'plans' && (
            <Table head={['Plan', 'Precio', 'Activos', 'Potencial mensual']} empty="Sin planes">
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                      <span className="font-medium text-text">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{formatMoney(p.price, currency)}</td>
                  <td className="px-4 py-3 text-text">{p.active}</td>
                  <td className="px-4 py-3 font-medium text-success">{formatMoney(p.monthlyPotential, currency)}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === 'churn' && (
            <Table head={['Socio', 'Plan', 'Última visita', 'Riesgo', 'Score']} empty="Sin socios en riesgo">
              {churn.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{c.name}</div>
                    <div className="text-[11px] text-text-muted">{c.phone || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{c.plan || '—'}</td>
                  <td className="px-4 py-3 text-text-muted">{c.lastVisitAt ? formatDate(c.lastVisitAt) : 'Nunca'}</td>
                  <td className="px-4 py-3">
                    <Badge color={c.level === 'HIGH' ? 'red' : c.level === 'MEDIUM' ? 'yellow' : 'green'}>
                      {RISK_LABELS[c.level] ?? c.level}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{c.score}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-text-muted">{text}</div>;
}

function Breakdown({
  items,
  labels,
  currency,
}: {
  items: Record<string, number>;
  labels: Record<string, string>;
  currency: string;
}) {
  const entries = Object.entries(items);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <EmptyLine text="Sin datos" />;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-28 truncate text-text-muted">{labels[k] ?? k}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-primary" style={{ width: (v / max) * 100 + '%' }} />
          </div>
          <span className="w-24 text-right text-text">{formatMoney(v, currency)}</span>
        </div>
      ))}
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
