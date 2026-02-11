#!/usr/bin/env python3
"""Final pass for 3 stubborn items - different visual metaphors."""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = "solo object, centered, anime style, white background, clean, high quality, game icon, digital art"
NEGATIVE = "frame, border, card, text, letters, writing, logo, watermark, dark, horror, blurry, low quality, person, human, character, photo, 3d, monochrome, multiple objects, background, scenery"

ITEM_DESCRIPTIONS = {
    "paper": (
        "a single sealed envelope, cream colored paper envelope with a red heart sticker seal, "
        "simple flat mail envelope, anime style"
    ),
    "friend": (
        "a single yellow star badge pin, shiny golden five-pointed star, "
        "cute anime accessory, sparkling, simple"
    ),
    "parents": (
        "a single golden heart-shaped locket pendant necklace, "
        "open locket showing two tiny silhouettes inside, gold chain, shiny"
    ),
}


def create_workflow(item_id, description):
    full_prompt = f"{STYLE}, {description}"
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": full_prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": random.randint(1, 999999999), "steps": 20, "cfg": 7.5,
            "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]
        }},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "RMBG", "inputs": {
            "image": ["6", 0], "model": "RMBG-2.0", "sensitivity": 1.0,
            "process_res": 512, "mask_blur": 0, "mask_offset": 0,
            "invert_output": False, "background": "Alpha"
        }},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": f"item_sprites_v5/{item_id}"}}
    }
    return workflow


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(COMFYUI_URL + "/prompt", data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8")).get("prompt_id", "")
    except Exception as e:
        print(f"  Error: {e}")
        return ""


def wait_for_completion(prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    if history[prompt_id].get("status", {}).get("status_str") == "error":
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except:
            pass
        time.sleep(3)
    return False


def main():
    for i, (item_id, desc) in enumerate(ITEM_DESCRIPTIONS.items(), 1):
        print(f"[{i}/3] {item_id}: {desc[:60]}...")
        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)
        if prompt_id and wait_for_completion(prompt_id):
            print(f"  [OK]")
        else:
            print(f"  [FAILED]")
        time.sleep(1)


if __name__ == "__main__":
    main()
