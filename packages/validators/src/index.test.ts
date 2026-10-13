import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portalLoginSchema,
  memberSchema,
  planSchema,
  settingsUpsertSchema,
  licenseActivateSchema,
  portalAccountSchema,
} from './index.js';

test('portalLoginSchema acepta un login valido', () => {
  const r = portalLoginSchema.safeParse({
    organizationSlug: 'fit-demo',
    identifier: 'juan@mail.com',
    password: 'socio123',
  });
  assert.equal(r.success, true);
});

test('portalLoginSchema rechaza identificador corto', () => {
  const r = portalLoginSchema.safeParse({ organizationSlug: 'fit', identifier: 'a', password: 'x' });
  assert.equal(r.success, false);
});

test('memberSchema acepta un socio minimo', () => {
  const r = memberSchema.safeParse({ branchId: 'br1', firstName: 'Juan', lastName: 'Gomez' });
  assert.equal(r.success, true);
});

test('memberSchema rechaza sin apellido', () => {
  const r = memberSchema.safeParse({ branchId: 'br1', firstName: 'Juan' });
  assert.equal(r.success, false);
});

test('memberSchema acepta email vacio', () => {
  const r = memberSchema.safeParse({ branchId: 'br1', firstName: 'A', lastName: 'B', email: '' });
  assert.equal(r.success, true);
});

test('planSchema coacciona numeros desde strings', () => {
  const r = planSchema.safeParse({ name: 'Mensual', type: 'MONTHLY', price: '1500', durationDays: '30' });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.price, 1500);
    assert.equal(r.data.durationDays, 30);
  }
});

test('planSchema rechaza duracion 0', () => {
  const r = planSchema.safeParse({ name: 'X', type: 'MONTHLY', price: 0, durationDays: 0 });
  assert.equal(r.success, false);
});

test('settingsUpsertSchema rechaza categoria desconocida', () => {
  const r = settingsUpsertSchema.safeParse({ category: 'NOPE', values: {} });
  assert.equal(r.success, false);
});

test('licenseActivateSchema exige installationId de al menos 4', () => {
  assert.equal(licenseActivateSchema.safeParse({ installationId: 'abc', licenseKey: 'FIT-x' }).success, false);
  assert.equal(licenseActivateSchema.safeParse({ installationId: 'abcd', licenseKey: 'FIT-x' }).success, true);
});

test('portalAccountSchema acepta generar codigo sin password', () => {
  const r = portalAccountSchema.safeParse({ generateCode: true });
  assert.equal(r.success, true);
});

test('portalAccountSchema rechaza password corta', () => {
  const r = portalAccountSchema.safeParse({ password: '123' });
  assert.equal(r.success, false);
});
