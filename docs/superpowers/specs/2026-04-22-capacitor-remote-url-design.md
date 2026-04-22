---
title: Switch Capacitor iOS build to remote-URL (server.url) model
date: 2026-04-22
status: approved
---

# Capacitor remote-URL deployment

## Problem

The iOS Capacitor build bundles the web frontend (`dist/`) into the native app. Every frontend change — even a one-line JS fix — requires `npm run build && npx cap sync ios` plus an Xcode rebuild and reinstall to appear on a device. The game is already 100% backend-dependent (all gameplay API calls hit Railway), so the "works offline" benefit of bundling buys nothing: if Railway is down the app is unplayable regardless of whether the web shell loads.

## Goal

Eliminate the Xcode rebuild cycle for frontend-only changes. Pushing JS/CSS to Railway should be sufficient to update the app.

## Non-goals

- Offline support. Explicitly not wanted.
- Ionic Appflow / Capgo / other live-update services. We are deferring these until App Store submission (see "Future migration path").
- CI automation of iOS builds. Out of scope.
- Android parity. iOS-only for this spec; Android is not in active testing.

## Approach

Switch the Capacitor WebView to load its entrypoint from Railway instead of the bundled `dist/` folder, by adding a `server` block to `capacitor.config.ts`.

### Config change

```ts
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'com.koto.app',
  appName: 'Koto',
  webDir: 'dist',
  server: {
    url: 'https://jrpg-production.up.railway.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  // ...rest unchanged
};
```

`webDir: 'dist'` stays. `vite build` + `cap sync` still run during the one-time rebuild so the bundle is present in the iOS project — the WebView ignores it at runtime when `server.url` is set, but keeping it avoids a sync-error pitfall and preserves the bundle for a future migration to live updates.

### One-time migration steps

```bash
npm run build
npx cap sync ios
open ios/App/App.xcworkspace
# in Xcode: rebuild and install on device
```

After this Xcode cycle, any push to Railway `master` is visible in the app on its next cold start. No further rebuilds are needed for web-only changes.

Native-side changes — `capacitor.config.ts` edits, plugin version bumps, `Info.plist`, `AppDelegate.swift`, icons/splash — still require the full rebuild cycle.

## Impact on existing installs (one-time friction)

The WebView origin changes from `capacitor://localhost` to `https://jrpg-production.up.railway.app`. Browser storage is scoped per origin, so everything the old origin wrote is invisible to the new origin:

- **`authToken`** (`public/js/api.js:40`, `public/js/settings.js:243`) — user is logged out on first launch after the switch. Log in again once.
- **AI API key config** (`jrpg_aiApiKey`, `jrpg_aiProvider`, `jrpg_openaiModel`, `jrpg_openrouterModel`, `jrpg_jlptLevel` in `public/js/settings.js`) — user re-enters their AI key and provider on first launch.
- **Audio preferences** (`jrpg_audioMuted`, `jrpg_sfxVolume`, `jrpg_bgmVolume`, `jrpg_ttsVolume`) — reset to defaults.
- **`logLevel`** (`public/js/logger.js`) — resets; trivial.
- **`sessionStorage` (`pvpMatchCode`, `sessionExpiredMsg`)** — scoped to tab lifetime anyway, no user-visible impact.

Server-side data is safe — saves (`.jrpg-save-*.json`), meta-progression, and user accounts live on Railway's volume, not the device.

Only the developer (and any friends who already installed the app) will experience this one-time reset. Future installs start fresh on the new origin and have no legacy state.

## Failure modes and mitigations

- **Railway fully down at launch.** WebView shows its default "cannot load page" error, no login screen. Mitigation: none — accepted tradeoff vs. current "login screen then API error". Railway uptime is the product's critical path either way.
- **Railway mid-deploy (brief 502/503):** user force-closes and reopens the app. Railway deploys typically resolve within ~30s.
- **Stale JS cached by iOS WebView after a Railway push:** iOS's WKWebView applies standard HTTP caching. Vite emits hashed asset filenames (`index-<hash>.js`), so the entry HTML changes on each deploy and cached assets are re-requested. If a user ever sees stale JS, force-closing the app clears it. Not expected to be a common issue.
- **App Store review rejection under 4.2 (minimum functionality) or 4.7 (remote code):** rollback described below. Not an immediate risk — solo Xcode build until submission.

## Rollback plan

If App Store review rejects the remote-URL build, or if any issue forces reverting:

1. Remove the `server` block from `capacitor.config.ts`.
2. `npm run build && npx cap sync ios`.
3. Rebuild in Xcode and reinstall.

Users flip back to the `capacitor://localhost` origin; they log in once more and re-enter AI keys. Total revert time ≈ 5 minutes plus Xcode build time.

## Testing plan

Verification happens on-device after the one-time rebuild:

1. **Origin check:** Open Safari Web Inspector on the Mac, attach to the iOS app's WebView, confirm `location.origin` is `https://jrpg-production.up.railway.app`.
2. **Auth round-trip:** Log in with test account. Confirm `authToken` is written to localStorage for the new origin and subsequent API calls succeed.
3. **Gameplay smoke:** Run through login → area select → one combat → victory. No console errors, sprites render, TTS works, haptics fire.
4. **Live-update proof:** Bump a visible string (e.g., a menu label) in `public/js/` on the master branch, push to Railway, wait for deploy, force-close the app, reopen. Confirm the new string appears with no Xcode involvement.
5. **Failure-mode spot check:** Simulate offline (airplane mode, or Network Link Conditioner), launch the app, confirm the error state is acceptable (WebView "cannot load" screen). Restore network, relaunch, confirm recovery.

## Future migration path (reference, not in scope)

When submitting to App Store, if 4.7 rejection risk becomes real, migrate to Capacitor live updates (Capgo free tier or Ionic Appflow):

- The bundled `dist/` becomes the first-launch fallback.
- A live-update plugin call (in `AppDelegate.swift` or a bootstrap JS file) checks for newer bundles and downloads in the background.
- The WebView origin stays at `capacitor://localhost` permanently, so no further storage resets for users.

Both approaches produce the same `dist/` output, so migrating A → B is additive (~50-200 lines of integration), not a rewrite.
