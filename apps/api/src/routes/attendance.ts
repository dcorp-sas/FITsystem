import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { attendanceCheckinSchema, faceCheckinSchema, hardwareDeviceSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { startOfDay, endOfDay, fullName } from '@fitsystem/utils';
import { getRawSetting } from '../services/settings.js';
import { matchFace, parseThreshold } from '../services/face.js';
import { getDeviceProfile, saveDeviceProfile, enabledMethods } from '../services/devices.js';
import { openTurnstile } from '../services/turnstile.js';
import { parseMemberQr, signAccessQr, type AccessRotation } from '../lib/member-qr.js';

const ACCESS_ROTATIONS: AccessRotation[] = ['NEVER', 'DAILY', 'WEEKLY'];

async function loadAccessQrConfig(orgId: string, branchId: string) {
  const [enabledRaw, rotationRaw, title, subtitle, footer, sizeRaw, color] = await Promise.all([
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_ENABLED'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_ROTATION'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_TITLE'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_SUBTITLE'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_FOOTER'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_SIZE'),
    getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_QR_COLOR'),
  ]);
  const rotation = ACCESS_ROTATIONS.includes(rotationRaw as AccessRotation) ? (rotationRaw as AccessRotation) : 'NEVER';
  const size = Math.min(2048, Math.max(128, Number(sizeRaw) || 512));
  return {
    enabled: enabledRaw !== 'false',
    rotation,
    size,
    color: color || '#0b1120',
    title: title || 'Ingreso al gimnasio',
    subtitle: subtitle || 'Escaneá este código con la app de socios para registrar tu ingreso',
    footer: footer || '',
    branchId,
  };
}

// Medios de check-in que el gimnasio puede habilitar desde Configuración.
export const CHECKIN_METHODS = ['QR', 'CARD', 'FACE', 'FINGERPRINT', 'TURNSTILE', 'MANUAL'] as const;
const DEFAULT_ACCESS_METHODS = ['QR', 'CARD', 'FACE', 'FINGERPRINT', 'TURNSTILE', 'MANUAL'] as const;

/**
 * Medios de ingreso habilitados para la organización. Se configura en
 * Configuración → Ingreso (clave ACCESS_METHODS). Si no hay configuracion se
 * habilitan todos. MANUAL siempre queda disponible como respaldo.
 */
export async function loadAccessMethods(orgId: string): Promise<string[]> {
  const raw = await getRawSetting(orgId, 'ATTENDANCE', 'ACCESS_METHODS');
  const configured = (raw ?? '')
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m): m is (typeof CHECKIN_METHODS)[number] => (CHECKIN_METHODS as readonly string[]).includes(m));
  const list = configured.length ? configured : [...DEFAULT_ACCESS_METHODS];
  return [...new Set([...list, 'MANUAL'])];
}

async function findActiveMembership(orgId: string, memberId: string) {
  return prisma.membership.findFirst({
    where: {
      organizationId: orgId,
      memberId,
      status: 'ACTIVE',
      endDate: { gte: new Date() },
    },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  });
}

type CheckinOutcome =
  | {
      kind: 'ok';
      member: { id: string; memberCode: string; name: string; photoUrl: string | null };
      plan: string;
      planColor: string;
      membershipEndDate: Date;
      attendanceId: string;
      checkedInAt: Date;
    }
  | { kind: 'reject'; reason: string; member: { id: string; memberCode: string; name: string; photoUrl: string | null } | null };

const REJECT_MESSAGES: Record<string, string> = {
  SOCIO_NO_ENCONTRADO: 'Socio no encontrado',
  ROSTRO_NO_ENCONTRADO: 'No se pudo registrar ningun rostro. Acercate a la camara',
  ROSTRO_NO_RECONOCIDO: 'Rostro no reconocido. Probá de nuevo o registrá tu rostro en recepción',
  SIN_FACE_ENROLADO: 'Ningun socio tiene el rostro registrado',
  SOCIO_SUSPENDIDO: 'Socio suspendido',
  SOCIO_INACTIVO: 'Socio dado de baja',
  SOCIO_CONGELADO: 'Membresia pausada',
  SIN_MEMBRESIA: 'Sin membresia activa',
  QR_INVALIDO: 'El QR no es valido o fue alterado',
};

function buildCheckinReply(outcome: CheckinOutcome) {
  if (outcome.kind === 'reject') {
    return {
      allowed: false,
      reason: outcome.reason,
      message: REJECT_MESSAGES[outcome.reason] ?? 'Acceso rechazado',
      member: outcome.member,
    };
  }
  return {
    allowed: true,
    member: outcome.member,
    plan: outcome.plan,
    planColor: outcome.planColor,
    membershipEndDate: outcome.membershipEndDate,
    attendanceId: outcome.attendanceId,
    checkedInAt: outcome.checkedInAt,
  };
}

async function performCheckin(req: AuthedRequest, memberId: string, branchId: string, method: string): Promise<CheckinOutcome> {
  const orgId = req.user.organizationId;

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
    include: {
      memberships: {
        where: { status: 'ACTIVE', endDate: { gte: new Date() } },
        orderBy: { endDate: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
  });
  if (!member) return { kind: 'reject', reason: 'SOCIO_NO_ENCONTRADO', member: null };

  const baseMember = { id: member.id, memberCode: member.memberCode, name: fullName(member.firstName, member.lastName), photoUrl: member.photoUrl };

  if (member.status === 'SUSPENDED') return { kind: 'reject', reason: 'SOCIO_SUSPENDIDO', member: baseMember };
  if (member.status === 'INACTIVE') return { kind: 'reject', reason: 'SOCIO_INACTIVO', member: baseMember };
  if (member.status === 'FROZEN') return { kind: 'reject', reason: 'SOCIO_CONGELADO', member: baseMember };

  const membership = member.memberships[0];
  if (!membership) return { kind: 'reject', reason: 'SIN_MEMBRESIA', member: baseMember };

  // Registrar entrada
  const today = startOfDay();
  const alreadyToday = await prisma.attendance.findFirst({
    where: { memberId: member.id, checkedInAt: { gte: today, lte: endOfDay() } },
  });
  const isFirstToday = !alreadyToday;

  const attendance = await prisma.attendance.create({
    data: {
      organizationId: orgId,
      branchId,
      memberId: member.id,
      membershipId: membership.id,
      method,
      status: 'ALLOWED',
      checkedInAt: new Date(),
      registeredById: req.user.id,
    },
  });

  if (isFirstToday) {
    await prisma.member.update({
      where: { id: member.id },
      data: { totalVisits: { increment: 1 }, lastVisitAt: new Date() },
    });
  }

  await logActivity(req, 'CHECKIN', 'ATTENDANCE', attendance.id, undefined, { member: member.id, method, distance: 0 });

  // Ingreso válido: abrir el molinete/barrera configurado (si lo hay). Se hace
  // sin bloquear ni demorar la respuesta; un hardware caído no afecta el check-in.
  void openTurnstile(orgId, branchId);

  const plan = membership.plan;
  return {
    kind: 'ok',
    member: baseMember,
    plan: plan.name,
    planColor: plan.color,
    membershipEndDate: membership.endDate,
    attendanceId: attendance.id,
    checkedInAt: attendance.checkedInAt,
  };
}

export function attendanceRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Check-in (QR, manual, cara, etc.) con validacion de membresia
  app.post('/attendance/checkin', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(attendanceCheckinSchema, request.body);
      const orgId = req.user.organizationId;

      const branchId = req.user.branchId ?? input.branchId;
      if (!branchId) throw new HttpError(400, 'No hay sede seleccionada');

      let memberId = input.memberId ?? null;
      // El metodo no se confia al cliente: se deriva de la fuente real.
      let method: string = input.method ?? 'MANUAL';

      if (input.qr) {
        const parsed = parseMemberQr(String(input.qr));
        if (parsed.ok) {
          // QR firmado por el servidor: el socio es el de la firma.
          if (parsed.data.orgId !== orgId) {
            return ok(reply, buildCheckinReply({ kind: 'reject', reason: 'QR_INVALIDO', member: null }), 200);
          }
          memberId = parsed.data.memberId;
          method = 'QR';
        } else if (parsed.reason === 'invalid') {
          return ok(reply, buildCheckinReply({ kind: 'reject', reason: 'QR_INVALIDO', member: null }), 200);
        } else {
          // Codigo heredado (sin firma): buscar por codigo o documento.
          const code = String(input.qr).trim();
          const member = await prisma.member.findFirst({
            where: {
              organizationId: orgId,
              OR: [{ memberCode: code }, { documentNumber: code }],
            },
          });
          memberId = member?.id ?? null;
        }
      }

      if (!memberId) {
        return ok(
          reply,
          buildCheckinReply({ kind: 'reject', reason: 'SOCIO_NO_ENCONTRADO', member: null }),
          200,
        );
      }

      const outcome = await performCheckin(req, memberId, branchId, method);
      if (outcome.kind === 'reject') return ok(reply, buildCheckinReply(outcome), 200);
      return ok(reply, buildCheckinReply(outcome), 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Check-in por reconocimiento facial.
  // El kiosco/navegador envia un descriptor calculado con face-api; el servidor
  // lo compara contra los descriptores enrolados y registra la entrada real.
  app.post('/attendance/face', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(faceCheckinSchema, request.body);
      const orgId = req.user.organizationId;

      const branchId = req.user.branchId ?? input.branchId;
      if (!branchId) throw new HttpError(400, 'No hay sede seleccionada');

      const threshold = parseThreshold(await getRawSetting(orgId, 'FACE', 'MATCH_THRESHOLD'));

      // Descriptores enrolados en la organizacion (filtrados por sede cuando corresponde)
      const faces = await prisma.memberFace.findMany({
        where: { organizationId: orgId },
        include: { member: { select: { id: true, branchId: true } } },
      });
      const scoped = branchId
        ? faces.filter((f) => !branchId || f.member.branchId === branchId)
        : faces;
      const candidates = scoped.length ? scoped : faces;

      if (!candidates.length) {
        return ok(reply, buildCheckinReply({ kind: 'reject', reason: 'SIN_FACE_ENROLADO', member: null }), 200);
      }

      const match = matchFace(candidates as Array<PrismaMemberFace>, input.descriptor, threshold);
      if (!match) {
        return ok(reply, buildCheckinReply({ kind: 'reject', reason: 'ROSTRO_NO_RECONOCIDO', member: null }), 200);
      }

      const outcome = await performCheckin(req, match.memberId, branchId, 'FACE');
      return ok(
        reply,
        {
          ...buildCheckinReply(outcome),
          match: { distance: Number(match.distance.toFixed(4)), samples: match.samples },
        },
        outcome.kind === 'ok' ? 201 : 200,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  // QR fijo de ingreso: un único QR (por sede) que se imprime y se pega en la
  // puerta. El socio lo escanea con la app y su ingreso se registra solo.
  app.get('/attendance/access-qr', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { branchId?: string };
      const orgId = req.user.organizationId;
      const branchId = query.branchId || req.user.branchId;
      if (!branchId) throw new HttpError(400, 'No hay sede seleccionada');

      const config = await loadAccessQrConfig(orgId, branchId);
      const payload = signAccessQr(orgId, branchId, config.rotation);

      let image: string | null = null;
      if (config.enabled) {
        const { default: QRCode } = await import('qrcode');
        image = await QRCode.toDataURL(payload, {
          width: config.size,
          margin: 1,
          color: { dark: config.color, light: '#ffffff' },
        });
      }

      return ok(reply, { ...config, payload, image });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Medios de ingreso habilitados (QR, tarjeta, rostro, huella, molinete...)
  app.get('/attendance/methods', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const methods = await loadAccessMethods(req.user.organizationId);
      return ok(reply, { methods });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Entradas del dia (dashboard)
  app.get('/attendance/today', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const today = startOfDay();
      const [entries, count] = await Promise.all([
        prisma.attendance.findMany({
          where: { organizationId: orgId, checkedInAt: { gte: today, lte: endOfDay() } },
          orderBy: { checkedInAt: 'desc' },
          include: {
            member: { select: { id: true, firstName: true, lastName: true, photoUrl: true, memberCode: true } },
            membership: { include: { plan: { select: { name: true, color: true } } } },
          },
        }),
        prisma.attendance.count({
          where: { organizationId: orgId, checkedInAt: { gte: today, lte: endOfDay() } },
        }),
      ]);
      const unique = new Set(entries.map((e) => e.memberId)).size;
      return ok(reply, { count: unique, rawCount: count, items: entries });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Historial por rango
  app.get('/attendance', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string; memberId?: string; page?: string };
      const where: Record<string, unknown> = { organizationId: req.user.organizationId };
      if (query.from || query.to) {
        where.checkedInAt = {
          gte: query.from ? startOfDay(new Date(query.from)) : undefined,
          lte: query.to ? endOfDay(new Date(query.to)) : undefined,
        };
      }
      if (query.memberId) where.memberId = query.memberId;
      const page = Math.max(1, Number(query.page || 1));
      const [total, items] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.findMany({
          where,
          orderBy: { checkedInAt: 'desc' },
          skip: (page - 1) * 50,
          take: 50,
          include: { member: { select: { firstName: true, lastName: true, memberCode: true } } },
        }),
      ]);
      return ok(reply, { total, page, items });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Horarios pico (concentracion por hora)
  app.get('/attendance/peak-hours', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string };
      const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(addDays(new Date(), -30));
      const to = query.to ? endOfDay(new Date(query.to)) : endOfDay();
      const rows = await prisma.attendance.findMany({
        where: { organizationId: req.user.organizationId, checkedInAt: { gte: from, lte: to } },
        select: { checkedInAt: true },
      });
      const buckets: Record<string, number> = {};
      for (const r of rows) {
        const h = new Date(r.checkedInAt).getHours();
        const key = `${String(h).padStart(2, '0')}:00`;
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
      const peak = Object.entries(buckets)
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count);
      return ok(reply, { from, to, peak, byHour: buckets });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Hardware de control de acceso detectado en la sede (lectores, camara, etc.)
  app.get('/attendance/devices', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { branchId?: string };
      const branchId = query.branchId || req.user.branchId;
      if (!branchId) throw new HttpError(400, 'No hay sede seleccionada');
      const profile = await getDeviceProfile(req.user.organizationId, branchId);
      return ok(reply, { profile, methods: enabledMethods(profile) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/attendance/devices', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(hardwareDeviceSchema, request.body);
      const profile = await saveDeviceProfile(req.user.organizationId, input);
      await logActivity(req, 'UPDATE', 'HARDWARE', input.branchId, undefined, {
        devices: input.devices.filter((d) => d.available).length,
      });
      return ok(reply, { profile, methods: enabledMethods(profile) });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

// Tipo auxiliar para el matcher (prisma devulve el modelo con descriptors: string)
type PrismaMemberFace = {
  id: string;
  organizationId: string;
  memberId: string;
  descriptors: string;
  samples: number;
  createdAt: Date;
  updatedAt: Date;
};

export default attendanceRoutes;