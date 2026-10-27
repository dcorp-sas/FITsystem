import { getRawSetting, upsertSettings } from './settings.js';

/**
 * Abstraccion de hardware de control de acceso. El equipo donde se instala el
 * sistema detecta (del lado del cliente) que dispositivos tiene disponibles y
 * los reporta; se guarda una única configuración por gimnasio para usarla en el ingreso.
 *
 * Kinds previstos (listos para conectar hardware real):
 *  - FINGERPRINT: lector de huellas / Windows Hello (WebAuthn)
 *  - CARD: lectores HID/USB/Serial o NFC (bandas/tarjetas RFID)
 *  - QR: lector de pistola (HID teclado) o camara
 *  - FACE: camara para reconocimiento facial
 *  - TURNSTILE: molinete controlado por el sistema
 */
export type CheckinDeviceKind = 'FINGERPRINT' | 'CARD' | 'QR' | 'FACE' | 'TURNSTILE';

export interface DetectedDevice {
  kind: CheckinDeviceKind;
  label: string;
  method: string;
  available: boolean;
  source?: string;
  detail?: string | null;
}

export interface DeviceProfile {
  branchId: string;
  platform: string;
  devices: DetectedDevice[];
  scannedAt: string;
}

const CATEGORY = 'HARDWARE';

function devicesKey(branchId: string): string {
  return `BRANCH_${branchId}`;
}

export async function getDeviceProfile(orgId: string, branchId: string): Promise<DeviceProfile | null> {
  const raw = await getRawSetting(orgId, 'HARDWARE', branchId ? `BRANCH_${branchId}` : '');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceProfile;
  } catch {
    return null;
  }
}

export async function saveDeviceProfile(
  orgId: string,
  profile: { branchId: string; platform?: string; devices: DetectedDevice[] },
): Promise<DeviceProfile> {
  const stored: DeviceProfile = {
    branchId: profile.branchId,
    platform: profile.platform ?? '',
    devices: profile.devices,
    scannedAt: new Date().toISOString(),
  };
  await upsertSettings(orgId, 'HARDWARE', { [`BRANCH_${profile.branchId}`]: JSON.stringify(stored) });
  return stored;
}

/** Metodos de ingreso habilitados según el hardware detectado en el gimnasio. */
export function enabledMethods(profile: DeviceProfile | null): string[] {
  const methods = new Set(['MANUAL', 'QR']);
  if (profile) {
    for (const d of profile.devices) if (d.available) methods.add(d.method);
  }
  return [...methods];
}
