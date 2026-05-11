# Creature Idle/Walk Animation Workflow

This runbook explains how to generate, process, and ship scene-area creature idle/walk animations.

Use this for future batches after the initial `neko` / `hi` / `ishi` pilot. The workflow is intentionally conservative: every generated asset is opt-in through a manifest, every sheet must pass alpha verification before promotion, and missing animations fall back to existing static sprites.

## Runtime Contract

Animated creature sheets live under:

```text
public/assets/sprites/creatures-animated/
  manifest.json
  <creature-id>/
    idle.png
    walk.png
    metadata.json
```

The runtime manifest controls which creatures use animation:

```json
{
  "version": "20260511",
  "frameWidth": 256,
  "frameHeight": 256,
  "columns": 6,
  "frames": 24,
  "fps": 12,
  "renderScale": 1.85,
  "animations": {
    "neko": {
      "idle": "/assets/sprites/creatures-animated/neko/idle.png?v=20260511",
      "walk": "/assets/sprites/creatures-animated/neko/walk.png?v=20260511"
    }
  }
}
```

Only Pixi scene-area formation sprites use these animation sheets. All non-scene UI sprite displays continue using static assets from `public/assets/sprites/creatures/`.

Runtime behavior:

- `idle` plays whenever the formation is not traveling, including combat.
- `walk` plays only while `formation.walkingEnabled` is true, which currently maps to room travel/parallax movement.
- If a manifest entry or animation file is missing, the creature falls back to the existing static sprite.
- Animated sprites use the normal battlefield row/depth scale multiplied by global `renderScale: 1.85`.

## Source Images

White-background source images are generated outside the main repo and live at:

```text
/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures/<creature-id>.png
```

Expected source image properties:

- `480x480`
- plain white background
- creature centered using the same normalization as the static sprite source

Before generating a creature, verify the source exists:

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image

source_root = Path("/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures")
for creature_id in ["neko", "hi", "ishi"]:
    path = source_root / f"{creature_id}.png"
    if not path.exists():
        raise SystemExit(f"missing {path}")
    image = Image.open(path)
    if image.size != (480, 480):
        raise SystemExit(f"{path} expected 480x480, got {image.size}")
    print(creature_id, image.mode, image.size)
PY
```

## Scenario Models

Use Scenario MCP.

Seedance video model:

```text
model_bytedance-seedance-2-0
```

Background removal model:

```text
model_photoroom-background-removal
```

Seedance prompts:

```text
idle animation for a monster collector game on a plain white background - no shadows or additional details
```

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

Use the same uploaded white-background image for both:

- `image`
- `lastFrameImage`

This creates a closed loop. The decoded final frame may not be byte-identical after video compression, but still treat it as the duplicate endpoint.

## MCP Reliability And Duplicate Guards

Scenario MCP can be flaky. If `CallMcpTool` says the Scenario tool is missing or unavailable, retry the same operation a few times before declaring a blocker.

When dispatching subagents, explicitly tell them:

- retry Scenario MCP calls up to 5 times
- never call Seedance if `source-video.mp4` already exists
- never call Seedance if `queue.json` already has a `job_id` or `asset_id` for that creature/kind
- process only the creature IDs assigned to that batch

Use `output/creature-animations/<creature-id>/queue.json` as the duplicate guard for queued-but-not-yet-downloaded jobs.

Example `queue.json` shape:

```json
{
  "creatureId": "kaminari",
  "sourceAssetId": "asset_...",
  "queuedAt": "2026-05-11T10:35:00.000Z",
  "jobs": {
    "idle": {
      "job_id": "job_...",
      "status": "in-progress",
      "model_id": "model_bytedance-seedance-2-0",
      "prompt": "idle animation for a monster collector game on a plain white background - no shadows or additional details"
    },
    "walk": {
      "job_id": "job_...",
      "status": "in-progress",
      "model_id": "model_bytedance-seedance-2-0",
      "prompt": "walking animation for a monster collector game on a plain white background - no shadows or additional details"
    }
  }
}
```

## Queue Video Jobs

For each creature:

1. Upload `creatures/<id>.png` once with `upload_asset`.
2. Complete the upload with `complete_upload`.
3. Queue one `idle` job and one `walk` job with `run_model` and `wait: false`.
4. Write `queue.json`.

Do not download or process videos in the queueing step.

The job call should use:

```json
{
  "model_id": "model_bytedance-seedance-2-0",
  "parameters": {
    "prompt": "<idle or walk prompt>",
    "image": "<source asset id>",
    "lastFrameImage": "<source asset id>",
    "duration": 4,
    "resolution": "480p",
    "aspectRatio": "adaptive",
    "generateAudio": false
  },
  "wait": false
}
```

## Download Completed Videos

For each `queue.json` job:

1. `manage_jobs` with `action: "check"` and the stored `job_id`.
2. Continue only if `status === "success"`.
3. Read the output video asset id from `job.metadata.assetIds[0]`.
4. `manage_assets` with `action: "download"` and no `format` metadata.
5. Download to:

```text
output/creature-animations/<id>/<kind>/source-video.mp4
```

Do not rerun Seedance if a job is still pending. Leave the queue record as the resume point.

## Convert Video To RGB Source Sheet

Install/use static ffmpeg tools if needed:

```bash
mkdir -p tmp/ffmpeg-tools
npm install --prefix tmp/ffmpeg-tools --no-save ffmpeg-static ffprobe-static
```

Decode frames:

```bash
FFMPEG="$(node -e "console.log(require('./tmp/ffmpeg-tools/node_modules/ffmpeg-static'))")"
"$FFMPEG" -y -i "output/creature-animations/<id>/<kind>/source-video.mp4" \
  "output/creature-animations/<id>/<kind>/raw/frame-%03d.png"
```

Expected:

- `97` decoded frames
- `640x640`
- `24fps`
- about `4.04s`

Build a sampled RGB source sheet:

```python
from pathlib import Path
from PIL import Image

root = Path("output/creature-animations")
creature_id = "<id>"
kind = "<idle-or-walk>"
d = root / creature_id / kind

raw = sorted((d / "raw").glob("frame-*.png"))
if len(raw) != 97:
    raise SystemExit(f"{creature_id}/{kind}: expected 97 frames, got {len(raw)}")

sampled = d / "sampled"
sampled.mkdir(exist_ok=True)

for out_i, src_num in enumerate([1 + idx * 4 for idx in range(24)], 1):
    image = Image.open(d / "raw" / f"frame-{src_num:03d}.png").convert("RGB")
    image.save(sampled / f"frame-{out_i:03d}.png")

first = Image.open(sampled / "frame-001.png").convert("RGB")
cell_w, cell_h = first.size

sheet = Image.new("RGB", (cell_w * 6, cell_h * 4), (255, 255, 255))
for index in range(1, 25):
    frame = Image.open(sampled / f"frame-{index:03d}.png").convert("RGB")
    slot = index - 1
    sheet.paste(frame, ((slot % 6) * cell_w, (slot // 6) * cell_h))

sheet.save(d / "source-sheet-rgb.png")
```

Critical rule:

```text
Pre-removal sheets must be RGB PNGs.
Do not save all-opaque RGBA PNGs before Scenario background removal.
```

We confirmed Scenario Photoroom can no-op on all-opaque RGBA sheets.

## Run Background Removal

For each `source-sheet-rgb.png`:

1. Upload with `upload_asset`.
2. Complete upload.
3. Run `model_photoroom-background-removal`:

```json
{
  "model_id": "model_photoroom-background-removal",
  "parameters": {
    "image": "<uploaded source-sheet asset id>"
  },
  "wait": true
}
```

4. Download output PNG to:

```text
output/creature-animations/<id>/<kind>/cleaned-source-sheet.png
```

5. Verify alpha:

```python
from pathlib import Path
from PIL import Image
import numpy as np

path = Path("output/creature-animations/<id>/<kind>/cleaned-source-sheet.png")
image = Image.open(path).convert("RGBA")
arr = np.array(image)
alpha = arr[:, :, 3]
rgb = arr[:, :, :3]
transparent_pct = 100 * (alpha < 10).sum() / alpha.size
opaque_white_pct = 100 * (((rgb > 245).all(axis=2)) & (alpha > 245)).sum() / alpha.size

if transparent_pct <= 50 or opaque_white_pct >= 1:
    raise SystemExit(f"alpha failed: transparent={transparent_pct}, opaqueWhite={opaque_white_pct}")

print(round(transparent_pct, 2), round(opaque_white_pct, 4))
```

Do not promote assets that fail this gate.

## Build Final 256 Sheet

Scenario may resize large inputs. Slice by proportional grid boundaries, not by the original source dimensions:

```python
from pathlib import Path
from PIL import Image
import numpy as np

target = 256
columns = 6
rows = 4

d = Path("output/creature-animations/<id>/<kind>")
source = Image.open(d / "cleaned-source-sheet.png").convert("RGBA")
source_width, source_height = source.size
final_sheet = Image.new("RGBA", (target * columns, target * rows), (0, 0, 0, 0))

for index in range(24):
    col = index % columns
    row = index // columns
    sx0 = round(col * source_width / columns)
    sx1 = round((col + 1) * source_width / columns)
    sy0 = round(row * source_height / rows)
    sy1 = round((row + 1) * source_height / rows)
    cell = source.crop((sx0, sy0, sx1, sy1))
    resized = cell.resize((target, target), Image.Resampling.LANCZOS)
    final_sheet.paste(resized, ((index % columns) * target, (index // columns) * target), resized)

final_sheet.save(d / "sheet-256.png")
```

Verify:

- `1536x1024`
- transparent background
- `transparentPct > 50`
- `opaqueWhitePct < 1`

## Promote To Runtime Assets

Only after verification:

```text
output/creature-animations/<id>/idle/sheet-256.png -> public/assets/sprites/creatures-animated/<id>/idle.png
output/creature-animations/<id>/walk/sheet-256.png -> public/assets/sprites/creatures-animated/<id>/walk.png
output/creature-animations/<id>/metadata.json -> public/assets/sprites/creatures-animated/<id>/metadata.json
```

Then add/update the manifest entry:

```json
"<id>": {
  "idle": "/assets/sprites/creatures-animated/<id>/idle.png?v=20260511",
  "walk": "/assets/sprites/creatures-animated/<id>/walk.png?v=20260511"
}
```

Keep manifest opt-in. If any creature/kind fails, do not add that creature until both `idle` and `walk` are valid.

## Verification Commands

Verify all manifest assets:

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image
import numpy as np
import json

root = Path("public/assets/sprites/creatures-animated")
manifest = json.loads((root / "manifest.json").read_text())

for creature_id in sorted(manifest["animations"]):
    for kind in ["idle", "walk"]:
        path = root / creature_id / f"{kind}.png"
        image = Image.open(path).convert("RGBA")
        if image.size != (1536, 1024):
            raise SystemExit(f"{path} wrong size {image.size}")
        arr = np.array(image)
        alpha = arr[:, :, 3]
        rgb = arr[:, :, :3]
        transparent_pct = 100 * (alpha < 10).sum() / alpha.size
        opaque_white_pct = 100 * (((rgb > 245).all(axis=2)) & (alpha > 245)).sum() / alpha.size
        if transparent_pct <= 50 or opaque_white_pct >= 1:
            raise SystemExit(f"{path} alpha failed: transparent={transparent_pct}, white={opaque_white_pct}")

print("verified", len(manifest["animations"]), "animated creatures")
PY
```

Run focused runtime checks:

```bash
node --check public/js/pixi/creature-animation-manifest.js
node --check public/js/pixi/animated-creature-sprite.js
node --check public/js/pixi/formation.js
node --check public/js/scenes/hub-scene.js
npm run test:unit -- \
  tests/unit/pixi/creature-animation-manifest.test.js \
  tests/unit/pixi/animated-creature-sprite.test.js \
  tests/unit/pixi/formation-travel-offset.test.js \
  tests/unit/scenes/hub-scene.test.js
```

Verify dev server:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

## Visual QA

Before reporting visual completion, verify in the browser:

- `idle` plays when standing still.
- `walk` plays during room transition.
- creatures idle in combat while existing Pixi attack/projectile/particle VFX still move them.
- non-manifest creatures fall back to static sprites.
- no opaque white boxes are visible.
- animated creatures are native-sized in scene area via global `1.85` render scale.

Project rule: ask before launching Playwright/browser automation.

## Known Failure Modes

### Scenario MCP Tool Missing

Sometimes Scenario MCP calls briefly return `tool not found` even though the server is configured. Retry the exact MCP call a few times before declaring a blocker.

### Opaque White Background After Photoroom

Likely cause: the pre-removal sheet was saved as all-opaque `RGBA`.

Fix: regenerate `source-sheet-rgb.png` as `RGB` and rerun Photoroom.

### Creature Pops Between Idle And Walk

Likely cause: different crop/source cell between `idle` and `walk`.

Fix: use the same full source frame/cell for both animations of a creature.

### Jitter

Likely cause: per-frame crop or per-frame recentering.

Fix: never crop per frame. Use fixed cell layout.

### Tiny In Game

Likely cause: runtime scaling is using full sheet texture dimensions instead of manifest frame dimensions.

Fix: scale animated sprites by manifest `frameWidth` / `frameHeight`, then multiply by global `renderScale`.

### Subagent Uses Local Background Fallback

Do not trust local edge-white background removal as final output unless explicitly approved. Scenario Photoroom is the quality bar for runtime assets.
