# PixiJS Battlefield Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a grounded PixiJS battlefield presentation with a symmetric `3 x 2` creature grid, labels above creatures, and a three-layer side-scrolling battlefield art contract.

**Architecture:** Add a small battle layout helper as the source of truth for sprite and DOM label positions. Add a battle-specific background renderer for `sky/background/battleground` assets while keeping exploration parallax separate. Then migrate formation sprite placement and DOM formation slots to the shared grid, using temporary or placeholder battlefield layers for integration verification while final production art moves to a future asset-pipeline project.

**Tech Stack:** PixiJS 8, vanilla ES modules, `node:test`, Vite, WebP battlefield layers. Future production pipeline notes reference OpenAI Images API `gpt-image-2` for source art and `gpt-image-1.5` for transparent layer edits.

## 2026-05-03 Visual Proof Update

The original plan started with Pixi plumbing. Task 1 and Task 2 have now landed in the feature worktree. The browser proof loop also proved the technical feasibility of generating layered battlefield images, alpha-separating them, and compositing them with real Koto sprites.

**Direction correction:** Do not block live battle integration on final production art quality. The current generated scenes are acceptable proof that the asset contract can be satisfied, but they are not visually good enough for final content. That is an art-direction and production-pipeline problem, not a Pixi battlefield-layout blocker.

**Completed in worktree `.worktrees/pixijs-battlefield-layout`:**

- Task 1 committed as `6c5ba935` (`feat(pixi): add battlefield layout grid`).
- Task 2 committed as `e9a18873` (`feat(pixi): add battlefield background renderer`).
- Follow-up cleanup coverage committed as `884850c8` (`test(pixi): cover battlefield background cleanup`).
- Runtime memory files remain modified and unrelated: `creature-memory-test-user-separate.json`, `npc-memory-test-user-separate.json`. Do not stage them.

**Revised execution order:**

1. Resume Task 3 and later live integration tasks using the known battlefield layout contract.
2. Use temporary or placeholder battlefield layers as needed to exercise the renderer in-game.
3. Verify the layout with real creature sprites, labels, and PvE/PvP parity.
4. Defer high-quality production scene generation to a future robust asset-pipeline project that can generate excellent scenes at will for new areas.
5. Do not run additional GPT size probes, production `starter_meadow` candidate loops, or final WebP asset approval as a prerequisite for Task 3.

**Proven feasibility from the browser proof loop:**

1. Use `gpt-image-2` to generate high-quality opaque source art.
2. Use `gpt-image-1.5` image edits with `background: "transparent"` and `output_format: "png"` to alpha-separate `background` and `battleground`.
3. Composite `sky -> background -> battleground -> contact shadows -> real Koto creature sprites -> DOM-style labels` in a browser mock.
4. Screenshot the mock and review it before generating another iteration.
5. Repeat iterations can improve art quality, but that loop is no longer part of this plan's critical path.

**Observed API behavior:**

- `gpt-image-2` accepted `2048x1024` and `1536x1024`.
- `gpt-image-2` rejected `4096x1024`: longest edge must be `<= 3840`.
- `3072x1024` returned transient verification errors during the proof loop; retry before finalizing production width.
- `gpt-image-2` does not currently support `background: "transparent"` directly.
- `gpt-image-1.5` transparent edit outputs succeeded at `1536x1024` for `background` and `battleground`.
- Next asset work should probe whether `gpt-image-1.5` transparent edits accept wider outputs, especially `2048x1024` and `3072x1024`.

**Best current proof artifact:**

- Browser preview: `tmp/battlefield-proof/run-007/preview-real/index.html`
- Screenshot: `tmp/battlefield-proof/run-007/preview-real/screenshot.png`
- Localhost URL while the temporary server is running: `http://localhost:8765/tmp/battlefield-proof/run-007/preview-real/index.html`

Run 007 is acceptable as proof-of-direction, not final production art. It demonstrates that real sprites can be grounded on a generated battleground with a visible background horizon. Remaining visual issues are art-production concerns: pads are still somewhat obvious, labels need more breathing room, and review grid lines are mock-only. These should inform the future production asset pipeline, not block the battlefield layout integration.

---

## File Structure

- Create `public/js/pixi/battlefield-layout.js`
  - Owns normalized `3 x 2` slot coordinates, row mapping, row scale, contact shadow sizing, and DOM label placement math.
- Create `tests/unit/pixi/battlefield-layout.test.js`
  - Unit tests for slot symmetry, `1/2/3` creature row mapping, canvas coordinate conversion, and label clamping.
- Create `public/js/pixi/battlefield-background.js`
  - Loads `/assets/backgrounds/<battlefieldId>/{sky,background,battleground}.webp`, creates ordered sprites, drifts only the sky, resizes layers.
- Create `tests/unit/pixi/battlefield-background.test.js`
  - Unit tests for load order, resize scaling, sky-only drift, stale load cancellation, and clear behavior.
- Modify `public/js/pixi/app.js`
  - Add battle background resize hook alongside existing parallax resize.
- Modify `public/game.js`
  - Import battle background update/load functions, route combat backgrounds to the battle renderer, keep exploration parallax unchanged.
- Modify `public/js/scenes/battle-scene.js`
  - Start/stop battle sky drift on battle scene enter/exit.
- Modify `public/js/pixi/formation.js`
  - Use shared battlefield slot helper for battle creature positions and shadows; preserve NPC sprite behavior.
- Modify `public/js/ui/combat-dom.js`
  - Position `.formation-slot` DOM elements from the shared grid and place `.formation-info` above the Pixi sprite anchor.
- Modify `public/game.css`
  - Change formation layout from flex columns to absolute grid slots in battle stage.
- Create `public/assets/backgrounds/starter_meadow/.gitkeep`
  - Keeps the first target asset directory present before generated WebP assets exist.
- Future pipeline: create `scripts/probe-gpt-image-sizes.mjs`
  - Probes accepted `gpt-image-2` sizes at production height `1024`.
- Future pipeline: create `scripts/generate-battlefield-preview.mjs`
  - Builds browser previews from generated layers with real Koto sprites, labels, optional review grid, and screenshots.

**Active implementation path after Task 2:** Continue with Task 3, Task 4, Task 5, Task 6, then Task 9/manual verification. Tasks 7 and 8 are retained as future production asset-pipeline notes, not as blockers for the battlefield layout work.

---

### Task 1: Add Battlefield Layout Helper

**Files:**
- Create: `public/js/pixi/battlefield-layout.js`
- Create: `tests/unit/pixi/battlefield-layout.test.js`

- [ ] **Step 1: Write the failing layout tests**

Create `tests/unit/pixi/battlefield-layout.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  rowForFormationIndex,
  getBattlefieldSlot,
  getBattlefieldSpriteScale,
  getBattlefieldShadowSpec,
  getBattlefieldLabelRect,
} = await import('../../../public/js/pixi/battlefield-layout.js');

describe('battlefield-layout grid constants', () => {
  it('mirrors ally and enemy columns around center', () => {
    assert.equal(BATTLEFIELD_COLUMNS.player, 0.195);
    assert.equal(BATTLEFIELD_COLUMNS.enemy, 0.805);
    assert.equal(BATTLEFIELD_COLUMNS.player + BATTLEFIELD_COLUMNS.enemy, 1);
  });

  it('uses evenly spaced rows', () => {
    assert.deepEqual(BATTLEFIELD_ROWS.map(row => row.name), ['top', 'middle', 'bottom']);
    assert.equal(BATTLEFIELD_ROWS[0].y, 0.435);
    assert.equal(BATTLEFIELD_ROWS[1].y, 0.652);
    assert.equal(BATTLEFIELD_ROWS[2].y, 0.870);
  });
});

describe('rowForFormationIndex', () => {
  it('maps one creature to the middle row', () => {
    assert.equal(rowForFormationIndex(0, 1), 1);
  });

  it('maps two creatures to top and bottom rows', () => {
    assert.equal(rowForFormationIndex(0, 2), 0);
    assert.equal(rowForFormationIndex(1, 2), 2);
  });

  it('maps three creatures to top, middle, and bottom rows', () => {
    assert.equal(rowForFormationIndex(0, 3), 0);
    assert.equal(rowForFormationIndex(1, 3), 1);
    assert.equal(rowForFormationIndex(2, 3), 2);
  });

  it('clamps unsupported indexes into valid rows', () => {
    assert.equal(rowForFormationIndex(-1, 3), 0);
    assert.equal(rowForFormationIndex(9, 3), 2);
  });
});

describe('getBattlefieldSlot', () => {
  it('converts normalized coordinates to canvas coordinates', () => {
    assert.deepEqual(getBattlefieldSlot('player', 0, 1000, 800), {
      side: 'player',
      rowIndex: 0,
      rowName: 'top',
      x: 195,
      y: 348,
      normalizedX: 0.195,
      normalizedY: 0.435,
    });
    assert.deepEqual(getBattlefieldSlot('enemy', 2, 1000, 800), {
      side: 'enemy',
      rowIndex: 2,
      rowName: 'bottom',
      x: 805,
      y: 696,
      normalizedX: 0.805,
      normalizedY: 0.870,
    });
  });
});

describe('row styling helpers', () => {
  it('returns row-based sprite scales', () => {
    assert.equal(getBattlefieldSpriteScale(0), 0.90);
    assert.equal(getBattlefieldSpriteScale(1), 0.98);
    assert.equal(getBattlefieldSpriteScale(2), 1.08);
  });

  it('returns row-based shadow specs', () => {
    assert.deepEqual(getBattlefieldShadowSpec(0), { width: 46, height: 12, alpha: 0.22 });
    assert.deepEqual(getBattlefieldShadowSpec(1), { width: 54, height: 14, alpha: 0.28 });
    assert.deepEqual(getBattlefieldShadowSpec(2), { width: 64, height: 16, alpha: 0.34 });
  });
});

describe('getBattlefieldLabelRect', () => {
  it('places labels above sprites and clamps them inside the scene', () => {
    const rect = getBattlefieldLabelRect({
      slotX: 50,
      slotY: 120,
      spriteHeight: 80,
      labelWidth: 110,
      labelHeight: 28,
      sceneWidth: 400,
      sceneHeight: 300,
    });
    assert.deepEqual(rect, { left: 4, top: 45, width: 110, height: 28 });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/pixi/battlefield-layout.test.js
```

Expected: fails because `public/js/pixi/battlefield-layout.js` does not exist.

- [ ] **Step 3: Implement the layout helper**

Create `public/js/pixi/battlefield-layout.js`:

```js
export const BATTLEFIELD_COLUMNS = {
  player: 0.195,
  enemy: 0.805,
};

export const BATTLEFIELD_ROWS = [
  { name: 'top', y: 0.435, scale: 0.90, shadow: { width: 46, height: 12, alpha: 0.22 } },
  { name: 'middle', y: 0.652, scale: 0.98, shadow: { width: 54, height: 14, alpha: 0.28 } },
  { name: 'bottom', y: 0.870, scale: 1.08, shadow: { width: 64, height: 16, alpha: 0.34 } },
];

const ROWS_FOR_TOTAL = {
  1: [1],
  2: [0, 2],
  3: [0, 1, 2],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rowForFormationIndex(index, total) {
  const rows = ROWS_FOR_TOTAL[total] || ROWS_FOR_TOTAL[3];
  const clampedIndex = clamp(index, 0, rows.length - 1);
  return rows[clampedIndex];
}

export function getBattlefieldSlot(side, rowIndex, screenWidth, screenHeight) {
  const row = BATTLEFIELD_ROWS[clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1)];
  const normalizedX = BATTLEFIELD_COLUMNS[side] ?? BATTLEFIELD_COLUMNS.player;
  return {
    side,
    rowIndex: BATTLEFIELD_ROWS.indexOf(row),
    rowName: row.name,
    x: normalizedX * screenWidth,
    y: row.y * screenHeight,
    normalizedX,
    normalizedY: row.y,
  };
}

export function getBattlefieldSpriteScale(rowIndex) {
  const row = BATTLEFIELD_ROWS[clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1)];
  return row.scale;
}

export function getBattlefieldShadowSpec(rowIndex) {
  const row = BATTLEFIELD_ROWS[clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1)];
  return { ...row.shadow };
}

export function getBattlefieldLabelRect({
  slotX,
  slotY,
  spriteHeight,
  labelWidth,
  labelHeight,
  sceneWidth,
  sceneHeight,
  gap = 7,
  margin = 4,
}) {
  const left = clamp(slotX - labelWidth / 2, margin, sceneWidth - labelWidth - margin);
  const top = clamp(slotY - spriteHeight / 2 - gap - labelHeight, margin, sceneHeight - labelHeight - margin);
  return { left, top, width: labelWidth, height: labelHeight };
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
npm run test:unit -- tests/unit/pixi/battlefield-layout.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/pixi/battlefield-layout.js tests/unit/pixi/battlefield-layout.test.js
git commit -m "feat(pixi): add battlefield layout grid"
```

---

### Task 2: Add Battle Background Renderer

**Files:**
- Create: `public/js/pixi/battlefield-background.js`
- Create: `tests/unit/pixi/battlefield-background.test.js`
- Modify: `public/js/pixi/app.js`

- [ ] **Step 1: Write the failing renderer tests**

Create `tests/unit/pixi/battlefield-background.test.js`:

```js
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {
  constructor() { this.children = []; }
  addChild(child) { this.children.push(child); child.parent = this; return child; }
  removeChildren() { const old = this.children; this.children = []; return old; }
}

class FakeSprite {
  constructor({ texture } = {}) {
    this.texture = texture;
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.scale = { x: 1, y: 1, set: (x, y = x) => { this.scale.x = x; this.scale.y = y; } };
    this.tilePosition = { x: 0, y: 0 };
    this.tileScale = { x: 1, y: 1, set: (x, y = x) => { this.tileScale.x = x; this.tileScale.y = y; } };
    this.destroyed = false;
  }
  destroy() { this.destroyed = true; }
}

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    TilingSprite: FakeSprite,
  },
});

let fakeAppState;
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: { getApp: () => fakeAppState },
});

const loadedPaths = [];
await mock.module('../../../public/js/pixi/image-loader.js', {
  namedExports: {
    loadImageTexture: async (path) => {
      loadedPaths.push(path);
      return { width: 4096, height: 1024, path };
    },
  },
});

const {
  loadBattlefieldBackground,
  updateBattlefieldBackground,
  resizeBattlefieldBackground,
  clearBattlefieldBackground,
  startSkyDrift,
  stopSkyDrift,
  _getBattlefieldBackgroundState,
} = await import('../../../public/js/pixi/battlefield-background.js');

beforeEach(() => {
  loadedPaths.length = 0;
  fakeAppState = {
    app: { screen: { width: 390, height: 347 } },
    layers: { background: new FakeContainer() },
  };
  clearBattlefieldBackground();
});

describe('battlefield-background', () => {
  it('loads sky, background, and battleground in render order', async () => {
    await loadBattlefieldBackground('starter_meadow');
    assert.deepEqual(loadedPaths, [
      '/assets/backgrounds/starter_meadow/sky.webp',
      '/assets/backgrounds/starter_meadow/background.webp',
      '/assets/backgrounds/starter_meadow/battleground.webp',
    ]);
    assert.equal(fakeAppState.layers.background.children.length, 3);
  });

  it('drifts only the sky when enabled', async () => {
    await loadBattlefieldBackground('starter_meadow');
    const state = _getBattlefieldBackgroundState();
    startSkyDrift(1);
    updateBattlefieldBackground(60);
    assert.ok(state.sky.tilePosition.x < 0);
    assert.equal(state.scenery.x, 0);
    assert.equal(state.battleground.x, 0);
  });

  it('does not drift when stopped', async () => {
    await loadBattlefieldBackground('starter_meadow');
    const state = _getBattlefieldBackgroundState();
    stopSkyDrift();
    updateBattlefieldBackground(60);
    assert.equal(state.sky.tilePosition.x, 0);
  });

  it('resizes all layers to screen size', async () => {
    await loadBattlefieldBackground('starter_meadow');
    resizeBattlefieldBackground(800, 450);
    const state = _getBattlefieldBackgroundState();
    assert.equal(state.sky.width, 800);
    assert.equal(state.sky.height, 450);
    assert.equal(state.scenery.width, 800);
    assert.equal(state.battleground.height, 450);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/pixi/battlefield-background.test.js
```

Expected: fails because `battlefield-background.js` does not exist.

- [ ] **Step 3: Implement the renderer**

Create `public/js/pixi/battlefield-background.js`:

```js
import { Sprite, TilingSprite } from 'pixi.js';
import { getApp } from './app.js';
import { loadImageTexture } from './image-loader.js';

const SKY_DRIFT_PX_PER_SECOND = 10;

let requestId = 0;
let sky = null;
let scenery = null;
let battleground = null;
let driftEnabled = false;
let driftSpeed = 0;

function destroyLayer(layer) {
  if (layer?.parent?.removeChild) layer.parent.removeChild(layer);
  if (layer?.destroy) layer.destroy({ children: true, texture: false });
}

function fitLayer(layer, width, height) {
  if (!layer) return;
  layer.width = width;
  layer.height = height;
  if (layer.texture?.height && layer.tileScale?.set) {
    const scale = height / layer.texture.height;
    layer.tileScale.set(scale, scale);
  }
}

export function clearBattlefieldBackground() {
  destroyLayer(sky);
  destroyLayer(scenery);
  destroyLayer(battleground);
  sky = null;
  scenery = null;
  battleground = null;
  driftEnabled = false;
  driftSpeed = 0;
}

export async function loadBattlefieldBackground(battlefieldId) {
  const { app, layers } = getApp();
  if (!app || !layers?.background) return;
  const id = ++requestId;
  clearBattlefieldBackground();
  if (!battlefieldId) return;

  const [skyTexture, sceneryTexture, battlegroundTexture] = await Promise.all([
    loadImageTexture(`/assets/backgrounds/${battlefieldId}/sky.webp`),
    loadImageTexture(`/assets/backgrounds/${battlefieldId}/background.webp`),
    loadImageTexture(`/assets/backgrounds/${battlefieldId}/battleground.webp`),
  ]);

  if (id !== requestId) return;

  sky = new TilingSprite({ texture: skyTexture, width: app.screen.width, height: app.screen.height });
  scenery = new Sprite({ texture: sceneryTexture });
  battleground = new Sprite({ texture: battlegroundTexture });

  layers.background.addChild(sky);
  layers.background.addChild(scenery);
  layers.background.addChild(battleground);
  resizeBattlefieldBackground(app.screen.width, app.screen.height);
}

export function resizeBattlefieldBackground(width, height) {
  fitLayer(sky, width, height);
  fitLayer(scenery, width, height);
  fitLayer(battleground, width, height);
}

export function startSkyDrift(speed = 1) {
  driftEnabled = true;
  driftSpeed = speed;
}

export function stopSkyDrift() {
  driftEnabled = false;
  driftSpeed = 0;
}

export function updateBattlefieldBackground(delta) {
  if (!driftEnabled || !sky) return;
  const dt = delta / 60;
  sky.tilePosition.x -= SKY_DRIFT_PX_PER_SECOND * driftSpeed * dt;
}

export function _getBattlefieldBackgroundState() {
  return { sky, scenery, battleground, driftEnabled, driftSpeed };
}
```

- [ ] **Step 4: Wire resize**

Modify `public/js/pixi/app.js`:

```js
import { resizeParallax } from './parallax.js';
import { resizeBattlefieldBackground } from './battlefield-background.js';
```

Inside the existing `ResizeObserver` callback, after `resizeParallax(width, height);`, add:

```js
resizeBattlefieldBackground(width, height);
```

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
node --check public/js/pixi/battlefield-background.js && node --check public/js/pixi/app.js && npm run test:unit -- tests/unit/pixi/battlefield-background.test.js
```

Expected: syntax checks pass and test passes.

- [ ] **Step 6: Commit**

```bash
git add public/js/pixi/battlefield-background.js tests/unit/pixi/battlefield-background.test.js public/js/pixi/app.js
git commit -m "feat(pixi): add battlefield background renderer"
```

---

### Task 3: Route Combat To Battle Backgrounds

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/scenes/battle-scene.js`

- [ ] **Step 1: Update imports in `public/game.js`**

Change:

```js
import { loadParallax, setScrollState, updateParallax } from './js/pixi/parallax.js';
```

To:

```js
import { loadParallax, setScrollState, updateParallax } from './js/pixi/parallax.js';
import {
  loadBattlefieldBackground,
  clearBattlefieldBackground,
  updateBattlefieldBackground,
} from './js/pixi/battlefield-background.js';
```

- [ ] **Step 2: Update the central ticker**

In `public/game.js`, change the SceneManager `update` callback to:

```js
update: (dt, deltaMS) => {
  if (!isFrozen()) {
    updateParallax(dt);
    updateBattlefieldBackground(dt);
  }
  updateParticles(deltaMS);
},
```

- [ ] **Step 3: Split battle background loading from exploration parallax**

In `syncBattleStageParallax()`, replace the single `loadParallax(desiredKey)` call with phase-aware loading:

```js
if (desiredKey !== lastParallaxAreaKey) {
  lastParallaxAreaKey = desiredKey;
  try {
    if (gameState.phase === 'combat' || isPvpBattleActive()) {
      await loadParallax(null);
      await loadBattlefieldBackground(desiredKey);
    } else {
      clearBattlefieldBackground();
      await loadParallax(desiredKey);
    }
  } catch (err) {
    console.warn('[Parallax] load failed:', err);
  }
}
```

- [ ] **Step 4: Start and stop sky drift from `BattleScene`**

Modify imports in `public/js/scenes/battle-scene.js`:

```js
import { startSkyDrift, stopSkyDrift } from '../pixi/battlefield-background.js';
```

In `onEnter`, after `this._isBoss = !!isBoss;`, add:

```js
startSkyDrift(0.4);
```

In `beforeExit`, before `stopParallax();`, add:

```js
stopSkyDrift();
```

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check public/game.js && node --check public/js/scenes/battle-scene.js
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add public/game.js public/js/scenes/battle-scene.js
git commit -m "feat(pixi): route combat to battlefield backgrounds"
```

---

### Task 4: Move Pixi Formation Sprites To The Grid

**Files:**
- Modify: `public/js/pixi/formation.js`
- Modify: `tests/unit/pixi/formation-scene.test.js`

- [ ] **Step 1: Add a failing formation positioning test**

In `tests/unit/pixi/formation-scene.test.js`, import the row helper near the existing imports:

```js
const { rowForFormationIndex } = await import('../../../public/js/pixi/battlefield-layout.js');
```

Add this test near the spawn tests:

```js
it('positions battle sprites on the symmetric battlefield grid', async () => {
  const ctx = makeSceneCtx();
  const sprite = await spawnFormationSprite(ctx, 'enemy', { uid: 'e1', id: 'hi', hp: 10 }, 0, {
    slotI: rowForFormationIndex(0, 3),
    skipEnter: true,
  });

  assert.equal(Math.round(sprite.baseX), 322); // 400 * 0.805
  assert.equal(Math.round(sprite.baseY), 261); // 600 * 0.435
  assert.equal(sprite._rowName, 'top');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/pixi/formation-scene.test.js
```

Expected: fails because `formation.js` still falls back to old percentage/DOM-anchor placement.

- [ ] **Step 3: Import battlefield layout helpers**

In `public/js/pixi/formation.js`, add:

```js
import {
  getBattlefieldSlot,
  getBattlefieldSpriteScale,
  getBattlefieldShadowSpec,
} from './battlefield-layout.js';
```

- [ ] **Step 4: Replace spawn target position math**

In `spawnFormationSprite`, replace the DOM-anchor/fallback block with:

```js
const screenW = app.screen.width;
const screenH = app.screen.height;
const slot = getBattlefieldSlot(side, slotI, screenW, screenH);
let targetX = slot.x;
let targetY = slot.y;
```

Keep `screenW`, `screenH`, and enemy slide-in logic.

Set row metadata after `_slotI`:

```js
sprite._rowName = slot.rowName;
```

Replace:

```js
sprite.scale.set(DEPTH_SCALES[slotI] * (spriteSize / texture.width));
```

With:

```js
sprite.scale.set(getBattlefieldSpriteScale(slotI) * (spriteSize / texture.width));
```

- [ ] **Step 5: Add contact shadow creation**

Inside `spawnFormationSprite`, before `container.addChild(sprite);`, add:

```js
const shadowSpec = getBattlefieldShadowSpec(slotI);
const shadow = new Graphics();
shadow.ellipse?.(0, 0, shadowSpec.width / 2, shadowSpec.height / 2);
if (!shadow.ellipse) shadow.circle(0, 0, shadowSpec.width / 2);
shadow.fill({ color: 0x000000, alpha: shadowSpec.alpha });
shadow.x = targetX;
shadow.y = targetY + spriteSize * 0.38;
container.addChild(shadow);
sprite._shadow = shadow;
```

If the current Pixi `Graphics` API in this codebase does not support `.ellipse`, use `.circle` and scale `shadow.scale.y`.

- [ ] **Step 6: Destroy and update shadows with sprites**

In `removeFormationSprite`, before destroying the sprite, add:

```js
if (sprite._shadow) {
  if (sprite._shadow.parent) sprite._shadow.parent.removeChild(sprite._shadow);
  sprite._shadow.destroy({ children: true });
}
```

In `updateFormationSprite`, when repositioning `sprite.x/y/baseX/baseY`, also update:

```js
if (sprite._shadow) {
  sprite._shadow.x = targetX;
  sprite._shadow.y = targetY + spriteSize * 0.38;
}
```

- [ ] **Step 7: Run syntax and focused tests**

Run:

```bash
node --check public/js/pixi/formation.js && npm run test:unit -- tests/unit/pixi/formation-scene.test.js
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add public/js/pixi/formation.js tests/unit/pixi/formation-scene.test.js
git commit -m "feat(pixi): place battle sprites on battlefield grid"
```

---

### Task 5: Move DOM Formation Labels Above Sprites

**Files:**
- Modify: `public/js/ui/combat-dom.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/combat-dom-battlefield.test.js`

- [ ] **Step 1: Write a failing DOM slot test**

Create `tests/unit/ui/combat-dom-battlefield.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let showFormation;
let playerFormation;
let enemyFormation;

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.attributes = {};
    this.classList = {
      add: (...names) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach(name => set.add(name));
        this.className = [...set].join(' ');
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter(name => !remove.has(name)).join(' ');
      },
      toggle: (name, force) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelectorAll(selector) {
    const results = [];
    const className = selector.split('.').pop();
    const visit = (node) => {
      if (node.className?.split(/\s+/).includes(className)) results.push(node);
      node.children?.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

beforeEach(async () => {
  playerFormation = new FakeElement('player-formation');
  enemyFormation = new FakeElement('enemy-formation');
  globalThis.document = {
    createElement: () => new FakeElement(),
    querySelector: () => null,
    getElementById: (id) => {
      if (id === 'player-formation') return playerFormation;
      if (id === 'enemy-formation') return enemyFormation;
      return null;
    },
  };
  globalThis.window = {};
  ({ showFormation } = await import('../../../public/js/ui/combat-dom.js'));
});

describe('combat-dom battlefield positioning', () => {
  it('marks formation slots for absolute battlefield rows', async () => {
    await showFormation('player', [
      { uid: 'a', id: 'a', name: 'あ', baseReading: 'あ', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
      { uid: 'b', id: 'b', name: 'い', baseReading: 'い', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
      { uid: 'c', id: 'c', name: 'う', baseReading: 'う', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
    ], { force: true });

    const slots = playerFormation.querySelectorAll('.formation-slot');
    assert.equal(slots.length, 3);
    assert.equal(slots[0].dataset.row, 'top');
    assert.equal(slots[1].dataset.row, 'middle');
    assert.equal(slots[2].dataset.row, 'bottom');
    assert.equal(slots[0].style.left, '19.5%');
    assert.equal(slots[0].style.top, '43.5%');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-dom-battlefield.test.js
```

Expected: fails until `combat-dom.js` applies battlefield row metadata and style positions.

- [ ] **Step 3: Update `combat-dom.js`**

Import helpers:

```js
import { BATTLEFIELD_COLUMNS, BATTLEFIELD_ROWS, rowForFormationIndex } from '../pixi/battlefield-layout.js';
```

Inside `slots.forEach((creature, visualIndex) => { ... })`, after `dataIndex`, compute:

```js
const rowIndex = rowForFormationIndex(dataIndex, creatures.length);
const row = BATTLEFIELD_ROWS[rowIndex];
const columnX = BATTLEFIELD_COLUMNS[side];
```

Set slot metadata/styles after dataset fields:

```js
slotEl.dataset.row = row.name;
slotEl.style.left = `${columnX * 100}%`;
slotEl.style.top = `${row.y * 100}%`;
```

- [ ] **Step 4: Update CSS positioning**

In `public/game.css`, change `.battle-stage` formation layout from flex to absolute overlay:

```css
.battle-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  contain: layout style;
}

.formation {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.formation-slot {
  position: absolute;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  will-change: transform, opacity;
}
```

Remove or neutralize old stagger and `nth-child` depth scale rules:

```css
.player-formation .formation-slot:nth-child(1),
.player-formation .formation-slot:nth-child(2),
.player-formation .formation-slot:nth-child(3),
.enemy-formation .formation-slot:nth-child(1),
.enemy-formation .formation-slot:nth-child(2),
.enemy-formation .formation-slot:nth-child(3) {
  margin-left: 0;
  margin-right: 0;
  scale: 1;
}
```

- [ ] **Step 5: Run syntax and tests**

Run:

```bash
node --check public/js/ui/combat-dom.js && npm run test:unit -- tests/unit/ui/combat-dom-battlefield.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-dom.js public/game.css tests/unit/ui/combat-dom-battlefield.test.js
git commit -m "feat(ui): position battle labels above creatures"
```

---

### Task 6: Verify PvP Uses The Same Battlefield Grid

**Files:**
- Modify: `public/js/ui/pvp-battle.js`
- Test: `tests/unit/ui/pvp-battle-battlefield-parity.test.js`

- [ ] **Step 1: Write a failing PvP parity test**

Create `tests/unit/ui/pvp-battle-battlefield-parity.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/pvp-socket.js', {
  namedExports: { on: () => {}, off: () => {}, emit: () => {} },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} },
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: { showMoves: () => {}, setActiveLabel: () => {} },
});
await mock.module('../../../public/js/ui/target-select.js', {
  namedExports: { init: () => {}, showEnemies: () => {}, showAllies: () => {} },
});
await mock.module('../../../public/js/ui/combat-loop.js', {
  namedExports: { showAttackDisplay: () => {} },
});
await mock.module('../../../public/js/ui/combat-ui-utils.js', {
  namedExports: { getHpColor: () => 'green' },
});

const { init, startPvpBattle } = await import('../../../public/js/ui/pvp-battle.js');

describe('PvP battlefield layout parity', () => {
  it('renders PvP formations through the shared showFormation path', () => {
    const calls = [];
    init({
      getGameState: () => ({}),
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        setBackground: () => {},
        showFormation: (side, creatures, opts) => calls.push({ side, creatures, opts }),
      },
      onPvpBattleStart: () => {},
    });

    startPvpBattle({
      yourTeam: [{ id: 'a', hp: 10 }, { id: 'b', hp: 10 }, { id: 'c', hp: 10 }],
      opponentTeam: [{ id: 'x', hp: 10 }, { id: 'y', hp: 10 }, { id: 'z', hp: 10 }],
      opponentName: 'Rival',
      mySide: 'sideA',
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].side, 'player');
    assert.equal(calls[1].side, 'enemy');
    assert.equal(calls[0].creatures.length, 3);
    assert.equal(calls[1].creatures.length, 3);
  });
});
```

- [ ] **Step 2: Run the parity test**

Run:

```bash
npm run test:unit -- tests/unit/ui/pvp-battle-battlefield-parity.test.js
```

Expected: pass if PvP already uses `scene.showFormation`; fail if imports or callbacks need adjustment.

- [ ] **Step 3: Remove PvP-only background override**

In `public/js/ui/pvp-battle.js`, remove the old static background fallback:

```js
// Set arena background (will fall back if file doesn't exist yet)
if (sceneModule?.setBackground) {
  sceneModule.setBackground('/assets/backgrounds/pvp-arena.webp');
}
```

PvP background loading should go through `onPvpBattleStart` and the battle background renderer in `public/game.js`, so PvP and PvE share the same Pixi background path.

- [ ] **Step 4: Run syntax and test**

Run:

```bash
node --check public/js/ui/pvp-battle.js && npm run test:unit -- tests/unit/ui/pvp-battle-battlefield-parity.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/pvp-battle.js tests/unit/ui/pvp-battle-battlefield-parity.test.js
git commit -m "feat(pvp): share battlefield formation layout"
```

---

### Task 7: Future Asset Pipeline - Add GPT Image Size Probe And Record Visual Proof Results

**Files:**
- Create: `scripts/probe-gpt-image-sizes.mjs`
- Modify: `docs/superpowers/plans/2026-05-02-pixijs-battlefield-layout.md`

> **Deferred.** This task belongs to a future robust production asset pipeline, not the current Pixi battlefield layout integration. The browser proof loop already demonstrated that the layered image contract is technically feasible. Do not run this task before Task 3 unless the user explicitly reopens production asset pipeline work.

- [ ] **Step 1: Create the probe script**

Create `scripts/probe-gpt-image-sizes.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';

const CANDIDATE_SIZES = [
  '4096x1024',
  '3072x1024',
  '2048x1024',
  '1536x1024',
];

const outDir = path.resolve('tmp/gpt-image-size-probe');
fs.mkdirSync(outDir, { recursive: true });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

const results = [];

for (const size of CANDIDATE_SIZES) {
  try {
    const result = await client.images.generate({
      model: 'gpt-image-2',
      prompt: 'A simple pixel-perfect horizontally seamless looping blue sky texture for a mobile game. No text, no objects, no ground.',
      size,
      quality: 'low',
      output_format: 'webp',
    });
    const b64 = result.data?.[0]?.b64_json;
    if (b64) {
      fs.writeFileSync(path.join(outDir, `accepted-${size}.webp`), Buffer.from(b64, 'base64'));
    }
    results.push({ size, accepted: true });
    console.log(`ACCEPTED ${size}`);
  } catch (err) {
    results.push({ size, accepted: false, error: err.message });
    console.log(`REJECTED ${size}: ${err.message}`);
  }
}

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check scripts/probe-gpt-image-sizes.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the probe only when an API key is available**

Run:

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" node scripts/probe-gpt-image-sizes.mjs
```

Expected: `tmp/gpt-image-size-probe/results.json` records accepted/rejected sizes. Do not commit generated WebP outputs.

Current observed proof-loop results to preserve in the plan until the scripted probe supersedes them:

- `4096x1024`: rejected by `gpt-image-2` because longest edge must be `<= 3840`.
- `2048x1024`: accepted by `gpt-image-2`.
- `1536x1024`: accepted by `gpt-image-2`.
- `3072x1024`: retry required; earlier calls returned transient organization-verification errors.
- Direct `gpt-image-2` transparent generation returned `400` for `background: "transparent"`.
- `gpt-image-1.5` transparent edits succeeded at `1536x1024`.

- [ ] **Step 4: Probe transparent edit output sizes**

Extend or create a follow-up probe for the alpha pass:

1. Generate a cheap `gpt-image-2` opaque source image.
2. Run `gpt-image-1.5` image edits with `background: "transparent"`, `output_format: "png"`, and candidate output sizes:
   - `3072x1024`
   - `2048x1024`
   - `1536x1024`
3. Record accepted/rejected sizes under `tmp/gpt-image-transparent-edit-probe/results.json`.
4. Future production layer dimensions should use the widest size accepted by **both** the `gpt-image-2` source pass and the `gpt-image-1.5` transparent edit pass, balanced against asset size and runtime performance.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-gpt-image-sizes.mjs docs/superpowers/plans/2026-05-02-pixijs-battlefield-layout.md
git commit -m "chore(assets): add gpt image size probe"
```

---

### Task 8: Future Asset Pipeline - Add Battlefield Preview Generator And Production Asset Loop

**Files:**
- Create: `scripts/generate-battlefield-preview.mjs`
- Create: `scripts/generate-battlefield-assets.mjs` or an equivalent one-off generation driver before committing production assets.
- Output only to `tmp/` until a browser screenshot passes review.

> **Deferred.** This task should become part of a future production asset pipeline that can generate high-quality scenes at will for new areas. It is not a prerequisite for Task 3. When this task is resumed, the preview must use actual Koto creature sprites and DOM-style labels. Placeholder ovals or marker-only composites are not enough for asset approval.

- [ ] **Step 0: Continue the visual loop until approved**

Use the proven browser-loop pipeline:

1. Generate opaque source art with `gpt-image-2`.
2. Alpha-separate `background` and `battleground` with `gpt-image-1.5` image edits.
3. Compose a browser mock with:
   - `sky`
   - transparent `background`
   - transparent/opaque `battleground`
   - contact shadows
   - real Koto idle sprites: `kumaro`, `kaeroki`, `sarukkii`, `hebiveil`, `kamedor`, `kujirath`
   - labels above creatures
   - optional grid lines for review only
4. Capture a screenshot.
5. Review against:
   - side-scrolling strip reads as a wide loop,
   - horizon/background is visible in the mobile viewport,
   - all six real sprites look grounded,
   - top row is not floating into sky,
   - central aisle is readable,
   - pads are readable but not oversized,
   - no UI/text/creatures are baked into generated art,
   - no sky leaks below the battleground,
   - labels remain readable.
6. Repeat until approved.

Run 007 (`tmp/battlefield-proof/run-007/preview-real/`) is proof-of-direction. Use it as evidence that the layer contract works, not as final production art and not as a gate for battlefield layout integration.

- [ ] **Step 1: Create the browser preview script**

Create `scripts/generate-battlefield-preview.mjs` as a browser-based preview harness, not a static `sharp` marker composite.

Requirements:

- Accept either:
  - a production asset id such as `starter_meadow`, resolving to `public/assets/backgrounds/<id>/{sky,background,battleground}.webp`, or
  - a temporary proof directory such as `tmp/battlefield-proof/run-007`, resolving to its generated PNG layers.
- Build an HTML preview under `tmp/battlefield-preview/<preview-id>/index.html`.
- Include the real Koto idle sprites from `public/assets/sprites/creatures/`:
  - `kumaro-idle.webp`
  - `kaeroki-idle.webp`
  - `sarukkii-idle.webp`
  - `hebiveil-idle.webp`
  - `kamedor-idle.webp`
  - `kujirath-idle.webp`
- Use the shared battlefield grid values:
  - player x `0.195`
  - enemy x `0.805`
  - rows y `0.435`, `0.652`, `0.870`
- Render contact shadows, labels above sprites, and an action-area mock below the scene.
- Support a review-grid overlay option, but keep it off for final approval screenshots.
- Capture a screenshot with Playwright or the Cursor browser at iPhone-class viewport size.
- Write screenshots only under `tmp/`.

- [ ] **Step 2: Create or document the generation driver**

Create `scripts/generate-battlefield-assets.mjs` or document the exact one-off command sequence used for production generation.

Requirements:

- Never inline API keys in scripts or committed files.
- Generate source art with `gpt-image-2`.
- Alpha-separate `background` and `battleground` with `gpt-image-1.5` image edits.
- Save all unapproved outputs under `tmp/battlefield-proof/<run-id>/`.
- Preserve per-run prompts, API result metadata, source images, transparent images, preview HTML, and screenshots.
- Do not write to `public/assets/backgrounds/<battlefieldId>/` until the browser screenshot is approved.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check scripts/generate-battlefield-preview.mjs
node --check scripts/generate-battlefield-assets.mjs
```

If `generate-battlefield-assets.mjs` is intentionally deferred, document the manual generation commands in this plan before committing.

- [ ] **Step 4: Preview the current proof artifact**

Run the preview generator against `tmp/battlefield-proof/run-007` and verify it recreates the real-sprite browser preview.

Expected: screenshot matches the approved direction from `tmp/battlefield-proof/run-007/preview-real/screenshot.png` without relying on placeholder ovals.

- [ ] **Step 5: Generate the production `starter_meadow` candidate**

When future production asset pipeline work resumes, after Task 7 determines the widest size accepted by both source generation and transparent edit passes:

1. Generate a production candidate layer set under `tmp/battlefield-proof/<run-id>/`.
2. Run the browser preview with real sprites and labels.
3. Loop until approved.
4. Convert approved layers to WebP.
5. Copy only approved final files to `public/assets/backgrounds/starter_meadow/`:
   - `sky.webp`
   - `background.webp`
   - `battleground.webp`

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-battlefield-preview.mjs scripts/generate-battlefield-assets.mjs public/assets/backgrounds/starter_meadow docs/superpowers/plans/2026-05-02-pixijs-battlefield-layout.md
git commit -m "chore(assets): add battlefield preview pipeline"
```

If `generate-battlefield-assets.mjs` is deferred, omit it from `git add` and ensure the manual generation steps are recorded in the plan.

---

### Task 9: Add Placeholder Asset Directory And Manual Verification

**Files:**
- Create: `public/assets/backgrounds/starter_meadow/.gitkeep`
- Modify: `docs/playtest-guide.md`

- [ ] **Step 1: Add the target asset directory**

Run:

```bash
mkdir -p public/assets/backgrounds/starter_meadow
touch public/assets/backgrounds/starter_meadow/.gitkeep
```

- [ ] **Step 2: Document the visual verification path**

Add this section to `docs/playtest-guide.md` near the combat Pixi expected-screen section:

```md
**Battlefield layout visual check:**
- The battle scene uses a symmetric 3x2 creature grid.
- Creatures stand on the battleground layer, not floating over generic scenery.
- Labels sit above each creature.
- Only the sky layer drifts during combat; background and battleground stay locked.
- Verify 3v3 first, then 2v2 and 1v1.
```

- [ ] **Step 3: Run syntax checks and relevant unit tests**

Run:

```bash
node --check public/js/pixi/battlefield-layout.js && node --check public/js/pixi/battlefield-background.js && npm run test:unit -- tests/unit/pixi/battlefield-layout.test.js tests/unit/pixi/battlefield-background.test.js tests/unit/pixi/formation-scene.test.js tests/unit/ui/pvp-battle-battlefield-parity.test.js
```

Expected: all pass.

- [ ] **Step 4: Manual visual verification**

Run:

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to combat, and capture screenshots for:

- `3v3` battle scene with labels above creatures.
- `2v2` battle scene using top/bottom rows.
- `1v1` battle scene using middle row.
- PvP battle scene uses the same grid and labels.
- Sky drift running without feet sliding.

- [ ] **Step 5: Commit**

```bash
git add public/assets/backgrounds/starter_meadow/.gitkeep docs/playtest-guide.md
git commit -m "docs: add battlefield visual verification"
```

---

## Final Verification

Run:

```bash
node --check public/js/pixi/battlefield-layout.js
node --check public/js/pixi/battlefield-background.js
node --check public/js/pixi/formation.js
node --check public/js/ui/combat-dom.js
node --check public/js/ui/pvp-battle.js
node --check public/js/scenes/battle-scene.js
node --check public/game.js
npm run test:unit -- tests/unit/pixi/battlefield-layout.test.js tests/unit/pixi/battlefield-background.test.js tests/unit/pixi/formation-scene.test.js tests/unit/ui/pvp-battle-battlefield-parity.test.js
```

Expected: all checks pass.

Then perform visual verification with screenshots before reporting the feature complete.
