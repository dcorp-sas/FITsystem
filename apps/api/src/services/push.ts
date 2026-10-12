import { prisma } from '../db.js';

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

/**
 * Envia una notificacion push a todos los dispositivos registrados del socio
 * usando el servicio de push de Expo (https://exp.host). No requiere API key.
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
      include: { pushTokens: true },
    });
    const tokens = account?.pushTokens ?? [];
    if (tokens.length === 0) return { ok: false, sent: 0, error: 'Sin dispositivos registrados' };

    const messages: ExpoMessage[] = tokens.map((t) => ({ to: t.token, title, body, sound: 'default' }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { ok: false, sent: 0, error: `Expo push HTTP ${res.status}` };

    const payload = (await res.json()) as { data?: ExpoTicket[] } | ExpoTicket[];
    const tickets = Array.isArray(payload) ? payload : payload.data ?? [];
    const okCount = tickets.filter((t) => !t.status || t.status === 'ok').length;
    const firstError = tickets.find((t) => t.status === 'error')?.message;
    return { ok: okCount > 0, sent: okCount, error: firstError };
  } catch (err) {
    return { ok: false, sent: 0, error: (err as Error).message };
  }
}
