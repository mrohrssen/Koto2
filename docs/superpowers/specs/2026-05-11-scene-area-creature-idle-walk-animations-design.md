# Scene-Area Creature Idle/Walk Animations Design

## Goal

Transform scene-area creature rendering from static Pixi sprites plus synthetic wobble into manifest-driven idle and walk sprite-sheet animation, starting with a pilot set of `neko`, `hi`, and `ishi`.

The pilot must prove the full workflow from white-background static sprite to Scenario Seedance video generation, background removal, sprite-sheet packaging, and Pixi runtime playback. The design should be ready to expand to every creature in `data/creatures.json`, but the first implementation should only enable the three pilot creatures.

## Scope

In scope:

- Generate `idle` and `walk` animation sheets for `neko`, `hi`, and `ishi`.
- Use Scenario MCP Seedance 2.0 to generate the source videos.
- Use Scenario MCP Photoroom background removal after packing RGB sheets.
- Render animated sheets only in Pixi scene-area formation sprites.
- Use `walk` only during room travel / parallax movement.
- Use `idle` while standing still, including combat.
- Disable the old sine-wave walking wobble for animated creatures.
- Fall back to the existing static sprite when animation files or manifest entries are missing.

Out of scope:

- Attack or hurt animation generation.
- Replacing non-scene UI sprites.
- Replacing existing Pixi combat movement, lunges, projectile, particle, or status VFX.
- Generating all `data/creatures.json` creatures in the pilot.

## Source Assets

White-background source images live under:

```text
/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg
```

The white-background generation manifest records the source sprite dimensions, output dimensions, and placement. For the pilot, the pipeline should resolve:

```text
creatures/neko.png
creatures/hi.png
creatures/ishi.png
```

If a source image is missing, the generator should skip that creature and report it clearly.

## Scenario Video Generation

Use Scenario MCP model:

```text
model_bytedance-seedance-2-0
```

For every pilot creature, generate two videos.

Idle prompt:

```text
idle animation for a monster collector game on a plain white background - no shadows or additional details
```

Walk prompt:

```text
walking animation for a monster collector game on a plain white background - no shadows or additional details
```

Seedance parameters:

```json
{
  "duration": 4,
  "resolution": "480p",
  "aspectRatio": "adaptive",
  "generateAudio": false
}
```

Use the same white-background creature image as both:

- `image`
- `lastFrameImage`

This keeps the generated video loop closed. The first and last decoded frames may not be byte-identical after video encoding, but the last frame should still be treated as the duplicate loop endpoint.

## Video To Sprite-Sheet Processing

For each generated video:

1. Decode the MP4 to frames.
2. Expect roughly `97` frames for a `4s` / `24fps` closed-loop export.
3. Drop the final endpoint frame.
4. Keep the remaining `96` source frames.
5. Sample `24` frames evenly by taking every fourth frame.
6. Use one shared source cell per creature across `idle` and `walk`.
7. Pack sampled frames into a `6 x 4` source sheet.
8. Save the pre-removal sheet as `RGB` PNG.
9. Send the RGB sheet to Scenario Photoroom background removal.
10. Verify the cleaned sheet has nonzero transparency and near-zero opaque white background.
11. Slice the cleaned sheet proportionally if Scenario resized it.
12. Normalize into a final `24` frame, `6 x 4`, `256 x 256` cell sheet.

Critical lessons from the prototype:

- Do not send all-opaque `RGBA` PNG sheets to Scenario background removal. Scenario can return them unchanged.
- Packed sheets sent to Scenario must be `RGB` PNGs.
- Do not crop `idle` and `walk` differently for the same creature. Different source cells make the creature pop in scale when switching animations.
- Do not crop per frame. Per-frame crops cause jitter.
- Scenario may resize large inputs. The cleaned sheet should be sliced by proportional grid boundaries rather than hardcoded source pixel dimensions.

## Output Asset Layout

Generated runtime assets should live under:

```text
public/assets/sprites/creatures-animated/
  manifest.json
  neko/
    idle.webp
    walk.webp
    metadata.json
  hi/
    idle.webp
    walk.webp
    metadata.json
  ishi/
    idle.webp
    walk.webp
    metadata.json
```

This keeps animation assets beside the existing creature sprite architecture (`public/assets/sprites/creatures/`) while avoiding filename ambiguity with static sprites. The `public/assets` location is the long-term runtime source of truth because these files must be served directly to the browser and cached like other game art.

Intermediate generation artifacts should not live in `public/assets`. Keep raw videos, decoded frames, RGB pre-removal sheets, Scenario downloads, and generation reports in `output/` or another gitignored pipeline directory until a sheet passes verification and is promoted into `public/assets/sprites/creatures-animated/`.

Each sheet:

- `24` frames
- `12fps`
- `6 x 4` layout
- `256 x 256` cells
- transparent background

Each creature metadata file should include:

- creature id
- source white-background image path
- Seedance model id
- prompt per animation kind
- Scenario video asset ids
- Scenario background-removal asset ids
- source video dimensions and decoded frame count
- final frame count and FPS
- final sheet dimensions
- alpha verification summary

The top-level manifest should be small and runtime-friendly:

```json
{
  "version": "20260512",
  "frameWidth": 256,
  "frameHeight": 256,
  "fps": 12,
  "columns": 6,
  "renderScale": 1.85,
  "animations": {
    "neko": {
      "idle": "/assets/sprites/creatures-animated/neko/idle.webp?v=20260512",
      "walk": "/assets/sprites/creatures-animated/neko/walk.webp?v=20260512"
    }
  }
}
```

Only creatures with working animation assets should appear in the manifest.

Generated sheets are already normalized against the same source sprite sizing convention, so render scale is a global scene-area concern rather than a per-creature metadata value. Pixi rendering should apply one global `1.85` animated-sheet multiplier so generated sheets display at native size relative to existing static scene-area sprites.

## Runtime Behavior

Only Pixi scene-area formation sprites should use animated creature sheets.

Non-scene UI remains static:

- collection views
- creature cards
- party rows
- shop/fusion UI
- DOM fallback formation markup

Pixi animation selection:

- If the creature has an animated manifest entry:
  - use `walk` while `ctx.walkingEnabled` is true
  - use `idle` while `ctx.walkingEnabled` is false
- If the creature has no animated manifest entry or the sheet fails to load:
  - use the current static sprite path

Combat behavior:

- Creatures idle in combat.
- Existing Pixi combat motion, lunges, projectiles, particles, status VFX, glow, KO, and level-up effects stay in place.
- No attack or hurt sheets are generated for this phase.

Exploration behavior:

- `ExplorationScene` already sets `formation.walkingEnabled = isParallaxMoving()`.
- `playRoomTravel()` already sets `walkingEnabled = true` during room travel.
- The new animation system should consume that signal instead of adding new room-transition state.

Hub behavior:

- HubScene should idle if creatures appear there. Product-wise, hub/no-save/area-selection should not normally show player formation creatures in the scene area, but the current code can pass allies into HubScene. Until that is cleaned up separately, HubScene must not set animated creatures to `walk`; use `idle` there.

## Formation Runtime Design

Add an animation support layer near Pixi:

```text
public/js/pixi/creature-animation-manifest.js
public/js/pixi/animated-creature-sprite.js
```

Responsibilities:

- load and cache `creatures-animated/manifest.json`
- answer whether a creature id has `idle` / `walk`
- load sheet textures
- store per-sprite animation state
- advance frames at `12fps`
- switch between `idle` and `walk` without respawning formation sprites

Modify `public/js/pixi/formation.js`:

- On spawn, attempt animated setup after resolving creature id.
- If animated setup succeeds, store state on the Pixi sprite.
- If setup fails, use the current static texture path.
- Animated sprites should use the same slot/depth scale as static sprites, multiplied by the global animated-sheet render scale of `1.85`.
- In `_updateFormations`, for animated sprites:
  - select `walk` or `idle`
  - advance frames
  - update texture frame
  - do not apply sine bounce / rotation wobble
- For non-animated sprites:
  - keep the current static behavior
  - keep fallback static sprite loading

## Testing

Unit tests should cover:

- manifest lookup returns null for missing creatures
- missing animation assets fall back to static sprite path
- `walkingEnabled = false` chooses `idle`
- `walkingEnabled = true` chooses `walk`
- animated sprites skip sine wobble
- static sprites preserve current fallback behavior

Manual / visual verification:

- Run dev server through Vite.
- Verify `neko`, `hi`, and `ishi` in scene-area.
- During room transition, pilot creatures play walk.
- After transition, pilot creatures play idle.
- In combat, pilot creatures idle while existing combat VFX still move/action them.
- Non-pilot creatures continue using static sprites.
- Missing animation files do not break rendering.

## Rollout

Phase 1: Pilot only.

- Generate assets for `neko`, `hi`, `ishi`.
- Wire runtime support.
- Playtest room travel, idle standing, and combat idle.

Phase 2: Batch expansion.

- Generate all eligible `data/creatures.json` creatures.
- Keep manifest opt-in per successful creature.
- Track failures in a generation report.

Phase 3: Polish.

- Tune render scale compensation.
- Keep render scale compensation global unless batch QA proves a systemic issue with a specific generation class.
- Add QA preview pages for batch review.
- Only then consider additional combat state sheets like attack/hurt.

## Open Questions

- Confirm `1.85` as the global animated-sheet scene-area scale after pilot playtest on mobile and desktop.

## Self-Review

- No attack/hurt animation is included.
- Static fallback behavior is preserved.
- Pixi scene-area is the only runtime target.
- The Scenario RGB pre-removal requirement is captured.
- The shared source-cell requirement is captured for animation parity.
- The design can expand to all `data/creatures.json` without changing the runtime contract.
- HubScene fallback behavior is specified as idle-only.
- Runtime asset storage is specified under `public/assets/sprites/creatures-animated/`; intermediates stay outside `public/assets`.
