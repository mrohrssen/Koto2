# Creature Animate Skill Design

**Date:** 2026-02-17
**Status:** Approved

## Problem

Creature staging images produced by the creature-forge skill (Gemini-generated PNGs with magenta backgrounds in `data/creature-staging-images/`) need to become game-ready assets: transparent animated idle loops and transparent static fallback sprites. The existing `generate_idle_animations.py` script has all the proven WAN 2.2 + chroma-key logic but expects a different input format (transparent webp sprites from `public/assets/sprites/robots/` + `data/creatures.json` metadata). We need a streamlined path from staging → game-ready.

## Design Decisions

- **Standalone script** that imports proven functions from the existing animation script, rather than modifying it or creating a wrapper
- **Single command** pipeline (not a multi-step agentic runbook) — the lesson from creature-forge is that agentic skills cause agents to rewrite scripts repeatedly
- **Verbose progress reporting** every 30s during WAN generation (~8-10 min per creature on RTX 3090)
- **Two outputs per creature:** animated idle webp + static transparent webp fallback
- **Staging PNG goes directly to WAN** (already has magenta BG) — no pre-processing needed

## Components

### 1. Script: `scripts/animate_staging_creatures.py`

**Input:**
- Creature metadata: `data/new-creatures-staging.json` (for element → prompt flavoring)
- Staging images: `data/creature-staging-images/{id}.png` (magenta BG)

**Output:**
- `public/assets/sprites/robots/{id}-idle.webp` — transparent animated idle (49 frames, 2s @ 24fps, 480x480)
- `public/assets/sprites/robots/{id}.webp` — transparent static fallback

**CLI:**
```bash
python scripts/animate_staging_creatures.py                    # all staging creatures
python scripts/animate_staging_creatures.py --ids kazenoko     # specific creature(s)
python scripts/animate_staging_creatures.py --skip-existing    # skip already-done
python scripts/animate_staging_creatures.py --chroma-only      # re-process chroma key only
python scripts/animate_staging_creatures.py --seed 42          # custom seed
```

**Pipeline per creature:**
1. Read creature metadata from staging JSON (element needed for prompt flavoring)
2. Upload staging PNG to ComfyUI (already magenta BG — no conversion needed)
3. Queue WAN 2.2 two-pass idle animation with proven settings (shift 4.0, cfg 3.5, noise_aug 0.1, 20 steps, euler scheduler, FLF2V looping)
4. Poll with verbose progress every 30s (elapsed time, queue position, ETA based on typical ~8-10 min generation)
5. Download raw animated webp from ComfyUI output
6. Chroma-key animation → transparent animated `{id}-idle.webp`
7. Chroma-key staging PNG → transparent static `{id}.webp`
8. Deploy both to `public/assets/sprites/robots/`

**Imports from `generate_idle_animations.py`:**
- Workflow builder: `build_workflow()`
- ComfyUI helpers: `upload_image()`, `queue_prompt()`, `check_job_status()`, `check_queue()`, `download_output()`, `verify_comfyui()`
- Chroma key: `chroma_key_frame()`, `chroma_key_animated_webp()`, `extract_frames()`
- Constants: `ELEMENT_IDLE_FLAVOR`, `ELEMENT_NEGATIVE_EXTRA`, `BASE_IDLE_PROMPT`, `BASE_NEGATIVE_PROMPT`, all tuning params

**New logic:**
- `main()` reads staging JSON + staging image directory
- `chroma_key_static()` — single-frame chroma key for the static fallback
- Verbose progress with timestamps and ETAs
- Validation: checks staging image exists, creature has element field, ComfyUI is reachable

### 2. Skill: `/Users/michia/.claude/skills/creature-animate/SKILL.md`

Minimal runbook. The skill tells the agent:

1. **Verify prerequisites:** ComfyUI running at 192.168.1.222:8188, staging images exist
2. **Run the script** with appropriate flags
3. **Monitor output** — script prints verbose progress
4. **Preview results** — optionally serve sprites via `python3 -m http.server` and view in browser
5. **If quality is bad** — re-run with `--seed <different>` or re-run specific creatures with `--ids`
6. **Bump SPRITE_VERSION** in `public/js/ui/sprite-utils.js` after deploying new sprites
7. **Troubleshooting:** ComfyUI unreachable, VRAM OOM, chroma-key artifacts

The skill does NOT contain inline Python, workflow JSON, or agentic decision-making. It is a checklist that references the script.

## Architecture

```
data/creature-staging-images/{id}.png  ──┐
data/new-creatures-staging.json  ────────┤
                                         ▼
        scripts/animate_staging_creatures.py
          (imports from generate_idle_animations.py)
                    │
                    ▼
          ComfyUI @ 192.168.1.222:8188
          (WAN 2.2 I2V, two-pass MoE)
                    │
                    ▼
         output/animated-sprites/{id}/idle.webp  (raw, magenta BG)
                    │
                    ▼
              Local chroma key (numpy pixel math)
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
{id}-idle.webp              {id}.webp
(animated, transparent)     (static, transparent)
         │                     │
         └──────────┬──────────┘
                    ▼
    public/assets/sprites/robots/
```

## Proven WAN 2.2 Settings (from existing script)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Frames | 49 | 2.0s at 24fps |
| Width/Height | 480x480 | |
| Shift | 4.0 | Enough body motion without frenzy |
| CFG | 3.5 | NOT 6.0 (causes wash-out) |
| Noise Aug | 0.1 | Enables actual body movement |
| Steps | 20 (10+10) | Two-pass MoE required |
| Scheduler | euler | Better than unipc |
| FPS | 24.0 | |
| FLF2V | looping | Seamless idle loop |

## Dependencies

**Python:** Pillow, numpy (already used by existing scripts)
**ComfyUI:** WAN 2.2 high-noise + low-noise 14B Q4 models, CLIP Vision, T5 encoder, VAE
**Network:** Local network access to 192.168.1.222:8188
