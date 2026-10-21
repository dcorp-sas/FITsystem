'use client';

/**
 * WebAuthn / Windows Hello para el registro y verificación de huella.
 *
 * La huella nunca sale del equipo: aquí solo se maneja el id de credencial y la
 * clave pública que el navegador entrega. El servidor verifica la firma.
 */

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    const pkc = window.PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    };
    if (!pkc?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function toBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function randomChallenge(): ArrayBuffer {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes.buffer;
}

export interface EnrollResult {
  credentialId: string;
  publicKey: string;
}

/**
 * Crea una credencial de plataforma (huella / Windows Hello) en el equipo y
 * devuelve el id + clave pública para guardar en el servidor.
 */
export async function enrollFingerprint(memberName: string, memberCode: string): Promise<EnrollResult> {
  if (!webauthnSupported()) throw new Error('Este equipo no soporta huella (WebAuthn).');
  if (!(await platformAuthenticatorAvailable())) {
    throw new Error('Este equipo no tiene un lector de huella disponible.');
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'FitSystem' },
      user: {
        id: new TextEncoder().encode(memberCode || memberName),
        name: memberCode || memberName,
        displayName: memberName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('No se pudo registrar la huella.');

  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey =
    typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
  if (!publicKey) throw new Error('El equipo no entregó la clave pública de la huella.');

  return {
    credentialId: toBase64url(credential.rawId),
    publicKey: toBase64url(publicKey),
  };
}

export interface AssertionResult {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

/**
 * Pide al equipo que firme el desafío con la huella enrolada. El servidor valida
 * la firma con la clave pública guardada.
 */
export async function assertFingerprint(challenge: string, credentialId?: string): Promise<AssertionResult> {
  if (!webauthnSupported()) throw new Error('Este equipo no soporta huella (WebAuthn).');

  const allowCredentials = credentialId
    ? [{ type: 'public-key' as const, id: fromBase64url(credentialId) }]
    : undefined;

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: fromBase64url(challenge),
      timeout: 60000,
      userVerification: 'required',
      allowCredentials,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('No se pudo verificar la huella.');

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: toBase64url(assertion.rawId),
    authenticatorData: toBase64url(response.authenticatorData),
    clientDataJSON: toBase64url(response.clientDataJSON),
    signature: toBase64url(response.signature),
  };
}

export { toBase64url, fromBase64url };
