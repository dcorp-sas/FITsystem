import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
const { ImapFlow } = require('imapflow') as any;
const { simpleParser } = require('mailparser') as any;
const nodemailer = require('nodemailer') as any;

export interface ImapAccount {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/** Una cuenta de Zoho (una casilla autorizada). Cada una tiene su propio Client ID/Secret y refresh token. */
export interface ZohoAccount {
  email: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ZohoConfig {
  region: string;
  accounts: ZohoAccount[];
}

export interface MailConfig {
  mode: 'imap' | 'zoho';
  imap: ImapAccount[];
  zoho: ZohoConfig;
}

export const DEFAULT_MAIL: MailConfig = {
  mode: 'imap',
  imap: [],
  zoho: { region: 'com', accounts: [] },
};

export interface MessageSummary {
  account: string;
  accountId?: string;
  uid: string;
  folder: string;
  messageId: string;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  preview: string;
}

export interface MessageDetail extends MessageSummary {
  to: string;
  text: string;
  html: string;
}

export interface ReadRef {
  account: string;
  accountId?: string;
  uid: string;
  folder: string;
  messageId: string;
  subject?: string;
}

export interface SendInput {
  from: string;
  to: string;
  subject: string;
  text: string;
}

const ZOHO_REGIONS = ['com', 'eu', 'in', 'com.au', 'jp', 'ca'];
export function zohoRegion(value: string): string {
  return ZOHO_REGIONS.includes(value) ? value : 'com';
}

function accountsBase(region: string) {
  return `https://accounts.zoho.${zohoRegion(region)}`;
}
function mailBase(region: string) {
  return `https://mail.zoho.${zohoRegion(region)}/api`;
}

/* ------------------------------------------------------------------ */
/* Zoho Mail REST API (OAuth, multi-cuenta)                            */
/* ------------------------------------------------------------------ */

const tokenCache = new Map<string, { token: string; exp: number }>();

/** Intercambia un grant code (Self Client) por refresh_token + access_token. */
export async function zohoExchangeCode(
  region: string,
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(`${accountsBase(region)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code.trim(),
    }),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.error) throw new Error('Zoho: ' + (json?.error || `HTTP ${res.status}`));
  return { refreshToken: String(json.refresh_token ?? ''), accessToken: String(json.access_token ?? '') };
}

async function accessToken(region: string, account: ZohoAccount): Promise<string> {
  if (!account.clientId || !account.clientSecret || !account.refreshToken) {
    throw new Error(`Zoho: falta autorizar la casilla ${account.email || '(sin correo)'}`);
  }
  const key = account.clientId + ':' + account.refreshToken;
  const cached = tokenCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.token;
  const res = await fetch(`${accountsBase(region)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: account.clientId,
      client_secret: account.clientSecret,
      refresh_token: account.refreshToken,
    }),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json?.access_token) {
    throw new Error('Zoho: no se pudo renovar el token (' + String(json?.error || res.status) + ')');
  }
  const token = String(json.access_token);
  tokenCache.set(key, { token, exp: Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000 });
  return token;
}

async function zohoApi<T = any>(
  region: string,
  account: ZohoAccount,
  pathname: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await accessToken(region, account);
  const res = await fetch(`${mailBase(region)}${pathname}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Zoho-oauthtoken ${token}`, 'content-type': 'application/json' },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const apiStatus = (json as any)?.status;
  const apiCode = Number(apiStatus?.code);
  if (!res.ok || (Number.isFinite(apiCode) && apiCode >= 400)) {
    const detail = (json as any)?.data?.moreInfo || apiStatus?.description || (json as any)?.message;
    throw new Error(`Zoho: ${detail || `HTTP ${res.status}`}`);
  }
  return json as T;
}

interface ZohoAccountInfo {
  accountId: string;
  email: string;
}

async function zohoPrimaryAccount(region: string, account: ZohoAccount): Promise<ZohoAccountInfo> {
  const json = await zohoApi<{ data?: any[] }>(region, account, '/accounts');
  const first = (json.data ?? [])[0] ?? {};
  const emailList: Array<{ mailId: string; isPrimary?: boolean }> = Array.isArray(first.emailAddress)
    ? first.emailAddress
    : [{ mailId: String(first.emailAddress ?? account.email), isPrimary: true }];
  const primary = emailList.find((e) => e.isPrimary) ?? emailList[0];
  return { accountId: String(first.accountId ?? ''), email: primary?.mailId || account.email };
}

async function zohoInboxFolderId(region: string, account: ZohoAccount, accountId: string): Promise<string> {
  const json = await zohoApi<{ data?: Array<{ folderId?: string | number; folderName?: string; folderType?: string }> }>(
    region,
    account,
    `/accounts/${encodeURIComponent(accountId)}/folders`,
  );
  const folders = json.data ?? [];
  const inbox = folders.find((folder) => String(folder.folderType ?? '').toLowerCase() === 'inbox')
    ?? folders.find((folder) => String(folder.folderName ?? '').toLowerCase() === 'inbox');
  const id = String(inbox?.folderId ?? '');
  if (!/^\d+$/.test(id)) throw new Error(`Zoho: no se encontró la carpeta Recibidos de ${account.email}`);
  return id;
}

async function zohoInboxAccount(region: string, account: ZohoAccount, limit: number): Promise<MessageSummary[]> {
  const info = await zohoPrimaryAccount(region, account);
  if (!info.accountId) return [];
  const folderId = await zohoInboxFolderId(region, account, info.accountId);
  const json = await zohoApi<{ data?: any[] }>(
    region,
    account,
    `/accounts/${encodeURIComponent(info.accountId)}/messages/view?folderId=${encodeURIComponent(folderId)}&limit=${limit}`,
  );
  return (json.data ?? []).map((m) => ({
    account: info.email || account.email,
    accountId: info.accountId,
    uid: String(m.messageId),
    folder: String(m.folderId ?? folderId),
    messageId: String(m.messageId),
    from: m.fromAddress ?? m.sender ?? '',
    subject: m.subject ?? '(sin asunto)',
    date: m.receivedTime ?? m.sentDateInGMT ?? '',
    seen: m.isUnread === false || Number(m.status ?? '') === 1,
    preview: String(m.summary ?? '').slice(0, 160),
  }));
}

async function zohoReadAccount(region: string, account: ZohoAccount, ref: ReadRef): Promise<MessageDetail> {
  const accountId = ref.accountId || (await zohoPrimaryAccount(region, account)).accountId;
  const json = await zohoApi<{ data?: any }>(region, account, `/accounts/${accountId}/folders/${ref.folder || '0'}/messages/${ref.messageId}/content`);
  const d = json.data ?? {};
  return {
    account: account.email,
    accountId,
    uid: ref.messageId,
    folder: ref.folder,
    messageId: ref.messageId,
    from: d.fromAddress ?? '',
    to: Array.isArray(d.toAddress) ? d.toAddress.join(', ') : (d.toAddress ?? ''),
    subject: d.subject ?? '',
    date: d.receivedTime ?? '',
    seen: true,
    preview: String(d.summary ?? '').slice(0, 160),
    text: String(d.content ?? '').replace(/<[^>]+>/g, ''),
    html: String(d.content ?? ''),
  };
}

async function zohoSendAccount(region: string, account: ZohoAccount, input: SendInput): Promise<void> {
  const info = await zohoPrimaryAccount(region, account);
  if (!info.accountId) throw new Error('Zoho: no hay cuenta disponible para enviar');
  await zohoApi(region, account, `/accounts/${info.accountId}/messages`, {
    method: 'POST',
    body: {
      fromAddress: input.from || info.email,
      toAddress: input.to,
      subject: input.subject,
      content: input.text,
      mailFormat: 'plaintext',
    },
  });
}

/* ------------------------------------------------------------------ */
/* IMAP / SMTP (respaldo)                                              */
/* ------------------------------------------------------------------ */

function imapDefaults(account: Partial<ImapAccount>): ImapAccount {
  return {
    email: account.email ?? '',
    password: account.password ?? '',
    imapHost: account.imapHost || 'imap.zoho.com',
    imapPort: account.imapPort || 993,
    smtpHost: account.smtpHost || 'smtp.zoho.com',
    smtpPort: account.smtpPort || 465,
  };
}

async function imapListOne(account: ImapAccount, limit: number): Promise<MessageSummary[]> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const exists = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
      if (!exists) return [];
      const start = Math.max(1, exists - limit + 1);
      const out: MessageSummary[] = [];
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, internalDate: true })) {
        const env = msg.envelope ?? {};
        const from = (env.from ?? [])[0];
        out.push({
          account: account.email,
          uid: String(msg.uid),
          folder: 'INBOX',
          messageId: String(msg.uid),
          from: from ? `${from.name || ''} <${from.address || ''}>`.trim() : '',
          subject: env.subject ?? '(sin asunto)',
          date: msg.internalDate ? new Date(msg.internalDate).toISOString() : '',
          seen: msg.flags ? msg.flags.has('\\Seen') : false,
          preview: '',
        });
      }
      return out.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function imapReadOne(account: ImapAccount, uid: string): Promise<MessageDetail> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error('Mensaje no encontrado');
      const parsed = await simpleParser(msg.source);
      return {
        account: account.email,
        uid,
        folder: 'INBOX',
        messageId: uid,
        from: parsed.from?.text ?? '',
        to: Array.isArray(parsed.to) ? parsed.to.map((t: any) => t.text).join(', ') : (parsed.to?.text ?? ''),
        subject: parsed.subject ?? '',
        date: parsed.date ? parsed.date.toISOString() : '',
        seen: true,
        preview: String(parsed.text ?? '').slice(0, 160),
        text: parsed.text ?? '',
        html: typeof parsed.html === 'string' ? parsed.html : '',
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Fachada unificada                                                   */
/* ------------------------------------------------------------------ */

export async function mailInbox(cfg: MailConfig, limit = 25): Promise<MessageSummary[]> {
  if (cfg.mode === 'zoho') {
    const accounts = cfg.zoho.accounts.filter((a) => a.refreshToken);
    if (!accounts.length) throw new Error('No hay casillas de Zoho autorizadas');
    const results = await Promise.allSettled(accounts.map((a) => zohoInboxAccount(cfg.zoho.region, a, limit)));
    const out = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (!out.length && results.every((r) => r.status === 'rejected')) {
      throw new Error((results[0] as PromiseRejectedResult).reason?.message || 'No se pudo leer ninguna casilla');
    }
    return out.sort((a, b) => (b.date > a.date ? 1 : -1));
  }
  const accounts = cfg.imap.map(imapDefaults).filter((a) => a.email && a.password);
  if (!accounts.length) throw new Error('No hay casillas configuradas');
  const results = await Promise.allSettled(accounts.map((a) => imapListOne(a, limit)));
  const out = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!out.length && results.some((r) => r.status === 'rejected')) {
    throw new Error('No se pudo conectar con ninguna casilla (revisá las app passwords)');
  }
  return out.sort((a, b) => (b.date > a.date ? 1 : -1));
}

export async function mailRead(cfg: MailConfig, ref: ReadRef): Promise<MessageDetail> {
  if (cfg.mode === 'zoho') {
    const account = cfg.zoho.accounts.find((a) => a.email === ref.account) ?? cfg.zoho.accounts.find((a) => a.refreshToken);
    if (!account) throw new Error('No hay casilla de Zoho autorizada');
    return zohoReadAccount(cfg.zoho.region, account, ref);
  }
  const accounts = cfg.imap.map(imapDefaults).filter((a) => a.email && a.password);
  const account = accounts.find((a) => a.email === ref.account) ?? accounts[0];
  if (!account) throw new Error('No hay casilla configurada');
  return imapReadOne(account, ref.uid);
}

export async function mailSend(cfg: MailConfig, input: SendInput): Promise<void> {
  if (cfg.mode === 'zoho') {
    const account = cfg.zoho.accounts.find((a) => a.email === input.from) ?? cfg.zoho.accounts.find((a) => a.refreshToken);
    if (!account) throw new Error('No hay casilla de Zoho autorizada para enviar');
    return zohoSendAccount(cfg.zoho.region, account, input);
  }
  const accounts = cfg.imap.map(imapDefaults).filter((a) => a.email && a.password);
  const account = accounts.find((a) => a.email === input.from) ?? accounts[0];
  if (!account) throw new Error('No hay casilla configurada para enviar');
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.email, pass: account.password },
  });
  await transport.sendMail({ from: input.from || account.email, to: input.to, subject: input.subject, text: input.text });
}

/** Moves a message to the account's trash folder. */
export async function mailDelete(cfg: MailConfig, ref: ReadRef): Promise<void> {
  if (cfg.mode === 'zoho') {
    const account = cfg.zoho.accounts.find((a) => a.email === ref.account) ?? cfg.zoho.accounts.find((a) => a.refreshToken);
    if (!account) throw new Error('No hay casilla de Zoho autorizada');
    const accountId = ref.accountId || (await zohoPrimaryAccount(cfg.zoho.region, account)).accountId;
    if (!accountId) throw new Error('Zoho: no se pudo identificar la casilla');
    const folderId = ref.folder && /^\d+$/.test(ref.folder)
      ? ref.folder
      : await zohoInboxFolderId(cfg.zoho.region, account, accountId);
    if (!folderId) throw new Error('Zoho: el correo no incluye un identificador válido de carpeta; actualizá la bandeja e intentá de nuevo');
    if (!/^\d+$/.test(ref.messageId)) throw new Error('Zoho: el correo no incluye un identificador válido');
    await zohoApi(
      cfg.zoho.region,
      account,
      `/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(ref.messageId)}?expunge=false`,
      { method: 'DELETE' },
    );
    return;
  }
  const accounts = cfg.imap.map(imapDefaults).filter((a) => a.email && a.password);
  const account = accounts.find((a) => a.email === ref.account);
  if (!account) throw new Error('No hay casilla IMAP configurada');
  const client = new ImapFlow({ host: account.imapHost, port: account.imapPort, secure: true, auth: { user: account.email, pass: account.password }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(ref.folder || 'INBOX');
    try {
      await client.messageDelete(String(ref.uid), { uid: true });
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}
