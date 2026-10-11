import type { FastifyInstance } from 'fastify';
import { licenseActivateSchema, licenseValidateSchema, licenseSeatSchema, orgLicenseActivateSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
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
  type LicensePlanName,
} from '../services/license.js';

function requireAdminKey(headers: Record<string, unknown>) {
  const provided = headers['x-license-admin'];
  if (!provided || provided !== env.LICENSE_SECRET) {
    throw new HttpError(403, 'No autorizado para administrar licencias');
  }
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
  app.get('/license/status', async (request, reply) => {
    try {
      const { installationId } = request.query as { installationId?: string };
      if (!installationId) throw new HttpError(400, 'Falta installationId');
      const license = await prisma.license.findUnique({ where: { installationId } });
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
  app.post('/license/activate', async (request, reply) => {
    try {
      const input = validate(licenseActivateSchema, request.body);
      const license = await activateLicense(input.installationId, input.licenseKey, input.machineName ?? null);
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Validar/refrescar estado (llamado al iniciar el sistema o periodicamente)
  app.post('/license/validate', async (request, reply) => {
    try {
      const input = validate(licenseValidateSchema, request.body);
      const license = await validateLicense(input.installationId, input.licenseKey ?? null);
      return ok(reply, { info: licenseInfo(license) });
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
      if (!license) throw new HttpError(404, 'Licencia no encontrada');
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
          expiresAt: parsed.expiresAt,
          lastCheckAt: new Date(),
        },
      });
      await prisma.licenseEvent.create({
        data: { licenseId: license.id, type: 'ACTIVATED', seats: license.seats, detail: `Plan ${parsed.plan} (web)` },
      });
      await logActivity(req, 'ACTIVATE', 'LICENSE', license.id, undefined, { plan: parsed.plan });
      return ok(reply, { activated: true, info: licenseInfo(license) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Generador de claves (herramienta del proveedor). Requiere header x-license-admin.
  app.post('/license/generate', async (request, reply) => {
    try {
      requireAdminKey(request.headers as Record<string, unknown>);
      const body = (request.body ?? {}) as { plan?: string; seats?: number; expiresAt?: string };
      const plan = (body.plan ?? 'BASIC').toUpperCase() as LicensePlanName;
      if (!(plan in LICENSE_PLANS)) throw new HttpError(400, 'Plan invalido');
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
      const key = generateLicenseKey(plan, body.seats, expiresAt);
      return ok(reply, { key, plan, seats: body.seats ?? LICENSE_PLANS[plan].seats });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default licenseRoutes;
