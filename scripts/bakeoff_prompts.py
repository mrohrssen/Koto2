#!/usr/bin/env python3
"""
Prompt-variation bakeoff: test 10 different prompting strategies across 4 models.

Each strategy takes a different approach to getting simpler, Pokemon/Nexomon-style
creature output from Illustrious checkpoints. Fixed seed per variant for fair comparison.

Usage:
  python scripts/bakeoff_prompts.py chouri
  python scripts/bakeoff_prompts.py chouri --dry-run
  python scripts/bakeoff_prompts.py chouri --variants 1 3 7    # Only specific variants
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CREATURES_FILE = os.path.join(PROJECT_ROOT, "data", "creatures.json")
STAGING_FILE = os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output", "prompts")
COMFYUI_URL = "http://10.5.0.2:8188"

FIXED_SEED = 424242  # Same seed across all for fair comparison

CHECKPOINTS = {
    "wai": {
        "file": "waiIllustriousSDXL_v160.safetensors",
        "label": "WAI v16",
        "cfg": 6.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
    },
    "hassaku": {
        "file": "hassakuXLIllustrious_v34.safetensors",
        "label": "Hassaku v3.4",
        "cfg": 6.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
    },
    "janku": {
        "file": "JANKUTrainedNoobaiRouwei_v69.safetensors",
        "label": "JANKU v6.9",
        "cfg": 5.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
    },
    "nova": {
        "file": "novaAnimeXL_ilV160.safetensors",
        "label": "Nova v16",
        "cfg": 5.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
        "steps": 30,
    },
}
MODEL_KEYS = list(CHECKPOINTS.keys())


def load_creatures():
    creatures = {}
    for path in [CREATURES_FILE, STAGING_FILE]:
        if os.path.exists(path):
            with open(path) as f:
                for c in json.load(f):
                    creatures[c["id"]] = c
    return creatures


def condense_description(desc):
    """Extract just the core visual identity: body shape, color, one signature feature."""
    sentences = [s.strip() for s in desc.replace(". ", ".\n").split("\n") if s.strip()]
    # Take first 2 sentences max — body shape + primary feature
    return " ".join(sentences[:2])


def creature_as_tags(creature):
    """Convert creature data into pure Danbooru-style tags, no prose."""
    desc = creature["description"].lower()
    element = creature.get("element", "")
    tags = []

    # Body type
    for word in ["slender", "muscular", "stocky", "elongated", "round", "serpentine"]:
        if word in desc:
            tags.append(word)

    # Creature type
    for word in ["moth", "butterfly", "insect", "wing", "dragon", "bird", "cat",
                 "dog", "horse", "turtle", "fish", "snake", "fox", "wolf"]:
        if word in desc:
            tags.append(word)

    # Colors
    for color in ["jade", "green", "teal", "emerald", "blue", "red", "gold",
                   "amber", "bronze", "silver", "white", "black", "pink",
                   "purple", "cyan", "orange", "crimson"]:
        if color in desc:
            tags.append(f"{color} theme")

    # Features
    for feat in ["crystal", "glass", "chitin", "antennae", "wings",
                 "glowing", "translucent", "compound eyes", "horns",
                 "tail", "claws", "armor", "fur", "feathers", "scales"]:
        if feat in desc:
            tags.append(feat)

    return ", ".join(tags[:12])  # Cap at 12 tags to keep it simple


def build_variants(creature):
    """Return list of (label, description, positive_prompt, negative_prompt, cfg_override)."""
    desc = creature["description"]
    short_desc = condense_description(desc)
    element = creature.get("element", "neutral")
    tag_desc = creature_as_tags(creature)

    variants = []

    # V1: Ken Sugimori style — direct Pokemon artist reference
    variants.append((
        "V1: Sugimori style",
        "Pokemon artist ref, condensed desc, clean simple style tags",
        f"masterpiece, best quality, ken sugimori \\(style\\), pokemon \\(creature\\), "
        f"solo, creature, full body, white background, simple background, "
        f"simple design, clean lines, flat color, cute, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, busy, complex background, human, humanoid, realistic, "
        "detailed background, particles, sparkles, chibi, super deformed",
        None,  # no cfg override
    ))

    # V2: Flat color minimalist — push hard on simplicity
    variants.append((
        "V2: Flat color minimal",
        "Flat coloring, minimal detail tags, no prose — just tags",
        f"masterpiece, best quality, solo, creature, full body, white background, "
        f"simple background, flat color, cel shading, simple design, clean lineart, "
        f"game character, cute creature, {tag_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, busy, complex, detailed, intricate, "
        "realistic, photo, human, humanoid, multiple characters, "
        "background, scenery, gradient background, particles, effects, glow",
        None,
    ))

    # V3: Mobile game icon — gacha/mobile game character style
    variants.append((
        "V3: Mobile game icon",
        "Mobile game character card style, vivid but clean",
        f"masterpiece, best quality, solo, creature, full body, "
        f"white background, simple background, "
        f"game art, mobile game, gacha game, character icon, "
        f"vivid colors, clean lines, sharp, cute, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, complex background, human, humanoid, realistic, "
        "dark, gritty, multiple characters, chibi, super deformed",
        None,
    ))

    # V4: Condensed desc only — just first 2 sentences, standard quality tags
    variants.append((
        "V4: Short description",
        "Only first 2 sentences of description, standard tags",
        f"masterpiece, best quality, solo, creature, full body, standing, "
        f"white background, simple background, anime style, cute, "
        f"clean lines, vivid colors, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, busy, complex background, human, humanoid, "
        "realistic, photo, multiple characters",
        None,
    ))

    # V5: Pure tags, no natural language at all
    variants.append((
        "V5: Pure tags only",
        "Zero prose — everything converted to Danbooru tags",
        f"masterpiece, best quality, solo, 1other, creature, monster, "
        f"full body, standing, front view, white background, simple background, "
        f"anime style, simple design, clean lines, cute, vivid colors, "
        f"{tag_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "human, humanoid, realistic, photo, multiple characters, "
        "complex background, ornate, elaborate",
        None,
    ))

    # V6: Anti-complexity negatives — full description but heavy simplicity negatives
    variants.append((
        "V6: Heavy anti-complex neg",
        "Full description but aggressive negative for simplicity",
        f"masterpiece, best quality, solo, creature, full body, "
        f"white background, simple background, anime style, "
        f"simple design, clean, cute, {desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, busy, cluttered, excessive detail, intricate, "
        "filigree, fractal, particles, sparkles, multiple effects, aura, "
        "complex background, scenery, gradient, "
        "human, humanoid, realistic, photo, dark, gritty, "
        "concept art, illustration, painting, sketch",
        None,
    ))

    # V7: Low CFG — same as V4 but cfg=3.0 to reduce prompt adherence
    variants.append((
        "V7: Low CFG (3.0)",
        "Short description + low CFG for looser interpretation",
        f"masterpiece, best quality, solo, creature, full body, standing, "
        f"white background, simple background, anime style, cute, "
        f"clean lines, vivid colors, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "human, humanoid, realistic, photo, multiple characters",
        3.0,  # CFG override
    ))

    # V8: Nexomon/creature collector explicit — reference the genre directly
    variants.append((
        "V8: Creature collector",
        "Nexomon/creature collector genre tags, simplified desc",
        f"masterpiece, best quality, solo, creature, monster design, "
        f"full body, white background, simple background, "
        f"creature collector, monster tamer, pokemon style, nexomon, "
        f"cute monster, simple design, rounded shapes, expressive eyes, "
        f"bold outline, vivid colors, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, busy, complex, realistic, photo, "
        "human, humanoid, dark, gritty, horror, "
        "detailed background, particles, excessive effects",
        None,
    ))

    # V9: Soft watercolor — push towards softer, less sharp rendering
    variants.append((
        "V9: Soft watercolor",
        "Watercolor/soft shading style for gentler look",
        f"masterpiece, best quality, solo, creature, full body, "
        f"white background, simple background, "
        f"watercolor \\(medium\\), soft shading, pastel colors, "
        f"gentle, cute, rounded, simple design, clean, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "sharp lines, harsh lighting, ornate, elaborate, complex, "
        "human, humanoid, realistic, photo, dark, gritty",
        None,
    ))

    # V10: Bold outline + limited palette — graphic/vector feel
    variants.append((
        "V10: Bold outline graphic",
        "Thick outlines, limited colors, graphic design feel",
        f"masterpiece, best quality, solo, creature, full body, "
        f"white background, simple background, "
        f"bold outline, thick lineart, limited palette, flat color, "
        f"graphic design, character design, mascot, "
        f"simple shapes, cute, {short_desc}",
        "text, watermark, signature, worst quality, low quality, blurry, "
        "ornate, elaborate, gradient, complex shading, "
        "realistic, photo, human, humanoid, "
        "detailed background, particles, effects, glow, sparkle",
        None,
    ))

    return variants


def create_workflow(ckpt_key, prompt, negative, seed, filename_prefix, cfg_override=None):
    ckpt = CHECKPOINTS[ckpt_key]
    cfg = cfg_override if cfg_override is not None else ckpt["cfg"]
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
            "inputs": {"text": negative, "clip": ["1", 1]}
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
                "cfg": cfg,
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
                "filename_prefix": f"bakeoff_prompts/{filename_prefix}"
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


def generate_html(creature, variants, variant_indices):
    """Generate HTML: rows = prompt variants, columns = models."""
    name = creature.get("nameEn", creature["id"])
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{name} — Prompt Variation Bakeoff</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }}
  h1 {{ text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }}
  .subtitle {{ text-align: center; color: #888; margin-bottom: 24px; font-size: 0.85rem; }}
  .variant-row {{ margin-bottom: 32px; }}
  .variant-label {{ font-size: 1.1rem; font-weight: bold; color: #5ba8f5; margin-bottom: 4px; }}
  .variant-desc {{ font-size: 0.75rem; color: #666; margin-bottom: 10px; }}
  .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
  .card {{ background: #14141f; border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; }}
  .card-label {{ font-size: 0.8rem; font-weight: bold; padding: 8px 10px 0; color: #c77dff; }}
  .card img {{ width: 100%; aspect-ratio: 1; object-fit: cover; }}
  .card .meta {{ padding: 4px 10px 6px; font-size: 0.65rem; color: #555; }}
  @media (max-width: 900px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} }}
</style>
</head>
<body>
<h1>{name} — Prompt Variation Bakeoff</h1>
<div class="subtitle">10 prompt strategies x 4 models | seed: {FIXED_SEED}</div>
"""
    for vi in variant_indices:
        label, desc, _, _, cfg_override = variants[vi]
        html += f'<div class="variant-row">\n'
        html += f'<div class="variant-label">{label}</div>\n'
        html += f'<div class="variant-desc">{desc}</div>\n'
        html += '<div class="grid">\n'
        for mk in MODEL_KEYS:
            ckpt = CHECKPOINTS[mk]
            cfg = cfg_override if cfg_override is not None else ckpt["cfg"]
            fname = f"v{vi+1}_{mk}.png"
            fpath = os.path.join(OUTPUT_DIR, fname)
            html += f'<div class="card">\n'
            html += f'<div class="card-label">{ckpt["label"]}</div>\n'
            if os.path.exists(fpath):
                html += f'<img src="{fname}" alt="{ckpt["label"]}">\n'
            else:
                html += '<div style="aspect-ratio:1;background:#1a1a2a;display:flex;align-items:center;justify-content:center;color:#555;">FAILED</div>\n'
            html += f'<div class="meta">cfg={cfg}</div>\n'
            html += '</div>\n'
        html += '</div>\n</div>\n'

    html += '</body></html>'
    out_path = os.path.join(OUTPUT_DIR, "bakeoff.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Prompt-variation bakeoff for creature-forge")
    parser.add_argument("creature_id", help="Creature ID to test")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--variants", nargs="*", type=int,
                        help="Only run specific variant numbers (1-10)")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    all_creatures = load_creatures()
    if args.creature_id not in all_creatures:
        print(f"Unknown creature: {args.creature_id}")
        print("Available:", ", ".join(sorted(all_creatures.keys())[:10]), "...")
        sys.exit(1)

    creature = all_creatures[args.creature_id]
    name = creature.get("nameEn", args.creature_id)
    variants = build_variants(creature)

    # 0-indexed variant indices
    if args.variants:
        variant_indices = [v - 1 for v in args.variants if 1 <= v <= len(variants)]
    else:
        variant_indices = list(range(len(variants)))

    total = len(variant_indices) * len(MODEL_KEYS)

    print("=" * 60)
    print(f"PROMPT VARIATION BAKEOFF — {name}")
    print(f"Variants:  {len(variant_indices)} prompt strategies")
    print(f"Models:    {', '.join(CHECKPOINTS[m]['label'] for m in MODEL_KEYS)}")
    print(f"Seed:      {FIXED_SEED}")
    print(f"Total:     {total} images")
    print(f"Output:    {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("*** DRY RUN ***")
    print("=" * 60)

    job_num = 0
    success = 0
    failed = []

    for vi in variant_indices:
        label, desc, positive, negative, cfg_override = variants[vi]
        print(f"\n{'─' * 60}")
        print(f"{label}")
        print(f"  {desc}")

        for mk in MODEL_KEYS:
            job_num += 1
            ckpt = CHECKPOINTS[mk]
            cfg = cfg_override if cfg_override is not None else ckpt["cfg"]
            fname = f"v{vi+1}_{mk}"

            print(f"\n  [{job_num}/{total}] {ckpt['label']} (cfg={cfg})")

            if args.dry_run:
                print(f"    POS: {positive[:100]}...")
                print(f"    NEG: {negative[:80]}...")
                continue

            workflow = create_workflow(mk, positive, negative, FIXED_SEED, fname, cfg_override)
            prompt_id = queue_prompt(workflow)

            if prompt_id:
                print(f"    Queued, waiting...", end="", flush=True)
                if wait_for_completion(prompt_id, timeout=args.timeout):
                    result = download_result(prompt_id, f"v{vi+1}_{mk}.png")
                    if result:
                        path, size_kb = result
                        print(f" OK ({size_kb:.0f}KB)")
                        success += 1
                    else:
                        print(f" DOWNLOAD FAILED")
                        failed.append(f"{label}/{ckpt['label']}")
                else:
                    print(f" TIMEOUT/ERROR")
                    failed.append(f"{label}/{ckpt['label']}")
            else:
                print(f"    QUEUE ERROR")
                failed.append(f"{label}/{ckpt['label']}")

            time.sleep(2)

    if not args.dry_run:
        html_path = generate_html(creature, variants, variant_indices)
        print(f"\nHTML comparison: {html_path}")

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"DRY RUN: {total} jobs previewed")
    else:
        print(f"COMPLETE: {success}/{total} images generated")
        if failed:
            print(f"Failed: {', '.join(failed)}")
        print(f"\nOpen bakeoff-output/prompts/bakeoff.html to compare")
    print("=" * 60)


if __name__ == "__main__":
    main()
