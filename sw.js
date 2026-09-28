/* Pulse service worker v3: network-first for everything, cache fallback for offline use. */
const CACHE = 'pulse-shell-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=2',
  './app.js?v=2',
  './manifest.json?v=2',
  './icons/icon-192.png?v=2',
  './icons/icon-512.png?v=2',
  './icons/apple-touch-icon.png?v=2'
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
