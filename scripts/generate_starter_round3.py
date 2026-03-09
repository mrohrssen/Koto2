#!/usr/bin/env python3
"""
Round 3: A2 "Armored Beast" style applied to 5 diverse creatures.
Tests whether the A2 formula generalizes across elements/rarities/types.

Creatures: barkley (earth hound), frostelle (snow fox), chirplet (paradise bird),
           solarie (fire legendary), glitchi (pixel ghost)

Output: public/assets/sprites/starter-variants/<id>-a2.webp
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
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "starter-variants")
COMFYUI_URL = "http://10.5.0.2:8188"

STYLE = (
    "solo, chibi character, gacha game art style, mobile game character icon, "
    "white background, bright vivid colors, high quality, clean, cute mecha creature"
)

NEGATIVE = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette"
)

CFG = 7.5

JOBS = {
    # barkley — earth hound, uncommon
    "barkley-a2": (
        "a cute chibi earth hound beast, sturdy round body of warm terracotta clay with "
        "natural stone armor plates layered across its back like dragon scales, "
        "oversized floppy ears with sandy brown and copper patches and polished edges, "
        "a fluffy tail tipped with a large glowing amber crystal that radiates warm light, "
        "thick paws of polished river stone with tiny quartz crystal claws, "
        "bright loyal golden eyes with gemstone fleck irises and determined expression, "
        "floating dust motes and tiny orbiting pebbles swirling around its body, "
        "detailed clay and stone texture on every surface, alert adventurous stance"
    ),

    # frostelle — snow fox, uncommon
    "frostelle-a2": (
        "a cute chibi arctic fox beast, fluffy round body of pristine white fur with natural "
        "ice crystal armor plates forming along its spine and shoulders like frozen scales, "
        "delicate ice crystal antlers on its head refracting light into tiny rainbow prisms, "
        "an enormous bushy tail of layered snowflake-patterned fur with frosted crystal tips, "
        "paws encased in natural ice crystal boots with intricate frost vein patterns, "
        "sparkling diamond-dust eyes with a cool blue glow and gentle expression, "
        "small snowflakes and ice crystal shards gently orbiting around its body, "
        "detailed fur and ice crystal texture on every surface, serene winter aura"
    ),

    # chirplet — paradise bird, rare
    "chirplet-a2": (
        "a cute chibi paradise bird beast, plump round body covered in layered iridescent "
        "feather armor plates that shift between emerald green and sapphire blue, "
        "magnificent oversized wings with layered plumage in sunset gold orange and magenta "
        "each feather individually detailed with glowing fiber-optic tips, "
        "a crest of three tall decorative feather plumes with luminous crystal tips, "
        "sharp beak of polished jade with gold trim, "
        "tail feathers trailing luminous green energy ribbons, "
        "bright confident eyes with a golden ring iris and proud expression, "
        "visible wind currents and golden sparkles swirling beneath its wings, "
        "detailed iridescent feather texture on every surface, proud hovering pose"
    ),

    # solarie — solar phoenix, legendary
    "solarie-a2": (
        "a cute chibi solar phoenix beast, majestic round body of brilliant molten gold "
        "with natural flame-scale armor plates of white-hot plasma across its surface, "
        "swirling solar flare patterns etched into every scale like living engravings, "
        "magnificent wings of cascading sunbeam feather blades radiating prismatic light, "
        "a divine halo crown of spinning golden rings with diamond-bright solar sparks, "
        "flowing mane of dancing flame ribbons in gold and white streaming behind, "
        "sacred sun-symbol markings naturally grown across its chest plates, "
        "celestial eyes of pure burning starlight with fierce divine gaze, "
        "multiple floating miniature suns and golden orbs orbiting its body, "
        "detailed flame scale and golden armor texture on every surface, "
        "godlike solar radiance, mythical aura, divine imposing stance"
    ),

    # glitchi — pixel ghost, uncommon
    "glitchi-a2": (
        "a cute chibi pixel ghost beast, round body made of blocky colorful pixel clusters "
        "with natural digital armor plates of layered glowing voxels in red orange and yellow, "
        "a screen-like face displaying animated pixel art expressions with bright scan-line eyes, "
        "pixel-flame hair that flickers upward in chunky detailed blocks, "
        "blocky gauntlet paws crackling with tiny digital spark effects, "
        "a pixelated scarf trailing behind dissolving into detailed data particles, "
        "floating pixel fragments and tiny retro power-up icons orbiting around its body, "
        "detailed pixel texture and digital energy effects on every surface, "
        "energetic floating pose with glitchy color-shift aura"
    ),
}


def create_workflow(output_id, prompt):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": f"{STYLE}, {prompt}", "clip": ["1", 1]}
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
                "cfg": CFG,
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
                "filename_prefix": f"starter_variants/{output_id}"
            }
        }
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


def download_and_save(prompt_id, output_id):
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
                os.makedirs(OUTPUT_DIR, exist_ok=True)
                out_path = os.path.join(OUTPUT_DIR, f"{output_id}.webp")
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "WEBP", quality=90)
                os.unlink(tmp_path)
                return out_path, os.path.getsize(out_path) / 1024
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def main():
    total = len(JOBS)
    print("=" * 65)
    print(f"ROUND 3: A2 STYLE x 5 DIVERSE CREATURES")
    print(f"  barkley(earth) frostelle(water) chirplet(wood) solarie(fire) glitchi(fire)")
    print(f"  ComfyUI: {COMFYUI_URL}")
    print("=" * 65)

    success = 0
    failed = []

    for i, (output_id, desc) in enumerate(JOBS.items(), 1):
        print(f"\n[{i}/{total}] {output_id}")
        print(f"  {desc[:100]}...")

        workflow = create_workflow(output_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id):
                result = download_and_save(prompt_id, output_id)
                if result:
                    path, size_kb = result
                    print(f" OK -> {os.path.basename(path)} ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(output_id)
            else:
                print(f" GENERATION FAILED")
                failed.append(output_id)
        else:
            print(f"  QUEUE ERROR")
            failed.append(output_id)

        time.sleep(1)

    print("\n" + "=" * 65)
    print(f"COMPLETE: {success}/{total}")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 65)


if __name__ == "__main__":
    main()
