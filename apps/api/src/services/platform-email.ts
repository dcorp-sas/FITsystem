import nodemailer from 'nodemailer';
import { env } from '../env.js';

/**
 * Correo del SITIO (proveedor), separado del SMTP de cada gimnasio. Se usa para
 * el formulario de contacto de la landing y para el alta de compra con la clave
 * de licencia. Se configura por variables de entorno (PLATFORM_SMTP_*).
 */
export interface PlatformEmailResult {
  ok: boolean;
  error?: string;
}

export function isPlatformEmailConfigured(): boolean {
  return Boolean(env.PLATFORM_SMTP_HOST);
}

export async function sendPlatformEmail(to: string, subject: string, body: string): Promise<PlatformEmailResult> {
  if (!env.PLATFORM_SMTP_HOST) return { ok: false, error: 'SMTP del sitio no configurado' };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  try {
    const port = env.PLATFORM_SMTP_PORT || 587;
    const secure = env.PLATFORM_SMTP_SECURE ? env.PLATFORM_SMTP_SECURE === 'true' : port === 465;
    const transporter = nodemailer.createTransport({
      host: env.PLATFORM_SMTP_HOST,
      port,
      secure,
      auth: env.PLATFORM_SMTP_USER ? { user: env.PLATFORM_SMTP_USER, pass: env.PLATFORM_SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: env.PLATFORM_SMTP_FROM,
      to,
      subject,
      text: body,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
