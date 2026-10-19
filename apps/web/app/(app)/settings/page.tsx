'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Organization } from '@/lib/types';
import type { NetworkInfo } from '@/lib/desktop';
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
    mode: string;
    cuit: string;
    puntoVenta: number;
    environment: string;
    cbteTipo: number;
    cbteLabel: string;
    condicionReceptor: string;
    hasCertificate: boolean;
  };
  whatsapp: { configured: boolean; businessPhone: string; cloudConfigured: boolean; linked?: boolean; connection?: string; linkedNumber?: string };
  email: { configured: boolean; host: string; port: number; from: string };
  print: { configured: boolean; defaultPrinter: string; destUrl: string; ticketTemplate: string; printOnPayment: boolean; destination: string; pointDeviceId: string };
}

type Tab = 'general' | 'attendance' | 'cobros' | 'arca' | 'whatsapp' | 'print' | 'face' | 'turnstile' | 'network';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'attendance', label: 'Ingreso (QR fijo)' },
  { key: 'cobros', label: 'Cobros (MercadoPago)' },
  { key: 'arca', label: 'ARCA (Facturación)' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'print', label: 'Impresión' },
  { key: 'face', label: 'Reconocimiento facial' },
  { key: 'turnstile', label: 'Molinetes / acceso' },
  { key: 'network', label: 'Red local' },
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

          {tab === 'attendance' && (
            <CategoryForm
              title="Ingreso por QR fijo"
              category="ATTENDANCE"
              values={settings.ATTENDANCE ?? {}}
              intro={
                <p className="text-xs text-text-muted">
                  Configurá el ingreso por QR. El <strong className="text-text">QR para imprimir</strong> está en{' '}
                  <strong className="text-text">Acceso y asistencia</strong>. Tus socios lo escanean con la cámara de la
                  app del socio y el ingreso se registra solo, sin pasar por recepción.
                </p>
              }
              fields={[
                {
                  key: 'ACCESS_QR_ENABLED',
                  label: 'Ingreso por QR habilitado',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                  ],
                },
                {
                  key: 'ACCESS_QR_ROTATION',
                  label: 'Formato / rotación del QR',
                  type: 'select',
                  options: [
                    { value: 'NEVER', label: 'Fijo (nunca cambia) — recomendado' },
                    { value: 'DAILY', label: 'Cambia todos los días' },
                    { value: 'WEEKLY', label: 'Cambia cada semana' },
                  ],
                  help: 'Si rotás el QR, tenés que volver a imprimir y reemplazar el cartel cuando cambia.',
                },
                { key: 'ACCESS_QR_TITLE', label: 'Título del cartel', placeholder: 'Ingreso al gimnasio' },
                {
                  key: 'ACCESS_QR_SUBTITLE',
                  label: 'Texto principal',
                  placeholder: 'Escaneá este código con la app de socios para registrar tu ingreso',
                  type: 'textarea',
                },
                { key: 'ACCESS_QR_FOOTER', label: 'Texto al pie (opcional)', placeholder: 'Ej: Gimnasio Central · Av. Siempre Viva 123' },
                {
                  key: 'ACCESS_QR_COLOR',
                  label: 'Color del QR (hex)',
                  placeholder: '#0b1120',
                  advanced: true,
                  help: 'Se recomienda un color oscuro sobre fondo blanco para que la cámara lo lea bien.',
                },
                {
                  key: 'ACCESS_QR_SIZE',
                  label: 'Tamaño del QR en píxeles',
                  placeholder: '512',
                  advanced: true,
                  help: 'Entre 128 y 2048. 512 alcanza para imprimir en tamaño carta/A4.',
                },
              ]}
              onSaved={load}
              extra={
                <div className="space-y-5">
                  <MethodsCard config={settings.ATTENDANCE ?? {}} />
                </div>
              }
            />
          )}

          {tab === 'cobros' && (
            <CategoryForm
              title="MercadoPago"
              category="MERCADOPAGO"
              values={settings.MERCADOPAGO ?? {}}
              fields={[
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
              intro={
                <p className="text-xs text-text-muted">
                  El sistema envía los mensajes de WhatsApp desde el servidor. Vinculá el número del gimnasio una sola
                  vez escaneando un QR (más abajo) y listo: no hace falta abrir WhatsApp Web ni usar una cuenta de
                  empresa.
                </p>
              }
              fields={[
                { key: 'BUSINESS_PHONE', label: 'Número de WhatsApp del gimnasio (con código de país, sin + ni espacios)', placeholder: '5491155551234', help: 'Es el número que vas a vincular escaneando el QR.' },
                { key: 'DEFAULT_MESSAGE', label: 'Mensaje por defecto para enviar desde «Notificaciones» (opcional)', placeholder: '¡Hola! Te escribimos del gimnasio.' },
              ]}
              onSaved={load}
              extra={<WhatsappCard status={status} />}
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
                {
                  key: 'TICKET_TYPE',
                  label: 'Tipo de ticket',
                  type: 'select',
                  options: [
                    { value: 'SIMPLE', label: 'Comprobante simple' },
                    { value: 'FISCAL', label: 'Ticket fiscal (datos de ARCA)' },
                  ],
                  help: 'El ticket fiscal imprime CAE, número y neto/IVA cuando el cobro se facturó con ARCA.',
                },
                {
                  key: 'SHOW_LOGO',
                  label: 'Imprimir el logo del gimnasio',
                  type: 'select',
                  options: [
                    { value: 'true', label: 'Sí (impresoras que aceptan imágenes)' },
                    { value: 'false', label: 'No (solo texto)' },
                  ],
                  help: 'Depende de la impresora. Si el ticket sale mal, probá Desactivado.',
                },
                { key: 'TICKET_HEADER', label: 'Encabezado del ticket (opcional)', placeholder: 'Ej: Gimnasio Central · Sucursal Centro' },
                { key: 'TICKET_FOOTER', label: 'Pie del ticket (opcional)', placeholder: 'Ej: ¡Gracias por entrenar con nosotros!' },
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

          {tab === 'turnstile' && <TurnstileCard />}

          {tab === 'network' && <NetworkCard />}
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

/** Lee un archivo de imagen y lo devuelve como data URL reducido (max 512px). */
async function fileToLogoDataUrl(file: File): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo procesar la imagen'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Archivo de imagen inválido'));
    img.src = rawUrl;
  });
}

function GeneralForm({ initial, onSaved }: { initial: Organization | null; onSaved: () => void }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [form, setForm] = useState({
    name: '',
    taxId: '',
    email: '',
    phone: '',
    address: '',
    currency: 'ARS',
    logoUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || '',
        taxId: initial.taxId || '',
        email: initial.email || '',
        phone: initial.phone || '',
        address: initial.address || '',
        currency: initial.currency || 'ARS',
        logoUrl: initial.logoUrl || '',
      });
    }
  }, [initial]);

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      setForm((f) => ({ ...f, logoUrl: dataUrl }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar la imagen');
    } finally {
      setUploading(false);
    }
  }

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
        logoUrl: form.logoUrl || null,
      });
      await refresh();
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
        <div className="sm:col-span-2">
          <Field label="Logo del gimnasio" hint="Se muestra en el panel, en la app de socios y en el ticket (si está activado). PNG o JPG, se reduce automáticamente.">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-alt">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-text-muted">Sin logo</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3 text-sm font-medium text-text transition-colors hover:bg-surface-alt">
                  {uploading ? 'Cargando…' : 'Subir imagen'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onPickLogo(e.target.files?.[0])}
                  />
                </label>
                {form.logoUrl && (
                  <Button type="button" variant="ghost" onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          </Field>
        </div>
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

function NetworkCard() {
  const toast = useToast();
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.fitsystem : undefined;
    if (!bridge?.getNetwork) {
      setSupported(false);
      setLoading(false);
      return;
    }
    bridge
      .getNetwork()
      .then((data) => setInfo(data))
      .catch(() => setSupported(false))
      .finally(() => setLoading(false));
  }, []);

  async function applyMode(mode: 'standalone' | 'server' | 'cloud') {
    const bridge = typeof window !== 'undefined' ? window.fitsystem : undefined;
    if (!bridge?.setNetwork || !bridge?.restartApp) return;
    setSaving(true);
    try {
      await bridge.setNetwork(mode);
      setInfo((prev) => (prev ? { ...prev, mode } : prev));
      toast.success('Modo guardado. Reiniciando para aplicar…');
      await bridge.restartApp();
    } catch {
      toast.error('No se pudo cambiar el modo de red');
      setSaving(false);
    }
  }

  if (!supported) {
    return (
      <Card title="Red local" className="max-w-2xl">
        <p className="text-sm text-text-muted">
          Esta opción está disponible solo en la aplicación de escritorio de FIT system™.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const isServer = info?.mode === 'server';
  const isCloud = info?.mode === 'cloud';

  return (
    <Card title="Red local (varias PC en el gimnasio)" className="max-w-2xl">
      <p className="text-sm text-text-muted">
        Podés usar FIT system™ en varias computadoras del mismo local. Una PC es el servidor (guarda los
        datos) y las demás entran desde el navegador apuntando a su dirección de red. Todas ven y cargan
        sobre la misma información.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4">
          <input
            type="radio"
            name="netmode"
            className="mt-1"
            checked={isCloud}
            disabled={saving}
            onChange={() => applyMode('cloud')}
          />
          <span>
            <span className="block text-sm font-medium text-text">Nube (recomendado)</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              El sistema trabaja contra la nube: la misma informaci&oacute;n que ve la app del socio (pagos,
              ingresos, rutinas y vencimientos). Necesita conexi&oacute;n a internet.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4">
          <input
            type="radio"
            name="netmode"
            className="mt-1"
            checked={!isServer && !isCloud}
            disabled={saving}
            onChange={() => applyMode('standalone')}
          />
          <span>
            <span className="block text-sm font-medium text-text">Esta PC sola (por defecto)</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              El sistema funciona únicamente en esta computadora. No se abre a la red.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4">
          <input
            type="radio"
            name="netmode"
            className="mt-1"
            checked={isServer}
            disabled={saving}
            onChange={() => applyMode('server')}
          />
          <span>
            <span className="block text-sm font-medium text-text">
              Esta PC es el servidor (varias PC en la red)
            </span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Las demás PC abren el panel desde el navegador con la dirección de abajo e ingresan con su
              usuario y contraseña.
            </span>
          </span>
        </label>
      </div>

      {isCloud && (
        <div className="mt-4 rounded-lg border border-line bg-surface-alt/60 p-4">
          <div className="text-xs font-medium text-text-muted">Panel en la nube</div>
          <p className="mt-2 font-mono text-sm text-primary-light">{info?.cloudPanelUrl}</p>
          <p className="mt-2 text-xs text-text-muted">
            Para sumar m&aacute;s PC, abr&iacute; esa direcci&oacute;n en el navegador de cualquier equipo e
            ingres&aacute; con tu usuario. Todas trabajan sobre la misma base que la app del socio.
          </p>
        </div>
      )}

      {isServer && (
        <div className="mt-4 rounded-lg border border-line bg-surface-alt/60 p-4">
          <div className="text-xs font-medium text-text-muted">Dirección para las demás PC</div>
          {info?.lanUrls.length ? (
            <ul className="mt-2 space-y-1">
              {info.lanUrls.map((url) => (
                <li key={url} className="font-mono text-sm text-primary-light">
                  {url}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-text-muted">
              No se detectó una dirección de red. Verificá que esta PC esté conectada a la red del gimnasio.
            </p>
          )}
          <p className="mt-3 text-xs text-text-muted">
            Abrí esa dirección en la PC de recepción. Si Windows lo pide, permití el acceso a FIT system™ en
            el firewall para las redes privadas.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted">
        Cambiar el modo reinicia la aplicación. La impresión local desde terminales de red se configura por
        equipo.
      </p>
    </Card>
  );
}

interface TurnstileConfigUI {
  enabled: boolean;
  protocol: 'http' | 'tcp';
  url: string;
  method: 'GET' | 'POST';
  headers: string;
  body: string;
  host: string;
  port: string;
  payload: string;
  timeoutMs: string;
}

function TurnstileCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState<TurnstileConfigUI>({
    enabled: false,
    protocol: 'http',
    url: '',
    method: 'POST',
    headers: '',
    body: '',
    host: '',
    port: '',
    payload: '',
    timeoutMs: '1500',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await http.get<Record<string, unknown>>('/integrations/turnstile/config');
      setForm({
        enabled: Boolean(cfg.enabled),
        protocol: (cfg.protocol as 'http' | 'tcp') ?? 'http',
        url: String(cfg.url ?? ''),
        method: (cfg.method as 'GET' | 'POST') ?? 'POST',
        headers: cfg.headers && Object.keys(cfg.headers as object).length ? JSON.stringify(cfg.headers) : '',
        body: String(cfg.body ?? ''),
        host: String(cfg.host ?? ''),
        port: cfg.port != null ? String(cfg.port) : '',
        payload: String(cfg.payload ?? ''),
        timeoutMs: cfg.timeoutMs != null ? String(cfg.timeoutMs) : '1500',
      });
      setConfigured(Boolean(cfg.configured));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof TurnstileConfigUI>(key: K, value: TurnstileConfigUI[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let headers: Record<string, string> = {};
      if (form.headers.trim()) {
        try {
          headers = JSON.parse(form.headers) as Record<string, string>;
        } catch {
          throw new ApiError(400, 'Los encabezados deben ser un JSON válido');
        }
      }
      const res = await http.put<{ configured: boolean }>('/integrations/turnstile/config', {
        enabled: form.enabled,
        protocol: form.protocol,
        url: form.url || '',
        method: form.method,
        headers,
        body: form.body || '',
        host: form.host || '',
        port: form.port ? Number(form.port) : undefined,
        payload: form.payload || '',
        timeoutMs: form.timeoutMs ? Number(form.timeoutMs) : 1500,
      });
      setConfigured(Boolean(res.configured));
      toast.success('Configuración guardada');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    try {
      const res = await http.post<{ ok: boolean; skipped?: boolean; reason?: string; status?: number }>(
        '/integrations/turnstile/open',
        {},
      );
      if (res.ok) toast.success('El molinete respondió correctamente');
      else toast.error(res.reason ? `No se abrió: ${res.reason}` : `El molinete no respondió${res.status ? ` (HTTP ${res.status})` : ''}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo probar el molinete');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <Card title="Molinetes / barreras de acceso" className="max-w-2xl">
      <p className="text-sm text-text-muted">
        Cuando un socio registra un ingreso válido (por QR, rostro o en recepción), FIT system™ puede
        abrir automáticamente el molinete, la barrera o la puerta. Funciona con cualquier controlador que
        se maneje por <strong className="text-text">HTTP</strong> (Shelly, Tasmota, ESP32, relés de red…)
        o por <strong className="text-text">TCP</strong> (comando de texto a un host/puerto).
      </p>

      <form onSubmit={onSave} className="mt-4 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.enabled}
            disabled={saving}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-text">Abrir el molinete en cada ingreso válido</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Si está desactivado, el sistema registra el ingreso pero no acciona el hardware.
            </span>
          </span>
        </label>

        <Field label="Tipo de conexión">
          <Select value={form.protocol} onChange={(e) => set('protocol', e.target.value as 'http' | 'tcp')}>
            <option value="http">HTTP (URL del controlador)</option>
            <option value="tcp">TCP (host y puerto)</option>
          </Select>
        </Field>

        {form.protocol === 'http' ? (
          <>
            <Field label="URL de apertura" hint="Ej: http://192.168.1.50/relay/0?turn=on">
              <Input
                value={form.url}
                placeholder="http://192.168.1.50/open"
                onChange={(e) => set('url', e.target.value)}
              />
            </Field>
            <Field label="Método">
              <Select value={form.method} onChange={(e) => set('method', e.target.value as 'GET' | 'POST')}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </Select>
            </Field>
            {form.method === 'POST' && (
              <Field label="Cuerpo (opcional)" hint="Texto o JSON que espera el controlador.">
                <Input value={form.body} placeholder='{"on":true}' onChange={(e) => set('body', e.target.value)} />
              </Field>
            )}
            <Field label="Encabezados (opcional)" hint='JSON, por ejemplo {"Authorization":"Bearer ..."}.'
            >
              <Input value={form.headers} placeholder='{"X-Token":"..."}' onChange={(e) => set('headers', e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Host / IP">
              <Input value={form.host} placeholder="192.168.1.50" onChange={(e) => set('host', e.target.value)} />
            </Field>
            <Field label="Puerto">
              <Input value={form.port} placeholder="5000" onChange={(e) => set('port', e.target.value)} />
            </Field>
            <Field label="Comando (opcional)" hint="Texto que se envía al conectar. Vacío = OPEN.">
              <Input value={form.payload} placeholder="OPEN" onChange={(e) => set('payload', e.target.value)} />
            </Field>
          </>
        )}

        <Field label="Tiempo de espera (ms)" hint="Máximo a esperar la respuesta del controlador.">
          <Input value={form.timeoutMs} placeholder="1500" onChange={(e) => set('timeoutMs', e.target.value)} />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            Guardar
          </Button>
          <Button type="button" variant="secondary" loading={testing} onClick={onTest} disabled={!configured}>
            Probar apertura
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
        <Badge color={mode === 'real' ? 'green' : 'gray'}>{mode === 'real' ? 'CAE real' : 'Sin configurar'}</Badge>
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
          ? 'Se emiten comprobantes reales contra ARCA (WSAA/WSFE).'
          : 'Sin certificado válido no se puede facturar. Cargá el certificado y la clave privada para emitir CAE reales.'}
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
          {result.lastCbte != null && <p>Ãšltimo comprobante autorizado: {result.lastCbte}</p>}
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
        <Badge color="green">Cobros reales</Badge>
        <Badge color={mp?.hasPointToken || mp?.hasQrToken || mp?.accessTokenMasked ? 'green' : 'gray'}>
          {mp?.hasPointToken || mp?.hasQrToken || mp?.accessTokenMasked ? 'Credenciales cargadas' : 'Sin credenciales'}
        </Badge>
        {mp?.pointDeviceId && <span className="text-xs text-text-muted">Point: {mp.pointDeviceId}</span>}
      </div>
      <p className="mt-3 text-sm text-text-muted">
        Los cobros se envían a MercadoPago con las credenciales configuradas.
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

interface WhatsAppSession {
  status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  qr: string | null;
  linkedNumber: string;
  error: string;
}

const WA_LABELS: Record<WhatsAppSession['status'], string> = {
  connected: 'Conectado',
  qr: 'Escaneá el QR',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

function WhatsappCard({ status }: { status: IntegrationStatus | null }) {
  const toast = useToast();
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await http.get<WhatsAppSession>('/integrations/whatsapp/status');
      setSession(s);
    } catch {
      /* silencioso: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const conn: WhatsAppSession['status'] =
    session?.status ?? ((status?.whatsapp.connection as WhatsAppSession['status']) || 'disconnected');
  const linkedNumber = session?.linkedNumber || status?.whatsapp.linkedNumber || '';

  async function connect() {
    setLoading(true);
    try {
      const s = await http.post<WhatsAppSession>('/integrations/whatsapp/connect', {});
      setSession(s);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar la conexión');
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    try {
      const s = await http.post<WhatsAppSession>('/integrations/whatsapp/logout', {});
      setSession(s);
      toast.success('WhatsApp desconectado');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo desconectar');
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await http.post('/integrations/whatsapp/test', { phone: testPhone });
      toast.success('Mensaje de prueba enviado');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar el mensaje');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title="Conexión de WhatsApp">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color={conn === 'connected' ? 'green' : conn === 'qr' || conn === 'connecting' ? 'yellow' : 'gray'}>
          {WA_LABELS[conn]}
        </Badge>
        {conn === 'connected' && linkedNumber && (
          <span className="text-xs text-text-muted">Número: {linkedNumber}</span>
        )}
      </div>

      {conn === 'connected' ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-text-muted">
            Listo. El sistema envía los mensajes solo, sin abrir WhatsApp Web.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Enviar mensaje de prueba a" className="flex-1">
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="5491155551234"
              />
            </Field>
            <Button variant="secondary" onClick={sendTest} loading={testing} disabled={!testPhone}>
              Enviar prueba
            </Button>
          </div>
          <Button variant="secondary" onClick={disconnect} loading={loading}>
            Desconectar
          </Button>
        </div>
      ) : (conn === 'qr' || conn === 'connecting') && session?.qr ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <img
            src={session.qr}
            alt="QR de WhatsApp"
            className="h-56 w-56 rounded-lg border border-line bg-white p-2"
          />
          <p className="max-w-xs text-center text-xs text-text-muted">
            Abrí WhatsApp en el teléfono del gimnasio → <strong>Dispositivos vinculados</strong> → «Vincular un
            dispositivo» → escaneá este código.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-text-muted">
            Vinculá el número del gimnasio una sola vez escaneando un QR. Después, los mensajes se envían
            automáticamente desde el sistema.
          </p>
          <Button onClick={connect} loading={loading}>
            Conectar WhatsApp
          </Button>
        </div>
      )}

      {session?.error && conn !== 'connected' && <p className="mt-3 text-xs text-warning">{session.error}</p>}
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

const CHECKIN_METHODS: { key: string; label: string; hint: string }[] = [
  { key: 'QR', label: 'QR', hint: 'Lector de pistola o cámara, y el QR fijo que escanea la app del socio' },
  { key: 'CARD', label: 'Tarjeta', hint: 'Credencial RFID / banda magnética (lector HID/Serial/NFC)' },
  { key: 'FACE', label: 'Reconocimiento facial', hint: 'Cámara del equipo con detección de rostro' },
  { key: 'FINGERPRINT', label: 'Huella', hint: 'Lector de huellas / Windows Hello (WebAuthn)' },
  { key: 'TURNSTILE', label: 'Molinete', hint: 'Barrera o molinete controlado por el sistema' },
];

function MethodsCard({ config }: { config: Record<string, string> }) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const configKey = config.ACCESS_METHODS ?? '';

  useEffect(() => {
    const raw = configKey
      .split(',')
      .map((m) => m.trim().toUpperCase())
      .filter((m) => CHECKIN_METHODS.some((x) => x.key === m));
    setSelected(raw.length ? raw : CHECKIN_METHODS.map((m) => m.key));
  }, [configKey]);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    setSaving(true);
    try {
      const value = [...new Set([...selected, 'MANUAL'])].join(',');
      await http.put('/settings/ATTENDANCE', { category: 'ATTENDANCE', values: { ACCESS_METHODS: value } });
      toast.success('Medios de ingreso guardados');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Medios de ingreso (check-in)">
      <p className="text-xs text-text-muted">
        Elegí con qué medios pueden registrar su ingreso tus socios. El método manual siempre queda disponible como respaldo.
      </p>
      <div className="mt-4 space-y-2">
        {CHECKIN_METHODS.map((m) => (
          <label
            key={m.key}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-alt/40 p-3"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={selected.includes(m.key)}
              onChange={() => toggle(m.key)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{m.label}</span>
              <span className="block text-[11px] text-text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4">
        <Button onClick={save} loading={saving}>
          Guardar medios de ingreso
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
