import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { memberSchema } from '@fitsystem/validators';
import { validate, ok, fail, HttpError, type AuthedRequest } from '../lib/http.js';
import { logActivity } from '../lib/activity.js';
import { churnRiskScore, daysBetween, fullName, memberCode } from '@fitsystem/utils';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }
  return rows;
}

export function memberRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Lista con filtros y nivel de riesgo
  app.get('/members', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as {
        search?: string;
        status?: string;
        branchId?: string;
        risk?: string;
        page?: string;
        pageSize?: string;
      };
      const orgId = req.user.organizationId;
      const where: Record<string, unknown> = { organizationId: orgId };
      if (req.user.branchId && !['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
        where.branchId = req.user.branchId;
      }
      if (query.status) where.status = query.status;
      if (query.branchId) where.branchId = query.branchId;
      if (query.search) {
        const s = query.search.trim();
        where.OR = [
          { firstName: { contains: s } },
          { lastName: { contains: s } },
          { email: { contains: s } },
          { phone: { contains: s } },
          { documentNumber: { contains: s } },
          { memberCode: { contains: s } },
        ];
      }

      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));
      const [total, members] = await Promise.all([
        prisma.member.count({ where }),
        prisma.member.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            memberships: {
              where: { status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
              orderBy: { endDate: 'desc' },
              take: 1,
              include: { plan: true },
            },
          },
        }),
      ]);

      const now = new Date();
      const withRisk = members.map((m) => {
        const active = m.memberships[0];
        const risk = churnRiskScore({
          lastVisitDays: m.lastVisitAt ? daysBetween(m.lastVisitAt, now) : null,
          membershipEndDays: active ? daysBetween(now, active.endDate) : null,
          totalVisits: m.totalVisits,
        });
        return { ...m, risk };
      });

      const filtered = query.risk ? withRisk.filter((m) => m.risk.level === query.risk) : withRisk;

      return ok(reply, { total, page, pageSize, items: filtered });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Riesgo de abandono
  app.get('/members/risk', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const members = await prisma.member.findMany({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'FROZEN'] } },
        include: {
          memberships: {
            where: { status: { in: ['ACTIVE', 'FROZEN'] } },
            orderBy: { endDate: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      });

      const now = new Date();
      const rows = members
        .map((m) => {
          const active = m.memberships[0];
          const risk = churnRiskScore({
            lastVisitDays: m.lastVisitAt ? daysBetween(m.lastVisitAt, now) : null,
            membershipEndDays: active ? daysBetween(now, active.endDate) : null,
            totalVisits: m.totalVisits,
          });
          return {
            id: m.id,
            memberCode: m.memberCode,
            name: fullName(m.firstName, m.lastName),
            phone: m.phone,
            email: m.email,
            lastVisitAt: m.lastVisitAt,
            totalVisits: m.totalVisits,
            membershipEndDate: active?.endDate ?? null,
            plan: active?.plan.name ?? null,
            risk: risk.score,
            level: risk.level,
          };
        })
        .filter((r) => r.level !== 'LOW')
        .sort((a, b) => b.risk - a.risk);

      return ok(reply, { total: rows.length, items: rows });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Ficha completa de un socio
  app.get('/members/:id', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const member = await prisma.member.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: {
          branch: true,
          memberships: {
            orderBy: { createdAt: 'desc' },
            include: { plan: true, freezes: true, payments: true },
          },
          payments: { orderBy: { paidAt: 'desc' }, take: 20 },
          attendance: {
            orderBy: { checkedInAt: 'desc' },
            take: 30,
            include: { membership: { include: { plan: true } } },
          },
          sales: { orderBy: { createdAt: 'desc' }, take: 20, include: { items: true } },
        },
      });
      if (!member) throw new HttpError(404, 'Socio no encontrado');

      const now = new Date();
      const active = member.memberships.find((m) => m.status === 'ACTIVE' || m.status === 'FROZEN');
      const risk = churnRiskScore({
        lastVisitDays: member.lastVisitAt ? daysBetween(member.lastVisitAt, now) : null,
        membershipEndDays: active ? daysBetween(now, active.endDate) : null,
        totalVisits: member.totalVisits,
      });

      return ok(reply, { member, risk });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/members', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const input = validate(memberSchema, request.body);
      const orgId = req.user.organizationId;
      const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId: orgId } });
      if (!branch) throw new HttpError(400, 'Sede invalida');

      const count = await prisma.member.count({ where: { organizationId: orgId } });
      const code = input.memberCode || memberCode(count + 1);

      const member = await prisma.member.create({
        data: {
          organizationId: orgId,
          branchId: input.branchId,
          memberCode: code,
          firstName: input.firstName,
          lastName: input.lastName,
          documentType: input.documentType || null,
          documentNumber: input.documentNumber || null,
          email: input.email && input.email.length ? input.email : null,
          phone: input.phone || null,
          birthDate: input.birthDate || null,
          gender: input.gender || null,
          address: input.address || null,
          city: input.city || null,
          photoUrl: input.photoUrl || null,
          emergencyName: input.emergencyName || null,
          emergencyPhone: input.emergencyPhone || null,
          notes: input.notes || null,
          status: input.status || 'ACTIVE',
          createdBy: req.user.id,
        },
      });

      await logActivity(req, 'CREATE', 'MEMBER', member.id, undefined, { code, name: fullName(member.firstName, member.lastName) });
      return ok(reply, member, 201);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/members/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const input = validate(memberSchema, request.body);
      const existing = await prisma.member.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Socio no encontrado');

      const member = await prisma.member.update({
        where: { id },
        data: {
          branchId: input.branchId,
          firstName: input.firstName,
          lastName: input.lastName,
          documentType: input.documentType || null,
          documentNumber: input.documentNumber || null,
          email: input.email && input.email.length ? input.email : null,
          phone: input.phone || null,
          birthDate: input.birthDate || null,
          gender: input.gender || null,
          address: input.address || null,
          city: input.city || null,
          photoUrl: input.photoUrl || null,
          emergencyName: input.emergencyName || null,
          emergencyPhone: input.emergencyPhone || null,
          notes: input.notes || null,
          ...(input.status ? { status: input.status } : {}),
        },
      });

      await logActivity(req, 'UPDATE', 'MEMBER', id, existing, member);
      return ok(reply, member);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/members/:id', { onRequest: [auth, app.requireRoles(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const existing = await prisma.member.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!existing) throw new HttpError(404, 'Socio no encontrado');
      await prisma.member.update({ where: { id }, data: { status: 'INACTIVE' } });
      await logActivity(req, 'DELETE', 'MEMBER', id);
      return ok(reply, { deleted: true });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // QR del socio (para mostrar/leer en control de acceso o imprimir)
  app.get('/members/:id/qr', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const { id } = request.params as { id: string };
      const member = await prisma.member.findFirst({ where: { id, organizationId: req.user.organizationId } });
      if (!member) throw new HttpError(404, 'Socio no encontrado');
      const payload = `fitsystem://member?org=${req.user.organizationId}&code=${encodeURIComponent(member.memberCode)}&id=${id}`;
      const { default: QRCode } = await import('qrcode');
      const image = await QRCode.toDataURL(payload, { width: 512, margin: 1, color: { dark: '#0b1120', light: '#ffffff' } });
      return ok(reply, { memberId: id, memberCode: member.memberCode, payload, image });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default memberRoutes;