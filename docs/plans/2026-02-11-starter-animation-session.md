# Starter Animation Session — 2026-02-11

## Goal

Generate idle, attack, and hit animations for the three starter robots (Sizzlit, Drizzlet, Petalia) using the Wan 2.2 ComfyUI pipeline, then remove the white backgrounds to produce transparent animated WebPs.

## Starters

| Robot | Element | Sprite | Description |
|-------|---------|--------|-------------|
| Sizzlit | Fire | `sizzlit.webp` | Grilled meat with stubby legs and a sizzling surface |
| Drizzlet | Water | `drizzlet.webp` | Teardrop-shaped water creature with a cloud hat |
| Petalia | Wood | `petalia.webp` | Round creature with colorful petals fanning from its head |

## What We Generated

All animations used the proven two-pass MoE workflow from `2026-02-11-wan-comfyui-working-workflow.md`.

### Completed animations (in `test-animations/`)

| File | Action | Frames | Duration |
|------|--------|--------|----------|
| sizzlit-idle.webp | idle | 49 | 2.0s |
| sizzlit-attack.webp | attack | 21 | 0.875s |
| sizzlit-hit.webp | hit | 21 | 0.875s |
| drizzlet-idle.webp | idle | 49 | 2.0s |
| drizzlet-attack.webp | attack | 21 | 0.875s |
| drizzlet-hit.webp | hit | 21 | 0.875s |
| petalia-idle.webp | idle | 49 | 2.0s |

Petalia attack and hit were not generated (scope narrowed to idle-only partway through).

### Generation settings

All animations used FLF2V looping (`end_image` = `start_image`, `fun_or_fl2v_model: true`).

| Setting | Idle | Attack/Hit |
|---------|------|------------|
| Frames | 49 | 21 |
| Shift | 4.0 | 3.5 |
| CFG | 3.5 | 3.5 |
| Noise aug | 0.1 | 0.1 |
| Steps | 20 (10+10) | 20 (10+10) |
| Scheduler | euler | euler |
| Seed | 88 | 88 |
| Resolution | 480x480 | 480x480 |

### Per-robot prompts

**Sizzlit idle:**
> The grilled meat creature's body sways and bobs up and down, its stubby legs shifting weight, its sizzling surface pops and crackles with small flames, the whole body is moving gently, fixed camera, static white background

**Drizzlet idle:**
> The teardrop water creature's body sways and bobs up and down, its shimmering water surface ripples gently, tiny droplets float around it, the whole body is moving and bouncing softly, fixed camera, static white background

**Petalia idle:**
> The round petal-crowned creature's body sways and bobs up and down, its colorful petals flutter gently, its leaf-arms wave softly at its sides, the whole body is moving, fixed camera, static white background

Attack and hit prompts followed the element-specific patterns from the working workflow doc.

**Negative prompt (all):**
> bright tones, overexposed, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, camera movement, zoom, pan, frozen body, static body

## Pipeline Steps

1. **Convert sprites** — RGBA → RGB with white background (1024x1024 PNG)
2. **Upload to ComfyUI** — `POST /upload/image` with multipart form
3. **Queue jobs** — Python script built workflow JSON per robot/action, sent via `POST /prompt`
4. **Monitor** — Polled `/history/{prompt_id}` and `/queue` every 30s
5. **Download results** — Fetched animated WebPs via `/view?filename=...&subfolder=robot_sprites&type=output`

## Background Removal — Unsolved

The Wan model outputs video on a white background. We need transparent animated WebPs for the game. We tried three approaches; none fully solved it.

### Approach 1: White threshold

Replace all pixels with RGB channels above 250 with transparent. **Problem:** destroys white pixels inside sprites (eyes, highlights, teeth).

### Approach 2: Flood fill from edges

BFS flood fill starting from border pixels, only removing white connected to the edges. Preserves interior whites. **Problems:**

- Drizzlet frames 0–3 have black borders (WebP decode artifact), so the flood fill finds no white to seed from. We added black-border detection and a fallback to the nearest good frame's mask, but results still showed flashing.
- Edge quality: tried Gaussian blur on the binary mask (sigma 3.0, then 1.5) but edges were either too blurry or still harsh.

### Approach 3 (not attempted): rembg

AI-based background removal using U2-Net. Requires installing the `rembg` Python package. Likely the best approach — understands object boundaries rather than relying on color matching.

### Current state

The files in `test-animations/` have flood-fill transparency applied (approach 2 with sigma 1.5), but the results are not production-ready. The drizzlet flashing issue and edge quality need more work.

## Petalia Quirk

Petalia idle failed twice — ComfyUI reported "success" with empty outputs. Third attempt (with `enable_vae_tiling: true` and seed 42 instead of 88) succeeded. Root cause unclear; may have been a race condition from cancelling the previous job mid-execution.

## Originals on ComfyUI Server

The raw (white background) outputs are still available on the ComfyUI server at `192.168.1.222:8188` under `robot_sprites/` subfolder:

| Server filename | Local name |
|----------------|------------|
| `sizzlit-idle_00001_.webp` | sizzlit-idle.webp |
| `sizzlit-attack_00001_.webp` | sizzlit-attack.webp |
| `sizzlit-hit_00001_.webp` | sizzlit-hit.webp |
| `drizzlet-idle_00001_.webp` | drizzlet-idle.webp |
| `drizzlet-attack_00001_.webp` | drizzlet-attack.webp |
| `drizzlet-hit_00001_.webp` | drizzlet-hit.webp |
| `petalia-idle_00002_.webp` | petalia-idle.webp |

## Next Steps

- Solve the transparency problem (try `rembg`, or generate on green/blue screen and chroma-key)
- Generate petalia attack and hit
- Once transparency is solid, move final animations from `test-animations/` into `public/assets/sprites/robots/{robotId}/`
- Generate animations for remaining 43 robots

## Timing

- ~8–10 min per idle animation (49 frames) on RTX 3090
- ~5–7 min per attack/hit animation (21 frames)
- Total for 3 starters × 3 actions: ~75 min
- Total for all 46 robots × 3 actions: ~10–12 hours
