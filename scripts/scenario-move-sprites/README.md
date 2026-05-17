# Scenario move sprite workflow

Generate missing move sprites with Scenario MCP, using the same background-removal pattern as the ingredient icon workflow.

## Rules

- Generate 3x3 white-background grids.
- Use Scenario MCP for background removal with `model_photoroom-background-removal`.
- Do not use local RMBG, ComfyUI RMBG, BiRefNet, white color-keying, or magenta color-keying as a fallback.
- If any Scenario step fails, stop and report the exact tool error.
- Slice only transparent Scenario outputs by alpha channel.

## Build a manifest

List currently missing move sprites:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --list
```

Build a manifest for all missing move sprites:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs
```

Build a small pilot manifest:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --ids gnaw,impact,seal --run pilot
```

Manifests are written to:

```text
tmp/move-sprites-scenario/<runId>/manifest.json
```

## Agent MCP loop

For each job in the manifest:

1. Call `run_model` on `project-0-koto-dev-scenario`.
2. Use model `model_openai-gpt-image-2`.
3. Pass `job.parameters`.
4. Pass:

```json
{
  "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "wait": true
}
```

5. Save the white generated grid to `job.outputs.whiteGrid`.
6. Run `model_photoroom-background-removal` with only:

```json
{
  "image": "<white_grid_asset_id>"
}
```

Do not pass `backgroundColor`.

7. Download the transparent result to `job.outputs.transparentGrid`.
8. Update `manifest.json` with each Scenario job and asset ID as soon as it is known.

If the grid was generated outside Scenario, upload it first with `upload_asset`, PUT the file bytes to the presigned URL, then call `complete_upload`. This is the same path used by the ingredient icon workflow.

## Slice a transparent grid

```bash
node scripts/scenario-move-sprites/slice-transparent-grid.mjs \
  --manifest tmp/move-sprites-scenario/<runId>/manifest.json \
  --batch 0 \
  --grid tmp/move-sprites-scenario/<runId>/batch-0-transparent.png \
  --out public/assets/sprites/actions \
  --sliced tmp/move-sprites-scenario/<runId>/sliced
```

Use `--overwrite` only when intentionally regenerating existing action sprites.

## Verify

```bash
node --check scripts/scenario-move-sprites/prompts.mjs
node --check scripts/scenario-move-sprites/build-jobs.mjs
node --check scripts/scenario-move-sprites/slice-transparent-grid.mjs
node --test tests/unit/scripts/scenario-move-sprites.test.js
```
