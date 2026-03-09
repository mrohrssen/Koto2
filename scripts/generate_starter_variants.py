#!/usr/bin/env python3
"""
Generate 9 starter sprite variants: 3 starters x 3 prompt strategies.
Tests which prompt approach produces the most detailed, polished creatures.

  A = "Robot Formula"    — short STYLE, mechanical/armor vocabulary, light negative
  B = "Detailed Illustration" — illustration STYLE, organic but richly textured
  C = "Dynamic Character"     — character STYLE, personality and action focus
  D = "Anime Game Monster"    — monster-focused STYLE, creature-as-monster framing

Output: public/assets/sprites/starter-variants/<id>-<variant>.webp
Compare side-by-side, pick your favorites.

Usage:
  python scripts/generate_starter_variants.py              # All 9
  python scripts/generate_starter_variants.py --variant a  # Only variant A (3 sprites)
  python scripts/generate_starter_variants.py --dry-run    # Show prompts only
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
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "starter-variants")

COMFYUI_URL = "http://10.5.0.2:8188"

# ============================================================
# VARIANT A: "Robot Formula"
# Hypothesis: the robot STYLE prefix + mechanical vocabulary drives quality.
# Copied from generate_robots.py — short, permissive, lets the description shine.
# ============================================================

STYLE_A = (
    "solo, chibi character, gacha game art style, mobile game character icon, "
    "white background, bright vivid colors, high quality, clean, cute mecha creature"
)

NEGATIVE_A = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette"
)

CFG_A = 7.5

PROMPTS_A = {
    "petalia": (
        "a cute chibi flower mecha sprite, ornate body of layered cherry blossom petal "
        "armor plating in metallic pastel pink and pearl white with intricate surface engravings, "
        "delicate translucent petal wings with vein circuit patterns and soft pink energy glow, "
        "articulated leaf-shaped gauntlet hands with dewdrop crystal anklets, "
        "golden pollen particle effects orbiting the body, "
        "bright curious eyes with pink energy glow behind a flower-petal visor, "
        "luminous green energy core visible through ornate chest plate, "
        "gentle bioluminescent sakura aura radiating outward, "
        "intricate mechanical flower detail, polished rendering"
    ),
    "timbark": (
        "a cute chibi treant mecha creature, stout armored body of layered dark oak bark "
        "plating with detailed moss patches and lichen spot textures across every surface, "
        "two ornate branch antler weapons sprouting glowing green leaf crystals, "
        "sturdy root-like armored legs with visible wood grain texture and amber energy veins, "
        "a cluster of glowing amber sap energy gems embedded in ornate chest armor plate, "
        "warm friendly eyes behind bark visor with amber energy glow, "
        "green nature energy wisps and floating leaf particles swirling around body, "
        "intricate bark armor detail, polished rendering"
    ),
    "drizzlet": (
        "a cute chibi water mecha spirit, sleek teardrop-shaped body of translucent "
        "shimmering blue crystal armor with visible ripple energy patterns flowing inside, "
        "ornate fluffy cloud headpiece with silver trim sitting on its head, "
        "crystal-clear droplet earring accessories dangling from sides with prismatic refractions, "
        "articulated water-jet boots that trail sparkly energy puddles, "
        "cheerful bright eyes with raindrop-shaped pupils behind a water crystal visor, "
        "soft blue energy core glowing from within the ornate chest plate, "
        "intricate water crystal detail, polished rendering"
    ),
}


# ============================================================
# VARIANT B: "Detailed Illustration"
# Hypothesis: art-style framing matters more than mechanical vocabulary.
# No "chibi creature" — emphasize illustration craft and material rendering.
# ============================================================

STYLE_B = (
    "solo, detailed anime illustration, professional game character art, "
    "intricate design, white background, vivid saturated colors, "
    "rich textures, clean lineart, beautiful shading, high detail rendering"
)

NEGATIVE_B = (
    "text, watermark, blurry, low quality, multiple characters, complex background, "
    "human, humanoid, pokeball, monochrome, silhouette, simple, flat colors, "
    "sketch, rough, unfinished, outline only"
)

CFG_B = 7.5

PROMPTS_B = {
    "petalia": (
        "a flower fairy creature, body formed from dozens of individually rendered "
        "cherry blossom petals layered like silk in pastel pink gradients from pale blush "
        "to deep rose, each petal with visible translucent vein patterns and soft subsurface "
        "scattering glow, delicate wings of crystallized flower membrane catching rainbow "
        "light refractions, tiny feet wearing intricately braided leaf sandals with morning "
        "dewdrop gem anklets, a constellation of golden pollen motes drifting in a gentle "
        "spiral around the body, large expressive eyes of deep magenta with cherry blossom "
        "shaped highlights, warm green bioluminescent glow radiating from the flower pistil "
        "core at its center"
    ),
    "timbark": (
        "a treant creature, stout round body of richly detailed dark oak bark with deep "
        "fissure textures revealing warm amber heartwood underneath, patches of emerald "
        "velvet moss and pale blue-green lichen dotting the surface with realistic organic "
        "growth patterns, two branching antlers of polished dark wood sprouting clusters of "
        "tiny spring-green leaves with visible individual leaf veins, sturdy root feet with "
        "intricate wood grain rings and amber sap crystallizing at the joints, a cluster of "
        "luminous amber sap gems embedded naturally in the chest bark like tree resin catching "
        "sunlight, warm expressive eyes nestled in detailed knotholes with golden amber irises, "
        "wisps of verdant nature energy spiraling upward from the leaf tips"
    ),
    "drizzlet": (
        "a raindrop spirit creature, teardrop-shaped body of crystal-clear shimmering water "
        "with beautiful internal caustic light patterns and slow-motion ripple waves visible "
        "beneath the surface, iridescent water-surface sheen catching prismatic rainbow highlights "
        "on the skin, a perfectly fluffy miniature cumulus cloud perched on top of its head "
        "with detailed cotton-like texture and silver-grey shading, dangling crystal water-drop "
        "earrings with visible internal light refractions, expressive cheerful eyes with deep "
        "sapphire blue irises and raindrop-shaped catchlight reflections, soft cerulean "
        "bioluminescent glow emanating from deep within the water body, tiny water-splash "
        "feet leaving sparkling crystalline puddle effects"
    ),
}


# ============================================================
# VARIANT C: "Dynamic Character"
# Hypothesis: framing as "characters with personality" rather than
# "creatures/icons" triggers higher quality rendering.
# Lower CFG for more creative freedom.
# ============================================================

STYLE_C = (
    "solo, anime game character, dynamic pose, expressive, "
    "detailed shading and highlights, vivid colors, white background, "
    "high quality, studio illustration, cel shading, character design sheet quality"
)

NEGATIVE_C = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette, stiff, static, lifeless"
)

CFG_C = 7.0

PROMPTS_C = {
    "petalia": (
        "a cheerful flower spirit reaching both arms wide in a welcoming pose, "
        "twirling gracefully with cherry blossom petals swirling in a dynamic spiral, "
        "body of layered pink sakura petals flowing like a dancer's dress with detailed "
        "petal edge rendering, translucent petal wings spread wide catching the light "
        "with rainbow refractions, bright magenta eyes full of curiosity and wonder, "
        "golden pollen sparkles trailing behind its movement in a glowing arc, "
        "green energy bloom radiating from its joyful core, "
        "confident friendly stance full of charm and warmth, "
        "detailed flower textures and petal material rendering throughout"
    ),
    "timbark": (
        "a proud little treant standing in a confident protective stance with bark fists "
        "clenched, sturdy dark oak bark body with a brave determined expression, "
        "branch antlers held high with tiny green leaves rustling with visible energy wisps, "
        "glowing amber sap veins pulsing with inner strength visible through detailed bark "
        "chest texture, root feet planted firmly with spreading root tendrils, "
        "warm golden eyes with a gentle but fierce guardian gaze, "
        "green nature energy wisps swirling upward dramatically around the body, "
        "rich mossy texture and lichen details across every surface, "
        "a loyal guardian character radiating quiet strength, "
        "detailed bark grain and moss material rendering throughout"
    ),
    "drizzlet": (
        "a playful water spirit mid-bounce with a mischievous grin, "
        "teardrop body of shimmering translucent blue water splashing and wobbling "
        "dynamically with the motion showing internal caustic light patterns, "
        "tiny cloud hat bouncing on its head with fluffy cotton detail, "
        "crystal droplet earrings swinging with momentum catching prismatic light, "
        "water-splash effects spraying from its happy feet in detailed droplet arcs, "
        "bright cheerful eyes with star-shaped catchlights full of joy, "
        "soft blue inner glow pulsing with excitement through the water body, "
        "water ripple effects radiating outward from its landing point, "
        "an energetic bubbly personality captured mid-action, "
        "detailed water refraction and splash rendering throughout"
    ),
}


# ============================================================
# VARIANT D: "Anime Game Monster"
# Hypothesis: framing as "game monster" (not character, not creature)
# triggers the model's knowledge of detailed monster designs from
# Pokemon/Digimon/Monster Hunter — rich detail without needing mecha vocab.
# ============================================================

STYLE_D = (
    "solo, anime game monster, collectible monster design, detailed monster illustration, "
    "white background, vivid saturated colors, high quality rendering, "
    "beautiful shading, clean bold lineart, full body, centered"
)

NEGATIVE_D = (
    "dark, gritty, realistic, horror, text, watermark, blurry, low quality, "
    "multiple characters, complex background, human, humanoid, pokeball, "
    "monochrome, silhouette, simple, flat, sketch"
)

CFG_D = 7.5

PROMPTS_D = {
    "petalia": (
        "a flower fairy monster, elegant body formed from layers of cherry blossom petals "
        "in pastel pink and deep rose gradients with detailed petal edge curling and soft "
        "translucent subsurface glow, large crystalline petal wings with intricate vein "
        "patterns refracting rainbow light, ornate leaf-woven sandals with dewdrop crystal "
        "anklets, a halo of golden pollen particles spiraling around the body, "
        "large expressive magenta eyes with sakura-shaped highlights and long lashes, "
        "a glowing green pistil core in the center of its chest radiating warm light, "
        "detailed petal texture and material rendering on every surface, "
        "beautiful elegant monster with floral grace"
    ),
    "timbark": (
        "a treant monster, stout powerful body of richly textured dark oak bark with deep "
        "crevice patterns revealing warm glowing amber heartwood beneath, emerald moss and "
        "pale lichen growing across the bark surface in detailed organic clusters, "
        "two magnificent branch antlers sprouting vivid green leaf canopies with individual "
        "leaf detail, thick root-leg feet with visible growth rings and crystallized amber sap, "
        "a heart of luminous amber sap gems glowing warmly through the chest bark, "
        "expressive golden eyes set in detailed knotholes with kind determined gaze, "
        "green nature energy wisps curling upward from every leaf tip, "
        "detailed bark grain and moss texture rendering throughout, "
        "a sturdy guardian monster with ancient forest presence"
    ),
    "drizzlet": (
        "a water spirit monster, smooth teardrop-shaped body of crystal-clear living water "
        "with beautiful visible caustic light patterns rippling inside the translucent form, "
        "iridescent water-surface sheen casting prismatic rainbow reflections, "
        "a fluffy detailed cumulus cloud sitting on its head like a crown with cotton-puff "
        "texture and silver-grey depth shading, crystal water-drop earrings with internal "
        "light refractions dangling and catching light, "
        "large cheerful sapphire blue eyes with raindrop-shaped sparkle catchlights, "
        "a deep cerulean bioluminescent glow emanating from within the water body, "
        "tiny splashing water feet with detailed spray droplet effects, "
        "detailed water refraction and transparency rendering throughout, "
        "a charming aquatic monster with bubbly playful energy"
    ),
}


# ============================================================
# Variant configs lookup
# ============================================================

VARIANTS = {
    "a": {"style": STYLE_A, "negative": NEGATIVE_A, "cfg": CFG_A, "prompts": PROMPTS_A,
           "label": "Robot Formula"},
    "b": {"style": STYLE_B, "negative": NEGATIVE_B, "cfg": CFG_B, "prompts": PROMPTS_B,
           "label": "Detailed Illustration"},
    "c": {"style": STYLE_C, "negative": NEGATIVE_C, "cfg": CFG_C, "prompts": PROMPTS_C,
           "label": "Dynamic Character"},
    "d": {"style": STYLE_D, "negative": NEGATIVE_D, "cfg": CFG_D, "prompts": PROMPTS_D,
           "label": "Anime Game Monster"},
}

STARTERS = ["petalia", "timbark", "drizzlet"]


# ============================================================
# ComfyUI workflow + helpers (from existing scripts)
# ============================================================

def create_workflow(output_id, prompt, negative, cfg):
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
                "cfg": cfg,
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
                "filename_prefix": f"starter_variants/{output_id}"
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
                        msgs = status.get("messages", [])
                        print(f"  Error: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_and_save(prompt_id, output_id):
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

                os.makedirs(OUTPUT_DIR, exist_ok=True)
                out_path = os.path.join(OUTPUT_DIR, f"{output_id}.webp")
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
    parser = argparse.ArgumentParser(description="Generate starter sprite variants for A/B testing")
    parser.add_argument("--variant", choices=["a", "b", "c", "d"], help="Only generate one variant")
    parser.add_argument("--creature", choices=STARTERS, help="Only generate one creature")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts without generating")
    parser.add_argument("--comfyui-url", default=None, help="ComfyUI server URL override")
    args = parser.parse_args()

    global COMFYUI_URL
    if args.comfyui_url:
        COMFYUI_URL = args.comfyui_url

    # Build job list
    jobs = []
    variant_keys = [args.variant] if args.variant else ["a", "b", "c", "d"]
    creature_ids = [args.creature] if args.creature else STARTERS

    for vk in variant_keys:
        v = VARIANTS[vk]
        for cid in creature_ids:
            output_id = f"{cid}-{vk}"
            full_prompt = f"{v['style']}, {v['prompts'][cid]}"
            jobs.append({
                "output_id": output_id,
                "creature": cid,
                "variant": vk,
                "label": v["label"],
                "prompt": full_prompt,
                "negative": v["negative"],
                "cfg": v["cfg"],
            })

    total = len(jobs)
    print("=" * 65)
    print(f"STARTER SPRITE VARIANTS — {total} sprites to generate")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Output:  {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    print()
    print("  Variants:")
    for vk in variant_keys:
        print(f"    {vk.upper()}: {VARIANTS[vk]['label']} (CFG {VARIANTS[vk]['cfg']})")
    print(f"  Creatures: {', '.join(creature_ids)}")
    if args.dry_run:
        print("  *** DRY RUN — no jobs will be queued ***")
    print("=" * 65)

    success = 0
    failed = []

    for i, job in enumerate(jobs, 1):
        print(f"\n[{i}/{total}] {job['output_id']}  ({job['label']})")
        print(f"  CFG: {job['cfg']}")
        print(f"  Prompt: {job['prompt'][:120]}...")
        print(f"  Negative: {job['negative'][:80]}...")

        if args.dry_run:
            print(f"  --- dry run, skipping ---")
            continue

        workflow = create_workflow(
            job["output_id"], job["prompt"], job["negative"], job["cfg"]
        )
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued, waiting...", end="", flush=True)
            if wait_for_completion(prompt_id):
                result = download_and_save(prompt_id, job["output_id"])
                if result:
                    path, size_kb = result
                    print(f" OK -> {os.path.basename(path)} ({size_kb:.0f}KB)")
                    success += 1
                else:
                    print(f" DOWNLOAD FAILED")
                    failed.append(job["output_id"])
            else:
                print(f" GENERATION FAILED")
                failed.append(job["output_id"])
        else:
            print(f"  QUEUE ERROR")
            failed.append(job["output_id"])

        time.sleep(1)

    print("\n" + "=" * 65)
    if args.dry_run:
        print(f"DRY RUN COMPLETE: {total} variants previewed")
    else:
        print(f"COMPLETE: {success}/{total} starter variants generated")
        if failed:
            print(f"Failed: {', '.join(failed)}")
        print(f"\nSprites saved to: {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
        print(f"Files: petalia-a.webp, petalia-b.webp, petalia-c.webp, ...")
        print(f"\nCompare side-by-side and pick your favorites!")
    print("=" * 65)


if __name__ == "__main__":
    main()
