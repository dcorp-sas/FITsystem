'use strict';
/* Núcleo de licencias de FIT System (copia autónoma para el Licensador).
   Mantiene EXACTAMENTE el mismo formato que packages/license del producto:
     <prefijo>-<payload base64url>-<firma>
     FIT  → claves emitidas por el proveedor.
     FITC → certificados de activación.
   Firmas: HMAC-SHA256 (27 chars) y Ed25519 (86 chars). */
const crypto = require('crypto');

const KEY_PREFIX = 'FIT';
const CERT_PREFIX = 'FITC';

function signerOf(arg) {
  if (arg && arg.type === 'ed25519') return arg;
  if (arg && arg.type === 'hmac') return arg;
  if (typeof arg === 'string' || arg === undefined || arg === null) {
    return { type: 'hmac', key: String(arg || '') };
  }
  throw new Error('Firmante inválido (string o {type:"ed25519", key})');
}
function verifiersOf(arg) {
  const list = Array.isArray(arg) ? arg : [arg];
  return list.map(signerOf);
}
function toKeyObject(key) {
  if (key && typeof key === 'object') {
    if (key.type === 'private' || key.type === 'public') return key;
    if (key.kty === 'OKP' || key.x || key.d) {
      if (key.d) return crypto.createPrivateKey({ key, format: 'jwk' });
      return crypto.createPublicKey({ key, format: 'jwk' });
    }
  }
  return crypto.createPublicKey(key);
}

function signData(prefix, payloadB64, m) {
  const data = Buffer.from(prefix + '|' + payloadB64, 'utf8');
  if (m.type === 'ed25519') {
    return crypto.sign(null, data, toKeyObject(m.key)).toString('base64url');
  }
  return crypto.createHmac('sha256', m.key).update(data).digest('base64url').slice(0, 27);
}
function verifySig(prefix, payloadB64, sig, m) {
  try {
    if (m.type === 'ed25519') {
      const pub = toKeyObject(m.key);
      if (!pub || pub.type !== 'public') return false;
      return crypto.verify(null, Buffer.from(prefix + '|' + payloadB64, 'utf8'), pub, Buffer.from(sig, 'base64url'));
    }
    const expect = crypto.createHmac('sha256', m.key)
      .update(prefix + '|' + payloadB64).digest('base64url').slice(0, 27);
    const a = Buffer.from('0000' + expect, 'utf8');
    const b = Buffer.from('0000' + sig, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function pack(prefix, payload, signer) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return prefix + '-' + b64 + '-' + signData(prefix, b64, signerOf(signer));
}

function check(token, verifiers) {
  if (typeof token !== 'string') return { ok: false, error: 'Clave inválida' };
  token = token.trim();
  if (!token) return { ok: false, error: 'Clave inválida' };
  const sep = token.indexOf('-');
  if (sep < 2) return { ok: false, error: 'Formato de clave inválido' };
  const prefix = token.slice(0, sep);
  if (prefix !== KEY_PREFIX && prefix !== CERT_PREFIX) return { ok: false, error: 'Prefijo desconocido' };
  const rest = token.slice(sep + 1);

  for (const m of verifiersOf(verifiers)) {
    const len = m.type === 'ed25519' ? 86 : 27;
    if (rest.length > len && rest[rest.length - len - 1] === '-') {
      const sig = rest.slice(-len);
      const b64 = rest.slice(0, rest.length - len - 1);
      if (!b64) continue;
      if (!verifySig(prefix, b64, sig, m)) continue;
      let payload;
      try {
        payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      } catch (e) {
        continue;
      }
      const exp = Number(payload.e) || (Number(payload.i) + Number(payload.d) * 864e5);
      if (!exp) return { ok: false, error: 'Sin fecha de vencimiento' };
      return { ok: true, prefix, payload, exp };
    }
  }
  return { ok: false, error: 'Firma de clave inválida' };
}

function issue(opt, signer) {
  const o = opt || {};
  const payload = {
    c: String(o.client || 'Cliente'),
    p: String(o.plan || 'PRO'),
    d: Number(o.days) || 365,
    s: Math.max(1, Number(o.seats) || 1),
    i: Number(o.issued || Date.now()),
    n: crypto.randomBytes(4).toString('hex'),
  };
  return pack(KEY_PREFIX, payload, signer);
}

function makeCert(opt, signer) {
  const o = opt || {};
  const payload = {
    c: String(o.client || 'Cliente'),
    p: String(o.plan || 'PRO'),
    e: Number(o.exp) || (Date.now() + 365 * 864e5),
    i: Date.now(),
    id: String(o.installId || ''),
  };
  return pack(CERT_PREFIX, payload, signer);
}

function verifyKey(token, verifiers) {
  return check(token, verifiers);
}
function verifyCert(token, verifiers) {
  return check(token, verifiers);
}

module.exports = { KEY_PREFIX, CERT_PREFIX, issue, makeCert, verifyKey, verifyCert };
