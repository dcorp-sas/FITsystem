'use strict';

const MODULES = [
  { id: 'inicio', label: 'Inicio', glyph: '⌂' },
  { id: 'dashboard', label: 'Centro de diagnóstico', glyph: '◎' },
  { id: 'clientes', label: 'Clientes', glyph: '☺' },
  { id: 'suscripciones', label: 'Suscripciones', glyph: '◧' },
  { id: 'licencias', label: 'Licencias', glyph: '▤' },
  { id: 'ips', label: 'IPs registradas', glyph: '⌖' },
  { id: 'sistemas', label: 'Sistemas activos', glyph: '▦' },
  { id: 'facturacion', label: 'Facturación FS', glyph: '$' },
  { id: 'vps', label: 'Infraestructura', glyph: '▣' },
  { id: 'alertas', label: 'Alertas', glyph: '⚑' },
  { id: 'correo', label: 'Correo', glyph: '✉' },
  { id: 'whatsapp', label: 'WhatsApp', glyph: '◉' },
  { id: 'marketing', label: 'Marketing', glyph: '✦' },
  { id: 'crm', label: 'CRM', glyph: '☰' },
  { id: 'sitio', label: 'Sitio web', glyph: '◫' },
  { id: 'metricas', label: 'Métricas', glyph: '◪' },
  { id: 'asistente', label: 'Asistente', glyph: '✧' },
  { id: 'config', label: 'Configuración', glyph: '⚙' },
];

const state = { view: 'inicio', config: null, cache: {} };
const api = window.panel;

const $ = (sel) => document.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(message, kind) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'err' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4200);
}

function setConn(text, kind) {
  const el = $('#conn');
  el.textContent = text;
  el.className = 'conn' + (kind ? ' ' + kind : '');
}

function fmtDate(ms) {
  if (!ms) return '—';
  const d = typeof ms === 'number' ? new Date(ms) : new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function loading() {
  return '<div class="placeholder"><span class="spinner"></span><span>Cargando…</span></div>';
}

function placeholder(title, detail) {
  return `<div class="placeholder"><div class="big">${esc(MODULES.find((m) => m.id === state.view)?.glyph ?? '')}</div><h2>${esc(title)}</h2><p class="muted" style="max-width:520px">${esc(detail)}</p></div>`;
}

/* ------------------------------- navegación ------------------------------- */

function renderNav() {
  const currentAlerts = state.cache.alerts?.alerts || state.cache.dashboard?.alerts?.alerts || [];
  const criticalAlerts = currentAlerts.filter((alert) => alert.level === 'crit' || alert.level === 'warn').length;
  $('#nav').innerHTML = MODULES.map(
    (m) => `<button data-view="${m.id}" class="${m.id === state.view ? 'active' : ''}"><span class="glyph">${m.glyph}</span>${esc(m.label)}${m.id === 'alertas' && criticalAlerts ? `<span class="nav-badge">${criticalAlerts > 99 ? '99+' : criticalAlerts}</span>` : ''}</button>`,
  ).join('');
  $('#nav').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      renderNav();
      renderView();
    }),
  );
  $('#view-title').textContent = MODULES.find((m) => m.id === state.view)?.label ?? '';
}

/* --------------------------------- elenco --------------------------------- */

function dashboardHtml() {
  const d = state.cache.dashboard || {};
  const lic = d.overview?.stats || {};
  const api = d.api;
  const brevo = d.brevo;
  const vps = d.vps;
  const card = (title, body) => `<div class="card"><h3>${esc(title)}</h3>${body}</div>`;
  const err = (e) => `<div class="muted">Error: ${esc(e)}</div>`;

  const licBody = d.overviewError
    ? err(d.overviewError)
    : `<div class="stat">${lic.total ?? 0} <small>licencias</small></div>
       <div class="row"><span class="muted">Activadas</span><span>${lic.activadas ?? 0}</span></div>
       <div class="row"><span class="muted">Asientos en uso</span><span>${lic.asientos ?? 0}</span></div>
       <div class="row"><span class="muted">Vencidas</span><span>${lic.vencidas ?? 0}</span></div>`;

  const apiBody = d.apiError
    ? err(d.apiError)
    : `<div class="stat">${api.ok ? 'En línea' : 'HTTP ' + api.status} <small>${api.latencyMs} ms</small></div>
       <div class="row"><span class="muted">URL</span><span class="mono">${esc(state.config?.api?.url ?? '')}</span></div>`;

  const database = d.database;
  const databaseBody = d.databaseError
    ? err(d.databaseError)
    : `<div class="stat">${database?.ok ? 'Conectada' : 'Sin respuesta'} <small>${database?.latencyMs ?? '—'} ms</small></div>
       <div class="row"><span class="muted">Prueba</span><span>${database?.ok ? 'consulta real a PostgreSQL' : 'no disponible'}</span></div>`;

  const brevoBody = d.brevoError
    ? err(d.brevoError)
    : `<div class="stat">${esc(brevo.account?.companyName || brevo.account?.email || 'Conectado')}</div>
       ${brevo.egressMode === 'respaldo local' ? '<div class="row"><span class="pill warn">IP variable de esta computadora</span><span>Autoriza una vez 190.183.229.160 en Brevo para fijar la salida</span></div>' : '<div class="row"><span class="pill ok">Salida fija del servidor</span><span>Brevo ya no depende de la IP de esta computadora</span></div>'}
       <div class="row"><span class="muted">Remitentes</span><span>${(brevo.senders || []).filter((s) => s.active).length} activos</span></div>
       ${(brevo.senders || []).map((s) => `<div class="row"><span class="mono">${esc(s.email)}</span><span class="pill ${s.active ? 'ok' : 'warn'}">${s.active ? 'verificado' : 'pendiente'}</span></div>`).join('')}`;

  const vpsBody = d.vpsError
    ? err(d.vpsError)
    : `<div class="row"><span class="muted">RAM</span><span>${vps.memory ? `${vps.memory.usedMb} / ${vps.memory.totalMb} MB` : '—'}</span></div>
       <div class="row"><span class="muted">Carga del nodo</span><span class="mono">${esc((vps.load || '').split(' ').slice(0, 3).join(' ') || '—')}${vps.loadIsHostWide ? ' · compartida' : ''}</span></div>
       <div class="row"><span class="muted">Presión CPU de esta VPS</span><span>${esc(psiSummary(vps.pressure?.cpu))}</span></div>
       <div class="muted" style="margin-top:6px">Procesos con más uso: ${(vps.processes || []).slice(0, 3).map((p) => `${esc(p.command)} ${Number(p.cpuPercent).toFixed(1)}%`).join(' · ') || 'sin datos'}</div>
       <div class="row"><span class="muted">Contenedores</span><span>${(vps.containers || []).length} activos</span></div>
       <div class="row"><span class="muted">Uptime</span><span class="mono">${esc((vps.uptime || '').replace(/^.*up\s*/, 'up '))}</span></div>`;

  const systems = d.systems || {};
  const clients = d.clients?.clients?.length ? d.clients.clients : systems.clients || [];
  const systemsById = new Map((systems.clients || []).map((c) => [c.id, c]));
  const licenses = d.overview?.licenses || [];
  const activations = licenses.flatMap((l) => (l.activations || []).map((a) => ({ ...a, license: l })));
  const installations = d.installations?.installations || [];
  const licenseByInstall = new Map(activations.map((a) => [a.install_id, a.license]));
  const downloads = d.downloads?.rows || [];
  const errors = d.errors?.rows || [];
  const alerts = d.alerts?.alerts || [];
  const platformChecks = (systems.platform || []).filter((service) => ['api', 'web', 'socios', 'profes', 'fitora', 'panel', 'licensador', 'whatsapp', 'arca'].includes(service.id));
  const platformStatus = (service) => {
    if (['online', 'local', 'configurado', 'con sesiones', 'habilitada'].includes(service.status)) return ['ok', service.status === 'local' ? 'activo en este equipo' : 'disponible'];
    if (service.status === 'con error') return ['bad', 'requiere revisión'];
    if (['sin configurar', 'deshabilitada'].includes(service.status)) return ['', service.status === 'deshabilitada' ? 'deshabilitada · opcional' : 'sin configurar'];
    if (service.status === 'sin sesiones conectadas') return ['warn', 'sin sesión conectada'];
    return ['bad', service.status || 'sin estado'];
  };
  const platformBody = platformChecks.length
    ? platformChecks.map((service) => { const [tone, label] = platformStatus(service); return `<div style="padding:7px 0;border-bottom:1px solid var(--border)"><div class="row"><strong>${esc(service.name)}</strong><span class="pill ${tone}">${esc(label)}</span></div><div class="muted">${esc(service.detail || 'Sin detalle')}</div></div>`; }).join('') + `<div class="muted" style="margin-top:8px">Consultado ${esc(fmtDate(systems.generatedAt))}. Las cuentas activas y sesiones son estados informados por el servidor, no mediciones de uso individual.</div>`
    : '<div class="muted">No llegó información de los servicios. Revisá el estado de la fuente antes de interpretar valores vacíos.</div>';
  const issueCards = alerts.map((a) => {
    const incident = (d.healthHistory?.incidents || []).find((item) => item.status === 'OPEN' && item.area === a.area && item.title === a.title);
    const informational = a.level === 'info';
    const impact = a.area === 'App de socios' ? 'Los socios pueden no acceder al portal o a sus funciones.'
      : a.area === 'WhatsApp' ? 'Los mensajes automáticos por WhatsApp pueden no salir.'
      : a.area === 'Marketing' ? 'Pueden fallar consultas, contactos o campañas de correo.'
      : a.area === 'Base de datos' ? 'Las operaciones que dependen de datos pueden fallar o demorarse.'
      : a.area === 'Infraestructura' ? 'El servicio afectado puede degradarse o dejar de responder.'
      : a.area === 'Licensador' ? 'Las activaciones o validaciones de licencia pueden fallar.'
      : 'Puede verse afectada la operación del sistema indicado.';
    return `<div class="row" style="align-items:flex-start;margin-top:8px"><span class="pill ${a.level === 'crit' ? 'bad' : a.level === 'warn' ? 'warn' : ''}">${a.level === 'crit' ? 'crítica' : a.level === 'warn' ? 'aviso' : 'info'}</span><div style="flex:1"><strong>${esc(a.title)}</strong><div class="muted">Sistema: ${esc(a.area)} · ${informational ? 'dato informativo' : `detectado ${esc(fmtDate(a.at || d.alerts?.at))}`}${incident ? ` · abierto ${esc(relTime(incident.firstSeenAt))} · ${incident.occurrences} detección(es), última ${esc(relTime(incident.lastSeenAt))}` : ''}</div>${informational ? `<div class="muted">${esc(a.detail || 'Este dato no representa por sí solo una falla activa.')}</div>` : `<div class="muted">Impacto posible: ${esc(impact)}</div><div class="muted">Evidencia: ${esc(a.detail || 'No se recibió detalle adicional.')}</div><button class="btn small" style="margin-top:6px" data-alert-help="${esc(repairPrompt(a.area, a.title, a.detail || ''))}">Diagnosticar solución</button>`}</div></div>`;
  }).join('');
  const clientRows = clients.map((c) => {
    const detail = systemsById.get(c.id) || {};
    const license = licenseFor(c, licenses);
    const licText = !license ? 'sin licencia' : license.state === 'revoked' ? 'revocada' : license.expires && Number(license.expires) < Date.now() ? 'vencida' : String(license.plan).toUpperCase() === 'TRIAL' ? 'prueba · sin licencia comercial' : 'activa';
    const licLevel = licText === 'activa' ? 'ok' : licText === 'revocada' ? 'bad' : 'warn';
    const sync = c.sync || {};
    const cloudActive = sync.connected ?? Boolean(c.isActive && sync.lastPushAt && Date.now() - new Date(sync.lastPushAt).getTime() < 7 * 86400000);
    const activityLabel = c.isActive === false ? 'cliente inactivo' : cloudActive ? 'activo en nube' : sync.lastPushAt ? 'sin señal reciente' : 'sin sincronización';
    const portalActive = detail.counts?.activePortalAccounts;
    const portalDetail = detail.modules?.find((module) => module.id === 'socios')?.detail;
    return `<tr><td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.slug)}</div><div class="muted mono">${esc(sync.installationId || 'instalación sin vincular')}</div>${systemExpandedDetails(c, detail, license, installations, errors)}</td><td><span class="pill ${cloudActive ? 'ok' : 'warn'}">${activityLabel}</span></td><td><span class="pill ${licLevel}">${licText}</span>${license ? `<div class="muted">${esc(license.plan || '')}${license.expires ? ' · vence ' + fmtDate(license.expires) : ''}</div>` : ''}</td><td>${detail.counts?.activeMembers ?? c.activeMembers ?? 0} / ${detail.counts?.members ?? c.members ?? 0} socios<div class="muted">App socios: ${portalActive == null ? 'sin medir' : portalActive} habilitadas / ${detail.counts?.portalAccounts ?? 0} cuentas</div><div class="muted">${esc(portalDetail || 'Sin información de actividad de la app de socios')}</div></td><td>${sync.lastPushAt ? relTime(sync.lastPushAt) : 'nunca'}${sync.lastError ? `<div class="muted" style="color:#e57373">${esc(sync.lastError)}</div>` : ''}</td><td title="Errores recibidos y guardados por la API durante los últimos 7 días">${detail.counts?.errors7d ?? 0} reportados</td></tr>`;
  }).join('');
  const activationRows = activations.map((a) => {
    const l = a.license || {};
    const expired = l.expires && Number(l.expires) > 0 && Number(l.expires) < Date.now();
    const valid = a.active && l.state !== 'revoked' && !expired;
    const isTrial = String(l.plan || '').toUpperCase() === 'TRIAL';
    const stateText = !a.active ? 'licencia desactivada' : l.state === 'revoked' ? 'licencia revocada' : expired ? 'licencia vencida' : isTrial ? 'licencia de prueba activa' : 'licencia activa · uso no confirmado';
    return `<tr><td><strong>${esc(l.client || a.sede || 'Instalación')}</strong><div class="muted mono">${esc(a.install_id || 'sin ID')}</div></td><td>${esc(l.plan || '—')}</td><td><span class="pill ${valid && !isTrial ? 'ok' : valid ? 'warn' : 'bad'}">${stateText}</span></td><td>${fmtDate(a.activated_at)}</td><td class="mono">${esc(a.last_ip || '—')}</td></tr>`;
  }).join('');
  const installationRows = installations.map((i) => {
    const linkedLicense = licenseByInstall.get(i.installationId);
    const activation = linkedLicense?.activations?.find((item) => item.install_id === i.installationId);
    const plan = String(i.licensePlan || linkedLicense?.plan || '').toUpperCase();
    const state = !i.active ? 'sin señal hace más de 24 h' : !i.licenseKnown ? 'activa · licencia sin validar' : plan === 'TRIAL' || i.licenseStatus === 'TRIAL' ? 'prueba activa · sin licencia comercial' : i.licenseStatus === 'EXPIRED' || (i.licenseExpiresAt && new Date(i.licenseExpiresAt).getTime() < Date.now()) ? 'activa · licencia vencida' : i.licenseStatus === 'SUSPENDED' || linkedLicense?.state === 'revoked' ? 'activa · licencia suspendida/revocada' : i.hasLicense ? 'activa con licencia' : 'activa sin licencia';
    const pill = !i.active || /vencida|suspendida|revocada/.test(state) ? 'bad' : /prueba|sin licencia|sin validar/.test(state) ? 'warn' : 'ok';
    return `<tr><td><strong>${esc(linkedLicense?.client || 'Instalación sin cliente asociado')}</strong><div class="muted mono">${esc(i.installationId)}</div><details style="margin-top:6px"><summary style="cursor:pointer">Ver detalles</summary><div class="muted" style="padding:6px 0">Asiento: ${activation ? activation.active ? 'ocupado · activación vigente' : 'liberado · activación desactivada' : 'sin activación asociada'} · IP de activación: ${esc(activation?.last_ip || 'sin datos')} · fecha: ${esc(activation?.activated_at ? fmtDate(activation.activated_at) : 'sin datos')}<br>Plan: ${esc(linkedLicense?.plan || i.licensePlan || 'sin licencia registrada')} · cupo: ${Number(linkedLicense?.seats_used || 0)} / ${Number(linkedLicense?.seats || 0) || 'no informado'}<br>Último reporte: ${esc(i.lastSeenAt ? fmtDate(i.lastSeenAt) : 'sin señal')} · versión: ${esc(i.appVersion || 'sin versión')}</div></details></td><td><span class="pill ${i.active ? 'ok' : 'warn'}">${i.active ? 'activa' : 'sin señal'}</span></td><td><span class="pill ${pill}">${state}</span><div class="muted">${esc(i.licensePlan || linkedLicense?.plan || '—')}${i.licenseExpiresAt ? ' · vence ' + fmtDate(i.licenseExpiresAt) : ''}</div></td><td>${esc(i.appVersion || '—')}</td><td>${esc(relTime(i.lastSeenAt))}</td></tr>`;
  }).join('');
  const downloadRows = downloads.slice(0, 12).map((r) => `<tr><td>${fmtDate(r.at)}</td><td>${esc(r.asset || '—')}</td><td>${esc(r.source || '—')}</td><td><span class="pill warn">Descarga registrada; instalación no confirmada</span></td></tr>`).join('');
  const sourceErrors = [d.overviewError, d.apiError, d.databaseError, d.brevoError, d.vpsError, d.clientsError, d.systemsError, d.installationsError, d.downloadsError, d.errorsError, d.alertsError, d.healthHistoryError].filter(Boolean);
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px;flex-wrap:wrap"><span class="muted">Centro de diagnóstico · información de VPS, nube, base de datos, licencias, instalaciones y app de socios · actualizado ${esc(fmtDate(d.checkedAt))}</span><button class="btn small" data-diagnostic-refresh>Actualizar todo</button></div>
  ${sourceErrors.length ? `<div class="card muted" style="margin-bottom:12px">No se pudieron cargar algunas fuentes: ${sourceErrors.map(esc).join(' · ')}</div>` : ''}
  <div class="grid">
    ${card('Licensador', licBody)}
    ${card('API de la nube', apiBody)}
    ${card('Base de datos', databaseBody)}
    ${card('Brevo (email marketing)', brevoBody)}
    ${card('Infraestructura (VPS)', vpsBody)}
    ${card('Servicios e integraciones', platformBody)}
  </div>
  <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Incidentes y siguientes pasos</h3><button class="btn small" data-diagnostic-go="vps">Abrir VPS</button></div>${issueCards || '<div class="muted" style="margin-top:8px">Sin alertas activas.</div>'}</div>
  <div class="card" style="padding:0;overflow:auto;margin-top:14px"><h3 style="padding:16px 16px 0">Sistemas activos y su licencia</h3><table><thead><tr><th>Cliente / instalación</th><th>Actividad</th><th>Licencia</th><th>Socios / app de socios</th><th>Última sincronización</th><th>Errores 7d</th></tr></thead><tbody>${clientRows || '<tr><td colspan="6">No hay organizaciones de clientes sincronizadas. Las instalaciones con reporte activo se muestran en la tabla siguiente.</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto;margin-top:14px"><h3 style="padding:16px 16px 0">Programas realmente activos (con o sin licencia)</h3><p class="muted" style="padding:0 16px">Una instalación cuenta como activa si envió una señal en las últimas 24 horas. La app envía solo el ID seudónimo, versión y estado de licencia cada 3 horas; no envía datos de socios ni el nombre del equipo.</p><table><thead><tr><th>Instalación</th><th>Actividad</th><th>Licencia</th><th>Versión</th><th>Última señal</th></tr></thead><tbody>${installationRows || '<tr><td colspan="5">Las instalaciones aparecerán cuando actualicen a la versión que incluye el reporte de actividad.</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto;margin-top:14px"><h3 style="padding:16px 16px 0">Licencias y activaciones registradas</h3><p class="muted" style="padding:0 16px">Una activación confirma el estado de la licencia en el Licensador, pero no demuestra que el programa siga instalado o en uso. La actividad se confirma con una señal reciente del escritorio.</p><table><thead><tr><th>Cliente / instalación</th><th>Plan</th><th>Estado de licencia</th><th>Última activación</th><th>Última IP de activación</th></tr></thead><tbody>${activationRows || '<tr><td colspan="5">El Licensador no reporta activaciones</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto;margin-top:14px"><h3 style="padding:16px 16px 0">Descargas recientes (90 días)</h3><table><thead><tr><th>Fecha</th><th>Paquete</th><th>Origen</th><th>Diagnóstico</th></tr></thead><tbody>${downloadRows || '<tr><td colspan="4">No hay descargas recientes</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto;margin-top:14px"><h3 style="padding:16px 16px 0">Errores reportados por aplicaciones de clientes (7 días)</h3><p class="muted" style="padding:0 16px">Consulta realizada ${esc(fmtDate(d.checkedAt))}. Un resultado vacío significa que la API no recibió errores en este período; no descarta fallas que no pudieron reportarse.</p><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Error</th><th>Ruta</th></tr></thead><tbody>${errors.map((e) => `<tr><td>${fmtDate(e.createdAt)}</td><td>${esc(e.organizationName || '—')}</td><td>${esc(e.message || '—')}</td><td class="mono">${esc(e.method || '')} ${esc(e.path || '')}</td></tr>`).join('') || '<tr><td colspan="4">La consulta no encontró errores reportados en los últimos 7 días.</td></tr>'}</tbody></table></div>`;
}

async function loadDashboard() {
  const c = state.cache;
  c.dashboard = {};
  const [ov, apih, db, br, vps] = await Promise.allSettled([
    api.licensadorOverview(),
    api.apiHealth(),
    api.apiDatabaseHealth(),
    api.brevoCheck(),
    api.vpsMetrics(),
  ]);
  c.dashboard.overview = ov.status === 'fulfilled' ? ov.value : null;
  c.dashboard.overviewError = ov.status === 'rejected' ? ov.reason.message : null;
  c.dashboard.api = apih.status === 'fulfilled' ? apih.value : null;
  c.dashboard.apiError = apih.status === 'rejected' ? apih.reason.message : null;
  c.dashboard.database = db.status === 'fulfilled' ? db.value : null;
  c.dashboard.databaseError = db.status === 'rejected' ? db.reason.message : null;
  c.dashboard.brevo = br.status === 'fulfilled' ? br.value : null;
  c.dashboard.brevoError = br.status === 'rejected' ? br.reason.message : null;
  c.dashboard.vps = vps.status === 'fulfilled' ? vps.value : null;
  c.dashboard.vpsError = vps.status === 'rejected' ? vps.reason.message : null;
  const [systems, downloads, errors, alerts, clients, installations, history] = await Promise.allSettled([api.opsSystems(), api.opsDownloads(90), api.opsErrors(), api.alertsRun(), api.clientsList(), api.opsDesktopInstallations(), api.healthHistory()]);
  c.dashboard.systems = systems.status === 'fulfilled' ? systems.value : null;
  c.dashboard.downloads = downloads.status === 'fulfilled' ? downloads.value : null;
  c.dashboard.errors = errors.status === 'fulfilled' ? errors.value : null;
  c.dashboard.alerts = alerts.status === 'fulfilled' ? alerts.value : null;
  c.dashboard.clients = clients.status === 'fulfilled' ? clients.value : null;
  c.dashboard.installations = installations.status === 'fulfilled' ? installations.value : null;
  c.dashboard.healthHistory = history.status === 'fulfilled' ? history.value : null;
  c.dashboard.systemsError = systems.status === 'rejected' ? systems.reason.message : null;
  c.dashboard.downloadsError = downloads.status === 'rejected' ? downloads.reason.message : null;
  c.dashboard.errorsError = errors.status === 'rejected' ? errors.reason.message : null;
  c.dashboard.alertsError = alerts.status === 'rejected' ? alerts.reason.message : null;
  c.dashboard.clientsError = clients.status === 'rejected' ? clients.reason.message : null;
  c.dashboard.installationsError = installations.status === 'rejected' ? installations.reason.message : null;
  c.dashboard.healthHistoryError = history.status === 'rejected' ? history.reason.message : null;
  c.dashboard.checkedAt = Date.now();
  const okApi = c.dashboard.api?.ok;
  renderNav();
  setConn(okApi ? 'nube en línea' : 'con incidencias', okApi ? 'ok' : 'bad');
}

/* ------------------------------------------------------------------ */
/* Diagnóstico de clientes                                             */
/* ------------------------------------------------------------------ */

function relTime(value) {
  if (!value) return '—';
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return fmtDate(ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return fmtDate(ms);
}

function psiSummary(value) {
  const match = String(value || '').match(/some avg10=([\d.]+)/);
  return match ? `${Number(match[1]).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% (últimos 10 s)` : 'sin medición';
}

function licenseFor(client, licenses) {
  const inst = client.sync && client.sync.installationId;
  for (const l of licenses || []) {
    for (const a of l.activations || []) {
      if (inst && a.install_id === inst) return l;
    }
  }
  const name = String(client.name || '').trim().toLowerCase();
  return (licenses || []).find((l) => String(l.client || '').trim().toLowerCase() === name) || null;
}

function desktopSyncStatusText(heartbeat) {
  if (!heartbeat) return 'sin señal del sistema de escritorio';
  if (heartbeat.cloudSyncConnected == null) return `sin diagnóstico de sincronización en la versión ${heartbeat.appVersion || 'desconocida'}`;
  const lastSync = heartbeat.cloudSyncLastAt ? fmtDate(heartbeat.cloudSyncLastAt) : 'todavía no sincronizó';
  const accounts = heartbeat.portalAccounts == null ? 'cuentas sin medir' : `${heartbeat.activePortalAccounts ?? 0} de ${heartbeat.portalAccounts} cuentas de socios activas`;
  const error = heartbeat.cloudSyncError ? ` · error: ${heartbeat.cloudSyncError}` : '';
  return `${heartbeat.cloudSyncConnected ? 'conectada' : 'desconectada'} · último envío: ${lastSync} · ${accounts}${error}`;
}

function systemExpandedDetails(client, detail, license, installations = [], errors = []) {
  const sync = client.sync || {};
  const activations = license?.activations || [];
  const linked = activations.filter((activation) => activation.install_id === sync.installationId || (client.name && String(license?.client || '').trim().toLowerCase() === String(client.name).trim().toLowerCase()));
  const heartbeatById = new Map((installations || []).map((item) => [item.installationId, item]));
  const heartbeatRows = linked.map((activation) => {
    const heartbeat = heartbeatById.get(activation.install_id);
    return `<div class="muted" style="margin-top:4px">${esc(activation.sede || activation.install_id || 'Instalación')}: ${activation.active ? 'asiento ocupado' : 'asiento liberado'} · ${activation.last_seen_at ? `Licencia verificada ${esc(relTime(activation.last_seen_at))}` : 'sin verificación reciente de licencia'} · ${heartbeat ? `${heartbeat.active ? 'escritorio activo' : 'sin señal reciente'} · versión ${esc(heartbeat.appVersion || '—')} · última señal ${esc(relTime(heartbeat.lastSeenAt))}` : 'sin señal de escritorio recibida'} · IP de activación ${esc(activation.last_ip || 'no informada')}</div>`;
  }).join('') || '<div class="muted" style="margin-top:4px">No hay activaciones del Licensador asociadas a este cliente.</div>';
  const modules = (detail.modules || []).map((module) => `<div class="row" style="gap:8px;margin-top:4px"><span class="pill ${module.active ? 'ok' : 'warn'}">${module.active ? 'activo' : 'inactivo'}</span><strong>${esc(module.label)}</strong><span class="muted">${esc(module.detail || 'sin detalle')}</span></div>`).join('') || '<div class="muted">No se recibieron detalles de módulos.</div>';
  const clientErrors = (errors || []).filter((item) => item.organizationId === client.id).slice(0, 5);
  const errorDetails = clientErrors.length ? clientErrors.map((item) => `<div class="muted" style="margin-top:4px">${esc(fmtDate(item.createdAt))} · HTTP ${esc(item.statusCode || '—')} · ${esc(item.message || 'error sin detalle')} · ${esc(item.method || '')} ${esc(item.path || '')}</div>`).join('') : '<div class="muted">No hay errores recibidos para mostrar en esta consulta.</div>';
  const partnerData = state.cache.partnerApps?.[client.id];
  const portalSummary = `<div style="margin-top:10px"><strong>Apps del cliente: Socios y Profes</strong><div class="muted">Socios: ${detail.counts?.activePortalAccounts ?? '—'} activas de ${detail.counts?.portalAccounts ?? '—'} · Profes: ${(detail.modules || []).find((m) => m.id === 'profes')?.detail || 'sin cuentas informadas'}</div><button class="btn small" data-partner-app="${esc(client.id)}">${partnerData ? 'Actualizar detalle de apps' : 'Ver cuentas, accesos y actividad'}</button><div id="partner-app-${esc(client.id)}">${partnerData ? partnerAppDetailHtml(partnerData, client.id) : '<div class="muted">El detalle de Socios y Profes se consulta al abrirlo.</div>'}</div></div>`;
  return `<details open style="margin-top:6px"><summary style="cursor:pointer;color:var(--primary-light,#7db8ff)">Ver detalle del sistema</summary><div style="padding:10px 4px;min-width:360px"><div><strong>Actividad y sincronización</strong></div><div class="muted">Último envío: ${esc(sync.lastPushAt ? fmtDate(sync.lastPushAt) : 'sin registro')} · instalación: ${esc(sync.installationId || 'sin vincular')}${sync.lastError ? ` · último error de sync: ${esc(sync.lastError)}` : ''}</div><div style="margin-top:8px"><strong>Licencia y asientos</strong></div><div class="muted">${license ? `${esc(license.plan || 'Plan sin nombre')} · ${Number(license.seats_used || 0)} ocupados de ${Number(license.seats || 0) || 'cupo no informado'} · ${license.expires ? `vence ${esc(fmtDate(license.expires))}` : 'sin vencimiento'}` : 'No se encontró licencia vinculada.'}</div>${heartbeatRows}<div style="margin-top:8px"><strong>Datos del cliente</strong></div><div class="muted">${detail.counts?.users ?? client.users ?? 0} usuarios · ${detail.counts?.activeMembers ?? client.activeMembers ?? 0} socios activos de ${detail.counts?.members ?? client.members ?? 0} · ${detail.counts?.branches ?? client.branches ?? 0} sedes · ${detail.counts?.errors7d ?? 0} errores recibidos en 7 días</div>${portalSummary}<div style="margin-top:8px"><strong>Accesos directos</strong></div><div class="muted" style="margin-top:4px"><a href="https://socios.fitsystem.com.ar" target="_blank" rel="noreferrer">App de socios</a> · <a href="https://profes.fitsystem.com.ar" target="_blank" rel="noreferrer">Portal de profes</a> · <a href="https://fitora.fitsystem.com.ar" target="_blank" rel="noreferrer">Fitora</a></div><div style="margin-top:8px"><strong>Módulos y estado</strong>${modules}</div><div style="margin-top:8px"><strong>Errores recientes recibidos</strong>${errorDetails}</div></div></details>`;
}

function partnerAppDetailHtml(data, organizationId) {
  if (data?.error) return `<div class="muted" style="color:#e57373">No se pudo cargar el detalle: ${esc(data.error)}</div>`;
  const summary = data?.summary || {};
  const accounts = (data?.accounts || []).map((account) => `<tr><td><strong>${esc([account.member?.firstName, account.member?.lastName].filter(Boolean).join(' ') || 'Socio sin nombre')}</strong><div class="muted">Código ${esc(account.member?.memberCode || '—')}</div></td><td>${account.isActive ? '<span class="pill ok">habilitada</span>' : '<span class="pill bad">deshabilitada</span>'}${account.activationPending ? '<div class="muted">activación pendiente</div>' : ''}</td><td><span class="pill ${account.member?.status === 'ACTIVE' ? 'ok' : 'warn'}">${esc(account.member?.status || 'estado desconocido')}</span></td><td>${esc(account.email || 'sin email de acceso')}</td><td>${esc(account.lastLoginAt ? fmtDate(account.lastLoginAt) : 'nunca inició sesión')}</td><td>${Number(account._count?.pushTokens || 0) + Number(account._count?.webPushSubscriptions || 0)} dispositivos</td><td><button class="btn small" data-portal-reset="${esc(account.id)}" data-org="${esc(organizationId || '')}">Resetear acceso</button> <button class="btn small" data-portal-toggle="${esc(account.id)}" data-org="${esc(organizationId || '')}" data-active="${account.isActive ? 'false' : 'true'}">${account.isActive ? 'Deshabilitar' : 'Habilitar'}</button></td></tr>`).join('');
  const errors = (data?.errors || []).map((error) => `<tr><td>${esc(fmtDate(error.createdAt))}</td><td><span class="pill ${error.level === 'error' ? 'bad' : 'warn'}">${esc(error.level)}</span> HTTP ${esc(error.statusCode || '—')}</td><td>${esc(error.message)}</td><td class="mono">${esc(error.method || '')} ${esc(error.path || '')}</td><td><button class="btn small" data-error-help="${esc(repairPrompt(`Cliente ${error.organizationName || ''}`, error.message, `${error.method || ''} ${error.path || ''} �� HTTP ${error.statusCode || '�?'}`))}">Diagnosticar</button></td></tr>`).join('');
  const profes = data?.profes || {};
  const profesSummary = profes.summary || {};
  const teachers = (profes.users || []).map((user) => `<tr><td><strong>${esc(user.name || 'Usuario sin nombre')}</strong><div class="muted">${esc(user.email || 'sin email')}</div></td><td><span class="pill ${user.isActive ? 'ok' : 'bad'}">${user.isActive ? 'activo' : 'inactivo'}</span></td><td>${esc(user.instructor?.name || 'sin perfil de profesor')}</td><td>${esc(user.lastLoginAt ? fmtDate(user.lastLoginAt) : 'nunca inició sesión')}</td><td>${user.instructor?._count?.classes ?? 0}</td></tr>`).join('');
  const instructorRows = (profes.instructors || []).map((instructor) => `<tr><td><strong>${esc(instructor.name || 'Profesor sin nombre')}</strong><div class="muted">${esc(instructor.email || instructor.user?.email || 'sin email')}</div></td><td><span class="pill ${instructor.isActive ? 'ok' : 'bad'}">${instructor.isActive ? 'activo' : 'inactivo'}</span></td><td>${instructor.user ? `${esc(instructor.user.name || instructor.user.email)} · ${instructor.user.isActive ? 'acceso activo' : 'acceso inactivo'}` : 'sin usuario de acceso'}</td><td>${esc(instructor.user?.lastLoginAt ? fmtDate(instructor.user.lastLoginAt) : 'sin acceso registrado')}</td><td>${instructor._count?.classes ?? 0}</td></tr>`).join('');
  return `<div class="card" style="padding:10px;margin-top:8px"><strong>App de socios</strong><div class="muted">Comprobado ${esc(fmtDate(data?.generatedAt))} · ${summary.active ?? 0} habilitadas de ${summary.total ?? 0} cuentas · ${summary.neverLoggedIn ?? 0} nunca iniciaron sesión · ${summary.pushDevices ?? 0} dispositivos · ${summary.errors30d ?? 0} errores (30 días)</div>${summary.truncated ? '<div class="muted">Se muestran las primeras 500 cuentas.</div>' : ''}<div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Socio</th><th>Acceso a la app</th><th>Estado del socio</th><th>Usuario de acceso</th><th>Último ingreso</th><th>Notificaciones</th></tr></thead><tbody>${accounts || '<tr><td colspan="6">No hay cuentas registradas en esta organización.</td></tr>'}</tbody></table></div><strong style="display:block;margin-top:12px">Portal de Profes</strong><div class="muted">${profesSummary.activeUsers ?? 0} usuarios activos de ${profesSummary.users ?? 0} · ${profesSummary.activeInstructors ?? 0} profesores activos de ${profesSummary.instructors ?? 0} · ${profesSummary.activeClasses ?? 0} clases activas · último acceso ${esc(profesSummary.lastLoginAt ? fmtDate(profesSummary.lastLoginAt) : 'sin accesos registrados')}</div><div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Usuario</th><th>Acceso</th><th>Perfil de profesor</th><th>Último ingreso</th><th>Clases</th></tr></thead><tbody>${teachers || '<tr><td colspan="5">No hay usuarios de profesor en esta organización.</td></tr>'}</tbody></table></div>${profesSummary.usersTruncated ? '<div class="muted">Se muestran los primeros 300 usuarios.</div>' : ''}<strong style="display:block;margin-top:8px">Profesores registrados</strong><div style="overflow:auto"><table><thead><tr><th>Profesor</th><th>Estado</th><th>Cuenta</th><th>Último ingreso</th><th>Clases</th></tr></thead><tbody>${instructorRows || '<tr><td colspan="5">No hay perfiles de profesor registrados.</td></tr>'}</tbody></table></div>${profesSummary.instructorsTruncated ? '<div class="muted">Se muestran los primeros 300 profesores.</div>' : ''}<strong style="display:block;margin-top:10px">Errores recibidos de este cliente (30 días)</strong><div style="overflow:auto"><table><thead><tr><th>Fecha</th><th>Nivel</th><th>Detalle</th><th>Ruta</th><th></th></tr></thead><tbody>${errors || '<tr><td colspan="4">No hay errores registrados para esta organización en los últimos 30 días. Esto no descarta fallas que no llegaron a reportarse.</td></tr>'}</tbody></table></div></div>`;
}

function clientCatalog() {
  const c = state.cache.clientes || {};
  const rows = (c.data?.clients || []).map((row) => ({ ...row, modules: c.systemsById?.get(row.id)?.modules || [] }));
  const seen = new Set(rows.map((row) => row.sync?.installationId).filter(Boolean));
  const byInstall = new Map();
  for (const item of c.installations?.installations || []) byInstall.set(item.installationId, { heartbeat: item, license: null, activationAt: null });
  for (const license of c.licenses || []) for (const activation of license.activations || []) {
    if (!activation.install_id) continue;
    const item = byInstall.get(activation.install_id) || { heartbeat: null, license: null, activationAt: null };
    if (!item.license || activation.active) { item.license = license; item.activationAt = activation.activated_at || item.activationAt; }
    byInstall.set(activation.install_id, item);
  }
  for (const [id, item] of byInstall) {
    if (seen.has(id)) continue;
    rows.push({
      id, name: item.license?.client || 'Instalación de escritorio', slug: id,
      isLocalInstallation: true, heartbeat: item.heartbeat,
      members: 0, activeMembers: 0, users: 0, branches: 0, attendances: 0,
      sync: { connected: Boolean(item.heartbeat?.active), installationId: id, lastPushAt: item.heartbeat?.lastSeenAt || item.activationAt, lastError: null },
      lastAttendanceAt: null, lastPaymentAt: null, lastMemberAt: null,
    });
  }
  return rows;
}

const DIAG_ORDER = { fail: 0, warn: 1, info: 2 };

function repairPrompt(area, title, detail = '') {
  const prefix = `${area}: ${title}. ${detail}`;
  if (/disco/i.test(title)) return `${prefix} Revisá el espacio y recomendá qué limpiar sin borrar datos.`;
  if (/ram|memoria|swap/i.test(title)) return `${prefix} Diagnosticá memoria del VPS y sugerí un paso seguro.`;
  if (/contenedor|servicio/i.test(title)) return `${prefix} Revisá los contenedores afectados y sus logs.`;
  if (/base de datos|postgres/i.test(`${area} ${title}`)) return `${prefix} Revisá conectividad de PostgreSQL y sus logs.`;
  if (/sitio|web/i.test(`${area} ${title}`)) return `${prefix} Revisá el servicio web y sus logs.`;
  if (/api|nube/i.test(`${area} ${title}`)) return `${prefix} Revisá la API y sus logs.`;
  if (/brevo|correo|marketing/i.test(`${area} ${title}`)) return `${prefix} Volvé a probar Brevo desde el panel sin cambiar claves.`;
  if (/licencia|licensador/i.test(`${area} ${title}`)) return `${prefix} Comprobá Licensador y el estado de licencia.`;
  return `${prefix} Diagnosticá el problema y proponé el siguiente paso seguro.`;
}

async function openAssistantFor(text) {
  state.view = 'asistente';
  renderNav();
  await renderView();
  await assistantSend(text);
}

function diagnoseClient(client, license) {
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  const sync = client.sync || {};

  if (!license) {
    add('warn', 'Sin licencia asociada');
  } else if (license.state === 'revoked') {
    add('fail', 'Licencia revocada');
  } else if (typeof license.expires === 'number' && license.expires > 0) {
    const days = Math.ceil((license.expires - Date.now()) / 86400000);
    if (days < 0) add('fail', `Licencia vencida hace ${Math.abs(days)} d`);
    else if (days <= 7) add('warn', `Licencia vence en ${days} d`);
  }

  if (client.isLocalInstallation) {
    if (!client.heartbeat) add('warn', 'Licencia registrada, sin señal reciente del escritorio');
    else if (!client.heartbeat.active) add('warn', 'Escritorio sin señal en las últimas 24 h');
    else add('info', `Escritorio activo · versión ${client.heartbeat.appVersion || 'desconocida'}`);
    const heartbeat = client.heartbeat;
    if (heartbeat?.cloudSyncConnected === true) {
      const lastSync = heartbeat.cloudSyncLastAt ? relTime(heartbeat.cloudSyncLastAt) : 'todavía no informó un envío';
      add('info', `Sincronización con la nube conectada · último envío ${lastSync} · ${heartbeat.activePortalAccounts ?? 0}/${heartbeat.portalAccounts ?? 0} cuentas de socios activas`);
    } else if (heartbeat?.cloudSyncConnected === false) {
      add('warn', `Sincronización con la nube desconectada${heartbeat.cloudSyncError ? ` · ${heartbeat.cloudSyncError}` : ''}`);
    } else if (heartbeat) {
      add('info', 'Esta instalación aún no reporta el estado de sincronización y sus aplicaciones');
    }
  } else if (!sync.connected) {
    add('warn', 'Sin conexión a la nube (nunca sincronizó)');
  } else {
    if (sync.lastError) add('fail', 'Último sync con error');
    if (!sync.installationId) add('warn', 'Instalación no vinculada (actualizá el escritorio)');
    if (sync.lastPushAt) {
      const h = (Date.now() - new Date(sync.lastPushAt).getTime()) / 3600000;
      if (h > 48) add('warn', `Sin sincronizar hace ${Math.floor(h / 24)} d`);
    }
  }

  if (!client.isLocalInstallation) {
    if (!client.members) add('warn', 'Sin socios cargados');
    if (!client.users) add('warn', 'Sin usuarios');
  }
  if (!client.isLocalInstallation) {
    const portal = (client.modules || []).find((module) => module.id === 'socios');
    if (portal && !portal.active) add('warn', `App de socios sin cuentas activas · ${portal.detail}`);
    const profes = (client.modules || []).find((module) => module.id === 'profes');
    if (profes && !profes.active) add('warn', `Portal de profesores sin usuarios/profesores activos · ${profes.detail}`);
    const whatsapp = (client.modules || []).find((module) => module.id === 'whatsapp');
    if (whatsapp && !whatsapp.active) add('warn', 'WhatsApp sin sesión vinculada');
  }

  const activity = [client.lastAttendanceAt, client.lastPaymentAt, client.lastMemberAt]
    .filter(Boolean)
    .map((v) => new Date(v).getTime())
    .filter((n) => !Number.isNaN(n));
  if (activity.length && !client.isLocalInstallation) {
    const d = (Date.now() - Math.max(...activity)) / 86400000;
    if (d > 30) add('info', `Sin actividad hace ${Math.floor(d)} d`);
  } else if (!client.isLocalInstallation) {
    add('info', 'Sin actividad registrada');
  }

  checks.sort((a, b) => DIAG_ORDER[a.level] - DIAG_ORDER[b.level]);
  const severity = checks.some((c) => c.level === 'fail')
    ? 'fail'
    : checks.some((c) => c.level === 'warn')
      ? 'warn'
      : 'ok';
  return { checks, severity };
}

function clientesAnalysis() {
  const c = state.cache.clientes || {};
  const d = c.data;
  if (!d && !c.installations && !c.licenses) return [];
  const licenses = c.licenses || [];
  return clientCatalog()
    .map((row) => {
      const license = licenseFor(row, licenses) || (row.heartbeat?.hasLicense ? {
        plan: row.heartbeat.licensePlan,
        state: String(row.heartbeat.licenseStatus || 'active').toLowerCase(),
        expires: row.heartbeat.licenseExpiresAt ? new Date(row.heartbeat.licenseExpiresAt).getTime() : null,
        key: null,
        client: row.name,
      } : null);
      return { row, license, diag: diagnoseClient(row, license) };
    })
    .sort((a, b) => DIAG_ORDER[a.diag.severity] - DIAG_ORDER[b.diag.severity] || String(a.row.name).localeCompare(String(b.row.name)));
}

function clientsTableHtml() {
  const c = state.cache.clientes || {};
  const q = String(c.q || '').trim().toLowerCase();
  const filter = c.filter || 'todos';
  const visible = clientesAnalysis().filter((x) => {
    if (filter === 'problemas' && x.diag.severity === 'ok') return false;
    if (filter === 'sinsync' && x.row.sync && x.row.sync.connected) return false;
    if (filter === 'sincronizados' && !(x.row.sync && x.row.sync.connected)) return false;
    if (q && !`${x.row.name} ${x.row.slug}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sevPill = { fail: '<span class="pill bad">falla</span>', warn: '<span class="pill warn">aviso</span>', ok: '<span class="pill ok">ok</span>' };
  const checkPill = { fail: '<span class="pill bad">×</span>', warn: '<span class="pill warn">!</span>', info: '<span class="pill">i</span>' };

  const rows = visible
    .map(({ row, license, diag }) => {
      const sync = row.sync || {};
      const expired = license?.expires && Number(license.expires) > 0 && Number(license.expires) < Date.now();
      const lic = license
        ? `<strong>${esc(license.plan || '—')}</strong>
           <div class="muted">${license.expires ? 'vence ' + fmtDate(license.expires) : 'sin vencimiento'}</div>
           <div style="margin-top:4px">${license.state === 'revoked' ? '<span class="pill bad">revocada</span>' : expired ? '<span class="pill bad">vencida</span>' : String(license.plan).toUpperCase() === 'TRIAL' ? '<span class="pill warn">prueba</span>' : '<span class="pill ok">activa</span>'}</div>`
        : '<span class="muted">sin licencia</span>';
      const checks =
        diag.checks.length > 0
          ? diag.checks.map((k) => `<div class="row" style="gap:8px;align-items:flex-start;margin-top:4px">${checkPill[k.level] || ''}<span class="muted">${esc(k.text)}</span></div>`).join('')
          : '<span class="pill ok">todo en orden</span>';
      const lastActivity = [row.lastAttendanceAt, row.lastPaymentAt, row.lastMemberAt]
        .filter(Boolean)
        .map((v) => new Date(v).getTime())
        .filter((n) => !Number.isNaN(n));
      const last = lastActivity.length ? relTime(new Date(Math.max(...lastActivity)).toISOString()) : '—';
      const nextStep = diag.severity === 'fail' ? 'Revisá la licencia o los errores de sincronización.' : diag.severity === 'warn' ? 'Abrí el diagnóstico recomendado para esta instalación.' : 'Sin acción pendiente.';
      return `<tr>
        <td>
          <strong>${esc(row.name)}</strong>
          <div class="muted mono">${esc(row.slug)}</div>
          <div class="muted mono" style="font-size:11px">${esc(sync.installationId || 'sin instalación vinculada')}</div>
        </td>
        <td>${lic}</td>
        <td>
          <div class="row"><span class="muted">Socios</span><span>${row.members} <span class="muted">(${row.activeMembers} act.)</span></span></div>
          <div class="row"><span class="muted">Usuarios</span><span>${row.users}</span></div>
          <div class="row"><span class="muted">Sedes</span><span>${row.branches}</span></div>
        </td>
        <td>
          <div>${sync.connected ? '<span class="pill ok">conectado</span>' : '<span class="pill warn">sin sync</span>'}</div>
          <div class="muted" style="margin-top:4px">${esc(relTime(sync.lastPushAt))}</div>
          ${sync.lastError ? `<div class="muted" style="color:#e57373;font-size:11px;max-width:220px">${esc(sync.lastError)}</div>` : ''}
        </td>
        <td class="muted" style="white-space:nowrap">${esc(last)}<div class="muted" style="font-size:11px">${row.attendances} ingresos</div></td>
        <td>${(row.modules || []).map((module) => { const optional = ['arca', 'email', 'mercadopago', 'suscripcion'].includes(module.id); const cls = module.active ? 'ok' : optional ? '' : 'warn'; return `<span class="pill ${cls}" title="${esc(module.detail)}">${esc(module.label)} · ${module.active ? 'activo' : optional ? 'sin configurar' : 'revisar'}</span> `; }).join('') || '<span class="muted">Módulos sin señal</span>'}</td>
        <td>
          <div>${sevPill[diag.severity] || ''}</div>
          <div style="margin-top:6px">${checks}</div>
          <div class="muted" style="margin-top:8px">Siguiente paso: ${esc(nextStep)}</div>
          ${diag.severity !== 'ok' ? `<button class="btn small" style="margin-top:6px" data-client-help="${esc(repairPrompt(`Cliente ${row.name}`, diag.checks.map((check) => check.text).join('. '), 'Dame un procedimiento seguro y específico.'))}">Ver solución guiada</button>` : ''}
        </td>
      </tr>`;
    })
    .join('');

  return `<div class="card" id="cli-table" style="padding:0;overflow:auto">
    <table>
      <thead><tr><th>Cliente / instalación</th><th>Licencia</th><th>Datos</th><th>Sincronización</th><th>Última actividad</th><th>Módulos</th><th>Diagnóstico y siguiente paso</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted" style="padding:14px">No hay clientes ni instalaciones que coincidan.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function clientesHtml() {
  const c = state.cache.clientes || {};
  if (c.error && !(c.data && (c.data.clients || []).length) && !c.installations && !(c.licenses || []).length) {
    return `<div class="card muted">Error: ${esc(c.error)}</div>
      <p class="muted" style="margin-top:8px">Revisá el token del proveedor en Configuración y que la API esté desplegada con el diagnóstico de clientes.</p>`;
  }
  if (!c.data && !c.installations && !(c.licenses || []).length) return loading();

  const all = clientesAnalysis();
  const linkedLicenseKeys = new Set(all.map((x) => x.license?.key).filter(Boolean));
  const unlinkedLicenses = (c.licenses || []).filter((license) => license.key && !linkedLicenseKeys.has(license.key));
  const problems = all.filter((x) => x.diag.severity !== 'ok').length;
  const noSync = all.filter((x) => !(x.row.sync && x.row.sync.connected)).length;
  const withLicense = all.filter((x) => x.license).length;
  const filter = c.filter || 'todos';
  const filters = [
    ['todos', `Todos (${all.length})`],
    ['problemas', `Con problemas (${problems})`],
    ['sinsync', `Sin sync (${noSync})`],
    ['sincronizados', `Sincronizados (${all.length - noSync})`],
  ];
  const chips = filters
    .map(([id, text]) => `<button class="btn small ${filter === id ? 'primary' : ''}" data-cli-filter="${id}">${esc(text)}</button>`)
    .join(' ');
  const stat = (label, value, sub) =>
    `<div class="card"><div class="muted">${esc(label)}</div><div class="stat" style="font-size:26px">${esc(String(value))}</div>${sub ? `<div class="muted" style="font-size:12px">${esc(sub)}</div>` : ''}</div>`;

  return `<div class="row" style="justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div class="row" style="gap:6px;flex-wrap:wrap">${chips}</div>
      <div class="row" style="gap:8px">
        <input id="cli-q" type="text" value="${esc(c.q || '')}" placeholder="Buscar cliente…" style="background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:7px 10px;color:var(--text);min-width:200px" />
        <button class="btn small" data-cli-reload>Actualizar</button>
      </div>
    </div>
    <div class="grid" style="margin-bottom:14px">
      ${stat('Clientes e instalaciones', all.length, `${c.data?.totals?.members ?? 0} socios sincronizados`)}
      ${stat('Con problemas', problems, 'requieren atención')}
      ${stat('Sin sincronizar', noSync, 'sin conexión a la nube')}
      ${stat('Con licencia', withLicense, 'detectada por instalación')}
    </div>
    ${(c.sourcesError || []).length ? `<div class="card muted" style="margin-bottom:10px">Fuentes sin respuesta: ${c.sourcesError.map(esc).join(' · ')}</div>` : ''}
    ${all.length === 0 && !(c.sourcesError || []).length ? `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--warn,#e9a23b)"><h3>No hay sistemas vinculados todavía</h3><p class="muted">El panel consultó correctamente la nube, el Licensador y los reportes de instalaciones, pero esas fuentes no devolvieron clientes, licencias ni instalaciones. Para ver cada sistema por cliente, registrá la organización en la nube y conectá la sincronización de la aplicación. Las instalaciones de escritorio aparecerán cuando envíen su primer latido.</p><button class="btn small" data-goto="config">Revisar conexión del panel</button></div>` : ''}
    <div class="muted" style="margin-bottom:10px">Actualizado ${esc(relTime(c.data?.generatedAt || c.installations?.generatedAt))} · nube, escritorio, actividad y Licensador</div>
    ${clientsTableHtml()}
    ${unlinkedLicenses.length ? `<div class="card" style="padding:0;overflow:auto;margin-top:14px">
      <h3 style="padding:16px 16px 0;margin-bottom:8px">Licencias emitidas sin sistema sincronizado</h3>
      <p class="muted" style="padding:0 16px">Estas licencias no tienen una organización vinculada en la nube; por eso todavía no hay datos de uso ni módulos activos para mostrar.</p>
      <table><thead><tr><th>Cliente</th><th>Plan</th><th>Asientos</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${unlinkedLicenses.map((license) => `<tr>
        <td><strong>${esc(license.client || 'Sin nombre')}</strong><div class="muted mono">${esc(String(license.key || '').slice(0, 18))}…</div></td>
        <td>${esc(license.plan || '—')}</td><td>${Number(license.seats_used || 0)} / ${esc(license.seats ?? '?')}</td>
        <td>${fmtDate(license.expires)}</td><td>${license.state === 'revoked' ? '<span class="pill bad">revocada</span>' : '<span class="pill warn">sin vincular</span>'}</td>
      </tr>`).join('')}</tbody></table>
    </div>` : ''}`;
}

async function loadClients() {
  const c = (state.cache.clientes = state.cache.clientes || {});
  const [clients, licenses, systems, installations] = await Promise.allSettled([api.clientsList(), api.licensadorOverview(), api.opsSystems(), api.opsDesktopInstallations()]);
  if (clients.status === 'fulfilled') {
    c.data = clients.value;
    c.error = null;
  } else {
    c.error = clients.reason?.message || String(clients.reason);
  }
  c.licenses = licenses.status === 'fulfilled' ? licenses.value.licenses || [] : [];
  c.installations = installations.status === 'fulfilled' ? installations.value : null;
  c.systemsById = new Map((systems.status === 'fulfilled' ? systems.value.clients || [] : []).map((row) => [row.id, row]));
  c.sourcesError = [licenses, systems, installations].filter((item) => item.status === 'rejected').map((item) => item.reason?.message || String(item.reason));
}

function paintClientes() {
  const view = $('#view');
  view.innerHTML = clientesHtml();
  wireClientes(view);
}

function wireClientes(view) {
  view.querySelectorAll('[data-client-help]').forEach((button) => button.addEventListener('click', () => openAssistantFor(button.dataset.clientHelp)));
  view.querySelectorAll('[data-cli-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cache.clientes.filter = btn.dataset.cliFilter;
      paintClientes();
    }),
  );
  const input = view.querySelector('#cli-q');
  if (input)
    input.addEventListener('input', () => {
      state.cache.clientes.q = input.value;
      const box = view.querySelector('#cli-table');
      if (box) box.outerHTML = clientsTableHtml();
    });
  view.querySelector('[data-cli-reload]')?.addEventListener('click', async () => {
    const prev = state.cache.clientes || {};
    state.cache.clientes = { filter: prev.filter, q: prev.q };
    await loadClients();
    paintClientes();
  });
}

function licensesHtml() {
  const c = state.cache.licenses || {};
  if (c.error) return `<div class="card muted">Error: ${esc(c.error)}</div>`;
  const rows = c.items || [];
  if (!rows.length) return '<div class="card muted">No hay licencias emitidas todavía.</div>';
  const usableLicenses = rows.filter((license) => license.state !== 'revoked');
  const seatsUsed = usableLicenses.reduce((sum, license) => sum + Number(license.seats_used || 0), 0);
  const seatCapacity = usableLicenses.reduce((sum, license) => sum + Number(license.seats || 0), 0);
  const seatsAvailable = Math.max(0, seatCapacity - seatsUsed);
  const heartbeatById = new Map((c.installations?.installations || []).map((item) => [item.installationId, item]));
  const activationDetails = (license) => {
    const activations = license.activations || [];
    if (!activations.length) return '<div class="muted" style="margin-top:8px">Esta licencia todavía no tiene activaciones registradas.</div>';
    return `<div style="margin-top:8px;min-width:460px">${activations.map((activation) => {
      const heartbeat = heartbeatById.get(activation.install_id);
      const seatStatus = activation.active ? 'asiento ocupado · activación vigente' : 'asiento liberado · activación desactivada';
      const activityStatus = heartbeat ? (heartbeat.active ? `escritorio activo · v${esc(heartbeat.appVersion || '—')} · última señal ${esc(relTime(heartbeat.lastSeenAt))}` : `sin señal reciente · última ${esc(relTime(heartbeat.lastSeenAt))}`) : 'uso del escritorio sin confirmar';
      return `<div style="padding:8px 0;border-top:1px solid var(--border)"><div class="row" style="justify-content:space-between;gap:8px"><strong>${esc(activation.sede || activation.install_id || 'Activación')}</strong><span class="pill ${activation.active ? 'ok' : ''}">${seatStatus}</span></div><div class="muted mono" style="margin-top:4px">Instalación: ${esc(activation.install_id || 'sin ID')}</div><div class="muted">Activada: ${esc(activation.activated_at ? fmtDate(activation.activated_at) : 'fecha no informada')} · IP: ${esc(activation.last_ip || 'sin IP')}</div><div class="muted">${activityStatus}</div></div>`;
    }).join('')}</div>`;
  };
  return `<div class="grid" style="margin-bottom:14px"><div class="card"><div class="muted">Asientos ocupados (Licensador)</div><div class="stat" style="font-size:26px">${seatsUsed} <small>/ ${seatCapacity || 'sin cupo informado'}</small></div><div class="muted">${seatsAvailable} disponibles · uso real del escritorio se confirma con señal reciente</div></div><div class="card"><div class="muted">Licencias</div><div class="stat" style="font-size:26px">${rows.length}</div><div class="muted">${rows.filter((license) => license.state !== 'revoked').length} no revocadas</div></div></div>
  <div class="card" style="padding:0;overflow:auto">
    <table>
      <thead><tr><th>Cliente</th><th>Plan</th><th>Asientos ocupados / cupo</th><th>Disponibles</th><th>Vence</th><th>Estado</th><th>Detalle de activaciones</th><th></th></tr></thead>
      <tbody>
      ${rows
        .map((l) => {
          const used = l.seats_used ?? 0;
          const capacity = Number(l.seats || 0);
          const activeCount = (l.activations || []).filter((activation) => activation.active).length;
          const state_ = l.state === 'revoked' ? '<span class="pill bad">revocada</span>' : '<span class="pill ok">emitida</span>';
          const details = activationDetails(l);
          return `<tr>
            <td><strong>${esc(l.client)}</strong><div class="muted mono">${esc(l.key?.slice(0, 18))}…</div></td>
            <td>${esc(l.plan)}</td>
            <td><strong>${used} / ${capacity || '?'}</strong><div class="muted">${activeCount} activaciones vigentes</div></td>
            <td>${capacity ? Math.max(0, capacity - Number(used)) : '—'}</td>
            <td>${fmtDate(l.expires)}</td>
            <td>${state_}</td>
            <td>
              <details><summary style="cursor:pointer">Ver ${Number(l.activations?.length || 0)} activaciones</summary>${details}</details>
            </td>
            <td>${l.state === 'revoked' ? `<button class="btn small" data-unrevoke="${esc(l.key)}">Reactivar</button>` : `<button class="btn small danger" data-revoke="${esc(l.key)}">Revocar</button>`}</td>
          </tr>`;
        })
        .join('')}
      </tbody>
    </table>
  </div>`;
}

async function loadLicenses() {
  const [overview, installations] = await Promise.allSettled([api.licensadorOverview(), api.opsDesktopInstallations()]);
  if (overview.status === 'rejected') {
    state.cache.licenses = { error: overview.reason?.message || String(overview.reason), items: [] };
    return;
  }
  state.cache.licenses = { items: overview.value.licenses || [], installations: installations.status === 'fulfilled' ? installations.value : null, installationsError: installations.status === 'rejected' ? installations.reason?.message || String(installations.reason) : null };
}

function ipsHtml() {
  const c = state.cache.ips || {};
  if (c.error) return `<div class="card muted">Error: ${esc(c.error)}</div>`;
  const rows = c.items || [];
  if (!rows.length) return '<div class="card muted">No hay IPs registradas en las activaciones ni descargas recientes.</div>';
  const analysis = c.analysis;
  const panel = analysis
    ? `<div class="card" style="margin-bottom:14px">
        <h3>Análisis de ${esc(analysis.ip)} ${analysis.vpsMatch ? '<span class="pill warn">es el VPS</span>' : ''}</h3>
        ${analysis.analysisError ? `<div class="muted">Error: ${esc(analysis.analysisError)}</div>` : ipAnalysisHtml(analysis.data)}
      </div>`
    : '';
  return panel + `<div class="card" style="padding:0;overflow:auto">
    <table>
      <thead><tr><th>IP</th><th>Cliente / archivo</th><th>Fecha</th><th>Origen</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><td class="mono">${esc(r.ip)}</td><td>${esc(r.client || r.asset || 'Licencia')}</td><td>${fmtDate(r.at)}</td><td>${esc(r.source || 'activación')}</td>
            <td><button class="btn small" data-ip="${esc(r.ip)}">Analizar</button></td></tr>`,
        )
        .join('')}</tbody>
    </table>
  </div>`;
}

function ipAnalysisHtml(d) {
  if (!d) return '';
  const g = d.geo || {};
  const flags = [
    g.mobile ? 'red móvil' : '',
    g.proxy ? 'posible VPN/proxy' : '',
    g.hosting ? 'hosting/datacenter' : '',
  ].filter(Boolean);
  return `
    <div class="grid">
      <div><div class="muted">Ubicación</div>${esc([g.city, g.regionName, g.country].filter(Boolean).join(', ') || '—')}</div>
      <div><div class="muted">Proveedor (ISP)</div>${esc(g.isp || '—')}</div>
      <div><div class="muted">Organización / AS</div>${esc(g.org || '')} ${esc(g.as || '')}</div>
      <div><div class="muted">Dominio inverso</div>${esc((d.reverse || []).join(', ') || '—')}</div>
    </div>
    <div style="margin-top:12px">
      ${flags.map((f) => `<span class="pill warn">${esc(f)}</span> `).join('') || '<span class="pill ok">sin señales de riesgo</span>'}
    </div>
    <div style="margin-top:12px">${(d.tcp || [])
      .map((t) => `<span class="pill ${t.open ? 'ok' : ''}">puerto ${t.port}: ${t.open ? 'abierto ' + t.ms + 'ms' : 'cerrado'}</span> `)
      .join('')}</div>`;
}

async function loadIps() {
  const [ov, dl] = await Promise.allSettled([api.licensadorOverview(), api.opsDownloads(90)]);
  if (ov.status === 'rejected' && dl.status === 'rejected') {
    state.cache.ips = { error: ov.reason?.message || dl.reason?.message || 'No se pudieron consultar las IPs', items: [] };
    return;
  }
  const seen = new Map();
  for (const l of (ov.status === 'fulfilled' ? ov.value.licenses || [] : [])) {
    for (const a of l.activations || []) {
      if (!a.last_ip) continue;
      const prev = seen.get(a.last_ip);
      if (!prev || (a.activated_at || 0) > prev.at) seen.set(a.last_ip, { ip: a.last_ip, client: l.client, at: a.activated_at, source: 'activación' });
    }
  }
  const downloads = dl.status === 'fulfilled' ? (dl.value.rows || []).map((r) => ({ ip: r.ip, asset: r.asset, at: r.at, source: `descarga · ${r.source}` })).filter((r) => r.ip) : [];
  state.cache.ips = { ...(state.cache.ips || {}), items: [...seen.values(), ...downloads].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()), warning: dl.status === 'rejected' ? `Descargas: ${dl.reason?.message}` : null };
}

async function loadOps() {
  const [systems, downloads, errors, installations, licenses] = await Promise.allSettled([api.opsSystems(), api.opsDownloads(90), api.opsErrors(), api.opsDesktopInstallations(), api.licensadorOverview()]);
  state.cache.ops = {
    systems: systems.status === 'fulfilled' ? systems.value : null,
    downloads: downloads.status === 'fulfilled' ? downloads.value : null,
    errors: errors.status === 'fulfilled' ? errors.value : null,
    installations: installations.status === 'fulfilled' ? installations.value : null,
    licenses: licenses.status === 'fulfilled' ? licenses.value : null,
    errorsList: [systems, downloads, errors, installations, licenses].filter((x) => x.status === 'rejected').map((x) => x.reason?.message || String(x.reason)),
  };
  const clients = (systems.status === 'fulfilled' ? (systems.value?.clients || []) : []);
  state.cache.partnerApps = state.cache.partnerApps || {};
  await Promise.allSettled(clients.map(async (client) => {
    try { state.cache.partnerApps[client.id] = await api.opsPartnerApp(client.id); }
    catch (e) { state.cache.partnerApps[client.id] = { error: e.message || String(e) }; }
  }));
}

function opsHtml() {
  const d = state.cache.ops || {};
  const systems = d.systems || {};
  const downloads = d.downloads || {};
  const geoConfigured = Boolean(downloads.geolocation?.configured);
  const geoProvider = downloads.geolocation?.provider || 'ipdata.co';
  const errorRows = d.errors?.rows || [];
  const errorsUnavailable = !d.errors;
  const clientRows = (systems.clients || []).map((c) => {
    const license = licenseFor(c, d.licenses?.licenses || []);
    return `<tr><td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.slug)}</div>${systemExpandedDetails(c, c, license, d.installations?.installations || [], errorRows)}</td><td>${c.isActive ? '<span class="pill ok">activo</span>' : '<span class="pill bad">inactivo</span>'}</td><td>${c.counts?.users ?? 0} usuarios · ${c.counts?.activeMembers ?? 0}/${c.counts?.members ?? 0} socios</td><td>${esc(c.sync?.lastPushAt ? relTime(c.sync.lastPushAt) : 'sin sincronizar')}</td><td>${(c.modules || []).map((m) => `<span class="pill ${m.active ? 'ok' : ''}" title="${esc(m.detail)}">${esc(m.label)}: ${m.active ? 'sí' : 'no'}</span> `).join('')}</td><td>${c.counts?.errors7d ?? 0}</td></tr>`;
  }).join('');
  const installRows = (() => {
    const byId = new Map();
    for (const install of d.installations?.installations || []) byId.set(install.installationId, { install, license: null, activatedAt: null });
    for (const license of d.licenses?.licenses || []) for (const activation of license.activations || []) {
      if (!activation.install_id) continue;
      const current = byId.get(activation.install_id) || { install: null, license: null, activatedAt: null };
      if (!current.license || activation.active) { current.license = license; current.activatedAt = activation.activated_at || current.activatedAt; }
      byId.set(activation.install_id, current);
    }
    return [...byId.entries()].map(([id, item]) => {
      const hb = item.install;
      const lic = item.license;
      const partnerClient = (systems.clients || []).find((client) => client.installationId === id)
        || (systems.clients || []).find((client) => String(client.name || '').trim().toLowerCase() === String(lic?.client || '').trim().toLowerCase());
      const partnerAppStatus = partnerClient
        ? `Cliente de nube ${esc(partnerClient.name)} · ${partnerClient.counts?.activePortalAccounts ?? 0}/${partnerClient.counts?.portalAccounts ?? 0} cuentas de Socios activas · ${(partnerClient.modules || []).find((module) => module.id === 'profes')?.detail || 'Profes: sin cuentas informadas'} · abrir Sistemas activos para ver usuarios y accesos`
        : hb?.cloudSyncConnected === true
          ? `Sincronización conectada; ${hb.activePortalAccounts ?? 0}/${hb.portalAccounts ?? 0} cuentas activas informadas por el escritorio. La disponibilidad de los portales se comprueba en Servicios de FIT System.`
          : 'Instalación de escritorio y licencia verificadas por separado. El estado de los portales se muestra en Servicios de FIT System; esta fila no representa una cuenta de Socios.';
      const activation = lic?.activations?.find((row) => row.install_id === id);
      const expired = lic?.expires && Number(lic.expires) > 0 && Number(lic.expires) < Date.now();
      const licText = !lic ? 'sin licencia registrada' : lic.state === 'revoked' ? 'revocada' : expired ? 'vencida' : String(lic.plan).toUpperCase() === 'TRIAL' ? 'prueba' : 'activa';
      const licClass = licText === 'activa' ? 'ok' : licText === 'revocada' || licText === 'vencida' ? 'bad' : 'warn';
      const licenseSeenAt = Number(activation?.last_seen_at) || 0;
      const licenseSeenRecently = licenseSeenAt > 0 && Date.now() - licenseSeenAt < 7 * 864e5;
      const activity = hb?.active ? 'escritorio con señal reciente' : licenseSeenRecently ? 'licencia respondió recientemente' : hb ? 'sin reporte reciente; puede seguir activa' : 'sin verificación reciente';
      const activityClass = hb?.active ? 'ok' : licenseSeenRecently ? 'ok' : 'warn';
      const commandResult = hb?.lastCommandResult
        ? `${hb.lastCommandResult.ok ? 'Correcto' : 'Falló'} · ${hb.lastCommandResult.message || 'sin detalle'} · ${hb.lastCommandAt ? fmtDate(hb.lastCommandAt) : ''}`
        : 'Sin acciones remotas recientes';
      return `<tr><td><strong>${esc(lic?.client || 'Instalación de escritorio')}</strong><div class="muted mono">${esc(id)}</div><details style="margin-top:6px"><summary style="cursor:pointer">Ver detalles</summary><div class="muted" style="padding:6px 0">Asiento: ${activation ? activation.active ? 'ocupado · activación vigente' : 'liberado · activación desactivada' : 'sin activación asociada'} · cupo: ${Number(lic?.seats_used || 0)} / ${Number(lic?.seats || 0) || 'no informado'}<br>Fecha de activación: ${esc(activation?.activated_at ? fmtDate(activation.activated_at) : item.activatedAt ? fmtDate(item.activatedAt) : 'sin datos')} · IP: ${esc(activation?.last_ip || 'sin datos')}<br>Última verificación de licencia: ${esc(licenseSeenAt ? fmtDate(licenseSeenAt) : 'sin dato')}<br>Última señal del escritorio: ${esc(hb?.lastSeenAt ? fmtDate(hb.lastSeenAt) : 'sin señal')} · versión: ${esc(hb?.appVersion || 'sin versión')}<br><strong>Sincronización:</strong> ${esc(desktopSyncStatusText(hb))}<br><strong>Último reintento solicitado:</strong> ${esc(commandResult)}<br><strong>App de socios:</strong> ${partnerAppStatus}</div></details></td><td><span class="pill ${activityClass}">${activity}</span></td><td><span class="pill ${licClass}">${licText}</span>${lic?.plan ? `<div class="muted">${esc(lic.plan)}</div>` : ''}</td><td>${esc(hb?.appVersion || 'sin señal de versión')}</td><td>${esc(hb?.lastSeenAt ? relTime(hb.lastSeenAt) : licenseSeenAt ? `licencia ${relTime(licenseSeenAt)}` : item.activatedAt ? `activada ${fmtDate(item.activatedAt)}` : '—')}</td><td>${partnerClient ? `<button class="btn small" data-partner-app="${esc(partnerClient.id)}">Ver cuentas del cliente</button>` : '<span class="muted">Sin sistema recibido en nube</span>'} ${hb?.active ? `<button class="btn small" data-desktop-sync="${esc(id)}" ${hb.pendingCommand ? 'disabled' : ''}>${hb.pendingCommand ? 'Reintento en cola' : 'Reintentar sincronización'}</button>` : ''} <button class="btn small" data-sync-help="${esc(repairPrompt(lic?.client || 'Instalacion de escritorio', desktopSyncStatusText(hb), 'Revisa la sincronizacion a la nube y el estado de las cuentas.'))}">Diagnosticar sincronización</button></td></tr>`;
    }).join('');
  })();
  const licenseList = d.licenses?.licenses || [];
  const usableLicenses = licenseList.filter((license) => license.state !== 'revoked');
  const seatsUsed = usableLicenses.reduce((sum, license) => sum + Number(license.seats_used || 0), 0);
  const seatCapacity = usableLicenses.reduce((sum, license) => sum + Number(license.seats || 0), 0);
  const allInstallIds = new Set([
    ...(d.installations?.installations || []).map((install) => install.installationId),
    ...licenseList.flatMap((license) => (license.activations || []).map((activation) => activation.install_id).filter(Boolean)),
  ]);
  const recentInstallations = (d.installations?.installations || []).filter((install) => install.active).length;
  const downloadRows = (downloads.rows || []).map((r) => `<tr><td>${fmtDate(r.at)}</td><td>${esc(r.asset)}</td><td class="mono">${esc(r.ip || 'sin IP')}</td><td>${esc([r.city, r.country].filter(Boolean).join(', ') || '—')}</td><td>${esc(r.isp || r.source)}</td></tr>`).join('');
  const platform = (systems.platform || []).map((s) => `<span class="pill ${['online', 'local', 'configurado', 'con sesiones', 'habilitada'].includes(s.status) ? 'ok' : ['offline', 'con error'].includes(s.status) ? 'bad' : 'warn'}" title="${esc(s.detail)}">${esc(s.name)} · ${esc(s.status)}${(s.url || {web:'https://fitsystem.com.ar',socios:'https://socios.fitsystem.com.ar',profes:'https://profes.fitsystem.com.ar',fitora:'https://fitora.fitsystem.com.ar',licensador:'https://licensador.fitsystem.com.ar'}[s.id]) ? ` <a href="${esc(s.url || {web:'https://fitsystem.com.ar',socios:'https://socios.fitsystem.com.ar',profes:'https://profes.fitsystem.com.ar',fitora:'https://fitora.fitsystem.com.ar',licensador:s.licensador?.url||'https://licensador.fitsystem.com.ar'}[s.id])}" target="_blank" rel="noreferrer" class="btn small" style="margin-left:6px">Abrir</a>` : ''}<div class="muted">${esc(s.detail)}</div>${['offline', 'con error', 'sin sesiones conectadas'].includes(s.status) ? `<button class="btn small" data-service-help="${esc(repairPrompt(s.name, `${s.name} requiere revisión`, s.detail))}">Diagnosticar solución</button>` : ''}</span>`).join(' ');
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="muted">Centro de soporte · clientes, instalaciones, cuentas, errores y sincronización</span><button class="btn small" data-ops-reload>Actualizar sistemas</button></div>
  <div class="grid" style="margin-bottom:14px"><div class="card"><div class="stat">${systems.totals?.clients ?? '—'} <small>clientes en nube</small></div><div class="muted">Organizaciones sincronizadas</div></div><div class="card"><div class="stat">${allInstallIds.size} <small>instalaciones / activaciones</small></div><div class="muted">${recentInstallations} con señal de actividad en 24 h · la falta de señal no confirma que el sistema esté apagado</div></div><div class="card"><div class="stat">${seatsUsed} <small>/ ${seatCapacity || '—'} asientos ocupados</small></div><div class="muted">${seatCapacity ? Math.max(0, seatCapacity - seatsUsed) : '—'} disponibles en licencias no revocadas</div></div><div class="card"><div class="stat">${downloads.summary?.total ?? downloads.total ?? '—'} <small>descargas / 90 días</small></div><div class="muted">${downloads.summary?.uniqueIps ?? 0} IP distintas</div></div><div class="card"><div class="stat">${systems.totals?.withErrors ?? '—'} <small>clientes con errores</small></div><div class="muted">Errores recibidos por la nube</div></div></div>
  ${d.errorsList?.length ? `<div class="card muted">Algunas fuentes no respondieron: ${d.errorsList.map(esc).join(' · ')}</div>` : ''}
  <div class="card" style="margin-bottom:14px"><h3>Servicios de FIT System</h3>${platform || 'Sin datos'}<div class="muted" style="margin-top:8px">Estado informado por la API; para disponibilidad detallada revisá Diagnóstico e Infraestructura.</div></div>
  <div class="card" style="padding:0;overflow:auto;margin-bottom:14px"><h3 style="padding:16px 16px 0">Sistemas sincronizados en la nube</h3><table><thead><tr><th>Cliente</th><th>Cuenta</th><th>Uso</th><th>Última sincronización</th><th>Módulos</th><th>Errores (7d)</th></tr></thead><tbody>${clientRows || '<tr><td colspan="6">No hay cuentas de cliente sincronizadas en la nube. Revisá las instalaciones y licencias detectadas debajo.</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto;margin-bottom:14px"><h3 style="padding:16px 16px 0">Instalaciones de escritorio y licencias (con y sin licencia)</h3><p class="muted" style="padding:0 16px">Actividad confirmada por señal de la aplicación en las últimas 24 h. Las activaciones de licencia se muestran aunque el equipo no haya actualizado para enviar señales.</p><table><thead><tr><th>Cliente / instalación</th><th>Actividad</th><th>Licencia</th><th>Versión</th><th>Última señal / activación</th><th>Acciones</th></tr></thead><tbody>${installRows || '<tr><td colspan="5">Todavía no hay señales de instalaciones ni activaciones registradas.</td></tr>'}</tbody></table></div>
  <div class="row" style="justify-content:space-between;margin:14px 0"><h3>IPs que descargaron el sistema</h3><button class="btn small" data-ops-enrich ${geoConfigured ? '' : 'disabled'}>${geoConfigured ? `Consultar ubicación (envía IPs a ${esc(geoProvider)})` : 'Geolocalización no disponible'}</button></div><p class="muted">${geoConfigured ? `Solo al pulsar el botón se envían las IPs pendientes por HTTPS a ${esc(geoProvider)} para estimar ciudad, país y proveedor. ${downloads.geolocation?.attributionRequired ? 'Proveedor gratuito: incluye atribución.' : ''}` : 'El proveedor de geolocalización no está disponible.'}</p><div class="card" style="padding:0;overflow:auto;margin-bottom:14px"><table><thead><tr><th>Fecha</th><th>Archivo</th><th>IP</th><th>Ubicación</th><th>Proveedor / origen</th></tr></thead><tbody>${downloadRows || '<tr><td colspan="5">No se registraron descargas en el período</td></tr>'}</tbody></table></div>
  ${downloads.geolocation?.attributionRequired ? '<div class="muted" style="margin-top:-8px;margin-bottom:14px">Ubicación aproximada provista por <a href="https://ipdata.co" target="_blank" rel="noreferrer">IP geolocation by ipdata.co</a>.</div>' : ''}
  <div class="card" style="padding:0;overflow:auto"><h3 style="padding:16px 16px 0">Errores reportados por clientes (7 días)</h3><p class="muted" style="padding:0 16px">Un error se muestra cuando la aplicación logra enviarlo a la API. Un resultado vacío no descarta una falla que no pudo reportarse.</p><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Error</th><th>Ruta</th><th></th></tr></thead><tbody>${errorRows.map((r) => `<tr><td>${fmtDate(r.createdAt)}</td><td>${esc(r.organizationName)}</td><td>${esc(r.message)}</td><td class="mono">${esc(r.method || '')} ${esc(r.path || '')}</td><td><button class="btn small" data-error-help="${esc(repairPrompt(`Cliente ${r.organizationName}`, r.message, `${r.method || ''} ${r.path || ''} · HTTP ${r.statusCode || '—'}`))}">Diagnosticar</button></td></tr>`).join('') || `<tr><td colspan="5">${errorsUnavailable ? 'Fuente de errores no disponible; no se puede afirmar que esté vacía.' : 'La consulta no encontró errores reportados en los últimos 7 días.'}</td></tr>`}</tbody></table></div>`;
}

async function loadInvoices() {
  const [config, invoices] = await Promise.allSettled([api.invoiceConfig(), api.invoiceList()]);
  state.cache.invoices = { config: config.status === 'fulfilled' ? config.value : null, rows: invoices.status === 'fulfilled' ? invoices.value?.invoices || [] : [], error: [config, invoices].find((x) => x.status === 'rejected')?.reason?.message };
}

function invoicesHtml() {
  const d = state.cache.invoices || {};
  const c = d.config || {};
  const row = (label, control) => `<div class="field"><label>${label}</label>${control}</div>`;
  const input = (id, value, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${esc(value ?? '')}" ${extra} />`;
  const select = (id, value, options) => `<select id="${id}">${options.map(([v, label]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  return `${d.error ? `<div class="card muted">${esc(d.error)}</div>` : ''}
    <div class="card" style="margin-bottom:14px">
      <h3>Facturación electrónica de suscripciones FIT System</h3>
      <div class="row"><span>ARCA</span><span class="pill ${c.enabled ? 'ok' : 'warn'}">${c.enabled ? 'habilitada' : 'deshabilitada'}</span></div>
      <div class="row"><span>Conexión</span><span>${esc(c.mode || '—')} · ${esc(c.environment || '')}</span></div>
      <div class="row"><span>Certificado ARCA</span><span class="pill ${c.hasCert ? 'ok' : 'warn'}">${c.hasCert ? 'verificado' : 'pendiente'}</span></div>
      ${c.certError ? `<p class="muted">${esc(c.certError)}</p>` : ''}
      <div class="grid" style="margin-top:12px">
        ${row('CUIT emisor', input('invoice-cuit', c.cuit, 'text', 'inputmode="numeric" maxlength="13" placeholder="30123456789"'))}
        ${row('Punto de venta', input('invoice-pto', c.ptoVta || 1, 'number', 'min="1" max="99999"'))}
        ${row('Tipo de comprobante', select('invoice-type', c.invoiceType || 'C', [['A', 'Factura A'], ['B', 'Factura B'], ['C', 'Factura C']]))}
        ${row('Entorno ARCA', select('invoice-environment', c.environment || 'homologacion', [['homologacion', 'Homologación (pruebas)'], ['produccion', 'Producción']]))}
        ${row('Concepto', select('invoice-concept', c.concept || 1, [[1, 'Productos'], [2, 'Servicios'], [3, 'Productos y servicios']]))}
        ${row('Tipo de documento comprador', select('invoice-buyer-doc', c.buyerDocType || 99, [[99, 'Consumidor final'], [80, 'CUIT']]))}
        ${row('Porcentaje IVA (A/B)', input('invoice-iva', c.ivaPercent ?? 0, 'number', 'min="0" max="100" step="0.01"'))}
        ${row('Remitente de facturas', input('invoice-from', c.emailFrom || 'FIT system™ <ventas@fitsystem.com.ar>'))}
      </div>
      <div class="grid">
        ${row('Certificado ARCA (.p12 / .pfx)', '<input id="invoice-cert-file" type="file" accept=".p12,.pfx,application/x-pkcs12" />')}
        ${row('Contraseña del certificado', input('invoice-cert-pass', '', 'password', 'autocomplete="new-password" placeholder="Solo al cargar un certificado nuevo"'))}
      </div>
      <div class="field"><label><input type="checkbox" id="invoice-enabled" ${c.enabled ? 'checked' : ''}/> Habilitar emisión de comprobantes</label></div>
      <div class="field"><label><input type="checkbox" id="invoice-auto" ${c.autoIssue ? 'checked' : ''}/> Emitir automáticamente al acreditarse un pago</label></div>
      <div class="field"><label><input type="checkbox" id="invoice-email-auto" ${c.autoEmail ? 'checked' : ''}/> Enviar automáticamente la factura al comprador</label></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-invoice-save>Guardar configuración</button><button class="btn" data-invoice-test>Probar conexión ARCA</button><button class="btn primary" data-invoice-pending ${c.enabled ? '' : 'disabled'}>Procesar facturas pendientes</button></div>
      <p class="muted" style="margin-bottom:0">La emisión automática solo se activa cuando ARCA está habilitada y el pago queda acreditado. Cargá el certificado y el CUIT correctos; no se generan comprobantes de prueba en producción.</p>
    </div>
    <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>Fecha</th><th>Comprador</th><th>Suscripción</th><th>Comprobante</th><th>Importe</th><th>Estado / error</th><th></th></tr></thead><tbody>${(d.rows || []).map((r) => `<tr><td>${fmtDate(r.issuedAt)}</td><td>${esc(r.buyerName)}<div class="muted">${esc(r.buyerEmail || '')}</div></td><td>${esc(r.plan || r.subscriptionRef)}</td><td>${esc(r.invoiceType)} ${String(r.ptoVta).padStart(5, '0')}-${String(r.cbteNro).padStart(8, '0')}${r.qrUrl ? `<div><a href="${esc(r.qrUrl)}" target="_blank" rel="noreferrer">Ver QR ARCA</a></div>` : ''}</td><td>${esc(r.currency)} ${Number(r.amount || 0).toLocaleString('es-AR')}</td><td>${esc(r.status)}${r.error ? `<div class="muted">${esc(r.error)}</div>` : ''}${r.emailError ? `<div class="muted">${esc(r.emailError)}</div>` : ''}</td><td>${r.status === 'ISSUED' && r.buyerEmail && !r.emailedAt ? `<button class="btn small" data-invoice-email="${esc(r.id)}">Enviar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Todavía no hay comprobantes emitidos</td></tr>'}</tbody></table></div>`;
}

function whatsappHtml() {
  const userAgent = navigator.userAgent.replace(/\sElectron\/[^\s]+/, '');
  return `<div class="row" style="margin-bottom:10px"><span class="muted">Vinculá la cuenta de WhatsApp de FIT System y gestioná sus conversaciones desde el panel.</span><button class="btn small" data-wa-reload>Recargar</button></div><div class="card" style="padding:0;overflow:hidden;height:calc(100vh - 180px);min-height:500px"><webview id="panel-whatsapp" src="https://web.whatsapp.com/" useragent="${esc(userAgent)}" partition="persist:panel-whatsapp" style="display:inline-flex;width:100%;height:100%"></webview></div>`;
}

function vpsHtml() {
  const c = state.cache.vps || {};
  if (c.error) return `<div class="card muted">Error: ${esc(c.error)}</div>`;
  const d = c.data || {};
  const pct = d.memory ? Math.round((d.memory.usedMb / d.memory.totalMb) * 100) : 0;
  const load1 = Number((d.load || '').split(' ')[0]) || 0;
  const cpuPsiMatch = String(d.pressure?.cpu || '').match(/some avg10=([\d.]+)/);
  const cpuPsi = Number(cpuPsiMatch?.[1] || 0);
  const topCpu = Math.max(0, ...(d.processes || []).map((p) => Number(p.cpuPercent) || 0));
  const topContainerCpu = Math.max(0, ...(d.containerUsage || []).map((x) => Number(String(x.cpu || '').replace('%', '')) || 0));
  const noHotProcess = topCpu < 5 && topContainerCpu < 5;
  const diskPct = Math.max(0, ...[...String(d.disk || '').matchAll(/(\d+)%/g)].map((m) => Number(m[1])));
  const cpuContended = cpuPsi >= 20;
  const memoryPsi = Number(String(d.pressure?.memory || '').match(/some avg10=([\d.]+)/)?.[1] || 0);
  const ioPsi = Number(String(d.pressure?.io || '').match(/some avg10=([\d.]+)/)?.[1] || 0);
  const ownPressure = cpuContended ? 'La VPS muestra contención de CPU propia.' : !cpuPsiMatch ? 'No se pudo medir la presión de CPU propia; el estado de CPU es desconocido.' : memoryPsi >= 5 ? 'La VPS muestra esperas de memoria.' : ioPsi >= 10 ? 'La VPS muestra esperas de disco.' : 'No se detecta presión crítica dentro de esta VPS.';
  const diagnosis = `${ownPressure} Presión CPU propia: ${cpuPsiMatch ? `${cpuPsi.toLocaleString('es-AR')}%` : 'sin medición'}; RAM ${pct}%; disco ${diskPct}%. ${d.loadIsHostWide ? `La carga ${load1.toFixed(1)} pertenece al nodo Proxmox compartido y no sirve para atribuir una saturación a tu VPS. ` : ''}${noHotProcess ? 'La muestra no encuentra un proceso ni contenedor consumiendo CPU.' : 'La muestra identifica consumo en procesos o contenedores.'}`;
  const severity = cpuContended || memoryPsi >= 10 || ioPsi >= 20 || pct >= 90 || diskPct >= 95 ? 'var(--bad)' : !cpuPsiMatch || memoryPsi >= 5 || ioPsi >= 10 || pct >= 80 || diskPct >= 85 ? 'var(--warn)' : 'var(--ok)';
  const nextCommand = memoryPsi >= 5 ? 'memoria' : ioPsi >= 10 ? 'logs-db' : 'estado';
  const nextLabel = memoryPsi >= 5 ? 'Ver procesos que usan memoria' : ioPsi >= 10 ? 'Revisar PostgreSQL y disco' : 'Ejecutar diagnóstico general seguro';
  return `<div class="grid">
    <div class="card"><h3>Memoria RAM</h3><div class="stat">${pct}% <small>${d.memory ? `${d.memory.usedMb} / ${d.memory.totalMb} MB` : '—'}</small></div></div>
    <div class="card"><h3>${d.loadIsHostWide ? 'Carga del nodo compartido' : 'Carga (1/5/15 min)'}</h3><div class="stat mono">${esc((d.load || '').split(' ').slice(0, 3).join(' / ') || '—')}</div><small class="muted">${d.loadIsHostWide ? 'Métrica del host Proxmox; no se usa para diagnosticar esta VPS.' : `${esc(String(d.cpuCores || 1))} CPU asignadas.`}</small></div>
    <div class="card"><h3>Uptime</h3><div class="stat" style="font-size:16px">${esc(d.uptime || '—')}</div></div>
  </div>
  <div class="card" style="margin-top:14px;border-left:3px solid ${severity}"><h3>Diagnóstico y siguiente paso</h3><p>${esc(diagnosis)}</p><button class="btn small" data-vps-help="${esc(repairPrompt('Infraestructura VPS', diagnosis, `Ejecutá el diagnóstico seguro ${nextCommand}.`))}">${esc(nextLabel)}</button></div>
  <div class="grid" style="margin-top:14px">
    <div class="card"><h3>Presión CPU de esta VPS</h3><pre class="mono" style="white-space:pre-wrap">${esc(d.pressure?.cpu || 'No disponible')}</pre></div>
    <div class="card"><h3>Presión CPU del host compartido</h3><pre class="mono" style="white-space:pre-wrap">${esc(d.pressure?.hostCpu || 'No disponible')}</pre></div>
    <div class="card"><h3>Presión de memoria</h3><pre class="mono" style="white-space:pre-wrap">${esc(d.pressure?.memory || 'No disponible')}</pre></div>
    <div class="card"><h3>Presión de disco / I/O</h3><pre class="mono" style="white-space:pre-wrap">${esc(d.pressure?.io || 'No disponible')}</pre></div>
  </div>
  <div class="card" style="margin-top:14px;padding:0;overflow:auto"><h3 style="padding:16px 16px 0">Procesos con mayor uso de CPU</h3><table><thead><tr><th>Proceso</th><th>PID</th><th>CPU</th><th>Memoria</th></tr></thead><tbody>${(d.processes || []).map((p) => `<tr><td>${esc(p.command)}</td><td class="mono">${esc(p.pid)}</td><td>${Number(p.cpuPercent).toFixed(1)}%</td><td>${Number(p.memoryPercent).toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="4">Sin datos de procesos</td></tr>'}</tbody></table></div>
  <div class="card" style="margin-top:14px"><h3>Disco</h3><pre class="mono" style="margin:0;white-space:pre-wrap">${esc(d.disk || '—')}</pre></div>
  <div class="card" style="margin-top:14px;padding:0"><h3 style="padding:16px 16px 0">Contenedores</h3>
    <table><thead><tr><th>Nombre</th><th>Estado</th><th>CPU</th><th>Memoria usada</th><th>Imagen</th></tr></thead>
    <tbody>${(d.containers || []).map((k) => { const u = (d.containerUsage || []).find((x) => x.name === k.name); return `<tr><td class="mono">${esc(k.name)}</td><td>${esc(k.status)}</td><td>${esc(u?.cpu || '—')}</td><td>${esc(u?.memory || '—')}</td><td class="muted mono">${esc(k.image)}</td></tr>`; }).join('')}</tbody></table>
  </div>`;
}

async function loadVps() {
  try {
    state.cache.vps = { data: await api.vpsMetrics() };
  } catch (e) {
    state.cache.vps = { error: e.message };
  }
}

async function loadAlerts() {
  const [alerts, audit, history] = await Promise.allSettled([api.alertsRun(), api.auditList(), api.healthHistory()]);
  state.cache.alerts = alerts.status === 'fulfilled' ? alerts.value : { error: alerts.reason?.message || String(alerts.reason), checks: [], alerts: [] };
  state.cache.audit = audit.status === 'fulfilled' ? audit.value : [];
  state.cache.healthHistory = history.status === 'fulfilled' ? history.value : null;
  state.cache.healthHistoryError = history.status === 'rejected' ? history.reason?.message || String(history.reason) : null;
  renderNav();
}

function alertasHtml() {
  const c = state.cache.alerts || {};
  if (c.error) return `<div class="card muted">Error: ${esc(c.error)}</div>`;
  const checks = c.checks || [];
  const alerts = c.alerts || [];
  const statusPill = {
    ok: '<span class="pill ok">ok</span>',
    warn: '<span class="pill warn">aviso</span>',
    fail: '<span class="pill bad">falla</span>',
    skip: '<span class="pill">omitido</span>',
  };
  const levelPill = {
    crit: '<span class="pill bad">crítica</span>',
    warn: '<span class="pill warn">aviso</span>',
    info: '<span class="pill">info</span>',
  };
  const checksHtml = `<div class="grid">${
    checks
      .map(
        (k) => `<div class="card"><div class="muted">${esc(k.name)}</div><div style="margin-top:6px">${statusPill[k.status] ?? ''}</div><div class="muted" style="margin-top:6px">${esc(k.detail)}</div></div>`,
      )
      .join('') || '<div class="card muted">Sin chequeos todavía.</div>'
  }</div>`;
  const alertsCard = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0">Alertas (${alerts.length})</h3><button id="alerts-rerun" class="btn small">Volver a chequear</button></div>
    ${
      alerts
        .map(
          (a) => `<div class="row" style="align-items:flex-start;margin-top:10px">${levelPill[a.level] ?? ''}<div style="flex:1"><strong>${esc(a.title)}</strong><div class="muted">${esc(a.area)}${a.detail ? ' · ' + esc(a.detail) : ''}</div>${a.level !== 'info' ? `<button class="btn small" style="margin-top:6px" data-alert-help="${esc(repairPrompt(a.area, a.title, a.detail || ''))}">Diagnosticar solución</button>` : ''}</div></div>`,
        )
        .join('') || '<div class="muted" style="margin-top:8px">Sin incidentes. Todo en orden.</div>'
    }
  </div>`;
  const history = state.cache.healthHistory || {};
  const snapshots = history.snapshots || [];
  const incidents = history.incidents || [];
  const openIncidents = incidents.filter((incident) => incident.status === 'OPEN');
  const historyCard = `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Historial de salud · 7 días</h3><span class="muted">Monitor VPS 24/7 + escritorio · cada 5 min · retención 30 días</span></div>${state.cache.healthHistoryError ? `<div class="muted" style="margin-top:8px">No se pudo consultar el historial: ${esc(state.cache.healthHistoryError)}. Los datos desconocidos no se muestran como cero.</div>` : `<div class="row" style="margin:12px 0"><span class="pill ${openIncidents.some((incident) => incident.level === 'crit') ? 'bad' : openIncidents.length ? 'warn' : 'ok'}">${openIncidents.length} incidentes abiertos</span><span class="muted">${snapshots.length} mediciones recibidas</span></div>${openIncidents.length ? openIncidents.map((incident) => `<div class="row" style="margin-top:7px"><span class="pill ${incident.level === 'crit' ? 'bad' : 'warn'}">${incident.level === 'crit' ? 'crítica' : 'aviso'}</span><div><strong>${esc(incident.title)}</strong><div class="muted">${esc(incident.area)} · ${esc(incident.detail)} · ${incident.occurrences} detección(es) · primera ${esc(relTime(incident.firstSeenAt))} · última ${esc(relTime(incident.lastSeenAt))}</div></div></div>`).join('') : '<div class="muted" style="margin:8px 0">El historial consultado no tiene incidentes abiertos.</div>'}<div style="max-height:280px;overflow:auto;margin-top:12px"><table><thead><tr><th>Fecha</th><th>Resultado</th><th>Problemas detectados</th></tr></thead><tbody>${snapshots.slice(0, 30).map((snapshot) => { const checks = snapshot.checks || []; const bad = checks.filter((check) => check.status === 'fail').length; const warn = checks.filter((check) => check.status === 'warn').length; const active = (snapshot.alerts || []).filter((alert) => alert.level === 'crit' || alert.level === 'warn'); return `<tr><td>${fmtDate(snapshot.capturedAt)}<div class="muted">${esc(snapshot.source || 'Panel')}</div></td><td><span class="pill ${bad ? 'bad' : warn ? 'warn' : 'ok'}">${bad ? `${bad} fallas` : warn ? `${warn} avisos` : 'correcto'}</span></td><td>${active.length ? active.map((alert) => esc(alert.title)).join(' · ') : 'Sin problemas'}</td></tr>`; }).join('') || '<tr><td colspan="3">No hay mediciones en el período consultado. Eso no confirma que los servicios estén sanos.</td></tr>'}</tbody></table></div>`}</div>`;
  const audit = state.cache.audit || [];
  const auditCard = `<div class="card" style="margin-top:14px"><h3>Bitácora de acciones</h3>
    ${audit
      .map((e) => `<div class="row"><span class="muted" style="min-width:130px">${fmtDate(e.at)}</span><span class="mono" style="min-width:150px">${esc(e.action)}</span><span class="muted">${esc(e.detail)}</span></div>`)
      .join('') || '<div class="muted">Sin acciones registradas todavía.</div>'}
  </div>`;
  return `<div class="muted" style="margin-bottom:10px">Último chequeo: ${c.at ? fmtDate(c.at) : '—'} · el monitor sigue activo minimizado en la bandeja y se inicia con Windows; requiere que la sesión esté iniciada y la computadora encendida.</div>` + checksHtml + alertsCard + historyCard + auditCard;
}

function fmtAny(v) {
  if (!v && v !== 0) return '—';
  const n = Number(v);
  const d = Number.isNaN(n) ? new Date(v) : new Date(n);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

async function loadMarketing() {
  const m = (state.cache.marketing = state.cache.marketing || {});
  try {
    m.overview = await api.marketingOverview();
    m.error = null;
  } catch (e) {
    m.error = e.message;
  }
  if (m.overview) await loadMarketingContacts();
}

async function loadMarketingContacts() {
  const m = state.cache.marketing;
  try {
    m.contacts = await api.marketingContacts({ listId: m.listId, limit: 50, offset: 0 });
    m.contactsError = null;
  } catch (e) {
    m.contactsError = e.message;
    m.contacts = null;
  }
}

function marketingHtml() {
  const m = state.cache.marketing || {};
  if (m.error && !m.overview)
    return `<div class="card muted">Error: ${esc(m.error)}</div>
      <p class="muted" style="margin-top:8px">Revisá la API key de Brevo en Configuración.</p>`;
  const o = m.overview;
  if (!o) return loading();
  const accountName = typeof o.account?.companyName === 'string'
    ? o.account.companyName
    : o.account?.companyName?.name || o.account?.companyName?.value || o.account?.email || 'Brevo';

  const stat = (label, value) => `<div class="card"><div class="muted">${esc(label)}</div><div class="stat" style="font-size:22px">${esc(String(value))}</div></div>`;
  const listId = m.listId || 0;

  const lists = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0">Listas (${(o.lists || []).length})</h3>
      <span style="display:flex;gap:8px;align-items:center">
        <input id="mk-list-name" type="text" placeholder="Nombre de la lista nueva" style="background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:7px 10px;color:var(--text)" />
        <button class="btn small" data-mk="create-list">Crear lista</button>
      </span>
    </div>
    <table style="margin-top:8px"><thead><tr><th></th><th>Lista</th><th>Contactos</th><th>Únicos</th></tr></thead><tbody>
      ${(o.lists || [])
        .map(
          (l) => `<tr data-mk-list="${l.id}" style="cursor:pointer${l.id === listId ? ';background:var(--bg-3)' : ''}">
            <td>${l.id === listId ? '<span class="pill ok">activa</span>' : ''}</td>
            <td>${esc(l.name)}</td><td>${l.total}</td><td>${l.unique}</td></tr>`,
        )
        .join('') || '<tr><td colspan="4" class="muted">Sin listas.</td></tr>'}
    </tbody></table>
    <p class="muted" style="margin:8px 0 0">Tocá una lista para ver sus contactos.</p>
  </div>`;

  const contacts = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0">Contactos ${listId ? '(lista filtrada)' : '(todos)'}</h3>
      <button class="btn small" data-mk="refresh-contacts">Actualizar</button>
    </div>
    ${
      m.contactsError
        ? `<div class="muted" style="margin-top:8px">Error: ${esc(m.contactsError)}</div>`
        : `<form id="mk-add" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
             <input id="mk-email" type="email" required placeholder="cliente@correo.com" style="background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:7px 10px;color:var(--text);min-width:230px" />
             <button class="btn small" type="submit">${listId ? 'Agregar a la lista' : 'Agregar contacto'}</button>
           </form>
           <table style="margin-top:10px"><thead><tr><th>Email</th><th>Nombre</th><th>Alta</th></tr></thead><tbody>
           ${(m.contacts?.contacts || [])
             .map((c) => `<tr><td class="mono">${esc(c.email)}</td><td>${esc(c.name || '—')}</td><td class="muted">${fmtAny(c.created)}</td></tr>`)
             .join('') || '<tr><td colspan="3" class="muted">Sin contactos.</td></tr>'}
           </tbody></table>
           <p class="muted" style="margin:8px 0 0">Mostrando ${(m.contacts?.contacts || []).length} de ${m.contacts?.count ?? 0}.</p>`
    }
  </div>`;

  const campaigns = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0">Campañas (${(o.campaigns || []).length})</h3><button class="btn small" data-mk="refresh">Actualizar</button></div>
    <table style="margin-top:8px"><thead><tr><th>Campaña</th><th>Estado</th><th>Enviados</th><th>Aperturas</th><th>Clics</th><th>Bajas</th><th></th></tr></thead><tbody>
      ${(o.campaigns || [])
        .map((c) => {
          const sent = c.status === 'sent' || c.status === 'delivered' || c.status === 'blacklisted';
          return `<tr>
            <td><strong>${esc(c.name)}</strong>${c.subject ? `<div class="muted">${esc(c.subject)}</div>` : ''}<div class="muted">${fmtAny(c.updated)}</div></td>
            <td><span class="pill ${sent ? 'ok' : c.status === 'inProcess' ? 'warn' : ''}">${esc(c.status)}</span></td>
            <td>${c.sent}</td><td>${c.opens}</td><td>${c.clicks}</td><td>${c.unsubscribed}</td>
            <td>${sent ? '' : `<button class="btn small danger" data-mk-send="${c.id}">Enviar ahora</button>`}</td>
          </tr>`;
        })
        .join('') || '<tr><td colspan="7" class="muted">Sin campañas.</td></tr>'}
    </tbody></table>
    <p class="muted" style="margin:8px 0 0">Los remitentes se verifican en la cuenta de Brevo: ${(o.senders || []).filter((s) => s.active).length} activos${(o.senders || []).filter((s) => !s.active).length ? `, ${(o.senders || []).filter((s) => !s.active).length} pendientes` : ''}.</p>
  </div>`;

  return `
    <div class="muted" style="margin-bottom:10px">${esc(accountName)} · ${esc(String(o.account.plan || ''))}</div>
    <div class="grid">
      ${stat('Listas', (o.lists || []).length)}
      ${stat('Contactos (primera lista)', o.lists?.[0]?.total ?? 0)}
      ${stat('Campañas', (o.campaigns || []).length)}
      ${stat('Remitentes activos', (o.senders || []).filter((s) => s.active).length)}
    </div>
    ${lists}${contacts}${campaigns}`;
}

function wireMarketing(view) {
  view.querySelectorAll('[data-mk-list]').forEach((tr) =>
    tr.addEventListener('click', async () => {
      state.cache.marketing.listId = Number(tr.dataset.mkList);
      await loadMarketingContacts();
      renderView();
    }),
  );
  view.querySelector('#mk-add')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = view.querySelector('#mk-email').value.trim();
    if (!email) return toast('Falta el email', 'err');
    try {
      await api.marketingAddContact({ email, listId: state.cache.marketing.listId || undefined });
      toast('Contacto agregado');
      await loadMarketingContacts();
      renderView();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  view.querySelector('[data-mk="create-list"]')?.addEventListener('click', async () => {
    const name = view.querySelector('#mk-list-name').value.trim();
    if (!name) return toast('Poné un nombre para la lista', 'err');
    try {
      await api.marketingCreateList({ name });
      toast('Lista creada');
      state.cache.marketing = {};
      renderView();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  view.querySelector('[data-mk="refresh"]')?.addEventListener('click', () => renderView());
  view.querySelector('[data-mk="refresh-contacts"]')?.addEventListener('click', async () => {
    await loadMarketingContacts();
    renderView();
  });
  view.querySelectorAll('[data-mk-send]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('¿Enviar esta campaña ahora? No se puede deshacer.')) return;
      try {
        await api.marketingSendCampaign(Number(btn.dataset.mkSend));
        toast('Campaña en cola de envío');
        state.cache.marketing = {};
        renderView();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
}

async function loadAssistant() {
  const m = (state.cache.assistant = state.cache.assistant || { messages: [] });
  if (m.messages.length) return;
  try {
    const systems = await api.opsSystems();
    m.clients = systems.clients || [];
  } catch (e) {
    m.clients = [];
    m.loadError = e.message;
  }
  try {
    const res = await api.assistantSuggest({ text: '', organizationId: m.organizationId || '' });
    m.messages.push({ role: 'bot', text: res.reply, suggestions: res.suggestions });
  } catch (e) {
    m.messages.push({ role: 'bot', text: 'No pude analizar el estado: ' + e.message });
  }
}

async function assistantSend(text) {
  const m = (state.cache.assistant = state.cache.assistant || { messages: [] });
  if (text) m.messages.push({ role: 'user', text });
  renderView();
  try {
    const res = await api.assistantSuggest({ text, organizationId: m.organizationId || '' });
    m.messages.push({ role: 'bot', text: res.reply, suggestions: res.suggestions });
  } catch (e) {
    m.messages.push({ role: 'bot', text: 'No pude analizarlo: ' + e.message });
  }
  renderView();
}

async function assistantRunAction(id, title, level) {
  if (level === 'careful' && !confirm(`Ejecutar "${title}" en el VPS?

Esta acción modifica el servidor. Asegurate de saber qué hace antes de continuar.`))
    return;
  const m = state.cache.assistant;
  m.messages.push({ role: 'bot', text: `Ejecutando: ${title}…`, pending: true });
  renderView();
  try {
    const res = await api.assistantRun(id);
    m.messages = m.messages.filter((x) => !x.pending);
    m.messages.push({ role: 'bot', text: title + ' — salida del servidor', output: res.output });
  } catch (e) {
    m.messages = m.messages.filter((x) => !x.pending);
    m.messages.push({ role: 'bot', text: 'Error: ' + e.message });
  }
  renderView();
}

function assistantHtml() {
  const m = state.cache.assistant || {};
  const msgs = m.messages || [];
  const clientOptions = (m.clients || []).map((client) => `<option value="${esc(client.id)}" ${m.organizationId === client.id ? 'selected' : ''}>${esc(client.name)}</option>`).join('');
  const cards = msgs
    .map((msg) => {
      if (msg.role === 'user')
        return `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><span class="pill" style="background:var(--bg-3);max-width:70%;text-align:right">${esc(msg.text)}</span></div>`;
      const chips = (msg.suggestions || [])
        .map(
          (s) =>
            `<button class="btn small" data-as-run="${esc(s.id)}" data-as-level="${esc(s.level)}" data-as-title="${esc(s.title)}">${esc(s.title)}${s.level === 'careful' ? ' ⚠' : ''}</button>`,
        )
        .join('');
      const out =
        msg.output !== undefined
          ? `<pre class="mono" style="margin:8px 0 0;white-space:pre-wrap;max-height:320px;overflow:auto;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:9px 11px">${esc(msg.output)}</pre>`
          : '';
      return `<div style="margin-bottom:14px">
        <div style="white-space:pre-wrap">${esc(msg.text)}</div>
        ${chips ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${chips}</div>` : ''}
        ${out}
      </div>`;
    })
    .join('');
  return `<div class="card" style="padding:14px">
      <div class="row" style="margin-bottom:10px"><label for="as-client"><strong>Cliente afectado</strong></label><select id="as-client" style="min-width:240px;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text)"><option value="">Toda la empresa</option>${clientOptions}</select><button class="btn small" type="button" id="as-refresh">Actualizar diagnóstico</button></div>
      <div id="as-stream" style="min-height:240px;max-height:480px;overflow:auto">${cards || '<div class="muted">Consultando el estado…</div>'}</div>
      <form id="as-form" style="display:flex;gap:8px;margin-top:12px">
        <input id="as-input" type="text" placeholder="Contá qué falla y qué mensaje aparece…" style="flex:1;background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:8px 11px;color:var(--text)" />
        <button class="btn primary" type="submit">Consultar</button>
      </form>
    </div>
    <p class="muted" style="margin-top:10px">El diagnóstico consulta información actual de la nube, la licencia, los errores y el cliente seleccionado. Si una fuente no responde o un dato no se reportó, lo indica como no comprobado. ⚠ = acción que modifica el VPS y pide confirmación.</p>`;
}

function wireAssistant(view) {
  view.querySelector('#as-client')?.addEventListener('change', async (event) => {
    const m = state.cache.assistant;
    m.organizationId = event.target.value;
    m.messages = [];
    await assistantSend('');
  });
  view.querySelector('#as-refresh')?.addEventListener('click', async () => {
    const m = state.cache.assistant;
    m.messages = [];
    await assistantSend('');
  });
  view.querySelector('#as-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = view.querySelector('#as-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await assistantSend(text);
  });
  view.querySelectorAll('[data-as-run]').forEach((btn) =>
    btn.addEventListener('click', () => assistantRunAction(btn.dataset.asRun, btn.dataset.asTitle, btn.dataset.asLevel)),
  );
  const stream = view.querySelector('#as-stream');
  if (stream) stream.scrollTop = stream.scrollHeight;
}

const STAGE_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', propuesta: 'Propuesta', cerrado: 'Cerrado', perdido: 'Perdido' };

async function loadCrm() {
  const c = (state.cache.crm = state.cache.crm || {});
  try {
    const res = await api.crmLeads();
    c.leads = res.leads || [];
    c.byStage = res.byStage || {};
    c.stages = res.stages || Object.keys(STAGE_LABEL);
    c.error = null;
  } catch (e) {
    c.error = e.message;
    c.leads = c.leads || [];
  }
}

function paintCrm() {
  const view = $('#view');
  view.innerHTML = crmHtml();
  wireCrm(view);
}

function crmHtml() {
  const c = state.cache.crm || {};
  if (c.error && !c.leads.length)
    return `<div class="card muted">Error: ${esc(c.error)}</div>
      <p class="muted" style="margin-top:8px">Revisá el token del proveedor en Configuración (y que la API esté desplegada con la tabla de leads).</p>`;

  const stages = c.stages || Object.keys(STAGE_LABEL);
  const byStage = c.byStage || {};
  const filtered = c.stage ? (c.leads || []).filter((l) => l.stage === c.stage) : c.leads || [];

  const chips = [`<button class="btn small ${c.stage ? '' : 'primary'}" data-crm-filter="">Todos (${(c.leads || []).length})</button>`]
    .concat(stages.map((s) => `<button class="btn small ${c.stage === s ? 'primary' : ''}" data-crm-filter="${esc(s)}">${esc(STAGE_LABEL[s] || s)} (${byStage[s] || 0})</button>`))
    .join(' ');

  const rows = filtered
    .map(
      (l) => `<tr>
        <td><strong>${esc(l.name)}</strong><div class="muted mono">${esc(l.email)}</div>${l.phone ? `<div class="muted">${esc(l.phone)}</div>` : ''}</td>
        <td>${l.gymName ? esc(l.gymName) : '<span class="muted">—</span>'}<div class="muted" style="max-width:300px">${esc(String(l.message || '').slice(0, 140))}</div>${l.notes ? `<div class="muted" style="max-width:300px">📝 ${esc(String(l.notes).slice(0, 140))}</div>` : ''}</td>
        <td class="muted" style="white-space:nowrap">${fmtAny(l.createdAt)}</td>
        <td><select data-crm-stage="${esc(l.id)}" style="background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:5px 7px;color:var(--text)">${stages
          .map((s) => `<option value="${esc(s)}" ${l.stage === s ? 'selected' : ''}>${esc(STAGE_LABEL[s] || s)}</option>`)
          .join('')}</select></td>
        <td><button class="btn small" data-crm-notes="${esc(l.id)}">Notas</button></td>
      </tr>`,
    )
    .join('');

  const total = stages.reduce((sum, s) => sum + (byStage[s] || 0), 0);
  return `<div class="muted" style="margin-bottom:10px">${total} lead(s) en el pipeline${c.error ? ' · parcial: ' + esc(c.error) : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${chips}</div>
    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead><tr><th>Contacto</th><th>Gimnasio / consulta</th><th>Alta</th><th>Etapa</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted" style="padding:14px">Sin leads en esta etapa.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Agregar lead manual</h3><button class="btn small" data-crm-reload>Actualizar</button></div>
      <form id="crm-add" class="form-2" style="margin-top:10px">
        <div class="field"><label>Nombre</label><input id="crm-name" type="text" required placeholder="Nombre y apellido" /></div>
        <div class="field"><label>Email</label><input id="crm-email" type="email" required placeholder="cliente@correo.com" /></div>
        <div class="field"><label>Teléfono</label><input id="crm-phone" type="text" placeholder="+54 9 ..." /></div>
        <div class="field"><label>Gimnasio</label><input id="crm-gym" type="text" placeholder="Nombre del gimnasio" /></div>
        <div class="field" style="grid-column:1/-1"><label>Consulta</label><input id="crm-message" type="text" placeholder="Motivo de contacto" /></div>
        <div style="grid-column:1/-1"><button class="btn primary" type="submit">Agregar</button></div>
      </form>
    </div>`;
}

function wireCrm(view) {
  view.querySelectorAll('[data-crm-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cache.crm.stage = btn.dataset.crmFilter || null;
      paintCrm();
    }),
  );
  view.querySelectorAll('[data-crm-stage]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        await api.crmUpdate({ id: sel.dataset.crmStage, stage: sel.value });
        toast('Etapa actualizada');
        await loadCrm();
        paintCrm();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
  view.querySelectorAll('[data-crm-notes]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const lead = (state.cache.crm.leads || []).find((l) => l.id === btn.dataset.crmNotes);
      const current = lead?.notes ?? '';
      const notes = prompt('Notas de seguimiento:', current);
      if (notes === null) return;
      try {
        await api.crmUpdate({ id: btn.dataset.crmNotes, notes });
        toast('Notas guardadas');
        await loadCrm();
        paintCrm();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
  view.querySelector('#crm-add')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api.crmCreate({
        name: view.querySelector('#crm-name').value.trim(),
        email: view.querySelector('#crm-email').value.trim(),
        phone: view.querySelector('#crm-phone').value.trim() || undefined,
        gymName: view.querySelector('#crm-gym').value.trim() || undefined,
        message: view.querySelector('#crm-message').value.trim() || undefined,
      });
      toast('Lead agregado');
      await loadCrm();
      paintCrm();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  view.querySelector('[data-crm-reload]')?.addEventListener('click', async () => {
    await loadCrm();
    paintCrm();
  });
}

/* --------------------------------- sitio ---------------------------------- */

async function loadSite() {
  const s = (state.cache.sitio = state.cache.sitio || {});
  if (s.content && !s.forceReload) return;
  try {
    const res = await api.siteLoad();
    s.repoRoot = res.repoRoot;
    s.file = res.file;
    s.content = res.content;
    s.error = res.content ? null : `No se pudo leer ${res.file}`;
    s.forceReload = false;
  } catch (e) {
    s.error = e.message;
  }
}

function paintSitio() {
  const view = $('#view');
  view.innerHTML = sitioHtml();
  wireSitio(view);
}

// Lee el formulario y lo devuelve como contenido nuevo (sin tocar el cache).
function readSiteForm(view) {
  const content = JSON.parse(JSON.stringify(state.cache.sitio.content));
  view.querySelectorAll('[data-site]').forEach((el) => {
    const type = el.dataset.siteType;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (type === 'number') {
      const n = Math.round(Number(value));
      value = Number.isFinite(n) ? n : 0;
    }
    if (type === 'list') value = String(value).split(',').map((x) => x.trim()).filter(Boolean);
    const parts = String(el.dataset.site).split('.');
    let target = content;
    for (let i = 0; i < parts.length - 1; i++) target = target?.[parts[i]];
    if (target && typeof target === 'object') target[parts[parts.length - 1]] = value;
  });
  return content;
}

function sitioHtml() {
  const s = state.cache.sitio || {};
  if (!s.content) {
    return s.error
      ? `<div class="card muted">Error: ${esc(s.error)}</div>
         <p class="muted" style="margin-top:8px">Se espera el archivo <span class="mono">content/site-content.json</span> en la raíz del repositorio.</p>`
      : loading();
  }
  const c = s.content;
  const input = (path, value, type) =>
    `<input data-site="${esc(path)}"${type ? ` data-site-type="${type}"` : ''} value="${esc(value)}" />`;

  const bar = `<div class="card">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <strong>fitsystem.com.ar · contenido de la landing</strong>
        <div class="muted mono" style="font-size:11px">${esc(s.file || '')}</div>
        ${s.lastResult ? `<div class="muted" style="margin-top:6px;font-size:12px">${esc(s.lastResult)}</div>` : ''}
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" data-site-act="save">Guardar borrador</button>
        <button class="btn primary" data-site-act="publish">Publicar en el sitio</button>
      </div>
    </div>
    <p class="muted" style="margin:10px 0 0;font-size:12px">
      Publicar guarda el archivo, hace commit y push a main: GitHub Actions reconstruye web y API en el VPS
      (tarda unos minutos). Los precios de los planes salen del mismo archivo, así que el cobro sigue igual al precio publicado.
    </p>
  </div>`;

  const hero = `<div class="card" style="margin-top:14px">
    <h3 style="margin-top:0">Hero (portada)</h3>
    <div class="form-2">
      <div class="field"><label>Antetítulo</label>${input('hero.kicker', c.hero.kicker)}</div>
      <div class="field"><label>Título</label>${input('hero.title', c.hero.title)}</div>
      <div class="field"><label>Título con color</label>${input('hero.titleAccent', c.hero.titleAccent)}</div>
      <div class="field"><label>Botón principal</label>${input('hero.ctaPrimary', c.hero.ctaPrimary)}</div>
      <div class="field"><label>Botón secundario</label>${input('hero.ctaSecondary', c.hero.ctaSecondary)}</div>
      <div class="field"><label>Ítems con tilde (separados por coma)</label>${input('hero.chips', c.hero.chips.join(', '), 'list')}</div>
    </div>
    <div class="field"><label>Bajada</label><textarea data-site="hero.subtitle" rows="3">${esc(c.hero.subtitle)}</textarea></div>
  </div>`;

  const stats = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0">Cifras destacadas</h3><button class="btn small" data-site-add="stat">+ Agregar</button></div>
    <div class="form-2" style="margin-top:10px">
      ${c.stats
        .map(
          (st, i) => `<div class="field"><label>Cifra ${i + 1}</label>
            <span style="display:flex;gap:6px">
              <span style="flex:0 0 110px">${input(`stats.${i}.value`, st.value)}</span>
              <span style="flex:1">${input(`stats.${i}.label`, st.label)}</span>
              <button class="btn small" data-site-del-stat="${i}" title="Quitar">✕</button>
            </span></div>`,
        )
        .join('')}
    </div>
  </div>`;

  const plans = `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0">Planes</h3><span class="muted" style="font-size:12px">Mismo archivo que usa la API para cobrar</span></div>
    ${c.plans
      .map(
        (p) => `<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
          <div class="row" style="justify-content:space-between">
            <strong>${esc(p.tag)} · ${esc(p.name)}</strong>
            <label class="row" style="gap:6px;align-items:center;font-size:12px">
              <input type="checkbox" data-site="plans.${esc(p.tag)}.popular" ${p.popular ? 'checked' : ''} /> Más elegido
            </label>
          </div>
          <div class="form-2">
            <div class="field"><label>Nombre</label>${input(`plans.${p.tag}.name`, p.name)}</div>
            <div class="field"><label>Socios con app</label>${input(`plans.${p.tag}.seats`, p.seats, 'number')}</div>
            <div class="field"><label>Precio mensual (ARS)</label>${input(`plans.${p.tag}.monthly`, p.monthly, 'number')}</div>
            <div class="field"><label>Precio anual (ARS)</label>${input(`plans.${p.tag}.annual`, p.annual, 'number')}</div>
          </div>
          <div class="field"><label>Beneficios (separados por coma)</label>${input(`plans.${p.tag}.features`, p.features.join(', '), 'list')}</div>
        </div>`,
      )
      .join('')}
  </div>`;

  const contacto = `<div class="card" style="margin-top:14px">
    <h3 style="margin-top:0">Contacto y prueba</h3>
    <div class="form-2">
      <div class="field"><label>Días de prueba</label>${input('trialDays', c.trialDays, 'number')}</div>
      <div class="field"><label>Email general</label>${input('contact.email', c.contact.email)}</div>
      <div class="field"><label>Ventas</label>${input('contact.salesEmail', c.contact.salesEmail)}</div>
      <div class="field"><label>Soporte</label>${input('contact.supportEmail', c.contact.supportEmail)}</div>
    </div>
  </div>`;

  return `${bar}${hero}${stats}${plans}${contacto}`;
}

function wireSitio(view) {
  const read = () => readSiteForm(view);

  view.querySelector('[data-site-act="save"]')?.addEventListener('click', async () => {
    try {
      const res = await api.siteSave(read());
      state.cache.sitio.content = read();
      state.cache.sitio.lastResult = `Borrador guardado en ${res.file} (todavía no está en el sitio)`;
      toast('Borrador guardado');
      paintSitio();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  view.querySelector('[data-site-act="publish"]')?.addEventListener('click', async () => {
    const ok = confirm(
      'Se va a publicar el contenido en fitsystem.com.ar (commit y push a main).\n\n' +
        'GitHub Actions va a reconstruir web y API en el VPS: tarda unos minutos.\n¿Continuar?',
    );
    if (!ok) return;
    try {
      const content = read();
      const res = await api.sitePublish(content);
      state.cache.sitio.content = content;
      state.cache.sitio.lastResult = res.committed
        ? `Publicado (${res.committed}). Deploy en curso…`
        : res.output;
      toast(res.committed ? 'Publicado. El deploy ya está en curso.' : 'Sin cambios para publicar');
      paintSitio();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  view.querySelector('[data-site-add="stat"]')?.addEventListener('click', () => {
    const content = read();
    content.stats.push({ value: '', label: '' });
    state.cache.sitio.content = content;
    paintSitio();
  });

  view.querySelectorAll('[data-site-del-stat]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const content = read();
      content.stats.splice(Number(btn.dataset.siteDelStat), 1);
      state.cache.sitio.content = content;
      paintSitio();
    }),
  );
}

/* --------------------------- inicio (principal) --------------------------- */

async function loadInicio() {
  const c = (state.cache.inicio = {});
  const [lic, subs, leads, metrics, health, vps, monitor] = await Promise.allSettled([
    api.licensadorOverview(),
    api.subscriptionsList('todas'),
    api.crmLeads(),
    api.metricsSummary(30),
    api.apiHealth(),
    api.vpsMetrics(),
    api.alertsRun(),
  ]);
  c.lic = lic.status === 'fulfilled' ? lic.value : null;
  c.licError = lic.status === 'rejected' ? lic.reason.message : null;
  c.subs = subs.status === 'fulfilled' ? subs.value : [];
  c.subsError = subs.status === 'rejected' ? subs.reason.message : null;
  c.leads = leads.status === 'fulfilled' ? leads.value.leads || leads.value : [];
  c.leadsError = leads.status === 'rejected' ? leads.reason.message : null;
  c.metrics = metrics.status === 'fulfilled' ? metrics.value : null;
  c.metricsError = metrics.status === 'rejected' ? metrics.reason.message : null;
  c.api = health.status === 'fulfilled' ? health.value : null;
  c.apiError = health.status === 'rejected' ? health.reason.message : null;
  c.vps = vps.status === 'fulfilled' ? vps.value : null;
  c.vpsError = vps.status === 'rejected' ? vps.reason.message : null;
  c.monitor = monitor.status === 'fulfilled' ? monitor.value : null;
  c.monitorError = monitor.status === 'rejected' ? monitor.reason.message : null;

  const subsList = Array.isArray(c.subs) ? c.subs : [];
  const active = subsList.filter((s) => s.status === 'ACTIVE');
  c.mrr = active.filter((s) => s.period === 'ANNUAL').reduce((sum, s) => sum + (s.amount || 0) / 12, 0)
    + active.filter((s) => s.period !== 'ANNUAL').reduce((sum, s) => sum + (s.amount || 0), 0);
  c.subsActive = active.length;
  c.subsPastDue = subsList.filter((s) => s.status === 'PAST_DUE').length;
  c.subsPending = subsList.filter((s) => s.status === 'PENDING').length;
  c.subsCancelled = subsList.filter((s) => s.status === 'CANCELLED').length;

  const okApi = c.api?.ok;
  setConn(okApi ? 'nube en línea' : 'con incidencias', okApi ? 'ok' : 'bad');
}

function money(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function inicioHtml() {
  const c = state.cache.inicio || {};
  const lic = c.lic?.stats || {};
  const metrics = c.metrics?.totals || {};
  const leads = Array.isArray(c.leads) ? c.leads : [];
  const newLeads = leads.filter((l) => l.stage === 'nuevo').length;
  const vps = c.vps || {};
  const mem = vps.memory || {};
  const memPct = mem.totalMb ? Math.round((mem.usedMb / mem.totalMb) * 100) : null;

  const big = (label, value, sub, view) =>
    `<button class="card card-link" ${view ? `data-goto="${view}"` : ''} style="text-align:left;cursor:${view ? 'pointer' : 'default'}">
      <div class="muted">${esc(label)}</div>
      <div class="stat" style="font-size:30px;margin:2px 0">${esc(String(value))}</div>
      <div class="muted" style="font-size:12px">${esc(sub || '')}</div>
    </button>`;

  const alertCards = [];
  if (c.subsPastDue > 0) alertCards.push(`<div class="card" style="border-color:#a33">⚠ ${c.subsPastDue} suscripción(es) vencida(s) — revisá en <a href="#" data-goto="suscripciones">Suscripciones</a></div>`);
  if ((lic.vencidas ?? 0) > 0) alertCards.push(`<div class="card" style="border-color:#a33">⚠ ${lic.vencidas} licencia(s) vencida(s) — revisá en <a href="#" data-goto="licencias">Licencias</a></div>`);
  if (memPct != null && memPct >= 85) alertCards.push(`<div class="card">⚠ RAM del VPS al ${memPct}%</div>`);
  const monitorAlerts = c.monitor?.alerts || [];
  const levelLabel = { crit: 'Crítica', warn: 'Aviso', info: 'Info' };
  const levelColor = { crit: '#a33', warn: '#a77a22', info: 'var(--border)' };
  if (c.monitorError) {
    alertCards.push(`<div class="card" style="border-color:#a33"><strong>No se pudieron consultar las alertas operativas</strong><div class="muted">${esc(c.monitorError)}</div><a href="#" data-goto="alertas">Abrir Alertas</a></div>`);
  } else if (monitorAlerts.length) {
    for (const item of monitorAlerts) {
      alertCards.push(`<button type="button" class="card card-link" data-goto="alertas" style="text-align:left;border-color:${levelColor[item.level] || 'var(--border)'}"><div class="muted">${esc(levelLabel[item.level] || 'Alerta')} · ${esc(item.area)}</div><strong>${esc(item.title)}</strong>${item.detail ? `<div class="muted">${esc(item.detail)}</div>` : ''}</button>`);
    }
  } else if (c.monitor) {
    alertCards.push('<div class="card" style="border-color:#287b50">✓ Sin alertas operativas activas</div>');
  }

  return `<div class="muted" style="margin-bottom:12px">Resumen del negocio y la operación · ${esc(new Date().toLocaleString('es-AR'))}</div>
    ${alertCards.length ? `<section style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><h3>Alertas y pendientes</h3><a href="#" data-goto="alertas">Ver monitoreo completo</a></div><div class="grid">${alertCards.join('')}</div></section>` : ''}
    <div class="grid">
      ${big('MRR estimado', money(c.mrr), `${c.subsActive ?? 0} suscripción(es) activa(s)`, 'suscripciones')}
      ${big('Suscripciones vencidas', c.subsPastDue ?? 0, 'requieren cobro', 'suscripciones')}
      ${big('Licencias emitidas', lic.total ?? 0, `${lic.activadas ?? 0} activadas · ${lic.asientos ?? 0} asientos`, 'licencias')}
      ${big('Consultas nuevas (CRM)', newLeads, `${leads.length} en total`, 'crm')}
    </div>
    <div class="grid" style="margin-top:14px">
      ${big('Navegadores únicos (30d)', metrics.uniqueVisitors ?? '—', `${metrics.views ?? 0} vistas de página · ${metrics.uniqueVisitorsToday ?? 0} navegadores hoy`, 'metricas')}
      ${big('Solicitudes de descarga (30d)', metrics.downloads ?? '—', `${metrics.uniqueDownloaders ?? 0} navegadores · ${metrics.downloadsToday ?? 0} solicitudes hoy`, 'metricas')}
      ${big('Estado de la nube', c.apiError ? 'error' : c.api?.ok ? 'En línea' : 'HTTP ' + (c.api?.status ?? '?'), c.api?.latencyMs != null ? c.api.latencyMs + ' ms' : '', 'dashboard')}
      ${big('VPS', memPct != null ? memPct + '% RAM' : '—', `${(vps.containers || []).length} contenedores`, 'vps')}
    </div>
    <div class="card" style="margin-top:14px">
      <h3 style="margin-top:0">Suscripciones por estado</h3>
      <div class="row"><span class="muted">Activas</span><span class="pill ok">${c.subsActive ?? 0}</span></div>
      <div class="row"><span class="muted">Pendientes de autorizar</span><span class="pill warn">${c.subsPending ?? 0}</span></div>
      <div class="row"><span class="muted">Vencidas (en gracia)</span><span class="pill bad">${c.subsPastDue ?? 0}</span></div>
      <div class="row"><span class="muted">Dadas de baja</span><span class="pill">${c.subsCancelled ?? 0}</span></div>
    </div>`;
}

function wireInicio(view) {
  view.querySelectorAll('[data-goto]').forEach((el) =>
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      state.view = el.dataset.goto;
      renderNav();
      renderView();
    }),
  );
}

/* ------------------------------ suscripciones ----------------------------- */

const SUB_STATUS = {
  ACTIVE: { label: 'activa', cls: 'ok' },
  PENDING: { label: 'pendiente', cls: 'warn' },
  PAST_DUE: { label: 'vencida', cls: 'bad' },
  CANCELLED: { label: 'dada de baja', cls: '' },
};

async function loadSubscriptions() {
  const s = (state.cache.subs = state.cache.subs || { filter: 'todas' });
  try {
    s.items = await api.subscriptionsList(s.filter || 'todas');
    s.error = null;
  } catch (e) {
    s.error = e.message;
    s.items = [];
  }
}

function subscriptionsHtml() {
  const s = state.cache.subs || {};
  if (s.error)
    return `<div class="card muted">Error: ${esc(s.error)}</div>
      <p class="muted" style="margin-top:8px">Revisá el token del proveedor en Configuración y que la API esté desplegada con el módulo de suscripciones.</p>`;
  const items = s.items || [];
  const filters = ['todas', 'ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELLED'];
  const fLabel = (f) => (f === 'todas' ? 'Todas' : SUB_STATUS[f]?.label || f);
  const tabs = filters
    .map((f) => `<button class="btn small ${s.filter === f ? 'primary' : ''}" data-sub-filter="${f}">${fLabel(f)}</button>`)
    .join('');

  const rows = items
    .map((sub) => {
      const st = SUB_STATUS[sub.status] || { label: sub.status, cls: '' };
      const period = sub.period === 'ANNUAL' ? 'anual' : 'mensual';
      const canCancel = sub.status === 'ACTIVE' || sub.status === 'PAST_DUE' || sub.status === 'PENDING';
      const canReactivate = sub.status === 'CANCELLED' || sub.status === 'PAST_DUE';
      const other = sub.period === 'ANNUAL' ? 'MONTHLY' : 'ANNUAL';
      return `<tr>
        <td><strong>${esc(sub.gymName || sub.buyerName || '—')}</strong>
          <div class="muted mono">${esc(sub.externalRef)}</div>
          <div class="muted">${esc(sub.buyerEmail || '')}${sub.buyerPhone ? ' · ' + esc(sub.buyerPhone) : ''}</div></td>
        <td>${esc(sub.planName || sub.plan)}<div class="muted">${period} · ${sub.seats ?? '?'} asientos${sub.seatPacks ? ` (+${sub.seatPacks} pack)` : ''}</div></td>
        <td>${money(sub.amount)}<div class="muted">${esc(sub.currency || 'ARS')}</div></td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td class="muted">${sub.nextPaymentAt ? fmtDate(sub.nextPaymentAt) : '—'}<div class="muted">${sub.lastPaymentAt ? 'último: ' + fmtDate(sub.lastPaymentAt) : ''}</div></td>
        <td>
          ${canReactivate ? `<button class="btn small" data-sub-reactivate="${esc(sub.externalRef)}">Reactivar</button>` : ''}
          ${canCancel ? `<button class="btn small danger" data-sub-cancel="${esc(sub.externalRef)}">Dar de baja</button>` : ''}
          <button class="btn small" data-sub-period="${esc(sub.externalRef)}" data-sub-target="${other}">
            Pasar a ${other === 'ANNUAL' ? 'anual' : 'mensual'}
          </button>
        </td>
      </tr>`;
    })
    .join('');

  return `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div class="row" style="gap:6px">${tabs}</div>
      <button class="btn small" data-sub-reload>Actualizar</button>
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead><tr><th>Cliente</th><th>Plan</th><th>Importe</th><th>Estado</th><th>Vencimientos</th><th>Acciones</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted" style="padding:14px">No hay suscripciones.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px">Cambiar de período da de baja el débito actual y genera uno nuevo: el cambio se aplica cuando el cliente autoriza el nuevo enlace de MercadoPago.</p>`;
}

function reloadSubs() {
  const v = $('#view');
  v.innerHTML = loading();
  return loadSubscriptions().then(() => {
    v.innerHTML = subscriptionsHtml();
    wireSubscriptions(v);
  });
}

function wireSubscriptions(view) {
  view.querySelectorAll('[data-sub-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cache.subs.filter = btn.dataset.subFilter;
      reloadSubs();
    }),
  );
  view.querySelector('[data-sub-reload]')?.addEventListener('click', () => reloadSubs());
  view.querySelectorAll('[data-sub-cancel]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('¿Dar de baja la suscripción? El débito se cancela y la licencia sigue hasta el fin del período pagado.')) return;
      try {
        await api.subscriptionsCancel(btn.dataset.subCancel);
        toast('Suscripción dada de baja');
        reloadSubs();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
  view.querySelectorAll('[data-sub-reactivate]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const res = await api.subscriptionsReactivate(btn.dataset.subReactivate);
        toast('Reactivación generada');
        if (res?.initPoint) window.open(res.initPoint, '_blank');
        reloadSubs();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
  view.querySelectorAll('[data-sub-period]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const target = btn.dataset.subTarget;
      if (!confirm(`¿Cambiar el débito a ${target === 'ANNUAL' ? 'anual' : 'mensual'}? Se dará de baja el actual y se generará un nuevo enlace para autorizar.`)) return;
      try {
        const res = await api.subscriptionsPeriod({ externalRef: btn.dataset.subPeriod, period: target });
        toast('Cambio de período generado');
        if (res?.initPoint) window.open(res.initPoint, '_blank');
        reloadSubs();
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
}

/* -------------------------------- métricas -------------------------------- */

async function loadMetrics() {
  const m = (state.cache.metricas = state.cache.metricas || { days: 30 });
  try {
    m.data = await api.metricsSummary(m.days || 30);
    m.error = null;
  } catch (e) {
    m.error = e.message;
  }
}

function sparkline(series) {
  const points = (series || []).map((p) => p.count);
  if (!points.length) return '';
  const max = Math.max(1, ...points);
  const w = 100;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((v, i) => `${(i * step).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:44px;display:block">
    <polyline points="${coords}" fill="none" stroke="var(--brand)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>`;
}

function metricsHtml() {
  const m = state.cache.metricas || {};
  if (m.error && !m.data)
    return `<div class="card muted">Error: ${esc(m.error)}</div>
      <p class="muted" style="margin-top:8px">Revisá el token del proveedor en Configuración y que la API esté desplegada con el módulo de métricas.</p>`;
  const d = m.data;
  if (!d) return loading();

  const t = d.totals || {};
  const conv = t.uniqueVisitors ? ((t.uniqueDownloaders / t.uniqueVisitors) * 100).toFixed(1) + '%' : '—';
  const stat = (label, value, sub) => `<div class="card"><div class="muted">${esc(label)}</div><div class="stat" style="font-size:26px">${esc(String(value))}</div>${sub ? `<div class="muted" style="font-size:12px">${esc(sub)}</div>` : ''}</div>`;

  const assets = d.byAsset || {};

  return `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div class="muted">Datos del período · identificador anónimo por navegador; no identifica a una persona por su nombre</div>
      <div class="row" style="gap:6px">
        ${[7, 30, 90].map((n) => `<button class="btn small ${m.days === n ? 'primary' : ''}" data-metrics-days="${n}">${n}d</button>`).join('')}
        <button class="btn small" data-metrics-reload>Actualizar</button>
      </div>
    </div>
    <div class="grid">
      ${stat('Navegadores únicos', t.uniqueVisitors ?? 0, `${t.uniqueVisitorsToday ?? 0} hoy · identificador anónimo`)}
      ${stat('Vistas de la landing', t.views ?? 0, `${t.viewsToday ?? 0} hoy · incluye visitas repetidas`)}
      ${stat('Navegadores que iniciaron descarga', t.uniqueDownloaders ?? 0, `${t.uniqueDownloadersToday ?? 0} hoy · solicitud, no transferencia confirmada`)}
      ${stat('Conversión navegador → descarga', conv, 'navegadores únicos que solicitaron un instalador')}
    </div>
    ${t.legacyViews ? `<p class="muted" style="font-size:12px">${t.legacyViews} vistas anteriores a la medición por navegador no se pueden convertir en visitantes únicos.</p>` : ''}
    <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Descargas confirmadas por GitHub · última versión ${esc(d.githubDownloads?.version || '')}</h3>
      ${d.githubDownloads ? `<div class="row"><span class="muted">Instalador (Setup)</span><strong>${d.githubDownloads.setup ?? 0}</strong></div><div class="row"><span class="muted">Portable</span><strong>${d.githubDownloads.portable ?? 0}</strong></div><p class="muted" style="font-size:12px;margin-bottom:0">GitHub informa transferencias recibidas para los archivos de la última versión publicada. Las solicitudes desde esta web se contabilizan por separado.</p>` : '<span class="muted">GitHub no informó el total en este momento.</span>'}
    </div>
    <div class="grid" style="margin-top:14px">
      <div class="card"><h3 style="margin-top:0">Visitantes únicos por día</h3>${sparkline(d.series?.visitors)}</div>
      <div class="card"><h3 style="margin-top:0">Solicitudes de descarga desde la web</h3>${sparkline(d.series?.downloads)}</div>
    </div>
    <div class="grid" style="margin-top:14px">
      <div class="card"><h3 style="margin-top:0">Descargas por instalador</h3>
        <div class="row"><span class="muted">Instalador (Setup)</span><span>${assets.setup ?? 0}</span></div>
        <div class="row"><span class="muted">Portable</span><span>${assets.portable ?? 0}</span></div>
        <p class="muted" style="margin:8px 0 0;font-size:12px">Cada botón de descarga del sitio pasa por la API y suma acá.</p>
      </div>
      <div class="card"><h3 style="margin-top:0">Origen de las visitas</h3>
        <div class="row"><span class="muted">Directo</span><span>${(d.sources || []).find((s) => s.source === 'directo')?.count ?? 0}</span></div>
        <div class="row"><span class="muted">Desde enlaces externos</span><span>${(d.sources || []).find((s) => s.source === 'referido')?.count ?? 0}</span></div>
        <div class="row"><span class="muted">Navegación interna</span><span>${(d.sources || []).find((s) => s.source === 'interno')?.count ?? 0}</span></div>
      </div>
    </div>`;
}

function wireMetrics(view) {
  view.querySelectorAll('[data-metrics-days]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      state.cache.metricas.days = Number(btn.dataset.metricsDays);
      const v = $('#view');
      v.innerHTML = loading();
      await loadMetrics();
      v.innerHTML = metricsHtml();
      wireMetrics(v);
    }),
  );
  view.querySelector('[data-metrics-reload]')?.addEventListener('click', async () => {
    const v = $('#view');
    v.innerHTML = loading();
    await loadMetrics();
    v.innerHTML = metricsHtml();
    wireMetrics(v);
  });
}

function defaultImap() {
  const mk = (email) => ({
    email,
    password: '',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
  });
  return [mk('contacto@fitsystem.com.ar'), mk('ventas@fitsystem.com.ar'), mk('soporte@fitsystem.com.ar')];
}

function defaultZohoAccounts() {
  return ['contacto@fitsystem.com.ar', 'ventas@fitsystem.com.ar', 'soporte@fitsystem.com.ar'].map((email) => ({
    email,
    clientId: '',
    clientSecret: '',
    authorized: false,
  }));
}

function configHtml() {
  const c = state.config || {};
  const mail = c.mail || { mode: 'imap', imap: [], zoho: {} };
  const imapRows = (mail.imap && mail.imap.length ? mail.imap : defaultImap());
  const zohoAccounts = (mail.zoho?.accounts && mail.zoho.accounts.length ? mail.zoho.accounts : defaultZohoAccounts());
  const f = (label, pathName, type = 'text', ph = '') => {
    const val = pathName.split('.').reduce((o, k) => (o ? o[k] : ''), c) ?? '';
    return `<div class="field"><label>${esc(label)}</label><input data-path="${pathName}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" /></div>`;
  };
  const imapField = (i, label, key, value, type = 'text', ph = '') =>
    `<div class="field"><label>${esc(label)}</label><input id="imap-${i}-${key}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(ph)}" /></div>`;
  const imapSection = imapRows
    .map(
      (a, i) => `<div class="card" style="margin-top:10px;background:var(--bg-2)">
        <div class="form-2">
          ${imapField(i, 'Casilla', 'email', a.email, 'text', 'correo@fitsystem.com.ar')}
          ${imapField(i, 'App password', 'password', '', 'password')}
          ${imapField(i, 'IMAP host:puerto', 'imapHost', a.imapHost)}
          ${imapField(i, 'SMTP host:puerto', 'smtpHost', a.smtpHost)}
        </div>
      </div>`,
    )
    .join('');

  return `<div class="card" style="max-width:860px">
    <h3>Credenciales del proveedor</h3>
    <p class="muted">Los secretos se guardan cifrados en tu equipo. No se envían a ningún servidor salvo al servicio correspondiente.</p>
    <h3 style="margin-top:18px">VPS (infraestructura)</h3>
    <div class="form-2">
      ${f('Host / IP', 'vps.host')}
      ${f('Puerto SSH', 'vps.port', 'number')}
      ${f('Usuario', 'vps.user')}
      ${f('Ruta de la clave privada SSH', 'vps.privateKeyPath', 'text', 'C:\\...\\id_ed25519')}
      ${f('Passphrase de la clave (si tiene)', 'vps.passphrase', 'password')}
    </div>
    <h3 style="margin-top:18px">Licensador</h3>
    <div class="form-2">
      ${f('URL', 'licensador.url')}
      ${f('Usuario', 'licensador.user')}
      ${f('Contraseña', 'licensador.pass', 'password')}
    </div>
    <h3 style="margin-top:18px">Nube / Brevo / Sitio</h3>
    <div class="form-2">
      ${f('API de la nube', 'api.url')}
      ${f('Sitio (landing)', 'site.url')}
      ${f('Token del proveedor (x-provider-token)', 'api.providerToken', 'password')}
    </div>
    <p class="muted">Brevo usa primero la API del servidor y su IP fija (190.183.229.160). Si Brevo todavía no reconoce esa IP, el panel usa temporalmente la clave que ya tenías guardada en esta computadora. Cuando autorices la IP del servidor una vez, las llamadas quedan estables y no requieren cambiar ni crear claves.</p>

    <h3 style="margin-top:22px">Correo</h3>
    <p class="muted">API primero, IMAP como respaldo. Cada casilla se autoriza por separado (grant code de ~5 min, un solo uso).</p>
    <div class="field"><label>Modo</label>
      <select id="mail-mode">
        <option value="zoho" ${mail.mode === 'zoho' ? 'selected' : ''}>Zoho Mail API (OAuth)</option>
        <option value="imap" ${mail.mode !== 'zoho' ? 'selected' : ''}>IMAP/SMTP (app passwords)</option>
      </select>
    </div>
    <div class="field" style="max-width:260px"><label>Zoho: región</label><input id="zoho-region" type="text" value="${esc(mail.zoho?.region || 'com')}" placeholder="com" /></div>
    <p class="muted" style="margin:8px 0 0">Casillas Zoho:</p>
    ${zohoAccounts.map(
      (a, i) => `<div class="card" style="margin-top:10px;background:var(--bg-2)">
        <div class="form-2">
          <div class="field"><label>Casilla</label><input id="zoho-${i}-email" type="text" value="${esc(a.email || '')}" placeholder="correo@fitsystem.com.ar" /></div>
          <div class="field"><label>Client ID</label><input id="zoho-${i}-clientId" type="text" value="${esc(a.clientId || '')}" placeholder="1000.xxx" /></div>
          <div class="field"><label>Client Secret</label><input id="zoho-${i}-clientSecret" type="password" value="" /></div>
          <div class="field"><label>Grant code (vive ~5 min)</label><input id="zoho-${i}-code" type="text" placeholder="1000.xxxxx…" /></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px;align-items:center">
          <button class="btn small" data-zoho-auth="${i}">Autorizar casilla</button>
          <span class="muted" data-zoho-status="${i}">${a.authorized ? 'autorizado' : 'sin autorizar'}</span>
        </div>
      </div>`,
    ).join('')}
    <p class="muted" style="margin:14px 0 0">Casillas IMAP/SMTP (respaldo):</p>
    ${imapSection}

    <div style="display:flex;gap:10px;margin-top:18px">
      <button id="save-config" class="btn primary">Guardar</button>
      <button id="test-config" class="btn">Probar conexiones</button>
    </div>
  </div>`;
}

function readConfigForm() {
  const patch = { vps: {}, licensador: {}, api: {}, brevo: {}, site: {}, mail: {} };
  document.querySelectorAll('[data-path]').forEach((input) => {
    const [group, key] = input.dataset.path.split('.');
    const value = input.value.trim();
    if (group === 'vps' && key === 'port') {
      patch.vps.port = Number(value) || 22;
      return;
    }
    if (value !== '') patch[group][key] = value;
  });
  patch.mail.mode = $('#mail-mode').value;
  patch.mail.zoho = {
    region: ($('#zoho-region')?.value || 'com').trim(),
    accounts: zohoAccountsFromForm(),
  };
  patch.mail.imap = imapAccountsFromForm();
  return patch;
}

function zohoAccountsFromForm() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const emailEl = $(`#zoho-${i}-email`);
    if (!emailEl) break;
    const email = emailEl.value.trim();
    const clientId = $(`#zoho-${i}-clientId`).value.trim();
    if (!email && !clientId) continue;
    out.push({ email, clientId, clientSecret: $(`#zoho-${i}-clientSecret`).value });
  }
  return out;
}

function imapAccountsFromForm() {
  const imap = [];
  for (let i = 0; i < 6; i++) {
    const email = $(`#imap-${i}-email`);
    if (!email) break;
    const hostPort = (v, defHost, defPort) => {
      const [h, p] = String(v || '').split(':');
      return { host: h || defHost, port: Number(p) || defPort };
    };
    const im = hostPort($(`#imap-${i}-imapHost`).value, 'imap.zoho.com', 993);
    const sm = hostPort($(`#imap-${i}-smtpHost`).value, 'smtp.zoho.com', 465);
    imap.push({
      email: email.value.trim(),
      password: $(`#imap-${i}-password`).value,
      imapHost: im.host,
      imapPort: im.port,
      smtpHost: sm.host,
      smtpPort: sm.port,
    });
  }
  return imap;
}

/* -------------------------------- render ---------------------------------- */

async function renderView() {
  const view = $('#view');
  if (state.view === 'config') {
    view.innerHTML = configHtml();
    $('#save-config').addEventListener('click', async () => {
      try {
        state.config = await api.saveConfig(readConfigForm());
        toast('Configuración guardada');
        renderVaultBadge();
        renderView();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
    view.querySelectorAll('[data-zoho-auth]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const i = btn.dataset.zohoAuth;
        const email = $(`#zoho-${i}-email`).value.trim();
        const clientId = $(`#zoho-${i}-clientId`).value.trim();
        const clientSecret = $(`#zoho-${i}-clientSecret`).value;
        const code = $(`#zoho-${i}-code`).value.trim();
        if (!clientId || !clientSecret) return toast('Faltan Client ID / Client Secret', 'err');
        if (!code) return toast('Pegá el grant code primero', 'err');
        try {
          await api.saveConfig(readConfigForm());
          const res = await api.mailZohoExchange({
            email,
            clientId,
            clientSecret,
            code,
            region: ($('#zoho-region')?.value || 'com').trim(),
          });
          state.config = await api.getConfig();
          const status = view.querySelector(`[data-zoho-status="${i}"]`);
          if (status) status.textContent = res.email ? `autorizado (${res.email})` : 'autorizado';
          toast(res.email ? `Zoho autorizado: ${res.email}` : 'Zoho autorizado');
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    });
    $('#test-config').addEventListener('click', () => {
      state.view = 'dashboard';
      state.cache.dashboard = null;
      renderNav();
      renderView();
    });
    return;
  }
  const LOADERS = {
    dashboard: { load: loadDashboard, html: dashboardHtml, wire: (v) => {
      v.querySelector('[data-diagnostic-refresh]')?.addEventListener('click', () => renderView());
      v.querySelectorAll('[data-alert-help]').forEach((b) => b.addEventListener('click', () => openAssistantFor(b.dataset.alertHelp)));
      v.querySelectorAll('[data-diagnostic-go]').forEach((b) => b.addEventListener('click', () => {
        state.view = b.dataset.diagnosticGo;
        renderNav();
        renderView();
      }));
    } },
    inicio: { load: loadInicio, html: inicioHtml, wire: wireInicio },
    clientes: { load: loadClients, html: clientesHtml, wire: wireClientes },
    suscripciones: { load: loadSubscriptions, html: subscriptionsHtml, wire: wireSubscriptions },
    licencias: { load: loadLicenses, html: licensesHtml },
    ips: { load: loadIps, html: ipsHtml },
    sistemas: { load: loadOps, html: opsHtml, wire: (v) => {
      v.querySelector('[data-ops-reload]')?.addEventListener('click', async () => { state.cache.ops = null; await renderView(); });
      v.querySelector('[data-ops-enrich]')?.addEventListener('click', async () => { try { const r = await api.opsEnrichDownloads(); toast(`Ubicación completada: ${r.updated ?? 0} IPs`); renderView(); } catch (e) { toast(e.message, 'err'); } });
      v.querySelectorAll('[data-service-help], [data-error-help], [data-sync-help]').forEach((button) => button.addEventListener('click', () => openAssistantFor(button.dataset.serviceHelp || button.dataset.errorHelp || button.dataset.syncHelp)));
      v.querySelectorAll('[data-desktop-sync]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Enviando solicitud…';
        try {
          await api.opsDesktopSyncRetry(button.dataset.desktopSync);
          toast('Reintento solicitado. La instalación lo ejecutará cuando vuelva a enviar señal, durante las próximas 24 horas.');
          state.cache.ops = null;
          await renderView();
        } catch (error) {
          toast(error.message || String(error), 'err');
          button.disabled = false;
          button.textContent = 'Reintentar sincronización';
        }
      }));
    } },
    facturacion: { load: loadInvoices, html: invoicesHtml, wire: (v) => {
      v.querySelector('[data-invoice-save]')?.addEventListener('click', async () => {
        try {
          const file = v.querySelector('#invoice-cert-file')?.files?.[0];
          if (file && file.size > 10 * 1024 * 1024) throw new Error('El certificado supera el máximo de 10 MB');
          const input = {
            enabled: v.querySelector('#invoice-enabled').checked,
            autoIssue: v.querySelector('#invoice-auto').checked,
            autoEmail: v.querySelector('#invoice-email-auto').checked,
            cuit: v.querySelector('#invoice-cuit').value,
            ptoVta: Number(v.querySelector('#invoice-pto').value),
            invoiceType: v.querySelector('#invoice-type').value,
            environment: v.querySelector('#invoice-environment').value,
            concept: Number(v.querySelector('#invoice-concept').value),
            buyerDocType: Number(v.querySelector('#invoice-buyer-doc').value),
            ivaPercent: Number(v.querySelector('#invoice-iva').value),
            emailFrom: v.querySelector('#invoice-from').value,
          };
          if (file) {
            const password = v.querySelector('#invoice-cert-pass').value;
            if (!password) throw new Error('Ingresá la contraseña del certificado ARCA');
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            input.certP12 = btoa(binary);
            input.certPassword = password;
          }
          await api.invoiceSaveConfig(input);
          toast('Configuración de facturación guardada');
          renderView();
        } catch (e) { toast(e.message, 'err'); }
      });
      v.querySelector('[data-invoice-test]')?.addEventListener('click', async () => {
        try {
          const result = await api.invoiceTest();
          const test = result.test || {};
          toast(test.ok ? `ARCA responde · ${test.mode || ''}` : `ARCA: ${test.detail || 'no disponible'}`, test.ok ? '' : 'err');
        } catch (e) { toast(e.message, 'err'); }
      });
    } },
    whatsapp: { load: async () => {}, html: whatsappHtml, wire: (v) => { const w = v.querySelector('#panel-whatsapp'); v.querySelector('[data-wa-reload]')?.addEventListener('click', () => w?.reload()); w?.addEventListener('did-fail-load', (event) => { if (event.errorCode !== -3) toast(`No se pudo abrir WhatsApp Web: ${event.errorDescription}`, 'err'); }); } },
    vps: { load: loadVps, html: vpsHtml, wire: (v) => { const button = v.querySelector('[data-vps-help]'); button?.addEventListener('click', () => openAssistantFor(button.dataset.vpsHelp)); } },
    alertas: { load: loadAlerts, html: alertasHtml, wire: (v) => {
      v.querySelector('#alerts-rerun')?.addEventListener('click', () => renderView());
      v.querySelectorAll('[data-alert-help]').forEach((b) => b.addEventListener('click', () => openAssistantFor(b.dataset.alertHelp)));
    } },
    marketing: { load: loadMarketing, html: marketingHtml, wire: wireMarketing },
    correo: { load: loadMail, html: correoHtml },
    asistente: { load: loadAssistant, html: assistantHtml, wire: wireAssistant },
    crm: { load: loadCrm, html: crmHtml, wire: wireCrm },
    sitio: { load: loadSite, html: sitioHtml, wire: wireSitio },
    metricas: { load: loadMetrics, html: metricsHtml, wire: wireMetrics },
  };
  const mod = LOADERS[state.view];
  if (mod) {
    view.innerHTML = loading();
    try {
      await mod.load();
      view.innerHTML = mod.html();
      mod.wire?.(view);
    } catch (e) {
      view.innerHTML = errorView(e);
    }
    return;
  }
  view.innerHTML = placeholder('Módulo', 'Próximamente.');
}

function errorView(err) {
  const msg = (err && err.message) || String(err);
  return `<div class="placeholder"><div class="big">⚠</div><h2>No se pudo cargar el módulo</h2>
    <p class="muted" style="max-width:560px">${esc(msg)}</p>
    <button class="btn" onclick="window.__panelRetry && window.__panelRetry()">Reintentar</button></div>`;
}

/* --------------------------------- correo --------------------------------- */

async function loadMail() {
  if (!state.cache.mail) state.cache.mail = {};
  try {
    state.cache.mail.items = await api.mailInbox();
    state.cache.mail.error = null;
  } catch (e) {
    state.cache.mail.error = e.message;
    state.cache.mail.items = [];
  }
}

function mailAccounts() {
  const mail = state.config?.mail || {};
  if (mail.mode === 'zoho') {
    const zoho = (mail.zoho?.accounts || []).map((a) => a.email).filter(Boolean);
    if (zoho.length) return zoho;
  }
  const list = (mail.imap || []).map((a) => a.email).filter(Boolean);
  return list.length ? list : ['contacto@fitsystem.com.ar', 'ventas@fitsystem.com.ar', 'soporte@fitsystem.com.ar'];
}

function correoHtml() {
  const c = state.cache.mail || {};
  const mode = state.config?.mail?.mode === 'zoho' ? 'Zoho Mail API' : 'IMAP/SMTP';
  const compose = c.compose
    ? `<div class="card" style="margin-bottom:14px">
        <h3>Redactar (${esc(mode)})</h3>
        <div class="form-2">
          <div class="field"><label>Desde</label><select id="mf-from">${mailAccounts().map((e) => `<option>${esc(e)}</option>`).join('')}</select></div>
          <div class="field"><label>Para</label><input id="mf-to" type="text" placeholder="cliente@correo.com" /></div>
        </div>
        <div class="field"><label>Asunto</label><input id="mf-subject" type="text" /></div>
        <div class="field"><label>Mensaje</label><textarea id="mf-text" rows="6" style="background:var(--bg-2);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font-family:inherit;resize:vertical"></textarea></div>
        <div style="display:flex;gap:10px"><button id="mf-send" class="btn primary">Enviar</button><button data-maction="close-compose" class="btn">Cerrar</button></div>
      </div>`
    : '';
  const detail = c.detail
    ? `<div class="card" style="margin-bottom:14px">
        <div class="row"><strong>${esc(c.detail.subject || '(sin asunto)')}</strong><button data-maction="close-detail" class="btn small">Cerrar</button></div>
        <div class="muted" style="margin:6px 0">De: ${esc(c.detail.from)} · Para: ${esc(c.detail.to)}</div>
        <div class="muted" style="margin-bottom:10px">${esc(c.detail.date ? new Date(c.detail.date).toLocaleString('es-AR') : '')}</div>
        <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(c.detail.text || '')}</pre>
      </div>`
    : '';
  const err = c.error ? `<div class="card muted">Error: ${esc(c.error)}</div>` : '';
  const rows = c.items || [];
  const table = rows
    .map(
      (m, i) => `<tr data-mref="${i}" style="cursor:pointer">
        <td style="width:1%">${m.seen ? '' : '<span class="pill ok">nuevo</span>'}</td>
        <td class="muted" style="white-space:nowrap">${esc(m.account)}</td>
        <td><strong>${esc(m.subject)}</strong><div class="muted">${esc((m.from || '').slice(0, 60))}</div></td>
        <td class="muted" style="white-space:nowrap">${m.date ? new Date(m.date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</td><td><button class="btn small danger" data-mail-delete="${i}">Eliminar</button></td>
      </tr>`,
    )
    .join('');
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span class="muted">Bandeja unificada · ${esc(mode)}</span>
      <button data-maction="compose" class="btn primary">Redactar</button>
    </div>
    ${compose}${detail}${err}
    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead><tr><th></th><th>Casilla</th><th>Asunto</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${table || '<tr><td colspan="5" class="muted" style="padding:14px">Sin mensajes.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function openMail(index) {
  const items = state.cache.mail.items || [];
  const ref = items[index];
  if (!ref) return;
  state.cache.mail.detail = { subject: ref.subject, from: ref.from, to: '', date: ref.date, text: 'Cargando…' };
  renderView();
  try {
    state.cache.mail.detail = await api.mailRead({ account: ref.account, accountId: ref.accountId, uid: ref.uid, folder: ref.folder, messageId: ref.messageId });
  } catch (e) {
    state.cache.mail.detail = { subject: ref.subject, from: ref.from, text: 'Error: ' + e.message };
  }
  if (state.view === 'correo') renderView();
}

async function sendCompose() {
  const from = $('#mf-from').value;
  const to = $('#mf-to').value.trim();
  const subject = $('#mf-subject').value.trim();
  const text = $('#mf-text').value;
  if (!to) return toast('Falta el destinatario', 'err');
  try {
    await api.mailSend({ from, to, subject, text });
    toast('Correo enviado');
    state.cache.mail.compose = false;
    renderView();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ------------------------------- acciones --------------------------------- */

async function analyzeIp(ip) {
  state.cache.ips = { ...(state.cache.ips || {}), analysis: { ip } };
  renderView();
  try {
    const data = await api.ipAnalyze(ip);
    state.cache.ips.analysis = { ip, data };
  } catch (e) {
    state.cache.ips.analysis = { ip, analysisError: e.message };
  }
  if (state.view === 'ips') renderView();
  else {
    state.cache.ips = { ...(state.cache.ips || {}), analysis: null };
    toast(`IP ${ip}: análisis listo`, 'err');
  }
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  const tr = ev.target.closest('tr[data-mref]');
  if (!t && tr) return openMail(Number(tr.dataset.mref));
  if (!t) return;
  try {
    if (t.dataset.partnerApp) {
      const organizationId = t.dataset.partnerApp;
      t.disabled = true;
      t.textContent = 'Consultando cuentas…';
      try {
        const result = await api.opsPartnerApp(organizationId);
        state.cache.partnerApps = state.cache.partnerApps || {};
        state.cache.partnerApps[organizationId] = result;
        const target = document.getElementById(`partner-app-${organizationId}`);
        if (target) target.innerHTML = partnerAppDetailHtml(result, organizationId);
        t.textContent = 'Actualizar detalle de cuentas';
      } catch (error) {
        const result = { error: error.message || String(error) };
        state.cache.partnerApps = state.cache.partnerApps || {};
        state.cache.partnerApps[organizationId] = result;
        const target = document.getElementById(`partner-app-${organizationId}`);
        if (target) target.innerHTML = partnerAppDetailHtml(result, organizationId);
        t.textContent = 'Reintentar consulta';
      } finally { t.disabled = false; }
      return;
    }
    if (t.dataset.mailDelete !== undefined) {
      const ref = state.cache.mail?.items?.[Number(t.dataset.mailDelete)];
      if (!ref || !confirm(`¿Mover a papelera el correo “${ref.subject || '(sin asunto)'}”?`)) return;
      await api.mailDelete(ref);
      state.cache.mail.detail = null;
      await loadMail();
      renderView();
      toast('Correo movido a la papelera');
      return;
    }
    if (t.dataset.invoicePending !== undefined) {
      if (!confirm('Se procesarán las suscripciones pendientes. Si ARCA está habilitada, esto puede emitir comprobantes fiscales y enviar correos automáticamente según tus preferencias. ¿Continuar?')) return;
      const result = await api.invoiceIssuePending();
      toast(`Proceso finalizado: ${result.issued ?? result.count ?? 0} facturas`);
      return renderView();
    }
    if (t.dataset.invoiceEmail) {
      await api.invoiceEmail(t.dataset.invoiceEmail);
      toast('Factura enviada al comprador');
      return renderView();
    }
    if (t.id === 'mf-send') return sendCompose();
    if (t.dataset.maction === 'compose') {
      state.cache.mail = state.cache.mail || {};
      state.cache.mail.compose = !state.cache.mail.compose;
      return renderView();
    }
    if (t.dataset.maction === 'close-compose') {
      state.cache.mail.compose = false;
      return renderView();
    }
    if (t.dataset.maction === 'close-detail') {
      state.cache.mail.detail = null;
      return renderView();
    }
    if (t.dataset.ip) return analyzeIp(t.dataset.ip);
    if (t.dataset.revoke) {
      if (!confirm('¿Revocar la licencia? La instalación se suspende al revalidar.')) return;
      await api.licensadorRevoke({ key: t.dataset.revoke });
      toast('Licencia revocada');
      await loadLicenses();
      renderView();
      return;
    }
    if (t.dataset.unrevoke) {
      await api.licensadorUnrevoke({ key: t.dataset.unrevoke });
      toast('Licencia reactivada');
      await loadLicenses();
      renderView();
      return;
    }
    if (t.dataset.portalReset) {
      const org = t.dataset.org;
      if (!org) return;
      if (!confirm('Regenerar el codigo de activacion de este socio? El codigo anterior deja de servir.')) return;
      try {
        const res = await api.opsPortalReset(org, t.dataset.portalReset);
        toast('Nuevo codigo de activacion: ' + (res.activationCode || ''));
        await loadOps();
        renderView();
      } catch (e) { toast(e.message, 'err'); }
      return;
    }
    if (t.dataset.portalToggle) {
      const org = t.dataset.org;
      if (!org) return;
      const active = t.dataset.active === 'true';
      try {
        await api.opsPortalToggle(org, t.dataset.portalToggle, active);
        toast(active ? 'Cuenta habilitada' : 'Cuenta deshabilitada');
        await loadOps();
        renderView();
      } catch (e) { toast(e.message, 'err'); }
      return;
    }
  } catch (e) {
    toast(e.message, 'err');
  }
});

$('#refresh').addEventListener('click', () => {
  state.cache = {};
  renderView();
});

function renderVaultBadge() {
  const s = state.config?.secrets || {};
  const ready = s.licensadorPass && s.providerToken;
  $('#vault-badge').textContent = ready ? 'credenciales cargadas' : 'faltan credenciales';
}

async function boot() {
  if (!api) {
    $('#view').innerHTML = '<div class="card">No se pudo cargar el puente de la aplicación (preload).</div>';
    return;
  }
  window.__panelRetry = () => {
    state.cache = {};
    renderView();
  };
  api.onHealthUpdate((value) => {
    const update = value || {};
    state.cache.alerts = { alerts: update.alerts || [], checks: update.checks || [], at: update.at };
    if (state.cache.dashboard) state.cache.dashboard.alerts = state.cache.alerts;
    renderNav();
    if ((update.newIncidents || []).length) {
      const first = update.newIncidents[0];
      toast(`Nueva ${first.level === 'crit' ? 'incidencia crítica' : 'alerta'}: ${first.title}`, first.level === 'crit' ? 'err' : '');
    } else if ((update.recovered || []).length) toast(`Incidencia resuelta: ${update.recovered[0]}`);
    if (state.view === 'alertas' || state.view === 'dashboard') renderView();
  });
  renderNav();
  try {
    state.config = await api.getConfig();
  } catch {
    state.config = null;
  }
  renderVaultBadge();
  renderView();
}

boot();
