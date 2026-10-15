import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMemberQr, parseMemberQr, signAccessQr, parseAccessQr, accessRotationPeriod } from './member-qr.js';

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

test('signAccessQr produce un QR fijo parseable y verificado', () => {
  const qr = signAccessQr('org1', 'branch1', 'NEVER');
  assert.match(qr, /^fitsystem:\/\/checkin\?/);
  const parsed = parseAccessQr(qr);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.orgId, 'org1');
    assert.equal(parsed.data.branchId, 'branch1');
    assert.equal(parsed.data.period, 'static');
  }
});

test('signAccessQr es estable para el modo fijo', () => {
  assert.equal(signAccessQr('org1', 'b1', 'NEVER'), signAccessQr('org1', 'b1', 'NEVER'));
});

test('parseAccessQr rechaza un QR alterado o de otra sede', () => {
  const qr = signAccessQr('org1', 'branchA', 'NEVER');
  assert.equal(parseAccessQr(qr.replace('branch=branchA', 'branch=evil')).ok, false);
  assert.equal(parseAccessQr('fitsystem://checkin?org=o&branch=b&p=static').ok, false);
  assert.equal(parseAccessQr('fitsystem://member?org=o&id=m&code=c&sig=x').ok, false);
  assert.equal(parseAccessQr('https://example.com').ok, false);
});

test('signAccessQr rota el periodo segun la configuracion', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  assert.equal(accessRotationPeriod('NEVER', now), 'static');
  assert.equal(accessRotationPeriod('DAILY', now), '2026-03-10');
  const weekly = signAccessQr('o', 'b', 'WEEKLY', now);
  const parsedWeekly = parseAccessQr(weekly);
  assert.equal(parsedWeekly.ok, true);
  assert.match(accessRotationPeriod('WEEKLY', now), /^\d{4}-W\d{2}$/);
  const nextWeek = signAccessQr('o', 'b', 'WEEKLY', new Date('2026-03-17T12:00:00.000Z'));
  assert.notEqual(weekly, nextWeek);
});
