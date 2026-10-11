'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Organization } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';

type SettingsMap = Record<string, Record<string, string>>;

interface IntegrationStatus {
  mercadopago: { configured: boolean; pointDeviceId: string; hasStaticQr: boolean };
  arca: { configured: boolean; cuit: string; puntoVenta: string; environment: string };
  whatsapp: { configured: boolean; businessPhone: string };
}

type Tab = 'general' | 'cobros' | 'arca' | 'whatsapp';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'cobros', label: 'Cobros (MercadoPago)' },
  { key: 'arca', label: 'ARCA (Facturación)' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export default function SettingsPage() {
  const toast = useToast();
  const { organization } = useAuth();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<SettingsMap>({});
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([
        http.get<SettingsMap>('/settings'),
        http.get<IntegrationStatus>('/integrations/status'),
      ]);
      setSettings(s);
      setStatus(st);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del gimnasio e integraciones" />

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
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

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {tab === 'general' && <GeneralForm initial={organization} onSaved={load} />}

          {tab === 'cobros' && (
            <CategoryForm
              title="MercadoPago"
              category="MERCADOPAGO"
              values={settings.MERCADOPAGO ?? {}}
              fields={[
                { key: 'POINT_DEVICE_ID', label: 'ID del dispositivo Point' },
                { key: 'STATIC_QR_PAYLOAD', label: 'Payload del QR estático', placeholder: 'fitsystem://pay?...' },
              ]}
              onSaved={load}
              extra={<StaticQrCard status={status} />}
            />
          )}

          {tab === 'arca' && (
            <CategoryForm
              title="ARCA (ex AFIP)"
              category="ARCA"
              values={settings.ARCA ?? {}}
              fields={[
                { key: 'CUIT', label: 'CUIT del emisor' },
                { key: 'PUNTO_VENTA', label: 'Punto de venta' },
                { key: 'ENVIRONMENT', label: 'Entorno (HOMOLOGACION / PRODUCCION)' },
              ]}
              onSaved={load}
            />
          )}

          {tab === 'whatsapp' && (
            <CategoryForm
              title="WhatsApp"
              category="WHATSAPP"
              values={settings.WHATSAPP ?? {}}
              fields={[
                { key: 'BUSINESS_PHONE', label: 'Teléfono del negocio' },
                { key: 'PHONE_NUMBER_ID', label: 'ID de número (Cloud API)' },
                { key: 'ACCESS_TOKEN', label: 'Token de acceso (secreto)' },
              ]}
              onSaved={load}
            />
          )}
        </>
      )}
    </div>
  );
}

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password';
}

function GeneralForm({ initial, onSaved }: { initial: Organization | null; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    taxId: '',
    email: '',
    phone: '',
    address: '',
    currency: 'ARS',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || '',
        taxId: initial.taxId || '',
        email: initial.email || '',
        phone: initial.phone || '',
        address: initial.address || '',
        currency: initial.currency || 'ARS',
      });
    }
  }, [initial]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.put('/org', {
        name: form.name,
        taxId: form.taxId || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        currency: form.currency,
      });
      toast.success('Datos guardados');
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Datos del gimnasio" className="max-w-2xl">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="CUIT">
          <Input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} />
        </Field>
        <Field label="Moneda">
          <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="BRL">BRL</option>
            <option value="UYU">UYU</option>
          </Select>
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CategoryForm({
  title,
  category,
  values,
  fields,
  onSaved,
  extra,
}: {
  title: string;
  category: string;
  values: Record<string, string>;
  fields: { key: string; label: string; placeholder?: string }[];
  onSaved: () => void;
  extra?: React.ReactNode;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of fields) next[f.key] = values[f.key] ?? '';
    setForm(next);
  }, [values, fields]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.put(`/settings/${category}`, { category, values: form });
      toast.success(title + ' guardado');
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={title}>
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                value={form[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          <Button type="submit" loading={saving}>
            Guardar
          </Button>
        </form>
      </Card>
      {extra}
    </div>
  );
}

function StaticQrCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const branchId = activeBranchId || branches[0]?.id || '';

  async function generate() {
    setLoading(true);
    try {
      const res = await http.get<{ image: string }>('/integrations/mercadopago/static-qr', { branchId });
      setImage(res.image);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al generar QR');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="QR estático">
      <div className="flex items-center gap-2 text-sm">
        <Badge color={status?.mercadopago.configured ? 'green' : 'gray'}>
          {status?.mercadopago.configured ? 'Configurado' : 'Sin configurar'}
        </Badge>
        {status?.mercadopago.pointDeviceId && <span className="text-xs text-text-muted">Point: {status.mercadopago.pointDeviceId}</span>}
      </div>
      <div className="mt-4 flex flex-col items-center gap-3">
        {image ? (
          <img src={image} alt="QR estático" className="h-56 w-56 rounded-lg border border-line bg-white p-2" />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-line text-xs text-text-muted">
            Sin QR generado
          </div>
        )}
        <Button variant="secondary" onClick={generate} loading={loading}>
          Generar QR
        </Button>
      </div>
    </Card>
  );
}