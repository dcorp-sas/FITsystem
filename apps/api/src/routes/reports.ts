import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ok, fail, type AuthedRequest } from '../lib/http.js';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, addDays } from '@fitsystem/utils';
import { churnRiskScore, daysBetween } from '@fitsystem/utils';

export function reportRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // Panel principal
  app.get('/reports/dashboard', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const todayStart = startOfDay(now);

      const [
        activeCount,
        pendingCount,
        suspendedCount,
        inactiveCount,
        frozenCount,
        newThisMonth,
        churnedThisMonth,
        paymentsMonth,
        todayAttendance,
        expiringSoon,
        overdue,
        overdueAmount,
      ] = await Promise.all([
        prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'PENDING' } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'SUSPENDED' } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'INACTIVE' } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'FROZEN' } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE', createdAt: { gte: monthStart } } }),
        prisma.member.count({ where: { organizationId: orgId, status: 'INACTIVE', updatedAt: { gte: monthStart } } }),
        prisma.payment.findMany({
          where: { organizationId: orgId, status: 'COMPLETED', paidAt: { gte: monthStart, lte: monthEnd } },
        }),
        prisma.member.count({ where: { organizationId: orgId, lastVisitAt: { gte: todayStart } } }),
        prisma.membership.findMany({
          where: { organizationId: orgId, status: 'ACTIVE', endDate: { gte: now, lte: addDays(now, 7) } },
          include: { member: true, plan: true },
          orderBy: { endDate: 'asc' },
          take: 10,
        }),
        prisma.membership.findMany({
          where: { organizationId: orgId, status: { in: ['ACTIVE', 'PENDING'] }, endDate: { lt: now } },
          include: { member: true, plan: true },
        }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { organizationId: orgId, status: 'PENDING' } }),
      ]);

      const incomeMonth = paymentsMonth.reduce((s, p) => s + p.amount, 0);
      const debtTotal = overdue.reduce((s, m) => s + (m.price - m.discount), 0);

      // Evolucion de los ultimos 6 meses
      const evolution = [];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
        const [income, entries, members] = await Promise.all([
          prisma.payment.aggregate({ _sum: { amount: true }, where: { organizationId: orgId, status: 'COMPLETED', paidAt: { gte: m, lte: mEnd } } }),
          prisma.attendance.count({ where: { organizationId: orgId, checkedInAt: { gte: m, lte: mEnd } } }),
          prisma.member.count({ where: { organizationId: orgId, createdAt: { lte: mEnd } } }),
        ]);
        evolution.push({
          month: m.toLocaleDateString('es-AR', { month: 'short' }),
          income: income._sum.amount ?? 0,
          entries,
          members,
        });
      }

      const expiringCount = expiringSoon.length;
      const alerts = [];
      if (overdue.length > 0) alerts.push({ severity: 'danger', title: 'Cuotas vencidas', message: `${overdue.length} socios tienen cuota vencida por $${debtTotal.toFixed(2)}` });
      if (expiringCount > 0) alerts.push({ severity: 'warning', title: 'Vencimientos proximos', message: `${expiringCount} membresias vencen esta semana` });
      const openOrders = await prisma.maintenanceOrder.count({ where: { equipment: { organizationId: orgId }, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      if (openOrders > 0) alerts.push({ severity: 'warning', title: 'Mantenimiento', message: `${openOrders} ordenes de mantenimiento abiertas` });

      return ok(reply, {
        members: {
          active: activeCount,
          pending: pendingCount,
          suspended: suspendedCount,
          inactive: inactiveCount,
          frozen: frozenCount,
          newThisMonth,
          churnedThisMonth,
          total: activeCount + frozenCount + pendingCount,
        },
        income: {
          month: incomeMonth,
          pendingToCollect: (overdueAmount._sum.amount ?? 0),
          byMethod: paymentsMonth.reduce((acc: Record<string, number>, p) => {
            acc[p.method] = (acc[p.method] ?? 0) + p.amount;
            return acc;
          }, {}),
          byConcept: paymentsMonth.reduce((acc: Record<string, number>, p) => {
            acc[p.concept] = (acc[p.concept] ?? 0) + p.amount;
            return acc;
          }, {}),
          paymentCount: paymentsMonth.length,
        },
        attendance: {
          today: todayAttendance,
          entriesToday: await prisma.attendance.count({ where: { organizationId: orgId, checkedInAt: { gte: todayStart } } }),
        },
        expiring: {
          count: expiringCount,
          items: expiringSoon.map((m) => ({
            id: m.id,
            memberName: `${m.member.firstName} ${m.member.lastName}`,
            memberCode: m.member.memberCode,
            phone: m.member.phone,
            plan: m.plan.name,
            endDate: m.endDate,
            daysLeft: daysBetween(now, m.endDate),
          })),
        },
        debts: {
          count: overdue.length,
          total: debtTotal,
        },
        alerts,
        evolution,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Facturación consolidada del gimnasio.
  app.get('/reports/income', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const query = request.query as { from?: string; to?: string };
      const orgId = req.user.organizationId;
      const from = query.from ? startOfDay(new Date(query.from)) : startOfMonth();
      const to = query.to ? endOfDay(new Date(query.to)) : endOfMonth();
      const payments = await prisma.payment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED', paidAt: { gte: from, lte: to } },
      });

      const byDate: Record<string, number> = {};
      const byMethod: Record<string, number> = {};
      const byConcept: Record<string, number> = {};
      let total = 0;
      for (const p of payments) {
        total += p.amount;
        const key = p.paidAt.toLocaleDateString('es-AR');
        byDate[key] = (byDate[key] ?? 0) + p.amount;
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
        byConcept[p.concept] = (byConcept[p.concept] ?? 0) + p.amount;
      }

      // Egresos del periodo
      const expenses = await prisma.cashMovement.findMany({
        where: { organizationId: orgId, type: 'EXPENSE', createdAt: { gte: from, lte: to } },
      });
      const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
      const byExpenseCategory: Record<string, number> = {};
      for (const e of expenses) byExpenseCategory[e.category] = (byExpenseCategory[e.category] ?? 0) + e.amount;

      return ok(reply, {
        from,
        to,
        income: total,
        payments: payments.length,
        byDate,
        byMethod,
        byConcept,
        expenses: { total: expenseTotal, count: expenses.length, byCategory: byExpenseCategory },
        net: total - expenseTotal,
      });
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Retencion: altas, bajas, renovaciones por mes
  app.get('/reports/retention', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const now = new Date();
      const rows = [];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
        const [joined, left, renewed] = await Promise.all([
          prisma.member.count({ where: { organizationId: orgId, createdAt: { gte: m, lte: mEnd } } }),
          prisma.member.count({ where: { organizationId: orgId, status: 'INACTIVE', updatedAt: { gte: m, lte: mEnd } } }),
          prisma.membership.count({ where: { organizationId: orgId, createdAt: { gte: m, lte: mEnd }, status: 'ACTIVE' } }),
        ]);
        rows.push({
          month: m.toLocaleDateString('es-AR', { month: 'short' }),
          joined,
          left,
          renewed,
          activeAtEnd: await prisma.member.count({ where: { organizationId: orgId, createdAt: { lte: mEnd }, OR: [{ status: 'ACTIVE' }, { status: 'FROZEN' }] } }),
        });
      }
      return ok(reply, rows);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Rendimiento por plan
  app.get('/reports/plans', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const plans = await prisma.plan.findMany({
        where: { organizationId: orgId },
        include: {
          memberships: {
            where: { status: { in: ['ACTIVE', 'FROZEN'] } },
            select: { price: true, discount: true },
          },
        },
      });
      const rows = plans.map((p) => {
        const active = p.memberships.length;
        const monthlyPotential = p.memberships.reduce((s, m) => s + (m.price - m.discount), 0);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          price: p.price,
          active,
          monthlyPotential,
          color: p.color,
        };
      });
      return ok(reply, rows);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Listado de riesgo de abandono (resumen para panel)
  app.get('/reports/churn', { onRequest: [auth] }, async (request, reply) => {
    try {
      const req = request as AuthedRequest;
      const orgId = req.user.organizationId;
      const members = await prisma.member.findMany({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'FROZEN'] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          lastVisitAt: true,
          totalVisits: true,
          memberships: { where: { status: 'ACTIVE' }, orderBy: { endDate: 'desc' }, take: 1, select: { endDate: true, plan: { select: { name: true } } } },
        },
      });
      const now = new Date();
      const rows = members
        .map((m) => {
          const ms = m.memberships[0];
          const risk = churnRiskScore({
            lastVisitDays: m.lastVisitAt ? daysBetween(m.lastVisitAt, now) : null,
            membershipEndDays: ms ? daysBetween(now, ms.endDate) : null,
            totalVisits: m.totalVisits,
          });
          return { id: m.id, name: `${m.firstName} ${m.lastName}`, phone: m.phone, level: risk.level, score: risk.score, lastVisitAt: m.lastVisitAt, plan: ms?.plan.name ?? null };
        })
        .filter((r) => r.level !== 'LOW')
        .sort((a, b) => b.score - a.score);
      return ok(reply, { total: rows.length, items: rows });
    } catch (error) {
      return fail(reply, error);
    }
  });
}

export default reportRoutes;
