# Sprite Forge — Design

**Date:** 2026-03-09
**Location:** New tab in Forge dashboard (`forge.html`)

## Overview

Bulk image generation, review, and approval for all sprite types. Fully automated pipeline from generation through background removal, with variant selection and one-click deployment.

## Source & Selection

- Scans both staging (`new-*-staging.json`) and production (`*.json`) files for entries missing sprites
- Groups by type: Creatures, Items, Moves, Bosses, Backgrounds, NPCs
- Shows count of missing sprites per type as badges
- Freeform mode: manually enter ID, name, visual description for one-offs
- Per-item controls: number of variants (1-4), optional notes/visual guidance
- Bulk controls: select multiple, set variants count for all, hit "Generate"

## Generation Pipeline

Fully automated per job. Progress shown: `Generating → Slicing → Removing BG → Ready for review`

| Type | Generator | Size | Post-processing |
|------|-----------|------|----------------|
| Items | Gemini Flash (3x3 grid) | 128x128 | Slice grid → RMBG via ComfyUI |
| Moves | Gemini Flash (3x3 grid) | 128x128 | Slice grid → RMBG via ComfyUI |
| Creatures | Gemini Flash (individual) | 1024x1024 | RMBG via ComfyUI |
| Bosses | ComfyUI SDXL | 1024x1024 | RMBG via ComfyUI |
| Backgrounds | ComfyUI SDXL | 1536x1024 | None (keeps background) |
| NPCs | ComfyUI SDXL | 1024x1024 | RMBG via ComfyUI |

### Gemini Flash (Items, Moves, Creatures)

- Items/Moves: 3x3 grid on magenta (#FF00FF) background, then slice into individual 128x128 icons
- Creatures: individual 1024x1024 on white background
- API key from `data/.creature-forge-gemini-key`
- Variants: each variant = separate API call (or grid positions for items/moves)

### ComfyUI SDXL (Bosses, Backgrounds, NPCs)

- Remote PC tunneled to `127.0.0.1:8188` on VPS
- Model: `waiIllustriousSDXL_v160.safetensors`
- Bosses/NPCs: anime character illustration, full body, transparent bg via RMBG-2.0
- Backgrounds: anime game background art, 1536x1024, no RMBG

### RMBG (Background Removal)

- All types except Backgrounds run through ComfyUI RMBG-2.0
- Converts to transparent PNG/WebP

## Review & Approve

- All variants displayed in a grid with item metadata (name, JP, type)
- Click to select winner (visual highlight)
- **Approve**: deploys winner to `public/assets/sprites/{type}/{id}.webp`
- **Regenerate**: re-runs that specific item with optional updated notes
- **Discard**: removes all variants

## Error Handling

- ComfyUI tunnel down: clear error message with retry button (no hanging)
- Gemini API failure: surface error per-job (don't block batch)
- Jobs are independent — one failure doesn't stop others

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dev/api/sprites/missing` | Scan all types for entries missing sprites |
| `POST` | `/dev/api/sprites/generate` | Queue a generation job |
| `GET` | `/dev/api/sprites/jobs` | Poll job status |
| `POST` | `/dev/api/sprites/approve` | Deploy winning variant to production |
| `POST` | `/dev/api/sprites/discard` | Clean up variants for a job |

## Storage

- Variants staged in `data/sprite-staging/{type}/{id}/variant-{n}.png`
- Cleaned up on approve or discard
- Job state held in memory (not persisted — page refresh loses job tracking, but staged files remain)

## UI Location

New "Sprites" tab in the Forge dashboard nav bar, alongside existing Themes/Queue/Results tabs.
