#!/usr/bin/env python3
"""
Generate 11 special background images for NEO TOKYO: System Liberation
Hub, dungeon, and 9 location-specific combat backgrounds.
1536x1024, bright anime style, no background removal.

Run on Windows PC with ComfyUI at http://127.0.0.1:8188
Output: ComfyUI/output/special_backgrounds/{name}_00001_.png
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "anime illustration, bright colorful cityscape, clean lines, warm sunlight, blue sky with white clouds, slightly futuristic, holographic signs, sleek modern architecture, lush green trees, vibrant saturated colors, no people, game background art, detailed, high quality, anime game environment"

NEGATIVE = "dark, gritty, cyberpunk, neon, rain, night, people, characters, person, text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, pokeballs, poke ball"

SPECIAL_DESCRIPTIONS = {
    "hub": "breathtaking futuristic Tokyo command center hub, sleek holographic control room with panoramic city view through massive windows, floating data displays, comfortable gaming chair setup, players personal base of operations, warm ambient lighting with cool tech accents, anime game main menu environment",
    "dungeon": "mysterious underground Tokyo maintenance tunnel reimagined as anime dungeon, clean industrial pipes with glowing energy lines, emergency lighting creating dramatic shadows, locked doors with holographic seals, sense of hidden depths beneath the city, adventurous atmosphere",
    "loc_residential": "bright cheerful anime residential street, traditional houses with colorful roofs, flower gardens, friendly neighborhood atmosphere, warm sunlight, picket fences with holographic house numbers, peaceful suburban paradise",
    "loc_convenience": "cheerful anime convenience store interior, well-lit clean shelves stocked with colorful products, friendly atmosphere, warm fluorescent lighting, modern register with holographic display, welcoming store environment",
    "loc_school": "bright anime school hallway, clean polished floors, shoe lockers, bulletin boards with student artwork, large windows with sunlight streaming in, cherry blossoms visible outside, warm educational atmosphere",
    "loc_shopping": "vibrant anime shopping mall interior, colorful storefronts, escalators, bright displays, holographic sale signs, cheerful retail environment, open atrium with skylights, warm inviting commercial space",
    "loc_restaurant": "cozy anime japanese restaurant interior, warm wooden counter, appetizing food displays, paper lanterns, traditional decor with modern touches, inviting atmosphere, steam rising from kitchen",
    "loc_station": "bright anime train station platform, clean modern design, departure boards, vending machines, clear blue sky visible above, organized platform markers, pleasant transit environment",
    "loc_office": "modern anime office space, clean desks with plants, large windows showing city view, whiteboard with colorful notes, bright natural lighting, organized professional environment, motivational posters",
    "loc_government": "stately anime government building interior, marble floors, official notices, service windows, organized waiting area, dignified but approachable atmosphere, national flags, official seals",
    "loc_hospital": "clean bright anime hospital corridor, white walls with cheerful artwork, nurse station, medicine cabinet, reassuring atmosphere, warm sunlight from windows, healing environment",
}


def create_workflow(bg_id, description):
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
                "filename_prefix": f"special_backgrounds/{bg_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\special_backgrounds", exist_ok=True)

    total = len(SPECIAL_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} SPECIAL BACKGROUNDS")
    print("1536x1024 bright anime style (hub, dungeon, locations)")
    print("=" * 60)

    success = 0
    failed = []

    for i, (bg_id, desc) in enumerate(SPECIAL_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {bg_id}")
        print(f"  {desc[:60]}...")

        workflow = create_workflow(bg_id, desc)
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

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} special backgrounds generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\special_backgrounds\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
