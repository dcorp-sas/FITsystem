export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'INSTRUCTOR' | 'ACCOUNTANT';

export interface AuthUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  email: string;
  role: Role;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  timezone?: string | null;
}

export interface Branch {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
  isActive: boolean;
  _count?: { members?: number; memberships?: number };
}

export interface Member {
  id: string;
  organizationId: string;
  branchId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  documentType?: string | null;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  photoUrl?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  notes?: string | null;
  status: string;
  totalVisits: number;
  lastVisitAt?: string | null;
  createdAt: string;
  branch?: Branch;
  memberships?: Membership[];
  payments?: Payment[];
  attendance?: Attendance[];
  sales?: Sale[];
  risk?: { score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' };
}

export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  price: number;
  currency: string;
  durationDays: number;
  sessionsLimit?: number | null;
  allowFreeze: boolean;
  maxFreezeDays: number;
  freezeFee: number;
  signupFee: number;
  color: string;
  isActive: boolean;
  _count?: { memberships: number };
}

export interface Membership {
  id: string;
  memberId: string;
  planId: string;
  planName?: string;
  planColor?: string;
  member?: { id: string; name: string; phone?: string | null; email?: string | null; memberCode: string };
  plan?: Plan;
  startDate: string;
  endDate: string;
  status: string;
  price: number;
  discount: number;
  autoRenew: boolean;
  frozenDays: number;
  daysLeft?: number;
  freezes?: unknown[];
  payments?: Payment[];
}

export interface Payment {
  id: string;
  concept: string;
  method: string;
  status: string;
  amount: number;
  reference?: string | null;
  paidAt: string;
  createdAt: string;
  notes?: string | null;
  invoiceNumber?: string | null;
  member?: { id?: string; firstName: string; lastName: string; memberCode?: string; documentNumber?: string | null } | null;
  receivedBy?: { name: string } | null;
}

export interface CashMovement {
  id: string;
  type: string;
  category: string;
  method: string;
  amount: number;
  description?: string | null;
  createdAt: string;
  member?: { firstName: string; lastName: string } | null;
}

export interface CashSession {
  id: string;
  branchId: string;
  status: string;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  openedAt: string;
  closedAt?: string | null;
  openedBy?: { name: string } | null;
  closedBy?: { name: string } | null;
  branch?: { name: string };
  movements?: CashMovement[];
  totals?: { income: number; expense: number; expected: number };
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  unit: string;
  isActive: boolean;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
}

export interface ProductCategory {
  id: string;
  name: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  number: string;
  subtotal: number;
  discount: number;
  total: number;
  method: string;
  status: string;
  createdAt: string;
  items: SaleItem[];
  member?: { firstName: string; lastName: string } | null;
  user?: { name: string } | null;
}

export interface Attendance {
  id: string;
  method: string;
  status: string;
  checkedInAt: string;
  member?: { id?: string; firstName: string; lastName: string; memberCode?: string; photoUrl?: string | null } | null;
  membership?: { plan?: { name: string; color: string } } | null;
}

export interface Instructor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  specialty?: string | null;
  hourlyRate: number;
  classRate: number;
  commissionPct: number;
  color: string;
  isActive: boolean;
  branchId?: string | null;
  userId?: string | null;
  _count?: { classes: number };
  availability?: unknown[];
}

export interface GymClass {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  durationMin: number;
  room?: string | null;
  color: string;
  isActive: boolean;
  branchId: string;
  instructorId?: string | null;
  instructor?: { id: string; name: string } | null;
  _count?: { sessions: number };
}

export interface ClassSession {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  room?: string | null;
  gymClass?: { id: string; name: string; color: string; description?: string | null } | null;
  instructor?: { id: string; name: string; color: string } | null;
  _count?: { reservations: number };
}

export interface Equipment {
  id: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  status: string;
  branchId: string;
  branch?: { name: string };
  orders?: MaintenanceOrder[];
}

export interface MaintenanceOrder {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  assignedTo?: string | null;
  cost: number;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  equipmentId: string;
  equipment?: { id: string; name: string; branchId: string } | null;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: string;
  event: string;
  subject?: string | null;
  body: string;
  isActive: boolean;
}

export interface AppNotification {
  id: string;
  channel: string;
  event: string;
  status: string;
  subject?: string | null;
  body: string;
  createdAt: string;
  member?: { firstName: string; lastName: string; phone?: string | null } | null;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
}

export interface DashboardData {
  members: {
    active: number;
    pending: number;
    suspended: number;
    inactive: number;
    frozen: number;
    newThisMonth: number;
    churnedThisMonth: number;
    total: number;
  };
  income: {
    month: number;
    pendingToCollect: number;
    byMethod: Record<string, number>;
    byConcept: Record<string, number>;
    paymentCount: number;
  };
  attendance: { today: number; entriesToday: number };
  expiring: {
    count: number;
    items: {
      id: string;
      memberName: string;
      memberCode: string;
      phone?: string | null;
      plan: string;
      endDate: string;
      daysLeft: number;
    }[];
  };
  debts: { count: number; total: number };
  alerts: { severity: 'danger' | 'warning' | 'info'; title: string; message: string }[];
  evolution: { month: string; income: number; entries: number; members: number }[];
}
