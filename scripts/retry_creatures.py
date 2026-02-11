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

# Round 3 style — removed "gacha game" which triggers text artifacts like "Gaha Game"
STYLE = (
    "solo, ONE single chibi character only, cute monster creature, anime art style, "
    "mobile game character icon, white background, bright vivid colors, "
    "high quality, clean lineart, centered composition, single subject only, "
    "full body, standing pose, collectible creature design, "
    "large character filling the frame, close-up view, cell shading"
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

# Custom prompt OVERRIDES for stubborn creatures.
# Add entries here only if a creature fails with its creatures.json description.
# The retry script will use the creature's description from creatures.json by default
# (same as generate_creatures.py), falling back to CUSTOM_PROMPTS only if present.
CUSTOM_PROMPTS = {
    # =============================================
    # ROUND 3 — 20 stubborn failures
    # Key fixes: removed "gacha game" from STYLE (text trigger),
    # simplified compositions, pure visual descriptions
    # =============================================

    # --- ripplash (water/rare): duplicate fish + water puddle ---
    # Strategy: simple single koi, no water surface, no "sea" (triggers ocean scene)
    # R13: was pink — force TURQUOISE color, no pink references
    "ripplash": (
        "a chibi axolotl creature extreme close-up portrait, "
        "ONE single HUGE round chubby body of BRIGHT TURQUOISE BLUE filling 85 percent of canvas, "
        "smooth glossy turquoise blue skin with white belly, iridescent blue-green sheen, "
        "large feathery TURQUOISE BLUE gill fronds on both sides of round head, "
        "tiny stubby turquoise legs, small curled tail, "
        "big bright aqua eyes with sparkle highlights, cute gentle smile, "
        "turquoise blue and teal color scheme NOT pink NOT red, thick dark outlines, cel shading, "
        "nothing else in the image, body fills the canvas"
    ),

    # --- sproutling (wood/common): TEXT "Droof Dew" + grass ground ---
    # Strategy: avoid any word that could trigger text, no ground references
    "sproutling": (
        "a chibi seedling creature extreme close-up filling 90 percent of frame, "
        "large round bright lime green body with visible leaf vein texture across surface, "
        "one tall bouncy curled shoot with a glowing dewdrop gem at the tip, "
        "two flat leaf-shaped arms spread wide, tiny brown root toes, "
        "big eager yellow-green eyes with star sparkle highlights, happy open mouth, "
        "rosy pink cheeks, fully painted with cel shading and highlights, "
        "levitating in pure white void, LARGE character filling entire canvas"
    ),

    # --- whiskit (wood/uncommon): outline-only, no color fill ---
    # Strategy: emphasize FILLED color, thick paint, saturated
    "whiskit": (
        "a chibi forest cat creature extreme close-up portrait filling entire frame, "
        "round face and body of deep emerald green fur with bright yellow vine stripe markings, "
        "four glowing green whiskers with spark tips, huge amber cat eyes with slit pupils, "
        "tall pointed ears with pink flower buds at tips, fluffy leaf-fan tail behind, "
        "thick dark outlines, vivid saturated green and yellow colors, "
        "fills 90 percent of canvas, simple portrait composition, "
        "absolutely nothing else in the image besides this one cat"
    ),

    # --- trottar (earth/uncommon): persistent gold pedestal ---
    # Strategy: "flying" instead of "levitating", even more explicit no-ground
    # R5: too small → extreme macro filling 95% of frame
    "trottar": (
        "a chibi rock creature extreme close-up macro portrait filling entire frame, "
        "HUGE round egg-shaped body of warm golden sandstone filling 95 percent of canvas, "
        "sparkling quartz crystal vein patterns across entire body surface, "
        "adorable face with big bright amber gemstone eyes and tiny smile, "
        "wild tuft of golden sandy hair on top of head, "
        "two tiny brown pebble stub arms, two tiny pebble feet barely visible at bottom, "
        "edge to edge composition, creature body touches all sides of canvas, "
        "thick dark outlines, vivid warm sandstone colors, levitating in white void"
    ),

    # --- frostelle (water/common): too small, outline-only ---
    # Strategy: macro close-up + fully painted emphasis
    "frostelle": (
        "a chibi arctic fox creature extreme close-up macro shot, "
        "large fluffy round body of thick white fur with icy blue shimmer filling 90 percent of frame, "
        "two delicate ice crystal antlers refracting tiny rainbows, "
        "enormous bushy tail with snowflake frost patterns, ice crystal boot paws, "
        "sparkling diamond dust eyes glowing cool blue, falling snowflakes around, "
        "fully painted with cel shading, thick dark outlines, opaque filled colors"
    ),

    # --- chirplet (wood/rare): tiny bird lost in corner with feathers ---
    # Strategy: describe as round owl-parrot, no feather accessories
    "chirplet": (
        "a chibi tropical bird creature portrait, HUGE round body filling 95 percent of frame, "
        "vibrant emerald green and sapphire blue feathers covering entire body, "
        "two big spread wings in sunset orange and magenta gradient, "
        "tall golden crest of three feather plumes on top of head, small jade beak, "
        "bright golden eyes with black pupils, rosy cheeks, proud expression, "
        "edge to edge composition, bird body touches all sides of canvas"
    ),

    # --- cumulon (water/rare): 2 duplicate smaller copies ---
    # Strategy: describe as ONE specific cloud slime, avoid "storm" which triggers multiples
    "cumulon": (
        "a chibi storm cloud dragon creature filling the frame, "
        "massive puffy round body of dark grey and white cloud with glowing electric blue lightning cracks, "
        "two curved ice crystal horns on top of head, two stubby cloud puff arms, "
        "spiral storm vortex pattern glowing on round belly, "
        "dramatic blue and purple lightning arcs crackling around the body, "
        "sleepy half-closed eyes glowing bright electric blue, cute grumpy mouth, "
        "vivid blue and grey color scheme, fully painted with dramatic lighting effects"
    ),

    # --- buzzle (wood/rare): duplicate small copy in corner ---
    # Strategy: fill frame completely so there is no room for a second copy
    # R5: 3 duplicates → singular armored SLIME blob, no insect shape
    "buzzle": (
        "a chibi jewel slime blob creature extreme close-up macro shot, "
        "ONE single round armored blob of shimmering emerald green filling 90 percent of frame, "
        "glossy chitin shell texture with golden filigree trim patterns on surface, "
        "two iridescent stained glass wings folded behind like a cape, "
        "one golden horn on forehead, two big compound eyes glowing bright lime green, "
        "golden stripe markings on the round front, cute determined expression, "
        "absolutely only ONE creature in the entire image, nothing else, "
        "edge to edge, pure white background"
    ),

    # --- rooten (wood/epic): ROUND 4 — was humanoid, needs to be blob/ball ---
    # Strategy: describe as a SLIME with root texture, no legs at all
    "rooten": (
        "brown and tan colored chestnut monster creature, warm chocolate brown round body, "
        "adorable potato shaped blob creature filling 90 percent of frame, "
        "chocolate brown body with darker brown bark crack line patterns across surface, "
        "small green leaf sprout and tiny mushrooms growing from top of head, golden crown, "
        "big cute warm amber orange eyes, rosy cheeks, two tiny brown stubby arms, "
        "brown feet, fully painted with cel shading, extreme close-up centered on white background"
    ),

    # --- solarie (fire/legendary): abstract sun shapes, no creature body ---
    # Strategy: completely different creature — phoenix chick, NOT sun
    "solarie": (
        "a chibi baby phoenix creature, round chubby bird body of molten gold with flame feather texture, "
        "thick flowing flame mane of gold and white feathers around head, "
        "two small golden fire wings spread behind, golden halo ring above head, "
        "four tiny golden talons, flame-tipped tail feathers, "
        "fierce bright orange eyes with star shaped pupils, proud little chest, "
        "clearly a round chubby bird creature, not a sun, not abstract shapes"
    ),

    # --- dialyn (fire/uncommon): ROUND 4 — was humanoid robot girl ---
    # Strategy: describe as round clock SLIME, no body/legs
    "dialyn": (
        "a chibi clock slime creature, round ball body shaped like a golden pocket watch, "
        "NO legs NO humanoid shape, just a round golden blob, "
        "clock face pattern on the front surface with cute eyes above it, "
        "two tiny golden stub arms, small golden gear ears on top of round head, "
        "warm golden glow, cute smile, short stubby feet barely visible, "
        "round and fat like a ball, NOT a person NOT a robot girl, "
        "pure white background, bright warm gold and teal colors"
    ),

    # --- scribbit (metal/rare): ROUND 4 — was thin/humanoid ---
    # Strategy: describe as ink SLIME blob, no humanoid features
    "scribbit": (
        "a chibi ink slime blob creature, round ball body of glossy dark blue liquid chrome, "
        "NO legs NO humanoid body, just a fat round blob of liquid metal, "
        "filling 80 percent of the frame, smooth cute face on front surface, "
        "bright glowing cyan eyes and small white smile, "
        "two small flowing pseudopod arms of dark blue chrome, "
        "quill-shaped antenna on top of round head, swirl patterns on body, "
        "vivid blue and silver colors, thick dark outlines, pure white background"
    ),

    # --- sizzlit (fire/uncommon): TEXT "O'VLIOD" + duplicate + Charmander clone ---
    # Strategy: NOT a lizard/dinosaur (avoids Charmander), describe as salamander blob
    "sizzlit": (
        "a chibi salamander blob creature, compact smooth round body of glossy warm amber, "
        "caramel swirl patterns on surface, no spikes no horns, "
        "small flame tuft at end of smooth round tail, "
        "four stubby charcoal grey feet with tiny ember toe pads, "
        "warm glowing orange core visible in round belly, "
        "cheerful round eyes with tiny flame reflections, cute smile, "
        "simple centered composition, vivid warm colors, fully painted"
    ),

    # --- moodlet (wood/uncommon): persistent Japanese text ---
    # Strategy: remove ALL trigger words, pure visual, no "theater" no "mask"
    "moodlet": (
        "a chibi porcelain doll creature, round soft ivory white body with glossy finish, "
        "one large happy face with rosy pink cheeks and curved smile, "
        "two small leaf-shaped hands, green ruff collar with gold trim, "
        "golden kintsugi crack patterns across body surface, "
        "warm bright amber eyes with star highlights, "
        "soft warm golden glow from body, simple clean composition, "
        "pure white background, fully painted with shading"
    ),

    # --- sketchi (earth/uncommon): TEXT "Gaha Game." ---
    # Strategy: no paint/art references (triggers text), describe as rainbow slime
    "sketchi": (
        "a chibi rainbow slime creature extreme close-up macro shot, "
        "large amorphous body made of swirling rainbow colored gel filling 90 percent of frame, "
        "two stretchy pseudopod arms with colorful dripping tips, "
        "beret hat of solid colors on top of head, two short stubby legs, "
        "big bright eyes with colorful swirl irises, cute open mouth smile, "
        "clearly a blobby creature with face and limbs, vivid rainbow colors, "
        "simple centered composition, fully painted"
    ),

    # --- breezle (wood/common): TEXT "WIGRT" ---
    # Strategy: pure plant sprite, no word triggers, simple description
    # R8: slime too small — hamster body type (model renders these big + detailed)
    "breezle": (
        "a chibi hamster creature extreme close-up portrait filling entire frame, "
        "HUGE round fluffy body of bright mint green fur filling 90 percent of canvas, "
        "soft puffy cheeks stuffed with air, fluffy mint green fur all over, "
        "two small round ears with white inner ear, two tiny paw hands, two tiny paw feet, "
        "short puffy tail like a cloud puff, white fur belly patch, "
        "big sparkling golden eyes with star highlights, cute open mouth smile, rosy pink cheeks, "
        "vivid bright mint green fur color, thick dark outlines, cel shading, "
        "edge to edge composition, hamster body fills entire canvas"
    ),

    # --- orblix (earth/epic): ROUND 4 — was humanoid shadow figure ---
    # Strategy: describe as crystal SLIME blob, no person shape at all
    "orblix": (
        "a chibi crystal slime blob, round ball body of dark purple amethyst crystal, "
        "NO legs NO humanoid body NO person shape, just a big round gem blob, "
        "translucent purple with glowing magenta energy core visible inside, "
        "jagged amethyst crystals growing from the top like a crown, "
        "two tiny purple stub arms, two glowing pink eyes on front surface, "
        "floating crystal shards nearby, epic magical aura, "
        "round and fat like a ball NOT a person, vivid purple and magenta colors"
    ),

    # --- reelyx (metal/rare): too small, too simple ---
    # Strategy: extreme close-up, describe detailed art-deco body
    "reelyx": (
        "a chibi movie phantom creature extreme close-up macro shot, "
        "sleek round art deco body of polished black and gold filling 90 percent of frame, "
        "film strip ribbon patterns wrapping around the body surface, "
        "one large projector lens eye glowing with colorful light beam, "
        "two film reel decorations on sides of head like ears, "
        "flowing short cape of dark film strips with gold sprocket hole trim, "
        "one star shaped eye, cute determined expression, "
        "fully painted, vivid black and gold colors"
    ),

    # --- drizzlet (water/common): too small, too simple, outline only ---
    # Strategy: water droplet creature, macro, fully painted
    "drizzlet": (
        "a chibi water droplet creature extreme close-up macro shot, "
        "large teardrop shaped body of crystal clear blue water filling 90 percent of frame, "
        "beautiful internal ripple refraction patterns visible inside, "
        "tiny cloud puff hat sitting on top of head, small crystal droplet earrings, "
        "cute splashy water paw feet, cheerful big bright eyes with sparkle highlights, "
        "soft cerulean inner glow, fully painted with cel shading, "
        "thick dark outlines, vivid blue colors, NOT an outline drawing"
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
                "cfg": 8.5,
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


def build_prompt_from_json(creature_id):
    """Build prompt from creatures.json description (same as generate_creatures.py)."""
    creatures = load_creatures()
    for c in creatures:
        if c["id"] == creature_id:
            return f"{STYLE}, {c['description']}"
    return None


def main():
    if len(sys.argv) > 1:
        retry_ids = sys.argv[1:]
    elif CUSTOM_PROMPTS:
        retry_ids = list(CUSTOM_PROMPTS.keys())
    else:
        print("Usage: python retry_creatures.py <creature_id> [creature_id ...]")
        print("No custom prompts defined. Pass creature IDs to retry with their creatures.json descriptions.")
        sys.exit(0)

    total = len(retry_ids)
    print("=" * 60)
    print(f"RETRYING {total} CREATURE SPRITES")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Output:  {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    print("=" * 60)

    success = 0
    failed = []

    for i, cid in enumerate(retry_ids, 1):
        # Use custom prompt if available, otherwise fall back to creatures.json
        custom_p = CUSTOM_PROMPTS.get(cid)
        if custom_p:
            prompt = f"{STYLE}, {custom_p}"
            source = "custom"
        else:
            prompt = build_prompt_from_json(cid)
            source = "creatures.json"
        if not prompt:
            print(f"\n[{i}/{total}] {cid} — NOT FOUND in creatures.json, skipping")
            continue

        print(f"\n[{i}/{total}] {cid} ({source})")
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
