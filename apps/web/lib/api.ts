'use client';

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL;

// La API vive en el mismo host que sirve el panel, pero en el puerto 3001
// (apiPort). Derivar el host de la página permite que tanto el equipo del
// gimnasio (http://127.0.0.1:3000) como las terminales de la red local
// (http://192.168.x.x:3000) apunten al servidor correcto. Si se define
// NEXT_PUBLIC_API_URL, esa manda.
function resolveApiUrl(): string {
  let base = RAW_API_URL;
  if (!base && typeof window !== 'undefined') {
    base = `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  if (!base) base = 'http://127.0.0.1:3001';
  return /\/api\/?$/.test(base) ? base.replace(/\/$/, '') : `${base.replace(/\/$/, '')}/api`;
}

export const API_URL = resolveApiUrl();

const TOKEN_KEY = 'fit_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs } = options;
  let url = `${API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Verifica que la API esté corriendo.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: string; message?: string; details?: unknown }
    | null;

  if (!res.ok) {
    if (res.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('fitsystem:license-expired'));
    }
    const message =
      (json && 'message' in json && (json as { message?: string }).message) ||
      (json && 'error' in json && (json as { error?: string }).error) ||
      `Error ${res.status}`;
    throw new ApiError(res.status, message, json?.details);
  }
  return json?.data as T;
}

export const http = {
  get: <T>(path: string, query?: ApiOptions['query']) => api<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};