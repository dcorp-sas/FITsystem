import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { issue, check, makeCert, verifyKey, verifyCert } from './index.js';

const ed = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKey };
};

test('HMAC: emite y verifica una clave', () => {
  const secret = 'secreto-super-largo-para-hmac';
  const key = issue({ client: 'Gym X', plan: 'PRO', days: 30, seats: 3 }, secret);
  assert.match(key, /^FIT-/);
  const r = check(key, secret);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.p, 'PRO');
    assert.equal(r.payload.s, 3);
    assert.equal(r.payload.c, 'Gym X');
  }
});

test('HMAC: la expiracion se calcula desde issued + dias', () => {
  const issued = Date.now();
  const key = issue({ days: 10, issued }, 'secreto');
  const r = check(key, 'secreto');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.exp, issued + 10 * 864e5);
});

test('HMAC: rechaza clave manipulada', () => {
  const secret = 'otro-secreto';
  const key = issue({ client: 'A' }, secret);
  const tampered = key.slice(0, -2) + (key.endsWith('aa') ? 'bb' : 'aa');
  assert.equal(check(tampered, secret).ok, false);
});

test('HMAC: rechaza secreto distinto', () => {
  const key = issue({}, 'clave-1');
  assert.equal(check(key, 'clave-2').ok, false);
});

test('Ed25519: emite con privada y verifica con publica', () => {
  const { privateKey, publicKey } = ed();
  const signer = { type: 'ed25519' as const, key: privateKey };
  const key = issue({ client: 'Ed', plan: 'ENTERPRISE', days: 365, seats: 10 }, signer);
  const r = check(key, { type: 'ed25519', key: publicKey });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.payload.p, 'ENTERPRISE');
});

test('Ed25519: una publica equivocada no valida', () => {
  const a = ed();
  const b = ed();
  const key = issue({}, { type: 'ed25519', key: a.privateKey });
  assert.equal(check(key, { type: 'ed25519', key: b.publicKey }).ok, false);
});

test('certificado: makeCert + verifyCert', () => {
  const { privateKey, publicKey } = ed();
  const cert = makeCert(
    { client: 'Gym', plan: 'BASIC', installId: 'inst-1', exp: Date.now() + 1000 },
    { type: 'ed25519', key: privateKey },
  );
  assert.match(cert, /^FITC-/);
  assert.equal(verifyCert(cert, { type: 'ed25519', key: publicKey }).ok, true);
});

test('acepta multiples verificadores (transicion HMAC a Ed25519)', () => {
  const { privateKey, publicKey } = ed();
  const key = issue({}, { type: 'ed25519', key: privateKey });
  const r = check(key, ['secreto-viejo', { type: 'ed25519', key: publicKey }, null]);
  assert.equal(r.ok, true);
});

test('verifyKey es alias de check', () => {
  const key = issue({}, 's');
  assert.equal(verifyKey(key, 's').ok, true);
});

test('rechaza entradas invalidas', () => {
  assert.equal(check('', 'x').ok, false);
  assert.equal(check('NOPE-abc-def', 'x').ok, false);
  assert.equal(check('FIT-###-###', 'x').ok, false);
});
