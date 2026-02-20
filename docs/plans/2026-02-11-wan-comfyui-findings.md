# Wan 2.2 ComfyUI Findings — 2026-02-11

## Server

- **Machine:** Windows 10, RTX 3090 (24GB VRAM), 32GB RAM
- **ComfyUI:** v0.8.0 at `http://10.5.0.2:8188`
- **Python:** 3.10.6, venv at `C:\Users\michi\ComfyUI\venv\`
- **SSH:** `ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2`
- **Start command:** `C:\Users\michi\ComfyUI\venv\Scripts\python.exe C:\Users\michi\ComfyUI\main.py --listen 0.0.0.0 --port 8188`

## Available Models

| Model | File | Notes |
|-------|------|-------|
| Wan 2.2 I2V 14B (high noise) | `wan2.2_i2v_high_noise_14B_Q4_K_S.gguf` | More motion, Q4 quantized |
| Wan 2.2 I2V 14B (low noise) | `wan2.2_i2v_low_noise_14B_Q4_K_S.gguf` | Less motion, Q4 quantized |
| Wan 2.2 Animate 14B | `wan2.2_animate_14B_bf16.safetensors` | Full precision |
| T5 text encoder (fp16) | `umt5_xxl_fp16.safetensors` | Best quality |
| T5 text encoder (fp8) | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | Smaller, faster |
| VAE | `wan_2.1_vae.safetensors` | Shared across Wan 2.x |
| CLIP Vision | `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | For I2V image encoding |
| SDXL checkpoint | `waiIllustriousSDXL_v160.safetensors` | Used for static sprite gen |

## Working Workflow (WanVideo Wrapper Nodes)

The custom node pack "ComfyUI-WanVideoWrapper" provides the I2V pipeline. Here is the verified node chain:

```
LoadImage ─────────────────────┬──→ WanVideoClipVisionEncode ──→ WanVideoImageToVideoEncode ──→ WanVideoSampler ──→ WanVideoDecode ──→ SaveAnimatedWEBP
                               │           ↑                              ↑                          ↑                    ↑
CLIPVisionLoader ──────────────┘    (clip_vision)                   (vae, start_image)          (model, text_embeds)     (vae)
LoadWanVideoT5TextEncoder ──→ WanVideoTextEncode ─────────────────────────────────────────────→ (text_embeds)
WanVideoModelLoader ──────────────────────────────────────────────────────────────────────────→ (model)
WanVideoVAELoader ────────────────────────────────────────────────────────────────────────────→ (vae — shared by encode + decode)
```

### API Workflow JSON (tested, queued successfully)

```json
{
  "1": {
    "class_type": "LoadImage",
    "inputs": { "image": "fire-common.webp" }
  },
  "2": {
    "class_type": "CLIPVisionLoader",
    "inputs": { "clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors" }
  },
  "3": {
    "class_type": "WanVideoClipVisionEncode",
    "inputs": {
      "clip_vision": ["2", 0],
      "image_1": ["1", 0],
      "strength_1": 1.0,
      "strength_2": 1.0,
      "crop": "center",
      "combine_embeds": "average",
      "force_offload": true
    }
  },
  "4": {
    "class_type": "LoadWanVideoT5TextEncoder",
    "inputs": {
      "model_name": "umt5_xxl_fp16.safetensors",
      "precision": "bf16"
    }
  },
  "5": {
    "class_type": "WanVideoTextEncode",
    "inputs": {
      "positive_prompt": "MOTION_PROMPT_HERE",
      "negative_prompt": "NEGATIVE_PROMPT_HERE",
      "t5": ["4", 0],
      "force_offload": true
    }
  },
  "6": {
    "class_type": "WanVideoModelLoader",
    "inputs": {
      "model": "wan2.2_i2v_high_noise_14B_Q4_K_S.gguf",
      "base_precision": "bf16",
      "quantization": "disabled",
      "load_device": "main_device"
    }
  },
  "7": {
    "class_type": "WanVideoVAELoader",
    "inputs": {
      "model_name": "wan_2.1_vae.safetensors",
      "precision": "bf16"
    }
  },
  "8": {
    "class_type": "WanVideoImageToVideoEncode",
    "inputs": {
      "width": 480,
      "height": 480,
      "num_frames": 41,
      "noise_aug_strength": 0.0,
      "start_latent_strength": 1.0,
      "end_latent_strength": 1.0,
      "force_offload": true,
      "vae": ["7", 0],
      "clip_embeds": ["3", 0],
      "start_image": ["1", 0]
    }
  },
  "9": {
    "class_type": "WanVideoSampler",
    "inputs": {
      "model": ["6", 0],
      "image_embeds": ["8", 0],
      "text_embeds": ["5", 0],
      "steps": 30,
      "cfg": 6.0,
      "shift": 5.0,
      "seed": 12345,
      "force_offload": true,
      "scheduler": "unipc",
      "riflex_freq_index": 0
    }
  },
  "10": {
    "class_type": "WanVideoDecode",
    "inputs": {
      "vae": ["7", 0],
      "samples": ["9", 0],
      "enable_vae_tiling": false,
      "tile_x": 272,
      "tile_y": 272,
      "tile_stride_x": 144,
      "tile_stride_y": 128
    }
  },
  "11": {
    "class_type": "SaveAnimatedWEBP",
    "inputs": {
      "images": ["10", 0],
      "filename_prefix": "robot_anim_test/fire-common-idle",
      "fps": 24.0,
      "lossless": false,
      "quality": 95,
      "method": "default"
    }
  }
}
```

### Key gotchas

- **WanVideoVAELoader requires `precision`** — it's listed as optional in object_info but fails without it. Use `"precision": "bf16"`.
- **Image must be uploaded first** via `POST /upload/image` (multipart form) before referencing by filename in LoadImage.
- **`force_offload: true` everywhere** — critical for 24GB VRAM with 14B model.
- **`enable_vae_tiling: false`** at 480x480 should be fine. Enable it if OOM during decode.

## VRAM Budget Estimates

| Setting | VRAM Usage | Notes |
|---------|-----------|-------|
| 14B Q4 model loaded | ~8-9 GB | Observed during sampling |
| T5 fp16 encoder | ~10 GB peak | Offloaded after encoding |
| VAE decode | ~4-6 GB | Peak during frame decode |
| **Total peak** | **~20-22 GB** | With force_offload |

## What to Try Next

### Reduce frame count first
- Use `num_frames: 41` instead of 81 (step size is 4, so valid: 1, 5, 9, ..., 37, 41, 45, ...)
- 41 frames at 24fps = 1.7 seconds of video — plenty for sprite animation
- Should cut generation time roughly in half

### If OOM during VAE decode
- Enable `enable_vae_tiling: true` on WanVideoDecode
- Or reduce resolution to 384x384

### If generation is too slow
- Try `umt5_xxl_fp8_e4m3fn_scaled.safetensors` instead of fp16 (saves ~5GB, minor quality loss)
- Try `wan2.2_i2v_low_noise_14B_Q4_K_S.gguf` (less motion but faster convergence)

### Resolution options
- 480x480 — good balance for chibi sprites, tested
- 384x384 — lighter on VRAM, less detail
- 832x480 — Wan default (landscape), crop to square after

### Sampler tuning
- `cfg: 6.0` — default, good starting point
- `shift: 5.0` — default flow matching shift
- `scheduler: "unipc"` — fastest, good quality
- `steps: 30` — quality setting, can try 20 for speed

## Extraction Pipeline (Verified Working)

Script at `scripts/extract_sprite_sheets.py` — tested end-to-end with synthetic videos:

```bash
# Extract sprite sheets from Wan output videos
python3 scripts/extract_sprite_sheets.py --batch starters --no-rembg --idle-mode pingpong

# Two idle styles available:
#   pingpong — mirror frames for smooth back-and-forth (48 frames from 25)
#   raw — use frames as-is (25 frames)
```

Output: `public/assets/sprites/robots/{robotId}/{idle,attack,hit}.webp` + `manifest.json`

## SSH Access

```bash
# Connect
ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2

# Start ComfyUI (from Windows terminal, not SSH — process dies when SSH closes)
# Use PowerShell Start-Process or run in a terminal on the machine directly
C:\Users\michi\ComfyUI\venv\Scripts\python.exe C:\Users\michi\ComfyUI\main.py --listen 0.0.0.0 --port 8188

# Note: Start-Process via SSH didn't reliably keep the process alive.
# Best approach: start ComfyUI from the Windows desktop or set up as a Windows service.
```

## Checklist for Next Session

1. Start ComfyUI on the Windows machine (from desktop, not SSH)
2. Verify: `curl http://10.5.0.2:8188/system_stats`
3. Queue test job with `num_frames: 41` (halved from 81)
4. Disable sleep on Windows machine (`powercfg -change -standby-timeout-ac 0`)
5. If successful, run all 3 starters × 3 states = 9 jobs
6. Extract sprite sheets and verify in-game
