#!/usr/bin/env python3
"""
Generate 5 NPC sprite candidates each for 5 NPCs via ComfyUI.

Uses Nova v16 (novaAnimeXL_ilV160) with RMBG-2.0 background removal.
Outputs an HTML review page served via built-in HTTP server.

Usage:
  python scripts/generate_npc_sprites.py
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
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "tmp", "npc-bakeoff")
COMFYUI_URL = "http://127.0.0.1:8188"

NUM_VARIANTS = 5

CHECKPOINT = {
    "file": "novaAnimeXL_ilV160.safetensors",
    "cfg": 5.0,
    "sampler": "euler_ancestral",
    "scheduler": "normal",
    "steps": 30,
}

NPCS = {
    "kodomo": {
        "label": "子供 (Child)",
        "positive": (
            "masterpiece, best quality, solo, single character, anime character illustration, "
            "full body, white background, clean lines, anime game character style, "
            "1boy, young boy, child approximately 8 years old, cheerful happy expression, "
            "bright curious eyes, messy short hair, "
            "casual colorful t-shirt and shorts, sneakers, small backpack, "
            "playful dynamic pose, one hand waving, energetic stance, "
            "vibrant saturated colors, warm lighting, natural skin tones, "
            "game character art, high quality, sharp details"
        ),
        "negative": (
            "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
            "blurry, chibi, super deformed, multiple characters, multiple people, "
            "monochrome, silhouette, robot, mechanical, armor, mecha, "
            "female, girl, woman, adult, teenager, old, "
            "nude, nsfw, dark, gritty, horror, complex background, scenery"
        ),
    },
    "otona": {
        "label": "大人 (Adult)",
        "positive": (
            "masterpiece, best quality, solo, single character, anime character illustration, "
            "full body, white background, clean lines, anime game character style, "
            "1boy, adult man, mid-thirties, calm composed expression, mature handsome face, "
            "neat short dark hair, kind eyes, "
            "smart casual outfit, button-up shirt with rolled sleeves, slacks, nice shoes, "
            "confident standing pose, arms crossed or hands in pockets, "
            "warm earth tones, professional look, "
            "vibrant saturated colors, warm lighting, natural skin tones, "
            "game character art, high quality, sharp details"
        ),
        "negative": (
            "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
            "blurry, chibi, super deformed, multiple characters, multiple people, "
            "monochrome, silhouette, robot, mechanical, armor, mecha, "
            "female, girl, woman, child, young boy, teenager, old man, elderly, "
            "nude, nsfw, dark, gritty, horror, complex background, scenery"
        ),
    },
    "otokonoko": {
        "label": "男の子 (Boy)",
        "positive": (
            "masterpiece, best quality, solo, single character, anime character illustration, "
            "full body, white background, clean lines, anime game character style, "
            "1boy, young boy, approximately 12 years old, energetic excited expression, "
            "spiky messy hair, determined eyes, big grin, "
            "sporty outfit, hoodie jacket, athletic shorts, running shoes, wristband, "
            "dynamic running pose, fist pumped, action stance, full of energy, "
            "vibrant saturated colors, warm lighting, natural skin tones, "
            "game character art, high quality, sharp details"
        ),
        "negative": (
            "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
            "blurry, chibi, super deformed, multiple characters, multiple people, "
            "monochrome, silhouette, robot, mechanical, armor, mecha, "
            "female, girl, woman, adult, old, elderly, "
            "nude, nsfw, dark, gritty, horror, complex background, scenery"
        ),
    },
    "onnanoko": {
        "label": "女の子 (Girl)",
        "positive": (
            "masterpiece, best quality, solo, single character, anime character illustration, "
            "full body, white background, clean lines, anime game character style, "
            "1girl, young girl, approximately 10 years old, shy gentle smile, soft expression, "
            "long hair with hairclips, gentle eyes, "
            "cute dress with floral pattern, cardigan, mary jane shoes, small ribbon, "
            "gentle standing pose, hands clasped together, slightly looking down, "
            "pastel and warm colors, pink and cream tones, "
            "vibrant saturated colors, warm lighting, natural skin tones, "
            "game character art, high quality, sharp details"
        ),
        "negative": (
            "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
            "blurry, chibi, super deformed, multiple characters, multiple people, "
            "monochrome, silhouette, robot, mechanical, armor, mecha, "
            "male, boy, man, adult woman, old, elderly, "
            "nude, nsfw, dark, gritty, horror, complex background, scenery, "
            "revealing clothing, sexy"
        ),
    },
    "game-master": {
        "label": "Game Master (Whack-a-Mole)",
        "positive": (
            "masterpiece, best quality, solo, single character, anime character illustration, "
            "full body, white background, clean lines, anime game character style, "
            "1boy, eccentric game show host, adult man, late twenties, "
            "flashy showman grin, winking, confident charismatic expression, "
            "wild styled hair, star-shaped hair accessory, "
            "colorful ringmaster-style jacket with gold buttons, "
            "vest with playing card motifs, bow tie, "
            "striped pants, pointed boots, "
            "dramatic presenting pose, one arm outstretched gesturing, "
            "bright vivid colors, gold and purple and red color scheme, "
            "vibrant saturated colors, warm lighting, natural skin tones, "
            "game character art, high quality, sharp details"
        ),
        "negative": (
            "lowres, worst quality, bad quality, bad anatomy, text, watermark, signature, "
            "blurry, chibi, super deformed, multiple characters, multiple people, "
            "monochrome, silhouette, robot, mechanical, armor, mecha, "
            "female, girl, woman, child, young boy, old man, elderly, "
            "nude, nsfw, dark, gritty, horror, complex background, scenery, "
            "scary clown, creepy"
        ),
    },
}


def create_workflow(positive, negative, seed, prefix):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT["file"]}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["1", 1]}
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
                "filename_prefix": f"npc_bakeoff/{prefix}"
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


def generate_html(results):
    html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NPC Sprite Candidates — Koto</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { text-align: center; font-size: 1.8rem; margin-bottom: 8px; color: #fff; }
  .subtitle { text-align: center; color: #888; margin-bottom: 32px; font-size: 0.85rem; }
  .npc-section { margin-bottom: 48px; }
  .npc-title { font-size: 1.3rem; color: #c77dff; margin-bottom: 16px; border-bottom: 1px solid #2a2a3a; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; max-width: 1400px; }
  .card { background: #14141f; border: 2px solid #2a2a3a; border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s; }
  .card:hover { border-color: #5ba8f5; transform: scale(1.02); }
  .card.selected { border-color: #4ade80; box-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
  .card-label { font-size: 0.9rem; font-weight: bold; padding: 10px 12px 0; color: #aaa; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: repeating-conic-gradient(#1a1a2a 0% 25%, #22223a 0% 50%) 0 0 / 20px 20px; }
  .card .meta { padding: 6px 12px 10px; font-size: 0.7rem; color: #555; }
  @media (max-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 700px) { .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<h1>NPC Sprite Candidates</h1>
<div class="subtitle">Nova v16 | 5 variants each | RMBG-2.0 transparent | Tap to select favorites</div>
"""
    for npc_id, npc_data in NPCS.items():
        html += f'<div class="npc-section">\n'
        html += f'<h2 class="npc-title">{npc_data["label"]} — {npc_id}</h2>\n'
        html += '<div class="grid">\n'
        for i in range(NUM_VARIANTS):
            fname = f"{npc_id}_{i+1:02d}.png"
            fpath = os.path.join(OUTPUT_DIR, fname)
            seed = results.get(f"{npc_id}_{i}", "?")
            html += f'<div class="card" onclick="this.classList.toggle(\'selected\')">\n'
            html += f'<div class="card-label">#{i+1}</div>\n'
            if os.path.exists(fpath):
                html += f'<img src="{fname}" alt="{npc_id} candidate {i+1}">\n'
            else:
                html += ('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;'
                         'align-items:center;justify-content:center;color:#555;">FAILED</div>\n')
            html += f'<div class="meta">seed: {seed}</div>\n'
            html += '</div>\n'
        html += '</div>\n</div>\n'

    html += '</body></html>'
    out_path = os.path.join(OUTPUT_DIR, "review.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total = len(NPCS) * NUM_VARIANTS
    results = {}
    success = 0
    failed = []

    print("=" * 64)
    print("  NPC SPRITE GENERATION")
    print(f"  Model:    Nova v16 ({CHECKPOINT['file']})")
    print(f"  NPCs:     {len(NPCS)} x {NUM_VARIANTS} variants = {total} images")
    print(f"  Output:   {OUTPUT_DIR}")
    print("=" * 64)

    idx = 0
    for npc_id, npc_data in NPCS.items():
        print(f"\n--- {npc_data['label']} ({npc_id}) ---")
        for i in range(NUM_VARIANTS):
            idx += 1
            seed = random.randint(1, 999999999)
            results[f"{npc_id}_{i}"] = seed
            fname = f"{npc_id}_{i+1:02d}.png"

            print(f"  [{idx}/{total}] {npc_id} #{i+1} seed={seed}")

            workflow = create_workflow(
                npc_data["positive"], npc_data["negative"], seed, f"{npc_id}_{i+1:02d}"
            )
            prompt_id = queue_prompt(workflow)

            if not prompt_id:
                print("    QUEUE ERROR")
                failed.append(fname)
                continue

            print(f"    Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id):
                result = download_result(prompt_id, fname)
                if result:
                    path, size_kb = result
                    print(f" OK ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(fname)
            else:
                print(f" TIMEOUT/ERROR")
                failed.append(fname)

            time.sleep(1)

    html_path = generate_html(results)

    print(f"\n{'=' * 64}")
    print(f"  COMPLETE: {success}/{total} images generated")
    if failed:
        print(f"  Failed: {failed}")
    print(f"  Review: {html_path}")
    print("=" * 64)


if __name__ == "__main__":
    main()
