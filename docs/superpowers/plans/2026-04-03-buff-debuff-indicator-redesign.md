# Buff/Debuff Indicator Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant DOM status pills and reposition Pixi canvas pills to stack vertically beside creature sprites (left for player, right for enemy).

**Architecture:** The combat UI has two parallel status indicator systems: DOM pills (`.status-icons`) and Pixi pills (`syncPixiStatusLabels`). We remove the DOM system entirely and reposition the Pixi pills from horizontal-above to vertical-beside. No new files needed — just modifications to 5 existing files.

**Tech Stack:** PixiJS 8, vanilla JS (ES modules), CSS

**Spec:** `docs/superpowers/specs/2026-04-03-buff-debuff-indicator-redesign.md`

---

### Task 1: Reposition Pixi pills to stack vertically beside sprites

**Files:**
- Modify: `public/js/pixi/formation.js:17-21` (constants)
- Modify: `public/js/pixi/formation.js:67-120` (`syncPixiStatusLabels`)
- Modify: `public/js/pixi/formation.js:566-580` (`resizeFormations` label block)

- [ ] **Step 1: Update constants in formation.js**

Replace the horizontal positioning constants (lines 17-21) with vertical-beside constants:

```js
const LABEL_FONT_SIZE = 9;
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 2;
const LABEL_GAP = 3;
const LABEL_SIDE_OFFSET = 50;
```

Remove `LABEL_OFFSET_Y` (no longer used). Add `LABEL_SIDE_OFFSET` — the horizontal distance from `sprite.baseX` to place pills. 50px ≈ half of 60px sprite + 20px gap.

- [ ] **Step 2: Rewrite the positioning block in syncPixiStatusLabels**

Replace lines 108-117 (the "Position pills centered horizontally above sprite" block) with vertical-beside logic:

```js
  // Position pills stacked vertically beside the sprite
  const pillHeight = pills[0].height;
  const totalHeight = pills.length * pillHeight + LABEL_GAP * (pills.length - 1);
  const startY = sprite.baseY - totalHeight / 2;
  const xOffset = side === 'player' ? -LABEL_SIDE_OFFSET : LABEL_SIDE_OFFSET;

  for (let i = 0; i < pills.length; i++) {
    pills[i].x = sprite.baseX + xOffset;
    pills[i].y = startY + i * (pillHeight + LABEL_GAP);
  }
```

Note: `syncPixiStatusLabels` already receives `side` as its first parameter but doesn't currently use it for positioning. Now it does.

- [ ] **Step 3: Rewrite the resize label repositioning block in resizeFormations**

Replace lines 566-580 with the same vertical-beside logic:

```js
  // Reposition status labels to match new sprite base positions
  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (!sprite.statusLabels?.length) continue;
      const pills = sprite.statusLabels;
      const pillHeight = pills[0].height;
      const totalHeight = pills.length * pillHeight + LABEL_GAP * (pills.length - 1);
      const startY = sprite.baseY - totalHeight / 2;
      const xOffset = side === 'player' ? -LABEL_SIDE_OFFSET : LABEL_SIDE_OFFSET;

      for (let i = 0; i < pills.length; i++) {
        pills[i].x = sprite.baseX + xOffset;
        pills[i].y = startY + i * (pillHeight + LABEL_GAP);
      }
    }
  }
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/pixi/formation.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "Reposition Pixi status pills to stack vertically beside sprites"
```

---

### Task 2: Remove DOM pill calls from combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js:51` (import line)
- Modify: `public/js/ui/combat-loop.js:1130` (`clearAllStatusIcons` call)
- Modify: `public/js/ui/combat-loop.js:1606-1624` (`syncStatusIconsFromResult`)
- Modify: `public/js/ui/combat-loop.js:3239` (`clearAllStatusIcons` call)

- [ ] **Step 1: Remove updateStatusIcons and clearAllStatusIcons from import**

Change line 51 from:
```js
import { updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```
to: delete the entire line.

- [ ] **Step 2: Remove clearAllStatusIcons() call at line 1130**

Change:
```js
  clearAllStatusIcons();
  clearAllPixiStatusLabels();
```
to:
```js
  clearAllPixiStatusLabels();
```

- [ ] **Step 3: Remove updateStatusIcons calls from syncStatusIconsFromResult**

Change the function body (lines 1606-1624) from:
```js
function syncStatusIconsFromResult(result) {
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const keys = getCreatureStatusKeys(ally);
      const slotEl = document.querySelector(`#player-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, keys);
      syncPixiStatusLabels('player', i, keys, ally.statStages);
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const keys = getCreatureStatusKeys(enemy);
      const slotEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, keys);
      syncPixiStatusLabels('enemy', i, keys, enemy.statStages);
    });
  }
}
```
to:
```js
function syncStatusIconsFromResult(result) {
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const keys = getCreatureStatusKeys(ally);
      syncPixiStatusLabels('player', i, keys, ally.statStages);
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const keys = getCreatureStatusKeys(enemy);
      syncPixiStatusLabels('enemy', i, keys, enemy.statStages);
    });
  }
}
```

- [ ] **Step 4: Remove clearAllStatusIcons() call at line 3239**

Change:
```js
  clearAllStatusVfx();
  clearAllStatusIcons();
  clearAllPixiStatusLabels();
```
to:
```js
  clearAllStatusVfx();
  clearAllPixiStatusLabels();
```

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "Remove DOM status pill calls from combat loop"
```

---

### Task 3: Remove DOM pill container from scene.js

**Files:**
- Modify: `public/js/ui/scene.js:214-217`

- [ ] **Step 1: Remove the .status-icons container creation**

Delete these lines (214-217):
```js
    // Status icons container (populated by updateStatusIcons from event-popup.js)
    const statusIcons = document.createElement('div');
    statusIcons.className = 'status-icons';
    slotEl.appendChild(statusIcons);
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "Remove .status-icons container from formation slot rendering"
```

---

### Task 4: Remove DOM pill functions from event-popup.js and clean up CSS

**Files:**
- Modify: `public/js/ui/event-popup.js:1-12` (header comment)
- Modify: `public/js/ui/event-popup.js:165-220` (remove `updateStatusIcons` + `clearAllStatusIcons`)
- Modify: `public/game.css:4927-4964` (remove status icon CSS)

- [ ] **Step 1: Update the header comment**

Change lines 8-12 from:
```js
 * KEY EXPORTS:
 * - showEventPopup(targetEl, text, options): Floating text popup anchored to an element
 * - updateStatusIcons(slotEl, activeEffects): Render/remove status pill badges
 * - clearAllStatusIcons(): Remove all status icons from the DOM
 * - animateCounter(el, fromValue, toValue, duration, options): Animated number counter
```
to:
```js
 * KEY EXPORTS:
 * - showEventPopup(targetEl, text, options): Floating text popup anchored to an element
 * - animateCounter(el, fromValue, toValue, duration, options): Animated number counter
```

- [ ] **Step 2: Remove updateStatusIcons and clearAllStatusIcons functions**

Keep lines 146-163 (`STATUS_ICON_CONFIG` — still imported by `formation.js`). Delete lines 165-220: the JSDoc comment, `updateStatusIcons` function, and `clearAllStatusIcons` function. This is everything from the blank line after `};` on line 163 through the `}` closing `clearAllStatusIcons` on line 220.

- [ ] **Step 3: Remove DOM status icon CSS from game.css**

Delete lines 4927-4964 (the entire STATUS ICONS CSS block):
```css
/* ============================================================
   STATUS ICONS — Persistent pill badges on formation slots
   ============================================================ */

@keyframes statusIconPop {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1);   opacity: 1; }
}

@keyframes statusIconFade {
  0%   { transform: scale(1);   opacity: 1; }
  100% { transform: scale(0.5); opacity: 0; }
}

.status-icons {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  min-height: 0;
  margin-top: 2px;
}

.status-icon {
  font-size: 9px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 6px;
  white-space: nowrap;
}

.status-icon-enter {
  animation: statusIconPop 200ms ease-out forwards;
}

.status-icon-exit {
  animation: statusIconFade 200ms ease-in forwards;
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/event-popup.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/event-popup.js public/game.css
git commit -m "Remove DOM status pill functions and CSS"
```

---

### Task 5: Update tests

**Files:**
- Modify: `tests/unit/ui/event-popup.test.js:95-96` (remove imports)
- Modify: `tests/unit/ui/event-popup.test.js:206-269` (remove test block)

- [ ] **Step 1: Remove updateStatusIcons and clearAllStatusIcons from test imports**

Change lines 92-97 from:
```js
const {
  showEventPopup,
  credits,
  updateStatusIcons,
  clearAllStatusIcons,
  animateCounter
```
to:
```js
const {
  showEventPopup,
  credits,
  animateCounter
```

- [ ] **Step 2: Remove the entire updateStatusIcons describe block**

Delete lines 206-269 (the `describe('updateStatusIcons', ...)` block and its closing `});`).

- [ ] **Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/ui/event-popup.test.js
git commit -m "Remove updateStatusIcons tests"
```

---

### Task 6: Manual visual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Play through to combat**

Navigate to the game, start a run, enter combat. Trigger buffs/debuffs (use moves that apply ATK up, DEF down, poison, etc.).

- [ ] **Step 3: Verify pill positioning**

Confirm:
- Player creature pills appear to the LEFT of the sprite
- Enemy creature pills appear to the RIGHT of the sprite
- Multiple pills stack vertically without overlap
- Creature sprites have not moved
- No DOM pills visible (the old "ATK↑" badges are gone)

- [ ] **Step 4: Verify resize behavior**

Resize the browser window. Confirm pills reposition correctly and stay beside their sprites.

- [ ] **Step 5: Verify combat end cleanup**

Win or lose the combat. Confirm all pills are cleared.

- [ ] **Step 6: Tune LABEL_SIDE_OFFSET if needed**

If pills overlap the sprite or are too far away, adjust `LABEL_SIDE_OFFSET` in `formation.js`. Start at 50, try 40-60 range. Boss sprites are 120px wide (offset may need to be larger — consider making it `spriteSize / 2 + 20` if bosses look wrong).
