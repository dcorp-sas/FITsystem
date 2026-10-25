import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import {
  loginSchema,
  registerOrgSchema,
  changePasswordSchema,
  twoFactorChallengeSchema,
  twoFactorLoginSchema,
  twoFactorEnableSchema,
  twoFactorDisableSchema,
} from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { logActivity } from '../lib/activity.js';
import { sendEmail } from '../services/email.js';
import { ensureOrgLicense } from '../services/license.js';
import {
  findOrgByInstallation,
  ensureGenericAdmin,
  genericAdminEmail,
  GENERIC_ADMIN_PASSWORD,
  GENERIC_ADMIN_USER,
} from '../services/installation.js';
import { env } from '../env.js';
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateNumericCode,
  hashToken,
  otpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from '../lib/secrets.js';

const BACKUP_CODE_COUNT = 10;

/* Bloqueo por cuenta: tras varios intentos fallidos se frena el login de ese
 * email durante una ventana, ademas del rate-limit por IP. */
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60_000;
const loginFailures = new Map<string, { count: number; firstAt: number }>();

function checkLoginLock(email: string): void {
  const entry = loginFailures.get(email);
  if (!entry) return;
  if (Date.now() - entry.firstAt > LOGIN_LOCK_MS) {
    loginFailures.delete(email);
    return;
  }
  if (entry.count >= LOGIN_MAX_FAILS) {
    const retry = Math.max(1, Math.ceil((entry.firstAt + LOGIN_LOCK_MS - Date.now()) / 1000));
    throw new HttpError(429, `Cuenta bloqueada temporalmente por intentos fallidos. Proba en ${retry}s`);
  }
}

function registerLoginFailure(email: string): void {
  const entry = loginFailures.get(email);
  if (!entry || Date.now() - entry.firstAt > LOGIN_LOCK_MS) {
    loginFailures.set(email, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(email: string): void {
  loginFailures.delete(email);
}

export function authRoutes(app: FastifyInstance) {
  async function issueSession(user: {
    id: string;
    organizationId: string;
    branchId: string | null;
    name: string;
    email: string;
    role: string;
  }) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    const branches = await prisma.branch.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
    return {
      token: app.jwt.sign({ sub: user.id }),
      user,
      organization: { id: org?.id, name: org?.name, slug: org?.slug, currency: org?.currency },
      branches,
    };
  }

  /**
   * Organización/usuario "local" del producto de escritorio. FIT system™ en la PC
   * de un gimnasio es single-tenant. Esta función crea (de forma idempotente) la
   * organización, la sede y el usuario OWNER por defecto (admin/admin123), para
   * que cualquiera que instale el sistema pueda ingresar.
   */
  async function ensureLocalOwner() {
    const slug = 'local';
    let org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      org = await prisma.organization.create({ data: { name: 'FIT system™', slug, currency: 'ARS' } });
    }
    let branch = await prisma.branch.findFirst({ where: { organizationId: org.id }, orderBy: { name: 'asc' } });
    if (!branch) {
      branch = await prisma.branch.create({ data: { organizationId: org.id, name: 'Sede Central', code: 'SC' } });
    }
    await ensureOrgLicense(org.id).catch(() => undefined);
    const email = 'admin@fitsystem.local';
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(GENERIC_ADMIN_PASSWORD, 10);
      user = await prisma.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          name: 'Administrador',
          email,
          passwordHash,
          role: 'OWNER',
        },
      });
    } else if (!user.branchId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { branchId: branch.id } });
    }
    return user;
  }

  /**
   * Resuelve el usuario que quiere ingresar al panel.
   * - Usuario genérico inicial en la instalación local -> OWNER local.
   * - Usuario genérico en la nube -> administrador del gimnasio vinculado al ID de instalación.
   * - Email + contraseña -> login normal (acotado al gimnasio si hay instalación).
   */
  async function resolveLoginUser(raw: string, installationId?: string) {
    const looksLikeEmail = raw.includes('@');

    // Nube: si el panel identifica su instalación, se acota a ese gimnasio.
    if (installationId) {
      const orgId = await findOrgByInstallation(installationId);
      if (orgId) {
        if (looksLikeEmail) {
          return prisma.user.findFirst({ where: { organizationId: orgId, email: raw } });
        }
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { id: true, slug: true },
        });
        if (!org) return null;
        const branch = await prisma.branch.findFirst({
          where: { organizationId: orgId },
          orderBy: { name: 'asc' },
          select: { id: true },
        });
        const adminEmail = genericAdminEmail(org.slug);
        const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (existingAdmin) return existingAdmin;
        await ensureGenericAdmin(org, branch?.id ?? null);
        return prisma.user.findUnique({ where: { email: adminEmail } });
      }
    }

    if (!looksLikeEmail) {
      // Instalación local: el administrador inicial puede ingresar, pero su
      // contraseña no debe reescribirse en cada intento. Así persisten los cambios.
      if (raw !== GENERIC_ADMIN_USER || !env.LICENSE_INSTALLATION_ID) return null;
      return ensureLocalOwner();
    }

    return prisma.user.findUnique({ where: { email: raw } });
  }

  /* Sesión automática del panel del gimnasio. Solo existe en la instalación
   * local (API embebida); en la nube responde 404 y el panel muestra el login
   * con el usuario genérico admin/admin123. */
  app.post('/auth/desktop-session', async (_request, reply) => {
    try {
      // El ingreso automático queda desactivado por defecto: requiere una
      // habilitación explícita para entornos controlados y no expone datos al
      // abrir la aplicación sin autenticar al operador.
      if (process.env.DESKTOP_AUTO_LOGIN !== 'true' || !env.LICENSE_INSTALLATION_ID) throw new HttpError(404, 'No disponible');
      const user = await ensureLocalOwner();
      await logActivity(
        { user: { id: user.id, organizationId: user.organizationId, branchId: user.branchId, name: user.name, email: user.email, role: user.role } } as unknown as AuthedRequest,
        'LOGIN',
        'USER',
        user.id,
      );
      return ok(reply, await issueSession(user));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/register', { onRequest: [rateLimit({ max: 5, windowMs: 60 * 60 * 1000, keyPrefix: 'register' })] }, async (request, reply) => {
    try {
      const input = validate(registerOrgSchema, request.body);
      const exists = await prisma.organization.findUnique({ where: { slug: input.slug } });
      if (exists) throw new HttpError(409, 'El nombre corto ya esta en uso');

      const org = await prisma.organization.create({
        data: {
          name: input.organizationName,
          slug: input.slug,
          currency: input.currency,
        },
      });

      const branch = await prisma.branch.create({
        data: {
          organizationId: org.id,
          name: 'Sede Central',
          code: 'SC',
        },
      });

      // Toda organizacion nueva arranca con una licencia TRIAL para poder operar.
      await ensureOrgLicense(org.id);

      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await prisma.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          name: input.userName,
          email: input.email,
          passwordHash,
          role: 'OWNER',
        },
      });

      const token = app.jwt.sign({ sub: user.id });
      await logActivity(
        {
          user: { id: user.id, organizationId: org.id, branchId: branch.id, name: user.name, email: user.email, role: user.role },
        } as unknown as AuthedRequest,
        'LOGIN',
        'USER',
        user.id,
      );

      return ok(reply, {
        token,
        user,
        organization: { id: org.id, name: org.name, slug: org.slug, currency: org.currency },
        branch,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(
    '/auth/login',
    { onRequest: [rateLimit({ max: 10, windowMs: 10 * 60_000, keyPrefix: 'login' })] },
    async (request, reply) => {
      try {
        const input = validate(loginSchema, request.body);
        const raw = input.email.trim().toLowerCase();
        checkLoginLock(raw);

        const user = await resolveLoginUser(raw, input.installationId?.trim());
        if (!user || !user.isActive) {
          registerLoginFailure(raw);
          throw new HttpError(401, 'Usuario o contrasena incorrectos');
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          registerLoginFailure(raw);
          throw new HttpError(401, 'Usuario o contrasena incorrectos');
        }
        clearLoginFailures(raw);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        if (user.twoFactorEnabled) {
          const challenge = app.jwt.sign({ sub: user.id, typ: '2fa' }, { expiresIn: '5m' });
          const methods = ['totp', ...(user.twoFactorEmailEnabled ? ['email'] : []), 'backup'];
          return ok(reply, {
            twoFactorRequired: true,
            challenge,
            methods,
            email: maskEmail(user.email),
          });
        }

        await logActivity(
          { user: { id: user.id, organizationId: user.organizationId, branchId: user.branchId, name: user.name, email: user.email, role: user.role } } as unknown as AuthedRequest,
          'LOGIN',
          'USER',
          user.id,
        );
        return ok(reply, await issueSession(user));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  /* ---------- Segundo factor ---------- */

  app.post(
    '/auth/login/2fa',
    { onRequest: [rateLimit({ max: 12, windowMs: 10 * 60_000, keyPrefix: 'login2fa' })] },
    async (request, reply) => {
      try {
        const input = validate(twoFactorLoginSchema, request.body);
        let userId: string;
        try {
          const payload = app.jwt.verify<{ sub: string; typ?: string }>(input.challenge);
          if (payload.typ !== '2fa') throw new Error('tipo invalido');
          userId = payload.sub;
        } catch {
          throw new HttpError(401, 'Desafio invalido o expirado');
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive) throw new HttpError(401, 'Datos de verificacion invalidos');

        let usedBackup = false;
        if (input.method === 'email') {
          if (!verifyEmailCode(user, input.code)) throw new HttpError(401, 'Codigo de email incorrecto o expirado');
        } else if (input.method === 'backup') {
          const result = await verifyBackupCode(user.id, user.twoFactorBackupCodes, input.code);
          if (!result.ok) throw new HttpError(401, 'Codigo de recuperacion invalido');
          usedBackup = true;
          await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(result.remaining) } });
        } else {
          // Por defecto TOTP, aceptando tambien un codigo de recuperacion como respaldo.
          if (user.twoFactorSecret && verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) {
            // ok
          } else {
            const result = await verifyBackupCode(user.id, user.twoFactorBackupCodes, input.code);
            if (!result.ok) throw new HttpError(401, 'Codigo de verificacion incorrecto');
            usedBackup = true;
            await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(result.remaining) } });
          }
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await logActivity(
          { user: { id: user.id, organizationId: user.organizationId, branchId: user.branchId, name: user.name, email: user.email, role: user.role } } as unknown as AuthedRequest,
          'LOGIN',
          'USER',
          user.id,
          undefined,
          usedBackup ? { backupCode: true } : undefined,
        );
        return ok(reply, await issueSession(user));
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  // Envia un codigo de respaldo por email durante el desafio 2FA.
  app.post('/auth/login/2fa/email', { onRequest: [rateLimit({ max: 5, windowMs: 10 * 60_000, keyPrefix: 'login2faEmail' })] }, async (request, reply) => {
    try {
      const input = validate(twoFactorChallengeSchema, request.body);
      let user;
      try {
        const payload = app.jwt.verify<{ sub: string; typ?: string }>(input.challenge);
        if (payload.typ !== '2fa') throw new Error('invalid');
        user = await prisma.user.findUnique({ where: { id: payload.sub } });
      } catch {
        throw new HttpError(401, 'Desafio invalido o expirado');
      }
      if (!user || !user.isActive || !user.twoFactorEnabled) throw new HttpError(401, 'Datos de verificacion invalidos');
      if (!user.twoFactorEmailEnabled) throw new HttpError(400, 'El respaldo por email no esta habilitado');

      const code = generateNumericCode(6);
      await prisma.user.update({
        where: { id: user.id },
        data: { loginCodeHash: hashToken(code), loginCodeExpiresAt: new Date(Date.now() + 10 * 60_000) },
      });
      const sent = await sendEmail(
        user.organizationId,
        user.email,
        'Tu codigo de acceso a FIT system™',
        `Tu codigo de verificacion es: ${code}\nVence en 10 minutos. Si no intentaste ingresar, ignora este mensaje.`,
      );
      return ok(reply, { sent: sent.ok, error: sent.ok ? undefined : sent.error });
    } catch (error) {
      return fail(reply, error);
    }
  });

  /* ---------- Gestion de 2FA (usuario autenticado) ---------- */

  app.get('/auth/2fa', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const backupCodes = parseBackupCodes(user.twoFactorBackupCodes);
      return ok(reply, {
        enabled: user.twoFactorEnabled,
        emailEnabled: user.twoFactorEmailEnabled,
        backupCodesRemaining: backupCodes.length,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/2fa/setup', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const secret = generateTotpSecret();
      await prisma.user.update({
        where: { id: req.user.id },
        data: { twoFactorPendingSecret: encryptSecret(secret) },
      });
      const url = otpauthUrl(secret, req.user.email);
      const qr = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      return ok(reply, { secret, otpauthUrl: url, qr });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/2fa/enable', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(twoFactorEnableSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user?.twoFactorPendingSecret) throw new HttpError(400, 'Primero iniciá la configuración de 2FA');
      const secret = decryptSecret(user.twoFactorPendingSecret);
      if (!verifyTotp(secret, input.code)) throw new HttpError(400, 'El codigo no es valido. Verificá la hora del dispositivo e intentá de nuevo.');

      const codes = generateBackupCodes(BACKUP_CODE_COUNT);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: encryptSecret(secret),
          twoFactorPendingSecret: null,
          twoFactorEmailEnabled: true,
          twoFactorBackupCodes: JSON.stringify(codes.map((c) => hashToken(c))),
        },
      });
      await logActivity(req, 'UPDATE', 'USER', user.id, undefined, { twoFactor: 'enabled' });
      return ok(reply, { enabled: true, backupCodes: codes });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/2fa/disable', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(twoFactorDisableSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordOk) throw new HttpError(400, 'La contrasena actual no es correcta');
      if (user.twoFactorEnabled && user.twoFactorSecret && !verifyTotp(decryptSecret(user.twoFactorSecret), input.code ?? '')) {
        throw new HttpError(400, 'Codigo de verificacion incorrecto');
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorEmailEnabled: false,
          twoFactorBackupCodes: null,
        },
      });
      await logActivity(req, 'UPDATE', 'USER', user.id, undefined, { twoFactor: 'disabled' });
      return ok(reply, { enabled: false });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/2fa/email/toggle', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user?.twoFactorEnabled) throw new HttpError(400, 'El 2FA no esta activado');
      const next = !user.twoFactorEmailEnabled;
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEmailEnabled: next } });
      return ok(reply, { emailEnabled: next });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/auth/2fa/backup-codes', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(twoFactorEnableSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(400, 'El 2FA no esta activado');
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) throw new HttpError(400, 'Codigo incorrecto');
      const codes = generateBackupCodes(BACKUP_CODE_COUNT);
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(codes.map((c) => hashToken(c))) } });
      return ok(reply, { backupCodes: codes });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Cambio de contrasena del propio usuario autenticado
  app.post('/auth/change-password', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(changePasswordSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new HttpError(400, 'La contrasena actual no es correcta');
      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      await logActivity(req, 'UPDATE', 'USER', user.id, undefined, { action: 'change_password' });
      return ok(reply, { changed: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Datos de sesion del usuario autenticado
  app.get('/auth/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const organization = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const branches = await prisma.branch.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { name: 'asc' },
      });
      return ok(reply, { user, organization, branches, twoFactorEnabled: user?.twoFactorEnabled ?? false });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  const visible = name!.slice(0, 2);
  return `${visible}***@${domain}`;
}

function parseBackupCodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

async function verifyBackupCode(
  _userId: string,
  raw: string | null,
  code: string,
): Promise<{ ok: boolean; remaining: string[] }> {
  const hashes = parseBackupCodes(raw);
  const input = hashToken(code.trim().toLowerCase());
  const idx = hashes.indexOf(input);
  if (idx === -1) return { ok: false, remaining: hashes };
  hashes.splice(idx, 1);
  return { ok: true, remaining: hashes };
}

function verifyEmailCode(user: { loginCodeHash: string | null; loginCodeExpiresAt: Date | null }, code: string): boolean {
  if (!user.loginCodeHash || !user.loginCodeExpiresAt) return false;
  if (user.loginCodeExpiresAt.getTime() < Date.now()) return false;
  return hashToken(code.trim()) === user.loginCodeHash;
}

export default authRoutes;
