import { config } from 'dotenv';
config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'fitsystem-dev-secret-change-me',
  API_PORT: Number(process.env.API_PORT || 3001),
  API_HOST: process.env.API_HOST || '0.0.0.0',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
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
};
