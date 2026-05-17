# Scenario Move Sprite Generation Design

## Summary

Build a Scenario MCP driven workflow for missing move sprites. The workflow should copy the proven ingredient icon process from [Ingredient icon Scenario workflow](abf15895-14cf-4bdd-a84f-88d75a2b8650): produce a white-background 3x3 grid, ensure that exact grid is available as a Scenario asset, run Scenario Photoroom background removal, download the transparent grid, then slice by alpha into final `128x128` transparent WebP icons.

At exploration time, `scripts/generate-move-icons.mjs --list` reported `92` missing move icons from `data/moves.json`, with only three committed action sprites under `public/assets/sprites/actions/`.

## Goals

- Generate missing move icons in 3x3 batches for throughput.
- Use Scenario MCP for the required background-removal step.
- Preserve run metadata: prompts, move batch manifests, Scenario upload asset IDs, Photoroom job IDs, transparent result asset IDs, and final local paths.
- Slice transparent Scenario outputs by alpha channel, not by local color-key removal.
- Produce final icons at `public/assets/sprites/actions/<slug>.webp`.
- Make the process resumable and auditable through a run directory under `tmp/move-sprites-scenario/<runId>/`.

## Non-Goals

- Do not use local RMBG, ComfyUI RMBG, BiRefNet, white color-keying, or magenta color-keying as a fallback.
- Do not silently switch to Gemini direct API generation if Scenario generation or upload fails.
- Do not overwrite existing action sprite files unless the slug is explicitly selected for regeneration.
- Do not change move mechanics, move data, translations, combat UI, or PvE/PvP behavior.
- Do not modify `data/dictionary.json`.

## Source Workflow To Copy

The ingredient workflow established these concrete rules:

1. Generate or reuse a white-background grid.
2. Verify source IDs and manifest order before upload or Photoroom input.
3. Upload the actual grid file with Scenario MCP `upload_asset` when the grid did not already come from a Scenario generation call.
4. For OAuth users, pass explicit Scenario IDs:
   - `team_id`: `team_g8yJ6jYJtWj44Um1NrmzYiLC`
   - `project_id`: `proj_ZjnKxmdyxtHXaF13xPGsXjWZ`
5. Complete multipart upload with `complete_upload`.
6. Run `model_photoroom-background-removal` with only the required `image` parameter:

```json
{
  "model_id": "model_photoroom-background-removal",
  "parameters": {
    "image": "<uploaded_asset_id>"
  },
  "wait": true
}
```

7. Omit `backgroundColor` so the result keeps transparency.
8. Download the transparent Scenario output with `manage_assets` or `proxy_asset_fetch`.
9. Slice the transparent grid into individual icons using alpha content bounds.
10. Save transparent PNG intermediates and final WebPs.

If any Scenario MCP step fails, the workflow stops and reports the exact tool error. There is no local cleanup fallback.

## Proposed Script Layout

Add a new folder:

```text
scripts/scenario-move-sprites/
  README.md
  build-jobs.mjs
  prompts.mjs
  slice-transparent-grid.mjs
```

`build-jobs.mjs`:

- Loads `data/moves.json`.
- Slugifies `move.nameEn` the same way existing action sprite code does: lowercase, spaces to hyphens.
- Scans `public/assets/sprites/actions/*.webp`.
- Builds jobs for missing slugs by default.
- Supports `--ids <slug1,slug2>` for explicit regeneration.
- Supports `--batch <n>` to emit one batch, and default all missing batches.
- Writes `tmp/move-sprites-scenario/<runId>/manifest.json`.

`prompts.mjs`:

- Extracts or shares the `VISUAL_HINTS` map from `scripts/generate-move-icons.mjs`.
- Exports `buildMoveGridPrompt(batch)`.
- Prompts for a white-background grid, not magenta:
  - exactly 9 compact RPG ability icons
  - 3 rows and 3 columns
  - one icon per cell
  - flat white background
  - no text, labels, numbers, UI frames, creatures, or full characters
  - fully opaque icon pixels with crisp boundaries for clean Scenario removal

`slice-transparent-grid.mjs`:

- Reads a transparent Scenario grid and the matching manifest entries.
- Requires alpha to be present and nontrivial.
- Detects row and column gaps from the alpha mask.
- Crops each non-filler cell by alpha content bounds.
- Centers each icon on a transparent `128x128` canvas.
- Writes:
  - `tmp/move-sprites-scenario/<runId>/sliced/<slug>.png`
  - `public/assets/sprites/actions/<slug>.webp`
- Refuses to write over an existing action sprite unless called with an explicit overwrite flag or the manifest marks the slug as selected for regeneration.

## Manifest Shape

The run manifest should be close to the existing Scenario creature/NPC manifest, with batch-level jobs. This example is abbreviated to one move entry, but the real job contains nine entries:

```json
{
  "runId": "2026-05-17-0715",
  "createdAt": "2026-05-17T07:15:00.000Z",
  "modelId": "model_openai-gpt-image-2",
  "backgroundRemovalModelId": "model_photoroom-background-removal",
  "teamId": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "projectId": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "runDir": "/abs/path/tmp/move-sprites-scenario/2026-05-17-0715",
  "defaults": {
    "width": 1024,
    "height": 1024,
    "quality": "high",
    "background": "opaque"
  },
  "jobs": [
    {
      "batchIndex": 0,
      "prompt": "Draw exactly 9 compact RPG ability icons arranged in a 3x3 layout on a flat white background.",
      "parameters": {
        "prompt": "Draw exactly 9 compact RPG ability icons arranged in a 3x3 layout on a flat white background.",
        "numOutputs": 1,
        "width": 1024,
        "height": 1024,
        "quality": "high",
        "background": "opaque"
      },
      "moves": [
        {
          "index": 0,
          "slug": "gnaw",
          "id": "kajiru",
          "nameEn": "Gnaw",
          "name": "かじる",
          "reading": "かじる",
          "element": "wood",
          "category": "damage",
          "tier": 1,
          "hint": "sharp teeth gnawing at a small branch"
        }
      ],
      "outputs": {
        "whiteGrid": "/abs/path/tmp/move-sprites-scenario/2026-05-17-0715/batch-0-white.png",
        "transparentGrid": "/abs/path/tmp/move-sprites-scenario/2026-05-17-0715/batch-0-transparent.png",
        "slicedDir": "/abs/path/tmp/move-sprites-scenario/2026-05-17-0715/sliced"
      },
      "scenario": {
        "generationJobId": null,
        "whiteGridAssetId": null,
        "backgroundRemovalJobId": null,
        "transparentGridAssetId": null
      },
      "results": {
        "savedAt": null,
        "sliced": []
      }
    }
  ]
}
```

The implementation can add fields as needed, but it should keep Scenario IDs and local output paths in the manifest so a later agent can resume or audit the run.

## Agent MCP Loop

Node scripts cannot call Cursor MCP tools directly, so the Scenario execution remains agent-driven, as in the existing Scenario workflows.

For each manifest job:

1. Call `run_model` on `project-0-koto-dev-scenario` with `model_openai-gpt-image-2`, `job.parameters`, and `wait: true`.
2. Save the generated white grid asset locally.
3. Use the generated Scenario asset ID as the Photoroom input when the `run_model` response exposes it. If a white grid was generated outside Scenario or the generated result must be re-uploaded, follow the ingredient workflow's `upload_asset` plus `complete_upload` path and record the uploaded asset ID.
4. Call `run_model` with `model_photoroom-background-removal` and `parameters.image`.
5. Download the transparent result.
6. Update the manifest after every completed Scenario step.
7. Run `slice-transparent-grid.mjs` only after the transparent grid has verified alpha.

Every MCP call must use the current tool descriptor schema at execution time. The server name expected from prior workflows is `project-0-koto-dev-scenario`.

## Validation

Automated checks:

- Unit test `build-jobs.mjs --dry-run` or equivalent manifest creation for a small selected set.
- Unit test missing move discovery against a temp action sprite directory.
- Unit test slug deduplication by `nameEn`.
- Unit test `slice-transparent-grid.mjs` on a synthetic transparent 3x3 grid.
- Syntax checks for new `.mjs` files with `node --check`.

Manual checks:

- Build a first manifest for 1 batch.
- Run one Scenario generation and Photoroom pass.
- Confirm the transparent grid has alpha.
- Review the resulting 9 WebPs visually before bulk generation.

Completion criteria:

- Missing move slugs can be listed and batched.
- Scenario Photoroom is the only background-removal step.
- Final icons are `128x128` WebP files with alpha.
- Manifest records enough Scenario metadata to resume or investigate failures.

## Risks

- Some missing moves lack visual hints in the current `VISUAL_HINTS` map. The first implementation should either add conservative hints in `prompts.mjs` or fail dry-run with a clear list of missing hints.
- GPT Image 2 may draw text for sound or speech moves. Prompts should explicitly ban text, letters, kana, numbers, labels, and UI frames.
- Photoroom can leave halos or resize outputs. Slicing should use proportional alpha-gap detection, and manual review should catch unacceptable halos before promotion.
- Existing action sprites are sparse but not disposable. Existing files must be protected from accidental overwrite.
