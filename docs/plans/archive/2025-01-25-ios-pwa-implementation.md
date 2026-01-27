# iOS PWA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make NEO TOKYO installable on iOS home screen with native app appearance and cached assets.

**Architecture:** Add PWA manifest + iOS meta tags for standalone mode. Lightweight service worker caches `/assets/` using cache-first strategy. Resize onigiri chip to app icons.

**Tech Stack:** Web App Manifest, Service Worker API, macOS sips for image resizing

---

### Task 1: Generate App Icons

**Files:**
- Source: `public/assets/icons/chips/onigiri.png` (1024x1024)
- Create: `public/assets/icons/app-180.png`
- Create: `public/assets/icons/app-192.png`
- Create: `public/assets/icons/app-512.png`

**Step 1: Create 180x180 icon for iOS**

```bash
sips -z 180 180 --out /Users/michia/Documents/jrpg/public/assets/icons/app-180.png /Users/michia/Documents/jrpg/public/assets/icons/chips/onigiri.png
```

Expected: `app-180.png` created

**Step 2: Create 192x192 icon for Android/PWA**

```bash
sips -z 192 192 --out /Users/michia/Documents/jrpg/public/assets/icons/app-192.png /Users/michia/Documents/jrpg/public/assets/icons/chips/onigiri.png
```

Expected: `app-192.png` created

**Step 3: Create 512x512 icon for splash/store**

```bash
sips -z 512 512 --out /Users/michia/Documents/jrpg/public/assets/icons/app-512.png /Users/michia/Documents/jrpg/public/assets/icons/chips/onigiri.png
```

Expected: `app-512.png` created

**Step 4: Verify all icons created**

```bash
ls -la /Users/michia/Documents/jrpg/public/assets/icons/app-*.png
```

Expected: Three files listed (app-180.png, app-192.png, app-512.png)

**Step 5: Commit**

```bash
git add public/assets/icons/app-180.png public/assets/icons/app-192.png public/assets/icons/app-512.png
git commit -m "feat(pwa): add app icons from onigiri chip"
```

---

### Task 2: Create Web App Manifest

**Files:**
- Create: `public/manifest.json`

**Step 1: Create manifest.json**

```json
{
  "name": "NEO TOKYO: System Liberation",
  "short_name": "NEO TOKYO",
  "start_url": "/game.html",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#0a0a0f",
  "icons": [
    {
      "src": "/assets/icons/app-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/assets/icons/app-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('/Users/michia/Documents/jrpg/public/manifest.json'))" && echo "Valid JSON"
```

Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add public/manifest.json
git commit -m "feat(pwa): add web app manifest"
```

---

### Task 3: Add iOS Meta Tags to game.html

**Files:**
- Modify: `public/game.html:7-8` (after favicon, before stylesheet)

**Step 1: Add manifest link and iOS meta tags**

Insert after line 7 (the favicon line), before line 8 (the stylesheet):

```html
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="NEO TOKYO">
  <link rel="apple-touch-icon" href="/assets/icons/app-180.png">
```

The `<head>` should now look like:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NEO TOKYO: System Liberation</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌃</text></svg>">
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="NEO TOKYO">
  <link rel="apple-touch-icon" href="/assets/icons/app-180.png">
  <link rel="stylesheet" href="game.css">
</head>
```

**Step 2: Verify HTML syntax**

```bash
head -15 /Users/michia/Documents/jrpg/public/game.html
```

Expected: All meta tags visible, properly indented

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(pwa): add iOS meta tags for standalone mode"
```

---

### Task 4: Create Service Worker

**Files:**
- Create: `public/sw.js`

**Step 1: Create service worker with cache-first strategy for assets**

```javascript
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

  // Only cache assets (images, sprites, backgrounds, audio, icons)
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
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});
```

**Step 2: Verify JS syntax**

```bash
node --check /Users/michia/Documents/jrpg/public/sw.js && echo "Syntax OK"
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): add service worker for asset caching"
```

---

### Task 5: Register Service Worker in game.js

**Files:**
- Modify: `public/game.js:1` (add before imports)

**Step 1: Add service worker registration at top of file**

Insert as new line 1, before the imports:

```javascript
// Register service worker for asset caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

```

The file should now start with:

```javascript
// Register service worker for asset caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// ============ IMPORTS ============
import { store } from './js/store.js';
```

**Step 2: Verify JS syntax**

```bash
node --check /Users/michia/Documents/jrpg/public/game.js && echo "Syntax OK"
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(pwa): register service worker on page load"
```

---

### Task 6: Local Verification

**Step 1: Start dev server**

```bash
cd /Users/michia/Documents/jrpg && npm start &
sleep 3
```

**Step 2: Verify manifest is served**

```bash
curl -s http://localhost:3000/manifest.json | head -5
```

Expected: JSON with `"name": "NEO TOKYO: System Liberation"`

**Step 3: Verify service worker is served**

```bash
curl -s http://localhost:3000/sw.js | head -3
```

Expected: `const CACHE_NAME = 'neo-tokyo-assets-v1';`

**Step 4: Verify icons are served**

```bash
curl -sI http://localhost:3000/assets/icons/app-192.png | grep -E "HTTP|Content-Type"
```

Expected: `HTTP/1.1 200 OK` and `Content-Type: image/png`

**Step 5: Stop dev server**

```bash
pkill -f "node server.js"
```

---

### Task 7: Run E2E Tests

**Step 1: Run test suite to ensure no regressions**

```bash
cd /Users/michia/Documents/jrpg && ./scripts/e2e-test.sh
```

Expected: 80+/87 tests pass (known flakiness threshold)

**Step 2: If tests pass, final commit (if any uncommitted changes)**

```bash
git status
```

Expected: Working tree clean

---

### Task 8: Deploy and Test on iOS

**Step 1: Push to Railway**

```bash
git push origin master
```

Expected: Push succeeds, Railway auto-deploys

**Step 2: Manual iOS testing (user performs)**

Instructions for user:
1. Open https://jrpg-production.up.railway.app in iOS Safari
2. Tap Share button → "Add to Home Screen"
3. Verify: Icon shows onigiri character
4. Verify: App name shows "NEO TOKYO"
5. Tap icon to launch
6. Verify: App opens in standalone mode (no Safari address bar)
7. Play through one room
8. Close and reopen app
9. Verify: Assets load faster (cached)

---

## Rollback

If issues occur, revert all PWA changes:

```bash
git revert HEAD~5..HEAD --no-commit
git commit -m "revert: remove PWA features"
git push origin master
```
