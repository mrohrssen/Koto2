# PixiJS Combat Animation Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all combat animations in PixiJS with 5-tier impact scaling, element-specific particle physics, effectiveness banners, status effect visuals, and active creature glow.

**Architecture:** Hybrid approach — carry forward 4 audited modules from the `pixi-js-bakeoff` branch (battle-stage, parallax, formation, tween), rewrite 4 effect modules (effects, text, banners, status-vfx), create a bridge layer (combat-effects-util + combat-loop adapter functions), and extract DOM-only effects for non-combat use.

**Tech Stack:** PixiJS v8 (ES modules), anime.js v4 (DOM-only effects), Node.js built-in test runner (node:test), c8 coverage.

**Spec:** `docs/superpowers/specs/2026-04-01-pixijs-combat-animations-design.md`

---

## Chunk 1: Foundation — PixiJS Setup + Audited Modules

### Task 1: Add PixiJS dependency and create pixi/ directory

**Files:**
- Modify: `package.json` (add pixi.js dependency)
- Create: `public/js/pixi/` directory

- [ ] **Step 1: Install pixi.js**

```bash
npm install pixi.js@^8.17.1
```

- [ ] **Step 2: Verify the package was added**

```bash
node -e "require('pixi.js/package.json').version" && echo "OK"
```
Expected: prints version number + "OK"

- [ ] **Step 3: Create pixi directory**

```bash
mkdir -p public/js/pixi
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add pixi.js v8 dependency"
```

### Task 2: Copy and audit battle-stage.js from bakeoff

**Files:**
- Create: `public/js/pixi/battle-stage.js`

Copy the battle-stage module from the bakeoff worktree. This module initializes the PixiJS Application inside `.scene-area` with 4 ordered layers (background → creatures → effects → overlay), handles resize via ResizeObserver, and drives the main ticker loop.

- [ ] **Step 1: Copy battle-stage.js from bakeoff**

```bash
cp /root/koto-wt-pixi-bakeoff/public/js/pixi/battle-stage.js public/js/pixi/battle-stage.js
```

- [ ] **Step 2: Audit the file**

Read `public/js/pixi/battle-stage.js` and verify:
1. Imports from `./parallax.js`, `./formation.js`, `./effects.js` — these will be created in subsequent tasks
2. Creates 4-layer container stack: background, creatures, effects, overlay
3. ResizeObserver drives `resizeParallax()` and `resizeFormations()`
4. Ticker respects `isFrozen()` for hit stop — frozen skips parallax/formation updates but still updates particles
5. `getStage()` exports `{ app, layers }` for other modules to use
6. `destroyBattleStage()` cleans up everything

No changes expected — this module is solid infrastructure.

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/pixi/battle-stage.js && echo "OK"
```

This will fail because the imports reference files that don't exist yet. That's expected — just confirm no syntax errors in the file itself. The import errors resolve as we add the remaining modules.

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/battle-stage.js
git commit -m "feat: add battle-stage.js from pixi bakeoff (audited)"
```

### Task 3: Copy and audit tween.js from bakeoff

**Files:**
- Create: `public/js/pixi/tween.js`

Promise-based tweening utility that interpolates numeric properties on any object using the PixiJS ticker. Returns Promises for async/await sequencing. Also provides `wait(ms)` for ticker-based delays.

- [ ] **Step 1: Copy tween.js from bakeoff**

```bash
cp /root/koto-wt-pixi-bakeoff/public/js/pixi/tween.js public/js/pixi/tween.js
```

- [ ] **Step 2: Audit the file**

Read `public/js/pixi/tween.js` and verify:
1. 5 easing functions: linear, easeOut, easeIn, easeInOut, elastic
2. `tween(target, props, opts)` — interpolates properties, uses ticker.deltaMS, resolves on completion
3. `wait(ms)` — ticker-based delay (better than setTimeout for animation chains)
4. Both functions handle the case where `app` is null (resolve immediately)
5. Delay parameter works (negative elapsed = still waiting)

No changes expected.

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/tween.js
git commit -m "feat: add tween.js from pixi bakeoff (audited)"
```

### Task 4: Copy and audit parallax.js from bakeoff

**Files:**
- Create: `public/js/pixi/parallax.js`

4-layer TilingSprite parallax background with scroll state machine. Layers auto-scroll during exploration and decelerate/stop for combat encounters.

- [ ] **Step 1: Copy parallax.js from bakeoff**

```bash
cp /root/koto-wt-pixi-bakeoff/public/js/pixi/parallax.js public/js/pixi/parallax.js
```

- [ ] **Step 2: Audit the file**

Read `public/js/pixi/parallax.js` and verify:
1. 4 layers: sky (0.1x), far (0.3x), mid (0.6x), ground (1.0x)
2. Scroll states: stopped, scrolling, decelerating, accelerating
3. `loadParallax(areaId)` loads WebP textures from `/assets/backgrounds/{areaId}/`
4. `setScrollState(state)` transitions and syncs creature walking via `setWalking()`
5. `updateParallax(delta)` smoothly interpolates speed during accel/decel
6. `resizeParallax(w, h)` updates TilingSprite dimensions

No changes expected.

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/parallax.js
git commit -m "feat: add parallax.js from pixi bakeoff (audited)"
```

### Task 5: Copy and audit formation.js from bakeoff

**Files:**
- Create: `public/js/pixi/formation.js`

Creature sprite positioning and animation. Loads existing webp sprites as PixiJS Sprites, positions them in a diagonal stagger formation, and animates walking wobble.

- [ ] **Step 1: Copy formation.js from bakeoff**

```bash
cp /root/koto-wt-pixi-bakeoff/public/js/pixi/formation.js public/js/pixi/formation.js
```

- [ ] **Step 2: Audit the file**

Read `public/js/pixi/formation.js` and verify:
1. `showFormation(side, creatures, opts)` — renders 1-3 creature sprites with diagonal stagger
2. `getCreatureSprite(side, index)` — returns a sprite for effect targeting (used by effects.js, combat-loop adapters)
3. Walking wobble: 2px Y bounce + 4.5° rotation, random phase offset per creature
4. KO state: 0.3 alpha + grey tint for dead creatures
5. Depth scaling: 0.9, 0.95, 1.0 for back/mid/front rows
6. Enemy sprites flipped horizontally
7. `resizeFormations()` re-renders on viewport change

No changes expected — active creature glow will be added in a later task.

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add formation.js from pixi bakeoff (audited)"
```

---

## Chunk 2: Core Effects — Particles, Shake, Flash, Movement

### Task 6: Rewrite effects.js with element particle behaviors

**Files:**
- Create: `public/js/pixi/effects.js`
- Test: `tests/unit/ui/combat-effects-util.test.js` (tier logic tested separately in Task 8)

This is the core rewrite. Start from the bakeoff's effects.js but add element-specific particle physics, vignette overlay, and directed particle flow (for drain moves).

- [ ] **Step 1: Write effects.js**

Create `public/js/pixi/effects.js` with the following sections. Use the bakeoff version at `/root/koto-wt-pixi-bakeoff/public/js/pixi/effects.js` as the starting template, then modify:

**Section 1 — Element behavior config (NEW).** Add after the particle pool init:

```javascript
// Element-specific particle physics
const ELEMENT_BEHAVIORS = {
  fire:    { gravity: -80, spread: 0.8, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.0, flickerSpeed: 12 },
  water:   { gravity: 120, spread: 1.4, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.2, flickerSpeed: 0 },
  wood:    { gravity: 30,  spread: 1.0, wobbleFreq: 5, wobbleAmp: 15, fadeRate: 0.8, flickerSpeed: 0 },
  earth:   { gravity: 200, spread: 0.6, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 2.0, flickerSpeed: 0 },
  metal:   { gravity: 0,   spread: 0.4, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.5, flickerSpeed: 20 },
  neutral: { gravity: 0,   spread: 1.0, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.0, flickerSpeed: 0 },
};
```

- `gravity`: px/s² — negative = upward (fire embers rise), positive = downward (water splashes fall)
- `spread`: multiplier on angle range — >1.0 = wider spread, <1.0 = tighter
- `wobbleFreq`/`wobbleAmp`: sinusoidal x-offset for wood leaves
- `fadeRate`: multiplier on base fade speed — >1.0 = faster fade (earth debris), <1.0 = lingers (wood)
- `flickerSpeed`: rapid alpha oscillation Hz — fire flickers, metal sparkles

**Section 2 — Modify `burstParticles` to accept `element` parameter:**

```javascript
export function burstParticles(pos, { count = 10, color = 0xFFFFFF, speed = 80, life = 400, element = 'neutral' } = {}) {
  const behavior = ELEMENT_BEHAVIORS[element] || ELEMENT_BEHAVIORS.neutral;
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const angleRange = Math.PI * 2 * behavior.spread;
    const baseAngle = (angleRange * spawned) / count - angleRange / 2 + Math.PI; // center burst
    const angle = baseAngle + (Math.random() - 0.5) * 0.5;
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
    // Store element behavior on the particle for the update loop
    p._behavior = behavior;
    p._age = 0;
    spawned++;
  }
}
```

**Section 3 — Modify `updateParticles` to apply element physics:**

```javascript
export function updateParticles(deltaMS) {
  const dt = deltaMS / 1000;
  for (const p of particlePool) {
    if (!p.visible) continue;
    const b = p._behavior || ELEMENT_BEHAVIORS.neutral;
    p._age += dt;

    // Apply gravity
    p.vy += b.gravity * dt;

    // Apply wobble (wood leaves)
    if (b.wobbleAmp > 0) {
      p.x += Math.sin(p._age * b.wobbleFreq) * b.wobbleAmp * dt;
    }

    // Position update
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Life + fade
    p.life -= deltaMS;
    const t = Math.max(0, p.life / p.maxLife);
    p.alpha = t;

    // Flicker (fire embers, metal sparks)
    if (b.flickerSpeed > 0) {
      p.alpha *= 0.5 + 0.5 * Math.sin(p._age * b.flickerSpeed * Math.PI * 2);
    }

    // Fade rate affects scale
    p.scale.set(t * (1 / Math.max(b.fadeRate, 0.1)));

    if (p.life <= 0) {
      p.visible = false;
    }
  }
}
```

**Section 4 — Add directed particle flow (for drain moves):**

```javascript
/**
 * Flow particles from source position toward target position (for drain/lifesteal).
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {{ count?: number, color?: number, duration?: number }} opts
 */
export function flowParticles(from, to, { count = 8, color = 0x4CAF50, duration = 600 } = {}) {
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const progress = spawned / count;
    p.x = from.x + (Math.random() - 0.5) * 20;
    p.y = from.y + (Math.random() - 0.5) * 20;
    // Velocity aimed at target with stagger
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const speed = 1000 / (duration / 1000); // px/sec to arrive in ~duration
    const dist = Math.sqrt(dx * dx + dy * dy);
    p.vx = (dx / dist) * speed * (0.7 + Math.random() * 0.6);
    p.vy = (dy / dist) * speed * (0.7 + Math.random() * 0.6);
    p.tint = color;
    p.alpha = 1;
    p.visible = true;
    p.life = duration * (0.8 + progress * 0.4);
    p.maxLife = p.life;
    p.scale.set(0.8);
    p._behavior = ELEMENT_BEHAVIORS.neutral;
    p._age = 0;
    spawned++;
  }
}
```

**Section 5 — Add vignette overlay (for player damage):**

```javascript
let vignetteGraphics = null;

export function initVignette() {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;
  vignetteGraphics = new Graphics();
  vignetteGraphics.alpha = 0;
  layers.overlay.addChild(vignetteGraphics);
}

/**
 * Flash a red vignette on screen edges (player took damage).
 * @param {number} duration - Fade-out duration in ms
 */
export async function showVignette(duration = 200) {
  const { app } = getStage();
  if (!app || !vignetteGraphics) return;
  const w = app.screen.width;
  const h = app.screen.height;

  vignetteGraphics.clear();
  // Draw semi-transparent red rectangles on edges (left, right, top, bottom)
  const thickness = Math.min(w, h) * 0.15;
  vignetteGraphics.rect(0, 0, thickness, h).fill({ color: 0xFF0000, alpha: 0.4 });
  vignetteGraphics.rect(w - thickness, 0, thickness, h).fill({ color: 0xFF0000, alpha: 0.4 });
  vignetteGraphics.rect(0, 0, w, thickness).fill({ color: 0xFF0000, alpha: 0.3 });
  vignetteGraphics.rect(0, h - thickness, w, thickness).fill({ color: 0xFF0000, alpha: 0.3 });

  vignetteGraphics.alpha = 1;
  await tween(vignetteGraphics, { alpha: 0 }, { duration, ease: 'easeOut' });
}
```

**Section 6 — Update `initBattleStage` integration.** The `battle-stage.js` calls `initParticles()` and `initFlash()`. We also need to export `initVignette` and call it from battle-stage. Add `initVignette` to the exports of effects.js.

Update `battle-stage.js` to also call `initVignette()`:

```javascript
// In battle-stage.js, update import:
import { initParticles, updateParticles, initFlash, initVignette, isFrozen } from './effects.js';

// In initBattleStage(), after initFlash():
initVignette();
```

**Everything else from the bakeoff effects.js stays unchanged:** `screenShake`, `screenFlash`, `hitStop`, `isFrozen`, `recoil`, `lunge`, `ELEMENT_COLORS`.

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/effects.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/effects.js public/js/pixi/battle-stage.js
git commit -m "feat: rewrite effects.js with element particle behaviors, vignette, drain flow"
```

### Task 7: Create combat-effects-util.js with tier config

**Files:**
- Create: `public/js/pixi/combat-effects-util.js`
- Test: `tests/unit/ui/combat-effects-util.test.js`

Pure logic module — fully unit testable. Tier calculation and effect config.

- [ ] **Step 1: Write the test file**

Create `tests/unit/ui/combat-effects-util.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDamageTier, getTierClassName, TIER_EFFECTS } from '../../../public/js/pixi/combat-effects-util.js';

describe('getDamageTier', () => {
  it('returns tier 0 for < 10% damage', () => {
    assert.equal(getDamageTier(5, 100), 0);
  });

  it('returns tier 1 for 10-19% damage', () => {
    assert.equal(getDamageTier(15, 100), 1);
  });

  it('returns tier 2 for 20-34% damage', () => {
    assert.equal(getDamageTier(25, 100), 2);
  });

  it('returns tier 3 for 35-49% damage', () => {
    assert.equal(getDamageTier(40, 100), 3);
  });

  it('returns tier 4 for 50%+ damage', () => {
    assert.equal(getDamageTier(60, 100), 4);
  });

  it('returns tier 1 for zero maxHp (safe default)', () => {
    assert.equal(getDamageTier(10, 0), 1);
  });

  it('handles exact threshold boundaries', () => {
    assert.equal(getDamageTier(10, 100), 1); // exactly 10% = tier 1
    assert.equal(getDamageTier(20, 100), 2); // exactly 20% = tier 2
    assert.equal(getDamageTier(35, 100), 3); // exactly 35% = tier 3
    assert.equal(getDamageTier(50, 100), 4); // exactly 50% = tier 4
  });
});

describe('getTierClassName', () => {
  it('maps tiers to CSS class names', () => {
    assert.equal(getTierClassName(0), 'light');
    assert.equal(getTierClassName(1), 'normal');
    assert.equal(getTierClassName(2), 'solid');
    assert.equal(getTierClassName(3), 'big');
    assert.equal(getTierClassName(4), 'massive');
  });

  it('defaults to normal for out-of-range', () => {
    assert.equal(getTierClassName(99), 'normal');
  });
});

describe('TIER_EFFECTS', () => {
  it('has 5 tiers (0-4)', () => {
    assert.equal(TIER_EFFECTS.length, 5);
  });

  it('tier 0 has no shake and no flash', () => {
    assert.equal(TIER_EFFECTS[0].shake, 'none');
    assert.equal(TIER_EFFECTS[0].flash, 'none');
  });

  it('tier 4 has heavy shake and double screen flash', () => {
    assert.equal(TIER_EFFECTS[4].shake, 'heavy');
    assert.equal(TIER_EFFECTS[4].flash, 'screen2x');
  });

  it('particle counts increase with tier', () => {
    for (let i = 1; i < TIER_EFFECTS.length; i++) {
      assert.ok(TIER_EFFECTS[i].particles > TIER_EFFECTS[i - 1].particles);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --test-name-pattern="getDamageTier|getTierClassName|TIER_EFFECTS" 2>&1 | tail -5
```
Expected: FAIL (module not found)

- [ ] **Step 3: Write combat-effects-util.js**

Create `public/js/pixi/combat-effects-util.js`:

```javascript
/**
 * @file combat-effects-util.js — Pure combat utility functions (no DOM, no PixiJS)
 *
 * Tier calculation and effect config for the 5-tier impact system.
 */

const TIER_THRESHOLDS = [10, 20, 35, 50]; // % of enemy HP for tiers 1-4

/**
 * Calculate damage tier based on % of enemy max HP.
 * @param {number} damage
 * @param {number} enemyMaxHp
 * @returns {number} Tier 0-4
 */
export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1;
  const percent = (damage / enemyMaxHp) * 100;
  if (percent >= TIER_THRESHOLDS[3]) return 4;
  if (percent >= TIER_THRESHOLDS[2]) return 3;
  if (percent >= TIER_THRESHOLDS[1]) return 2;
  if (percent >= TIER_THRESHOLDS[0]) return 1;
  return 0;
}

/**
 * Get tier name for CSS class.
 * @param {number} tier
 * @returns {string}
 */
export function getTierClassName(tier) {
  return ['light', 'normal', 'solid', 'big', 'massive'][tier] || 'normal';
}

/**
 * Tier-based effect configuration.
 * Each tier specifies shake intensity, hit stop duration, particle count, and flash type.
 */
export const TIER_EFFECTS = [
  { shake: 'none',   hitStop: 0,   particles: 4,  flash: 'none' },
  { shake: 'light',  hitStop: 30,  particles: 8,  flash: 'none' },
  { shake: 'medium', hitStop: 60,  particles: 12, flash: 'element' },
  { shake: 'heavy',  hitStop: 100, particles: 18, flash: 'both' },
  { shake: 'heavy',  hitStop: 150, particles: 25, flash: 'screen2x' },
];

/**
 * Recoil distance per tier (px).
 */
export const TIER_RECOIL = [2, 4, 6, 7, 8];

/**
 * Damage number font sizes per tier.
 */
export const TIER_FONT_SIZES = [20, 26, 30, 36, 44];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern="getDamageTier|getTierClassName|TIER_EFFECTS" 2>&1 | tail -5
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/pixi/combat-effects-util.js tests/unit/ui/combat-effects-util.test.js
git commit -m "feat: add combat-effects-util with 5-tier config (tested)"
```

---

## Chunk 3: Text System — Damage Numbers, Popups, Banners

### Task 8: Rewrite text.js with color-coded damage numbers and full popup set

**Files:**
- Create: `public/js/pixi/text.js`

Rewrite from the bakeoff version. Key changes:
- Damage numbers use spec colors (red/gold/grey/green/purple) instead of the bakeoff's simpler scheme
- Font sizes scale by tier using `TIER_FONT_SIZES` from combat-effects-util
- Add prefix signs: negative for damage (shown as absolute), "+" for heals
- Poison tick uses purple color

- [ ] **Step 1: Write text.js**

Create `public/js/pixi/text.js`:

```javascript
/**
 * @file text.js — Floating damage numbers and event popups on PixiJS canvas
 *
 * Color scheme:
 * - Red (#FF4444): normal damage
 * - Gold (#FFB300): super effective damage
 * - Grey (#9E9E9E): resisted damage
 * - Green (#4CAF50): healing
 * - Purple (#9C27B0): poison tick
 */

import { Text } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';
import { TIER_FONT_SIZES } from './combat-effects-util.js';

// ============ DAMAGE NUMBER COLORS ============

const DMG_COLORS = {
  normal: '#FF4444',
  superEffective: '#FFB300',
  resisted: '#9E9E9E',
  heal: '#4CAF50',
  poison: '#9C27B0',
};

/**
 * Show a floating damage number on the canvas.
 * @param {number} amount - Damage or heal amount (always displayed as positive)
 * @param {{ x: number, y: number }} pos - Canvas position to spawn at
 * @param {{ tier?: number, type?: 'normal'|'superEffective'|'resisted'|'heal'|'poison' }} opts
 */
export async function showDamageNumber(amount, pos, { tier = 1, type = 'normal' } = {}) {
  const { layers } = getStage();
  if (!layers.effects) return;

  const fontSize = TIER_FONT_SIZES[tier] ?? TIER_FONT_SIZES[1];
  const fill = DMG_COLORS[type] || DMG_COLORS.normal;
  const prefix = type === 'heal' ? '+' : '';

  const text = new Text({
    text: `${prefix}${Math.abs(amount)}`,
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize,
      fontWeight: 'bold',
      fill,
      stroke: { color: '#000000', width: 4 },
    },
  });

  text.anchor.set(0.5);
  text.x = pos.x + (Math.random() - 0.5) * 10; // slight random offset
  text.y = pos.y;
  layers.effects.addChild(text);

  // Pop in then float up and fade
  // Note: PixiJS v8 scale is an ObservablePoint — tween can't set scale.x directly.
  // Use a manual pop via scale.set() then tween position + alpha.
  text.scale.set(1.3);
  tween(text, { alpha: 1 }, { duration: 80 }).then(() => text.scale.set(1));
  await tween(text, { y: pos.y - 55, alpha: 0 }, { duration: 900, ease: 'easeOut' });
  text.destroy();
}

// ============ EVENT POPUPS ============

/**
 * Show a floating event popup on the canvas.
 * @param {string} message
 * @param {{ x: number, y: number }} pos
 * @param {{ color?: string, direction?: 'up'|'down', duration?: number, size?: 'small'|'normal'|'large' }} opts
 */
export async function showEventPopup(message, pos, {
  color = '#FFFFFF',
  direction = 'up',
  duration = 1200,
  size = 'normal',
} = {}) {
  const { layers } = getStage();
  if (!layers.effects) return;

  const fontSize = size === 'large' ? 22 : size === 'small' ? 12 : 16;

  const text = new Text({
    text: message,
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize,
      fontWeight: 'bold',
      fill: color,
      stroke: { color: '#000000', width: 3 },
    },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  layers.effects.addChild(text);

  const dy = direction === 'down' ? 45 : -45;
  await tween(text, { y: pos.y + dy, alpha: 0 }, { duration, ease: 'easeOut' });
  text.destroy();
}

// ============ PRESETS ============

/** Buff applied (amber, floats up) */
export const popupBuff = (pos, text) =>
  showEventPopup(text, pos, { color: '#FF8F00', direction: 'up' });

/** Debuff applied (purple, floats down) */
export const popupDebuff = (pos, text) =>
  showEventPopup(text, pos, { color: '#7B1FA2', direction: 'down' });

/** Skill proc (gold, large) */
export const popupSkillProc = (pos, text) =>
  showEventPopup(text, pos, { color: '#FFD700', size: 'large', duration: 1500 });

/** XP gained popup */
export const showXpPopup = (pos, xpAmount) =>
  showEventPopup(`+${xpAmount} XP`, pos, { color: '#FFD700', size: 'normal' });

/** Level up popup */
export const showLevelUpPopup = (pos, newLevel, hpGain, attackGain) => {
  const parts = [`Lv.${newLevel}!`];
  if (hpGain) parts.push(`HP+${hpGain}`);
  if (attackGain) parts.push(`ATK+${attackGain}`);
  return showEventPopup(parts.join(' '), pos, { color: '#FFD700', size: 'large', duration: 2000 });
};

/** Heal popup (green number via damage number system) */
export const showHealPopup = (pos, healAmount) =>
  showDamageNumber(healAmount, pos, { tier: 1, type: 'heal' });

/** Poison tick popup (purple number) */
export const showPoisonTick = (pos, damage) =>
  showDamageNumber(damage, { x: pos.x, y: pos.y - 10 }, { tier: 0, type: 'poison' });
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/text.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/text.js
git commit -m "feat: rewrite text.js with color-coded damage numbers and full popup set"
```

### Task 9: Create banners.js for effectiveness banners

**Files:**
- Create: `public/js/pixi/banners.js`

Center-screen banners that slam in from top. Two styles: `'super'` (gold, with shake + flash) and `'weak'` (grey, muted).

- [ ] **Step 1: Write banners.js**

Create `public/js/pixi/banners.js`:

```javascript
/**
 * @file banners.js — Center-screen effectiveness banners
 *
 * "Super effective!" slams in with gold text + screen juice.
 * "Resisted..." slides in muted grey.
 */

import { Text } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';
import { screenShake, screenFlash } from './effects.js';

const STYLES = {
  super: {
    fontSize: 32,
    fill: '#FFB300',
    shake: 'heavy',
    holdTime: 800,
  },
  weak: {
    fontSize: 22,
    fill: '#9E9E9E',
    shake: null,
    holdTime: 600,
  },
  levelUp: {
    fontSize: 28,
    fill: '#FFD700',
    shake: null,
    holdTime: 1000,
  },
};

/**
 * Show a center-screen banner with slam-in animation.
 * @param {string} message - Banner text
 * @param {'super'|'weak'|'levelUp'} style - Visual treatment
 * @param {{ elementColor?: number }} opts - Optional element color for flash
 */
export async function showBanner(message, style = 'super', { elementColor } = {}) {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  const config = STYLES[style] || STYLES.weak;

  const text = new Text({
    text: message,
    style: {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: config.fontSize,
      fontWeight: 'bold',
      fill: config.fill,
      stroke: { color: '#000000', width: 5 },
      align: 'center',
    },
  });

  text.anchor.set(0.5);
  text.x = app.screen.width / 2;
  text.y = -50; // start above screen
  text.alpha = 1;
  layers.overlay.addChild(text);

  const centerY = app.screen.height * 0.35;

  // Slam in from top with overshoot
  await tween(text, { y: centerY - 8 }, { duration: 150, ease: 'easeOut' });
  await tween(text, { y: centerY }, { duration: 80, ease: 'easeIn' });

  // Screen juice for super effective
  if (config.shake) {
    screenShake(config.shake);
  }
  if (style === 'super' && elementColor) {
    screenFlash({ color: elementColor, duration: 150 });
  }

  // Hold
  await wait(config.holdTime);

  // Fade out
  await tween(text, { alpha: 0 }, { duration: 300, ease: 'easeOut' });
  text.destroy();
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/banners.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/banners.js
git commit -m "feat: add banners.js for effectiveness center-screen banners"
```

---

## Chunk 4: Status Effect Visuals

### Task 10: Create status-vfx.js with applied + ongoing visuals

**Files:**
- Create: `public/js/pixi/status-vfx.js`

Every status effect gets an applied animation (moment it lands) and an ongoing visual (persistent while active). This module manages ongoing effect sprites/animations attached to creature sprites.

- [ ] **Step 1: Write status-vfx.js**

Create `public/js/pixi/status-vfx.js`:

```javascript
/**
 * @file status-vfx.js — Per-status-effect visual treatments
 *
 * Applied animations (one-shot) and ongoing visuals (persistent per creature).
 * Ongoing effects are rendered as children of the creature sprite container.
 */

import { Graphics, Text, Container } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';
import { burstParticles, screenFlash, ELEMENT_COLORS } from './effects.js';
import { showEventPopup } from './text.js';
import { getCreatureSprite } from './formation.js';

// Track ongoing VFX per creature sprite so we can clean them up
const ongoingVfx = new Map(); // sprite -> { type -> { container, update } }

// ============ APPLIED ANIMATIONS (one-shot) ============

const STATUS_COLORS = {
  poison:  0x9C27B0,
  sleep:   0x5C6BC0,
  stun:    0xFFEB3B,
  confuse: 0xFF9800,
  haste:   0x29B6F6,
  shield:  0x42A5F5,
  team_shield: 0x42A5F5,
  taunt:   0xEF5350,
  temp_attack_flat: 0xFF8F00,
};

const STATUS_LABELS = {
  poison:  'Poisoned!',
  sleep:   'Sleep!',
  stun:    'Stunned!',
  confuse: 'Confused!',
  haste:   'Haste!',
  shield:  'Shield!',
  team_shield: 'Shield!',
  taunt:   'Taunt!',
  temp_attack_flat: 'ATK+',
};

/**
 * Play the "applied" animation for a status effect.
 * @param {'player'|'enemy'} side
 * @param {number} index - Creature slot index
 * @param {string} effectType - e.g. 'poison', 'sleep', 'stun'
 */
export async function playStatusApplied(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  const pos = { x: sprite.x, y: sprite.y };
  const color = STATUS_COLORS[effectType] || 0xFFFFFF;
  const label = STATUS_LABELS[effectType] || effectType;

  // Particle burst in status color
  burstParticles(pos, { count: 8, color, speed: 60, life: 500, element: 'neutral' });

  // Flash the sprite
  if (effectType === 'stun') {
    screenFlash({ color: 0xFFEB3B, duration: 80 });
  }

  // Darken sprite for sleep
  if (effectType === 'sleep') {
    await tween(sprite, { alpha: 0.5 }, { duration: 300, ease: 'easeOut' });
  }

  // Popup text
  const popupColor = '#' + color.toString(16).padStart(6, '0');
  showEventPopup(label, pos, {
    color: popupColor,
    direction: effectType === 'confuse' || effectType === 'taunt' ? 'down' : 'up',
    size: 'normal',
  });

  // Start ongoing visual
  startOngoing(side, index, effectType);
}

/**
 * Remove ongoing visual for a status effect.
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @param {string} effectType
 */
export function clearStatusVfx(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  const vfxMap = ongoingVfx.get(sprite);
  if (!vfxMap || !vfxMap[effectType]) return;

  const vfx = vfxMap[effectType];
  if (vfx.container) {
    vfx.container.destroy({ children: true });
  }
  if (vfx.tickerId) {
    const { app } = getStage();
    app?.ticker.remove(vfx.tickerId);
  }
  delete vfxMap[effectType];

  // Restore sprite state
  if (effectType === 'sleep') {
    sprite.alpha = sprite._koAlpha ?? 1;
  }
  if (effectType === 'confuse') {
    sprite.rotation = 0;
  }
}

/**
 * Clear all ongoing VFX (call on combat end).
 */
export function clearAllStatusVfx() {
  for (const [sprite, vfxMap] of ongoingVfx) {
    for (const type of Object.keys(vfxMap)) {
      const vfx = vfxMap[type];
      if (vfx.container) vfx.container.destroy({ children: true });
      if (vfx.tickerId) {
        const { app } = getStage();
        app?.ticker.remove(vfx.tickerId);
      }
    }
    sprite.alpha = sprite._koAlpha ?? 1;
    sprite.rotation = 0;
  }
  ongoingVfx.clear();
}

// ============ ONGOING VISUALS ============

function startOngoing(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  if (!ongoingVfx.has(sprite)) ongoingVfx.set(sprite, {});
  const vfxMap = ongoingVfx.get(sprite);

  // Don't double-start
  if (vfxMap[effectType]) return;

  const { app, layers } = getStage();
  if (!app) return;

  const entry = { container: null, tickerId: null };

  switch (effectType) {
    case 'poison': {
      // Periodic purple particle puffs (handled during tick, not ongoing ticker)
      break;
    }

    case 'sleep': {
      // Floating Z particles
      const container = new Container();
      container.x = sprite.x;
      container.y = sprite.y - 30;
      layers.effects.addChild(container);
      entry.container = container;

      let elapsed = 0;
      const tickFn = (ticker) => {
        elapsed += ticker.deltaMS;
        // Spawn a Z every 800ms
        if (elapsed > 800) {
          elapsed = 0;
          const z = new Text({
            text: 'Z',
            style: { fontFamily: 'Arial', fontSize: 14, fill: '#5C6BC0', fontWeight: 'bold' },
          });
          z.anchor.set(0.5);
          z.x = (Math.random() - 0.5) * 15;
          z.y = 0;
          container.addChild(z);
          tween(z, { y: -30, alpha: 0 }, { duration: 1500, ease: 'easeOut' }).then(() => z.destroy());
        }
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    case 'stun': {
      // Circling stars above creature
      const container = new Container();
      container.x = sprite.x;
      container.y = sprite.y - 35;
      layers.effects.addChild(container);
      entry.container = container;

      const stars = [];
      for (let i = 0; i < 3; i++) {
        const star = new Text({
          text: '★',
          style: { fontFamily: 'Arial', fontSize: 10, fill: '#FFD700' },
        });
        star.anchor.set(0.5);
        star._angle = (Math.PI * 2 * i) / 3;
        container.addChild(star);
        stars.push(star);
      }

      const tickFn = (ticker) => {
        const dt = ticker.deltaMS / 1000;
        for (const star of stars) {
          star._angle += dt * 3;
          star.x = Math.cos(star._angle) * 15;
          star.y = Math.sin(star._angle) * 8;
        }
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    case 'confuse': {
      // Wobbling sprite rotation (driven by ticker)
      let confuseTime = 0;
      const tickFn = (ticker) => {
        confuseTime += ticker.deltaMS;
        sprite.rotation = Math.sin(confuseTime / 200) * 0.15;
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    case 'haste': {
      // Blue shimmer on sprite
      let hasteTime = 0;
      const tickFn = (ticker) => {
        hasteTime += ticker.deltaMS;
        sprite.tint = hasteTime % 400 < 200 ? 0x88CCFF : 0xFFFFFF;
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    case 'shield':
    case 'team_shield': {
      // Faint glow outline (blue circle around sprite)
      const glow = new Graphics();
      glow.circle(0, 0, 35).stroke({ color: 0x42A5F5, width: 2, alpha: 0.5 });
      glow.x = sprite.x;
      glow.y = sprite.y;
      layers.effects.addChild(glow);
      entry.container = glow;

      const tickFn = (ticker) => {
        glow.alpha = 0.3 + 0.2 * Math.sin(Date.now() / 500);
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    case 'taunt': {
      // Red pulsing outline
      const glow = new Graphics();
      glow.circle(0, 0, 35).stroke({ color: 0xEF5350, width: 2, alpha: 0.6 });
      glow.x = sprite.x;
      glow.y = sprite.y;
      layers.effects.addChild(glow);
      entry.container = glow;

      const tickFn = (ticker) => {
        glow.alpha = 0.3 + 0.3 * Math.sin(Date.now() / 300);
      };
      app.ticker.add(tickFn);
      entry.tickerId = tickFn;
      break;
    }

    default:
      break;
  }

  vfxMap[effectType] = entry;
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/status-vfx.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/status-vfx.js
git commit -m "feat: add status-vfx.js with applied + ongoing visuals for all status effects"
```

---

## Chunk 5: Active Glow, Milestones, DOM Bridge

### Task 11: Add active creature glow to formation.js

**Files:**
- Modify: `public/js/pixi/formation.js`

Add a pulsing glow outline on the player's active creature during move selection.

- [ ] **Step 1: Add glow functions to formation.js**

At the top of the file, add a variable to track the glow:

```javascript
let activeGlow = null;
let activeGlowTickFn = null;
```

Add two new exported functions at the bottom of the file:

```javascript
/**
 * Show a pulsing glow on the active player creature (move selection).
 * @param {number} index - Creature slot index
 */
export function showActiveGlow(index) {
  clearActiveGlow();
  const sprite = getCreatureSprite('player', index);
  const { app, layers } = getStage();
  if (!sprite || !app) return;

  activeGlow = new Graphics();
  activeGlow.circle(0, 0, 38).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
  activeGlow.x = sprite.x;
  activeGlow.y = sprite.y;
  layers.effects.addChild(activeGlow);

  activeGlowTickFn = () => {
    activeGlow.alpha = 0.3 + 0.3 * Math.sin(Date.now() / 400);
  };
  app.ticker.add(activeGlowTickFn);
}

/**
 * Remove the active creature glow.
 */
export function clearActiveGlow() {
  if (activeGlow) {
    activeGlow.destroy();
    activeGlow = null;
  }
  if (activeGlowTickFn) {
    const { app } = getStage();
    app?.ticker.remove(activeGlowTickFn);
    activeGlowTickFn = null;
  }
}
```

Add `import { Graphics } from 'pixi.js';` to the existing import line (it already imports Sprite, Assets, Container, Texture — just add Graphics).

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/formation.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add active creature glow during move selection"
```

### Task 12: Create dom-effects.js for non-combat animations

**Files:**
- Create: `public/js/ui/dom-effects.js`

Extract DOM-only animation utilities from combat-effects.js for non-combat modules (exploration, economy, game). Uses anime.js. Combat effects have moved to PixiJS.

- [ ] **Step 1: Copy dom-effects.js from bakeoff**

```bash
cp /root/koto-wt-pixi-bakeoff/public/js/ui/dom-effects.js public/js/ui/dom-effects.js
```

- [ ] **Step 2: Audit the file**

Read `public/js/ui/dom-effects.js` and verify:
1. `pop()`, `flashElement()`, `recoil()` — anime.js DOM animations
2. `poisonApplyEffect()` — adds CSS class
3. `screenShake` re-exported from `../pixi/effects.js`
4. Does NOT import any combat-only functions

No changes expected.

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/dom-effects.js
git commit -m "feat: add dom-effects.js for non-combat DOM animations"
```

### Task 13: Rewire combat-loop.js to use PixiJS effects

**Files:**
- Modify: `public/js/ui/combat-loop.js`

This is the big integration task. Replace all imports from `./combat-effects.js` and `./event-popup.js` (for combat popups) with imports from the new pixi modules. Add adapter functions that map DOM elements to PixiJS sprite positions.

- [ ] **Step 1: Replace imports at the top of combat-loop.js**

Replace the existing effect imports (lines ~34-50):

```javascript
// OLD:
import {
  impactEnemyEffect,
  delay as effectDelay,
  getDamageTier,
  getTierClassName,
  fireCreatureAttackEffect,
  enemyCreatureAttackEffect,
  showXpPopup,
  showLevelUpPopup,
  poisonTickEffect,
  healEffect,
  spawnParticles,
  flashElement,
  clearFormationTransforms,
  lunge
} from './combat-effects.js';
import { effectiveness, resistedEffectiveness, skillProc, buff, debuff, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```

```javascript
// NEW:
import {
  screenShake, screenFlash, hitStop, recoil as pixiRecoil,
  lunge as pixiLunge, burstParticles, flowParticles, showVignette,
  ELEMENT_COLORS
} from '../pixi/effects.js';
import {
  showDamageNumber, showEventPopup,
  popupBuff, popupDebuff, popupSkillProc,
  showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup,
  showHealPopup, showPoisonTick
} from '../pixi/text.js';
import { showBanner } from '../pixi/banners.js';
import { playStatusApplied, clearStatusVfx, clearAllStatusVfx } from '../pixi/status-vfx.js';
import { getCreatureSprite, showActiveGlow, clearActiveGlow } from '../pixi/formation.js';
import { getDamageTier, TIER_EFFECTS, TIER_RECOIL } from '../pixi/combat-effects-util.js';
import { updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
import { hapticDamageTier } from '../native/index.js';
import { wait } from '../pixi/tween.js';
```

Note: `updateStatusIcons` and `clearAllStatusIcons` stay imported from `event-popup.js` — these render DOM status badges on formation slots and are not moving to canvas.

- [ ] **Step 2: Add adapter functions after the imports**

These map DOM formation slots to PixiJS sprite positions:

```javascript
// ============ PIXI ADAPTER FUNCTIONS ============

/** Get the canvas position of a creature sprite */
function spritePos(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return { x: 0, y: 0 };
  return { x: sprite.x, y: sprite.y };
}

/** Get creature sprite for a DOM formation slot element */
function elToSpriteIndex(el) {
  if (!el) return { side: 'enemy', index: 0 };
  const isPlayer = !!el.closest('#player-formation');
  const side = isPlayer ? 'player' : 'enemy';
  const slots = el.closest(isPlayer ? '#player-formation' : '#enemy-formation')
    ?.querySelectorAll('.formation-slot');
  const index = slots ? Array.from(slots).indexOf(el) : 0;
  return { side, index: Math.max(0, index) };
}

const effectDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

- [ ] **Step 3: Rewrite the core effect functions**

Replace `impactEnemyEffect` calls throughout combat-loop.js. The function no longer lives in combat-effects.js — inline the pixi version as a local function:

```javascript
/**
 * Impact effects on an enemy creature (PixiJS).
 * @param {number} damage
 * @param {'player'|'enemy'} targetSide
 * @param {number} targetIndex
 * @param {number} enemyMaxHp
 * @param {string} element - Attack element for particle color
 * @param {string} effectivenessType - 'normal', 'superEffective', 'resisted'
 */
async function impactEffect(damage, targetSide, targetIndex, enemyMaxHp, element = 'neutral', effectivenessType = 'normal') {
  const tier = getDamageTier(damage, enemyMaxHp);
  const effects = TIER_EFFECTS[tier];
  const pos = spritePos(targetSide, targetIndex);
  const sprite = getCreatureSprite(targetSide, targetIndex);
  const elemColor = ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral;

  // Haptic feedback
  hapticDamageTier(tier);

  // 1. Hit stop
  if (effects.hitStop > 0) await hitStop(effects.hitStop);

  // 2. Particle burst (element-colored with element behavior)
  burstParticles(pos, { count: effects.particles, color: elemColor, speed: 80, life: 400, element });

  // 3. Screen shake
  if (effects.shake !== 'none') {
    screenShake(effects.shake);
    if (tier === 4) {
      await wait(100);
      screenShake('medium');
    }
  }

  // 4. Screen flash (tier 2+)
  if (effects.flash === 'element') {
    screenFlash({ color: elemColor, duration: 100 });
  } else if (effects.flash === 'both') {
    screenFlash({ color: elemColor, duration: 80 });
    await wait(50);
    screenFlash({ color: 0xFFFFFF, duration: 100 });
  } else if (effects.flash === 'screen2x') {
    screenFlash({ color: 0xFFFFFF, duration: 80, count: 2 });
  }

  // 5. Damage number
  showDamageNumber(damage, pos, { tier, type: effectivenessType });

  // 6. Target recoil
  if (sprite) {
    const recoilDir = targetSide === 'enemy' ? 'right' : 'left';
    pixiRecoil(sprite, { distance: TIER_RECOIL[tier], direction: recoilDir });
  }
}
```

Replace `fireCreatureAttackEffect`:

```javascript
/**
 * Player creature attack animation (PixiJS).
 * @param {number} attackerIndex - Player creature slot
 * @param {number} targetIndex - Enemy creature slot
 * @param {string} element - Attack element
 * @param {number} damage
 * @param {number} enemyMaxHp
 * @param {string} effectivenessType
 */
async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal') {
  const attackerSprite = getCreatureSprite('player', attackerIndex);
  const targetPos = spritePos('enemy', targetIndex);

  // 1. Attacker lunge toward enemy
  if (attackerSprite) {
    await pixiLunge(attackerSprite, { distance: 20, duration: 200 });
  }

  // 2. Impact on enemy
  await impactEffect(damage, 'enemy', targetIndex, enemyMaxHp, element, effectivenessType);
}
```

Replace `enemyCreatureAttackEffect`:

```javascript
/**
 * Enemy creature attack animation (PixiJS).
 * @param {number} attackerIndex - Enemy creature slot
 * @param {number} targetIndex - Player creature slot
 * @param {string} element
 * @param {number} damage
 */
async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0) {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);

  // 1. Attacker lunge toward player (negative = left)
  if (attackerSprite) {
    await pixiLunge(attackerSprite, { distance: -20, duration: 200 });
  }

  // 2. Impact on player creature (pass maxHp for proper tier scaling)
  await impactEffect(damage, 'player', targetIndex, playerMaxHp, element);

  // 3. Player vignette
  showVignette(200);
}
```

Replace popup calls:
- `effectiveness(targetEl, 'Super Effective!')` → `showBanner('Super Effective!', 'super', { elementColor: ELEMENT_COLORS[element] })`
- `resistedEffectiveness(targetEl, 'Resisted...')` → `showBanner('Resisted...', 'weak')`
- `skillProc(el, text)` → `popupSkillProc(spritePos(side, index), text)`
- `buff(el, text)` → `popupBuff(spritePos(side, index), text)`
- `debuff(el, text)` → `popupDebuff(spritePos(side, index), text)`

Replace XP/level:
- `showXpPopup(el, amount)` → `pixiXpPopup(spritePos('enemy', index), amount)`
- `showLevelUpPopup(el, ...)` → `pixiLevelUpPopup(spritePos('player', index), ...)`

Replace poison/heal:
- `poisonTickEffect(el, damage)` → `burstParticles(pos, {count:4, color:0x9C27B0, ...}); showPoisonTick(pos, damage);`
- `healEffect(el, amount)` → `burstParticles(pos, {count:6, color:0x4CAF50, element:'wood'}); showHealPopup(pos, amount);`

Replace `spawnParticles(el, count, color)` with `burstParticles(pos, {count, color: ELEMENT_COLORS[element]})` throughout.

Replace `clearFormationTransforms()` calls with no-op (pixi sprites don't have stale CSS transforms).

**Note:** This task is large because combat-loop.js is ~3000 lines with many call sites. Work through it methodically:
1. First update all imports
2. Add the adapter functions
3. Add the new local effect functions (impactEffect, fireCreatureAttackEffect, enemyCreatureAttackEffect)
4. Then search-and-replace individual effect calls throughout the file
5. Wire `showActiveGlow(index)` into the move selection flow (where `setActiveLabel` is called)
6. Wire `clearActiveGlow()` into the move confirmation flow

- [ ] **Step 4: Wire counter-attacks to use pixi effects**

In the `showCounterAttacks(result)` function (~line 1695), replace:
- `skillProc(defenderEl, 'COUNTER!')` → `popupSkillProc(spritePos('player', counter.defenderIndex), 'COUNTER!')`
- `lunge(sprite, 40, 300)` → `pixiLunge(getCreatureSprite('player', counter.defenderIndex), { distance: 40, duration: 300 })`
- `spawnParticles(targetEl, 6, '#FF7043')` → `burstParticles(spritePos('enemy', counter.targetIndex), { count: 6, color: 0xFF7043 })`
- Replace all skill proc popup calls in the counter procs loop similarly

- [ ] **Step 5: Wire drain moves**

Where drain attack results are processed, after the standard attack animation, add:

```javascript
if (atk.healAmount > 0) {
  const targetPos = spritePos('enemy', targetIndex);
  const attackerPos = spritePos('player', attackerIndex);
  flowParticles(targetPos, attackerPos, { count: 8, color: 0x4CAF50, duration: 600 });
  await wait(600);
  showHealPopup(attackerPos, atk.healAmount);
}
```

- [ ] **Step 6: Wire active glow**

Find where the active creature is set for move selection (search for `setActiveLabel` calls) and add:
- `showActiveGlow(creatureIndex)` when a creature's turn begins
- `clearActiveGlow()` when a move is selected/confirmed

- [ ] **Step 7: Wire status effects**

Where status effects are applied in combat results, add:
- `playStatusApplied(side, index, effectType)` for each effect application
- `clearStatusVfx(side, index, effectType)` when effects expire
- `clearAllStatusVfx()` at combat end (alongside `clearAllStatusIcons()`)

- [ ] **Step 8: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/ui/dom-effects.js
git commit -m "feat: rewire combat-loop.js to use PixiJS effects, banners, status VFX"
```

---

## Chunk 6: Integration, Init Wiring, and Cleanup

### Task 14: Wire PixiJS init into game startup

**Files:**
- Modify: `public/game.js` (main game entry — loaded via `<script type="module" src="game.js">` in index.html line 217)
- Modify: `public/js/ui/room-transition.js` (calls `scene.showFormation()` at line 276)
- Modify: `public/js/ui/scene.js` (existing DOM scene module)

The PixiJS battle stage must be initialized at game startup, before combat can begin. The parallax background should load when an area is entered.

**Key locations in `public/game.js`:**
- `startEncounter()` function (line ~962) — triggers combat
- `updateUI()` function (line ~321) — calls `scene.setBackground()` at lines 358-368 based on phase
- Scene imports at top of file

- [ ] **Step 1: Add pixi init to game.js startup**

In `public/game.js`, add imports near the top:

```javascript
import { initBattleStage } from './js/pixi/battle-stage.js';
import { loadParallax, setScrollState } from './js/pixi/parallax.js';
import { showFormation as pixiShowFormation, hideFormation as pixiHideFormation } from './js/pixi/formation.js';
```

Find the game initialization code (the main init/boot function) and add:

```javascript
await initBattleStage();
```

- [ ] **Step 2: Wire parallax loading**

In `updateUI()` (line ~321 of `public/game.js`), where `scene.setBackground()` is called for different phases (lines 358-368), also call `loadParallax(areaId)` with the current area's ID. The area ID is available from `gameState.run.areaId` or similar.

In `startEncounter()` (line ~962), add `setScrollState('decelerating')` when combat begins.

When combat ends (search for `stopCombatLoop` calls), add `setScrollState('accelerating')`.

- [ ] **Step 3: Wire formation rendering**

In `public/js/ui/room-transition.js` at line 276 where `scene.showFormation()` is called, also call `pixiShowFormation()` with the same creature data. The DOM formation containers (`.formation-slot`) must still exist for status icon badges and click targeting — they just won't render visible sprites (hide the `.formation-sprite` img elements via CSS or by not setting src).

- [ ] **Step 4: Test the full flow manually**

```bash
npm run dev
```

Open the game in a browser, enter combat, and verify canvas renders.

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/js/ui/room-transition.js public/js/ui/scene.js
git commit -m "feat: wire PixiJS battle stage into game init and combat flow"
```

### Task 15: Add KO animation and Level Up effects to formation.js

**Files:**
- Modify: `public/js/pixi/formation.js`

The spec requires animated KO (fade to grey + shrink + particle scatter) and Level Up (gold particle fountain + banner). Currently formation.js only handles static KO state.

- [ ] **Step 1: Add animated KO function**

Add to `formation.js`:

```javascript
/**
 * Animate a creature being knocked out (fade to grey, shrink, particles).
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateKO(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  // Import effects lazily to avoid circular dependency
  const { burstParticles } = await import('./effects.js');

  // Fade to grey + shrink over 0.6s
  sprite.tint = 0x888888;
  await Promise.all([
    tween(sprite, { alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(sprite.scale, { x: sprite.scale.x * 0.5, y: sprite.scale.y * 0.5 }, { duration: 600, ease: 'easeIn' }),
  ]);

  // Particle scatter (white, dispersing outward)
  burstParticles(pos, { count: 8, color: 0xFFFFFF, speed: 60, life: 500, element: 'neutral' });
}

/**
 * Animate a creature leveling up (gold fountain + flash).
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateLevelUp(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  const { burstParticles, screenFlash } = await import('./effects.js');

  // Gold particle fountain (upward burst)
  burstParticles({ x: pos.x, y: pos.y + 10 }, { count: 15, color: 0xFFD700, speed: 100, life: 800, element: 'fire' });

  // Brief gold flash on creature
  screenFlash({ color: 0xFFD700, duration: 150 });
}
```

Note: `tween(sprite.scale, ...)` works because PixiJS v8's `ObservablePoint` has settable `.x` and `.y` properties — the tween utility can interpolate them directly. Import tween at the top of the file:

```javascript
import { tween } from './tween.js';
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pixi/formation.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/formation.js
git commit -m "feat: add animated KO and Level Up effects to formation.js"
```

### Task 16: Clean up dead CSS and old animation code

**Files:**
- Modify: `public/game.css`
- Modify: `public/js/ui/exploration.js` (redirect imports)
- **DO NOT DELETE** `public/js/ui/combat-effects.js` — `event-popup.js` imports `spawnParticles` from it for DOM status badge particles. This file must remain importable.

- [ ] **Step 1: Identify dead CSS keyframes**

These CSS keyframes are no longer needed with PixiJS rendering:
- `@keyframes damage-float`, `damage-float-solid`, `damage-float-big`, `damage-float-massive`
- `@keyframes action-area-gradient`, `@keyframes action-area-particles`
- `@keyframes super-effective-anim`, `@keyframes enemy-damage-pop`

Search for them in `game.css` and check if anything still references them. Remove the keyframes and any CSS rules that use them.

- [ ] **Step 2: Remove .game-app background animations**

The `.game-app` gradient cycle (12s) and particle animation (60s) on `::before` are performance drains. Remove them — PixiJS parallax replaces this.

- [ ] **Step 3: Redirect non-combat module imports**

Search for all imports from `combat-effects.js`:

```bash
grep -rn "from.*combat-effects" public/js/ --include="*.js" | grep -v node_modules | grep -v combat-loop
```

For any non-combat modules that import `pop`, `flashElement`, or `recoil` from `combat-effects.js`, redirect those imports to `dom-effects.js` instead. Likely candidates: `exploration.js`, `economy.js`.

Example change in `exploration.js`:
```javascript
// OLD: import { pop, flashElement } from './combat-effects.js';
// NEW: import { pop, flashElement } from './dom-effects.js';
```

**Important:** `event-popup.js` imports `spawnParticles` from `combat-effects.js` — leave this import as-is. `combat-effects.js` must NOT be deleted.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Fix any broken imports or test failures.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "cleanup: remove dead CSS animations, redirect non-combat imports to dom-effects"
```

### Task 17: Final integration test

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

All Tier 1 + 2 tests must pass.

- [ ] **Step 2: Syntax-check all new pixi files**

```bash
for f in public/js/pixi/*.js; do node --check "$f" && echo "OK: $f"; done
```

- [ ] **Step 3: Manual playtest checklist**

Start the dev server and play through a combat encounter. Verify each system:

- [ ] Parallax background scrolls during exploration, decelerates on encounter
- [ ] Creature sprites render on canvas (player left, enemy right)
- [ ] Walking wobble animates during exploration
- [ ] Active creature glow pulses during move selection
- [ ] Attack lunge: attacker moves toward target and returns
- [ ] Element particles: fire drifts up, water arcs down, wood flutters, earth chunks, metal sparks
- [ ] 5-tier impact scaling: small hits are quiet, big hits shake the screen
- [ ] Damage numbers: red for normal, gold for super effective, grey for resisted, green for heal
- [ ] "Super effective!" banner slams in with gold text + shake
- [ ] "Resisted..." banner appears muted grey
- [ ] Status applied: poison purple burst + "Poisoned!" popup
- [ ] Status ongoing: sleep Z's, stun stars, confuse wobble, shield glow, taunt pulse
- [ ] Stat changes: "ATK up!" amber / "DEF down!" purple
- [ ] Counter-attacks: "COUNTER!" popup + lunge + particles
- [ ] Drain moves: green particles flow from target to attacker + heal number
- [ ] Player damage vignette: red edge flash on enemy hit
- [ ] Creature KO: fade to grey + shrink + particle scatter
- [ ] Level up: gold fountain + "Level Up!" banner
- [ ] XP gain: gold floating number
- [ ] Healing: green particles + green number

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from manual playtest"
```
