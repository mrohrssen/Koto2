---
name: area-forge
description: Design a new game area from a Japanese location word. Looks up JPDB frequency, matches creatures from staging, writes a visual description for background generation, and saves to staging. Triggers on "area forge", "new area", "design area", "area from word".
user_invocable: true
---

# Area Forge — Lightweight Orchestrator

Turn a Japanese location word into a themed game area for NEO TOKYO: System Liberation, a Japanese vocabulary learning RPG.

This skill is a **single-agent orchestrator**. No subagents, no baton relay. The main agent handles everything directly across 4 phases.

## Quick Reference: The Flow

```
Phase 0: JPDB Lookup        → resolve word, show rank + meanings
Phase 1: Creature Matching   → scan staging, propose roster
Phase 2: Visual Description  → write atmosphere text for background gen
Phase 3: Save                → append to staging JSON
```

## Input Mode Detection

Parse skill arguments:

- **Direct mode:** `/area-forge aquarium` — word provided. JPDB lookup, proceed to Phase 1.
- **Discovery mode:** `/area-forge` (no args) — brainstorm areas from creature roster. See Discovery Mode below.

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

### Discovery Mode

1. Read `data/new-creatures-staging.json` and `data/creatures.json` (skip if missing). Build exclusion set of existing area ids from `data/new-areas-staging.json` (if it exists).

2. Group creatures by natural habitat affinity:
   - **Aquatic** — water element + marine/aquatic base animals (dolphin, shark, whale, octopus, penguin, turtle, frog)
   - **Forest/Nature** — wood element + woodland animals (snake, wolf, monkey, butterfly, flower)
   - **Urban/Domestic** — object-based creatures (book, pillow, umbrella, scissors, speaker, lamp, bomb)
   - **Celestial** — abstract/cosmic bases (star, moon, sun, light, lightning, wind)
   - **Predator/Wild** — fighters with large animal bases (lion, bear, horse, dragon, crow)

   These are starting heuristics — use judgment for creatures that span categories.

3. For each cluster with 3+ creatures, brainstorm 1-2 Japanese location words where those creatures would naturally live. Aim for 5-7 total candidates.

4. JPDB lookup ALL candidates in a single batch script (same pattern as Direct Mode, but with multiple words).

5. Present selection table:

| # | English | Japanese | Reading | Rank | Creature Fits | Raw Meanings |
|---|---------|----------|---------|------|--------------|-------------|
| 1 | Aquarium | 水族館 | すいぞくかん | 13,500 | Irukami, Samegaron, Kujirath, Takogon, Penginrok | [["aquarium"]] |
| 2 | Forest | 森 | もり | 1,200 | Hebiveil, Ookamiru, Sarukkii, Chouri | [["forest"]] |

6. User picks one (or provides their own word). Proceed to Phase 1.

---

## Phase 1: Creature Matching

Scan all creatures from `data/new-creatures-staging.json` and `data/creatures.json`.

**Matching criteria** (any one is enough to be a candidate):
- **Habitat fit** — the creature's base animal naturally lives in or near this location (e.g., dolphin → aquarium, butterfly → park)
- **Element affinity** — the area has a dominant element and the creature shares it (e.g., aquarium = water-heavy)
- **Thematic resonance** — the creature's description, modifier, or concept fits the area's vibe (e.g., Honmo the book creature → library, Ranpuuru the lamp → shrine at night)

Present matches:

| Creature | Base | Element | Rarity | Why it fits |
|----------|------|---------|--------|------------|
| Irukami | dolphin | water | epic | Marine animal, natural aquarium inhabitant |
| Samegaron | shark | water | epic | Deep sea predator, star exhibit |
| Takogon | octopus | water | rare | Aquatic creature, reef-dweller |

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

## Phase 3: Save

1. Read `data/new-areas-staging.json` (or initialize `[]` if file is missing).
2. Build the area object:

```json
{
  "id": "<lowercase-romaji-of-japanese-name>",
  "name": "<japanese-location-word>",
  "nameEn": "<English-translation>",
  "reading": "<hiragana-reading>",
  "rank": 13500,
  "meanings": [["aquarium"]],
  "theme": "<one-sentence thematic summary>",
  "creatures": ["creature-id-1", "creature-id-2", "creature-id-3"],
  "description": "<200-400 word visual/atmosphere description>",
  "tags": ["element-or-theme-tag-1", "tag-2", "tag-3"],
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
- [ ] At least 3 creatures assigned
- [ ] Description is pure visual/atmosphere — no game mechanics, no creature descriptions
- [ ] Description matches game aesthetic — fun fantasy, warm, playful. No cyberpunk.
- [ ] No duplicate id with existing areas in `data/new-areas-staging.json`
- [ ] `createdAt` set to today's date

## Re-roll Handling

When the user requests changes:
- "redo creatures" → re-run Phase 1 with adjusted matching
- "redo description" → re-run Phase 2
- "change word" → go back to Phase 0
