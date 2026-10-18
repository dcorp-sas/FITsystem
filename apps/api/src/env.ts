import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
config();

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Carpeta de datos persistente del proceso. En el escritorio la base SQLite vive
 * en el userData del usuario; reutilizamos esa misma carpeta para guardar estados
 * que deben sobrevivir reinicios (por ejemplo la sesión de WhatsApp).
 */
function resolveDataDir(): string {
  const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  try {
    if (databaseUrl.startsWith('file:')) {
      const dbPath = databaseUrl.startsWith('file://')
        ? fileURLToPath(databaseUrl)
        : databaseUrl.slice('file:'.length);
      return path.dirname(path.resolve(dbPath));
    }
  } catch {
    /* si el URL no es parseable, caemos al directorio de trabajo */
  }
  return process.cwd();
}

// Secreto para firmar los tokens JWT. En producción es OBLIGATORIO definirlo con
// un valor propio de al menos 32 caracteres; los valores por defecto del repo (de
// desarrollo y del escritorio) se rechazan para evitar sesiones con firma conocida.
const WEAK_JWT_SECRETS = ['fitsystem-dev-secret-change-me', 'fitsystem-desktop-secret-change-me', 'dev-secret', 'secret', 'change-me'];
const JWT_SECRET_INPUT = process.env.JWT_SECRET || '';
if (NODE_ENV === 'production' && (JWT_SECRET_INPUT.length < 32 || WEAK_JWT_SECRETS.includes(JWT_SECRET_INPUT))) {
  throw new Error(
    'JWT_SECRET invalido en produccion: defini una clave propia de al menos 32 caracteres (ver apps/api/.env.example). ' +
      'En Render se genera con generateValue:true; en el escritorio se genera automaticamente por instalacion.',
  );
}

export const env = {
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  JWT_SECRET: JWT_SECRET_INPUT || 'fitsystem-dev-secret-change-me',
  // Clave para cifrar secretos en reposo (Setting.isSecret). Si no se define, se
  // deriva del JWT_SECRET. Definila propia en produccion para poder rotar el JWT
  // sin perder los secretos guardados.
  SETTINGS_ENC_KEY: process.env.SETTINGS_ENC_KEY || '',
  API_PORT: Number(process.env.API_PORT || 3001),
  // Por defecto solo loopback (escritorio). En la nube se define API_HOST=0.0.0.0.
  API_HOST: process.env.API_HOST || '127.0.0.1',
  // Modo red local (escritorio en modo servidor): permite que otras PC de la
  // misma red accedan a la API y al panel. Implica CORS dinámico para orígenes
  // privados y el ingreso sin credenciales queda limitado a la propia máquina.
  LAN_MODE: process.env.LAN_MODE === '1',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
  // Lista de orígenes permitidos por CORS. WEB_ORIGIN admite varios separados por
  // coma (ej. panel web + PWA de socios). Se agregan los orígenes locales de dev.
  WEB_ORIGINS: (process.env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // URL publica de la API (para webhooks de MercadoPago, etc.). Si esta vacia,
  // no se registra notification_url y la confirmacion queda manual.
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  // URL publica de la app de socios (PWA). Se usa como back_urls de MercadoPago
  // para volver a la app despues de pagar. Si esta vacia se omite el retorno.
  SOCIOS_URL: (process.env.SOCIOS_URL || '').replace(/\/+$/, ''),
  LICENSE_SECRET: process.env.LICENSE_SECRET || '',
  LICENSE_TRIAL_DAYS: Number(process.env.LICENSE_TRIAL_DAYS || 15),
  // URL del Licensador (sistema de licencias del proveedor). Si está definida,
  // la activación se hace en línea y se guarda un certificado firmado.
  LICENSE_SERVER: (process.env.LICENSE_SERVER || '').replace(/\/+$/, ''),
  // Clave PÚBLICA Ed25519 del proveedor (base64 de JWK). Va embebida en el
  // producto para verificar las claves/certificados firmados por el Licensador.
  LICENSE_PUBLIC_KEY:
    process.env.LICENSE_PUBLIC_KEY ||
    'eyJjcnYiOiJFZDI1NTE5IiwieCI6IlpIVl9fakt2SUUwUUQ3ZTZiUG5hNjBEVFdhTS1VSnRGVVEwV1hveFFYV2ciLCJrdHkiOiJPS1AifQ==',
  // Clave PRIVADA Ed25519 (solo para emitir desde este proceso; NO va en el
  // producto distribuido, vive en el Licensador). Opcional.
  LICENSE_PRIVATE_KEY: process.env.LICENSE_PRIVATE_KEY || '',
  // Contacto para solicitar el código de licencia (se muestra en la app).
  LICENSE_CONTACT: process.env.LICENSE_CONTACT || 'contacto@fitsystem.com.ar',
  LICENSE_SITE: process.env.LICENSE_SITE || 'https://fitsystem.com.ar',
  // ID de instalación (solo en el producto de escritorio). Cuando está presente,
  // la licencia de la instalación se administra desde Configuración > Licencia.
  LICENSE_INSTALLATION_ID: process.env.LICENSE_INSTALLATION_ID || '',
  // URL de la nube (API del proveedor) a la que se conecta el escritorio para
  // que la app del socio vea los mismos datos. Es fija: la conexión es
  // automática (se aprovisiona la clave de sincronización sola), sin pestaña de
  // configuración en el panel.
  CLOUD_URL: (process.env.CLOUD_URL || 'https://api.fitsystem.com.ar').replace(/\/+$/, ''),
  // Token compartido con el Licensador para respaldar/restaurar su estado en
  // Postgres (su disco es efímero en el plan free). Si está vacío, el respaldo
  // remoto queda deshabilitado.
  PROVIDER_BACKUP_TOKEN: process.env.PROVIDER_BACKUP_TOKEN || '',
  // Carpeta donde se guarda la sesión de WhatsApp (credenciales vinculadas). Por
  // defecto, junto a la base de datos (userData del escritorio). Debe ser
  // persistente: si se borra, hay que volver a escanear el QR.
  WHATSAPP_AUTH_DIR: process.env.WHATSAPP_AUTH_DIR || path.join(resolveDataDir(), 'whatsapp'),

  // ---------------------------------------------------------------------------
  // Notificaciones push de la app del socio (web push con VAPID).
  // Se generan una vez con: npx web-push generate-vapid-keys
  // La clave publica tambien se expone a la PWA para suscribirse.
  // ---------------------------------------------------------------------------
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  // Contacto del emisor (mailto:). Requerido por los servicios de push.
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:contacto@fitsystem.com.ar',

  // ---------------------------------------------------------------------------
  // Tienda del sitio (landing): formulario de contacto y pasarela de pago.
  // Es la cuenta del PROVEEDOR, distinta de la de cada gimnasio.
  // ---------------------------------------------------------------------------
  // Destinatario del formulario de contacto del sitio. Por defecto, el mismo
  // contacto de licencias.
  PLATFORM_CONTACT_TO: process.env.PLATFORM_CONTACT_TO || process.env.LICENSE_CONTACT || 'contacto@fitsystem.com.ar',
  // SMTP propio del sitio para enviar el contacto y el alta de compra. Si
  // PLATFORM_SMTP_HOST está vacío, se cae al SMTP del gimnasio demo/owner o no
  // se envía (según disponibilidad).
  PLATFORM_SMTP_HOST: process.env.PLATFORM_SMTP_HOST || '',
  PLATFORM_SMTP_PORT: Number(process.env.PLATFORM_SMTP_PORT || 587) || 587,
  PLATFORM_SMTP_SECURE: process.env.PLATFORM_SMTP_SECURE || '',
  PLATFORM_SMTP_USER: process.env.PLATFORM_SMTP_USER || '',
  PLATFORM_SMTP_PASS: process.env.PLATFORM_SMTP_PASS || '',
  PLATFORM_SMTP_FROM: process.env.PLATFORM_SMTP_FROM || 'FIT system™ <contacto.fitsystem@gmail.com>',
  // API key de Brevo (envío por HTTP, recomendado en Render free que bloquea
  // los puertos SMTP 25/465/587). Si está definido, tiene prioridad sobre SMTP.
  // El remitente (PLATFORM_SMTP_FROM) debe estar verificado en Brevo.
  PLATFORM_BREVO_API_KEY: process.env.PLATFORM_BREVO_API_KEY || '',
  // Token de MercadoPago de la cuenta del PROVEEDOR (pago embebido del sitio).
  // Sin esto, los botones de compra del sitio no pueden iniciar el pago.
  PLATFORM_MP_ACCESS_TOKEN: process.env.PLATFORM_MP_ACCESS_TOKEN || '',
  // Public Key de la cuenta del proveedor (checkout embebido / Card Payment Brick).
  PLATFORM_MP_PUBLIC_KEY: process.env.PLATFORM_MP_PUBLIC_KEY || '',
  // Secreto del webhook de MercadoPago de la cuenta del proveedor (opcional).
  // Si está definido, el webhook exige firma válida.
  PLATFORM_MP_WEBHOOK_SECRET: process.env.PLATFORM_MP_WEBHOOK_SECRET || '',
  // Credenciales de administrador del Licensador para emitir la clave al aprobarse
  // un pago. Si faltan, la compra queda registrada y se avisa por email.
  LICENSOR_ADMIN_USER: process.env.LICENSOR_ADMIN_USER || 'admin',
  LICENSOR_ADMIN_PASS: process.env.LICENSOR_ADMIN_PASS || '',
};
