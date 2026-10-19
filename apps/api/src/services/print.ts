import { getRawSetting } from './settings.js';
import { getMpConfig, printOnPoint, pointToken } from './mercadopago.js';
import crypto from 'node:crypto';

export interface TicketLine {
  label: string;
  value: string;
}

export interface Ticket {
  organization?: string;
  /** Lineas centradas bajo el nombre (direccion, telefono, CUIT...). */
  headerLines?: string[];
  /** Logo del gimnasio: data URL (base64) o URL http(s). Solo imagen. */
  logo?: string | null;
  title?: string;
  date?: string | number;
  lines: TicketLine[];
  total?: string;
  footer?: string;
}

export type PrintDestination = 'server' | 'point' | 'both';

export interface PrintConfig {
  destUrl: string;
  printer?: string;
  destination: PrintDestination;
}

export interface PrintResult {
  ok: boolean;
  error?: string;
  via?: 'server' | 'point';
}

/**
 * Config del servidor de impresion local (lo expone la app de escritorio en
 * el puerto 3999). Se puede apuntar a otra PC de la red via PRINT.DEST_URL.
 * PRINT.DESTINATION permite imprimir por la impresora de la terminal Point
 * de MercadoPago ('point'), por la impresora de red ('server') o ambas.
 */
export async function getPrintConfig(orgId: string): Promise<PrintConfig> {
  const destUrl = (await getRawSetting(orgId, 'PRINT', 'DEST_URL')) || 'http://127.0.0.1:3999';
  const printer = await getRawSetting(orgId, 'PRINT', 'PRINTER_NAME');
  const destination = ((await getRawSetting(orgId, 'PRINT', 'DESTINATION')) || 'server') as PrintDestination;
  return {
    destUrl: destUrl.replace(/\/+$/, ''),
    printer: printer || undefined,
    destination: ['server', 'point', 'both'].includes(destination) ? destination : 'server',
  };
}

/** Envia un ticket a la impresora termica. */
export async function printTicket(orgId: string, ticket: Ticket): Promise<PrintResult> {
  const cfg = await getPrintConfig(orgId);
  try {
    const res = await fetch(`${cfg.destUrl}/print`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ printer: cfg.printer, ticket }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || `HTTP ${res.status}`, via: 'server' };
    }
    return { ok: true, via: 'server' };
  } catch (err) {
    return { ok: false, error: (err as Error).message, via: 'server' };
  }
}

/** Convierte un ticket a texto plano para la impresora de la terminal Point. */
export function ticketToText(ticket: Ticket): string {
  const lines: string[] = [];
  const width = 32;
  if (ticket.organization) lines.push(center(ticket.organization, width));
  for (const hl of ticket.headerLines ?? []) lines.push(center(hl, width));
  if (ticket.title) {
    lines.push('-'.repeat(width));
    lines.push(center(ticket.title, width));
    lines.push('-'.repeat(width));
  }
  if (ticket.date) {
    const d = new Date(ticket.date);
    if (!Number.isNaN(d.getTime())) lines.push(d.toLocaleString('es-AR'));
  }
  for (const line of ticket.lines) {
    lines.push(`${line.label} ${line.value}`);
  }
  if (ticket.total) {
    lines.push('-'.repeat(width));
    lines.push(center(`TOTAL ${ticket.total}`, width));
  }
  if (ticket.footer) {
    lines.push('');
    lines.push(center(ticket.footer, width));
  }
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

function center(text: string, width: number): string {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

/** Imprime un ticket en la impresora integrada de la terminal Point de MercadoPago. */
export async function printViaPoint(orgId: string, ticket: Ticket, deviceIdOverride?: string): Promise<PrintResult> {
  const mp = await getMpConfig(orgId);
  if (!pointToken(mp)) return { ok: false, error: 'MercadoPago no configurado', via: 'point' };
  const deviceId =
    deviceIdOverride || (await getRawSetting(orgId, 'PRINT', 'POINT_DEVICE_ID')) || mp.point.deviceId;
  if (!deviceId) return { ok: false, error: 'Sin terminal Point configurada', via: 'point' };
  const result = await printOnPoint(mp, {
    deviceId,
    content: ticketToText(ticket),
    externalReference: `print-${Date.now()}`,
    idempotencyKey: crypto.randomUUID(),
  });
  return { ok: result.ok, error: result.error, via: 'point' };
}

/**
 * Imprime segun la configuracion PRINT.DESTINATION: impresora de red ('server'),
 * impresora de la terminal Point ('point') o ambas ('both').
 */
export async function printTicketAuto(orgId: string, ticket: Ticket): Promise<PrintResult> {
  const cfg = await getPrintConfig(orgId);
  if (cfg.destination === 'point') return printViaPoint(orgId, ticket);
  if (cfg.destination === 'both') {
    const [server, point] = await Promise.all([printTicket(orgId, ticket), printViaPoint(orgId, ticket)]);
    if (server.ok || point.ok) return { ok: true, via: server.ok ? 'server' : 'point' };
    return { ok: false, error: server.error || point.error };
  }
  return printTicket(orgId, ticket);
}

/** Lista las impresoras disponibles en la maquina que corre el servidor. */
export async function listPrinters(orgId: string): Promise<{ ok: boolean; printers: unknown[]; error?: string }> {
  const cfg = await getPrintConfig(orgId);
  try {
    const res = await fetch(`${cfg.destUrl}/printers`);
    if (!res.ok) return { ok: false, printers: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { printers?: unknown[] };
    return { ok: true, printers: data.printers ?? [] };
  } catch (err) {
    return { ok: false, printers: [], error: (err as Error).message };
  }
}

export interface ReceiptFiscal {
  typeLabel: string;
  number: string;
  cae?: string | null;
  caeVenc?: string | null;
  net?: number;
  iva?: number;
  customerTaxId?: string | null;
  qrUrl?: string | null;
}

export interface ReceiptData {
  organization: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logo?: string | null;
  headerText?: string | null;
  member?: string | null;
  concept: string;
  method: string;
  amount: number;
  reference?: string | null;
  date: Date;
  footer?: string | null;
  fiscal?: ReceiptFiscal | null;
}

/** Arma el ticket de un comprobante de pago (simple o fiscal). */
export function buildReceiptTicket(data: ReceiptData): Ticket {
  const headerLines: string[] = [];
  if (data.headerText) headerLines.push(data.headerText);
  if (data.address) headerLines.push(data.address);
  if (data.phone) headerLines.push(`Tel: ${data.phone}`);
  if (data.taxId) headerLines.push(`CUIT: ${data.taxId}`);

  const lines: TicketLine[] = [];
  if (data.member) lines.push({ label: 'Socio:', value: data.member });
  lines.push({ label: 'Concepto:', value: data.concept });
  lines.push({ label: 'Medio:', value: data.method });
  if (data.reference) lines.push({ label: 'Comprobante:', value: data.reference });

  let title = 'COMPROBANTE DE PAGO';
  if (data.fiscal) {
    title = data.fiscal.typeLabel || 'COMPROBANTE';
    lines.push({ label: 'Nro:', value: data.fiscal.number });
    if (data.fiscal.customerTaxId) lines.push({ label: 'Doc:', value: data.fiscal.customerTaxId });
    if (data.fiscal.cae) lines.push({ label: 'CAE:', value: data.fiscal.cae });
    if (data.fiscal.caeVenc) lines.push({ label: 'Vto CAE:', value: data.fiscal.caeVenc });
    if (typeof data.fiscal.net === 'number') lines.push({ label: 'Neto:', value: `$${data.fiscal.net.toFixed(2)}` });
    if (typeof data.fiscal.iva === 'number') lines.push({ label: 'IVA 21%:', value: `$${data.fiscal.iva.toFixed(2)}` });
  }

  return {
    organization: data.organization,
    headerLines,
    logo: data.logo ?? null,
    title,
    date: data.date.toISOString(),
    lines,
    total: `$${data.amount.toFixed(2)}`,
    footer: data.footer ?? 'Gracias por su pago',
  };
}

export interface ReceiptOrgInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
}

export interface ReceiptPaymentInfo {
  member?: string | null;
  concept: string;
  method: string;
  amount: number;
  reference?: string | null;
  invoiceNumber?: string | null;
  providerData?: string | null;
  date: Date;
}

/** Formatea la fecha de vencimiento del CAE (AFIP la entrega como AAAAMMDD). */
function formatCaeVenc(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(raw));
  if (!m) return String(raw);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Arma el ticket de un pago aplicando la configuracion del gimnasio: logo,
 * encabezado/pie y, si el ticket es fiscal y el pago ya tiene comprobante
 * ARCA emitido, el bloque con CAE, numero y neto/IVA.
 */
export async function buildPaymentReceipt(
  orgId: string,
  org: ReceiptOrgInfo | null,
  payment: ReceiptPaymentInfo,
  opts?: { fiscal?: boolean },
): Promise<Ticket> {
  const branding = await getTicketBranding(orgId);
  const wantFiscal = opts?.fiscal ?? branding.fiscalEnabled;

  let arca: Record<string, unknown> | null = null;
  if (wantFiscal && payment.invoiceNumber && payment.providerData) {
    try {
      const parsed = JSON.parse(payment.providerData) as { arca?: Record<string, unknown> };
      arca = parsed.arca ?? null;
    } catch {
      arca = null;
    }
  }

  const iva = payment.amount * 0.21;
  const fiscal: ReceiptFiscal | null =
    arca && payment.invoiceNumber
      ? {
          typeLabel: String(arca.tipoLabel ?? 'COMPROBANTE'),
          number: payment.invoiceNumber,
          cae: (arca.cae as string | null) ?? null,
          caeVenc: formatCaeVenc(arca.caeVenc as string | null),
          net: payment.amount - iva,
          iva,
          qrUrl: (arca.qrUrl as string | null) ?? null,
        }
      : null;

  return buildReceiptTicket({
    organization: org?.name ?? 'FIT system™',
    address: org?.address ?? null,
    phone: org?.phone ?? null,
    taxId: org?.taxId ?? null,
    logo: branding.showLogo ? org?.logoUrl ?? null : null,
    headerText: branding.headerText ?? null,
    member: payment.member ?? null,
    concept: payment.concept,
    method: payment.method,
    amount: payment.amount,
    reference: payment.reference ?? payment.invoiceNumber ?? null,
    date: payment.date,
    footer: branding.footerText ?? null,
    fiscal,
  });
}

export interface TicketBranding {
  showLogo: boolean;
  headerText?: string;
  footerText?: string;
  fiscalEnabled: boolean;
}

/**
 * Lee la configuracion del ticket del gimnasio (Ajustes > Impresion): si se
 * imprime el logo, un texto de encabezado/pie y si el ticket es fiscal.
 */
export async function getTicketBranding(orgId: string): Promise<TicketBranding> {
  const [logo, header, footer, type] = await Promise.all([
    getRawSetting(orgId, 'PRINT', 'SHOW_LOGO'),
    getRawSetting(orgId, 'PRINT', 'TICKET_HEADER'),
    getRawSetting(orgId, 'PRINT', 'TICKET_FOOTER'),
    getRawSetting(orgId, 'PRINT', 'TICKET_TYPE'),
  ]);
  return {
    showLogo: (logo ?? 'true') !== 'false',
    headerText: header || undefined,
    footerText: footer || undefined,
    fiscalEnabled: type === 'FISCAL',
  };
}
