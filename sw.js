// GMAO Yacht — Service Worker (PWA offline support)
// Change CACHE_VERSION when you update files to force a refresh
const CACHE_VERSION = 'gmao-yacht-v4';
const ASSETS = [
  './',
  './gmao-yacht-v2.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache core assets, skip waiting to activate immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and take control immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - HTML pages: network-first (always get latest, fallback to cache offline)
// - API calls: network-only
// - Icons/manifest: cache-first (rarely change)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Network-only for Google Apps Script API calls
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Network-first for HTML (navigation) — always get the latest version
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(response => {
        // Update cache with fresh version
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline: serve cached version
        return caches.match(e.request) || caches.match('./gmao-yacht-v2.html');
      })
    );
    return;
  }

  // Cache-first for static assets (icons, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
