/* Pulse service worker v6: network-first for everything, cache fallback for offline use. */
const CACHE = 'pulse-shell-v7';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=5',
  './config.js?v=5',
  './metrics.js?v=5',
  './sync.js?v=5',
  './app.js?v=5',
  './manifest.json?v=5',
  './icons/icon-192.png?v=5',
  './icons/icon-512.png?v=5',
  './icons/apple-touch-icon.png?v=5'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const indexURL = new URL('index.html', self.registration.scope).href;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? indexURL : req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req.mode === 'navigate' ? indexURL : req)
          .then((r) => r || (req.mode === 'navigate' ? caches.match(self.registration.scope) : undefined))
          .then((r) => r || Response.error())
      )
  );
});
