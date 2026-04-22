# iOS Edge-to-Edge Design

**Date:** 2026-04-22
**Scope:** Capacitor iOS wrapper — remove ~10% gaps at the top and bottom of the screen so the game's background art reaches the top pixel and the mini-toolbar is flush with the bottom edge.

## Problem

On iOS, the Capacitor-wrapped build leaves visible bands at the top and bottom of the screen where the game content does not reach the device edges (estimated ~10% at each end). Two stacking causes:

1. **`ios.contentInset: 'automatic'`** in `capacitor.config.ts` makes WKWebView auto-reserve space for the status bar and home indicator at the native layer. CSS cannot reclaim pixels the webview never receives.
2. **Status bar does not overlay the webview.** `StatusBar.setOverlaysWebView({ overlay: true })` is never called, and `StatusBar.setBackgroundColor` is set to `#e8edf3`, so the native status bar is an opaque strip above the webview rather than a transparent layer over it.

On top of those native-layer insets, `.game-app` adds `padding-top: env(safe-area-inset-top)` and `.mini-toolbar` adds `env(safe-area-inset-bottom)`, further pushing content away from the edges.

## Goal

- **Top:** The scene-area background art paints from y=0. The native iOS status bar (time/battery/carrier) is hidden entirely. The user will redesign the top in-game UI separately.
- **Bottom:** The mini-toolbar sits flush with the bottom edge of the screen. No breathing room is reserved for the home indicator. User accepts that taps in the last ~20pt may compete with the iOS swipe-up-home gesture.
- **Takeover / utility screens** (`.takeover`, `.auth-screen`, `.speed-review-header`, etc.) continue to respect `env(safe-area-inset-*)` so text stays clear of the notch / dynamic island.

## Non-goals

- Repositioning `area-header-pill` or other in-scene top UI. The user will handle this as part of a separate redesign pass (see Follow-ups).
- Android changes. Android does not honor iOS-specific `contentInset`; this spec does not modify Android behavior.
- Landscape-specific layout work. Horizontal safe-area insets continue to be handled by existing CSS where present.

## Architecture

The fix spans two layers. Neither works alone.

### Layer 1 — Native (iOS chrome)

**`capacitor.config.ts`**
- `ios.contentInset`: `'automatic'` → `'never'`. WKWebView stops reserving top/bottom insets.

**`public/js/native/index.js`** (inside `initNative()`)
- Call `StatusBar.hide()` so time/battery disappears.
- Call `StatusBar.setOverlaysWebView({ overlay: true })` as a safety net: if the status bar re-shows (e.g., after an OS event), it will not steal layout.
- Drop `StatusBar.setBackgroundColor('#e8edf3')` — moot when the bar is hidden.
- Keep `StatusBar.setStyle({ style: Style.Light })` as a harmless fallback for transient show states.
- Wrap each call in `try/catch` so a failure in one does not block later native setup.

### Layer 2 — CSS (content placement)

**`public/game.css`**
- `.game-app` — remove `padding-top: env(safe-area-inset-top, var(--safe-area-inset-top, 0px))`. The scene-area now paints from y=0.
- `.mini-toolbar` — remove the `env(safe-area-inset-bottom, …)` contribution from its padding. Keep `padding: 4px 0` so icons have a small internal breathing room.
- `.mini-toolbar.keyboard-avoid` variant (line ~1511) — match the base rule; use `padding: 4px 0 4px` instead of adding the bottom inset.
- Leave all other `env(safe-area-inset-*)` usage intact (takeovers, auth screen, speed review, lookup popup, narration box, etc.).

### Unchanged

- `public/index.html` — `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent` remain. The latter is ignored by Capacitor but harmless.
- `ios/App/App/Info.plist` — `UIViewControllerBasedStatusBarAppearance: true` stays.
- `.status-bar` div in `index.html` — already `display:none`; not part of this spec.

## Data flow

There is no runtime data flow change. The diff is:
- One config file edit (Capacitor).
- One init-time native plugin call path in `initNative()`.
- Two CSS rules in `game.css`.

## Testing plan

1. **Dev simulator (Playwright + WebKit, iPhone 15 Pro emulation).** Inject `public/dev-safe-area.css` at session start to simulate notch insets. Verify:
   - Scene-area paints to y=0.
   - Mini-toolbar flush to bottom edge.
   - Takeover views (Settings, Leaderboard, Speed Review) still clear the mocked notch.
2. **Real iPhone via Capacitor build (notch or dynamic-island device).** The real gate. Screenshot:
   - Main gameplay screen — no visible status bar, background reaches top pixel, toolbar flush bottom.
   - Auth screen — text does not collide with notch.
   - Settings and Leaderboard takeovers — safe-area padding still respected.
   - Speed review — header still clears notch.
3. **Keyboard behavior.** Open the bug-report textarea. Confirm keyboard appears, layout reflows, and the `Keyboard.resize: 'body'` config still works. Confirm the status bar does not re-appear above the webview when the keyboard dismisses.
4. **Android smoke check.** Run an Android build. No change expected; confirm no regression.

## Risks

- **System gesture conflict at the bottom edge.** Taps in the last ~20pt may be eaten by the iOS swipe-up-home gesture. Accepted per scope.
- **`area-header-pill` collides with the dynamic island.** The pill is positioned `top:0` inside `scene-area`. After this change it paints under the notch. The user will redesign the top UI; out of scope for this spec.
- **Status bar re-appearing on iOS events.** If `StatusBar.hide()` is reset by the OS (e.g., on certain lifecycle events), `setOverlaysWebView({ overlay: true })` ensures the layout does not shift.

## Follow-ups (not part of this spec)

- Redesign the top in-game UI (`area-header-pill`, `essence-display`, `floor-indicator`) to account for the notch / dynamic island after this change lands.
- Consider adding a `--ui-top-inset` / `--ui-bottom-inset` CSS custom property layer if future UI elements need opt-in safe-area respect without hardcoding `env(safe-area-inset-*)`. Skipped now per YAGNI.

## Out-of-scope guardrails

- No refactor of unrelated safe-area usage.
- No changes to Android config, Info.plist, or storyboards.
- No changes to the existing `.status-bar` div (already hidden).
