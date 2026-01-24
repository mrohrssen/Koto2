#!/usr/bin/env python3
"""
Generate 11 missing enemy sprites for the renamed civilian enemies.
Same style as generate_enemies_v2.py.
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, 1boy, anime character illustration, full body, white background, clean lines, anime game character style, human male, japanese man, realistic human proportions, normal human skin, modern clothing, everyday clothes, vibrant saturated colors, colorful, warm lighting, natural skin tones, game character art, high quality, sharp details"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, alien, robot, monster, creature, fantasy, medieval, armor, sword, magic staff, scepter, RPG character, warrior, knight, wizard, mage, cape, wings, horns, tail, elf ears, pointy ears, green skin, blue skin, unusual skin color, bald, no hair, mask, helmet, crown, tiara"

ENEMY_DESCRIPTIONS = {
    "sleepyStudent": "1boy, exhausted japanese university student sleepwalking, messy black hair, half-closed drowsy eyes, rumpled white t-shirt and blue jeans, dragging yellow backpack on ground, holding can of energy drink limply, zombie-like shuffling pose, dark circles under eyes, slightly drooling",

    "noisyNeighbor": "1boy, obnoxious japanese neighbor making noise, wearing loud hawaiian shirt and green shorts, holding portable karaoke microphone, headphones around neck blasting music, inconsiderate grin, one hand cupped to mouth shouting, sandals, messy brown hair, apartment keys on lanyard",

    "possessedDogWalker": "1boy, frantic japanese man being dragged by invisible dog, brown casual jacket and khaki pants, arm stretched forward holding red leash taut, panicked wide eyes, windswept black hair, stumbling forward pose, green dog treat bag on belt, sneakers skidding",

    "expressionlessClerk": "1boy, emotionless japanese convenience store clerk, blank thousand-yard stare, green and white konbini uniform polo shirt, beige apron, holding scanner gun mechanically, robotic straight posture, name tag visible, perfectly combed black hair, soulless customer service pose",

    "drunkSalaryman": "1boy, heavily intoxicated japanese businessman, flushed red face, loosened blue tie wrapped around forehead, grey suit jacket half off, swaying unsteady stance, holding green bottle of sake, goofy drunken grin, sweaty disheveled black hair, one shoe missing",

    "strictTeacher": "1boy, stern authoritarian japanese male teacher, brown formal suit with elbow patches, red tie, holding wooden pointer stick menacingly, disapproving scowl behind rectangular glasses, grey-streaked slicked hair, grade book under arm, commanding intimidating stance",

    "powerHarassingBoss": "1boy, aggressive japanese middle manager leaning forward intimidatingly, expensive navy suit with gaudy gold watch, pointing finger accusingly, veins on temple, domineering wide stance, stack of reports in other hand, slicked back black hair, red power tie, corporate bully energy",

    "foreignCorpExecutive": "1boy, cold calculating japanese corporate executive in western style, perfectly tailored charcoal three-piece suit, silver cufflinks, holding tablet showing graphs, emotionless analytical stare, wire-rimmed glasses, immaculate grey hair, standing with arms crossed, premium leather shoes",

    "strictSecurityGuard": "1boy, rigid japanese security guard at attention, dark navy uniform with silver badge and gold buttons, white gloves, holding black baton at side, stern vigilant expression, peaked cap with emblem, military straight posture, walkie-talkie on shoulder, polished black boots",

    "topBureaucrat": "1boy, elusive high-ranking japanese government official, expensive dark grey suit, holding stack of classified manila folders, evasive sideways glance, silver hair perfectly parted, subtle smirk, red government ID badge, fountain pen in breast pocket, polished oxford shoes, bureaucratic superiority",

    "systemExecutive": "1boy, unsettling japanese tech corporation CEO, sleek all-black modern suit with no tie, glowing blue bluetooth earpiece, holding transparent tablet, unnaturally calm expression, silver-white hair, piercing cold eyes, minimalist aesthetic, standing perfectly still, subtle digital glitch effect on edges",
}


def create_workflow(enemy_id, description):
    # Use 1girl for female characters
    style = STYLE
    if enemy_id in []:  # No female characters in this batch
        style = style.replace("1boy", "1girl").replace("male", "female").replace("man", "woman")

    full_prompt = f"{style}, {description}"

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
                "filename_prefix": f"missing_enemies/{enemy_id}"
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
    print(f"GENERATING {total} MISSING ENEMY SPRITES")
    print("1024x1024 colorful anime style with transparent backgrounds")
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
    print(f"COMPLETE: {success}/{total} enemy sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("Output: ComfyUI/output/missing_enemies/")
    print("=" * 60)


if __name__ == "__main__":
    main()
