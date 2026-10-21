import crypto from 'node:crypto';

/**
 * Verificación mínima de una credencial WebAuthn (huella / Windows Hello).
 *
 * La huella nunca sale del equipo: el navegador guarda el template en el
 * autenticador y entrega una clave pública (COSE). En el check-in el equipo
 * firma un desafío y el servidor valida esa firma contra la clave pública
 * guardada. Solo soportamos las curvas/algoritmos que Windows Hello y los
 * autenticadores de plataforma usan habitualmente: ES256 (-7) y RS256 (-257).
 */

export type CoseAlg = -7 | -257;

export interface ParsedCredential {
  alg: CoseAlg;
  key: crypto.KeyObject;
}

function base64urlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function readCborHeader(buf: Buffer, offset: number): { value: number; next: number; major: number } {
  const first = buf[offset]!;
  const major = first >> 5;
  const info = first & 0x1f;
  let next = offset + 1;
  let raw: number;
  if (info < 24) {
    raw = info;
  } else if (info === 24) {
    raw = buf[next]!;
    next += 1;
  } else if (info === 25) {
    raw = buf.readUInt16BE(next);
    next += 2;
  } else if (info === 26) {
    raw = buf.readUInt32BE(next);
    next += 4;
  } else {
    throw new Error('CBOR: cabecera no soportada');
  }
  // Los enteros negativos (major 1) representan -1 - raw.
  const value = major === 1 ? -1 - raw : raw;
  return { value, next, major };
}

function skipCborItem(buf: Buffer, offset: number): number {
  const first = buf[offset]!;
  const info = first & 0x1f;
  let next = offset + 1;
  if (info < 24) {
    /* inline */
  } else if (info === 24) next += 1;
  else if (info === 25) next += 2;
  else if (info === 26) next += 4;
  else if (info === 27) next += 8;
  else throw new Error('CBOR: no soportado');
  // Los items COSE que nos interesan (32..-2) son enteros/texto cortos; para el
  // resto nos alcanza con avanzar el header (no consumimos payloads largos).
  return next;
}

/**
 * Parsea una clave pública COSE (COSE_Key) y devuelve el algoritmo y un
 * KeyObject listo para verificar firmas.
 */
export function parseCosePublicKey(publicKeyB64: string): ParsedCredential {
  const buf = base64urlToBuffer(publicKeyB64);
  const mapFirst = buf[0]!;
  if (mapFirst >> 5 !== 5) throw new Error('COSE: no es un mapa');

  const { value: size, next } = readCborHeader(buf, 0);
  let offset = next;

  let kty = 0;
  let alg: CoseAlg = -7;
  let crv = 0;
  let xBuf: Buffer | null = null;
  let yBuf: Buffer | null = null;
  let nBuf: Buffer | null = null;
  let eBuf: Buffer | null = null;

  for (let i = 0; i < size; i++) {
    const { value: key, next: kNext } = readCborHeader(buf, offset);
    offset = kNext;
    // Leer el valor según qué clave sea.
    if (key === 3) {
      // alg
      const r = readCborHeader(buf, offset);
      alg = r.value as CoseAlg;
      offset = r.next;
    } else if (key === 1) {
      // kty
      const r = readCborHeader(buf, offset);
      kty = r.value;
      offset = r.next;
    } else if (key === -1) {
      // crv
      const r = readCborHeader(buf, offset);
      crv = r.value;
      offset = r.next;
    } else if (key === -2) {
      // x (EC) o n (RSA)
      const len = readCborHeader(buf, offset);
      const start = len.next;
      const end = start + len.value;
      const slice = buf.subarray(start, end);
      offset = end;
      if (kty === 3) nBuf = slice;
      else xBuf = slice;
    } else if (key === -3) {
      const len = readCborHeader(buf, offset);
      const start = len.next;
      const end = start + len.value;
      const slice = buf.subarray(start, end);
      offset = end;
      if (kty === 3) eBuf = slice;
      else yBuf = slice;
    } else {
      offset = skipCborItem(buf, offset);
    }
  }

  if (kty === 3 && alg === -257 && nBuf && eBuf) {
    // RSA: JWK con módulo y exponente.
    const jwk = {
      kty: 'RSA',
      n: nBuf.toString('base64url'),
      e: eBuf.toString('base64url'),
    };
    return { alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) };
  }

  if ((alg === -7 || alg === -257) && xBuf && yBuf) {
    // EC P-256 (crv = 1).
    void crv;
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: xBuf.toString('base64url'),
      y: yBuf.toString('base64url'),
    };
    return { alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) };
  }

  throw new Error('COSE: clave pública no soportada (sólo ES256/RS256)');
}

export interface AssertionInput {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

/**
 * Verifica una assertion WebAuthn contra la clave pública guardada.
 * Devuelve el nuevo contador de firma, o null si la firma es inválida.
 */
export function verifyAssertion(publicKeyB64: string, input: AssertionInput, expectedChallenge: string): number | null {
  try {
    const parsed = parseCosePublicKey(publicKeyB64);
    const authData = base64urlToBuffer(input.authenticatorData);
    const clientData = base64urlToBuffer(input.clientDataJSON);
    const signature = base64urlToBuffer(input.signature);

    const clientDataJson = JSON.parse(clientData.toString('utf8')) as {
      type?: string;
      challenge?: string;
    };
    if (clientDataJson.type !== 'webauthn.get') return null;
    if (clientDataJson.challenge !== expectedChallenge) return null;

    // Firma: SHA-256 sobre authenticatorData || SHA-256(clientDataJSON).
    const clientHash = crypto.createHash('sha256').update(clientData).digest();
    const signedData = Buffer.concat([authData, clientHash]);

    const verifier =
      parsed.alg === -7
        ? crypto.createVerify('SHA256')
        : crypto.createVerify('RSA-SHA256');
    verifier.update(signedData);
    verifier.end();
    const valid = verifier.verify(parsed.key, signature);
    if (!valid) return null;

    // Contador de firma (flags + counter). Está en los últimos 4 bytes de authData.
    if (authData.length >= 4) {
      const counter = authData.readUInt32BE(authData.length - 4);
      return counter;
    }
    return 0;
  } catch {
    return null;
  }
}

export { base64urlToBuffer };
