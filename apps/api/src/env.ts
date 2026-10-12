import { config } from 'dotenv';
config();

const NODE_ENV = process.env.NODE_ENV || 'development';

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
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  JWT_SECRET: JWT_SECRET_INPUT || 'fitsystem-dev-secret-change-me',
  API_PORT: Number(process.env.API_PORT || 3001),
  API_HOST: process.env.API_HOST || '0.0.0.0',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
  // URL publica de la API (para webhooks de MercadoPago, etc.). Si esta vacia,
  // no se registra notification_url y la confirmacion queda manual.
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  LICENSE_SECRET: process.env.LICENSE_SECRET || '',
  LICENSE_TRIAL_DAYS: Number(process.env.LICENSE_TRIAL_DAYS || 7),
  // URL del Licensador (sistema de licencias del proveedor). Si está definida,
  // la activación se hace en línea y se guarda un certificado firmado.
  LICENSE_SERVER: (process.env.LICENSE_SERVER || '').replace(/\/+$/, ''),
  // Clave PÚBLICA Ed25519 del proveedor (base64 de JWK). Va embebida en el
  // producto para verificar las claves/certificados firmados por el Licensador.
  LICENSE_PUBLIC_KEY:
    process.env.LICENSE_PUBLIC_KEY ||
    'eyJjcnYiOiJFZDI1NTE5IiwieCI6Il9hRExwczc0UU12eTBRdW0yOWJrOTd0QlRvQjlLT216NlRsdkVyT2xmc2MiLCJrdHkiOiJPS1AifQ==',
  // Clave PRIVADA Ed25519 (solo para emitir desde este proceso; NO va en el
  // producto distribuido, vive en el Licensador). Opcional.
  LICENSE_PRIVATE_KEY: process.env.LICENSE_PRIVATE_KEY || '',
  // Contacto para solicitar el código de licencia (se muestra en la app).
  LICENSE_CONTACT: process.env.LICENSE_CONTACT || 'contacto@fitsystem.app',
  LICENSE_SITE: process.env.LICENSE_SITE || 'https://fitsystem.onrender.com',
  // ID de instalación (solo en el producto de escritorio). Cuando está presente,
  // la licencia de la instalación se administra desde Configuración > Licencia.
  LICENSE_INSTALLATION_ID: process.env.LICENSE_INSTALLATION_ID || '',
};
