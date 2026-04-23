# Active Creature Golden Glow — Design

**Date:** 2026-04-23
**Scope:** Combat active-creature indicator — `public/js/pixi/formation.js`, `package.json`
**Status:** Approved for implementation

## Problem

Today the "whose turn is it" indicator is a 38px white ring drawn as a `PIXI.Graphics` circle at the active sprite's anchor point (`public/js/pixi/formation.js:185`). It pulses alpha 0.3 → 0.6 at ~0.8s period. Visually it reads as a floating disc sitting on top of the creature rather than as something that makes the creature itself look selected.

## Design

Replace the ring with a warm gold glow that follows the sprite's silhouette. The glow pulses in intensity only; the sprite never moves, scales, or changes color. No ground decal, no ring — just a halo that wraps the creature's shape.

**Always gold.** Same color on every creature, every turn. No per-element tinting.

### Treatment

| Property | Value |
|---|---|
| Color | `0xFFC94A` (warm gold, sits between amber and pale gold) |
| Glow reach (distance) | `14` px |
| Outer strength (pulse) | sweeps `1.2` → `2.8` → `1.2` |
| Inner strength | `0` (no inner glow; we want halo, not fill) |
| Quality | `0.2` (standard performance setting) |
| Alpha | `1.0` |
| Pulse period | `2.0` s, sinusoidal |

### Technique

Use `pixi-filters` `GlowFilter`. It samples the sprite's alpha channel and renders a glow that follows the exact silhouette — the direct PIXI equivalent of the CSS `drop-shadow` treatment used in the approved mockup.

Filter is attached to the active sprite's `.filters` array. When the active creature changes, the filter is removed from the previous sprite and a new one is created for the next.

Alternatives considered and rejected:
- **Stacked sprite duplicate + blur.** More manual, no new dep, but costs an extra sprite copy and blur pass per frame and is harder to tune. Rejected for added complexity.
- **PIXI v8 built-in `BlurFilter` on a tinted duplicate.** Same issues as above; also doesn't give us single-knob pulse control.

### Code change — `public/js/pixi/formation.js`

Replace the current `_showActiveGlow` / `_clearActiveGlow` implementations (lines 185–220). Public API stays identical — `showActiveGlowForScene(scene, index)` and `clearActiveGlowForScene(scene)` — so callers in `public/js/ui/combat-loop.js` and `public/js/ui/befriend.js` need no changes.

```js
import { GlowFilter } from 'pixi-filters';

const GLOW_COLOR = 0xFFC94A;
const GLOW_DISTANCE = 14;
const GLOW_MIN_STRENGTH = 1.2;
const GLOW_MAX_STRENGTH = 2.8;
const GLOW_QUALITY = 0.2;
const GLOW_PERIOD_MS = 2000;

function _showActiveGlow(ctx, index) {
  _clearActiveGlow(ctx);
  const sprite = _getCreatureSprite(ctx, 'player', index);
  const { app } = getApp();
  if (!sprite || !app) return;

  const filter = new GlowFilter({
    distance: GLOW_DISTANCE,
    color: GLOW_COLOR,
    outerStrength: GLOW_MIN_STRENGTH,
    innerStrength: 0,
    quality: GLOW_QUALITY,
    alpha: 1,
  });
  sprite.filters = [filter];

  ctx.activeGlow = { sprite, filter };

  ctx.activeGlowTickFn = () => {
    if (!sprite || sprite.destroyed) return;
    // 0..1..0 over GLOW_PERIOD_MS
    const t = 0.5 + 0.5 * Math.sin((Date.now() / GLOW_PERIOD_MS) * 2 * Math.PI);
    filter.outerStrength =
      GLOW_MIN_STRENGTH + t * (GLOW_MAX_STRENGTH - GLOW_MIN_STRENGTH);
  };
  app.ticker.add(ctx.activeGlowTickFn);
}

function _clearActiveGlow(ctx) {
  const g = ctx.activeGlow;
  if (g?.sprite && !g.sprite.destroyed) {
    g.sprite.filters = [];
  }
  if (g?.filter) {
    g.filter.destroy();
  }
  ctx.activeGlow = null;
  if (ctx.activeGlowTickFn) {
    const { app } = getApp();
    app?.ticker.remove(ctx.activeGlowTickFn);
    ctx.activeGlowTickFn = null;
  }
}
```

Context shape stays compatible: `ctx.activeGlow` becomes `{ sprite, filter }` instead of a `Graphics`, but no external code reads this field. `ctx.activeGlowTickFn` stays identical in shape.

### Dependency add

`package.json`:

```
"pixi-filters": "^6.x"   // version compatible with pixi.js ^8
```

Install: `npm install pixi-filters`. No other code paths use filters today, so this is the only introduction.

## Non-goals

- Enemy active indicator. Enemies currently have no active glow and this change does not introduce one.
- Per-element coloring. Explicitly ruled out.
- Ground decals, rings, particles. Explicitly ruled out.
- Changing the white ring used elsewhere (e.g., tutorial highlights in `public/game.css`). Different system, not in scope.

## Verification

Per `CLAUDE.md` visual-verification rule:

1. `npm run dev`, open `http://localhost:5173`, enter combat.
2. Playwright screenshot of combat with player creature active. Verify gold silhouette halo, no floating ring.
3. Swipe/attack, trigger turn change — verify glow leaves the old creature and attaches to the next.
4. Enter befriend action (はなす) — verify glow persists on the acting creature during the dialogue round.
5. End combat — verify glow clears; no filter remains on any sprite.
6. Confirm PvP combat uses the same indicator (PvE/PvP parity rule in `CLAUDE.md`). `combat-loop.js` is shared, so this should be automatic, but verify.
7. Unit/integration: `npm test` must pass. No new tests required — behavior is visual.
8. Syntax check: `node --check public/js/pixi/formation.js`.

## Risks

- **Filter bounds clipping.** PIXI filters extend a sprite's render region; if any ancestor container has a tight bounds filter or mask, the halo could clip. If observed, set `filter.padding = GLOW_DISTANCE + 2` or increase the filter's own `padding` option.
- **Dead-sprite reference.** If a sprite is destroyed (creature dies or is swapped out) before `_clearActiveGlow` runs, we check `sprite.destroyed` before touching `.filters`. The turn-order callers in `combat-loop.js` call `clearActiveGlowForScene` before any re-formation, so this is defence in depth.
- **Perf.** One sprite, one filter, 60fps is well within budget on both desktop and mobile. No concern.
