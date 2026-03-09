#!/usr/bin/env python3
"""
img2img restyle of existing Gemini creature images using Nexus Anima LoRA.

Takes existing staging PNGs, encodes them to latent space, and partially
re-generates with the LoRA style applied. Output goes to bakeoff-output/lora-img2img/
— originals are NEVER touched.

Usage:
  python scripts/lora_img2img.py                        # 10 random creatures
  python scripts/lora_img2img.py kamedor chouri          # Specific creatures
  python scripts/lora_img2img.py --denoise 0.6           # Adjust denoise strength
  python scripts/lora_img2img.py --all                   # All staging creatures
  python scripts/lora_img2img.py --dry-run
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
STAGING_IMAGES = os.path.join(PROJECT_ROOT, "data", "creature-staging-images")
CREATURES_FILE = os.path.join(PROJECT_ROOT, "data", "creatures.json")
STAGING_FILE = os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output", "lora-img2img")
COMFYUI_URL = "http://10.5.0.2:8188"

CHECKPOINT = "novaAnimeXL_ilV160.safetensors"
LORA_FILE = "nexus-anima-lora.safetensors"
LORA_STRENGTH = 1.0

STYLE = (
    "nexus_anima, solo, full body, front view, "
    "white background, bright vivid colors, high quality, clean"
)

NEGATIVE = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, "
    "monochrome, silhouette"
)

CFG = 7.5
SAMPLER = "dpmpp_2m"
SCHEDULER = "karras"
STEPS = 30
DENOISE = 0.55  # How much to restyle (0=keep original, 1=full regenerate)


def load_creatures():
    creatures = {}
    for path in [CREATURES_FILE, STAGING_FILE]:
        if os.path.exists(path):
            with open(path) as f:
                for c in json.load(f):
                    creatures[c["id"]] = c
    return creatures


def upload_image(filepath):
    """Upload an image to ComfyUI and return the filename."""
    import mimetypes
    boundary = "----PythonFormBoundary"
    filename = os.path.basename(filepath)
    mime = mimetypes.guess_type(filepath)[0] or "image/png"

    with open(filepath, "rb") as f:
        file_data = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + file_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result.get("name", filename)


def create_workflow(uploaded_name, prompt, negative, seed, filename_prefix, denoise):
    """img2img workflow: LoadImage -> VAEEncode -> KSampler(denoise<1) -> decode -> save."""
    return {
        # Base model
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        # LoRA
        "8": {"class_type": "LoraLoader", "inputs": {
            "lora_name": LORA_FILE,
            "strength_model": LORA_STRENGTH,
            "strength_clip": LORA_STRENGTH,
            "model": ["1", 0],
            "clip": ["1", 1]
        }},
        # Prompts through LoRA CLIP
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["8", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["8", 1]}},
        # Load source image
        "9": {"class_type": "LoadImage", "inputs": {"image": uploaded_name}},
        # Encode to latent
        "10": {"class_type": "VAEEncode", "inputs": {"pixels": ["9", 0], "vae": ["1", 2]}},
        # KSampler with denoise < 1.0 for img2img
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": STEPS, "cfg": CFG,
            "sampler_name": SAMPLER, "scheduler": SCHEDULER,
            "denoise": denoise,
            "model": ["8", 0],
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["10", 0]
        }},
        # Decode and save
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {
            "images": ["6", 0],
            "filename_prefix": f"lora_img2img/{filename_prefix}"
        }}
    }


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        COMFYUI_URL + "/prompt", data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8")).get("prompt_id", "")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  Error queueing: {e} — {body[:300]}")
        return ""
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


def download_and_save(prompt_id, out_path):
    try:
        from PIL import Image
    except ImportError:
        print("  ERROR: pip install Pillow")
        sys.exit(1)
    try:
        req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
        with urllib.request.urlopen(req, timeout=10) as response:
            history = json.loads(response.read().decode("utf-8"))
        outputs = history[prompt_id].get("outputs", {})
        for node_out in outputs.values():
            for img_info in node_out.get("images", []):
                filename = img_info.get("filename")
                if not filename:
                    continue
                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": img_info.get("subfolder", ""),
                    "type": img_info.get("type", "output"),
                })
                url = f"{COMFYUI_URL}/view?{params}"
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "PNG")
                os.unlink(tmp_path)
                return os.path.getsize(out_path) / 1024
        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def generate_html(creature_ids, creatures, results, denoise):
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Nexus Anima LoRA — img2img Restyle</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }}
  h1 {{ text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }}
  .subtitle {{ text-align: center; color: #888; margin-bottom: 32px; font-size: 0.85rem; }}
  .creature-row {{ margin-bottom: 36px; }}
  .creature-label {{ font-size: 1.1rem; font-weight: bold; color: #5ba8f5; margin-bottom: 8px; }}
  .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 800px; }}
  .card {{ background: #14141f; border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; text-align: center; }}
  .card img {{ width: 100%; aspect-ratio: 1; object-fit: cover; }}
  .card .label {{ padding: 8px; font-size: 0.8rem; color: #888; }}
  .card.original {{ border-color: #444; }}
  .card.restyled {{ border-color: #5ba8f5; }}
  @media (max-width: 600px) {{ .pair {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<h1>Nexus Anima LoRA — img2img Restyle</h1>
<div class="subtitle">denoise={denoise} | LoRA: {LORA_FILE} @ {LORA_STRENGTH} | cfg={CFG} | {SAMPLER}/{SCHEDULER}</div>
"""

    for cid in creature_ids:
        name = creatures.get(cid, {}).get("nameEn", cid)
        orig_file = f"{cid}_original.png"
        new_file = f"{cid}_restyled.png"
        seed = results.get(cid, {}).get("seed", "?")

        html += f'<div class="creature-row">\n'
        html += f'<div class="creature-label">{name} ({cid}) — seed: {seed}</div>\n'
        html += '<div class="pair">\n'

        # Original
        html += '<div class="card original">\n'
        orig_path = os.path.join(OUTPUT_DIR, orig_file)
        if os.path.exists(orig_path):
            html += f'<img src="{orig_file}" alt="Original">\n'
        html += '<div class="label">Original (Gemini)</div>\n'
        html += '</div>\n'

        # Restyled
        html += '<div class="card restyled">\n'
        new_path = os.path.join(OUTPUT_DIR, new_file)
        if os.path.exists(new_path):
            html += f'<img src="{new_file}" alt="Restyled">\n'
        else:
            html += ('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;'
                     'align-items:center;justify-content:center;color:#555;">FAILED</div>\n')
        html += '<div class="label">Restyled (LoRA img2img)</div>\n'
        html += '</div>\n'

        html += '</div>\n</div>\n'

    html += '</body></html>'
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "gallery.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


def main():
    parser = argparse.ArgumentParser(description="img2img restyle with Nexus Anima LoRA")
    parser.add_argument("creature_ids", nargs="*", help="Creature IDs (default: 10 random)")
    parser.add_argument("--denoise", type=float, default=DENOISE, help="Denoise strength (default: 0.55)")
    parser.add_argument("--all", action="store_true", help="Process all staging creatures")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    all_creatures = load_creatures()

    # Find staging images (non-old)
    available = []
    for f in os.listdir(STAGING_IMAGES):
        if f.endswith(".png") and "-old" not in f:
            cid = f.replace(".png", "")
            if cid in all_creatures:
                available.append(cid)

    if args.creature_ids:
        creature_ids = [c for c in args.creature_ids if c in available]
    elif args.all:
        creature_ids = sorted(available)
    else:
        creature_ids = random.sample(available, min(10, len(available)))

    if not creature_ids:
        print("No valid creature IDs with staging images found.")
        sys.exit(1)

    total = len(creature_ids)
    print("=" * 64)
    print("  NEXUS ANIMA LoRA — img2img RESTYLE")
    print(f"  Creatures:  {', '.join(creature_ids)}")
    print(f"  Denoise:    {args.denoise} (0=keep original, 1=full regen)")
    print(f"  LoRA:       {LORA_FILE} @ {LORA_STRENGTH}")
    print(f"  Base:       Nova v16 | cfg={CFG} | {SAMPLER}/{SCHEDULER}")
    print(f"  Total:      {total} images")
    print(f"  Output:     {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("  *** DRY RUN ***")
    print("=" * 64)

    results = {}
    success = 0
    failed = []

    for i, cid in enumerate(creature_ids, 1):
        creature = all_creatures[cid]
        name = creature.get("nameEn", cid)
        desc = creature["description"]
        src_path = os.path.join(STAGING_IMAGES, f"{cid}.png")
        seed = random.randint(1, 999999999)
        results[cid] = {"seed": seed}

        print(f"\n  [{i}/{total}] {name} ({cid}) seed={seed}")

        prompt = f"{STYLE}, {desc}"

        if args.dry_run:
            print(f"    SRC: {src_path}")
            print(f"    POS: {prompt[:100]}...")
            continue

        # Copy original to output dir for side-by-side HTML
        from shutil import copy2
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        copy2(src_path, os.path.join(OUTPUT_DIR, f"{cid}_original.png"))

        # Upload to ComfyUI
        print(f"    Uploading...", end="", flush=True)
        try:
            uploaded = upload_image(src_path)
            print(f" as '{uploaded}'", end="", flush=True)
        except Exception as e:
            print(f" UPLOAD FAILED: {e}")
            failed.append(cid)
            continue

        # Build and queue workflow
        workflow = create_workflow(uploaded, prompt, NEGATIVE, seed, cid, args.denoise)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f" queued...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=args.timeout):
                out_path = os.path.join(OUTPUT_DIR, f"{cid}_restyled.png")
                size_kb = download_and_save(prompt_id, out_path)
                if size_kb:
                    print(f" OK ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(cid)
            else:
                print(f" TIMEOUT/ERROR")
                failed.append(cid)
        else:
            print(f" QUEUE ERROR")
            failed.append(cid)

        time.sleep(1)

    html_path = generate_html(creature_ids, all_creatures, results, args.denoise)

    print("\n" + "=" * 64)
    if args.dry_run:
        print(f"  DRY RUN: {total} previewed")
    else:
        print(f"  COMPLETE: {success}/{total} images generated")
        if failed:
            print(f"  Failed: {', '.join(failed)}")
    print(f"  Gallery: {html_path}")
    print("=" * 64)


if __name__ == "__main__":
    main()
