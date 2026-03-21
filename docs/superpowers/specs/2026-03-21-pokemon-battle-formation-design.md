# Pokemon-Style Battle Formation Layout

## Summary

Replace the current "enemies above / player row below" layout with a Pokemon-style diagonal formation. Both player and enemy creatures render inside the scene-area on top of the background. The creature-row element is removed entirely.

```
┌──────────────────────┐
│     [status bar]     │
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│                      │
│  P3          E3      │  ← back (scale 0.9)
│                      │
│   P2          E2     │  ← mid (scale 0.95)
│                      │
│    P1          E1    │  ← front (scale 1.0)
│                      │
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│  ┌──────────────────┐│
│  │  action area     ││
│  └──────────────────┘│
│  [🔍] [⊞] [☰]      │
└──────────────────────┘
```

Both columns lean in the same direction (left-to-right diagonal from back to front). Player sprites face right. Enemy sprites are CSS-flipped to face left.

## Motivation

- Gives the battle a spatial feel with two opposing sides
- Frees vertical space by eliminating the separate creature-row strip
- Solid (non-fading) background makes the scene area feel more grounded
- Smaller sprites in formation allow more room for the action area below

## HTML Changes

### Remove creature-row

Delete `<div class="creature-row" id="creature-row">` from `game.html`. Remove the DOM reference from `dom.js`. Audit all JS that references `dom.creatureRow` or `#creature-row` and update/remove.

**Known callsites to update:**
- `dom.js`: remove `creatureRow` reference
- `game.js`: `updateCreatureRow()` at lines ~351, ~363 sets `dom.creatureRow.innerHTML = ''`
- `combat-loop.js`: 6 hardcoded `#creature-row .creature-slot` selectors (lines ~939, ~985, ~1049, ~1485, ~1500, ~1805) for XP popups, HP bar animations, MP bar updates, KO swap effects
- `creature-row.js`: builds DOM into creature-row container
- `combat-effects.js`: `playerHitEffect()` takes a `creatureRowEl` parameter

### New battle-stage inside scene-area

Replace the `enemy-sprite-container` with a `battle-stage` container holding two formation divs, plus an `npc-display` sibling for centered NPC rendering:

```html
<div class="battle-stage" id="battle-stage">
  <div class="formation player-formation" id="player-formation"></div>
  <div class="formation enemy-formation" id="enemy-formation"></div>
</div>
<div class="npc-display" id="npc-display">
  <img id="enemy-sprite" class="enemy-sprite" src="" alt="">
</div>
```

Both sit inside `.scene-area` alongside the existing background, overlays, narration-box, area-header-pill, and scene-toast. The `npc-display` is a separate centered container for non-creature NPCs (shrine fox, quiz master, dealer, chippy, etc.). When NPCs are shown, `battle-stage` may coexist or hide. When creatures are shown, `npc-display` is hidden.

### Formation slot markup

Each creature in a formation renders as:

```html
<div class="formation-slot" data-index="0">
  <div class="formation-sprite"><!-- img or text sprite --></div>
  <div class="formation-slot-name"><!-- Japanese name with ruby --></div>
  <div class="formation-hp-bar"><div class="formation-hp-fill"></div></div>
</div>
```

Minimal: sprite + full-size name (for vocab learning) + small HP bar. No XP bar, no MP bar in the formation view. Those details surface in the creature popup on tap.

### Enemy info pill

The `enemy-info` element (name + HP bar for non-creature enemies at top of scene) stays as-is for NPC boss fights. It continues to be positioned absolutely at the top of the scene-area.

## CSS Changes

### Scene background: solid bottom edge

Remove `mask-image` / `-webkit-mask-image` from `.scene-background`. Change `bottom: -80px` to `bottom: 0` since the -80px overflow was there to support the fade gradient. The background now renders with a solid bottom edge.

### Battle stage layout

```css
.battle-stage {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 40px 12px 8px;
}

.formation {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 4px;
}

/* Diagonal stagger — both lean the same direction (back=left, front=right) */
.formation .formation-slot:nth-child(1) { margin-left: 24px; }  /* back/top */
.formation .formation-slot:nth-child(2) { margin-left: 36px; }  /* mid */
.formation .formation-slot:nth-child(3) { margin-left: 48px; }  /* front/bottom */

/* Subtle depth scaling */
.formation .formation-slot:nth-child(1) { transform: scale(0.9); }
.formation .formation-slot:nth-child(2) { transform: scale(0.95); }
.formation .formation-slot:nth-child(3) { transform: scale(1.0); }

/* Enemy sprites flipped to face left */
.enemy-formation .formation-sprite { transform: scaleX(-1); }
```

### NPC display (centered, replaces enemy-sprite-container for NPCs)

```css
.npc-display {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding-top: 40px;
}
```

### Formation slot styling

```css
.formation-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.formation-sprite {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.formation-slot-name {
  font-size: 13px;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  color: #fff;
}

.formation-hp-bar {
  width: 56px;
  height: 5px;
  background: rgba(0,0,0,0.3);
  border-radius: 3px;
  overflow: hidden;
}

.formation-hp-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
```

### Remove creature-row CSS

Delete all `.creature-row` and `.creature-slot` CSS rules. Key locations:
- `.creature-row` base rules (~line 695)
- `.creature-row:has(.creature-slot)` (~line 2914)
- `.creature-slot`, `.creature-icon`, related rules (~lines 2919-3100+)
- `.creature-mp-bar` rules under creature-row section (~line 5129)

Also remove `.creature-enemy` and `.multi-enemy-row` CSS since those rendering paths are replaced by the unified formation system.

## JS Changes

### scene.js: unified formation rendering

Add a new function `showFormation(side, creatures)`:

- `side` is `'player'` or `'enemy'`
- `creatures` is an array of 1-3 creature objects
- Targets `#player-formation` or `#enemy-formation`
- Builds formation-slot markup for each creature
- **Slot placement by count:**
  - 1 creature → populate middle position only (visual slot index 1)
  - 2 creatures → populate top and bottom positions (visual slot indices 0 and 2)
  - 3 creatures → populate all three positions (indices 0, 1, 2)
- Empty positions are simply not rendered (no empty placeholder divs)

Deprecate `showEnemy()` and `showEnemies()` — they become thin wrappers calling `showFormation('enemy', ...)`.

Add `showPlayerFormation(creatures)` as a convenience wrapper.

Export `hideFormation(side)` to clear a formation container.

**NPC rendering functions** (showShrineFox, showQuizMaster, showWordDiscoveryNpc, showDealer, showCid, showNpcTrainer, showChippy) currently render into `dom.enemySpriteContainer`. These must be updated to render into the new `dom.npcDisplay` container instead, and should hide the `battle-stage` / show `npc-display` as appropriate.

### scene.js: damage number routing

`showDamageNumber()` currently appends to `dom.enemySpriteContainer` and ignores the `isPlayer` flag. Update to:

- Accept a target formation-slot element (or side + index)
- Position the damage number relative to that specific slot's bounding rect
- Route player-side damage to `#player-formation .formation-slot`, enemy-side to `#enemy-formation .formation-slot`
- The `isPlayer` parameter from `combat-loop.js` callback is already passed — stop discarding it in `game.js`

### creature-row.js: delegate to scene.js

The `render()` function stops building creature-row DOM. Instead it calls `showFormation('player', creatures)` from scene.js.

The creature popup system rewires to attach to `.formation-slot` elements. Popup positioning: anchor relative to the tapped formation-slot's bounding rect within the scene-area, positioning the popup below or beside the slot (instead of the old "above creature-row" approach).

Existing callbacks (swap creature, rearrange) wire to formation slots via data attributes.

**Shared exports:** `ELEMENT_COLORS` and `ELEMENT_ICONS` are imported by `target-select.js` and `game.js`. These must be preserved as exports from `creature-row.js` (or moved to a shared constants module).

### combat-loop.js: systematic selector updates

NOT minimal — 6 hardcoded `#creature-row .creature-slot` selectors must be updated:

- Line ~939: creature slot lookup → `#player-formation .formation-slot`
- Line ~985: HP bar animation → `.formation-hp-fill` inside formation slot
- Line ~1049: XP popup positioning → formation slot bounding rect
- Line ~1485: KO swap effect → formation slot element
- Line ~1500: KO swap effect → formation slot element
- Line ~1805: MP bar update → formation slot (MP bar no longer in formation view — may need rethink, or update via popup data only)

### combat-effects.js: update animation targets

- `playerHitEffect()`: currently takes `creatureRowEl` and animates `.creature-slot` children. Update to target `.formation-slot` elements inside `#player-formation`. (Note: currently has 0 callers — consider removing or wiring up.)
- `fireCreatureAttackEffect()` and `enemyCreatureAttackEffect()`: query `.creature-icon` inside slot elements for pop/flash animations. Update to query `.formation-sprite` instead. These are core combat animations and will silently break if not updated.

### game.js: remove creature-row manipulation

`updateCreatureRow()` at lines ~351, ~363 directly sets `dom.creatureRow.innerHTML = ''`. Replace with calls to `hideFormation('player')` or equivalent.

### dom.js: update references

- Remove `creatureRow`, `enemySpriteContainer` references
- Add `battleStage`, `playerFormation`, `enemyFormation`, `npcDisplay` references

### Animations

Existing keyframes reuse with new class names:

- `.formation-slot.creature-dying` → creature-death animation
- `.formation-slot.creature-swapping-in` → creature-swap-in animation
- `.formation-slot.charged` → gold glow for ultimate ready
- `.formation-slot .formation-sprite.ko` → grayscale + low opacity
- `.enemy-formation .formation-slot.defeated` → fade-out + shrink

## Non-Combat Display

During exploration (not in combat), the player's party renders in the player-formation on the left side using the same diagonal layout. The enemy-formation is empty/hidden.

NPCs render in the `npc-display` container, centered in the scene-area as they do today. The `battle-stage` may coexist (player creatures visible on the left while NPC is centered) or hide based on context.

## What stays the same

- Narration box, area header pill, scene toast — unchanged overlays
- Action area — unchanged, gains vertical space from removing creature-row
- Target selection UI — unchanged (renders in action area)
- Mini toolbar — unchanged
- Scene-area height — stays 32vh (may be tunable later)
- Enemy-info pill — stays as-is for non-creature enemy display

## Risks

- **Creature popup positioning** needs rework since it currently anchors relative to the creature-row at viewport bottom. New anchoring is relative to formation slots inside the scene-area.
- **MP bar display** — currently shown in creature-row slots, but formation view omits it for compactness. MP info may need to surface elsewhere (popup only, or a small indicator on formation slots).
- **Single non-creature enemies** (e.g., NPC boss fights) use the enemy-info pill + big sprite in `npc-display`. This path stays separate from the formation system.
- **Mockup HTML files** (`mockup-combat-area-header.html`, `mockup-vocab-cards.html`) reference `.creature-row` and will become stale — cleanup needed.
