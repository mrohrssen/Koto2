# iOS PWA Design: Add to Home Screen

## Goal

Make NEO TOKYO installable on iOS home screen with native app appearance and cached assets for faster loading.

## Requirements

- Standalone mode (no Safari chrome)
- Custom app icon (onigiri chip)
- Dark theme status bar
- Cache images/sprites/backgrounds for performance
- No offline mode needed (game requires API access)

## Technical Design

### Web App Manifest

**File:** `public/manifest.json`

```json
{
  "name": "NEO TOKYO: System Liberation",
  "short_name": "NEO TOKYO",
  "start_url": "/game.html",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#0a0a0f",
  "icons": [
    { "src": "/assets/icons/app-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/icons/app-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### iOS Meta Tags

Add to `public/game.html` `<head>`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="NEO TOKYO">
<link rel="apple-touch-icon" href="/assets/icons/app-180.png">
```

### Service Worker

**File:** `public/sw.js`

**Strategy:** Cache-first for `/assets/` paths, network-only for everything else.

**Cached paths:**
- `/assets/backgrounds/*`
- `/assets/sprites/*`
- `/assets/icons/*`
- `/assets/audio/*`

**Behavior:**
1. Install: No pre-caching (lazy loading). Comment placeholder for future eager fetch.
2. Fetch: If URL starts with `/assets/`, check cache first. On miss, fetch from network and store in cache.
3. Activate: Delete old cache versions when version string changes.

**Cache versioning:** Use `CACHE_NAME = 'neo-tokyo-assets-v1'`. Bump version to invalidate.

**Registration:** Add to top of `public/game.js`:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### App Icons

**Source:** `public/assets/icons/chips/onigiri.png`

**Generated icons:**

| File | Size | Purpose |
|------|------|---------|
| `public/assets/icons/app-180.png` | 180x180 | iOS apple-touch-icon |
| `public/assets/icons/app-192.png` | 192x192 | PWA manifest |
| `public/assets/icons/app-512.png` | 512x512 | PWA splash/store |

**Background:** White (keep existing)

**Tool:** macOS `sips` for resizing

## Files Changed

**New:**
- `public/manifest.json`
- `public/sw.js`
- `public/assets/icons/app-180.png`
- `public/assets/icons/app-192.png`
- `public/assets/icons/app-512.png`

**Modified:**
- `public/game.html` - manifest link + iOS meta tags
- `public/game.js` - service worker registration

## Testing

1. Deploy to Railway
2. Open https://jrpg-production.up.railway.app in iOS Safari
3. Tap Share > "Add to Home Screen"
4. Verify: app icon shows onigiri, launches without Safari UI
5. Verify: DevTools > Application > Cache Storage shows assets cached after first load

## Future Enhancement

Add eager pre-caching by populating asset list in service worker install event.
