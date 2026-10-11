import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fitsystem', {
  version: '0.1.0',
  getLicense: () => ipcRenderer.invoke('license:get'),
  activate: (key: string) => ipcRenderer.invoke('license:activate', key),
  openMain: () => ipcRenderer.invoke('license:open-main'),
});
