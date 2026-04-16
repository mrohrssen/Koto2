# Element Blast Integration — Design Spec

**Date:** 2026-04-04
**Status:** Approved — ready for implementation
**Depends on:** [Element Particle Blasts Design](2026-04-03-element-particle-blasts-design.md) (all 6 elements decided)

## Overview

Wire the 6 element-specific blast animations into the combat system, replacing the generic burst particles with traveling projectiles. Three integration points: normal attacks, chain bounces, and counter attacks. All changes flow through shared code paths so PvE and PvP get blasts automatically.

## Decided Element Blasts

| Element | Style | Key Feel |
|---------|-------|----------|
| Fire | Classic Meteor | Multi-layer fireball, parabolic arc, ember burst |
| Water | Riptide Vortex | Swirling water ring, spiral motion |
| Earth | Earthen Spike Rush | Sequential ground spikes toward target |
| Wood | Razor Leaf | Spinning leaf blade, splits into fragments |
| Metal | Whip Draw | Katana-draw arc (slow→fast), horizontal L-to-R slash |
| Neutral | Energy Bolt | Simple white energy ball, straight line |

Full prototype code for each is documented in the [element blasts design spec](2026-04-03-element-particle-blasts-design.md).

## New Module: `public/js/pixi/element-blasts.js`

Single exported function:

```javascript
fireElementBlast(app, from, to, element, onImpact)
```

- `from`/`to`: `{x, y}` positions (from `spritePos()`)
- `element`: `'fire'` | `'water'` | `'wood'` | `'earth'` | `'metal'` | `'neutral'`
- `onImpact`: callback fired when blast arrives at target
- Dispatches internally to 6 element-specific render functions
- Pure PixiJS rendering — no game state, no DOM dependencies
- Returns a Promise that resolves when the full animation (including post-impact fade) completes

## Integration Point 1: Normal Attacks

**File:** `public/js/ui/combat-loop.js` — `fireCreatureAttackEffect` and `enemyCreatureAttackEffect`

**Current flow:**
1. `pixiLunge` (attacker lurches forward)
2. `burstParticles` at target (element-colored dots)
3. `impactEffect` (shake, flash, damage number, recoil)

**New flow:**
1. `pixiLunge` starts (attacker lurches)
2. Mid-lunge: `fireElementBlast(app, attackerPos, targetPos, element, onImpact)` fires
3. Blast travels to target
4. `onImpact` callback triggers `impactEffect`

**Changes to `impactEffect`:**
- Remove `burstParticles` call — the blast arrival replaces it
- Keep: `hitStop`, `screenShake`, `screenFlash`, `pixiDamageNumber`, `pixiRecoil`

**PvP parity:** Both PvE and PvP flow through `showAttackDisplay` → `fireCreatureAttackEffect` / `enemyCreatureAttackEffect`. No separate PvP work needed.

## Integration Point 2: Chain Hits (Arc Strike / Forked Arc)

**Files:** `public/js/ui/combat-loop.js` — TWO parallel chain hit display sites:
1. Inside `showAttackDisplay` (~line 514) — used by PvP and shared PvE path
2. Inside `showPartySkillProcs` (~line 1746) — used by PvE `playOnePlayerAttackInMoveTurn`

Both must be updated identically.

**Current:** `burstParticles` + `pixiDamageNumber` at chain target position.

**New:**
- `fireElementBlast(app, spritePos('enemy', sourceIndex), spritePos('enemy', targetIndex), element, onImpact)`
- `onImpact` triggers damage number + light shake (not full `impactEffect`)
- Element matches the original attacker's creature element (`atk.moveElement || atk.attackerElement || 'neutral'`)
- Chain hits play **sequentially** (`await` each) so bounces are visible one-by-one — 3-4 hit chains feel epic

**Source tracking:**
- First chain hit sources from `atk.targetIndex` (the original target)
- Subsequent chain hits source from the previous chain's `targetIndex`

**Backend change:** `src/game/combat/party-skill-engine.js` must include `sourceIndex` in chain hit proc records:
- **Arc Strike** (line ~208): `sourceIndex` = the original attack's `targetIndex` (the creature that was just hit)
- **Forked Arc** (line ~256): `sourceIndex` = the previous bounce's `targetIndex` — requires tracking through the bounce loop with a `lastBounceTarget` variable

**Promise wrapping:** The prototype blast functions are fire-and-forget (PixiJS ticker callbacks). Each must be wrapped in a Promise that resolves when the cleanup ticker calls `container.destroy`, so chain hits can `await` each bounce sequentially.

## Integration Point 3: Counter Attacks

**File:** `public/js/ui/combat-loop.js` — counter animation (~line 1826)

**Current:** "COUNTER!" popup → `pixiLunge` → orange `burstParticles` → damage number.

**New:** "COUNTER!" popup → `pixiLunge` → `fireElementBlast(app, defenderPos, attackerPos, 'neutral', onImpact)` → `onImpact` triggers damage number + shake.

Counter is always `'neutral'` element (Energy Bolt) regardless of defending creature's element.

## Files Changed

| File | Change |
|------|--------|
| `public/js/pixi/element-blasts.js` | **New** — 6 element blast functions + dispatcher, Promise-wrapped |
| `public/js/ui/combat-loop.js` | Wire blasts into 4 sites (normal attacks, 2x chain hit sites, counters), remove `burstParticles` from `impactEffect` |
| `src/game/combat/party-skill-engine.js` | Add `sourceIndex` to chain hit proc records (Arc Strike + Forked Arc) |

## What Stays the Same

- `pixiLunge` — attacker still lurches on normal attacks and counters
- `impactEffect` feedback — shake, flash, damage number, recoil all unchanged
- `burstParticles` function itself — still used elsewhere (heals, haste, shields, status procs) — just removed from `impactEffect`
- PvP code paths — no changes needed, shared `showAttackDisplay` covers both modes
- Attack card display, STAB, effectiveness banners — all unchanged
