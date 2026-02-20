# Wan 2.2 ComfyUI — Working Two-Pass I2V Workflow

> Tested 2026-02-11. This produced good results for animating chibi robot sprites.

## What We Learned

### Critical mistakes that caused washed-out output

1. **CFG 6.0 is way too high** — Wan 2.2 wants **3.5** (or 1.0 with LoRAs). 6.0 causes color blow-out.
2. **Single-model pass** — Wan 2.2 A14B is a Mixture of Experts (MoE). You need BOTH models:
   - High-noise model handles early steps (layout/motion)
   - Low-noise model handles late steps (texture/detail refinement)
3. **Wrong scheduler** — `unipc` isn't optimal. `euler` works well with the two-pass setup.
4. **noise_aug_strength 0.0** — too conservative. `0.05` allows natural motion.

### Image preprocessing

- Convert RGBA sprites to RGB with white background before uploading (transparency causes issues)
- 1024x1024 input → 480x480 output works fine

```python
from PIL import Image
img = Image.open('sprite.webp')
bg = Image.new('RGB', img.size, (255, 255, 255))
bg.paste(img, mask=img.split()[3])
bg.save('sprite-rgb.png')
```

## Server Setup

- **Machine:** Windows 10, RTX 3090 (24GB VRAM), 32GB RAM
- **ComfyUI:** v0.8.0 at `http://10.5.0.2:8188`
- **SSH:** `ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2`

### Starting ComfyUI remotely (via scheduled task — SSH processes don't survive)

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2 \
  "schtasks /Create /TN ComfyUI /TR \"C:\Users\michi\ComfyUI\venv\Scripts\python.exe C:\Users\michi\ComfyUI\main.py --listen 0.0.0.0 --port 8188\" /SC ONCE /ST 00:00 /F && schtasks /Run /TN ComfyUI"
```

### Disable sleep

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2 \
  "powershell -Command \"powercfg -change -standby-timeout-ac 0\""
```

### Verify running

```bash
curl -s http://10.5.0.2:8188/system_stats
```

## Upload Image

```bash
curl -s -X POST http://10.5.0.2:8188/upload/image \
  -F "image=@/tmp/fire-common-rgb.png;type=image/png"
```

## The Working Two-Pass API Workflow

This is the exact JSON that produced good results. 13 nodes total.

**Key settings that matter:**
- `cfg: 3.5` (NOT 6.0)
- `scheduler: "euler"` (NOT unipc)
- `steps: 20` split as `start_step: 0, end_step: 10` (high noise) then `start_step: 10, end_step: 20` (low noise)
- Both models loaded, high noise runs first pass, low noise refines second pass
- `force_offload: true` on everything (critical for 24GB VRAM)
- **FLF2V looping** — set `end_image` to same as `start_image` + `fun_or_fl2v_model: true` for seamless loops
- **49 frames at 24fps = 2 second loop** — good duration for idle animations

```bash
curl -s -X POST http://10.5.0.2:8188/prompt -H "Content-Type: application/json" -d '{
  "prompt": {
    "1": {
      "class_type": "LoadImage",
      "inputs": { "image": "fire-common-rgb.png" }
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
        "positive_prompt": "POSITIVE_PROMPT_HERE",
        "negative_prompt": "bright tones, overexposed, static, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, flickering, jittering, camera movement, zoom, pan",
        "t5": ["4", 0],
        "force_offload": true
      }
    },
    "6_high": {
      "class_type": "WanVideoModelLoader",
      "inputs": {
        "model": "wan2.2_i2v_high_noise_14B_Q4_K_S.gguf",
        "base_precision": "bf16",
        "quantization": "disabled",
        "load_device": "main_device"
      }
    },
    "6_low": {
      "class_type": "WanVideoModelLoader",
      "inputs": {
        "model": "wan2.2_i2v_low_noise_14B_Q4_K_S.gguf",
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
        "num_frames": 49,
        "noise_aug_strength": 0.1,
        "start_latent_strength": 1.0,
        "end_latent_strength": 1.0,
        "force_offload": true,
        "vae": ["7", 0],
        "clip_embeds": ["3", 0],
        "start_image": ["1", 0],
        "end_image": ["1", 0],
        "fun_or_fl2v_model": true
      }
    },
    "9_pass1": {
      "class_type": "WanVideoSampler",
      "inputs": {
        "model": ["6_high", 0],
        "image_embeds": ["8", 0],
        "text_embeds": ["5", 0],
        "steps": 20,
        "cfg": 3.5,
        "shift": 4.0,
        "seed": 88,
        "force_offload": true,
        "scheduler": "euler",
        "riflex_freq_index": 0,
        "start_step": 0,
        "end_step": 10
      }
    },
    "9_pass2": {
      "class_type": "WanVideoSampler",
      "inputs": {
        "model": ["6_low", 0],
        "image_embeds": ["8", 0],
        "samples": ["9_pass1", 0],
        "text_embeds": ["5", 0],
        "steps": 20,
        "cfg": 3.5,
        "shift": 4.0,
        "seed": 88,
        "force_offload": true,
        "scheduler": "euler",
        "riflex_freq_index": 0,
        "start_step": 10,
        "end_step": 20
      }
    },
    "10": {
      "class_type": "WanVideoDecode",
      "inputs": {
        "vae": ["7", 0],
        "samples": ["9_pass2", 0],
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
        "filename_prefix": "robot_sprites/fire-common-idle",
        "fps": 24.0,
        "lossless": false,
        "quality": 95,
        "method": "default"
      }
    }
  }
}'
```

## Node Graph (Two-Pass MoE)

```
LoadImage ──────────────────────┬──→ WanVideoClipVisionEncode ──→ WanVideoImageToVideoEncode ──→ WanVideoSampler (PASS 1: high noise) ──→ WanVideoSampler (PASS 2: low noise) ──→ WanVideoDecode ──→ SaveAnimatedWEBP
                                │           ↑                              ↑                          ↑        steps 0-10                      ↑        steps 10-20                      ↑
CLIPVisionLoader ───────────────┘    (clip_vision)                   (vae, start_image)          (model_high, text_embeds, image_embeds)   (model_low, text_embeds, image_embeds,       (vae)
                                                                                                                                            samples from pass 1)
LoadWanVideoT5TextEncoder ──→ WanVideoTextEncode ──────────────────────────────────────────→ (text_embeds to both samplers)
WanVideoModelLoader (HIGH) ────────────────────────────────────────────────────────────────→ (pass 1)
WanVideoModelLoader (LOW) ─────────────────────────────────────────────────────────────────→ (pass 2)
WanVideoVAELoader ─────────────────────────────────────────────────────────────────────────→ (shared by encode + decode)
```

## Winning Idle Settings (Tested 2026-02-11)

The combination that produced the best idle animation (fire-common robot):

- **FLF2V**: `end_image` = same as `start_image`, `fun_or_fl2v_model: true` — seamless loop
- **num_frames: 49** — 2 seconds at 24fps
- **shift: 4.0** — enough motion for the body to move, not just the fire
- **noise_aug_strength: 0.1** — gives the model freedom to move the body
- **cfg: 3.5**, **scheduler: euler**, **steps: 20** (10+10 two-pass)

### What didn't work for idle
- `shift: 5.0` with `noise_aug: 0.05` — body frozen, only fire/effects animate
- `shift: 5.0` with `noise_aug: 0.15` — too much deviation from source image
- `shift: 7.0` — way too stable, robot is completely static
- `shift: 5.0` with 41 frames — motion too fast at 24fps (1.7s loop too short)
- Prompts with too many actions (stretch + roll + bounce + shift) — looks frantic
- Non-FLF2V — doesn't loop, and pingpong post-processing looks jerky

### Key insight
The prompt should describe simple continuous motion, not a sequence of actions. Focus on the body moving, not just the effects. Add "frozen body, static body, only fire moving" to the negative prompt to force body animation.

## Winning Attack Settings (Tested 2026-02-11)

- **FLF2V**: yes — ensures the robot returns to its starting pose for clean transition back to idle
- **num_frames: 21** — 0.875 seconds at 24fps
- **shift: 3.5** — more motion than idle, snappy attack feel
- **noise_aug_strength: 0.1**
- **cfg: 3.5**, **scheduler: euler**, **steps: 20** (10+10 two-pass)

### What didn't work for attack
- 13 frames at any shift (3.0, 3.5, 3.75, 4.5) — not enough frames for the model to express wind-up → strike → return
- shift 4.5+ at 13 frames — barely any visible motion
- shift 3.0 at 13 frames — same problem, too few frames regardless of shift

## Winning Hit Settings (Tested 2026-02-11)

Same as attack — 21 frames / shift 3.5 works for both action animations.

- **FLF2V**: yes — robot returns to starting pose
- **num_frames: 21** — 0.875 seconds at 24fps
- **shift: 3.5**
- **noise_aug_strength: 0.1**
- **cfg: 3.5**, **scheduler: euler**, **steps: 20** (10+10 two-pass)

### Summary: all three animation types

| State | Frames | Duration | Shift | Loops | Status |
|-------|--------|----------|-------|-------|--------|
| idle | 49 | 2.0s | 4.0 | yes (FLF2V) | PROVEN |
| attack | 21 | 0.875s | 3.5 | returns to pose (FLF2V) | PROVEN |
| hit | 21 | 0.875s | 3.5 | returns to pose (FLF2V) | PROVEN |

## Prompt Examples

### Idle animation (PROVEN — use this)
```
The robot's body sways and bobs up and down, its arms swing loosely at its sides, shifting weight between its feet, the robot's whole body is moving, fixed camera, static white background
```

### Attack animation (PROVEN — use this)
```
The robot winds up and throws a fast powerful punch forward with its fist, a burst of fire explodes from the impact, then the robot pulls back to its original stance, quick snappy attack, fixed camera, static white background
```

### Hit/damage animation (PROVEN — use this)
```
The robot gets hit by an invisible force and recoils backward, its body flinching and shaking from the impact, a brief flash of light on the point of impact, then the robot recovers back to its original stance, fixed camera, static white background
```

### Negative prompt — idle
```
bright tones, overexposed, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, camera movement, zoom, pan, frozen body, only fire moving, static body
```

### Negative prompt — attack
```
bright tones, overexposed, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, camera movement, zoom, pan, slow motion, frozen body, static body
```

## Monitoring Jobs

```bash
# Check queue
curl -s http://10.5.0.2:8188/queue | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Running: {len(d.get(\"queue_running\",[]))}, Pending: {len(d.get(\"queue_pending\",[]))}')"

# Check specific job status
curl -s "http://10.5.0.2:8188/history/PROMPT_ID_HERE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in d.items():
    print('Status:', v.get('status',{}).get('status_str','unknown'))
    print('Outputs:', json.dumps(v.get('outputs',{}), indent=2))
"

# Download result
curl -s "http://10.5.0.2:8188/view?filename=FILENAME&subfolder=robot_anim_test&type=output" -o output.webp
```

## Available Models

| Model | File | Notes |
|-------|------|-------|
| Wan 2.2 I2V 14B (high noise) | `wan2.2_i2v_high_noise_14B_Q4_K_S.gguf` | Pass 1: layout/motion |
| Wan 2.2 I2V 14B (low noise) | `wan2.2_i2v_low_noise_14B_Q4_K_S.gguf` | Pass 2: texture/detail |
| T5 text encoder (fp16) | `umt5_xxl_fp16.safetensors` | Best quality |
| T5 text encoder (fp8) | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | Faster, minor quality loss |
| VAE | `wan_2.1_vae.safetensors` | Shared across Wan 2.x |
| CLIP Vision | `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | For I2V image encoding |

## Tuning Knobs

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| cfg | 3.5 | 1.0-5.0 | Higher = more prompt adherence, risk of blow-out |
| shift | **4.0** (idle), **3.5** (attack) | 3.0-9.0 | Lower = more motion, higher = more stability |
| steps | 20 (10+10) | 10-40 | More = better quality, slower |
| noise_aug_strength | **0.1** | 0.0-0.5 | 0.1 needed for body to actually move |
| num_frames | **49** (idle), **21** (attack/hit) | 1-81 (step 4) | Valid: 1,5,9,...,21,...,49,...,81. Min ~21 for action anims |
| seed | 88 | any | Change for different motion variations |

## Timing

- ~8-10 minutes per job with two-pass on RTX 3090
- Fewer frames (21 for attack/hit) runs faster than idle (49 frames)
- 9 jobs (3 robots x 3 states) = ~75-90 minutes total

## Networking Limitation

ComfyUI is at `10.5.0.2:8188` — a **local network IP**. Only reachable from the same wifi. If you need remote access from another network, options:

1. **Tailscale/ZeroTier** — install on both machines, gives a private IP that works anywhere (easiest)
2. **Port forwarding** — expose 8188 on your router (less secure)
3. **SSH tunnel** — `ssh -L 8188:localhost:8188 michia@YOUR_PUBLIC_IP`

## Starters (3 robots to animate)

| Robot | Static sprite | Element |
|-------|--------------|---------|
| fire-common | `public/assets/sprites/robots/fire-common.webp` | Fire |
| water-common | `public/assets/sprites/robots/water-common.webp` | Water |
| wood-common | `public/assets/sprites/robots/wood-common.webp` | Wood |

All are 1024x1024 RGBA. Must convert to RGB PNG with white background before uploading.

## Element-Specific Prompt Adjustments

When generating for different robots, swap the element references in prompts:

- **fire-common**: "flames flickering", "burst of fire", "fire pulsing"
- **water-common**: "water rippling", "splash of water", "bubbles flowing"
- **wood-common**: "leaves rustling", "vines swaying", "petals drifting"

## Full Session Log — What We Tried (for reference)

### Idle iterations
1. High noise model only, cfg 6.0, shift 5.0 → washed out (model wrong, cfg too high)
2. Low noise model only, cfg 6.0, shift 5.0 → looked good but single-pass
3. Two-pass, cfg 3.5, shift 5.0, 41 frames, no FLF2V → good quality, doesn't loop
4. Two-pass, cfg 3.5, shift 5.0, 41 frames, FLF2V → loops perfectly but body frozen
5. Two-pass, cfg 3.5, shift 5.0, 41 frames, FLF2V, lively prompt → body moves but too fast (1.7s)
6. Two-pass, cfg 3.5, shift 7.0, 81 frames, FLF2V → too chill, body barely moves
7. Two-pass, cfg 3.5, shift 6.0, 49 frames, FLF2V → still too chill
8. Two-pass, cfg 3.5, shift 5.0, 49 frames, FLF2V, lively prompt → body still too fast/frantic
9. Two-pass, cfg 3.5, shift 5.0, noise 0.15, 49 frames, FLF2V → too much deviation
10. **Two-pass, cfg 3.5, shift 4.0, noise 0.1, 49 frames, FLF2V → WINNER**

### Attack iterations
1. 21 frames, shift 3.5 → **WINNER** (good motion, right duration)
2. 13 frames, shift 4.5 → barely any motion
3. 13 frames, shift 3.75 → same, too few frames
4. 13 frames, shift 3.0 → same, too few frames

### Hit iterations
1. 21 frames, shift 3.5 → **WINNER** on first try (same as attack settings)
