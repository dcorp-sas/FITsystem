import { prisma } from '../db.js';
import {
  makeWASocket,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON,
  proto,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  ConnectionState,
  WASocket,
} from '@whiskeysockets/baileys';
import { normalizePhone } from './whatsapp.js';

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

// ---------------------------------------------------------------------------
// Persistencia del estado de sesión en la base (no en disco).
//
// El plan free de Render no tiene disco persistente y la instancia se duerme,
// así que guardar las credenciales de Baileys en el filesystem las perdería en
// cada reinicio. Las guardamos en Postgres (tabla whatsapp_auth) por
// organización, con la serialización de BufferJSON de Baileys.
// ---------------------------------------------------------------------------

async function readAuth(orgId: string, key: string): Promise<unknown> {
  const row = await prisma.whatsAppAuth.findUnique({
    where: { organizationId_key: { organizationId: orgId, key } },
  });
  if (!row) return null;
  try {
    return JSON.parse(row.value, BufferJSON.reviver);
  } catch {
    return null;
  }
}

async function writeAuth(orgId: string, key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, BufferJSON.replacer);
  await prisma.whatsAppAuth.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value: serialized },
    update: { value: serialized },
  });
}

async function removeAuth(orgId: string, key: string): Promise<void> {
  await prisma.whatsAppAuth.deleteMany({ where: { organizationId: orgId, key } });
}

/** Borra todas las credenciales guardadas de una organización. */
export async function clearWhatsAppAuth(orgId: string): Promise<void> {
  await prisma.whatsAppAuth.deleteMany({ where: { organizationId: orgId } });
}

async function hasCreds(orgId: string): Promise<boolean> {
  const row = await prisma.whatsAppAuth.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: 'creds' } },
  });
  return Boolean(row);
}

async function useDatabaseAuthState(
  orgId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const creds: AuthenticationCreds =
    ((await readAuth(orgId, 'creds')) as AuthenticationCreds | null) ?? initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data: Record<string, unknown> = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await readAuth(orgId, `${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
            }
            data[id] = value;
          }),
        );
        return data as never;
      },
      set: async (data) => {
        const tasks: Promise<void>[] = [];
        for (const category of Object.keys(data) as (keyof typeof data)[]) {
          const categoryData = data[category];
          if (!categoryData) continue;
          for (const id of Object.keys(categoryData as Record<string, unknown>)) {
            const value = (categoryData as Record<string, unknown>)[id];
            const key = `${String(category)}-${id}`;
            tasks.push(value ? writeAuth(orgId, key, value) : removeAuth(orgId, key));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  return { state, saveCreds: () => writeAuth(orgId, 'creds', creds) };
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
  if (!force && !(await hasCreds(orgId))) return;

  s.starting = true;
  s.stopped = false;
  clearTimer(s);

  try {
    const { state, saveCreds } = await useDatabaseAuthState(orgId);

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
      browser: Browsers.appropriate('FIT system'),
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
          // La sesión quedó invalidada: descartamos las credenciales guardadas.
          void clearWhatsAppAuth(orgId);
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
  if (!s.socket && !s.stopped && (await hasCreds(orgId))) {
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
  await clearWhatsAppAuth(orgId);
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
