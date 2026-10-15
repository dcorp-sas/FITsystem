'use client';

export type CheckinDeviceKind = 'FINGERPRINT' | 'CARD' | 'QR' | 'FACE' | 'TURNSTILE';

export interface DetectedDevice {
  kind: CheckinDeviceKind;
  label: string;
  method: string;
  available: boolean;
  source?: string;
  detail?: string | null;
}

export interface HardwareScan {
  platform: string;
  devices: DetectedDevice[];
}

type MaybeVendorNavigator = Navigator & {
  usb?: unknown;
  hid?: unknown;
  serial?: unknown;
  bluetooth?: unknown;
};

async function countCameras(): Promise<number> {
  try {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return 0;
    const devices = await media.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    const pkc = (window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } })
      .PublicKeyCredential;
    if (!pkc?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Detecta el hardware disponible en el equipo (navegador/desktop) para el
 * control de acceso. Reporta camaras, huella (WebAuthn/Windows Hello), lectores
 * HID/USB/Serial, NFC y lectores QR de pistola (que actuan como teclado).
 */
export async function detectHardware(): Promise<HardwareScan> {
  const nav = navigator as MaybeVendorNavigator;
  const devices: DetectedDevice[] = [];

  const cameras = await countCameras();
  devices.push({
    kind: 'FACE',
    label: 'Cámara (reconocimiento facial)',
    method: 'FACE',
    available: cameras > 0,
    source: 'MediaDevices',
    detail: cameras > 0 ? `${cameras} cámara(s) disponible(s)` : 'No se detectó cámara',
  });

  const platformAuth = await hasPlatformAuthenticator();
  devices.push({
    kind: 'FINGERPRINT',
    label: 'Huella / Windows Hello',
    method: 'FINGERPRINT',
    available: platformAuth,
    source: 'WebAuthn',
    detail: platformAuth ? 'Autenticador de plataforma disponible' : 'No detectado',
  });

  const readerAvailable = Boolean(nav.hid || nav.usb || nav.serial);
  const readerSources = [nav.hid ? 'WebHID' : null, nav.usb ? 'WebUSB' : null, nav.serial ? 'WebSerial' : null].filter(Boolean) as string[];
  devices.push({
    kind: 'CARD',
    label: 'Lector de tarjetas (HID/USB/Serial)',
    method: 'CARD',
    available: readerAvailable,
    source: readerSources[0],
    detail: readerAvailable ? `Soportado: ${readerSources.join(', ')}` : 'Sin lector de tarjetas compatible',
  });

  const nfc = typeof window !== 'undefined' && 'NDEFReader' in window;
  devices.push({
    kind: 'CARD',
    label: 'NFC (tarjetas / bandas)',
    method: 'CARD',
    available: nfc,
    source: 'WebNFC',
    detail: nfc ? 'Lector NFC disponible' : 'Sin lector NFC',
  });

  devices.push({
    kind: 'QR',
    label: 'Lector QR (pistola HID) o cámara',
    method: 'QR',
    available: true,
    source: 'Input',
    detail: 'Los lectores QR de pistola funcionan como teclado',
  });

  devices.push({
    kind: 'TURNSTILE',
    label: 'Molinete / barrera de acceso',
    method: 'TURNSTILE',
    available: false,
    source: 'Controlador',
    detail: 'Se habilita al conectar el controlador del molinete (relé/red)',
  });

  return {
    platform: `${navigator.platform || 'equipo'} · ${navigator.userAgent.slice(0, 80)}`,
    devices,
  };
}
