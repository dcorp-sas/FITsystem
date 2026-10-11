import { config } from 'dotenv';
config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'fitsystem-dev-secret-change-me',
  API_PORT: Number(process.env.API_PORT || 3001),
  API_HOST: process.env.API_HOST || '0.0.0.0',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
  LICENSE_SECRET: process.env.LICENSE_SECRET || 'fitsystem-license-secret-change-me',
  LICENSE_TRIAL_DAYS: Number(process.env.LICENSE_TRIAL_DAYS || 7),
  // URL del Licensador (sistema de licencias del proveedor). Si está definida,
  // la activación se hace en línea y se guarda un certificado firmado.
  LICENSE_SERVER: (process.env.LICENSE_SERVER || '').replace(/\/+$/, ''),
  // Clave PÚBLICA Ed25519 del Licensador (base64 de JWK). Opcional: permite
  // verificar claves/certificados firmados asimétricamente.
  LICENSE_PUBLIC_KEY: process.env.LICENSE_PUBLIC_KEY || '',
  // Contacto para solicitar el código de licencia (se muestra en la app).
  LICENSE_CONTACT: process.env.LICENSE_CONTACT || 'contacto@fitsystem.app',
  LICENSE_SITE: process.env.LICENSE_SITE || 'https://fitsystem.onrender.com',
};
