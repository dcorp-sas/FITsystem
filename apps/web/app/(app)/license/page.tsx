'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDate } from '@fitsystem/utils';
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, StatCard } from '@/components/ui';
import { Icon } from '@/components/icon';

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
  activated: boolean;
  info: LicenseInfo;
  seats: { used: number; total: number };
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  TRIAL: 'Prueba',
  EXPIRED: 'Vencida',
  SUSPENDED: 'Suspendida',
  UNACTIVATED: 'Sin activar',
};

export default function LicensePage() {
  const toast = useToast();
  const [data, setData] = useState<LicenseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await http.get<LicenseResponse>('/license/org'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar la licencia');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post('/license/org', { licenseKey: key.trim() });
      toast.success('Licencia activada');
      setKey('');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo activar la licencia');
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
      <PageHeader title="Licencia" subtitle="Plan del sistema y asientos de la app móvil" />

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

          {info?.hasKey && (
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-text-muted">
              <Badge color="blue">Clave activa</Badge>
              <span>La licencia actual esta registrada. Podes reemplazarla con una nueva clave.</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
