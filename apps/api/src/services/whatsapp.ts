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
