import { getRawSetting } from './settings.js';

/**
 * Normaliza un teléfono a formato internacional sin símbolos.
 * Heurística pensada para Argentina (código 54) pero configurable:
 *  - "011 5555-1234"  -> 5491155551234 (agrega 9 de móvil para AR)
 *  - "+54 9 11 5555..." -> 5491155551234
 *  - "11 5555 1234"   -> 5491155551234
 */
export function normalizePhone(raw: string, country = '54'): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(country)) {
    // Si ya es AR pero le falta el 9 de móvil tras el 54, lo insertamos.
    if (country === '54') {
      const rest = digits.slice(2);
      if (!rest.startsWith('9')) return `${country}9${rest}`;
    }
    return digits;
  }
  const withoutZero = digits.replace(/^0+/, '');
  if (country === '54') {
    // AR móvil: 54 + 9 + área + número
    return `${country}9${withoutZero}`;
  }
  return `${country}${withoutZero}`;
}

/** Construye un enlace click-to-chat de WhatsApp (wa.me) con mensaje opcional. */
export function buildWaLink(phone: string, message: string, base = 'https://wa.me'): string {
  const normalized = normalizePhone(phone);
  const root = (base || 'https://wa.me').replace(/\/+$/, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `${root}/${normalized}${text}`;
}

/** Devuelve el enlace de WhatsApp para un teléfono usando la config de la org. */
export async function whatsappLink(orgId: string, phone: string, message = ''): Promise<string> {
  const base = (await getRawSetting(orgId, 'WHATSAPP', 'WA_URL_BASE')) || 'https://wa.me';
  const fallback = (await getRawSetting(orgId, 'WHATSAPP', 'BUSINESS_PHONE')) || '';
  return buildWaLink(phone || fallback, message, base);
}

export interface WhatsAppCloudConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
}

/** Config de WhatsApp Cloud API (Meta). null si no está configurada. */
export async function getWhatsAppCloud(orgId: string): Promise<WhatsAppCloudConfig | null> {
  const token = await getRawSetting(orgId, 'WHATSAPP', 'CLOUD_TOKEN');
  const phoneNumberId = await getRawSetting(orgId, 'WHATSAPP', 'PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) return null;
  const apiVersion = (await getRawSetting(orgId, 'WHATSAPP', 'API_VERSION')) || 'v20.0';
  return { token, phoneNumberId, apiVersion };
}

export interface WhatsAppSendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * Envia un mensaje de texto con la WhatsApp Cloud API (Meta).
 * Requiere CLOUD_TOKEN + PHONE_NUMBER_ID en Configuración > WhatsApp.
 */
export async function sendWhatsAppCloud(orgId: string, phone: string, message: string): Promise<WhatsAppSendResult> {
  const cfg = await getWhatsAppCloud(orgId);
  if (!cfg) return { ok: false, error: 'WhatsApp Cloud API no configurada' };
  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: 'Telefono invalido' };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, providerId: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
