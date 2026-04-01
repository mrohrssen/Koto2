# PixiJS Battle Stage Migration

**Date:** 2026-04-01
**Status:** Approved
**Problem:** DOM-based combat rendering (CSS + anime.js) causes frame drops on mobile Safari/PWA. 618 slow frames out of 60,627 reported on iPhone. The architecture cannot support the Pokemon-style sprite animations planned for the future.
**Solution:** Replace the entire `.scene-area` rendering with a PixiJS canvas. Add parallax auto-scrolling backgrounds. Migrate creature sprites and combat effects to canvas. Keep DOM for HUD overlays.

---

## Architecture

### Canvas Replaces `.scene-area`

The `.scene-area` div remains as the container. A PixiJS `Application` canvas fills it entirely. DOM HUD elements are absolutely positioned on top of the canvas via z-index.

```
.scene-area (40vh, position: relative)
├── <canvas> (PixiJS Application, fills area)
│   ├── ParallaxBackground
│   │   ├── sky (TilingSprite, scroll speed 0.1x)
│   │   ├── far (TilingSprite, scroll speed 0.3x)
│   │   ├── mid (TilingSprite, scroll speed 0.6x)
│   │   └── ground (TilingSprite, scroll speed 1.0x)
│   ├── CreatureLayer (Container)
│   │   ├── PlayerFormation (up to 3 Sprites, left side)
│   │   └── EnemyFormation (up to 3 Sprites, right side)
│   ├── EffectsLayer (Container)
│   │   ├── ParticleContainer (pooled particles)
│   │   ├── Speed lines, flashes, impacts (Sprites/Graphics)
│   │   └── Damage numbers, event popups (BitmapText)
│   └── OverlayLayer
│       ├── Screen flash (Graphics rectangle with alpha)
│       └── Vignette (Graphics)
├── .area-header-pill (DOM overlay)
├── .enemy-info (DOM overlay)
├── .narration-box (DOM overlay)
├── .scene-toast (DOM overlay)
└── .npc-display (DOM, migrates to canvas later)
```

### What Stays DOM

- Area header pill (area name, room progress)
- Enemy info bar (name, HP bar, skill bar)
- Narration box (dialogue, combat results, story moments)
- Scene toast (notifications)
- NPC display (friendly NPC sprites — future canvas migration)
- All UI below the scene area (move cards, buttons, vocab, menus)

### What Moves to Canvas

- Background (static image → parallax layers)
- Creature sprites (img tags → PixiJS Sprites)
- Combat particles (DOM divs → ParticleContainer)
- Speed lines and energy orbs (DOM divs → Sprites)
- Screen shake (anime.js on .game-app → container offset)
- Screen flash and vignette (overlay divs → Graphics)
- Damage numbers (floating divs → BitmapText)
- Event popups: buff/debuff/skillProc (floating divs → BitmapText)

### Renderer Configuration

- **PixiJS version:** v8.x (latest stable)
- **Resolution:** `Math.min(window.devicePixelRatio, 2)` — cap at 2x to match asset DPR and save GPU on 3x devices
- **Resize handling:** `ResizeObserver` on `.scene-area` triggers `app.renderer.resize()`, updates TilingSprite dimensions, and re-positions formations. Handles iOS Safari address bar show/hide, orientation changes, and PWA vs in-browser differences.
- **Pointer events:** Canvas keeps pointer events for future creature interaction (targeting, inspecting). DOM overlays sit above in z-index and handle their own events naturally as sibling elements.

### Font Assets

BitmapText requires a bitmap font, not CSS web fonts. Use `BitmapFont.from()` at app init to generate bitmap fonts programmatically from a system font:

- **Damage numbers font:** digits 0-9, `+`, `-`, `%`, `.` — bold, white, with stroke outline for readability
- **Event popup font:** Latin alphanumeric + common punctuation (buff/debuff labels like "ATK", "DEF", "SPREAD!", "COUNTER!") — all labels are English/abbreviations, no CJK needed

Two font sizes: normal (event popups) and large (damage numbers). Generated once at init, reused for all text rendering.

---

## Parallax Background System

### Fixed 4-Layer Structure

Every area provides exactly 4 tileable images with fixed scroll speeds. The parallax system has no per-area configuration — just swap the art.

| Layer | Scroll Speed | Content | Transparency |
|-------|-------------|---------|-------------|
| `sky` | 0.1x | Atmosphere — gradient, clouds, stars | Opaque |
| `far` | 0.3x | Distant scenery — mountains, skyline | Transparent top ~60% |
| `mid` | 0.6x | Environmental detail — trees, buildings | Transparent top ~40% |
| `ground` | 1.0x | Walking surface — grass, path, floor | Transparent top ~70% |

Scroll speeds are constants in code, not data. Layers stack back-to-front: sky renders first, ground renders last on top.

### Auto-Scroll Behavior

Parallax scrolls continuously during exploration. Scroll state ties to game phase:

| Scroll State | Behavior | Game Phases |
|-------------|----------|-------------|
| `scrolling` | Layers scroll at defined speeds, creatures wobble-walk | EXPLORING, ROOM (between encounters) |
| `decelerating` | Layers ease to stop, enemies appear from right | ROOM_ENCOUNTER |
| `stopped` | Layers frozen, effects play | COMBAT, VICTORY, DEFEAT, FRIENDLY_NPC, NPC_DIALOGUE, WORD_DISCOVERY, DEALER, SKILL_MASTER, WHACK_A_MOLE, SPEED_REVIEW_ROOM, PVP_BATTLE, HUB, SHOP |
| `accelerating` | Layers ease back to scroll speed | Post-combat/post-NPC transition back to ROOM |

Default for any unlisted phase: `stopped`.

### Asset Directory Convention

```
public/assets/backgrounds/
  starter_meadow/
    sky.webp
    far.webp
    mid.webp
    ground.webp
  deep_forest/
    sky.webp
    far.webp
    mid.webp
    ground.webp
```

---

## Asset Specification

| Property | Value |
|----------|-------|
| Dimensions | 2048 x 800px |
| Format | WebP with alpha channel |
| DPR target | 2x (covers up to 3x screens — acceptable softness on scrolling backgrounds) |
| Tiling | Left edge must seamlessly connect to right edge |
| `sky` layer | Fully opaque |
| `far`, `mid`, `ground` | Transparent above content area |
| Art style | 2.5D isometric feel (art direction, not implementation) |

**Generation pipeline:** Nano Banana Pro (Scenario.gg API) for generation, background removal API for transparent layers. Credentials stored in `.env` as `SCENARIO_API_KEY` and `SCENARIO_API_SECRET`.

**MVP scope:** One area (starter meadow), 4 images. Additional areas generated with the same pipeline later.

If the scene area height changes in the future, regenerate assets at new dimensions. The code scales TilingSprites to fill the canvas — no hardcoded pixel sizes.

**Missing asset fallback:** If an area has no parallax assets (textures fail to load), fall back to a solid color background matching the area's theme. This prevents crashes when entering areas that haven't had backgrounds generated yet.

---

## Creature Display

### Sprite Loading

Existing webp sprites (static and idle-animated) loaded as PixiJS `Sprite` objects. Same asset paths: `/assets/sprites/creatures/{id}-idle.webp` with static fallback. Text-sprite fallback for missing images rendered as PixiJS Graphics + Text instead of DOM divs.

### Formation Positioning

Current diagonal stagger layout preserved as canvas coordinates:

- Player formation: left third, staggered right and down
- Enemy formation: right third, staggered left and down
- Depth scaling: back row `scale 0.9`, mid `0.95`, front `1.0`

### Walking Animation (No New Art)

Ticker-driven procedural animation on each creature sprite:

- **Y bounce:** `sprite.y += Math.sin(time * bounceSpeed) * 2` (2px amplitude)
- **Rotation wobble:** `sprite.rotation = Math.sin(time * wobbleSpeed) * 0.08` (~4.5 degrees)
- **Phase offset:** each creature offset in phase so they don't move in unison

States: `walking` (bounce + wobble active), `idle` (subtle breathing — slower, smaller), `hit` (recoil tween), `dead` (fade out).

### Future Upgrade Path

`Sprite` can be swapped to `AnimatedSprite` with sprite sheets (walk cycle, attack pose, hit reaction) per creature. No architectural changes needed — just new assets and a state machine for animation selection.

---

## Combat Effects on Canvas

### Particle System

Object pool pattern using `ParticleContainer`:

- Pre-allocate N particle sprites at init
- On burst: activate particles with position, velocity, color, lifetime
- Tick each frame: update position, fade alpha, deactivate when expired
- No DOM creation, no garbage collection pressure
- Single draw call for all active particles

### Effect Mapping

| Current (DOM + anime.js) | New (PixiJS) |
|--------------------------|-------------|
| `spawnParticles()` — N divs each animated | `ParticleContainer` burst |
| `spawnSpeedLines()` — orb divs flying A→B | Sprites moving along path in ticker |
| `screenShake()` — anime.js translateXY on `.game-app` | Offset root Container position |
| `screenFlash()` — overlay div opacity | Graphics rectangle alpha tween |
| `hitStop()` — CSS class freezing animations | Set `frozen` flag — ticker skips position updates but still renders (holds frame) |
| `recoil()` — anime.js translateX | Tween sprite.x with elastic easing |
| `showDamageNumber()` — floating div | BitmapText float up + fade |
| Event popups (buff/debuff/skillProc) | BitmapText with color tint |

### Tweening

Lightweight promise-based tween utility built on the PixiJS ticker. No external dependency. Integrates with existing `async/await` combat sequencing in `combat-loop.js`:

```js
await tween(sprite, { x: targetX, y: targetY }, { duration: 300, ease: 'easeOut' });
await flash(stage, 0xffffff, { duration: 100 });
emitter.burst(targetPos, { count: 15, color: 0xff4400 });
```

---

## Performance Fixes (Non-PixiJS)

Alongside the migration, these DOM performance issues are resolved:

1. **Kill `.game-app` background animations** — remove the 12s gradient cycle and 60s particle animation. The parallax scene provides visual interest.
2. **Remove `backdrop-filter`** from elements overlaying the canvas (area header pill, glass overlays). Replace with `rgba()` semi-transparent backgrounds. Keep `backdrop-filter` only for full-screen modals (rare, not per-frame).

---

## File Structure

New files:

```
public/js/pixi/
  battle-stage.js    # PixiJS Application init, resize, layer management
  parallax.js        # 4-layer TilingSprite parallax system
  formation.js       # Creature sprite positioning, walking animation
  effects.js         # Particle pool, speed lines, flashes, shake
  tween.js           # Promise-based tween utility on PixiJS ticker
  text.js            # BitmapText damage numbers + event popups
public/js/ui/
  dom-effects.js     # DOM-only utilities extracted from combat-effects.js (pop, flashElement)
```

Modified files:
- `public/js/ui/scene.js` — stripped to HUD-only (background + formation rendering removed)
- `public/js/ui/combat-effects.js` — combat-specific functions removed. DOM-only utilities (`pop`, `flashElement`) used by non-combat modules (`exploration.js`, `economy.js`) extracted to `public/js/ui/dom-effects.js`
- `public/js/ui/event-popup.js` — showEventPopup/presets removed (moved to `pixi/text.js`), `spawnParticles` import removed. Status icons + animateCounter stay (DOM HUD)
- `public/js/ui/combat-loop.js` — import effects from `pixi/` instead of DOM modules
- `public/game.css` — remove particle/effect/background animation styles
- `public/index.html` — remove `scene-background` div, screen-flash/vignette overlays, `.battle-stage` + formation containers (replaced by canvas)
- `public/js/ui/exploration.js` — update imports from `combat-effects.js` to `dom-effects.js`
- `public/js/ui/economy.js` — update imports from `combat-effects.js` to `dom-effects.js`

---

## Migration Phases

### Phase 1: PixiJS Canvas + Parallax Background

- Add `pixi.js` npm dependency
- Create `battle-stage.js` — init PixiJS Application inside `.scene-area`
- Create `parallax.js` — 4-layer TilingSprite auto-scroll
- Generate one set of starter meadow parallax assets (2048x800 WebP)
- Remove `.scene-background` div
- Kill `.game-app` background animations (CSS)
- Remove `backdrop-filter` from canvas-overlaying elements
- Creatures and effects still DOM on top of canvas
- **Ship gate:** parallax scrolls behind existing DOM game

### Phase 2: Creatures Move to Canvas

- Create `formation.js` — place creature sprites on PixiJS stage
- Load existing webp sprites as PixiJS Sprites
- Walking wobble animation (bounce + rotation in ticker)
- Scroll state machine: walking → decelerate → stopped → resume
- Remove DOM formation rendering from `scene.js`
- Reposition DOM HUD to align with canvas sprite positions
- **Ship gate:** creatures walk on parallax, combat still functional

### Phase 3: Combat Effects Move to Canvas

- Create `effects.js` — particle pool, speed lines, flash, shake, recoil, hit stop
- Create `tween.js` — promise-based tween utility
- Create `text.js` — BitmapText damage numbers and event popups
- Port all effects from `combat-effects.js` and `event-popup.js`
- Update `combat-loop.js` imports to use `pixi/` modules
- Extract DOM-only utilities (`pop`, `flashElement`) to `dom-effects.js`, update imports in `exploration.js`, `economy.js`
- Delete remainder of `combat-effects.js`
- Remove `.battle-stage`, `.player-formation`, `.enemy-formation` divs from `index.html`
- **Ship gate:** full combat rendered on canvas

### Phase 4: Cleanup

- Remove dead CSS (particle styles, ultimate styles, background animation keyframes)
- Remove anime.js dependency if unused elsewhere (check: speed-review, whack-a-mole, room-transition still use it — keep for now)
- Update `.env.example` with Scenario credentials template
- Update `CLAUDE.md` with new architecture notes
- **Ship gate:** clean codebase, no dead code

---

## Out of Scope

- Sprite sheet creature animations (future upgrade — current webps are fine)
- Phaser or any game engine (PixiJS renderer only)
- HUD rework (separate project)
- Multiple area backgrounds (just starter meadow for MVP)
- Capacitor-specific optimizations (same WKWebView as PWA)

## Known Dependencies

- **PvP battle** uses the same `.scene-area` with `setBackground()` and `showFormation()`. PvP rendering must be updated in Phase 2 alongside PvE formations.
- **anime.js** remains a dependency for `speed-review.js`, `whack-a-mole.js`, and `room-transition.js`. Only removed from combat code.
