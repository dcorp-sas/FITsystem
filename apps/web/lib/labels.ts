export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Encargado',
  RECEPTIONIST: 'Recepción',
  INSTRUCTOR: 'Profesor',
  ACCOUNTANT: 'Contabilidad',
};

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
  FROZEN: 'Congelado',
};

export const PLAN_TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  WEEKLY: 'Semanal',
  DAILY_PASS: 'Pase diario',
  PACKAGE: 'Paquete',
  ANNUAL: 'Anual',
};

export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  FROZEN: 'Congelada',
  PENDING: 'Pendiente',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  MERCADOPAGO_QR: 'MercadoPago QR',
  MERCADOPAGO_POINT: 'MercadoPago Point',
  MERCADOPAGO_LINK: 'MercadoPago Link',
  OTHER: 'Otro',
};

export const PAYMENT_CONCEPT_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Membresía',
  ENROLLMENT: 'Inscripción',
  FREEZE: 'Pausa',
  PRODUCT: 'Producto',
  CLASS: 'Clase',
  OTHER: 'Otro',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
  REFUNDED: 'Reembolsado',
  CANCELLED: 'Cancelado',
};

export const CASH_CATEGORY_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Cuota',
  PRODUCT_SALE: 'Venta producto',
  ENROLLMENT: 'Inscripción',
  FREEZE: 'Pausa',
  CLASS: 'Clase',
  VOUCHER: 'Voucher',
  SALARY: 'Sueldos',
  RENT: 'Alquiler',
  SUPPLIES: 'Insumos',
  MAINTENANCE: 'Mantenimiento',
  TAXES: 'Impuestos',
  SERVICES: 'Servicios',
  OTHER: 'Otros',
};

export const ATTENDANCE_METHOD_LABELS: Record<string, string> = {
  QR: 'QR',
  MANUAL: 'Manual',
  FINGERPRINT: 'Huella',
  FACE: 'Reconocimiento facial',
  CARD: 'Tarjeta',
  TURNSTILE: 'Molinete',
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: 'Operativo',
  MAINTENANCE: 'En mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
  RETIRED: 'Retirado',
};

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Abierta',
  IN_PROGRESS: 'En progreso',
  DONE: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const MAINTENANCE_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PUSH: 'App del socio',
};

export const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  WELCOME: 'Bienvenida',
  MEMBERSHIP_EXPIRING: 'Membresía por vencer',
  MEMBERSHIP_EXPIRED: 'Membresía vencida',
  PAYMENT_CONFIRMATION: 'Confirmación de pago',
  RENEWAL_REMINDER: 'Recordatorio de renovación',
  DEBT_NOTICE: 'Aviso de deuda',
  CUSTOM: 'Personalizado',
};

export const RISK_LABELS: Record<string, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
};

export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return '-';
  return map[key] || key;
}