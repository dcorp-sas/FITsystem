import { app, BrowserWindow, session, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PORT = 3001;
const WEB_PORT = 3000;
const PRINT_PORT = 3999;
const LOG_FILE = path.join(os.tmpdir(), 'fitsystem-desktop.log');

// Manifiesto público de versiones (archivo updates/latest.json del repo). Cambiá esta
// URL con UPDATE_FEED_URL si preferís otro hosting. Formato:
//   { "version": "0.1.4", "url": "https://.../FIT-System-Setup.exe", "notes": "...", "mandatory": false }
const UPDATE_FEED_URL =
  process.env.UPDATE_FEED_URL ||
  'https://raw.githubusercontent.com/dcorp-sas/FITsystem/main/updates/latest.json';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Revalidación de licencia en segundo plano. Detecta (sin reiniciar) que la
// licencia fue revocada por falta de pago de la suscripción y bloquea el panel.
const LICENSE_RECHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
// Modo "nube": el panel y la API se sirven desde la infraestructura del
// proveedor (la MISMA base de datos que la app del socio). El equipo del
// gimnasio abre el panel remoto; el proceso local solo administra la licencia y
// la impresión de tickets. Se puede apuntar a otro entorno con estas variables.
const CLOUD_PANEL_URL = (process.env.CLOUD_PANEL_URL || 'https://fitsystem.com.ar').replace(/\/+$/, '');
const CLOUD_API_URL = (process.env.CLOUD_API_URL || 'https://api.fitsystem.com.ar').replace(/\/+$/, '');
// Auto-actualizador (electron-updater). Se inicializa solo en la app instalada
// (app.isPackaged). El build portable no puede auto-actualizarse.
let updater: import('electron-updater').AppUpdater | null = null;
type UpdateState = { state: string; version?: string; percent?: number; message?: string };

let apiProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let lastUpdateState: UpdateState | null = null;
// El panel avisa (por IPC) si hay una venta/cobro en curso, para no reiniciar
// la aplicación justo mientras se está facturando.
let rendererBusy = false;
// Pantalla de activación opcional (respaldo). En uso normal la licencia se
// administra desde Configuración > Licencia y no se muestra al ingresar.
let activationWindow: BrowserWindow | null = null;
let printServer: http.Server | null = null;
let licenseInfo: LicenseInfo | null = null;
// Ventana aparte que avisa que hay una actualización descargada y pide
// confirmación antes de reiniciar e instalar.
let updateWindow: BrowserWindow | null = null;
let accessWindow: BrowserWindow | null = null;

interface LicenseInfo {
  plan: string;
  seats: number;
  status: string;
  client?: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  isUsable: boolean;
  hasKey: boolean;
}

interface LicenseConfig {
  trialDays: number;
  contact: string;
  site: string;
  online: boolean;
}

let licenseConfig: LicenseConfig = { trialDays: 7, contact: '', site: '', online: false };

function log(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
}

log('=== Modulo main.js cargado ===');

function toFileUrl(p: string) {
  return `file:${p.replace(/\\/g, '/')}`;
}

function waitForUrl(url: string, timeoutMs = 90000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout esperando ${url}`));
        } else {
          setTimeout(attempt, 400);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout esperando ${url}`));
        else setTimeout(attempt, 400);
      });
      req.setTimeout(3000, () => req.destroy());
    };
    attempt();
  });
}

// ---------------------------------------------------------------------------
// Licencia
// ---------------------------------------------------------------------------

// Identificador estable del equipo: combina el MachineGuid de Windows con el
// nombre del equipo y el usuario. Al derivar de esto el ID de instalación y el
// ancla de la prueba, reinstalar el sistema NO reinicia los 15 días.
function getMachineId(): string {
  let guid = '';
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (match?.[1]) guid = match[1];
  } catch {
    /* sin acceso: se usa el fallback */
  }
  const base = `${os.hostname()}|${os.userInfo().username}|${guid}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

const TRIAL_REG_KEY = 'HKCU\\Software\\FITSystem';
const TRIAL_REG_VALUE = 'FirstRunAt';
const INSTALLATION_REG_KEY = 'HKCU\\Software\\FITSystem';
const INSTALLATION_REG_VALUE = 'InstallationId';

function readRegistryValue(key: string, name: string): string | null {
  try {
    const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8', windowsHide: true });
    const match = out.match(new RegExp(`${name}\\s+REG_SZ\\s+(.+)`));
    if (match?.[1]) return match[1].trim();
  } catch {
    /* valor inexistente */
  }
  return null;
}

function writeRegistryValue(key: string, name: string, value: string): void {
  try {
    execFileSync('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], {
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch {
    /* sin permisos: se ignora */
  }
}

// Marca de primera ejecución de la prueba. Se guarda en el registro de Windows
// (fuera de AppData) para que sobreviva a reinstalaciones y limpiezas de datos.
function getTrialAnchor(): string {
  const existing = readRegistryValue(TRIAL_REG_KEY, TRIAL_REG_VALUE);
  if (existing) return existing;
  const now = new Date().toISOString();
  writeRegistryValue(TRIAL_REG_KEY, TRIAL_REG_VALUE, now);
  return now;
}

// ID de instalación determinista por equipo (mismo equipo => mismo ID). Así la
// licencia/prueba registrada en la API se reutiliza tras reinstalar.
function getInstallationId(): string {
  const registered = readRegistryValue(INSTALLATION_REG_KEY, INSTALLATION_REG_VALUE);
  if (registered?.startsWith('inst_')) return registered;

  const legacyFile = path.join(app.getPath('userData'), 'installation.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf8')) as { installationId?: string };
    if (parsed.installationId?.startsWith('inst_')) {
      writeRegistryValue(INSTALLATION_REG_KEY, INSTALLATION_REG_VALUE, parsed.installationId);
      return parsed.installationId;
    }
  } catch {
    /* se genera abajo */
  }

  const machineId = getMachineId();
  const installationId = `inst_${crypto.createHash('sha256').update(`fitsystem|${machineId}`).digest('hex').slice(0, 32)}`;
  writeRegistryValue(INSTALLATION_REG_KEY, INSTALLATION_REG_VALUE, installationId);
  try {
    if (!fs.existsSync(legacyFile)) {
      fs.writeFileSync(
        legacyFile,
        JSON.stringify({ installationId, machineName: os.hostname(), createdAt: new Date().toISOString() }, null, 2),
      );
    }
  } catch {
    /* ignore */
  }
  return installationId;
}

// Secreto de firma JWT de la API embebida: se genera una sola vez por instalación
// y se persiste, así cada equipo tiene una clave propia (no un valor hardcodeado).
function getApiSecret(): string {
  const file = path.join(app.getPath('userData'), 'api-secret.txt');
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch {
    /* generate */
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, secret, 'utf8');
  } catch {
    /* ignore */
  }
  return secret;
}

function getPersistentDataDir(): string {
  const root = process.platform === 'win32' && process.env.PROGRAMDATA ? process.env.PROGRAMDATA : app.getPath('appData');
  const dir = path.join(root, 'FIT system', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDatabasePath(): string {
  const dir = getPersistentDataDir();
  const target = path.join(dir, 'fitsystem.db');
  const legacy = path.join(app.getPath('userData'), 'fitsystem.db');

  // Migra instalaciones anteriores antes de iniciar SQLite. También conserva
  // archivos WAL/SHM si la base fue cerrada durante una transacción.
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    fs.copyFileSync(legacy, target);
    for (const suffix of ['-wal', '-shm']) {
      const source = legacy + suffix;
      if (fs.existsSync(source)) fs.copyFileSync(source, target + suffix);
    }
  }
  return target;
}

// ---------------------------------------------------------------------------
// Red local (modo servidor / terminal)
// ---------------------------------------------------------------------------

type NetworkMode = 'standalone' | 'server' | 'cloud';

interface NetworkConfig {
  mode: NetworkMode;
}

function networkFile(): string {
  return path.join(app.getPath('userData'), 'network.json');
}

// 'standalone' (por defecto): todo en esta PC, API solo en loopback.
// 'server': esta PC es el servidor del gimnasio; API y panel escuchan en la red
// local y las demás PC entran desde el navegador (http://IP:3000).
// 'cloud': el panel y los datos viven en la nube (la misma base que la app del
// socio); en el equipo solo corre la API local (licencia/impresión).
function readNetworkConfig(): NetworkConfig {
  try {
    const raw = fs.readFileSync(networkFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<NetworkConfig>;
    if (parsed.mode === 'server') return { mode: 'server' };
    if (parsed.mode === 'cloud') return { mode: 'cloud' };
  } catch {
    /* default */
  }
  // Por defecto el producto instalado trabaja contra la nube (misma base que la
  // app del socio). En desarrollo, panel local. Un gimnasio puede fijar
  // 'standalone'/'server' desde Configuración > Red.
  return { mode: app.isPackaged ? 'cloud' : 'standalone' };
}

function isCloudMode(): boolean {
  return readNetworkConfig().mode === 'cloud';
}

function writeNetworkConfig(config: NetworkConfig): void {
  try {
    fs.writeFileSync(networkFile(), JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    log('No se pudo guardar la config de red:', (err as Error).message);
  }
}

// Direcciones IPv4 no internas del equipo, para armar la URL que las terminales
// deben abrir en el navegador.
function getLanAddresses(): string[] {
  const addresses: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

function apiJson(method: string, pathname: string, body?: unknown, timeoutMs = 15000): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: API_PORT,
        path: pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(data || '{}'));
          } catch {
            resolve({});
          }
        });
      },
    );
    // Sin timeout, una request colgada (p. ej. un endpoint bloqueado) impide que
    // la app avance. Abortamos y rechazamos para que el llamador pueda seguir.
    const timer = setTimeout(() => req.destroy(new Error('Tiempo de espera agotado')), timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function checkLicense(): Promise<LicenseInfo | null> {
  const installationId = getInstallationId();
  const res = await apiJson('POST', '/api/license/validate', {
    installationId,
    machineName: os.hostname(),
    firstRunAt: getTrialAnchor(),
  });
  licenseInfo = (res?.data?.info as LicenseInfo) ?? null;
  if (res?.data?.config) licenseConfig = { ...licenseConfig, ...(res.data.config as Partial<LicenseConfig>) };
  return licenseInfo;
}

function activationHtml(info: LicenseInfo | null): string {
  const installationId = getInstallationId();
  const statusText = info
    ? info.isUsable
      ? info.plan === 'TRIAL'
        ? `Prueba gratuita · quedan ${info.daysLeft ?? '-'} días`
        : `Plan ${info.plan} · vence en ${info.daysLeft ?? '-'} días`
      : info.status === 'EXPIRED'
        ? 'La licencia venció'
        : 'Sin licencia activa'
    : 'Sin licencia activa';
  const trialDays = licenseConfig.trialDays;
  const contactLine =
    licenseConfig.contact || licenseConfig.site
      ? `Contacto: ${licenseConfig.contact || licenseConfig.site}`
      : 'Escribinos para obtener tu código de licencia.';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>Activación - FIT system™</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0f1115; color: #e6ecf7; font-family: 'Segoe UI', system-ui, sans-serif; }
  .card { width: 420px; padding: 32px; border: 1px solid #233150; border-radius: 16px; background: #131c31; }
  .logo { color: #60a5fa; font-size: 26px; font-weight: 900; letter-spacing: 3px; text-align: center; }
  h1 { font-size: 18px; text-align: center; margin: 12px 0 4px; }
  p.sub { text-align: center; color: #8fa0bd; font-size: 13px; margin: 0 0 20px; }
  label { display: block; font-size: 12px; color: #8fa0bd; margin: 14px 0 6px; }
  input { width: 100%; height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #233150;
    background: #0b1120; color: #e6ecf7; font-size: 14px; letter-spacing: 1px; }
  input:focus { outline: none; border-color: #2563eb; }
  button { width: 100%; height: 46px; margin-top: 18px; border: none; border-radius: 10px; cursor: pointer;
    background: #2563eb; color: #fff; font-size: 15px; font-weight: 600; }
  button:disabled { opacity: .6; cursor: default; }
  button.ghost { margin-top: 10px; height: 40px; background: transparent; color: #8fa0bd;
    border: 1px solid #233150; font-size: 13px; font-weight: 500; }
  button.ghost:hover { color: #e6ecf7; border-color: #2563eb; }
  .status { margin-top: 14px; font-size: 13px; text-align: center; min-height: 18px; }
  .err { color: #ef4444; }
  .ok { color: #22c55e; }
  .meta { margin-top: 18px; padding-top: 14px; border-top: 1px solid #233150; color: #8fa0bd; font-size: 11px; word-break: break-all; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">FIT</div>
    <h1>Activación de licencia</h1>
    <p class="sub">${statusText}</p>
    <label>Clave de licencia</label>
    <input id="key" placeholder="FIT-··················" autocomplete="off" />
    <button id="btn">Activar</button>
    <button id="req" class="ghost">Solicitar código de licencia</button>
    <div id="status" class="status"></div>
    <div class="meta">Prueba de ${trialDays} días incluida.<br/>ID de instalación: ${installationId}<br/>${contactLine}</div>
  </div>
  <script>
    const btn = document.getElementById('btn');
    const statusEl = document.getElementById('status');
    const keyEl = document.getElementById('key');
    const reqBtn = document.getElementById('req');
    async function activate() {
      const key = keyEl.value.trim();
      if (!key) { statusEl.className = 'status err'; statusEl.textContent = 'Ingresá una clave.'; return; }
      btn.disabled = true;
      statusEl.className = 'status';
      statusEl.textContent = 'Validando...';
      try {
        const res = await window.fitsystem.activate(key);
        if (res && res.ok) {
          statusEl.className = 'status ok';
          statusEl.textContent = 'Licencia activada. Iniciando...';
          setTimeout(() => window.fitsystem.openMain(), 700);
        } else {
          btn.disabled = false;
          statusEl.className = 'status err';
          statusEl.textContent = (res && res.message) || 'No se pudo activar la licencia.';
        }
      } catch (e) {
        btn.disabled = false;
        statusEl.className = 'status err';
        statusEl.textContent = String(e);
      }
    }
    btn.addEventListener('click', activate);
    keyEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });
    if (reqBtn) reqBtn.addEventListener('click', () => { window.fitsystem.requestCode(); });
    keyEl.focus();
  </script>
</body>
</html>`;
}

async function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    title: 'Activación - FIT system™',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const htmlFile = path.join(app.getPath('userData'), 'activation.html');
  try {
    fs.writeFileSync(htmlFile, activationHtml(licenseInfo));
  } catch {
    /* ignore */
  }
  await activationWindow.loadFile(htmlFile);
  activationWindow.on('closed', () => {
    activationWindow = null;
  });
}

function registerLicenseIpc() {
  ipcMain.handle('license:get', async () => {
    if (!licenseInfo) await checkLicense().catch(() => undefined);
    return { installationId: getInstallationId(), info: licenseInfo, config: licenseConfig };
  });

  ipcMain.handle('license:activate', async (_event, key: string) => {
    try {
      const installationId = getInstallationId();
      const res = await apiJson('POST', '/api/license/activate', {
        installationId,
        licenseKey: key,
        machineName: os.hostname(),
      });
      if (res?.error) return { ok: false, message: res.message || 'No se pudo activar la licencia' };
      licenseInfo = (res?.data?.info as LicenseInfo) ?? null;
      log('Licencia activada:', licenseInfo?.plan, licenseInfo?.status);
      return { ok: true, info: licenseInfo };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

  ipcMain.handle('license:open-main', async () => {
    if (activationWindow) {
      activationWindow.close();
      activationWindow = null;
    }
    if (!mainWindow) {
      await createWindow();
    } else {
      // Si la ventana principal mostraba la pantalla de activación, se recarga el panel.
      try {
        await mainWindow.loadURL(appUrl());
      } catch (err) {
        log('No se pudo abrir el panel tras activar:', (err as Error).message);
      }
    }
    return true;
  });

  ipcMain.handle('license:request', async () => {
    const installationId = getInstallationId();
    const subject = encodeURIComponent('Solicitud de código de licencia FIT system™');
    const body = encodeURIComponent(
      `Hola, quiero activar FIT system™.\n\nID de instalación: ${installationId}\nEquipo: ${os.hostname()}\n`,
    );
    const target = licenseConfig.contact
      ? `mailto:${licenseConfig.contact}?subject=${subject}&body=${body}`
      : licenseConfig.site;
    if (target) openExternalSafe(target);
    return true;
  });
}

function openExternalSafe(target: string): void {
  try {
    const parsed = new URL(target);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(target);
    } else {
      log('Bloqueado openExternal con protocolo no permitido:', target);
    }
  } catch {
    log('Bloqueado openExternal con URL inválida:', target);
  }
}

interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url: string;
  notes: string;
  mandatory: boolean;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`${UPDATE_FEED_URL}?t=${Date.now()}`);
    if (!res.ok) {
      log('Feed de actualizaciones respondio', res.status);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const latest = String(data.version || '').trim();
    if (!latest) return null;
    const current = app.getVersion();
    return {
      available: compareVersions(latest, current) > 0,
      current,
      latest,
      url: String(data.url || ''),
      notes: String(data.notes || ''),
      mandatory: Boolean(data.mandatory),
    };
  } catch (err) {
    log('No se pudo consultar actualizaciones:', (err as Error).message);
    return null;
  }
}

async function checkForUpdates(silent = false): Promise<UpdateInfo | null> {
  // Si el auto-actualizador está disponible (app instalada), consulta GitHub
  // Releases; el progreso llega a la UI por eventos 'update:event'.
  if (updater) {
    try {
      log('Consultando actualizaciones (electron-updater)…');
      await updater.checkForUpdates();
    } catch (err) {
      log('Auto-update falló:', (err as Error).message);
    }
    return null;
  }
  const info = await fetchUpdateInfo();
  if (!info) {
    if (!silent) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Actualizaciones',
        message: 'No se pudo consultar el servidor de actualizaciones.',
        detail: 'Revisá tu conexión a internet e intentá de nuevo.',
      });
    }
    return null;
  }
  if (!info.available) {
    if (!silent) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Actualizaciones',
        message: `Estás al día. Versión ${info.current}.`,
      });
    }
    return info;
  }
  const detail = info.notes ? `\n\nNovedades:\n${info.notes}` : '';
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Actualización disponible',
    message: `Hay una nueva versión de FIT system™ (${info.latest}).`,
    detail: `Tenés instalada la versión ${info.current}.${detail}\n\nDescargá el instalador y ejecutalo para actualizar.`,
    buttons: info.url ? ['Descargar', 'Más tarde'] : ['Aceptar'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0 && info.url) openExternalSafe(info.url);
  return info;
}

function emitUpdate(payload: UpdateState) {
  // Guardamos el último estado para que cualquier pantalla pueda consultarlo
  // (banner global) aunque el evento se haya emitido antes de montar el listener.
  lastUpdateState = payload;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:event', payload);
  } catch {
    /* la ventana puede no estar lista todavía */
  }
}

// ---------------------------------------------------------------------------
// Aviso de actualización (ventana aparte, con confirmación del usuario)
// ---------------------------------------------------------------------------

function updateReadyHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>Actualización lista - FIT system™</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0f1115; color: #e6ecf7; font-family: 'Segoe UI', system-ui, sans-serif; }
  .card { width: 420px; padding: 30px; border: 1px solid #233150; border-radius: 16px; background: #131c31; text-align: center; }
  .logo { color: #60a5fa; font-size: 24px; font-weight: 900; letter-spacing: 3px; }
  h1 { font-size: 18px; margin: 12px 0 6px; }
  p { color: #8fa0bd; font-size: 13px; margin: 0 0 20px; line-height: 1.5; }
  button { width: 100%; height: 46px; margin-top: 12px; border: none; border-radius: 10px; cursor: pointer;
    background: #2563eb; color: #fff; font-size: 15px; font-weight: 600; }
  button:disabled { opacity: .6; cursor: default; }
  button.ghost { background: transparent; color: #8fa0bd; border: 1px solid #233150; font-size: 13px; font-weight: 500; }
  button.ghost:hover { color: #e6ecf7; border-color: #2563eb; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">FIT</div>
    <h1>Actualización lista</h1>
    <p>Se descargó la versión <b>${version}</b> de FIT system™. Ya pod&eacute;s seguir trabajando: la actualizaci&oacute;n se instalar&aacute; sola al cerrar el sistema. Si quer&eacute;s aplicarla ahora, se reinicia y vuelve a abrir en unos segundos, sin perder lo que estabas haciendo.</p>
    <button id="install">Reiniciar e instalar</button>
    <button id="later" class="ghost">Seguir trabajando</button>
  </div>
  <script>
    document.getElementById('install').addEventListener('click', function () {
      this.disabled = true;
      this.textContent = 'Reiniciando...';
      window.fitsystem.installUpdate();
    });
    document.getElementById('later').addEventListener('click', function () {
      window.fitsystem.dismissUpdate();
    });
  </script>
</body>
</html>`;
}

function showUpdateWindow(version: string): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }
  try {
    const htmlFile = path.join(app.getPath('userData'), 'update-ready.html');
    fs.writeFileSync(htmlFile, updateReadyHtml(version));
    updateWindow = new BrowserWindow({
      width: 480,
      height: 380,
      resizable: false,
      title: 'Actualización - FIT system™',
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    void updateWindow.loadFile(htmlFile);
    updateWindow.on('closed', () => {
      updateWindow = null;
    });
  } catch (err) {
    log('No se pudo mostrar el aviso de actualización:', (err as Error).message);
  }
}

async function initAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    // Interop ESM/CJS: segun como se empaquete, el export puede venir en el
    // namespace o en `.default`. Sin esto, `autoUpdater` es undefined y la
    // auto-actualizacion falla ("Cannot set properties of undefined").
    const mod = (await import('electron-updater')) as unknown as {
      autoUpdater?: typeof import('electron-updater').autoUpdater;
      default?: { autoUpdater?: typeof import('electron-updater').autoUpdater };
    };
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
    if (!autoUpdater) {
      log('electron-updater no disponible: el modulo no expone autoUpdater');
      return;
    }
    // Descarga automática en segundo plano mientras se sigue usando el sistema.
    // La instalación es silenciosa (sin el asistente tradicional) y se puede hacer
    // de dos formas: al cerrar la app (autoInstallOnAppQuit) o reiniciando al
    // instante desde el aviso. En ambos casos no se pierde el trabajo en curso.
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => emitUpdate({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => {
      log('Actualización disponible:', info.version, '(descarga automática:', autoUpdater.autoDownload, ')');
      emitUpdate({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => emitUpdate({ state: 'up-to-date' }));
    autoUpdater.on('download-progress', (p) => {
      log(`Descargando actualización: ${Math.round(p.percent)}%`);
      emitUpdate({ state: 'downloading', percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      log('Actualización descargada:', info.version);
      emitUpdate({ state: 'downloaded', version: info.version });
      // Se descargó en segundo plano; se puede seguir trabajando. La instalación
      // se hará (silenciosa) al cerrar la app, o bien al toque si el usuario
      // elige "Reiniciar e instalar".
      showUpdateWindow(info.version);
    });
    autoUpdater.on('error', (err) => {
      log('Error de auto-actualización:', String((err as Error)?.message || err));
      emitUpdate({ state: 'error', message: String((err as Error)?.message || err) });
    });
    updater = autoUpdater;
    log('Auto-updater (electron-updater) inicializado.');
  } catch (err) {
    log('electron-updater no disponible:', (err as Error).message);
  }
}

function registerUpdateIpc() {
  ipcMain.handle('update:check', async () => checkForUpdates(false));
  ipcMain.handle('update:state', () => lastUpdateState);
  ipcMain.handle('update:download', async () => {
    if (!updater) return { ok: false, error: 'Actualizador no disponible' };
    try {
      await updater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle('update:install', async () => {
    if (!updater) return { ok: false, error: 'Actualizador no disponible' };
    if (rendererBusy) return { ok: false, error: 'Hay una venta en curso. Reintentá en unos segundos.' };
    // Instalación silenciosa (sin el asistente) y reapertura automática del
    // sistema ya actualizado. La URL actual quedó guardada para restaurarla.
    setImmediate(() => updater?.quitAndInstall(true, true));
    return { ok: true };
  });
  ipcMain.handle('update:dismiss', () => {
    if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
    return { ok: true };
  });
  // El panel avisa si hay una venta/cobro en curso, para no reiniciar la app
  // (actualización automática) mientras se está facturando.
  ipcMain.handle('app:busy', (_event, busy) => {
    rendererBusy = Boolean(busy);
    return { ok: true };
  });
}

function registerAccessIpc() {
  ipcMain.handle('access:open', async () => {
    if (accessWindow && !accessWindow.isDestroyed()) {
      accessWindow.focus();
      return { ok: true };
    }

    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    accessWindow = new BrowserWindow({
      width: 1100,
      height: 820,
      minWidth: 760,
      minHeight: 620,
      title: 'FIT system™ · Terminal de acceso',
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    accessWindow.removeMenu();
    accessWindow.on('closed', () => {
      accessWindow = null;
    });
    const accessUrl = new URL(appUrl());
    accessUrl.pathname = '/attendance';
    accessUrl.searchParams.set('standalone', '1');
    await accessWindow.loadURL(accessUrl.toString());
    return { ok: true };
  });
}

function registerNetworkIpc() {
  ipcMain.handle('network:get', () => {
    const config = readNetworkConfig();
    const addresses = getLanAddresses();
    return {
      mode: config.mode,
      addresses,
      lanUrls: addresses.map((ip) => `http://${ip}:${WEB_PORT}/dashboard`),
      webPort: WEB_PORT,
      apiPort: API_PORT,
      cloudPanelUrl: CLOUD_PANEL_URL,
      cloudApiUrl: CLOUD_API_URL,
    };
  });

  ipcMain.handle('network:set', (_event, mode: string) => {
    const next: NetworkMode = mode === 'server' ? 'server' : mode === 'cloud' ? 'cloud' : 'standalone';
    writeNetworkConfig({ mode: next });
    log('Modo de red guardado:', next, '(requiere reiniciar)');
    return { ok: true, mode: next };
  });

  // Aplica el cambio de modo reiniciando la aplicación (los servicios internos
  // se levantan con el nuevo host al arrancar). Se detienen los procesos hijos
  // antes de salir para liberar los puertos 3000/3001 y que el nuevo arranque no
  // falle al bindear.
  ipcMain.handle('network:restart', () => {
    stopServices();
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 700);
    return { ok: true };
  });
}

const LICENSE_PUBLIC_KEY =
  'eyJjcnYiOiJFZDI1NTE5IiwieCI6IlpIVl9fakt2SUUwUUQ3ZTZiUG5hNjBEVFdhTS1VSnRGVVEwV1hveFFYV2ciLCJrdHkiOiJPS1AifQ==';

function startApi(bindHost: string, lanMode: boolean): ChildProcess {
  const apiDir = path.join(process.resourcesPath, 'api');
  const entry = path.join(apiDir, 'dist', 'index.js');

  const dbPath = getDatabasePath();

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    API_PORT: String(API_PORT),
    API_HOST: bindHost,
    LAN_MODE: lanMode ? '1' : '0',
    DATABASE_URL: toFileUrl(dbPath),
    WEB_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
    JWT_SECRET: getApiSecret(),
    LICENSE_INSTALLATION_ID: getInstallationId(),
    LICENSE_PUBLIC_KEY: LICENSE_PUBLIC_KEY,
  };

  log('Iniciando API en', `${bindHost}:${API_PORT}`, 'lan=', lanMode);
  const child = spawn(process.execPath, [entry], {
    env,
    cwd: apiDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => log('API:', d.toString().trim()));
  child.stderr?.on('data', (d) => log('API-ERR:', d.toString().trim()));
  child.on('exit', (code) => log('API finalizo con codigo', code));
  return child;
}

function startWeb(bindHost: string): ChildProcess {
  const webDir = path.join(process.resourcesPath, 'web');
  const nextBin = path.join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(WEB_PORT),
  };

  log('Iniciando WEB en', `${bindHost}:${WEB_PORT}`);
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '-p', String(WEB_PORT), '-H', bindHost],
    { env, cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (d) => log('WEB:', d.toString().trim()));
  child.stderr?.on('data', (d) => log('WEB-ERR:', d.toString().trim()));
  child.on('exit', (code) => log('WEB finalizo con codigo', code));
  return child;
}

function stopServices() {
  for (const proc of [webProcess, apiProcess]) {
    if (proc && !proc.killed) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  }
  webProcess = null;
  apiProcess = null;
  if (printServer) {
    try {
      printServer.close();
    } catch {
      /* ignore */
    }
    printServer = null;
  }
}

function appUrl(): string {
  if (isCloudMode()) {
    // El panel en la nube pide usuario y contraseña (admin/admin123). Le pasamos
    // el ID de instalación para que el login resuelva a qué gimnasio pertenece.
    const params = new URLSearchParams({ installationId: getInstallationId() });
    return `${CLOUD_PANEL_URL}/dashboard?${params.toString()}`;
  }
  return app.isPackaged ? `http://127.0.0.1:${WEB_PORT}/dashboard` : 'http://localhost:3000/dashboard';
}

// Recuerda la última pantalla del panel para reabrirla tras reiniciar (por
// ejemplo, al instalar una actualización). Así el usuario no pierde el contexto
// de trabajo: al volver a abrir la app aparece donde estaba.
function routeFilePath(): string {
  return path.join(app.getPath('userData'), 'last-route.json');
}

function panelOrigin(): string {
  try {
    return new URL(appUrl()).origin;
  } catch {
    return '';
  }
}

function isPanelUrl(url: string): boolean {
  try {
    return panelOrigin() !== '' && new URL(url).origin === panelOrigin();
  } catch {
    return false;
  }
}

function saveRoute(url: string): void {
  if (!isPanelUrl(url)) return;
  try {
    fs.writeFileSync(routeFilePath(), JSON.stringify({ url }));
  } catch {
    /* sin permiso de escritura: no es crítico */
  }
}

function savedRouteUrl(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(routeFilePath(), 'utf8')) as { url?: string };
    if (parsed.url && isPanelUrl(parsed.url)) {
      const saved = new URL(parsed.url);
      if (isCloudMode()) {
        // v0.3.25 guardaba la ruta sin installationId. Al actualizar, esa ruta
        // vieja impedía que la nube resolviera el gimnasio del escritorio.
        saved.searchParams.set('installationId', getInstallationId());
      }
      return saved.toString();
    }
  } catch {
    /* sin archivo o contenido inválido */
  }
  return null;
}

// Bloqueo duro: si la prueba venció y no hay licencia, la ventana principal
// muestra SOLO la pantalla de activación (no se entra al panel).
async function showActivationInMain(info: LicenseInfo | null): Promise<void> {
  if (!mainWindow) return;
  const htmlFile = path.join(app.getPath('userData'), 'activation.html');
  try {
    fs.writeFileSync(htmlFile, activationHtml(info));
    await mainWindow.loadFile(htmlFile);
  } catch (err) {
    log('No se pudo mostrar la pantalla de activación:', (err as Error).message);
  }
}

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'FIT system™',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Reabre la última pantalla usada (si pertenece al mismo panel) para no perder
  // el contexto al reiniciar tras una actualización.
  const base = appUrl();
  const restored = savedRouteUrl();
  const url = restored && restored !== base ? restored : base;
  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    log('Error al cargar', url, (err as Error).message);
  }

  // Guarda la pantalla actual ante cada navegación (incluye navegación interna
  // del panel, que usa el historial del navegador).
  const persistRoute = () => {
    try {
      const current = mainWindow?.webContents.getURL();
      if (current) saveRoute(current);
    } catch {
      /* la ventana puede estar cerrándose */
    }
  };
  mainWindow.webContents.on('did-navigate', persistRoute);
  mainWindow.webContents.on('did-navigate-in-page', persistRoute);

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    openExternalSafe(openUrl);
    return { action: 'deny' };
  });

  // Evita que la ventana principal navegue fuera de la aplicación (panel local
  // o panel en la nube). Todo lo demás se abre en el navegador externo.
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    const allowedOrigins = app.isPackaged
      ? [`http://127.0.0.1:${WEB_PORT}`, CLOUD_PANEL_URL]
      : ['http://localhost:3000', CLOUD_PANEL_URL];
    if (!allowedOrigins.some((origin) => navUrl.startsWith(origin))) {
      event.preventDefault();
      openExternalSafe(navUrl);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function formatTicket(data: Record<string, any>): string {
  const org = data.organization || 'FIT system™';
  const headerLines = (data.headerLines || []) as string[];
  const title = data.title || 'COMPROBANTE';
  const date = new Date(data.date || Date.now()).toLocaleString('es-AR');
  const lines = (data.lines || []) as Array<{ label: string; value: string }>;
  const total = data.total || '';
  const footer = data.footer || '';
  const w = 32;
  const pad = (s: string, len = w) => String(s).padEnd(len).slice(0, len);
  const center = (s: string) => {
    const t = String(s);
    const left = Math.max(0, Math.floor((w - t.length) / 2));
    return ' '.repeat(left) + t;
  };
  const right = (s: string) => String(s).padStart(w);
  let t = '';
  t += center(org) + '\n';
  for (const hl of headerLines) t += center(String(hl)) + '\n';
  t += center(title) + '\n';
  t += '-'.repeat(w) + '\n';
  t += `Fecha: ${date}`.slice(0, w).padEnd(w) + '\n';
  t += '-'.repeat(w) + '\n';
  for (const l of lines) {
    const label = String(l.label || '');
    const val = String(l.value || '');
    if (label && val) {
      const line = (label + ' ' + val);
      t += line.slice(0, w).padEnd(w) + '\n';
    } else if (label) t += pad(label) + '\n';
  }
  t += '-'.repeat(w) + '\n';
  if (total) t += right(`TOTAL: ${total}`) + '\n';
  if (footer) {
    t += '\n' + center(footer) + '\n';
  }
  t += '\n\n\n';
  return t;
}

function startPrintServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://127.0.0.1:${PRINT_PORT}`);

    // CORS: se refleja el origen si es loopback (panel local) o el panel en la
    // nube. NO se usa '*'.
    const origin = String(req.headers.origin || '');
    const originAllowed =
      /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) || origin.startsWith(CLOUD_PANEL_URL);
    if (originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/printers') {
      try {
        const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ printers }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }
    }
    if (req.method === 'POST' && url.pathname === '/print') {
      if (!originAllowed && origin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origen no permitido' }));
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const printerName = data.printer || undefined;
          const ticket = data.ticket || {};
          const content = data.raw || formatTicket(ticket);
          // Logo del gimnasio (data URL o URL http). Se imprime como imagen
          // arriba del texto solo si la impresora/ajustes lo permiten.
          const logo = typeof ticket.logo === 'string' ? ticket.logo : '';
          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const logoHtml = logo
            ? `<img src="${logo.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" style="display:block;margin:0 auto 8px;max-width:180px;max-height:90px;object-fit:contain" />`
            : '';
          const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
          const html = `<!DOCTYPE html><html><body>${logoHtml}<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;margin:0">${esc(content)}</pre></body></html>`;
          await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          await printWindow.webContents.print({ silent: true, deviceName: printerName, margins: { marginType: 'none' } as any });
          printWindow.close();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  // El error de listen es asincrono: sin este handler, un puerto ocupado
  // (p. ej. otra instancia abierta) lanzaria una excepcion no capturada y
  // tumbaria el proceso principal. Lo registramos y degradamos sin crashear.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log('Servidor de impresion: puerto', PRINT_PORT, 'ocupado; impresion local deshabilitada en esta sesion');
    } else {
      log('Servidor de impresion: error', err.message);
    }
  });
  server.listen(PRINT_PORT, '127.0.0.1', () => log('Servidor de impresion escuchando en', PRINT_PORT));
  return server;
}

// Una sola instancia: evita que una segunda ventana intente ocupar los puertos
// internos (3001 api, 3000 web, 3999 impresion) y falle. Si ya hay una abierta,
// se la enfoca en lugar de iniciar otra.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Permite el uso de la cámara (reconocimiento facial / check-in) en el panel
// local y en el panel en la nube. Sin esto, Electron bloquea getUserMedia y la
// cámara "no conecta".
function grantLocalMediaPermissions() {
  const isAllowedOrigin = (url: string) =>
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://localhost') ||
    url.startsWith(CLOUD_PANEL_URL);
  const allowed = new Set(['media', 'camera', 'microphone', 'mediaKeySystem', 'audioCapture', 'videoCapture']);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowed.has(permission) && isAllowedOrigin(webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    allowed.has(permission) && isAllowedOrigin(requestingOrigin),
  );
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  log('=== FIT system™ iniciando ===', 'packaged=', app.isPackaged, 'userData=', app.getPath('userData'));
  try {
    grantLocalMediaPermissions();
  } catch (err) {
    log('No se pudo configurar el permiso de cámara:', (err as Error).message);
  }
  try {
    printServer = startPrintServer();
  } catch (err) {
    log('Fallo al iniciar servidor de impresion:', (err as Error).message);
  }

  let servicesReady = false;
  try {
    if (app.isPackaged) {
      const network = readNetworkConfig();
      const cloud = network.mode === 'cloud';
      const lanMode = network.mode === 'server';
      const bindHost = lanMode ? '0.0.0.0' : '127.0.0.1';
      // La API local siempre arranca en el equipo: administra la licencia y la
      // impresión de tickets. En modo nube NO se levanta el panel local; la
      // ventana principal abre el panel remoto (misma base que la app del socio).
      apiProcess = startApi(bindHost, lanMode);
      if (cloud) {
        await waitForUrl(`http://127.0.0.1:${API_PORT}/health`);
        log('Modo nube: panel remoto', CLOUD_PANEL_URL);
      } else {
        webProcess = startWeb(bindHost);
        await Promise.all([
          waitForUrl(`http://127.0.0.1:${API_PORT}/health`),
          waitForUrl(`http://127.0.0.1:${WEB_PORT}/`),
        ]);
        log('Servicios listos', lanMode ? `(red local: ${getLanAddresses().join(', ')})` : '');
      }
      servicesReady = true;
    }
  } catch (err) {
    log('Fallo al arrancar servicios:', (err as Error).message);
    dialog.showErrorBox(
      'FIT system™',
      `No se pudieron iniciar los servicios internos.\n\n${(err as Error).message}\n\nRevisa el log en:\n${LOG_FILE}`,
    );
  }

  registerLicenseIpc();
  registerUpdateIpc();
  registerAccessIpc();
  registerNetworkIpc();

  // La ventana se crea SIEMPRE primero: nunca debe quedar sin abrir por una
  // validación de licencia/red lenta o colgada. La licencia se consulta después.
  await createWindow();

  if (app.isPackaged && servicesReady) {
    try {
      const info = await checkLicense();
      log('Estado de licencia al iniciar:', info?.plan, info?.status, 'usable=', info?.isUsable);
      // Bloqueo duro: prueba vencida / licencia suspendida y sin activar => el
      // panel queda inaccesible; solo se muestra la pantalla de activación.
      if (info && !info.isUsable) {
        await showActivationInMain(info);
      } else if (
        info?.isUsable &&
        info.daysLeft !== null &&
        info.daysLeft <= (info.plan === 'TRIAL' ? 3 : 15)
      ) {
        // Recordatorio proactivo: se solicita la renovación antes del
        // vencimiento, sin bloquear el uso del sistema (prueba: 3 días; plan: 15).
        const trial = info.plan === 'TRIAL';
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          title: 'FIT system™',
          message: trial
            ? `Tu prueba gratuita vence en ${info.daysLeft} día(s).`
            : `Tu licencia ${info.plan} vence en ${info.daysLeft} día(s).`,
          detail: 'Renová tu licencia para no interrumpir el servicio del gimnasio.',
          buttons: ['Renovar ahora', 'Más tarde'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) {
          await createActivationWindow();
        }
      }
    } catch (err) {
      log('No se pudo validar la licencia:', (err as Error).message);
    }

    // Revalidación periódica: si la licencia se revoca en el servidor (p. ej. por
    // falta de pago de la suscripción), el panel se bloquea sin esperar reinicio.
    setInterval(() => {
      void (async () => {
        try {
          const info = await checkLicense();
          if (info && !info.isUsable) await showActivationInMain(info);
        } catch {
          /* sin internet: se conserva el estado local */
        }
      })();
    }, LICENSE_RECHECK_INTERVAL_MS);
  }

  // Auto-actualización (electron-updater): consulta GitHub Releases al iniciar
  // (silenciosa) y cada 6 horas. Requiere la app instalada (NSIS); el build
  // portable no puede auto-actualizarse.
  if (app.isPackaged) {
    await initAutoUpdater();
    setTimeout(() => void checkForUpdates(true), 4000);
    setInterval(() => void checkForUpdates(true), UPDATE_CHECK_INTERVAL_MS);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', stopServices);
app.on('will-quit', stopServices);
app.on('window-all-closed', () => {
  stopServices();
  if (process.platform !== 'darwin') app.quit();
});
