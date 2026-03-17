---
name: creature-animate
description: Animate staging creature images into game-ready idle sprites. Runs WAN 2.2 via ComfyUI (SSH tunnel at 127.0.0.1:8188) to generate transparent animated webp + static fallback webp. Triggers on "animate creature", "creature animate", "idle animation", "animate staging".
---

# Creature Animate

Turn staging creature PNGs (from the creature-forge skill) into game-ready animated idle sprites.

**Input:** `data/creature-staging-images/{id}.png` (Gemini output, any background color)
**Output:** `public/assets/sprites/creatures/{id}-idle.webp` (animated) + `{id}.webp` (static fallback)

## Prerequisites

1. **Staging images exist** in `data/creature-staging-images/` -- created by the creature-forge skill
2. **Creature metadata** in `data/new-creatures-staging.json` -- needed for element-based prompt flavoring
3. **ComfyUI running** via SSH reverse tunnel at `127.0.0.1:8188` with WAN 2.2 models + BiRefNet model loaded

Verify ComfyUI is reachable:
```bash
curl -s http://127.0.0.1:8188/system_stats | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'GPU: {d[\"devices\"][0][\"vram_total\"]/1e9:.0f}GB VRAM')"
```

## Run the Animation Pipeline

### All staging creatures:
```bash
python3 scripts/animate_staging_creatures.py
```

### Specific creatures:
```bash
python3 scripts/animate_staging_creatures.py --ids kazenoko,hikaribon
```

### Skip already-animated:
```bash
python3 scripts/animate_staging_creatures.py --skip-existing
```

### Preview without running (dry run):
```bash
python3 scripts/animate_staging_creatures.py --dry-run
```

## What Happens

1. Script uploads each staging PNG to ComfyUI
2. Queues WAN 2.2 two-pass idle animation (49 frames, 2s @ 24fps, 480x480)
3. Polls for completion with progress updates every ~60s
4. **~8-10 minutes per creature** on RTX 3090 for WAN generation
5. Downloads raw animated webp from ComfyUI (still has background)
6. Auto-detects staging image background color from corner pixels
7. Extracts all 49 frames, runs BiRefNet on each via ComfyUI (~30s total)
8. Post-cleanup on every frame: kills pink fringe, hardens alpha, despills BG color bleed
9. Reassembles transparent frames into animated webp
10. Same BiRefNet + cleanup on the original staging PNG for static fallback webp
11. Deploys both to `public/assets/sprites/creatures/`

## After Animation

### Bump sprite version (required for cache busting):
Edit `public/js/ui/sprite-utils.js` line 9 -- update `SPRITE_VERSION` to today's date:
```js
const SPRITE_VERSION = '20260217';  // bump after new sprites
```

### Preview sprites:
```bash
cd public/assets/sprites/creatures && python3 -m http.server 9090
```
Then open `http://localhost:9090/{id}-idle.webp` in browser to verify animation quality.

## Re-running Steps

### Re-run background removal only (skip WAN, re-process existing raw animations):
```bash
python3 scripts/animate_staging_creatures.py --rembg-only
```

### Re-run with different seed (if animation quality is poor):
```bash
python3 scripts/animate_staging_creatures.py --ids kazenoko --seed 42
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot reach ComfyUI" | Check SSH tunnel is active. ComfyUI runs on dev PC, tunneled to `127.0.0.1:8188`. See CLAUDE.md for restart endpoint. |
| VRAM OOM | Close other GPU tasks, restart ComfyUI via `curl -s http://127.0.0.1:8189/restart` |
| Background remnants on edges | Check BiRefNet model is installed in ComfyUI, try `--rembg-only` to reprocess |
| Animation too jittery | Lower shift value (currently 4.0) -- edit in `generate_idle_animations.py` |
| Animation too static | Raise noise_aug (currently 0.1) -- edit in `generate_idle_animations.py` |
| Only effects move, body frozen | Known WAN issue. Re-run with different seed |

## Technical Details

- **WAN 2.2 settings:** shift=4.0, cfg=3.5, noise_aug=0.1, 20 steps (10+10 two-pass MoE), euler scheduler, FLF2V looping
- **Element flavoring:** fire=flickering flames, water=rippling bubbles, wood=rustling leaves, earth=floating pebbles, metal=faint sparks
- **Background removal:** BiRefNet-general via ComfyUI `BiRefNetRMBG` node (AI-based, handles any background color — no chroma key)
- **Post-cleanup (`cleanup_rmbg_frame()`):** BiRefNet can produce soft alpha edges. The cleanup pass: (1) detects pink/magenta hue pixels (280-360°), (2) forces semi-transparent pink pixels fully transparent (kills BG bleed wisps), (3) hardens alpha (>240→255, <15→0), (4) desaturates surviving pink-hued opaque pixels
- **BG color auto-detection:** Samples staging image corner pixels to detect actual BG color (Gemini often drifts from requested magenta)
- **Script imports** WAN animation functions from `scripts/generate_idle_animations.py`, background removal + cleanup pipeline is self-contained
