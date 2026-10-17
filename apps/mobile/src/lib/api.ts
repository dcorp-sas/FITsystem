// Cliente HTTP para la app de socios.
// Configura la URL del servidor con la variable de entorno EXPO_PUBLIC_API_URL.
// Ejemplos:
//   - Android emulador: http://10.0.2.2:3001
//   - iOS simulador / web: http://localhost:3001
//   - Servidor en la nube: https://api.tugimnasio.com

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL = Platform.OS === 'web' ? 'http://127.0.0.1:3001' : 'http://10.0.2.2:3001';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;

// El token persiste para que la sesión sobreviva a una recarga (PWA) y al
// cierre/reapertura de la app en nativo (SecureStore).
const STORAGE_KEY = 'fitsystem.socios.token';

async function persistToken(value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        if (value) localStorage.setItem(STORAGE_KEY, value);
        else localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      if (value) await SecureStore.setItemAsync(STORAGE_KEY, value);
      else await SecureStore.deleteItemAsync(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Pide al service worker que vacíe la caché de datos de la API (PWA). */
function clearOfflineCache() {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'clear-api-cache' });
    }
  } catch {
    /* ignore */
  }
}

/** Carga el token guardado (si existe) para restaurar la sesión al abrir la app. */
export async function bootstrapToken(): Promise<string | null> {
  try {
    const stored =
      Platform.OS === 'web'
        ? (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null)
        : await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored) token = stored;
    return stored;
  } catch {
    return token;
  }
}

export function setToken(value: string | null) {
  token = value;
  // Siempre vacía la caché de datos al cambiar de sesión (login o logout), para
  // que la app nunca muestre una cuota/plan viejo guardado sin conexión.
  clearOfflineCache();
  void persistToken(value);
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
  // Solo declaramos JSON cuando hay cuerpo: un POST/DELETE sin cuerpo con
  // Content-Type: application/json hace que el servidor rechace la petición
  // ("body cannot be empty when content-type is set to application/json").
  const hasBody = body !== undefined && body !== null;
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Sin respuesta del servidor (sin conexión, servidor caído o arrancando).
    throw new ApiError(0, 'No se pudo conectar con el gimnasio. Revisá tu conexión e intentá de nuevo en unos segundos.');
  }

  const text = await res.text();
  let json: { data?: T; message?: string } = {};
  try {
    json = text ? (JSON.parse(text) as { data?: T; message?: string }) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    // Sesión inválida o vencida: limpiar token para forzar un nuevo login.
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, json.message || `Error ${res.status}`);
  }
  return (json.data ?? (json as T)) as T;
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

export interface RoutineLog {
  id: string;
  routineId?: string | null;
  exerciseId?: string | null;
  exerciseName: string;
  dayIndex?: number | null;
  sets?: number | null;
  reps?: string | null;
  weight?: string | null;
  notes?: string | null;
  completedAt: string;
}

export interface RoutineLogInput {
  routineId?: string;
  exerciseId?: string;
  exerciseName: string;
  dayIndex?: number;
  sets?: number;
  reps?: string;
  weight?: string;
  notes?: string;
}

export interface Checkin {
  id: string;
  checkedInAt: string;
  method: string;
  status: string;
}

export interface CheckinResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  plan?: string;
  planColor?: string | null;
  membershipEndDate?: string;
  attendanceId?: string;
  checkedInAt?: string;
  branchId?: string;
}

export interface PortalClass {
  id: string;
  name: string;
  color?: string | null;
  startAt: string;
  endAt: string;
  room?: string | null;
  instructor?: string | null;
  capacity: number;
  reserved: number;
  full: boolean;
  myStatus: string | null;
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
  // El gimnasio no hace falta: el servidor resuelve la organizacion por el DNI
  // (o email/legajo) del socio.
  login: (identifier: string, password: string) =>
    request<LoginResponse>('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier, password },
      auth: false,
    }),

  activate: (identifier: string, activationCode: string, password: string) =>
    request<LoginResponse>('/api/portal/auth/activate', {
      method: 'POST',
      body: { identifier, activationCode, password },
      auth: false,
    }),

  me: () => request<{ organization: OrgInfo; member: MemberInfo; quota: Quota | null }>('/api/portal/me'),
  news: () => request<{ items: NewsItem[] }>('/api/portal/news'),
  routines: () => request<{ items: Routine[] }>('/api/portal/routines'),

  routineLogs: (params?: { routineId?: string; exerciseId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.routineId) qs.set('routineId', params.routineId);
    if (params?.exerciseId) qs.set('exerciseId', params.exerciseId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ items: RoutineLog[] }>(`/api/portal/routines/logs${suffix}`);
  },

  logRoutine: (body: RoutineLogInput) =>
    request<RoutineLog>('/api/portal/routines/logs', { method: 'POST', body }),
  checkins: () => request<{ items: Checkin[] }>('/api/portal/checkins'),
  classes: () => request<{ items: PortalClass[] }>('/api/portal/classes'),

  checkin: (qr: string) =>
    request<CheckinResult>('/api/portal/checkin', {
      method: 'POST',
      body: { qr },
    }),

  reserve: (sessionId: string) =>
    request<{ waitlisted: boolean; already?: boolean }>(`/api/portal/classes/${sessionId}/reserve`, { method: 'POST' }),

  cancelReserve: (sessionId: string) =>
    request<{ cancelled: boolean }>(`/api/portal/classes/${sessionId}/reserve`, { method: 'DELETE' }),
  payments: () => request<{ payments: Payment[]; intents: PaymentIntent[] }>('/api/portal/payments'),

  createIntent: (method: 'MERCADOPAGO' | 'TRANSFER', concept = 'MEMBERSHIP') =>
    request<{ intent: PaymentIntent; checkoutUrl?: string | null; transfer?: { alias: string | null; amount: number } }>(
      '/api/portal/payments/intent',
      { method: 'POST', body: { method, concept } },
    ),

  registerPush: (pushToken: string, platform: 'ANDROID' | 'IOS') =>
    request<{ registered: boolean }>('/api/portal/push-token', { method: 'POST', body: { token: pushToken, platform } }),

  // Web Push (PWA): clave pública VAPID y alta/baja de la suscripción.
  pushKey: () => request<{ publicKey: string }>('/api/portal/push-key', { auth: false }),
  subscribeWebPush: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    request<{ subscribed: boolean }>('/api/portal/push-subscribe', { method: 'POST', body: sub }),
  unsubscribeWebPush: (endpoint: string) =>
    request<{ unsubscribed: boolean }>('/api/portal/push-subscribe', { method: 'DELETE', body: { endpoint } }),
};
