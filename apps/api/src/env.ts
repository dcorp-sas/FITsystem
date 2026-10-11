import { config } from 'dotenv';
config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'fitsystem-dev-secret-change-me',
  API_PORT: Number(process.env.API_PORT || 3001),
  API_HOST: process.env.API_HOST || '0.0.0.0',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
  LICENSE_SECRET: process.env.LICENSE_SECRET || 'fitsystem-license-secret-change-me',
  LICENSE_TRIAL_DAYS: Number(process.env.LICENSE_TRIAL_DAYS || 14),
};