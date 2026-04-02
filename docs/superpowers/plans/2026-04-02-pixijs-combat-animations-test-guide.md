# PixiJS Combat Animations — What Was Done & Test Guide

> **Date:** 2026-04-02
> **Branch:** dev (10 commits, merged from feature/pixi-combat-animations + bug fix ports + NPC migration)
> **Previous state:** DOM/anime.js combat effects with frame drops on mobile Safari

---

## Summary

All combat visual effects now run on a PixiJS canvas instead of DOM + anime.js. NPC sprites also moved to canvas. The DOM layer now only handles HUD elements (HP bars, name labels, status badges, narration, menus).

## What Changed

### Combat Effects (was DOM/anime.js, now PixiJS)

| Effect | Old System | New System |
|--------|-----------|------------|
| Particles (hit impacts) | DOM divs + anime.js | PixiJS particle pool (200 pre-allocated sprites) |
| Screen shake | anime.js translateXY on `.game-app` | PixiJS stage container offset |
| Screen flash | `#screen-flash-overlay` div opacity | PixiJS Graphics rectangle alpha tween |
| Hit stop (freeze frame) | CSS class toggle | PixiJS ticker `frozen` flag |
| Recoil (knockback) | anime.js translateX | PixiJS sprite tween with elastic easing |
| Lunge (attack forward) | anime.js translateX | PixiJS sprite tween |
| Damage numbers | Floating DOM divs | PixiJS Text objects |
| Event popups (buff/debuff) | Floating DOM divs | PixiJS Text objects |
| Effectiveness banners | None (new) | PixiJS Text on overlay layer |
| Status VFX | None (new) | PixiJS particles/Graphics per status |
| Active creature glow | None (new) | PixiJS Graphics circle with pulsing alpha |
| KO animation | Instant disappear | Fade + shrink + particle burst |
| Level up animation | DOM popup | Gold particle fountain + flash |
| Player damage vignette | None (new) | Red edge rectangles, quick fade |

### 5-Tier Impact Scaling (new)

Damage effects now scale based on % of target's max HP:

| Tier | Threshold | Shake | Hit Stop | Particles | Flash |
|------|-----------|-------|----------|-----------|-------|
| 0 | <10% | none | 0ms | 4 | none |
| 1 | 10-20% | light | 30ms | 8 | none |
| 2 | 20-35% | medium | 60ms | 12 | element tint |
| 3 | 35-50% | heavy | 100ms | 18 | element + white |
| 4 | 50%+ | heavy | 150ms | 25 | 2x white flash |

### Element-Specific Particles (new)

Each element has distinct particle physics:

| Element | Visual |
|---------|--------|
| Fire | Orange-red embers drifting upward, flickering alpha |
| Water | Blue droplets arcing downward, wide spread |
| Wood | Green leaves with sinusoidal wobble, slow fall |
| Earth | Brown debris chunks, heavy gravity, short lifetime |
| Metal | Silver sparks, sharp linear trajectories, rapid flicker |
| Neutral | White radial burst |

### Status Effect Visuals (new)

| Status | Applied Animation | Ongoing Visual |
|--------|------------------|---------------|
| Poison | Purple particle burst + "Poisoned!" popup | Purple damage numbers + puff each turn |
| Sleep | Target darkens + "Sleep!" popup | Floating Z particles |
| Stun | Yellow flash + "Stunned!" popup | Star particles circling |
| Confuse | Spiral particles + "Confused!" popup | Wobbling sprite rotation |
| Haste | Blue speed-lines + "Haste!" popup | Blue shimmer |
| Shield | Dome flash + "Shield!" popup | Faint glow outline |
| Taunt | Red particles + "Taunt!" popup | Red outline pulse |
| ATK buff | Amber burst + "ATK+" popup | (no ongoing) |

### NPC Sprites (was DOM `<img>`, now PixiJS)

NPC portraits (Shrine Fox, Traveling Merchant, Game Master, NPC trainers, Cid, etc.) now render as PixiJS Sprites on the canvas. Slide-in/out animations use pixi tweens instead of anime.js.

### Parallax Background

- Scrolls during exploration, decelerates on encounters, stops during combat
- Resumes (accelerates) after combat ends
- Scales correctly to viewport on all devices (tileScale fix)
- Handles null/hub states without errors

### What Still Uses DOM

- HP/MP bars
- Creature name labels
- Status icon badges
- Enemy info bar (name, HP, skill bar)
- Narration box
- Scene toast notifications
- Area header pill
- All UI below the scene area (move cards, buttons, menus)
- Speed review minigame
- Whack-a-mole minigame

### Dead Code Removed

- `combat-effects.js` (705 lines) — deleted entirely
- `room-transition.js` — rewritten from 289 to 99 lines, anime.js import dropped
- Dead CSS for DOM particles, energy orbs, background animations

---

## Test Checklist

### Phase 1: Basic Rendering

- [ ] **Hub screen** — No parallax visible, DOM background shows normally
- [ ] **Start a run** — Parallax background loads and scrolls left
- [ ] **Player creatures visible** — Sprites render on canvas (left side), walking wobble animation plays
- [ ] **Parallax speed** — Layers scroll at different speeds (sky slow, ground fast)

### Phase 2: Exploration & Rooms

- [ ] **Walking between rooms** — Parallax scrolls, creatures wobble
- [ ] **Friendly NPC room** — NPC sprite slides in from right ON CANVAS (not DOM img), name/info appears in DOM overlay
- [ ] **NPC dialogue** — Narration box shows greeting, NPC sprite visible behind it
- [ ] **NPC leaves** — Sprite slides out to right
- [ ] **Dealer room** — Traveling Merchant appears same way (canvas sprite + DOM name)
- [ ] **Whack-a-mole room** — Game Master slides in on canvas
- [ ] **Shrine room** — Shrine Fox renders on canvas

### Phase 3: Combat Entry

- [ ] **Encounter starts** — Parallax decelerates and stops
- [ ] **Enemy creatures enter** — Sprites slide in from offscreen right (canvas animation, not DOM)
- [ ] **Boss encounters** — Larger sprite (120px vs 60px)
- [ ] **Active creature glow** — Pulsing white circle on the player creature whose turn it is during move selection
- [ ] **NPC battle intro** — NPC trainer slides in (canvas), greeting narration plays, NPC slides out, then enemies enter

### Phase 4: Combat Effects

- [ ] **Player attacks enemy** — Full sequence: lunge forward, hit stop, particle burst, screen shake, damage number, target recoil, attacker returns
- [ ] **Small damage (<10%)** — Minimal: few particles, no shake, small number
- [ ] **Big damage (50%+)** — Maximum: 25 particles, heavy shake, huge number, double screen flash
- [ ] **Element colors** — Fire attacks = orange particles drifting up, Water = blue arcing down, etc.
- [ ] **Super effective hit** — Gold damage number + "Super effective!" banner slams in from top
- [ ] **Resisted hit** — Grey damage number + "Resisted..." banner (muted)
- [ ] **Enemy attacks player** — Same effects but reversed direction + red vignette flash on screen edges
- [ ] **Damage numbers readable** — White stroke outline visible against any background

### Phase 5: Status Effects

- [ ] **Poison applied** — Purple particle burst + "Poisoned!" popup
- [ ] **Poison tick** — Purple damage number each turn + small purple puff
- [ ] **Healing** — Green particles rising + green "+N" number
- [ ] **Buff applied** — Amber upward popup "ATK up!"
- [ ] **Debuff applied** — Purple downward popup "DEF down!"
- [ ] **Skill procs** — Gold text: "COUNTER!", "SPREAD!", etc.

### Phase 6: Combat Milestones

- [ ] **Creature KO** — Sprite greys out, shrinks, fades, white particle scatter
- [ ] **XP gain** — Small gold "+N XP" floats up from defeated enemy
- [ ] **Level up** — Gold particle fountain + "Lv.N!" popup
- [ ] **Victory** — Parallax stays stopped during victory narration

### Phase 7: Post-Combat

- [ ] **After victory** — Parallax accelerates back to scroll speed
- [ ] **Creatures walk again** — Walking wobble resumes
- [ ] **Formation persists** — Player creatures don't flicker or re-render when phase changes (sameFormation cache)

### Phase 8: Edge Cases

- [ ] **Resize browser** — Parallax and creature positions update correctly
- [ ] **Quick room transitions** — No stale sprites from previous encounters (request ID guards)
- [ ] **Return to hub** — Parallax clears, DOM background reappears
- [ ] **PvP battle** — Loads pvp_arena parallax, stops scrolling
- [ ] **Speed review** — anime.js card animations still work (not affected by migration)
- [ ] **Whack-a-mole** — anime.js tile animations still work

### Phase 9: Performance

- [ ] **No frame drops** — Combat effects should be smoother than old DOM/anime.js version, especially on mobile Safari
- [ ] **No console errors** — Check for PixiJS warnings, missing texture errors, or import failures
- [ ] **No memory leaks** — Particles return to pool, destroyed sprites don't accumulate

---

## Known Limitations

- NPC sprites are a fixed 80x80 size and positioned at 70% screen width / 50% height — may need tuning for different NPCs
- `dom-effects.js` still re-exports `screenShake` from pixi for non-combat modules that call it
- anime.js remains a dependency for speed-review, whack-a-mole, and dom-effects (non-combat DOM animations)
- Status VFX visuals are new and haven't been seen in production — may need visual tuning

## Files Changed

| File | Change |
|------|--------|
| `pixi/effects.js` | Element particles, vignette, drain flow, 5-tier scaling |
| `pixi/text.js` | Color-coded damage numbers, event popups |
| `pixi/banners.js` | New — effectiveness banners |
| `pixi/status-vfx.js` | New — all 8 status effect visuals |
| `pixi/combat-effects-util.js` | New — tier config |
| `pixi/formation.js` | Active glow, KO/level-up, NPC sprites, entrance animation, cache |
| `pixi/parallax.js` | tileScale fix, request ID, null guard, decoupled setWalking |
| `pixi/battle-stage.js` | Try-catch, ResizeObserver cleanup, debug aids |
| `ui/combat-loop.js` | Fully rewired from DOM to pixi imports |
| `ui/dom-effects.js` | New — extracted DOM effects for non-combat |
| `ui/scene.js` | NPC functions call pixi instead of DOM img |
| `ui/room-transition.js` | Rewritten — pixi NPC slides, dropped anime.js |
| `ui/event-popup.js` | Updated import (spawnParticles from dom-effects) |
| `ui/combat-effects.js` | **Deleted** (705 lines) |
| `game.js` | Parallax management system, formation integration, PvP callback |
| `game.css` | Dead CSS removed |
