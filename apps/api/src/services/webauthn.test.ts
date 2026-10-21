import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyAssertion, parseCosePublicKey } from './webauthn.js';

function cborUint(n: number): Buffer {
  if (n >= 0 && n < 24) return Buffer.from([n]);
  if (n < 256) return Buffer.from([0x18, n]);
  return Buffer.from([0x19, n >> 8, n & 0xff]);
}

// COSE negative integer: el valor -n se codifica como major 1 con argumento n-1.
function cborNeg(n: number): Buffer {
  const arg = n - 1;
  if (arg < 24) return Buffer.from([0x20 | arg]);
  if (arg < 256) return Buffer.from([0x38, arg]);
  return Buffer.from([0x39, arg >> 8, arg & 0xff]);
}

function cborBytes(buf: Buffer): Buffer {
  const len = buf.length;
  let header: Buffer;
  if (len < 24) header = Buffer.from([0x40 | len]);
  else if (len < 256) header = Buffer.from([0x58, len]);
  else header = Buffer.from([0x59, len >> 8, len & 0xff]);
  return Buffer.concat([header, buf]);
}

function cborMap(pairs: Buffer[][]): Buffer {
  return Buffer.concat([Buffer.from([0xa0 | pairs.length]), ...pairs.flat()]);
}

function b64u(buf: Buffer): string {
  return Buffer.from(buf).toString('base64url');
}

function makeEs256Key() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const cose = cborMap([
    [cborUint(1), cborUint(2)], // kty: EC2
    [cborUint(3), cborNeg(7)], // alg: ES256 (-7)
    [cborNeg(1), cborUint(1)], // crv: P-256
    [cborNeg(2), cborBytes(x)],
    [cborNeg(3), cborBytes(y)],
  ]);
  return { privateKey, publicKeyB64: b64u(cose) };
}

function signAssertion(privateKey: crypto.KeyObject, challenge: string) {
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge }));
  const authData = crypto.randomBytes(37);
  authData.writeUInt32BE(5, authData.length - 4);
  const clientHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const signature = crypto.sign('SHA256', Buffer.concat([authData, clientHash]), privateKey);
  return {
    authenticatorData: b64u(authData),
    clientDataJSON: b64u(clientDataJSON),
    signature: b64u(signature),
  };
}

test('parsea una clave pública COSE ES256', () => {
  const { publicKeyB64 } = makeEs256Key();
  const parsed = parseCosePublicKey(publicKeyB64);
  assert.equal(parsed.alg, -7);
});

test('verifica una firma válida y devuelve el contador', () => {
  const { privateKey, publicKeyB64 } = makeEs256Key();
  const challenge = 'desafio-valido';
  const input = signAssertion(privateKey, challenge);
  assert.equal(verifyAssertion(publicKeyB64, input, challenge), 5);
});

test('rechaza un desafío que no coincide', () => {
  const { privateKey, publicKeyB64 } = makeEs256Key();
  const input = signAssertion(privateKey, 'desafio-bueno');
  assert.equal(verifyAssertion(publicKeyB64, input, 'desafio-malo'), null);
});

test('rechaza una firma alterada', () => {
  const { privateKey, publicKeyB64 } = makeEs256Key();
  const challenge = 'desafio';
  const input = signAssertion(privateKey, challenge);
  const tampered = { ...input, signature: b64u(crypto.randomBytes(64)) };
  assert.equal(verifyAssertion(publicKeyB64, tampered, challenge), null);
});

test('rechaza una assertion con tipo incorrecto', () => {
  const { privateKey, publicKeyB64 } = makeEs256Key();
  const challenge = 'desafio';
  const input = signAssertion(privateKey, challenge);
  const badType = {
    ...input,
    clientDataJSON: b64u(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge }))),
  };
  assert.equal(verifyAssertion(publicKeyB64, badType, challenge), null);
});
