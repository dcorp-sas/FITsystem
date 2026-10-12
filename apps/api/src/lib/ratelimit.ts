import type { preHandlerHookHandler } from 'fastify';
import { HttpError } from './http.js';

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

// Purga periodica para evitar crecimiento de memoria.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, 60_000);
cleanup.unref?.();

export interface RateLimitOptions {
  /** Cantidad maxima de requests por ventana. */
  max: number;
  /** Tamano de la ventana en milisegundos. */
  windowMs: number;
  /** Prefijo de la clave (por defecto, la ruta). */
  keyPrefix?: string;
}

/**
 * Limitador de tasa en memoria (fixed window) por IP + ruta. Suficiente para una
 * sola instancia; para varias, reemplazar por un store compartido (Redis).
 */
export function rateLimit(opts: RateLimitOptions): preHandlerHookHandler {
  const { max, windowMs, keyPrefix } = opts;
  return async (request) => {
    const ip = request.ip || 'unknown';
    const route = keyPrefix || request.routeOptions?.url || request.url;
    const key = `${route}:${ip}`;
    const now = Date.now();
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpError(429, `Demasiados intentos. Proba de nuevo en ${retry}s`);
    }
  };
}
