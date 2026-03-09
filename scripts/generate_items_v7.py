#!/usr/bin/env python3
"""
Item sprite v7 — 16 stubborn items that keep getting UI frames/cards.

Key changes from v6/v6_fix:
- Replaced "game item icon" with "anime object illustration" to avoid UI priming
- Added "isometric three-quarter view" to force volumetric rendering
- Rewrote descriptions: solid volumetric objects, no surface graphics, no niche terms
- Expanded negative prompt to block card/trading card/UI associations
"""

import json
import urllib.request
import time
import random
import sys

COMFYUI_URL = "http://10.5.0.2:8188"

STYLE_SUFFIX = (
    "anime object illustration, clean cel-shaded style, centered on white background, "
    "single standalone object, isometric three-quarter view from slightly above, "
    "soft diffuse lighting, bold outlines, vibrant saturated colors, "
    "digital painting, detailed, high quality, "
    "the object is complete and fully visible with empty space around it"
)

NEGATIVE = (
    "photograph, realistic, blurry, text, watermark, signature, "
    "frame, border, card, UI, HUD, menu, window, panel, overlay, badge, stamp, "
    "game screenshot, card game, trading card, playing card, tarot, "
    "icon set, app icon, logo, emblem, crest, "
    "multiple objects, busy background, scene, landscape, environment, "
    "person, character, hand, fingers, face, "
    "dark, horror, monochrome, low quality, worst quality, "
    "cropped, cut off, partial, off-screen, close-up"
)

ITEMS = {
    "water": (
        "A single round glass potion bottle filled with glowing blue liquid, "
        "crystal stopper on top, the bottle is short and round like a perfume bottle, "
        "condensation droplets on the glass surface, soft blue glow from the liquid inside"
    ),
    "key": (
        "A single large antique brass key lying flat, "
        "simple round loop handle at the top, long straight shaft, "
        "three square teeth at the bottom, aged green patina on the metal"
    ),
    "friend": (
        "A single round golden locket pendant on a short chain, "
        "the locket has a tiny heart engraved on the front, "
        "polished gold surface with warm glow, compact and precious"
    ),
    "family": (
        "A single round golden medallion on a red silk cord, "
        "the medallion has a raised tree relief carved into the surface, "
        "thick and heavy coin-like disc, polished warm gold"
    ),
    "nature": (
        "A single small potted plant in a round ceramic pot, "
        "lush green leaves and tiny white flowers growing from rich soil, "
        "the terracotta pot has a simple leaf pattern, compact and cute"
    ),
    "summer": (
        "A single round Japanese paper fan uchiwa lying flat, "
        "bright red and orange with a simple firework burst painted on it, "
        "thin bamboo handle, the fan is circular and complete"
    ),
    "spring": (
        "A single round glass snow globe on a wooden base, "
        "inside is a tiny pink cherry blossom tree with petals floating, "
        "the glass dome is crystal clear, compact decorative ornament"
    ),
    "lover": (
        "A single elegant gold ring standing upright, "
        "a heart-shaped red ruby gemstone set on top, "
        "delicate filigree scrollwork on the band, warm golden glow"
    ),
    "siblings": (
        "A single round jade pendant disc with a yin-yang design, "
        "one half is red and one half is blue, "
        "hung on a braided cord, smooth polished stone surface"
    ),
    "words": (
        "A single Japanese calligraphy brush lying on a small stone rest, "
        "bamboo handle with dark bristle tip dipped in black ink, "
        "the full brush is visible from end to end, ink droplet on the rest"
    ),
    "paper": (
        "A single thick paper scroll rolled up tightly, "
        "cream-colored textured handmade paper, "
        "tied shut with a thin red silk ribbon in a bow"
    ),
    "letter": (
        "A single thick cream-colored paper envelope, "
        "sealed with a round red wax seal on the flap, "
        "the envelope is puffy as if stuffed with a letter inside, slightly tilted"
    ),
    "book": (
        "A single thick leather-bound book with gold-edged pages, "
        "dark brown leather cover with brass corner protectors, "
        "a red ribbon bookmark hanging out from between the pages, closed and upright"
    ),
    "riddle": (
        "A single small dark wooden cube box with brass hinges, "
        "polished walnut wood with a brass latch on the front, "
        "mysterious faint golden glow leaking from the seams"
    ),
    "clock": (
        "A single closed golden pocket watch with a chain draped below, "
        "ornate floral engraving on the round case, "
        "polished gold surface, the watch is thick and substantial"
    ),
    "map": (
        "A single rolled-up old parchment scroll, "
        "aged yellowed paper tightly rolled, "
        "tied shut with brown twine, a red wax seal holding it closed"
    ),
}


def create_workflow(item_id, description):
    full_prompt = f"{description}, {STYLE_SUFFIX}"
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
            "inputs": {"width": 512, "height": 512, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 25,
                "cfg": 7.0,
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
                "process_res": 512,
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
                "filename_prefix": f"item_sprites_v7/{item_id}"
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
                        print(f"  Error: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except:
            pass
        time.sleep(3)
    return False


def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    items = {k: v for k, v in ITEMS.items() if only is None or k in only} if only else ITEMS

    total = len(items)
    print("=" * 60)
    print(f"ITEM SPRITES v7 — volumetric fix ({total} items)")
    print(f"ComfyUI: {COMFYUI_URL}")
    print("=" * 60)

    success = 0
    failed = []

    for i, (item_id, desc) in enumerate(items.items(), 1):
        print(f"\n[{i}/{total}] {item_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  done")
                success += 1
            else:
                print(f"  FAILED")
                failed.append(item_id)
        else:
            print(f"  QUEUE ERROR")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: item_sprites_v7/ in ComfyUI output directory")
    print("=" * 60)


if __name__ == "__main__":
    main()
