import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { prisma } from './db.js';
import { registerAuth } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { ensureSchema } from './lib/schema.js';
import { assertLicenseUsable, assertInstallationUsable } from './services/license.js';

import authRoutes from './routes/auth.js';
import orgRoutes from './routes/org.js';
import branchRoutes from './routes/branches.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import memberRoutes from './routes/members.js';
import planRoutes from './routes/plans.js';
import membershipRoutes from './routes/memberships.js';
import paymentRoutes from './routes/payments.js';
import cashRoutes from './routes/cash.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import attendanceRoutes from './routes/attendance.js';
import classRoutes from './routes/classes.js';
import equipmentRoutes from './routes/equipment.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import integrationRoutes from './routes/integrations.js';
import licenseRoutes from './routes/license.js';
import portalRoutes from './routes/portal.js';
import routineRoutes from './routes/routines.js';
import newsRoutes from './routes/news.js';
import portalAdminRoutes from './routes/portal-admin.js';
import providerRoutes from './routes/provider.js';
import syncRoutes from './routes/sync.js';
import cloudRoutes from './routes/cloud.js';
import systemRoutes from './routes/system.js';
import onboardingRoutes from './routes/onboarding.js';
import contactRoutes from './routes/contact.js';
import billingRoutes from './routes/billing.js';
import leadRoutes from './routes/leads.js';
import metricsRoutes from './routes/metrics.js';
import { runRemindersForAllOrgs } from './services/notifications.js';
import { migrateSecrets } from './services/settings.js';
import { startCloudSyncScheduler } from './services/cloud-sync.js';
import { startSubscriptionEnforcement } from './services/subscriptions.js';
import { shutdownWhatsApp } from './services/whatsapp-client.js';
import { recordError } from './services/observability.js';
import { licensePublicKeyFingerprint } from './services/license.js';
import { startLocalBackupScheduler } from './services/local-backup.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
    },
  });

  const devOrigins =
    env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

  // CORS: lista fija de orígenes configurados + (en modo red local) los orígenes
  // privados de la LAN del gimnasio, para que las terminales encajen con la API
  // del servidor. Nunca se refleja un origen arbitrario: solo redes privadas.
  const allowedOrigins = new Set([...env.WEB_ORIGINS, ...devOrigins]);

  const isPrivateLanOrigin = (origin: string): boolean => {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      const host = url.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
      if (/^10\./.test(host)) return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
      return false;
    } catch {
      return false;
    }
  };

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (env.LAN_MODE && isPrivateLanOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  // Cabeceras de endurecimiento (sin dependencias).
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    if (env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    return payload;
  });

  await registerAuth(app);

  // Enforcement de licencia: en el escritorio es un bloqueo DURO (vence la
  // prueba y no hay licencia => no opera el panel, ni lectura ni escritura). En
  // la nube solo bloquea escrituras. Las rutas de licencia/auth/portal siempre
  // se permiten (activación y app del socio no se bloquean).
  app.addHook('preHandler', async (request, _reply) => {
    const url = request.url.split('?')[0] ?? '';
    if (!url.startsWith('/api/')) return;
    if (
      url.startsWith('/api/contact') ||
      url.startsWith('/api/billing') ||
      url.startsWith('/api/metrics') ||
      url.startsWith('/api/auth') ||
      url.startsWith('/api/license') ||
      url.startsWith('/api/portal') ||
      url.startsWith('/api/sync') ||
      url.startsWith('/api/integrations/mercadopago/webhook') ||
      url.startsWith('/api/provider')
    ) {
      return;
    }

    if (env.LICENSE_INSTALLATION_ID) {
      await assertInstallationUsable();
      return;
    }

    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    const authed = request as { user?: { organizationId?: string } };
    const organizationId = authed.user?.organizationId;
    if (!organizationId) return;
    await assertLicenseUsable(organizationId);
  });

  app.get('/health', async () => ({ status: 'ok', service: 'fitsystem-api', time: new Date().toISOString() }));

  // Huella de la clave pública de licencias configurada. Debe coincidir con la
  // que imprime el Licensador en su arranque; si no, las claves no se verifican.
  app.log.info({ licensePublicKeyFingerprint: licensePublicKeyFingerprint() }, 'license public key fingerprint');

  await app.register(
    async (api) => {
      authRoutes(api);
      orgRoutes(api);
      branchRoutes(api);
      userRoutes(api);
      settingsRoutes(api);
      memberRoutes(api);
      planRoutes(api);
      membershipRoutes(api);
      paymentRoutes(api);
      cashRoutes(api);
      productRoutes(api);
      saleRoutes(api);
      attendanceRoutes(api);
      classRoutes(api);
      equipmentRoutes(api);
      notificationRoutes(api);
      reportRoutes(api);
      integrationRoutes(api);
      licenseRoutes(api);
      portalRoutes(api);
      routineRoutes(api);
      newsRoutes(api);
      portalAdminRoutes(api);
      providerRoutes(api);
      syncRoutes(api);
      cloudRoutes(api);
      systemRoutes(api);
      onboardingRoutes(api);
    contactRoutes(api);
    billingRoutes(api);
    leadRoutes(api);
    metricsRoutes(api);
    },
    { prefix: '/api' },
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: 'Error',
        message: error.message,
        details: error.details,
      });
    }
    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Datos invalidos' });
    }
    app.log.error(error);
    const authed = request as { user?: { id: string; organizationId: string } };
    void recordError({
      organizationId: authed.user?.organizationId ?? null,
      level: 'error',
      message: (error as Error).message || 'Error inesperado',
      stack: (error as Error).stack ?? null,
      path: request.url,
      method: request.method,
      statusCode: 500,
      userId: authed.user?.id ?? null,
    });
    return reply.status(500).send({ error: 'Internal Server Error', message: 'Ocurrio un error inesperado' });
  });

  app.addHook('onClose', async () => {
    await shutdownWhatsApp();
    await prisma.$disconnect();
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    // ensureSchema aplica el SQL de SQLite; en PostgreSQL el esquema lo aplica
    // `prisma db push` (ver db:push:pg / render.yaml).
    if (!env.DATABASE_URL.startsWith('postgres')) {
      await ensureSchema();
    }
    // Cifra en reposo los secretos que aun estuvieran en texto plano (idempotente).
    await migrateSecrets();
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    console.log(`FIT System API escuchando en http://localhost:${env.API_PORT}`);
    startReminderScheduler();
    startCloudSyncScheduler();
    startSubscriptionEnforcement();
    startLocalBackupScheduler();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

/** Recordatorios de cuotas: una corrida al iniciar y luego cada 24 horas. */
function startReminderScheduler() {
  const run = async () => {
    try {
      const created = await runRemindersForAllOrgs(3);
      if (created > 0) console.log(`[api] recordatorios de cuota generados: ${created}`);
    } catch (error) {
      console.error('[api] error en recordatorios', error);
    }
  };
  setTimeout(run, 20000);
  setInterval(run, 24 * 60 * 60 * 1000);
}

const here = fileURLToPath(import.meta.url).replace(/\\/g, '/');
const entry = (process.argv[1] || '').replace(/\\/g, '/');
if (here === entry || entry.endsWith('/src/index.ts')) {
  start();
}