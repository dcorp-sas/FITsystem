export interface UpdateEvent {
  state: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export interface DesktopBridge {
  version?: string;
  checkUpdates?: () => Promise<unknown>;
  getUpdateState?: () => Promise<UpdateEvent | null>;
  downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateEvent?: (listener: (payload: UpdateEvent) => void) => () => void;
}

declare global {
  interface Window {
    fitsystem?: DesktopBridge;
  }
}
