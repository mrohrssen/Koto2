#!/usr/bin/env python3
"""
Item sprite v8 — final 7 stubborn items.

Strategy: radically simple prompts. Each is a single solid object
the model has definitely seen thousands of times in anime art.
No niche terms, no surface graphics, no ambiguity.
"""

import json
import urllib.request
import time
import random
import sys

COMFYUI_URL = "http://10.5.0.2:8188"

# Stripped down style — no "game", no "icon", no "illustration" even.
# Pure anime object drawing.
STYLE_SUFFIX = (
    "anime style, cel shaded, white background, "
    "one object only, centered, bold black outlines, vibrant colors, "
    "simple clean drawing, full object visible, high quality"
)

NEGATIVE = (
    "frame, border, card, UI, window, panel, badge, stamp, "
    "trading card, playing card, game screenshot, app icon, logo, "
    "multiple objects, background, scene, landscape, "
    "person, character, realistic, photograph, blurry, "
    "text, writing, letters, watermark, signature, "
    "cropped, cut off, partial, dark, monochrome, low quality"
)

# Each prompt is designed to be dead simple — a single solid object
# that anime models have rendered thousands of times.
ITEMS = {
    # KEY: the word "key" triggers game cards. Use "old fashioned door key"
    # and make it massive and simple.
    "key": (
        "one old fashioned large iron door key, "
        "simple round handle at top, long straight metal shaft, "
        "rusty dark iron with golden highlights, the key lies flat"
    ),

    # FAMILY: medallion keeps becoming full-bleed frame.
    # Switch to a small wooden house ornament — warm, recognizable.
    "family": (
        "one small wooden birdhouse ornament, "
        "tiny cute house shape made of light brown wood, "
        "little round entrance hole, peaked roof with red shingles, "
        "warm and cozy miniature house"
    ),

    # NATURE: two plants appeared. Go with a single potted succulent.
    "nature": (
        "one small round ceramic flower pot with a green plant, "
        "the pot is white with a simple blue stripe, "
        "a single green leafy plant growing from brown soil inside, "
        "cute and compact potted plant"
    ),

    # SUMMER: fan keeps getting framed. Use a shaved ice dessert instead —
    # iconic Japanese summer, very recognizable, volumetric.
    "summer": (
        "one Japanese kakigori shaved ice dessert in a glass bowl, "
        "fluffy mound of colorful shaved ice with strawberry red syrup, "
        "a small spoon sticking out, the glass bowl sits on a saucer, "
        "refreshing summer treat"
    ),

    # LOVER: ring becomes stars. Use a red rose — classic, volumetric,
    # the model knows roses extremely well.
    "lover": (
        "one single red rose flower in full bloom, "
        "rich velvety crimson petals, green stem with two leaves, "
        "a sparkling dewdrop on one petal, romantic and beautiful"
    ),

    # SIBLINGS: beads scatter. Use matching pair of origami cranes
    # nested together as one unit — but described as a single ornament.
    "siblings": (
        "one small ornament of two origami paper cranes sitting together, "
        "one crane is blue and one is red, they are side by side touching, "
        "cute folded paper birds, colorful and cheerful"
    ),

    # PAPER: flat paper = 2D = cards. Use a rolled scroll instead.
    "paper": (
        "one tightly rolled paper scroll standing upright, "
        "cream colored parchment paper with a red ribbon tied around the middle, "
        "the scroll is compact and cylindrical like a tube"
    ),
}


def create_workflow(item_id, description):
    full_prompt = f"{description}, {STYLE_SUFFIX}"
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_prompt, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 512, "height": 512, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 25,
                "cfg": 7.0,
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
                "process_res": 512,
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
                "filename_prefix": f"item_sprites_v8/{item_id}"
            }
        }
    }
    return workflow


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
        except:
            pass
        time.sleep(3)
    return False


def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    items = {k: v for k, v in ITEMS.items() if only is None or k in only} if only else ITEMS

    total = len(items)
    print("=" * 60)
    print(f"ITEM SPRITES v8 — final 7 ({total} items)")
    print(f"ComfyUI: {COMFYUI_URL}")
    print("=" * 60)

    success = 0
    failed = []

    for i, (item_id, desc) in enumerate(items.items(), 1):
        print(f"\n[{i}/{total}] {item_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  done")
                success += 1
            else:
                print(f"  FAILED")
                failed.append(item_id)
        else:
            print(f"  QUEUE ERROR")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
