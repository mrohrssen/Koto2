#!/usr/bin/env python3
"""
Generate creature sprites using Nexus Anima LoRA + Nova v16.

Philosophy: minimal style tags. The LoRA handles style — we just provide
the trigger word, basic framing, and the natural language creature description.
Random seeds so every run is unique.

Usage:
  python scripts/lora_creature_gen.py                          # All staging creatures
  python scripts/lora_creature_gen.py kamedor chouri umarak    # Specific creatures
  python scripts/lora_creature_gen.py --per 3                  # 3 images each
  python scripts/lora_creature_gen.py --dry-run                # Preview prompts
  python scripts/lora_creature_gen.py --lora-strength 0.8      # Adjust LoRA weight
  python scripts/lora_creature_gen.py --no-lora                # Baseline (no LoRA)
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
CREATURES_FILE = os.path.join(PROJECT_ROOT, "data", "creatures.json")
STAGING_FILE = os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output", "lora-gen")
COMFYUI_URL = "http://10.5.0.2:8188"

# Base model
CHECKPOINT = "novaAnimeXL_ilV160.safetensors"

# LoRA — epoch 12 of nexus_anima training
LORA_FILE = "nexus-anima-lora.safetensors"
LORA_STRENGTH = 1.0

# Minimal style tags — let the LoRA do its thing
STYLE = (
    "nexus_anima, solo, full body, front view, "
    "white background, bright vivid colors, high quality, clean"
)

NEGATIVE = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, "
    "monochrome, silhouette"
)

# Generation settings (same sampler as the chibi scripts that worked well)
CFG = 7.5
SAMPLER = "dpmpp_2m"
SCHEDULER = "karras"
STEPS = 30


def load_creatures():
    creatures = {}
    for path in [CREATURES_FILE, STAGING_FILE]:
        if os.path.exists(path):
            with open(path) as f:
                for c in json.load(f):
                    creatures[c["id"]] = c
    return creatures


def create_workflow(prompt, negative, seed, filename_prefix, lora_file=None, lora_strength=1.0):
    """Build ComfyUI workflow with optional LoRA loader."""
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT}
        },
    }

    # If using LoRA, insert loader between checkpoint and CLIP
    model_source = ["1", 0]
    clip_source = ["1", 1]

    if lora_file:
        workflow["10"] = {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": lora_file,
                "strength_model": lora_strength,
                "strength_clip": lora_strength,
                "model": ["1", 0],
                "clip": ["1", 1],
            }
        }
        model_source = ["10", 0]
        clip_source = ["10", 1]

    workflow.update({
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": clip_source}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": clip_source}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": STEPS,
                "cfg": CFG,
                "sampler_name": SAMPLER,
                "scheduler": SCHEDULER,
                "denoise": 1.0,
                "model": model_source,
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
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"lora_gen/{filename_prefix}"
            }
        }
    })

    return workflow


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


def generate_html(creatures, results, lora_file, lora_strength, per):
    """Generate HTML comparison page. Rows = creatures, columns = variants."""
    lora_label = f"LoRA: {lora_file} @ {lora_strength}" if lora_file else "No LoRA (baseline)"

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Nexus Anima LoRA — Creature Generation</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }}
  h1 {{ text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }}
  .subtitle {{ text-align: center; color: #888; margin-bottom: 32px; font-size: 0.85rem; }}
  .creature-row {{ margin-bottom: 36px; }}
  .creature-label {{ font-size: 1.1rem; font-weight: bold; color: #5ba8f5; margin-bottom: 2px; }}
  .creature-info {{ font-size: 0.7rem; color: #666; margin-bottom: 10px; }}
  .creature-desc {{ font-size: 0.65rem; color: #555; margin-bottom: 10px; max-width: 900px; }}
  .grid {{ display: grid; grid-template-columns: repeat({min(per, 4)}, 1fr); gap: 12px; }}
  .card {{ background: #14141f; border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; }}
  .card img {{ width: 100%; aspect-ratio: 1; object-fit: cover; }}
  .card .meta {{ padding: 6px 10px; font-size: 0.65rem; color: #555; }}
  @media (max-width: 900px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} }}
</style>
</head>
<body>
<h1>Nexus Anima LoRA — Creature Generation</h1>
<div class="subtitle">{lora_label} | cfg={CFG} | {SAMPLER}/{SCHEDULER} | {STEPS} steps | random seeds</div>
"""

    for creature_id in creatures:
        creature = creatures[creature_id]
        name = creature.get("nameEn", creature_id)
        element = creature.get("element", "?")
        desc = creature.get("description", "")[:200]

        html += f'<div class="creature-row">\n'
        html += f'<div class="creature-label">{name} ({creature_id})</div>\n'
        html += f'<div class="creature-info">{element}</div>\n'
        html += f'<div class="creature-desc">{desc}...</div>\n'
        html += '<div class="grid">\n'

        for i in range(per):
            fname = f"{creature_id}_{i+1}.png"
            fpath = os.path.join(OUTPUT_DIR, fname)
            seed = results.get((creature_id, i), {}).get("seed", "?")

            html += '<div class="card">\n'
            if os.path.exists(fpath):
                html += f'<img src="{fname}" alt="{name} #{i+1}">\n'
            else:
                html += ('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;'
                         'align-items:center;justify-content:center;color:#555;">FAILED</div>\n')
            html += f'<div class="meta">seed: {seed}</div>\n'
            html += '</div>\n'

        html += '</div>\n</div>\n'

    html += '</body></html>'
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "gallery.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate creatures with Nexus Anima LoRA")
    parser.add_argument("creature_ids", nargs="*", help="Creature IDs (default: all staging)")
    parser.add_argument("--per", type=int, default=2, help="Images per creature (default: 2)")
    parser.add_argument("--lora-strength", type=float, default=LORA_STRENGTH)
    parser.add_argument("--lora-file", default=LORA_FILE, help="LoRA filename")
    parser.add_argument("--no-lora", action="store_true", help="Baseline run without LoRA")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    all_creatures = load_creatures()

    # Pick creatures
    if args.creature_ids:
        creature_ids = [c for c in args.creature_ids if c in all_creatures]
    else:
        # Default: all staging creatures
        staging_ids = set()
        if os.path.exists(STAGING_FILE):
            with open(STAGING_FILE) as f:
                staging_ids = {c["id"] for c in json.load(f)}
        creature_ids = sorted(staging_ids & set(all_creatures.keys()))

    if not creature_ids:
        print("No valid creature IDs found.")
        print("Available:", ", ".join(sorted(all_creatures.keys())[:20]))
        sys.exit(1)

    lora_file = None if args.no_lora else args.lora_file
    lora_strength = args.lora_strength
    total = len(creature_ids) * args.per

    print("=" * 64)
    print("  NEXUS ANIMA LoRA — CREATURE GENERATION")
    print(f"  Creatures:  {', '.join(creature_ids)}")
    print(f"  Per each:   {args.per} images (random seeds)")
    if lora_file:
        print(f"  LoRA:       {lora_file} @ {lora_strength}")
    else:
        print(f"  LoRA:       NONE (baseline)")
    print(f"  Base:       Nova v16 | cfg={CFG} | {SAMPLER}/{SCHEDULER}")
    print(f"  Total:      {total} images")
    print(f"  Output:     {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("  *** DRY RUN ***")
    print("=" * 64)

    job_num = 0
    success = 0
    failed = []
    results = {}

    for creature_id in creature_ids:
        creature = all_creatures[creature_id]
        name = creature.get("nameEn", creature_id)
        desc = creature["description"]

        print(f"\n{'─' * 64}")
        print(f"  {name} ({creature_id})")

        prompt = f"{STYLE}, {desc}"

        for i in range(args.per):
            job_num += 1
            seed = random.randint(1, 999999999)
            results[(creature_id, i)] = {"seed": seed}

            print(f"\n  [{job_num}/{total}] #{i+1} (seed={seed})")

            if args.dry_run:
                print(f"    POS: {prompt[:120]}...")
                print(f"    NEG: {NEGATIVE[:80]}...")
                continue

            fname = f"{creature_id}_{i+1}"
            workflow = create_workflow(
                prompt, NEGATIVE, seed, fname,
                lora_file=lora_file, lora_strength=lora_strength
            )
            prompt_id = queue_prompt(workflow)

            if prompt_id:
                print(f"    Queued...", end="", flush=True)
                if wait_for_completion(prompt_id, timeout=args.timeout):
                    out_path = os.path.join(OUTPUT_DIR, f"{creature_id}_{i+1}.png")
                    size_kb = download_and_save(prompt_id, out_path)
                    if size_kb:
                        print(f" OK ({size_kb:.0f}KB)")
                        success += 1
                    else:
                        print(f" DOWNLOAD FAILED")
                        failed.append(f"{creature_id}#{i+1}")
                else:
                    print(f" TIMEOUT/ERROR")
                    failed.append(f"{creature_id}#{i+1}")
            else:
                print(f"    QUEUE ERROR")
                failed.append(f"{creature_id}#{i+1}")

            time.sleep(1)

    # Generate HTML gallery
    selected = {cid: all_creatures[cid] for cid in creature_ids}
    html_path = generate_html(selected, results, lora_file, lora_strength, args.per)

    print("\n" + "=" * 64)
    if args.dry_run:
        print(f"  DRY RUN: {total} jobs previewed")
    else:
        print(f"  COMPLETE: {success}/{total} images generated")
        if failed:
            print(f"  Failed: {', '.join(failed)}")
    print(f"  Gallery: {html_path}")
    print("=" * 64)


if __name__ == "__main__":
    main()
