# PixiJS Combat Animations Merge — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the completed `feature/pixi-combat-animations` branch into `dev`, resolving all conflicts, port dev-only bug fixes, migrate NPC sprites to PixiJS canvas, and clean up dead DOM animation code.

**Architecture:** The animations branch has 1,671 lines of PixiJS combat code that was fully built and tested but never merged. Dev received critical bug fixes after the branches diverged. Strategy: merge → resolve conflicts favoring animations → port dev fixes on top → migrate NPC sprites to canvas → remove dead DOM animation code from room-transition.js.

**Tech Stack:** PixiJS v8 (ES modules), anime.js v4 (DOM-only effects), Node.js built-in test runner (node:test), c8 coverage.

**Spec:** `docs/superpowers/specs/2026-04-02-pixijs-combat-animations-merge-design.md`

**Worktrees:**
- Dev (target): `/root/Koto2` on branch `dev`
- Animations (source): `/root/koto-wt-pixi-animations` on branch `feature/pixi-combat-animations`

---

## File Map

### Conflicting files (7) — require manual resolution

| File | Strategy |
|------|----------|
| `public/js/pixi/effects.js` | Take animations (superset) |
| `public/js/pixi/tween.js` | Take animations (identical) |
| `public/js/pixi/text.js` | Take animations (uses Text instead of BitmapText — deliberate) |
| `public/js/pixi/battle-stage.js` | Take animations, then add try-catch + debug aids from dev |
| `public/js/pixi/parallax.js` | Take animations, then port tileScale fix + request ID tracking from dev |
| `public/js/pixi/formation.js` | Take animations, then port sameFormation cache + request ID tracking + entrance animation from dev |
| `public/game.js` | Take animations, then port `syncBattleStageParallax` system + PvP parallax callback from dev |

### Auto-merged files (no conflicts expected)

| File | Change |
|------|--------|
| `public/js/ui/combat-loop.js` | Animations version — fully rewired to pixi imports |
| `public/js/ui/dom-effects.js` | New file — extracted DOM effects for non-combat modules |
| `public/js/ui/exploration.js` | Import path change: `combat-effects.js` → `dom-effects.js` |
| `public/js/ui/economy.js` | Import path change: `combat-effects.js` → `dom-effects.js` |
| `public/game.css` | Dead CSS removal |
| `public/js/pixi/combat-effects-util.js` | New file — 5-tier config |
| `public/js/pixi/banners.js` | New file — effectiveness banners |
| `public/js/pixi/status-vfx.js` | New file — status effect visuals |
| `tests/unit/ui/combat-effects-util.test.js` | New test file |
| `public/assets/backgrounds/starter_meadow/*` | New background assets |
| `public/assets/backgrounds/hajimari-no-hiroba/*` | New background assets |

### Post-merge modifications (NPC migration + cleanup)

| File | Change |
|------|--------|
| `public/js/pixi/formation.js` | Add `showNpcSprite()` / `hideNpcSprite()` with slide tween |
| `public/js/ui/scene.js` | NPC functions call pixi instead of DOM `<img>.src` |
| `public/js/ui/room-transition.js` | Rewrite — pixi NPC slides, remove dead anime.js code |
| `public/js/ui/combat-effects.js` | Delete — fully replaced by pixi modules + dom-effects.js |

---

## Chunk 1: Merge and Resolve Conflicts

### Task 1: Start the merge and resolve all 7 conflicts

**Files:**
- All 7 conflicting files listed above

This task performs the git merge and resolves every conflict. For pixi module conflicts (6 of 7), take the animations branch version entirely. For `game.js`, take animations as the base since it has the pixi formation integration, but we'll port dev's parallax management in Task 5.

- [ ] **Step 1: Start the merge**

```bash
cd /root/Koto2
git merge feature/pixi-combat-animations
```

Expected: CONFLICT messages for 7 files. The merge will not auto-complete.

- [ ] **Step 2: Resolve pixi module conflicts — take animations version for all 6**

For these 6 files, the animations branch version is either a superset or equivalent. Take theirs wholesale:

```bash
git checkout --theirs \
  public/js/pixi/effects.js \
  public/js/pixi/tween.js \
  public/js/pixi/text.js \
  public/js/pixi/battle-stage.js \
  public/js/pixi/parallax.js \
  public/js/pixi/formation.js
git add \
  public/js/pixi/effects.js \
  public/js/pixi/tween.js \
  public/js/pixi/text.js \
  public/js/pixi/battle-stage.js \
  public/js/pixi/parallax.js \
  public/js/pixi/formation.js
```

- [ ] **Step 3: Resolve game.js conflict — take animations as base**

```bash
git checkout --theirs public/game.js
git add public/game.js
```

We take the animations version which has pixi formation integration (`pixiShowFormation`, `pixiHideFormation`), smart parallax detection in `updateScene()`, and `setScrollState('decelerating')` in `startEncounter()`. Dev's more comprehensive parallax management (`syncBattleStageParallax`, `syncParallaxScrollWithPhase`) will be ported back in Task 5.

- [ ] **Step 4: Stage all auto-merged files**

```bash
git add -A
```

This stages the non-conflicting files: `combat-loop.js`, `dom-effects.js`, `combat-effects-util.js`, `banners.js`, `status-vfx.js`, `exploration.js`, `economy.js`, `game.css`, test file, and background assets.

- [ ] **Step 5: Verify no unresolved conflict markers remain**

```bash
grep -r "<<<<<<" public/ tests/ || echo "No conflict markers found"
```

Expected: "No conflict markers found"

- [ ] **Step 6: Syntax check all JS files that changed**

```bash
for f in \
  public/js/pixi/effects.js \
  public/js/pixi/tween.js \
  public/js/pixi/text.js \
  public/js/pixi/battle-stage.js \
  public/js/pixi/parallax.js \
  public/js/pixi/formation.js \
  public/js/pixi/combat-effects-util.js \
  public/js/pixi/banners.js \
  public/js/pixi/status-vfx.js \
  public/js/ui/combat-loop.js \
  public/js/ui/dom-effects.js \
  public/js/ui/exploration.js \
  public/js/ui/economy.js \
  public/game.js; do
  node --check "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: All OK. If any fail, fix the syntax error before proceeding.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: All tests pass (12+ tests — the new `combat-effects-util.test.js` adds tests).

- [ ] **Step 8: Commit the merge**

```bash
git commit -m "Merge branch 'feature/pixi-combat-animations' into dev

Brings in the full PixiJS combat animation system:
- 5-tier impact scaling with element-specific particles
- Effectiveness banners, status VFX, active creature glow
- combat-loop.js rewired to pixi/ imports
- dom-effects.js extracted for non-combat modules

Dev-only bug fixes will be ported in subsequent commits."
```

---

## Chunk 2: Port Dev Bug Fixes to Parallax

### Task 2: Port tileScale viewport scaling fix to parallax.js

**Files:**
- Modify: `public/js/pixi/parallax.js`

After the merge, `parallax.js` is the animations branch version which is **missing the tileScale fix from dev commit 044d702**. Without this fix, parallax textures (2048×800px) render at 1:1 on mobile, showing only the top-left corner instead of scaling to fit the viewport.

- [ ] **Step 1: Add tileScale calculation in loadParallax()**

In `public/js/pixi/parallax.js`, find the TilingSprite creation block inside the `for` loop in `loadParallax()`. The current code (from animations) looks like:

```javascript
    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    ts.layerSpeed = LAYER_SPEEDS[i];
```

Add the scale calculation **between** the TilingSprite creation and the `layerSpeed` assignment:

```javascript
    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    const scale = h / texture.height;
    ts.tileScale.set(scale, scale);
    ts.layerSpeed = LAYER_SPEEDS[i];
```

**Why:** The canvas height (e.g., 200px on mobile) is much smaller than the texture height (800px). Without scaling, only the top 200/800 = 25% of the texture is visible. `tileScale.set(scale, scale)` shrinks the tile to fit the viewport height.

- [ ] **Step 2: Add scale recalculation in resizeParallax()**

The current `resizeParallax` (from animations) looks like:

```javascript
export function resizeParallax(width, height) {
  for (const ts of tilingSprites) {
    ts.width = width;
    ts.height = height;
  }
}
```

Add scale recalculation:

```javascript
export function resizeParallax(width, height) {
  for (const ts of tilingSprites) {
    ts.width = width;
    ts.height = height;
    const scale = height / ts.texture.height;
    ts.tileScale.set(scale, scale);
  }
}
```

**Why:** When the canvas resizes (iOS address bar show/hide, orientation change), the scale ratio changes. Without recalculating, the parallax either clips or has gaps.

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/pixi/parallax.js && echo "OK"
```

Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/parallax.js
git commit -m "fix: port tileScale viewport scaling to animations-branch parallax

Without this, 2048x800 textures render at 1:1 on mobile, showing
only the top-left corner. Scales tiles to fit canvas height and
recalculates on resize. (Ported from dev commit 044d702)"
```

### Task 3: Port request ID tracking to parallax.js

**Files:**
- Modify: `public/js/pixi/parallax.js`

The animations branch parallax has no protection against stale async loads. If `loadParallax('area_a')` starts loading, then `loadParallax('area_b')` is called before `area_a` finishes, the `area_a` textures could overwrite `area_b` when they finally resolve. The request ID pattern prevents this.

- [ ] **Step 1: Add loadRequestId variable**

After the existing `DECEL_RATE` constant declaration, add:

```javascript
let loadRequestId = 0;
```

- [ ] **Step 2: Add request ID increment at start of loadParallax()**

At the top of `loadParallax()`, after the early-return guard (`if (!app) return;`), add:

```javascript
  const requestId = ++loadRequestId;
```

- [ ] **Step 3: Add null/empty areaId guard and DOM background toggle**

The animations branch has no guard for null areaId. Dev's `syncBattleStageParallax` passes `null` when in hub/lobby states. Without this guard, `loadParallax(null)` will try to load `/assets/backgrounds/null/sky.webp`.

After the existing early-return guard (`if (!app) return;`) and after the `const requestId = ++loadRequestId;` line (from Step 1), add:

```javascript
  // Clear existing layers
  tilingSprites.forEach(ts => ts.destroy());
  tilingSprites = [];
  layers.background.removeChildren();

  // Toggle DOM static background: hide when parallax active, show when cleared.
  const domBg = document.querySelector('.scene-background');
  if (domBg) domBg.style.display = (areaId == null || areaId === '') ? '' : 'none';

  if (areaId == null || areaId === '') {
    return;
  }
```

**Important:** This replaces the existing "Clear existing layers" block in the animations version. Make sure the old clear block is replaced, not duplicated.

- [ ] **Step 4: Add staleness guard after each texture load**

Inside the `for` loop, after the `await Assets.load(path)` try-catch block and before the TilingSprite creation, add:

```javascript
    if (requestId !== loadRequestId) {
      // A newer loadParallax call superseded this one — bail out.
      return;
    }
```

The full loop body should now look like:

```javascript
    let texture;
    try {
      texture = await Assets.load(path);
    } catch (e) {
      console.warn(`[parallax] FAILED to load ${path}:`, e);
      continue;
    }

    if (requestId !== loadRequestId) {
      return;
    }

    const ts = new TilingSprite({
```

- [ ] **Step 5: Remove setWalking coupling from setScrollState**

The animations branch `parallax.js` imports `setWalking` from `formation.js` and calls it inside `setScrollState()`. This creates duplicate calls because dev's `syncParallaxScrollWithPhase` in game.js (ported in Task 6) also calls `setWalking` explicitly. Remove the coupling so game.js is the sole owner of walking state.

Remove the import line:

```javascript
import { setWalking } from './formation.js';
```

And remove line 74 from `setScrollState`:

```javascript
  // Toggle creature walking animation with scroll   ← DELETE THIS LINE
  setWalking(state === 'scrolling' || state === 'accelerating');  ← DELETE THIS LINE
```

So `setScrollState` becomes just:

```javascript
export function setScrollState(state) {
  scrollState = state;
  if (state === 'stopped') currentSpeed = 0;
  if (state === 'scrolling') currentSpeed = 1;
}
```

Also add `isParallaxMoving` export (present in dev, missing in animations):

```javascript
/**
 * True while parallax offset is changing (scrolling, accelerating, or decelerating).
 */
export function isParallaxMoving() {
  return currentSpeed > 0;
}
```

- [ ] **Step 6: Syntax check**

```bash
node --check public/js/pixi/parallax.js && echo "OK"
```

Expected: OK

- [ ] **Step 7: Commit**

```bash
git add public/js/pixi/parallax.js
git commit -m "fix: port viewport scaling, request ID tracking, null guard, and decouple setWalking

- tileScale viewport scaling prevents 1:1 rendering on mobile
- Request ID tracking prevents stale async loads
- Null/empty areaId guard prevents 404s when in hub/lobby
- DOM background toggle restores .scene-background when parallax cleared
- Removed setWalking coupling from setScrollState (game.js owns walking state)"
```

---

## Chunk 3: Port Dev Bug Fixes to Formation

### Task 4: Port sameFormation cache, request ID tracking, and entrance animation to formation.js

**Files:**
- Modify: `public/js/pixi/formation.js`

The animations branch formation.js is missing three things from dev:
1. **`sameFormation()` cache** — prevents redundant re-renders when called with identical data
2. **Request ID tracking** — prevents stale async sprite loads from overwriting current formation
3. **Enemy entrance animation** — enemies enter from offscreen right instead of appearing instantly

- [ ] **Step 1: Add loadRequestId variable**

After the existing `let activeGlowTickFn = null;` line, add:

```javascript
/** Per-side request counter to invalidate stale async loads. */
let loadRequestId = { player: 0, enemy: 0 };
```

- [ ] **Step 2: Add sameFormation() function**

After the `loadRequestId` declaration (and before `initFormations()`), add:

```javascript
function sameFormation(prev, creatures, isBoss) {
  if (!prev || !Array.isArray(prev.creatures)) return false;
  if (!!prev.opts?.isBoss !== !!isBoss) return false;
  if (prev.creatures.length !== creatures.length) return false;
  for (let i = 0; i < creatures.length; i++) {
    const a = prev.creatures[i];
    const b = creatures[i];
    if ((a?.id || '') !== (b?.id || '')) return false;
    const aHp = a?.currentHp ?? a?.hp ?? null;
    const bHp = b?.currentHp ?? b?.hp ?? null;
    if (aHp !== bHp) return false;
  }
  return true;
}
```

**Why:** `showFormation()` is called on every `updateUI()` cycle. Without this check, it destroys and recreates all sprites every frame — wasteful and causes visual flicker.

- [ ] **Step 3: Update showFormation() signature to accept skipEnter**

Change the function signature from:

```javascript
export async function showFormation(side, creatures, { isBoss = false } = {}) {
```

To:

```javascript
export async function showFormation(side, creatures, { isBoss = false, skipEnter = false } = {}) {
```

- [ ] **Step 4: Add sameFormation early-return and request ID increment**

Replace the first few lines inside `showFormation()`:

**Current (animations):**
```javascript
  const { app } = getStage();
  if (!app) return;

  const container = side === 'player' ? playerContainer : enemyContainer;
  const sprites = creatureSprites[side];
  lastFormationInput[side] = {
    creatures: creatures ? [...creatures] : [],
    opts: { isBoss },
  };
```

**Replace with:**
```javascript
  const { app } = getStage();
  if (!app) return;

  const container = side === 'player' ? playerContainer : enemyContainer;
  if (!container) return;
  const normalizedCreatures = Array.isArray(creatures) ? [...creatures] : [];

  // Skip re-render if formation data hasn't changed
  if (
    sameFormation(lastFormationInput[side], normalizedCreatures, isBoss) &&
    creatureSprites[side].length > 0
  ) {
    return;
  }

  const requestId = ++loadRequestId[side];

  lastFormationInput[side] = {
    creatures: normalizedCreatures,
    opts: { isBoss, skipEnter },
  };

  const sprites = creatureSprites[side];
```

- [ ] **Step 5: Add request ID staleness guard after sprite load**

Inside the `for` loop, after the `await Assets.load(spritePath)` try-catch block and before `const sprite = new Sprite(texture);`, add:

```javascript
    // A newer showFormation call for this side superseded us — bail out.
    if (requestId !== loadRequestId[side]) return;
```

- [ ] **Step 6: Add enemy entrance animation**

Replace the current sprite positioning block:

```javascript
    // Position: staggered diagonally
    const rowY = (screenH * 0.3) + (i * screenH * 0.2);
    sprite.x = baseX + staggerX[i];
    sprite.y = rowY;
```

With entrance-aware positioning:

```javascript
    // Position: staggered diagonally
    const rowY = (screenH * 0.3) + (i * screenH * 0.2);
    const targetX = baseX + staggerX[i];
    sprite.y = rowY;

    // Enemy: enter from offscreen right (resize replays use skipEnter to snap)
    if (side === 'enemy' && !skipEnter) {
      sprite._enterTarget = targetX;
      sprite._entering = true;
      sprite.x = screenW + spriteSize * 2;
      sprite.baseX = targetX;
    } else {
      sprite.x = targetX;
      sprite.baseX = targetX;
      sprite._entering = false;
    }
```

- [ ] **Step 7: Update hideFormation to clear lastFormationInput**

The animations version doesn't clear `lastFormationInput` on hide, which means `sameFormation()` could incorrectly match after a hide+show cycle. Replace:

```javascript
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
}
```

With:

```javascript
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
  lastFormationInput[side] = null;
}
```

- [ ] **Step 8: Update resizeFormations to pass skipEnter**

Replace:

```javascript
export async function resizeFormations(width, height) {
  if (lastFormationInput.player) {
    await showFormation('player', lastFormationInput.player.creatures, lastFormationInput.player.opts);
  }
  if (lastFormationInput.enemy) {
    await showFormation('enemy', lastFormationInput.enemy.creatures, lastFormationInput.enemy.opts);
  }
}
```

With:

```javascript
export async function resizeFormations(width, height) {
  if (lastFormationInput.player) {
    await showFormation(
      'player',
      lastFormationInput.player.creatures,
      { ...lastFormationInput.player.opts, skipEnter: true },
    );
  }
  if (lastFormationInput.enemy) {
    await showFormation(
      'enemy',
      lastFormationInput.enemy.creatures,
      { ...lastFormationInput.enemy.opts, skipEnter: true },
    );
  }
}
```

**Why:** On resize, sprites should snap to their new positions, not replay the entrance animation.

- [ ] **Step 9: Syntax check**

```bash
node --check public/js/pixi/formation.js && echo "OK"
```

Expected: OK

- [ ] **Step 10: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "fix: port sameFormation cache, request ID tracking, and entrance animation

- sameFormation() prevents redundant re-renders on every updateUI cycle
- Request ID tracking prevents stale async sprite loads from overwriting
- Enemy sprites enter from offscreen right instead of appearing instantly
- hideFormation clears cache to prevent stale matches
- resizeFormations passes skipEnter to prevent re-entry on resize"
```

---

## Chunk 4: Port Dev Bug Fixes to Battle Stage

### Task 5: Port try-catch error handling and debug aids to battle-stage.js

**Files:**
- Modify: `public/js/pixi/battle-stage.js`

The animations branch battle-stage.js has no error handling around init. If PixiJS fails to initialize (WebGL unavailable, mobile browser restriction), the error propagates and breaks the entire app. Dev wraps it in try-catch with a graceful fallback.

- [ ] **Step 1: Add debug console access**

After the existing `let layers = {};` line, add:

```javascript

// Debug: expose to console for live inspection
if (typeof window !== 'undefined') {
  window.__pixiStage = () => ({ app, layers });
}
```

- [ ] **Step 2: Add resizeObserver variable for proper cleanup**

Replace `let layers = {};` with:

```javascript
let layers = {};
let resizeObserver = null;
```

- [ ] **Step 3: Add logging and try-catch to initBattleStage()**

Replace the entire `initBattleStage` function body. The current animations version starts with:

```javascript
export async function initBattleStage() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea || app) return;

  app = new Application();
```

Replace the early-return and wrap the body:

```javascript
export async function initBattleStage() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea || app) {
    console.warn('[BattleStage] init skipped:', { sceneArea: !!sceneArea, appExists: !!app });
    return;
  }

  try {
  app = new Application();
```

And at the end of the function, before the closing `}`, add the try-catch close:

After the ticker setup (last line before the function closes), add:

```javascript

  console.log('[BattleStage] Init complete');
  } catch (err) {
    console.error('[BattleStage] Init FAILED:', err);
    app = null;
  }
}
```

- [ ] **Step 4: Store ResizeObserver reference and add canvas log**

Find the canvas insertion line:
```javascript
  sceneArea.insertBefore(app.canvas, sceneArea.firstChild);
```

Add after it:
```javascript
  console.log('[BattleStage] Canvas inserted:', app.canvas.width, 'x', app.canvas.height);
```

Find the ResizeObserver creation:
```javascript
  const ro = new ResizeObserver(([entry]) => {
```

Replace `const ro` with `resizeObserver`:
```javascript
  resizeObserver = new ResizeObserver(([entry]) => {
```

And update the observe call from `ro.observe` to `resizeObserver.observe`.

- [ ] **Step 5: Update destroyBattleStage to clean up ResizeObserver**

Replace:

```javascript
export function destroyBattleStage() {
  if (!app) return;
  app.destroy(true, { children: true, texture: true });
  app = null;
  layers = {};
}
```

With:

```javascript
export function destroyBattleStage() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (!app) return;
  app.destroy(true, { children: true, texture: true });
  app = null;
  layers = {};
}
```

- [ ] **Step 6: Syntax check**

```bash
node --check public/js/pixi/battle-stage.js && echo "OK"
```

Expected: OK

- [ ] **Step 7: Commit**

```bash
git add public/js/pixi/battle-stage.js
git commit -m "fix: port try-catch error handling and debug aids to battle-stage.js

- Wraps init in try-catch so WebGL failures don't break the app
- Stores ResizeObserver reference for proper cleanup in destroy
- Adds console debug access via window.__pixiStage()
- Adds logging for init success/failure"
```

---

## Chunk 5: Port Dev Parallax Management to game.js

### Task 6: Port syncBattleStageParallax system and PvP callback to game.js

**Files:**
- Modify: `public/game.js`

This is the most critical port. The animations branch `game.js` only calls `setScrollState('decelerating')` in one place (`startEncounter`) and relies on `parallax.js:setScrollState()` internally calling `setWalking()`. Dev has a comprehensive phase→scroll state mapper (`syncParallaxScrollWithPhase`) and a centralized parallax loader (`syncBattleStageParallax`) that runs on every `updateUI()` call.

Without this port, scroll state won't transition correctly across exploring, room encounters, NPC dialogue, speed review, whack-a-mole, PvP, and post-combat recovery.

- [ ] **Step 1: Update imports to include setWalking**

Find the formation import line:

```javascript
import { showFormation as pixiShowFormation, hideFormation as pixiHideFormation } from './js/pixi/formation.js';
```

Add `setWalking`:

```javascript
import { showFormation as pixiShowFormation, hideFormation as pixiHideFormation, setWalking } from './js/pixi/formation.js';
```

Also verify that `isPvpBattleActive` is imported. Find the pvp-battle import and ensure it includes `isPvpBattleActive`:

```javascript
import { isPvpBattleActive } from './js/ui/pvp-battle.js';
```

If this import doesn't exist in the animations version, add it near the other UI imports.

- [ ] **Step 2: Add parallax state tracking variables**

Before the `updateUI()` function definition (or wherever the animations branch has its variable declarations), add:

```javascript
// Pixi parallax: reload when run area or PvP mode changes (centralized via updateUI).
let lastParallaxAreaKey = undefined;
let lastPhaseForParallax = null;
```

- [ ] **Step 3: Add mapRunAreaToParallaxId helper**

After the variable declarations from Step 2, add:

```javascript
/**
 * Map run.currentArea to the parallax asset folder under /assets/backgrounds/<id>/.
 * Prefer explicit area.parallaxId when present; else area.id; else starter_meadow.
 * @param {object|null|undefined} currentArea
 * @returns {string}
 */
function mapRunAreaToParallaxId(currentArea) {
  if (currentArea && typeof currentArea === 'object') {
    const pid = currentArea.parallaxId;
    if (typeof pid === 'string' && pid.length > 0) return pid;
    const aid = currentArea.id;
    if (typeof aid === 'string' && aid.length > 0) return aid;
  }
  return 'starter_meadow';
}
```

- [ ] **Step 4: Add syncParallaxScrollWithPhase function**

After `mapRunAreaToParallaxId`, add:

```javascript
function syncParallaxScrollWithPhase() {
  if (isPvpBattleActive()) {
    setScrollState('stopped');
    setWalking(false);
    lastPhaseForParallax = gameState.phase;
    return;
  }

  const p = gameState.phase;
  const prev = lastPhaseForParallax;
  lastPhaseForParallax = p;

  if (p === 'room' && prev === 'combat') {
    setScrollState('accelerating');
    setWalking(true);
    return;
  }

  switch (p) {
    case 'exploring':
    case 'room':
    case 'friendlyNpc':
    case 'npc_dialogue':
    case 'wordDiscovery':
    case 'dealer':
    case 'skillMaster':
    case 'whackAMole':
    case 'speedReviewRoom':
      setScrollState('scrolling');
      setWalking(true);
      break;
    case 'room_encounter':
      setScrollState('decelerating');
      setWalking(false);
      break;
    case 'combat':
      setScrollState('stopped');
      setWalking(false);
      break;
    default:
      setScrollState('stopped');
      setWalking(false);
  }
}
```

- [ ] **Step 5: Add syncBattleStageParallax function**

After `syncParallaxScrollWithPhase`, add:

```javascript
async function syncBattleStageParallax() {
  let desiredKey;
  if (isPvpBattleActive()) {
    desiredKey = 'pvp_arena';
  } else if (
    !gameState.run?.active ||
    gameState.phase === 'hub' ||
    gameState.phase === 'no_save' ||
    gameState.phase === 'area_selection' ||
    gameState.phase === 'pvp_lobby' ||
    gameState.phase === 'pvp_team_select'
  ) {
    desiredKey = null;
  } else {
    desiredKey = mapRunAreaToParallaxId(gameState.run?.currentArea);
  }

  if (desiredKey !== lastParallaxAreaKey) {
    lastParallaxAreaKey = desiredKey;
    try {
      await loadParallax(desiredKey);
    } catch (err) {
      console.warn('[Parallax] load failed:', err);
    }
  }

  syncParallaxScrollWithPhase();
}
```

- [ ] **Step 6: Call syncBattleStageParallax from updateUI()**

Find the `updateUI()` function. Add `void syncBattleStageParallax();` as the last line before the closing `}` of `updateUI()` (or near where parallax-related calls were made in the animations version).

If the animations branch had inline `loadParallax()` calls inside `updateScene()` (the background detection block), those can be removed now since `syncBattleStageParallax` handles it centrally. Find this block:

```javascript
    if (areaId) {
      scene.setBackground(null);
      loadParallax(areaId);
    }
```

Replace with:

```javascript
    if (areaId) {
      scene.setBackground(null);
      // Parallax loading handled centrally by syncBattleStageParallax() in updateUI()
    }
```

- [ ] **Step 7: Remove the standalone setScrollState call from startEncounter**

Find in `startEncounter()`:

```javascript
    // Decelerate parallax scroll as combat begins
    setScrollState('decelerating');
```

Remove these 2 lines. The `syncParallaxScrollWithPhase()` function handles this via the `room_encounter` → `combat` phase transition, which fires when `updateUI()` is called after state update.

- [ ] **Step 8: Port PvP parallax callback**

Find `pvpBattleUI.init({` and add the `onPvpBattleStart` callback:

```javascript
  pvpBattleUI.init({
    getGameState: () => gameState,
    updateUI,
    actions,
    scene,
    onPvpBattleStart: async () => {
      try {
        await loadParallax('pvp_arena');
      } catch (err) {
        console.warn('[Parallax] PvP load failed:', err);
      }
      setScrollState('stopped');
      lastParallaxAreaKey = 'pvp_arena';
    },
  });
```

- [ ] **Step 9: Syntax check**

```bash
node --check public/game.js && echo "OK"
```

Expected: OK

- [ ] **Step 10: Run tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add public/game.js
git commit -m "fix: port comprehensive parallax management system from dev

- syncBattleStageParallax: centralized parallax loader per area/phase
- syncParallaxScrollWithPhase: maps all game phases to scroll states
- mapRunAreaToParallaxId: area→parallax folder with fallback
- PvP arena parallax callback restored
- Replaces animations branch's single setScrollState call with
  full phase coverage (exploring, NPC, combat, post-combat, etc.)"
```

---

## Chunk 6: Verification and Cleanup

### Task 7: Verify no dead imports remain and all effects fire

**Files:**
- Possibly modify: any file with stale imports

- [ ] **Step 1: Check for remaining imports from combat-effects.js**

```bash
grep -r "from.*combat-effects\.js" public/js/ --include="*.js" || echo "No remaining imports"
```

Expected: Should show zero matches, OR only matches in `combat-effects.js` itself (self-references). If `combat-loop.js` or other files still import from `combat-effects.js`, they need to be updated.

- [ ] **Step 2: Check for any remaining DOM effect calls in combat-loop.js**

```bash
grep -n "impactEnemyEffect\|fireCreatureAttackEffect\|enemyCreatureAttackEffect\|poisonTickEffect\|healEffect\|showXpPopup\|showLevelUpPopup" public/js/ui/combat-loop.js || echo "No DOM effect calls found"
```

Note: Some of these function names may appear as local function definitions in the animations branch (e.g., `fireCreatureAttackEffect` is redefined as a local adapter function that calls pixi effects). That's fine — what we're checking for is imports from the old DOM module.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Verify the combat-effects-util tests specifically**

```bash
npm run test:unit -- --test-name-pattern="getDamageTier|getTierClassName|TIER_EFFECTS" 2>&1 | tail -10
```

Expected: All 9 assertions pass.

- [ ] **Step 5: Syntax check every pixi module**

```bash
for f in public/js/pixi/*.js; do
  node --check "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: All OK.

- [ ] **Step 6: Verify dom-effects.js re-exports work**

```bash
grep -n "from.*dom-effects" public/js/ui/exploration.js public/js/ui/economy.js
```

Expected: Both files import from `./dom-effects.js` (not `./combat-effects.js`).

- [ ] **Step 7: Check if combat-effects.js can be deleted**

```bash
grep -r "combat-effects\.js" public/ --include="*.js" -l
```

If the only file referencing `combat-effects.js` is itself, it's dead code and can be deleted. If other files still reference it, note which ones — they may need import updates.

If safe to delete:

```bash
git rm public/js/ui/combat-effects.js
git commit -m "cleanup: remove dead combat-effects.js (replaced by pixi/ modules + dom-effects.js)"
```

If NOT safe to delete, leave it for now and note the remaining references.

- [ ] **Step 8: Final commit (if any cleanup was needed)**

```bash
git status
```

If there are any uncommitted cleanup changes, commit them:

```bash
git add -A
git commit -m "cleanup: remove stale imports and dead code from pixi migration merge"
```

---

## Chunk 7: NPC Sprite Canvas Migration

### Task 8: Add NPC sprite rendering to pixi/formation.js

**Files:**
- Modify: `public/js/pixi/formation.js`

NPC sprites (Shrine Fox, Traveling Merchant, Game Master, NPC trainers, Cid, Chippy, etc.) currently render as a DOM `<img>` inside `#npc-display`. They should render as PixiJS Sprites on the creatures layer, just like combat creatures, with tween-based slide-in/out animations.

- [ ] **Step 1: Add NPC sprite state variables**

After the existing `let activeGlowTickFn = null;` line, add:

```javascript
/** NPC sprite displayed on the creatures layer (non-combat NPCs) */
let npcSprite = null;
```

- [ ] **Step 2: Add showNpcSprite function**

After the `clearActiveGlow()` function, add:

```javascript
/**
 * Show an NPC sprite on the enemy side of the canvas.
 * @param {string} spritePath - Path to the NPC sprite image
 * @param {{ slideIn?: boolean }} opts
 */
export async function showNpcSprite(spritePath, { slideIn = false } = {}) {
  const { app } = getStage();
  if (!app) return;
  const container = enemyContainer;
  if (!container) return;

  hideNpcSprite();

  let texture;
  try {
    texture = await Assets.load(spritePath);
  } catch {
    texture = Texture.WHITE;
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = 80;
  sprite.height = 80;
  sprite.scale.x *= -1; // Face left (same as enemy creatures)
  sprite.y = screenH * 0.5;

  if (slideIn) {
    sprite.x = screenW + 80;
    container.addChild(sprite);
    npcSprite = sprite;
    await tween(sprite, { x: screenW * 0.7 }, { duration: 400, ease: 'easeOut' });
  } else {
    sprite.x = screenW * 0.7;
    container.addChild(sprite);
    npcSprite = sprite;
  }
}

/**
 * Hide the NPC sprite, optionally sliding it out to the right.
 * @param {{ slideOut?: boolean }} opts
 */
export async function hideNpcSprite({ slideOut = false } = {}) {
  if (!npcSprite) return;
  if (slideOut) {
    const { app } = getStage();
    const screenW = app?.screen.width || 400;
    await tween(npcSprite, { x: screenW + 80 }, { duration: 300, ease: 'easeIn' });
  }
  if (npcSprite) {
    npcSprite.destroy();
    npcSprite = null;
  }
}
```

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/pixi/formation.js && echo "OK"
```

Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add NPC sprite rendering to pixi formation layer

showNpcSprite/hideNpcSprite render NPC portraits on the PixiJS canvas
with optional slide-in/out tween animations. Replaces the DOM <img>
in #npc-display for NPC visuals."
```

### Task 9: Update scene.js NPC functions to use PixiJS sprites

**Files:**
- Modify: `public/js/ui/scene.js`

All the `showNpcInDisplay`, `showNpcTrainer`, `showDealer`, `showShrineFox`, etc. functions currently set `dom.enemySprite.src` to load an NPC image in the DOM. Update them to call `pixiFormation.showNpcSprite()` instead, while keeping the DOM name label and info bar.

- [ ] **Step 1: Add pixi formation import to scene.js**

Add at the top of scene.js with the other imports:

```javascript
import { showNpcSprite as pixiShowNpcSprite, hideNpcSprite as pixiHideNpcSprite } from '../pixi/formation.js';
```

- [ ] **Step 2: Update showNpcInDisplay to use pixi sprite**

Find `showNpcInDisplay` and replace the DOM sprite loading with a pixi call. The function currently sets `dom.enemySprite.src = spritePath`. Change it to:

```javascript
export function showNpcInDisplay(name, spritePath) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = name;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  pixiShowNpcSprite(spritePath);
}
```

- [ ] **Step 3: Update showNpcTrainer to use pixi sprite**

Find `showNpcTrainer` and replace the DOM sprite loading similarly. Keep the name/role HTML rendering, just replace the sprite part:

After the existing `dom.enemyInfo.classList.add('visible');` line and the HP bar hiding, replace the `dom.enemySprite.src = ...` block with:

```javascript
  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  const spritePath = npcId
    ? `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  pixiShowNpcSprite(spritePath);
```

Remove the `dom.enemySprite.onerror` and `dom.enemySprite.onload` handlers since the DOM img is no longer used for display.

- [ ] **Step 4: Update hideEnemy to also hide pixi NPC sprite**

In `hideEnemy()`, add `pixiHideNpcSprite();` at the top of the function body:

```javascript
export function hideEnemy() {
  pixiHideNpcSprite();
  dom.npcDisplay.classList.remove('visible');
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  // ... rest unchanged
}
```

- [ ] **Step 5: Syntax check**

```bash
node --check public/js/ui/scene.js && echo "OK"
```

Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: wire scene.js NPC functions to PixiJS sprite rendering

showNpcInDisplay and showNpcTrainer now call pixiShowNpcSprite instead
of setting dom.enemySprite.src. DOM #npc-display still shows name/info
labels but sprite visual is on canvas."
```

### Task 10: Update room-transition.js to use pixi NPC slides and remove dead code

**Files:**
- Modify: `public/js/ui/room-transition.js`

Now that NPC sprites are on canvas, `room-transition.js` should:
1. Use pixi `showNpcSprite` with `slideIn: true` / `hideNpcSprite` with `slideOut: true` for NPC transitions
2. Remove `bouncePlayerParty` (PixiJS walking wobble replaces this)
3. Remove `enterEnemiesOneByOne` (PixiJS `_entering` animation replaces this)
4. Remove `slideFromRight` / `slideToRight` (only used for NPC DOM div, now pixi tween)
5. Replace `fadeIn` / `fadeOut` with simple opacity assignments (the visual transition is the pixi sprite, DOM HUD just appears/disappears)
6. Drop the anime.js import entirely

- [ ] **Step 1: Rewrite room-transition.js**

Replace the entire file with:

```javascript
import { showNpcTrainer, showNpcInDisplay, showDealer, showFormation } from './scene.js';
import { showNpcSprite, hideNpcSprite } from '../pixi/formation.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 */
export async function playRoomTransition(gameState) {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  const roomType = room.type;
  const npcDisplay = document.getElementById('npc-display');

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      const spritePath = npc.id
        ? `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`
        : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      await showNpcSprite(spritePath, { slideIn: true });
    }
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`);
    await showNpcSprite(`/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  } else if (roomType === 'dealer') {
    showDealer();
    await showNpcSprite(`/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  }

  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  if (hasCreatures) combatEvents.emit('explore');
}

/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Hide enemy formation during the NPC intro
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  // Show NPC name/info in DOM, sprite on canvas with slide-in
  showNpcSpriteFn(npcName, npcData.id, npcData);
  const spritePath = npcData.id
    ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  await showNpcSprite(spritePath, { slideIn: true });

  if (npcData.greeting) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  await hideNpcSprite({ slideOut: true });
  hideNpcSpriteFn();
}

/**
 * Wrap NPC skill activation with slide-in/out animation.
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;

  if (enemyFormation) enemyFormation.style.opacity = '0';

  if (npcData && showNpcSpriteFn) {
    showNpcSpriteFn(npcName, npcData.id, npcData);
    const spritePath = npcData.id
      ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    await showNpcSprite(spritePath, { slideIn: true });
  }

  await skillCallback();

  await hideNpcSprite({ slideOut: true });
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  if (enemies?.length) {
    showFormation('enemy', enemies);
  }

  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) freshFormation.style.opacity = '1';
}
```

- [ ] **Step 2: Verify anime.js import is gone**

```bash
grep "animejs" public/js/ui/room-transition.js || echo "No anime.js import — clean"
```

Expected: "No anime.js import — clean"

- [ ] **Step 3: Verify removed functions are gone**

```bash
grep -n "bouncePlayerParty\|enterEnemiesOneByOne\|slideFromRight\|slideToRight\|fadeIn\|fadeOut" public/js/ui/room-transition.js || echo "Dead functions removed"
```

Expected: "Dead functions removed"

- [ ] **Step 4: Check no other files import removed functions**

```bash
grep -r "bouncePlayerParty\|enterEnemiesOneByOne\|slideFromRight\|slideToRight" public/js/ --include="*.js" -l
```

If any files import these removed functions, they need to be updated too. Check `game.js` and `combat-loop.js`.

- [ ] **Step 5: Syntax check**

```bash
node --check public/js/ui/room-transition.js && echo "OK"
```

Expected: OK

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "feat: migrate NPC slide animations to PixiJS, remove dead DOM animation code

- playRoomTransition/playNpcBattleIntro/playNpcSkillAnimation now use
  pixi showNpcSprite/hideNpcSprite with slideIn/slideOut tweens
- Removed bouncePlayerParty (pixi walking wobble replaces)
- Removed enterEnemiesOneByOne (pixi _entering replaces)
- Removed slideFromRight/slideToRight/fadeIn/fadeOut (pixi tween replaces)
- Dropped anime.js import from room-transition.js"
```

---

## Chunk 8: Final Verification

### Task 11: Comprehensive verification and remaining cleanup

**Files:**
- Possibly modify: any file with stale imports

- [ ] **Step 1: Verify anime.js consumers are minimal**

```bash
grep -r "animejs" public/js/ --include="*.js" -l
```

Expected: Only 3 files remain:
- `speed-review.js` (minigame DOM animations)
- `whack-a-mole.js` (minigame DOM animations)
- `dom-effects.js` (non-combat DOM effects)

If `combat-effects.js` or `room-transition.js` still appear, they need cleanup.

- [ ] **Step 2: Check for remaining imports from combat-effects.js**

```bash
grep -r "from.*combat-effects\.js" public/js/ --include="*.js" || echo "No remaining imports"
```

Expected: Zero matches or only `combat-effects.js` itself.

- [ ] **Step 3: Delete combat-effects.js if safe**

```bash
grep -r "combat-effects\.js" public/ --include="*.js" -l
```

If the only remaining reference is the file itself, delete it:

```bash
git rm public/js/ui/combat-effects.js
git commit -m "cleanup: remove dead combat-effects.js (replaced by pixi/ modules + dom-effects.js)"
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Syntax check all JS files**

```bash
for f in public/js/pixi/*.js public/js/ui/room-transition.js public/js/ui/scene.js public/js/ui/combat-loop.js public/js/ui/dom-effects.js public/game.js; do
  node --check "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: All OK.

- [ ] **Step 6: Verify pixi-specific patterns are present**

```bash
echo "--- tileScale fix ---"
grep -n "tileScale.set" public/js/pixi/parallax.js
echo "--- request ID (parallax) ---"
grep -n "loadRequestId" public/js/pixi/parallax.js
echo "--- request ID (formation) ---"
grep -n "loadRequestId" public/js/pixi/formation.js
echo "--- null guard (parallax) ---"
grep -n "areaId == null" public/js/pixi/parallax.js
echo "--- NPC sprite functions ---"
grep -n "showNpcSprite\|hideNpcSprite" public/js/pixi/formation.js
```

Expected: All patterns present.

---

## Post-Merge Checklist

After all tasks complete, verify:

- [ ] `npm test` passes (all unit + integration tests)
- [ ] `node --check` passes on all pixi/ and ui/ JS files
- [ ] No `<<<<<<` conflict markers in any file
- [ ] No imports from `combat-effects.js` remain (file deleted)
- [ ] `dom-effects.js` exists and `exploration.js` + `economy.js` import from it
- [ ] `combat-effects-util.test.js` exists and passes
- [ ] Background assets exist: `public/assets/backgrounds/starter_meadow/{sky,far,mid,ground}.webp`
- [ ] Background assets exist: `public/assets/backgrounds/hajimari-no-hiroba/{sky,far,mid,ground}.webp`
- [ ] `parallax.js` has tileScale fix, request ID tracking, and null guard
- [ ] `parallax.js` does NOT import `setWalking` (game.js owns walking state)
- [ ] `formation.js` has `showNpcSprite` / `hideNpcSprite` exports
- [ ] `room-transition.js` does NOT import from `animejs`
- [ ] Only `speed-review.js`, `whack-a-mole.js`, and `dom-effects.js` use anime.js
- [ ] `scene.js` NPC functions call `pixiShowNpcSprite` instead of setting DOM `<img>.src`
