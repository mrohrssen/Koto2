const CACHE_VERSION = 3;
const CACHE_NAME = `neo-tokyo-assets-v${CACHE_VERSION}`;

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

// Listen for messages from the app to force cache clear
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)));
      }).then(() => {
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => client.postMessage('CACHES_CLEARED'));
        });
      })
    );
  }
  if (event.data === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache http/https requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Only cache .webp and .mp3 files - let everything else load fresh
  if (!url.pathname.endsWith('.webp') && !url.pathname.endsWith('.mp3')) {
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
