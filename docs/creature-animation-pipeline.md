# Creature Animation Pipeline

Staging image → transparent looping idle animation.

## Requirements

- **ComfyUI v0.14.1** on Windows PC at `http://10.5.0.2:8188`
- Models in `C:\Users\michi\Downloads\Data\Models\` (mapped via `extra_model_paths.yaml`)
- BiRefNet ToonOut in ComfyUI's own `models/RMBG/BiRefNet/`
- Saved workflow: `Claude JRPG Workflows/3 WAN I2V Loop + BiRefNet ToonOut.json`

### Starting ComfyUI

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@10.5.0.2 \
  "schtasks /Create /TN ComfyUI /TR \"C:\Users\michi\ComfyUI-Easy-Install\python_embeded\python.exe -I -W ignore::FutureWarning C:\Users\michi\ComfyUI-Easy-Install\ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0\" /SC ONCE /ST 00:00 /F && schtasks /Run /TN ComfyUI"
```

Verify (takes ~30s to start):
```bash
curl -s http://10.5.0.2:8188/system_stats | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'ComfyUI v{d[\"system\"][\"comfyui_version\"]}, VRAM: {d[\"devices\"][0][\"vram_total\"]/1024**3:.0f}GB')"
```

## Pipeline

### Step 1: Prepare white-background image

Staging images from Gemini have magenta backgrounds (not exact #FF00FF — Gemini drifts the color). WAN needs a clean white background. Simple chroma keying doesn't work well because the magenta bleeds into creature edges.

Use **Gemini 2.5 Flash image generation** to do the replacement — it understands the creature boundary much better than pixel math.

```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
  -H "x-goog-api-key: $(cat data/.creature-forge-gemini-key)" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Replace the magenta/pink background with pure white (#FFFFFF). Do not alter any creature pixels unless absolutely required to make the background truly white. Keep the creature exactly as-is."},
        {"inline_data": {"mime_type": "image/png", "data": "BASE64_IMAGE_DATA"}}
      ]
    }],
    "generationConfig": {"responseModalities": ["image", "text"]}
  }'
```

The response contains `inlineData` with the white-background image as base64. Decode and save:

```python
import base64, json
# Parse response, extract image
data = response_json["candidates"][0]["content"]["parts"]
img_part = next(p for p in data if "inlineData" in p)
img_bytes = base64.b64decode(img_part["inlineData"]["data"])
with open("kamedor-whitebg.png", "wb") as f:
    f.write(img_bytes)
```

API key lives at `data/.creature-forge-gemini-key` (gitignored).

### Step 2: Upload to ComfyUI

```bash
curl -s -X POST http://10.5.0.2:8188/upload/image \
  -F "image=@kamedor-whitebg.png" -F "overwrite=true"
```

### Step 3: Run the looping animation workflow

This uses `WanFirstLastFrameToVideo` — a native ComfyUI node that takes `start_image` and `end_image`. Setting both to the same image forces the animation to loop back to its starting pose.

The pipeline: LoadImage → WanFirstLastFrameToVideo → KSampler (2-pass with turbo LoRAs) → VAEDecode → BiRefNet ToonOut → SaveAnimatedWEBP

Output is a transparent looping animated webp.

**Default settings:**
- 49 frames (2s at 24fps)
- shift 7.0
- 4 steps (turbo LoRA), cfg 1.0
- Random seed every run

```bash
curl -s -X POST http://10.5.0.2:8188/prompt -H "Content-Type: application/json" -d '{
  "prompt": {
    "1": {
      "class_type": "LoadImage",
      "inputs": {"image": "kamedor-whitebg.png"}
    },
    "2": {
      "class_type": "CLIPLoader",
      "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}
    },
    "3": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "The creature breathes heavily, body rocking with energy, tail lashing, shifting weight between its feet, fixed camera, static white background"
      }
    },
    "4": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "bright tones, overexposed, static, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, camera movement, zoom, pan, frozen body, static body, only effects moving"
      }
    },
    "5": {
      "class_type": "VAELoader",
      "inputs": {"vae_name": "wan_2.1_vae.safetensors"}
    },
    "6": {
      "class_type": "UNETLoader",
      "inputs": {"unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}
    },
    "7": {
      "class_type": "UNETLoader",
      "inputs": {"unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}
    },
    "8": {
      "class_type": "LoraLoaderModelOnly",
      "inputs": {"model": ["6", 0], "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", "strength_model": 1.0}
    },
    "9": {
      "class_type": "LoraLoaderModelOnly",
      "inputs": {"model": ["7", 0], "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", "strength_model": 1.0}
    },
    "10": {
      "class_type": "WanFirstLastFrameToVideo",
      "inputs": {
        "positive": ["3", 0],
        "negative": ["4", 0],
        "vae": ["5", 0],
        "start_image": ["1", 0],
        "end_image": ["1", 0],
        "width": 480,
        "height": 480,
        "length": 49,
        "batch_size": 1
      }
    },
    "11": {
      "class_type": "ModelSamplingSD3",
      "inputs": {"model": ["8", 0], "shift": 7.0}
    },
    "12": {
      "class_type": "ModelSamplingSD3",
      "inputs": {"model": ["9", 0], "shift": 7.0}
    },
    "13": {
      "class_type": "KSamplerAdvanced",
      "inputs": {
        "model": ["11", 0],
        "positive": ["10", 0],
        "negative": ["10", 1],
        "latent_image": ["10", 2],
        "add_noise": "enable",
        "noise_seed": RANDOM_SEED,
        "steps": 4,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "start_at_step": 0,
        "end_at_step": 2,
        "return_with_leftover_noise": "enable"
      }
    },
    "14": {
      "class_type": "KSamplerAdvanced",
      "inputs": {
        "model": ["12", 0],
        "positive": ["10", 0],
        "negative": ["10", 1],
        "latent_image": ["13", 0],
        "add_noise": "disable",
        "noise_seed": RANDOM_SEED,
        "steps": 4,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "start_at_step": 2,
        "end_at_step": 4,
        "return_with_leftover_noise": "disable"
      }
    },
    "15": {
      "class_type": "VAEDecode",
      "inputs": {"samples": ["14", 0], "vae": ["5", 0]}
    },
    "16": {
      "class_type": "BiRefNetRMBG",
      "inputs": {"image": ["15", 0], "model": "BiRefNet_toonout", "mask_blur": 0, "mask_offset": 0, "invert_output": false, "refine_foreground": true, "background": "Alpha"}
    },
    "17": {
      "class_type": "SaveAnimatedWEBP",
      "inputs": {"images": ["16", 0], "filename_prefix": "creature_sprites/kamedor-idle", "fps": 24.0, "lossless": false, "quality": 90, "method": "default"}
    }
  }
}'
```

Replace `RANDOM_SEED` with an actual random integer. Replace `kamedor-whitebg.png` and `kamedor-idle` with the creature's ID.

### Step 4: Wait and download

Poll the queue:
```bash
curl -s http://10.5.0.2:8188/queue | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Running: {len(d.get(\"queue_running\",[]))}, Pending: {len(d.get(\"queue_pending\",[]))}')"
```

Generation takes ~2 minutes on RTX 3090 (including BiRefNet on 49 frames).

Output lands in ComfyUI's `output/creature_sprites/` directory. Download:
```bash
scp -i ~/.ssh/id_ed25519_remote_pc 'michia@10.5.0.2:/C:/Users/michi/ComfyUI-Easy-Install/ComfyUI/output/creature_sprites/kamedor-idle_00001_.webp' public/assets/sprites/creatures/kamedor-idle.webp
```

### Step 5: Static fallback

Also generate a static transparent webp from the original staging image for use when animation isn't supported:

```bash
# Upload staging image and run BiRefNet only
curl -s -X POST http://10.5.0.2:8188/prompt -H "Content-Type: application/json" -d '{
  "prompt": {
    "1": {"class_type": "LoadImage", "inputs": {"image": "kamedor-whitebg.png"}},
    "2": {"class_type": "BiRefNetRMBG", "inputs": {"image": ["1", 0], "model": "BiRefNet_toonout", "mask_blur": 0, "mask_offset": 0, "invert_output": false, "refine_foreground": true, "background": "Alpha"}},
    "3": {"class_type": "SaveImage", "inputs": {"images": ["2", 0], "filename_prefix": "creature_sprites/kamedor-static"}}
  }
}'
```

### Step 6: Deploy

Copy both files to the game sprites directory and bump the sprite version:
```
public/assets/sprites/creatures/kamedor-idle.webp  (animated)
public/assets/sprites/creatures/kamedor.webp       (static fallback)
```

Bump `SPRITE_VERSION` in `public/js/ui/sprite-utils.js` so browsers fetch new files.

### Step 7: Trim and resize

Creature sprites often have significant transparent padding, and the raw resolution (480px animated, 1024px static) is much larger than needed. This step trims dead space and resizes to the 3× Retina target:

```bash
python3 scripts/trim-sprites.py
```

This processes all `.webp` files in `public/assets/sprites/creatures/`:
- Computes the union bounding box of non-transparent pixels across all frames (so animated sprites never get clipped mid-motion)
- Crops both static and animated webps to that box, preserving frame timing
- Resizes so the longest edge is 330px (110 CSS px × 3× iPhone DPR), preserving aspect ratio
- Skips files with <5% total savings (not worth recompressing)

## Tuning

| Parameter | Default | Effect |
|-----------|---------|--------|
| shift | 7.0 | Motion energy. 4.0 = gentle sway, 8.0 = intense rocking |
| length | 49 | Frame count. 49 = 2s, 81 = 3.4s (bigger arc but larger file) |
| seed | random | Different seed = different motion pattern |
| positive prompt | energetic | Describe the motion you want. "breathes heavily, tail lashing" etc. |

## Models Used

All in `C:\Users\michi\Downloads\Data\Models\` via `extra_model_paths.yaml`:

| Model | File | Directory |
|-------|------|-----------|
| High noise UNET | `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` | DiffusionModels/ |
| Low noise UNET | `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` | DiffusionModels/ |
| High noise turbo LoRA | `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors` | Lora/ |
| Low noise turbo LoRA | `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors` | Lora/ |
| T5 text encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | TextEncoders/ |
| VAE | `wan_2.1_vae.safetensors` | VAE/ |
| BiRefNet ToonOut | `BiRefNet_toonout.safetensors` | (ComfyUI models/RMBG/BiRefNet/) |
