import { env } from '../env.js';
import { sendEmail, type SendResult } from './email.js';

export interface CredentialsParams {
  memberName: string;
  gymName: string;
  username: string;
  password: string;
}

/** Arma el asunto y cuerpo del email de bienvenida con las credenciales del portal. */
export function credentialsMessage(params: CredentialsParams): { subject: string; text: string } {
  const link = env.SOCIOS_URL;
  const lines = [
    `Hola ${params.memberName},`,
    '',
    `Ya tenes acceso a la app de socios de ${params.gymName}.`,
    '',
    `Usuario: ${params.username}`,
    `Clave: ${params.password}`,
  ];
  if (link) lines.push('', `Ingresa en: ${link}`);
  lines.push('', 'Por seguridad, cambia tu clave despues de ingresar.');
  return { subject: `Tu acceso a la app de ${params.gymName}`, text: lines.join('\n') };
}

export async function sendCredentials(orgId: string, to: string, params: CredentialsParams): Promise<SendResult> {
  const { subject, text } = credentialsMessage(params);
  return sendEmail(orgId, to, subject, text);
}
