#!/usr/bin/env python3
"""
Generate idle animations for creatures using Wan 2.2 via ComfyUI API.

End-to-end pipeline per creature:
1. Convert RGBA sprite to RGB with white background
2. Upload to ComfyUI and queue Wan 2.2 two-pass idle animation
3. Poll for completion and download animated webp
4. Extract frames, run per-frame RMBG background removal on ComfyUI GPU
5. Reassemble transparent frames into animated webp
6. Deploy to public/assets/sprites/robots/{id}-idle.webp

The game auto-detects idle sprites via sprite-utils.js configureRobotImg().

Requirements:
  - ComfyUI running at COMFYUI_URL (default: http://192.168.1.222:8188)
  - Wan 2.2 models (high-noise + low-noise 14B Q4)
  - RMBG-2.0 node installed in ComfyUI
  - Pillow: pip install Pillow

Usage:
  python scripts/generate_idle_animations.py                          # All creatures, full pipeline
  python scripts/generate_idle_animations.py --ids petalia,timbark    # Specific creatures
  python scripts/generate_idle_animations.py --skip-existing          # Skip already-generated
  python scripts/generate_idle_animations.py --no-rembg               # Generate only, skip RMBG
  python scripts/generate_idle_animations.py --rembg-only             # RMBG existing animations only
  python scripts/generate_idle_animations.py --rembg-only --ids petalia  # RMBG one creature
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CREATURES_JSON = os.path.join(PROJECT_ROOT, "data", "creatures.json")
SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output", "animated-sprites")
TMP_DIR = os.path.join(PROJECT_ROOT, "tmp", "idle-gen")

COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://192.168.1.222:8188")

# --- RMBG post-processing settings ---
GAME_SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
RMBG_TMP_DIR = os.path.join(PROJECT_ROOT, "tmp", "rembg-frames")

# --- Proven idle animation settings (from wan-comfyui-working-workflow.md) ---
IDLE_FRAMES = 49       # 2.0s at 24fps
IDLE_SHIFT = 4.0       # enough body motion without being frantic
IDLE_CFG = 3.5
IDLE_NOISE_AUG = 0.1   # needed for body to actually move
IDLE_STEPS = 20        # 10+10 two-pass
IDLE_FPS = 24.0
IDLE_WIDTH = 480
IDLE_HEIGHT = 480
IDLE_SCHEDULER = "euler"

# --- Element-specific prompt flavoring ---
ELEMENT_IDLE_FLAVOR = {
    "fire":  "flames gently flickering, embers floating upward",
    "water": "water rippling softly, tiny bubbles drifting upward",
    "wood":  "leaves rustling gently, tiny petals drifting in the air",
    "earth": "small pebbles floating gently, dust motes drifting around",
    "metal": "faint sparks flickering, metallic surfaces catching light",
}

ELEMENT_NEGATIVE_EXTRA = {
    "fire":  "frozen flames, static fire",
    "water": "frozen water, static bubbles",
    "wood":  "frozen leaves, static petals",
    "earth": "frozen dust, static particles",
    "metal": "frozen sparks, static metal",
}

BASE_IDLE_PROMPT = (
    "The creature's body sways and bobs up and down gently, "
    "shifting weight between its feet, its whole body is moving with a gentle rhythm, "
    "{element_flavor}, "
    "fixed camera, static white background"
)

BASE_NEGATIVE_PROMPT = (
    "bright tones, overexposed, blurred details, worst quality, low quality, ugly, "
    "deformed, morphing, warping, distortion, camera movement, zoom, pan, "
    "frozen body, static body, only effects moving, {element_negative}"
)


def load_creatures():
    with open(CREATURES_JSON) as f:
        return json.load(f)


def build_idle_prompt(creature):
    element = creature["element"]
    flavor = ELEMENT_IDLE_FLAVOR.get(element, "")
    return BASE_IDLE_PROMPT.format(element_flavor=flavor)


def build_negative_prompt(creature):
    element = creature["element"]
    extra = ELEMENT_NEGATIVE_EXTRA.get(element, "")
    return BASE_NEGATIVE_PROMPT.format(element_negative=extra)


def convert_rgba_to_rgb(input_path, output_path):
    """Convert RGBA sprite to RGB with white background for Wan input."""
    from PIL import Image
    img = Image.open(input_path)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        bg.save(output_path, "PNG")
    elif img.mode == "RGB":
        img.save(output_path, "PNG")
    else:
        img.convert("RGB").save(output_path, "PNG")
    return output_path


def extract_frames(webp_path):
    """Extract all frames from an animated webp. Returns (list[PIL.Image], list[int])."""
    from PIL import Image
    img = Image.open(webp_path)
    frames = []
    durations = []
    try:
        while True:
            frames.append(img.copy().convert("RGBA"))
            durations.append(img.info.get("duration", 42))
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames, durations


def upload_image(png_path):
    """Upload image to ComfyUI. Returns the server-side filename."""
    import mimetypes
    boundary = "----PythonFormBoundary"
    filename = os.path.basename(png_path)
    mime_type = mimetypes.guess_type(png_path)[0] or "image/png"

    with open(png_path, "rb") as f:
        file_data = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read())
    return result.get("name", filename)


def build_workflow(server_filename, positive_prompt, negative_prompt, seed):
    """Build the proven two-pass MoE idle animation workflow JSON."""
    return {
        "prompt": {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": server_filename},
            },
            "2": {
                "class_type": "CLIPVisionLoader",
                "inputs": {"clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"},
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
                    "force_offload": True,
                },
            },
            "4": {
                "class_type": "LoadWanVideoT5TextEncoder",
                "inputs": {
                    "model_name": "umt5_xxl_fp16.safetensors",
                    "precision": "bf16",
                },
            },
            "5": {
                "class_type": "WanVideoTextEncode",
                "inputs": {
                    "positive_prompt": positive_prompt,
                    "negative_prompt": negative_prompt,
                    "t5": ["4", 0],
                    "force_offload": True,
                },
            },
            "6_high": {
                "class_type": "WanVideoModelLoader",
                "inputs": {
                    "model": "wan2.2_i2v_high_noise_14B_Q4_K_S.gguf",
                    "base_precision": "bf16",
                    "quantization": "disabled",
                    "load_device": "main_device",
                },
            },
            "6_low": {
                "class_type": "WanVideoModelLoader",
                "inputs": {
                    "model": "wan2.2_i2v_low_noise_14B_Q4_K_S.gguf",
                    "base_precision": "bf16",
                    "quantization": "disabled",
                    "load_device": "main_device",
                },
            },
            "7": {
                "class_type": "WanVideoVAELoader",
                "inputs": {
                    "model_name": "wan_2.1_vae.safetensors",
                    "precision": "bf16",
                },
            },
            "8": {
                "class_type": "WanVideoImageToVideoEncode",
                "inputs": {
                    "width": IDLE_WIDTH,
                    "height": IDLE_HEIGHT,
                    "num_frames": IDLE_FRAMES,
                    "noise_aug_strength": IDLE_NOISE_AUG,
                    "start_latent_strength": 1.0,
                    "end_latent_strength": 1.0,
                    "force_offload": True,
                    "vae": ["7", 0],
                    "clip_embeds": ["3", 0],
                    "start_image": ["1", 0],
                    "end_image": ["1", 0],
                    "fun_or_fl2v_model": True,
                },
            },
            "9_pass1": {
                "class_type": "WanVideoSampler",
                "inputs": {
                    "model": ["6_high", 0],
                    "image_embeds": ["8", 0],
                    "text_embeds": ["5", 0],
                    "steps": IDLE_STEPS,
                    "cfg": IDLE_CFG,
                    "shift": IDLE_SHIFT,
                    "seed": seed,
                    "force_offload": True,
                    "scheduler": IDLE_SCHEDULER,
                    "riflex_freq_index": 0,
                    "start_step": 0,
                    "end_step": IDLE_STEPS // 2,
                },
            },
            "9_pass2": {
                "class_type": "WanVideoSampler",
                "inputs": {
                    "model": ["6_low", 0],
                    "image_embeds": ["8", 0],
                    "samples": ["9_pass1", 0],
                    "text_embeds": ["5", 0],
                    "steps": IDLE_STEPS,
                    "cfg": IDLE_CFG,
                    "shift": IDLE_SHIFT,
                    "seed": seed,
                    "force_offload": True,
                    "scheduler": IDLE_SCHEDULER,
                    "riflex_freq_index": 0,
                    "start_step": IDLE_STEPS // 2,
                    "end_step": IDLE_STEPS,
                },
            },
            "10": {
                "class_type": "WanVideoDecode",
                "inputs": {
                    "vae": ["7", 0],
                    "samples": ["9_pass2", 0],
                    "enable_vae_tiling": False,
                    "tile_x": 272,
                    "tile_y": 272,
                    "tile_stride_x": 144,
                    "tile_stride_y": 128,
                },
            },
            "11": {
                "class_type": "SaveAnimatedWEBP",
                "inputs": {
                    "images": ["10", 0],
                    "filename_prefix": "idle_animations/{creature_id}-idle",
                    "fps": IDLE_FPS,
                    "lossless": False,
                    "quality": 95,
                    "method": "default",
                },
            },
        }
    }


def queue_prompt(workflow):
    """Submit workflow to ComfyUI. Returns prompt_id."""
    data = json.dumps(workflow).encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read())
    return result.get("prompt_id")


def check_queue():
    """Returns (running_count, pending_count)."""
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/queue", timeout=10)
        data = json.loads(resp.read())
        running = len(data.get("queue_running", []))
        pending = len(data.get("queue_pending", []))
        return running, pending
    except Exception:
        return -1, -1


def check_job_status(prompt_id):
    """Check if a job is done. Returns (status_str, outputs_dict) or (None, None)."""
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10)
        data = json.loads(resp.read())
        if prompt_id in data:
            entry = data[prompt_id]
            status = entry.get("status", {}).get("status_str", "unknown")
            outputs = entry.get("outputs", {})
            return status, outputs
        return None, None
    except Exception:
        return None, None


def download_output(prompt_id, creature_id):
    """Download the generated idle animation webp from ComfyUI output."""
    status, outputs = check_job_status(prompt_id)
    if status != "success" or not outputs:
        return None

    # Find the SaveAnimatedWEBP output (node "11")
    node_output = outputs.get("11", {})
    # ComfyUI may use "gifs" or "images" key for animated webp
    items = node_output.get("gifs", []) or node_output.get("images", [])
    if not items:
        return None

    filename = items[0].get("filename")
    subfolder = items[0].get("subfolder", "")
    if not filename:
        return None

    url = f"{COMFYUI_URL}/view?filename={filename}&subfolder={subfolder}&type=output"
    out_dir = os.path.join(OUTPUT_DIR, creature_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "idle.webp")

    urllib.request.urlretrieve(url, out_path)
    return out_path


def build_rmbg_workflow(server_filename, creature_id, frame_idx):
    """RMBG workflow for a single frame — runs on ComfyUI GPU."""
    return {
        "prompt": {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": server_filename},
            },
            "2": {
                "class_type": "RMBG",
                "inputs": {
                    "image": ["1", 0],
                    "model": "RMBG-2.0",
                    "sensitivity": 1.0,
                    "process_res": 1024,
                    "mask_blur": 0,
                    "mask_offset": 0,
                    "invert_output": False,
                    "background": "Alpha",
                },
            },
            "3": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["2", 0],
                    "filename_prefix": f"rembg_frames/{creature_id}_frame_{frame_idx:04d}",
                },
            },
        }
    }


def download_rmbg_frame(outputs):
    """Download a single RMBG-processed frame PNG from ComfyUI."""
    images = outputs.get("3", {}).get("images", [])
    if not images:
        return None
    filename = images[0].get("filename")
    subfolder = images[0].get("subfolder", "")
    if not filename:
        return None
    params = urllib.parse.urlencode({
        "filename": filename, "subfolder": subfolder, "type": "output"
    })
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=RMBG_TMP_DIR)
    tmp.close()
    urllib.request.urlretrieve(f"{COMFYUI_URL}/view?{params}", tmp.name)
    return tmp.name


def rembg_animated_webp(input_webp, output_webp, creature_id):
    """Extract frames from animated webp, RMBG each on ComfyUI, reassemble transparent."""
    from PIL import Image
    os.makedirs(RMBG_TMP_DIR, exist_ok=True)

    frames, durations = extract_frames(input_webp)
    print(f"    RMBG: {len(frames)} frames to process")

    # Upload + queue all frames
    jobs = []
    for i, frame in enumerate(frames):
        frame_path = os.path.join(RMBG_TMP_DIR, f"{creature_id}_frame_{i:04d}.png")
        rgb = Image.new("RGB", frame.size, (255, 255, 255))
        if frame.mode == "RGBA":
            rgb.paste(frame, mask=frame.split()[3])
        else:
            rgb.paste(frame)
        rgb.save(frame_path, "PNG")

        server_name = upload_image(frame_path)
        workflow = build_rmbg_workflow(server_name, creature_id, i)
        prompt_id = queue_prompt(workflow)
        jobs.append((i, prompt_id))
        os.unlink(frame_path)

    # Wait + download
    transparent = [None] * len(frames)
    for i, (idx, pid) in enumerate(jobs):
        start = time.time()
        while time.time() - start < 120:
            status, outputs = check_job_status(pid)
            if status == "success":
                path = download_rmbg_frame(outputs)
                if path:
                    transparent[idx] = Image.open(path).convert("RGBA")
                    os.unlink(path)
                break
            elif status == "error":
                break
            time.sleep(1)

        if transparent[idx] is None:
            print(f"    RMBG frame {idx} failed")
            return False

        if (i + 1) % 10 == 0:
            print(f"    RMBG: {i + 1}/{len(frames)} done")

    # Reassemble
    os.makedirs(os.path.dirname(output_webp), exist_ok=True)
    transparent[0].save(
        output_webp, "WEBP", save_all=True,
        append_images=transparent[1:],
        duration=durations[0] if durations else 42,
        loop=0, quality=90, allow_mixed=True,
    )
    size_kb = os.path.getsize(output_webp) / 1024
    print(f"    RMBG: saved {os.path.relpath(output_webp, PROJECT_ROOT)} ({size_kb:.0f} KB)")
    return True


def verify_comfyui():
    """Check that ComfyUI is reachable."""
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/system_stats", timeout=5)
        data = json.loads(resp.read())
        vram = data.get("devices", [{}])[0].get("vram_total", 0)
        vram_gb = vram / (1024 ** 3) if vram else 0
        print(f"  ComfyUI: {COMFYUI_URL}")
        if vram_gb:
            print(f"  GPU VRAM: {vram_gb:.1f} GB")
        return True
    except Exception as e:
        print(f"  ERROR: Cannot reach ComfyUI at {COMFYUI_URL}")
        print(f"  {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Generate idle animations for creatures via ComfyUI")
    parser.add_argument("--ids", help="Comma-separated creature IDs (default: all)")
    parser.add_argument("--element", help="Filter by element: fire, water, wood, earth, metal")
    parser.add_argument("--skip-existing", action="store_true", help="Skip creatures with existing output")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be queued without sending")
    parser.add_argument("--batch-size", type=int, default=3,
                        help="Queue this many jobs then wait for completion (default: 3)")
    parser.add_argument("--seed", type=int, default=88, help="Base seed for generation (default: 88)")
    parser.add_argument("--poll-interval", type=int, default=30,
                        help="Seconds between status checks (default: 30)")
    parser.add_argument("--no-rembg", action="store_true",
                        help="Skip RMBG background removal (keep white background)")
    parser.add_argument("--no-deploy", action="store_true",
                        help="Skip copying to game sprite directory")
    parser.add_argument("--rembg-only", action="store_true",
                        help="Skip generation, just run RMBG on existing output/animated-sprites/*/idle.webp")
    args = parser.parse_args()

    creatures = load_creatures()

    # Filter
    if args.ids:
        ids = set(args.ids.split(","))
        creatures = [c for c in creatures if c["id"] in ids]
        missing = ids - {c["id"] for c in creatures}
        if missing:
            print(f"WARNING: Unknown creature IDs: {', '.join(missing)}")
    if args.element:
        creatures = [c for c in creatures if c["element"] == args.element]

    if not creatures:
        print("No creatures matched filters.")
        sys.exit(1)

    # Skip existing
    if args.skip_existing:
        before = len(creatures)
        creatures = [
            c for c in creatures
            if not os.path.exists(os.path.join(OUTPUT_DIR, c["id"], "idle.webp"))
        ]
        skipped = before - len(creatures)
        if skipped:
            print(f"Skipping {skipped} creatures with existing idle animations.")

    total = len(creatures)
    print("=" * 64)
    print(f"IDLE ANIMATION GENERATION — {total} creatures")
    print(f"Settings: {IDLE_FRAMES} frames, {IDLE_SHIFT} shift, {IDLE_CFG} cfg, "
          f"{IDLE_NOISE_AUG} noise_aug, {IDLE_STEPS} steps (two-pass)")
    print(f"Output: ~2.0s loop at {IDLE_FPS}fps, {IDLE_WIDTH}x{IDLE_HEIGHT}px")
    print(f"Batch size: {args.batch_size} | Seed: {args.seed}")
    print("=" * 64)

    if not args.dry_run:
        print("\nVerifying ComfyUI connection...")
        if not verify_comfyui():
            print("\nStart ComfyUI first. See docs/plans/2026-02-11-wan-comfyui-working-workflow.md")
            sys.exit(1)

    # --rembg-only: skip generation, just process existing raw animations
    if args.rembg_only:
        print("\nRMBG-ONLY MODE: Processing existing animations...\n")
        success = 0
        rembg_failed = []
        for creature in creatures:
            cid = creature["id"]
            raw_path = os.path.join(OUTPUT_DIR, cid, "idle.webp")
            if not os.path.exists(raw_path):
                print(f"  {cid}: no raw animation, skipping")
                continue
            game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
            print(f"  {cid}: RMBG processing...")
            if rembg_animated_webp(raw_path, game_path, cid):
                success += 1
            else:
                rembg_failed.append(cid)
        print(f"\nRMBG complete: {success}/{success + len(rembg_failed)} deployed")
        if rembg_failed:
            print(f"Failed: {', '.join(rembg_failed)}")
        return

    os.makedirs(TMP_DIR, exist_ok=True)

    # Process in batches
    batches = [creatures[i:i + args.batch_size] for i in range(0, total, args.batch_size)]
    completed = 0
    failed = []

    for bi, batch in enumerate(batches):
        print(f"\n{'─' * 64}")
        print(f"Batch {bi + 1}/{len(batches)} ({len(batch)} creatures)")
        print(f"{'─' * 64}")

        # Phase 1: Preprocess + Upload + Queue
        jobs = {}  # prompt_id -> creature_id
        for creature in batch:
            cid = creature["id"]
            idx = completed + len(jobs) + 1
            sprite_path = os.path.join(SPRITE_DIR, f"{cid}.webp")

            if not os.path.exists(sprite_path):
                print(f"  [{idx}/{total}] {cid}: SKIP (no sprite at {cid}.webp)")
                failed.append((cid, "missing sprite"))
                continue

            positive = build_idle_prompt(creature)
            negative = build_negative_prompt(creature)
            seed = args.seed + hash(cid) % 1000  # deterministic per-creature seed variation

            print(f"  [{idx}/{total}] {cid} ({creature['element']})")
            print(f"    Prompt: {positive[:80]}...")

            if args.dry_run:
                print(f"    [DRY RUN] Would queue idle animation job")
                continue

            # Convert RGBA -> RGB
            rgb_path = os.path.join(TMP_DIR, f"{cid}-rgb.png")
            convert_rgba_to_rgb(sprite_path, rgb_path)
            print(f"    Converted to RGB PNG")

            # Upload
            try:
                server_name = upload_image(rgb_path)
                print(f"    Uploaded as: {server_name}")
            except Exception as e:
                print(f"    UPLOAD FAILED: {e}")
                failed.append((cid, f"upload: {e}"))
                continue

            # Build workflow
            workflow = build_workflow(server_name, positive, negative, seed)
            # Set the output filename to include creature id
            workflow["prompt"]["11"]["inputs"]["filename_prefix"] = f"idle_animations/{cid}-idle"

            # Queue
            try:
                prompt_id = queue_prompt(workflow)
                print(f"    Queued: {prompt_id}")
                jobs[prompt_id] = cid
            except Exception as e:
                print(f"    QUEUE FAILED: {e}")
                failed.append((cid, f"queue: {e}"))
                continue

        if args.dry_run:
            completed += len(batch)
            continue

        if not jobs:
            completed += len(batch)
            continue

        # Phase 2: Wait for batch completion
        print(f"\n  Waiting for {len(jobs)} jobs (~{len(jobs) * 8}-{len(jobs) * 10} min)...")
        pending_jobs = dict(jobs)
        start_time = time.time()

        while pending_jobs:
            time.sleep(args.poll_interval)
            elapsed = time.time() - start_time
            running, queued = check_queue()

            done_ids = []
            for pid, cid in pending_jobs.items():
                status, outputs = check_job_status(pid)
                if status == "success":
                    out_path = download_output(pid, cid)
                    if out_path:
                        size_kb = os.path.getsize(out_path) / 1024
                        print(f"    DONE: {cid} -> {os.path.relpath(out_path, PROJECT_ROOT)} ({size_kb:.0f} KB)")

                        # RMBG background removal + deploy
                        if not args.no_rembg:
                            game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
                            ok = rembg_animated_webp(out_path, game_path, cid)
                            if ok:
                                print(f"    DEPLOYED: {os.path.relpath(game_path, PROJECT_ROOT)}")
                            else:
                                print(f"    RMBG FAILED for {cid}")
                                failed.append((cid, "rembg failed"))
                        elif not args.no_deploy:
                            game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
                            shutil.copy2(out_path, game_path)
                            print(f"    DEPLOYED (no rembg): {os.path.relpath(game_path, PROJECT_ROOT)}")
                    else:
                        print(f"    DONE: {cid} (but download failed)")
                        failed.append((cid, "download failed"))
                    done_ids.append(pid)
                elif status == "error":
                    print(f"    FAILED: {cid} (ComfyUI error)")
                    failed.append((cid, "comfyui error"))
                    done_ids.append(pid)

            for pid in done_ids:
                del pending_jobs[pid]

            if pending_jobs:
                mins = elapsed / 60
                print(f"    [{mins:.1f}m] {len(pending_jobs)} remaining | "
                      f"Queue: {running} running, {queued} pending")

        completed += len(batch)

    # Summary
    print(f"\n{'=' * 64}")
    print(f"COMPLETE: {completed - len(failed)}/{total} idle animations generated")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for cid, reason in failed:
            print(f"  - {cid}: {reason}")
    print(f"\nRaw outputs: {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/*/idle.webp")
    if not args.no_rembg:
        print(f"Game sprites: public/assets/sprites/robots/*-idle.webp (transparent)")
    print("=" * 64)


if __name__ == "__main__":
    main()
