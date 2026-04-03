# Buff/Debuff Indicator Redesign

**Date:** 2026-04-03
**Bug report:** `report-2026-04-03-04-29-54` (dev)
**Status:** Spec

## Problem

Combat creatures currently show **two redundant text indicators** for the same buff/debuff:

1. **DOM pills** (`.status-icons` / `.status-icon`) — tiny text badges like "ATK↑" rendered in HTML below the HP bars.
2. **Pixi pills** (`syncPixiStatusLabels`) — canvas-rendered colored rectangles like "ATK +1" positioned above the sprite.

Both show the same information. The DOM pills are also partially occluded by the Pixi sprite layer, creating visual clutter. A third system — **Pixi VFX** (shield circles, sleep zzz's, stun stars in `status-vfx.js`) — is unaffected and stays as-is.

## Solution

1. **Remove DOM pills entirely** — stop creating `.status-icons` containers, stop calling `updateStatusIcons()`, remove the CSS.
2. **Reposition Pixi pills** — instead of centering horizontally above the sprite, stack them **vertically** beside the sprite:
   - **Player creatures:** pills stack to the **left** of the sprite
   - **Enemy creatures:** pills stack to the **right** of the sprite
3. **Update resize logic** — `resizeFormations()` must use the same side-aware vertical positioning.

## Scope

### In scope
- Remove DOM status icon rendering from `scene.js`, `combat-loop.js`, and `event-popup.js`
- Reposition `syncPixiStatusLabels` in `formation.js` to stack vertically beside sprites
- Update `resizeFormations` in `formation.js` to match new positioning
- Update unit tests for `updateStatusIcons` (remove or adapt)
- Remove unused `.status-icons` / `.status-icon` CSS from `game.css`

### Out of scope
- Pixi VFX system (`status-vfx.js`) — unchanged
- `popupBuff` / `popupDebuff` floating text in `text.js` — these are transient one-shot animations, not persistent indicators
- `buff()` / `debuff()` event popup presets — these are one-shot combat log messages, not persistent indicators
- Move picker status pills (`.move-status-pill` in `move-select.js`) — different context, not combat scene
- Creature popup item buffs (`.creature-popup-buffs` in `creature-row.js`) — exploration UI, not combat

## Affected Files

### `public/js/pixi/formation.js`
**`syncPixiStatusLabels` (lines 67-120):** Change positioning from horizontal-above to vertical-beside. Accept `side` parameter (already present) to determine left vs right placement. Stack pills vertically with a gap, anchored to `sprite.baseX` offset left or right by approximately half the sprite width.

**`resizeFormations` (lines 566-580):** Update the label repositioning block to use the same side-aware vertical stacking logic.

### `public/js/ui/combat-loop.js`
**`syncStatusIconsFromResult` (lines 1606-1624):** Remove the `updateStatusIcons(slotEl, keys)` calls on lines 1612 and 1621. The `syncPixiStatusLabels` calls remain.

**Import (line 51):** Remove `updateStatusIcons` and `clearAllStatusIcons` from the import.

**`clearAllStatusIcons` calls (lines 1130, 3239):** Remove these two calls. `clearAllPixiStatusLabels` already handles canvas cleanup.

### `public/js/ui/scene.js`
**`showFormation` (lines 214-217):** Remove the `.status-icons` container creation (3 lines).

### `public/js/ui/event-popup.js`
**`updateStatusIcons` (lines 172-212):** Remove entirely. Only called from `combat-loop.js` (which we're cleaning up) and tests.

**`clearAllStatusIcons` (lines 215-219):** Same — remove.

**`STATUS_ICON_CONFIG` (lines 148-163):** Keep — still used by `syncPixiStatusLabels` in `formation.js`.

**Header comment (lines 9-11):** Update the top-of-file bullet list to remove references to `updateStatusIcons` and `clearAllStatusIcons`.

### `public/game.css`
**`.status-icons` (lines 4941-4947):** Remove.
**`.status-icon` (lines 4949-4955):** Remove.
**`.status-icon-enter` (lines 4957-4959):** Remove.
**`.status-icon-exit` (lines 4961-4963):** Remove.
**`@keyframes statusIconPop` and `@keyframes statusIconFade`:** Remove (referenced by the above classes).

### `tests/unit/ui/event-popup.test.js`
**`describe('updateStatusIcons', ...)` block:** Remove the entire test block since the function is being removed.

## Positioning Details

Current layout in `syncPixiStatusLabels`:
```
        [ATK +1] [SHD] [PSN]     ← horizontal, centered above sprite
              🐾 sprite
```

New layout:
```
Player side:              Enemy side:
[ATK +1]                           [ATK +1]
[SHD  ]   🐾 sprite    sprite 🐾  [SHD  ]
[PSN  ]                            [PSN  ]
```

Positioning formula (in `syncPixiStatusLabels`):
- **Vertical stacking:** each pill's `y` = `sprite.baseY - totalHeight/2 + (index * (pillHeight + LABEL_GAP))`
- **Horizontal offset:** 
  - Player: `pill.x = sprite.baseX - SIDE_OFFSET` (to the left)
  - Enemy: `pill.x = sprite.baseX + SIDE_OFFSET` (to the right)
- `SIDE_OFFSET` ≈ 45-55px (half the typical sprite width + small gap) — tune by eye
- Pills should be vertically centered around the sprite's vertical center, not anchored to the top or bottom

## Pill Stack Order

Multiple pills stack top-to-bottom in the same order they appear in the `keys` array (same iteration order as the current horizontal layout). No special priority ordering needed.

## Testing

- Remove `updateStatusIcons` unit tests and related imports/mocks from `event-popup.test.js`
- No existing Pixi tests assert `syncPixiStatusLabels` positions, so no test updates needed — but adding coverage is welcome
- Manual verification: play through combat with buffs/debuffs active, confirm:
  - Player pills appear to the left of the sprite
  - Enemy pills appear to the right
  - Multiple pills stack vertically without overlap
  - Sprites don't shift position
  - Pills reposition correctly on window resize
  - Pills clear when combat ends
