#!/usr/bin/env python3
"""
Retry creature sprite generation with custom per-creature prompts.
Fixes: text artifacts, duplicate characters, too-small subjects, platforms/stands.
"""

import json
import os
import random
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CREATURES_FILE = os.path.join(PROJECT_ROOT, "data", "creatures.json")
SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
COMFYUI_URL = "http://192.168.1.222:8188"

# Much stronger base style — emphasize single character, large, centered
STYLE = (
    "solo, ONE single chibi character only, cute monster creature, gacha game art style, "
    "mobile game character icon, white background, bright vivid colors, "
    "high quality, clean lineart, centered composition, single subject only, "
    "full body, standing pose, collectible creature design, "
    "large character filling the frame, close-up view"
)

# MUCH stronger negative prompt — aggressively anti-text and anti-duplicate
NEGATIVE = (
    "text, title, logo, watermark, username, signature, writing, letters, words, "
    "japanese text, kanji, hiragana, katakana, alphabet, numbers, font, caption, "
    "speech bubble, dialogue box, name plate, label, subtitle, credit, "
    "game UI, icon, badge, HUD, frame, border, card frame, ornamental frame, "
    "decorative border, thumbnail, small version, "
    "duplicate, multiple copies, two characters, multiple characters, "
    "reference sheet, character sheet, turnaround, model sheet, "
    "size comparison, evolution chart, "
    "blurry, low quality, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette, picture frame, vignette, circular frame, "
    "ground, grass, floor, scenery, landscape, environment, scene, "
    "pedestal, stand, platform, base, disc, coin, stage, podium, "
    "dark, gritty, realistic, horror"
)

RARITY_BOOST = {
    "common": "simple design, small, round, cute, friendly",
    "uncommon": "slightly detailed, small accent features, charming",
    "rare": "noticeable glow effects, more complex design, elegant",
    "epic": "dramatic aura, ornate details, imposing presence, glowing energy",
    "legendary": "mythical aura, godlike radiance, maximum ornate detail, prismatic glow, majestic",
}

# Custom prompt OVERRIDES for stubborn creatures
# Each gets a hand-crafted prompt that avoids triggering the model's bad habits
CUSTOM_PROMPTS = {
    "trottar": (
        "ONE single cute chibi horse creature, fluffy bouncy mane, small rounded pony body, "
        "stubby legs, cheerful prancing pose, earthy brown and tan colors, "
        "bright eyes, adorable, gacha game art style, white background, centered, "
        "simple design, small accent features, charming"
    ),
    "rooten": (
        "ONE single round earthy creature, tangled root tentacles growing from body, "
        "cheerful face peeking out, small sparkling gems embedded in brown earthy body, "
        "underground plant monster, cute chibi style, gacha game art, white background, "
        "centered, dramatic aura, ornate details, glowing energy"
    ),
    "sachel": (
        "ONE single small cute creature carrying oversized backpack, "
        "round spectacles on nose, tiny pencil behind ear, eager scholar creature, "
        "green and brown colors, chibi monster design, gacha game art, "
        "white background, centered, simple round cute friendly design"
    ),
    "tablette": (
        "ONE single chibi turtle-like creature with a perfectly flat shiny top shell, "
        "four short sturdy legs, wide low body, cute happy face at the front, "
        "polished metallic silver flat back that reflects light, "
        "brown and silver colors, sturdy and compact, "
        "gacha game art style, white background, centered, "
        "simple design, cute, large character filling the frame"
    ),
    "glitchi": (
        "ONE single cute glitchy creature with a round body that flickers, "
        "TV screen face showing pixel expression with glitch lines, "
        "colorful pixel particles floating around it, neon pink cyan yellow, "
        "short stubby arms and legs, digital static aura, "
        "chibi digital monster, gacha game art, white background, centered, "
        "slightly detailed, charming, cute round body"
    ),
    "scribbit": (
        "ONE single round ink blob creature, shiny black liquid body, "
        "big cute white eyes on its dark inky face, small paintbrush tail, "
        "dripping ink drops from round body, simple blobby shape, "
        "dark blue and black glossy liquid colors, "
        "chibi slime monster made of paint, gacha game art, "
        "white background, centered, noticeable glow effects, elegant, "
        "large character filling the frame"
    ),
    "shelvyn": (
        "ONE single creature that IS a walking bookshelf, tall rectangular wooden body, "
        "rows of tiny colorful books visible across its torso like shelves, "
        "cute face at the top with book-page eyebrows, two stubby wooden legs, "
        "a book balanced on its head, warm brown wood grain texture, "
        "chibi furniture creature, gacha game art, white background, centered, "
        "dramatic aura, ornate details, large character filling the frame"
    ),
    "grinnix": (
        "ONE single irresistibly happy creature with ENORMOUS warm smile, "
        "huge grinning mouth, rosy glowing cheeks, squinting happy eyes, "
        "round green body radiating joy, soft glow around cheeks, "
        "chibi monster, gacha game art, white background, centered, "
        "slightly detailed, charming, bright warm colors"
    ),
    "sketchi": (
        "ONE single flat papery creature made of watercolor paint, "
        "translucent body with visible paint strokes and splashes, "
        "crayon-drawn outlines, colorful paint drips, artistic creature, "
        "small sketches visible on its flat body surface, "
        "chibi art monster, gacha game art, white background, centered, "
        "slightly detailed, charming"
    ),
    "melodia": (
        "ONE single large musical note shaped creature filling the frame, "
        "body shaped like a whole note or treble clef, blue-green color, "
        "floating musical notes around it, cute singing face, "
        "graceful flowing form, tiny arms waving like conducting, "
        "chibi music monster, gacha game art, white background, centered, "
        "noticeable glow effects, elegant, large character"
    ),
    "peekyx": (
        "ONE single floating eyeball creature with ONE large central eye, "
        "pink body, iris that shifts rainbow colors, tiny floating eye orbs around it, "
        "eyelash details, cute curious expression, "
        "chibi eye monster, gacha game art, white background, centered, "
        "slightly detailed, charming"
    ),
    "reelyx": (
        "ONE single boxy projector creature, film reels spinning on top as ears, "
        "lens eye that glows, boxy metallic body, warm orange and brown colors, "
        "vintage cinema projector monster, cute chibi style, "
        "gacha game art, white background, centered, "
        "noticeable glow effects, elegant"
    ),
    "gilden": (
        "ONE single chibi golden creature, small cute round body made of gleaming gold, "
        "nugget-shaped paws, crown of gold crystals on head, "
        "regal but friendly big eyes, brilliant metallic golden shine, "
        "short stubby limbs, round body, chibi proportions, "
        "gacha game art, white background, centered, "
        "mythical aura, godlike radiance, ornate detail, prismatic glow, majestic, "
        "NOT a dragon, round cute body"
    ),
    # --- Borderlines that need to be GREAT ---
    "timbark": (
        "ONE single round brown creature with bark-textured skin, "
        "chunky round body like a ball of wood, two leafy sprouts on head, "
        "cute face with big happy eyes, stubby short legs, "
        "brown and green coloring, moss patches on cheeks, "
        "chibi monster, gacha game art, white background, centered, "
        "simple design, round, cute, large character filling the frame"
    ),
    "ripplash": (
        "ONE single sleek water serpent creature, flowing like a living river, "
        "playful fish face with water fins, spiraling water tail, "
        "translucent blue body with flowing water effects, "
        "chibi sea serpent, gacha game art, white background, centered, "
        "simple design, cute"
    ),
    "groval": (
        "ONE single small mossy creature with tiny trees and mushrooms growing on back, "
        "woodland flowers peeking from leafy green body, cute round face, "
        "waddling pose, forest green and brown colors, "
        "chibi moss monster, gacha game art, white background, centered, "
        "simple design, round, cute, friendly"
    ),
    "cumulon": (
        "ONE single fluffy cloud creature made entirely of soft white cloud fluff, "
        "sleepy content expression with closed happy eyes, floating in air, "
        "tiny raindrops falling from underneath, pillowy round shape, "
        "chibi cloud monster, gacha game art, white background, centered, "
        "noticeable glow effects, elegant, soft pastel colors"
    ),
    "solarie": (
        "ONE single radiant solar creature, wreathed in warm GOLDEN yellow light, "
        "flowing mane like dancing sunbeams, golden and orange colors, "
        "small solar flare orbs orbiting around it, majestic warm glow, "
        "chibi sun creature, gacha game art, white background, centered, "
        "mythical aura, godlike radiance, prismatic glow, majestic"
    ),
    "statik": (
        "ONE single chibi robot with a monitor screen for a head, "
        "glowing pixel smiley face displayed on the screen, "
        "small boxy gray metal body with antenna on top, "
        "stubby arms and legs, electric sparks around body, "
        "teal and silver colors, cute retro robot, "
        "gacha game art, white background, centered, "
        "noticeable glow effects, large character filling the frame"
    ),
    "formling": (
        "ONE single colorful chibi creature made of rainbow-swirled clay, "
        "round squishy body with marbled pink blue and yellow clay colors, "
        "big sparkly curious eyes, small stubby clay arms and legs, "
        "visible fingerprint texture on smooth glossy surface, "
        "tiny clay stars and shapes stuck to its body as decoration, "
        "gacha game art, white background, centered, "
        "simple design, round, cute, large character filling the frame"
    ),
    "moodlet": (
        "ONE single round pink slime creature with a big cheerful smile, "
        "glossy bubblegum pink jelly body, two dot eyes and wide happy mouth, "
        "tiny stubby arms, rosy blush cheeks, small heart floating above head, "
        "translucent shiny surface like candy, simple round blob shape, "
        "gacha game art, white background, centered, "
        "simple design, round, cute, large character filling the frame"
    ),
    "sizzlit": (
        "ONE single grilled meat creature with stubby legs, "
        "the creature IS the meat — sizzling steak body with grill marks, "
        "juicy friendly face on the meat surface, steam rising, "
        "brown and red seared colors, chibi food monster, "
        "gacha game art, white background, centered, simple design, cute"
    ),
    "spindel": (
        "ONE single graceful silk spider creature, delicate thread limbs, "
        "spindle-shaped body, weaving intricate web patterns, "
        "elegant gold and white silk coloring, cute big eyes, "
        "chibi spider creature, gacha game art, white background, centered, "
        "noticeable glow effects, elegant"
    ),
    "orblix": (
        "ONE single perfectly spherical creature with swirling mystical patterns, "
        "hovering in air, cosmic blue and purple colors, pulsing energy rings, "
        "two large curious eyes on the sphere surface, "
        "chibi orb monster, gacha game art, white background, centered, "
        "dramatic aura, ornate details, glowing energy, large character"
    ),
    "kaleidon": (
        "ONE single chibi crystal creature with a round faceted gem body, "
        "cute big eyes on its crystalline face, rainbow prismatic colors "
        "shifting across its gem-like surface, short crystal limbs, "
        "dazzling light refractions, kaleidoscope pattern on belly, "
        "chibi gem monster, gacha game art, white background, centered, "
        "dramatic aura, ornate details, glowing energy, cute face required"
    ),
    "breezle": (
        "ONE single wispy air current creature, nearly transparent body, "
        "swirling wind trails forming its shape, cheerful face outlined by "
        "tiny sparkle dust particles, soft blue and white breezy colors, "
        "chibi wind spirit, gacha game art, white background, centered, "
        "simple design, cute"
    ),
}


def load_creatures():
    with open(CREATURES_FILE) as f:
        return json.load(f)


def create_workflow(creature_id, prompt, negative=NEGATIVE):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["1", 1]}
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
                "filename_prefix": f"creature_sprites/{creature_id}"
            }
        }
    }


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
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_and_save(prompt_id, creature_id):
    try:
        from PIL import Image
    except ImportError:
        print("  ERROR: Pillow not installed. Run: pip install Pillow")
        sys.exit(1)

    try:
        req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
        with urllib.request.urlopen(req, timeout=10) as response:
            history = json.loads(response.read().decode("utf-8"))

        outputs = history[prompt_id].get("outputs", {})
        for node_id, node_out in outputs.items():
            images = node_out.get("images", [])
            for img_info in images:
                filename = img_info.get("filename")
                subfolder = img_info.get("subfolder", "")
                filetype = img_info.get("type", "output")
                if not filename:
                    continue

                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": filetype,
                })
                url = f"{COMFYUI_URL}/view?{params}"

                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)

                os.makedirs(SPRITE_DIR, exist_ok=True)
                out_path = os.path.join(SPRITE_DIR, f"{creature_id}.webp")
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "WEBP", quality=90)
                os.unlink(tmp_path)

                size_kb = os.path.getsize(out_path) / 1024
                return out_path, size_kb

        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def main():
    retry_ids = list(CUSTOM_PROMPTS.keys())

    if len(sys.argv) > 1:
        retry_ids = sys.argv[1:]

    total = len(retry_ids)
    print("=" * 60)
    print(f"RETRYING {total} CREATURE SPRITES (custom prompts)")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Output:  {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    print("=" * 60)

    success = 0
    failed = []

    for i, cid in enumerate(retry_ids, 1):
        prompt = CUSTOM_PROMPTS.get(cid)
        if not prompt:
            print(f"\n[{i}/{total}] {cid} — NO CUSTOM PROMPT, skipping")
            continue

        print(f"\n[{i}/{total}] {cid}")
        print(f"  Prompt: {prompt[:100]}...")

        workflow = create_workflow(cid, prompt)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=300):
                result = download_and_save(prompt_id, cid)
                if result:
                    path, size_kb = result
                    print(f" OK → {os.path.basename(path)} ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(cid)
            else:
                print(f" GENERATION FAILED")
                failed.append(cid)
        else:
            print(f"  QUEUE ERROR")
            failed.append(cid)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"RETRY COMPLETE: {success}/{total} sprites regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
