# Scenario creature sprite workflow

Generate creature sprites with **GPT-Image-2** through the **Scenario MCP**, asking
for **5 variants per creature** in a single `run_model` call.

This is the Scenario-side counterpart of `scripts/generate-creature-sprites.mjs`
(which uses Gemini directly via API key). The Gemini script is left untouched —
this directory has its own copy of the prompt list in `prompts.mjs`.

## Inputs

- Creature IDs come from `prompts.mjs` (`CREATURES`).
- Prompt for each creature = `<description> ${PROMPT_SUFFIX}` (same shape as the
  Gemini script).
- The user always specifies which IDs to run; there is no "all creatures"
  default.

## Step 1 — build the job manifest

```bash
node scripts/scenario-creature-sprites/build-jobs.mjs --ids hi,mizu,ki
```

Optional flags:

| flag         | default | meaning                                              |
|--------------|---------|------------------------------------------------------|
| `--variants` | `5`     | Images per creature (gpt-image-2 max `numOutputs` 10)|
| `--width`    | `1024`  | Output width in pixels                               |
| `--height`   | `1024`  | Output height in pixels                              |
| `--quality`  | `high`  | gpt-image-2 quality: `auto`/`high`/`medium`/`low`    |
| `--run`      | UTC ts  | Run id (also used as output subdir)                  |
| `--out`      | `tmp/creature-sprites-scenario` | Output root                |

This writes `tmp/creature-sprites-scenario/<runId>/manifest.json`:

```json
{
  "runId": "2026-05-08-0510",
  "modelId": "model_openai-gpt-image-2",
  "runDir": "/abs/path/tmp/creature-sprites-scenario/2026-05-08-0510",
  "defaults": { "variants": 5, "width": 1024, "height": 1024, "quality": "high" },
  "jobs": [
    {
      "creatureId": "hi",
      "prompt": "A small fire spirit ... pixel art style.",
      "parameters": {
        "prompt": "A small fire spirit ... pixel art style.",
        "numOutputs": 5,
        "width": 1024,
        "height": 1024,
        "quality": "high"
      },
      "outputs": [
        ".../hi/hi-a.png",
        ".../hi/hi-b.png",
        ".../hi/hi-c.png",
        ".../hi/hi-d.png",
        ".../hi/hi-e.png"
      ],
      "results": { "assets": [] }
    }
  ]
}
```

The script does **not** call Scenario. It only plans the work.

## Step 2 — run each job through Scenario MCP

For each `job` in `manifest.jobs`, the agent calls the Scenario MCP `run_model`
tool:

```
server:    scenario  (project-0-koto-dev-scenario)
tool:      run_model
arguments: {
  "model_id": "model_openai-gpt-image-2",
  "parameters": <job.parameters>,
  "wait": true
}
```

`numOutputs: 5` returns 5 variants in a single call — that is the "5 variants
per creature" requirement.

The response contains `assets: [{ id, app_url }, ...]`. Append those into
`job.results.assets` (in order) and persist the manifest as you go so a
restart can resume.

If `run_model` returns `status: "in_progress"`, poll with `manage_jobs`
(action `check`, `job_id` from the response) until completion, then read the
final assets the same way.

## Step 3 — save each asset to disk

For each `asset_id` returned, save it to the corresponding path in
`job.outputs[i]`. Two viable approaches:

1. **`proxy_asset_fetch`** (Scenario MCP) — returns base64; agent decodes and
   writes to disk via the `Write` tool or shell. Best inside a Cursor agent
   session.
2. **CDN download** — `manage_assets` action `get` exposes the asset's
   downloadable URL; `curl -L -o <job.outputs[i]> <url>` writes the binary.

After saving, set `job.results.savedAt = <ISO timestamp>` and rewrite the
manifest. That is the artifact a later step (sprite quality pipeline,
chroma-keying, etc.) consumes.

## Re-running

- Same `--ids` + same `--run` overwrites that run dir.
- Different `--run` keeps runs side-by-side under
  `tmp/creature-sprites-scenario/`.
- `tmp/` is gitignored — manifests and PNGs never end up in the repo.

## Notes

- `prompts.mjs` is intentionally a near-duplicate of the prompt block in
  `scripts/generate-creature-sprites.mjs`. If you change a creature's
  description, update both files so Gemini and Scenario stay in sync.
- gpt-image-2 schema: see `manage_models` / `get_model_schema` for the full
  parameter list. Only `prompt` is required; `numOutputs` is capped at 10.
- The `team_id` / `project_id` for Scenario MCP calls comes from the existing
  scenario MCP context configured in `.cursor/mcp.json`.
