import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PORT = 3001;
const WEB_PORT = 3000;
const PRINT_PORT = 3999;
const LOG_FILE = path.join(os.tmpdir(), 'fitsystem-desktop.log');

let apiProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
// Pantalla de activación opcional (respaldo). En uso normal la licencia se
// administra desde Configuración > Licencia y no se muestra al ingresar.
let activationWindow: BrowserWindow | null = null;
let printServer: http.Server | null = null;
let licenseInfo: LicenseInfo | null = null;

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

function getInstallationId(): string {
  const file = path.join(app.getPath('userData'), 'installation.json');
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { installationId?: string };
      if (data.installationId) return data.installationId;
    }
  } catch {
    /* regenerate */
  }
  const installationId = crypto.randomUUID();
  try {
    fs.writeFileSync(
      file,
      JSON.stringify({ installationId, machineName: os.hostname(), createdAt: new Date().toISOString() }, null, 2),
    );
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

function apiJson(method: string, pathname: string, body?: unknown): Promise<Record<string, any>> {
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
          try {
            resolve(JSON.parse(data || '{}'));
          } catch {
            resolve({});
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function checkLicense(): Promise<LicenseInfo | null> {
  const installationId = getInstallationId();
  const res = await apiJson('POST', '/api/license/validate', { installationId });
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
<title>Activación - FIT System</title>
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
    title: 'Activación - FIT System',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
    if (!mainWindow) await createWindow();
    return true;
  });

  ipcMain.handle('license:request', async () => {
    const installationId = getInstallationId();
    const subject = encodeURIComponent('Solicitud de código de licencia FIT System');
    const body = encodeURIComponent(
      `Hola, quiero activar FIT System.\n\nID de instalación: ${installationId}\nEquipo: ${os.hostname()}\n`,
    );
    const target = licenseConfig.contact
      ? `mailto:${licenseConfig.contact}?subject=${subject}&body=${body}`
      : licenseConfig.site;
    if (target) await shell.openExternal(target);
    return true;
  });
}

function startApi(): ChildProcess {
  const apiDir = path.join(process.resourcesPath, 'api');
  const entry = path.join(apiDir, 'dist', 'index.js');

  const dbPath = path.join(app.getPath('userData'), 'fitsystem.db');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    API_PORT: String(API_PORT),
    API_HOST: '127.0.0.1',
    DATABASE_URL: toFileUrl(dbPath),
    WEB_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
    JWT_SECRET: getApiSecret(),
    LICENSE_INSTALLATION_ID: getInstallationId(),
  };

  log('Iniciando API en puerto', API_PORT);
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

function startWeb(): ChildProcess {
  const webDir = path.join(process.resourcesPath, 'web');
  const nextBin = path.join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(WEB_PORT),
  };

  log('Iniciando WEB en puerto', WEB_PORT);
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'],
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

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'FIT System',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const url = app.isPackaged
    ? `http://127.0.0.1:${WEB_PORT}/dashboard`
    : 'http://localhost:3000/dashboard';
  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    log('Error al cargar', url, (err as Error).message);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http')) shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function formatTicket(data: Record<string, any>): string {
  const org = data.organization || 'FIT System';
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
    if (req.method === 'GET' && url.pathname === '/printers') {
      try {
        const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ printers }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }
    }
    if (req.method === 'POST' && url.pathname === '/print') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const printerName = data.printer || undefined;
          const content = data.raw || formatTicket(data.ticket || {});
          const win = mainWindow;
          const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
          const html = `<!DOCTYPE html><html><body><pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;margin:0">${content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</pre></body></html>`;
          await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          await printWindow.webContents.print({ silent: true, deviceName: printerName, margins: { marginType: 'none' } as any });
          printWindow.close();
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PRINT_PORT, '127.0.0.1', () => log('Servidor de impresion escuchando en', PRINT_PORT));
  return server;
}

app.whenReady().then(async () => {
  log('=== FIT System iniciando ===', 'packaged=', app.isPackaged, 'userData=', app.getPath('userData'));
  try {
    printServer = startPrintServer();
  } catch (err) {
    log('Fallo al iniciar servidor de impresion:', (err as Error).message);
  }

  let servicesReady = false;
  try {
    if (app.isPackaged) {
      apiProcess = startApi();
      webProcess = startWeb();
      await Promise.all([
        waitForUrl(`http://127.0.0.1:${API_PORT}/health`),
        waitForUrl(`http://127.0.0.1:${WEB_PORT}/`),
      ]);
      servicesReady = true;
      log('Servicios listos');
    }
  } catch (err) {
    log('Fallo al arrancar servicios:', (err as Error).message);
    dialog.showErrorBox(
      'FIT System',
      `No se pudieron iniciar los servicios internos.\n\n${(err as Error).message}\n\nRevisa el log en:\n${LOG_FILE}`,
    );
  }

  registerLicenseIpc();

  if (app.isPackaged && servicesReady) {
    try {
      const info = await checkLicense();
      log('Estado de licencia al iniciar:', info?.plan, info?.status, 'usable=', info?.isUsable);
    } catch (err) {
      log('No se pudo validar la licencia:', (err as Error).message);
    }
  }

  // La licencia se administra desde Configuración > Licencia. No bloqueamos el
  // ingreso: el sistema arranca en prueba hasta que el usuario pegue su clave.
  await createWindow();

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
