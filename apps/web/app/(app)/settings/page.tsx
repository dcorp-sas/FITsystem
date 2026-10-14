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
  mercadopago: {
    configured: boolean;
    dryRun: boolean;
    accessTokenMasked: string;
    publicKey: string;
    hasStaticQr: boolean;
    pointEnabled: boolean;
    pointDeviceId: string;
    hasPointToken: boolean;
    hasQrToken: boolean;
    qrPosId: string;
    qrPosExternalId: string;
    qrFixedEnabled: boolean;
  };
  arca: {
    configured: boolean;
    enabled: boolean;
    simulate: boolean;
    mode: string;
    cuit: string;
    puntoVenta: number;
    environment: string;
    cbteTipo: number;
    cbteLabel: string;
    condicionReceptor: string;
    hasCertificate: boolean;
  };
  whatsapp: { configured: boolean; businessPhone: string; cloudConfigured: boolean };
  email: { configured: boolean; host: string; port: number; from: string };
  print: { configured: boolean; defaultPrinter: string; destUrl: string; ticketTemplate: string; printOnPayment: boolean; destination: string; pointDeviceId: string };
}

type Tab = 'general' | 'cobros' | 'arca' | 'whatsapp' | 'email' | 'print' | 'face';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'cobros', label: 'Cobros (MercadoPago)' },
  { key: 'arca', label: 'ARCA (Facturación)' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email (SMTP)' },
  { key: 'print', label: 'Impresión' },
  { key: 'face', label: 'Reconocimiento facial' },
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
                {
                  key: 'DRY_RUN',
                  label: 'Modo simulación (no cobra de verdad)',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí (simulado)' },
                    { value: 'false', label: 'No (real)' },
                  ],
                },
                { key: 'ACCESS_TOKEN', label: 'Access Token general (secreto)', type: 'password', secret: true, placeholder: 'APP_USR-...' },
                { key: 'PUBLIC_KEY', label: 'Public Key general', placeholder: 'APP_USR-...' },
                { key: 'POINT_PUBLIC_KEY', label: 'Point: Public Key' },
                { key: 'POINT_ACCESS_TOKEN', label: 'Point: Access Token (secreto)', type: 'password', secret: true },
                { key: 'POINT_DEVICE_ID', label: 'Point: ID del dispositivo / terminal' },
                {
                  key: 'POINT_ENABLED',
                  label: 'Point habilitado',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                  ],
                },
                { key: 'QR_PUBLIC_KEY', label: 'QR: Public Key' },
                { key: 'QR_ACCESS_TOKEN', label: 'QR: Access Token (secreto)', type: 'password', secret: true },
                { key: 'QR_POS_ID', label: 'QR: ID de la caja (POS)' },
                { key: 'QR_POS_EXTERNAL_ID', label: 'QR: External ID de la caja (sucursal)' },
                {
                  key: 'QR_FIXED_ENABLED',
                  label: 'QR fijo con confirmación automática',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                  ],
                },
                { key: 'STATIC_QR_PAYLOAD', label: 'Payload del QR estático (alternativo)', placeholder: 'fitsystem://pay?...' },
                { key: 'WEBHOOK_SECRET', label: 'Secreto del webhook (secreto)', type: 'password', secret: true },
                { key: 'TRANSFER_ALIAS', label: 'Alias/CBU para transferencias' },
                { key: 'RETURN_URL', label: 'URL de retorno tras el pago' },
              ]}
              onSaved={load}
              extra={
                <div className="space-y-5">
                  <MpCard status={status} />
                  <StaticQrCard status={status} />
                </div>
              }
            />
          )}

          {tab === 'arca' && (
            <CategoryForm
              title="ARCA (ex AFIP)"
              category="ARCA"
              values={settings.ARCA ?? {}}
              fields={[
                {
                  key: 'ENABLED',
                  label: 'Facturación ARCA habilitada',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                  ],
                },
                {
                  key: 'SIMULATE',
                  label: 'Modo simulación (CAE de prueba)',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí (no contacta AFIP)' },
                    { value: 'false', label: 'No (emite real)' },
                  ],
                },
                { key: 'CUIT', label: 'CUIT del emisor' },
                { key: 'PUNTO_VENTA', label: 'Punto de venta' },
                {
                  key: 'ENVIRONMENT',
                  label: 'Entorno',
                  type: 'select',
                  options: [
                    { value: 'HOMOLOGACION', label: 'Homologación (pruebas)' },
                    { value: 'PRODUCCION', label: 'Producción' },
                  ],
                },
                {
                  key: 'CBTE_TIPO',
                  label: 'Tipo de comprobante',
                  type: 'select',
                  options: [
                    { value: '11', label: 'Factura C (11)' },
                    { value: '6', label: 'Factura B (6)' },
                    { value: '1', label: 'Factura A (1)' },
                  ],
                },
                {
                  key: 'CONCEPTO',
                  label: 'Concepto',
                  type: 'select',
                  options: [
                    { value: '1', label: 'Productos (1)' },
                    { value: '2', label: 'Servicios (2)' },
                    { value: '3', label: 'Productos y servicios (3)' },
                  ],
                },
                {
                  key: 'CONDICION_RECEPTOR',
                  label: 'Condición IVA del receptor',
                  type: 'select',
                  options: [
                    { value: '5', label: 'Consumidor final (5)' },
                    { value: '1', label: 'Responsable inscripto (1)' },
                    { value: '4', label: 'Exento (4)' },
                    { value: '6', label: 'Monotributo (6)' },
                  ],
                },
                {
                  key: 'CONDICION_EMISOR',
                  label: 'Condición IVA del emisor',
                  type: 'select',
                  options: [
                    { value: '6', label: 'Monotributo (6)' },
                    { value: '1', label: 'Responsable inscripto (1)' },
                    { value: '4', label: 'Exento (4)' },
                  ],
                },
                { key: 'CERT', label: 'Certificado (PEM, secreto)', type: 'textarea', secret: true },
                { key: 'PRIVATE_KEY', label: 'Clave privada (PEM, secreto)', type: 'textarea', secret: true },
                { key: 'CERT_P12', label: 'Certificado .p12 en base64 (secreto)', type: 'textarea', secret: true, placeholder: 'Alternativa a PEM' },
                { key: 'CERT_PATH', label: 'Ruta a un .p12 en el servidor (solo local)' },
                { key: 'CERT_PASSWORD', label: 'Contraseña del .p12 (secreto)', type: 'password', secret: true },
              ]}
              onSaved={load}
              extra={
                <div className="space-y-5">
                  <ArcaCard status={status} />
                  <ArcaPointsOfSaleCard />
                </div>
              }
            />
          )}

          {tab === 'whatsapp' && (
            <CategoryForm
              title="WhatsApp"
              category="WHATSAPP"
              values={settings.WHATSAPP ?? {}}
              fields={[
                { key: 'BUSINESS_PHONE', label: 'Número de WhatsApp del gimnasio (con código de país, sin + ni espacios)', placeholder: '5491155551234' },
                { key: 'DEFAULT_MESSAGE', label: 'Mensaje que se escribe solo al abrir el chat (opcional)', placeholder: '¡Hola! Quería consultar por...' },
              ]}
              onSaved={load}
              extra={<WhatsappCard status={status} />}
            />
          )}

          {tab === 'email' && (
            <CategoryForm
              title="Email"
              category="SMTP"
              values={settings.SMTP ?? {}}
              intro={
                <p className="text-xs text-text-muted">
                  Sirve para enviar la bienvenida y los avisos de vencimiento. Si usás Gmail, activá la verificación en
                  2 pasos y creá una «contraseña de aplicación» (no uses tu contraseña normal).
                </p>
              }
              presets={[
                { label: 'Gmail', values: { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false' } },
                { label: 'Outlook / Hotmail', values: { SMTP_HOST: 'smtp.office365.com', SMTP_PORT: '587', SMTP_SECURE: 'false' } },
              ]}
              fields={[
                { key: 'SMTP_USER', label: 'Correo desde el que enviás', placeholder: 'gimnasio@gmail.com' },
                { key: 'SMTP_PASS', label: 'Contraseña de la aplicación', type: 'password', secret: true, help: 'En Gmail: Cuenta > Seguridad > Contraseñas de aplicaciones.' },
                { key: 'SMTP_FROM', label: 'Nombre y correo que ve el socio', placeholder: 'Mi Gimnasio <gimnasio@gmail.com>' },
                { key: 'SMTP_HOST', label: 'Servidor de correo', placeholder: 'smtp.gmail.com', advanced: true },
                { key: 'SMTP_PORT', label: 'Puerto', placeholder: '587', advanced: true },
                { key: 'SMTP_SECURE', label: 'Conexión segura (true/false)', placeholder: 'false', advanced: true },
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
              intro={
                <p className="text-xs text-text-muted">
                  Elegí dónde se imprime el comprobante. Lo más común es «Impresora conectada a esta PC» y probar con el
                  botón «Imprimir prueba».
                </p>
              }
              fields={[
                {
                  key: 'DESTINATION',
                  label: '¿Dónde imprimir?',
                  type: 'select',
                  options: [
                    { value: 'server', label: 'Impresora conectada a esta PC (red / USB)' },
                    { value: 'point', label: 'Impresora de la terminal Point' },
                    { value: 'both', label: 'En las dos' },
                  ],
                },
                { key: 'PRINTER_NAME', label: 'Nombre de la impresora (opcional)', placeholder: 'EPSON TM-T20' },
                {
                  key: 'PRINT_ON_PAYMENT',
                  label: 'Imprimir automáticamente al cobrar',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                  ],
                },
                { key: 'DEST_URL', label: 'Servidor de impresión', placeholder: 'http://127.0.0.1:3999', advanced: true },
                { key: 'POINT_DEVICE_ID', label: 'Terminal Point (opcional)', placeholder: 'NEWLAND_N950__...', advanced: true },
                { key: 'TICKET_TEMPLATE', label: 'Plantilla de ticket', placeholder: 'default', advanced: true },
              ]}
              onSaved={load}
              extra={<PrintCard status={status} />}
            />
          )}

          {tab === 'face' && (
            <CategoryForm
              title="Reconocimiento facial"
              category="FACE"
              values={settings.FACE ?? {}}
              intro={
                <p className="text-xs text-text-muted">
                  Para usar la cámara: abrí la ficha del socio y tocá «Registrar rostro». Después el socio entra mirando
                  a la cámara desde «Registrar asistencia». Si la cámara no conecta, revisá que esté enchufada y que el
                  navegador tenga permiso de cámara.
                </p>
              }
              fields={[
                {
                  key: 'MATCH_THRESHOLD',
                  label: 'Exigencia del reconocimiento',
                  placeholder: '0.55',
                  advanced: true,
                  help: 'Valor entre 0.4 y 0.6 (más bajo = más estricto). Vacío = recomendado (0.55).',
                },
              ]}
              onSaved={load}
              extra={<FaceInfoCard />}
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
  type?: 'text' | 'password' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  secret?: boolean;
  advanced?: boolean;
  help?: string;
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
  presets,
  intro,
}: {
  title: string;
  category: string;
  values: Record<string, string>;
  fields: FieldDef[];
  onSaved: () => void;
  extra?: React.ReactNode;
  presets?: { label: string; values: Record<string, string> }[];
  intro?: React.ReactNode;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of fields) next[f.key] = values[f.key] ?? (f.options ? f.options[0]?.value ?? '' : '');
    setForm(next);
  }, [values, fields]);

  const basicFields = fields.filter((f) => !f.advanced);
  const advancedFields = fields.filter((f) => f.advanced);

  function renderField(f: FieldDef) {
    return (
      <Field key={f.key} label={f.label}>
        {f.type === 'select' ? (
          <Select value={form[f.key] ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : f.type === 'textarea' ? (
          <textarea
            rows={4}
            value={form[f.key] ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-text focus:border-primary focus:outline-none"
          />
        ) : (
          <Input
            type={f.type ?? 'text'}
            value={form[f.key] ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        )}
        {f.help && <p className="mt-1 text-xs text-text-muted">{f.help}</p>}
      </Field>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = { ...form };
      for (const f of fields) {
        if (f.secret && !payload[f.key]) delete payload[f.key];
      }
      await http.put(`/settings/${category}`, { category, values: payload });
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
          {intro}
          {presets && presets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-muted">Carga rápida:</span>
              {presets.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="secondary"
                  onClick={() => setForm((prev) => ({ ...prev, ...p.values }))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          )}
          {basicFields.map(renderField)}
          {advancedFields.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs text-text-muted hover:text-text"
              >
                {showAdvanced ? 'Ocultar opciones avanzadas' : 'Mostrar opciones avanzadas'}
              </button>
              {showAdvanced && <div className="mt-4 space-y-4">{advancedFields.map(renderField)}</div>}
            </div>
          )}
          <Button type="submit" loading={saving}>
            Guardar
          </Button>
        </form>
      </Card>
      {extra}
    </div>
  );
}

interface ArcaTestResponse {
  ok: boolean;
  mode: string;
  simulate: boolean;
  detail: string;
  ambiente: string;
  cuit?: string;
  ptoVta?: number;
  cbteLabel?: string;
  condicionReceptor?: string;
  cert?: { present: boolean; subject: string; notAfter: string };
  dummy?: Record<string, string | null>;
  token?: { ok: boolean; error?: string };
  lastCbte?: number | null;
}

function ArcaCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ArcaTestResponse | null>(null);
  const arca = status?.arca;
  const mode = arca?.mode ?? 'mock';
  const simulate = arca?.simulate ?? true;

  async function test() {
    setBusy(true);
    try {
      const res = await http.post<ArcaTestResponse>('/integrations/arca/test', {});
      setResult(res);
      toast.success(res.ok ? 'Conexión con ARCA verificada' : 'Revisá la configuración de ARCA');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al probar ARCA');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Estado de facturación">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={mode === 'real' ? 'green' : 'gray'}>{mode === 'real' ? 'CAE real' : 'Simulado / interno'}</Badge>
        {simulate && <Badge color="yellow">Simulación activa</Badge>}
        {arca?.cbteLabel && <Badge color="blue">{arca.cbteLabel}</Badge>}
        {arca?.environment && <span className="text-xs text-text-muted">{arca.environment}</span>}
      </div>
      {arca?.cuit && (
        <p className="mt-3 text-sm text-text-muted">
          CUIT {arca.cuit} · Punto de venta {arca.puntoVenta}
        </p>
      )}
      <p className="mt-3 text-sm text-text-muted">
        {mode === 'real'
          ? 'Se emiten comprobantes reales contra ARCA (WSAA/WSFE), sin simulación.'
          : simulate
            ? 'Modo simulación: los comprobantes generan un CAE de prueba y no contactan a AFIP.'
            : 'Sin certificado válido: los comprobantes usan numeración interna. Cargá certificado y clave para emitir CAE reales.'}
      </p>
      <Button onClick={test} disabled={busy} className="mt-4">
        {busy ? 'Probando...' : 'Probar conexión ARCA'}
      </Button>
      {result && (
        <div className="mt-3 space-y-1 text-sm text-text-muted">
          <p>{result.detail}</p>
          {result.cert?.present && (
            <p>
              Certificado: {result.cert.subject || '(sin datos)'}
              {result.cert.notAfter ? ` · vence ${new Date(result.cert.notAfter).toLocaleDateString()}` : ''}
            </p>
          )}
          {result.lastCbte != null && <p>Último comprobante autorizado: {result.lastCbte}</p>}
          {result.dummy && result.dummy.app != null && (
            <p>
              AFIP · App {result.dummy.app ?? '-'} · DB {result.dummy.db ?? '-'} · Auth {result.dummy.auth ?? '-'}
            </p>
          )}
          {result.token && !result.token.ok && (
            <p className="text-danger">Token WSAA: {result.token.error}</p>
          )}
        </div>
      )}
    </Card>
  );
}

interface ArcaPointOfSale {
  branchId: string;
  branchName: string;
  pointOfSale: number;
  inherited: boolean;
}

function ArcaPointsOfSaleCard() {
  const toast = useToast();
  const [data, setData] = useState<{ globalPointOfSale: number; pointsOfSale: ArcaPointOfSale[] } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await http.get<{ globalPointOfSale: number; pointsOfSale: ArcaPointOfSale[] }>('/integrations/arca/points-of-sale');
      setData(res);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar puntos de venta');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(branchId: string) {
    const raw = edits[branchId];
    const pointOfSale = raw === '' || raw == null ? 0 : Number(raw);
    if (Number.isNaN(pointOfSale) || pointOfSale < 0) {
      toast.error('Punto de venta inválido');
      return;
    }
    setSavingId(branchId);
    try {
      await http.put('/integrations/arca/points-of-sale', { branchId, pointOfSale });
      toast.success('Punto de venta actualizado');
      setEdits((e) => {
        const next = { ...e };
        delete next[branchId];
        return next;
      });
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card title="Puntos de venta por sucursal">
      <p className="text-sm text-text-muted">
        Asigná el punto de venta AFIP de cada sucursal. Dejalo vacío o en 0 para usar el global
        {data ? ` (${data.globalPointOfSale})` : ''}.
      </p>
      {!data ? (
        <p className="mt-3 text-sm text-text-muted">Cargando...</p>
      ) : data.pointsOfSale.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No hay sucursales cargadas.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {data.pointsOfSale.map((p) => (
            <div key={p.branchId} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-text">{p.branchName}</span>
              <Input
                type="number"
                className="w-24"
                value={edits[p.branchId] ?? String(p.pointOfSale)}
                onChange={(e) => setEdits((prev) => ({ ...prev, [p.branchId]: e.target.value }))}
              />
              <Badge color={p.inherited ? 'gray' : 'blue'}>{p.inherited ? 'global' : 'propio'}</Badge>
              <Button
                variant="secondary"
                disabled={edits[p.branchId] == null}
                loading={savingId === p.branchId}
                onClick={() => save(p.branchId)}
              >
                Guardar
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface MpTerminal {
  id?: string;
  pos_id?: number | string;
  external_pos_id?: string;
  operating_mode?: string;
}

function MpCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ping, setPing] = useState<{ ok: boolean; userId?: string; nickname?: string; terminals?: number; error?: string } | null>(null);
  const [terminals, setTerminals] = useState<MpTerminal[] | null>(null);
  const mp = status?.mercadopago;

  async function test() {
    setBusy(true);
    try {
      const res = await http.post<{ ok: boolean; userId?: string; nickname?: string; terminals?: number; error?: string }>(
        '/integrations/mercadopago/ping',
        {},
      );
      setPing(res);
      toast[res.ok ? 'success' : 'error'](res.ok ? 'Credenciales de MercadoPago válidas' : res.error || 'MercadoPago rechazó las credenciales');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al probar MercadoPago');
    } finally {
      setBusy(false);
    }
  }

  async function loadTerminals() {
    try {
      const res = await http.get<MpTerminal[]>('/integrations/mercadopago/terminals?refresh=true');
      setTerminals(res);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al listar terminales');
    }
  }

  return (
    <Card title="Estado de cobros">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={mp?.dryRun ? 'yellow' : 'green'}>{mp?.dryRun ? 'Simulación activa' : 'Cobros reales'}</Badge>
        <Badge color={mp?.hasPointToken || mp?.hasQrToken || mp?.accessTokenMasked ? 'green' : 'gray'}>
          {mp?.hasPointToken || mp?.hasQrToken || mp?.accessTokenMasked ? 'Credenciales cargadas' : 'Sin credenciales'}
        </Badge>
        {mp?.pointDeviceId && <span className="text-xs text-text-muted">Point: {mp.pointDeviceId}</span>}
      </div>
      <p className="mt-3 text-sm text-text-muted">
        {mp?.dryRun
          ? 'Con el modo simulación activo no se envían cobros a MercadoPago: sirve para probar el circuito.'
          : 'Los cobros se envían a MercadoPago con las credenciales configuradas.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={test} loading={busy}>
          Probar conexión
        </Button>
        <Button variant="secondary" onClick={loadTerminals}>
          Ver terminales
        </Button>
      </div>
      {ping && (
        <p className="mt-3 text-sm text-text-muted">
          {ping.ok
            ? `Cuenta ${ping.nickname ?? ping.userId ?? 'OK'}${ping.terminals != null ? ` · ${ping.terminals} terminal(es)` : ''}`
            : ping.error}
        </p>
      )}
      {terminals && (
        <ul className="mt-3 space-y-1 text-sm text-text-muted">
          {terminals.length === 0 && <li>No hay terminales asociadas.</li>}
          {terminals.map((t, i) => (
            <li key={t.id ?? i}>
              {t.pos_id ?? t.id} {t.external_pos_id ? `· ${t.external_pos_id}` : ''} {t.operating_mode ? `(${t.operating_mode})` : ''}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WhatsappCard({ status }: { status: IntegrationStatus | null }) {
  const phone = status?.whatsapp.businessPhone ?? '';
  const link = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '';
  return (
    <Card title="Envío de mensajes">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={status?.whatsapp.configured ? 'green' : 'gray'}>
          {status?.whatsapp.configured ? 'Número cargado' : 'Sin número'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-muted">
        Los mensajes se envían abriendo WhatsApp con el chat y el mensaje ya escritos. Solo necesitás cargar el
        número del gimnasio; no hace falta ninguna cuenta de empresa ni API.
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

function FaceInfoCard() {
  return (
    <Card title="Cómo funciona">
      <div className="space-y-3 text-sm text-text-muted">
        <p>
          El sistema usa <span className="text-text">reconocimiento facial real</span> en el dispositivo (cámara este
          navegador / kiosco): detecta el rostro, lo vuelve un vector de 128 dimensiones y lo envía al servidor para
          compararlo con los rostros enrolados.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-surface-alt/60 p-3">
            <div className="mb-1 font-semibold text-text">Enrolamiento</div>
            Desde la ficha del socio → "Registrar rostro". Se toman 5 muestras en vivo.
          </div>
          <div className="rounded-lg bg-surface-alt/60 p-3">
            <div className="mb-1 font-semibold text-text">Check-in</div>
            Desde "Acceso y asistencia" → "Check-in por rostro", o desde el kiosco de la sucursal.
          </div>
        </div>
        <p>
          Umbral de coincidencia: menor valor = más estricto (0.30–0.40), mayor valor = más permisivo (0.60–0.70).
          0.55 es el valor recomendado. El código de acceso/sede habitual sigue funcionando igual.
        </p>
      </div>
    </Card>
  );
}

function PrintCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [busyPoint, setBusyPoint] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const destination = status?.print.destination ?? 'server';
  const hasPoint = destination === 'point' || destination === 'both';

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

  async function testPoint() {
    setBusyPoint(true);
    try {
      await http.post('/integrations/print/test/point', {});
      toast.success('Ticket de prueba enviado a la terminal Point');
      setResult('Ticket de prueba enviado a la terminal Point.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Error al imprimir en Point';
      toast.error(message);
      setResult(message);
    } finally {
      setBusyPoint(false);
    }
  }

  return (
    <Card title="Impresora térmica">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={status?.print.configured ? 'green' : 'gray'}>
          {status?.print.configured ? 'Configurada' : 'Valores por defecto'}
        </Badge>
        <Badge color={hasPoint ? 'blue' : 'gray'}>
          {destination === 'both' ? 'Red + Point' : destination === 'point' ? 'Terminal Point' : 'Red / local'}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-muted">
        La app de escritorio expone el servidor de impresión en <code>http://127.0.0.1:3999</code>. Si el panel
        corre en otra PC, apuntá <code>DEST_URL</code> a la IP de esa máquina.
        {hasPoint && ' Con la terminal Point seleccionada, el comprobante se imprime en la impresora de la terminal.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={loadPrinters}>
          Ver impresoras
        </Button>
        <Button onClick={test} loading={busy}>
          Imprimir prueba
        </Button>
        {hasPoint && (
          <Button variant="secondary" onClick={testPoint} loading={busyPoint}>
            Probar terminal Point
          </Button>
        )}
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

interface ObservabilityConfig {
  webhookUrl: string;
  alertsEnabled: boolean;
  minLevel: 'error' | 'warn' | 'info';
  retentionDays: number;
  errors7d: number;
  lastErrorAt: string | null;
}

interface ErrorLogEntry {
  id: string;
  level: string;
  message: string;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  createdAt: string;
}

function SystemPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<ObservabilityConfig | null>(null);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([
        http.get<ObservabilityConfig>('/system/observability'),
        http.get<{ items: ErrorLogEntry[] }>('/system/errors?limit=20'),
      ]);
      setCfg(c);
      setErrors(e.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar el sistema');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await http.put<ObservabilityConfig>('/system/observability', {
        OBS_WEBHOOK_URL: cfg.webhookUrl,
        OBS_ALERTS_ENABLED: String(cfg.alertsEnabled),
        OBS_MIN_LEVEL: cfg.minLevel,
        OBS_RETENTION_DAYS: cfg.retentionDays,
      });
      setCfg((prev) => (prev ? { ...prev, ...res } : res));
      toast.success('Configuración guardada');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function testAlert() {
    setTesting(true);
    try {
      await http.post('/system/observability/test', {});
      toast.success('Alerta de prueba enviada');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar la alerta');
    } finally {
      setTesting(false);
    }
  }

  async function purge() {
    if (!confirm('¿Borrar logs y notificaciones más antiguos que la retención configurada?')) return;
    setPurging(true);
    try {
      const res = await http.post<{ retentionDays: number; errorLogs: number; activityLogs: number; notifications: number }>(
        '/system/retention/purge',
        {},
      );
      toast.success(`Limpieza aplicada (${res.errorLogs + res.activityLogs + res.notifications} registros)`);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al limpiar');
    } finally {
      setPurging(false);
    }
  }

  async function clearErrors() {
    try {
      await http.del('/system/errors');
      toast.success('Historial de errores borrado');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al borrar');
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const data = await http.get<Record<string, unknown>>('/org/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitsystem-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Observabilidad y alertas">
        {!cfg ? (
          <Spinner className="h-5 w-5" />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <Field label="Webhook de alertas (Slack/Discord/HTTP)">
              <Input
                value={cfg.webhookUrl}
                placeholder="https://hooks.slack.com/..."
                onChange={(e) => setCfg({ ...cfg, webhookUrl: e.target.value })}
              />
            </Field>
            <Field label="Enviar alertas">
              <Select
                value={String(cfg.alertsEnabled)}
                onChange={(e) => setCfg({ ...cfg, alertsEnabled: e.target.value === 'true' })}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <Field label="Nivel mínimo de alerta">
              <Select
                value={cfg.minLevel}
                onChange={(e) => setCfg({ ...cfg, minLevel: e.target.value as ObservabilityConfig['minLevel'] })}
              >
                <option value="error">Solo errores</option>
                <option value="warn">Advertencias y errores</option>
                <option value="info">Todo</option>
              </Select>
            </Field>
            <Field label="Retención de logs (días)">
              <Input
                type="number"
                value={String(cfg.retentionDays)}
                onChange={(e) => setCfg({ ...cfg, retentionDays: Number(e.target.value) })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                Guardar
              </Button>
              <Button type="button" variant="secondary" onClick={testing ? undefined : testAlert} loading={testing}>
                Probar alerta
              </Button>
              <Button type="button" variant="secondary" onClick={exportData} loading={exporting}>
                Exportar datos
              </Button>
              <Button type="button" variant="secondary" onClick={purge} loading={purging}>
                Aplicar retención
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Errores recientes">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge color={(cfg?.errors7d ?? 0) > 0 ? 'red' : 'green'}>{cfg?.errors7d ?? 0} en 7 días</Badge>
          {cfg?.lastErrorAt && <span className="text-xs text-text-muted">último {new Date(cfg.lastErrorAt).toLocaleString()}</span>}
          <Button variant="secondary" onClick={clearErrors}>
            Borrar historial
          </Button>
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-text-muted">Sin errores registrados.</p>
        ) : (
          <div className="space-y-2">
            {errors.map((e) => (
              <div key={e.id} className="rounded-lg border border-line bg-surface-alt/50 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text">{e.method} {e.path}</span>
                  <Badge color={e.level === 'error' ? 'red' : e.level === 'warn' ? 'yellow' : 'gray'}>{e.level}</Badge>
                </div>
                <p className="mt-1 text-text-muted">{e.message}</p>
                <p className="mt-0.5 text-[10px] text-text-muted">{new Date(e.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}