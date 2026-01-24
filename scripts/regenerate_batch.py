#!/usr/bin/env python3
"""
Regenerate specific enemy sprites that need improvement.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, 1boy, anime character illustration, full body, white background, clean lines, anime game character style, human male, japanese man, realistic human proportions, normal human skin, modern clothing, everyday clothes, vibrant saturated colors, colorful, warm lighting, natural skin tones, game character art, high quality, sharp details"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, alien, robot, monster, creature, fantasy, medieval, armor, sword, magic staff, scepter, RPG character, warrior, knight, wizard, mage, cape, wings, horns, tail, elf ears, pointy ears, green skin, blue skin, unusual skin color, mask, helmet, crown, tiara"

ENEMY_DESCRIPTIONS = {
    "foreignCorpExecutive": "1boy, sophisticated japanese businessman in luxury western suit, charcoal grey tailored suit jacket and pants, crisp white dress shirt, burgundy silk tie, silver watch, holding black leather portfolio, confident powerful stance, neat short black hair with grey temples, sharp intelligent eyes, clean shaven, polished black dress shoes",

    "powerHarassingBoss": "1boy, intimidating japanese office manager, dark navy business suit, white shirt with blue striped tie, pointing finger aggressively, angry furrowed brow, leaning forward in confrontational pose, receding black hair slicked back, reading glasses pushed up on forehead, expensive gold watch, holding crumpled report papers",

    "stockingWorker": "1boy, hardworking japanese retail store stocker, green store apron over plain white t-shirt, brown work gloves, carrying heavy cardboard box of products, determined focused expression, short messy black hair, red price gun holstered on apron, comfortable sneakers, early morning worker energy",

    "sleepingManager": "1boy, exhausted japanese middle manager dozing at work, wrinkled navy blue suit, white shirt with loosened grey tie, head tilted to side sleepily, one eye barely open, messy disheveled black hair, coffee cup in hand tilting dangerously, slouched tired posture, papers scattered",

    "pushySalesperson": "1boy, overeager japanese salesman, shiny light grey suit with bright red tie, leaning forward too close invading space, holding product sample box enthusiastically, wide forced smile showing teeth, gelled black hair, sweat drop on forehead, desperate sales energy, name badge on lapel",

    "confusedApplicant": "1boy, nervous young japanese job seeker at interview, ill-fitting charcoal suit too big for him, crooked yellow tie, clutching blue resume folder tightly to chest, anxious sweating expression, messy uncombed black hair, wide uncertain eyes, fidgeting stance, scuffed dress shoes",

    "complainerCustomer": "1boy, perpetually dissatisfied japanese customer, casual green polo shirt and khaki pants, pointing finger accusingly, deep frown with furrowed brow, holding crumpled receipt in other hand, tapping foot impatiently, short grey hair, reading glasses, demanding irritated posture",
}


def create_workflow(enemy_id, description):
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
                "filename_prefix": f"regen_batch/{enemy_id}"
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
    total = len(ENEMY_DESCRIPTIONS)
    print("=" * 60)
    print(f"REGENERATING {total} ENEMY SPRITES")
    print("=" * 60)

    success = 0
    failed = []

    for i, (enemy_id, desc) in enumerate(ENEMY_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {enemy_id}")
        print(f"  {desc[:70]}...")

        workflow = create_workflow(enemy_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(enemy_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(enemy_id)

        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
