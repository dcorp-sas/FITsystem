import { env } from '../env.js';

/**
 * Cliente del Licensador (sistema de licencias del proveedor). Al aprobarse un
 * pago en la tienda del sitio, se emite una clave aquí y se envía al cliente.
 * Requiere LICENSE_SERVER (URL del Licensador) y LICENSOR_ADMIN_PASS.
 */
export interface IssuedLicense {
  ok: boolean;
  key?: string;
  expires?: number;
  error?: string;
}

export function isLicensorIssueConfigured(): boolean {
  return Boolean(env.LICENSE_SERVER && env.LICENSOR_ADMIN_PASS);
}

async function login(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${env.LICENSE_SERVER}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: env.LICENSOR_ADMIN_USER, pass: env.LICENSOR_ADMIN_PASS }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { token?: string } | null;
    return data?.token ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Prueba en vivo el login contra el Licensador (diagnóstico). */
export async function testLicensorLogin(): Promise<{ ok: boolean; status: number | null; error?: string }> {
  if (!env.LICENSE_SERVER || !env.LICENSOR_ADMIN_PASS) return { ok: false, status: null, error: 'no configurado' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${env.LICENSE_SERVER}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: env.LICENSOR_ADMIN_USER, pass: env.LICENSOR_ADMIN_PASS }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function issueLicense(input: {
  client: string;
  plan: string;
  days: number;
  seats: number;
  notas?: string;
}): Promise<IssuedLicense> {
  if (!env.LICENSE_SERVER) return { ok: false, error: 'Licensador no configurado (LICENSE_SERVER)' };
  if (!env.LICENSOR_ADMIN_PASS) return { ok: false, error: 'Sin credenciales de emisión (LICENSOR_ADMIN_PASS)' };
  try {
    const token = await login();
    if (!token) return { ok: false, error: 'No se pudo autenticar con el Licensador' };
    const res = await fetch(`${env.LICENSE_SERVER}/api/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        client: input.client,
        plan: input.plan,
        days: input.days,
        seats: input.seats,
        notas: input.notas ?? '',
      }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; key?: string; expires?: number; error?: string } | null;
    if (!res.ok || !data?.ok || !data.key) {
      return { ok: false, error: data?.error || `El Licensador respondió HTTP ${res.status}` };
    }
    return { ok: true, key: data.key, expires: data.expires };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
