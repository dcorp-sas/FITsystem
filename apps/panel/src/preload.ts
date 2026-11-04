import { contextBridge, ipcRenderer } from 'electron';

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; data?: T; error?: string };
  if (!res?.ok) throw new Error(res?.error || 'Error desconocido');
  return res.data as T;
}

const api = {
  getConfig: () => invoke('panel:config:get'),
  saveConfig: (patch: unknown) => invoke('panel:config:save', patch),
  licensadorOverview: () => invoke('panel:licensador:overview'),
  licensadorRevoke: (payload: unknown) => invoke('panel:licensador:revoke', payload),
  licensadorUnrevoke: (payload: unknown) => invoke('panel:licensador:unrevoke', payload),
  brevoCheck: () => invoke('panel:brevo:check'),
  marketingOverview: () => invoke('panel:marketing:overview'),
  marketingContacts: (params: unknown) => invoke('panel:marketing:contacts', params),
  marketingAddContact: (input: unknown) => invoke('panel:marketing:add-contact', input),
  marketingCreateList: (input: unknown) => invoke('panel:marketing:create-list', input),
  marketingSendCampaign: (id: number) => invoke('panel:marketing:send-campaign', id),
  crmLeads: () => invoke('panel:crm:leads'),
  crmUpdate: (payload: unknown) => invoke('panel:crm:update', payload),
  crmCreate: (payload: unknown) => invoke('panel:crm:create', payload),
  metricsSummary: (days?: number) => invoke('panel:metrics:summary', days),
  clientsList: () => invoke('panel:clients:list'),
  subscriptionsList: (status?: string) => invoke('panel:subscriptions:list', status),
  subscriptionsCancel: (externalRef: string) => invoke('panel:subscriptions:cancel', externalRef),
  subscriptionsReactivate: (externalRef: string) => invoke('panel:subscriptions:reactivate', externalRef),
  subscriptionsPeriod: (payload: unknown) => invoke('panel:subscriptions:period', payload),
  siteLoad: () => invoke('panel:site:load'),
  siteSave: (content: unknown) => invoke('panel:site:save', content),
  sitePublish: (content: unknown) => invoke('panel:site:publish', content),
  apiHealth: () => invoke('panel:api:health'),
  apiDatabaseHealth: () => invoke('panel:api:database-health'),
  vpsMetrics: () => invoke('panel:vps:metrics'),
  ipAnalyze: (ip: string) => invoke('panel:ip:analyze', ip),
  alertsRun: () => invoke('panel:alerts:run'),
  healthHistory: () => invoke('panel:health:history'),
  onHealthUpdate: (callback: (value: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
    ipcRenderer.on('panel:health:update', listener);
    return () => ipcRenderer.removeListener('panel:health:update', listener);
  },
  auditList: () => invoke('panel:audit:list'),
  assistantCatalog: () => invoke('panel:assistant:catalog'),
  assistantSuggest: (text: string) => invoke('panel:assistant:suggest', text),
  assistantRun: (id: string) => invoke('panel:assistant:run', id),
  mailInbox: () => invoke('panel:mail:inbox'),
  mailRead: (ref: unknown) => invoke('panel:mail:read', ref),
  mailSend: (input: unknown) => invoke('panel:mail:send', input),
  mailDelete: (ref: unknown) => invoke('panel:mail:delete', ref),
  mailZohoExchange: (payload: unknown) => invoke('panel:mail:zoho:exchange', payload),
  opsSystems: () => invoke('panel:ops:systems'),
  opsPartnerApp: (organizationId: string) => invoke('panel:ops:partner-app', organizationId),
  opsPortalReset: (organizationId: string, accountId: string) => invoke('panel:ops:portal-reset', organizationId, accountId),
  opsPortalToggle: (organizationId: string, accountId: string, active: boolean) => invoke('panel:ops:portal-toggle', organizationId, accountId, active),
  opsDesktopInstallations: () => invoke('panel:ops:desktop-installations'),
  opsDesktopSyncRetry: (installationId: string) => invoke('panel:ops:desktop-sync-retry', installationId),
  opsDesktopDiagnosticsRequest: (installationId: string) => invoke('panel:ops:desktop-diagnostics-request', installationId),
  opsDesktopDiagnosticsGet: (installationId: string) => invoke('panel:ops:desktop-diagnostics-get', installationId),
  opsReleases: () => invoke('panel:ops:releases'),
  opsClientTelemetry: (organizationId: string) => invoke('panel:ops:client-telemetry', organizationId),
  supportCasesList: () => invoke('panel:support:cases:list'),
  supportCaseCreate: (input: unknown) => invoke('panel:support:cases:create', input),
  supportCaseUpdate: (id: string, input: unknown) => invoke('panel:support:cases:update', id, input),
  opsDownloads: (days?: number) => invoke('panel:ops:downloads', days),
  opsEnrichDownloads: (limit?: number) => invoke('panel:ops:enrich-downloads', limit),
  opsErrors: () => invoke('panel:ops:errors'),
  invoiceConfig: () => invoke('panel:invoice:config'),
  invoiceSaveConfig: (input: unknown) => invoke('panel:invoice:save-config', input),
  invoiceTest: () => invoke('panel:invoice:test'),
  invoiceList: () => invoke('panel:invoice:list'),
  invoiceIssuePending: () => invoke('panel:invoice:issue-pending'),
  invoiceEmail: (id: string) => invoke('panel:invoice:email', id),
};

contextBridge.exposeInMainWorld('panel', api);

export type PanelApi = typeof api;
