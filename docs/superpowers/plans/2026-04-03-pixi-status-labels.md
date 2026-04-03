# PixiJS Status Labels Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore buff/debuff counters and active effect badges as PixiJS-native pill labels above creature sprites during combat.

**Architecture:** Add a `layers.labels` container to the battle stage. A new `syncPixiStatusLabels()` function in `formation.js` creates/destroys pill badges (Graphics background + Text) positioned at each sprite's base coordinates. `combat-loop.js` calls this alongside the existing DOM badge sync after every attack resolves.

**Tech Stack:** PixiJS v8 (Text, Graphics, Container), existing battle-stage layer system.

**Spec:** `docs/superpowers/specs/2026-04-03-pixi-status-labels-design.md`

---

## Chunk 1: Implementation

### Task 1: Add `layers.labels` container to battle-stage.js

**Files:**
- Modify: `public/js/pixi/battle-stage.js:62-71`

- [ ] **Step 1: Add the labels layer between effects and overlay**

In `initBattleStage()`, after the layer creation block, insert `labels` between `effects` and `overlay`:

```js
// Current (lines 62-71):
layers = {
  background: new Container(),
  creatures: new Container(),
  effects: new Container(),
  overlay: new Container(),
};
app.stage.addChild(layers.background);
app.stage.addChild(layers.creatures);
app.stage.addChild(layers.effects);
app.stage.addChild(layers.overlay);

// Change to:
layers = {
  background: new Container(),
  creatures: new Container(),
  effects: new Container(),
  labels: new Container(),
  overlay: new Container(),
};
app.stage.addChild(layers.background);
app.stage.addChild(layers.creatures);
app.stage.addChild(layers.effects);
app.stage.addChild(layers.labels);
app.stage.addChild(layers.overlay);
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/pixi/battle-stage.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/battle-stage.js
git commit -m "feat: add labels layer to PixiJS battle stage"
```

---

### Task 2: Export STATUS_ICON_CONFIG from event-popup.js

**Files:**
- Modify: `public/js/ui/event-popup.js:148`

- [ ] **Step 1: Add export keyword to STATUS_ICON_CONFIG**

Change line 148 from:
```js
const STATUS_ICON_CONFIG = {
```
to:
```js
export const STATUS_ICON_CONFIG = {
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/event-popup.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/event-popup.js
git commit -m "refactor: export STATUS_ICON_CONFIG for PixiJS label reuse"
```

---

### Task 3: Implement syncPixiStatusLabels in formation.js

**Files:**
- Modify: `public/js/pixi/formation.js`

This is the core task. Add a function that creates pill-shaped labels above creature sprites.

- [ ] **Step 1: Add imports and constants**

At the top of `formation.js`, add `Text` to the existing pixi.js import (it's not currently imported), and add the STATUS_ICON_CONFIG import:

```js
// Line 8 — add Text to existing import:
import { Sprite, Assets, Container, Texture, Graphics, Text } from 'pixi.js';

// After line 10 (after tween import), add:
import { STATUS_ICON_CONFIG } from '../ui/event-popup.js';
```

Add constants after the existing ENEMY_STAGGER_X (after line 14):

```js
const LABEL_FONT_SIZE = 9;
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 2;
const LABEL_GAP = 3;        // horizontal gap between pills
const LABEL_OFFSET_Y = -38; // above sprite center

const STAT_STAGE_NAMES = { atk: 'ATK', def: 'DEF' };
```

- [ ] **Step 2: Add the createPill helper function**

Add before the `sameFormation` function (before line 31). This creates a single pill Container (rounded-rect Graphics + Text child):

```js
/**
 * Create a single status pill (colored rounded-rect + text label).
 * @param {string} label - Display text (e.g. 'ATK +2', 'SHD')
 * @param {string} bg - Background hex color string (e.g. '#FF8F00')
 * @param {string} textColor - Text hex color string (e.g. '#fff')
 * @returns {Container}
 */
function createPill(label, bg, textColor) {
  const container = new Container();

  const text = new Text({
    text: label,
    style: {
      fontFamily: 'monospace',
      fontSize: LABEL_FONT_SIZE,
      fill: textColor,
      fontWeight: 'bold',
    },
  });
  text.anchor.set(0.5);

  const w = text.width + LABEL_PADDING_X * 2;
  const h = text.height + LABEL_PADDING_Y * 2;

  const bg_gfx = new Graphics();
  bg_gfx.roundRect(-w / 2, -h / 2, w, h, 4);
  bg_gfx.fill(bg);

  container.addChild(bg_gfx);
  container.addChild(text);

  return container;
}
```

- [ ] **Step 3: Add the syncPixiStatusLabels function**

Add after `createPill`. This is the main export that combat-loop.js will call:

```js
/**
 * Create/update PixiJS status pill labels above a creature sprite.
 * Labels are positioned at the sprite's base position (not animated position).
 *
 * @param {'player'|'enemy'} side
 * @param {number} index - creature index in the formation
 * @param {string[]} keys - status keys from getCreatureStatusKeys() (e.g. ['atk_up', 'shield'])
 * @param {Object} [statStages] - raw statStages object (e.g. { atk: 2, def: -1 })
 */
export function syncPixiStatusLabels(side, index, keys, statStages) {
  const { layers } = getStage();
  if (!layers.labels) return;

  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  // Clear existing labels for this sprite
  if (sprite.statusLabels) {
    for (const pill of sprite.statusLabels) {
      pill.destroy({ children: true });
    }
  }
  sprite.statusLabels = [];

  if (!keys || keys.length === 0) return;

  // Build pills from keys
  const pills = [];
  for (const key of keys) {
    const config = STATUS_ICON_CONFIG[key];
    if (!config) continue;

    // For stat stage keys, show counter value; for effects, show static label
    let label;
    if (key === 'atk_up' || key === 'atk_down') {
      const val = statStages?.atk || 0;
      label = `${STAT_STAGE_NAMES.atk} ${val > 0 ? '+' : ''}${val}`;
    } else if (key === 'def_up' || key === 'def_down') {
      const val = statStages?.def || 0;
      label = `${STAT_STAGE_NAMES.def} ${val > 0 ? '+' : ''}${val}`;
    } else {
      label = config.label;
    }

    const pill = createPill(label, config.bg, config.text);
    pills.push(pill);
    layers.labels.addChild(pill);
  }

  if (pills.length === 0) return;

  // Position pills centered horizontally above sprite base position
  const totalWidth = pills.reduce((sum, p) => sum + p.width, 0) + LABEL_GAP * (pills.length - 1);
  let x = sprite.baseX - totalWidth / 2;
  const y = sprite.baseY + LABEL_OFFSET_Y;

  for (const pill of pills) {
    pill.x = x + pill.width / 2;
    pill.y = y;
    x += pill.width + LABEL_GAP;
  }

  sprite.statusLabels = pills;
}
```

- [ ] **Step 4: Add clearAllPixiStatusLabels function**

Add right after `syncPixiStatusLabels`:

```js
/**
 * Remove all PixiJS status labels from both sides.
 * Called on combat end alongside clearAllStatusIcons().
 */
export function clearAllPixiStatusLabels() {
  const { layers } = getStage();
  if (layers.labels) {
    layers.labels.removeChildren();
  }
  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      sprite.statusLabels = [];
    }
  }
}
```

- [ ] **Step 5: Add label cleanup to hideFormation**

In the existing `hideFormation` function (line 212-217), add label cleanup. Change:

```js
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
  lastFormationInput[side] = null;
}
```

to:

```js
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  // Clean up status labels for this side
  const { layers } = getStage();
  for (const sprite of creatureSprites[side]) {
    if (sprite.statusLabels) {
      for (const pill of sprite.statusLabels) {
        pill.destroy({ children: true });
      }
    }
  }
  creatureSprites[side].length = 0;
  lastFormationInput[side] = null;
}
```

- [ ] **Step 6: Add label repositioning to resizeFormations**

At the end of the `resizeFormations` function (after the existing sprite repositioning loop at line ~442), add:

```js
  // Reposition status labels to match new sprite base positions
  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (!sprite.statusLabels?.length) continue;
      const pills = sprite.statusLabels;
      const totalWidth = pills.reduce((sum, p) => sum + p.width, 0) + LABEL_GAP * (pills.length - 1);
      let x = sprite.baseX - totalWidth / 2;
      const y = sprite.baseY + LABEL_OFFSET_Y;
      for (const pill of pills) {
        pill.x = x + pill.width / 2;
        pill.y = y;
        x += pill.width + LABEL_GAP;
      }
    }
  }
```

- [ ] **Step 7: Syntax check**

Run: `node --check public/js/pixi/formation.js && echo "OK"`
Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add PixiJS status pill labels above creature sprites"
```

---

### Task 4: Wire syncPixiStatusLabels into combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js:46,1600-1615`

- [ ] **Step 1: Add import**

At line 46 (the existing formation.js import), add `syncPixiStatusLabels` and `clearAllPixiStatusLabels`:

```js
// Current line 46:
import { getCreatureSprite, showActiveGlow, clearActiveGlow, hideFormation as pixiHideFormation, animateKO, animateLevelUp } from '../pixi/formation.js';

// Change to:
import { getCreatureSprite, showActiveGlow, clearActiveGlow, hideFormation as pixiHideFormation, animateKO, animateLevelUp, syncPixiStatusLabels, clearAllPixiStatusLabels } from '../pixi/formation.js';
```

- [ ] **Step 2: Add PixiJS sync calls to syncStatusIconsFromResult**

In the `syncStatusIconsFromResult` function (lines 1600-1615), add `syncPixiStatusLabels` calls after each `updateStatusIcons` call:

```js
function syncStatusIconsFromResult(result) {
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const slotEl = document.querySelector(`#player-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, getCreatureStatusKeys(ally));
      syncPixiStatusLabels('player', i, getCreatureStatusKeys(ally), ally.statStages);
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const slotEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, getCreatureStatusKeys(enemy));
      syncPixiStatusLabels('enemy', i, getCreatureStatusKeys(enemy), enemy.statStages);
    });
  }
}
```

- [ ] **Step 3: Add clearAllPixiStatusLabels to combat cleanup**

There are two call sites for `clearAllStatusIcons()` — add `clearAllPixiStatusLabels()` on the line after each:

1. **Line 1125** (in `cleanupCombat` function):
```js
  clearAllStatusIcons();
  clearAllPixiStatusLabels();
```

2. **Line 3290** (in `stopCombatLoop` function):
```js
  clearAllStatusIcons();
  clearAllPixiStatusLabels();
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire PixiJS status labels into combat sync loop"
```

---

### Task 5: Run tests and verify

- [ ] **Step 1: Run unit + integration tests**

Run: `npm test`
Expected: All existing tests pass. No new tests needed — the pixi modules are browser-only (PixiJS requires DOM/WebGL) and follow the same untested pattern as the rest of `public/js/pixi/`.

- [ ] **Step 2: Syntax check all modified files**

```bash
node --check public/js/pixi/battle-stage.js && \
node --check public/js/ui/event-popup.js && \
node --check public/js/pixi/formation.js && \
node --check public/js/ui/combat-loop.js && \
echo "All OK"
```
Expected: `All OK`

- [ ] **Step 3: Visual verification**

Start the dev server and use Playwright to:
1. Navigate to the game, start combat
2. Use a move that applies a stat buff/debuff (or trigger one via the server)
3. Screenshot to confirm pill labels appear above the creature sprite
4. Verify labels clear after combat ends

- [ ] **Step 4: Final commit (if any adjustments needed)**

```bash
git add -A && git commit -m "fix: adjust status label positioning/styling"
```
