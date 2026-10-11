import { prisma } from '../db.js';
import { renderTemplate, fullName } from '@fitsystem/utils';
import type { NotificationEvent } from '@fitsystem/types';
import { whatsappLink } from './whatsapp.js';
import { sendEmail } from './email.js';

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

/** Registra una notificacion en el sistema (canal interno, sin APIs externas). */
export async function notifyEvent(
  organizationId: string,
  memberId: string | null,
  event: NotificationEvent,
  context: Record<string, string | number | object>,
): Promise<void> {
  try {
    const template = await prisma.notificationTemplate.findFirst({
      where: { organizationId, event, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const member = memberId ? await prisma.member.findUnique({ where: { id: memberId } }) : null;

    const vars: Vars = {
      ...context,
      gym: 'el gimnasio',
      firstName: member?.firstName ?? String(context.firstName ?? ''),
      fullName: member ? fullName(member.firstName, member.lastName) : '',
      amount: typeof context.amount === 'number' ? `$${context.amount.toFixed(2)}` : String(context.amount ?? ''),
      endDate:
        context.endDate instanceof Date
          ? context.endDate.toLocaleDateString('es-AR')
          : String(context.endDate ?? ''),
    };

    const channel = template?.channel ?? 'WHATSAPP';
    const body = template ? renderTemplate(template.body, vars) : renderDefault(event, vars);
    const subject = template?.subject ? renderTemplate(template.subject, vars) : null;
    const toAddress = channel === 'EMAIL' ? member?.email ?? null : member?.phone ?? null;

    let status = 'SENT';
    let provider = 'SYSTEM';
    let providerId: string | null = null;
    let error: string | null = null;

    if (channel === 'WHATSAPP') {
      // Enlace click-to-chat (wa.me). El envio lo confirma la persona que lo abre.
      if (member?.phone) {
        provider = 'WHATSAPP_LINK';
        providerId = await whatsappLink(organizationId, member.phone, body);
        status = 'PENDING';
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
  } catch (err) {
    // Nunca debe romper el flujo principal
    console.error('error al registrar notificacion', err);
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
    const vars: Vars = {
      memberId: m.memberId,
      plan: m.plan.name,
      endDate: m.endDate.toLocaleDateString('es-AR'),
      amount: m.price - m.discount,
    };
    created++;
    await notifyEvent(organizationId, m.memberId, expiring ? 'MEMBERSHIP_EXPIRING' : 'MEMBERSHIP_EXPIRED', vars);
  }
  return created;
}