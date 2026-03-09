#!/usr/bin/env python3
"""Regenerate all creature sprites via the WAN 2.2 animation pipeline.

For each creature:
1. Convert staging image to white background via Gemini 2.5 Flash
2. Upload to ComfyUI
3. Queue animation workflow (WAN 2.2 I2V + BiRefNet ToonOut)
4. Queue static fallback workflow (BiRefNet only)
5. Wait for completion
6. Download results
7. Convert static PNG to WEBP
8. Trim and resize to 330px max edge
"""

import base64, json, os, random, ssl, subprocess, sys, time, urllib.request
from pathlib import Path

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

from PIL import Image
import numpy as np

# Config
STAGING_DIR = Path("data/creature-staging-images")
SPRITE_DIR = Path("public/assets/sprites/robots")
COMFYUI = "http://10.5.0.2:8188"
GEMINI_KEY_FILE = Path("data/.creature-forge-gemini-key")
GEMINI_MODEL = "gemini-3.1-flash-image-preview"
MAX_SIZE = 330
SSH_KEY = os.path.expanduser("~/.ssh/id_ed25519_remote_pc")
SSH_HOST = "michia@10.5.0.2"
COMFYUI_OUTPUT = "/C:/Users/michi/ComfyUI-Easy-Install/ComfyUI/output/creature_sprites"

# Skip these (already processed)
SKIP = {"hikaribon", "fukurouzen-a-clockwork", "bakudango"}

def read_api_key():
    return GEMINI_KEY_FILE.read_text().strip()

def gemini_white_bg(creature_id, api_key):
    """Step 1: Replace magenta background with white via Gemini."""
    staging_path = STAGING_DIR / f"{creature_id}.png"
    out_path = Path(f"/tmp/{creature_id}-whitebg.png")

    if not staging_path.exists():
        print(f"  SKIP: no staging image")
        return None

    img_b64 = base64.b64encode(staging_path.read_bytes()).decode()

    payload = {
        "contents": [{
            "parts": [
                {"text": "Replace the magenta/pink background with pure white (#FFFFFF). Do not alter any creature pixels unless absolutely required to make the background truly white. Keep the creature exactly as-is."},
                {"inline_data": {"mime_type": "image/png", "data": img_b64}}
            ]
        }],
        "generationConfig": {"responseModalities": ["image", "text"]}
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")

    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as resp:
        result = json.loads(resp.read())

    parts = result["candidates"][0]["content"]["parts"]
    img_part = next(p for p in parts if "inlineData" in p)
    img_bytes = base64.b64decode(img_part["inlineData"]["data"])
    out_path.write_bytes(img_bytes)
    print(f"  White-bg: {len(img_bytes)} bytes")
    return out_path

def upload_to_comfyui(filepath):
    """Step 2: Upload image to ComfyUI."""
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{COMFYUI}/upload/image",
         "-F", f"image=@{filepath}", "-F", "overwrite=true"],
        capture_output=True, text=True
    )
    resp = json.loads(result.stdout)
    print(f"  Uploaded: {resp['name']}")
    return resp["name"]

def queue_animation(image_name, creature_id):
    """Step 3: Queue the WAN 2.2 animation workflow."""
    seed = random.randint(0, 2**31)

    prompt = {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": "The creature breathes heavily, body rocking with energy, tail lashing, shifting weight between its feet, fixed camera, static white background"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": "bright tones, overexposed, static, blurred details, worst quality, low quality, ugly, deformed, morphing, warping, distortion, camera movement, zoom, pan, frozen body, static body, only effects moving"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "6": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "7": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "8": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["6", 0], "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", "strength_model": 1.0}},
        "9": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["7", 0], "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", "strength_model": 1.0}},
        "10": {"class_type": "WanFirstLastFrameToVideo", "inputs": {"positive": ["3", 0], "negative": ["4", 0], "vae": ["5", 0], "start_image": ["1", 0], "end_image": ["1", 0], "width": 480, "height": 480, "length": 49, "batch_size": 1}},
        "11": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["8", 0], "shift": 7.0}},
        "12": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["9", 0], "shift": 7.0}},
        "13": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["11", 0], "positive": ["10", 0], "negative": ["10", 1], "latent_image": ["10", 2], "add_noise": "enable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable"}},
        "14": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["12", 0], "positive": ["10", 0], "negative": ["10", 1], "latent_image": ["13", 0], "add_noise": "disable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 2, "end_at_step": 4, "return_with_leftover_noise": "disable"}},
        "15": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["5", 0]}},
        "16": {"class_type": "BiRefNetRMBG", "inputs": {"image": ["15", 0], "model": "BiRefNet_toonout", "mask_blur": 0, "mask_offset": 0, "invert_output": False, "refine_foreground": True, "background": "Alpha"}},
        "17": {"class_type": "SaveAnimatedWEBP", "inputs": {"images": ["16", 0], "filename_prefix": f"creature_sprites/{creature_id}-idle", "fps": 24.0, "lossless": False, "quality": 90, "method": "default"}}
    }

    result = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{COMFYUI}/prompt",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"prompt": prompt})],
        capture_output=True, text=True
    )
    resp = json.loads(result.stdout)
    print(f"  Animation queued: seed={seed}, prompt_id={resp['prompt_id']}")
    return resp["prompt_id"]

def queue_static(image_name, creature_id):
    """Step 3b: Queue static fallback (BiRefNet only)."""
    prompt = {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {"class_type": "BiRefNetRMBG", "inputs": {"image": ["1", 0], "model": "BiRefNet_toonout", "mask_blur": 0, "mask_offset": 0, "invert_output": False, "refine_foreground": True, "background": "Alpha"}},
        "3": {"class_type": "SaveImage", "inputs": {"images": ["2", 0], "filename_prefix": f"creature_sprites/{creature_id}-static"}}
    }

    result = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{COMFYUI}/prompt",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"prompt": prompt})],
        capture_output=True, text=True
    )
    resp = json.loads(result.stdout)
    print(f"  Static queued: prompt_id={resp['prompt_id']}")
    return resp["prompt_id"]

def wait_for_queue():
    """Wait until ComfyUI queue is empty."""
    while True:
        result = subprocess.run(
            ["curl", "-s", f"{COMFYUI}/queue"],
            capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        running = len(data.get("queue_running", []))
        pending = len(data.get("queue_pending", []))
        if running == 0 and pending == 0:
            return
        print(f"  Waiting... running={running}, pending={pending}")
        time.sleep(15)

def download_results(creature_id):
    """Download animated and static results from ComfyUI."""
    # Animated webp
    anim_remote = f"{COMFYUI_OUTPUT}/{creature_id}-idle_00001_.webp"
    anim_local = SPRITE_DIR / f"{creature_id}-idle.webp"
    subprocess.run(
        ["scp", "-i", SSH_KEY, f"{SSH_HOST}:{anim_remote}", str(anim_local)],
        capture_output=True
    )

    # Static png
    static_remote = f"{COMFYUI_OUTPUT}/{creature_id}-static_00001_.png"
    static_local = Path(f"/tmp/{creature_id}-static.png")
    subprocess.run(
        ["scp", "-i", SSH_KEY, f"{SSH_HOST}:{static_remote}", str(static_local)],
        capture_output=True
    )

    # Convert static PNG to WEBP
    if static_local.exists():
        img = Image.open(static_local)
        webp_path = SPRITE_DIR / f"{creature_id}.webp"
        img.save(str(webp_path), "WEBP", quality=90)
        static_local.unlink()
        print(f"  Downloaded: idle={anim_local.stat().st_size//1024}KB, static={webp_path.stat().st_size//1024}KB")
    else:
        print(f"  WARNING: static not found")

def trim_sprite(filepath):
    """Trim transparent padding and resize to MAX_SIZE."""
    img = Image.open(filepath)
    n_frames = getattr(img, "n_frames", 1)
    is_animated = n_frames > 1

    # Union bounding box across all frames
    rmin, cmin = img.size[1], img.size[0]
    rmax, cmax = 0, 0
    for i in range(n_frames):
        img.seek(i)
        arr = np.array(img.convert("RGBA"))
        alpha = arr[:, :, 3]
        rows = np.any(alpha > 0, axis=1)
        cols = np.any(alpha > 0, axis=0)
        if not rows.any():
            continue
        r0, r1 = np.where(rows)[0][[0, -1]]
        c0, c1 = np.where(cols)[0][[0, -1]]
        rmin, rmax = min(rmin, r0), max(rmax, r1)
        cmin, cmax = min(cmin, c0), max(cmax, c1)

    bbox = (cmin, rmin, cmax + 1, rmax + 1)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    longest = max(w, h)
    scale = min(MAX_SIZE / longest, 1.0)
    new_w = round(w * scale)
    new_h = round(h * scale)

    frames = []
    durations = []
    for i in range(n_frames):
        img.seek(i)
        frame = img.convert("RGBA").crop(bbox).resize((new_w, new_h), Image.LANCZOS)
        frames.append(frame)
        durations.append(img.info.get("duration", 42))

    if is_animated:
        frames[0].save(str(filepath), save_all=True, append_images=frames[1:],
                       duration=durations, loop=0, lossless=False, quality=90)
    else:
        frames[0].save(str(filepath), "WEBP", quality=90)

def main():
    api_key = read_api_key()

    staging_files = sorted(STAGING_DIR.glob("*.png"))
    creatures = [f.stem for f in staging_files if f.stem not in SKIP]

    print(f"Processing {len(creatures)} creatures\n")

    failed = []

    for i, creature_id in enumerate(creatures):
        print(f"[{i+1}/{len(creatures)}] {creature_id}")

        try:
            # Step 1: White background
            whitebg_path = gemini_white_bg(creature_id, api_key)
            if not whitebg_path:
                failed.append((creature_id, "no staging image"))
                continue

            # Step 2: Upload
            image_name = upload_to_comfyui(whitebg_path)

            # Step 3: Queue both workflows
            queue_animation(image_name, creature_id)
            queue_static(image_name, creature_id)

            # Step 4: Wait for completion
            wait_for_queue()

            # Step 5: Download
            download_results(creature_id)

            # Step 6: Trim
            idle_path = SPRITE_DIR / f"{creature_id}-idle.webp"
            static_path = SPRITE_DIR / f"{creature_id}.webp"

            if idle_path.exists():
                trim_sprite(idle_path)
            if static_path.exists():
                trim_sprite(static_path)

            print(f"  Done!\n")

            # Clean up temp file
            if whitebg_path and whitebg_path.exists():
                whitebg_path.unlink()

        except Exception as e:
            print(f"  ERROR: {e}\n")
            failed.append((creature_id, str(e)))
            continue

    print(f"\n{'='*60}")
    print(f"Completed: {len(creatures) - len(failed)}/{len(creatures)}")
    if failed:
        print(f"Failed ({len(failed)}):")
        for cid, reason in failed:
            print(f"  {cid}: {reason}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
