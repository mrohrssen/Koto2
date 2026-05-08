# Scenario NPC sprite workflow

Generate NPC sprites with **GPT-Image-2** through the **Scenario MCP**, asking
for **3 variants per NPC** in a single `run_model` call.

This mirrors `scripts/scenario-creature-sprites/`, but uses the currently wired
NPC sprite IDs and left-facing full-body prompts.

## NPC IDs

Data-driven NPCs:

- `kodomo`
- `otona`
- `otokonoko`
- `onnanoko`
- `sensei`
- `kyouju`
- `seito`
- `senpai`

Hardcoded UI sprites:

- `cid`
- `game-master`
- `shrine_fox`

`shrine_fox` is generated in this workflow with the same manifest shape, but the
game currently serves it from `public/assets/sprites/shrine_fox.webp` instead of
`public/assets/sprites/npcs/shrine_fox.webp`.

## Step 1 — build the job manifest

```bash
node scripts/scenario-npc-sprites/build-jobs.mjs --ids kodomo,otona,otokonoko,onnanoko,sensei,kyouju,seito,senpai,cid,game-master,shrine_fox
```

Optional flags:

| flag         | default | meaning                                           |
|--------------|---------|---------------------------------------------------|
| `--variants` | `3`     | Images per NPC (gpt-image-2 max `numOutputs` 10) |
| `--width`    | `1024`  | Output width in pixels                            |
| `--height`   | `1024`  | Output height in pixels                           |
| `--quality`  | `high`  | gpt-image-2 quality: `auto`/`high`/`medium`/`low` |
| `--run`      | UTC ts  | Run id (also used as output subdir)               |
| `--out`      | `tmp/npc-sprites-scenario` | Output root                    |

This writes `tmp/npc-sprites-scenario/<runId>/manifest.json`.

The script does **not** call Scenario. It only plans the work.

## Step 2 — run each job through Scenario MCP

For each `job` in `manifest.jobs`, call the Scenario MCP `run_model` tool:

```json
{
  "model_id": "model_openai-gpt-image-2",
  "parameters": "<job.parameters>",
  "wait": true
}
```

The response contains `assets: [{ id, app_url }, ...]`. Append those into
`job.results.assets` in order and persist the manifest as you go so a restart
can resume.

If `run_model` returns `status: "in_progress"`, poll with `manage_jobs`
(action `check`, `job_id` from the response) until completion, then read the
final assets the same way.

## Step 3 — save each asset to disk

For each returned `asset_id`, save it to the corresponding `job.outputs[i]`.
Two viable approaches:

1. **`proxy_asset_fetch`** (Scenario MCP) — returns base64; decode and write to
   disk.
2. **CDN download** — `manage_assets` action `get` exposes the asset's
   downloadable URL; `curl -L -o <job.outputs[i]> <url>` writes the binary.

After saving, set `job.results.savedAt = <ISO timestamp>` and rewrite the
manifest.

## Notes

- Prompts are self-contained visual descriptions: hair, outfit, pose, colors,
  and props are written directly into each prompt so Scenario does not need any
  project context.
- `sensei`, `kyouju`, `seito`, and `senpai` are wired in `data/npcs.json`, but
  do not currently have matching committed sprite files.
- All prompts request the NPC facing left.
