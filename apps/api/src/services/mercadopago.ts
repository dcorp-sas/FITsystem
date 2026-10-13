import { getRawSetting } from './settings.js';

const MP_API = 'https://api.mercadopago.com';
const TERMINAL_TTL_MS = 60_000;

/**
 * Configuracion de MercadoPago por organizacion (al estilo antojos-caseros):
 * credenciales separadas para Point (POS) y QR, modo simulacion por defecto y
 * un token general de respaldo para no romper instalaciones existentes.
 */
export interface MpConfig {
  dryRun: boolean;
  accessToken: string;
  publicKey: string;
  pointEnabled: boolean;
  point: { accessToken: string; publicKey: string; deviceId: string };
  qr: { accessToken: string; publicKey: string; posId: string; posExternalId: string; fixedEnabled: boolean };
  webhookSecret: string;
  transferAlias: string;
  returnUrl: string;
}

export async function getMpConfig(orgId: string): Promise<MpConfig> {
  const s = (k: string) => getRawSetting(orgId, 'MERCADOPAGO', k);
  const general = (await s('ACCESS_TOKEN')) || '';
  const publicKey = (await s('PUBLIC_KEY')) || '';
  const pointAccessToken = (await s('POINT_ACCESS_TOKEN')) || general;
  const qrAccessToken = (await s('QR_ACCESS_TOKEN')) || general;
  const hasAnyToken = Boolean(general || pointAccessToken || qrAccessToken);
  const requestedReal = (await s('DRY_RUN')) === 'false';
  return {
    // Nunca se opera contra MercadoPago sin credenciales: aunque DRY_RUN=false,
    // sin token se fuerza la simulacion (regla pedida por el usuario).
    dryRun: requestedReal ? !hasAnyToken : true,
    accessToken: general,
    publicKey,
    pointEnabled: (await s('POINT_ENABLED')) === 'true',
    point: {
      accessToken: pointAccessToken,
      publicKey: (await s('POINT_PUBLIC_KEY')) || publicKey,
      deviceId: (await s('POINT_DEVICE_ID')) || '',
    },
    qr: {
      accessToken: qrAccessToken,
      publicKey: (await s('QR_PUBLIC_KEY')) || publicKey,
      posId: (await s('QR_POS_ID')) || '',
      posExternalId: (await s('QR_POS_EXTERNAL_ID')) || '',
      fixedEnabled: (await s('QR_FIXED_ENABLED')) === 'true',
    },
    webhookSecret: (await s('WEBHOOK_SECRET')) || '',
    transferAlias: (await s('TRANSFER_ALIAS')) || '',
    returnUrl: (await s('RETURN_URL')) || '',
  };
}

/** Token preferido para operaciones Point; cae al general. */
export function pointToken(cfg: MpConfig): string {
  return cfg.point.accessToken || cfg.accessToken;
}

/** Token preferido para operaciones QR; cae al general. */
export function qrToken(cfg: MpConfig): string {
  return cfg.qr.accessToken || cfg.accessToken;
}

/** Token "de lectura" para webhooks / consultas de pagos. */
export function anyToken(cfg: MpConfig): string {
  return cfg.accessToken || cfg.point.accessToken || cfg.qr.accessToken;
}

async function mpFetch(token: string, path: string, init?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body) headers['content-type'] = 'application/json';
  const res = await fetch(`${MP_API}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export interface MpPingResult {
  ok: boolean;
  userId?: string;
  nickname?: string;
  siteId?: string;
  terminals?: number;
  error?: string;
}

/** Verifica las credenciales contra la API de MercadoPago (users/me). */
export async function mpPing(cfg: MpConfig, includeTerminals = true): Promise<MpPingResult> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (!token) return { ok: false, error: 'Sin Access Token configurado' };
  try {
    const me = (await mpClient(token, '/users/me')) as { id?: number; nickname?: string; site_id?: string };
    const result: MpPingResult = { ok: true, userId: me?.id != null ? String(me.id) : undefined, nickname: me?.nickname, siteId: me?.site_id };
    if (includeTerminals) {
      try {
        result.terminals = (await getPosTerminals(cfg)).length;
      } catch {
        /* terminales opcional */
      }
    }
    return result;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function mpClient(token: string, path: string): Promise<unknown> {
  return mpFetch(token, path);
}

export interface MpTerminal {
  id?: string;
  pos_id?: number | string;
  store_id?: string;
  external_pos_id?: string;
  operating_mode?: string;
}

let terminalCache = new Map<string, { at: number; data: MpTerminal[] }>();

/** Lista las terminales Point asociadas a la cuenta (con cache de 60s). */
export async function getPosTerminals(cfg: MpConfig, force = false): Promise<MpTerminal[]> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (!token) throw new Error('Sin Access Token configurado');
  const cached = terminalCache.get(token);
  if (!force && cached && Date.now() - cached.at < TERMINAL_TTL_MS) return cached.data;
  const data = (await mpFetch(token, '/terminals/v1/list')) as { data?: { terminals?: MpTerminal[] } };
  const terminals = data?.data?.terminals ?? [];
  terminalCache.set(token, { at: Date.now(), data: terminals });
  return terminals;
}

/** Limpia la cache de terminales (util tras cambiar credenciales). */
export function clearTerminalCache(): void {
  terminalCache = new Map();
}

export interface PointIntentResult {
  id: string | null;
  state: string | null;
  error?: string;
  dryRun?: boolean;
}

/** Crea una intencion de cobro en una terminal Point. */
export async function createPointIntent(
  cfg: MpConfig,
  params: { amount: number; description: string; externalReference: string; deviceId: string; idempotencyKey: string },
): Promise<PointIntentResult> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (cfg.dryRun) return { id: null, state: 'SIMULADO', dryRun: true };
  if (!token || !params.deviceId) return { id: null, state: null, error: 'Sin Access Token o terminal' };
  const data = (await mpFetch(token, `/point/integration-api/devices/${params.deviceId}/payment-intents`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': params.idempotencyKey },
    body: JSON.stringify({
      amount: params.amount,
      description: params.description,
      external_reference: params.externalReference,
    }),
  })) as { id?: string; state?: string };
  return { id: data?.id ?? null, state: data?.state ?? null };
}

export interface PointIntentStatus {
  state: string | null;
  mpStatus: string | null;
  approved: boolean;
}

/** Consulta el estado de una intencion Point. */
export async function getPointIntent(cfg: MpConfig, intentId: string): Promise<PointIntentStatus> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (!token) throw new Error('MercadoPago no configurado');
  const data = (await mpFetch(token, `/point/integration-api/payment-intents/${intentId}`)) as {
    state?: string;
    payment?: { status?: string };
  };
  return {
    state: data?.state ?? null,
    mpStatus: data?.payment?.status ?? null,
    approved: data?.payment?.status === 'approved',
  };
}

/** Cancela una intencion Point pendiente. */
export async function cancelPointIntent(cfg: MpConfig, deviceId: string, intentId: string): Promise<void> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (!token || !deviceId) return;
  await mpFetch(token, `/point/integration-api/devices/${deviceId}/payment-intents/${intentId}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

export interface PointPrintResult {
  ok: boolean;
  dryRun?: boolean;
  error?: string;
}

/**
 * Imprime en la terminal Point de MercadoPago usando su impresora integrada.
 * `content` es texto plano; `deviceId` es el id de terminal (ej. NEWLAND_N950__...).
 * Endpoint: POST /terminals/v1/actions con config.point.subtype = 'custom'.
 */
export async function printOnPoint(
  cfg: MpConfig,
  params: { deviceId: string; content: string; externalReference: string; idempotencyKey: string },
): Promise<PointPrintResult> {
  const token = cfg.point.accessToken || cfg.qr.accessToken || cfg.accessToken;
  if (cfg.dryRun) return { ok: true, dryRun: true };
  if (!token) return { ok: false, error: 'Sin Access Token de MercadoPago' };
  if (!params.deviceId) return { ok: false, error: 'Sin terminal Point configurada' };
  try {
    const data = (await mpFetch(token, '/terminals/v1/actions', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify({
        type: 'print',
        external_reference: params.externalReference,
        config: { point: { terminal_id: params.deviceId, subtype: 'custom' } },
        content: params.content,
      }),
    })) as { error?: string };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
