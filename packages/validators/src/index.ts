import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const cuid = z.string().min(1);
export const optionalString = z.string().trim().optional().nullable();
const dateInput = z.coerce.date();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerOrgSchema = z.object({
  organizationName: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Solo minusculas, numeros y guiones'),
  currency: z.string().default('ARS'),
  userName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'La nueva contrasena debe tener al menos 6 caracteres'),
});

// ---------------------------------------------------------------------------
// Organizacion y sedes
// ---------------------------------------------------------------------------

export const organizationUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  taxId: optionalString,
  email: optionalString,
  phone: optionalString,
  address: optionalString,
  logoUrl: optionalString,
  currency: z.string().optional(),
  timezone: z.string().optional(),
});

export const branchSchema = z.object({
  name: z.string().min(2),
  code: optionalString,
  address: optionalString,
  phone: optionalString,
  email: optionalString,
  openingTime: z.string().optional(),
  closingTime: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'INSTRUCTOR', 'ACCOUNTANT']),
  branchId: optionalString,
  phone: optionalString,
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Configuracion / credenciales
// ---------------------------------------------------------------------------

export const settingsUpsertSchema = z.object({
  category: z.enum(['GENERAL', 'MERCADOPAGO', 'ARCA', 'WHATSAPP', 'SMTP', 'PUSH', 'PRINT', 'FACE', 'ATTENDANCE']),
  values: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// Socios
// ---------------------------------------------------------------------------

export const memberSchema = z.object({
  branchId: cuid,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.enum(['DNI', 'CUIT', 'PASSPORT', 'OTHER']).optional().nullable(),
  documentNumber: optionalString,
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  phone: optionalString,
  birthDate: dateInput.optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional().nullable(),
  address: optionalString,
  city: optionalString,
  photoUrl: optionalString,
  emergencyName: optionalString,
  emergencyPhone: optionalString,
  notes: optionalString,
  status: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED', 'INACTIVE', 'FROZEN']).optional(),
  memberCode: optionalString,
  // Al crear: enviar las credenciales de acceso a la app por email al socio.
  notify: z.boolean().optional(),
});

export const memberImportRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentNumber: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  planName: z.string().optional(),
  branchName: z.string().optional(),
});

export const memberImportSchema = z.object({
  csv: z.string().min(1, 'El CSV esta vacio'),
  branchId: cuid.optional(),
  defaultPlanId: cuid.optional(),
  fileName: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

export const planSchema = z.object({
  name: z.string().min(1),
  description: optionalString,
  type: z.enum(['MONTHLY', 'WEEKLY', 'DAILY_PASS', 'PACKAGE', 'ANNUAL']),
  price: z.coerce.number().min(0),
  currency: z.string().optional(),
  durationDays: z.coerce.number().int().min(1),
  sessionsLimit: z.coerce.number().int().min(0).optional().nullable(),
  allowFreeze: z.boolean().optional(),
  maxFreezeDays: z.coerce.number().int().min(0).optional(),
  freezeFee: z.coerce.number().min(0).optional(),
  signupFee: z.coerce.number().min(0).optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Membresias y pausas
// ---------------------------------------------------------------------------

export const membershipSchema = z.object({
  memberId: cuid,
  planId: cuid,
  branchId: cuid,
  startDate: dateInput,
  endDate: dateInput.optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  autoRenew: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'FROZEN', 'PENDING']).optional(),
});

export const membershipFreezeSchema = z.object({
  startDate: dateInput,
  endDate: dateInput,
  reason: optionalString,
  fee: z.coerce.number().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

export const paymentSchema = z.object({
  memberId: z.string().optional().nullable(),
  membershipId: z.string().optional().nullable(),
  concept: z.enum(['MEMBERSHIP', 'ENROLLMENT', 'FREEZE', 'PRODUCT', 'CLASS', 'OTHER']),
  method: z.enum([
    'CASH',
    'TRANSFER',
    'CARD',
    'MERCADOPAGO_QR',
    'MERCADOPAGO_POINT',
    'MERCADOPAGO_LINK',
    'OTHER',
  ]),
  amount: z.coerce.number().min(0),
  reference: optionalString,
  notes: optionalString,
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED']).optional(),
});

// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------

export const cashSessionOpenSchema = z.object({
  openingAmount: z.coerce.number().min(0).default(0),
  branchId: cuid,
});

export const cashSessionCloseSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: optionalString,
});

export const cashMovementSchema = z.object({
  branchId: cuid,
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.enum([
    'MEMBERSHIP',
    'PRODUCT_SALE',
    'ENROLLMENT',
    'FREEZE',
    'CLASS',
    'VOUCHER',
    'SALARY',
    'RENT',
    'SUPPLIES',
    'MAINTENANCE',
    'TAXES',
    'SERVICES',
    'OTHER',
  ]),
  method: z
    .enum(['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_POINT', 'MERCADOPAGO_LINK', 'OTHER'])
    .default('CASH'),
  amount: z.coerce.number().positive(),
  description: optionalString,
  memberId: optionalString,
  cashSessionId: optionalString,
});

// ---------------------------------------------------------------------------
// Minishop / inventario
// ---------------------------------------------------------------------------

export const productCategorySchema = z.object({
  name: z.string().min(1),
});

export const productSchema = z.object({
  name: z.string().min(1),
  categoryId: optionalString,
  sku: optionalString,
  barcode: optionalString,
  description: optionalString,
  cost: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().int().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  unit: z.string().optional(),
  imageUrl: optionalString,
  isActive: z.boolean().optional(),
  expiresAt: dateInput.optional().nullable(),
});

export const stockMovementSchema = z.object({
  productId: cuid,
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'SALE', 'RETURN']),
  quantity: z.coerce.number().int(),
  unitCost: z.coerce.number().min(0).optional(),
  reason: optionalString,
});

export const saleSchema = z.object({
  branchId: cuid,
  memberId: optionalString,
  method: z.enum(['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_POINT', 'MERCADOPAGO_LINK', 'OTHER']),
  discount: z.coerce.number().min(0).optional(),
  notes: optionalString,
  items: z
    .array(
      z.object({
        productId: cuid,
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Acceso / asistencia
// ---------------------------------------------------------------------------

export const attendanceCheckinSchema = z.object({
  branchId: cuid,
  memberId: z.string().optional(),
  qr: z.string().optional(),
  method: z.enum(['QR', 'MANUAL', 'FINGERPRINT', 'FACE', 'CARD', 'TURNSTILE']).default('MANUAL'),
});

export const hardwareDeviceSchema = z.object({
  branchId: cuid,
  platform: z.string().max(160).optional(),
  devices: z
    .array(
      z.object({
        kind: z.enum(['FINGERPRINT', 'CARD', 'QR', 'FACE', 'TURNSTILE']),
        label: z.string().min(1).max(120),
        method: z.enum(['QR', 'MANUAL', 'FINGERPRINT', 'FACE', 'CARD', 'TURNSTILE']),
        available: z.boolean(),
        source: z.string().max(60).optional(),
        detail: optionalString,
      }),
    )
    .max(50),
});

// ---------------------------------------------------------------------------
// Reconocimiento facial
// ---------------------------------------------------------------------------

const descriptor512 = z.array(z.number()).min(16).max(2048);

export const faceEnrollSchema = z.object({
  descriptors: z.array(descriptor512).min(1).max(12),
});

export const faceCheckinSchema = z.object({
  branchId: cuid,
  descriptor: descriptor512,
});

// ---------------------------------------------------------------------------
// Clases / profesores
// ---------------------------------------------------------------------------

export const instructorSchema = z.object({
  name: z.string().min(2),
  branchId: optionalString,
  userId: optionalString,
  email: optionalString,
  phone: optionalString,
  specialty: optionalString,
  hourlyRate: z.coerce.number().min(0).optional(),
  classRate: z.coerce.number().min(0).optional(),
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const gymClassSchema = z.object({
  name: z.string().min(1),
  branchId: cuid,
  instructorId: optionalString,
  description: optionalString,
  capacity: z.coerce.number().int().min(1).optional(),
  durationMin: z.coerce.number().int().min(1).optional(),
  room: optionalString,
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const classSessionSchema = z.object({
  classId: cuid,
  startAt: dateInput,
  endAt: dateInput.optional().nullable(),
  instructorId: optionalString,
  capacity: z.coerce.number().int().min(1).optional(),
  room: optionalString,
});

export const reservationSchema = z.object({
  sessionId: cuid,
  memberId: cuid,
  status: z.enum(['RESERVED', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'WAITLIST']).optional(),
});

export const instructorPaymentSchema = z.object({
  instructorId: cuid,
  periodStart: dateInput,
  periodEnd: dateInput,
  hours: z.coerce.number().min(0).optional(),
  classesCount: z.coerce.number().int().min(0).optional(),
  rate: z.coerce.number().min(0).optional(),
  commission: z.coerce.number().min(0).optional(),
  amount: z.coerce.number().min(0),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Equipos / mantenimiento
// ---------------------------------------------------------------------------

export const equipmentSchema = z.object({
  name: z.string().min(1),
  branchId: cuid,
  category: optionalString,
  brand: optionalString,
  model: optionalString,
  serialNumber: optionalString,
  location: optionalString,
  purchaseDate: dateInput.optional().nullable(),
  warrantyUntil: dateInput.optional().nullable(),
  status: z.enum(['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED']).optional(),
  notes: optionalString,
});

export const maintenanceOrderSchema = z.object({
  equipmentId: cuid,
  type: z.enum(['PREVENTIVE', 'CORRECTIVE']).optional(),
  title: z.string().min(1),
  description: optionalString,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  assignedTo: optionalString,
  cost: z.coerce.number().min(0).optional(),
  scheduledAt: dateInput.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

export const notificationTemplateSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH', 'SMS']),
  event: z.enum([
    'WELCOME',
    'MEMBERSHIP_EXPIRING',
    'MEMBERSHIP_EXPIRED',
    'PAYMENT_CONFIRMATION',
    'RENEWAL_REMINDER',
    'DEBT_NOTICE',
    'CUSTOM',
  ]),
  subject: optionalString,
  body: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const sendNotificationSchema = z.object({
  memberId: cuid,
  channel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH', 'SMS']),
  event: z.enum([
    'WELCOME',
    'MEMBERSHIP_EXPIRING',
    'MEMBERSHIP_EXPIRED',
    'PAYMENT_CONFIRMATION',
    'RENEWAL_REMINDER',
    'DEBT_NOTICE',
    'CUSTOM',
  ]),
  templateId: optionalString,
  body: z.string().optional(),
  scheduledAt: dateInput.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Integraciones MercadoPago / ARCA
// ---------------------------------------------------------------------------

export const mpQrCreateSchema = z.object({
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  concept: z.enum(['MEMBERSHIP', 'ENROLLMENT', 'FREEZE', 'PRODUCT', 'CLASS', 'OTHER']).default('MEMBERSHIP'),
  memberId: optionalString,
  membershipId: optionalString,
  externalReference: optionalString,
});

export const mpPointCreateSchema = z.object({
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  concept: z.enum(['MEMBERSHIP', 'ENROLLMENT', 'FREEZE', 'PRODUCT', 'CLASS', 'OTHER']).default('MEMBERSHIP'),
  deviceId: optionalString,
  memberId: optionalString,
  membershipId: optionalString,
  externalReference: optionalString,
});

export const arcaInvoiceSchema = z.object({
  paymentId: cuid,
  invoiceType: z.enum(['B', 'C', 'A']).default('C'),
  customerTaxId: optionalString,
});

export const arcaCreditNoteSchema = z.object({
  paymentId: cuid,
  invoiceType: z.enum(['B', 'C', 'A']).default('C'),
  customerTaxId: optionalString,
  reason: optionalString,
});

export const arcaPointOfSaleSchema = z.object({
  branchId: cuid,
  pointOfSale: z.coerce.number().int().min(0).max(9999),
});

// ---------------------------------------------------------------------------
// 2FA y observabilidad
// ---------------------------------------------------------------------------

export const twoFactorChallengeSchema = z.object({
  challenge: z.string().min(1),
});

export const twoFactorLoginSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().min(4).max(20),
  method: z.enum(['totp', 'email', 'backup']).optional(),
});

export const twoFactorEnableSchema = z.object({
  code: z.string().min(6).max(20),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().max(20).optional(),
});

export const observabilityUpdateSchema = z.object({
  OBS_WEBHOOK_URL: z.string().trim().url().or(z.literal('')).optional(),
  OBS_ALERTS_ENABLED: z.enum(['true', 'false']).optional(),
  OBS_MIN_LEVEL: z.enum(['error', 'warn', 'info']).optional(),
  OBS_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
});

export const retentionPurgeSchema = z.object({
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export const onboardingToggleSchema = z.object({
  key: z.string().min(1).max(80),
  done: z.boolean(),
});

export const arcaPointPrintSchema = z.object({
  paymentId: optionalString,
  deviceId: optionalString,
  reference: optionalString,
});


// ---------------------------------------------------------------------------
// Portal de socios (app movil)
// ---------------------------------------------------------------------------

// El gimnasio (organizationSlug) es opcional: si no viene, el sistema resuelve
// la organizacion a partir del DNI/email del socio (busqueda global).
export const portalLoginSchema = z.object({
  organizationSlug: z.string().min(1).optional(),
  identifier: z.string().min(3), // DNI, email, legajo o telefono
  password: z.string().min(1),
});

export const portalActivateSchema = z.object({
  organizationSlug: z.string().min(1).optional(),
  identifier: z.string().min(3),
  activationCode: z.string().min(4),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
});

export const portalPushTokenSchema = z.object({
  token: z.string().min(4),
  platform: z.enum(['ANDROID', 'IOS']).default('ANDROID'),
});

export const portalPaymentIntentSchema = z.object({
  concept: z.enum(['MEMBERSHIP', 'ENROLLMENT', 'FREEZE', 'PRODUCT', 'CLASS', 'OTHER']).default('MEMBERSHIP'),
  method: z.enum(['MERCADOPAGO', 'TRANSFER']).default('MERCADOPAGO'),
  membershipId: optionalString,
  amount: z.coerce.number().min(0).optional(),
});

export const portalProofSchema = z.object({
  proofUrl: z.string().min(1),
  notes: optionalString,
});

export const portalCheckinSchema = z.object({
  branchId: optionalString,
  method: z.enum(['QR', 'MANUAL', 'FACE', 'CARD']).default('MANUAL'),
  // Payload del QR fijo del gimnasio que el socio escanea con la app.
  qr: optionalString,
});

export const portalReserveSchema = z.object({
  sessionId: cuid,
});

export const mpPointPollSchema = z.object({
  intentId: z.string().min(1),
});

export const routineSchema = z.object({
  name: z.string().min(1),
  memberId: optionalString,
  description: optionalString,
  goal: z.enum(['STRENGTH', 'CARDIO', 'LOSS', 'HYPERTROPHY', 'MOBILITY', 'OTHER']).default('OTHER'),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  isTemplate: z.boolean().optional(),
  isActive: z.boolean().optional(),
  days: z
    .array(
      z.object({
        dayIndex: z.coerce.number().int().min(1).max(7),
        label: optionalString,
        notes: optionalString,
        exercises: z
          .array(
            z.object({
              name: z.string().min(1),
              sets: z.coerce.number().int().min(1).default(3),
              reps: z.string().default('10'),
              restSec: z.coerce.number().int().min(0).default(60),
              weight: optionalString,
              notes: optionalString,
              orderIndex: z.coerce.number().int().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export const routineLogSchema = z.object({
  routineId: optionalString,
  exerciseId: optionalString,
  exerciseName: z.string().min(1),
  dayIndex: z.coerce.number().int().min(1).max(7).optional(),
  sets: z.coerce.number().int().min(0).optional(),
  reps: optionalString,
  weight: optionalString,
  notes: optionalString,
  completedAt: z.string().datetime().optional(),
});

export const newsPostSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  branchId: optionalString,
  imageUrl: optionalString,
  isPublished: z.boolean().optional(),
  expiresAt: dateInput.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Licencias
// ---------------------------------------------------------------------------

export const licenseActivateSchema = z.object({
  installationId: z.string().min(4),
  licenseKey: z.string().min(4),
  machineName: optionalString,
});

export const licenseValidateSchema = z.object({
  installationId: z.string().min(4),
  licenseKey: optionalString,
  machineName: optionalString,
  // Ancla de primera ejecución (registro de Windows) para que la prueba no se
  // reinicie al reinstalar el sistema. Solo se usa si es anterior a la fecha actual.
  firstRunAt: optionalString,
});

export const licenseSeatSchema = z.object({
  installationId: z.string().min(4),
  delta: z.coerce.number().int(),
});

export const orgLicenseActivateSchema = z.object({
  licenseKey: z.string().min(4),
  machineName: optionalString,
});

// ---------------------------------------------------------------------------
// Cuentas del portal (admin del gimnasio)
// ---------------------------------------------------------------------------

export const portalAccountSchema = z.object({
  email: optionalString,
  password: z.string().min(6).optional(),
  generateCode: z.boolean().optional(),
});

export const portalInviteSchema = z.object({
  email: optionalString,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;
export type MemberInput = z.infer<typeof memberSchema>;
export type PlanInput = z.infer<typeof planSchema>;
export type MembershipInput = z.infer<typeof membershipSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type InstructorInput = z.infer<typeof instructorSchema>;
export type GymClassInput = z.infer<typeof gymClassSchema>;
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type MaintenanceOrderInput = z.infer<typeof maintenanceOrderSchema>;
export type NotificationTemplateInput = z.infer<typeof notificationTemplateSchema>;
