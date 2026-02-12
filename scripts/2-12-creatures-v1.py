#!/usr/bin/env python3
"""
2-12-creatures-v1: Generate all 46 creature sprites using the A2 "Armored Beast" formula.

Proven formula from sprite A/B testing (2025-02-11):
  - Short permissive STYLE prefix (from robot generation script)
  - Light negative prompt (~30 tokens, no defensive padding)
  - CFG 7.5, 30 steps, dpmpp_2m karras
  - creatures.json descriptions enhanced with natural-armor vocabulary

Custom overrides for creatures that need hand-tuned prompts (tested in rounds 1-3).
Everything else uses creatures.json descriptions directly with the A2 STYLE prefix.

Usage:
  python scripts/2-12-creatures-v1.py                        # All 46
  python scripts/2-12-creatures-v1.py petalia timbark         # Specific creatures
  python scripts/2-12-creatures-v1.py --rarity epic           # Filter by rarity
  python scripts/2-12-creatures-v1.py --element fire          # Filter by element
  python scripts/2-12-creatures-v1.py --force                 # Regenerate existing
  python scripts/2-12-creatures-v1.py --dry-run               # Preview prompts only
"""

import argparse
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
_COMFYUI_URL = "http://192.168.1.222:8188"

# =============================================================================
# A2 "Armored Beast" formula — proven in A/B testing
# Short permissive STYLE from the robot generation script.
# "cute mecha creature" triggers detailed rendering without going full robot.
# =============================================================================

STYLE = (
    "solo, chibi character, gacha game art style, mobile game character icon, "
    "white background, bright vivid colors, high quality, clean, cute mecha creature"
)

NEGATIVE = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette"
)

CFG = 7.5
STEPS = 30

# =============================================================================
# Custom prompt overrides — hand-tuned from rounds 1-3 testing.
# Creatures NOT listed here use their creatures.json description directly.
# Add entries here when a creature's default description produces bad results.
# =============================================================================

CUSTOM_PROMPTS = {
    # --- Starters (tested round 1, variant A2) ---
    "petalia": (
        "a cute chibi flower beast, ornate body of layered cherry blossom petal plates "
        "in pastel pink and white with intricate petal-edge curling and soft translucent glow, "
        "delicate crystalline petal wings with detailed vein patterns refracting rainbow light, "
        "tiny leaf-woven sandals with dewdrop crystal anklets, "
        "a halo of golden pollen particles spiraling around the body, "
        "bright curious magenta eyes with sakura-shaped highlights, "
        "a glowing green pistil core in the center of its chest radiating warm light, "
        "detailed petal texture and material rendering on every surface"
    ),

    "timbark": (
        "a cute chibi treant beast, stout round body of thick dark oak bark with deep "
        "carved fissure patterns and natural bark armor plates layered like dragon scales, "
        "lush emerald moss growing in the crevices between bark plates, "
        "two magnificent branch antlers with dense clusters of bright spring-green leaves, "
        "sturdy thick root legs with polished wood grain rings and amber sap crystals at joints, "
        "a glowing amber heartwood core visible through a natural gap in the chest bark, "
        "warm golden eyes set in detailed knotholes with friendly determined expression, "
        "green energy wisps rising from leaf tips, floating golden leaf particles, "
        "intricate natural bark texture detail, polished rendering"
    ),

    "drizzlet": (
        "a cute chibi water spirit beast, sleek teardrop-shaped body of translucent "
        "shimmering blue water with natural crystal armor plates forming along its surface, "
        "visible ripple energy patterns flowing inside the translucent body, "
        "ornate fluffy cloud headpiece with silver-grey cotton detail sitting on its head, "
        "crystal water-drop earrings with prismatic light refractions dangling from sides, "
        "small splashy water-crystal boots with detailed frost vein patterns, "
        "cheerful bright sapphire eyes with raindrop-shaped sparkle catchlights, "
        "soft cerulean bioluminescent glow from within, "
        "detailed water refraction and crystal texture on every surface"
    ),

    # --- Tested in round 3 with good results ---
    "frostelle": (
        "a cute chibi arctic fox beast, fluffy round body of pristine white fur with natural "
        "ice crystal armor plates forming along its spine and shoulders like frozen scales, "
        "delicate ice crystal antlers on its head refracting light into tiny rainbow prisms, "
        "an enormous bushy tail of layered snowflake-patterned fur with frosted crystal tips, "
        "paws encased in natural ice crystal boots with intricate frost vein patterns, "
        "sparkling diamond-dust eyes with a cool blue glow and gentle expression, "
        "small snowflakes and ice crystal shards gently orbiting around its body, "
        "detailed fur and ice crystal texture on every surface, serene winter aura"
    ),

    "barkley": (
        "a cute chibi earth hound beast, sturdy round body of warm terracotta clay with "
        "natural stone armor plates layered across its back like dragon scales, "
        "oversized floppy ears with sandy brown and copper patches and polished edges, "
        "a fluffy tail tipped with a large glowing amber crystal that radiates warm light, "
        "thick paws of polished river stone with tiny quartz crystal claws, "
        "bright loyal golden eyes with gemstone fleck irises and determined expression, "
        "floating dust motes and tiny orbiting pebbles swirling around its body, "
        "detailed clay and stone texture on every surface, alert adventurous stance"
    ),

    # --- Chronic rejects: custom prompts to avoid bad generation patterns ---
    "tidalin": (
        "a cute chibi sea serpent dragon beast, massive coiled body of deep translucent "
        "blue-green water with white seafoam armor plates and coral growths along the spine, "
        "flowing fins made of cascading water ribbons trailing bioluminescent particles, "
        "a crown of spiraling wave crests with pearl ornaments on its dragon head, "
        "glowing abyssal patterns across serpentine scales, piercing aquamarine dragon eyes, "
        "floating water orbs orbiting around its coiled body, "
        "no human features, purely a sea dragon beast, imposing regal ocean aura"
    ),

    "statik": (
        "a cute chibi robot cat beast, sleek chrome and teal armored body with angular "
        "plating and glowing circuit-trace engravings across the surface, "
        "a visor-style face with bright teal glowing pixel eyes and scan-line effects, "
        "pointed metal cat ears crackling with visible electric arc effects, "
        "floating static orbs and data fragments orbiting its body, "
        "a satellite dish backpack with a pulsing signal light, "
        "electromagnetic aura with tiny lightning tendrils, "
        "tech-knight battle stance, no screens, no monitors, no frames"
    ),

    "orblix": (
        "a cute chibi crystal golem beast, massive spherical body of polished obsidian "
        "and jade with deep swirling galaxy patterns visible within like a cosmic marble, "
        "thick crystalline armor segments on shoulders and arms, "
        "heavy stone gauntlet hands with embedded glowing rune circles, "
        "a crown of floating geometric stone fragments arranged in a planetary ring, "
        "deep ancient eyes of molten gold set in carved stone sockets, "
        "multiple orbiting crystal shards floating around it, "
        "pulsing earthen energy aura, imposing hovering stance, "
        "no borders, no frames, no card elements"
    ),
}


# =============================================================================
# ComfyUI workflow + helpers
# =============================================================================

def get_comfyui_url():
    return _COMFYUI_URL


def set_comfyui_url(url):
    global _COMFYUI_URL
    _COMFYUI_URL = url


def load_creatures():
    with open(CREATURES_FILE) as f:
        return json.load(f)


def build_prompt(creature):
    """Use custom override if available, otherwise creatures.json description."""
    cid = creature["id"]
    if cid in CUSTOM_PROMPTS:
        return f"{STYLE}, {CUSTOM_PROMPTS[cid]}"
    return f"{STYLE}, {creature['description']}"


def create_workflow(creature_id, prompt):
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
                "steps": STEPS,
                "cfg": CFG,
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
                "filename_prefix": f"creatures_v1/{creature_id}"
            }
        }
    }


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        get_comfyui_url() + "/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8")).get("prompt_id", "")
    except Exception as e:
        print(f"  Error queueing: {e}")
        return ""


def wait_for_completion(prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(get_comfyui_url() + "/history/" + prompt_id)
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
        req = urllib.request.Request(get_comfyui_url() + "/history/" + prompt_id)
        with urllib.request.urlopen(req, timeout=10) as response:
            history = json.loads(response.read().decode("utf-8"))

        outputs = history[prompt_id].get("outputs", {})
        for node_out in outputs.values():
            for img_info in node_out.get("images", []):
                filename = img_info.get("filename")
                if not filename:
                    continue
                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": img_info.get("subfolder", ""),
                    "type": img_info.get("type", "output"),
                })
                url = f"{get_comfyui_url()}/view?{params}"

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


def filter_creatures(creatures, args):
    result = creatures

    if args.creature_ids:
        ids = set(args.creature_ids)
        result = [c for c in result if c["id"] in ids]
        found = {c["id"] for c in result}
        missing = ids - found
        if missing:
            print(f"WARNING: Unknown creature IDs: {', '.join(sorted(missing))}")

    if args.rarity:
        result = [c for c in result if c.get("rarity") == args.rarity]

    if args.element:
        result = [c for c in result if c.get("element") == args.element]

    if args.area:
        result = [c for c in result if c.get("area", "").lower() == args.area.lower()]

    if not args.force:
        before = len(result)
        result = [c for c in result if not os.path.exists(
            os.path.join(SPRITE_DIR, f"{c['id']}.webp")
        )]
        skipped = before - len(result)
        if skipped:
            print(f"Skipping {skipped} creatures with existing sprites (use --force to regenerate)")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Generate all 46 creature sprites — A2 Armored Beast formula"
    )
    parser.add_argument("creature_ids", nargs="*", help="Specific creature IDs")
    parser.add_argument("--rarity", choices=["common", "uncommon", "rare", "epic", "legendary"])
    parser.add_argument("--element", choices=["fire", "water", "wood", "earth", "metal"])
    parser.add_argument("--area", help="Filter by area name")
    parser.add_argument("--force", action="store_true", help="Regenerate existing sprites")
    parser.add_argument("--dry-run", action="store_true", help="Preview prompts only")
    parser.add_argument("--comfyui-url", default=None, help="ComfyUI server URL override")
    parser.add_argument("--timeout", type=int, default=300, help="Per-job timeout (seconds)")
    args = parser.parse_args()

    if args.comfyui_url:
        set_comfyui_url(args.comfyui_url)

    all_creatures = load_creatures()
    creatures = filter_creatures(all_creatures, args)

    if not creatures:
        print("No creatures to generate. Check filters or use --force.")
        sys.exit(0)

    custom_count = sum(1 for c in creatures if c["id"] in CUSTOM_PROMPTS)
    default_count = len(creatures) - custom_count

    total = len(creatures)
    print("=" * 65)
    print(f"2-12-CREATURES-V1: A2 Armored Beast Formula")
    print(f"Generating {total} creature sprites")
    print(f"  {custom_count} with custom A2 prompts, {default_count} from creatures.json")
    print(f"  STYLE: short robot formula + 'cute mecha creature'")
    print(f"  CFG: {CFG} | Steps: {STEPS} | Negative: light (~30 tokens)")
    print(f"  ComfyUI: {get_comfyui_url()}")
    print(f"  Output:  {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    if args.dry_run:
        print("  *** DRY RUN ***")
    print("=" * 65)

    success = 0
    failed = []

    for i, creature in enumerate(creatures, 1):
        cid = creature["id"]
        name = creature.get("nameEn", cid)
        rarity = creature.get("rarity", "?")
        element = creature.get("element", "?")
        source = "custom" if cid in CUSTOM_PROMPTS else "json"

        prompt = build_prompt(creature)

        print(f"\n[{i}/{total}] {cid} ({name}) — {element}/{rarity} [{source}]")
        print(f"  {prompt[len(STYLE)+2:len(STYLE)+102]}...")

        if args.dry_run:
            print(f"  FULL PROMPT: {prompt[:200]}...")
            continue

        workflow = create_workflow(cid, prompt)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=args.timeout):
                result = download_and_save(prompt_id, cid)
                if result:
                    path, size_kb = result
                    print(f" OK -> {os.path.basename(path)} ({size_kb:.0f}KB)")
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

    print("\n" + "=" * 65)
    if args.dry_run:
        print(f"DRY RUN COMPLETE: {total} creatures previewed")
    else:
        print(f"COMPLETE: {success}/{total} creature sprites generated")
        if failed:
            print(f"Failed: {', '.join(failed)}")
        print(f"Sprites saved to: {os.path.relpath(SPRITE_DIR, PROJECT_ROOT)}/")
    print("=" * 65)


if __name__ == "__main__":
    main()
