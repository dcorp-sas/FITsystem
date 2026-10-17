/* FIT System — Service Worker de la app del socio (PWA).

   Dos estrategias:
   - Assets y navegación (mismo origen): network-first con respaldo en caché.
     Siempre intenta la versión más nueva y, sin red, sirve la copia guardada.
   - Llamadas GET a la API (otro origen): network-first con respaldo en caché,
     para que el socio pueda ver su cuota, clases, rutinas y novedades sin
     conexión. No se cachean los endpoints de login/activación ni las respuestas
     de error. La caché de API se limpia al cerrar sesión (mensaje de la app). */

const CACHE = 'fitsystem-socios-v3';
const API_CACHE = 'fitsystem-socios-api-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// La app avisa cuando hay que vaciar los datos de la API (logout / sesión vencida).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-api-cache') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

function isApiGet(url) {
  return /\/api\//.test(url.pathname);
}
function isAuthEndpoint(url) {
  return /\/portal\/auth\//.test(url.pathname) || /\/portal\/push-token$/.test(url.pathname);
}

async function networkFirst(request, cacheName, cacheable) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (cacheable(fresh)) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // API (otro origen): cachear GET salvo login/activación y errores.
  if (url.origin !== self.location.origin) {
    if (!isApiGet(url) || isAuthEndpoint(url)) return;
    event.respondWith(networkFirst(req, API_CACHE, (res) => res && res.status === 200));
    return;
  }

  // Mismo origen: assets y navegación.
  event.respondWith(
    networkFirst(req, CACHE, (res) => res && res.status === 200 && res.type === 'basic').catch(async () => {
      if (req.mode === 'navigate') {
        const cache = await caches.open(CACHE);
        const shell = (await cache.match('./index.html')) || (await cache.match('index.html'));
        if (shell) return shell;
      }
      return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
    }),
  );
});

// Notificaciones push (Web Push): muestra el aviso que envía el servidor.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = (data && data.title) || 'FIT system™';
  const options = {
    body: (data && data.body) || '',
    icon: './logo192.png',
    badge: './logo192.png',
    data: { url: (data && data.url) || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: enfoca la app (o la abre en la URL indicada).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});