#!/usr/bin/env python3
"""
Regenerate only the problematic images identified in visual review.
- 20 floor backgrounds that came out as aerial/floating views
- 11 enemy sprites that came out as wrong concepts or with backgrounds not removed

Uses same prompts as original scripts but with stronger anti-aerial negatives for backgrounds.
Run on Windows PC with ComfyUI at http://127.0.0.1:8188
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://192.168.1.222:8188"

# ==================== FLOOR BACKGROUNDS ====================

BG_STYLE = "anime illustration, bright colorful cityscape, clean lines, warm sunlight, blue sky with white clouds, slightly futuristic, holographic signs, sleek modern architecture, lush green trees, vibrant saturated colors, no people, game background art, detailed, high quality, anime game environment, street level perspective, ground level view, eye level camera angle"

BG_NEGATIVE = "dark, gritty, cyberpunk, neon, rain, night, people, characters, person, text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, pokeballs, poke ball, aerial view, birds eye view, from above, top down, overhead, satellite view, flying, floating, floating island, floating castle, clouds below, sky castle, bird perspective, drone shot, helicopter view, looking down"

BAD_BACKGROUNDS = {
    "floor1": "breathtaking panorama of Nerima ward, quiet residential Tokyo neighborhood, traditional low-rise houses with modern touches, cherry blossom trees lining a pristine sidewalk, futuristic mailboxes with holographic displays, morning golden light, peaceful suburban anime paradise",
    "floor1_3": "peaceful Nerima canal path, walking trail alongside crystal-clear water, weeping willows with bioluminescent tips, small bridges with modern railings, residential towers in distance, spring afternoon",

    "floor2_1": "Nakano Broadway interior atrium, multi-level shopping floors visible, manga and figure shops with glowing displays, escalators with holographic railings, otaku paradise with futuristic retail technology",
    "floor2_4": "Nakano residential tower district, modern apartment complexes with rooftop gardens, community bulletin boards with holographic postings, bike-share stations, clean organized neighborhood, blue sky",

    "floor3": "stunning Shinjuku skyline viewed from street level, towering glass skyscrapers reflecting sunlight, holographic corporate logos floating between buildings, elevated walkways connecting towers, blue sky with dramatic clouds, overwhelming urban grandeur",
    "floor3_1": "Shinjuku west exit plaza, massive open area with futuristic sculptures, government building in background, holographic wayfinding displays, elevated highways with sleek vehicles, metropolitan scale",
    "floor3_3": "Shinjuku central park area, green oasis surrounded by skyscrapers, holographic art installations floating above pond, modern bridges, nature meeting technology in harmony, peaceful contrast to urban density",
    "floor3_4": "Shinjuku transit hub, massive modern station exterior, flowing crowds replaced by empty clean platforms, departure boards with holographic schedules, impressive architectural glass and steel canopy",

    "floor4_2": "Shibuya stream area, sleek modern development along urban river, glass walkways over water, holographic art on building facades, green terraces on rooftops, contemporary Tokyo architecture",
    "floor4_3": "Shibuya Miyashita park, elevated urban park with futuristic playground, holographic billboards visible from park, skate area with AR obstacles, modern green space surrounded by glass towers, street level view",

    "floor5_1": "Akihabara main street, famous electronics district with futuristic shop facades, holographic product demonstrations in mid-air, arcade entrances with AR effects, pure concentrated pop culture energy",
    "floor5_3": "Akihabara radio center area, dense collection of tiny electronic component shops, holographic price tags floating, vintage meets futuristic, labyrinthine shopping complex, blue and warm mixed lighting",
    "floor5_4": "Akihabara UDX building area, modern architecture contrasting with classic electric town, large open plaza with holographic event displays, convention center aesthetic, impressive modern structure",

    "floor6": "majestic Chiyoda ward, imposing government buildings with neoclassical architecture upgraded with holographic national emblems, wide pristine boulevards, meticulously manicured trees, institutional power and beauty",
    "floor6_1": "Imperial Palace outer gardens from Chiyoda, ancient stone walls meeting futuristic Tokyo skyline, moat with crystal-clear water, perfectly maintained pine trees, bridge with subtle tech railings, timeless beauty",
    "floor6_3": "National Diet Building area, impressive government architecture with subtle holographic security, wide ceremonial approach, cherry trees in bloom, institutional grandeur meeting subtle futurism",

    "floor7": "breathtaking Imperial Palace main gate, ancient traditional architecture with otherworldly holographic barrier, most advanced technology guarding most traditional space, dramatic sky, ultimate fusion of old and new Japan",
    "floor7_3": "Imperial Palace inner courtyard, most restricted area visible for first time, traditional architecture at its finest with ultimate technology hidden within, zen garden with AR elements, peak beauty",
    "floor7_4": "Imperial Palace tower tenshu-dai, stone foundation of ancient tower, holographic reconstruction of original castle tower visible above, historical and futuristic layers overlapping, dramatic clouds",
}

# ==================== ENEMY SPRITES ====================

ENEMY_STYLE = "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game character style, dramatic confident stance, elaborate detailed clothing, vibrant saturated colors, colorful, warm lighting, varied color palette, natural skin tones, game character art, high quality, sharp details"

ENEMY_NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, ornamental frame, decorative border, picture frame, background scenery, fantasy warrior, medieval armor, sword, magic staff, RPG character"

BAD_ENEMIES = {
    "boredCivilServant": "1boy, utterly bored japanese government worker, half-lidded eyes, slouching posture, beige cardigan over white shirt, brown slacks, holding rubber stamp lazily, stack of yellow forms in other hand, dull grey aura",
    "calmPharmacist": "1boy, serene japanese pharmacist, pristine white coat, wire-rimmed glasses, holding blue medicine bottle with practiced precision, gentle knowing smile, green cross emblem, medicinal herbs motif",
    "confusedApplicant": "1boy, bewildered young japanese job applicant, oversized grey ill-fitting suit, clutching blue resume folder nervously, sweat drops, lost expression, yellow tie slightly crooked, first-interview anxiety visible",
    "itSupport": "1boy, exhausted japanese IT worker, white shirt with rolled sleeves, multiple devices on black belt, silver laptop under arm, green-tinted glasses reflecting code, orange energy drink in pocket, tired but capable expression",
    "loudDelinquent": "1boy, rebellious japanese yankii delinquent, modified black school uniform with long white coat, bleached blonde pompadour hair, intimidating slouch, aggressive stance, wooden sword as prop, red rising sun bandana",
    "nightShiftWorker": "1boy, bleary-eyed japanese convenience store night worker, green and white konbini uniform, dark circles under eyes, large brown coffee cup as lifeline, slightly drowsy but professional stance, name tag visible",
    "preciseStationStaff": "1boy, meticulous japanese station staff, perfectly pressed navy uniform with gold trim, pointing precisely at yellow schedule board, white gloves spotless, silver pocket watch, embodiment of punctuality",
    "stockingWorker": "1boy, diligent japanese store stocker, green work apron over white t-shirt, brown gloves, carrying cardboard box of colorful products, red scanning gun on hip, efficient stance, early-morning dedication, sneakers",
    "veteranCashier": "1girl, seasoned japanese cashier, navy store uniform with name badge, hands positioned over invisible register, no-nonsense efficient expression, decades of experience in stance, short grey hair, reading glasses on chain",
    "worriedPatient": "1boy, anxious japanese hospital patient, light blue pajamas, clutching white appointment slip, thermometer in mouth, worried brow, green health insurance card ready, nervous fidgeting, messy brown hair, slippers",
    "boss_dragon_elder": "1boy, ancient powerful elderly japanese man, flowing white beard, golden and red ceremonial robes with dragon embroidery, ornate walking cane that doubles as weapon, piercing wise eyes, overwhelming dignified presence, imperial authority",
}


def create_bg_workflow(bg_id, description):
    full_prompt = f"{BG_STYLE}, {description}"
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
            "inputs": {"text": BG_NEGATIVE, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1536, "height": 1024, "batch_size": 1}
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
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"regen_backgrounds/{bg_id}"
            }
        }
    }
    return workflow


def create_enemy_workflow(enemy_id, description):
    full_prompt = f"{ENEMY_STYLE}, {description}"
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
            "inputs": {"text": ENEMY_NEGATIVE, "clip": ["1", 1]}
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
                "filename_prefix": f"regen_enemies/{enemy_id}"
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
    # ComfyUI creates output dirs automatically from filename_prefix

    total_bg = len(BAD_BACKGROUNDS)
    total_enemy = len(BAD_ENEMIES)
    total = total_bg + total_enemy

    print("=" * 60)
    print(f"REGENERATING {total} PROBLEMATIC IMAGES")
    print(f"  {total_bg} floor backgrounds (aerial/floating fixes)")
    print(f"  {total_enemy} enemy sprites (wrong concept/bg fixes)")
    print("=" * 60)

    success = 0
    failed = []

    # Generate backgrounds
    print("\n--- FLOOR BACKGROUNDS ---")
    for i, (bg_id, desc) in enumerate(BAD_BACKGROUNDS.items(), 1):
        print(f"\n[{i}/{total_bg}] {bg_id}")
        print(f"  {desc[:60]}...")

        workflow = create_bg_workflow(bg_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(bg_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(bg_id)

        time.sleep(1)

    # Generate enemy sprites
    print("\n--- ENEMY SPRITES ---")
    for i, (enemy_id, desc) in enumerate(BAD_ENEMIES.items(), 1):
        print(f"\n[{i}/{total_enemy}] {enemy_id}")
        print(f"  {desc[:70]}...")

        workflow = create_enemy_workflow(enemy_id, desc)
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
    print(f"COMPLETE: {success}/{total} images regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"\nOutput locations:")
    print(f"  Backgrounds: C:\\Users\\michi\\ComfyUI\\output\\regen_backgrounds\\")
    print(f"  Enemies:     C:\\Users\\michi\\ComfyUI\\output\\regen_enemies\\")
    print(f"\nAfter reviewing, copy good results to:")
    print(f"  public/assets/backgrounds/  (rename floorN_00001_.png -> floorN.png)")
    print(f"  public/assets/sprites/enemies/  (rename enemyId_00001_.png -> enemyId.png)")
    print("=" * 60)


if __name__ == "__main__":
    main()
