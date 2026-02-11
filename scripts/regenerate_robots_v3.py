#!/usr/bin/env python3
"""
Round 3: fix last 5 problem robots.
- wood-uncommon: force isolated single character, no scene
- wood-epic: force white/transparent background
- fire-epic: anti-duplicate/thumbnail
- earth-epic: force brown/gold/obsidian earth palette
- water-uncommon: force no circular frame, full body visible
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = "solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean, cute mecha robot, centered composition, single subject only, full body, standing pose"

NEGATIVE = "dark, gritty, realistic, horror, text, title, logo, watermark, username, signature, writing, letters, words, japanese text, kanji, hiragana, katakana, game UI, icon, badge, HUD, frame, border, card frame, ornamental frame, decorative border, thumbnail, small version, duplicate, multiple views, reference sheet, character sheet, turnaround, blurry, low quality, multiple characters, complex background, human, humanoid, pokeball, monochrome, silhouette, picture frame, vignette, circular frame, porthole, ground, grass, floor, scenery, landscape, environment, scene"

ROBOTS = {
    "wood-uncommon": (
        "a cute chibi mushroom-wood mecha robot, single character floating in white space, "
        "thick tree trunk torso with bracket mushroom shoulder pads, mossy green texture, "
        "small vine arms with leaf-shaped hands, acorn-cap helmet on head, "
        "bright green glowing eyes, tiny root-shaped feet, forest fairy robot companion, "
        "isolated character on plain white background"
    ),
    "wood-epic": (
        "a chibi ancient treant mecha robot on white background, "
        "massive gnarled tree trunk body with ornate bark armor plating, "
        "glowing amber sap veins running through the body, thick branch arms with leafy energy blades, "
        "crown of golden autumn leaves, wise ancient glowing eyes, "
        "dramatic swirling leaf storm aura around it, imposing stance, "
        "plain white background behind character"
    ),
    "fire-epic": (
        "a single chibi volcanic dragon mecha robot, one character only, no duplicates, "
        "heavy dark obsidian armor with pulsing bright magma vein cracks, "
        "dragon-horned helmet with internal flame glow, massive gauntlets dripping with lava, "
        "erupting fire jets from back vents, dramatic orange-red inferno aura, imposing battle stance, "
        "molten core reactor in chest glowing white-hot, centered in frame"
    ),
    "earth-epic": (
        "a chibi mountain titan mecha robot, warm brown and dark gold color scheme, "
        "massive body of layered dark brown obsidian and cream marble armor plates, "
        "enormous orange crystal formations growing from shoulders and back, "
        "glowing golden ore veins pulsing through dark brown body, "
        "seismic brown and amber energy crackling around golden fists, "
        "brown diamond-core reactor visible in chest, earthy warm tones, "
        "imposing earthquake stance, earth element brown gold palette"
    ),
    "water-uncommon": (
        "a cute chibi submarine mecha robot, full body visible standing upright, "
        "compact torpedo-shaped blue body, large round porthole window eyes on face, "
        "small periscope antenna on head, propeller tail behind, finned arms, "
        "bubble trail rising from shoulder vents, "
        "coral and barnacle accent decorations on body, deep sea explorer robot, "
        "no frame, no border, no circle around character"
    ),
}


def create_workflow(robot_id, description):
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
                "filename_prefix": f"robot_sprites_v3/{robot_id}"
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
    total = len(ROBOTS)
    print("=" * 60)
    print(f"REGENERATING {total} ROBOT SPRITES (v3 - final fixes)")
    print("=" * 60)

    success = 0
    failed = []

    for i, (robot_id, desc) in enumerate(ROBOTS.items(), 1):
        print(f"\n[{i}/{total}] {robot_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(robot_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(robot_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(robot_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("Output: robot_sprites_v3/ in ComfyUI output on remote machine")
    print("=" * 60)


if __name__ == "__main__":
    main()
