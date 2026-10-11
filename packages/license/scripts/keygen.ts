#!/usr/bin/env node
/*
 * FIT System — keygen: emisión/verificación de claves de licencia (herramienta del proveedor).
 *
 * Uso:
 *   pnpm --filter @fitsystem/license keygen genpair
 *       Genera el par Ed25519 e imprime la clave PÚBLICA (para el producto) y el
 *       env LICENSE_PRIVATE_KEY (para el Licensador), más un ejemplo verificado.
 *   pnpm --filter @fitsystem/license keygen emit --client "Gimnasio X" [--plan PRO] [--days 365] [--seats 100] [--csv [archivo]]
 *       Firma con la clave PRIVADA Ed25519 (env LICENSE_PRIVATE_KEY) o, si no hay,
 *       con el secreto HMAC (--secret o LICENSE_SECRET).
 *   pnpm --filter @fitsystem/license keygen verify FIT-xxxx-yyy
 *   pnpm --filter @fitsystem/license keygen csv [archivo]
 *   pnpm --filter @fitsystem/license keygen secret
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { issue, verifyKey, type Signer, type Verifier } from '../src/index.js';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name: string): boolean {
  return process.argv.includes('--' + name);
}
function csvCell(v: unknown): string {
  const s = String(v == null ? '' : v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvPathOpt(): string | null {
  if (!flag('csv')) return null;
  const v = arg('csv');
  return v && !v.startsWith('--') ? v : 'licencias.csv';
}
function appendCsvRow(file: string, row: unknown[]) {
  const header = ['emitida', 'cliente', 'plan', 'dias', 'asientos', 'vence', 'clave'];
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    fs.appendFileSync(file, header.join(';') + '\n', 'utf8');
  }
  fs.appendFileSync(file, row.map(csvCell).join(';') + '\n', 'utf8');
}

function privateJwkJson(): string | null {
  const b = process.env.LICENSE_PRIVATE_KEY;
  if (b) {
    try {
      const raw = Buffer.from(String(b), 'base64').toString('utf8');
      const obj = JSON.parse(raw) as { private?: unknown };
      if (obj && obj.private) return JSON.stringify(obj.private);
      return raw;
    } catch {
      /* sigue */
    }
  }
  return null;
}

function signer(): Signer | null {
  const j = privateJwkJson();
  if (j) return { type: 'ed25519', key: JSON.parse(j) as unknown };
  const s = arg('secret', process.env.LICENSE_SECRET);
  return s || null;
}

function verifiers(): Verifier[] {
  const list: Verifier[] = [];
  const pub = process.env.LICENSE_PUBLIC_KEY;
  if (pub) {
    try {
      list.push({ type: 'ed25519', key: JSON.parse(Buffer.from(pub, 'base64').toString('utf8')) });
    } catch {
      /* ignore */
    }
  }
  const secret = arg('secret', process.env.LICENSE_SECRET);
  if (secret) list.push(secret);
  return list;
}

const cmd = process.argv[2];

if (cmd === 'genpair') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const priv = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const privB64 = Buffer.from(JSON.stringify(priv)).toString('base64');
  console.log('Par Ed25519 generado (guardá la privada SOLO en el Licensador).\n');
  console.log('1) En el producto (apps/api env y binarios) poné la clave PÚBLICA:');
  console.log('   LICENSE_PUBLIC_KEY=' + Buffer.from(JSON.stringify(pub)).toString('base64') + '\n');
  console.log('2) En el Licensador (Render) definí la clave PRIVADA:');
  console.log('   LICENSE_PRIVATE_KEY=' + privB64 + '\n');
  console.log('3) Round-trip de verificación:');
  const k = issue({ client: 'Prueba de par', plan: 'PRO', days: 365, seats: 100 }, {
    type: 'ed25519',
    key: priv,
  });
  console.log('   key   : ' + k);
  console.log('   verify: ' + JSON.stringify(verifyKey(k, [{ type: 'ed25519', key: pub }]).ok));
} else if (cmd === 'emit') {
  const sg = signer();
  if (!sg) {
    console.error(
      'Falta la firma: clave privada Ed25519 (env LICENSE_PRIVATE_KEY) o secreto HMAC (--secret o LICENSE_SECRET).',
    );
    process.exit(1);
  }
  const client = arg('client');
  if (!client) {
    console.error('Falta --client "Nombre del cliente"');
    process.exit(1);
  }
  const days = Number(arg('days', '365'));
  const plan = arg('plan', 'PRO') as string;
  const seats = Number(arg('seats', '100'));
  const key = issue({ client, plan, days, seats, issued: Date.now() }, sg);
  console.log(key);
  const csvPath = csvPathOpt();
  if (csvPath) {
    const issued = new Date();
    const exp = new Date(issued.getTime() + days * 864e5);
    appendCsvRow(path.resolve(csvPath), [
      issued.toISOString(),
      client,
      plan,
      days,
      seats,
      exp.toISOString().slice(0, 10),
      key,
    ]);
    console.error('Registrada en ' + path.resolve(csvPath));
  }
} else if (cmd === 'csv') {
  const p = process.argv[3] || 'licencias.csv';
  if (!fs.existsSync(p)) {
    console.error('No existe ' + p);
    process.exit(1);
  }
  console.log(fs.readFileSync(p, 'utf8'));
} else if (cmd === 'secret') {
  console.log(crypto.randomBytes(32).toString('hex'));
} else if (cmd === 'verify') {
  const key = process.argv[3] || arg('key');
  if (!key) {
    console.error('Falta la clave a verificar');
    process.exit(1);
  }
  const v = verifyKey(key, verifiers());
  if (!v.ok) {
    console.log(JSON.stringify(v, null, 2));
    process.exit(1);
  }
  const out: Record<string, unknown> = { ...v };
  if (v.exp < Date.now()) {
    out.ok = false;
    out.error = 'Clave vencida';
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
} else {
  console.log('Uso:');
  console.log('  keygen genpair');
  console.log('  keygen emit --client "Nombre" [--plan PRO] [--days 365] [--seats 100] [--csv]');
  console.log('  keygen verify FIT-...');
  console.log('  keygen csv [archivo]');
  console.log('  keygen secret');
  process.exit(cmd ? 1 : 0);
}
