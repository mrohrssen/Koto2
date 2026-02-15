# Creature Forge: Description Divergence

**Date:** 2026-02-15
**Status:** Approved

## Problem

The creature forge skill generates 3 visual descriptions (Section 8) that converge on the same visual concept — same colors, materials, proportions, and personality. The resulting concept art images also look nearly identical. Users want 3 genuinely different creature interpretations to choose from.

## Solution

Rewrite Section 8 of the creature-forge skill (`~/.claude/skills/creature-forge/SKILL.md`) to force creative divergence across explicit axes before writing descriptions.

## Divergence Axes

Each description must differ from the others across these dimensions:

- **Material palette:** No two descriptions share a primary material (e.g., crystalline vs organic/fur vs metallic/armored)
- **Color palette:** No two descriptions share a dominant color family
- **Personality & demeanor:** Different temperaments (regal vs feral vs playful)
- **Silhouette & body shape:** Different proportions and stance (sleek predator vs stocky boulder vs wispy/flowing)
- **Surface texture & detail language:** Different tactile qualities (smooth glass vs rough bark vs feathered plumage)

Size is NOT a required axis of variation — creatures can be similar sizes.

## Key Additions to Section 8

1. **Brainstorm-first instruction** — AI must conceive 3 different concepts before writing any prose
2. **Divergence axes checklist** — material, color, personality, silhouette, texture
3. **Failure check** — "if you can swap the names between two descriptions and they'd still work, they're too similar"
4. **Re-interpretation guidance** — same modifier/element can manifest through totally different materials (e.g., "Ancient" as fossilized stone OR weathered driftwood OR faded celestial markings; Metal as liquid mercury OR hammered bronze OR magnetic iron filings)
5. **"3 concept artists" framing** — mental model: 3 artists at a studio each given the same brief, each taking a wildly different direction

## Scope

- **Only file changed:** `~/.claude/skills/creature-forge/SKILL.md`, Section 8
- No backend or frontend changes
- No changes to the image generation flow (Section 9)
- No changes to Sections 1-7

## New Section 8 Text

```markdown
### 8 — Description (pick 1 of 3)

**This section begins Pass 2.** All identity is now locked: name, base word, attack, ultimate, archetype, element, and modifier.

**Before writing ANY descriptions, brainstorm 3 wildly different creature concepts.** Each concept should feel like it belongs in a completely different monster-collecting game. Vary across these divergence axes:

- **Material palette:** No two descriptions should share a primary material (e.g., one crystalline, one organic/fur-covered, one metallic/armored)
- **Color palette:** No two descriptions should share a dominant color family
- **Personality & demeanor:** Each creature has a different temperament (e.g., regal and composed vs feral and twitchy vs playful and mischievous)
- **Silhouette & body shape:** Different proportions, stance, and overall outline (e.g., sleek predator vs stocky boulder vs wispy and flowing)
- **Surface texture & detail language:** Different tactile qualities (e.g., smooth glass vs rough bark vs feathered plumage)

**Failure check:** If you can swap the names between two descriptions and they'd still work, they're too similar. Start that description over.

Present **3 visual descriptions** labeled A, B, C. Each description must:

- Be **5-8 sentences long**
- Reference the chosen **modifier** in the creature's visual design — but interpret it differently (e.g., "Ancient" could mean fossilized stone OR weathered driftwood OR faded celestial markings)
- Reflect the chosen **element** — but through different material expressions (e.g., Metal could manifest as liquid mercury, hammered bronze, or magnetic iron filings)
- Hint at the creature's **moveset** in its physical features
- Match the **archetype** in body language and posture
- Be vivid enough for a concept artist or image generation model to produce distinctly different images
- Include: body shape, colors, textures, distinctive features, personality traits, glowing or particle effects
- Reference the base word's object or animal in the creature's physical design — but each should transform it differently

Write descriptions in the anime creature collector style (Pokemon meets Genshin Impact): vivid elemental effects, cel-shaded lighting, detailed textures, expressive eyes. NOT chibi — proper proportions but still stylized and cute.

**Think of it this way:** You're 3 different concept artists at a game studio, each given the same brief. Each one took the creature in a completely different visual direction. The studio will pick the one that fits their game best.

Example quality level (from existing creatures.json): "This ancient creature carries a shell that resembles a crumbling temple dome, its surface covered in overlapping plates of oxidized bronze and deep jade stone. Cracks along the shell's ridges leak a slow, honey-colored light — old energy that has been accumulating for millennia."

Do NOT ask the user to pick yet — Section 9 will generate concept art images for all 3 descriptions first.
```
