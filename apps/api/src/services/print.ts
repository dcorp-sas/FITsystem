import { getRawSetting } from './settings.js';

export interface TicketLine {
  label: string;
  value: string;
}

export interface Ticket {
  organization?: string;
  title?: string;
  date?: string | number;
  lines: TicketLine[];
  total?: string;
  footer?: string;
}

export interface PrintConfig {
  destUrl: string;
  printer?: string;
}

export interface PrintResult {
  ok: boolean;
  error?: string;
}

/**
 * Config del servidor de impresion local (lo expone la app de escritorio en
 * el puerto 3999). Se puede apuntar a otra PC de la red via PRINT.DEST_URL.
 */
export async function getPrintConfig(orgId: string): Promise<PrintConfig> {
  const destUrl = (await getRawSetting(orgId, 'PRINT', 'DEST_URL')) || 'http://127.0.0.1:3999';
  const printer = await getRawSetting(orgId, 'PRINT', 'PRINTER_NAME');
  return { destUrl: destUrl.replace(/\/+$/, ''), printer: printer || undefined };
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
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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

export interface ReceiptData {
  organization: string;
  member?: string | null;
  concept: string;
  method: string;
  amount: number;
  reference?: string | null;
  date: Date;
  footer?: string;
}

/** Arma el ticket de un comprobante de pago. */
export function buildReceiptTicket(data: ReceiptData): Ticket {
  const lines: TicketLine[] = [];
  if (data.member) lines.push({ label: 'Socio:', value: data.member });
  lines.push({ label: 'Concepto:', value: data.concept });
  lines.push({ label: 'Medio:', value: data.method });
  if (data.reference) lines.push({ label: 'Comprobante:', value: data.reference });
  return {
    organization: data.organization,
    title: 'COMPROBANTE DE PAGO',
    date: data.date.toISOString(),
    lines,
    total: `$${data.amount.toFixed(2)}`,
    footer: data.footer ?? 'Gracias por su pago',
  };
}
