# PixiJS Battlefield Layout Design

## Summary

Replace the current "floating creatures over scenery" battle presentation with a grounded, symmetric `3 x 2` battlefield layout. Creatures stand on a static battleground layer, with labels above each creature, and the only moving battlefield art during combat is the distant sky.

The new battlefield art contract is:

1. `sky.webp` — distant sky, horizontally seamless, allowed to drift slowly.
2. `background.webp` — static transparent scenery behind the battleground, such as ruins, houses, cars, trees, benches, cliffs, or school walls.
3. `battleground.webp` — static ground/floor/platform where creatures stand, aligned to the combat grid.

Rendering order:

`sky -> background -> battleground -> creature shadows -> creatures -> effects -> labels`

## Goals

- Make creatures clearly look like they are standing on a battlefield.
- Preserve the current scene-area height.
- Optimize the layout for `3v3` combat, with `1v1` and `2v2` using existing slot mapping.
- Move creature name/HP/MP bars above each creature.
- Keep PvE and PvP layout rules conceptually identical, even if implementation lands first in the Pixi battle scene.
- Define reusable image-generation prompts and dimensions for future area-specific battlefields.

## Non-Goals

- Do not redesign the action area.
- Do not change combat mechanics.
- Do not make the ground layer parallax during combat.
- Do not rely on hand-tuned per-creature offsets.
- Do not bake creatures, labels, UI, HP bars, or shadows into generated background art.

## Current System Context

`public/js/pixi/parallax.js` currently expects four layers:

- `sky.webp`
- `far.webp`
- `mid.webp`
- `ground.webp`

It loads them from:

`/assets/backgrounds/<areaId>/<layer>.webp`

This design should replace the battle-scene background contract with a clearer three-layer battlefield contract:

- `sky.webp`
- `background.webp`
- `battleground.webp`

Exploration parallax can remain separate. Battle rendering should not bend `far/mid/ground` semantics to fit a different visual model.

## Battlefield Grid

The battle layout is a symmetric `3 x 2` grid, derived from the approved reference composition. It should be generated from a small normalized table, not from per-slot visual tweaks.

Normalized coordinates are relative to the Pixi scene canvas:

| Slot | X | Y |
| --- | ---: | ---: |
| Ally top | `0.195` | `0.435` |
| Ally middle | `0.195` | `0.652` |
| Ally bottom | `0.195` | `0.870` |
| Enemy top | `0.805` | `0.435` |
| Enemy middle | `0.805` | `0.652` |
| Enemy bottom | `0.805` | `0.870` |

Slot mapping stays consistent with current formation logic:

- `1 creature` -> middle row.
- `2 creatures` -> top and bottom rows.
- `3 creatures` -> top, middle, and bottom rows.

Depth is row-based:

| Row | Scale |
| --- | ---: |
| Top | `0.90` |
| Middle | `0.98` |
| Bottom | `1.08` |

These scales are intentionally coarse and even. The layout should read as a clean mirrored grid, not as small asymmetrical adjustments.

## Creature Grounding

Each creature sprite should get a Pixi-rendered contact shadow under its feet.

Shadow rules:

- Parent shadows to the creature layer or a dedicated `shadows` layer below creatures.
- Position shadow at the same grid slot as the creature.
- Scale shadow by row, matching creature depth.
- Keep shadows separate from generated art so different creature shapes still look grounded.
- Do not bake character-specific shadows into `battleground.webp`.

Recommended shadow defaults:

- Top row: smaller, lighter oval.
- Middle row: medium oval.
- Bottom row: larger, darker oval.

## Labels Above Creatures

Move formation info above each sprite:

- Player labels include name, HP, and MP when applicable.
- Enemy labels include name and HP.
- Enemy labels can still hide until slide-in completes.

The label position should be derived from the same normalized slot table as Pixi sprites. Avoid invisible DOM sprite anchors as the source of truth for battle positioning.

Recommended label rule:

- Label center `x` equals slot `x`.
- Label bottom sits above sprite top by a small fixed gap.
- Label width may be clamped responsively to avoid crossing the screen edge.
- Bottom-row labels must stay inside the scene area and not overlap the action area.

Implementation can keep labels in DOM initially to preserve current HP/MP updates and click handlers, but the shared grid table should drive both Pixi sprite placement and DOM label placement.

## Background Layer Contract

Battlefield assets live under:

`public/assets/backgrounds/<battlefieldId>/`

Required files:

- `sky.webp`
- `background.webp`
- `battleground.webp`

Optional source/editing files should live outside committed public assets unless they are final WebP outputs.

### `sky.webp`

Purpose:

- Distant sky visible behind scenery.
- The only battle layer allowed to drift during combat.

Requirements:

- Horizontally seamless.
- No UI, text, creatures, labels, foreground structures, or ground.
- Compatible with the lighting direction of `background.webp` and `battleground.webp`.
- Wide enough or tileable enough that slow drift does not reveal repetition quickly.

Recommended generation size:

- Use the widest accepted GPT Image landscape size discovered by the API capability probe.
- Target final runtime strip: at least `4096x1024`.
- Prefer a single model-generated, pixel-perfect horizontal loop over stitched segments.
- Export as a horizontally seamless loop strip.

### `background.webp`

Purpose:

- Static scenery behind combat, such as ruins, houses, cars, trees, benches, cliffs, school walls, or other area identity.
- Can contain transparent openings through which `sky.webp` is visible.

Requirements:

- Transparent WebP.
- Landscape loop strip, not portrait-only art.
- Horizontally seamless or at least safe to repeat/scroll at the left and right edges.
- No walkable ground where creature feet land.
- No creatures, UI, labels, text, or HP bars.
- Static during combat.
- Designed to sit behind `battleground.webp`.
- Bottom edge should blend or tuck behind the battleground layer.

### `battleground.webp`

Purpose:

- Static combat surface where creatures stand.
- Owns floor perspective, contact surface, and any visible pads/clear standing zones.

Requirements:

- Static during combat.
- Landscape loop strip, not portrait-only art.
- Horizontally seamless or edge-safe for side-scrolling reuse.
- No sky.
- No tall background structures except low foreground ground details.
- No creatures, UI, text, labels, or HP bars.
- Must clearly support the symmetric `3 x 2` grid.
- Should leave a readable central aisle between ally and enemy columns.
- Should not contain baked character-specific shadows.

The battleground may be opaque or partially transparent depending on the area, but it should always be visually authoritative for where feet touch.

## Pixi Rendering Changes

Add a battle-specific background loader rather than extending the current exploration-style parallax contract.

Suggested module:

`public/js/pixi/battlefield-background.js`

Responsibilities:

- Load `sky.webp`, `background.webp`, and `battleground.webp`.
- Render sky as a tiling or oversized sprite.
- Render background and battleground as static sprites.
- Resize all layers to the current Pixi canvas without changing `.scene-area` height.
- Expose `startSkyDrift(speed)`, `stopSkyDrift()`, `updateBattlefieldBackground(dt)`, and `loadBattlefieldBackground(battlefieldId)`.

Layer structure:

- `layers.backgroundSky`
- `layers.backgroundScenery`
- `layers.battleground`
- existing creature/effects/labels layers above them

If adding new app layers is too invasive, the existing `layers.background` container can hold sub-containers in this order:

1. sky
2. background
3. battleground

Only the sky child should receive tile-position updates during combat.

## Formation Placement Changes

Create a shared slot helper, for example:

`public/js/pixi/battlefield-layout.js`

It should expose:

- `BATTLEFIELD_SLOTS`
- `rowForFormationIndex(index, total)`
- `getBattlefieldSlot(side, slotIndex, screenWidth, screenHeight)`
- `getBattlefieldSpriteScale(rowIndex, baseScale)`
- `getBattlefieldLabelPosition(side, rowIndex, spriteBounds)`

This lets `formation.js` stop using DOM anchor boxes as the primary source of Pixi sprite position during battle.

The helper should preserve current formation behavior:

- `1 -> middle`
- `2 -> top/bottom`
- `3 -> top/middle/bottom`

## GPT Image Generation Workflow

Use GPT Image to create a coordinated three-layer battlefield set.

The current OpenAI docs expose `gpt-image-2` through `openai.images.generate`. GPT Image models may require Organization Verification in the OpenAI developer console.

Known documented API parameters:

```json
{
  "model": "gpt-image-2",
  "size": "1536x1024",
  "quality": "high",
  "output_format": "webp"
}
```

The documented size above must not be treated as the final limit. Before generating production assets, run an API capability probe with the real API key to discover which wider sizes `gpt-image-2` accepts.

Use `1024x1536` only for early concept previews if a portrait composition helps with review. Final committed battlefield layers should be wide landscape loop strips because the game presents side-scrolling backgrounds.

Target final layer dimensions:

- `4096x1024` for `sky.webp`
- `4096x1024` for `background.webp`
- `4096x1024` for `battleground.webp`

If GPT Image accepts wider dimensions, prefer generating the final loop at the widest practical accepted width up to the runtime memory budget. If GPT Image refuses `4096x1024`, generate the widest accepted pixel-perfect loop tile and repeat it exactly at runtime rather than manually blending overlapping segments.

### Required Layer Height

Probe sizes should be driven by the real scene height, not arbitrary art dimensions.

Current CSS:

- `.scene-area` height is `50dvh`.
- `.scene-area` min-height is `220px`.
- Pixi uses `resolution: Math.min(window.devicePixelRatio, 2)`.

For iPhone Pro-class devices, assume a viewport around `402 x 874` CSS pixels. The battle scene is therefore roughly:

- CSS scene height: `874 * 0.5 = 437px`.
- Pixi backing height: `437 * 2 = 874px`.
- Add overscan/crop safety: `~15-20%`.

That makes `1024px` the correct production layer height. Smaller heights risk softness after Pixi scaling on high-density phones; larger heights do not serve the fixed `50dvh` battle viewport and mostly increase memory use.

Probe width should vary while holding height at the required production height:

- Production height: `1024`.
- Do not probe taller variants for this feature.

### API Capability Probe

Run this before choosing final generation dimensions:

1. Set the key as an environment variable, never inline in a command or committed file.
2. Probe `gpt-image-2` with a tiny low-cost seamless-sky prompt.
3. Try candidate sizes in descending usefulness, recording accepted and rejected values. Prioritize widths at the real needed height:
   - `4096x1024`
   - `3072x1024`
   - `2048x1024`
   - `1536x1024`
4. Save outputs only under `tmp/` during probing.
5. Record the winning size in the implementation plan before production generation.

Do not assume the docs list every accepted size. The implementation should trust the live API result.

### Generation Loop

1. Generate a full concept composition first.
2. Review it with grid markers and representative Koto creature sprites.
3. Once approved, generate or edit the three layers from that composition:
   - `sky.webp`
   - `background.webp`
   - `battleground.webp`
4. Composite the three layers in a local preview.
5. Verify:
   - sky loops horizontally,
   - background alpha edges are clean,
   - battleground supports the `3 x 2` grid,
   - existing sprites look grounded,
   - labels above sprites remain readable,
   - no scene-area height change.
6. Repeat generation until the preview works.

### Full Composition Prompt Template

Bracketed terms in the prompt templates are generation-time variables, not unresolved spec placeholders.

```text
Create a vertical mobile JRPG battlefield scene concept for a Japanese vocabulary creature RPG.

Camera and layout:
- wide side-scrolling battlefield loop strip
- this image is only the battle scene art, not the action UI below it
- horizontally loopable composition with left and right edges that can repeat cleanly
- symmetric 3 x 2 creature battle grid
- ally column at 19.5% width, enemy column at 80.5% width
- three evenly spaced rows at 43.5%, 65.2%, and 87.0% of the image height
- clear central aisle between the two columns
- creatures are not included, but the battleground must visibly support six empty standing positions

Art direction:
- beautiful painterly mobile JRPG background
- bright sci-fi fantasy tone
- readable floor perspective
- strong grounding surface where small creature sprites can stand
- layered depth: distant sky, static background scenery, foreground battleground

Content:
- area theme: [AREA THEME]

Do not include:
- characters, monsters, creatures, people, UI, text, labels, HP bars, logos, watermarks, speech bubbles, nameplates, Japanese writing, English writing
```

### Sky Prompt Template

```text
Generate only the sky layer for a mobile JRPG battlefield.

Requirements:
- horizontally seamless looping sky texture
- no ground, no buildings, no trees, no pillars, no foreground objects
- no characters, creatures, UI, text, labels, logos, or watermarks
- lighting and palette match this area: [AREA THEME]
- designed to sit behind transparent scenery
- painterly bright sci-fi fantasy style

Output:
- wide seamless sky image
- clean edges for horizontal tiling
```

Recommended size: use the widest accepted landscape size from the API capability probe.

Final export size: at least `4096x1024` when accepted, otherwise an exactly repeatable loop tile using the widest accepted size.

### Background Prompt Template

```text
Generate only the transparent background scenery layer for a mobile JRPG battlefield.

This layer sits in front of the sky and behind the battleground.

Requirements:
- transparent WebP with alpha
- wide landscape side-scrolling strip
- horizontally seamless or edge-safe for repeated scrolling
- static scenery only: [BACKGROUND SUBJECTS]
- leave openings where the sky can show through
- no walkable floor where creatures stand
- no characters, creatures, people, UI, text, labels, HP bars, logos, or watermarks
- bottom edge should be easy to hide behind the battleground layer
- same camera, horizon, lighting, and palette as the approved battlefield concept

Style:
- painterly mobile JRPG background art
- bright sci-fi fantasy
```

Recommended size: use the widest accepted landscape size from the API capability probe, with transparent background where supported.

Final export size: at least `4096x1024` when accepted, otherwise an exactly repeatable transparent loop tile using the widest accepted size.

### Battleground Prompt Template

```text
Generate only the battleground layer for a mobile JRPG battlefield.

This layer is the static ground/floor/platform where creatures stand.

Requirements:
- wide landscape side-scrolling battleground strip
- horizontally seamless or edge-safe for repeated scrolling
- clear symmetric 3 x 2 creature standing grid
- ally column at 19.5% width, enemy column at 80.5% width
- rows at 43.5%, 65.2%, and 87.0% of the image height
- six empty standing zones or naturally readable contact areas
- clear central aisle
- no characters, creatures, people, UI, text, labels, HP bars, logos, or watermarks
- no baked creature shadows
- floor perspective must make small sprites look grounded
- match the same area theme, horizon, lighting, and palette as the approved concept

Style:
- painterly mobile JRPG battleground
- bright sci-fi fantasy
```

Recommended size: use the widest accepted landscape size from the API capability probe.

Final export size: at least `4096x1024` when accepted, otherwise an exactly repeatable loop tile using the widest accepted size.

### Seamless Loop Requirement

The generation prompt should ask GPT Image for pixel-perfect horizontal looping assets. The preferred output is a single seamless strip, not a manually blended collage.

If the accepted API size is smaller than the desired runtime travel distance:

1. Generate a seamless loop tile at the widest accepted size.
2. Verify the left and right edges match visually and by pixel-diff sanity check.
3. Repeat the tile exactly in Pixi or pre-export an exact repeated strip.
4. Reject outputs that require hand-blended overlap regions to hide discontinuities.

Manual overlap blending is not part of the production pipeline. If GPT Image cannot produce a clean loop for a candidate, reject that candidate and regenerate with a stronger seamless-loop prompt or a different accepted size.

## Validation Preview

Before accepting any battlefield set, create a local preview that composites:

1. `sky.webp`
2. `background.webp`
3. `battleground.webp`
4. grid markers at the six slot positions
5. representative existing Koto creature sprites
6. labels above each sprite

The preview should include a horizontal seam test for `sky.webp`:

- show sky tile A next to sky tile B,
- drift the sky slowly,
- check for visible seam or repeating artifacts.

The preview should also seam-test `background.webp` and `battleground.webp`, even if they remain static during combat, because those layers are authored as side-scrolling strips for reuse.

Visual approval requires screenshots for:

- static composite with grid,
- static composite with real sprites,
- sky drift seam test,
- in-game Pixi scene after implementation.

## Testing

Automated checks:

- `node --check public/js/pixi/battlefield-background.js`
- `node --check public/js/pixi/battlefield-layout.js`
- `node --check public/js/pixi/formation.js`
- focused unit tests for slot coordinate mapping:
  - `1 creature -> middle`
  - `2 creatures -> top/bottom`
  - `3 creatures -> top/middle/bottom`
  - ally/enemy x values mirror around center
  - row y values are evenly spaced

Manual/visual checks:

- Start Vite dev server with `npm run dev`.
- Open the game at `http://localhost:5173`.
- Navigate to combat.
- Verify no scene-area height change.
- Verify all six `3v3` positions are grounded.
- Verify `1v1` and `2v2` still look balanced.
- Verify labels are above creatures and readable.
- Verify sky drift does not make feet appear to slide.
- Verify PvE and PvP do not diverge visually once both use the shared layout table.

## Risks And Mitigations

### GPT Image Does Not Produce Clean Layers

Risk: the model may include text, creatures, UI, or inconsistent alpha.

Mitigation:

- Generate full composition first.
- Use layer-specific prompts only after approving the concept.
- Reject outputs with text, UI, creatures, or bad alpha.
- Composite every candidate before committing assets.

### Sky Seam Is Visible

Risk: "seamless" prompt may not guarantee a true tile.

Mitigation:

- Require a seam preview.
- If needed, use image editing/inpainting or manual tile cleanup before accepting.
- Keep sky drift slow enough that minor repetition is less obvious.

### Background Alpha Halos

Risk: transparent `background.webp` edges may show halos over a drifting sky.

Mitigation:

- Preview background over both light and dark sky regions.
- Prefer clean alpha exports.
- Avoid high-contrast semi-transparent fringes around pillars, trees, cars, benches, or buildings.

### Labels Overlap Sprites Or Scene Edges

Risk: labels above sprites may collide with top row or screen edges.

Mitigation:

- Position labels from the shared slot table.
- Clamp label bounds within the scene.
- Keep compact label styling.

### Existing Effects Depend On DOM Formation Slots

Risk: combat VFX or click handlers may still query DOM `.formation-slot` positions.

Mitigation:

- Keep DOM slots, but make them reflect the shared grid.
- Move Pixi and DOM to the same slot table in one implementation plan.
- Add focused regression tests for VFX target lookup where practical.

## Open Implementation Decision

The preferred direction is to keep battle-specific background rendering separate from exploration parallax. Exploration can continue using the old `sky/far/mid/ground` contract until it is worth unifying.

Battle should use the new `sky/background/battleground` contract immediately because it matches the desired visual model and avoids ground drift.
