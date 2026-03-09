#!/usr/bin/env python3
"""
Checkpoint bakeoff for creature-forge concept art.

Tests multiple Illustrious checkpoints against the same creature descriptions
using the creature-forge prompt template (non-chibi, anime collector style).
Generates an HTML comparison page per creature for easy visual evaluation.

Usage:
  python scripts/bakeoff_checkpoints.py                     # Default test creatures
  python scripts/bakeoff_checkpoints.py petalia timbark     # Specific creatures
  python scripts/bakeoff_checkpoints.py --seeds 2           # 2 seeds per model
  python scripts/bakeoff_checkpoints.py --dry-run           # Preview without generating
  python scripts/bakeoff_checkpoints.py --models wai nova   # Only test specific models
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
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output")
COMFYUI_URL = "http://10.5.0.2:8188"

# Per-model configs: settings + prompt strategy from CivitAI recommendations
# Illustrious models use Danbooru tags for style/quality, with natural language
# for the subject description (hybrid approach).
CHECKPOINTS = {
    "wai": {
        "file": "waiIllustriousSDXL_v160.safetensors",
        "label": "WAI v16",
        "cfg": 6.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
        "clip_skip": 2,
        # WAI recommends: masterpiece, best quality, amazing quality
        "quality_tags": "masterpiece, best quality, amazing quality",
        "negative": (
            "bad quality, worst quality, worst detail, sketch, censor, "
            "text, watermark, signature, logo, username, "
            "multiple views, reference sheet, chibi, super deformed, "
            "blurry, lowres, error, extra digits, fewer digits, "
            "human, humanoid, realistic, photo, photorealistic"
        ),
    },
    "hassaku": {
        "file": "hassakuXLIllustrious_v34.safetensors",
        "label": "Hassaku v3.4",
        "cfg": 6.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
        "clip_skip": 2,
        # Hassaku: simple tags, avoid "highres", supports artist tags well
        "quality_tags": "masterpiece, best quality, amazing quality, detailed",
        "negative": (
            "worst quality, low quality, normal quality, signature, watermark, "
            "text, logo, username, blurry, lowres, "
            "multiple views, reference sheet, chibi, super deformed, "
            "human, humanoid, realistic, photo, nude"
        ),
    },
    "janku": {
        "file": "JANKUTrainedNoobaiRouwei_v69.safetensors",
        "label": "JANKU v6.9",
        "cfg": 5.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
        "clip_skip": 2,
        # JANKU: 35k+ artist styles baked in, vibrant colors, LoRA-free
        "quality_tags": "masterpiece, best quality, amazing quality, absurdres, vibrant colors",
        "negative": (
            "worst quality, low quality, normal quality, bad anatomy, "
            "text, watermark, signature, logo, username, "
            "multiple views, reference sheet, chibi, super deformed, "
            "blurry, lowres, human, humanoid, realistic, photo"
        ),
    },
    "nova": {
        "file": "novaAnimeXL_ilV160.safetensors",
        "label": "Nova v16",
        "cfg": 5.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
        "clip_skip": 2,
        # Nova: deep saturated colors, dynamic posing, recommends 4k/absurdres tags
        "quality_tags": "masterpiece, best quality, amazing quality, 4k, very aesthetic, ultra-detailed, absurdres",
        "negative": (
            "glitch, deformed, mutated, ugly, worst quality, low quality, "
            "text, watermark, signature, logo, username, "
            "multiple views, reference sheet, chibi, super deformed, "
            "blurry, lowres, human, humanoid, realistic, photo, "
            "disfigured, bad anatomy, extra limbs"
        ),
    },
}

# Default test creatures — one per element for variety
DEFAULT_CREATURES = ["petalia", "drizzlet", "solarie", "barkley", "tablette"]

# Danbooru-style structural tags for creature concept art
# These replace the OpenAI natural-language style prefix
CREATURE_TAGS = (
    "solo, 1other, creature, monster, full body, standing, front view, "
    "white background, simple background, "
    "anime style, game art, creature design, vivid colors, "
    "cel shading, detailed, sharp focus, concept art"
)

# Element-specific Danbooru tags to reinforce visual identity
ELEMENT_TAGS = {
    "fire": "fire, flame, ember, glowing, warm colors, orange theme",
    "water": "water, liquid, droplets, blue theme, reflective, aquatic",
    "wood": "nature, leaves, vines, green theme, organic, plant",
    "earth": "rock, stone, crystal, brown theme, earthy, geological",
    "metal": "metallic, chrome, steel, silver theme, mechanical, reflective surface",
}


def load_creatures():
    """Load creatures from both main and staging files."""
    creatures = {}
    for path in [CREATURES_FILE, STAGING_FILE]:
        if os.path.exists(path):
            with open(path) as f:
                for c in json.load(f):
                    creatures[c["id"]] = c
    return creatures


def build_prompt(creature, ckpt_key):
    """Build a model-optimized prompt from creature data.

    Strategy: Danbooru quality/style tags (model-specific) + structural creature
    tags + element tags + the natural-language visual description from creature-forge.
    Illustrious models handle this hybrid well — tags control style/quality while
    the prose description drives the actual subject.
    """
    ckpt = CHECKPOINTS[ckpt_key]
    element = creature.get("element", "neutral")
    desc = creature["description"]
    elem_tags = ELEMENT_TAGS.get(element, "")

    # Danbooru tags first (what the model is trained on), then natural language
    prompt = f"{ckpt['quality_tags']}, {CREATURE_TAGS}, {elem_tags}, {desc}"
    return prompt


def create_workflow(ckpt_key, creature_id, prompt, seed):
    ckpt = CHECKPOINTS[ckpt_key]
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": ckpt["file"]}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": ckpt["negative"], "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": ckpt["steps"],
                "cfg": ckpt["cfg"],
                "sampler_name": ckpt["sampler"],
                "scheduler": ckpt["scheduler"],
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
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"bakeoff/{creature_id}_{ckpt_key}_s{seed}"
            }
        }
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


def download_result(prompt_id, creature_id, ckpt_key, seed):
    """Download output PNG from ComfyUI, save to bakeoff output dir."""
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
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": filetype,
                })
                url = f"{COMFYUI_URL}/view?{params}"

                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)

                os.makedirs(OUTPUT_DIR, exist_ok=True)
                out_path = os.path.join(OUTPUT_DIR, f"{creature_id}_{ckpt_key}_s{seed}.png")
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "PNG")
                os.unlink(tmp_path)

                size_kb = os.path.getsize(out_path) / 1024
                return out_path, size_kb

        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def generate_html(creature_ids, creatures, models, seeds):
    """Generate an HTML comparison page with all results."""
    html_parts = ["""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Creature Forge — Checkpoint Bakeoff</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { text-align: center; font-size: 1.8rem; margin-bottom: 8px; color: #fff; }
  .subtitle { text-align: center; color: #888; margin-bottom: 32px; }
  h2 { font-size: 1.3rem; color: #5ba8f5; margin: 32px 0 8px; border-bottom: 1px solid #2a2a3a; padding-bottom: 8px; }
  .creature-info { color: #888; font-size: 0.85rem; margin-bottom: 16px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; margin: 0 4px; }
  .badge.element { background: #1a3a5c; color: #5ba8f5; }
  .badge.rarity { background: #3a3a1a; color: #f5c85b; }
  .grid { display: grid; grid-template-columns: repeat(""" + str(len(models)) + """, 1fr); gap: 16px; margin-bottom: 24px; }
  .card { background: #14141f; border: 1px solid #2a2a3a; border-radius: 12px; overflow: hidden; }
  .card-label { font-size: 0.9rem; font-weight: bold; padding: 10px 14px 0; color: #c77dff; }
  .card-label .cfg { color: #888; font-weight: normal; font-size: 0.75rem; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
  .card .seed { padding: 4px 14px; font-size: 0.7rem; color: #666; }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 500px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Creature Forge — Checkpoint Bakeoff</h1>
<div class="subtitle">""" + " vs ".join(CHECKPOINTS[m]["label"] for m in models) + """</div>
"""]

    for creature_id in creature_ids:
        creature = creatures[creature_id]
        name = creature.get("nameEn", creature_id)
        element = creature.get("element", "?")
        rarity = creature.get("rarity", "?")

        html_parts.append(f'<h2>{name} ({creature_id})</h2>')
        html_parts.append(
            f'<div class="creature-info">'
            f'<span class="badge element">{element}</span>'
            f'<span class="badge rarity">{rarity}</span> '
            f'{creature["description"][:120]}...'
            f'</div>'
        )

        for seed in seeds:
            html_parts.append('<div class="grid">')
            for ckpt_key in models:
                ckpt = CHECKPOINTS[ckpt_key]
                img_file = f"{creature_id}_{ckpt_key}_s{seed}.png"
                img_path = os.path.join(OUTPUT_DIR, img_file)
                has_img = os.path.exists(img_path)

                html_parts.append(f'<div class="card">')
                html_parts.append(
                    f'<div class="card-label">{ckpt["label"]} '
                    f'<span class="cfg">cfg={ckpt["cfg"]} {ckpt["sampler"]}</span></div>'
                )
                if has_img:
                    html_parts.append(f'<img src="{img_file}" alt="{ckpt["label"]}">')
                else:
                    html_parts.append('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;align-items:center;justify-content:center;color:#666;">FAILED</div>')
                html_parts.append(f'<div class="seed">seed: {seed}</div>')
                html_parts.append('</div>')
            html_parts.append('</div>')

    html_parts.append('</body></html>')

    html_path = os.path.join(OUTPUT_DIR, "bakeoff.html")
    with open(html_path, "w") as f:
        f.write("\n".join(html_parts))
    return html_path


def main():
    parser = argparse.ArgumentParser(description="Checkpoint bakeoff for creature-forge concept art")
    parser.add_argument("creature_ids", nargs="*", help="Creature IDs to test (default: one per element)")
    parser.add_argument("--seeds", type=int, default=1, help="Number of seeds per model (default: 1)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without generating")
    parser.add_argument("--models", nargs="*", choices=list(CHECKPOINTS.keys()),
                        help="Only test specific models")
    parser.add_argument("--timeout", type=int, default=300, help="Per-job timeout seconds")
    args = parser.parse_args()

    all_creatures = load_creatures()
    creature_ids = args.creature_ids or DEFAULT_CREATURES
    creature_ids = [cid for cid in creature_ids if cid in all_creatures]
    if not creature_ids:
        print("No valid creature IDs found. Available:", ", ".join(sorted(all_creatures.keys())[:10]), "...")
        sys.exit(1)

    models = args.models or list(CHECKPOINTS.keys())
    seeds = [random.randint(1, 999999999) for _ in range(args.seeds)]

    total_jobs = len(creature_ids) * len(models) * len(seeds)

    print("=" * 60)
    print("CREATURE FORGE — CHECKPOINT BAKEOFF")
    print(f"Creatures: {', '.join(creature_ids)}")
    print(f"Models:    {', '.join(CHECKPOINTS[m]['label'] for m in models)}")
    print(f"Seeds:     {seeds}")
    print(f"Total:     {total_jobs} images")
    print(f"Output:    {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("*** DRY RUN ***")
    print("=" * 60)

    job_num = 0
    success = 0
    failed = []

    for creature_id in creature_ids:
        creature = all_creatures[creature_id]
        name = creature.get("nameEn", creature_id)

        print(f"\n{'─' * 60}")
        print(f"Creature: {name} ({creature_id}) — {creature.get('element', '?')}/{creature.get('rarity', '?')}")

        for seed in seeds:
            for ckpt_key in models:
                job_num += 1
                ckpt = CHECKPOINTS[ckpt_key]
                label = ckpt["label"]
                prompt = build_prompt(creature, ckpt_key)

                print(f"\n  [{job_num}/{total_jobs}] {label} (seed={seed})")

                if args.dry_run:
                    print(f"    PROMPT: {prompt[:120]}...")
                    continue

                workflow = create_workflow(ckpt_key, creature_id, prompt, seed)
                prompt_id = queue_prompt(workflow)

                if prompt_id:
                    print(f"    Queued, waiting...", end="", flush=True)
                    if wait_for_completion(prompt_id, timeout=args.timeout):
                        result = download_result(prompt_id, creature_id, ckpt_key, seed)
                        if result:
                            path, size_kb = result
                            print(f" OK ({size_kb:.0f}KB)")
                            success += 1
                        else:
                            print(f" DOWNLOAD FAILED")
                            failed.append(f"{creature_id}/{label}")
                    else:
                        print(f" TIMEOUT/ERROR")
                        failed.append(f"{creature_id}/{label}")
                else:
                    print(f"    QUEUE ERROR")
                    failed.append(f"{creature_id}/{label}")

                time.sleep(2)

    # Generate HTML comparison page
    if not args.dry_run:
        html_path = generate_html(creature_ids, all_creatures, models, seeds)
        print(f"\nHTML comparison: {html_path}")

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"DRY RUN: {total_jobs} jobs previewed")
    else:
        print(f"COMPLETE: {success}/{total_jobs} images generated")
        if failed:
            print(f"Failed: {', '.join(failed)}")
        print(f"\nResults in: {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
        print(f"Open bakeoff.html to compare side-by-side")
    print("=" * 60)


if __name__ == "__main__":
    main()
