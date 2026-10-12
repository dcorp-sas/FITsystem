import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { prisma } from './db.js';
import { registerAuth } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { ensureSchema } from './lib/schema.js';

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
import { runRemindersForAllOrgs } from './services/notifications.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
    },
  });

  await app.register(cors, {
    origin: [env.WEB_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  await registerAuth(app);

  app.get('/health', async () => ({ status: 'ok', service: 'fitsystem-api', time: new Date().toISOString() }));

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
    },
    { prefix: '/api' },
  );

  app.setErrorHandler((error, _request, reply) => {
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
    return reply.status(500).send({ error: 'Internal Server Error', message: 'Ocurrio un error inesperado' });
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await ensureSchema();
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    console.log(`FIT System API escuchando en http://localhost:${env.API_PORT}`);
    startReminderScheduler();
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