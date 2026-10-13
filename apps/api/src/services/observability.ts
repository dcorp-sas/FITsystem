import { prisma } from '../db.js';
import { getRawSetting } from './settings.js';

/* ---------------------------------------------------------------------------
 * Observabilidad integrada: errores en la base + alertas por webhook.
 *
 * Cada organización configura (categoria GENERAL):
 *   OBS_WEBHOOK_URL     -> URL del webhook (Slack/Discord/HTTP) para alertas
 *   OBS_ALERTS_ENABLED  -> 'true' para enviar alertas
 *   OBS_MIN_LEVEL       -> 'error' | 'warn' | 'info' (default: error)
 *   OBS_RETENTION_DAYS  -> dias de retencion de logs/actividad (default: 90)
 * ------------------------------------------------------------------------- */

export interface ObservabilityConfig {
  webhookUrl: string;
  alertsEnabled: boolean;
  minLevel: 'error' | 'warn' | 'info';
  retentionDays: number;
}

export async function getObservabilityConfig(orgId: string): Promise<ObservabilityConfig> {
  const webhookUrl = (await getRawSetting(orgId, 'GENERAL', 'OBS_WEBHOOK_URL')) || '';
  const alertsEnabled = (await getRawSetting(orgId, 'GENERAL', 'OBS_ALERTS_ENABLED')) === 'true';
  const minLevel = ((await getRawSetting(orgId, 'GENERAL', 'OBS_MIN_LEVEL')) || 'error') as ObservabilityConfig['minLevel'];
  const retentionDays = Number((await getRawSetting(orgId, 'GENERAL', 'OBS_RETENTION_DAYS')) || '90') || 90;
  return { webhookUrl, alertsEnabled, minLevel, retentionDays };
}

export interface RecordErrorInput {
  organizationId?: string | null;
  level?: 'error' | 'warn' | 'info';
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  context?: unknown;
}

const alertThrottle = new Map<string, number>();
const ALERT_WINDOW_MS = 60_000;

/** Guarda el error en la base y, si corresponde, dispara una alerta por webhook. */
export async function recordError(input: RecordErrorInput): Promise<void> {
  const level = input.level ?? 'error';
  try {
    await prisma.errorLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        level,
        message: input.message.slice(0, 4000),
        stack: input.stack ? input.stack.slice(0, 8000) : null,
        path: input.path ?? null,
        method: input.method ?? null,
        statusCode: input.statusCode ?? null,
        userId: input.userId ?? null,
        context: input.context ? JSON.stringify(input.context).slice(0, 4000) : null,
      },
    });
  } catch (err) {
    console.error('[observability] no se pudo guardar el error', err);
  }

  if (!input.organizationId) return;
  try {
    const cfg = await getObservabilityConfig(input.organizationId);
    if (!cfg.alertsEnabled || !cfg.webhookUrl) return;
    if (levelRank(cfg.minLevel) < levelRank(level)) return;

    const throttleKey = `${input.organizationId}:${level}:${input.message.slice(0, 120)}`;
    const last = alertThrottle.get(throttleKey) ?? 0;
    if (Date.now() - last < ALERT_WINDOW_MS) return;
    alertThrottle.set(throttleKey, Date.now());

    await sendAlert(cfg.webhookUrl, {
      level,
      message: input.message.slice(0, 500),
      path: input.path ?? undefined,
      statusCode: input.statusCode ?? undefined,
    });
  } catch (err) {
    console.error('[observability] no se pudo enviar la alerta', err);
  }
}

export interface AlertContent {
  level: string;
  message: string;
  path?: string;
  statusCode?: number;
}

/** Envía una alerta a un webhook compatible con Slack/Discord/HTTP genérico. */
export async function sendAlert(webhookUrl: string, content: AlertContent): Promise<boolean> {
  const line = `[FIT System][${content.level.toUpperCase()}] ${content.message}${content.path ? ` (${content.path})` : ''}`;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: line,
        content: line,
        level: content.level,
        message: content.message,
        path: content.path,
        statusCode: content.statusCode,
        source: 'fitsystem',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function levelRank(level: string): number {
  return level === 'info' ? 0 : level === 'warn' ? 1 : 2;
}

export interface PruneResult {
  errorLogs: number;
  activityLogs: number;
  notifications: number;
}

/** Elimina datos mas viejos que `retentionDays` (logs de error, actividad y notificaciones). */
export async function pruneOldData(orgId: string, retentionDays: number): Promise<PruneResult> {
  const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86400000);
  const [errorLogs, activityLogs, notifications] = await prisma.$transaction([
    prisma.errorLog.deleteMany({ where: { organizationId: orgId, createdAt: { lt: cutoff } } }),
    prisma.activityLog.deleteMany({ where: { organizationId: orgId, createdAt: { lt: cutoff } } }),
    prisma.notification.deleteMany({
      where: { organizationId: orgId, createdAt: { lt: cutoff }, status: { in: ['SENT', 'FAILED'] } },
    }),
  ]);
  return { errorLogs: errorLogs.count, activityLogs: activityLogs.count, notifications: notifications.count };
}
