#!/usr/bin/env python3
"""
Generate 7 boss sprites for NEO TOKYO: System Liberation (v2 - fixed prompts)
Fixed: removed "aura glow", "high contrast" that caused monochrome.
Added warm colors, explicit descriptions, stronger anti-monochrome negative.
1024x1024 with transparent background via RMBG-2.0.
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game boss character style, dramatic confident stance, elaborate detailed clothing, vibrant saturated colors, colorful, warm lighting, varied color palette, natural skin tones, game character art, high quality, sharp details, imposing powerful presence"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, background, frame, border, ornamental"

BOSS_DESCRIPTIONS = {
    "boss_goblin_king": "1boy, legendary japanese anime director, sweeping dramatic black trenchcoat with red lining billowing in wind, holding gold megaphone like a weapon, colorful storyboard papers swirling around like magic, red beret at jaunty angle, intense creative fire in purple eyes, commanding presence, pink and orange flame effects",
    "boss_wolf_alpha": "1boy, infamous tokyo host club king, dazzling white three-piece suit with golden embroidery and red rose boutonniere, champagne glass raised in toast, red roses cascading around him, impossibly styled silver hair, confident smirk, golden sparkle effects, charismatic and flashy",
    "boss_lich": "1girl, mega-famous social media influencer, cutting-edge colorful streetwear layered outfit with pink jacket and yellow accents, holding multiple phones showing follower counts, ring light halo effect in gold, peace sign pose but eyes are calculating, rainbow viral energy, trendy sneakers",
    "boss_ogre": "1boy, eccentric electronics emperor, white lab coat covered in colorful circuit board patterns with glowing green lines, holographic blue displays projecting from fingertips, wild grey Einstein-like hair, orange goggles pushed up on forehead, surrounded by floating colorful gadgets, manic genius expression",
    "boss_demon_lord": "1boy, ruthless foreign corporation CEO, impeccably tailored charcoal suit with burgundy tie and gold cufflinks, towering imposing figure, arms crossed with platinum watch gleaming, cold calculating green eyes, dark hair slicked back, overwhelming corporate power aura in deep purple",
    "boss_dragon_elder": "1boy, supreme minister of bureaucratic control, dark navy formal government attire with gold medals and red sash across chest, ancient authority emanating from every pore, gold official seal stamp raised like a scepter, grey beard, stern expression, imperial purple and gold aura",
    "boss_shadow_monarch": "1boy, transcendent AI emperor, figure wearing black and purple digital robes with glowing circuit patterns, half of face showing human skin half showing holographic blue data, crown of floating golden code symbols, one eye purple one eye glowing cyan, streams of rainbow data as cape, ultimate digital godhood",
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
                "filename_prefix": f"boss_sprites_v2/{boss_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\boss_sprites_v2", exist_ok=True)

    total = len(BOSS_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} BOSS SPRITES (v2 - color fixed)")
    print("1024x1024 colorful anime style, transparent bg")
    print("=" * 60)

    success = 0
    failed = []

    for i, (boss_id, desc) in enumerate(BOSS_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {boss_id}")
        print(f"  {desc[:70]}...")

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
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\boss_sprites_v2\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
