import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMemberQr, parseMemberQr } from './member-qr.js';

test('signMemberQr produce un QR parseable y verificado', () => {
  const qr = signMemberQr('org1', 'mem1', 'SOC-001');
  assert.match(qr, /^fitsystem:\/\/member\?/);
  const parsed = parseMemberQr(qr);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.data, { orgId: 'org1', memberId: 'mem1', code: 'SOC-001' });
  }
});

test('parseMemberQr rechaza un QR con firma alterada', () => {
  const qr = signMemberQr('org1', 'mem1', 'SOC-001');
  const tampered = qr.replace('code=SOC-001', 'code=SOC-999');
  const parsed = parseMemberQr(tampered);
  assert.equal(parsed.ok, false);
});

test('parseMemberQr rechaza payloads que no son QR de socio', () => {
  assert.equal(parseMemberQr('https://example.com').ok, false);
  assert.equal(parseMemberQr('12345678').ok, false);
});

test('parseMemberQr rechaza un QR sin firma', () => {
  const parsed = parseMemberQr('fitsystem://member?org=o&id=m&code=c');
  assert.equal(parsed.ok, false);
});
