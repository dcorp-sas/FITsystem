import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gate', {
  config: () => ipcRenderer.invoke('gate:config'),
  login: (payload: { apiUrl: string; email: string; password: string }) => ipcRenderer.invoke('gate:login', payload),
  branches: () => ipcRenderer.invoke('gate:branches'),
  saveBranch: (payload: { branchId: string; branchName: string }) => ipcRenderer.invoke('gate:save-branch', payload),
  checkin: (code: string) => ipcRenderer.invoke('gate:checkin', { code }),
  checkinFace: (descriptor: number[]) => ipcRenderer.invoke('gate:checkin-face', { descriptor }),
  logout: () => ipcRenderer.invoke('gate:logout'),
});
