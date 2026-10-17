import webpush from 'web-push';
import { prisma } from '../db.js';
import { env } from '../env.js';

export interface PushResult {
  ok: boolean;
  sent: number;
  error?: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
}

interface ExpoTicket {
  status?: string;
  message?: string;
}

let vapidReady = false;

function configureVapid(): boolean {
  if (vapidReady) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  try {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

/** Clave publica VAPID que la PWA usa para suscribirse. Vacia si no esta configurada. */
export function getVapidPublicKey(): string {
  return configureVapid() ? env.VAPID_PUBLIC_KEY : '';
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

async function sendWebPush(
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<number> {
  if (subscriptions.length === 0) return 0;
  if (!configureVapid()) return 0;
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: la suscripcion ya no es valida (navegador la revoco). Se borra.
        if (status === 404 || status === 410) {
          await prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
      }
    }),
  );
  return sent;
}

async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<{ sent: number; error?: string }> {
  if (tokens.length === 0) return { sent: 0 };
  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    sound: 'default',
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return { sent: 0, error: `Expo push HTTP ${res.status}` };
  const body = (await res.json()) as { data?: ExpoTicket[] } | ExpoTicket[];
  const tickets = Array.isArray(body) ? body : body.data ?? [];
  const okCount = tickets.filter((t) => !t.status || t.status === 'ok').length;
  const firstError = tickets.find((t) => t.status === 'error')?.message;
  return { sent: okCount, error: firstError };
}

/**
 * Envia una notificacion push a todos los dispositivos registrados del socio:
 * suscripciones de Web Push (PWA) y tokens de Expo (app nativa).
 */
export async function sendPushToMember(
  organizationId: string,
  memberId: string | null,
  title: string,
  body: string,
): Promise<PushResult> {
  if (!memberId) return { ok: false, sent: 0, error: 'Sin socio' };
  try {
    const account = await prisma.portalAccount.findFirst({
      where: { memberId, organizationId },
      include: { pushTokens: true, webPushSubscriptions: true },
    });
    if (!account) return { ok: false, sent: 0, error: 'El socio no tiene cuenta en la app' };

    const payload: PushPayload = { title, body };
    const webSent = await sendWebPush(
      account.webPushSubscriptions.map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      })),
      payload,
    );

    let expoError: string | undefined;
    let expoSent = 0;
    if (account.pushTokens.length > 0) {
      const expo = await sendExpoPush(account.pushTokens.map((t) => t.token), payload);
      expoSent = expo.sent;
      expoError = expo.error;
    }

    const sent = webSent + expoSent;
    if (sent > 0) return { ok: true, sent };
    const hasDevices = account.pushTokens.length > 0 || account.webPushSubscriptions.length > 0;
    if (!hasDevices) return { ok: false, sent: 0, error: 'Sin dispositivos registrados' };
    return { ok: false, sent: 0, error: expoError ?? 'No se pudo entregar la notificacion' };
  } catch (err) {
    return { ok: false, sent: 0, error: (err as Error).message };
  }
}

/**
 * Envia una notificacion push a TODOS los socios con cuenta activa del gimnasio.
 * Pensado para avisos de contenido nuevo (novedades). Devuelve cuantos avisaron.
 */
export async function broadcastPushToOrg(organizationId: string, title: string, body: string): Promise<number> {
  const accounts = await prisma.portalAccount.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, memberId: true },
  });
  let delivered = 0;
  await Promise.all(
    accounts.map(async (acc) => {
      const res = await sendPushToMember(organizationId, acc.memberId, title, body);
      if (res.ok) delivered++;
    }),
  );
  return delivered;
}
