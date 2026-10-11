#!/usr/bin/env node
'use strict';
/* FIT System — Licensador: sistema APARTE de licencias del proveedor.
   Emite claves, registra activaciones por instalación (asientos) y otorga
   certificados firmados. NO se distribuye con el producto.

   Env:  PORT, LICENSE_PRIVATE_KEY (Ed25519 privada, base64 de JWK, recomendado),
         LICENSE_SECRET (HMAC, alternativa simple), LICENSE_PUBLIC_KEY (pública
         para verificar, base64 de JWK), ADMIN_USER (def. admin), ADMIN_PASS
         (obligatorio en producción), SESSION_TTL_H.
   Uso:  node server.js
   Modelo de referencia: sistema de licencias de GastroOne. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./license-core');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('Este servicio requiere Node.js 22.5 o superior (módulo node:sqlite).');
  process.exit(1);
}

const ROOT = __dirname;
const DATA_DIR = process.env.LICENSADOR_DATA ? path.resolve(process.env.LICENSADOR_DATA) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- cripto: Ed25519 (recomendado) o HMAC ---------- */
function decodeJwk(b64) {
  const raw = Buffer.from(String(b64), 'base64').toString('utf8');
  const obj = JSON.parse(raw);
  if (obj && obj.private) return obj.private;
  return JSON.parse(raw);
}
function loadPrivateJwk() {
  const b = process.env.LICENSE_PRIVATE_KEY;
  if (b) {
    try {
      return decodeJwk(b);
    } catch (e) {}
  }
  try {
    const f = path.join(DATA_DIR, 'ed25519.jwk');
    if (fs.existsSync(f)) {
      const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (obj && obj.private) return obj.private;
    }
  } catch (e) {}
  return null;
}
let PUBLIC_KEY = null;
if (process.env.LICENSE_PUBLIC_KEY) {
  try {
    PUBLIC_KEY = decodeJwk(process.env.LICENSE_PUBLIC_KEY);
  } catch (e) {}
}
const PRIVATE_KEY = loadPrivateJwk();
const DERIVED_PUBLIC = PRIVATE_KEY
  ? crypto.createPublicKey({ key: PRIVATE_KEY, format: 'jwk' }).export({ format: 'jwk' })
  : null;
if (!PUBLIC_KEY && DERIVED_PUBLIC) PUBLIC_KEY = DERIVED_PUBLIC;

const SECRET = process.env.LICENSE_SECRET || '';
const SIGNER = PRIVATE_KEY ? { type: 'ed25519', key: PRIVATE_KEY } : SECRET;
if (!SECRET && !PRIVATE_KEY) {
  console.error('Falta LICENSE_SECRET (HMAC) o LICENSE_PRIVATE_KEY (Ed25519).');
  process.exit(1);
}
if (PRIVATE_KEY) {
  console.log('Firma: Ed25519 (clave privada cargada).');
  if (process.env.LICENSE_SECRET) {
    console.log('AVISO: LICENSE_SECRET también definido — se usa solo para aceptar claves HMAC.');
  }
}
const VERIFIERS = [
  ...(PUBLIC_KEY ? [{ type: 'ed25519', key: PUBLIC_KEY }] : []),
  ...(SECRET ? [SECRET] : []),
];

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
if (!ADMIN_PASS) {
  console.error('Falta ADMIN_PASS (obligatorio en producción).');
  process.exit(1);
}
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL = Number(process.env.SESSION_TTL_H || 12) * 3600e3;
const MAX_DAYS = 3650;

const db = new DatabaseSync(path.join(DATA_DIR, 'licensador.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS licenses(
  key TEXT PRIMARY KEY, client TEXT, plan TEXT, days INTEGER, seats INTEGER,
  notas TEXT, issued_at INTEGER, expires INTEGER, state TEXT DEFAULT 'emitida'
);
CREATE TABLE IF NOT EXISTS activations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, install_id TEXT, sede TEXT,
  last_ip TEXT, activated_at INTEGER, active INTEGER DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activation ON activations(key, install_id);
`);

const sessions = new Map();
function auth(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60e3;
const loginFails = new Map();
function tryLogin(user, pass) {
  const ok = user === ADMIN_USER && pass === ADMIN_PASS;
  const key = clientIpArg + '|' + String(user || '').toLowerCase();
  const cur = loginFails.get(key) || { n: 0, lockUntil: 0 };
  const now = Date.now();
  if (cur.n >= LOGIN_MAX_FAILS) {
    if (now < cur.lockUntil) return { ok: false, fails: cur.n };
    loginFails.delete(key);
  }
  if (!ok) {
    const n = cur.n + 1;
    const lockUntil = n >= LOGIN_MAX_FAILS ? now + LOGIN_WINDOW_MS : cur.lockUntil;
    loginFails.set(key, { n, lockUntil });
    return { ok: false, fails: n };
  }
  loginFails.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return { ok: true, token };
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}
function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
  );
}

function listLicenses() {
  return db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM activations a WHERE a.key=l.key AND a.active=1) AS seats_used
       FROM licenses l ORDER BY l.issued_at DESC`,
    )
    .all()
    .map((r) => {
      const activations = db
        .prepare('SELECT install_id, sede, last_ip, activated_at, active FROM activations WHERE key=? ORDER BY activated_at DESC')
        .all(r.key);
      return {
        key: r.key,
        client: r.client,
        plan: r.plan,
        days: r.days,
        seats: r.seats,
        notas: r.notas,
        issued_at: r.issued_at,
        expires: r.expires,
        state: r.state,
        seats_used: r.seats_used || 0,
        activations: activations.map((a) => ({
          install_id: a.install_id,
          sede: a.sede || '',
          last_ip: a.last_ip || '',
          activated_at: a.activated_at,
          active: !!a.active,
        })),
      };
    });
}
function stats() {
  const total = db.prepare('SELECT COUNT(*) c FROM licenses').get().c;
  const activadas = db.prepare('SELECT COUNT(DISTINCT key) c FROM activations WHERE active=1').get().c;
  const asientos = db.prepare('SELECT COUNT(*) c FROM activations WHERE active=1').get().c;
  const vencidas = db.prepare('SELECT COUNT(*) c FROM licenses WHERE expires < ?').get(Date.now()).c;
  const porPlan = db.prepare('SELECT plan, COUNT(*) c FROM licenses GROUP BY plan ORDER BY c DESC').all();
  return { total, activadas, asientos, vencidas, porPlan };
}
function backupSnapshot() {
  return {
    producto: 'fitsystem-licensador',
    version: 1,
    exported_at: new Date().toISOString(),
    licenses: db.prepare('SELECT key,client,plan,days,seats,notas,issued_at,expires,state FROM licenses').all(),
    activations: db.prepare('SELECT key,install_id,sede,last_ip,activated_at,active FROM activations').all(),
  };
}
function writeLatestBackup() {
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'latest-backup.json'), JSON.stringify(backupSnapshot()));
  } catch (e) {}
}
function restoreSnapshot(obj) {
  if (!obj || obj.producto !== 'fitsystem-licensador') throw new Error('El archivo no es un respaldo del Licensador');
  const lic = Array.isArray(obj.licenses) ? obj.licenses : [];
  const act = Array.isArray(obj.activations) ? obj.activations : [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM activations').run();
    db.prepare('DELETE FROM licenses').run();
    const il = db.prepare(
      'INSERT INTO licenses(key,client,plan,days,seats,notas,issued_at,expires,state) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    for (const r of lic) {
      il.run(
        String(r.key), String(r.client || ''), String(r.plan || 'PRO'), Number(r.days) || 365,
        Number(r.seats) || 1, String(r.notas || ''), Number(r.issued_at) || Date.now(),
        Number(r.expires) || 0, String(r.state || 'emitida'),
      );
    }
    const ia = db.prepare('INSERT INTO activations(key,install_id,sede,last_ip,activated_at,active) VALUES(?,?,?,?,?,?)');
    for (const r of act) {
      ia.run(
        String(r.key), String(r.install_id), String(r.sede || ''), String(r.last_ip || ''),
        Number(r.activated_at) || Date.now(), r.active ? 1 : 0,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {}
    throw e;
  }
  writeLatestBackup();
  return { ok: true, licenses: lic.length, activations: act.length };
}
function createLicense({ client, plan = 'PRO', days = 365, seats = 100, notas = '' }) {
  days = Math.max(1, Math.min(MAX_DAYS, Number(days) || 365));
  seats = Math.max(1, Number(seats) || 1);
  if (!client || !String(client).trim()) return { ok: false, error: 'Falta el cliente' };
  const issued = Date.now();
  const key = core.issue({ client: String(client).trim(), plan: String(plan), days, seats, issued }, SIGNER);
  db.prepare('INSERT INTO licenses(key,client,plan,days,seats,notas,issued_at,expires,state) VALUES(?,?,?,?,?,?,?,?,?)').run(
    key, String(client).trim(), String(plan), days, seats, String(notas || ''), issued, issued + days * 864e5, 'emitida',
  );
  writeLatestBackup();
  return { ok: true, key, expires: issued + days * 864e5 };
}
function activate({ key, installId, sede }) {
  key = String(key || '').trim();
  installId = String(installId || '').trim();
  if (!key) return { status: 400, error: 'Falta la clave' };
  if (!installId) return { status: 400, error: 'Falta el identificador de instalación' };
  const v = core.verifyKey(key, VERIFIERS);
  if (!v.ok) return { status: 400, error: v.error };
  if (v.exp < Date.now()) return { status: 400, error: 'Clave vencida el ' + new Date(v.exp).toLocaleDateString('es-AR') };
  let row = db.prepare('SELECT * FROM licenses WHERE key=?').get(key);
  if (!row) {
    const issued = v.payload.i;
    db.prepare('INSERT INTO licenses(key,client,plan,days,seats,notas,issued_at,expires,state) VALUES(?,?,?,?,?,?,?,?,?)').run(
      key, v.payload.c, v.payload.p, v.payload.d || 365, v.payload.s || 1, 'Importada al activarse', issued, v.exp, 'emitida',
    );
    row = db.prepare('SELECT * FROM licenses WHERE key=?').get(key);
  }
  const seats = Number(row.seats) || 1;
  const existing = db.prepare('SELECT * FROM activations WHERE key=? AND install_id=?').get(key, installId);
  if (existing) {
    db.prepare('UPDATE activations SET sede=?, last_ip=?, activated_at=?, active=1 WHERE id=?').run(
      String(sede || ''), clientIpArg, Date.now(), existing.id,
    );
  } else {
    const used = db.prepare('SELECT COUNT(*) c FROM activations WHERE key=? AND active=1').get(key).c;
    if (used >= seats) {
      return { status: 409, error: 'Sin asientos disponibles para esta licencia (usados ' + used + ' de ' + seats + ')' };
    }
    db.prepare('INSERT INTO activations(key,install_id,sede,last_ip,activated_at,active) VALUES(?,?,?,?,?,1)').run(
      key, installId, String(sede || ''), clientIpArg || '', Date.now(),
    );
  }
  const cert = core.makeCert({ client: row.client, plan: row.plan, exp: v.exp, installId }, SIGNER);
  writeLatestBackup();
  return { status: 200, ok: true, cert, client: row.client, plan: row.plan, exp: v.exp };
}
function revalidate({ key, installId }) {
  const row = db
    .prepare('SELECT * FROM activations WHERE key=? AND install_id=? AND active=1')
    .get(String(key || '').trim(), String(installId || '').trim());
  if (!row) return { status: 410, ok: false, revoked: true, error: 'Asiento revocado o no registrado' };
  const lic = db.prepare('SELECT * FROM licenses WHERE key=?').get(String(key || '').trim());
  const v = core.verifyKey(String(key || '').trim(), VERIFIERS);
  if (!v.ok) return { status: 410, ok: false, revoked: true, error: 'Clave no válida' };
  if (v.exp < Date.now()) return { status: 410, ok: false, revoked: true, error: 'Clave vencida' };
  const cert = core.makeCert(
    { client: (lic && lic.client) || v.payload.c, plan: (lic && lic.plan) || v.payload.p, exp: v.exp, installId: String(installId || '').trim() },
    SIGNER,
  );
  return { status: 200, ok: true, cert };
}

let clientIpArg = '';

const CONTENT_TYPES = { 'index.html': 'text/html; charset=utf-8', 'index.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method;
  let body = null;
  if (['POST', 'PUT'].includes(method)) {
    try {
      body = await readBody(req);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  clientIpArg = clientIp(req);

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const adm = auth(token);

  if (method === 'GET' && (url === '/' || url === '/index.html' || url === '/index.css')) {
    const file = url === '/index.css' ? 'index.css' : 'index.html';
    try {
      const data = fs.readFileSync(path.join(ROOT, 'public', file));
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[file] });
      return res.end(data);
    } catch (e) {
      return send(res, 404, { error: 'not found' });
    }
  }

  try {
    if (method === 'POST' && url === '/api/login') {
      const r = tryLogin(String(body.user || ''), String(body.pass || ''));
      if (!r.ok) {
        if (r.fails >= LOGIN_MAX_FAILS) {
          send(res, 429, { error: 'Demasiados intentos fallidos' });
          return;
        }
        return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
      }
      return send(res, 200, { ok: true, token: r.token });
    }
    if (!adm) {
      if (method === 'POST' && url === '/api/license/activate') {
        const r = activate(body || {});
        return send(res, r.status, { ok: r.ok, error: r.error, cert: r.cert, client: r.client, plan: r.plan, exp: r.exp });
      }
      if (method === 'POST' && url === '/api/license/revalidate') {
        const r = revalidate(body || {});
        return send(res, r.status, { ok: r.ok, revoked: r.revoked, error: r.error, cert: r.cert });
      }
      if (method === 'GET' && url === '/api/health') return send(res, 200, { ok: true, service: 'fitsystem-licensador' });
      return send(res, 401, { error: 'No autorizado' });
    }

    if (method === 'GET' && url === '/api/licenses') return send(res, 200, { ok: true, licenses: listLicenses() });
    if (method === 'GET' && url === '/api/licenses/stats') return send(res, 200, { ok: true, stats: stats() });
    if (method === 'POST' && url === '/api/licenses') {
      const r = createLicense(body || {});
      if (!r.ok) return send(res, 400, { error: r.error });
      return send(res, 201, { ok: true, key: r.key, expires: r.expires });
    }
    if (method === 'POST' && url === '/api/license/revoke') {
      const key = String((body || {}).key || '').trim();
      const installId = String((body || {}).installId || '').trim();
      db.prepare('UPDATE activations SET active=0 WHERE key=? AND install_id=?').run(key, installId);
      writeLatestBackup();
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE' && url === '/api/licenses') {
      const key = String(req.headers['x-license-key'] || '').trim();
      db.prepare('DELETE FROM activations WHERE key=?').run(key);
      db.prepare('DELETE FROM licenses WHERE key=?').run(key);
      writeLatestBackup();
      return send(res, 200, { ok: true });
    }
    if (method === 'GET' && url === '/api/backup') return send(res, 200, backupSnapshot());
    if (method === 'POST' && url === '/api/restore') {
      try {
        return send(res, 200, restoreSnapshot(body || {}));
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }
  } catch (e) {
    return send(res, 500, { error: 'Error interno: ' + e.message });
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log('FIT System Licensador → http://localhost:' + PORT));

module.exports = { server };
