/* FIT System — Service Worker de la app del socio (PWA).
   Estrategia network-first con respaldo en caché: siempre intenta traer la
   versión más nueva y, si no hay red, sirve la copia guardada. Evita el
   problema clásico de "cache agresivo" que deja a los usuarios con una
   versión vieja pegada. Solo intercepta GET del mismo origen; las llamadas a
   la API pasan de largo. */

const CACHE = 'fitsystem-socios-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = (await cache.match('./index.html')) || (await cache.match('index.html'));
          if (shell) return shell;
        }
        throw new Error('offline');
      }
    })(),
  );
});
