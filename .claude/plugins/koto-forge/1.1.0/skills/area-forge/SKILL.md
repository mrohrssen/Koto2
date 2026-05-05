---
name: area-forge
description: "[DEPRECATED — DO NOT USE] Stale skill — do not invoke. Original (for reference only): Design a new game area from a Japanese location word."
user_invocable: false
---

> **DEPRECATED — DO NOT USE**
>
> This skill is stale and should not be invoked. Its tables, workflows, and
> assumptions reflect an older version of the game systems and may produce
> incorrect content. Do not run `/area-forge`. See current reference docs
> (e.g. `docs/move-system-reference.md`) for the actual design space.

# Area Forge — Lightweight Orchestrator

Turn a Japanese location word into a themed game area for Koto, a Japanese vocabulary learning RPG.

This skill is a **single-agent orchestrator**. No subagents, no baton relay. The main agent handles everything directly across 5 phases.

## Quick Reference: The Flow

```
Phase 0:   JPDB Lookup        → resolve word, show rank + meanings, compute stage
Phase 1:   Creature Matching   → scan staging, propose stage-aligned roster
Phase 2:   Visual Description  → write atmosphere text for background gen
Phase 2.5: Sub-Area Generation → generate 6 named sub-areas with background descriptions
Phase 3:   Save                → append to staging JSON
```

## Input Mode Detection

Parse skill arguments:

- **Direct mode:** `/area-forge aquarium` — word provided. JPDB lookup, proceed to Phase 1.
- **Discovery mode:** `/area-forge` (no args) — stage-aware discovery. See Discovery Mode below.

---

## Discovery Mode (no arguments)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps area` to see which stages need areas most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or let user specify with `--stage N`.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type area --stage N --limit 10` to get stage-filtered location nouns from `locations.json` and `nature.json`.
4. Also read `data/creatures.json` — group creatures by stage to see which stages have creatures but no areas.
5. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | Stage | Creatures at this stage |
|---|------|---------|---------|-----------|-------|------------------------|

6. User picks or provides their own word. Proceed to Phase 0.

## Theme Pool Mode: `/area-forge --theme school`

When `--theme <themeId>` is provided, the area word, rank, and stage come from the theme file:

1. Read `language/themes/school.json` for area word, reading, meaning, rank, computedStage.
2. Skip JPDB lookup and forge-discovery for the area word (already determined by theme).
3. For creature matching (Phase 1): prefer creatures whose `baseWord` appears in the theme pool's creature-role words. Run `node scripts/forge-discovery.mjs --theme school --role creature --includeAssigned` to see the full list.
4. For sub-area generation (Phase 2.5):
   - Run `node scripts/forge-discovery.mjs --theme school --role modifier --limit 10` for modifier candidates from the theme pool.
   - Run `node scripts/forge-discovery.mjs --theme school --role sub-area --limit 10` for location noun candidates from the theme pool.
   - Draw sub-area modifiers and locations from theme pool words first, falling back to forge-discovery category mode if not enough candidates.
5. **After save:** Mark used modifier and location words as assigned in the theme file via `markAssigned()` from `scripts/lib/theme-utils.mjs`.

---

## Phase 0: Input & JPDB Lookup

### Direct Mode

1. JPDB lookup using the helper module. Write a temp script to `/tmp/` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['水族館']; // use kanji/katakana for the location word
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
```

Save to `/tmp/area-jpdb-lookup.mjs` and run with `node /tmp/area-jpdb-lookup.mjs`.

2. Present results:

| Word | Reading | Rank | Raw Meanings | All Forms |
|------|---------|------|-------------|-----------|
| 水族館 | すいぞくかん | 13,500 | [["aquarium"]] | 水族館(13,500) |

**Always show raw JPDB `meanings` array.** Never paraphrase.

3. Proceed to Phase 1.

4. **Compute stage** for the area word using `language/stage-utils.js`:
   - WK words: `stage = Math.ceil(wkLevel / 6)`
   - Non-WK: lowest stage where `jpdbKanaCap >= rank`
   - Or accept explicit `--stage N` from user input

---

## Phase 1: Creature Matching

Scan all creatures from `data/new-creatures-staging.json` and `data/creatures.json`.

**Matching criteria** (any one is enough to be a candidate):
- **Habitat fit** — the creature's base animal naturally lives in or near this location (e.g., dolphin → aquarium, butterfly → park)
- **Element affinity** — the area has a dominant element and the creature shares it (e.g., aquarium = water-heavy)
- **Thematic resonance** — the creature's description, modifier, or concept fits the area's vibe (e.g., Honmo the book creature → library, Ranpuuru the lamp → shrine at night)

**Stage matching:** The area's creature pool should contain creatures at or near the area's stage. Prefer creatures where `creature.stage` is within ±1 of the area's stage. Creatures outside this range can be included for thematic fit but should not be the majority.

Present matches:

| Creature | Base | Element | Rarity | Stage | Why it fits |
|----------|------|---------|--------|-------|------------|
| Irukami | dolphin | water | epic | 7 | Marine animal, natural aquarium inhabitant |
| Samegaron | shark | water | epic | 8 | Deep sea predator, star exhibit |
| Takogon | octopus | water | rare | 7 | Aquatic creature, reef-dweller |

User adjusts — can add/remove creatures from the roster. A creature can belong to multiple areas. **Minimum 3 creatures per area**, no maximum.

---

## Phase 2: Visual Description

Write a 200-400 word visual/atmosphere description for the area. This will be used later as input for AI background image generation.

### Description Guidelines

- **Fun fantasy, spirits, Pokemon, Nexus Anima style** — bright, playful, magical. Warm colors, soft lighting, inviting atmosphere.
- **Describe the environment, not gameplay** — no game mechanics, no "players will find..." language.
- **Key elements to cover:**
  - Lighting / time of day
  - Dominant color palette
  - Architectural or natural style
  - Atmospheric effects (mist, sparkles, floating spirit wisps, enchanted glow)
  - Flora/fauna hints (ambient, not the game creatures themselves)
  - Scale and perspective
  - Mood and feeling
- **Fantasy world context** — areas exist in a vibrant spirit world. Weave in magical elements (glowing runes, spirit wisps, enchanted materials, ancient magic) alongside the natural theme.
- **No creature descriptions** — the area description stands alone; creatures are rendered separately as sprites.
- **NEVER use cyberpunk, digital corruption, neon/SYSTEM, glitch, or tech-dystopia references.** The game's aesthetic is warm fantasy, not cyberpunk.

Present the description for approval. User can request edits before saving.

---

## Phase 2.5: Sub-Area Generation

Generate 6 named sub-areas for the area. Each sub-area is a Japanese location name using modifier + noun pattern.

### Sub-Area Structure

Each sub-area has:
- `id` — lowercase romaji
- `name` — Japanese name (modifier + の + location noun, or modifier + location noun)
- `nameEn` — English name
- `reading` — hiragana reading
- `backgroundDescription` — 100-200 word visual description for background image generation

### Generation Steps

1. **Discover modifier candidates.** Run `node scripts/forge-discovery.mjs --type creature-modifier --stage N --limit 20` to get adjectives at the area's stage.
2. **Pair modifiers with the area's location word** (or related location nouns from `locations.json`).
3. Examples:
   - Area: 森 (forest) → 静かな森 (quiet forest), 深い森 (deep forest), 光の森 (forest of light)
   - Area: 水族館 (aquarium) → 暗い水族館 (dark aquarium), 古い水族館 (old aquarium)
4. Each sub-area's background description should vary in lighting, mood, and specific features.
5. Background descriptions follow the same guidelines as the main area description: fun fantasy, warm, no cyberpunk.

### Present Sub-Areas

| # | Name | Reading | English | Background Summary |
|---|------|---------|---------|--------------------|

User can adjust names, swap modifiers, or request regeneration.

---

## Phase 3: Save

1. Read `data/new-areas-staging.json` (or initialize `[]` if file is missing). Also read `data/areas.json` for existing production areas.
2. Build the area object:

```json
{
  "id": "<lowercase-romaji>",
  "name": "<japanese-location-word>",
  "nameEn": "<English-translation>",
  "reading": "<hiragana-reading>",
  "rank": 13500,
  "meanings": [["aquarium"]],
  "stage": 7,
  "theme": "<one-sentence thematic summary>",
  "creatures": ["creature-id-1", "creature-id-2"],
  "description": "<200-400 word visual/atmosphere description>",
  "subAreas": [
    {
      "id": "shizukana-izumi",
      "name": "静かな泉",
      "nameEn": "Quiet Spring",
      "reading": "しずかないずみ",
      "backgroundDescription": "A glassy pool fed by..."
    }
  ],
  "tags": ["water", "aquatic"],
  "createdAt": "YYYY-MM-DD"
}
```

3. Append to the array. Write back to `data/new-areas-staging.json`.
4. Confirm: **"Saved [NameEn] ([name]) to staging! [N] areas now in data/new-areas-staging.json."**

---

## Checklist Before Saving

- [ ] JPDB rank is real (from API call, not guessed)
- [ ] Raw meanings array shown to user and verified
- [ ] English name is dictionary-accurate translation — no embellishment
- [ ] Stage field computed from area word
- [ ] 6 sub-areas generated with modifier + noun names
- [ ] Creature pool stage-aligned (creatures within ±1 stage of area)
- [ ] Sub-area background descriptions are visual only (no game mechanics)
- [ ] At least 3 creatures assigned
- [ ] Description is pure visual/atmosphere — no game mechanics, no creature descriptions
- [ ] Description matches game aesthetic — fun fantasy, warm, playful. No cyberpunk.
- [ ] No duplicate id with existing areas in `data/areas.json` or `data/new-areas-staging.json`
- [ ] `createdAt` set to today's date

## Re-roll Handling

When the user requests changes:
- "redo creatures" → re-run Phase 1 with adjusted matching
- "redo description" → re-run Phase 2
- "redo sub-areas" → re-run Phase 2.5
- "change word" → go back to Phase 0
