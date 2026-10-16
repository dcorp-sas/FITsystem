import crypto from 'node:crypto';
import { env } from '../env.js';

/* ---------------------------------------------------------------------------
 * Cifrado de secretos en reposo (AES-256-GCM).
 *
 * Los valores de `Setting` marcados como secretos se guardan cifrados en la
 * base. La clave se toma de SETTINGS_ENC_KEY y, si no está definida, se deriva
 * del JWT_SECRET (para no romper instalaciones existentes). El formato es
 * `enc:v1:<iv>:<tag>:<ciphertext>` (todo en base64); cualquier valor sin ese
 * prefijo se considera texto plano legado y se lee tal cual.
 * ------------------------------------------------------------------------- */

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const source = process.env.SETTINGS_ENC_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update(`fitsystem-settings:${source}`).digest();
}

export function encryptSecret(plain: string): string {
  if (plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored;
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
    if (!ivB64 || !tagB64 || !dataB64) return stored;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/* ---------------------------------------------------------------------------
 * TOTP (RFC 6238) para 2FA con apps autenticadoras.
 * ------------------------------------------------------------------------- */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

export function totpCode(secret: string, forTime: number = Date.now(), step = 30): string {
  return hotp(base32Decode(secret), Math.floor(forTime / 1000 / step));
}

/** Verifica un código TOTP con tolerancia de ±`window` pasos. */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!secret || !/^\d{6}$/.test(code.trim())) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const input = code.trim();
  for (let i = -window; i <= window; i++) {
    const expected = hotp(key, counter + i);
    if (expected.length === input.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input))) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(secret: string, label: string, issuer = 'FIT system™'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(5).toString('hex'));
  }
  return codes;
}

export function generateNumericCode(digits = 6): string {
  let code = '';
  for (let i = 0; i < digits; i++) code += crypto.randomInt(0, 10);
  return code;
}

export { env };
