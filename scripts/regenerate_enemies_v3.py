#!/usr/bin/env python3
"""
Third round: fix nightShiftWorker and preciseStationStaff.
Much stronger human anchoring, explicit anti-fantasy/non-human negatives.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = "solo, single character, 1boy, anime character illustration, full body, white background, clean lines, anime game character style, human male, japanese man, realistic human proportions, normal human skin, modern clothing, everyday clothes, vibrant saturated colors, colorful, warm lighting, natural skin tones, game character art, high quality, sharp details"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, alien, robot, monster, creature, fantasy, medieval, armor, sword, magic staff, scepter, RPG character, warrior, knight, wizard, mage, cape, wings, horns, tail, elf ears, pointy ears, green skin, blue skin, unusual skin color, bald, no hair, mask, helmet, crown, tiara"

ENEMIES = {
    "nightShiftWorker": "1boy, tired young japanese convenience store worker on night shift, wearing green polo shirt with white collar and green apron, khaki pants, indoor shoes, visible employee name tag on chest, holding large brown paper coffee cup, heavy dark circles under tired eyes, slightly messy black hair, droopy exhausted expression but standing professionally, fluorescent lighting look",

    "preciseStationStaff": "1boy, professional japanese train station attendant, wearing perfectly pressed dark navy blue uniform jacket with brass buttons and matching navy pants, white dress shirt underneath, navy peaked cap with gold badge, clean white cotton gloves, pointing forward with right hand precisely, silver pocket watch chain visible, neat short black hair, serious focused expression, railway worker",
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
                "filename_prefix": f"regen_enemies_v3/{enemy_id}"
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
    total = len(ENEMIES)
    print("=" * 60)
    print(f"REGENERATING {total} ENEMY SPRITES (v3 - strong human anchoring)")
    print("=" * 60)

    success = 0
    failed = []

    for i, (enemy_id, desc) in enumerate(ENEMIES.items(), 1):
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
