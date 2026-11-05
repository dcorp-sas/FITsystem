import { app, BrowserWindow, ipcMain, safeStorage, shell, Notification, Tray, Menu, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns/promises';
import { DEFAULT_MAIL, mailInbox, mailRead, mailSend, mailDelete, zohoExchangeCode, zohoRegion, type MailConfig, type ZohoAccount } from './mail.js';
import { contentFile, findRepoRoot, loadContent, publishContent, saveContent, validateContent, type SiteContent } from './site.js';

const require = createRequire(import.meta.url);
const { Client: SshClient } = require('ssh2') as typeof import('ssh2');

const dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform === 'win32') app.setAppUserModelId('com.dcorp.fitsystem.panel');

/* ------------------------------------------------------------------ */
/* Config del Panel (credenciales del proveedor)                       */
/* ------------------------------------------------------------------ */

interface VpsConfig {
  host: string;
  port: number;
  user: string;
  privateKeyPath: string;
  passphrase: string;
}
interface LicensadorConfig {
  url: string;
  user: string;
  pass: string;
}
interface PanelConfig {
  vps: VpsConfig;
  licensador: LicensadorConfig;
  api: { url: string; providerToken: string };
  brevo: { apiKey: string };
  site: { url: string };
  assistant: { model: string; apiKey: string };
  support: { operatorName: string };
  mail: MailConfig;
}

const DEFAULT_CONFIG: PanelConfig = {
  vps: { host: '190.183.229.160', port: 22, user: 'root', privateKeyPath: '', passphrase: '' },
  licensador: { url: 'https://licensador.fitsystem.com.ar', user: 'admin', pass: '' },
  api: { url: 'https://api.fitsystem.com.ar', providerToken: '' },
  brevo: { apiKey: '' },
  site: { url: 'https://fitsystem.com.ar' },
  assistant: { model: 'gpt-6-astra', apiKey: '' },
  support: { operatorName: '' },
  mail: DEFAULT_MAIL,
};

const SECRET_PATHS: Array<[string, (c: PanelConfig) => string | undefined]> = [
  ['licensadorPass', (c) => c.licensador.pass],
  ['vpsPassphrase', (c) => c.vps.passphrase],
  ['brevoApiKey', (c) => c.brevo.apiKey],
  ['providerToken', (c) => c.api.providerToken],
  ['assistantApiKey', (c) => c.assistant.apiKey],
];

function configFile(): string {
  return path.join(app.getPath('userData'), 'panel-config.json');
}

function enc(value: string): string {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(value).toString('base64');
  return 'plain:' + Buffer.from(value, 'utf8').toString('base64');
}

function dec(value: string): string {
  if (!value) return '';
  try {
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  } catch {
    /* valor corrupto: se ignora */
  }
  return '';
}

function readConfig(): PanelConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const rawMail = (raw.mail as Partial<MailConfig> | undefined) ?? {};
  const merged: PanelConfig = {
    vps: { ...DEFAULT_CONFIG.vps, ...((raw.vps as object) ?? {}) },
    licensador: { ...DEFAULT_CONFIG.licensador, ...((raw.licensador as object) ?? {}) },
    api: { ...DEFAULT_CONFIG.api, ...((raw.api as object) ?? {}) },
    brevo: { ...DEFAULT_CONFIG.brevo, ...((raw.brevo as object) ?? {}) },
    site: { ...DEFAULT_CONFIG.site, ...((raw.site as object) ?? {}) },
    assistant: { ...DEFAULT_CONFIG.assistant, ...((raw.assistant as object) ?? {}) },
    support: { ...DEFAULT_CONFIG.support, ...((raw.support as object) ?? {}) },
    mail: {
      mode: rawMail.mode === 'zoho' ? 'zoho' : 'imap',
      imap: Array.isArray(rawMail.imap) ? rawMail.imap.map((a) => ({ ...a, password: '' })) : [],
      zoho: {
        region: zohoRegion(((rawMail.zoho as { region?: string } | undefined)?.region) ?? 'com'),
        accounts: Array.isArray((rawMail.zoho as { accounts?: unknown[] } | undefined)?.accounts)
          ? ((rawMail.zoho as { accounts: Array<Partial<ZohoAccount>> }).accounts ?? []).map((a) => ({
              email: a.email ?? '',
              clientId: a.clientId ?? '',
              clientSecret: '',
              refreshToken: '',
            }))
          : [],
      },
    },
  };
  const secrets = (raw.secrets as Record<string, string> | undefined) ?? {};
  merged.licensador.pass = dec(secrets.licensadorPass ?? merged.licensador.pass ?? '');
  merged.vps.passphrase = dec(secrets.vpsPassphrase ?? merged.vps.passphrase ?? '');
  merged.brevo.apiKey = dec(secrets.brevoApiKey ?? merged.brevo.apiKey ?? '');
  merged.api.providerToken = dec(secrets.providerToken ?? merged.api.providerToken ?? '');
  merged.assistant.apiKey = dec(secrets.assistantApiKey ?? merged.assistant.apiKey ?? '');
  const zohoSecrets = dec(secrets.zohoAccounts ?? '');
  if (zohoSecrets) {
    try {
      const arr = JSON.parse(zohoSecrets) as Array<Pick<ZohoAccount, 'clientId' | 'clientSecret' | 'refreshToken'>>;
      for (const a of merged.mail.zoho.accounts) {
        const s = arr.find((x) => x.clientId === a.clientId);
        if (s) {
          a.clientSecret = s.clientSecret ?? '';
          a.refreshToken = s.refreshToken ?? '';
        }
      }
    } catch {
      /* ignore */
    }
  }
  // Migración: config anterior con una sola cuenta Zoho.
  const legacySecret = dec(secrets.zohoClientSecret ?? '');
  const legacyToken = dec(secrets.zohoRefreshToken ?? '');
  const legacyAccount = merged.mail.zoho.accounts.length === 1 ? merged.mail.zoho.accounts[0] : undefined;
  if (legacyToken && legacyAccount && !legacyAccount.refreshToken) {
    legacyAccount.clientSecret = legacySecret;
    legacyAccount.refreshToken = legacyToken;
  }
  const imapPasswords = dec(secrets.imapPasswords ?? '');
  if (imapPasswords) {
    try {
      const arr = JSON.parse(imapPasswords) as string[];
      merged.mail.imap.forEach((a, i) => (a.password = arr[i] ?? ''));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

function writeConfig(cfg: PanelConfig) {
  const secrets: Record<string, string> = {};
  for (const [key, get] of SECRET_PATHS) secrets[key] = enc(get(cfg) ?? '');
  secrets.imapPasswords = enc(JSON.stringify(cfg.mail.imap.map((a) => a.password ?? '')));
  secrets.zohoAccounts = enc(
    JSON.stringify(
      cfg.mail.zoho.accounts.map((a) => ({ clientId: a.clientId, clientSecret: a.clientSecret ?? '', refreshToken: a.refreshToken ?? '' })),
    ),
  );
  const out = {
    vps: { ...cfg.vps, passphrase: '' },
    licensador: { ...cfg.licensador, pass: '' },
    api: { ...cfg.api, providerToken: '' },
    brevo: { apiKey: '' },
    site: cfg.site,
    assistant: { model: cfg.assistant.model },
    support: cfg.support,
    mail: {
      mode: cfg.mail.mode,
      imap: cfg.mail.imap.map((a) => ({ ...a, password: '' })),
      zoho: {
        region: cfg.mail.zoho.region,
        accounts: cfg.mail.zoho.accounts.map((a) => ({ email: a.email, clientId: a.clientId })),
      },
    },
    secrets,
  };
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(out, null, 2), { mode: 0o600 });
}

function publicConfig(cfg: PanelConfig) {
  return {
    vps: { ...cfg.vps, passphrase: '' },
    licensador: { ...cfg.licensador, pass: '' },
    api: { ...cfg.api, providerToken: '' },
    brevo: {},
    site: cfg.site,
    assistant: { model: cfg.assistant.model },
    support: cfg.support,
    mail: {
      mode: cfg.mail.mode,
      imap: cfg.mail.imap.map((a) => ({ ...a, password: '' })),
      zoho: {
        region: cfg.mail.zoho.region,
        accounts: cfg.mail.zoho.accounts.map((a) => ({
          email: a.email,
          clientId: a.clientId,
          authorized: Boolean(a.clientId && a.clientSecret && a.refreshToken),
        })),
      },
    },
    secrets: {
      licensadorPass: Boolean(cfg.licensador.pass),
      vpsPassphrase: Boolean(cfg.vps.passphrase),
      brevoApiKey: Boolean(cfg.brevo.apiKey),
      providerToken: Boolean(cfg.api.providerToken),
      assistantApiKey: Boolean(cfg.assistant.apiKey),
      imapPasswords: cfg.mail.imap.some((a) => a.password),
      zoho: cfg.mail.zoho.accounts.some((a) => a.clientId && a.clientSecret && a.refreshToken),
    },
    encrypted: safeStorage.isEncryptionAvailable(),
  };
}

/* ------------------------------------------------------------------ */
/* Licensador (licencias, activaciones e IPs)                          */
/* ------------------------------------------------------------------ */

const tokenCache = new Map<string, { token: string; exp: number }>();

async function licensadorLogin(cfg: PanelConfig): Promise<string> {
  const base = cfg.licensador.url.replace(/\/+$/, '');
  const cached = tokenCache.get(base);
  if (cached && cached.exp > Date.now()) return cached.token;
  if (!cfg.licensador.pass) throw new Error('Falta la contraseña del Licensador (Configuración)');
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: cfg.licensador.user, pass: cfg.licensador.pass }),
  });
  const data = (await res.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (!res.ok || !data?.token) throw new Error(data?.error || `El Licensador respondió HTTP ${res.status}`);
  tokenCache.set(base, { token: data.token, exp: Date.now() + 11 * 3600_000 });
  return data.token;
}

async function licensadorApi<T = unknown>(
  cfg: PanelConfig,
  pathname: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const base = cfg.licensador.url.replace(/\/+$/, '');
  const token = await licensadorLogin(cfg);
  const res = await fetch(`${base}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (res.status === 401) tokenCache.delete(base);
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json as T;
}

/* ------------------------------------------------------------------ */
/* API de la nube                                                      */
/* ------------------------------------------------------------------ */

async function apiHealth(cfg: PanelConfig) {
  const base = cfg.api.url.replace(/\/+$/, '');
  const started = Date.now();
  const res = await fetch(`${base}/health`);
  return { status: res.status, ok: res.ok, latencyMs: Date.now() - started };
}

let githubReleaseCache: { expiresAt: number; value: Record<string, unknown> } | null = null;

async function githubReleaseOverview() {
  if (githubReleaseCache && githubReleaseCache.expiresAt > Date.now()) return githubReleaseCache.value;
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'FIT-System-Panel' };
  const get = async (url: string) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    const body = await response.json().catch(() => null) as Record<string, any> | null;
    if (!response.ok) throw new Error(response.status === 403 ? 'GitHub limitó las consultas públicas; intentá actualizar más tarde.' : `GitHub respondió HTTP ${response.status}`);
    return body;
  };
  const [releaseResult, runsResult] = await Promise.allSettled([
    get('https://api.github.com/repos/dcorp-sas/FITsystem/releases/latest'),
    get('https://api.github.com/repos/dcorp-sas/FITsystem/actions/runs?per_page=20'),
  ]);
  const release = releaseResult.status === 'fulfilled' ? releaseResult.value : null;
  const runs = runsResult.status === 'fulfilled' ? runsResult.value?.workflow_runs || [] : [];
  const value = {
    checkedAt: new Date().toISOString(),
    release: release ? { version: release.tag_name, name: release.name, url: release.html_url, publishedAt: release.published_at, assets: (release.assets || []).map((asset: Record<string, any>) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url })) } : null,
    workflows: runs.map((run: Record<string, any>) => ({ name: run.name, workflow: run.path, status: run.status, conclusion: run.conclusion, branch: run.head_branch, sha: String(run.head_sha || '').slice(0, 7), createdAt: run.created_at, updatedAt: run.updated_at, url: run.html_url })).slice(0, 20),
    errors: [releaseResult, runsResult].filter((result) => result.status === 'rejected').map((result) => result.reason?.message || String(result.reason)),
  };
  githubReleaseCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}

/* ------------------------------------------------------------------ */
/* CRM (leads del sitio) sobre la API del proveedor                    */
/* ------------------------------------------------------------------ */

interface CrmOptions {
  method?: string;
  body?: unknown;
}

async function crmApi<T = Record<string, unknown>>(cfg: PanelConfig, pathname: string, options: CrmOptions = {}): Promise<T> {
  const base = cfg.api.url.replace(/\/+$/, '');
  if (!cfg.api.providerToken) throw new Error('Falta el token del proveedor (Configuración → API)');
  const res = await fetch(`${base}${pathname}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-provider-token': cfg.api.providerToken },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { data?: T; message?: string } | null;
  if (!res.ok) throw new Error(json?.message || `La API respondió HTTP ${res.status}`);
  return (json?.data ?? json) as T;
}

function crmLeads(cfg: PanelConfig) {
  return crmApi<Record<string, unknown>>(cfg, '/api/leads');
}

function crmUpdateLead(cfg: PanelConfig, id: string, payload: { stage?: string; notes?: string }) {
  if (!id) throw new Error('Falta el lead');
  return crmApi(cfg, `/api/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

function crmCreateLead(cfg: PanelConfig, payload: { name: string; email: string; phone?: string; gymName?: string; message?: string; stage?: string }) {
  return crmApi(cfg, '/api/leads', { method: 'POST', body: payload });
}

function metricsSummary(cfg: PanelConfig, days = 30) {
  return crmApi<Record<string, unknown>>(cfg, `/api/metrics/summary?days=${encodeURIComponent(String(days))}`);
}

/* ------------------------------------------------------------------ */
/* Diagnóstico de clientes (gimnasios en la nube)                      */
/* ------------------------------------------------------------------ */

interface ClientSync {
  connected: boolean;
  installationId: string | null;
  lastPushAt: string | null;
  lastError: string | null;
}
interface ClientRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  branches: number;
  users: number;
  members: number;
  activeMembers: number;
  plans: number;
  classes: number;
  attendances: number;
  lastAttendanceAt: string | null;
  lastMemberAt: string | null;
  lastPaymentAt: string | null;
  sync: ClientSync;
}
interface ClientsResult {
  generatedAt: string;
  totals: { clients: number; members: number };
  clients: ClientRow[];
}

function clientsList(cfg: PanelConfig) {
  return crmApi<ClientsResult>(cfg, '/api/provider/clients');
}

function providerOps<T = unknown>(cfg: PanelConfig, path: string, options: CrmOptions = {}) {
  return crmApi<T>(cfg, `/api/provider/${path}`, options);
}

/* ------------------------------------------------------------------ */
/* Suscripciones de la tienda (MercadoPago) sobre la API del proveedor */
/* ------------------------------------------------------------------ */

async function subscriptionsList(cfg: PanelConfig, status?: string) {
  const qs = status && status !== 'todas' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await crmApi<{ subscriptions: Record<string, unknown>[] }>(cfg, `/api/provider/subscriptions${qs}`);
  return res.subscriptions ?? [];
}

function subscriptionsCancel(cfg: PanelConfig, externalRef: string) {
  if (!externalRef) throw new Error('Falta la referencia de la suscripción');
  return crmApi(cfg, '/api/provider/subscriptions/cancel', { method: 'POST', body: { externalRef } });
}

function subscriptionsReactivate(cfg: PanelConfig, externalRef: string) {
  if (!externalRef) throw new Error('Falta la referencia de la suscripción');
  return crmApi<{ initPoint?: string }>(cfg, '/api/provider/subscriptions/reactivate', { method: 'POST', body: { externalRef } });
}

function subscriptionsChangePeriod(cfg: PanelConfig, externalRef: string, period: 'MONTHLY' | 'ANNUAL') {
  if (!externalRef) throw new Error('Falta la referencia de la suscripción');
  return crmApi<{ initPoint?: string }>(cfg, '/api/provider/subscriptions/period', { method: 'POST', body: { externalRef, period } });
}

/* ------------------------------------------------------------------ */
/* Brevo (email marketing)                                             */
/* ------------------------------------------------------------------ */

let brevoEgressMode: 'servidor' | 'respaldo local' = 'servidor';

async function brevoRequest(cfg: PanelConfig, method: 'GET' | 'POST', pathname: string, body?: unknown) {
  try {
    if (!cfg.api.providerToken) throw new Error('Falta el token del proveedor');
    const data = await crmApi(cfg, '/api/provider/marketing/brevo', { method: 'POST', body: { method, path: pathname, body } });
    brevoEgressMode = 'servidor';
    return data;
  } catch (proxyError) {
    // Mantiene el servicio andando con la salida actual hasta que el cliente
    // autorice la IP fija del servidor; luego las llamadas pasan por la VPS.
    if (!cfg.brevo.apiKey) throw proxyError;
    const res = await fetch(`https://api.brevo.com/v3${pathname}`, {
      method,
      headers: { 'api-key': cfg.brevo.apiKey, accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json as { message?: string })?.message || `Brevo HTTP ${res.status}`);
    brevoEgressMode = 'respaldo local';
    return json;
  }
}

async function brevoGet(cfg: PanelConfig, pathname: string) {
  return brevoRequest(cfg, 'GET', pathname);
}

async function brevoCheck(cfg: PanelConfig) {
  const [account, senders] = await Promise.all([
    brevoGet(cfg, '/account') as Promise<{ email?: string; companyName?: string; plan?: unknown }>,
    brevoGet(cfg, '/senders') as Promise<{ senders?: Array<{ email: string; active: boolean }> }>,
  ]);
  return {
    account: { email: account?.email ?? '', companyName: account?.companyName ?? '' },
    senders: (senders?.senders ?? []).map((s) => ({ email: s.email, active: s.active })),
    egressMode: brevoEgressMode,
  };
}

async function brevoPost(cfg: PanelConfig, pathname: string, body: unknown) {
  return brevoRequest(cfg, 'POST', pathname, body);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function marketingOverview(cfg: PanelConfig) {
  const [account, senders, lists, campaigns, folders] = await Promise.all([
    brevoGet(cfg, '/account') as Promise<any>,
    brevoGet(cfg, '/senders') as Promise<any>,
    brevoGet(cfg, '/contacts/lists?limit=100').catch(() => ({ lists: [] })) as Promise<any>,
    brevoGet(cfg, '/emailCampaigns?limit=50').catch(() => ({ campaigns: [] })) as Promise<any>,
    brevoGet(cfg, '/contacts/folders').catch(() => ({ folders: [] })) as Promise<any>,
  ]);
  return {
    account: { email: account?.email ?? '', companyName: account?.companyName ?? '', plan: (account as any)?.plan ?? '' },
    senders: ((senders as any)?.senders ?? []).map((s: any) => ({ email: s.email, active: s.active })),
    lists: ((lists as any)?.lists ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      total: l.totalRecords ?? 0,
      unique: l.uniqueContacts ?? 0,
    })),
    campaigns: ((campaigns as any)?.campaigns ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      subject: c.subject ?? '',
      sent: c.statistics?.sent ?? 0,
      delivered: c.statistics?.delivered ?? 0,
      opens: c.statistics?.opens ?? 0,
      clicks: c.statistics?.clicks ?? 0,
      unsubscribed: c.statistics?.unsubscribed ?? 0,
      updated: c.updatedAt ?? c.createdAt ?? null,
    })),
    folderId: ((folders as any)?.folders ?? [])[0]?.id ?? 1,
  };
}

async function marketingContacts(cfg: PanelConfig, params: { listId?: number; limit?: number; offset?: number }) {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.listId) qs.set('listIds', String(params.listId));
  const json = (await brevoGet(cfg, `/contacts?${qs.toString()}`)) as any;
  return {
    count: json.count ?? (json.contacts ?? []).length,
    contacts: (json.contacts ?? []).map((c: any) => ({
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(' '),
      phone: c.phone ?? '',
      created: c.createdAt ?? null,
      listIds: c.listIds ?? [],
    })),
  };
}

async function marketingAddContact(cfg: PanelConfig, input: { email: string; listId?: number }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Email inválido');
  const body: Record<string, unknown> = { email: input.email };
  if (input.listId) body.listIds = [input.listId];
  await brevoPost(cfg, '/contacts', body);
  audit('marketing.contacto.alta', input.email + (input.listId ? ` · lista ${input.listId}` : ''));
  return { ok: true };
}

async function marketingCreateList(cfg: PanelConfig, input: { name: string; folderId?: number }) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Falta el nombre de la lista');
  const json = await brevoPost(cfg, '/contacts/lists', { name, folderId: input.folderId ?? 1 });
  audit('marketing.lista.alta', name);
  return { id: (json as { id?: number })?.id ?? null, name };
}

async function marketingSendCampaign(cfg: PanelConfig, id: number) {
  await brevoPost(cfg, `/emailCampaigns/${id}/sendNow`, {});
  audit('marketing.campana.enviada', `campaña ${id}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* VPS por SSH (metricas y contenedores)                               */
/* ------------------------------------------------------------------ */

function sshExec(cfg: PanelConfig, command: string, timeoutMs = 25000): Promise<string> {
  return new Promise((resolve, reject) => {
    const vps = cfg.vps;
    if (!vps.host || !vps.user) return reject(new Error('Falta host/usuario del VPS (Configuración)'));
    let key: Buffer | undefined;
    if (vps.privateKeyPath) {
      try {
        key = fs.readFileSync(vps.privateKeyPath);
      } catch (err) {
        return reject(new Error('No se pudo leer la clave SSH: ' + (err as Error).message));
      }
    }
    const conn = new SshClient();
    let done = false;
    const finish = (err: Error | null, out?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve(out ?? '');
    };
    const timer = setTimeout(() => finish(new Error('El VPS no respondió (timeout)')), timeoutMs);
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return finish(err);
        let out = '';
        let errOut = '';
        stream.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
        stream.stderr.on('data', (chunk: Buffer) => (errOut += chunk.toString('utf8')));
        stream.on('close', () => finish(null, out || errOut));
      });
    });
    conn.on('error', (err) => finish(err));
    conn.connect({
      host: vps.host,
      port: vps.port || 22,
      username: vps.user,
      privateKey: key,
      passphrase: vps.passphrase || undefined,
      readyTimeout: timeoutMs,
    });
  });
}

const VPS_METRICS_CMD = [
  'echo "###UPTIME"; uptime',
  'echo "###CPU"; nproc',
  'echo "###CPUSET"; cat /sys/fs/cgroup/cpuset.cpus.effective 2>/dev/null || echo "no disponible"',
  'echo "###MEM"; free -m',
  'echo "###CGROUP_MEM"; cat /sys/fs/cgroup/memory.current 2>/dev/null || echo "no disponible"; cat /sys/fs/cgroup/memory.max 2>/dev/null || echo "no disponible"',
  'echo "###DISK"; df -h / /var/lib/docker 2>/dev/null | sort -u',
  'echo "###LOAD"; cat /proc/loadavg',
  'echo "###VISIBLE_TASKS"; ps -eL --no-headers 2>/dev/null | wc -l',
  'echo "###DOCKER"; docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>/dev/null || echo "docker: sin acceso"',
  'echo "###CPU_PRESSURE"; cat /sys/fs/cgroup/cpu.pressure 2>/dev/null || echo "no disponible"',
  'echo "###HOST_CPU_PRESSURE"; cat /proc/pressure/cpu 2>/dev/null || echo "no disponible"',
  'echo "###MEM_PRESSURE"; cat /sys/fs/cgroup/memory.pressure 2>/dev/null || cat /proc/pressure/memory 2>/dev/null || echo "no disponible"',
  'echo "###IO_PRESSURE"; cat /sys/fs/cgroup/io.pressure 2>/dev/null || cat /proc/pressure/io 2>/dev/null || echo "no disponible"',
  'echo "###PROCESSES"; ps -eo pid=,pcpu=,pmem=,comm= --sort=-pcpu 2>/dev/null | head -8',
  'echo "###CONTAINER_USAGE"; docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}" 2>/dev/null || true',
  'echo "###END"',
].join('; ');

function parseMetrics(raw: string) {
  const section = (name: string) => {
    const re = new RegExp(`###${name}\\n([\\s\\S]*?)(?=\\n###|$)`);
    const m = raw.match(re);
    return m && m[1] ? m[1].trim() : '';
  };
  const uptime = section('UPTIME');
  const cpuCores = Number(section('CPU')) || 1;
  const cpuSet = section('CPUSET');
  const load = section('LOAD');
  const loadParts = load.split(/\s+/);
  const loadTasks = (loadParts[3] || '').split('/').map(Number);
  const visibleTasks = Number(section('VISIBLE_TASKS')) || 0;
  // En LXC /proc/loadavg y /proc/pressure reflejan el nodo Proxmox compartido;
  // las métricas PSI del cgroup sí corresponden al contenedor de esta VPS.
  const loadIsHostWide = Boolean(loadTasks[1] && visibleTasks && loadTasks[1] > visibleTasks * 5);
  const mem = section('MEM').split('\n');
  const memRow = mem.find((l) => l.trim().startsWith('Mem:'));
  const memParts = memRow ? memRow.trim().split(/\s+/).slice(1).map(Number) : [];
  const disk = section('DISK');
  const containers = section('DOCKER')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, status, image] = l.split('|');
      return { name: name ?? '', status: status ?? '', image: image ?? '' };
    });
  const parseRows = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  const processes = parseRows(section('PROCESSES')).map((line) => {
    const [pid, cpu, memory, ...name] = line.split(/\s+/);
    return { pid, command: name.join(' '), cpuPercent: Number(cpu) || 0, memoryPercent: Number(memory) || 0 };
  });
  const containerUsage = parseRows(section('CONTAINER_USAGE')).map((line) => {
    const [name, cpu, memory] = line.split('|');
    return { name: name ?? '', cpu: cpu ?? '', memory: memory ?? '' };
  });
  return {
    uptime,
    cpuCores,
    cpuSet,
    load,
    loadIsHostWide,
    visibleTasks,
    memory: memParts.length >= 3 ? { totalMb: memParts[0], usedMb: memParts[1], freeMb: memParts[2] } : null,
    disk,
    containers,
    pressure: { cpu: section('CPU_PRESSURE'), hostCpu: section('HOST_CPU_PRESSURE'), memory: section('MEM_PRESSURE'), io: section('IO_PRESSURE') },
    processes,
    containerUsage,
    raw,
  };
}

async function vpsMetrics(cfg: PanelConfig) {
  const raw = await sshExec(cfg, VPS_METRICS_CMD);
  return parseMetrics(raw);
}

/* ------------------------------------------------------------------ */
/* Analizador de IPs                                                   */
/* ------------------------------------------------------------------ */

function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<{ port: number; open: boolean; ms: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const done = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, open, ms: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function ipAnalyze(cfg: PanelConfig, ip: string) {
  const clean = String(ip || '').replace(/^::ffff:/, '').trim();
  if (!/^[0-9a-fA-F.:]+$/.test(clean)) throw new Error('IP inválida');
  const [reverse, geo, ...probes] = await Promise.all([
    dns.reverse(clean).catch(() => [] as string[]),
    fetch(`http://ip-api.com/json/${clean}?fields=status,country,regionName,city,isp,org,as,mobile,proxy,hosting,reverse,query`)
      .then((r) => r.json())
      .catch(() => null),
    tcpProbe(clean, 443),
    tcpProbe(clean, 80),
    tcpProbe(clean, 22),
  ]);
  const vpsMatch = clean === cfg.vps.host;
  return { ip: clean, reverse, geo, tcp: probes, vpsMatch };
}

/* ------------------------------------------------------------------ */
/* Alertas / auditoría                                                 */
/* ------------------------------------------------------------------ */

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  detail: string;
}
interface AlertItem {
  level: 'crit' | 'warn' | 'info';
  area: string;
  title: string;
  detail?: string;
  at: number;
}

function diskMaxPercent(diskText: string): number {
  const values = [...diskText.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  return values.length ? Math.max(...values) : 0;
}

async function runAlerts(cfg: PanelConfig) {
  const at = Date.now();
  const checks: CheckResult[] = [];
  const alerts: AlertItem[] = [];
  const add = (level: AlertItem['level'], area: string, title: string, detail?: string) => alerts.push({ level, area, title, detail, at });

  if (process.platform === 'win32') {
    const startup = app.getLoginItemSettings({ args: loginItemArgs() });
    const enabled = startup.openAtLogin || startup.executableWillLaunchAtLogin;
    checks.push({ name: 'Monitor al iniciar Windows', status: enabled ? 'ok' : 'warn', detail: enabled ? 'Se inicia minimizado en la bandeja al iniciar sesión' : 'El inicio automático no está activo' });
    if (!enabled) add('warn', 'Panel FS', 'El monitor no se iniciará automáticamente con Windows', 'Revisá el inicio automático del Panel FS.');
  }

  const [site, api, brevo, vps, lic, database, systems] = await Promise.allSettled([
    fetch(cfg.site.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) }),
    apiHealth(cfg),
    cfg.api.providerToken || cfg.brevo.apiKey ? brevoCheck(cfg) : Promise.reject(new Error('faltan credenciales para Brevo')),
    vpsMetrics(cfg),
    licensadorApi<{ licenses: Array<{ state?: string; expires?: number; seats?: number; seats_used?: number }> }>(cfg, '/api/licenses'),
    providerOps<{ latencyMs?: number }>(cfg, 'diagnostics/database'),
    providerOps<{ platform?: Array<{ id: string; name: string; status: string; detail: string }>; clients?: Array<{ name: string; counts?: { portalAccounts?: number; activePortalAccounts?: number }; modules?: Array<{ id: string; active: boolean; detail: string }> }> }>(cfg, 'systems'),
  ]);

  // Sitio
  if (site.status === 'rejected') {
    checks.push({ name: 'Sitio', status: 'fail', detail: String(site.reason?.message || site.reason) });
    add('crit', 'Sitio', 'No responde ' + cfg.site.url, String(site.reason?.message || site.reason));
  } else if (!site.value.ok) {
    checks.push({ name: 'Sitio', status: 'fail', detail: 'HTTP ' + site.value.status });
    add('crit', 'Sitio', 'Respuesta HTTP ' + site.value.status, cfg.site.url);
  } else {
    checks.push({ name: 'Sitio', status: 'ok', detail: 'HTTP ' + site.value.status });
  }

  if (systems.status === 'fulfilled') {
    const platform = systems.value.platform || [];
    for (const serviceId of ['socios', 'profes', 'fitora', 'licensador']) {
      const service = platform.find((item) => item.id === serviceId);
      if (!service) continue;
      const label = serviceId === 'socios' ? 'App de socios' : serviceId === 'profes' ? 'Portal de Profes' : serviceId === 'fitora' ? 'Fitora' : 'Licensador';
      const level: CheckResult['status'] = service.status === 'online' ? 'ok' : service.status === 'sin configurar' ? 'skip' : 'fail';
      checks.push({ name: `${label} · sondeo externo`, status: level, detail: service.detail });
      if (service.status === 'offline') add('crit', label, `${label} no responde`, service.detail);
      if (service.status === 'sin configurar') add('warn', 'Configuración', `${label} sin dirección configurada`, service.detail);
    }
    const whatsappService = platform.find((item) => item.id === 'whatsapp');
    const arcaService = platform.find((item) => item.id === 'arca');
    const arcaStatus: CheckResult['status'] = arcaService?.status === 'habilitada' ? 'ok' : arcaService?.status === 'con error' ? 'warn' : 'skip';
    checks.push({ name: 'Facturación ARCA', status: arcaStatus, detail: arcaService?.detail || 'No se recibió estado' });
    if (arcaStatus === 'warn') add('warn', 'Facturación ARCA', 'La conexión o el certificado ARCA requiere revisión', arcaService?.detail || 'La prueba de conexión no fue satisfactoria.');
    const whatsappStatus: CheckResult['status'] = whatsappService?.status === 'con sesiones' ? 'ok' : systems.value.clients?.length ? 'warn' : 'skip';
    checks.push({ name: 'WhatsApp de clientes', status: whatsappStatus, detail: whatsappService?.detail || 'No se recibió estado' });
    const clients = systems.value.clients || [];
    if (!clients.length) checks.push({ name: 'App de socios', status: 'skip', detail: 'Sin cuentas de gimnasio para comprobar todavía' });
    else {
      const total = clients.reduce((sum, client) => sum + (client.counts?.portalAccounts || 0), 0);
      const active = clients.reduce((sum, client) => sum + (client.counts?.activePortalAccounts || 0), 0);
      checks.push({ name: 'App de socios', status: active ? 'ok' : 'warn', detail: `${active} cuentas activas de ${total} · ${clients.length} gimnasios` });
      if (!active) add('warn', 'App de socios', 'No hay cuentas de socios activas', 'Revisá los accesos de socios y el módulo App de socios de cada cliente.');
      const whatsappSessions = clients.filter((client) => client.modules?.find((module) => module.id === 'whatsapp')?.active).length;
      const whatsappSaved = clients.filter((client) => (client.modules?.find((module) => module.id === 'whatsapp')?.detail || '').startsWith('Credenciales guardadas')).length;
      if (!whatsappSessions) add('warn', 'WhatsApp', 'No hay sesiones de WhatsApp conectadas', whatsappSaved ? `${whatsappSaved} cuenta(s) tienen credenciales guardadas, pero el proceso no informa una conexión activa. Revisá Alertas y el estado de sesión de cada cliente.` : 'No hay credenciales de sesión registradas para los gimnasios; conectá WhatsApp desde la cuenta que lo necesite.');
    }
  } else {
    checks.push({ name: 'Sistemas y app de socios', status: 'fail', detail: String(systems.reason?.message || systems.reason) });
    add('crit', 'API', 'No se pudo consultar el inventario de clientes', String(systems.reason?.message || systems.reason));
  }

  // API de la nube
  if (api.status === 'rejected') {
    checks.push({ name: 'API nube', status: 'fail', detail: String(api.reason?.message || api.reason) });
    add('crit', 'API', 'No se pudo consultar la API', String(api.reason?.message || api.reason));
  } else if (!api.value.ok) {
    checks.push({ name: 'API nube', status: 'fail', detail: 'HTTP ' + api.value.status });
    add('crit', 'API', 'La API respondió HTTP ' + api.value.status, cfg.api.url);
  } else {
    checks.push({ name: 'API nube', status: 'ok', detail: api.value.latencyMs + ' ms' });
  }

  if (database.status === 'rejected') {
    const detail = String(database.reason?.message || database.reason);
    checks.push({ name: 'Base de datos', status: 'fail', detail });
    add('crit', 'Base de datos', 'La API no pudo consultar PostgreSQL', detail);
  } else {
    checks.push({ name: 'Base de datos', status: 'ok', detail: `${database.value.latencyMs ?? '—'} ms · consulta real` });
  }

  // Brevo
  if (brevo.status === 'rejected' && /sin API key/.test(String(brevo.reason?.message))) {
    checks.push({ name: 'Brevo', status: 'skip', detail: 'sin API key en Configuración' });
    add('warn', 'Marketing', 'Falta la API key de Brevo', 'Sin ella no se puede enviar email marketing.');
  } else if (brevo.status === 'rejected') {
    checks.push({ name: 'Brevo', status: 'fail', detail: String(brevo.reason?.message || brevo.reason) });
    add('crit', 'Marketing', 'Brevo no responde', String(brevo.reason?.message || brevo.reason));
  } else {
    const inactive = brevo.value.senders.filter((s) => !s.active);
    checks.push({ name: 'Brevo', status: inactive.length ? 'warn' : 'ok', detail: `${brevo.value.senders.length} remitentes` });
    if (inactive.length) add('warn', 'Marketing', `${inactive.length} remitente(s) sin verificar`, inactive.map((s) => s.email).join(', '));
  }

  // Infraestructura
  if (vps.status === 'rejected') {
    checks.push({ name: 'VPS', status: 'fail', detail: String(vps.reason?.message || vps.reason) });
    add('crit', 'Infraestructura', 'No se pudo consultar el VPS', String(vps.reason?.message || vps.reason));
  } else {
    const m = vps.value.memory;
    const memPct = m && m.usedMb != null && m.totalMb ? Math.round((m.usedMb / m.totalMb) * 100) : 0;
    const diskPct = diskMaxPercent(vps.value.disk);
    const loadTop = Number((vps.value.load || '0').split(' ')[0]) || 0;
    const cpuPressureMatch = vps.value.pressure.cpu.match(/some avg10=([\d.]+)/);
    const cpuPressure = Number(cpuPressureMatch?.[1] || 0);
    const memoryPressure = Number(vps.value.pressure.memory.match(/some avg10=([\d.]+)/)?.[1] || 0);
    const ioPressure = Number(vps.value.pressure.io.match(/some avg10=([\d.]+)/)?.[1] || 0);
    const down = vps.value.containers.filter((c) => !/^Up/i.test(c.status));
    const status: CheckResult['status'] = memPct >= 90 || diskPct >= 95 || cpuPressure >= 20 ? 'fail' : memPct >= 80 || diskPct >= 85 || down.length || !cpuPressureMatch || cpuPressure >= 10 || memoryPressure >= 5 || ioPressure >= 10 ? 'warn' : 'ok';
    const loadLabel = vps.value.loadIsHostWide ? `carga del nodo compartido ${loadTop.toFixed(2)} (no atribuible a esta VPS)` : `carga ${loadTop.toFixed(2)} / ${vps.value.cpuCores || 1} CPU`;
    checks.push({ name: 'VPS', status, detail: `RAM ${memPct}% · disco ${diskPct}% · presión propia CPU ${cpuPressure.toFixed(1)}% · ${loadLabel}` });
    if (memPct >= 90) add('crit', 'Infraestructura', `RAM al ${memPct}%`, 'Riesgo de OOM en los builds.');
    else if (memPct >= 80) add('warn', 'Infraestructura', `RAM al ${memPct}%`, 'Considerá liberar memoria o agregar swap.');
    if (diskPct >= 95) add('crit', 'Infraestructura', `Disco al ${diskPct}%`, 'Puede frenar builds y Postgres.');
    else if (diskPct >= 85) add('warn', 'Infraestructura', `Disco al ${diskPct}%`);
    if (down.length) add('warn', 'Infraestructura', `${down.length} contenedor(s) caídos`, down.map((c) => `${c.name} (${c.status})`).join(', '));
    if (cpuPressure >= 20) add('crit', 'Infraestructura', `Contención de CPU de la VPS (${cpuPressure.toFixed(1)}%)`, 'La presión de CPU del cgroup de esta VPS supera 20% en los últimos 10 segundos. La carga del nodo Proxmox compartido se muestra aparte y no interviene en esta alerta.');
    else if (cpuPressure >= 10) add('warn', 'Infraestructura', `Presión de CPU de la VPS (${cpuPressure.toFixed(1)}%)`, 'La presión de CPU propia supera 10% en los últimos 10 segundos.');
    else if (!cpuPressureMatch) add('warn', 'Infraestructura', 'Sin medición aislada de CPU', 'El sistema no expone la presión del cgroup. No se usa la carga compartida del host para afirmar que esta VPS está sana o saturada.');
    if (memoryPressure >= 5) add('warn', 'Infraestructura', `Presión de memoria de la VPS (${memoryPressure.toFixed(1)}%)`, 'El cgroup reporta esperas por memoria; revisar límite y procesos.');
    if (ioPressure >= 10) add('warn', 'Infraestructura', `Presión de disco de la VPS (${ioPressure.toFixed(1)}%)`, 'El cgroup reporta esperas de entrada/salida; revisar latencia del almacenamiento.');
  }

  // Licensador
  if (lic.status === 'rejected') {
    checks.push({ name: 'Licensador', status: 'fail', detail: String(lic.reason?.message || lic.reason) });
    add('crit', 'Licensador', 'No responde el Licensador', String(lic.reason?.message || lic.reason));
  } else {
    const list = lic.value.licenses ?? [];
    const revoked = list.filter((l) => l.state === 'revoked').length;
    const soon = list.filter((l) => typeof l.expires === 'number' && l.expires > 0 && l.expires - Date.now() < 7 * 86400_000).length;
    const status: CheckResult['status'] = soon ? 'warn' : 'ok';
    checks.push({ name: 'Licensador', status, detail: `${list.length} licencias` });
    if (soon) add('warn', 'Licensador', `${soon} licencia(s) por vencer en 7 días`, 'Cobrá/renová antes del vencimiento.');
    if (revoked) add('info', 'Licensador', `${revoked} licencia(s) revocadas`);
  }

  const order = { crit: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level] || b.at - a.at);
  const result = { checks, alerts, at };
  await recordHealthSnapshot(cfg, result);
  return result;
}

let lastHealthSnapshotAt = 0;
async function recordHealthSnapshot(cfg: PanelConfig, result: { checks: CheckResult[]; alerts: AlertItem[]; at: number }) {
  // Evita registrar el mismo ciclo cuando varias pantallas piden alertas seguidas.
  if (Date.now() - lastHealthSnapshotAt < 60_000) return null;
  try {
    const response = await providerOps<{ newIncidents?: AlertItem[]; recovered?: string[] }>(cfg, 'diagnostics/snapshots', {
      method: 'POST', body: { source: 'Panel de control FS', checks: result.checks, alerts: result.alerts },
    });
    lastHealthSnapshotAt = Date.now();
    const update = { newIncidents: response.newIncidents ?? [], recovered: response.recovered ?? [], alerts: result.alerts, checks: result.checks, at: result.at };
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('panel:health:update', update);
    if (Notification.isSupported() && !mainWindow?.isFocused()) {
      for (const incident of response.newIncidents ?? []) {
        if (incident.level === 'crit') new Notification({ title: `FIT System · ${incident.area}`, body: `${incident.title}${incident.detail ? ` — ${incident.detail}` : ''}` }).show();
      }
      for (const title of response.recovered ?? []) new Notification({ title: 'FIT System · incidencia resuelta', body: title }).show();
    }
    return response;
  } catch {
    // La monitorización local sigue funcionando aunque el historial de nube falle.
    return null;
  }
}

async function healthHistory(cfg: PanelConfig) {
  return providerOps(cfg, 'diagnostics/history?hours=168&limit=5000');
}

/* --- bitácora de acciones del panel (auditoría local) --- */

interface AuditEntry {
  at: number;
  action: string;
  detail: string;
}

function auditFile(): string {
  return path.join(app.getPath('userData'), 'audit.log.json');
}

function audit(action: string, detail: string) {
  try {
    const file = auditFile();
    let items: AuditEntry[] = [];
    try {
      items = JSON.parse(fs.readFileSync(file, 'utf8')) as AuditEntry[];
    } catch {
      items = [];
    }
    items.push({ at: Date.now(), action, detail: String(detail ?? '').slice(0, 400) });
    if (items.length > 500) items = items.slice(-500);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(items, null, 2), { mode: 0o600 });
  } catch {
    /* la auditoría nunca debe tumbar la acción */
  }
}

function auditList(): AuditEntry[] {
  try {
    const items = JSON.parse(fs.readFileSync(auditFile(), 'utf8')) as AuditEntry[];
    return items.slice(-200).reverse();
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Asistente (diagnóstico guiado sobre el VPS)                         */
/* ------------------------------------------------------------------ */

interface AssistantAction {
  id: string;
  title: string;
  why: string;
  command: string;
  level: 'safe' | 'careful';
  keywords: string[];
}

/** Catálogo cerrado: el asistente NUNCA ejecuta un comando arbitrario, sólo estos. */
const ASSISTANT_ACTIONS: AssistantAction[] = [
  {
    id: 'estado',
    title: 'Ver estado general del VPS',
    why: 'Primer paso ante cualquier problema: carga, memoria, disco y contenedores.',
    command: 'uptime; echo ---; free -m; echo ---; df -h /; echo ---; docker ps -a --format "{{.Names}}|{{.Status}}"',
    level: 'safe',
    keywords: ['estado', 'general', 'que pasa', 'revisar', 'diagnostico', 'salud'],
  },
  {
    id: 'disco',
    title: 'Ver uso de disco en detalle',
    why: 'Identifica qué directorio o imagen de Docker está ocupando espacio.',
    command: 'df -h; echo ---; du -sh /var/lib/docker 2>/dev/null; echo ---; docker system df',
    level: 'safe',
    keywords: ['disco', 'espacio', 'almacen', 'lleno', 'lleno', 'df'],
  },
  {
    id: 'limpiar-docker',
    title: 'Liberar espacio (prune de Docker)',
    why: 'Borra imágenes, contenedores y redes sin uso. No toca volúmenes con datos.',
    command: 'docker system prune -f',
    level: 'careful',
    keywords: ['limpiar', 'liberar', 'prune', 'basura', 'espacio'],
  },
  {
    id: 'limpiar-build',
    title: 'Vaciar la caché de builds',
    why: 'Libera el cache de builds de Docker, común causante de disco lleno.',
    command: 'docker builder prune -f',
    level: 'careful',
    keywords: ['cache', 'build', 'compilacion', 'limpiar build'],
  },
  {
    id: 'contenedores',
    title: 'Ver contenedores y estado',
    why: 'Lista todos los servicios y si están levantados o reiniciando.',
    command: 'docker ps -a --format "{{.Names}}|{{.Status}}|{{.Image}}"',
    level: 'safe',
    keywords: ['contenedor', 'servicio', 'caido', 'down', 'reiniciando', 'docker'],
  },
  {
    id: 'logs-api',
    title: 'Ver logs de la API',
    why: 'Muestra las últimas líneas de error del backend de la nube.',
    command: 'docker logs --tail 60 fitsystem-api-1 2>&1',
    level: 'safe',
    keywords: ['log', 'error', 'api', 'backend', 'trace', 'errorres'],
  },
  {
    id: 'logs-db',
    title: 'Revisar PostgreSQL',
    why: 'Comprueba si PostgreSQL acepta conexiones y muestra sus últimos errores.',
    command: 'docker exec fitsystem-db-1 pg_isready 2>&1; echo ---; docker logs --tail 60 fitsystem-db-1 2>&1',
    level: 'safe',
    keywords: ['base de datos', 'postgres', 'postgresql', 'database', 'db', 'pg'],
  },
  {
    id: 'logs-licensador',
    title: 'Revisar Licensador',
    why: 'Muestra el estado y los últimos errores del servicio de licencias.',
    command: 'docker ps -a --filter name=licensador --format "{{.Names}}|{{.Status}}"; echo ---; docker logs --tail 60 fitsystem-licensador-1 2>&1',
    level: 'safe',
    keywords: ['licencia', 'licensador', 'licenser'],
  },
  {
    id: 'logs-socios',
    title: 'Revisar App de socios',
    why: 'Muestra el estado del servicio de socios y los últimos errores de API.',
    command: 'docker ps -a --filter name=socios --format "{{.Names}}|{{.Status}}"; echo ---; docker logs --tail 60 fitsystem-socios-1 2>&1; echo ---; docker logs --tail 40 fitsystem-api-1 2>&1',
    level: 'safe',
    keywords: ['socios', 'portal', 'app de socios', 'pwa'],
  },
  {
    id: 'test-brevo',
    title: 'Probar conexión de Brevo',
    why: 'Vuelve a consultar la cuenta y los remitentes usando la salida de servidor con respaldo local.',
    command: '',
    level: 'safe',
    keywords: ['brevo', 'correo marketing', 'remitente', 'api key'],
  },
  {
    id: 'logs-web',
    title: 'Ver logs del sitio',
    why: 'Últimas líneas del contenedor del sitio (Next.js).',
    command: 'docker logs --tail 60 fitsystem-web-1 2>&1',
    level: 'safe',
    keywords: ['log', 'sitio', 'web', 'landing', 'next'],
  },
  {
    id: 'reiniciar-api',
    title: 'Reiniciar la API',
    why: 'Útil si la nube responde mal o quedó colgada.',
    command: 'docker restart fitsystem-api-1',
    level: 'careful',
    keywords: ['reiniciar api', 'reiniciar backend', 'api caida', 'api caido'],
  },
  {
    id: 'reiniciar-web',
    title: 'Reiniciar el sitio',
    why: 'Reinicia el contenedor del sitio público.',
    command: 'docker restart fitsystem-web-1',
    level: 'careful',
    keywords: ['reiniciar sitio', 'reiniciar web', 'sitio caido'],
  },
  {
    id: 'memoria',
    title: 'Ver qué consume más memoria',
    why: 'Lista procesos ordenados por uso de RAM para detectar fugas.',
    command: 'ps aux --sort=-%mem | head -12',
    level: 'safe',
    keywords: ['memoria', 'ram', 'proceso', 'consumo', 'oom'],
  },
  {
    id: 'swap',
    title: 'Verificar si hay swap',
    why: 'El VPS no tiene swap; verificación rápida para builds que se caen.',
    command: 'swapon --show; echo ---; free -m',
    level: 'safe',
    keywords: ['swap', 'memoria virtual'],
  },
];

function matchActions(text: string, limit = 4): AssistantAction[] {
  const q = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!q) return [];
  const scored = ASSISTANT_ACTIONS.map((a) => {
    let score = 0;
    for (const kw of a.keywords) {
      if (q.includes(kw)) score += kw.split(' ').length + 2;
    }
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    for (const w of words) if (a.title.toLowerCase().includes(w)) score++;
    return { a, score };
  }).filter((s) => s.score > 0);
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((s) => s.a);
}

function suggestedFromAlerts(alerts: AlertItem[]): AssistantAction[] {
  const ids: string[] = [];
  for (const a of alerts) {
    if (a.area === 'Infraestructura') {
      if (/Disco/i.test(a.title)) ids.push('limpiar-docker', 'limpiar-build', 'disco');
      if (/RAM/i.test(a.title)) ids.push('memoria', 'swap');
      if (/contenedor/i.test(a.title)) ids.push('contenedores', 'logs-api');
      if (/Carga/i.test(a.title)) ids.push('estado', 'memoria');
    }
    if (a.area === 'API') ids.push('logs-api', 'reiniciar-api', 'estado');
    if (a.area === 'Sitio') ids.push('logs-web', 'reiniciar-web', 'estado');
    if (a.area === 'Base de datos') ids.push('logs-db');
    if (a.area === 'Licensador') ids.push('logs-licensador');
    if (a.area === 'App de socios' || a.area === 'WhatsApp') ids.push('logs-socios');
    if (a.area === 'Marketing') ids.push('test-brevo');
    if (a.level === 'crit' && !ids.length) ids.push('estado');
  }
  const seen = new Set<string>();
  return ids
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ASSISTANT_ACTIONS.find((a) => a.id === id))
    .filter((a): a is AssistantAction => Boolean(a))
    .slice(0, 4);
}

type AssistantMessage = { role: 'user' | 'assistant'; content: string };

async function openAiAssistantReply(cfg: PanelConfig, question: string, evidence: string, conversation: AssistantMessage[]): Promise<string> {
  if (!cfg.assistant.apiKey) return '';
  const redact = (value: string) => value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo oculto]')
    .replace(/\b(?:\+?54)?[\d ()-]{8,}\b/g, '[teléfono oculto]')
    .replace(/\binst_[a-f0-9]{16,}\b/gi, '[instalación]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [secreto]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s&,;]+/gi, '$1=[secreto]')
    .slice(0, 2500);
  const input = [
    { role: 'developer', content: 'Sos el asistente de soporte interno de FIT System. Respondé en español rioplatense, con conversación natural, preguntas aclaratorias útiles y pasos concretos. Usá solo los hallazgos técnicos provistos; distinguí hechos de hipótesis y decí claramente cuando algo no se pudo comprobar. No inventes estados, resultados ni acciones completadas. Nunca pidas claves, contraseñas, tokens ni datos personales. No ejecutes cambios: solo orientá y ofrece los controles disponibles en el Panel. Para cada intervención, indicá qué evidencia viste y cómo confirmar la recuperación; hacé una sola pregunta aclaratoria a la vez.' },
    ...conversation.slice(-10).map((message) => ({ role: message.role, content: redact(message.content) })),
    { role: 'user', content: `Consulta actual: ${redact(question || 'Analizá el estado actual y preguntame qué problema quiero resolver si falta contexto.') }\n\nEvidencia técnica actual del Panel (fuente de verdad):\n${redact(evidence)}` },
  ];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.assistant.apiKey}` },
    body: JSON.stringify({ model: cfg.assistant.model || 'gpt-6-astra', input, store: false }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI respondió HTTP ${response.status}`);
  const text = String(payload?.output_text || (payload?.output || []).flatMap((item: any) => item.content || []).filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('\n') || '').trim();
  if (!text) throw new Error('El modelo no devolvió texto');
  return text.slice(0, 8000);
}

async function testAssistantConnection(cfg: PanelConfig) {
  if (!cfg.assistant.apiKey) throw new Error('Guardá una clave de API de OpenAI para probar la conexión.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.assistant.apiKey}` },
    body: JSON.stringify({ model: cfg.assistant.model || 'gpt-6-astra', input: [{ role: 'user', content: 'Respondé solo: conexión correcta.' }], max_output_tokens: 24, store: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI respondió HTTP ${response.status}`);
  const reply = String(payload?.output_text || '').trim();
  if (!reply) throw new Error('La conexión respondió, pero el modelo no devolvió texto. Revisá el nombre del modelo.');
  return { ok: true, model: cfg.assistant.model, reply: reply.slice(0, 120) };
}

async function assistantSuggest(cfg: PanelConfig, input: string | { text?: string; organizationId?: string; messages?: AssistantMessage[] }) {
  const text = typeof input === 'string' ? input : String(input?.text || '');
  const requestedOrganizationId = typeof input === 'string' ? '' : String(input?.organizationId || '');
  const conversation = typeof input === 'string' || !Array.isArray(input.messages) ? [] : input.messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-10).map((message) => ({ role: message.role, content: message.content.slice(0, 2500) }));
  const [healthResult, systemsResult, errorsResult, installationsResult, licensesResult] = await Promise.allSettled([
    runAlerts(cfg),
    providerOps<{ clients?: Array<Record<string, any>>; platform?: Array<Record<string, any>> }>(cfg, 'systems'),
    providerOps<{ errors?: Array<Record<string, any>> }>(cfg, 'errors?limit=100'),
    providerOps<{ installations?: Array<Record<string, any>> }>(cfg, 'desktop/installations'),
    licensadorApi<{ licenses?: Array<Record<string, any>> }>(cfg, '/api/licenses'),
  ]);
  const alerts = healthResult.status === 'fulfilled' ? healthResult.value.alerts : [];
  const clients = systemsResult.status === 'fulfilled' ? systemsResult.value.clients || [] : [];
  const platform = systemsResult.status === 'fulfilled' ? systemsResult.value.platform || [] : [];
  const errors = errorsResult.status === 'fulfilled' ? errorsResult.value.errors || [] : [];
  const installations = installationsResult.status === 'fulfilled' ? installationsResult.value.installations || [] : [];
  const licenses = licensesResult.status === 'fulfilled' ? licensesResult.value.licenses || [] : [];
  const normalized = (value: unknown) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const query = normalized(text);
  const selectedClient = clients.find((client) => client.id === requestedOrganizationId)
    || clients.filter((client) => normalized(client.name).length >= 3 && query.includes(normalized(client.name)))
      .sort((a, b) => normalized(b.name).length - normalized(a.name).length)[0];
  const specificCustomerProblem = /cliente|gimnasio|socio|profes|profesor|sistema|licencia|sincron|portal|app/i.test(text);
  const [portalResult] = selectedClient
    ? await Promise.allSettled([providerOps<Record<string, any>>(cfg, `systems/${encodeURIComponent(selectedClient.id)}/portal`)] as const)
    : [null];
  const portal = portalResult?.status === 'fulfilled' ? portalResult.value : null;
  const clientErrors = selectedClient ? (portal?.errors || errors.filter((error) => error.organizationId === selectedClient.id)) : [];
  const installationId = selectedClient?.installationId || selectedClient?.sync?.installationId;
  const heartbeat = installationId ? installations.find((item) => item.installationId === installationId) : null;
  const linkedLicense = licenses.find((license) => license.activations?.some((activation: Record<string, any>) => activation.install_id === installationId))
    || licenses.find((license) => normalized(license.client) === normalized(selectedClient?.name));
  const matchedActions = matchActions(text);
  const suggestions = (() => {
    const candidates = [...matchedActions.filter((action) => !selectedClient || action.id !== 'logs-socios'), ...suggestedFromAlerts(alerts)];
    const seen = new Set<string>();
    const available = candidates.filter((action): action is AssistantAction => Boolean(action));
    return available.filter((action) => !seen.has(action.id) && Boolean(seen.add(action.id)))
      .slice(0, 4).map(({ id, title, why, level }) => ({ id, title, why, level }));
  })();

  const lines: string[] = [];
  if (selectedClient) {
    lines.push(`Diagnóstico de ${selectedClient.name}:`);
    if (selectedClient.isActive === false) lines.push('• La organización figura desactivada en la nube.');
    const syncError = selectedClient.sync?.lastError;
    if (syncError) lines.push(`• Sincronización con error: ${syncError}`);
    else if (selectedClient.sync?.lastPushAt) lines.push(`• Última sincronización confirmada: ${new Date(selectedClient.sync.lastPushAt).toLocaleString('es-AR')}.`);
    else lines.push('• No hay una sincronización confirmada para esta organización.');
    if (heartbeat) {
      lines.push(`• Escritorio ${heartbeat.active ? 'con señal reciente' : 'sin señal en las últimas 24 h'} · versión ${heartbeat.appVersion || 'desconocida'}.`);
      lines.push(heartbeat.cloudSyncConnected ? '• El escritorio informa sincronización con la nube conectada.' : `• El escritorio informa sincronización desconectada${heartbeat.cloudSyncError ? `: ${heartbeat.cloudSyncError}` : '.'}`);
    } else if (installationId) lines.push('• No se recibió latido reciente del escritorio; no puedo confirmar su versión ni estado actual.');
    else lines.push('• Esta organización no está asociada a un ID de instalación de escritorio.');
    if (linkedLicense) {
      const activation = linkedLicense.activations?.find((item: Record<string, any>) => item.install_id === installationId);
      lines.push(`• Licencia ${linkedLicense.state === 'revoked' ? 'revocada' : Number(linkedLicense.expires) < Date.now() ? 'vencida' : 'vigente'} · verificada ${activation?.last_seen_at ? new Date(activation.last_seen_at).toLocaleString('es-AR') : 'sin fecha de contacto registrada'}.`);
    } else lines.push('• No encontré una licencia del Licensador asociada a esta instalación.');
    const moduleRows = (selectedClient.modules || []).map((module: Record<string, any>) => `  – ${module.label}: ${module.detail || (module.active ? 'activo' : 'inactivo')}`).join('\n');
    if (moduleRows) lines.push(`• Estado informado por módulos:\n${moduleRows}`);
    const serviceChecks = healthResult.status === 'fulfilled' ? healthResult.value.checks.filter((check) => /App de socios|Portal de Profes/.test(check.name)) : [];
    if (serviceChecks.length) lines.push(`• Disponibilidad general de los portales (no prueba una cuenta concreta): ${serviceChecks.map((check) => `${check.name}: ${check.status === 'ok' ? 'responde' : check.status === 'skip' ? 'sin comprobar' : 'requiere atención'} (${check.detail})`).join(' · ')}`);
    if (portal?.summary) {
      lines.push(`• Socios: ${portal.summary.active}/${portal.summary.total} cuentas activas; ${portal.summary.neverLoggedIn} nunca inició sesión; ${portal.summary.pushDevices} dispositivos con notificaciones.`);
      lines.push(`• Profes: ${portal.profes?.summary?.activeUsers}/${portal.profes?.summary?.users} usuarios activos; ${portal.profes?.summary?.activeInstructors}/${portal.profes?.summary?.instructors} profesores activos; ${portal.profes?.summary?.activeClasses} clases activas.`);
      if (/socio|portal|app|login|acceso|contrase|notificacion|push/i.test(text)) {
        if (!portal.summary.total) lines.push('• Señal a investigar: este cliente no tiene cuentas de Socios creadas.');
        else if (!portal.summary.active) lines.push('• Señal a investigar: todas las cuentas de Socios están desactivadas.');
        if (portal.summary.neverLoggedIn) lines.push(`• ${portal.summary.neverLoggedIn} cuenta(s) de Socios nunca registraron un inicio de sesión.`);
        if (/notificacion|push/i.test(text) && !portal.summary.pushDevices) lines.push('• No hay dispositivos registrados para notificaciones push en las cuentas de Socios.');
      }
      if (/profe|profesor|clase|instructor/i.test(text)) {
        if (!portal.profes?.summary?.activeUsers) lines.push('• Señal a investigar: no hay usuarios activos del Portal de Profes.');
        if (!portal.profes?.summary?.activeInstructors) lines.push('• Señal a investigar: no hay profesores activos asociados al cliente.');
        if (!portal.profes?.summary?.activeClasses) lines.push('• Señal a investigar: el cliente no tiene clases activas para mostrar en el portal.');
      }
      if (/socio|cuenta|login|ingres|acceso|activar|contrase/i.test(text) && portal.accounts?.length) {
        const matches = portal.accounts.filter((account: Record<string, any>) => {
          const memberName = `${account.member?.firstName || ''} ${account.member?.lastName || ''}`;
          const searchable = [account.email, account.member?.memberCode, memberName].map(normalized).filter(Boolean);
          return searchable.some((value) => value.length >= 3 && query.includes(value));
        }).slice(0, 3);
        if (matches.length) {
          lines.push('• Cuentas que coinciden con el nombre/correo mencionado:');
          for (const account of matches) {
            const memberName = `${account.member?.firstName || ''} ${account.member?.lastName || ''}`.trim();
            const devices = Number(account._count?.pushTokens || 0) + Number(account._count?.webPushSubscriptions || 0);
            lines.push(`  – ${memberName || account.email}: ${account.isActive ? 'activa' : 'desactivada'}${account.activationPending ? ' · activación pendiente' : ''} · último acceso ${account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString('es-AR') : 'nunca'} · ${devices} dispositivo(s) push.`);
          }
        } else if (/cuenta|socio|login|ingres|acceso|activar|contrase/i.test(text)) {
          lines.push('• No pude identificar una cuenta concreta con ese mensaje. Indicá el correo, nombre o código del socio para revisar su estado de acceso.');
        }
      }
      if (/profe|profesor|instructor|cuenta|login|ingres|acceso/i.test(text) && portal.profes?.users?.length) {
        const matches = portal.profes.users.filter((user: Record<string, any>) => {
          const searchable = [user.email, user.name, user.instructor?.name].map(normalized).filter(Boolean);
          return searchable.some((value) => value.length >= 3 && query.includes(value));
        }).slice(0, 3);
        if (matches.length) {
          lines.push('• Usuarios de Profes que coinciden con el nombre/correo mencionado:');
          for (const user of matches) lines.push(`  – ${user.name || user.email}: ${user.isActive ? 'usuario activo' : 'usuario desactivado'}${user.instructor ? ` · profesor ${user.instructor.isActive ? 'activo' : 'desactivado'}` : ' · sin perfil de profesor asociado'} · último acceso ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-AR') : 'nunca'}.`);
        } else if (/profe|profesor|instructor/i.test(text) && /cuenta|login|ingres|acceso/i.test(text)) {
          lines.push('• No pude identificar al usuario de Profes. Indicá su correo o nombre y reviso su acceso y perfil asociado.');
        }
      }
    } else if (portalResult?.status === 'rejected') lines.push(`• No pude abrir el detalle de Socios/Profes: ${portalResult.reason?.message || 'error de consulta'}.`);
    if (clientErrors.length) {
      lines.push(`• Errores registrados de este cliente: ${clientErrors.length}. Los más recientes:`);
      for (const error of clientErrors.slice(0, 3)) lines.push(`  – ${error.createdAt ? new Date(error.createdAt).toLocaleString('es-AR') : 'fecha desconocida'} · HTTP ${error.statusCode || '—'} · ${error.method || ''} ${error.path || ''} · ${error.message}`);
    } else lines.push('• No hay errores reportados por este cliente en el registro consultado; eso no descarta fallas que no llegaron a la API.');
    if (specificCustomerProblem && !/socio|portal|profes|profesor|acceso|cuenta/i.test(text)) lines.push('• Para precisar el incidente, indicá qué función falla y el mensaje exacto que aparece.');
  } else {
    lines.push('Diagnóstico general del Panel FS:');
    if (healthResult.status === 'fulfilled') {
      const badChecks = healthResult.value.checks.filter((check) => check.status === 'fail' || check.status === 'warn');
      const unknownChecks = healthResult.value.checks.filter((check) => check.status === 'skip');
      lines.push(badChecks.length
        ? `• Hallazgos que requieren atención: ${badChecks.map((check) => `${check.name} (${check.detail})`).join(' · ')}`
        : '• No encontré fallas o avisos en las comprobaciones ejecutadas.');
      if (unknownChecks.length) lines.push(`• No comprobado: ${unknownChecks.map((check) => check.name).join(', ')}. No lo considero “en orden”.`);
    } else lines.push(`• No pude completar las comprobaciones de salud: ${healthResult.reason?.message || 'error desconocido'}.`);
    lines.push(`• Clientes en nube: ${clients.length}; instalaciones con latido: ${installations.length}; errores consultados: ${errors.length}.`);
    if (specificCustomerProblem && clients.length) lines.push('• Para analizar una incidencia de cliente, elegilo en “Cliente afectado” o mencioná su nombre en el mensaje.');
    if (systemsResult.status === 'rejected') lines.push(`• Inventario de clientes no disponible: ${systemsResult.reason?.message || 'error de consulta'}.`);
  }

  const sourceErrors = [
    systemsResult.status === 'rejected' && 'inventario de clientes',
    errorsResult.status === 'rejected' && 'errores de clientes',
    installationsResult.status === 'rejected' && 'latidos de escritorio',
    licensesResult.status === 'rejected' && 'Licensador',
  ].filter(Boolean);
  if (sourceErrors.length) lines.push(`• Fuentes no disponibles: ${sourceErrors.join(', ')}.`);
  const next = suggestions[0];
  if (next) lines.push(`Siguiente paso sugerido: ${next.why}`);
  else if (selectedClient && !clientErrors.length) lines.push('Siguiente paso: describí la pantalla o función afectada; con estos datos no aparece una falla reportada que identifique la causa.');
  const workflow = (() => {
    if (!selectedClient) return null;
    if (/licencia|activaci[oó]n|vencid/i.test(text)) return { title: 'Revisar licencia', steps: [linkedLicense ? `Estado observado: ${linkedLicense.state || 'sin estado'}; revisá vencimiento y asientos en Licencias.` : 'No se encontró una licencia asociada; buscá el cliente en Licencias y confirmá el ID de instalación.', heartbeat ? `Última validación del equipo: ${heartbeat.lastSeenAt ? new Date(heartbeat.lastSeenAt).toLocaleString('es-AR') : 'sin fecha'}; versión ${heartbeat.appVersion || 'desconocida'}.` : 'No hay latido reciente para confirmar la validación del equipo.', 'Pedile al cliente que reinicie FIT System y compruebe el acceso; después volvé a consultar para confirmar una señal nueva.'] };
    if (/sincron|nube|datos no aparecen|no actualiza/i.test(text)) return { title: 'Recuperar sincronización', steps: [selectedClient.sync?.lastPushAt ? `Último envío confirmado: ${new Date(selectedClient.sync.lastPushAt).toLocaleString('es-AR')}.` : 'No hay confirmación de envío; tratá el estado como no comprobado.', heartbeat?.cloudSyncError ? `Hallazgo del equipo: ${heartbeat.cloudSyncError}` : `Conectividad informada por escritorio: ${heartbeat?.cloudSyncConnected ? 'conectada' : 'sin confirmación reciente'}.`, 'Si el equipo está en línea, ejecutá “Reintentar sincronización” en Sistemas; esperá su próxima señal y actualizá el diagnóstico.', 'Comprobá que el cliente y sus datos recientes aparezcan en Sistemas activos y que no haya errores nuevos.'], syncInstallationId: installationId || null };
    if (/profe|profesor|instructor|clase/i.test(text)) return { title: 'Revisar Portal de Profes', steps: [portal?.profes?.summary ? `${portal.profes.summary.activeUsers}/${portal.profes.summary.users} usuarios y ${portal.profes.summary.activeInstructors}/${portal.profes.summary.instructors} profesores activos.` : 'No se pudo comprobar el inventario de Profes; volvé a cargar Sistemas activos.', 'Confirmá que la cuenta esté activa y vinculada al perfil del profesor correcto.', 'Revisá que el profesor tenga clases activas asignadas y que pueda entrar al portal.', 'Tras cualquier cambio, pedí al profesor que vuelva a entrar y actualizá el diagnóstico para revisar errores recientes.'] };
    if (/socio|app|portal|acceso|cuenta|login|contrase/i.test(text)) return { title: 'Revisar acceso de Socios', steps: [portal?.summary ? `${portal.summary.active}/${portal.summary.total} cuentas activas; ${portal.summary.neverLoggedIn} nunca inició sesión.` : 'No se pudo comprobar el inventario de Socios; volvé a cargar Sistemas activos.', 'Identificá la cuenta exacta por correo, nombre o código; confirmá que esté activa y vinculada al socio correcto.', 'Probá el acceso en el mismo dispositivo del socio y anotá el mensaje exacto; restablecé la clave solo si confirma un error de credenciales.', 'Después del cambio, pedile que vuelva a iniciar sesión y actualizá el diagnóstico para confirmar el último acceso o detectar errores nuevos.'] };
    return { title: 'Aislar el problema informado', steps: ['Confirmá el cliente y el módulo afectado (escritorio, Socios o Profes).', 'Registrá pantalla, hora, usuario afectado y texto exacto del error en el caso de soporte.', 'Revisá la telemetría reciente del cliente y ejecutá solo la comprobación correspondiente al módulo.', 'Aplicá un cambio a la vez y volvé a consultar para confirmar si desapareció el síntoma.'] };
  })();
  const sensitiveNames = [
    selectedClient?.name,
    ...(portal?.accounts || []).flatMap((account: Record<string, any>) => [account.email, `${account.member?.firstName || ''} ${account.member?.lastName || ''}`.trim()]),
    ...(portal?.profes?.users || []).flatMap((user: Record<string, any>) => [user.email, user.name, user.instructor?.name]),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length >= 3).sort((a, b) => b.length - a.length);
  const scrubKnownClientData = (value: string) => {
    let safeValue = value;
    for (const privateValue of new Set(sensitiveNames)) safeValue = safeValue.replace(new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[dato del cliente]');
    return safeValue;
  };
  const evidence = scrubKnownClientData([...lines, workflow ? `Procedimiento recomendado: ${workflow.title}\n${workflow.steps.join('\n')}` : ''].join('\n'));
  const aiConversation = conversation.map((message) => ({ ...message, content: scrubKnownClientData(message.content) }));
  let aiReply = '';
  let aiError: string | null = null;
  try { aiReply = await openAiAssistantReply(cfg, scrubKnownClientData(text), evidence, aiConversation); }
  catch (error) { aiError = (error as Error).message.slice(0, 300); }
  const fallbackReply = lines.join('\n');
  const reply = aiReply || `${fallbackReply}${aiError ? `\n\nNo pude consultar la IA (${aiError}); te dejo el diagnóstico basado en los datos disponibles.` : ''}`;
  return { reply, suggestions, alerts, workflow, aiConfigured: Boolean(cfg.assistant.apiKey), aiUsed: Boolean(aiReply), client: selectedClient ? { id: selectedClient.id, name: selectedClient.name, installationId: installationId || null } : null, evidenceAt: new Date().toISOString() };
}

async function assistantRun(cfg: PanelConfig, id: string) {
  const action = ASSISTANT_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error('Acción desconocida');
  if (action.id === 'test-brevo') {
    const result = await brevoCheck(cfg);
    audit('diagnostico.brevo', `conexión comprobada por ${result.egressMode || 'Brevo'}`);
    return { action: action.title, command: 'Consulta de cuenta y remitentes', level: action.level, output: JSON.stringify(result, null, 2) };
  }
  const output = await sshExec(cfg, action.command, 30000);
  audit('asistente.ejecutado', `${action.id} (${action.level})`);
  return { action: action.title, command: action.command, level: action.level, output: output.slice(0, 20000) };
}

function assistantCatalog() {
  return ASSISTANT_ACTIONS.map((a) => ({ id: a.id, title: a.title, why: a.why, level: a.level }));
}

/* ------------------------------------------------------------------ */
/* Ventana                                                             */
/* ------------------------------------------------------------------ */

let mainWindow: BrowserWindow | null = null;
let panelTray: Tray | null = null;
let isQuitting = false;

function loginItemArgs() {
  return app.isPackaged ? ['--fit-panel-start-minimized'] : [`"${path.resolve(dirname, '..')}"`, '--fit-panel-start-minimized'];
}

function showPanel() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (panelTray) return;
  const iconPath = path.join(dirname, '..', 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  panelTray = new Tray(iconPath);
  panelTray.setToolTip('FIT System · diagnóstico activo');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Panel FS', click: showPanel },
    { label: 'Ejecutar diagnóstico ahora', click: () => void runAlerts(readConfig()) },
    { type: 'separator' },
    { label: 'Salir y detener monitoreo', click: () => app.quit() },
  ]);
  panelTray.setContextMenu(menu);
  panelTray.on('click', showPanel);
  panelTray.on('double-click', showPanel);
}

function createWindow() {
  const iconPath = path.join(dirname, '..', 'assets', 'icon.png');
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1120',
    title: 'Panel de control FS',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.removeMenu();
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--fit-panel-start-minimized')) win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (params.src !== 'https://web.whatsapp.com/') {
      event.preventDefault();
      return;
    }
    // WhatsApp Web rejects Electron's default product token and embedded Chromium
    // version. Keep the embedded session on the current Chrome user agent.
    params.useragent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.preload = undefined;
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL() && !url.startsWith('https://web.whatsapp.com/')) event.preventDefault();
  });
  win.loadFile(path.join(dirname, '..', 'renderer', 'index.html'));
  return win;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || String(err) };
    }
  });
}

function registerIpc() {
  handle('panel:config:get', () => publicConfig(readConfig()));

  handle('panel:config:save', (patch: Partial<PanelConfig>) => {
    const cfg = readConfig();
    if (patch.vps) Object.assign(cfg.vps, patch.vps);
    if (patch.licensador) Object.assign(cfg.licensador, patch.licensador);
    if (patch.api) {
      const { providerToken, ...rest } = patch.api;
      Object.assign(cfg.api, rest);
      if (providerToken) cfg.api.providerToken = providerToken;
    }
    if (patch.brevo) Object.assign(cfg.brevo, patch.brevo);
    if (patch.site) Object.assign(cfg.site, patch.site);
    if (patch.support && typeof patch.support.operatorName === 'string') cfg.support.operatorName = patch.support.operatorName.trim().slice(0, 120);
    if (patch.assistant) {
      if (typeof patch.assistant.model === 'string') {
        const model = patch.assistant.model.trim();
        if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) throw new Error('El modelo indicado no es válido');
        cfg.assistant.model = model;
      }
      if (patch.assistant.apiKey === '__CLEAR__') cfg.assistant.apiKey = '';
      else if (typeof patch.assistant.apiKey === 'string' && patch.assistant.apiKey.trim()) cfg.assistant.apiKey = patch.assistant.apiKey.trim();
    }
    if (patch.mail) {
      if (patch.mail.mode) cfg.mail.mode = patch.mail.mode;
      if (patch.mail.zoho) {
        const z = patch.mail.zoho;
        if (z.region) cfg.mail.zoho.region = zohoRegion(z.region);
        if (Array.isArray(z.accounts)) {
          cfg.mail.zoho.accounts = z.accounts.map((a) => {
            const prev = cfg.mail.zoho.accounts.find((p) => (a.clientId && p.clientId === a.clientId) || (a.email && p.email === a.email));
            return {
              email: a.email ?? prev?.email ?? '',
              clientId: a.clientId ?? prev?.clientId ?? '',
              clientSecret: a.clientSecret || prev?.clientSecret || '',
              refreshToken: a.refreshToken || prev?.refreshToken || '',
            };
          });
        }
      }
      if (Array.isArray(patch.mail.imap)) {
        cfg.mail.imap = patch.mail.imap.map((a) => {
          const prev = cfg.mail.imap.find((p) => p.email === a.email);
          return { ...a, password: a.password || prev?.password || '' };
        });
      }
    }
    writeConfig(cfg);
    tokenCache.clear();
    audit('config.guardada', Object.keys(patch).join(', ') || 'sin cambios');
    return publicConfig(cfg);
  });

  handle('panel:mail:inbox', () => {
    const cfg = readConfig();
    return mailInbox(cfg.mail, 25);
  });

  handle(
    'panel:mail:read',
    (ref: { account: string; accountId?: string; uid: string; folder: string; messageId: string }) => {
      const cfg = readConfig();
      return mailRead(cfg.mail, ref);
    },
  );

  handle('panel:mail:send', async (input: { from: string; to: string; subject: string; text: string }) => {
    const cfg = readConfig();
    const res = await mailSend(cfg.mail, input);
    audit('correo.enviado', `${input.from} → ${input.to} · ${input.subject}`);
    return res;
  });

  handle('panel:mail:delete', async (ref: { account: string; accountId?: string; uid: string; folder: string; messageId: string; subject?: string }) => {
    await mailDelete(readConfig().mail, ref);
    audit('correo.eliminado', `${ref.account} · ${ref.subject ?? ref.messageId}`);
    return { ok: true };
  });

  handle('panel:ops:systems', () => providerOps(readConfig(), 'systems'));
  handle('panel:ops:partner-app', (organizationId: string) => providerOps(readConfig(), `systems/${encodeURIComponent(organizationId)}/portal`));
  handle('panel:ops:portal-reset', (organizationId: string, accountId: string) => providerOps(readConfig(), 'systems/' + encodeURIComponent(organizationId) + '/portal/' + encodeURIComponent(accountId) + '/reset', { method: 'POST', body: {} }));
  handle('panel:ops:portal-toggle', (organizationId: string, accountId: string, active: boolean) => providerOps(readConfig(), 'systems/' + encodeURIComponent(organizationId) + '/portal/' + encodeURIComponent(accountId) + '/toggle', { method: 'POST', body: { active } }));
  handle('panel:ops:desktop-installations', () => providerOps(readConfig(), 'desktop/installations'));
  handle('panel:ops:desktop-sync-retry', (installationId: string) => providerOps(readConfig(), `desktop/installations/${encodeURIComponent(installationId)}/sync`, { method: 'POST', body: {} }));
  handle('panel:ops:desktop-diagnostics-request', (installationId: string) => providerOps(readConfig(), `desktop/installations/${encodeURIComponent(installationId)}/diagnostics`, { method: 'POST', body: {} }));
  handle('panel:ops:desktop-diagnostics-get', (installationId: string) => providerOps(readConfig(), `desktop/installations/${encodeURIComponent(installationId)}/diagnostics`));
  handle('panel:ops:releases', () => githubReleaseOverview());
  handle('panel:ops:client-telemetry', (organizationId: string) => providerOps(readConfig(), `clients/${encodeURIComponent(organizationId)}/telemetry`));
  handle('panel:support:cases:list', () => providerOps(readConfig(), 'support/cases?limit=200'));
  handle('panel:support:cases:create', (input: Record<string, unknown>) => providerOps(readConfig(), 'support/cases', { method: 'POST', body: { ...input, actor: readConfig().support.operatorName || 'Equipo de soporte' } }));
  handle('panel:support:cases:update', (id: string, input: Record<string, unknown>) => providerOps(readConfig(), `support/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...input, actor: readConfig().support.operatorName || 'Equipo de soporte' } }));
  handle('panel:support:diagnostics:import', async () => {
    const selected = await dialog.showOpenDialog({ title: 'Elegir paquete de diagnóstico de FIT System', properties: ['openFile'], filters: [{ name: 'Informe FIT System', extensions: ['json'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const filePath = selected.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 100_000) throw new Error('El archivo de diagnóstico supera 100 KB.');
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (report.reportType !== 'FIT_SYSTEM_DIAGNOSTICS' || Number(report.schemaVersion) !== 1) throw new Error('El archivo no es un paquete FIT System compatible.');
    if (typeof report.installationId !== 'string' || !/^inst_[a-f0-9]{32}$/i.test(report.installationId)) throw new Error('El paquete no incluye un ID de instalación válido.');
    return report;
  });
  handle('panel:support:notify', (message: string) => {
    const body = String(message || '').slice(0, 400);
    if (body && Notification.isSupported() && !mainWindow?.isFocused()) {
      new Notification({ title: 'FIT System · caso requiere atención', body }).show();
    }
    return { shown: Boolean(body && Notification.isSupported() && !mainWindow?.isFocused()) };
  });
  handle('panel:ops:downloads', (days = 90) => providerOps(readConfig(), `downloads?days=${encodeURIComponent(String(days))}`));
  handle('panel:ops:enrich-downloads', (limit = 100) => providerOps(readConfig(), 'downloads/enrich', { method: 'POST', body: { limit } }));
  handle('panel:ops:errors', () => providerOps(readConfig(), 'errors'));
  handle('panel:invoice:config', () => providerOps(readConfig(), 'invoice-config'));
  handle('panel:invoice:save-config', (input: unknown) => providerOps(readConfig(), 'invoice-config', { method: 'PUT', body: input }));
  handle('panel:invoice:test', () => providerOps(readConfig(), 'invoice-config/test', { method: 'POST', body: {} }));
  handle('panel:invoice:list', () => providerOps(readConfig(), 'invoices'));
  handle('panel:invoice:issue-pending', () => providerOps(readConfig(), 'invoices/pending', { method: 'POST', body: { limit: 25 } }));
  handle('panel:invoice:email', (id: string) => providerOps(readConfig(), `invoices/${encodeURIComponent(id)}/email`, { method: 'POST', body: {} }));

  handle(
    'panel:mail:zoho:exchange',
    async (payload: { email?: string; clientId: string; clientSecret: string; code: string; region?: string }) => {
      const cfg = readConfig();
      const region = zohoRegion(payload.region || cfg.mail.zoho.region);
      const res = await zohoExchangeCode(region, payload.clientId, payload.clientSecret, payload.code);
      if (!res.refreshToken) throw new Error('Zoho: no devolvió refresh token');
      let account = cfg.mail.zoho.accounts.find((a) => a.clientId === payload.clientId);
      if (!account) {
        account = { email: '', clientId: payload.clientId, clientSecret: '', refreshToken: '' };
        cfg.mail.zoho.accounts.push(account);
      }
      if (payload.email) account.email = payload.email;
      account.clientSecret = payload.clientSecret || account.clientSecret;
      account.refreshToken = res.refreshToken;
      cfg.mail.zoho.region = region;
      writeConfig(cfg);
      audit('zoho.autorizado', account.email || payload.clientId);
      return { ok: true, email: account.email, hasRefreshToken: true };
    },
  );

  handle('panel:licensador:overview', async () => {
    const cfg = readConfig();
    const [licenses, stats] = await Promise.all([
      licensadorApi<{ licenses: unknown[] }>(cfg, '/api/licenses'),
      licensadorApi<{ stats: unknown }>(cfg, '/api/licenses/stats'),
    ]);
    return { licenses: licenses.licenses ?? [], stats: stats.stats ?? {}, url: cfg.licensador.url };
  });

  handle('panel:licensador:revoke', async (payload: { key: string; installId?: string }) => {
    const cfg = readConfig();
    const res = await licensadorApi(cfg, '/api/license/revoke', { method: 'POST', body: payload });
    audit('licencia.revocada', `${payload.key}${payload.installId ? ' · ' + payload.installId : ''}`);
    return res;
  });

  handle('panel:licensador:unrevoke', async (payload: { key: string }) => {
    const cfg = readConfig();
    const res = await licensadorApi(cfg, '/api/license/unrevoke', { method: 'POST', body: payload });
    audit('licencia.reactivada', payload.key);
    return res;
  });

  handle('panel:alerts:run', () => runAlerts(readConfig()));
  handle('panel:health:history', () => healthHistory(readConfig()));
  handle('panel:audit:list', () => auditList());

  handle('panel:assistant:catalog', () => assistantCatalog());
  handle('panel:assistant:test', () => testAssistantConnection(readConfig()));
  handle('panel:assistant:suggest', (input: string | { text?: string; organizationId?: string; messages?: AssistantMessage[] }) => assistantSuggest(readConfig(), input ?? ''));
  handle('panel:assistant:run', (id: string) => assistantRun(readConfig(), String(id ?? '')));

  handle('panel:brevo:check', () => brevoCheck(readConfig()));
  handle('panel:marketing:overview', () => marketingOverview(readConfig()));
  handle('panel:marketing:contacts', (params: { listId?: number; limit?: number; offset?: number }) =>
    marketingContacts(readConfig(), params ?? {}),
  );
  handle('panel:marketing:add-contact', (input: { email: string; listId?: number }) => marketingAddContact(readConfig(), input));
  handle('panel:marketing:create-list', (input: { name: string; folderId?: number }) => marketingCreateList(readConfig(), input));
  handle('panel:marketing:send-campaign', (id: number) => marketingSendCampaign(readConfig(), Number(id)));

  handle('panel:crm:leads', () => crmLeads(readConfig()));
  handle(
    'panel:crm:update',
    async (payload: { id: string; stage?: string; notes?: string }) => {
      const cfg = readConfig();
      const res = await crmUpdateLead(cfg, payload.id, { stage: payload.stage, notes: payload.notes });
      audit('crm.lead.actualizado', `${payload.stage ?? 'notas'} ${payload.id}`);
      return res;
    },
  );
  handle(
    'panel:crm:create',
    async (payload: { name: string; email: string; phone?: string; gymName?: string; message?: string; stage?: string }) => {
      const cfg = readConfig();
      const res = await crmCreateLead(cfg, payload);
      audit('crm.lead.alta', `${payload.name} <${payload.email}>`);
      return res;
    },
  );

  handle('panel:metrics:summary', (days: number) => metricsSummary(readConfig(), Number(days) || 30));
  handle('panel:clients:list', () => clientsList(readConfig()));

  handle('panel:subscriptions:list', (status?: string) => subscriptionsList(readConfig(), status));
  handle('panel:subscriptions:cancel', async (externalRef: string) => {
    const res = await subscriptionsCancel(readConfig(), externalRef);
    audit('suscripcion.baja', externalRef);
    return res;
  });
  handle('panel:subscriptions:reactivate', async (externalRef: string) => {
    const res = await subscriptionsReactivate(readConfig(), externalRef);
    audit('suscripcion.reactivar', externalRef);
    return res;
  });
  handle('panel:subscriptions:period', async (payload: { externalRef: string; period: 'MONTHLY' | 'ANNUAL' }) => {
    const res = await subscriptionsChangePeriod(readConfig(), payload.externalRef, payload.period);
    audit('suscripcion.periodo', `${payload.externalRef} → ${payload.period}`);
    return res;
  });

  handle('panel:site:load', () => {
    const repoRoot = findRepoRoot(dirname);
    const file = contentFile(repoRoot);
    return { repoRoot, file, exists: fs.existsSync(file), content: loadContent(repoRoot) };
  });

  handle('panel:site:save', (content: SiteContent) => {
    const repoRoot = findRepoRoot(dirname);
    const errors = validateContent(content);
    if (errors.length) throw new Error(errors.join(' · '));
    saveContent(repoRoot, content);
    audit('sitio.guardado', path.relative(repoRoot, contentFile(repoRoot)));
    return { repoRoot, file: contentFile(repoRoot) };
  });

  handle('panel:site:publish', async (content: SiteContent) => {
    const repoRoot = findRepoRoot(dirname);
    const errors = validateContent(content);
    if (errors.length) throw new Error(errors.join(' · '));
    const res = await publishContent(repoRoot, content, `content: actualizar landing (${new Date().toISOString().slice(0, 10)})`);
    audit('sitio.publicado', res.committed || 'sin cambios');
    return res;
  });
  handle('panel:api:health', () => apiHealth(readConfig()));
  handle('panel:api:database-health', () => providerOps(readConfig(), 'diagnostics/database'));
  handle('panel:vps:metrics', () => vpsMetrics(readConfig()));
  handle('panel:ip:analyze', (ip: string) => ipAnalyze(readConfig(), ip));
}

app.whenReady().then(() => {
  registerIpc();
  createTray();
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true, args: loginItemArgs() });
  }
  mainWindow = createWindow();
  let monitorRunning = false;
  const monitor = async () => {
    if (monitorRunning) return;
    monitorRunning = true;
    try { await runAlerts(readConfig()); } catch { /* el panel reporta fuentes que fallen en pantalla */ }
    finally { monitorRunning = false; }
  };
  setTimeout(() => void monitor(), 12_000);
  setInterval(() => void monitor(), 5 * 60_000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  // El panel se oculta en la bandeja para mantener activo el diagnóstico.
});

app.on('before-quit', () => {
  isQuitting = true;
  panelTray?.destroy();
  panelTray = null;
});
