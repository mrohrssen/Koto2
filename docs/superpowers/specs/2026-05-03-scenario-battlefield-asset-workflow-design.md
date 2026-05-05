# Scenario Battlefield Asset Workflow Design

## Summary

Build a Scenario MCP driven asset workflow for PixiJS battlefields. The first target is a new `moonlit_ruins` area inspired by the attached reference image, but the reference is used only as a visual benchmark and scoring target. The generation system must prove that a reusable text prompt recipe can recreate the art direction without using the reference image as a generation crutch.

The production battlefield contract remains:

1. `sky.webp`
2. `background.webp`
3. `battleground.webp`

The accepted output must be assembled in the same order the game renders:

`sky -> background -> battleground`

Only the assembled three-layer result is scored against the reference.

## Goals

- Use Scenario MCP as the required asset pipeline.
- Use Scenario's `GPT Image 2` model for generation.
- Use Scenario's background removal tool for transparent scenery extraction.
- Start with `3840x1024` outputs and only reduce dimensions when the live model rejects them.
- Generate the `battleground` first from text only.
- Generate later layers using previously generated layers as references, not the original reference image.
- Iterate prompts and layers until the assembled result is at least `90%` visually similar to the reference.
- Preserve every run's prompts, Scenario asset IDs, scores, critiques, and visual review artifacts.
- Make the prompt recipe reusable for later areas such as `starter_meadow` and `old_schoolyard`.

## Non-Goals

- Do not use the moonlit ruins reference image as a generation input for the initial `battleground`.
- Do not accept a one-piece generated image as proof that the game layer contract works.
- Do not switch to non-Scenario generation APIs as a fallback.
- Do not require exact moon position or exact light shafts; these are scroll-fragile and not critical.
- Do not bake creatures, UI, labels, text, HP bars, or character shadows into any generated layer.

## Scenario Models

The workflow uses these Scenario MCP models:

- Generation: `model_openai-gpt-image-2`
- Background removal: `model_photoroom-background-removal`

Observed `GPT Image 2` schema in Scenario:

- `prompt`
- `referenceImages`
- `mask`
- `numOutputs`
- `width`, max `3840`
- `height`, max `3840`
- `quality`: `auto`, `high`, `medium`, `low`
- `background`: `auto`, `opaque`

Because width and height are direct parameters and both allow up to `3840`, the first production attempt should use the maximum useful scrollable width:

```json
{
  "width": 3840,
  "height": 1024,
  "quality": "high",
  "background": "opaque"
}
```

If a model call rejects `3840x1024`, reduce width gently while holding height at `1024`, in this order:

1. `3584x1024`
2. `3328x1024`
3. `3072x1024`
4. `2816x1024`
5. `2560x1024`
6. `2304x1024`
7. `2048x1024`

Do not jump down to small widths such as `1500` unless all wider sizes fail.

## Layer Generation Sequence

## Layer Composition Contract

All generated layers use the same canvas size, starting at `3840x1024` unless the model rejects that size.

The image should be designed around these vertical bands:

- Top background band: `0-38%` of image height (`0-389px` at `1024px` high)
  - Dominated by sky openings, arches, columns, distant ruined walls, silhouettes, and horizon depth.
  - Must not contain walkable combat floor.
- Combat floor band: bottom `62%` of image height (`389-1024px` at `1024px` high)
  - Dominated by readable ground where creatures can stand.
  - Must remain open enough for ally and enemy columns, with a readable center aisle.
  - Must not be crowded by tall architecture, rubble piles, pillars, or foreground props.

Layer-specific dimension rules:

- `battleground`
  - Owns the full combat floor band from roughly `38%` height to the bottom edge.
  - May include subtle stone texture, cracks, moss, and small low debris.
  - Should keep the lower `62%` visually continuous and usable as creature standing space.
  - Should not contain tall columns, arches, sky, horizon, walls, or moon.
- `background`
  - Owns the upper architecture band from roughly `0-45%` height.
  - May dip slightly behind the battleground at the band boundary so the layers blend.
  - Should be transparent where the sky must show through.
  - Should not cover the lower combat floor band except for hidden overlap tucked behind `battleground`.
- `sky`
  - Owns the full canvas behind everything, but its visible design priority is the upper `38%`.
  - Should remain visually quiet behind architecture and not create high-contrast distractions behind creature labels.

Horizontal composition rules:

- Keep the left and right sides edge-safe for wide scrolling.
- Preserve an open central aisle across the combat floor.
- Avoid obvious literal markers at creature standing positions unless a later prompt test proves subtle contact zones help.

### 1. Generate `battleground`

The `battleground` is generated first and must be text-only. The moonlit ruins reference image is not supplied as a Scenario reference image for this step.

Purpose:

- Establish floor perspective, camera height, lower-half composition, and creature grounding.
- Create a reusable prompt recipe for combat surfaces.

Prompt direction:

- Wide painterly mobile JRPG battle floor.
- Moonlit ruined stone hall.
- Ancient cracked stone floor.
- Open combat floor occupying the lower `62%` of the image.
- Readable left and right standing areas.
- Open central aisle.
- Soft hand-painted texture.
- No characters, creatures, UI, text, labels, or shadows.

Avoid starting with rigid wording like `3x2 combat grid`. That may produce strange pads, markers, or literal grid artifacts. Prompt variants may test softer phrasing such as:

- `clear standing areas`
- `wide empty battle floor`
- `theatrical JRPG battle stage`
- `foreground floor designed for small creature sprites`
- `subtle contact zones`

If softer wording fails repeatedly, later iterations can test more explicit wording such as `six subtle standing zones`, but those outputs must be rejected if they look like UI markers or board-game spaces.

### 2. Generate `background`

The `background` is generated after an acceptable `battleground` candidate exists.

Inputs:

- The approved or current best `battleground` as a Scenario reference image.
- The current reusable style prompt.

The original moonlit ruins reference image is still not used as a generation reference.

Purpose:

- Add upper-half ruins: arches, columns, broken stone walls, distant silhouettes, and depth.
- Align with the floor's perspective, palette, and camera height.
- Leave the lower `62%` combat floor to the `battleground` layer.

After generation, run Scenario background removal with no `backgroundColor` so the output has transparency. The transparent `background` must sit in front of `sky` and behind `battleground`.

Reject backgrounds with:

- Baked floor covering creature standing space.
- Characters, UI, text, signs, logos, or labels.
- Alpha halos that are obvious over dark or bright sky.
- Architecture that does not align with the battleground perspective.

### 3. Generate `sky`

The `sky` is generated last.

Inputs:

- A composite or reference showing the current generated `background + battleground`.
- The current reusable style prompt.

Using generated `background + battleground` as a sky reference is allowed because it helps the sky fit the generated layer system. The original moonlit ruins reference is still only a scoring benchmark.

Purpose:

- Create a scroll-safe night sky behind the transparent ruins.
- Match the generated ruins' palette and ambience.

Prompt direction:

- Deep blue moonlit night sky.
- Stars and soft atmospheric gradient.
- No architecture, ground, creatures, UI, text, or logos.
- Scroll-safe ambience rather than exact moon position or exact shafts of light.

## Prompt Recipe Structure

The workflow should maintain a reusable prompt recipe, not one-off run prompts.

Recommended structure:

- `styleBible`: painterly mobile JRPG, soft hand-painted stone, fantasy ruins, cool nighttime palette, no photorealism, no hard AI clutter.
- `cameraContract`: wide side-view battlefield strip, target `3840x1024`, bottom `62%` combat floor, upper `38%` scenery/sky openings, readable depth, no action UI area.
- `layerContract`: exact vertical bands and rules specific to `battleground`, `background`, and `sky`.
- `areaVariables`: area theme terms that can be swapped later, such as `moonlit_ruins`, `starter_meadow`, and `old_schoolyard`.
- `negativePrompt`: no characters, no creatures, no UI, no text, no labels, no watermarks, no HP bars, no logos.
- `runDelta`: the specific change being tested in the current iteration.

Every iteration should update the prompt recipe deliberately based on the scorecard. The workflow should not randomly rewrite the whole prompt after each failure.

## Scoring Rubric

Each assembled run gets a visual score out of `100`.

### Composition: 30 points

Checks:

- Ruined hall feeling.
- Arches and columns in the upper half.
- Open combat floor occupying roughly the bottom `62%`.
- Similar camera height and depth to the reference.
- Strong battlefield readability when viewed as a mobile scene.

Minimum for approval: `25/30`.

### Style: 20 points

Checks:

- Painterly JRPG background.
- Soft hand-painted stone.
- Not photorealistic.
- Not generic anime character art.
- No sharp AI clutter or incoherent detail.

### Layer Validity: 20 points

Checks:

- Real `sky -> background -> battleground` composite.
- No one-piece shortcut.
- Clean transparent `background`.
- No sky baked into `battleground`.
- No scenery baked into `sky`.

Minimum for approval: `18/20`.

### Lighting And Mood: 15 points

Checks:

- Cool moonlit palette.
- Coherent nighttime ambience.
- Readable silhouettes.
- Consistent lighting across layers.

Exact moon position and exact shafts of light are not required because the battlefield is scrollable.

### Gameplay Fit: 15 points

Checks:

- Open floor supports creature placement.
- No busy detail under feet.
- Readable central aisle.
- No UI, text, characters, creatures, labels, or baked character shadows.

Minimum for approval: `12/15`.

### Stop Condition

Accept a run only when:

- Overall score is at least `90/100`.
- Composition is at least `25/30`.
- Layer validity is at least `18/20`.
- Gameplay fit is at least `12/15`.

If a run scores below `90`, the next iteration should target the weakest layer or prompt category. Regenerate all three layers only when the style recipe is fundamentally wrong or a layer dependency makes partial regeneration misleading.

## Artifact Structure

All unapproved run artifacts live under:

`tmp/battlefield-generation/moonlit_ruins/run-###/`

Each run directory contains:

- `prompts.json` — exact prompts, model IDs, dimensions, seed if available, and prompt delta from previous run.
- `scenario-assets.json` — Scenario asset IDs, job IDs, model params, and app URLs.
- `battleground.png` — raw generated battleground.
- `background-opaque.png` — raw generated background before alpha removal.
- `background.png` — transparent background after Scenario background removal.
- `sky.png` — raw generated sky.
- `assembled.png` — local composite using the real game layer order.
- `scorecard.json` — category scores and written critique.
- `review.html` — browser comparison page.

Approved final assets are copied to:

```text
public/assets/backgrounds/moonlit_ruins/sky.webp
public/assets/backgrounds/moonlit_ruins/background.webp
public/assets/backgrounds/moonlit_ruins/battleground.webp
```

Unapproved temporary PNGs, screenshots, prompts, and metadata remain under `tmp/` and are not committed.

## Browser Review UI

The browser comparison page should show:

1. The moonlit ruins reference image on the left.
2. The assembled generated result on the right.
3. Layer thumbnails below:
   - `sky`
   - `background`
   - `battleground`
4. Score breakdown by rubric category.
5. Written critique:
   - what is wrong,
   - which layer caused it,
   - what prompt change should be tested next.

Only `assembled.png` is scored against the reference. Individual layers are inspected to decide what to regenerate.

## Workflow Loop

For each run:

1. Generate or regenerate the target layer with Scenario `GPT Image 2`.
2. Run Scenario background removal for `background` when needed.
3. Download or otherwise persist Scenario outputs into the run directory.
4. Assemble the layer stack locally.
5. Build the browser review page.
6. Compare `assembled.png` to the reference.
7. Fill out `scorecard.json`.
8. Decide the next prompt delta.
9. Repeat until the stop condition passes.

The workflow is allowed to spend multiple iterations and credits. It should not stop early just because a single generated layer is attractive; only the assembled layer stack matters.

## Reuse For Other Areas

The `moonlit_ruins` loop produces two things:

1. Approved final `moonlit_ruins` battlefield assets.
2. A reusable prompt recipe that can be retargeted to other areas.

For a later area, keep the same `styleBible`, `cameraContract`, `layerContract`, scoring format, and artifact structure. Swap only `areaVariables` and run deltas.

Example area variables:

- `starter_meadow`: bright dawn meadow, soft grass floor, distant trees, gentle fantasy village edge.
- `old_schoolyard`: cracked asphalt or schoolyard dirt, old school building silhouettes, warm late-afternoon or quiet evening palette.

The future areas should still use the same generation sequence:

`text-only battleground -> background from battleground reference -> sky from generated background+battleground reference -> assemble -> score`

## Risks And Mitigations

### Prompt Over-Specifies Gameplay Layout

Risk: explicit `3x2 grid` wording creates literal pads, board-game spaces, or UI-like markers.

Mitigation: start with soft spatial wording. Test explicit combat-slot language only after softer prompts fail, and reject literal grid artifacts.

### Layer Drift

Risk: independently generated layers may not align in perspective, lighting, or camera height.

Mitigation: generate layers sequentially, using accepted generated layers as references for later layers.

### Background Removal Removes The Wrong Subject

Risk: Photoroom may treat only part of the ruins as the subject or remove architectural openings incorrectly.

Mitigation: inspect alpha over the generated sky, retry with cleaner background prompts, and consider masking or segmentation tools only if background removal repeatedly fails.

### Overfitting To Moonlit Ruins

Risk: prompts become too specific to one image and fail as a reusable pipeline.

Mitigation: keep prompt recipe fields separated. Put reusable style and camera rules in `styleBible` and `cameraContract`; isolate moonlit content in `areaVariables`.

### Scrolling Artifacts

Risk: exact moon placement or strong diagonal beams look wrong when the battlefield scrolls.

Mitigation: score mood and palette instead of exact moon/light positions. Prefer scroll-safe atmospheric lighting.

## Open Implementation Notes

- The browser comparison tool must be reliable before the long generation loop starts.
- Scenario MCP calls must use `team_g8yJ6jYJtWj44Um1NrmzYiLC` and `proj_ZjnKxmdyxtHXaF13xPGsXjWZ` unless the user selects a different Scenario project.
- The first implementation plan should include a lightweight way to download Scenario assets into `tmp/` after model runs.
- Final WebP conversion should happen only after a run passes the score gate.
