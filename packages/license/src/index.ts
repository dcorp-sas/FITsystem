import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as edSign,
  timingSafeEqual,
  verify as edVerify,
  type KeyObject,
} from 'node:crypto';

/*
 * Núcleo de licencias de FIT System (puro: sin DB ni estado).
 * Lo comparten la API del producto (apps/api), el keygen (CLI) y el
 * Licensador (apps/licensador, que mantiene una copia JS equivalente).
 *
 * Formato: <prefijo>-<payload base64url>-<firma>
 *   FIT   → claves de licencia emitidas por el proveedor.
 *   FITC  → certificados de activación que otorga el servicio de licencias.
 *
 * Firmas soportadas:
 *   - HMAC-SHA256 (27 chars base64url): modo simple, secreto compartido.
 *   - Ed25519 (86 chars base64url): modo recomendado; la privada vive solo en
 *     el Licensador y los binarios embeben la pública.
 * Se aceptan ambas al verificar (transición sin cortes).
 * Referencia: decisiones de diseño tomadas del sistema de licencias de GastroOne.
 */

export const KEY_PREFIX = 'FIT';
export const CERT_PREFIX = 'FITC';

export interface Ed25519Signer {
  type: 'ed25519';
  key: unknown;
}
export type Signer = string | Ed25519Signer;
export type Verifier = Signer | null | undefined;

interface HmacSigner {
  type: 'hmac';
  key: string;
}

function signerOf(arg: Verifier): HmacSigner | Ed25519Signer {
  if (arg && typeof arg === 'object') {
    const type = (arg as { type?: string }).type;
    if (type === 'ed25519') return arg as Ed25519Signer;
    if (type === 'hmac') return arg as unknown as HmacSigner;
  }
  if (typeof arg === 'string' || arg === undefined || arg === null) {
    return { type: 'hmac', key: String(arg ?? '') };
  }
  throw new Error('Firmante inválido (string o {type:"ed25519", key})');
}

function verifiersOf(arg: Verifier | Verifier[]): (HmacSigner | Ed25519Signer)[] {
  const list = Array.isArray(arg) ? arg : [arg];
  return list.map(signerOf);
}

function toKeyObject(key: unknown): KeyObject {
  if (key && typeof key === 'object') {
    const k = key as Record<string, unknown> & KeyObject;
    if (k.type === 'private' || k.type === 'public') return k;
    if (k.kty === 'OKP' || k.x || k.d) {
      if (k.d) return createPrivateKey({ key: k, format: 'jwk' } as never);
      return createPublicKey({ key: k, format: 'jwk' } as never);
    }
  }
  return createPublicKey(key as never);
}

function signData(prefix: string, payloadB64: string, m: HmacSigner | Ed25519Signer): string {
  const data = Buffer.from(prefix + '|' + payloadB64, 'utf8');
  if (m.type === 'ed25519') {
    return edSign(null, data, toKeyObject(m.key)).toString('base64url');
  }
  return createHmac('sha256', m.key).update(data).digest('base64url').slice(0, 27);
}

function verifySig(
  prefix: string,
  payloadB64: string,
  sig: string,
  m: HmacSigner | Ed25519Signer,
): boolean {
  try {
    if (m.type === 'ed25519') {
      const pub = toKeyObject(m.key);
      if (!pub || pub.type !== 'public') return false;
      return edVerify(
        null,
        Buffer.from(prefix + '|' + payloadB64, 'utf8'),
        pub,
        Buffer.from(sig, 'base64url'),
      );
    }
    const expect = createHmac('sha256', m.key)
      .update(prefix + '|' + payloadB64)
      .digest('base64url')
      .slice(0, 27);
    const a = Buffer.from('0000' + expect, 'utf8');
    const b = Buffer.from('0000' + sig, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function pack(prefix: string, payload: object, signer: Verifier): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return prefix + '-' + b64 + '-' + signData(prefix, b64, signerOf(signer));
}

export interface LicensePayload {
  c: string;
  p: string;
  d: number;
  s: number;
  i: number;
  n: string;
}

export interface CertPayload {
  c: string;
  p: string;
  e: number;
  i: number;
  id: string;
}

export interface CheckOk {
  ok: true;
  prefix: string;
  payload: Record<string, unknown>;
  exp: number;
}
export interface CheckErr {
  ok: false;
  error: string;
}
export type CheckResult = CheckOk | CheckErr;

export function check(token: string, verifiers: Verifier | Verifier[]): CheckResult {
  if (typeof token !== 'string') return { ok: false, error: 'Clave inválida' };
  token = token.trim();
  if (!token) return { ok: false, error: 'Clave inválida' };
  const sep = token.indexOf('-');
  if (sep < 2) return { ok: false, error: 'Formato de clave inválido' };
  const prefix = token.slice(0, sep);
  if (prefix !== KEY_PREFIX && prefix !== CERT_PREFIX) {
    return { ok: false, error: 'Prefijo desconocido' };
  }
  const rest = token.slice(sep + 1);

  /* candidatas: Ed25519 (firma de 86) y HMAC (firma de 27). El b64 del payload
     puede contener '-', por eso la firma se mide desde el FINAL. */
  for (const m of verifiersOf(verifiers)) {
    const len = m.type === 'ed25519' ? 86 : 27;
    if (rest.length > len && rest[rest.length - len - 1] === '-') {
      const sig = rest.slice(-len);
      const b64 = rest.slice(0, rest.length - len - 1);
      if (!b64) continue;
      if (!verifySig(prefix, b64, sig, m)) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as Record<string, unknown>;
      } catch {
        continue;
      }
      const exp = Number(payload.e) || Number(payload.i) + Number(payload.d) * 864e5;
      if (!exp) return { ok: false, error: 'Sin fecha de vencimiento' };
      return { ok: true, prefix, payload, exp };
    }
  }
  return { ok: false, error: 'Firma de clave inválida' };
}

export interface IssueOptions {
  client?: string;
  plan?: string;
  days?: number;
  seats?: number;
  issued?: number;
}

/* Clave de licencia emitida por el proveedor.
   Payload: c=client, p=plan, d=días, s=asientos, i=issued, n=nonce. */
export function issue(options: IssueOptions = {}, signer: Verifier): string {
  const payload: LicensePayload = {
    c: String(options.client ?? 'Cliente'),
    p: String(options.plan ?? 'PRO'),
    d: Number(options.days) || 365,
    s: Math.max(1, Number(options.seats) || 1),
    i: Number(options.issued ?? Date.now()),
    n: randomBytes(4).toString('hex'),
  };
  return pack(KEY_PREFIX, payload, signer);
}

export interface CertOptions {
  client?: string;
  plan?: string;
  exp?: number;
  installId?: string;
}

/* Certificado de activación que entrega el Licensador a una instalación. */
export function makeCert(options: CertOptions = {}, signer: Verifier): string {
  const payload: CertPayload = {
    c: String(options.client ?? 'Cliente'),
    p: String(options.plan ?? 'PRO'),
    e: Number(options.exp) || Date.now() + 365 * 864e5,
    i: Date.now(),
    id: String(options.installId ?? ''),
  };
  return pack(CERT_PREFIX, payload, signer);
}

export function verifyKey(token: string, verifiers: Verifier | Verifier[]): CheckResult {
  return check(token, verifiers);
}
export function verifyCert(token: string, verifiers: Verifier | Verifier[]): CheckResult {
  return check(token, verifiers);
}
