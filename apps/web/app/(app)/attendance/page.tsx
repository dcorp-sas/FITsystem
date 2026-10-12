'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatDate } from '@fitsystem/utils';
import { ATTENDANCE_METHOD_LABELS } from '@/lib/labels';
import type { Attendance } from '@/lib/types';
import { FaceCaptureModal } from '@/components/face-capture';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface TodayData {
  count: number;
  rawCount: number;
  items: Attendance[];
}

interface CheckinResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  member?: { id: string; memberCode: string; name: string } | null;
  plan?: string;
  membershipEndDate?: string;
}

export default function AttendancePage() {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const branchId = activeBranchId || branches[0]?.id || '';
  const [today, setToday] = useState<TodayData | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [peak, setPeak] = useState<{ hour: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('MANUAL');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [faceOpen, setFaceOpen] = useState(false);
  const [from, setFrom] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todayRes, historyRes, peakRes] = await Promise.all([
        http.get<TodayData>('/attendance/today'),
        http.get<{ items: Attendance[] }>('/attendance', { from: from || undefined }),
        http.get<{ peak: { hour: string; count: number }[] }>('/attendance/peak-hours'),
      ]);
      setToday(todayRes);
      setHistory(historyRes.items);
      setPeak(peakRes.peak);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar asistencias');
    } finally {
      setLoading(false);
    }
  }, [from, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await http.post<CheckinResult>('/attendance/checkin', {
        branchId,
        qr: code.trim(),
        method,
      });
      setResult(res);
      if (res.allowed) {
        toast.success('Ingreso registrado');
      } else {
        toast.error(res.message ?? 'Acceso rechazado');
      }
      setCode('');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al registrar entrada');
    } finally {
      setChecking(false);
    }
  }

  if (loading && !today) {
    return (
      <div className="flex justify-center py-24 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const maxPeak = Math.max(1, ...peak.map((p) => p.count));

  return (
    <div>
      <PageHeader title="Acceso y asistencia" subtitle="Control de ingresos" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Registrar ingreso">
            <form onSubmit={(e) => { setResult(null); checkin(e); }} className="space-y-4">
              <Field label="Código de socio o escanear QR">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: SOC-0001" autoFocus />
              </Field>
              <Field label="Método">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {Object.entries(ATTENDANCE_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" className="w-full" loading={checking}>
                <Icon name="attendance" size={16} /> Registrar ingreso
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-text-muted">
              <div className="h-px flex-1 bg-line" />
              o
              <div className="h-px flex-1 bg-line" />
            </div>

            <Button variant="secondary" className="w-full" onClick={() => setFaceOpen(true)}>
              <Icon name="activity" size={16} /> Check-in por rostro (cámara)
            </Button>

            {result && (
              <div
                className={
                  'mt-4 rounded-lg border p-3 text-sm ' +
                  (result.allowed ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger')
                }
              >
                <div className="font-semibold">{result.allowed ? 'Acceso permitido' : result.message || 'Acceso denegado'}</div>
                {result.member && <div className="mt-1 text-text">{result.member.name} · {result.member.memberCode}</div>}
                {result.plan && <div className="text-xs text-text-muted">Plan: {result.plan}</div>}
                {result.membershipEndDate && (
                  <div className="text-xs text-text-muted">Vence: {formatDate(result.membershipEndDate)}</div>
                )}
              </div>
            )}
          </Card>

          <Card title="Horarios pico (30 días)" className="mt-5">
            {!peak.length ? (
              <EmptyState icon="📈" message="Sin datos" />
            ) : (
              <div className="space-y-2">
                {peak.slice(0, 8).map((p) => (
                  <div key={p.hour} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-text-muted">{p.hour}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: (p.count / maxPeak) * 100 + '%' }} />
                    </div>
                    <span className="w-8 text-right text-text-muted">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Ingresos de hoy" value={today?.rawCount ?? 0} accent="blue" />
            <StatCard label="Socios únicos hoy" value={today?.count ?? 0} accent="green" />
          </div>

          <Card title="Ingresos de hoy" className="mt-5" padded={false}>
            <Table head={['Socio', 'Código', 'Plan', 'Método', 'Hora']} empty="Sin ingresos hoy">
              {(today?.items ?? []).map((a) => (
                <tr key={a.id}>
                   <td className="px-4 py-3 text-text">
                     {a.member ? a.member.firstName + ' ' + a.member.lastName : '—'}
                   </td>
                   <td className="px-4 py-3 font-mono text-xs text-text-muted">{a.member?.memberCode ?? '-'}</td>
                   <td className="px-4 py-3 text-text-muted">{a.membership?.plan?.name ?? '—'}</td>
                   <td className="px-4 py-3 text-text-muted">{ATTENDANCE_METHOD_LABELS[a.method] ?? a.method}</td>
                   <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(a.checkedInAt)}</td>
                 </tr>
               ))}
             </Table>
           </Card>

          <Card
            title="Historial"
            className="mt-5"
            action={
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Desde</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 py-0 text-xs" />
              </div>
            }
            padded={false}
          >
            {loading ? (
              <div className="flex justify-center py-16 text-text-muted">
                <Spinner className="h-6 w-6" />
              </div>
            ) : (
              <Table head={['Socio', 'Código', 'Método', 'Fecha']} empty="Sin registros">
                {history.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-text">
                      {a.member ? a.member.firstName + ' ' + a.member.lastName : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{a.member?.memberCode ?? '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{ATTENDANCE_METHOD_LABELS[a.method] ?? a.method}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(a.checkedInAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>

      <FaceCaptureModal
        open={faceOpen}
        onClose={() => setFaceOpen(false)}
        mode="verify"
        branchId={branchId}
        onDone={load}
      />
    </div>
  );
}