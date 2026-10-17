import net from 'node:net';
import { getRawSetting, upsertSettings } from './settings.js';

/**
 * Control de molinete / barrera de acceso.
 *
 * El sistema no conoce un modelo de hardware concreto: al registrar un ingreso
 * válido dispara una apertura configurable. Se soportan dos modos genéricos:
 *
 *  - 'http': hace una request (GET/POST) a la URL del controlador. Sirve para
 *    controladores con API (Shelly, ESP32/ESP8266, Tasmota, relés de red, etc.).
 *  - 'tcp': abre un socket TCP, envía un texto (p. ej. "OPEN\r\n") y lo cierra.
 *    Sirve para controladores por puerto serie→TCP o que escuchan comandos.
 *
 * La config se guarda por organización y, opcionalmente, por sede (una config de
 * sede pisa a la general). Todo falla en silencio: un molinete desconectado
 * nunca debe romper ni demorar el registro del ingreso.
 */
export type TurnstileProtocol = 'http' | 'tcp';

export interface TurnstileConfig {
  enabled: boolean;
  protocol: TurnstileProtocol;
  url?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  host?: string;
  port?: number;
  payload?: string;
  timeoutMs?: number;
  branchId?: string | null;
}

export interface TurnstileOpenResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  detail?: string;
}

const CATEGORY = 'TURNSTILE';

function configKey(branchId?: string | null): string {
  return branchId ? `BRANCH_${branchId}` : 'DEFAULT';
}

export async function getTurnstileConfig(
  orgId: string,
  branchId?: string | null,
): Promise<TurnstileConfig | null> {
  // La config de sede tiene prioridad; si no existe, se usa la general.
  const candidates = branchId ? [configKey(branchId), configKey(null)] : [configKey(null)];
  for (const key of candidates) {
    const raw = await getRawSetting(orgId, CATEGORY, key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as TurnstileConfig;
    } catch {
      /* config corrupta: se ignora */
    }
  }
  return null;
}

export async function saveTurnstileConfig(orgId: string, config: TurnstileConfig): Promise<TurnstileConfig> {
  const key = configKey(config.branchId ?? null);
  await upsertSettings(orgId, CATEGORY, { [key]: JSON.stringify(config) });
  return config;
}

export function turnstileConfigured(config: TurnstileConfig | null): boolean {
  if (!config || !config.enabled) return false;
  if (config.protocol === 'tcp') return Boolean(config.host && config.port);
  return Boolean(config.url);
}

async function openHttp(config: TurnstileConfig, timeoutMs: number): Promise<TurnstileOpenResult> {
  if (!config.url) return { ok: false, reason: 'Sin URL configurada' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const method = config.method ?? 'POST';
    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    let body: string | undefined;
    if (method !== 'GET' && config.body) {
      body = config.body;
      if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
    }
    const res = await fetch(config.url, { method, headers, body, signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

function openTcp(config: TurnstileConfig, timeoutMs: number): Promise<TurnstileOpenResult> {
  return new Promise((resolve) => {
    if (!config.host || !config.port) {
      resolve({ ok: false, reason: 'Sin host/puerto configurado' });
      return;
    }
    const socket = new net.Socket();
    let settled = false;
    const done = (result: TurnstileOpenResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(config.payload || 'OPEN\r\n', () => done({ ok: true }));
    });
    socket.once('timeout', () => done({ ok: false, reason: 'Timeout de conexión' }));
    socket.once('error', (err) => done({ ok: false, reason: err.message }));
    socket.connect(config.port, config.host);
  });
}

/**
 * Dispara la apertura del molinete para una organización/sede. Nunca lanza:
 * devuelve el resultado de la operación (o `skipped` si no hay config activa).
 */
export async function openTurnstile(
  orgId: string,
  branchId?: string | null,
): Promise<TurnstileOpenResult> {
  try {
    const config = await getTurnstileConfig(orgId, branchId);
    if (!turnstileConfigured(config)) {
      return { ok: false, skipped: true, reason: 'Molinete no configurado' };
    }
    const timeoutMs = config!.timeoutMs ?? 1500;
    const result = config!.protocol === 'tcp' ? await openTcp(config!, timeoutMs) : await openHttp(config!, timeoutMs);
    if (!result.ok) console.warn('[turnstile] No se pudo abrir:', result.reason || `HTTP ${result.status}`);
    return result;
  } catch (err) {
    const detail = (err as Error).message;
    console.warn('[turnstile] Error al abrir:', detail);
    return { ok: false, reason: detail };
  }
}
