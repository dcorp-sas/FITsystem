export interface UpdateEvent {
  state: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export interface NetworkInfo {
  mode: 'standalone' | 'server' | 'cloud';
  addresses: string[];
  lanUrls: string[];
  webPort: number;
  apiPort: number;
  cloudPanelUrl: string;
  cloudApiUrl: string;
}

export interface DesktopBridge {
  version?: string;
  checkUpdates?: () => Promise<unknown>;
  getUpdateState?: () => Promise<UpdateEvent | null>;
  downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  dismissUpdate?: () => Promise<{ ok: boolean }>;
  setBusy?: (busy: boolean) => Promise<unknown>;
  onUpdateEvent?: (listener: (payload: UpdateEvent) => void) => () => void;
  getNetwork?: () => Promise<NetworkInfo>;
  setNetwork?: (mode: 'standalone' | 'server' | 'cloud') => Promise<{ ok: boolean; mode: 'standalone' | 'server' | 'cloud' }>;
  restartApp?: () => Promise<{ ok: boolean }>;
  openAccessWindow?: () => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    fitsystem?: DesktopBridge;
  }
}

/**
 * Avisa al proceso de escritorio si hay una venta/cobro en curso, para que la
 * actualización automática no reinicie la aplicación mientras se factura.
 * No-op fuera del escritorio (panel web en la nube).
 */
export function reportSaleInProgress(busy: boolean) {
  try {
    void window.fitsystem?.setBusy?.(busy);
  } catch {
    /* ignore */
  }
}
