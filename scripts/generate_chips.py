#!/usr/bin/env python3
"""
Generate 20 chip robot sprites for NEO TOKYO: System Liberation
Gacha chibi style - personified objects where the object IS the body with a cute face and tiny limbs.
1024x1024 with transparent background via RMBG-2.0.

Run on Windows PC with ComfyUI at http://127.0.0.1:8188
Output: ComfyUI/output/chip_robots/{chipId}_00001_.png
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean"

NEGATIVE = "dark, gritty, realistic, horror, text, watermark, blurry, low quality, multiple characters, complex background, pokeball, human, humanoid"

CHIP_DESCRIPTIONS = {
    "battery": "a cute chibi battery robot, the body is a bright yellow AA battery cylinder, adorable round eyes on the battery label, tiny stubby arms and legs, sparking electric energy antennae on top, cheerful expression, oversized head-to-body ratio",
    "speaker": "a cute chibi speaker robot, the body is a round speaker box, the speaker cone is its face with big eyes in the center, tiny stubby limbs, musical notes floating around, vibrating with sound energy",
    "glasses": "a cute chibi glasses robot, the body is a pair of round spectacles, the lenses are its big shiny eyes, thin frame arms extended as limbs, scholarly aura, slight sparkle on lenses",
    "lightbulb": "a cute chibi lightbulb robot, the body is a classic incandescent bulb shape, warm glowing filament inside as its heart, screw base as feet, tiny arms, radiating soft golden light, happy bright expression",
    "scissors": "a cute chibi scissors robot, the body is an open pair of scissors, the finger holes are its eyes, blade arms spread wide, tiny legs from the pivot point, shiny metallic blades, playful snipping pose",
    "clock": "a cute chibi clock robot, the body is a round analog clock face, the clock hands form its expression, small numbered face, tiny gear-shaped feet, pendulum tail, ticking happily",
    "charcoal": "a cute chibi charcoal robot, the body is a chunky piece of black binchotan charcoal, rough textured surface, glowing ember-orange cracks, smoldering warmth, tiny dark limbs, smoky aura",
    "book": "a cute chibi book robot, the body is a thick open hardcover book, pages fluttering as wings, bookmark tongue sticking out, tiny stubby legs below the spine, wise expression, floating letters around",
    "eraser": "a cute chibi eraser robot, the body is a white rectangular eraser, clean smooth surface, paper sleeve wrapper as a cape, tiny limbs, eraser shavings floating around it, pristine and tidy",
    "onigiri": "a cute chibi onigiri robot, the body is a triangular rice ball, crispy nori seaweed belt around its middle, grain-textured white rice body, tiny stubby limbs, umeboshi blush cheeks, adorable",
    "wallet": "a cute chibi wallet robot, the body is a folded leather bifold wallet, slightly open showing card slots as teeth in a grin, coin pocket as an eye, tiny leather limbs, gold coin floating above",
    "straw": "a cute chibi straw robot, the body is a long bendy drinking straw, accordion bend section in the middle as its waist, striped colorful pattern, tiny limbs at the bottom, sipping expression",
    "key": "a cute chibi key robot, the body is a golden ornate key shape, the bow top ring is its head with eyes inside, the blade extends down with tooth details as feet, shiny metallic, mysterious aura",
    "egg": "a cute chibi egg robot, the body is a perfect oval egg, smooth cream-white shell with tiny speckles, hairline crack on top like a hat, tiny stubby limbs, warm incubating glow from within",
    "fireworks": "a cute chibi fireworks robot, the body is a firework rocket tube, red and gold wrapping, sparking lit fuse on top as hair, tiny limbs, colorful sparkle trails, excited explosive expression",
    "mirror": "a cute chibi mirror robot, the body is a round handheld mirror, reflective glass surface as its face, ornate frame border, handle as a single leg, tiny arms from frame sides, sparkly reflections",
    "feather": "a cute chibi feather robot, the body is a fluffy white feather shape, soft downy texture, delicate barbs as flowing hair, tiny limbs at the quill base, floating gently, ethereal light glow",
    "drum": "a cute chibi drum robot, the body is a traditional taiko drum on its side, drum skin face with bold expression, thick barrel body, two drumstick arms raised ready to strike, rhythmic aura waves",
    "magnifyingGlass": "a cute chibi magnifying glass robot, the body is a large circular lens, everything seen through it appears bigger, thick frame as its face, handle as a single leg, detective hat on top, curious expression",
    "toolbox": "a cute chibi toolbox robot, the body is a red metal toolbox, hinged lid slightly open showing tools inside, handle on top like a mohawk, tiny sturdy legs, industrious expression, wrench and screwdriver peeking out",
}


def create_workflow(chip_id, description):
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
                "filename_prefix": f"chip_robots/{chip_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\chip_robots", exist_ok=True)

    total = len(CHIP_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} CHIP ROBOT SPRITES")
    print("1024x1024 gacha chibi style with transparent backgrounds")
    print("=" * 60)

    success = 0
    failed = []

    for i, (chip_id, desc) in enumerate(CHIP_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {chip_id}")
        print(f"  {desc[:60]}...")

        workflow = create_workflow(chip_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(chip_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(chip_id)

        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} chip robots generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\chip_robots\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
