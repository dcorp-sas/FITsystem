// Tipos y constantes de dominio compartidos entre API, Web y Desktop.

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'INSTRUCTOR', 'ACCOUNTANT'] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'INACTIVE', 'FROZEN'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const PLAN_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY_PASS', 'PACKAGE', 'ANNUAL'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'FROZEN', 'PENDING'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PAYMENT_METHODS = [
  'CASH',
  'TRANSFER',
  'CARD',
  'MERCADOPAGO_QR',
  'MERCADOPAGO_POINT',
  'MERCADOPAGO_LINK',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_CONCEPTS = ['MEMBERSHIP', 'ENROLLMENT', 'FREEZE', 'PRODUCT', 'CLASS', 'OTHER'] as const;
export type PaymentConcept = (typeof PAYMENT_CONCEPTS)[number];

export const CASH_MOVEMENT_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CASH_CATEGORIES = [
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
] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUSTMENT', 'SALE', 'RETURN'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const ATTENDANCE_METHODS = ['QR', 'MANUAL', 'FINGERPRINT', 'FACE', 'CARD'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export const ACCESS_STATUSES = ['ALLOWED', 'REJECTED'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const RESERVATION_STATUSES = ['RESERVED', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'WAITLIST'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const EQUIPMENT_STATUSES = ['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['WHATSAPP', 'EMAIL', 'PUSH', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  'WELCOME',
  'MEMBERSHIP_EXPIRING',
  'MEMBERSHIP_EXPIRED',
  'PAYMENT_CONFIRMATION',
  'RENEWAL_REMINDER',
  'DEBT_NOTICE',
  'CUSTOM',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const SETTING_CATEGORIES = ['GENERAL', 'MERCADOPAGO', 'ARCA', 'WHATSAPP', 'SMTP', 'PUSH'] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export interface AuthUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  email: string;
  role: Role;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Encargado',
  RECEPTIONIST: 'Recepcion',
  INSTRUCTOR: 'Profesor',
  ACCOUNTANT: 'Contabilidad',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
  FROZEN: 'Congelado',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  MERCADOPAGO_QR: 'MercadoPago QR',
  MERCADOPAGO_POINT: 'MercadoPago Point',
  MERCADOPAGO_LINK: 'MercadoPago Link',
  OTHER: 'Otro',
};
