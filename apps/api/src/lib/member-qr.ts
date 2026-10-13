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
