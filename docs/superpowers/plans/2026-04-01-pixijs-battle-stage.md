# PixiJS Battle Stage Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DOM-based scene area rendering with a PixiJS canvas for smooth parallax backgrounds, creature sprites, and combat effects on mobile.

**Architecture:** PixiJS v8 Application canvas fills `.scene-area`. Four-layer parallax background auto-scrolls during exploration. Creature sprites rendered as PixiJS Sprites with procedural walking wobble. Combat effects (particles, damage numbers, popups) use ParticleContainer and BitmapText. DOM HUD overlays (HP bars, area header, narration box) remain on top of the canvas.

**Tech Stack:** PixiJS v8, ES modules, existing Express server, WebP sprite assets

**Implementation decisions (locked before coding):**
- Non-combat rooms keep the same walking/explore parallax background; no per-room background swaps during NPC interactions.
- DOM formation containers remain temporarily as compatibility anchors (`.formation-slot`) until dependent modules are migrated; remove only in final cleanup.

**Spec:** `docs/superpowers/specs/2026-04-01-pixijs-battle-stage-design.md`

---

## Chunk 1: Phase 1 — PixiJS Canvas + Parallax Background

### Task 1: Install PixiJS and create battle-stage.js

**Files:**
- Modify: `package.json`
- Create: `public/js/pixi/battle-stage.js`

- [ ] **Step 1: Install PixiJS v8**

```bash
npm install pixi.js@^8
```

- [ ] **Step 2: Create `public/js/pixi/battle-stage.js`**

This is the entry point — initializes the PixiJS Application, attaches it to `.scene-area`, handles resize, and exposes the layer containers.

```js
/**
 * @file battle-stage.js — PixiJS Application init, resize, layer management
 *
 * Creates a PixiJS canvas inside .scene-area with four ordered layers:
 * background (parallax), creatures, effects, overlay.
 * Handles resize via ResizeObserver.
 */

import { Application, Container } from 'pixi.js';

let app = null;
let layers = {};

/** @returns {{ app: Application, layers: Record<string, Container> }} */
export function getStage() {
  return { app, layers };
}

/**
 * Initialize the PixiJS battle stage inside the scene-area element.
 * Must be called once at app startup (async).
 */
export async function initBattleStage() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea || app) return;

  app = new Application();

  await app.init({
    background: 0x1a1a2e,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
    antialias: false,
    width: sceneArea.clientWidth,
    height: sceneArea.clientHeight,
  });

  // Insert canvas as first child so DOM overlays sit on top
  app.canvas.style.position = 'absolute';
  app.canvas.style.top = '0';
  app.canvas.style.left = '0';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  sceneArea.insertBefore(app.canvas, sceneArea.firstChild);

  // Create ordered layer containers
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

  // Resize handling
  const ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      app.renderer.resize(width, height);
    }
  });
  ro.observe(sceneArea);
}

/**
 * Destroy the PixiJS application and clean up.
 */
export function destroyBattleStage() {
  if (!app) return;
  app.destroy(true, { children: true, texture: true });
  app = null;
  layers = {};
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check public/js/pixi/battle-stage.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/js/pixi/battle-stage.js
git commit -m "feat: add PixiJS v8 and battle-stage.js init module"
```

---

### Task 2: Create parallax.js — 4-layer scrolling background

**Files:**
- Create: `public/js/pixi/parallax.js`

- [ ] **Step 1: Create `public/js/pixi/parallax.js`**

```js
/**
 * @file parallax.js — 4-layer TilingSprite parallax background
 *
 * Fixed layer structure: sky (0.1x), far (0.3x), mid (0.6x), ground (1.0x).
 * Layers auto-scroll during exploration and decelerate/stop for encounters.
 */

import { TilingSprite, Assets, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';

const LAYER_NAMES = ['sky', 'far', 'mid', 'ground'];
const LAYER_SPEEDS = [0.1, 0.3, 0.6, 1.0];
const BASE_SCROLL_SPEED = 60; // pixels per second at 1.0x

let tilingSprites = [];
let scrollState = 'stopped'; // 'scrolling' | 'decelerating' | 'stopped' | 'accelerating'
let currentSpeed = 0; // 0 = stopped, 1 = full speed
const ACCEL_RATE = 2.0; // seconds to reach full speed
const DECEL_RATE = 1.5; // seconds to stop

/**
 * Load parallax layers for an area. Falls back to solid color if assets missing.
 * @param {string} areaId - e.g. 'starter_meadow'
 */
export async function loadParallax(areaId) {
  const { app, layers } = getStage();
  if (!app) return;

  // Clear existing layers
  tilingSprites.forEach(ts => ts.destroy());
  tilingSprites = [];
  layers.background.removeChildren();

  const w = app.screen.width;
  const h = app.screen.height;

  for (let i = 0; i < LAYER_NAMES.length; i++) {
    const name = LAYER_NAMES[i];
    const path = `/assets/backgrounds/${areaId}/${name}.webp`;

    let texture;
    try {
      texture = await Assets.load(path);
    } catch {
      // Fallback: skip this layer (sky will show background color)
      continue;
    }

    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    ts.layerSpeed = LAYER_SPEEDS[i];
    tilingSprites.push(ts);
    layers.background.addChild(ts);
  }
}

/**
 * Set the scroll state.
 * @param {'scrolling'|'decelerating'|'stopped'|'accelerating'} state
 */
export function setScrollState(state) {
  scrollState = state;
  if (state === 'stopped') currentSpeed = 0;
  if (state === 'scrolling') currentSpeed = 1;
}

/**
 * Ticker update — call every frame. Scrolls layers based on current state.
 * @param {number} delta - Frame delta time from PixiJS ticker (in frames at 60fps)
 */
export function updateParallax(delta) {
  const dt = delta / 60; // convert to seconds

  // Update speed based on state
  if (scrollState === 'accelerating') {
    currentSpeed = Math.min(1, currentSpeed + dt / ACCEL_RATE);
    if (currentSpeed >= 1) scrollState = 'scrolling';
  } else if (scrollState === 'decelerating') {
    currentSpeed = Math.max(0, currentSpeed - dt / DECEL_RATE);
    if (currentSpeed <= 0) scrollState = 'stopped';
  }

  if (currentSpeed <= 0) return;

  const pxPerFrame = BASE_SCROLL_SPEED * dt * currentSpeed;

  for (const ts of tilingSprites) {
    ts.tilePosition.x -= pxPerFrame * ts.layerSpeed;
  }
}

/**
 * Resize all tiling sprites to match new canvas dimensions.
 * Called by battle-stage ResizeObserver.
 */
export function resizeParallax(width, height) {
  for (const ts of tilingSprites) {
    ts.width = width;
    ts.height = height;
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/pixi/parallax.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/parallax.js
git commit -m "feat: add parallax.js — 4-layer auto-scrolling background"
```

---

### Task 3: Wire battle stage into game startup and ticker

**Files:**
- Modify: `public/game.js` (entry point — add init call)
- Modify: `public/js/pixi/battle-stage.js` (add ticker wiring + resize callback)

- [ ] **Step 1: Update battle-stage.js — wire ticker to parallax update, resize callback**

Add to `initBattleStage()`, after the ResizeObserver setup:

```js
import { updateParallax, resizeParallax } from './parallax.js';
```

Inside the ResizeObserver callback, after the `app.renderer.resize()` call, add:

```js
resizeParallax(width, height);
```

After the ResizeObserver setup, add the ticker:

```js
app.ticker.add((ticker) => {
  updateParallax(ticker.deltaTime);
});
```

- [ ] **Step 2: Add `initBattleStage()` call to game.js**

In `public/game.js`, find the app initialization (where DOM is ready and modules are set up). Add:

```js
import { initBattleStage } from './pixi/battle-stage.js';
```

Call `await initBattleStage()` early in the init sequence, before any scene rendering.

- [ ] **Step 3: Load parallax when entering an area**

Load parallax based on current run area (fallback to `starter_meadow`) when entering a run area, not on every room phase. Keep this background stable across non-combat room interactions. Add explicit handling for PvP so it does not fall back to `starter_meadow`.

```js
import { loadParallax, setScrollState } from './pixi/parallax.js';

// When entering a new run area (or on run bootstrap):
const areaId = mapRunAreaToParallaxId(gameState.run?.currentArea) || 'starter_meadow';
await loadParallax(areaId);
setScrollState('scrolling');

// When entering PvP battle:
await loadParallax('pvp_arena');
setScrollState('stopped');
```

- [ ] **Step 4: Test manually — start dev server, verify canvas appears**

```bash
npm run dev
```

Open browser, check that:
1. Canvas appears inside `.scene-area`
2. No console errors about PixiJS
3. Existing DOM game still renders on top

- [ ] **Step 5: Commit**

```bash
git add public/js/pixi/battle-stage.js public/game.js
git commit -m "feat: wire PixiJS battle stage into game init and ticker"
```

---

### Task 4: Create placeholder parallax assets

**Files:**
- Create: `public/assets/backgrounds/starter_meadow/sky.webp`
- Create: `public/assets/backgrounds/starter_meadow/far.webp`
- Create: `public/assets/backgrounds/starter_meadow/mid.webp`
- Create: `public/assets/backgrounds/starter_meadow/ground.webp`

- [ ] **Step 1: Generate or source placeholder parallax layers**

For MVP, create 4 simple tileable placeholder images (2048×800px WebP):
- `sky.webp` — solid gradient (light blue to white), opaque
- `far.webp` — simple hill silhouettes, transparent top
- `mid.webp` — tree silhouettes, transparent top
- `ground.webp` — grass/path strip, transparent top

Generate via Gemini 3.1 Pro (`@google/generative-ai` SDK, key at `data/.creature-forge-gemini-key`) — same pipeline as creature sprites. Use BiRefNet for background removal on `far`, `mid`, `ground` layers. The key requirement is **tileable** (left edge meets right edge seamlessly).

Save to: `public/assets/backgrounds/starter_meadow/`

- [ ] **Step 2: Test parallax scrolling**

```bash
npm run dev
```

Verify in browser:
1. 4 layers visible, stacked correctly (sky behind, ground in front)
2. Layers scroll at different speeds (sky slowest, ground fastest)
3. Layers tile seamlessly when scrolling

- [ ] **Step 3: Commit**

```bash
git add public/assets/backgrounds/starter_meadow/
git commit -m "feat: add placeholder parallax assets for starter_meadow"
```

---

### Task 5: Remove old background and performance-killing CSS

**Files:**
- Modify: `public/game.css` (remove `.game-app` background animations, `backdrop-filter`)
- Modify: `public/index.html` (remove `scene-background` div, screen-flash/vignette overlays)
- Modify: `public/js/dom.js` (remove `sceneBackground` reference)
- Modify: `public/js/ui/scene.js` (remove `setBackground()` DOM logic)

- [ ] **Step 1: Remove `.game-app` background animations from game.css**

Find and remove the `animation: action-area-gradient 12s ease infinite` from `.game-app` (around line 119). Remove the `.game-app::before` pseudo-element with `animation: action-area-particles 60s linear infinite` (around lines 122-138). Remove the `@keyframes action-area-gradient` and `@keyframes action-area-particles` keyframe blocks.

Replace `.game-app` background with a simple static background:

```css
.game-app {
  background: #f0efe8;
  /* Removed: animated gradient and particle pseudo-element */
}
```

- [ ] **Step 2: Remove `backdrop-filter` from canvas-overlaying elements**

Find `.area-header-pill` and remove `backdrop-filter: blur(10px)` and `-webkit-backdrop-filter: blur(10px)`. Replace with `background: rgba(0, 0, 0, 0.7)` or similar opaque background.

Find `.enemy-info` and do the same — remove `backdrop-filter`, use solid semi-transparent background.

Find any `.overlay.glass` rules and remove `backdrop-filter`.

- [ ] **Step 3: Remove `scene-background` div from index.html**

In `public/index.html`, remove:
```html
<div class="scene-background" id="scene-background"></div>
```

Also remove the combat effect overlay divs (now handled by PixiJS overlay layer):
```html
<div class="screen-flash-overlay" id="screen-flash-overlay"></div>
<div class="vignette-overlay" id="vignette-overlay"></div>
```

- [ ] **Step 4: Remove `sceneBackground` from dom.js**

In `public/js/dom.js`, remove the `sceneBackground` entry from the DOM cache object (around line 30).

- [ ] **Step 5: Update `setBackground()` in scene.js**

Replace the current DOM-based `setBackground()` with a compatibility shim. During migration, this function should not trigger per-room background swaps; parallax is loaded from run-area transitions.

```js
import { loadParallax } from '../pixi/parallax.js';

export function setBackground(imagePath) {
  // Compatibility: callers still invoke setBackground() for legacy room phases.
  // Non-combat room transitions intentionally do not swap background.
  // Area parallax is loaded separately on area entry.
  //
  // Allow explicit PvP override while migration is in progress.
  if (imagePath?.includes('pvp-arena')) {
    loadParallax('pvp_arena');
    return;
  }
  return;
}
```

- [ ] **Step 6: Remove old CSS for `.scene-background` and view transitions**

Remove from game.css:
```css
.scene-background { ... }
::view-transition-old(scene-background) { ... }
::view-transition-new(scene-background) { ... }
@keyframes fade-out { ... }
@keyframes fade-in { ... }
```

- [ ] **Step 7: Test — game loads, parallax shows, no old background**

```bash
npm run dev
```

Verify:
1. No gradient animation on the app background
2. No frosted glass effects on header pill / enemy info
3. Parallax canvas is the background
4. Existing DOM elements (formations, buttons) still render on top
5. No console errors about missing DOM elements

- [ ] **Step 8: Run tests**

```bash
npm test
```

Fix any failing tests due to removed DOM elements.

- [ ] **Step 9: Commit**

```bash
git add public/game.css public/index.html public/js/dom.js public/js/ui/scene.js
git commit -m "feat: replace DOM background with PixiJS parallax, kill perf-draining CSS"
```

---

### Task 6: Connect scroll state to game phases

**Files:**
- Modify: `public/game.js` or phase transition logic
- Modify: `public/js/pixi/parallax.js` (if needed)

- [ ] **Step 1: Map game phases to scroll states**

Find where game phase transitions happen (likely in `game.js` or a phase handler). When the phase changes, call `setScrollState()`:

```js
import { setScrollState } from './pixi/parallax.js';

// Phase transition handler:
function onPhaseChange(newPhase) {
  switch (newPhase) {
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
      break;
    case 'room_encounter':
      setScrollState('decelerating');
      break;
    case 'combat':
    case 'victory':
    case 'defeat':
    case 'pvp_battle':
      setScrollState('stopped');
      break;
    default:
      // Conservative fallback
      setScrollState('stopped');
      break;
  }
}
```

The exact integration point depends on how phases are managed — check `game.js` for phase change callbacks or event listeners.

- [ ] **Step 2: Add 'accelerating' state on post-encounter resume**

When transitioning from combat/NPC back to room exploration, use `'accelerating'` instead of jumping straight to `'scrolling'`:

```js
// After combat victory or NPC dismissal:
setScrollState('accelerating');
```

- [ ] **Step 3: Test phase transitions**

Play through the game: start exploring (scrolling), hit an encounter (decelerate), enter combat (stopped), win (accelerate back), then enter a non-combat room and confirm scroll continues with no background swap.

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat: connect parallax scroll state to game phase transitions"
```

---

**Phase 1 ship gate:** Parallax background scrolls behind the existing DOM game. Scroll decelerates/stops only for encounter/combat phases. Non-combat room interactions keep the same area parallax with no background swaps.

---

## Chunk 2: Phase 2 — Creatures Move to Canvas

### Task 7: Create formation.js — creature sprite management

**Files:**
- Create: `public/js/pixi/formation.js`

- [ ] **Step 1: Create `public/js/pixi/formation.js`**

```js
/**
 * @file formation.js — Creature sprite positioning + walking animation
 *
 * Renders creature formations (player and enemy) as PixiJS Sprites.
 * Handles diagonal stagger, depth scaling, walking wobble, and state transitions.
 */

import { Sprite, Assets, Container, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';

const DEPTH_SCALES = [0.9, 0.95, 1.0]; // back, mid, front
const PLAYER_STAGGER_X = [12, 24, 36]; // px offset per row
const ENEMY_STAGGER_X = [-12, -24, -36]; // mirrored

let playerContainer = null;
let enemyContainer = null;
let creatureSprites = { player: [], enemy: [] };
let lastFormationInput = { player: null, enemy: null };
let walkingEnabled = false;
let walkTime = 0;

/**
 * Initialize formation containers. Called once from battle-stage init.
 */
export function initFormations() {
  const { layers } = getStage();
  if (!layers.creatures) return;

  playerContainer = new Container();
  enemyContainer = new Container();
  layers.creatures.addChild(playerContainer);
  layers.creatures.addChild(enemyContainer);
}

/**
 * Render a formation of creatures.
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 * @param {{ isBoss?: boolean }} opts
 */
export async function showFormation(side, creatures, { isBoss = false } = {}) {
  const { app } = getStage();
  if (!app) return;

  const container = side === 'player' ? playerContainer : enemyContainer;
  const sprites = creatureSprites[side];
  lastFormationInput[side] = {
    creatures: creatures ? [...creatures] : [],
    opts: { isBoss },
  };

  // Clear existing
  container.removeChildren();
  sprites.length = 0;

  if (!creatures || creatures.length === 0) return;

  // Slot placement: 1->middle, 2->top+bottom, 3->all three
  let slots;
  if (creatures.length === 1) {
    slots = [null, creatures[0], null];
  } else if (creatures.length === 2) {
    slots = [creatures[0], null, creatures[1]];
  } else {
    slots = [creatures[0], creatures[1], creatures[2]];
  }

  const staggerX = side === 'player' ? PLAYER_STAGGER_X : ENEMY_STAGGER_X;
  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const spriteSize = isBoss ? 120 : 60;

  // Base X position: player on left third, enemy on right third
  const baseX = side === 'player' ? screenW * 0.25 : screenW * 0.75;

  for (let i = 0; i < slots.length; i++) {
    const creature = slots[i];
    if (!creature) continue;

    // Load sprite texture
    const spritePath = creature.spriteImg || `/assets/sprites/creatures/${creature.id}.webp`;
    let texture;
    try {
      texture = await Assets.load(spritePath);
    } catch {
      texture = Texture.WHITE; // Fallback — will show as white square
    }

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = spriteSize;
    sprite.height = spriteSize;

    // Position: staggered diagonally
    const rowY = (screenH * 0.3) + (i * screenH * 0.2); // spread vertically
    sprite.x = baseX + staggerX[i];
    sprite.y = rowY;

    // Depth scaling
    sprite.scale.set(DEPTH_SCALES[i] * (spriteSize / texture.width));

    // Flip enemy sprites
    if (side === 'enemy') {
      sprite.scale.x *= -1;
    }

    // Store base position for walking animation
    sprite.baseX = sprite.x;
    sprite.baseY = sprite.y;
    sprite.phaseOffset = Math.random() * Math.PI * 2; // Random phase so they don't sync
    sprite.creatureData = creature;

    // KO state
    if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
      sprite.alpha = 0.3;
      sprite.tint = 0x888888;
    }

    container.addChild(sprite);
    sprites.push(sprite);
  }
}

/**
 * Hide a formation.
 * @param {'player'|'enemy'} side
 */
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
}

/**
 * Enable/disable walking wobble.
 */
export function setWalking(enabled) {
  walkingEnabled = enabled;
}

/**
 * Get a creature sprite by side and index (for targeting effects).
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @returns {Sprite|null}
 */
export function getCreatureSprite(side, index) {
  return creatureSprites[side]?.[index] || null;
}

/**
 * Ticker update — walking wobble animation.
 * @param {number} delta - PixiJS ticker deltaTime
 */
export function updateFormations(delta) {
  walkTime += delta * 0.05;

  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (sprite._entering) {
        sprite.x += (sprite._enterTarget - sprite.x) * 0.1;
        if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
          sprite.x = sprite._enterTarget;
          sprite.baseX = sprite._enterTarget;
          sprite._entering = false;
        }
        continue;
      }
      if (!walkingEnabled) continue;
      const t = walkTime + sprite.phaseOffset;
      // Bounce: 2px amplitude
      sprite.y = sprite.baseY + Math.sin(t * 3) * 2;
      // Rotation wobble: ~4.5 degrees
      sprite.rotation = Math.sin(t * 2.5) * 0.08;
    }
  }
}

/**
 * Reposition formations after resize.
 */
export async function resizeFormations(width, height) {
  // Re-render active formations so iOS Safari address-bar resize/orientation
  // keeps sprite coordinates aligned with the new viewport.
  if (lastFormationInput.player) {
    await showFormation('player', lastFormationInput.player.creatures, lastFormationInput.player.opts);
  }
  if (lastFormationInput.enemy) {
    await showFormation('enemy', lastFormationInput.enemy.creatures, lastFormationInput.enemy.opts);
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/pixi/formation.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add formation.js — PixiJS creature sprite rendering with walking wobble"
```

---

### Task 8: Wire formations into battle-stage ticker and init

**Files:**
- Modify: `public/js/pixi/battle-stage.js`

- [ ] **Step 1: Import and wire formation module**

Add to `battle-stage.js`:

```js
import { initFormations, updateFormations, resizeFormations } from './formation.js';
```

In `initBattleStage()`, after creating layer containers:

```js
initFormations();
```

In the ticker callback:

```js
app.ticker.add((ticker) => {
  updateParallax(ticker.deltaTime);
  updateFormations(ticker.deltaTime);
});
```

In the ResizeObserver callback:

```js
resizeFormations(width, height);
```

- [ ] **Step 2: Commit**

```bash
git add public/js/pixi/battle-stage.js
git commit -m "feat: wire formation rendering into battle-stage ticker"
```

---

### Task 9: Replace DOM formation rendering with PixiJS

**Files:**
- Modify: `public/js/ui/scene.js` — replace `showFormation()` body to call PixiJS version
- Modify: `public/js/pixi/formation.js` — adjust as needed

- [ ] **Step 1: Replace `showFormation()` in scene.js**

The current `showFormation()` in `scene.js` (lines 79-213) builds DOM elements. Replace it with a hybrid path: render creature visuals on PixiJS while preserving DOM formation slots as semantic compatibility anchors (`.formation-slot`) so existing callers (combat-loop.js, pvp-battle.js, room-transition.js, game.js, creature-row.js) continue to work unchanged during migration.

```js
import { showFormation as pixiShowFormation, hideFormation as pixiHideFormation, setWalking } from '../pixi/formation.js';

export async function showFormation(side, creatures, { isBoss = false, force = false } = {}) {
  // Keep DOM slot anchors for modules that still query .formation-slot
  renderFormationAnchors(side, creatures, { isBoss, force });
  await pixiShowFormation(side, creatures, { isBoss });
}

export function hideFormation(side) {
  clearFormationAnchors(side);
  pixiHideFormation(side);
}
```

Keep/rename only the DOM anchor pieces (`.formation-slot` structure, data-index, status icon container, HP/MP bars needed by existing UI logic). Remove DOM sprite visuals that are now redundant.

**Keep** all the NPC display functions (`showNpcInDisplay`, `showShrineFox`, etc.) and HUD functions (`updateEnemyHP`, `showToast`, etc.) — these stay DOM for now.

- [ ] **Step 2: Enable walking when scrolling**

In the parallax scroll state handler, toggle walking:

```js
import { setWalking } from './pixi/formation.js';

// When scroll state changes:
if (state === 'scrolling' || state === 'accelerating') {
  setWalking(true);
} else {
  setWalking(false);
}
```

- [ ] **Step 3: Test — creatures appear on canvas**

```bash
npm run dev
```

Start a run, verify:
1. Player creatures appear on the left side of the canvas
2. Enemy creatures appear on the right side
3. Creatures wobble when exploring (scrolling)
4. Creatures stop wobbling during combat
5. PvP still works (uses same `showFormation` export)

- [ ] **Step 4: Keep formation DOM containers as compatibility anchors**

Do **not** remove these yet:
- `#battle-stage`
- `#player-formation`
- `#enemy-formation`

They remain as temporary semantic anchors until Phase 4 cleanup.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Fix any failures in slot-dependent modules (`combat-loop`, `pvp-battle`, `creature-row`, `room-transition`, `speech-bubble`).

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/scene.js public/js/pixi/formation.js public/js/pixi/parallax.js
git commit -m "feat: render formations on Pixi while preserving DOM slot anchors"
```

---

### Task 10: Handle scroll state machine for encounters

**Files:**
- Modify: `public/js/pixi/formation.js` (enemy enter animation)
- Modify: `public/js/pixi/parallax.js` (if needed)

- [ ] **Step 1: Add enemy enter-from-right animation**

When enemies appear during `ROOM_ENCOUNTER` phase, they should walk in from offscreen right. In `showFormation()` for enemy side, start sprites offscreen and tween to position:

```js
// In showFormation, after positioning enemy sprites:
if (side === 'enemy') {
  for (const sprite of sprites) {
    const targetX = sprite.x;
    sprite.x = app.screen.width + 60; // start offscreen right
    // Simple linear tween to target position over 500ms
    // (will use tween.js in Phase 3, for now use ticker-based approach)
    sprite._enterTarget = targetX;
    sprite._entering = true;
  }
}
```

In `updateFormations()`, add enter animation logic:

```js
for (const sprite of creatureSprites[side]) {
  if (sprite._entering) {
    sprite.x += (sprite._enterTarget - sprite.x) * 0.1; // ease toward target
    if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
      sprite.x = sprite._enterTarget;
      sprite.baseX = sprite._enterTarget;
      sprite._entering = false;
    }
    continue; // skip walking wobble during enter
  }
  if (!walkingEnabled) continue;
  // ... existing wobble code
}
```

Important: do not early-return from `updateFormations()` when `walkingEnabled` is false, or enemy enter animations won't run during `decelerating`/`stopped` states.

- [ ] **Step 2: Test encounter flow**

Walk into an encounter room. Verify:
1. Parallax decelerates
2. Enemies slide in from right
3. Parallax stops fully
4. Combat begins with sprites in correct positions

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: enemies enter from offscreen right during encounters"
```

---

**Phase 2 ship gate:** Creatures render on PixiJS canvas with walking wobble. Enemies enter from offscreen. Scroll state machine drives parallax + creature animation. DOM formation slots remain as compatibility anchors; combat still uses DOM effects on top.

---

## Chunk 3: Phase 3 — Combat Effects Move to Canvas

### Task 11: Create tween.js — promise-based animation utility

**Files:**
- Create: `public/js/pixi/tween.js`

- [ ] **Step 1: Create `public/js/pixi/tween.js`**

```js
/**
 * @file tween.js — Lightweight promise-based tweening on PixiJS ticker
 *
 * Interpolates any numeric properties on any object over time with easing.
 * Returns a Promise that resolves when the tween completes.
 */

import { getStage } from './battle-stage.js';

const EASING = {
  linear: t => t,
  easeOut: t => 1 - (1 - t) ** 2,
  easeIn: t => t * t,
  easeInOut: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  elastic: t => {
    if (t === 0 || t === 1) return t;
    return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3));
  },
};

/**
 * Tween properties on a target object.
 * @param {object} target - Object with numeric properties (e.g., PixiJS Sprite)
 * @param {object} props - Target values, e.g. { x: 100, alpha: 0 }
 * @param {{ duration?: number, ease?: string, delay?: number }} opts
 * @returns {Promise<void>}
 */
export function tween(target, props, { duration = 300, ease = 'easeOut', delay: delayMs = 0 } = {}) {
  return new Promise(resolve => {
    const { app } = getStage();
    if (!app) { resolve(); return; }

    const easeFn = EASING[ease] || EASING.easeOut;
    const startValues = {};
    for (const key of Object.keys(props)) {
      startValues[key] = target[key];
    }

    let elapsed = -delayMs;

    const onTick = (ticker) => {
      elapsed += ticker.deltaMS;
      if (elapsed < 0) return; // still in delay

      const t = Math.min(elapsed / duration, 1);
      const eased = easeFn(t);

      for (const key of Object.keys(props)) {
        target[key] = startValues[key] + (props[key] - startValues[key]) * eased;
      }

      if (t >= 1) {
        app.ticker.remove(onTick);
        resolve();
      }
    };

    app.ticker.add(onTick);
  });
}

/**
 * Wait for a duration (like delay() but tied to the PixiJS ticker).
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function wait(ms) {
  return new Promise(resolve => {
    const { app } = getStage();
    if (!app) { resolve(); return; }
    let elapsed = 0;
    const onTick = (ticker) => {
      elapsed += ticker.deltaMS;
      if (elapsed >= ms) {
        app.ticker.remove(onTick);
        resolve();
      }
    };
    app.ticker.add(onTick);
  });
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/pixi/tween.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/tween.js
git commit -m "feat: add tween.js — promise-based PixiJS animation utility"
```

---

### Task 12: Create text.js — BitmapText damage numbers and popups

**Files:**
- Create: `public/js/pixi/text.js`

- [ ] **Step 1: Create `public/js/pixi/text.js`**

```js
/**
 * @file text.js — BitmapText damage numbers and event popups
 *
 * Uses BitmapFont.from() to generate fonts at init.
 * Provides showDamageNumber() and showEventPopup() that render on canvas.
 */

import { BitmapFont, BitmapText } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';

let fontsReady = false;

const DAMAGE_FONT = 'DamageFont';
const POPUP_FONT = 'PopupFont';

/**
 * Initialize bitmap fonts. Call once at battle stage init.
 */
export function initFonts() {
  BitmapFont.from(DAMAGE_FONT, {
      fontFamily: 'Arial',
      fontSize: 32,
      fontWeight: 'bold',
      fill: '#ffffff',
      stroke: { color: '#000000', width: 4 },
    });

  BitmapFont.from(POPUP_FONT, {
    fontFamily: 'Arial',
    fontSize: 18,
    fontWeight: 'bold',
    fill: '#ffffff',
    stroke: { color: '#000000', width: 3 },
  });

  fontsReady = true;
}

/**
 * Show a floating damage number on the canvas.
 * @param {number} amount
 * @param {{ x: number, y: number }} pos - Canvas position
 * @param {{ isCrit?: boolean, isHeal?: boolean, tier?: number }} opts
 */
export async function showDamageNumber(amount, pos, { isCrit = false, isHeal = false, tier = 1 } = {}) {
  const { layers } = getStage();
  if (!layers.effects || !fontsReady) return;

  const text = new BitmapText({
    text: String(Math.abs(amount)),
    style: { fontFamily: DAMAGE_FONT, fontSize: isCrit ? 38 : 28 },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = isHeal ? 0x4CAF50 : isCrit ? 0xFFB300 : 0xFF4444;
  layers.effects.addChild(text);

  // Float up and fade out
  await tween(text, { y: pos.y - 50, alpha: 0 }, { duration: 1000, ease: 'easeOut' });
  text.destroy();
}

/**
 * Show a floating event popup on the canvas.
 * @param {string} message
 * @param {{ x: number, y: number }} pos - Canvas position
 * @param {{ color?: number, direction?: 'up'|'down', duration?: number, size?: 'small'|'normal'|'large' }} opts
 */
export async function showEventPopup(message, pos, {
  color = 0xFFFFFF,
  direction = 'up',
  duration = 1200,
  size = 'normal',
} = {}) {
  const { layers } = getStage();
  if (!layers.effects || !fontsReady) return;

  const fontSize = size === 'large' ? 22 : size === 'small' ? 12 : 16;

  const text = new BitmapText({
    text: message,
    style: { fontFamily: POPUP_FONT, fontSize },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = color;
  layers.effects.addChild(text);

  const dy = direction === 'down' ? 45 : -45;
  await tween(text, { y: pos.y + dy, alpha: 0 }, { duration, ease: 'easeOut' });
  text.destroy();
}

// ============ PRESETS ============

/** Buff applied (amber, floats up) */
export const popupBuff = (pos, text) => showEventPopup(text, pos, { color: 0xFF8F00, direction: 'up' });

/** Debuff applied (purple, floats down) */
export const popupDebuff = (pos, text) => showEventPopup(text, pos, { color: 0x7B1FA2, direction: 'down' });

/** Skill proc (gold, large) */
export const popupSkillProc = (pos, text) => showEventPopup(text, pos, { color: 0xFFD700, size: 'large', duration: 1500 });

/** Type effectiveness (amber, large) */
export const popupEffectiveness = (pos, text) => showEventPopup(text, pos, { color: 0xFFB300, size: 'large', duration: 1500 });

/** Resisted (gray, small) */
export const popupResisted = (pos, text) => showEventPopup(text, pos, { color: 0x9E9E9E, size: 'small' });
```

- [ ] **Step 2: Wire `initFonts()` into battle-stage init**

In `battle-stage.js`, import and call:

```js
import { initFonts } from './text.js';
```

In `initBattleStage()`, after creating layers:

```js
initFonts();
```

- [ ] **Step 2b: Add parity helpers used by existing combat callbacks**

Add Pixi equivalents (or thin wrappers) for currently-used popup APIs so migration does not break callsites that expect these behaviors:
- `showXpPopup(pos, xpAmount)`
- `showLevelUpPopup(pos, newLevel, hpGain, attackGain?)`
- `showHealPopup(pos, healAmount)` (or heal-flavored damage number)
- `showPoisonTick(pos, damage)` and poison-apply label popup

If any helper is deferred, explicitly keep the DOM version in `dom-effects.js` until parity lands, and document the temporary bridge in Task 15.

- [ ] **Step 3: Verify syntax**

```bash
node --check public/js/pixi/text.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/text.js public/js/pixi/battle-stage.js
git commit -m "feat: add text.js — BitmapText damage numbers and event popups"
```

---

### Task 13: Create effects.js — particles, shake, flash, recoil

**Files:**
- Create: `public/js/pixi/effects.js`

- [ ] **Step 1: Create `public/js/pixi/effects.js`**

```js
/**
 * @file effects.js — Canvas combat effects
 *
 * Particle pool, screen shake, screen flash, recoil, hit stop, speed lines.
 * All effects render on the PixiJS effects layer.
 */

import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';

// ============ PARTICLE POOL ============

const MAX_PARTICLES = 200;
let particlePool = [];
let particleContainer = null;

/**
 * Initialize the particle pool. Call once at battle-stage init.
 */
export function initParticles() {
  const { layers } = getStage();
  if (!layers.effects) return;

  particleContainer = new Container();
  layers.effects.addChild(particleContainer);

  // Pre-allocate particle sprites (small white circles)
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = new Sprite(Texture.WHITE);
    p.anchor.set(0.5);
    p.width = 6;
    p.height = 6;
    p.visible = false;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.maxLife = 0;
    particleContainer.addChild(p);
    particlePool.push(p);
  }
}

/**
 * Burst particles outward from a position.
 * @param {{ x: number, y: number }} pos
 * @param {{ count?: number, color?: number, speed?: number, life?: number }} opts
 */
export function burstParticles(pos, { count = 10, color = 0xFFFFFF, speed = 80, life = 400 } = {}) {
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.5;
    const dist = speed + Math.random() * speed * 0.5;
    p.x = pos.x;
    p.y = pos.y;
    p.vx = Math.cos(angle) * dist;
    p.vy = Math.sin(angle) * dist;
    p.tint = color;
    p.alpha = 1;
    p.visible = true;
    p.life = life + Math.random() * 150;
    p.maxLife = p.life;
    p.scale.set(1);
    spawned++;
  }
}

/**
 * Ticker update for particles.
 * @param {number} deltaMS - Milliseconds since last frame
 */
export function updateParticles(deltaMS) {
  for (const p of particlePool) {
    if (!p.visible) continue;
    const dt = deltaMS / 1000;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= deltaMS;
    const t = Math.max(0, p.life / p.maxLife);
    p.alpha = t;
    p.scale.set(t);
    if (p.life <= 0) {
      p.visible = false;
    }
  }
}

// ============ SCREEN SHAKE ============

const SHAKE_CONFIG = {
  light: { intensity: 2, duration: 100 },
  medium: { intensity: 4, duration: 150 },
  heavy: { intensity: 6, duration: 200 },
};

/**
 * Screen shake by offsetting the stage container.
 * @param {'light'|'medium'|'heavy'} intensity
 */
export async function screenShake(intensity = 'medium') {
  const { app } = getStage();
  if (!app) return;

  const config = SHAKE_CONFIG[intensity] || SHAKE_CONFIG.medium;
  const stage = app.stage;
  const dur = config.duration;
  const px = config.intensity;

  const frames = 6;
  const frameDur = dur / frames;
  const offsets = [
    { x: -px, y: px / 2 },
    { x: px, y: -px / 2 },
    { x: -px / 2, y: 0 },
    { x: px / 2, y: 0 },
    { x: 0, y: 0 },
  ];

  for (const offset of offsets) {
    stage.x = offset.x;
    stage.y = offset.y;
    await wait(frameDur);
  }
  stage.x = 0;
  stage.y = 0;
}

// ============ SCREEN FLASH ============

let flashGraphics = null;

/**
 * Initialize screen flash overlay. Call at battle-stage init.
 */
export function initFlash() {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  flashGraphics = new Graphics();
  flashGraphics.alpha = 0;
  layers.overlay.addChild(flashGraphics);
}

/**
 * Flash the screen a color.
 * @param {{ color?: number, duration?: number, count?: number }} opts
 */
export async function screenFlash({ color = 0xFFFFFF, duration = 100, count = 1 } = {}) {
  const { app } = getStage();
  if (!app || !flashGraphics) return;

  flashGraphics.clear();
  flashGraphics.rect(0, 0, app.screen.width, app.screen.height);
  flashGraphics.fill(color);

  for (let i = 0; i < count; i++) {
    flashGraphics.alpha = 0.3;
    await tween(flashGraphics, { alpha: 0 }, { duration, ease: 'easeOut' });
  }
}

// ============ HIT STOP ============

let frozen = false;

export function isFrozen() { return frozen; }

/**
 * Freeze all canvas animations briefly.
 * @param {number} ms
 */
export async function hitStop(ms = 60) {
  frozen = true;
  await wait(ms);
  frozen = false;
}

// ============ RECOIL ============

/**
 * Recoil a sprite with elastic snap-back.
 * @param {Sprite} sprite
 * @param {{ distance?: number, duration?: number, direction?: 'left'|'right' }} opts
 */
export async function recoil(sprite, { distance = 6, duration = 300, direction = 'right' } = {}) {
  if (!sprite) return;
  const dx = direction === 'left' ? -distance : distance;
  const originalX = sprite.x;
  sprite.x = originalX + dx;
  await tween(sprite, { x: originalX }, { duration, ease: 'elastic' });
}

/**
 * Lunge a sprite forward and back.
 * @param {Sprite} sprite
 * @param {{ distance?: number, duration?: number }} opts
 */
export async function lunge(sprite, { distance = 20, duration = 200 } = {}) {
  if (!sprite) return;
  const originalX = sprite.x;
  await tween(sprite, { x: originalX + distance }, { duration: duration / 2, ease: 'easeOut' });
  await tween(sprite, { x: originalX }, { duration: duration / 2, ease: 'easeIn' });
}

// ============ ELEMENT COLORS ============

export const ELEMENT_COLORS = {
  fire: 0xEF5350,
  water: 0x42A5F5,
  wood: 0x66BB6A,
  earth: 0xBCAAA4,
  metal: 0x90A4AE,
  neutral: 0xFFFFFF,
};
```

- [ ] **Step 2: Wire into battle-stage init and ticker**

In `battle-stage.js`:

```js
import { initParticles, updateParticles, initFlash, isFrozen } from './effects.js';
```

In `initBattleStage()`:

```js
initParticles();
initFlash();
```

In the ticker, wrap updates with frozen check:

```js
app.ticker.add((ticker) => {
  if (!isFrozen()) {
    updateParallax(ticker.deltaTime);
    updateFormations(ticker.deltaTime);
  }
  updateParticles(ticker.deltaMS);
});
```

- [ ] **Step 3: Verify syntax**

```bash
node --check public/js/pixi/effects.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/effects.js public/js/pixi/battle-stage.js
git commit -m "feat: add effects.js — particles, shake, flash, recoil, hit stop"
```

---

### Task 14: Update combat-loop.js to use PixiJS effects

**Files:**
- Modify: `public/js/ui/combat-loop.js` — swap imports from DOM effects to PixiJS effects

- [ ] **Step 1: Update imports in combat-loop.js**

Do this in two layers:
1. Keep `combat-loop.js` callback injection contracts intact (especially `showDamageNumber`).
2. Migrate internals to Pixi primitives behind adapters, then remove DOM dependencies incrementally.

`combat-loop.js` has many existing `showDamageNumber(...)` callsites that use callback-injected behavior from `init(callbacks)`. Do **not** replace those with direct imports in one pass.

At the top of `combat-loop.js`, replace:

```js
// OLD:
import { impactEnemyEffect, delay, getDamageTier, ... } from './combat-effects.js';
import { effectiveness, resistedEffectiveness, skillProc, buff, debuff, ... } from './event-popup.js';
```

With:

```js
// NEW (inside combat-loop.js):
import { getDamageTier, getTierClassName } from './combat-effects-util.js'; // pure logic, no DOM
import { screenShake, screenFlash, hitStop, recoil, lunge, burstParticles, ELEMENT_COLORS } from '../pixi/effects.js';
import { popupBuff, popupDebuff, popupSkillProc, popupEffectiveness, popupResisted } from '../pixi/text.js';
import { getCreatureSprite } from '../pixi/formation.js';
```

In `public/game.js`, update the injected callbacks used by `combatLoopUI.init(...)` so the existing `showDamageNumber(...)` calls route to Pixi text/effects under the hood while preserving the current callback signature.

The challenge is that the old code passes DOM elements as targets (e.g., `buff(targetEl, 'ATK ↑')`). The new code needs canvas positions. Create helpers:

```js
function spritePos(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return { x: 0, y: 0 };
  return { x: sprite.x, y: sprite.y };
}

function spritePosFromSlotEl(slotEl) {
  // temporary bridge while compatibility anchors exist
  // map slot dataset.index + side to getCreatureSprite(...)
}
```

Then update each call site. For example:
```js
// OLD: buff(targetEl, text)
// NEW: popupBuff(spritePos('enemy', targetIndex), text)
```

This is a large refactor — go through each call site methodically. Preserve callback contracts first, then tighten signatures only after parity is verified.

- [ ] **Step 2: Extract pure utility functions to keep**

Create `public/js/ui/combat-effects-util.js` with the pure logic functions that don't touch the DOM:

```js
// Do not re-export from combat-effects.js (that file is deleted in Task 15).
// Copy the pure utilities here directly so this module is standalone.
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export function getDamageTier(damage, enemyMaxHp) { /* ... */ }
export function getTierClassName(tier) { /* ... */ }
```

Or inline them (they're small):

```js
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1;
  const percent = (damage / enemyMaxHp) * 100;
  if (percent >= 50) return 4;
  if (percent >= 35) return 3;
  if (percent >= 20) return 2;
  if (percent >= 10) return 1;
  return 0;
}

export function getTierClassName(tier) {
  return ['light', 'normal', 'solid', 'big', 'massive'][tier] || 'normal';
}
```

- [ ] **Step 3: Update composite effect functions**

The main composite effects in combat-loop.js (`executePlayerAttack`, `executeEnemyAttack`) call sequences of effects. Update these to use PixiJS primitives:

```js
// Example: player creature attacks enemy
async function playAttackEffects(attackerSide, attackerIdx, targetSide, targetIdx, element, damage, maxHp) {
  const attackerSprite = getCreatureSprite(attackerSide, attackerIdx);
  const targetSprite = getCreatureSprite(targetSide, targetIdx);
  if (!attackerSprite || !targetSprite) return;

  const tier = getDamageTier(damage, maxHp);
  const color = ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral;

  // Lunge forward
  await lunge(attackerSprite, { distance: 15 });

  // Particles from target
  burstParticles({ x: targetSprite.x, y: targetSprite.y }, { count: 4 + tier * 4, color });

  // Screen shake based on tier
  if (tier >= 1) screenShake(tier >= 3 ? 'heavy' : tier >= 2 ? 'medium' : 'light');

  // Hit stop
  if (tier >= 1) await hitStop(30 + tier * 20);

  // Recoil target
  await recoil(targetSprite, { distance: 2 + tier * 2 });

  // Screen flash for high tiers
  if (tier >= 2) screenFlash({ color, count: tier >= 4 ? 2 : 1 });

  // Damage number
  await showDamageNumber(damage, { x: targetSprite.x, y: targetSprite.y - 30 }, { tier });
}
```

This is a guideline — the exact implementation must match the current call patterns in `combat-loop.js`. Go through each effect call site and translate.

Also migrate/bridge all currently imported `combat-effects.js` functions used outside this one sequence:
- `screenShake`
- `showXpPopup`
- `showLevelUpPopup`
- `healEffect`
- `poisonApplyEffect`
- `poisonTickEffect`

Do not delete `combat-effects.js` until every live import is redirected to either Pixi modules or `dom-effects.js` bridge exports.

- [ ] **Step 4: Test combat flow end-to-end**

```bash
npm run dev
```

Play through several combats. Verify:
1. Attack animations show particles on canvas
2. Damage numbers float up from enemies
3. Screen shake works
4. Buff/debuff popups appear
5. No DOM particles left (no `.combat-particle` divs being created)

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/ui/combat-effects-util.js
git commit -m "feat: combat-loop uses PixiJS effects instead of DOM particles"
```

---

### Task 15: Extract DOM utilities and delete old combat-effects.js

**Files:**
- Create: `public/js/ui/dom-effects.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/economy.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/combat-loop.js` (imports that still need non-Pixi helpers)
- Delete: `public/js/ui/combat-effects.js` (most of it)

- [ ] **Step 1: Create dom-effects.js with extracted DOM utilities**

`exploration.js` imports `pop` and `flashElement`. `economy.js` imports `pop`. `game.js` currently imports `screenShake`, `showXpPopup`, `showLevelUpPopup`, `healEffect`, `poisonApplyEffect`, `recoil`, `pop` from `combat-effects.js`. `combat-loop.js` still uses `poisonTickEffect` until that effect is migrated. Move all still-needed non-Pixi functions to `dom-effects.js` (temporary bridge), then migrate callsites incrementally.

For this migration phase, `dom-effects.js` must expose the same bridge API surface used by live imports before `combat-effects.js` is deleted:
- `screenShake(intensity = 'medium')`
- `flashElement(targets, count = 1)`
- `recoil(targets, distance = 5, direction = 'right')`
- `pop(targets, scale = 1.15)`
- `poisonApplyEffect(targetEl)`
- `poisonTickEffect(targetEl, damage)` (temporary until Pixi poison tick parity lands)
- `healEffect(creatureSlotEl, healAmount)`
- `showXpPopup(creatureSlotEl, xpAmount)`
- `showLevelUpPopup(creatureSlotEl, newLevel, hpGain, attackGain)`

Create `public/js/ui/dom-effects.js`:

```js
/**
 * @file dom-effects.js — DOM-only animation utilities
 *
 * Extracted from combat-effects.js for non-combat modules.
 * Uses anime.js for simple DOM animations.
 */

import { animate as anime } from 'animejs';

/** Pop scale animation */
export function pop(targets, scale = 1.15) {
  return anime(targets, {
    scale: [1, scale, 1],
  }, {
    duration: 200,
    ease: 'outQuad',
  }).finished;
}

/** Flash brightness */
export function flashElement(targets, count = 1) {
  anime(targets, {
    filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
  }, {
    duration: 100,
    loop: count,
    ease: 'outQuad',
  });
}

/** Recoil animation on a DOM element */
export function recoil(targets, distance = 5, direction = 'right') {
  const dx = direction === 'right' ? distance : -distance;
  return anime(targets, {
    translateX: [dx, 0],
  }, {
    duration: 300,
    ease: 'outElastic(1, 0.5)',
  }).finished;
}

// Temporary bridge exports copied from combat-effects.js signatures.
// Keep these available until each callsite is migrated to Pixi equivalents.
export function screenShake(intensity = 'medium') { /* copy existing implementation */ }
export async function poisonApplyEffect(targetEl) { /* copy existing implementation */ }
export async function poisonTickEffect(targetEl, damage) { /* copy existing implementation */ }
export async function healEffect(creatureSlotEl, healAmount) { /* copy existing implementation */ }
export function showXpPopup(creatureSlotEl, xpAmount) { /* copy existing implementation */ }
export function showLevelUpPopup(creatureSlotEl, newLevel, hpGain, attackGain) { /* copy existing implementation */ }
```

- [ ] **Step 2: Update imports in exploration.js, economy.js, game.js**

```js
// exploration.js — change:
// import { pop, flashElement } from './combat-effects.js';
import { pop, flashElement } from './dom-effects.js';

// economy.js — change:
// import { pop } from './combat-effects.js';
import { pop } from './dom-effects.js';

// game.js — change combat-effects.js imports to dom-effects.js for:
// screenShake, showXpPopup, showLevelUpPopup, healEffect, poisonApplyEffect, recoil, pop
//
// combat-loop.js — if poisonTickEffect is not migrated yet, import it from dom-effects.js temporarily
// and remove once Pixi equivalent lands.
```

- [ ] **Step 3: Update event-popup.js — remove spawnParticles dependency**

In `event-popup.js`, the presets call `spawnParticles` from `combat-effects.js`. Since event popups now render on canvas via `pixi/text.js`, the DOM presets in `event-popup.js` are only used by non-combat code (if any). Remove the `spawnParticles` import. If any preset still needs particles, use `burstParticles` from `pixi/effects.js` instead.

```js
// Remove: import { spawnParticles } from './combat-effects.js';
// Remove particle calls from presets, or replace with pixi calls
```

- [ ] **Step 4: Delete combat-effects.js**

Once all imports are redirected, delete the file:

```bash
git rm public/js/ui/combat-effects.js
```

- [ ] **Step 5: Verify no broken imports**

```bash
node --check public/game.js && echo "OK"
node --check public/js/ui/exploration.js && echo "OK"
node --check public/js/ui/economy.js && echo "OK"
node --check public/js/ui/event-popup.js && echo "OK"
node --check public/js/ui/combat-loop.js && echo "OK"
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/dom-effects.js public/js/ui/exploration.js public/js/ui/economy.js public/game.js public/js/ui/combat-loop.js public/js/ui/event-popup.js
git rm public/js/ui/combat-effects.js
git commit -m "refactor: extract DOM effects, delete old combat-effects.js"
```

---

**Phase 3 ship gate:** All combat effects render on PixiJS canvas. No DOM particles, no anime.js in combat path. DOM effects preserved for non-combat UI.

---

## Chunk 4: Phase 4 — Cleanup

### Task 16: Remove dead CSS

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Remove combat particle CSS**

Delete these rule blocks from `game.css`:
- `.combat-particle` (around lines 2540-2548)
- `.energy-orb` (around lines 2551-2559)
- `.energy-trail` (around lines 2562-2570)
- `.speed-line` (around lines 2573-2582)
- `.hit-stop, .hit-stop *` (around lines 2585-2588)

- [ ] **Step 2: Remove damage number CSS**

Delete:
- `.damage-number` and all variants (`.crit`, `.heal`, `.dmg-normal`, `.dmg-solid`, `.dmg-big`, `.dmg-massive`) — around lines 1978-2023
- `@keyframes damage-float` and all variants — around lines 2043-2068

- [ ] **Step 3: Remove event popup CSS**

Delete:
- `.event-popup` and size variants — around lines 4834-4851
- `@keyframes eventPopupFloat` — around lines 4983-4992

- [ ] **Step 4: Remove formation/battle-stage CSS (now canvas-rendered)**

Prerequisite: all `.formation-slot` DOM dependencies have been migrated off compatibility anchors (combat-loop, pvp-battle, creature-row, room-transition, speech-bubble).

Delete:
- `.battle-stage` (around lines 248-259)
- `.formation` (around lines 261-266)
- `.player-formation`, `.enemy-formation` stagger rules (around lines 269-275)
- `.formation-slot`, `.formation-sprite`, `.formation-info`, and all sub-rules (around lines 296-405)
- `.formation-slot` animation keyframes: `@keyframes creature-death`, `@keyframes creature-swap-in` (around lines 407-431)
- `.boss-encounter` (around lines 284-288)
- `.creature-dying`, `.creature-swapping-in`, `.ko`, `.defeated`, `.befriended`, `.level-up-glow` (around lines 408-489)

**Keep:** `.status-icons` and `.status-icon` rules — these may still be needed for DOM HUD status badges.

- [ ] **Step 4b: Remove compatibility formation anchors from markup**

After dependency migration is complete, remove from `public/index.html`:
```html
<div class="battle-stage" id="battle-stage">
  <div class="formation player-formation" id="player-formation"></div>
  <div class="formation enemy-formation" id="enemy-formation"></div>
</div>
```

Then remove `battleStage`, `playerFormation`, `enemyFormation` from `public/js/dom.js`.

- [ ] **Step 5: Remove old background CSS**

Delete:
- `.scene-background` (around lines 219-229)
- View transition keyframes (`::view-transition-old`, `::view-transition-new`, `@keyframes fade-out`, `@keyframes fade-in`) — around lines 232-245
- `#screen-flash-overlay` and `#vignette-overlay` styles (around lines 2520-2536)

- [ ] **Step 6: Remove ultimate effect CSS (unused)**

Delete all `.ultimate-*` rules:
- `.ultimate-tint-overlay`, `.ultimate-particle`, `.ultimate-flame`, `.ultimate-wave`, `.ultimate-droplet`, `.ultimate-crack`, `.ultimate-debris`, `.ultimate-metal-flash`, `.ultimate-shard`, `.ultimate-vine`, `.ultimate-leaf`

- [ ] **Step 7: Verify game still renders correctly**

```bash
npm run dev
```

Check that no visual regressions occurred — all remaining DOM elements should look correct.

- [ ] **Step 8: Commit**

```bash
git add public/game.css
git commit -m "chore: remove dead CSS — particles, damage numbers, formations, backgrounds"
```

---

### Task 17: Update docs and configuration

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.example`

- [ ] **Step 1: Update CLAUDE.md architecture section**

Add a note about the PixiJS battle stage to the Key Directories section:

```markdown
public/js/pixi/           # PixiJS battle stage (parallax, creatures, effects)
```

Add to Coding Conventions:

```markdown
- Battle stage rendering uses PixiJS canvas (public/js/pixi/). Combat effects, creature sprites,
  and parallax backgrounds render on canvas. DOM HUD (HP bars, area header) overlays the canvas.
- anime.js is used for DOM-only animations (speed review, whack-a-mole, room transitions).
  Combat effects use the PixiJS ticker + tween.js.
```

- [ ] **Step 2: Verify Gemini API key exists for asset generation**

Parallax backgrounds are generated via Gemini 3.1 Pro using the same key as creature sprites:

```bash
test -f data/.creature-forge-gemini-key && echo "Gemini key exists" || echo "MISSING — add key to data/.creature-forge-gemini-key"
```

No `.env` changes needed — the generation pipeline already uses this key.

- [ ] **Step 3: Verify anime.js is still needed**

```bash
grep -r "from 'animejs'" public/js/ --include="*.js"
```

Expected: only `speed-review.js`, `whack-a-mole.js`, `room-transition.js`, and `dom-effects.js`. If these are the only consumers, keep the dependency. Do NOT remove it.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

All tests should pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: update CLAUDE.md and .env.example for PixiJS architecture"
```

---

**Phase 4 ship gate:** Clean codebase. No dead CSS. Documentation updated. All tests pass.
