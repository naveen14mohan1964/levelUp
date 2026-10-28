// Level Up service worker: makes the app installable and opens fast (and offline, read-only) from cache.
//   /api/*        always the network (your data is never served stale)
//   /assets/*     built files have hashed names: cache first, forever
//   /mediapipe/*  the focus guard's models (34 MB): cache first so the camera starts instantly next time
//   pages         network first, falling back to the cached app shell when the server is off
const VERSION = 'levelup-v1';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return; // network only
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('/', copy));
      return res;
    }).catch(() => caches.match('/')));
  }
});

// A click on a Level Up notification focuses the open app (or opens it) at the notification's page
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const to = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) { win.navigate(to).catch(() => {}); return win.focus(); }
    return self.clients.openWindow(to);
  }));
});
