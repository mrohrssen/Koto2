# PixiJS Combat Animations Merge — Design Spec

> **Date:** 2026-04-02
> **Status:** Draft
> **Problem:** The `feature/pixi-combat-animations` branch implements the full combat animations spec (9 systems, 1,671 lines of PixiJS code, rewired combat-loop) but was never merged into dev. Meanwhile, dev received critical bug fixes for the pixi modules that the animations branch doesn't have.
> **Solution:** Merge the animations branch into dev, resolving conflicts by taking animations-branch pixi modules, then porting 3 dev-only bug fixes on top.

---

## Branch Inventory

### `feature/pixi-combat-animations` (worktree: `/root/koto-wt-pixi-animations`)

20 commits, fully passing tests (12/12). Implements the full combat animations design spec:

| Module | Lines | What It Does |
|--------|-------|-------------|
| `pixi/effects.js` | 334 | Element particle physics, vignette, drain flow, screen shake/flash, recoil, lunge, hit stop |
| `pixi/status-vfx.js` | 465 | All 8 status effects (poison, sleep, stun, confuse, haste, shield, taunt, ATK buff) |
| `pixi/formation.js` | 276 | Active creature glow, KO animation, level-up animation |
| `pixi/text.js` | 178 | Color-coded damage numbers (5 types), event popups, XP/level-up popups |
| `pixi/banners.js` | 82 | Center-screen "Super effective!" / "Resisted..." banners |
| `pixi/combat-effects-util.js` | 47 | 5-tier impact config (thresholds, shake, particles, flash) |
| `pixi/battle-stage.js` | 97 | App init with vignette support |
| `pixi/parallax.js` | 111 | Parallax (from bakeoff, no dev fixes) |
| `pixi/tween.js` | 81 | Promise-based tweening |
| `ui/dom-effects.js` | 64 | Extracted DOM-only effects for non-combat modules |
| `ui/combat-loop.js` | ~900 | **Fully rewired** — imports from `pixi/` instead of DOM |

Also modifies: `game.js` (pixi formation integration, smart parallax detection), `game.css` (dead CSS removal), `exploration.js` + `economy.js` (import path updates to `dom-effects.js`).

### `dev` (main working branch)

Has 3 critical fixes applied after the branches diverged:

| Fix | Commit | Module | Impact if Lost |
|-----|--------|--------|----------------|
| Parallax viewport scaling | `044d702` | `parallax.js` | Textures render at 1:1 on mobile — only top-left corner visible |
| BitmapFont cache warnings | `91507c0` | `text.js`, `battle-stage.js` | Console spam on every damage number |
| Async race condition guards | (in bakeoff merge) | `formation.js`, `parallax.js` | Stale async loads can overwrite current formation |

Dev also has `sameFormation()` cache optimization in `formation.js` that prevents redundant re-renders.

---

## Conflict Analysis

7 files conflict. For each, the resolution strategy:

### 1. `pixi/effects.js` — Take animations ✅

Animations is a strict superset. Adds element particle behaviors, vignette overlay, directed particle flow. Dev has nothing unique.

### 2. `pixi/tween.js` — Take animations ✅

Functionally identical between branches. No fixes to port.

### 3. `pixi/battle-stage.js` — Take animations, then port dev's error handling

**From animations:** `initVignette()` call (new).
**Port from dev:** Wrap `initBattleStage()` body in try-catch with `console.error` + `app = null` fallback.

Note: Dev's `initFonts()` call is NOT ported because animations uses `Text` instead of `BitmapText`, making `initFonts()` unnecessary. This is a deliberate design choice, not a missing fix.

### 4. `pixi/parallax.js` — Take animations, then port 2 dev fixes

**Port from dev:**
1. **tileScale viewport scaling** — Add `const scale = h / texture.height;` + `ts.tileScale.set(scale, scale)` in `loadParallax()` after TilingSprite creation. Add scale recalculation in `resizeParallax()`.
2. **Request ID tracking** — Add `let loadRequestId = 0` and early-return guard `if (requestId !== loadRequestId) return` after async texture loads to prevent stale loads from overwriting current parallax.

### 5. `pixi/text.js` — Take animations ✅

Animations uses `Text` (canvas-rasterized) instead of dev's `BitmapText`. Both work correctly. The BitmapFont cache warning fix from dev is irrelevant since animations doesn't use BitmapFont. Text approach is simpler and supports arbitrary characters without pre-defined glyph sets.

### 6. `pixi/formation.js` — Take animations, then port 2 dev features

**From animations:** `showActiveGlow()`, `clearActiveGlow()`, `animateKO()`, `animateLevelUp()`.
**Port from dev:**
1. **`sameFormation()` cache check** — Prevents redundant full re-renders when `showFormation()` is called with identical creature data. Add the function and the early-return in `showFormation()`.
2. **Request ID tracking** — Add per-side `loadRequestId` counter and early-return guard after async sprite loads. Prevents race conditions when rapid formation changes occur.

Note: Dev has enemy entrance animation (sprites enter from offscreen right). Animations branch removed this. The entrance animation should be preserved — it's part of the encounter feel.

### 7. `game.js` — Take animations, then reconcile PvP parallax

**From animations:** Smart parallax detection in `updateScene()`, pixi formation show/hide, `setScrollState('decelerating')` in `startEncounter()`, removed `lastParallaxAreaKey`/`syncParallaxScrollWithPhase` (logic moved to pixi modules).
**Port from dev:** `onPvpBattleStart` callback in pvpBattleUI.init() that loads PvP arena parallax. Animations removed this — it should be preserved.

### Non-conflicting files (auto-merge)

| File | Change |
|------|--------|
| `ui/combat-loop.js` | Animations version (fully rewired to pixi imports) |
| `ui/dom-effects.js` | New file (extracted DOM effects) |
| `ui/exploration.js` | Import path update |
| `ui/economy.js` | Import path update |
| `game.css` | Dead CSS removal |
| `pixi/combat-effects-util.js` | New file |
| `pixi/banners.js` | New file |
| `pixi/status-vfx.js` | New file |
| Background assets | New webp files for starter_meadow + hajimari-no-hiroba |

---

## Merge Procedure

### Step 1: Start merge, resolve conflicts

```
git merge feature/pixi-combat-animations
```

For each conflict: take animations branch version (`--theirs` for pixi/ files), manual merge for `game.js`.

### Step 2: Port parallax viewport scaling fix

In `pixi/parallax.js`:
- Add `const scale = h / texture.height;` before TilingSprite creation in `loadParallax()`
- Add `ts.tileScale.set(scale, scale);` after TilingSprite creation
- Add scale recalculation + `tileScale.set()` in `resizeParallax()`

### Step 3: Port request ID tracking

In `pixi/parallax.js`:
- Add `let loadRequestId = 0;`
- Increment at start of `loadParallax()`: `const requestId = ++loadRequestId;`
- Guard after async loads: `if (requestId !== loadRequestId) return;`

In `pixi/formation.js`:
- Add `const loadRequestId = { player: 0, enemy: 0 };`
- Increment at start of `showFormation()`: `const requestId = ++loadRequestId[side];`
- Guard after async sprite loads: `if (requestId !== loadRequestId[side]) return;`

### Step 4: Port sameFormation() cache

In `pixi/formation.js`:
- Add `sameFormation(prev, creatures, isBoss)` function
- Add early-return in `showFormation()` when formation data matches cached input

### Step 5: Port battle-stage error handling

In `pixi/battle-stage.js`:
- Wrap `initBattleStage()` body in try-catch
- On error: `console.error('[BattleStage] Init FAILED:', err); app = null;`

### Step 6: Port enemy entrance animation

In `pixi/formation.js`:
- Restore `sprite._entering`, `sprite._enterTarget`, `sprite.baseX` logic for enemy sprites
- Restore entrance check in `updateFormations()` ticker

### Step 7: Port PvP parallax callback

In `game.js`:
- Add `onPvpBattleStart` callback to `pvpBattleUI.init()` that calls `loadParallax('pvp_arena')` and `setScrollState('stopped')`

### Step 8: Verify

- `npm test` — all tests pass
- `node --check` on all modified JS files
- Manual: confirm parallax scales correctly, formations render, combat effects fire

---

## What Gets Deleted

After merge, these are dead code:
- Most of `ui/combat-effects.js` — combat functions replaced by pixi modules. File may still exist if non-combat modules reference it, but all combat effect exports are dead.
- DOM particle CSS (`.combat-particle`, `.energy-orb`, particle keyframes)
- `#screen-flash-overlay` DOM element usage (replaced by PixiJS Graphics)
- Background animation CSS on `.game-app`

The animations branch already handles cleanup of imports in `exploration.js` and `economy.js` (redirected to `dom-effects.js`).

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Parallax broken on mobile after merge | High if Step 2 missed | tileScale fix is 4 lines, easy to verify |
| Race conditions in formation/parallax | Medium | Request ID pattern is proven, port exactly |
| PvP combat missing parallax | Low | Port the callback from dev's game.js |
| Text rendering quality difference | Low | Animations uses Text (canvas), not BitmapText. Slightly different rendering but tested and working |
| combat-effects.js still imported somewhere | Low | Grep for remaining imports after merge |

---

## Out of Scope

- HUD migration to canvas (stays DOM, positioned from pixi coordinates)
- NPC display canvas migration (future project)
- PvP canvas migration (separate project per original spec)
- Sprite sheet animations (future upgrade)
- Performance optimization (BitmapText conversion) — can revisit if Text rendering is too slow
