# Creature Forge Description Divergence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite Section 8 of the creature-forge skill to produce 3 wildly different creature descriptions instead of 3 variations of the same concept.

**Architecture:** Single-file edit to `~/.claude/skills/creature-forge/SKILL.md`. Replace lines 171-191 (Section 8) with the new divergence-axes text from the approved design doc.

**Tech Stack:** Markdown skill file (no code changes)

---

### Task 1: Replace Section 8 in SKILL.md

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/SKILL.md:171-191`
- Reference: `/Users/michia/Documents/jrpg/docs/plans/2026-02-15-creature-forge-description-divergence-design.md` (lines 44-75 contain the exact replacement text)

**Step 1: Replace Section 8**

Use the Edit tool to replace the old Section 8 (lines 171-191) with the new text from the design doc's "New Section 8 Text" code block. The replacement spans from `### 8 — Description (pick 1 of 3)` up to (but not including) the blank line before `### 9 — Concept Art Preview`.

Old text to replace (lines 171-191):

```markdown
### 8 — Description (pick 1 of 3)

**This section begins Pass 2.** All identity is now locked: name, base word, attack, ultimate, archetype, element, and modifier. The descriptions must incorporate ALL of these.

Present **3 visual descriptions** labeled A, B, C. Each description must:

- Be **5-8 sentences long**
- Reference the chosen **modifier** in the creature's visual design (e.g., "Ancient" → weathered, fossilized, crumbling details)
- Reflect the chosen **element** through colors, particle effects, and materials
- Hint at the creature's **moveset** in its physical features (e.g., a creature with "Freeze" might have icy crystalline growths)
- Match the **archetype** in body language and posture (Fighter = aggressive stance, Tank = sturdy and grounded)
- Be vivid enough for a concept artist or image generation model to work from
- Include: body shape, colors, textures, distinctive features, personality traits, glowing or particle effects
- Reference the base word's object or animal in the creature's physical design
- Vary the openings — don't start every description the same way

Write descriptions in the anime creature collector style (Pokemon meets Genshin Impact): vivid elemental effects, cel-shaded lighting, detailed textures, expressive eyes. NOT chibi — proper proportions but still stylized and cute.

Example quality level (from existing creatures.json): "This ancient creature carries a shell that resembles a crumbling temple dome, its surface covered in overlapping plates of oxidized bronze and deep jade stone. Cracks along the shell's ridges leak a slow, honey-colored light — old energy that has been accumulating for millennia."

Do NOT ask the user to pick yet — Section 9 will generate concept art images for all 3 descriptions first.
```

New text:

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

**Step 2: Verify the edit**

Read the file around lines 170-200 to confirm Section 8 has the new divergence axes and Section 9 is untouched.

**Step 3: Commit**

```bash
git add /Users/michia/.claude/skills/creature-forge/SKILL.md
git commit -m "feat(creature-forge): add divergence axes to Section 8 descriptions"
```
