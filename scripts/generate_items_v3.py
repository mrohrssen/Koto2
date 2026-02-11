#!/usr/bin/env python3
"""
Regenerate 13 remaining bad item sprites (v3).
Ultra-simple descriptions, single object focus.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = (
    "solo object, isolated floating object, centered, anime illustration, "
    "simple clean white background, soft cel shading, no border, no frame, "
    "high quality, digital painting, game item icon"
)

NEGATIVE = (
    "frame, border, card, UI, decorative border, panel, window, grid, "
    "dark, gritty, realistic, horror, text, letters, writing, words, font, logo, "
    "watermark, signature, blurry, low quality, multiple objects, complex background, "
    "human, person, character, photo, 3d render, monochrome, cropped, cut off"
)

ITEM_DESCRIPTIONS = {
    "paper": (
        "a single folded origami paper crane made from white traditional Japanese washi paper, "
        "delicate folds visible, simple and elegant, floating centered"
    ),
    "music": (
        "a single golden harp musical instrument, small ornate lyre harp, "
        "shiny gold strings and frame, classical elegant, floating centered"
    ),
    "money": (
        "a small stack of shiny gold coins, three gold coins stacked with one leaning, "
        "embossed star design on face, metallic gleam, floating centered"
    ),
    "cooking": (
        "a single steaming hot pot with brown clay body and wooden lid slightly open, "
        "white steam rising from inside, warm and cozy, floating centered"
    ),
    "friend": (
        "a single four-leaf clover charm on a short chain, bright green lucky clover, "
        "tiny gold chain loop, simple friendship charm, floating centered"
    ),
    "parents": (
        "two interlinked silver rings, simple polished wedding bands linked together, "
        "shiny reflective metal, small diamond sparkle, floating centered"
    ),
    "name": (
        "a single red wax seal stamp impression, circular red seal with decorative pattern, "
        "traditional Japanese inkan seal mark, clean and crisp, floating centered"
    ),
    "book": (
        "a single thick blue hardcover book closed, gold embossed spine, "
        "red ribbon bookmark sticking out from top, simple and sturdy, floating centered"
    ),
    "clothes": (
        "a single folded blue Japanese yukata robe, neatly folded fabric with white pattern, "
        "golden obi belt sash on top, traditional and elegant, floating centered"
    ),
    "key": (
        "a single large ornate golden skeleton key, heart-shaped bow handle, "
        "long shaft with teeth at end, antique brass finish, floating centered"
    ),
    "map": (
        "a single rolled parchment scroll partially unrolled, aged yellow paper, "
        "red wax seal holding it closed, old and mysterious, floating centered"
    ),
    "tool": (
        "a single silver wrench and small golden hammer crossed in X shape, "
        "simple shiny metal tools, chrome finish, floating centered"
    ),
    "present": (
        "a single square gift box wrapped in red paper with golden ribbon bow on top, "
        "neat wrapping, sparkle effects, festive and exciting, floating centered"
    ),
}


def create_workflow(item_id, description):
    full_prompt = f"{STYLE}, {description}"
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
                "steps": 20,
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
                "filename_prefix": f"item_sprites_v3/{item_id}"
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
                        print(f"  Error details: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except:
            pass
        time.sleep(3)
    return False


def main():
    total = len(ITEM_DESCRIPTIONS)
    print("=" * 60)
    print(f"REGENERATING {total} ITEM SPRITES (v3 - ultra simple)")
    print(f"ComfyUI: {COMFYUI_URL}")
    print("=" * 60)

    success = 0
    failed = []

    for i, (item_id, desc) in enumerate(ITEM_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {item_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(item_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} item sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
