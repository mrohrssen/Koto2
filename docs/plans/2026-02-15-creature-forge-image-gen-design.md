# Creature Forge: Image Generation & Flow Restructuring

**Date:** 2026-02-15
**Status:** Approved

## Problem

The creature-forge skill generates text descriptions, but it's hard to visualize what a creature actually looks like from text alone. Additionally, the current section order is wrong — descriptions (Section 7) come before modifiers (Section 8), but the modifier fundamentally changes the creature's appearance ("Ancient Turtle" vs "Young Turtle").

## Solution

Two changes:

1. **Restructure into two passes** — lock in identity/stats first (including modifier with appearance sketches), then generate descriptions and images with full context.
2. **Add Section 9: Concept Art Preview** — generate 3 images via OpenAI `gpt-image-1.5` and display them in a Playwright browser window.

## Flow Restructuring

### Pass 1 — Identity (Sections 1-7)

Sections 1-6 unchanged:
1. Name
2. Japanese Vocab (Base Word)
3. Attack Skills (pick 1 of 3)
4. Ultimate Ability (pick 1 of 3)
5. Archetype
6. Element

Section 7 is now **Modifier** (moved up from old Section 8). Each modifier candidate includes a 1-2 sentence **appearance sketch** — not a full description, just enough to show how the modifier pulls the visual direction:

| # | Japanese | Reading | Meaning | Rank | Appearance Sketch |
|---|----------|---------|---------|------|-------------------|
| A | 古代 | こだい | Ancient | 5500 | Crumbling temple-dome shell, oxidized bronze plates, fossilized coral in legs, dusty golden aura |
| B | 静か | しずか | Quiet | 2100 | Smooth pale shell, muted blue-grey tones, misty vapor trail, contemplative half-closed eyes |
| C | 野生 | やせい | Wild | 4800 | Jagged cracked shell with thorny overgrowth, battle scars, feral glowing eyes, trailing moss |

Once the user picks a modifier, all identity is locked.

### Pass 2 — Visuals (Sections 8-9)

**Section 8: Description** (old Section 7). Now written with full knowledge of the locked modifier, moveset, archetype, and element. Descriptions reference all of these.

**Section 9: Concept Art Preview** (new). Generates 3 images from the 3 Section 8 descriptions and shows them in a browser.

Summary table and approval flow remain at the end, unchanged.

## Image Generation Details

### API

- **Model:** `gpt-image-1.5` (OpenAI's latest, recommended)
- **Endpoint:** `POST https://api.openai.com/v1/images/generations`
- **API key:** Read from `data/.creature-forge-openai-key`
- **Parameters:** size `1024x1024` (minimum supported), quality `medium` AND `high` (both generated for comparison). No `response_format` param — model returns `b64_json` by default
- **Cost (A/B test mode):** ~$0.50 per creature (6 images: 3 medium at ~$0.034 each + 3 high at ~$0.133 each). After the user decides which quality tier is sufficient, this drops to either ~$0.10 (medium only) or ~$0.40 (high only)

### Prompt Template

Each image wraps the creature description in a style directive:

```
Game-ready creature design, single character on plain white background,
full body, front-facing idle pose. Anime creature collector style
(Pokemon meets Genshin Impact) — vivid elemental effects, cel-shaded
lighting, detailed textures, expressive eyes. NOT chibi — proper
proportions but still stylized and cute. No text, no UI, no humans.

Creature: [Name] the [Modifier] [BaseMeaning]
Element: [Element]
Archetype: [Archetype]
Moves: [Attack] / [Ultimate]

Visual description: [Full description text from Section 8]
```

### Execution Flow

1. After Section 8 descriptions are presented, skill says "Generating concept art..."
2. Run 3 `curl` calls in parallel (one per description A/B/C)
3. Decode base64 → save to `/tmp/creature-forge-{id}-a.png`, `-b.png`, `-c.png`
4. Generate HTML preview at `/tmp/creature-forge-{id}-preview.html` — images referenced via relative paths
5. Serve `/tmp` via `python3 -m http.server 8787` (Playwright blocks `file://` URLs), open via `browser_navigate`
6. Images are ephemeral — `/tmp` cleans up naturally

### Error Handling

- Missing API key file: skip Section 9 with a message, descriptions still work
- Generation failure: show whichever images succeeded, note the failure

## Browser Preview

### HTML Layout

Dark-themed page (matching game's cyberpunk aesthetic):

- **Header:** Creature name, modifier, element badge, archetype badge
- **3-column grid:** Each column shows:
  - Large letter label (A / B / C)
  - Generated image (1024x1024, served via local HTTP server)
  - Full description text underneath
  - Attack skill + Ultimate listed below
- **Responsive:** Columns stack vertically if viewport is narrow

Images served via temporary `python3 -m http.server` on `/tmp` (Playwright blocks `file://` URLs).

### After Viewing

Skill prompts "Which visual direction do you prefer? (A/B/C)" — choice selects the description for the final creature record.

## What Doesn't Change

- Discovery mode, thematic mode, direct mode — all unchanged
- JPDB API integration — unchanged
- JSON schema for staging file — unchanged (no image URLs stored)
- Re-roll handling — works the same, but now re-rolling Section 8 also regenerates Section 9 images
- Approval and save flow — unchanged
