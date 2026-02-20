#!/usr/bin/env python3
"""
Generate 46 creature sprites for NEO TOKYO: System Liberation.
Reads creature data from data/creatures.json — cute collectible monsters.

1024x1024 with transparent background via RMBG-2.0.
Automatically downloads outputs from ComfyUI and converts to WebP.

Usage:
  python scripts/generate_creatures.py                    # All 46
  python scripts/generate_creatures.py petalia drizzlet   # Specific creatures
  python scripts/generate_creatures.py --rarity common    # Filter by rarity
  python scripts/generate_creatures.py --element fire     # Filter by element
  python scripts/generate_creatures.py --area "School District"  # Filter by area
  python scripts/generate_creatures.py --force            # Regenerate even if sprite exists
  python scripts/generate_creatures.py --dry-run          # Show prompts without generating
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
SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
_COMFYUI_URL = "http://10.5.0.2:8188"


def get_comfyui_url():
    return _COMFYUI_URL


def set_comfyui_url(url):
    global _COMFYUI_URL
    _COMFYUI_URL = url


STYLE = (
    "solo, ONE single chibi character only, cute monster creature, gacha game art style, "
    "mobile game character icon, white background, bright vivid colors, "
    "high quality, clean lineart, centered composition, single subject only, "
    "full body, standing pose, collectible creature design, "
    "large character filling the frame, close-up view"
)

NEGATIVE = (
    "text, title, logo, watermark, username, signature, writing, letters, words, "
    "japanese text, kanji, hiragana, katakana, alphabet, numbers, font, caption, "
    "speech bubble, dialogue box, name plate, label, subtitle, credit, "
    "game UI, icon, badge, HUD, frame, border, card frame, ornamental frame, "
    "decorative border, thumbnail, small version, "
    "duplicate, multiple copies, two characters, multiple characters, "
    "reference sheet, character sheet, turnaround, model sheet, "
    "size comparison, evolution chart, "
    "blurry, low quality, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette, picture frame, vignette, circular frame, "
    "ground, grass, floor, scenery, landscape, environment, scene, "
    "pedestal, stand, platform, base, disc, coin, stage, podium, "
    "dark, gritty, realistic, horror"
)


def load_creatures():
    with open(CREATURES_FILE) as f:
        return json.load(f)


def build_prompt(creature):
    """Build the full positive prompt from creature data.

    Rarity-specific detail is baked into each creature's description field
    in creatures.json, so no separate rarity boost is needed here.
    """
    desc = creature["description"]
    return f"{STYLE}, {desc}"


def create_workflow(creature_id, prompt):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": ["1", 1]}
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
                "seed": random.randint(1, 999999999),
                "steps": 30,
                "cfg": 7.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
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
                "filename_prefix": f"creature_sprites/{creature_id}"
            }
        }
    }


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        get_comfyui_url() + "/prompt",
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
            req = urllib.request.Request(get_comfyui_url() + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        msgs = status.get("messages", [])
                        print(f"  Error details: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_and_save(prompt_id, creature_id):
    """Download output PNG from ComfyUI, convert to WebP, save to sprite dir.
    Returns the saved file path or None on failure."""
    try:
        from PIL import Image
    except ImportError:
        print("  ERROR: Pillow not installed. Run: pip install Pillow")
        sys.exit(1)

    try:
        req = urllib.request.Request(get_comfyui_url() + "/history/" + prompt_id)
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

                # Download via /view endpoint
                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": filetype,
                })
                url = f"{get_comfyui_url()}/view?{params}"

                # Download to temp file, convert PNG→WebP
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)

                # Convert to WebP and save
                os.makedirs(SPRITE_DIR, exist_ok=True)
                out_path = os.path.join(SPRITE_DIR, f"{creature_id}.webp")
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "WEBP", quality=90)
                os.unlink(tmp_path)

                size_kb = os.path.getsize(out_path) / 1024
                return out_path, size_kb

        print("  No output images found in history")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def filter_creatures(creatures, args):
    """Filter creature list based on CLI arguments."""
    result = creatures

    if args.creature_ids:
        ids = set(args.creature_ids)
        result = [c for c in result if c["id"] in ids]
        found = {c["id"] for c in result}
        missing = ids - found
        if missing:
            print(f"WARNING: Unknown creature IDs: {', '.join(sorted(missing))}")

    if args.rarity:
        result = [c for c in result if c.get("rarity") == args.rarity]

    if args.element:
        result = [c for c in result if c.get("element") == args.element]

    if args.area:
        result = [c for c in result if c.get("area", "").lower() == args.area.lower()]

    if not args.force:
        before = len(result)
        result = [c for c in result if not os.path.exists(
            os.path.join(SPRITE_DIR, f"{c['id']}.webp")
        )]
        skipped = before - len(result)
        if skipped:
            print(f"Skipping {skipped} creatures with existing sprites (use --force to regenerate)")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Generate creature sprites via ComfyUI SDXL + RMBG-2.0"
    )
    parser.add_argument("creature_ids", nargs="*", help="Specific creature IDs to generate")
    parser.add_argument("--rarity", choices=["common", "uncommon", "rare", "epic", "legendary"],
                        help="Filter by rarity")
    parser.add_argument("--element", choices=["fire", "water", "wood", "earth", "metal"],
                        help="Filter by element")
    parser.add_argument("--area", help="Filter by area name (e.g. 'School District')")
    parser.add_argument("--force", action="store_true",
                        help="Regenerate even if sprite already exists locally")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print prompts without sending to ComfyUI")
    parser.add_argument("--comfyui-url", default=None, help="ComfyUI server URL")
    parser.add_argument("--timeout", type=int, default=300, help="Per-job timeout in seconds")
    args = parser.parse_args()

    if args.comfyui_url:
        set_comfyui_url(args.comfyui_url)

    all_creatures = load_creatures()
    creatures = filter_creatures(all_creatures, args)

    if not creatures:
        print("No creatures to generate. Check filters or use --force.")
        sys.exit(0)

    total = len(creatures)
    print("=" * 60)
    print(f"GENERATING {total} CREATURE SPRITES")
    print(f"1024x1024 chibi creatures with transparent backgrounds")
    print(f"ComfyUI: {get_comfyui_url()}")
    print(f"Output:  {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("*** DRY RUN — no jobs will be queued ***")
    print("=" * 60)

    success = 0
    failed = []

    for i, creature in enumerate(creatures, 1):
        cid = creature["id"]
        name = creature.get("nameEn", cid)
        rarity = creature.get("rarity", "?")
        element = creature.get("element", "?")

        prompt = build_prompt(creature)

        print(f"\n[{i}/{total}] {cid} ({name}) — {element}/{rarity}")
        print(f"  {creature['description'][:80]}...")

        if args.dry_run:
            print(f"  PROMPT: {prompt[:120]}...")
            continue

        workflow = create_workflow(cid, prompt)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=args.timeout):
                result = download_and_save(prompt_id, cid)
                if result:
                    path, size_kb = result
                    print(f" OK → {os.path.basename(path)} ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(cid)
            else:
                print(f" GENERATION FAILED")
                failed.append(cid)
        else:
            print(f"  QUEUE ERROR")
            failed.append(cid)

        time.sleep(1)

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"DRY RUN COMPLETE: {total} creatures previewed")
    else:
        print(f"COMPLETE: {success}/{total} creature sprites generated")
        if failed:
            print(f"Failed: {', '.join(failed)}")
        print(f"Sprites saved to: {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
