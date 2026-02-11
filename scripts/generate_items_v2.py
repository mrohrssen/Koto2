#!/usr/bin/env python3
"""
Regenerate failed item sprites (v2 - fixed framing issues).
The v1 style prompt caused card-frame/border artifacts.
Fix: stronger "isolated floating object" prompt, anti-frame negatives.
512x512 with transparent background via RMBG-2.0.

Run from Mac with ComfyUI already running on 192.168.1.222:8188.
Output: item_sprites_v2/ folder in ComfyUI output on the remote machine.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = (
    "solo object, isolated floating object, centered, anime illustration style, "
    "simple clean white background, soft cel shading, no border, no frame, "
    "high quality, detailed object, digital painting"
)

NEGATIVE = (
    "frame, border, card, UI, game card, card frame, ornate border, decorative frame, "
    "panel, window, grid, pattern background, "
    "dark, gritty, realistic, horror, text, letters, writing, words, font, logo, "
    "watermark, signature, blurry, low quality, multiple objects, complex background, "
    "human, person, character, chibi, robot, mecha, photo, 3d render, monochrome"
)

# Rewritten prompts: each describes ONE clear physical object, centered, floating.
# Abstract concepts get a single concrete symbolic object.
ITEM_DESCRIPTIONS = {
    # ===== Enchanted Wilderness =====
    "mountain": (
        "a single small snow-capped mountain peak miniature, rocky grey stone base "
        "with white snow on top, tiny green trees on slopes, floating in space"
    ),
    "sky": (
        "a single round glass snow globe containing blue sky and white fluffy clouds inside, "
        "clear glass sphere, simple brass base, floating"
    ),
    "nature": (
        "a single circular wreath made of green leaves and small pink wildflowers, "
        "complete ring shape, morning dew drops, centered floating"
    ),
    "sea": (
        "a single large beautiful spiral seashell, iridescent pink and blue pearl sheen, "
        "ocean conch shell, smooth polished surface, floating"
    ),
    "summer": (
        "a single bright sunflower bloom, large golden yellow petals radiating outward, "
        "brown center, green stem, warm cheerful, floating centered"
    ),
    "smell": (
        "a single burning incense stick in a small round stone holder, "
        "thin purple smoke wisps curling upward, zen minimal, floating"
    ),
    "spring": (
        "a single cherry blossom branch forming a small bouquet, soft pink sakura flowers, "
        "brown twig, a few falling petals, floating centered"
    ),
    "winter": (
        "a single large detailed ice snowflake crystal, pale blue translucent ice, "
        "hexagonal symmetry, tiny frost sparkles, floating on transparent background"
    ),
    "autumn": (
        "a single large Japanese maple leaf, vivid red to golden orange gradient, "
        "detailed veins, slightly curled edges, floating centered"
    ),
    "time": (
        "a single ornate golden pocket watch, open cover showing clock face, "
        "roman numerals, delicate gold chain dangling, antique brass finish, floating"
    ),

    # ===== School District =====
    "words": (
        "a single Japanese calligraphy brush standing upright with black ink dripping from tip, "
        "bamboo handle, wet ink droplet falling, floating centered"
    ),
    "photograph": (
        "a single polaroid instant photo with white border frame, "
        "the photo shows a colorful sunset sky, slightly tilted angle, floating"
    ),
    "senior": (
        "a single golden star medal on a short red ribbon, "
        "polished gold five-pointed star, shiny metallic surface, floating centered"
    ),
    "paper": (
        "a single sheet of cream-colored Japanese washi paper, slightly curled edges, "
        "visible handmade fiber texture, a small red ink brushstroke on it, floating"
    ),
    "music": (
        "a single treble clef music note symbol made of crystal glass, "
        "transparent with rainbow light refraction, musical, sparkling, floating centered"
    ),

    # ===== Market District =====
    "money": (
        "a single small purple velvet coin pouch bag with gold drawstring, "
        "a few shiny gold coins spilling out of the open top, floating"
    ),
    "cooking": (
        "a single steaming clay pot with wooden lid slightly open, "
        "warm orange-brown ceramic, delicious steam rising, ladle handle visible, floating"
    ),
    "meal": (
        "a single Japanese bento lunch box seen from above, open lid showing "
        "colorful compartments with rice and side dishes, red lacquer box, floating"
    ),
    "tea": (
        "a single small Japanese ceramic teacup filled with green matcha tea, "
        "simple white cup with blue pattern, steam wisps rising, floating centered"
    ),

    # ===== Family Village =====
    "feeling": (
        "a single glowing pink crystal heart gemstone, translucent rose quartz, "
        "soft warm inner light, faceted surfaces, floating centered"
    ),
    "family": (
        "a single miniature wooden house ornament, cozy cottage with tiny chimney, "
        "warm orange light glowing from windows, red roof, floating"
    ),
    "friend": (
        "two colorful woven friendship bracelets crossed together, "
        "braided threads in blue and orange with small star charms, floating centered"
    ),
    "ally": (
        "a single round wooden buckler shield with a golden handshake emblem in center, "
        "oak wood grain texture, iron rim edge, floating"
    ),
    "parents": (
        "a pair of matching silver wedding rings resting together, "
        "simple elegant bands with tiny diamond sparkle, soft warm glow between them, floating"
    ),
    "lover": (
        "a single red rose flower in full bloom, rich velvety crimson petals, "
        "green stem with one leaf, a dewdrop on a petal, floating centered"
    ),
    "siblings": (
        "two small origami paper cranes side by side, one blue one red, "
        "delicate folded paper birds, simple and cute, floating centered"
    ),

    # ===== Crossroads Inn =====
    "name": (
        "a single red Japanese hanko stamp seal, cylindrical carved wood stamp "
        "with red ink circle impression below it, traditional, floating centered"
    ),
    "book": (
        "a single thick closed hardcover book, deep navy blue cover with gold spine lettering, "
        "red ribbon bookmark peeking out from pages, floating"
    ),
    "thing": (
        "a single colorful gift box wrapped in rainbow striped paper, "
        "large sparkly golden ribbon bow on top, mysterious and fun, floating centered"
    ),
    "clothes": (
        "a single neatly folded Japanese kimono, deep indigo blue fabric "
        "with white wave patterns, golden obi sash on top, floating centered"
    ),
    "key": (
        "a single ornate golden skeleton key, scrollwork handle with heart shape, "
        "antique brass metal, simple and elegant, floating centered"
    ),
    "riddle": (
        "a single Japanese wooden puzzle box, dark polished wood with geometric inlay, "
        "small compact cube shape, faint golden glow from seams, floating centered"
    ),
    "travel": (
        "a single worn leather-bound travel journal, brown leather cover "
        "with brass compass rose stamped on front, strap closure, floating centered"
    ),
    "map": (
        "a single rolled-up treasure map on aged yellowed parchment, "
        "partially unrolled showing ink pathways and a red X mark, floating centered"
    ),
    "tool": (
        "a single silver wrench tool crossed with a small hammer, "
        "shiny chrome metal, forming an X shape, practical and sturdy, floating centered"
    ),
    "present": (
        "a single luxurious gift box, shimmering gold wrapping paper, "
        "large red satin ribbon bow on top, magical sparkles rising from it, floating centered"
    ),
}


def create_workflow(item_id, description):
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
            "inputs": {"width": 512, "height": 512, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 20,
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
                "filename_prefix": f"item_sprites_v2/{item_id}"
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
    total = len(ITEM_DESCRIPTIONS)
    print("=" * 60)
    print(f"REGENERATING {total} ITEM SPRITES (v2 - no frames)")
    print("512x512 anime items, isolated floating objects")
    print(f"ComfyUI: {COMFYUI_URL}")
    print("=" * 60)

    success = 0
    failed = []

    for i, (item_id, desc) in enumerate(ITEM_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {item_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(item_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} item sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("Output: item_sprites_v2/ in ComfyUI output on remote machine")
    print("=" * 60)


if __name__ == "__main__":
    main()
