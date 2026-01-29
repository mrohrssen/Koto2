const CACHE_NAME = 'neo-tokyo-assets-v1';

// Future: Add URLs here for eager pre-caching on install
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  if (PRECACHE_URLS.length > 0) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
  }
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('neo-tokyo-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache http/https requests for /assets/
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  if (!url.pathname.startsWith('/assets/')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          // Only cache complete (200) responses, not partial (206) or errors
          if (networkResponse.ok && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});
