import nodemailer from 'nodemailer';
import { getRawSetting } from './settings.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Lee la configuracion SMTP de la organizacion (categoria EMAIL). null si no hay host. */
export async function getSmtpConfig(orgId: string): Promise<SmtpConfig | null> {
  const host = await getRawSetting(orgId, 'SMTP', 'SMTP_HOST');
  if (!host) return null;
  const rawPort = await getRawSetting(orgId, 'SMTP', 'SMTP_PORT');
  const port = Number(rawPort || '587') || 587;
  const rawSecure = await getRawSetting(orgId, 'SMTP', 'SMTP_SECURE');
  const user = (await getRawSetting(orgId, 'SMTP', 'SMTP_USER')) || '';
  const pass = (await getRawSetting(orgId, 'SMTP', 'SMTP_PASS')) || '';
  const from =
    (await getRawSetting(orgId, 'SMTP', 'SMTP_FROM')) || user || 'FIT System <no-reply@fitsystem.app>';
  const secure = rawSecure ? rawSecure === 'true' : port === 465;
  return { host, port, secure, user, pass, from };
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Envia un email por SMTP. Devuelve { ok:false, error } si falla o no esta configurado. */
export async function sendEmail(
  orgId: string,
  to: string | null | undefined,
  subject: string | null | undefined,
  body: string,
): Promise<SendResult> {
  if (!to) return { ok: false, error: 'Sin destinatario' };
  const cfg = await getSmtpConfig(orgId);
  if (!cfg) return { ok: false, error: 'SMTP no configurado' };
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject: subject || 'FIT System',
      text: body,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
