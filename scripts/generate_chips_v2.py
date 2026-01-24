#!/usr/bin/env python3
"""
Regenerate 7 problematic chip sprites (v2 - fixed text issues)
Only regenerates: speaker, book, eraser, wallet, mirror, drum, magnifyingGlass
Stronger anti-text negative, clearer object-body descriptions.
1024x1024 with transparent background via RMBG-2.0.
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean, simple background, no text, no writing"

NEGATIVE = "dark, gritty, realistic, horror, text, letters, writing, font, alphabet, japanese text, kanji, katakana, hiragana, words, logo, watermark, signature, blurry, low quality, multiple characters, complex background, pokeball, human, humanoid, detailed background"

CHIP_DESCRIPTIONS = {
    "speaker": "a cute chibi speaker robot creature, its entire body IS a round bluetooth speaker with a visible cone grille as its face showing big cute eyes, tiny stubby arms and legs growing from the speaker body, musical notes floating around, vibrating happily, bright blue and white colors",
    "book": "a cute chibi book robot creature, its entire body IS a thick colorful open hardcover book standing upright, the open pages form wings, a red bookmark hangs out like a tongue, tiny stubby legs below the spine, big cute eyes on the cover, floating sparkle letters",
    "eraser": "a cute chibi eraser robot creature, its entire body IS a large white rectangular eraser block, clean smooth surface with pink wrapper band around its middle like a belt, big cute dot eyes on the eraser surface, tiny stubby arms and legs, eraser shavings floating, pristine clean look",
    "wallet": "a cute chibi wallet robot creature, its entire body IS a brown leather bifold wallet standing upright, slightly open showing colorful cards inside, big cute eyes above the fold, tiny stubby arms and legs from the wallet sides, a shiny gold coin floating above its head",
    "mirror": "a cute chibi mirror robot creature, its entire body IS a round ornate hand mirror with golden frame, the reflective glass surface shows big cute sparkly eyes as its face, the handle extends down as a single leg, tiny arms from the frame sides, sparkle effects on glass, pink and gold colors",
    "drum": "a cute chibi drum robot creature, its entire body IS a red traditional taiko drum lying on its side, the white drum skin is its face with big cute eyes, the thick red barrel body is round and stout, two wooden drumstick arms raised ready to play, tiny legs underneath, rhythmic wave effects",
    "magnifyingGlass": "a cute chibi magnifying glass robot creature, its entire body IS a large magnifying glass with thick brown frame, the circular lens is its face showing big curious cute eyes, the brown handle extends down as legs, tiny arms from the frame, wearing a tiny brown detective hat on top",
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
                "filename_prefix": f"chip_robots_v2/{chip_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\chip_robots_v2", exist_ok=True)

    total = len(CHIP_DESCRIPTIONS)
    print("=" * 60)
    print(f"REGENERATING {total} CHIP SPRITES (v2 - text fixed)")
    print("1024x1024 gacha chibi, no text, transparent bg")
    print("=" * 60)

    success = 0
    failed = []

    for i, (chip_id, desc) in enumerate(CHIP_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {chip_id}")
        print(f"  {desc[:70]}...")

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
    print(f"COMPLETE: {success}/{total} chip sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\chip_robots_v2\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
