#!/usr/bin/env python3
"""
Round 2: 5 timbark variations on the "Robot Formula" STYLE.
Same short STYLE + light negative from variant A, but varying the
mecha-to-organic ratio in descriptions to find the sweet spot.

  A1 = Full Mecha (baseline from round 1)
  A2 = Armored Beast — natural creature wearing armor plating
  A3 = Rich Organic — no mecha at all, but uses material-rich vocabulary
  A4 = Monster Hunter — natural armor plates/shells like a real beast
  A5 = Digimon Hybrid — halfway organic/tech blend

Output: public/assets/sprites/starter-variants/timbark-a1..a5.webp
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
    # A1: Full Mecha — baseline from round 1
    "timbark-a1": (
        "a cute chibi treant mecha creature, stout armored body of layered dark oak bark "
        "plating with detailed moss patches and lichen spot textures across every surface, "
        "two ornate branch antler weapons sprouting glowing green leaf crystals, "
        "sturdy root-like armored legs with visible wood grain texture and amber energy veins, "
        "a cluster of glowing amber sap energy gems embedded in ornate chest armor plate, "
        "warm friendly eyes behind bark visor with amber energy glow, "
        "green nature energy wisps and floating leaf particles swirling around body, "
        "intricate bark armor detail, polished rendering"
    ),

    # A2: Armored Beast — a living tree creature that grew natural armor
    "timbark-a2": (
        "a cute chibi treant beast, stout round body of thick dark oak bark with deep "
        "carved fissure patterns and natural bark armor plates layered like dragon scales, "
        "lush emerald moss growing in the crevices between bark plates, "
        "two magnificent branch antlers with dense clusters of bright spring-green leaves, "
        "sturdy thick root legs with polished wood grain rings and amber sap crystals at joints, "
        "a glowing amber heartwood core visible through a natural gap in the chest bark, "
        "warm golden eyes set in detailed knotholes with friendly determined expression, "
        "green energy wisps rising from leaf tips, floating golden leaf particles, "
        "intricate natural bark texture detail, polished rendering"
    ),

    # A3: Rich Organic — zero mecha language, pure creature with material-rich descriptions
    "timbark-a3": (
        "a cute chibi ancient treant creature, round stout body of richly textured dark oak "
        "bark with deep grain patterns revealing warm amber heartwood in every crevice, "
        "patches of velvet emerald moss and silvery lichen dotting the surface like jewels, "
        "two grand forked antlers of polished dark wood with cascading clusters of "
        "individually detailed spring-green leaves catching golden light, "
        "thick root-trunk legs with visible concentric growth rings and crystallized amber sap, "
        "a constellation of luminous amber sap gems growing naturally from the chest like resin, "
        "large warm eyes of liquid golden amber nested in ornate knotholes, "
        "spiraling wisps of verdant nature energy and tiny floating leaves, "
        "every surface richly textured with bark grain and organic detail"
    ),

    # A4: Monster Hunter — natural biological armor like a real beast/dinosaur
    "timbark-a4": (
        "a cute chibi forest guardian beast, compact powerful body covered in overlapping "
        "bark-scale plates like a pangolin made of dark polished wood, "
        "each scale edged with bright green moss and tiny sprouting ferns, "
        "two heavy branch antlers with thick leaf canopy clusters and hanging vine tassels, "
        "four sturdy clawed root-paws with visible wood grain and amber crystal claws, "
        "a large glowing amber sap gem embedded naturally in the forehead like a third eye, "
        "warm fierce golden eyes with a protective guardian expression, "
        "thick mossy mane around the neck and shoulders, "
        "green spore particles and tiny floating leaves in the air around it, "
        "detailed natural armor plating and wood texture rendering"
    ),

    # A5: Digimon Hybrid — organic body with subtle tech/crystal energy accents
    "timbark-a5": (
        "a cute chibi treant spirit, round stout body of dark oak bark with glowing "
        "emerald circuit-like vine patterns running through the surface, "
        "patches of luminous moss that pulse with soft green light, "
        "two ornate antlers where branches intertwine with glowing crystal growths, "
        "sturdy root legs with amber energy veins visible through translucent bark patches, "
        "a radiant amber crystal core embedded in the chest bark surrounded by growing moss, "
        "bright golden eyes with a green energy glow and determined friendly expression, "
        "swirling aura of green energy particles and golden floating leaves, "
        "nature and crystal energy fusion detail, polished rendering"
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
    print(f"ROUND 2: {total} TIMBARK VARIATIONS (mecha→organic spectrum)")
    print(f"  A1=Full Mecha  A2=Armored Beast  A3=Rich Organic  A4=Monster Hunter  A5=Digimon Hybrid")
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
