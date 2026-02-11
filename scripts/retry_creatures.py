#!/usr/bin/env python3
"""
Retry creature sprite generation with custom per-creature prompts.
Fixes: text artifacts, duplicate characters, too-small subjects, platforms/stands.
"""

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
COMFYUI_URL = "http://192.168.1.222:8188"

# Much stronger base style — emphasize single character, large, centered
STYLE = (
    "solo, ONE single chibi character only, cute monster creature, gacha game art style, "
    "mobile game character icon, white background, bright vivid colors, "
    "high quality, clean lineart, centered composition, single subject only, "
    "full body, standing pose, collectible creature design, "
    "large character filling the frame, close-up view"
)

# MUCH stronger negative prompt — aggressively anti-text and anti-duplicate
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

# Custom prompt OVERRIDES for stubborn creatures.
# Add entries here only if a creature fails with its creatures.json description.
# The retry script will use the creature's description from creatures.json by default
# (same as generate_creatures.py), falling back to CUSTOM_PROMPTS only if present.
CUSTOM_PROMPTS = {
    # Example:
    # "tablette": "ONE single chibi armadillo robot creature, ..."
}


def load_creatures():
    with open(CREATURES_FILE) as f:
        return json.load(f)


def create_workflow(creature_id, prompt, negative=NEGATIVE):
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
            "inputs": {"text": negative, "clip": ["1", 1]}
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
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_and_save(prompt_id, creature_id):
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

                os.makedirs(SPRITE_DIR, exist_ok=True)
                out_path = os.path.join(SPRITE_DIR, f"{creature_id}.webp")
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "WEBP", quality=90)
                os.unlink(tmp_path)

                size_kb = os.path.getsize(out_path) / 1024
                return out_path, size_kb

        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def build_prompt_from_json(creature_id):
    """Build prompt from creatures.json description (same as generate_creatures.py)."""
    creatures = load_creatures()
    for c in creatures:
        if c["id"] == creature_id:
            return f"{STYLE}, {c['description']}"
    return None


def main():
    if len(sys.argv) > 1:
        retry_ids = sys.argv[1:]
    elif CUSTOM_PROMPTS:
        retry_ids = list(CUSTOM_PROMPTS.keys())
    else:
        print("Usage: python retry_creatures.py <creature_id> [creature_id ...]")
        print("No custom prompts defined. Pass creature IDs to retry with their creatures.json descriptions.")
        sys.exit(0)

    total = len(retry_ids)
    print("=" * 60)
    print(f"RETRYING {total} CREATURE SPRITES")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Output:  {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    print("=" * 60)

    success = 0
    failed = []

    for i, cid in enumerate(retry_ids, 1):
        # Use custom prompt if available, otherwise fall back to creatures.json
        prompt = CUSTOM_PROMPTS.get(cid)
        source = "custom"
        if not prompt:
            prompt = build_prompt_from_json(cid)
            source = "creatures.json"
        if not prompt:
            print(f"\n[{i}/{total}] {cid} — NOT FOUND in creatures.json, skipping")
            continue

        print(f"\n[{i}/{total}] {cid} ({source})")
        print(f"  Prompt: {prompt[:100]}...")

        workflow = create_workflow(cid, prompt)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=300):
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
    print(f"RETRY COMPLETE: {success}/{total} sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
