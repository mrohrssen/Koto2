#!/usr/bin/env python3
"""
Item sprite v6 fix — regenerate 24 items that had framing, cropping, or wrong-object issues.
Stronger negative prompts to prevent UI frames and cropping.
More explicit composition guidance.
"""

import json
import urllib.request
import time
import random
import sys

COMFYUI_URL = "http://10.5.0.2:8188"

STYLE_SUFFIX = (
    "game item icon, clean anime cel-shaded style, centered composition, "
    "white background, single object, soft lighting from top-left, slight drop shadow, "
    "bold clean outlines, vibrant colors, digital illustration, masterpiece quality, "
    "object fills 70 percent of frame, full object visible with padding on all sides"
)

NEGATIVE = (
    "photograph, realistic, blurry, cropped, off-center, multiple objects, text, watermark, "
    "busy background, scene, landscape, person, character, hand, fingers, "
    "dark, horror, monochrome, 3d render, "
    "frame, border, card, UI, window, panel, decorative border, ornamental frame, "
    "cut off, partial, edge cropping, close-up, extreme perspective"
)

# Tweaked descriptions — more explicit about the object and composition
ITEMS = {
    "water": (
        "A single round glass flask filled with glowing cyan blue water, "
        "crystal diamond-shaped stopper on top, small bubbles inside the liquid, "
        "the flask is complete and fully visible"
    ),
    "mountain": (
        "A single triangular stone amulet pendant carved to look like a mountain peak, "
        "grey granite stone with snow-white tip, hanging from a thin cord, "
        "small portable charm not a landscape"
    ),
    "nature": (
        "A small circular wreath made of intertwined green leaves and tiny white flowers, "
        "fresh morning dew droplets on the leaves, gentle green glow, "
        "wreath shape like a donut ring of foliage"
    ),
    "summer": (
        "A single round Japanese uchiwa paper fan with red and orange fireworks pattern printed on it, "
        "thin bamboo handle at the bottom, flat circular fan shape, "
        "traditional Japanese summer festival fan"
    ),
    "spring": (
        "A single small branch with three pink cherry blossom sakura flowers in full bloom, "
        "a few petals gently falling, the branch is short and fully visible, "
        "soft pink and green colors"
    ),
    "tea": (
        "A single Japanese ceramic yunomi teacup sitting on a small saucer, "
        "filled with bright green matcha tea, gentle steam wisps rising, "
        "blue and white ceramic glaze pattern on the cup"
    ),
    "meal": (
        "A single Japanese bento lunch box seen from above at slight angle, "
        "compartments showing rice and colorful food, red lacquered exterior, "
        "compact rectangular box fully visible"
    ),
    "flavor": (
        "A single small ceramic spice jar with a round cork lid on top, "
        "blue and white wave pattern painted on the jar body, "
        "simple and compact ceramic container"
    ),
    "friend": (
        "A single braided friendship bracelet made of red and blue woven threads, "
        "a tiny golden star charm dangling from it, "
        "the bracelet is laid flat in a circular shape"
    ),
    "family": (
        "A single round golden medallion pendant with an engraved tree with deep roots, "
        "the medallion hangs from a red silk cord, "
        "polished gold surface with detailed tree engraving"
    ),
    "parents": (
        "A single Japanese omamori lucky charm bag in purple and gold brocade fabric, "
        "kanji character embroidered on front, decorative tassel hanging from bottom, "
        "small rectangular fabric pouch"
    ),
    "lover": (
        "A single elegant gold ring with a heart-shaped ruby gemstone, "
        "delicate filigree metalwork on the band, the ruby glows softly red, "
        "one ring only sitting upright"
    ),
    "siblings": (
        "Two small curved magatama beads on a single shared cord, "
        "one bead is red and one is blue, they nestle together like yin-yang, "
        "traditional Japanese comma-shaped jade beads"
    ),
    "words": (
        "A single traditional Japanese calligraphy brush fude lying horizontally, "
        "bamboo handle with dark ink-dipped tip, resting on a small grey stone ink rest, "
        "the full brush is visible from end to end"
    ),
    "paper": (
        "A small neat stack of three handmade washi paper sheets, "
        "slightly textured cream colored paper with a tiny pressed flower on the top sheet, "
        "the stack sits flat with soft shadow beneath"
    ),
    "letter": (
        "A single cream-colored envelope sealed with a red wax seal stamp, "
        "the seal has a star pattern pressed into it, "
        "the envelope sits at a slight angle, elegant and simple"
    ),
    "book": (
        "A single leather-bound journal with a brass compass rose emblem on the front cover, "
        "a red bookmark ribbon trailing out from between the pages, "
        "dark brown leather with gold trim on the spine"
    ),
    "riddle": (
        "A single small Japanese wooden puzzle box himitsu-bako, "
        "geometric inlay pattern in contrasting light maple and dark walnut wood, "
        "compact cubic shape with visible sliding panels"
    ),
    "clock": (
        "A single golden pocket watch with the hinged case open showing the clock face, "
        "roman numeral dial, elegant hour and minute hands, "
        "a gold chain attached, antique brass finish"
    ),
    "key": (
        "A single ornate golden skeleton key standing upright, "
        "heart-shaped bow at the top with scrollwork filigree, "
        "intricate teeth at the bottom, faint magical blue glow, one key only"
    ),
    "promise": (
        "A single delicate silver ring with an infinity knot design woven into the band, "
        "a tiny diamond sparkles at the center of the knot, "
        "the ring sits upright on a reflective surface"
    ),
    "map": (
        "A single rolled parchment treasure map partially unrolled, "
        "aged paper with visible coastline drawings and a red X mark, "
        "tied with a brown string, compass rose drawn in the corner"
    ),
    "thing": (
        "A single small ornate wooden treasure chest with brass corner fittings, "
        "a brass keyhole on the front, the chest glows faintly from within, "
        "dark polished wood with metal reinforcements"
    ),
    "present": (
        "A single beautifully wrapped furoshiki gift bundle in red silk fabric, "
        "golden floral pattern printed on the silk, tied in a decorative knot on top, "
        "compact round bundle shape"
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
                "filename_prefix": f"item_sprites_v6_fix/{item_id}"
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
    print(f"ITEM SPRITES v6 FIX — {total} items to regenerate")
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
    print(f"COMPLETE: {success}/{total} sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: item_sprites_v6_fix/ in ComfyUI output directory")
    print("=" * 60)


if __name__ == "__main__":
    main()
