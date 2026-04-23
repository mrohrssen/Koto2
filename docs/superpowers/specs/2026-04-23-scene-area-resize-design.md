# Scene Area Resize + Header Removal — Design

**Date:** 2026-04-23
**Scope:** Mobile combat/exploration screen layout — `public/game.css` only
**Status:** Approved for implementation

## Problem

After the Capacitor switch to full-screen WebView, the scene area (where creatures are rendered on a background) feels cramped. It currently occupies `40vh`, leaving creatures visually small on iOS. Two changes restore breathing room:

1. Make the scene area 50% of the screen height.
2. Hide the area header pill (grey "はじまりのひろば / Starting Meadow" bar + "12/30" room badge). This element will be re-introduced later in a redesigned layout, so the change must be trivially reversible.

No HTML or JS changes. No behavior changes in exploration, combat, or PvP.

## Current Layout (`public/game.css`, `public/index.html`)

```
.game-app (flex column, fixed inset 0, max-width 430px)
├── .scene-area        height: 40vh;  min-height: 220px;  flex-shrink: 0;
│   └── .area-header-pill   position: absolute; top:0; height:40px (opacity-gated)
├── .action-area       flex: 1;   (vocab cards, 56vh minus toolbar)
└── .mini-toolbar      min-height: 44px; flex-shrink: 0;
```

## Design

### Change 1 — Scene area → 50dvh

`public/game.css:258`

```css
/* before */
.scene-area {
  ...
  height: 40vh;
  min-height: 220px;
  ...
}

/* after */
.scene-area {
  ...
  height: 50dvh;
  min-height: 220px;
  ...
}
```

`dvh` over `vh`:
- `dvh` tracks the *dynamic* viewport (accounts for mobile browser chrome appearing/disappearing).
- In the Capacitor WebView they're equivalent, but `dvh` is safer if the same CSS ever gets hit in mobile Safari directly.

`min-height: 220px` stays. On the smallest supported screens (iPhone SE, 568pt tall → 50dvh ≈ 284px) it's never active. It only kicks in if the viewport reports unusually small dimensions, matching current safety behavior.

`flex-shrink: 0` stays — scene area does not get squeezed if the vocab cards need more room.

### Change 2 — Hide area header pill

`public/game.css:178` — add `display: none` as the first declaration so it wins over the existing opacity-based show/hide logic:

```css
.area-header-pill {
  display: none;  /* Temporary: hidden until re-added in redesigned layout */
  position: absolute;
  top: 0;
  ...
}
```

What this leaves alone (deliberately):
- `public/index.html` structure — the `<div id="area-header-pill">...</div>` stays put.
- `public/js/ui/area-header.js` and its callers — still set the text and toggle `.visible`, which becomes a no-op while `display: none` is in force.
- The child classes (`.area-header-main`, `.area-header-name`, `.area-vocab-stack`, `.room-progress-badge`, etc.) — all still parented under the hidden pill, so no cascade side effects.

Revert path: delete the one `display: none` line.

### Change 3 — Verify `action-area` auto-fills

No CSS change needed. `.action-area` is `flex: 1`, so it will grow from "56vh minus toolbar" to "50dvh minus toolbar". The existing container queries (`@container action-area (min-height: 320px)`) will start engaging on taller phones, which is the intended improvement — cards get larger when there's more room.

### Explicitly not changing

- `.scene-area { border-bottom: 2px solid #3498db }` — preserved as visual divider.
- `.area-header-pill` HTML element — preserved so the redesign can reuse it.
- `area-header.js` — preserved; it's a safe no-op while the pill is hidden.
- `--toolbar-height: 44px` — preserved.
- iOS safe-area handling — unchanged. The scene background already extends to the top of the WebView; no notch-specific padding is required because the Capacitor iOS app's WebView starts below the system status bar.
- PvE/PvP parity — both modes share `.scene-area` / `.action-area`, so the change applies uniformly. No separate PvP work needed.

## Verification

1. **Visual (mandatory per CLAUDE.md):** run `npm run dev`, open Playwright with WebKit + iPhone 15 Pro emulation, navigate into combat, screenshot. Compare: scene area ≈ 50% height, no grey bar at top, cards visibly larger than before.
2. **Tier 1/2 tests:** `npm test`. These are layout-agnostic; they should stay green.
3. **Regression scan:** open exploration phase, narration box, creature popup, lookup popup. Confirm none of them depend on the area-header-pill being visible.

## Non-goals

- Redesigning the top bar (area name / room badge / vocab stack). That is a separate future spec.
- Moving the vocab cards' container-query breakpoints.
- Changing bottom toolbar layout or icons.
- Adding safe-area padding to `.scene-area`.

## Files Touched

- `public/game.css` — two edits (lines 178 and 258).

That's the entire change surface.
