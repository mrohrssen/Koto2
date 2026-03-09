#!/usr/bin/env python3
"""
Nova 16 deep-dive bakeoff: 40 prompt strategies for Chouri.

All prompts target novaAnimeXL_ilV160 at cfg=5.0, fixed seed for fair comparison.
Organized into 8 categories of 5 prompts each.

Usage:
  python scripts/bakeoff_nova40.py
  python scripts/bakeoff_nova40.py --dry-run
  python scripts/bakeoff_nova40.py --variants 1 5 12 30   # specific prompts only
  python scripts/bakeoff_nova40.py --seed 999999           # different seed
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "bakeoff-output", "nova40")
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
# Chouri description components (mix & match in prompts)
# ═══════════════════════════════════════════════════════════════════

ULTRA_SHORT = (
    "slender jade-crystal moth creature with four enormous translucent wings "
    "and glowing fractal antennae"
)

SHORT_DESC = (
    "A slender moth-like creature with four enormous wings made of translucent "
    "jade crystal, each pane refracting light into prismatic afterimages. "
    "Pale green glass-like chitin body with hairline fractures leaking teal mist."
)

TAG_FORM = (
    "moth, insect, wings, spread_wings, crystal wings, jade green, "
    "translucent, compound_eyes, antennae, glowing, slender, "
    "pale green, chitin"
)

# ═══════════════════════════════════════════════════════════════════
# Negative prompt variants
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
# 40 PROMPTS — 8 categories × 5 each
# Each: (label, description, positive, negative, cfg_override)
# cfg_override=None means use checkpoint default (5.0)
# ═══════════════════════════════════════════════════════════════════


def build_prompts():
    prompts = []

    # ─────────────────────────────────────────────────────────────
    # CATEGORY A: Art Style References (1-5)
    # Which franchise/artist reference steers Nova 16 best?
    # ─────────────────────────────────────────────────────────────

    # A1: Ken Sugimori / Pokemon creature
    prompts.append((
        "A1: Sugimori Pokemon",
        "Pokemon artist ref + condensed Chouri desc",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"ken sugimori \\(style\\), pokemon \\(creature\\), "
        f"moth creature, four crystal wings, jade green, translucent wings, "
        f"spread_wings, glowing antennae, compound_eyes, pale green chitin body, "
        f"simple design, clean lines, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # A2: Nexomon / creature collector style
    prompts.append((
        "A2: Nexomon Collector",
        "Creature collector genre + expressive design tags",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"creature collector, monster tamer, monster design, "
        f"moth creature, crystal wings, jade green, translucent wings, "
        f"spread_wings, glowing fractal antennae, large compound eyes, "
        f"bold outline, vivid colors, expressive, rounded shapes, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # A3: Digimon style — more angular, detailed, dramatic
    prompts.append((
        "A3: Digimon Style",
        "Digimon franchise ref for bolder creature design",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"digimon, monster, creature, "
        f"moth creature, four crystal wings, jade green, translucent, "
        f"spread_wings, long antennae, compound_eyes, pale green armor, "
        f"dynamic, bold design, vivid colors, clean lines, "
        f"white_background, simple_background",
        NEG_STD,
        None,
    ))

    # A4: Monster Rancher — softer, rounder, toy-like
    prompts.append((
        "A4: Monster Rancher",
        "Softer monster design, toy-like appeal",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"monster rancher, game creature, cute monster, "
        f"moth creature, crystal wings, jade green, translucent wings, "
        f"big eyes, antennae, rounded body, soft shapes, "
        f"pastel jade, gentle, friendly, clean design, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # A5: Temtem — modern indie creature collector, clean cel shading
    prompts.append((
        "A5: Modern Indie Collector",
        "Temtem/Coromon-like modern clean creature design",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"game art, character design, indie game, cel shading, "
        f"moth creature, crystal wings, jade green, translucent wings, "
        f"spread_wings, antennae, compound_eyes, slender body, "
        f"flat color, bold outline, limited palette, clean, modern, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY B: Feature Spotlight (6-10)
    # Emphasize one hero feature of Chouri with weight emphasis
    # ─────────────────────────────────────────────────────────────

    # B1: Crystal Wings spotlight
    prompts.append((
        "B1: Crystal Wings Focus",
        "Heavy weight on translucent jade crystal wings",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (four translucent jade crystal wings:1.3), "
        f"spread_wings, (refracting prismatic light:1.2), "
        f"slender body, pale green chitin, antennae, compound_eyes, "
        f"creature design, vivid colors, clean lines, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # B2: Fractal Antennae spotlight
    prompts.append((
        "B2: Fractal Antennae Focus",
        "Heavy weight on glowing fractal antennae",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (long curled antennae:1.3), "
        f"(fractal branching tips:1.2), (glowing antennae:1.2), "
        f"crystal wings, jade green, translucent wings, spread_wings, "
        f"compound_eyes, slender body, creature design, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # B3: Compound Eyes spotlight
    prompts.append((
        "B3: Mesmerizing Eyes Focus",
        "Heavy weight on huge shifting compound eyes",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (enormous compound eyes:1.3), "
        f"(emerald eyes:1.2), (color-shifting eyes:1.1), "
        f"crystal wings, jade green, translucent, spread_wings, "
        f"antennae, slender body, mesmerizing, hypnotic, "
        f"creature design, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # B4: Glass Chitin Body spotlight
    prompts.append((
        "B4: Glass Chitin Body Focus",
        "Heavy weight on cracked glass-like chitin surface",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (pale green glass-like chitin:1.3), "
        f"(hairline cracks:1.2), (teal mist:1.1), "
        f"crystal wings, jade green, translucent wings, spread_wings, "
        f"antennae, compound_eyes, elegant, slender, "
        f"creature design, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # B5: Phantom Afterimages spotlight
    prompts.append((
        "B5: Phantom Copies Focus",
        "Heavy weight on illusory afterimage copies",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (afterimage:1.3), (phantom copies:1.2), "
        f"(translucent duplicates:1.2), motion blur, "
        f"crystal wings, jade green, spread_wings, "
        f"antennae, compound_eyes, ethereal, mysterious, "
        f"creature design, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY C: Rendering Style (11-15)
    # Same core description, different rendering approaches
    # ─────────────────────────────────────────────────────────────

    core_creature = (
        "moth creature, four crystal wings, jade green, translucent wings, "
        "spread_wings, antennae, compound_eyes, slender body, pale green chitin"
    )

    # C1: Cel shading + bold outline
    prompts.append((
        "C1: Cel Shaded Bold",
        "Hard cel shading with bold outlines",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"cel shading, bold outline, thick lineart, flat color, "
        f"{core_creature}, vivid colors, clean, sharp, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # C2: Soft watercolor
    prompts.append((
        "C2: Watercolor Soft",
        "Watercolor medium with soft edges",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"watercolor \\(medium\\), soft shading, gentle colors, "
        f"{core_creature}, pastel, delicate, ethereal, dreamy, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # C3: Flat vector / limited palette
    prompts.append((
        "C3: Flat Vector",
        "Vector art feel with limited color palette",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"flat color, vector art, limited palette, graphic design, "
        f"{core_creature}, clean shapes, minimal, bold, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # C4: Smooth airbrush gradient
    prompts.append((
        "C4: Airbrush Gradient",
        "Smooth airbrushed shading with gradients",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"airbrush, smooth shading, gradient, soft lighting, "
        f"{core_creature}, luminous, glowing, polished, "
        f"white_background, simple_background",
        NEG_STD,
        None,
    ))

    # C5: Ink lineart with color fill
    prompts.append((
        "C5: Ink + Color Fill",
        "Clean ink lines with flat color fill, manga-inspired",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"lineart, ink, color fill, manga style, clean lines, "
        f"{core_creature}, vivid, sharp outline, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY D: Composition & Pose (16-20)
    # Different viewing angles and poses
    # ─────────────────────────────────────────────────────────────

    style_tags = "creature design, clean lines, vivid colors"

    # D1: Spread wings, front view, eye contact
    prompts.append((
        "D1: Front Spread Wings",
        "Frontal symmetric pose with wings fully spread",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"front view, looking_at_viewer, spread_wings, symmetrical, "
        f"moth creature, four jade crystal wings, translucent, "
        f"antennae, compound_eyes, pale green chitin, {style_tags}, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # D2: 3/4 view, wings partially folded, perched
    prompts.append((
        "D2: Perched 3/4 View",
        "Three-quarter angle, wings folded, resting pose",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"three-quarter view, wings folded, perched, resting, "
        f"moth creature, jade crystal wings, translucent, "
        f"antennae, compound_eyes, pale green chitin, calm, serene, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # D3: Dynamic flying pose, slight from below
    prompts.append((
        "D3: Dynamic Flight",
        "Flying upward with dynamic wing motion",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"flying, from_below, dynamic pose, spread_wings, motion, "
        f"moth creature, four jade crystal wings, translucent, "
        f"antennae, compound_eyes, trailing afterimages, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # D4: Wings creating prismatic halo, centered composition
    prompts.append((
        "D4: Prismatic Halo",
        "Wings arranged in halo-like pattern with light refraction",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"centered composition, moth creature, "
        f"four jade crystal wings arranged in halo pattern, "
        f"prismatic light, refracting, translucent, "
        f"antennae, compound_eyes, ethereal, mystical, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # D5: Side profile, elegant silhouette
    prompts.append((
        "D5: Elegant Profile",
        "Side view emphasizing graceful silhouette",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"profile view, side view, elegant, graceful silhouette, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"long antennae, compound_eyes, slender body, "
        f"{style_tags}, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY E: Description Density (21-25)
    # How much detail to feed the model
    # ─────────────────────────────────────────────────────────────

    # E1: Ultra minimal — just core identity
    prompts.append((
        "E1: Ultra Minimal Tags",
        "Bare minimum tags: jade crystal moth + style",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"jade crystal moth, spread_wings, green, translucent, glowing, "
        f"creature design, cute, clean, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # E2: Danbooru tags only, zero prose
    prompts.append((
        "E2: Pure Danbooru Tags",
        "Only recognized booru tags, no natural language",
        f"masterpiece, best quality, no_humans, creature_focus, original, solo, "
        f"full_body, moth, insect, wings, spread_wings, 4wings, "
        f"crystal, jade, green_theme, translucent, glowing, "
        f"antennae, compound_eyes, slender, "
        f"looking_at_viewer, white_background, simple_background",
        NEG_CREATURE,
        None,
    ))

    # E3: One-sentence identity
    prompts.append((
        "E3: One Sentence Core",
        "Single sentence capturing Chouri's essence",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"{ULTRA_SHORT}, "
        f"spread_wings, creature design, vivid, clean lines, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # E4: Two-sentence with key features
    prompts.append((
        "E4: Two Sentence Rich",
        "Two sentences covering wings + body detail",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"{SHORT_DESC} "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # E5: Full structured description
    prompts.append((
        "E5: Full Description",
        "Complete Chouri description, well-tagged",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"A slender moth-like creature with four enormous wings made of "
        f"translucent jade crystal refracting prismatic light. "
        f"Elongated smooth body in pale green glass chitin with hairline "
        f"cracks leaking teal mist. Long curled antennae with fractal "
        f"branching tips that glow. Enormous shifting compound eyes. "
        f"creature design, anime style, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY F: Negative Prompt Experiments (26-30)
    # Same strong positive, varying negatives
    # ─────────────────────────────────────────────────────────────

    good_pos = (
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"pokemon \\(creature\\), moth creature, four jade crystal wings, "
        f"translucent, spread_wings, glowing antennae, compound_eyes, "
        f"pale green chitin, creature design, vivid, clean lines, "
        f"white_background, simple_background"
    )

    # F1: Standard negative
    prompts.append((
        "F1: Standard Negative",
        "Baseline negative prompt for comparison",
        good_pos,
        NEG_STD,
        None,
    ))

    # F2: Aggressive anti-complexity
    prompts.append((
        "F2: Anti-Complexity Heavy",
        "Maximum simplicity enforcement in negatives",
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

    # F3: Anti-dark + anti-realistic
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

    # F4: Maximum non-human enforcement
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

    # F5: Minimal negative
    prompts.append((
        "F5: Minimal Negative",
        "Almost no negative — let the model be free",
        good_pos,
        NEG_MIN,
        None,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY G: Weight & CFG Experiments (31-35)
    # Play with ComfyUI weight syntax and cfg values
    # ─────────────────────────────────────────────────────────────

    # G1: Heavy creature weight
    prompts.append((
        "G1: Heavy Creature Weight",
        "(creature:1.4) emphasis to enforce creature-ness",
        f"masterpiece, best quality, no_humans, (creature_focus:1.3), solo, "
        f"full_body, (creature:1.4), (monster:1.2), "
        f"moth, four crystal wings, jade green, translucent, spread_wings, "
        f"antennae, compound_eyes, pale green chitin, "
        f"creature design, white_background, simple_background",
        NEG_CREATURE,
        None,
    ))

    # G2: Jade/crystal color emphasis
    prompts.append((
        "G2: Jade Crystal Emphasis",
        "Weight on jade/crystal/green for color fidelity",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, (jade:1.3), (crystal:1.3), (translucent:1.2), "
        f"(green_theme:1.2), four wings, spread_wings, "
        f"antennae, compound_eyes, glass-like body, teal, "
        f"creature design, vivid, white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # G3: Simple design weight
    prompts.append((
        "G3: Simplicity Emphasis",
        "Weight on (simple_design:1.3) to fight complexity",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"(simple design:1.3), (clean lines:1.2), (flat color:1.1), "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, compound_eyes, pale green, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # G4: Low CFG (3.0) for loose interpretation
    prompts.append((
        "G4: Low CFG 3.0",
        "cfg=3.0 for creative model freedom",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, compound_eyes, pale green chitin, glowing, "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_STD,
        3.0,
    ))

    # G5: High CFG (7.0) for strict adherence
    prompts.append((
        "G5: High CFG 7.0",
        "cfg=7.0 for maximum prompt adherence",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, compound_eyes, pale green chitin, glowing, "
        f"creature design, vivid, clean, "
        f"white_background, simple_background",
        NEG_STD,
        7.0,
    ))

    # ─────────────────────────────────────────────────────────────
    # CATEGORY H: Creative Wild Cards (36-40)
    # Unusual or hybrid approaches
    # ─────────────────────────────────────────────────────────────

    # H1: Specific anime artist known for creature/monster art
    prompts.append((
        "H1: Yoshitoshi ABe Style",
        "Yoshitoshi ABe's ethereal, haunting creature aesthetic",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"yoshitoshi abe \\(style\\), ethereal, haunting, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, compound_eyes, pale, muted jade, "
        f"delicate, atmospheric, creature design, "
        f"white_background, simple_background",
        NEG_CREATURE,
        None,
    ))

    # H2: Sugimori + Watercolor hybrid (merge best two from round 1)
    prompts.append((
        "H2: Sugimori × Watercolor",
        "Merge V1 + V9 winners: Sugimori style + watercolor medium",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"ken sugimori \\(style\\), watercolor \\(medium\\), "
        f"pokemon \\(creature\\), soft shading, "
        f"moth creature, four jade crystal wings, translucent, "
        f"spread_wings, antennae, compound_eyes, pale green chitin, "
        f"gentle, clean, creature design, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # H3: Sticker / mascot design
    prompts.append((
        "H3: Sticker Mascot",
        "Sticker/mascot commercial design feel",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"sticker, mascot design, logo, character design, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, big eyes, cute, rounded, simplified, "
        f"bold outline, flat color, vivid, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    # H4: Concept art turnaround sheet
    prompts.append((
        "H4: Concept Sheet",
        "Character design sheet with multiple angles",
        f"masterpiece, best quality, no_humans, creature_focus, "
        f"character sheet, multiple views, turnaround, concept art, "
        f"moth creature, jade crystal wings, translucent, spread_wings, "
        f"antennae, compound_eyes, pale green chitin, "
        f"front view, side view, creature design, clean, "
        f"white_background, simple_background",
        NEG_STD + ", single view",
        None,
    ))

    # H5: Nexomon + Cel shade + Phantom theme (best-of-everything)
    prompts.append((
        "H5: Ultimate Fusion",
        "Best elements: collector style + cel shade + phantom identity",
        f"masterpiece, best quality, no_humans, creature_focus, solo, full_body, "
        f"pokemon \\(creature\\), creature collector, cel shading, bold outline, "
        f"moth creature, (four translucent jade crystal wings:1.2), "
        f"(refracting prismatic light:1.1), spread_wings, "
        f"(glowing fractal antennae:1.1), large compound_eyes, "
        f"pale green glass chitin, (phantom afterimages:1.1), "
        f"elegant, mysterious, vivid, clean, "
        f"white_background, simple_background",
        NEG_CLEAN,
        None,
    ))

    return prompts


# ═══════════════════════════════════════════════════════════════════
# ComfyUI workflow & execution
# ═══════════════════════════════════════════════════════════════════

def create_workflow(prompt, negative, seed, filename_prefix, cfg_override=None):
    cfg = cfg_override if cfg_override is not None else CHECKPOINT["cfg"]
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT["file"]}
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
                "seed": seed,
                "steps": CHECKPOINT["steps"],
                "cfg": cfg,
                "sampler_name": CHECKPOINT["sampler"],
                "scheduler": CHECKPOINT["scheduler"],
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
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"bakeoff_nova40/{filename_prefix}"
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


def download_result(prompt_id, out_filename):
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
                    "filename": filename, "subfolder": subfolder, "type": filetype,
                })
                url = f"{COMFYUI_URL}/view?{params}"
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                    urllib.request.urlretrieve(url, tmp_path)
                os.makedirs(OUTPUT_DIR, exist_ok=True)
                out_path = os.path.join(OUTPUT_DIR, out_filename)
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


def generate_html(prompts, variant_indices, seed):
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Chouri — Nova 16 Deep Dive (40 Prompts)</title>
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
<h1>Chouri — Nova 16 Deep Dive</h1>
<div class="subtitle">40 prompt strategies | Nova v16 @ cfg=5.0 | seed: {seed}</div>
"""

    vi_set = set(variant_indices)
    for cat_id, cat_name, cat_desc, cat_range in CATEGORIES:
        # Only show category if any of its prompts were generated
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
            fpath = os.path.join(OUTPUT_DIR, fname)

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
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "bakeoff.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Nova 16 deep-dive: 40 prompts for Chouri")
    parser.add_argument("--dry-run", action="store_true", help="Preview prompts without generating")
    parser.add_argument("--variants", nargs="*", type=int,
                        help="Only run specific prompt numbers (1-40)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Fixed seed (default: 424242)")
    parser.add_argument("--timeout", type=int, default=300, help="Per-image timeout in seconds")
    args = parser.parse_args()

    all_prompts = build_prompts()
    assert len(all_prompts) == 40, f"Expected 40 prompts, got {len(all_prompts)}"

    if args.variants:
        variant_indices = [v - 1 for v in args.variants if 1 <= v <= 40]
    else:
        variant_indices = list(range(40))

    total = len(variant_indices)

    print("=" * 64)
    print(f"  NOVA 16 DEEP DIVE — Chouri (40 Prompts)")
    print(f"  Model:     {CHECKPOINT['label']} ({CHECKPOINT['file']})")
    print(f"  CFG:       {CHECKPOINT['cfg']} (default, some overrides)")
    print(f"  Seed:      {args.seed}")
    print(f"  Prompts:   {total} / 40")
    print(f"  Output:    bakeoff-output/nova40/")
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
        print(f"  {cat_desc}")
        print(f"{'━' * 64}")

        for i in cat_indices:
            label, desc, positive, negative, cfg_override = all_prompts[i]
            cfg = cfg_override if cfg_override is not None else CHECKPOINT["cfg"]
            job_num += 1

            print(f"\n  [{job_num}/{total}] {label} (cfg={cfg})")
            print(f"           {desc}")

            if args.dry_run:
                print(f"    POS: {positive[:120]}...")
                print(f"    NEG: {negative[:80]}...")
                continue

            fname = f"p{i+1:02d}"
            workflow = create_workflow(positive, negative, args.seed, fname, cfg_override)
            prompt_id = queue_prompt(workflow)

            if prompt_id:
                print(f"    Queued, waiting...", end="", flush=True)
                if wait_for_completion(prompt_id, timeout=args.timeout):
                    result = download_result(prompt_id, f"p{i+1:02d}.png")
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

    # Always generate HTML (shows PENDING for missing images)
    html_path = generate_html(all_prompts, variant_indices, args.seed)

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
