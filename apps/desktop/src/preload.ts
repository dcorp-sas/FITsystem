import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fitsystem', {
  version: '0.3.44',
  getLicense: () => ipcRenderer.invoke('license:get'),
  activate: (key: string) => ipcRenderer.invoke('license:activate', key),
  requestCode: () => ipcRenderer.invoke('license:request'),
  openMain: () => ipcRenderer.invoke('license:open-main'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  dismissUpdate: () => ipcRenderer.invoke('update:dismiss'),
  // Avisa al proceso principal si hay una venta/cobro en curso, para que la
  // actualización automática no reinicie la app justo en ese momento.
  setBusy: (busy: boolean) => ipcRenderer.invoke('app:busy', busy),
  // Red: consultar/definir el modo (local o nube) y reiniciar la app para
  // aplicar el cambio.
  getNetwork: () => ipcRenderer.invoke('network:get'),
  setNetwork: (mode: 'standalone' | 'server' | 'cloud') => ipcRenderer.invoke('network:set', mode),
  restartApp: () => ipcRenderer.invoke('network:restart'),
  openAccessWindow: () => ipcRenderer.invoke('access:open'),
  openAccessQrWindow: (data: { title: string; subtitle: string; footer: string; image: string | null; enabled: boolean; rotation: string }) => ipcRenderer.invoke('access:qr-open', data),
  onUpdateEvent: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('update:event', wrapped);
    return () => ipcRenderer.removeListener('update:event', wrapped);
  },
});
