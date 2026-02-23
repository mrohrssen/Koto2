#!/usr/bin/env python3
"""
Generate 10 traveling merchant NPC sprite candidates via ComfyUI.

Uses Nova v16 (novaAnimeXL_ilV160) with RMBG-2.0 background removal.
Outputs an HTML review page so the user can pick the best one.

Usage:
  python scripts/generate_merchant_sprite.py
"""

import json
import os
import random
import sys
import time
import tempfile
import urllib.request
import urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output", "merchant")
COMFYUI_URL = "http://10.5.0.2:8188"

NUM_VARIANTS = 10

CHECKPOINT = {
    "file": "novaAnimeXL_ilV160.safetensors",
    "label": "Nova v16",
    "cfg": 5.0,
    "sampler": "euler_ancestral",
    "scheduler": "normal",
    "steps": 30,
}

POSITIVE = (
    "masterpiece, best quality, solo, single character, anime character illustration, "
    "full body, white background, clean lines, anime game character style, "
    "1boy, mysterious traveling merchant, middle-aged, weathered hooded cloak, "
    "layered dark robes with gold trim, large bulging backpack overflowing with wares, "
    "wooden walking staff with small glowing lantern hanging from top, "
    "knowing smirk, sharp eyes under hood shadow, stubble, "
    "worn leather boots, wrapped leg bindings, "
    "belt hung with pouches and dangling trinkets, "
    "warm earth tones, brown and gold color scheme, "
    "vibrant saturated colors, warm lighting, "
    "game character art, high quality, sharp details"
)

NEGATIVE = (
    "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
    "jpeg artifacts, blurry, low quality, "
    "chibi, super deformed, multiple characters, multiple people, crowd, group, "
    "monochrome, silhouette, "
    "robot, mechanical, metal, android, cyborg, armor, mecha, "
    "cat ears, animal ears, furry, non-human, "
    "young, child, female, girl, woman, "
    "nude, nsfw, dark, gritty, horror, scary, "
    "complex background, scenery"
)


def create_workflow(seed):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT["file"]}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": POSITIVE, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": CHECKPOINT["steps"],
                "cfg": CHECKPOINT["cfg"],
                "sampler_name": CHECKPOINT["sampler"],
                "scheduler": CHECKPOINT["scheduler"],
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
        },
        "7": {
            "class_type": "RMBG",
            "inputs": {
                "image": ["6", 0],
                "model": "RMBG-2.0",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "background": "Alpha"
            }
        },
        "8": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["7", 0],
                "filename_prefix": "merchant_sprite/candidate"
            }
        },
    }


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        COMFYUI_URL + "/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("prompt_id", "")
    except Exception as e:
        print(f"  Error queueing: {e}")
        return ""


def wait_for_completion(prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        msgs = status.get("messages", [])
                        print(f"  Error: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_result(prompt_id, out_filename):
    try:
        from PIL import Image
    except ImportError:
        print("  ERROR: Pillow not installed. Run: pip install Pillow")
        sys.exit(1)
    try:
        req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
        with urllib.request.urlopen(req, timeout=10) as response:
            history = json.loads(response.read().decode("utf-8"))
        outputs = history[prompt_id].get("outputs", {})
        for node_id, node_out in outputs.items():
            images = node_out.get("images", [])
            for img_info in images:
                filename = img_info.get("filename")
                subfolder = img_info.get("subfolder", "")
                filetype = img_info.get("type", "output")
                if not filename:
                    continue
                params = urllib.parse.urlencode({
                    "filename": filename, "subfolder": subfolder, "type": filetype,
                })
                url = f"{COMFYUI_URL}/view?{params}"
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)
                os.makedirs(OUTPUT_DIR, exist_ok=True)
                out_path = os.path.join(OUTPUT_DIR, out_filename)
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "PNG")
                os.unlink(tmp_path)
                return out_path, os.path.getsize(out_path) / 1024
        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def generate_html(seeds):
    html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Traveling Merchant — Sprite Candidates</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }
  .subtitle { text-align: center; color: #888; margin-bottom: 32px; font-size: 0.85rem; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; max-width: 1400px; margin: 0 auto; }
  .card { background: #14141f; border: 2px solid #2a2a3a; border-radius: 12px; overflow: hidden; cursor: pointer; transition: border-color 0.2s; }
  .card:hover { border-color: #5ba8f5; }
  .card.selected { border-color: #4ade80; box-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
  .card-label { font-size: 0.9rem; font-weight: bold; padding: 10px 12px 0; color: #c77dff; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; background: repeating-conic-gradient(#1a1a2a 0% 25%, #22223a 0% 50%) 0 0 / 20px 20px; }
  .card .meta { padding: 6px 12px 10px; font-size: 0.7rem; color: #555; }
  @media (max-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 700px) { .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<h1>Traveling Merchant — Sprite Candidates</h1>
<div class="subtitle">Nova v16 | 10 random seeds | RMBG-2.0 transparent | Click to select</div>
<div class="grid">
"""
    for i, seed in enumerate(seeds):
        fname = f"candidate_{i+1:02d}.png"
        fpath = os.path.join(OUTPUT_DIR, fname)
        html += f'<div class="card" onclick="this.classList.toggle(\'selected\')">\n'
        html += f'<div class="card-label">#{i+1}</div>\n'
        if os.path.exists(fpath):
            html += f'<img src="{fname}" alt="Candidate {i+1}">\n'
        else:
            html += ('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;'
                     'align-items:center;justify-content:center;color:#555;">FAILED</div>\n')
        html += f'<div class="meta">seed: {seed}</div>\n'
        html += '</div>\n'

    html += '</div>\n</body></html>'
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "review.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


def main():
    seeds = [random.randint(1, 999999999) for _ in range(NUM_VARIANTS)]

    print("=" * 64)
    print("  TRAVELING MERCHANT SPRITE GENERATION")
    print(f"  Model:    {CHECKPOINT['label']} ({CHECKPOINT['file']})")
    print(f"  CFG:      {CHECKPOINT['cfg']}")
    print(f"  Sampler:  {CHECKPOINT['sampler']} / {CHECKPOINT['scheduler']}")
    print(f"  Variants: {NUM_VARIANTS}")
    print(f"  Output:   {OUTPUT_DIR}")
    print("=" * 64)

    success = 0
    failed = []

    for i, seed in enumerate(seeds):
        print(f"\n  [{i+1}/{NUM_VARIANTS}] seed={seed}")

        workflow = create_workflow(seed)
        prompt_id = queue_prompt(workflow)

        if not prompt_id:
            print("    QUEUE ERROR")
            failed.append(i + 1)
            continue

        print(f"    Queued, waiting...", end="", flush=True)
        if wait_for_completion(prompt_id):
            result = download_result(prompt_id, f"candidate_{i+1:02d}.png")
            if result:
                path, size_kb = result
                print(f" OK ({size_kb:.0f}KB)")
                success += 1
            else:
                print(f" DOWNLOAD FAILED")
                failed.append(i + 1)
        else:
            print(f" TIMEOUT/ERROR")
            failed.append(i + 1)

        time.sleep(1)

    html_path = generate_html(seeds)

    print(f"\n{'=' * 64}")
    print(f"  COMPLETE: {success}/{NUM_VARIANTS} images generated")
    if failed:
        print(f"  Failed: {failed}")
    print(f"  Review: {html_path}")
    print("=" * 64)


if __name__ == "__main__":
    main()
