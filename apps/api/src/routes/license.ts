import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { licenseActivateSchema, licenseValidateSchema, licenseSeatSchema, orgLicenseActivateSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { logActivity } from '../lib/activity.js';
import { env } from '../env.js';
import { prisma } from '../db.js';
import {
  activateLicense,
  generateLicenseKey,
  licenseInfo,
  parseLicenseKey,
  validateLicense,
  LICENSE_PLANS,
  seatUsage,
  invalidateLicenseGuard,
  type LicensePlanName,
} from '../services/license.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function requireAdminKey(headers: Record<string, unknown>) {
  const provided = headers['x-license-admin'];
  if (typeof provided !== 'string' || !env.LICENSE_SECRET || !safeEqual(provided, env.LICENSE_SECRET)) {
    throw new HttpError(403, 'No autorizado para administrar licencias');
  }
}

// Los endpoints de licencia de instalacion son publicos SOLO en el producto de
// escritorio (API local, con LICENSE_INSTALLATION_ID embebido). En la nube
// requieren el header de administracion para evitar creacion/probe de licencias.
// Debe ser async: Fastify avanza los hooks solo si devuelven una promesa o
// invocan el callback `next` (un hook sincrono que solo retorna deja la request
// colgada indefinidamente).
async function licenseEntry(request: FastifyRequest) {
  if (env.LICENSE_INSTALLATION_ID) return;
  requireAdminKey(request.headers as Record<string, unknown>);
}

// ID de instalación efectivo: el provisto (query/body) o el de la instalación
// embebida por el producto de escritorio.
function resolveInstallationId(value?: string | null): string {
  const id = (value ?? '').trim() || env.LICENSE_INSTALLATION_ID;
  if (!id) throw new HttpError(400, 'Falta installationId');
  return id;
}

function licenseConfigPayload() {
  return {
    trialDays: env.LICENSE_TRIAL_DAYS,
    contact: env.LICENSE_CONTACT,
    site: env.LICENSE_SITE,
    online: Boolean(env.LICENSE_SERVER),
  };
}

export function licenseRoutes(app: FastifyInstance) {
  // Planes disponibles
  app.get('/license/plans', async (_request, reply) => {
    try {
      return ok(reply, {
        plans: Object.entries(LICENSE_PLANS).map(([name, config]) => ({ name, seats: config.seats, days: config.days })),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Estado de la licencia de una instalacion
  app.get('/license/status', { onRequest: [licenseEntry, rateLimit({ max: 60, windowMs: 60 * 60 * 1000, keyPrefix: 'license-status' })] }, async (request, reply) => {
    try {
      const { installationId } = request.query as { installationId?: string };
      const id = resolveInstallationId(installationId);
      const license = await prisma.license.findUnique({ where: { installationId: id } });
      if (!license) {
        return ok(reply, {
          activated: false,
          info: { plan: 'TRIAL', seats: LICENSE_PLANS.TRIAL.seats, status: 'UNACTIVATED', daysLeft: null, isUsable: false, hasKey: false },
        });
      }
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Activar la instalacion con una clave
  app.post('/license/activate', { onRequest: [licenseEntry, rateLimit({ max: 20, windowMs: 60 * 60 * 1000, keyPrefix: 'license-activate' })] }, async (request, reply) => {
    try {
      const input = validate(licenseActivateSchema, request.body);
      const license = await activateLicense(resolveInstallationId(input.installationId), input.licenseKey, input.machineName ?? null);
      invalidateLicenseGuard(license.installationId);
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Validar/refrescar estado (llamado al iniciar el sistema o periodicamente)
  app.post('/license/validate', { onRequest: [licenseEntry, rateLimit({ max: 60, windowMs: 60 * 60 * 1000, keyPrefix: 'license-validate' })] }, async (request, reply) => {
    try {
      const input = validate(licenseValidateSchema, request.body);
      const license = await validateLicense(resolveInstallationId(input.installationId), input.licenseKey ?? null, {
        machineName: input.machineName ?? null,
        firstRunAt: input.firstRunAt ?? null,
      });
      return ok(reply, {
        info: licenseInfo(license),
        config: licenseConfigPayload(),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Uso de asientos de la app movil (requiere sesion de usuario del gym)
  app.get('/license/seats', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const used = await seatUsage(req.user.organizationId);
      return ok(reply, { used });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Ajuste manual de asientos (admin del gym)
  app.post('/license/seats', { onRequest: [app.authenticate, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(licenseSeatSchema, request.body);
      const license = await prisma.license.findUnique({ where: { installationId: input.installationId } });
      if (!license || license.organizationId !== req.user.organizationId) {
        throw new HttpError(404, 'Licencia no encontrada');
      }
      const seats = Math.max(0, license.seats + input.delta);
      const updated = await prisma.license.update({ where: { id: license.id }, data: { seats } });
      await prisma.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: input.delta >= 0 ? 'SEAT_ADDED' : 'SEAT_REMOVED',
          seats: Math.abs(input.delta),
          detail: `Seats now ${seats}`,
        },
      });
      return ok(reply, { info: licenseInfo(updated), organizationId: req.user.organizationId });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Licencia gestionada desde la web del gimnasio (por organizacion)
  app.get('/license/org', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const license = await prisma.license.findUnique({ where: { organizationId: req.user.organizationId } });
      const used = await seatUsage(req.user.organizationId);
      const info = license
        ? licenseInfo(license)
        : { plan: 'TRIAL', seats: 0, status: 'UNACTIVATED', expiresAt: null, daysLeft: null, isUsable: false, hasKey: false };
      return ok(reply, { activated: Boolean(license), info, seats: { used, total: license?.seats ?? 0 } });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/license/org', { onRequest: [app.authenticate, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(orgLicenseActivateSchema, request.body);
      const parsed = parseLicenseKey(input.licenseKey);
      const installationId = `org:${req.user.organizationId}`;
      const license = await prisma.license.upsert({
        where: { organizationId: req.user.organizationId },
        create: {
          installationId,
          organizationId: req.user.organizationId,
          licenseKey: input.licenseKey,
          plan: parsed.plan,
          seats: parsed.seats,
          status: 'ACTIVE',
          client: parsed.client,
          machineName: input.machineName ?? null,
          activatedAt: new Date(),
          expiresAt: parsed.expiresAt,
          lastCheckAt: new Date(),
        },
        update: {
          licenseKey: input.licenseKey,
          plan: parsed.plan,
          seats: parsed.seats,
          status: 'ACTIVE',
          client: parsed.client,
          expiresAt: parsed.expiresAt,
          lastCheckAt: new Date(),
        },
      });
      await prisma.planSubscription.updateMany({
        where: { licenseKey: input.licenseKey, organizationId: null },
        data: { organizationId: req.user.organizationId },
      });
      await prisma.licenseEvent.create({
        data: { licenseId: license.id, type: 'ACTIVATED', seats: license.seats, detail: `Plan ${parsed.plan} (web)` },
      });
      await logActivity(req, 'ACTIVATE', 'LICENSE', license.id, undefined, { plan: parsed.plan });
      invalidateLicenseGuard(req.user.organizationId);
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Licencia "actual" para la pagina de Configuracion. En el producto de
  // escritorio administra la licencia de la instalacion; en la nube, la de la
  // organizacion. Asi el usuario activa/renueva desde Configuracion sin bloqueos.
  app.get('/license/current', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const installationId = env.LICENSE_INSTALLATION_ID;
      if (installationId) {
        const license = await prisma.license.findUnique({ where: { installationId } });
        const used = license ? await seatUsage(req.user.organizationId) : 0;
        const info = license
          ? licenseInfo(license)
          : { plan: 'TRIAL', seats: LICENSE_PLANS.TRIAL.seats, status: 'UNACTIVATED', expiresAt: null, daysLeft: null, isUsable: false, hasKey: false };
        return ok(reply, {
          mode: 'installation',
          installationId,
          activated: Boolean(license),
          info,
          seats: { used, total: license?.seats ?? LICENSE_PLANS.TRIAL.seats },
          config: licenseConfigPayload(),
        });
      }
      const license = await prisma.license.findUnique({ where: { organizationId: req.user.organizationId } });
      const used = await seatUsage(req.user.organizationId);
      const info = license
        ? licenseInfo(license)
        : { plan: 'TRIAL', seats: 0, status: 'UNACTIVATED', expiresAt: null, daysLeft: null, isUsable: false, hasKey: false };
      return ok(reply, {
        mode: 'organization',
        installationId: null,
        activated: Boolean(license),
        info,
        seats: { used, total: license?.seats ?? 0 },
        config: licenseConfigPayload(),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/license/current', { onRequest: [app.authenticate, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(orgLicenseActivateSchema, request.body);
      const installationId = env.LICENSE_INSTALLATION_ID;
      if (installationId) {
        const license = await activateLicense(installationId, input.licenseKey, input.machineName ?? null);
        await logActivity(req, 'ACTIVATE', 'LICENSE', license.id, undefined, { plan: license.plan });
        invalidateLicenseGuard(installationId);
        return ok(reply, { activated: true, info: licenseInfo(license) });
      }
      const parsed = parseLicenseKey(input.licenseKey);
      const license = await prisma.license.upsert({
        where: { organizationId: req.user.organizationId },
        create: {
          installationId: `org:${req.user.organizationId}`,
          organizationId: req.user.organizationId,
          licenseKey: input.licenseKey,
          plan: parsed.plan,
          seats: parsed.seats,
          status: 'ACTIVE',
          client: parsed.client,
          machineName: input.machineName ?? null,
          activatedAt: new Date(),
          expiresAt: parsed.expiresAt,
          lastCheckAt: new Date(),
        },
        update: {
          licenseKey: input.licenseKey,
          plan: parsed.plan,
          seats: parsed.seats,
          status: 'ACTIVE',
          client: parsed.client,
          expiresAt: parsed.expiresAt,
          lastCheckAt: new Date(),
        },
      });
      await prisma.planSubscription.updateMany({
        where: { licenseKey: input.licenseKey, organizationId: null },
        data: { organizationId: req.user.organizationId },
      });
      await prisma.licenseEvent.create({
        data: { licenseId: license.id, type: 'ACTIVATED', seats: license.seats, detail: `Plan ${parsed.plan} (config)` },
      });
      await logActivity(req, 'ACTIVATE', 'LICENSE', license.id, undefined, { plan: parsed.plan });
      invalidateLicenseGuard(req.user.organizationId);
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Generador de claves (herramienta del proveedor). Requiere header x-license-admin.
  app.post('/license/generate', { onRequest: [rateLimit({ max: 10, windowMs: 60 * 60 * 1000, keyPrefix: 'license-generate' })] }, async (request, reply) => {
    try {
      requireAdminKey(request.headers as Record<string, unknown>);
      const body = (request.body ?? {}) as { plan?: string; seats?: number; expiresAt?: string; client?: string };
      const plan = (body.plan ?? 'BASIC').toUpperCase() as LicensePlanName;
      if (!(plan in LICENSE_PLANS)) throw new HttpError(400, 'Plan invalido');
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
      const key = generateLicenseKey(plan, body.seats, expiresAt, body.client);
      return ok(reply, { key, plan, client: body.client ?? null, seats: body.seats ?? LICENSE_PLANS[plan].seats });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default licenseRoutes;
