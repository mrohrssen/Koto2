# CivitAI Art Research Tool — Design Spec

## Purpose

A re-runnable pipeline that discovers better image generation models and techniques on CivitAI, compares them against our current art style, and regenerates all game assets when improvements are found.

Designed to be executed by Claude via `/superpowers:execute-plan`. Each run produces a report for human review, then generates sample batches for approval before committing to a full asset regeneration.

## Game Context

**NEO TOKYO: System Liberation** — A Japanese vocabulary learning RPG set in near-future Tokyo. Citizens are possessed by an AI called SYSTEM and need liberation through turn-based dungeon combat across 7 Tokyo wards.

**Visual tone**: Bright, optimistic, energetic. Not grimdark cyberpunk — more like Pokemon Z-A (futuristic city), Xenoblade Chronicles (dramatic character poses), Genshin Impact (vibrant colors, gacha-quality character art). The world feels sunny and alive despite the digital threat.

**Color philosophy**: Saturated, warm, varied palette. Liberation (player) = orange/pink/gold warmth. SYSTEM (enemies) = cyan/blue cold. Overall the game skews bright and colorful.

## Asset Categories

### Enemy Sprites
- Clean anime character art, bold outlines
- Full body, dynamic/confident poses
- Everyday Tokyo citizens (students, workers, chefs) through dramatic bosses (rainbow capes, golden halos, royal armor)
- Vibrant saturated colors, warm lighting
- Style reference: gacha game character art (Fire Emblem Heroes, Genshin wish screen)
- Transparent background via RMBG-2.0
- Resolution: 1024x1024

### Chip Icons
- Objects personified as cute chibi creatures/robots
- The item IS the character's body (onigiri with a face, scissors as a mech)
- Mix of kawaii (blushing cheeks) and techy (cyber-limbs, glowing eyes)
- Simple clean lines, transparent background
- Resolution: 1024x1024

### Backgrounds
- Bright anime cityscapes, street-level perspective
- Colorful signage, modern Tokyo architecture, blue skies
- Visual novel / anime movie quality (Makoto Shinkai-esque lighting)
- Each ward has a distinct theme (residential, nightlife, corporate, government, etc.)
- Hub: futuristic command center overlooking city at sunset
- Resolution: landscape (e.g., 1344x768 or similar)

## Workflow Phases

### Phase 1: Discovery
- Read keywords and preferences from `docs/art-style.md`
- Query CivitAI API with broad keyword sets per category
- Search terms include but aren't limited to: "game sprite", "anime character", "gacha", "chibi icon", "cyberpunk city", "anime background", "visual novel", "illustrious", "game", "game art", "rpg"
- Filter results by: base model compatibility (SDXL/Illustrious family), type (Checkpoint, LoRA, Embedding), minimum rating/download threshold
- Fetch full model pages for top candidates (trigger words, recommended settings, example prompts)
- Download 2-3 sample images per promising model from CivitAI
- Output: Research report with sample images

### Phase 2: Human Review (via Claude Q&A)
- Claude presents findings from the report
- Shows sample images inline (Read tool on local files)
- Asks which models/styles to explore further
- Interactive — no file editing needed

### Phase 3: Model Setup
- SSH into `michia@192.168.1.222` and download selected models (checkpoints, LoRAs, embeddings) to ComfyUI's model directories
- Verify models load correctly via ComfyUI API

### Phase 4: Batch Generation
- Generate ~10 sample images per selected model
- Use existing asset descriptions (enemy prompts, chip prompts, background prompts) with the new model/settings
- Vary prompts, CFG, samplers to explore model range
- Save samples locally for review

### Phase 5: Final Selection (via Claude Q&A)
- Claude shows batch results, asks which model/prompt combos work best
- Updates `config/generation-config.json` with approved settings
- Updates `docs/art-style.md` with new preferences and lessons learned

### Phase 6: Full Regeneration
- Run generation scripts against all game assets using approved config
- Replace existing sprites/icons/backgrounds with new outputs
- All assets regenerated in one batch

## Infrastructure

### ComfyUI Machine
- Host: `192.168.1.222`
- SSH user: `michia`
- SSH keys: pre-configured on this Mac (no password needed)
- ComfyUI API: `http://192.168.1.222:8188`
- Model directories discovered via SSH

### CivitAI Access
- Public REST API: `https://api.civitai.com/v1/`
- Model pages: fetchable via direct URL (server-side rendered)
- Image CDN: direct download via URL from API responses
- No authentication required for public content
- API supports: search by keyword, sort by rating/downloads/trending, filter by type/base model/time period

### Local Paths
- Art style doc: `docs/art-style.md`
- Generation config: `config/generation-config.json`
- Research reports: `docs/plans/YYYY-MM-DD-civitai-research-report.md`
- Sample images: `tmp/civitai-samples/`
- Generation scripts: `scripts/`

## Generation Config Schema

```json
{
  "comfyui": {
    "host": "192.168.1.222",
    "port": 8188,
    "ssh_user": "michia"
  },
  "categories": {
    "enemies": {
      "checkpoint": "waiIllustriousSDXL_v160.safetensors",
      "loras": [],
      "embeddings": [],
      "style_prompt": "...",
      "negative_prompt": "...",
      "sampler": "dpmpp_2m",
      "scheduler": "karras",
      "steps": 30,
      "cfg": 7.5,
      "resolution": [1024, 1024],
      "post_processing": ["RMBG-2.0"]
    },
    "chips": {},
    "backgrounds": {}
  }
}
```

Each category has its own model stack, prompts, and settings. The research tool proposes changes to this file; human approves before anything runs.

## Research Report Format

Reports are designed to be reviewed in a Claude session where images can be displayed inline.

1. **Executive Summary** — What was searched, how many models evaluated, top recommendations
2. **Per-Category Findings** (enemies, chips, backgrounds):
   - Current setup (what's in use now)
   - Discovered models (name, type, CivitAI link, why it's relevant)
   - Sample images (saved to `tmp/civitai-samples/`, referenced by path)
   - Recommended settings from model creators
3. **Recommendations** — Ranked list of what to try, with rationale
4. **Draft Config Diff** — What would change in `generation-config.json` if adopted

## Current Baseline

As of January 2026, the game uses:
- **Checkpoint**: waiIllustriousSDXL_v160
- **Sampler**: DPM++ 2M, Karras scheduler
- **Steps**: 30, **CFG**: 7.5
- **Resolution**: 1024x1024 (sprites/chips), landscape (backgrounds)
- **Post-processing**: RMBG-2.0 for transparent backgrounds
- **Embeddings**: None currently (lazypos/lazyneg are candidates)

## Future Considerations

- **Animation**: Once static art style is locked down, a separate research effort can explore AnimateDiff, SVD, or other animation pipelines for looping sprites and animated backgrounds
- **Style consistency**: As the tool matures, it should track which models/settings produced which assets, so the style doc can reference specific successful generations
- **A/B comparison**: Phase 4 could generate side-by-side comparisons (old model vs new model, same prompt) for easier evaluation
