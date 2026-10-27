'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDate } from '@fitsystem/utils';
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, StatCard } from '@/components/ui';
import { Icon } from '@/components/icon';
import type { UpdateEvent } from '@/lib/desktop';

interface LicenseInfo {
  plan: string;
  seats: number;
  status: string;
  expiresAt: string | null;
  daysLeft: number | null;
  isUsable: boolean;
  hasKey: boolean;
}

interface LicenseResponse {
  mode: 'installation' | 'organization';
  installationId: string | null;
  activated: boolean;
  info: LicenseInfo;
  seats: { used: number; total: number };
  config: { trialDays: number; contact: string; site: string; online: boolean };
}

interface SubscriptionInfo {
  hasSubscription: boolean;
  externalRef?: string;
  plan?: string;
  seats?: number;
  seatPacks?: number;
  amount?: number;
  currency?: string;
  status?: string;
  nextPaymentAt?: string | null;
  lastPaymentAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  TRIAL: 'Prueba',
  EXPIRED: 'Vencida',
  SUSPENDED: 'Suspendida',
  UNACTIVATED: 'Sin activar',
};

const SUB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Al día',
  PAST_DUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function LicensePage() {
  const toast = useToast();
  const [data, setData] = useState<LicenseResponse | null>(null);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateEvent | null>(null);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.fitsystem);

  useEffect(() => {
    return window.fitsystem?.onUpdateEvent?.((payload) => setUpdate(payload));
  }, []);

  async function buscarActualizaciones() {
    if (!window.fitsystem?.checkUpdates) return;
    setChecking(true);
    setUpdate({ state: 'checking' });
    try {
      await window.fitsystem.checkUpdates();
    } finally {
      setChecking(false);
    }
  }

  async function descargarActualizacion() {
    const r = await window.fitsystem?.downloadUpdate?.();
    if (r && !r.ok) setUpdate({ state: 'error', message: r.error });
  }

  async function instalarActualizacion() {
    await window.fitsystem?.installUpdate?.();
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await http.get<LicenseResponse>('/license/current'));
      setSub(await http.get<SubscriptionInfo>('/billing/subscription').catch(() => null));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar la licencia');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelarSuscripcion() {
    setSubBusy(true);
    try {
      await http.post('/billing/subscription/cancel', {});
      toast.success('Suscripción dada de baja. Seguís activo hasta el fin del período pago.');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo dar de baja la suscripción');
    } finally {
      setSubBusy(false);
    }
  }

  async function reactivarSuscripcion() {
    setSubBusy(true);
    try {
      const r = await http.post<{ initPoint?: string }>('/billing/subscription/reactivate', {});
      if (r.initPoint) window.location.assign(r.initPoint);
      else toast.error('No se pudo iniciar la reactivación');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo reactivar la suscripción');
    } finally {
      setSubBusy(false);
    }
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const activatesDesktopAndCloud = isDesktop && data?.mode === 'organization';
    let activatedOnDesktop = false;
    try {
      // En modo nube, esta página actualiza la licencia de la organización,
      // mientras que Electron valida al iniciar la licencia local del equipo.
      // Activar primero localmente evita que siga apareciendo el aviso de trial.
      if (activatesDesktopAndCloud) {
        const local = await window.fitsystem?.activate?.(key.trim());
        if (!local?.ok) {
          throw new Error(local?.message || 'No se pudo activar la licencia en este equipo');
        }
        activatedOnDesktop = true;
      }
      await http.post('/license/current', { licenseKey: key.trim() });
      toast.success(activatesDesktopAndCloud
        ? 'Licencia activada en este equipo y en la cuenta'
        : 'Licencia activada');
      setKey('');
      load();
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error
        ? error.message
        : 'No se pudo activar la licencia';
      toast.error(activatedOnDesktop
        ? `El equipo quedó activado, pero no se pudo actualizar la cuenta en la nube: ${message}`
        : message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const info = data?.info;
  const used = data?.seats.used ?? 0;
  const total = data?.seats.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div>
      <PageHeader
        title="Licencia"
        subtitle={`Plan del sistema y asientos de la app móvil${isDesktop && window.fitsystem?.version ? ` · Escritorio v${window.fitsystem.version}` : ''}`}
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Plan"
          value={info?.plan ?? '—'}
          accent="blue"
          hint={info ? STATUS_LABELS[info.status] ?? info.status : undefined}
        />
        <StatCard label="Asientos usados" value={`${used} / ${total || '—'}`} accent="green" />
        <StatCard
          label="Vencimiento"
          value={info?.expiresAt ? formatDate(info.expiresAt) : '—'}
          accent={info && info.daysLeft !== null && info.daysLeft <= 15 ? 'red' : 'sky'}
          hint={info?.daysLeft != null ? `${info.daysLeft} días` : undefined}
        />
        <StatCard
          label="Estado"
          value={info?.isUsable ? 'Operativa' : 'Inactiva'}
          accent={info?.isUsable ? 'green' : 'red'}
        />
      </div>

      {sub?.hasSubscription && (
        <Card title="Suscripción mensual" className="mb-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-text">
              Plan <strong>{sub.plan}</strong>
              {sub.seatPacks ? ` + ${sub.seatPacks} pack(s)` : ''}
            </span>
            <span className="text-text-muted">{sub.seats} socios con app</span>
            <span className="text-text-muted">{sub.amount != null ? `${ars.format(sub.amount)}/mes` : ''}</span>
            <Badge color={sub.status === 'ACTIVE' ? 'green' : sub.status === 'PAST_DUE' ? 'red' : 'blue'}>
              {SUB_STATUS_LABELS[sub.status ?? ''] ?? sub.status}
            </Badge>
            {sub.nextPaymentAt && sub.status === 'ACTIVE' && (
              <span className="text-text-muted">Próximo débito: {formatDate(sub.nextPaymentAt)}</span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {sub.status === 'ACTIVE' && (
              <Button variant="secondary" onClick={cancelarSuscripcion} loading={subBusy}>
                <Icon name="close" size={16} /> Dar de baja
              </Button>
            )}
            {(sub.status === 'PAST_DUE' || sub.status === 'CANCELLED') && (
              <Button onClick={reactivarSuscripcion} loading={subBusy}>
                <Icon name="check" size={16} /> Reactivar suscripción
              </Button>
            )}
            {sub.status === 'PENDING' && (
              <span className="text-xs text-text-muted">
                Esperando la autorización del débito en MercadoPago. Si no se autorizó, escribinos.
              </span>
            )}
            <span className="text-xs text-text-muted">
              {sub.status === 'ACTIVE'
                ? 'La baja cancela el débito automático; el servicio sigue hasta el fin del período pago.'
                : sub.status === 'PAST_DUE'
                  ? 'El débito no se pudo cobrar. Reactivá para restablecer el servicio.'
                  : ''}
            </span>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Uso de asientos de la app">
          <div className="mb-2 flex items-center justify-between text-sm text-text-muted">
            <span>{used} socios con acceso</span>
            <span>{total ? `${total} disponibles` : 'Sin licencia'}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-alt">
            <div
              className={`h-full rounded-full ${pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {total > 0 && used >= total && (
            <p className="mt-3 text-xs text-danger">Alcanzaste el limite de asientos. Amplia tu licencia para habilitar mas socios.</p>
          )}
        </Card>

        <Card title="Activar o renovar licencia">
          <form onSubmit={activate} className="space-y-4">
            <Field label="Clave de licencia" hint="Pegá el código FIT- que te enviamos">
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="FIT-····················"
              />
            </Field>
            <Button type="submit" loading={saving} disabled={!key.trim()}>
              <Icon name="check" size={16} /> Activar licencia
            </Button>
          </form>

          {!info?.hasKey && (
            <p className="mt-4 text-xs text-text-muted">
              Estas en periodo de prueba{data?.config?.trialDays ? ` (${data.config.trialDays} días)` : ''}. Podes seguir usando el
              sistema y activarlo cuando quieras.
            </p>
          )}

          {info?.hasKey && (
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-text-muted">
              <Badge color="blue">Clave activa</Badge>
              <span>La licencia actual esta registrada. Podes reemplazarla con una nueva clave.</span>
            </div>
          )}

          {(data?.installationId || data?.config?.contact) && (
            <div className="mt-4 space-y-1 border-t border-line pt-4 text-[11px] leading-relaxed text-text-muted">
              {data?.installationId && (
                <div className="break-all">
                  <span className="text-text-muted/70">ID de instalación:</span> {data.installationId}
                </div>
              )}
              {(data?.config?.contact || data?.config?.site) && (
                <div>
                  <span className="text-text-muted/70">Contacto:</span> {data.config.contact || data.config.site}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {isDesktop && (
        <Card title="Actualización del sistema" className="mt-5">
          <p className="mb-4 text-sm text-text-muted">
            FIT system™ se actualiza solo: descarga la versión nueva en segundo plano. Para instalarla, te va a pedir
            reiniciar la aplicación (nunca la reinicia sola mientras trabajás).
          </p>

          {update?.state === 'checking' && <p className="mb-3 text-sm text-text-muted">Buscando actualizaciones…</p>}
          {update?.state === 'up-to-date' && <p className="mb-3 text-sm text-success">Estás en la última versión.</p>}
          {update?.state === 'available' && (
            <div className="mb-3 rounded-lg border border-line bg-surface-alt p-3 text-sm">
              <p className="font-medium">
                Hay una versión nueva disponible{update.version ? ` (${update.version})` : ''}. Se está descargando en
                segundo plano; cuando termine vas a poder reiniciar para instalarla.
              </p>
              <Button variant="secondary" className="mt-3" onClick={descargarActualizacion}>
                <Icon name="import" size={16} /> Descargar ahora
              </Button>
            </div>
          )}
          {update?.state === 'downloading' && (
            <div className="mb-3">
              <p className="mb-2 text-sm text-text-muted">Descargando… {update.percent ?? 0}%</p>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full bg-primary" style={{ width: `${update.percent ?? 0}%` }} />
              </div>
            </div>
          )}
          {update?.state === 'downloaded' && (
            <div className="mb-3 rounded-lg border border-line bg-surface-alt p-3 text-sm">
              <p className="font-medium">Actualización lista. Reiniciá la aplicación para instalarla.</p>
              <Button className="mt-3" onClick={instalarActualizacion}>
                <Icon name="check" size={16} /> Reiniciar e instalar
              </Button>
            </div>
          )}
          {update?.state === 'error' && (
            <p className="mb-3 text-sm text-danger">No se pudo actualizar: {update.message ?? 'error desconocido'}</p>
          )}

          <Button variant="secondary" onClick={buscarActualizaciones} loading={checking}>
            <Icon name="check" size={16} /> Buscar actualizaciones
          </Button>

          <p className="mt-3 text-xs text-text-muted">
            La instalación automática requiere la versión instalada (no la portable).
          </p>
        </Card>
      )}
    </div>
  );
}
