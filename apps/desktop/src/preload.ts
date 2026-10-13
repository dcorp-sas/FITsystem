import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fitsystem', {
  version: '0.2.0',
  getLicense: () => ipcRenderer.invoke('license:get'),
  activate: (key: string) => ipcRenderer.invoke('license:activate', key),
  requestCode: () => ipcRenderer.invoke('license:request'),
  openMain: () => ipcRenderer.invoke('license:open-main'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('update:event', wrapped);
    return () => ipcRenderer.removeListener('update:event', wrapped);
  },
});
