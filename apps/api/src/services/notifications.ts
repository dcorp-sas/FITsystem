import { prisma } from '../db.js';
import { renderTemplate, fullName, startOfDay } from '@fitsystem/utils';
import type { NotificationEvent } from '@fitsystem/types';
import { whatsappLink, sendWhatsAppCloud } from './whatsapp.js';
import { sendWhatsAppLinked } from './whatsapp-client.js';
import { sendEmail } from './email.js';
import { sendPushToMember } from './push.js';

const DEFAULT_SE_VARIANTS: Record<NotificationEvent, string> = {
  WELCOME:
    'Hola {{firstName}}, bienvenido/a a {{gym}}! Tu membresia de {{plan}} esta activa hasta el {{endDate}}. Te esperamos!',
  MEMBERSHIP_EXPIRING:
    'Hola {{firstName}}, tu membresia de {{plan}} vence el {{endDate}}. Renova hoy y no pierdas tu lugar. {{gym}}',
  MEMBERSHIP_EXPIRED:
    'Hola {{firstName}}, tu membresia vencio el {{endDate}}. Volve al gimnasio y renová tu plan: {{gym}}',
  PAYMENT_CONFIRMATION:
    'Hola {{firstName}}, recibimos tu pago de {{amount}} por {{plan}}. Gracias por elegir {{gym}}!',
  RENEWAL_REMINDER:
    'Hola {{firstName}}, tu renovacion de {{plan}} ya esta confirmada con vencimiento {{endDate}}. Nos vemos!',
  DEBT_NOTICE:
    'Hola {{firstName}}, tenes una deuda pendiente de {{amount}} en {{gym}}. Contactanos para regularizar tu situacion.',
  CUSTOM: '{{message}}',
};

type Vars = Record<string, string | number>;

function renderDefault(event: NotificationEvent, vars: Vars): string {
  return renderTemplate(DEFAULT_SE_VARIANTS[event] ?? DEFAULT_SE_VARIANTS.CUSTOM, vars);
}

export interface NotifyResult {
  channel: string;
  status: string;
  provider: string;
  error: string | null;
  toAddress: string | null;
}

/** Registra una notificacion en el sistema y, si hay proveedor, la envia. */
export async function notifyEvent(
  organizationId: string,
  memberId: string | null,
  event: NotificationEvent,
  context: Record<string, string | number | object>,
  options?: { channel?: string; templateId?: string },
): Promise<NotifyResult> {
  try {
    const template = options?.templateId
      ? await prisma.notificationTemplate.findFirst({
          where: { id: options.templateId, organizationId },
        })
      : await prisma.notificationTemplate.findFirst({
          where: {
            organizationId,
            event,
            isActive: true,
            ...(options?.channel ? { channel: options.channel } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });

    const member = memberId ? await prisma.member.findUnique({ where: { id: memberId } }) : null;
    const org = organizationId
      ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
      : null;

    const vars: Vars = {
      ...context,
      gym: org?.name ?? 'el gimnasio',
      firstName: member?.firstName ?? String(context.firstName ?? ''),
      fullName: member ? fullName(member.firstName, member.lastName) : '',
      amount: typeof context.amount === 'number' ? `$${context.amount.toFixed(2)}` : String(context.amount ?? ''),
      endDate:
        context.endDate instanceof Date
          ? context.endDate.toLocaleDateString('es-AR')
          : String(context.endDate ?? ''),
    };

    const channel = options?.channel ?? template?.channel ?? 'WHATSAPP';
    const body = template ? renderTemplate(template.body, vars) : renderDefault(event, vars);
    const subject = template?.subject ? renderTemplate(template.subject, vars) : null;
    const toAddress = channel === 'EMAIL' ? member?.email ?? null : member?.phone ?? null;

    let status = 'SENT';
    let provider = 'SYSTEM';
    let providerId: string | null = null;
    let error: string | null = null;

    if (channel === 'WHATSAPP') {
      if (member?.phone) {
        // 1) Sesión vinculada por QR (Baileys): envía directo desde el sistema.
        const linked = await sendWhatsAppLinked(organizationId, member.phone, body);
        if (linked.ok) {
          provider = 'WHATSAPP_LINKED';
          providerId = linked.providerId ?? null;
          status = 'SENT';
        } else {
          // 2) Fallback: WhatsApp Cloud API (Meta) si está configurada.
          const cloud = await sendWhatsAppCloud(organizationId, member.phone, body);
          if (cloud.ok) {
            provider = 'META_WHATSAPP';
            providerId = cloud.providerId ?? null;
            status = 'SENT';
          } else {
            // 3) Último recurso: dejar el enlace click-to-chat (wa.me) pendiente.
            provider = 'WHATSAPP_LINK';
            providerId = await whatsappLink(organizationId, member.phone, body);
            status = 'PENDING';
            error = linked.error ?? cloud.error ?? null;
          }
        }
      }
    } else if (channel === 'EMAIL') {
      const result = await sendEmail(organizationId, member?.email ?? null, subject, body);
      if (result.ok) {
        provider = 'SMTP';
        status = 'SENT';
      } else {
        provider = 'SYSTEM';
        status = 'PENDING';
        error = result.error ?? null;
      }
    } else if (channel === 'PUSH') {
      const result = await sendPushToMember(organizationId, memberId, subject ?? 'Novedad de tu gimnasio', body);
      if (result.ok) {
        provider = 'EXPO_PUSH';
        providerId = `${result.sent}`;
        status = 'SENT';
      } else {
        provider = 'SYSTEM';
        status = 'PENDING';
        error = result.error ?? null;
      }
    }

    await prisma.notification.create({
      data: {
        organizationId,
        memberId: memberId ?? null,
        templateId: template?.id ?? null,
        channel,
        event,
        toAddress,
        subject,
        body,
        status,
        provider,
        providerId,
        error,
        sentAt: status === 'SENT' ? new Date() : null,
      },
    });

    return { channel, status, provider, error, toAddress };
  } catch (err) {
    // Nunca debe romper el flujo principal
    console.error('error al registrar notificacion', err);
    return {
      channel: options?.channel ?? 'WHATSAPP',
      status: 'FAILED',
      provider: 'SYSTEM',
      error: (err as Error).message,
      toAddress: null,
    };
  }
}

/** Genera recordatorios de cuotas por vencer/vencidas (avisos automaticos internos). */
export async function generateReminders(organizationId: string, days = 3) {
  const now = new Date();
  const rangeEnd = new Date(now.getTime() + days * 86400000);
  const memberships = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE', endDate: { lte: rangeEnd } },
    include: { member: true, plan: true },
  });

  let created = 0;
  for (const m of memberships) {
    const expiring = m.endDate >= now;
    const event: NotificationEvent = expiring ? 'MEMBERSHIP_EXPIRING' : 'MEMBERSHIP_EXPIRED';
    const already = await prisma.notification.findFirst({
      where: { organizationId, memberId: m.memberId, event, createdAt: { gte: startOfDay() } },
    });
    if (already) continue;
    const vars: Vars = {
      memberId: m.memberId,
      plan: m.plan.name,
      endDate: m.endDate.toLocaleDateString('es-AR'),
      amount: m.price - m.discount,
    };
    created++;
    await notifyEvent(organizationId, m.memberId, event, vars);
  }
  return created;
}

/** Ejecuta los recordatorios para todas las organizaciones (usado por el planificador). */
export async function runRemindersForAllOrgs(days = 3): Promise<number> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let total = 0;
  for (const org of orgs) {
    try {
      total += await generateReminders(org.id, days);
    } catch (err) {
      console.error('error al generar recordatorios', org.id, err);
    }
  }
  return total;
}