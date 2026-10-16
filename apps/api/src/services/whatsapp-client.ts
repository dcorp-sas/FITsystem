import fs from 'node:fs';
import path from 'node:path';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { env } from '../env.js';
import { normalizePhone } from './whatsapp.js';

/**
 * Sesión de WhatsApp vinculada por QR (Baileys). El gimnasio escanea el QR una
 * sola vez; a partir de ahí el sistema envía los mensajes desde el servidor sin
 * abrir WhatsApp Web.
 *
 * La sesión se guarda en disco (WHATSAPP_AUTH_DIR/<orgId>) para sobrevivir
 * reinicios. Si el usuario cierra sesión desde el teléfono, hay que re-vincular.
 */

// Baileys espera un logger estilo pino. Usamos uno silencioso, sin depender de
// que pino esté instalado en el paquete de la API.
type BaileysLogger = NonNullable<Parameters<typeof makeWASocket>[0]['logger']>;
const silentLogger = {
  level: 'silent',
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
  child() {
    return silentLogger;
  },
} as unknown as BaileysLogger;

export type WhatsAppConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WhatsAppSessionInfo {
  status: WhatsAppConnectionStatus;
  qr: string | null;
  linkedNumber: string | null;
  lastError: string | null;
}

interface Session {
  socket: WASocket | null;
  status: WhatsAppConnectionStatus;
  qr: string | null;
  linkedNumber: string | null;
  lastError: string | null;
  starting: boolean;
  stopped: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();

function authDir(orgId: string): string {
  return path.join(env.WHATSAPP_AUTH_DIR, orgId);
}

function hasCreds(orgId: string): boolean {
  return fs.existsSync(path.join(authDir(orgId), 'creds.json'));
}

function getSession(orgId: string): Session {
  let s = sessions.get(orgId);
  if (!s) {
    s = {
      socket: null,
      status: 'disconnected',
      qr: null,
      linkedNumber: null,
      lastError: null,
      starting: false,
      stopped: false,
      reconnectTimer: null,
    };
    sessions.set(orgId, s);
  }
  return s;
}

function clearTimer(s: Session) {
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }
}

/** Extrae el número (sin @s.whatsapp.net) del JID propio del socket. */
function jidToPhone(id: string | undefined | null): string | null {
  if (!id) return null;
  const user = id.split('@')[0] ?? '';
  return user.split(':')[0] || null;
}

function toJid(rawPhone: string): string {
  return `${normalizePhone(rawPhone)}@s.whatsapp.net`;
}

/**
 * Inicia (o reutiliza) la sesión de WhatsApp de una organización.
 * @param force si es true arranca aunque todavía no haya credenciales (para que
 *              Baileys emita el QR de vinculación).
 */
export async function startWhatsAppSession(orgId: string, force = false): Promise<void> {
  const s = getSession(orgId);
  if (s.socket || s.starting) return;
  if (!force && !hasCreds(orgId)) return;

  s.starting = true;
  s.stopped = false;
  clearTimer(s);

  try {
    fs.mkdirSync(authDir(orgId), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir(orgId));

    let version: [number, number, number] | undefined;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      // Sin red para consultar la versión usamos la embebida por Baileys.
    }

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
      browser: Browsers.appropriate('FIT system™'),
      logger: silentLogger,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    s.socket = socket;
    s.status = s.status === 'connected' ? 'connected' : 'connecting';

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        s.qr = qr;
        s.status = 'qr';
      }
      if (connection === 'open') {
        s.status = 'connected';
        s.qr = null;
        s.lastError = null;
        s.linkedNumber = jidToPhone(socket.user?.id);
      }
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        s.socket = null;
        if (loggedOut) {
          s.status = 'disconnected';
          s.qr = null;
          s.linkedNumber = null;
          // La sesión quedó invalidada: descartamos las credenciales.
          fs.rmSync(authDir(orgId), { recursive: true, force: true });
        } else if (!s.stopped) {
          s.status = 'connecting';
          s.lastError = `Reconectando (${statusCode ?? 'sin código'})`;
          clearTimer(s);
          s.reconnectTimer = setTimeout(() => {
            void startWhatsAppSession(orgId, true);
          }, 5000);
        }
      }
    });
  } catch (err) {
    s.lastError = (err as Error).message;
    s.status = 'disconnected';
    s.socket = null;
  } finally {
    s.starting = false;
  }
}

/** Estado actual de la sesión (sin forzar el arranque). */
export function getWhatsAppStatus(orgId: string): WhatsAppSessionInfo {
  const s = getSession(orgId);
  return {
    status: s.status,
    qr: s.qr,
    linkedNumber: s.linkedNumber,
    lastError: s.lastError,
  };
}

/**
 * Devuelve el estado, arrancando la sesión si ya hay credenciales (para que
 * reconecte sola tras reiniciar el servidor).
 */
export async function getWhatsAppStatusEnsuring(orgId: string): Promise<WhatsAppSessionInfo> {
  const s = getSession(orgId);
  if (!s.socket && !s.stopped && hasCreds(orgId)) {
    await startWhatsAppSession(orgId, false);
  }
  return getWhatsAppStatus(orgId);
}

/** Vincula (o re-vincula) el número: arranca la sesión y expone el QR. */
export async function connectWhatsApp(orgId: string): Promise<WhatsAppSessionInfo> {
  await startWhatsAppSession(orgId, true);
  return getWhatsAppStatus(orgId);
}

/** Cierra la sesión vinculada y borra las credenciales guardadas. */
export async function logoutWhatsApp(orgId: string): Promise<WhatsAppSessionInfo> {
  const s = getSession(orgId);
  s.stopped = true;
  clearTimer(s);
  try {
    await s.socket?.logout();
  } catch {
    /* ignore */
  }
  try {
    s.socket?.end(undefined);
  } catch {
    /* ignore */
  }
  s.socket = null;
  s.qr = null;
  s.linkedNumber = null;
  s.status = 'disconnected';
  s.lastError = null;
  fs.rmSync(authDir(orgId), { recursive: true, force: true });
  return getWhatsAppStatus(orgId);
}

export interface WhatsAppLinkedResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * Envía un mensaje de texto usando la sesión vinculada (Baileys).
 * Requiere que la sesión esté conectada.
 */
export async function sendWhatsAppLinked(
  orgId: string,
  phone: string,
  message: string,
): Promise<WhatsAppLinkedResult> {
  const s = ensureSession(orgId);
  if (!s.socket || s.status !== 'connected') {
    return { ok: false, error: 'WhatsApp no está conectado (vinculá el número con el QR)' };
  }
  const jid = toJid(phone);
  if (jid.startsWith('@')) return { ok: false, error: 'Teléfono inválido' };
  try {
    let target = jid;
    try {
      const onWa = await s.socket.onWhatsApp(jid);
      const found = onWa?.find((r) => r.exists);
      if (found?.jid) target = found.jid;
    } catch {
      /* si la consulta falla, intentamos enviar directo */
    }
    const result = await s.socket.sendMessage(target, { text: message });
    return { ok: true, providerId: result?.key?.id ?? undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function ensureSession(orgId: string): Session {
  return getSession(orgId);
}

/** Cierra todas las sesiones (al apagar el servidor). */
export async function shutdownWhatsApp(): Promise<void> {
  for (const [orgId, s] of sessions) {
    s.stopped = true;
    clearTimer(s);
    try {
      s.socket?.end(undefined);
    } catch {
      /* ignore */
    }
    s.socket = null;
    sessions.delete(orgId);
  }
}
