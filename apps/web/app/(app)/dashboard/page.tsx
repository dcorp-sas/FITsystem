'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDate } from '@fitsystem/utils';
import type { DashboardData } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function DashboardPage() {
  const { user, organization, branches, activeBranchId } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await http.get<DashboardData>('/reports/dashboard');
      setData(d);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar el panel');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  if (loading && !data) return <SpinnerPage />;
  if (!data) return null;

  const maxIncome = Math.max(1, ...data.evolution.map((e) => e.income));
  const currency = organization?.currency || 'ARS';

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.name?.split(' ')[0]} 👋`}
        subtitle={
          organization
            ? `${organization.name}${branches.length > 1 ? ' · ' + (branches.find((b) => b.id === activeBranchId)?.name ?? 'Todas las sedes') : ''}`
            : undefined
        }
        action={
          <div className="flex gap-2">
            <Link href="/attendance">
              <Button variant="secondary">
                <Icon name="attendance" size={16} /> Check-in
              </Button>
            </Link>
            <Link href="/members">
              <Button>
                <Icon name="plus" size={16} /> Nuevo socio
              </Button>
            </Link>
          </div>
        }
      />

      {data.alerts.length > 0 && (
        <div className="mb-5 flex flex-col gap-2">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                a.severity === 'danger'
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : a.severity === 'warning'
                    ? 'border-warning/40 bg-warning/10 text-warning'
                    : 'border-primary/40 bg-primary/10 text-primary-light'
              }`}
            >
              <span className="mt-0.5">
                <Icon name="notifications" size={16} />
              </span>
              <div>
                <div className="font-semibold">{a.title}</div>
                <div className="opacity-80">{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Socios activos" value={data.members.active} hint={<><Badge color="green">{data.members.frozen} congelados</Badge></>} accent="green" />
        <StatCard label="Ingresos del mes" value={formatMoney(data.income.month, currency)} hint={`${data.income.paymentCount} pagos`} accent="blue" />
        <StatCard label="Asistencia hoy" value={data.attendance.today} hint={`${data.attendance.entriesToday} entradas`} accent="sky" />
        <StatCard label="Deuda total" value={formatMoney(data.debts.total, currency)} hint={`${data.debts.count} cuotas vencidas`} accent={data.debts.count > 0 ? 'red' : 'green'} />
        <StatCard label="Nuevos este mes" value={data.members.newThisMonth} hint={`${data.members.total} activos`} accent="yellow" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Evolución (6 meses)" className="lg:col-span-2">
          <div className="space-y-3">
            {data.evolution.map((e) => (
              <div key={e.month} className="flex items-center gap-3 text-xs">
                <div className="w-14 shrink-0 text-text-muted">{e.month}</div>
                <div className="h-7 flex-1 overflow-hidden rounded bg-surface-alt">
                  <div
                    className="h-full rounded bg-gradient-to-r from-primary to-sky transition-all"
                    style={{ width: `${Math.max(3, (e.income / maxIncome) * 100)}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-right font-medium text-text">{formatMoney(e.income, currency)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Vencimientos esta semana">
          {data.expiring.count === 0 ? (
            <EmptyState icon="🎉" message="No hay vencimientos esta semana" />
          ) : (
            <div className="space-y-2">
              {data.expiring.items.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-alt/50 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-text">{e.memberName}</div>
                    <div className="text-[11px] text-text-muted">{e.plan} · {e.memberCode}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-muted">{formatDate(e.endDate)}</div>
                    <Badge color={e.daysLeft <= 2 ? 'red' : 'yellow'}>en {e.daysLeft} días</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Ingresos por medio de pago" className="lg:col-span-1">
          <MethodBreakdown breakdown={data.income.byMethod} currency={currency} />
        </Card>
        <Card title="Ingresos por concepto" className="lg:col-span-1">
          <MethodBreakdown breakdown={data.income.byConcept} currency={currency} />
        </Card>
        <Card title="Acceso rápido">
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/payments" icon="payments" label="Registrar pago" />
            <QuickLink href="/attendance" icon="attendance" label="Asistencia" />
            <QuickLink href="/shop" icon="shop" label="Minishop" />
            <QuickLink href="/cash" icon="cash" label="Caja" />
            <QuickLink href="/memberships" icon="memberships" label="Membresías" />
            <QuickLink href="/notifications" icon="notifications" label="Enviar aviso" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SpinnerPage() {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-text-muted">
      <Spinner className="h-6 w-6" /> Cargando panel...
    </div>
  );
}

function MethodBreakdown({ breakdown, currency }: { breakdown: Record<string, number>; currency: string }) {
  const entries = Object.entries(breakdown || {});
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!entries.length)
    return <EmptyState icon="📈" message="Sin ingresos en el período" />;
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="capitalize text-text-muted">{key.replace(/_/g, ' ').toLowerCase()}</span>
            <span className="font-medium text-text">{formatMoney(value, currency)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-primary" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: 'payments' | 'attendance' | 'shop' | 'cash' | 'memberships' | 'notifications'; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-1.5 rounded-lg border border-line bg-surface-alt/50 p-3 text-sm font-medium text-text transition hover:border-primary/40 hover:bg-surface-alt"
    >
      <Icon name={icon} size={18} className="text-primary-light" />
      {label}
    </Link>
  );
}