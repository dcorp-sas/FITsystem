import { prisma } from '../db.js';
import { env } from '../env.js';
import { arcaTest, arcaEmitir } from './arca.js';
import { getProviderArcaSetting, providerOrgId, saveProviderArcaSettings } from './provider-account.js';
import { isPlatformEmailConfigured, sendPlatformEmail } from './platform-email.js';

/*
 * Facturación electrónica del PROVEEDOR (suscripciones de FIT System).
 *
 * Reutiliza el motor ARCA de la API (WSAA + WSFE) y guarda su configuración en
 * la organización interna del proveedor. Cada comprobante emitido queda en
 * `ProviderInvoice`, con CAE, QR y estado del envío por correo.
 *
 * Emisión: manual desde el Panel de control FS o automática al acreditarse un
 * pago recurrente de MercadoPago (`maybeAutoInvoiceForPayment`).
 */

export interface InvoiceSettings {
  enabled: boolean;
  environment: 'homologacion' | 'produccion';
  cuit: string;
  ptoVta: number;
  cbteTipo: number;
  invoiceType: 'A' | 'B' | 'C';
  concept: number;
  condicionReceptor: string;
  condicionEmisor: string;
  ivaPercent: number;
  autoIssue: boolean;
  autoEmail: boolean;
  buyerDocType: number;
  emailFrom: string;
}

export interface InvoiceSettingsPublic extends InvoiceSettings {
  hasCert: boolean;
  hasKey: boolean;
  certSubject: string;
  certNotAfter: string;
  certError: string | null;
  mode: 'real' | 'mock';
}

const DEFAULTS: InvoiceSettings = {
  enabled: false,
  environment: 'homologacion',
  cuit: '',
  ptoVta: 1,
  cbteTipo: 11,
  invoiceType: 'C',
  concept: 1,
  condicionReceptor: '5',
  condicionEmisor: '6',
  ivaPercent: 0,
  autoIssue: false,
  autoEmail: false,
  buyerDocType: 99,
  emailFrom: 'FIT system™ <ventas@fitsystem.com.ar>',
};

const INVOICE_TYPE_TO_CBTE: Record<string, number> = { A: 1, B: 6, C: 11 };
const CBTE_TO_INVOICE_TYPE: Record<number, 'A' | 'B' | 'C'> = { 1: 'A', 6: 'B', 11: 'C' };

const SECRET_KEYS = ['CERT_P12', 'CERT_PASSWORD', 'PRIVATE_KEY'];

function bool(value: string | null, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

function num(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const [enabled = null, environment = null, cuit = null, ptoVta = null, cbteTipo = null, invoiceType = null, concept = null, condicionReceptor = null, condicionEmisor = null, ivaPercent = null, autoIssue = null, autoEmail = null, buyerDocType = null, emailFrom = null] =
    await Promise.all(
      [
        'ENABLED',
        'ENVIRONMENT',
        'CUIT',
        'PUNTO_VENTA',
        'CBTE_TIPO',
        'INVOICE_TYPE',
        'CONCEPTO',
        'CONDICION_RECEPTOR',
        'CONDICION_EMISOR',
        'IVA_PERCENT',
        'AUTO_ISSUE',
        'AUTO_EMAIL',
        'BUYER_DOC_TYPE',
        'EMAIL_FROM',
      ].map((key) => getProviderArcaSetting(key)),
    );
  const tipo = Number(cbteTipo) || DEFAULTS.cbteTipo;
  const letter = (invoiceType || CBTE_TO_INVOICE_TYPE[tipo] || DEFAULTS.invoiceType) as 'A' | 'B' | 'C';
  return {
    enabled: bool(enabled),
    environment: (environment || '').toLowerCase().includes('prod') ? 'produccion' : 'homologacion',
    cuit: (cuit || '').replace(/\D/g, ''),
    ptoVta: num(ptoVta, DEFAULTS.ptoVta),
    cbteTipo: tipo,
    invoiceType: ['A', 'B', 'C'].includes(letter) ? letter : DEFAULTS.invoiceType,
    concept: num(concept, DEFAULTS.concept),
    condicionReceptor: condicionReceptor || DEFAULTS.condicionReceptor,
    condicionEmisor: condicionEmisor || DEFAULTS.condicionEmisor,
    ivaPercent: Number(ivaPercent) >= 0 ? Number(ivaPercent) : DEFAULTS.ivaPercent,
    autoIssue: bool(autoIssue),
    autoEmail: bool(autoEmail),
    buyerDocType: num(buyerDocType, DEFAULTS.buyerDocType),
    emailFrom: emailFrom || DEFAULTS.emailFrom,
  };
}

export async function getInvoiceSettingsPublic(): Promise<InvoiceSettingsPublic> {
  const settings = await getInvoiceSettings();
  let test: Awaited<ReturnType<typeof arcaTest>> | null = null;
  try {
    test = await arcaTest(await providerOrgId());
  } catch {
    test = null;
  }
  return {
    ...settings,
    hasCert: Boolean(test?.cert?.present),
    hasKey: Boolean(test?.cert?.present),
    certSubject: test?.cert?.subject ?? '',
    certNotAfter: test?.cert?.notAfter ?? '',
    certError: test?.ok ? null : (test?.detail ?? null),
    mode: test?.mode ?? 'mock',
  };
}

export interface InvoiceSettingsInput {
  enabled?: boolean;
  environment?: string;
  cuit?: string;
  ptoVta?: number;
  cbteTipo?: number;
  invoiceType?: string;
  concept?: number;
  condicionReceptor?: string;
  condicionEmisor?: string;
  ivaPercent?: number;
  autoIssue?: boolean;
  autoEmail?: boolean;
  buyerDocType?: number;
  emailFrom?: string;
  certP12?: string;
  certPassword?: string;
  certPem?: string;
  keyPem?: string;
}

/** Guarda la configuración de facturación. Los certificados se guardan cifrados. */
export async function saveInvoiceSettings(input: InvoiceSettingsInput): Promise<InvoiceSettingsPublic> {
  const current = await getInvoiceSettings();
  const enabled = input.enabled ?? current.enabled;
  const autoIssue = input.autoIssue ?? current.autoIssue;
  const autoEmail = input.autoEmail ?? current.autoEmail;
  const cuit = String(input.cuit ?? current.cuit).replace(/\D/g, '');
  const [storedP12, storedPassword, storedCert, storedKey] = await Promise.all([
    getProviderArcaSetting('CERT_P12'),
    getProviderArcaSetting('CERT_PASSWORD'),
    getProviderArcaSetting('CERT'),
    getProviderArcaSetting('PRIVATE_KEY'),
  ]);
  const hasNewCertificate = Boolean(String(input.certP12 || '').trim() || (input.certPem && input.keyPem));
  const hasStoredCertificate = Boolean((storedP12 && (input.certPassword || storedPassword)) || (storedCert && storedKey));
  if (enabled && !/^\d{11}$/.test(cuit)) throw new Error('Para habilitar ARCA, ingresá un CUIT emisor válido de 11 dígitos');
  if (enabled && !hasNewCertificate && !hasStoredCertificate) throw new Error('Para habilitar ARCA, cargá el certificado y la clave privada del emisor');
  if ((autoIssue || autoEmail) && !enabled) throw new Error('Activá la facturación antes de habilitar la emisión o el envío automático');
  if (autoEmail && !isPlatformEmailConfigured()) throw new Error('El envío automático requiere configurar el correo del proveedor en el servidor');

  const values: Record<string, string> = {};
  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    values[key] = String(value);
  };
  set('ENABLED', typeof input.enabled === 'boolean' ? input.enabled : undefined);
  if (input.environment) values.ENVIRONMENT = input.environment.toLowerCase().includes('prod') ? 'produccion' : 'homologacion';
  if (input.cuit !== undefined) values.CUIT = String(input.cuit).replace(/\D/g, '');
  if (input.ptoVta !== undefined) values.PUNTO_VENTA = String(Number(input.ptoVta) || 1);
  if (input.cbteTipo !== undefined) values.CBTE_TIPO = String(Number(input.cbteTipo) || 11);
  if (input.invoiceType) {
    const letter = String(input.invoiceType).toUpperCase();
    values.INVOICE_TYPE = ['A', 'B', 'C'].includes(letter) ? letter : 'C';
    values.CBTE_TIPO = String(INVOICE_TYPE_TO_CBTE[values.INVOICE_TYPE] ?? values.CBTE_TIPO ?? 11);
  }
  if (input.concept !== undefined) values.CONCEPTO = String(Number(input.concept) || 1);
  if (input.condicionReceptor !== undefined) values.CONDICION_RECEPTOR = String(input.condicionReceptor || '5');
  if (input.condicionEmisor !== undefined) values.CONDICION_EMISOR = String(input.condicionEmisor || '6');
  if (input.ivaPercent !== undefined) values.IVA_PERCENT = String(Number(input.ivaPercent) || 0);
  set('AUTO_ISSUE', typeof input.autoIssue === 'boolean' ? input.autoIssue : undefined);
  set('AUTO_EMAIL', typeof input.autoEmail === 'boolean' ? input.autoEmail : undefined);
  if (input.buyerDocType !== undefined) values.BUYER_DOC_TYPE = String(Number(input.buyerDocType) || 99);
  if (input.emailFrom !== undefined) values.EMAIL_FROM = String(input.emailFrom || '').trim();

  const p12 = String(input.certP12 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (p12) {
    if (p12.length > 14 * 1024 * 1024) throw new Error('El certificado supera el máximo de 10 MB');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p12)) throw new Error('El certificado PKCS#12 no tiene un formato válido');
    if (!input.certPassword) throw new Error('Falta la contraseña del certificado ARCA');
    values.CERT_P12 = p12;
    // Si se sube un PKCS#12, descartamos PEM viejos para que ARCA use el nuevo.
    values.CERT = '';
    values.PRIVATE_KEY = '';
  }
  if (input.certPassword !== undefined) values.CERT_PASSWORD = String(input.certPassword);
  if (input.certPem && /BEGIN CERTIFICATE/.test(input.certPem)) {
    values.CERT = input.certPem;
    values.CERT_P12 = '';
  }
  if (input.keyPem && /BEGIN [A-Z ]*PRIVATE KEY/.test(input.keyPem)) {
    values.PRIVATE_KEY = input.keyPem;
    values.CERT_P12 = '';
  }

  if (Object.keys(values).length) {
    await saveProviderArcaSettings(values, SECRET_KEYS.filter((key) => key in values));
  }
  return getInvoiceSettingsPublic();
}

export interface InvoiceRow {
  id: string;
  subscriptionRef: string;
  paymentId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  buyerDocNro: string | null;
  invoiceType: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  amount: number;
  currency: string;
  cae: string;
  caeVto: string | null;
  status: string;
  qrUrl: string | null;
  error: string | null;
  issuedAt: string;
  emailedAt: string | null;
  emailError: string | null;
  plan?: string | null;
  period?: string | null;
}

export async function listProviderInvoices(limit = 100): Promise<InvoiceRow[]> {
  const rows = await prisma.providerInvoice.findMany({
    orderBy: { issuedAt: 'desc' },
    take: Math.min(500, Math.max(1, limit)),
  });
  const refs = [...new Set(rows.map((r) => r.subscriptionRef).filter(Boolean))];
  const subs = refs.length
    ? await prisma.planSubscription.findMany({
        where: { externalRef: { in: refs } },
        select: { externalRef: true, plan: true, period: true },
      })
    : [];
  const byRef = new Map(subs.map((s) => [s.externalRef, s]));
  return rows.map((row) => ({
    id: row.id,
    subscriptionRef: row.subscriptionRef,
    paymentId: row.paymentId,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    buyerDocNro: row.buyerDocNro,
    invoiceType: row.invoiceType,
    cbteTipo: row.cbteTipo,
    ptoVta: row.ptoVta,
    cbteNro: row.cbteNro,
    amount: row.amount,
    currency: row.currency,
    cae: row.cae,
    caeVto: row.caeVto ? row.caeVto.toISOString() : null,
    status: row.status,
    qrUrl: row.qrUrl,
    error: row.error,
    issuedAt: row.issuedAt.toISOString(),
    emailedAt: row.emailedAt ? row.emailedAt.toISOString() : null,
    emailError: row.emailError,
    plan: byRef.get(row.subscriptionRef)?.plan ?? null,
    period: byRef.get(row.subscriptionRef)?.period ?? null,
  }));
}

export interface IssueInvoiceInput {
  subscriptionRef?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerDocType?: number;
  buyerDocNro?: string;
  amount?: number;
  currency?: string;
  invoiceType?: string;
  paymentId?: string;
  sendEmail?: boolean;
  force?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function invoiceBody(invoice: {
  buyerName: string;
  invoiceType: string;
  ptoVta: number;
  cbteNro: number;
  amount: number;
  currency: string;
  cae: string;
  caeVto: Date | null;
  qrUrl: string | null;
}, plan?: string | null): string {
  const money = Number(invoice.amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [
    `Hola ${invoice.buyerName},`,
    '',
    'Adjuntamos los datos de tu factura electrónica de FIT System.',
    '',
    `Comprobante: Factura ${invoice.invoiceType} N° ${String(invoice.ptoVta).padStart(4, '0')}-${String(invoice.cbteNro).padStart(8, '0')}`,
    plan ? `Concepto: suscripción ${plan}` : 'Concepto: suscripción FIT System',
    `Importe: ${invoice.currency} ${money}`,
    `CAE: ${invoice.cae}`,
    invoice.caeVto ? `Vencimiento del CAE: ${invoice.caeVto.toLocaleDateString('es-AR')}` : '',
    invoice.qrUrl ? `Verificación ARCA: ${invoice.qrUrl}` : '',
    '',
    'Gracias por confiar en FIT System.',
    '',
    'FIT System — fitsystem.com.ar',
  ]
    .filter(Boolean)
    .join('\n');
}

async function deliverInvoiceEmail(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const invoice = await prisma.providerInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: 'Comprobante no encontrado' };
  if (!invoice.buyerEmail) {
    await prisma.providerInvoice.update({ where: { id: invoice.id }, data: { emailError: 'Sin email del comprador' } });
    return { ok: false, error: 'Sin email del comprador' };
  }
  const settings = await getInvoiceSettings();
  const sub = invoice.subscriptionRef
    ? await prisma.planSubscription.findUnique({ where: { externalRef: invoice.subscriptionRef }, select: { plan: true } })
    : null;
  const subject = `Factura ${invoice.invoiceType} ${String(invoice.ptoVta).padStart(4, '0')}-${String(invoice.cbteNro).padStart(8, '0')} · FIT System`;
  const result = await sendPlatformEmail(invoice.buyerEmail, subject, invoiceBody(invoice, sub?.plan), {
    from: settings.emailFrom || env.PLATFORM_SALES_FROM,
  });
  await prisma.providerInvoice.update({
    where: { id: invoice.id },
    data: result.ok ? { emailedAt: new Date(), emailError: null } : { emailError: result.error?.slice(0, 500) ?? 'Error de envío' },
  });
  return result;
}

/**
 * Emite un comprobante real contra ARCA (nunca simula). Si ARCA rechaza, guarda
 * el intento como ERROR para que el panel muestre el motivo exacto.
 */
export async function issueProviderInvoice(input: IssueInvoiceInput): Promise<InvoiceRow> {
  const settings = await getInvoiceSettings();
  if (!settings.enabled) throw new Error('La facturación está desactivada (Facturación → configuración)');

  const sub = input.subscriptionRef
    ? await prisma.planSubscription.findUnique({ where: { externalRef: input.subscriptionRef } })
    : null;
  if (input.subscriptionRef && !sub) throw new Error('Suscripción no encontrada');

  const buyerName = String(input.buyerName || sub?.buyerName || sub?.gymName || '').trim();
  const buyerEmail = String(input.buyerEmail || sub?.buyerEmail || '').trim();
  const amount = Number(input.amount ?? sub?.amount ?? 0);
  if (!buyerName) throw new Error('Falta el nombre del comprador');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Importe inválido');

  // Dedupe automático: un pago no puede generar dos comprobantes.
  if (input.paymentId && !input.force) {
    const existing = await prisma.providerInvoice.findFirst({
      where: { paymentId: input.paymentId, status: 'ISSUED' },
      orderBy: { issuedAt: 'desc' },
    });
    if (existing) {
      const list = await listProviderInvoices(500);
      const row = list.find((item) => item.id === existing.id);
      if (row) return row;
    }
  }

  const invoiceType = (input.invoiceType || settings.invoiceType || 'C').toUpperCase() as 'A' | 'B' | 'C';
  const cbteTipo = INVOICE_TYPE_TO_CBTE[invoiceType] ?? settings.cbteTipo;
  const total = round2(amount);
  const discriminaIva = invoiceType !== 'C' && settings.ivaPercent > 0;
  const neto = discriminaIva ? round2(total / (1 + settings.ivaPercent / 100)) : total;
  const iva = discriminaIva ? round2(total - neto) : 0;
  const docType = Number(input.buyerDocType ?? settings.buyerDocType) || 99;
  const docNro = String(input.buyerDocNro || '').replace(/\D/g, '');

  try {
    const result = await arcaEmitir(await providerOrgId(), {
      invoiceType,
      total,
      neto,
      iva,
      customerTaxId: docType === 80 ? docNro : undefined,
    });
    const created = await prisma.providerInvoice.create({
      data: {
        subscriptionRef: input.subscriptionRef || '',
        paymentId: input.paymentId || null,
        buyerName,
        buyerEmail: buyerEmail || null,
        buyerDocType: docType,
        buyerDocNro: docNro || null,
        invoiceType,
        cbteTipo,
        ptoVta: result.ptoVta,
        cbteNro: result.numero,
        concept: settings.concept,
        amount: total,
        currency: input.currency || sub?.currency || 'ARS',
        cae: result.cae,
        caeVto: result.venc ? new Date(result.venc.split('/').reverse().join('-')) : null,
        status: 'ISSUED',
        qrUrl: result.qrUrl,
        meta: JSON.stringify({ neto, iva, invoiceType, cbteTipo, environment: settings.environment, buyerDocType: docType }),
      },
    });
    if (input.sendEmail ?? settings.autoEmail) {
      await deliverInvoiceEmail(created.id).catch(() => undefined);
    }
    const list = await listProviderInvoices(500);
    return list.find((row) => row.id === created.id) as InvoiceRow;
  } catch (error) {
    const message = (error as Error).message || 'Error al emitir';
    const failed = await prisma.providerInvoice.create({
      data: {
        subscriptionRef: input.subscriptionRef || '',
        paymentId: input.paymentId || null,
        buyerName,
        buyerEmail: buyerEmail || null,
        buyerDocType: docType,
        buyerDocNro: docNro || null,
        invoiceType,
        cbteTipo,
        ptoVta: settings.ptoVta,
        cbteNro: 0,
        concept: settings.concept,
        amount: total,
        currency: input.currency || sub?.currency || 'ARS',
        cae: '',
        status: 'ERROR',
        error: message.slice(0, 1000),
        meta: JSON.stringify({ neto, iva, invoiceType, cbteTipo, environment: settings.environment }),
      },
    });
    throw new Error(`${message} (intento guardado ${failed.id.slice(0, 8)})`);
  }
}

export async function emailProviderInvoice(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) throw new Error('Falta el comprobante');
  return deliverInvoiceEmail(id);
}

/**
 * Se llama al acreditarse un pago recurrente. No propaga errores: un problema de
 * ARCA/correo no debe romper el webhook de MercadoPago.
 */
export async function maybeAutoInvoiceForPayment(subscriptionId: string, paymentId: string | null): Promise<void> {
  try {
    const settings = await getInvoiceSettings();
    if (!settings.enabled || !settings.autoIssue) return;
    const sub = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.status !== 'ACTIVE') return;
    if (paymentId) {
      const existing = await prisma.providerInvoice.findFirst({ where: { paymentId, status: 'ISSUED' } });
      if (existing) return;
    }
    await issueProviderInvoice({
      subscriptionRef: sub.externalRef,
      paymentId: paymentId ?? undefined,
      buyerName: sub.buyerName || sub.gymName || 'Cliente FIT System',
      buyerEmail: sub.buyerEmail,
      amount: sub.amount,
      currency: sub.currency,
      sendEmail: settings.autoEmail,
    });
  } catch (error) {
    console.error('[invoices] no se pudo emitir automáticamente:', (error as Error).message);
  }
}

/**
 * Emite los comprobantes que faltan para pagos ya acreditados (recuperación
 * manual desde el panel). Devuelve el detalle de lo emitido/fallado.
 */
export async function issuePendingInvoices(limit = 10): Promise<{ issued: number; skipped: number; errors: string[] }> {
  const settings = await getInvoiceSettings();
  if (!settings.enabled) throw new Error('La facturación está desactivada');
  const subs = await prisma.planSubscription.findMany({
    where: { status: 'ACTIVE', lastPaymentAt: { not: null } },
    orderBy: { lastPaymentAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
  });
  let issued = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const sub of subs) {
    const paymentId = sub.lastPaymentId || `sub:${sub.id}:${sub.lastPaymentAt?.toISOString() ?? ''}`;
    const existing = await prisma.providerInvoice.findFirst({ where: { paymentId, status: 'ISSUED' } });
    if (existing) {
      skipped++;
      continue;
    }
    try {
      await issueProviderInvoice({
        subscriptionRef: sub.externalRef,
        paymentId,
        buyerName: sub.buyerName || sub.gymName || 'Cliente FIT System',
        buyerEmail: sub.buyerEmail,
        amount: sub.amount,
        currency: sub.currency,
        sendEmail: settings.autoEmail,
      });
      issued++;
    } catch (error) {
      errors.push(`${sub.externalRef}: ${(error as Error).message}`);
    }
  }
  return { issued, skipped, errors };
}

export async function providerInvoiceTest() {
  const settings = await getInvoiceSettingsPublic();
  const test = await arcaTest(await providerOrgId()).catch((error) => ({
    ok: false,
    mode: 'mock' as const,
    simulate: false,
    detail: (error as Error).message,
    ambiente: settings.environment,
  }));
  return { settings, test };
}
