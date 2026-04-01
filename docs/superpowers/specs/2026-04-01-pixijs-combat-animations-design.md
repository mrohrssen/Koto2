# PixiJS Combat Animation Rebuild — Design Spec

> **Date:** 2026-04-01
> **Status:** Approved
> **Approach:** Hybrid — audit bakeoff infrastructure, rewrite effect modules with full animation inventory

## Problem

The `pixi-js-bakeoff` branch built a complete PixiJS rendering architecture (canvas, parallax, formations, particle pool, tween utility) but the combat animation integration is broken — no effects fire when attacking. The original agent ran out of context and forgot the existing animation inventory. The dev branch still has working DOM/anime.js animations but they cause frame drops on mobile Safari.

## Goal

Rebuild combat animations in PixiJS with upgraded fidelity: 5-tier impact scaling, element-specific particle physics, center-screen effectiveness banners, per-status-effect visuals, and active creature glow. Not a 1:1 port — a visual upgrade backed by a proper rendering engine.

## Module Structure

### Keep from bakeoff (audit, don't rewrite)

| Module | Responsibility |
|--------|---------------|
| `pixi/battle-stage.js` | PixiJS Application init, 4-layer stack (background → creatures → effects → overlay), ResizeObserver, ticker |
| `pixi/parallax.js` | 4-layer TilingSprite auto-scroll with state machine (scrolling/decelerating/stopped/accelerating) |
| `pixi/formation.js` | Creature sprites on canvas, walking wobble, depth scaling, diagonal stagger, KO state |
| `pixi/tween.js` | Promise-based property tweening on PixiJS ticker (linear, easeOut, easeIn, easeInOut, elastic) |

### Rewrite / new

| Module | Responsibility |
|--------|---------------|
| `pixi/effects.js` | Particle pool + element-specific behaviors, screen shake, screen flash, hit stop, recoil, lunge |
| `pixi/text.js` | Floating damage numbers (color-coded), stat change popups |
| `pixi/banners.js` *(new)* | Center-screen effectiveness banners |
| `pixi/status-vfx.js` *(new)* | Per-status-effect applied + ongoing visuals |

### Bridge layer (rewrite)

| Module | Responsibility |
|--------|---------------|
| `pixi/combat-effects-util.js` | 5-tier config table mapping damage % → effect intensity |
| Adapter functions in `combat-loop.js` | Map DOM combat events → pixi effect calls, preserve `hapticDamageTier(tier)` calls alongside PixiJS effects |

### Stays DOM (untouched)

| Module | Responsibility |
|--------|---------------|
| `ui/dom-effects.js` | anime.js effects for non-combat (exploration, economy, UI) |
| `ui/event-popup.js` | Non-combat popups, status icon badges on formation slots |
| HP critical pulse | CSS pulsing class when HP < 25% — stays on DOM HP bar element |

### Call graph

```
combat-loop.js
  ├── calls pixi/effects.js    (particles, shake, flash, hit stop, recoil, lunge)
  ├── calls pixi/text.js       (damage numbers, stat change popups)
  ├── calls pixi/banners.js    (effectiveness banners)
  ├── calls pixi/status-vfx.js (status applied/tick visuals)
  └── uses combat-effects-util.js (tier calculation)
```

## System 1: 5-Tier Attack Impact

Every attack runs the same sequence with intensity scaled by damage tier.

### Tier thresholds

Damage as % of target's max HP:

| Tier | Threshold | Shake | Hit Stop | Particles | Flash | Damage Number Size |
|------|-----------|-------|----------|-----------|-------|--------------------|
| 0 | <10% | none | 0ms | 4 | none | small |
| 1 | 10-20% | light | 30ms | 8 | none | normal |
| 2 | 20-35% | medium | 60ms | 12 | element tint | normal |
| 3 | 35-50% | heavy | 100ms | 18 | element + white | large |
| 4 | 50%+ | heavy | 150ms | 25 | 2x white flash | oversized |

### Attack animation sequence

1. Attacker lunge forward (tween toward target)
2. Hit stop (freeze frame on contact, tier-scaled duration)
3. Particle burst from target (element-colored, element-behavior)
4. Screen shake (tier-scaled intensity)
5. Screen flash (Tier 2+ only, element-colored)
6. Damage number pops from target sprite (color by effectiveness, size by tier)
7. Target recoil (elastic snap-back, tier-scaled distance)
8. Attacker returns to position

## System 2: Element Particle Behaviors

Same particle pool (200 pre-allocated sprites), different physics per element. Each element has a distinct visual signature beyond color.

| Element | Color | Behavior |
|---------|-------|----------|
| Fire | orange-red | Drift upward (negative gravity), flicker alpha — embers rising |
| Water | blue | Arc downward (positive gravity), wide spread — splash droplets |
| Wood | green | Sinusoidal x-wobble, slow fall, slight rotation — leaves scattering |
| Earth | brown/amber | Heavy gravity, short lifetime, fast initial velocity — debris chunks |
| Metal | silver/white | Sharp linear trajectories, rapid alpha oscillation — sparks |
| Neutral | white | Standard radial burst, no special physics — generic impact |

Implementation: an element behavior config table mapping element → gravity, spread angle, wobble frequency, fade rate, and any special per-frame modifiers. The particle update loop applies the behavior's physics each frame. ~40-60 lines of config.

## System 3: Damage Numbers

Pop out of the target creature sprite, float upward, fade out. Classic JRPG style.

### Colors

| Context | Color |
|---------|-------|
| Normal damage | Red |
| Super effective | Gold |
| Not effective / Resisted | Grey |
| Healing | Green |
| Poison tick | Purple |

### Size scaling

Damage number size scales with tier. Tier 0 is small, Tier 4 is oversized. Rendered as PixiJS Text on the effects layer with stroke outline for readability against any background.

## System 4: Effectiveness Banners

Center-screen banners using the same animation pattern: slam in from top with slight overshoot/bounce, hold, fade out. The visual treatment communicates meaning.

| Banner | Text Color/Size | Screen Shake | Screen Flash | Hold Time |
|--------|----------------|--------------|--------------|-----------|
| Super effective! | Gold, large | Heavy | Element color | 800ms |
| Resisted... | Grey, smaller | None | None | 600ms |

The codebase only produces "Resisted..." for sub-1.0 multipliers — there is no separate "Not very effective" event. If a second threshold is added later, it reuses the `'weak'` style.

Implementation: `showBanner(text, style)` in `banners.js` where style is `'super'` or `'weak'`. PixiJS Text on the overlay layer, animated with the tween utility.

**STAB note:** STAB (Same Type Attack Bonus) currently triggers the same "Super effective!" text as type advantage — this is a bug. STAB has no separate visual; its damage boost simply feeds into the tier system for bigger numbers/effects. If a distinct STAB banner is wanted later, it can be added as a new style.

## System 5: Status Effect Visuals

Each status has an **applied** animation (moment it lands) and an **ongoing** visual (while active / each tick).

| Status | Applied Animation | Ongoing Visual |
|--------|------------------|---------------|
| Poison | Purple particle burst on target + "Poisoned!" popup | Purple damage number + small purple particle puff each turn |
| Sleep | Target darkens (alpha reduction) + "Sleep!" popup | Floating Z particles drifting up from target each turn, skip-turn indicator |
| Stun | Yellow/white flash on target + "Stunned!" popup | Star particles circling above target, skip-turn indicator |
| Confuse | Spiral particles around target + "Confused!" popup | Wobbling sprite rotation while confused |
| Haste | Blue speed-line particles streaking behind target + "Haste!" popup | Subtle blue shimmer on sprite (consumed on use, no tick) |
| Shield | Translucent dome flash on target + "Shield!" popup | Faint glow outline on sprite while active |
| Team Shield | Same as Shield but triggers on all living allies | Same glow on all shielded allies |
| Taunt | Red aggro particles pulling inward + "Taunt!" popup | Red outline/pulse on taunting creature |
| Temp ATK Flat | Amber particle burst + "ATK+" popup (same as ATK buff visual) | No ongoing visual (stacks additively, decays by turn) |

All applied animations include a floating text popup with status-appropriate color.

Skill proc text popups (COUNTER!, SPREAD!, AFFLICTION BURST!, PANDEMIC!, Chain Surge, etc.) migrate to `pixi/text.js` using the same pattern as buff/debuff popups — colored floating text on the effects layer.

## System 6: Stat Stage Changes

Pokemon-style stat stages (ATK/DEF, -6 to +6).

| Direction | Particle Style | Popup Style |
|-----------|---------------|-------------|
| Buff (+) | Amber upward arrow particles | "ATK up!" / "DEF up!" floating up |
| Debuff (-) | Purple downward arrow particles | "ATK down!" / "DEF down!" floating down |

## System 6b: Counter-Attacks

Counter-attacks reuse the standard System 1 attack sequence but with the defender as the attacker. The counter-attacking creature lunges from its position toward the original attacker. A "COUNTER!" skill proc popup (gold text) fires before the attack sequence begins. Tier scaling applies based on counter damage as normal.

## System 6c: Drain Moves

Drain moves deal damage AND heal the attacker for 50% of damage dealt. Visual sequence:
1. Standard attack impact sequence on target (System 1)
2. After target recoil, green health particles flow FROM the target TOWARD the attacker
3. Green heal number pops from the attacker (+N)

The "flowing particles" effect reuses the particle pool with a directed trajectory (tween from target position to attacker position) rather than a radial burst.

## System 6d: Player Damage Vignette

When enemy creatures hit player creatures, a red vignette overlay flashes on the screen edges (PixiJS Graphics on the overlay layer). This communicates "you took damage" and makes the enemy turn feel impactful. Same pattern as the existing `showVignette()` in the DOM system — brief red edge glow, ~200ms fade out.

## System 7: Healing

- Green particles rising from target (wood-style upward drift behavior)
- Green damage number floating up (+25)
- Brief green flash on the healed creature sprite

## System 8: Combat Milestones

### Creature KO
- Target sprite fades to grey, shrinks, fades out (0.6s)
- Small neutral white particle scatter outward (creature dispersing)
- No screen shake

### Level Up
- Gold particle fountain rising from the leveled creature
- "Level Up!" banner (same slam-in pattern, gold treatment)
- Brief gold flash on creature sprite

### XP Gain
- Small floating gold number (+15 XP) from defeated enemy position
- Subtle, doesn't interrupt flow

## System 9: Active Creature Glow

Pulsing glow outline on the player's active creature during move selection. Communicates "you are attacking with this creature."

- Soft white or element-colored glow
- Cycling alpha (subtle pulse)
- Appears when it's the creature's turn to select a move
- Disappears when the move is confirmed

## Non-Goals

- Sprite sheet animations (walk cycles, attack poses) — future upgrade, not this project
- Per-creature unique attack animations — element behaviors cover differentiation
- PvP canvas migration — separate project, PvP continues using DOM formations
- Parallax redesign — carry forward from bakeoff as-is
- Non-combat animations — stay on anime.js/DOM
