# Top HUD Redesign — Room Badge + Monsters + Menu

**Date:** 2026-04-23
**Scope:** Replace the bottom `mini-toolbar` with a minimal top HUD overlay: `Room N/M` on the left, `Monsters` + `Menu` buttons on the right. All three chips share a single translucent-black style. Remove the `Lookup` toolbar button as a surface and move it into the Menu sheet.

## Goal

- Reclaim the ~52px of vertical space currently spent on `.mini-toolbar` at the bottom of the screen.
- Put progression context (`Room 7/30`) where the player can see it without losing focus on the scene.
- Keep navigation surfaces minimal: 2 buttons, both top-right.
- Visually quiet the HUD — black/white only, no yellow/gold accents, no area-name strip.

## Current state (what's there today)

- `public/index.html` lines 67–99:
  - `.action-area` (the bottom combat/action panel)
  - `.mini-toolbar` with three buttons: `#lookup-btn`, `#bots-btn`, `#menu-btn`
  - `.menu-sheet` slide-up with: Settings, Leaderboard, Reset Run, Bug Report, Logout
- `.area-header-pill` is present but hidden (`display: none`) with a TODO in `game.css` line 183: *"Temporarily hidden — re-enable as flex in redesigned top-bar layout"*. It was designed to hold area name + sub-area + a `#room-progress-badge`.
- `#room-progress-badge` already renders the `N/M` format and has `display: inline-block` when non-empty (`game.css` 620–640).
- `.status-bar` is hidden; floor/essence go unused in combat screen.
- `lookup.js` uses `#lookup-btn` as a toggle to enter/exit lookup mode (parses all JP text on screen and makes words tappable).

## New layout

Re-enable `#area-header-pill` as the top HUD container, restyled as three independent floating chips over the scene — **no background strip across the top**. Each chip is its own translucent-black capsule.

```
┌──────────────────────────────────────────┐
│ [ 7/30 ]                     [ ⊞ ] [ ≡ ] │   ← three separate chips, scene shows between
│                                          │
│                (scene area)              │
│                                          │
```

- **Left:** `#room-progress-badge` — format `N/M` (e.g. `7/30`). No leading word, no label.
- **Right:** `#bots-btn` (grid icon, Monsters) then `#menu-btn` (hamburger).
- **Middle:** empty. The `area-header-name` / separator / `area-header-sub` spans are removed from the HUD layout (kept only if still used elsewhere; otherwise deleted).

## Chip style (Variant B — translucent + blur)

One shared class `.hud-chip`, applied to all three (badge and both buttons):

```css
.hud-chip {
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  padding: 8px 12px;
  line-height: 1;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Buttons: square touch targets, icon centered */
.hud-chip.hud-btn {
  padding: 8px;
  min-width: 38px;
}
.hud-chip.hud-btn svg { width: 20px; height: 20px; }
```

Container (`.area-header-pill` repurposed — clears its old pill background):

```css
.area-header-pill {
  position: absolute;
  top: env(safe-area-inset-top, 0);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  /* clear the old dark strip background so each chip floats independently */
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  height: auto;
  z-index: 10;
  pointer-events: none;  /* children re-enable pointer events */
}
.area-header-pill > * { pointer-events: auto; }
.area-header-pill .top-hud-right { display: flex; gap: 8px; }
```

## HTML changes (`public/index.html`)

1. Inside `#area-header-pill`, replace the `area-header-main` block with:
   ```html
   <span class="hud-chip room-progress-badge" id="room-progress-badge" aria-label="Room progress"></span>
   <div class="top-hud-right">
     <button class="hud-chip hud-btn" id="bots-btn" aria-label="Monsters"> ... grid svg ... </button>
     <button class="hud-chip hud-btn" id="menu-btn" aria-label="Menu"> ... hamburger svg ... </button>
   </div>
   ```
2. Delete the entire `<div class="mini-toolbar" id="mini-toolbar">…</div>` block.
3. Delete the `#lookup-btn` `<button>` (it was inside `mini-toolbar`).
4. In `.menu-sheet`, add a new `<button class="menu-item" id="lookup-menu-btn">` above Settings:
   ```html
   <button class="menu-item" id="lookup-menu-btn"><span class="menu-icon">🔍</span> Lookup</button>
   ```

## CSS changes (`public/game.css`)

1. Rewrite `.area-header-pill` block (see above).
2. Add `.hud-chip`, `.hud-chip.hud-btn`, `.top-hud-right` rules.
3. Update `.room-progress-badge`:
   - Remove its standalone background/padding (now inherited from `.hud-chip`).
   - Keep the `:not(:empty)` display rule, but match the chip style.
4. Remove `.mini-toolbar`, `.toolbar-btn`, `.toolbar-btn:active`, `.toolbar-btn.active`, `.toolbar-btn.lookup-active`, `.toolbar-btn.lookup-loading` rules.
5. Remove references to `--toolbar-height` if no longer used elsewhere (grep before deleting the var itself).

## JS changes

- `public/js/dom.js`: remove the `lookupBtn` getter (or repoint it to `#lookup-menu-btn`). Keep `botsBtn`, `menuBtn`, `roomProgressBadge`.
- `public/js/ui/lookup.js`: the existing toggle logic keys off `dom.lookupBtn`. Repoint it to the new `#lookup-menu-btn`. The `.lookup-active` / `.lookup-loading` class styling will need a new home (or be dropped — see Open Questions).
- `public/js/ui/index.js` (or wherever `mini-toolbar` is shown/hidden): remove any show/hide calls targeting `.mini-toolbar`.
- Any code that toggles `.area-header-pill`'s `opacity: 0 → 1` — verify it still makes sense (container now has transparent background; opacity transition on the whole thing is fine).

## Removed

- `.mini-toolbar` element and all styles.
- `#lookup-btn` as a top-level surface (feature moves into menu sheet).
- WAVE / TURN indicators (never existed in live code — they were in the reference mockup only).
- Fast-forward button (same — never existed).
- Area name + sub-area text from the top HUD (only `Room N/M` remains).

## Out of scope

- Re-styling the menu sheet itself (still the existing slide-up).
- Changes to how `#room-progress-badge` gets populated (already wired; we're only restyling).
- PvP battle screen parity: the PvP UI lives under `.pvp-*` classes and has its own header. If PvP uses the same `#area-header-pill` / `#mini-toolbar`, the changes carry over automatically. If it has its own toolbar, that is a follow-up.

## Decisions made here (not open questions)

1. **Lookup button loading/active state** — drop the `.lookup-loading` / `.lookup-active` classes. The popup itself is the feedback. Simpler than trying to surface a spinner through a closed menu sheet.
2. **Safe-area inset** — container uses `top: env(safe-area-inset-top, 0)` for iOS notches. Verify on device at implementation time; no design change needed.
3. **`floor-indicator` / `essence-display`** — both live in the hidden `.status-bar`. Not re-surfaced by this redesign. Untouched.

## Verification plan

1. Syntax check: `node --check public/js/dom.js public/js/ui/lookup.js && echo OK`.
2. `npm test` — ensure unit/integration pass.
3. Launch `npm run dev`, navigate to combat, confirm:
   - Room badge renders top-left on scene background.
   - Monsters + Menu open their respective UIs.
   - Menu sheet contains Lookup item, tapping it enters lookup mode.
   - No bottom toolbar visible.
4. Screenshot via Playwright at an in-combat scene to confirm visual match to Variant B.
5. PvP spot-check: open PvP battle, confirm no regression / same HUD rendered.
