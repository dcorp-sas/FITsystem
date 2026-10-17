import { env } from '../env.js';
import { sendWhatsAppCloud } from './whatsapp.js';
import { sendWhatsAppLinked } from './whatsapp-client.js';

export interface CredentialsParams {
  memberName: string;
  gymName: string;
  username: string;
  password: string;
  link?: string | null;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Arma el mensaje de bienvenida con las credenciales del portal. */
export function credentialsMessage(params: CredentialsParams): { subject: string; text: string } {
  const lines = [
    `Hola ${params.memberName},`,
    '',
    `Ya tenes acceso a la app de socios de ${params.gymName}.`,
    '',
    `Usuario: ${params.username}`,
    `Clave: ${params.password}`,
  ];
  if (params.link) lines.push('', `Ingresa en: ${params.link}`);
  else if (env.SOCIOS_URL) lines.push('', `Ingresa en: ${env.SOCIOS_URL}`);
  lines.push('', 'Por seguridad, cambia tu clave despues de ingresar.');
  return { subject: `Tu acceso a la app de ${params.gymName}`, text: lines.join('\n') };
}

/**
 * Envia las credenciales de acceso al portal del socio por WhatsApp.
 * Intenta primero la sesion vinculada por QR (Baileys) y luego la API Cloud
 * de Meta como respaldo. Los correos fueron dados de baja: los avisos al socio
 * van solo por WhatsApp y por notificaciones de la app.
 */
export async function sendCredentials(
  orgId: string,
  phone: string | null | undefined,
  params: CredentialsParams,
): Promise<SendResult> {
  if (!phone) return { ok: false, error: 'El socio no tiene telefono cargado' };
  const { text } = credentialsMessage(params);
  const linked = await sendWhatsAppLinked(orgId, phone, text);
  if (linked.ok) return { ok: true };
  const cloud = await sendWhatsAppCloud(orgId, phone, text);
  if (cloud.ok) return { ok: true };
  return { ok: false, error: linked.error ?? cloud.error ?? 'No se pudo enviar por WhatsApp' };
}
