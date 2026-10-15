import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/*
 * QR de socio firmado. El payload viaja como:
 *   fitsystem://member?org=<orgId>&id=<memberId>&code=<memberCode>&sig=<hmac>
 * La firma (HMAC-SHA256) impide que un tercero fabrique un QR con el codigo de
 * otro socio; el control de acceso valida la firma en el servidor.
 */

function sign(input: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(input).digest('base64url');
}

function signatureFor(orgId: string, memberId: string, code: string): string {
  return sign(`${orgId}:${memberId}:${code}`);
}

export function signMemberQr(orgId: string, memberId: string, code: string): string {
  const sig = signatureFor(orgId, memberId, code);
  return `fitsystem://member?org=${encodeURIComponent(orgId)}&id=${encodeURIComponent(memberId)}&code=${encodeURIComponent(code)}&sig=${sig}`;
}

export interface ParsedMemberQr {
  orgId: string;
  memberId: string;
  code: string;
}

export type ParseMemberQrResult =
  | { ok: true; data: ParsedMemberQr }
  | { ok: false; reason: 'not_qr' | 'invalid' };

export function parseMemberQr(payload: string): ParseMemberQrResult {
  const text = payload.trim();
  if (!/^fitsystem:\/\//i.test(text)) return { ok: false, reason: 'not_qr' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.hostname !== 'member') return { ok: false, reason: 'invalid' };

  const orgId = url.searchParams.get('org') ?? '';
  const memberId = url.searchParams.get('id') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  if (!orgId || !memberId || !code || !sig) return { ok: false, reason: 'invalid' };

  const expected = signatureFor(orgId, memberId, code);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };

  return { ok: true, data: { orgId, memberId, code } };
}

/*
 * QR fijo de ingreso. A diferencia del QR de socio, este NO identifica a una
 * persona: identifica al gimnasio (y sede). Se imprime una sola vez y se pega
 * en la puerta; el socio lo escanea con la app y el servidor marca SU ingreso
 * (la identidad viaja en la sesion del socio, no en el QR).
 *
 *   fitsystem://checkin?org=<orgId>&branch=<branchId>&p=<periodo>&sig=<hmac>
 *
 * El hash se calcula sobre el periodo (que puede rotar) para que un QR viejo
 * deje de servir si se configura rotacion.
 */

export type AccessRotation = 'NEVER' | 'DAILY' | 'WEEKLY';

export function accessRotationPeriod(rotation: AccessRotation, now = new Date()): string {
  if (rotation === 'DAILY') return now.toISOString().slice(0, 10);
  if (rotation === 'WEEKLY') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return 'static';
}

function accessSignature(orgId: string, branchId: string, period: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`access:${orgId}:${branchId}:${period}`).digest('base64url');
}

export function signAccessQr(orgId: string, branchId: string, rotation: AccessRotation = 'NEVER', now = new Date()): string {
  const period = accessRotationPeriod(rotation, now);
  const sig = accessSignature(orgId, branchId, period);
  const params = new URLSearchParams({ org: orgId, branch: branchId, p: period, sig });
  return `fitsystem://checkin?${params.toString()}`;
}

export function parseAccessQr(
  payload: string,
): { ok: true; data: { orgId: string; branchId: string; period: string } } | { ok: false; reason: 'not_qr' | 'invalid' } {
  const text = payload.trim();
  if (!/^fitsystem:\/\//i.test(text)) return { ok: false, reason: 'not_qr' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.hostname !== 'checkin') return { ok: false, reason: 'invalid' };

  const orgId = url.searchParams.get('org') ?? '';
  const branchId = url.searchParams.get('branch') ?? '';
  const period = url.searchParams.get('p') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  if (!orgId || !branchId || !period || !sig) return { ok: false, reason: 'invalid' };

  const expected = accessSignature(orgId, branchId, period);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };

  return { ok: true, data: { orgId, branchId, period } };
}
