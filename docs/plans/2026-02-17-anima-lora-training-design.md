# Nexus Anima LoRA Training for Local Creature Generation

**Date:** 2026-02-17
**Status:** Approved

## Goal

Train an SDXL LoRA on ~65 Honkai: Nexus Anima creature portraits to teach Nova v16 (`novaAnimeXL_ilV160.safetensors`) both the visual art style and creature design sensibility of Nexus Anima. Primary use: creature-forge concept art. Secondary: experimentation with other game art.

## Approach

LoRA (Low-Rank Adaptation) trained via kohya_ss sd-scripts on the gaming PC (192.168.1.222, RTX 3090 24GB). Integrates into existing ComfyUI workflow as a single LoRA loader node.

## Section 1: Data Pipeline

Scraper script (`scripts/scrape-anima-training-data.py`) visits each of the ~65 creature pages on the Fandom wiki, downloads full-res portrait PNGs, and saves wiki descriptions as caption files.

Output structure:
```
~/anima-lora-training/
  dataset/
    5_nexus_anima/       # 5 repeats per epoch
      Puddlipup.png
      Puddlipup.txt
      Mesmerith.png
      Mesmerith.txt
      ...
```

Caption format — trigger word + wiki description:
```
nexus_anima, a soft bouncy pudding-pup creature, 4-star rarity,
physical striker, frontline tank, Satiation aspect
```

Images center-cropped/padded to 1024x1024 (SDXL native resolution).

Image source: Fandom CDN — each creature page has a portrait at `{Name}_Anima_Portrait.png` under `/revision/latest` (full resolution, no scaling parameter).

## Section 2: Training Setup

SSH into 192.168.1.222 and install:

```
~/anima-lora-training/
  sd-scripts/          # kohya_ss clone
  venv/                # Python 3.10+ with PyTorch + CUDA
  dataset/             # scraped images + captions
  output/              # trained LoRA checkpoints
```

Steps:
1. Clone `kohya-ss/sd-scripts`
2. Create Python venv, install PyTorch with CUDA 12.x
3. Install sd-scripts dependencies
4. Reference Nova v16 checkpoint as base model

CLI-only — no Gradio UI needed.

## Section 3: Training Configuration

Command: `accelerate launch sdxl_train_network.py` with TOML config.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Network type | LoRA | Standard, well-supported |
| Network rank (dim) | 32 | Good balance for 65 images |
| Network alpha | 16 | Half of rank |
| Learning rate | 1e-4 | Standard for SDXL LoRA |
| Text encoder LR | 5e-5 | Half of unet LR |
| Batch size | 1 | Safe for 24GB VRAM |
| Resolution | 1024x1024 | SDXL native |
| Epochs | 10-15 | ~650-975 total steps |
| Optimizer | AdamW8bit | Memory-efficient |
| Mixed precision | bf16 | Best on Ampere (3090) |
| Gradient checkpointing | On | Saves VRAM |

Repeats: 5x per image per epoch (via folder name `5_nexus_anima/`).
Checkpoints saved every 3 epochs for overfitting comparison.
Estimated training time: ~30-60 minutes.

## Section 4: Integration

**ComfyUI:** Drop trained `.safetensors` into `models/loras/`. Add `LoraLoader` node in workflows. Trigger word: `nexus_anima`. Strength range: 0.5-1.0.

**Bakeoff scripts:** Add optional `--lora` flag to inject LoRA loader node into existing ComfyUI workflow JSON. Enables A/B testing: Nova v16 alone vs. Nova v16 + LoRA.

**Prompt pattern:**
```
nexus_anima, masterpiece, best quality, game-ready creature sprite,
single character on solid magenta background, full body, front-facing idle pose,
[creature description]
```

**Creature-forge skill:** Not modified in this phase. The LoRA is immediately useful via ComfyUI web UI and bakeoff scripts. Swapping creature-forge from Gemini to local ComfyUI would be a separate future project.

## Section 5: Evaluation + Iteration

**First test:** Generate existing creatures (kamedor, chouri, etc.) with and without LoRA at strengths 0.5, 0.7, 1.0. Compare via bakeoff HTML pages.

**Success criteria:**
- Creatures look "designed" — coherent body plans, interesting silhouettes
- Consistent style across different creature types
- Trigger word reliably activates/deactivates the style

**Overfitting signs:**
- Generated creatures resemble specific training images
- Features converge regardless of prompt
- Loss of prompt adherence

**Fix:** Use earlier epoch checkpoint if overfitting. Increase rank to 64 or add epochs if too weak. Iteration is cheap (~30-60 min per run).
