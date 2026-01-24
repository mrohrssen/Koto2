#!/usr/bin/env python3
"""
Generate 7 boss sprites for NEO TOKYO: System Liberation
Pokemon rival/gym leader style - dramatic imposing characters.
1024x1024 with transparent background via RMBG-2.0.

Run on Windows PC with ComfyUI at http://127.0.0.1:8188
Output: ComfyUI/output/boss_sprites/{bossId}_00001_.png
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game rival character style, dramatic confident stance, elaborate detailed clothing, slight aura glow, imposing presence, vibrant colors, game character art, high quality, sharp details, bold linework, high contrast"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, plain clothing, pokeball, pokeballs, poke ball"

BOSS_DESCRIPTIONS = {
    "boss_goblin_king": "legendary japanese anime director, sweeping dramatic black trenchcoat billowing in wind, holding megaphone like a weapon, storyboard papers swirling around like magic, beret at jaunty angle, intense creative fire in eyes, commanding presence demanding perfection, golden directors chair aura",
    "boss_wolf_alpha": "infamous tokyo host club king, dazzling white three-piece suit with golden embroidery, champagne glass raised in toast, red roses cascading around him, impossibly styled silver hair, confident smirk, VIP rope barrier aura, blinding charisma",
    "boss_lich": "mega-famous social media influencer, cutting-edge streetwear layered outfit worth millions, floating smartphones orbiting like satellites, ring light halo, peace sign pose but eyes are calculating, viral energy crackling, hashtag symbols floating",
    "boss_ogre": "eccentric electronics emperor, lab coat covered in circuit board patterns, holographic displays projecting from fingertips, wild Einstein-like hair crackling with static, goggles pushed up on forehead, surrounded by floating gadgets and components",
    "boss_demon_lord": "ruthless foreign corporation CEO, impeccably tailored charcoal suit that costs more than a house, towering imposing figure, arms crossed with platinum watch gleaming, skyscraper shadows behind, crushing corporate dominance aura, cold calculating eyes",
    "boss_dragon_elder": "supreme minister of bureaucratic control, formal government attire with excessive medals and sashes, ancient authority emanating from every pore, official seal stamp raised like a scepter, mountain of regulations behind, absolute order aura",
    "boss_shadow_monarch": "transcendent AI emperor, figure half-digital half-physical, holographic fragments forming a regal silhouette, data streams as flowing robes, crown of floating code, one eye human one eye pure light, ultimate digital godhood, reality-bending power",
}


def create_workflow(boss_id, description):
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
                "filename_prefix": f"boss_sprites/{boss_id}"
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


def wait_for_completion(prompt_id, timeout=180):
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
        time.sleep(2)
    return False


def main():
    os.makedirs(r"C:\Users\michi\ComfyUI\output\boss_sprites", exist_ok=True)

    total = len(BOSS_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} BOSS SPRITES")
    print("1024x1024 Pokemon rival/gym leader style, transparent bg")
    print("=" * 60)

    success = 0
    failed = []

    for i, (boss_id, desc) in enumerate(BOSS_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {boss_id}")
        print(f"  {desc[:60]}...")

        workflow = create_workflow(boss_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(boss_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(boss_id)

        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} boss sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\boss_sprites\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
