import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dirname = path.dirname(fileURLToPath(import.meta.url));

interface GateConfig {
  apiUrl: string;
  email: string;
  token: string;
  branchId: string;
  branchName: string;
}

const DEFAULT_CONFIG: GateConfig = {
  apiUrl: 'http://127.0.0.1:3001',
  email: '',
  token: '',
  branchId: '',
  branchName: '',
};

function configFile(): string {
  return path.join(app.getPath('userData'), 'gate-config.json');
}

function readConfig(): GateConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as Partial<GateConfig>;
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg: GateConfig) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

function publicConfig(cfg: GateConfig) {
  return {
    apiUrl: cfg.apiUrl,
    email: cfg.email,
    branchId: cfg.branchId,
    branchName: cfg.branchName,
    loggedIn: Boolean(cfg.token),
  };
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function api<T = unknown>(cfg: GateConfig, pathname: string, options: ApiOptions = {}): Promise<T> {
  const base = cfg.apiUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api${pathname}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new Error(`No se pudo conectar con ${base} (${(err as Error).message})`);
  }
  const json = (await res.json().catch(() => null)) as { data?: T; message?: string; error?: string } | null;
  if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
  return (json?.data ?? (json as T));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b1120',
    title: 'FIT System Acceso',
    webPreferences: {
      preload: path.join(dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(app.getAppPath(), 'renderer', 'index.html'));
  return win;
}

function registerIpc() {
  ipcMain.handle('gate:config', () => publicConfig(readConfig()));

  ipcMain.handle('gate:login', async (_e, payload: { apiUrl: string; email: string; password: string }) => {
    const cfg = readConfig();
    cfg.apiUrl = (payload.apiUrl || cfg.apiUrl).trim();
    cfg.email = payload.email.trim();
    const data = await api<{ token: string; user: { name: string }; branches: { id: string; name: string }[] }>(
      cfg,
      '/auth/login',
      { method: 'POST', body: { email: cfg.email, password: payload.password } },
    );
    cfg.token = data.token;
    writeConfig(cfg);
    return { ok: true, user: data.user, branches: data.branches ?? [] };
  });

  ipcMain.handle('gate:branches', async () => {
    const cfg = readConfig();
    return api<{ id: string; name: string }[]>(cfg, '/branches');
  });

  ipcMain.handle('gate:save-branch', (_e, payload: { branchId: string; branchName: string }) => {
    const cfg = readConfig();
    cfg.branchId = payload.branchId;
    cfg.branchName = payload.branchName;
    writeConfig(cfg);
    return publicConfig(cfg);
  });

  ipcMain.handle('gate:checkin', async (_e, payload: { code: string }) => {
    const cfg = readConfig();
    if (!cfg.branchId) throw new Error('Elegí una sede antes de registrar accesos');
    return api(cfg, '/attendance/checkin', { method: 'POST', body: { branchId: cfg.branchId, qr: payload.code, method: 'QR' } });
  });

  ipcMain.handle('gate:logout', () => {
    const cfg = readConfig();
    cfg.token = '';
    writeConfig(cfg);
    return publicConfig(cfg);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
