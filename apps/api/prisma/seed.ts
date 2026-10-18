import { PrismaClient, type Plan } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Sembrando FIT system™...');

  const now = new Date();

  const org = await prisma.organization.upsert({
    where: { slug: 'fit-demo' },
    update: { name: 'FIT system™ Demo' },
    create: {
      name: 'FIT system™ Demo',
      slug: 'fit-demo',
      taxId: '30-12345678-9',
      email: 'contacto@fitsystem.com.ar',
      phone: '+54 11 1234 5678',
      address: 'Av. Corrientes 1234',
      currency: 'ARS',
    },
  });

  const central = await prisma.branch.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Sede Central' } },
    update: {},
    create: { organizationId: org.id, name: 'Sede Central', code: 'SC', address: 'Av. Corrientes 1234' },
  });

  const norte = await prisma.branch.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Sede Norte' } },
    update: {},
    create: { organizationId: org.id, name: 'Sede Norte', code: 'SN', address: 'Av. Cabildo 3000' },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);
  const owner = await prisma.user.upsert({
    where: { email: 'admin@fitsystem.local' },
    update: {},
    create: {
      organizationId: org.id,
      branchId: central.id,
      name: 'Admin FIT',
      email: 'admin@fitsystem.local',
      passwordHash,
      role: 'OWNER',
    },
  });
  console.log(`Usuario demo: ${owner.email} / admin123`);

  const staff = await prisma.user.upsert({
    where: { email: 'recepcion@fitsystem.local' },
    update: {},
    create: {
      organizationId: org.id,
      branchId: central.id,
      name: 'Recepcion 1',
      email: 'recepcion@fitsystem.local',
      passwordHash,
      role: 'RECEPTIONIST',
    },
  });

  // Planes
  const planData = [
    { name: 'Mensual', type: 'MONTHLY', price: 25000, durationDays: 30, color: '#2563eb', allowFreeze: true, maxFreezeDays: 15, freezeFee: 1000 },
    { name: 'Pase Diario', type: 'DAILY_PASS', price: 1500, durationDays: 1, color: '#0ea5e9' },
    { name: 'Mensual + Clases', type: 'MONTHLY', price: 35000, durationDays: 30, color: '#8b5cf6', allowFreeze: true, maxFreezeDays: 10 },
    { name: 'Trimestral', type: 'MONTHLY', price: 66000, durationDays: 90, color: '#10b981', allowFreeze: true, maxFreezeDays: 30 },
    { name: 'Pack 10 clases', type: 'PACKAGE', price: 18000, durationDays: 90, sessionsLimit: 10, color: '#f59e0b' },
  ];

  const plans = new Map<string, Plan>();
  for (const p of planData) {
    const plan = await prisma.plan.upsert({
      where: { organizationId_name: { organizationId: org.id, name: p.name } },
      update: {},
      create: { organizationId: org.id, ...p },
    });
    plans.set(p.name, plan);
  }

  // Instructores
  const instructor = await prisma.instructor.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Luciana Perez' } },
    update: {},
    create: {
      organizationId: org.id,
      branchId: central.id,
      name: 'Luciana Perez',
      email: 'luciana@fitsystem.local',
      specialty: 'Funcional',
      hourlyRate: 5000,
      commissionPct: 10,
      color: '#0ea5e9',
    },
  });

  // Clases
  const yoga = await prisma.gymClass.upsert({
    where: { organizationId_branchId_name: { organizationId: org.id, branchId: central.id, name: 'Yoga' } },
    update: {},
    create: { organizationId: org.id, branchId: central.id, instructorId: instructor.id, name: 'Yoga', capacity: 20, durationMin: 60, room: 'Sala A', color: '#a855f7' },
  });

  // Socios demo
  const memberSeed = [
    { firstName: 'Juan', lastName: 'Gomez', phone: '+5491111111111', email: 'juan@mail.com', plan: 'Mensual' },
    { firstName: 'María', lastName: 'Lopez', phone: '+5491122222222', email: 'maria@mail.com', plan: 'Mensual + Clases' },
    { firstName: 'Carlos', lastName: 'Diaz', phone: '+5491133333333', plan: 'Trimestral' },
    { firstName: 'Ana', lastName: 'Fernandez', phone: '+5491144444444', email: 'ana@mail.com', plan: 'Pack 10 clases' },
    { firstName: 'Pedro', lastName: 'Ramirez', phone: '+5491155555555', plan: 'Mensual' },
    { firstName: 'Sofia', lastName: 'Martinez', phone: '+5491166666666', plan: 'Pase Diario' },
  ];

  let seq = 0;
  for (const m of memberSeed) {
    seq++;
    const exists = await prisma.member.findUnique({
      where: { organizationId_memberCode: { organizationId: org.id, memberCode: `000${seq}` } },
    });
    if (exists) continue;
    const member = await prisma.member.create({
      data: {
        organizationId: org.id,
        branchId: seq % 3 === 0 ? norte.id : central.id,
        memberCode: `000${seq}`,
        firstName: m.firstName,
        lastName: m.lastName,
        documentNumber: `30${String(12345678 + seq * 100)}${seq}`,
        email: m.email || null,
        phone: m.phone,
        status: 'ACTIVE',
        joinedAt: new Date(now.getTime() - seq * 10 * 86400000),
        createdBy: owner.id,
      },
    });
    const plan = plans.get(m.plan)!;
    const daysAgo = seq * 12;
    const start = new Date(now.getTime() - daysAgo * 86400000);
    const end = new Date(now.getTime() + (30 - daysAgo) * 86400000);
    const membership = await prisma.membership.create({
      data: {
        organizationId: org.id,
        branchId: member.branchId,
        memberId: member.id,
        planId: plan.id,
        startDate: start,
        endDate: end,
        price: plan.price,
        status: 'ACTIVE',
        soldById: owner.id,
      },
    });
    await prisma.payment.create({
      data: {
        organizationId: org.id,
        branchId: member.branchId,
        memberId: member.id,
        membershipId: membership.id,
        concept: 'MEMBERSHIP',
        method: seq % 2 === 0 ? 'TRANSFER' : 'CASH',
        status: 'COMPLETED',
        amount: plan.price,
        reference: `RE-0000${seq}`,
        paidAt: new Date(now.getTime() - daysAgo * 86400000),
        receivedById: staff.id,
      },
    });
    // Asistencias
    for (let v = 0; v < 6; v++) {
      await prisma.attendance.create({
        data: {
          organizationId: org.id,
          branchId: member.branchId,
          memberId: member.id,
          membershipId: membership.id,
          method: 'MANUAL',
          status: 'ALLOWED',
          checkedInAt: new Date(now.getTime() - v * 3 * 86400000),
          registeredById: staff.id,
        },
      });
    }
    await prisma.member.update({
      where: { id: member.id },
      data: { totalVisits: 6, lastVisitAt: new Date(now.getTime() - 3 * 86400000) },
    });
  }

  // Portal de socios (app movil): cuentas con acceso
  const allMembers = await prisma.member.findMany({
    where: { organizationId: org.id },
    orderBy: { memberCode: 'asc' },
  });
  const portalPasswordHash = await bcrypt.hash('socio123', 10);
  for (const m of allMembers) {
    await prisma.portalAccount.upsert({
      where: { memberId: m.id },
      update: {},
      create: {
        organizationId: org.id,
        memberId: m.id,
        email: m.email,
        documentNumber: m.documentNumber,
        passwordHash: portalPasswordHash,
        isActive: true,
      },
    });
  }
  console.log('Portal socios demo: usar email o documento / socio123');

  // Rutina demo para el primer socio
  const firstMember = allMembers[0];
  if (firstMember) {
    const existingRoutine = await prisma.routine.findFirst({
      where: { organizationId: org.id, memberId: firstMember.id },
    });
    if (!existingRoutine) {
      await prisma.routine.create({
        data: {
          organizationId: org.id,
          memberId: firstMember.id,
          name: 'Rutina Fuerza - Semana 1',
          description: 'Rutina de introduccion para ganar fuerza general.',
          goal: 'STRENGTH',
          level: 'BEGINNER',
          createdById: owner.id,
          days: {
            create: [
              {
                dayIndex: 1,
                label: 'Dia 1 - Pecho y Triceps',
                exercises: {
                  create: [
                    { name: 'Press banca', sets: 4, reps: '10-12', restSec: 90, orderIndex: 0 },
                    { name: 'Press inclinado con mancuernas', sets: 3, reps: '12', restSec: 60, orderIndex: 1 },
                    { name: 'Fondos en banco', sets: 3, reps: '15', restSec: 60, orderIndex: 2 },
                  ],
                },
              },
              {
                dayIndex: 2,
                label: 'Dia 2 - Espalda y Biceps',
                exercises: {
                  create: [
                    { name: 'Remo con barra', sets: 4, reps: '10', restSec: 90, orderIndex: 0 },
                    { name: 'Jalon al pecho', sets: 3, reps: '12', restSec: 60, orderIndex: 1 },
                    { name: 'Curl de biceps con barra', sets: 3, reps: '12', restSec: 45, orderIndex: 2 },
                  ],
                },
              },
            ],
          },
        },
      });
    }
  }

  // Novedad demo
  const existingNews = await prisma.newsPost.findFirst({
    where: { organizationId: org.id, title: 'Bienvenidos a la app!' },
  });
  if (!existingNews) {
    await prisma.newsPost.create({
      data: {
        organizationId: org.id,
        branchId: central.id,
        title: 'Bienvenidos a la app!',
        body: 'Ya podes ver tu cuota, tus ingresos, pagar online y seguir tus rutinas desde el celular.',
        createdById: owner.id,
      },
    });
  }

  // Clase demo en 2 dias (idempotente: una sola sesion por clase)
  const existingSession = await prisma.classSession.findFirst({ where: { classId: yoga.id } });
  if (!existingSession) {
    const sessionStart = new Date(now.getTime() + 2 * 86400000);
    sessionStart.setHours(10, 0, 0, 0);
    await prisma.classSession.create({
      data: {
        classId: yoga.id,
        branchId: central.id,
        instructorId: instructor.id,
        startAt: sessionStart,
        endAt: new Date(sessionStart.getTime() + 60 * 60000),
        capacity: 20,
        room: 'Sala A',
      },
    });
  }

  // Plantilla de notificacion WhatsApp
  await prisma.notificationTemplate.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Vencimiento WhatsApp' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Vencimiento WhatsApp',
      channel: 'WHATSAPP',
      event: 'MEMBERSHIP_EXPIRING',
      body: 'Hola {{firstName}}, tu membresia de {{plan}} vence el {{endDate}}. Renova hoy y segui entrenando! {{gym}}',
      isActive: true,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Pago confirmado' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Pago confirmado',
      channel: 'WHATSAPP',
      event: 'PAYMENT_CONFIRMATION',
      body: 'Hola {{firstName}}, recibimos tu pago de {{amount}} por {{plan}}. Gracias por elegir {{gym}}!',
      isActive: true,
    },
  });

  // Settings demo
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId: org.id, category: 'MERCADOPAGO', key: 'POINT_DEVICE_ID' } },
    update: {},
    create: { organizationId: org.id, category: 'MERCADOPAGO', key: 'POINT_DEVICE_ID', value: 'POINT-001' },
  });
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId: org.id, category: 'ARCA', key: 'CUIT' } },
    update: {},
    create: { organizationId: org.id, category: 'ARCA', key: 'CUIT', value: '30123456789' },
  });
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId: org.id, category: 'ARCA', key: 'PUNTO_VENTA' } },
    update: {},
    create: { organizationId: org.id, category: 'ARCA', key: 'PUNTO_VENTA', value: '1' },
  });
  await prisma.setting.upsert({
    where: { organizationId_category_key: { organizationId: org.id, category: 'ARCA', key: 'ENVIRONMENT' } },
    update: {},
    create: { organizationId: org.id, category: 'ARCA', key: 'ENVIRONMENT', value: 'HOMOLOGACION' },
  });

  console.log('✅ Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });