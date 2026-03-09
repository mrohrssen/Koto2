#!/usr/bin/env python3
"""
Nova 16 deep-dive bakeoff: 40 prompt strategies for ANY creature.

Reads creature data from creatures.json / new-creatures-staging.json,
auto-extracts visual features, and builds 40 prompts across 8 categories.

Usage:
  python scripts/bakeoff_nova40_generic.py kamedor
  python scripts/bakeoff_nova40_generic.py umarak
  python scripts/bakeoff_nova40_generic.py kamedor --dry-run
  python scripts/bakeoff_nova40_generic.py umarak --variants 1 5 12
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
COMFYUI_URL = "http://10.5.0.2:8188"
DEFAULT_SEED = 424242

CHECKPOINT = {
    "file": "novaAnimeXL_ilV160.safetensors",
    "label": "Nova v16",
    "cfg": 5.0,
    "sampler": "euler_ancestral",
    "scheduler": "normal",
    "steps": 30,
}

# ═══════════════════════════════════════════════════════════════════
# Negative prompt variants (shared across all creatures)
# ═══════════════════════════════════════════════════════════════════

NEG_STD = (
    "lowres, worst quality, bad quality, bad anatomy, text, watermark, "
    "signature, jpeg artifacts, human, humanoid, girl, boy, person, "
    "realistic, photo, 3d, multiple characters, busy, cluttered, "
    "complex background"
)

NEG_CLEAN = (
    "lowres, worst quality, bad quality, bad anatomy, text, watermark, "
    "signature, jpeg artifacts, human, humanoid, girl, boy, person, "
    "realistic, photo, 3d, multiple characters, busy, cluttered, "
    "ornate, elaborate, filigree, excessive detail, particles, sparkles, "
    "aura, dark, gritty, horror, sketch, complex background"
)

NEG_MIN = "worst quality, low quality, text, watermark"

NEG_CREATURE = (
    "lowres, worst quality, bad quality, text, watermark, signature, "
    "jpeg artifacts, human, humanoid, girl, boy, person, man, woman, "
    "anthropomorphic, furry, realistic, photo, 3d, multiple characters, "
    "chibi, super deformed, complex background"
)


# ═══════════════════════════════════════════════════════════════════
# Auto-extract visual features from creature description
# ═══════════════════════════════════════════════════════════════════

# Maps base creature types to booru-friendly tags
CREATURE_TYPE_TAGS = {
    "moth": "moth, insect, wings, spread_wings, antennae",
    "butterfly": "butterfly, insect, wings, spread_wings, antennae",
    "turtle": "turtle, reptile, shell, tortoise",
    "tortoise": "turtle, reptile, shell, tortoise",
    "stallion": "horse, stallion, equine, hooves, mane",
    "horse": "horse, stallion, equine, hooves, mane",
    "dragon": "dragon, wings, tail, scales, horns",
    "wolf": "wolf, canine, fur, tail, fangs",
    "fox": "fox, canine, fur, tail, ears",
    "bird": "bird, wings, feathers, beak, talons",
    "serpent": "snake, serpent, scales, coils",
    "fish": "fish, fins, scales, aquatic",
    "cat": "cat, feline, fur, tail, whiskers",
    "insect": "insect, antennae, compound_eyes, chitin",
}

COLOR_KEYWORDS = [
    "jade", "emerald", "teal", "green", "bronze", "amber", "gold", "golden",
    "obsidian", "black", "crimson", "red", "blue", "cyan", "silver", "white",
    "purple", "violet", "orange", "ochre", "pink", "coral", "ivory",
]

FEATURE_KEYWORDS = [
    "crystal", "glass", "chitin", "antennae", "wings", "shell", "armor",
    "horns", "beak", "hooves", "mane", "tail", "claws", "fur", "feathers",
    "scales", "spikes", "tusks", "eyes", "glowing", "translucent",
    "fissures", "cracks", "plates", "dome", "pillar",
]


def extract_creature_profile(creature):
    """Auto-extract visual profile from creature data."""
    desc = creature["description"].lower()
    name = creature.get("nameEn", creature["id"])
    element = creature.get("element", "neutral")

    # Detect creature type from description
    creature_type = "creature"
    type_tags = "creature, monster"
    for ctype, tags in CREATURE_TYPE_TAGS.items():
        if ctype in desc:
            creature_type = ctype
            type_tags = tags
            break

    # Extract colors
    colors = [c for c in COLOR_KEYWORDS if c in desc]
    color_tags = ", ".join(f"{c}" for c in colors[:4])  # Cap at 4

    # Extract features
    features = [f for f in FEATURE_KEYWORDS if f in desc]
    feature_tags = ", ".join(features[:6])  # Cap at 6

    # Condense description
    sentences = [s.strip() for s in re.split(r'(?<=[.!])\s+', creature["description"]) if s.strip()]
    ultra_short = sentences[0] if sentences else creature["description"][:100]
    short_desc = " ".join(sentences[:2])
    medium_desc = " ".join(sentences[:3])

    # Build a tag-only version
    all_tags = []
    all_tags.extend(type_tags.split(", "))
    all_tags.extend(colors[:3])
    all_tags.extend(features[:5])
    tag_form = ", ".join(all_tags)

    # Pick 3 "hero" features for spotlight prompts (most distinctive)
    # Use first 5 features found + element color
    hero_features = []
    for s in sentences:
        s_lower = s.lower()
        # Find the most visually distinctive phrases
        for feat in features:
            if feat in s_lower and len(hero_features) < 5:
                # Extract a short phrase around the feature
                hero_features.append((feat, s[:80]))

    return {
        "name": name,
        "element": element,
        "creature_type": creature_type,
        "type_tags": type_tags,
        "color_tags": color_tags,
        "feature_tags": feature_tags,
        "tag_form": tag_form,
        "ultra_short": ultra_short,
        "short_desc": short_desc,
        "medium_desc": medium_desc,
        "full_desc": creature["description"],
        "hero_features": hero_features,
        "colors": colors,
        "features": features,
    }


# ═══════════════════════════════════════════════════════════════════
# Build 40 prompts from creature profile
# ═══════════════════════════════════════════════════════════════════

def build_prompts(profile):
    p = profile
    prompts = []

    # Shorthand for common prefix
    PREFIX = "masterpiece, best quality, no_humans, creature_focus, solo, full_body"

    # Core creature description for reuse
    core = f"{p['type_tags']}, {p['color_tags']}, {p['feature_tags']}"

    # ─── CATEGORY A: Art Style References (1-5) ───

    prompts.append((
        "A1: Sugimori Pokemon",
        "Pokemon artist ref + condensed desc",
        f"{PREFIX}, ken sugimori \\(style\\), pokemon \\(creature\\), "
        f"{core}, simple design, clean lines, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "A2: Nexomon Collector",
        "Creature collector genre + expressive design",
        f"{PREFIX}, creature collector, monster tamer, monster design, "
        f"{core}, bold outline, vivid colors, expressive, rounded shapes, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "A3: Digimon Style",
        "Digimon franchise ref for bolder design",
        f"{PREFIX}, digimon, monster, creature, "
        f"{core}, dynamic, bold design, vivid colors, clean lines, "
        f"white_background, simple_background",
        NEG_STD, None,
    ))

    prompts.append((
        "A4: Monster Rancher",
        "Softer monster design, toy-like appeal",
        f"{PREFIX}, monster rancher, game creature, cute monster, "
        f"{p['type_tags']}, {p['color_tags']}, "
        f"big eyes, rounded body, soft shapes, gentle, friendly, clean design, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "A5: Modern Indie Collector",
        "Temtem/Coromon-like clean creature design",
        f"{PREFIX}, game art, character design, indie game, cel shading, "
        f"{core}, flat color, bold outline, limited palette, clean, modern, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    # ─── CATEGORY B: Feature Spotlight (6-10) ───
    # Pick top 5 features, or pad with generic ones

    hero_names = [h[0] for h in p["hero_features"]]
    # Ensure we have 5 features to spotlight
    while len(hero_names) < 5:
        for fallback in ["body", "eyes", "color", "texture", "silhouette"]:
            if fallback not in hero_names:
                hero_names.append(fallback)
                if len(hero_names) >= 5:
                    break

    feat_descs = {
        h[0]: h[1] for h in p["hero_features"]
    }

    for idx, feat in enumerate(hero_names[:5]):
        feat_phrase = feat_descs.get(feat, feat)
        prompts.append((
            f"B{idx+1}: {feat.title()} Focus",
            f"Heavy weight on {feat}",
            f"{PREFIX}, {p['type_tags']}, ({feat}:1.3), "
            f"{p['color_tags']}, {p['feature_tags']}, "
            f"creature design, vivid colors, clean lines, "
            f"white_background, simple_background",
            NEG_CLEAN, None,
        ))

    # ─── CATEGORY C: Rendering Style (11-15) ───

    prompts.append((
        "C1: Cel Shaded Bold",
        "Hard cel shading with bold outlines",
        f"{PREFIX}, cel shading, bold outline, thick lineart, flat color, "
        f"{core}, vivid colors, clean, sharp, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "C2: Watercolor Soft",
        "Watercolor medium with soft edges",
        f"{PREFIX}, watercolor \\(medium\\), soft shading, gentle colors, "
        f"{core}, pastel, delicate, ethereal, dreamy, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "C3: Flat Vector",
        "Vector art feel with limited color palette",
        f"{PREFIX}, flat color, vector art, limited palette, graphic design, "
        f"{core}, clean shapes, minimal, bold, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "C4: Airbrush Gradient",
        "Smooth airbrushed shading with gradients",
        f"{PREFIX}, airbrush, smooth shading, gradient, soft lighting, "
        f"{core}, luminous, glowing, polished, "
        f"white_background, simple_background",
        NEG_STD, None,
    ))

    prompts.append((
        "C5: Ink + Color Fill",
        "Clean ink lines with flat color fill",
        f"{PREFIX}, lineart, ink, color fill, manga style, clean lines, "
        f"{core}, vivid, sharp outline, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    # ─── CATEGORY D: Composition & Pose (16-20) ───

    style_tags = "creature design, clean lines, vivid colors"

    prompts.append((
        "D1: Front Spread View",
        "Frontal symmetric pose",
        f"{PREFIX}, front view, looking_at_viewer, symmetrical, "
        f"{core}, {style_tags}, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "D2: Resting 3/4 View",
        "Three-quarter angle, resting pose",
        f"{PREFIX}, three-quarter view, resting, calm, "
        f"{core}, serene, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "D3: Dynamic Action",
        "Dynamic action pose with motion",
        f"{PREFIX}, dynamic pose, action, motion, "
        f"{core}, powerful, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "D4: Dramatic Centered",
        "Centered dramatic composition",
        f"{PREFIX}, centered composition, dramatic, "
        f"{core}, majestic, imposing, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "D5: Elegant Profile",
        "Side view emphasizing silhouette",
        f"{PREFIX}, profile view, side view, elegant, graceful silhouette, "
        f"{core}, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    # ─── CATEGORY E: Description Density (21-25) ───

    prompts.append((
        "E1: Ultra Minimal Tags",
        "Bare minimum tags + style",
        f"{PREFIX}, {p['type_tags']}, {p['colors'][0] if p['colors'] else 'colorful'}, "
        f"creature design, cute, clean, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "E2: Pure Danbooru Tags",
        "Only booru tags, no natural language",
        f"masterpiece, best quality, no_humans, creature_focus, original, solo, "
        f"full_body, {p['tag_form']}, "
        f"looking_at_viewer, white_background, simple_background",
        NEG_CREATURE, None,
    ))

    prompts.append((
        "E3: One Sentence Core",
        "Single sentence capturing essence",
        f"{PREFIX}, {p['ultra_short']}, "
        f"creature design, vivid, clean lines, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "E4: Two Sentence Rich",
        "Two sentences with key features",
        f"{PREFIX}, {p['short_desc']} "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "E5: Full Description",
        "Complete description, well-tagged",
        f"{PREFIX}, {p['medium_desc']} "
        f"creature design, anime style, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    # ─── CATEGORY F: Negative Prompt Experiments (26-30) ───

    good_pos = (
        f"{PREFIX}, pokemon \\(creature\\), {core}, "
        f"creature design, vivid, clean lines, "
        f"white_background, simple_background"
    )

    prompts.append(("F1: Standard Negative", "Baseline negative", good_pos, NEG_STD, None))

    prompts.append((
        "F2: Anti-Complexity Heavy",
        "Maximum simplicity enforcement",
        good_pos,
        (
            "lowres, worst quality, bad quality, text, watermark, signature, "
            "jpeg artifacts, human, humanoid, girl, boy, person, "
            "realistic, photo, 3d, ornate, elaborate, filigree, "
            "excessive detail, intricate, busy, cluttered, "
            "particles, sparkles, multiple effects, aura, "
            "complex background, scenery, gradient background, "
            "concept art, illustration, painting, sketch"
        ),
        None,
    ))

    prompts.append((
        "F3: Anti-Dark Anti-Real",
        "Block dark/gritty aesthetics and realism",
        good_pos,
        (
            "lowres, worst quality, bad quality, text, watermark, "
            "realistic, photo, photorealistic, 3d render, "
            "dark, gritty, horror, grimdark, noir, desaturated, "
            "muted colors, brown, grey, muddy, "
            "human, humanoid, complex background"
        ),
        None,
    ))

    prompts.append((
        "F4: No Humanoid Max",
        "Every possible human/anthropomorphic exclusion",
        good_pos,
        (
            "lowres, worst quality, bad quality, text, watermark, "
            "human, humanoid, person, girl, boy, man, woman, "
            "anthropomorphic, furry, kemono, hands, fingers, "
            "face, hair, clothing, dress, armor, weapon, "
            "bipedal, standing upright, complex background"
        ),
        None,
    ))

    prompts.append(("F5: Minimal Negative", "Almost no negative", good_pos, NEG_MIN, None))

    # ─── CATEGORY G: Weight & CFG Experiments (31-35) ───

    prompts.append((
        "G1: Heavy Creature Weight",
        "(creature:1.4) emphasis",
        f"masterpiece, best quality, no_humans, (creature_focus:1.3), solo, "
        f"full_body, (creature:1.4), (monster:1.2), "
        f"{p['tag_form']}, "
        f"creature design, white_background, simple_background",
        NEG_CREATURE, None,
    ))

    # Weight on element colors
    primary_color = p['colors'][0] if p['colors'] else 'colorful'
    prompts.append((
        "G2: Color Emphasis",
        f"Weight on {primary_color} for color fidelity",
        f"{PREFIX}, {p['type_tags']}, "
        f"({primary_color}:1.3), " +
        (f"({p['colors'][1]}:1.2), " if len(p['colors']) > 1 else "") +
        f"{p['feature_tags']}, "
        f"creature design, vivid, white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "G3: Simplicity Emphasis",
        "Weight on (simple_design:1.3)",
        f"{PREFIX}, (simple design:1.3), (clean lines:1.2), (flat color:1.1), "
        f"{core}, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "G4: Low CFG 3.0",
        "cfg=3.0 for creative freedom",
        f"{PREFIX}, {core}, glowing, "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_STD, 3.0,
    ))

    prompts.append((
        "G5: High CFG 7.0",
        "cfg=7.0 for max prompt adherence",
        f"{PREFIX}, {core}, glowing, "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_STD, 7.0,
    ))

    # ─── CATEGORY H: Creative Wild Cards (36-40) ───

    prompts.append((
        "H1: Yoshitoshi ABe Style",
        "Ethereal, haunting creature aesthetic",
        f"{PREFIX}, yoshitoshi abe \\(style\\), ethereal, haunting, "
        f"{core}, delicate, atmospheric, creature design, "
        f"white_background, simple_background",
        NEG_CREATURE, None,
    ))

    prompts.append((
        "H2: Sugimori x Watercolor",
        "Merge Sugimori + watercolor medium",
        f"{PREFIX}, ken sugimori \\(style\\), watercolor \\(medium\\), "
        f"pokemon \\(creature\\), soft shading, "
        f"{core}, gentle, clean, creature design, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "H3: Sticker Mascot",
        "Sticker/mascot commercial design",
        f"{PREFIX}, sticker, mascot design, logo, character design, "
        f"{p['type_tags']}, {p['color_tags']}, "
        f"big eyes, cute, rounded, simplified, "
        f"bold outline, flat color, vivid, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    prompts.append((
        "H4: Concept Sheet",
        "Character design sheet, multiple angles",
        f"masterpiece, best quality, no_humans, creature_focus, "
        f"character sheet, multiple views, turnaround, concept art, "
        f"{core}, front view, side view, creature design, clean, "
        f"white_background, simple_background",
        NEG_STD + ", single view", None,
    ))

    prompts.append((
        "H5: Ultimate Fusion",
        "Best elements combined",
        f"{PREFIX}, pokemon \\(creature\\), creature collector, cel shading, bold outline, "
        f"({p['type_tags']}:1.2), ({p['color_tags']}:1.1), "
        f"{p['feature_tags']}, "
        f"elegant, mysterious, vivid, clean, "
        f"white_background, simple_background",
        NEG_CLEAN, None,
    ))

    assert len(prompts) == 40, f"Expected 40 prompts, got {len(prompts)}"
    return prompts


# ═══════════════════════════════════════════════════════════════════
# ComfyUI workflow & execution (same as before)
# ═══════════════════════════════════════════════════════════════════

def create_workflow(prompt, negative, seed, filename_prefix, cfg_override=None):
    cfg = cfg_override if cfg_override is not None else CHECKPOINT["cfg"]
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT["file"]}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": CHECKPOINT["steps"], "cfg": cfg,
            "sampler_name": CHECKPOINT["sampler"], "scheduler": CHECKPOINT["scheduler"],
            "denoise": 1.0, "model": ["1", 0], "positive": ["2", 0],
            "negative": ["3", 0], "latent_image": ["4", 0]
        }},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {
            "images": ["6", 0], "filename_prefix": f"bakeoff_{filename_prefix}"
        }}
    }


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(COMFYUI_URL + "/prompt", data=data, headers={"Content-Type": "application/json"})
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
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        print(f"  Error: {status.get('messages', [])}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(3)
    return False


def download_result(prompt_id, out_dir, out_filename):
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
                url = f"{COMFYUI_URL}/view?{params}"
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)
                os.makedirs(out_dir, exist_ok=True)
                out_path = os.path.join(out_dir, out_filename)
                img = Image.open(tmp_path).convert("RGBA")
                img.save(out_path, "PNG")
                os.unlink(tmp_path)
                return out_path, os.path.getsize(out_path) / 1024
        print("  No output images found")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
# HTML generation
# ═══════════════════════════════════════════════════════════════════

CATEGORIES = [
    ("A", "Art Style References", "Which franchise/artist reference works best?", range(0, 5)),
    ("B", "Feature Spotlight", "Emphasize one hero feature with weight emphasis", range(5, 10)),
    ("C", "Rendering Style", "Same creature, different rendering approaches", range(10, 15)),
    ("D", "Composition & Pose", "Different viewing angles and poses", range(15, 20)),
    ("E", "Description Density", "How much detail to feed the model?", range(20, 25)),
    ("F", "Negative Prompt Experiments", "Same positive, varying negative strategies", range(25, 30)),
    ("G", "Weight & CFG Experiments", "ComfyUI weight syntax and CFG variations", range(30, 35)),
    ("H", "Creative Wild Cards", "Unusual and hybrid approaches", range(35, 40)),
]


def generate_html(creature_name, prompts, variant_indices, seed, out_dir):
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{creature_name} — Nova 16 Deep Dive (40 Prompts)</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }}
  h1 {{ text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }}
  .subtitle {{ text-align: center; color: #888; margin-bottom: 32px; font-size: 0.85rem; }}
  .category {{ margin-bottom: 40px; }}
  .cat-header {{ font-size: 1.2rem; font-weight: bold; color: #5ba8f5; margin-bottom: 2px; }}
  .cat-desc {{ font-size: 0.75rem; color: #666; margin-bottom: 14px; }}
  .grid {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }}
  .card {{ background: #14141f; border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; }}
  .card-label {{ font-size: 0.75rem; font-weight: bold; padding: 8px 10px 0; color: #c77dff; }}
  .card-desc {{ font-size: 0.6rem; padding: 2px 10px 4px; color: #666; }}
  .card img {{ width: 100%; aspect-ratio: 1; object-fit: cover; }}
  .card .meta {{ padding: 4px 10px 6px; font-size: 0.6rem; color: #555; }}
  @media (max-width: 1200px) {{ .grid {{ grid-template-columns: repeat(3, 1fr); }} }}
  @media (max-width: 700px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} }}
</style>
</head>
<body>
<h1>{creature_name} — Nova 16 Deep Dive</h1>
<div class="subtitle">40 prompt strategies | Nova v16 @ cfg=5.0 | seed: {seed}</div>
"""

    vi_set = set(variant_indices)
    for cat_id, cat_name, cat_desc, cat_range in CATEGORIES:
        cat_indices = [i for i in cat_range if i in vi_set]
        if not cat_indices:
            continue
        html += f'<div class="category">\n'
        html += f'<div class="cat-header">Category {cat_id}: {cat_name}</div>\n'
        html += f'<div class="cat-desc">{cat_desc}</div>\n'
        html += '<div class="grid">\n'
        for i in cat_indices:
            label, desc, _, _, cfg_override = prompts[i]
            cfg = cfg_override if cfg_override is not None else CHECKPOINT["cfg"]
            fname = f"p{i+1:02d}.png"
            fpath = os.path.join(out_dir, fname)
            html += '<div class="card">\n'
            html += f'<div class="card-label">{label}</div>\n'
            html += f'<div class="card-desc">{desc}</div>\n'
            if os.path.exists(fpath):
                html += f'<img src="{fname}" alt="{label}">\n'
            else:
                html += ('<div style="aspect-ratio:1;background:#1a1a2a;display:flex;'
                         'align-items:center;justify-content:center;color:#555;">PENDING</div>\n')
            html += f'<div class="meta">cfg={cfg}</div>\n'
            html += '</div>\n'
        html += '</div>\n</div>\n'

    html += '</body></html>'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "bakeoff.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

def load_creatures():
    creatures = {}
    for path in [
        os.path.join(PROJECT_ROOT, "data", "creatures.json"),
        os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json"),
    ]:
        if os.path.exists(path):
            with open(path) as f:
                for c in json.load(f):
                    creatures[c["id"]] = c
    return creatures


def main():
    parser = argparse.ArgumentParser(description="Nova 16 deep-dive: 40 prompts for any creature")
    parser.add_argument("creature_id", help="Creature ID to generate")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--variants", nargs="*", type=int, help="Only specific prompt numbers (1-40)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    all_creatures = load_creatures()
    if args.creature_id not in all_creatures:
        print(f"Unknown creature: {args.creature_id}")
        print("Available:", ", ".join(sorted(all_creatures.keys())[:20]))
        sys.exit(1)

    creature = all_creatures[args.creature_id]
    profile = extract_creature_profile(creature)
    name = profile["name"]

    out_dir = os.path.join(PROJECT_ROOT, "bakeoff-output", f"nova40-{args.creature_id}")
    all_prompts = build_prompts(profile)

    if args.variants:
        variant_indices = [v - 1 for v in args.variants if 1 <= v <= 40]
    else:
        variant_indices = list(range(40))

    total = len(variant_indices)

    print("=" * 64)
    print(f"  NOVA 16 DEEP DIVE — {name} ({args.creature_id})")
    print(f"  Element:   {profile['element']}  |  Type: {profile['creature_type']}")
    print(f"  Model:     {CHECKPOINT['label']}")
    print(f"  Seed:      {args.seed}")
    print(f"  Prompts:   {total} / 40")
    print(f"  Output:    {os.path.relpath(out_dir, PROJECT_ROOT)}/")
    if args.dry_run:
        print(f"  *** DRY RUN ***")
    print("=" * 64)

    job_num = 0
    success = 0
    failed = []

    for cat_id, cat_name, cat_desc, cat_range in CATEGORIES:
        cat_indices = [i for i in cat_range if i in variant_indices]
        if not cat_indices:
            continue

        print(f"\n{'━' * 64}")
        print(f"  Category {cat_id}: {cat_name}")
        print(f"{'━' * 64}")

        for i in cat_indices:
            label, desc, positive, negative, cfg_override = all_prompts[i]
            cfg = cfg_override if cfg_override is not None else CHECKPOINT["cfg"]
            job_num += 1

            print(f"\n  [{job_num}/{total}] {label} (cfg={cfg})")

            if args.dry_run:
                print(f"    POS: {positive[:120]}...")
                print(f"    NEG: {negative[:80]}...")
                continue

            fname_prefix = f"nova40_{args.creature_id}/p{i+1:02d}"
            workflow = create_workflow(positive, negative, args.seed, fname_prefix, cfg_override)
            prompt_id = queue_prompt(workflow)

            if prompt_id:
                print(f"    Queued...", end="", flush=True)
                if wait_for_completion(prompt_id, timeout=args.timeout):
                    result = download_result(prompt_id, out_dir, f"p{i+1:02d}.png")
                    if result:
                        path, size_kb = result
                        print(f" OK ({size_kb:.0f}KB)")
                        success += 1
                    else:
                        print(f" DOWNLOAD FAILED")
                        failed.append(label)
                else:
                    print(f" TIMEOUT/ERROR")
                    failed.append(label)
            else:
                print(f"    QUEUE ERROR")
                failed.append(label)

            time.sleep(1)

    html_path = generate_html(name, all_prompts, variant_indices, args.seed, out_dir)

    print("\n" + "=" * 64)
    if args.dry_run:
        print(f"  DRY RUN: {total} prompts previewed")
    else:
        print(f"  COMPLETE: {success}/{total} images generated")
        if failed:
            print(f"  Failed: {', '.join(failed)}")
    print(f"  HTML: {html_path}")
    print("=" * 64)


if __name__ == "__main__":
    main()
