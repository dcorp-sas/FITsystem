import nodemailer from 'nodemailer';
import { env } from '../env.js';

/**
 * Correo del SITIO (proveedor), separado del SMTP de cada gimnasio. Se usa para
 * el formulario de contacto de la landing y para el alta de compra con la clave
 * de licencia.
 *
 * Envío: si PLATFORM_BREVO_API_KEY está definido se usa la API HTTP de Brevo
 * (funciona en el plan free de Render, que bloquea los puertos SMTP 25/465/587,
 * y permite usar un remitente Gmail verificado en Brevo, sin dominio propio).
 * Si no, se cae a SMTP (PLATFORM_SMTP_*) con timeouts para no colgar el request.
 */
export interface PlatformEmailResult {
  ok: boolean;
  error?: string;
}

export function isPlatformEmailConfigured(): boolean {
  return Boolean(env.PLATFORM_BREVO_API_KEY || env.PLATFORM_SMTP_HOST);
}

/** Separa un remitente "Nombre <correo@dominio>" (o solo el correo). */
function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match && match[2]) return { name: match[1] || 'FIT system™', email: match[2].trim() };
  return { name: 'FIT system™', email: raw.trim() };
}

async function sendViaBrevo(to: string, subject: string, body: string): Promise<PlatformEmailResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const sender = parseFrom(env.PLATFORM_SMTP_FROM);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.PLATFORM_BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        textContent: body,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `Brevo HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp(to: string, subject: string, body: string): Promise<PlatformEmailResult> {
  const port = env.PLATFORM_SMTP_PORT || 587;
  const secure = env.PLATFORM_SMTP_SECURE ? env.PLATFORM_SMTP_SECURE === 'true' : port === 465;
  const transporter = nodemailer.createTransport({
    host: env.PLATFORM_SMTP_HOST,
    port,
    secure,
    auth: env.PLATFORM_SMTP_USER ? { user: env.PLATFORM_SMTP_USER, pass: env.PLATFORM_SMTP_PASS } : undefined,
    // Timeouts para que, si el puerto SMTP está bloqueado (p.ej. Render free),
    // el request falle rápido en vez de quedar colgado.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({
    from: env.PLATFORM_SMTP_FROM,
    to,
    subject,
    text: body,
  });
  return { ok: true };
}

export async function sendPlatformEmail(to: string, subject: string, body: string): Promise<PlatformEmailResult> {
  if (!to) return { ok: false, error: 'Sin destinatario' };
  try {
    if (env.PLATFORM_BREVO_API_KEY) return await sendViaBrevo(to, subject, body);
    if (!env.PLATFORM_SMTP_HOST) return { ok: false, error: 'Correo del sitio no configurado' };
    return await sendViaSmtp(to, subject, body);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
