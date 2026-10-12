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
  arca: { configured: boolean; mode: string; cuit: string; puntoVenta: string; environment: string; hasCertificate: boolean };
  whatsapp: { configured: boolean; businessPhone: string; cloudConfigured: boolean };
  email: { configured: boolean; host: string; port: number; from: string };
  print: { configured: boolean; defaultPrinter: string; destUrl: string; ticketTemplate: string; printOnPayment: boolean };
}

type Tab = 'general' | 'cobros' | 'arca' | 'whatsapp' | 'email' | 'print';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'cobros', label: 'Cobros (MercadoPago)' },
  { key: 'arca', label: 'ARCA (Facturación)' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email (SMTP)' },
  { key: 'print', label: 'Impresión' },
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
                { key: 'ACCESS_TOKEN', label: 'Access Token (secreto)', placeholder: 'APP_USR-...' },
                { key: 'PUBLIC_KEY', label: 'Public Key', placeholder: 'APP_USR-...' },
                { key: 'POINT_DEVICE_ID', label: 'ID del dispositivo Point' },
                { key: 'STATIC_QR_PAYLOAD', label: 'Payload del QR estático', placeholder: 'fitsystem://pay?...' },
                { key: 'TRANSFER_ALIAS', label: 'Alias/CBU para transferencias' },
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
                { key: 'CERT', label: 'Certificado (PEM, secreto)' },
                { key: 'PRIVATE_KEY', label: 'Clave privada (PEM, secreto)' },
              ]}
              onSaved={load}
              extra={<ArcaCard status={status} />}
            />
          )}

          {tab === 'whatsapp' && (
            <CategoryForm
              title="WhatsApp"
              category="WHATSAPP"
              values={settings.WHATSAPP ?? {}}
              fields={[
                { key: 'BUSINESS_PHONE', label: 'Teléfono del negocio (con código de país)', placeholder: '5491155551234' },
                { key: 'WA_URL_BASE', label: 'Base del enlace', placeholder: 'https://wa.me' },
                { key: 'DEFAULT_MESSAGE', label: 'Mensaje por defecto' },
                { key: 'CLOUD_TOKEN', label: 'Cloud API: Token permanente (secreto)', type: 'password' },
                { key: 'PHONE_NUMBER_ID', label: 'Cloud API: Phone Number ID' },
                { key: 'API_VERSION', label: 'Cloud API: Versión de Graph', placeholder: 'v20.0' },
              ]}
              onSaved={load}
              extra={<WhatsappCard status={status} />}
            />
          )}

          {tab === 'email' && (
            <CategoryForm
              title="Email (SMTP)"
              category="SMTP"
              values={settings.SMTP ?? {}}
              fields={[
                { key: 'SMTP_HOST', label: 'Servidor SMTP', placeholder: 'smtp.tuproveedor.com' },
                { key: 'SMTP_PORT', label: 'Puerto', placeholder: '587' },
                { key: 'SMTP_SECURE', label: 'Conexión segura (true/false)', placeholder: 'false' },
                { key: 'SMTP_USER', label: 'Usuario', placeholder: 'tu@correo.com' },
                { key: 'SMTP_PASS', label: 'Contraseña (secreto)' },
                { key: 'SMTP_FROM', label: 'Remitente', placeholder: 'FIT System <no-reply@tu.com>' },
              ]}
              onSaved={load}
              extra={<EmailCard status={status} />}
            />
          )}

          {tab === 'print' && (
            <CategoryForm
              title="Impresión"
              category="PRINT"
              values={settings.PRINT ?? {}}
              fields={[
                { key: 'DEST_URL', label: 'Servidor de impresión', placeholder: 'http://127.0.0.1:3999' },
                { key: 'PRINTER_NAME', label: 'Impresora (opcional)', placeholder: 'EPSON TM-T20' },
                { key: 'PRINT_ON_PAYMENT', label: 'Imprimir comprobante al cobrar (true/false)', placeholder: 'false' },
                { key: 'TICKET_TEMPLATE', label: 'Plantilla de ticket', placeholder: 'default' },
              ]}
              onSaved={load}
              extra={<PrintCard status={status} />}
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
  fields: { key: string; label: string; placeholder?: string; type?: 'text' | 'password' }[];
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
                type={f.type ?? 'text'}
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

function ArcaCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const mode = status?.arca.mode ?? 'mock';

  async function test() {
    setBusy(true);
    try {
      const res = await http.post<{ ok: boolean; mode: string; detail: string }>('/integrations/arca/test', {});
      setResult(res.detail);
      toast.success(res.ok ? 'Conexión con ARCA verificada' : 'Revisá la configuración de ARCA');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al probar ARCA');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Estado de facturación">
      <div className="flex items-center gap-2 text-sm">
        <Badge color={mode === 'real' ? 'green' : 'gray'}>
          {mode === 'real' ? 'CAE real (certificado cargado)' : 'Numeración interna'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-muted">
        {mode === 'real'
          ? 'Se emiten comprobantes reales contra ARCA (WSAA/WSFE).'
          : 'Sin certificado: los comprobantes usan numeración interna. Cargá certificado y clave privada para emitir CAE reales.'}
      </p>
      <Button onClick={test} disabled={busy} className="mt-4">
        {busy ? 'Probando...' : 'Probar conexión ARCA'}
      </Button>
      {result && <p className="mt-3 text-sm text-text-muted">{result}</p>}
    </Card>
  );
}

function WhatsappCard({ status }: { status: IntegrationStatus | null }) {
  const phone = status?.whatsapp.businessPhone ?? '';
  const link = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '';
  return (
    <Card title="Envío de mensajes">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={status?.whatsapp.cloudConfigured ? 'green' : 'gray'}>
          {status?.whatsapp.cloudConfigured ? 'Cloud API (envío automático)' : 'Enlace wa.me (manual)'}
        </Badge>
        <Badge color={status?.whatsapp.configured ? 'green' : 'gray'}>
          {status?.whatsapp.configured ? 'Teléfono cargado' : 'Sin teléfono'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-muted">
        {status?.whatsapp.cloudConfigured
          ? 'Los avisos se envían automáticamente por la WhatsApp Cloud API de Meta.'
          : 'Sin Cloud API configurada, los avisos generan un enlace wa.me que se abre desde el celular. Cargá el Token y el Phone Number ID para envío automático.'}
      </p>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Probar enlace de WhatsApp
        </a>
      )}
    </Card>
  );
}

function EmailCard({ status }: { status: IntegrationStatus | null }) {
  return (
    <Card title="Estado del correo">
      <div className="flex items-center gap-2 text-sm">
        <Badge color={status?.email.configured ? 'green' : 'gray'}>
          {status?.email.configured ? 'Configurado' : 'Sin configurar'}
        </Badge>
      </div>
      {status?.email.configured ? (
        <p className="mt-3 text-sm text-text-muted">
          Enviando desde <span className="text-text">{status.email.from}</span> vía {status.email.host}:
          {status.email.port}.
        </p>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          Cargá los datos SMTP para enviar emails reales (bienvenida, avisos de vencimiento, etc.). Si no está
          configurado, los avisos quedan registrados como pendientes.
        </p>
      )}
    </Card>
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

function PrintCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  async function loadPrinters() {
    try {
      const res = await http.get<{ ok: boolean; printers: Array<{ name: string }>; error?: string }>('/integrations/print/printers');
      setPrinters((res.printers ?? []).map((p) => p.name).filter(Boolean));
      if (!res.ok) setResult(res.error ?? 'No se pudo conectar con el servidor de impresión');
      else setResult(`${(res.printers ?? []).length} impresora(s) disponibles`);
    } catch (error) {
      setResult(error instanceof ApiError ? error.message : 'Error al listar impresoras');
    }
  }

  async function test() {
    setBusy(true);
    try {
      await http.post('/integrations/print/test', {});
      toast.success('Ticket de prueba enviado');
      setResult('Ticket de prueba enviado a la impresora.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Error al imprimir';
      toast.error(message);
      setResult(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Impresora térmica">
      <div className="flex items-center gap-2 text-sm">
        <Badge color={status?.print.configured ? 'green' : 'gray'}>
          {status?.print.configured ? 'Configurada' : 'Valores por defecto'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-muted">
        La app de escritorio expone el servidor de impresión en <code>http://127.0.0.1:3999</code>. Si el panel
        corre en otra PC, apuntá <code>DEST_URL</code> a la IP de esa máquina.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={loadPrinters}>
          Ver impresoras
        </Button>
        <Button onClick={test} loading={busy}>
          Imprimir prueba
        </Button>
      </div>
      {printers.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-text-muted">
          {printers.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {result && <p className="mt-3 text-sm text-text-muted">{result}</p>}
    </Card>
  );
}