// Cliente HTTP para la app de socios.
// Configura la URL del servidor con la variable de entorno EXPO_PUBLIC_API_URL.
// Ejemplos:
//   - Android emulador: http://10.0.2.2:3001
//   - iOS simulador / web: http://localhost:3001
//   - Servidor en la nube: https://api.tugimnasio.com

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3001').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;

export function setToken(value: string | null) {
  token = value;
}

export function getToken() {
  return token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as { data?: T; message?: string }) : {};
  if (!res.ok) {
    throw new ApiError(res.status, json.message || `Error ${res.status}`);
  }
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Quota {
  membershipId: string;
  plan: string;
  planColor?: string;
  status: string;
  price: number;
  startDate: string;
  endDate: string;
  daysLeft: number;
  isExpired: boolean;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  currency: string;
}

export interface MemberInfo {
  id: string;
  name: string;
  memberCode: string;
  photoUrl?: string | null;
  totalVisits?: number;
  lastVisitAt?: string | null;
  branch?: string | null;
}

export interface LoginResponse {
  token: string;
  organization: OrgInfo;
  member: MemberInfo;
  quota: Quota | null;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  publishedAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  weight?: string | null;
  notes?: string | null;
  orderIndex: number;
}

export interface RoutineDay {
  id: string;
  dayIndex: number;
  label?: string | null;
  exercises: Exercise[];
}

export interface Routine {
  id: string;
  name: string;
  description?: string | null;
  goal: string;
  level: string;
  days: RoutineDay[];
}

export interface Checkin {
  id: string;
  checkedInAt: string;
  method: string;
  status: string;
}

export interface Payment {
  id: string;
  concept: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: string;
  reference?: string | null;
}

export interface PaymentIntent {
  id: string;
  concept: string;
  method: string;
  status: string;
  amount: number;
  checkoutUrl?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const portal = {
  login: (organizationSlug: string, identifier: string, password: string) =>
    request<LoginResponse>('/api/portal/auth/login', {
      method: 'POST',
      body: { organizationSlug, identifier, password },
      auth: false,
    }),

  activate: (organizationSlug: string, identifier: string, activationCode: string, password: string) =>
    request<LoginResponse>('/api/portal/auth/activate', {
      method: 'POST',
      body: { organizationSlug, identifier, activationCode, password },
      auth: false,
    }),

  me: () => request<{ organization: OrgInfo; member: MemberInfo; quota: Quota | null }>('/api/portal/me'),
  news: () => request<{ items: NewsItem[] }>('/api/portal/news'),
  routines: () => request<{ items: Routine[] }>('/api/portal/routines'),
  checkins: () => request<{ items: Checkin[] }>('/api/portal/checkins'),
  payments: () => request<{ payments: Payment[]; intents: PaymentIntent[] }>('/api/portal/payments'),

  createIntent: (method: 'MERCADOPAGO' | 'TRANSFER', concept = 'MEMBERSHIP') =>
    request<{ intent: PaymentIntent; checkoutUrl?: string | null; transfer?: { alias: string | null; amount: number } }>(
      '/api/portal/payments/intent',
      { method: 'POST', body: { method, concept } },
    ),

  registerPush: (pushToken: string, platform: 'ANDROID' | 'IOS') =>
    request<{ registered: boolean }>('/api/portal/push-token', { method: 'POST', body: { token: pushToken, platform } }),
};
