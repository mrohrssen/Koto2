#!/usr/bin/env python3
"""
Item sprite v6 — miHoYo-style game item icons.
Uses concrete object mappings from docs/plans/2026-02-11-item-sprite-generation-guide.md.
Each item is a specific physical object, prompted with consistent style anchoring.

512x512 with transparent background via RMBG-2.0.
Run from Mac with ComfyUI running on 10.5.0.2:8188.
Output: item_sprites_v6/ folder in ComfyUI output on the remote machine.
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
    "bold clean outlines, vibrant colors, digital illustration, masterpiece quality"
)

NEGATIVE = (
    "photograph, realistic, blurry, cropped, off-center, multiple objects, text, watermark, "
    "busy background, scene, landscape, person, character, hand, fingers, "
    "dark, horror, monochrome, 3d render, frame, border, card"
)

# Every description from the generation guide — concrete physical objects
ITEMS = {
    # === Nature & Seasons ===
    "water": "A round glass flask filled with glowing blue water, crystal stopper on top, small bubbles inside",
    "mountain": "A triangular stone amulet carved to look like a mountain peak, grey granite with snow-white tip",
    "sky": "A translucent glass orb containing swirling white clouds against blue sky inside",
    "nature": "A small circular wreath of green leaves and tiny white flowers, woven together",
    "sea": "A large spiral conch shell with iridescent pink and blue interior, polished surface",
    "summer": "A round Japanese uchiwa fan with a red and orange fireworks pattern, bamboo handle",
    "spring": "A small branch with pink cherry blossoms in full bloom, three flowers, a few falling petals",
    "autumn": "A golden brooch in the shape of a maple leaf, enameled in red and orange gradient",
    "winter": "A hexagonal ice crystal ornament, pale blue and white, glittering with frost",

    # === Food & Drink ===
    "cooking": "A small black cast iron pot with lid slightly ajar, steam rising, wooden ladle resting on top",
    "meal": "A Japanese bento box with compartments visible, rice, tamagoyaki, and vegetables, lacquered red exterior",
    "flavor": "A small ceramic spice jar with a cork lid, decorative wave pattern in blue and white",
    "tea": "A Japanese ceramic yunomi teacup filled with green tea, steam wisps rising, blue glaze pattern",
    "rice": "A white ceramic rice bowl heaped with steaming white rice, pair of red chopsticks resting on top",
    "sake": "A ceramic sake tokkuri bottle with matching ochoko cup, blue wave pattern on white ceramic",
    "medicine": "A small glass apothecary bottle with green glowing liquid inside, cork stopper, ornate label",

    # === People & Relationships ===
    "friend": "A braided friendship bracelet with red and blue threads, a small golden star charm dangling from it",
    "ally": "A small round bronze shield badge with a crossed-swords emblem, polished with a green gem center",
    "family": "A round golden medallion with an engraved family crest of a tree with deep roots, hung on a red cord",
    "parents": "A Japanese omamori charm bag in purple and gold brocade fabric, kanji embroidered, tassel at bottom",
    "lover": "A single elegant ring with a heart-shaped ruby set in gold, delicate filigree band",
    "siblings": "Two small magatama beads on a shared cord, one red and one blue, nestled together",
    "senior": "A small rolled-up scroll tied with a golden ribbon, wax seal with a crane emblem",

    # === Knowledge & Communication ===
    "words": "A traditional Japanese calligraphy brush fude with bamboo handle, ink-dipped tip, resting on a small stone rest",
    "paper": "A neat stack of handmade washi paper sheets, slightly textured, with a pressed flower visible on top sheet",
    "letter": "A cream-colored envelope sealed with a red wax seal stamped with a star pattern",
    "story": "A thick ornate book with a golden cover, jeweled clasp, celestial star pattern embossed on front",
    "book": "A leather-bound journal with a brass compass rose on the cover, bookmark ribbon trailing out",
    "name": "A cylindrical Japanese hanko stamp carved from red stone, character visible on the bottom face",
    "music": "A small ornate music box with an open lid revealing a tiny spinning ballerina mechanism, golden trim",
    "riddle": "A small wooden puzzle box himitsu-bako with geometric inlay patterns in light and dark wood",

    # === Abstract Concepts (as Objects) ===
    "time": "A brass hourglass with blue sand flowing, ornate metal frame with gear decorations",
    "clock": "A golden pocket watch with the case open, roman numerals on the face, attached chain",
    "feeling": "A faceted heart-shaped crystal that shifts from pink at the top to blue at the bottom, inner glow",
    "heart": "A golden heart-shaped locket pendant, slightly open to reveal a tiny glowing light inside",
    "promise": "A delicate silver ring with an infinity knot design, small diamond at the center of the knot",
    "photograph": "A polaroid-style instant photograph with a white border, the image shows a sunset landscape",

    # === Travel & Tools ===
    "travel": "A brass pocket compass with a flip-open lid, compass rose visible on the face, leather strap",
    "map": "A rolled parchment map with visible coastlines and a red X mark, tied with a brown string",
    "tool": "A compact folding multi-tool with brass and wood handles, several blades partially visible",
    "key": "A single ornate golden key with a heart-shaped bow top, intricate teeth, slight magical glow",
    "clothes": "A folded silk obi sash in deep blue with gold crane embroidery, neatly tied",
    "thing": "A small ornate wooden chest with brass corners and a keyhole, slightly glowing from within",
    "present": "A beautifully wrapped furoshiki bundle in red silk with golden pattern, tied in a decorative knot on top",

    # === Misc ===
    "smell": "A small ceramic incense holder shaped like a lotus, a single incense stick with a wisp of smoke",
    "money": "A single oval Japanese koban gold coin with stamped characters, gleaming surface",
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
                "filename_prefix": f"item_sprites_v6/{item_id}"
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
    # Allow filtering: python generate_items_v6.py water mountain sky
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    items = {k: v for k, v in ITEMS.items() if only is None or k in only} if only else ITEMS

    total = len(items)
    print("=" * 60)
    print(f"ITEM SPRITES v6 — miHoYo style ({total} items)")
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
                print(f"  ✓ done")
                success += 1
            else:
                print(f"  ✗ FAILED")
                failed.append(item_id)
        else:
            print(f"  ✗ QUEUE ERROR")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: item_sprites_v6/ in ComfyUI output directory")
    print("=" * 60)


if __name__ == "__main__":
    main()
