/* ලංකාweather service worker – lets the page open offline.
   App files: cache-first (updated in the background).
   Weather APIs: network-first, falling back to the last cached response. */
const VERSION = 'lankaweather-v6-1';
const APP_SHELL = ['./', 'index.html', 'style.css', 'app.js', 'app-v4.js', 'app-v5.js', 'app-v6.js', 'sl-flag.svg', 'places-lk.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Online place search: always live, never cached
  if (url.hostname.endsWith('openstreetmap.org') || url.hostname.startsWith('geocoding-api.')) return;
  // Radar frames/tiles and live lightning change every few minutes: never serve them from cache
  if (url.hostname.endsWith('rainviewer.com') || url.hostname.endsWith('pocketworld.org')) return;

  // Live weather data: try the network first
  if (url.hostname.endsWith('open-meteo.com')) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || Response.error()))
    );
    return;
  }

  // App shell, fonts, icons, Chart.js: cache first, refresh in background
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
