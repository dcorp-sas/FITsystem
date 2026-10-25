'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatDate } from '@fitsystem/utils';
import { ATTENDANCE_METHOD_LABELS } from '@/lib/labels';
import { detectHardware } from '@/lib/hardware';
import type { Attendance } from '@/lib/types';
import { FaceCaptureModal } from '@/components/face-capture';
import { FingerprintCaptureModal } from '@/components/fingerprint-capture';
import {
  Badge,
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

interface HardwareDevice {
  kind: string;
  label: string;
  method: string;
  available: boolean;
  source?: string;
  detail?: string | null;
}

interface DeviceProfile {
  branchId: string;
  platform: string;
  devices: HardwareDevice[];
  scannedAt: string;
}

interface AccessQrData {
  enabled: boolean;
  rotation: string;
  size: number;
  color: string;
  title: string;
  subtitle: string;
  footer: string;
  branchId: string;
  payload: string;
  image: string | null;
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
  const [methods, setMethods] = useState<string[]>(Object.keys(ATTENDANCE_METHOD_LABELS));
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [faceOpen, setFaceOpen] = useState(false);
  const [fingerprintOpen, setFingerprintOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [devices, setDevices] = useState<DeviceProfile | null>(null);
  const [scanning, setScanning] = useState(false);
  const isStandalone = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('standalone') === '1';
  const isQrDisplay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qrdisplay') === '1';

  async function openStandalone() {
    const openAccessWindow = typeof window !== 'undefined' ? window.fitsystem?.openAccessWindow : undefined;
    if (!openAccessWindow) {
      toast.error('Esta opción está disponible desde la aplicación de escritorio.');
      return;
    }
    await openAccessWindow();
  }

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

  const loadDevices = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await http.get<{ profile: DeviceProfile | null; methods?: string[] }>('/attendance/devices', { branchId });
      setDevices(res.profile);
      if (res.methods?.length) setMethods(res.methods);
    } catch {
      /* sin hardware cargado */
    }
  }, [branchId]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  async function scanHardware() {
    if (!branchId) return;
    setScanning(true);
    try {
      const scan = await detectHardware();
      const res = await http.post<{ profile: DeviceProfile }>('/attendance/devices', {
        branchId,
        platform: scan.platform,
        devices: scan.devices,
      });
      setDevices(res.profile);
      const found = scan.devices.filter((d) => d.available).length;
      toast.success(found > 0 ? `${found} dispositivo(s) detectado(s)` : 'No se detectó hardware adicional');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al detectar hardware');
    } finally {
      setScanning(false);
    }
  }

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

  if (isQrDisplay) {
    return <AccessQrCard branchId={branchId} displayMode />;
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
      <PageHeader
        title={isStandalone ? 'Terminal de acceso' : 'Acceso y asistencia'}
        subtitle={isStandalone ? 'QR, rostro y huella en una ventana independiente' : 'Control de ingresos'}
        action={
          !isStandalone ? (
            <Button variant="secondary" onClick={openStandalone}>
              <Icon name="activity" size={16} /> Abrir terminal aparte
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AccessQrCard branchId={branchId} />

          <Card title="Registrar ingreso" className="mt-5">
            <form onSubmit={(e) => { setResult(null); checkin(e); }} className="space-y-4">
              <Field label="Código de socio o escanear QR">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: SOC-0001" autoFocus />
              </Field>
              <Field label="Método">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((k) => (
                    <option key={k} value={k}>
                      {ATTENDANCE_METHOD_LABELS[k] ?? k}
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

            <Button variant="secondary" className="mt-2 w-full" onClick={() => setFingerprintOpen(true)}>
              <Icon name="activity" size={16} /> Check-in por huella (Windows Hello)
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

          <Card
            title="Dispositivos de acceso"
            className="mt-5"
            action={
              <Button variant="secondary" size="sm" onClick={scanHardware} loading={scanning}>
                <Icon name="activity" size={15} /> Detectar
              </Button>
            }
          >
            {!devices ? (
              <p className="text-sm text-text-muted">
                Detectá el hardware instalado en este equipo (lector de huellas, lector de tarjetas, cámara o lector QR).
              </p>
            ) : (
              <div className="space-y-2">
                {devices.devices.map((d, i) => (
                  <div key={`${d.kind}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-text">{d.label}</div>
                      <div className="truncate text-[11px] text-text-muted">{d.detail || d.source || ''}</div>
                    </div>
                    <Badge color={d.available ? 'green' : 'gray'}>{d.available ? 'Detectado' : 'No'}</Badge>
                  </div>
                ))}
                <div className="pt-1 text-[11px] text-text-muted">
                  Última detección: {formatDateTime(devices.scannedAt)}
                </div>
              </div>
            )}
            <div className="mt-4">
              <Button variant="secondary" className="w-full" onClick={scanHardware} loading={scanning}>
                <Icon name="activity" size={16} /> Detectar hardware del equipo
              </Button>
            </div>
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
      <FingerprintCaptureModal
        open={fingerprintOpen}
        onClose={() => setFingerprintOpen(false)}
        mode="verify"
        branchId={branchId}
        onDone={load}
      />
    </div>
  );
}

function AccessQrCard({ branchId, displayMode = false }: { branchId: string; displayMode?: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<AccessQrData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await http.get<AccessQrData>(`/attendance/access-qr?branchId=${encodeURIComponent(branchId)}`);
      setData(res);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al generar el QR');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function openQrWindow() {
    const openWindow = typeof window !== 'undefined' ? window.fitsystem?.openAccessQrWindow : undefined;
    if (openWindow) {
      await openWindow();
      return;
    }
    window.open('/attendance?qrdisplay=1', '_blank', 'noopener,noreferrer');
  }

  function print() {
    if (!data?.image) {
      toast.error('El QR todavía no está listo. Probá "Actualizar".');
      return;
    }
    // Se imprime sólo la sección .qr-print-root (ver globals.css). No usamos
    // window.open porque el escritorio (Electron) lo bloquea.
    window.print();
  }

  const rotationLabel =
    data?.rotation === 'DAILY' ? 'rota cada día' : data?.rotation === 'WEEKLY' ? 'rota cada semana' : 'fijo';

  if (displayMode) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 py-10 text-center">
        <div className="text-3xl font-bold text-text">{data?.title || 'QR de ingreso'}</div>
        {data?.subtitle && <p className="max-w-2xl text-lg text-text-muted">{data.subtitle}</p>}
        {data?.image ? (
          <img src={data.image} alt="QR de ingreso" className="h-[min(65vh,560px)] w-[min(65vh,560px)] rounded-2xl border border-line bg-white p-4" />
        ) : (
          <div className="flex h-80 w-80 items-center justify-center rounded-xl border border-dashed border-line text-text-muted">
            {loading ? 'Generando QR…' : data && !data.enabled ? 'El ingreso por QR está desactivado' : 'Sin QR generado'}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Badge color={data?.enabled ? 'green' : 'gray'}>{data?.enabled ? 'Activo' : 'Desactivado'}</Badge>
          {data && <span className="text-sm text-text-muted">QR {rotationLabel}</span>}
        </div>
        {data?.footer && <p className="text-sm text-text-muted">{data.footer}</p>}
        <Button variant="secondary" onClick={load} loading={loading}>
          <Icon name="activity" size={16} /> Actualizar QR
        </Button>
      </main>
    );
  }

  return (
    <Card
      title="QR de ingreso para socios"
      action={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openQrWindow}>
            <Icon name="external-link" size={15} /> Abrir en ventana
          </Button>
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            <Icon name="activity" size={15} /> Actualizar
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-muted">
        Pegá este QR en la entrada. Los socios lo escanean con la app (pestaña “Ingreso”) y su ingreso queda registrado
        al instante acá y en la app.
      </p>
      <div className="mt-4 flex flex-col items-center gap-3">
        {data?.image ? (
          <img src={data.image} alt="QR de ingreso" className="h-52 w-52 rounded-lg border border-line bg-white p-2" />
        ) : (
          <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-xs text-text-muted">
            {loading ? 'Generando…' : data && !data.enabled ? 'El ingreso por QR está desactivado' : 'Sin QR generado'}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge color={data?.enabled ? 'green' : 'gray'}>{data?.enabled ? 'Activo' : 'Desactivado'}</Badge>
          {data && <span className="text-xs text-text-muted">QR {rotationLabel}</span>}
        </div>
        <Button onClick={print} disabled={loading} className="w-full">
          <Icon name="activity" size={16} /> Imprimir QR
        </Button>
      </div>

      {data?.image && (
        <div className="qr-print-root" aria-hidden="true">
          <h1>{data.title}</h1>
          <p>{data.subtitle}</p>
          <img src={data.image} alt="QR de ingreso" />
          <div className="qr-print-footer">{data.footer}</div>
        </div>
      )}
    </Card>
  );
}