# Theme-Based Content System Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

Pure frequency-based ordering is problematic for game content design:
- High-frequency words are dominated by abstract function words (particles, copulas) that are hard to visualize and teach through game creatures/items
- Frequency alone explains only ~37% of word difficulty variance (Hashimoto & Egbert 2019)
- In game contexts, salience predicts vocabulary acquisition, not exposure frequency (ReCALL 2023)
- We need 500 creatures — impossible to source from the top 500 or even top 5,000 frequency words alone
- Semantic clustering (teaching all related words together) causes interference and hurts retention (Tinkham 1997)

## Solution: 3-Filter Thematic-Frequency Hybrid

### The Algorithm

1. **Filter 1 — Frequency determines the theme.** High-aggregate-frequency themes (school, home, food) surface as early-stage areas. Low-aggregate-frequency themes (courtroom, astronomy) become late-stage areas.

2. **Filter 2 — Within theme, find all thematic words.** Cross-cut existing semantic category files + AI-generated gap-fill + JPDB verification. Target 80-120 words per theme. Thematic grouping (words co-occurring in a situation) avoids the semantic interference problem.

3. **Filter 3 — Prioritize by frequency within the thematic list.** The highest-frequency words from each theme become the creatures, items, NPCs, and sub-areas for that area.

**Result:** High frequency, high thematic fit. Area stage is computed from the average frequency of all words in the theme pool.

### Research Basis

- **Frequency bands are valid; strict rank ordering is not** (Schmitt & Schmitt 2014)
- **Imageability × frequency interaction** — both frequent AND imageable words are learned best (MIT 2024)
- **Thematic clustering aids learning; semantic clustering causes interference** (Tinkham 1997, Waring 1997)
- **Salience dominates frequency in game contexts** (ReCALL 2023)
- **Narrative/emotional context creates durable encoding** (Hulme 2019, QJEP 2024)
- **Contextual diversity across encounters matters more than repetition count** (Rodríguez-Ferreiro 2020)
- **i+1 comprehensible input is the acquisition condition** — validated by 30 years of SLA research

## Theme Pool File Format

Location: `language/themes/<themeId>.json`

```json
{
  "themeId": "school",
  "areaWord": "学校",
  "areaReading": "がっこう",
  "areaMeaning": "school",
  "areaRank": 952,
  "avgRank": 2340,
  "computedStage": 3,
  "generatedAt": "2026-03-04",
  "words": [
    {
      "word": "先生",
      "reading": "せんせい",
      "meaning": "teacher",
      "rank": 452,
      "roles": ["creature", "npc"],
      "source": "occupations",
      "assigned": null,
      "existingUses": []
    },
    {
      "word": "机",
      "reading": "つくえ",
      "meaning": "desk",
      "rank": 2100,
      "roles": ["item"],
      "source": "objects",
      "assigned": null,
      "existingUses": ["item:tsukue-desk"]
    },
    {
      "word": "厳しい",
      "reading": "きびしい",
      "meaning": "strict; severe",
      "rank": 3400,
      "roles": ["modifier"],
      "source": "ai-generated",
      "assigned": null,
      "existingUses": []
    }
  ]
}
```

Field definitions:
- **`roles`** — what this word can become: `creature`, `modifier`, `item`, `npc`, `sub-area`, `move`. A word can have multiple roles.
- **`source`** — which category file it came from, or `"ai-generated"` for AI-filled gaps
- **`assigned`** — `null` when available, set to `"creature:kamedor"` when forged
- **`existingUses`** — array of existing assignments found during generation (e.g., `["creature:sensei", "move:teach"]`). Empty array if the word is not yet used anywhere. Words are never filtered out — this field lets you see redundancy at a glance.
- **`avgRank`** — computed from all words in the pool. Determines stage.
- **`computedStage`** — derived from `avgRank` using existing stage thresholds in `data/stage-definitions.json`

Words are stored sorted by rank (most frequent first).

## Theme Pool Generation

Script: `scripts/generate-theme-pool.mjs`

```bash
node scripts/generate-theme-pool.mjs --theme "school" --area-word "学校"
```

### Implementation note: use Opus subagents for category scanning

The 17 category files are too large to process in a single context window. **Dispatch parallel Opus subagents** (via the Agent tool) to scan categories. Each subagent receives the theme concept and 1-3 category files, and returns its thematic word picks. The orchestrator merges results and deduplicates. This also applies to step 2 (AI gap-fill generation) — run it as a separate subagent call.

Steps:
1. **Dispatch subagents** to scan all 17 category files in `language/categories/`. Each subagent receives the theme name/concept and a batch of category files, and returns words it considers thematically associated. Run subagents in parallel to maximize throughput.
2. A separate subagent generates 20-30 additional thematic words not found in any category.
3. Orchestrator merges all subagent results, deduplicates, then runs JPDB batch lookup on all candidates for frequency rank + verified readings.
4. Cross-reference words against existing data (creatures.json, moves.json, items.json, areas.json, npcs.json + staging files). Do NOT filter them out — instead, annotate each word with its existing assignments so redundancy is visible.
5. Filter out rank > 30,000.
6. Sort by JPDB rank ascending.
7. Assign suggested `roles` based on POS (nouns → creature/item/npc/sub-area, adjectives → modifier, verbs → move/creature).
8. Compute `avgRank` and `computedStage`.
9. Write to `language/themes/<themeId>.json`.

Output summary:
```
Theme: school (学校)
Pool: 94 words (68 from categories, 26 AI-generated)
Avg rank: 2,340 → Stage 3
Roles: 22 creature candidates, 18 modifiers, 14 items,
       12 sub-area words, 8 NPC candidates, 20 move candidates
```

## Forge Skill Modifications

### forge-discovery.mjs — New `--theme` Mode

```bash
# Existing mode (still works):
node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 10

# New theme mode:
node scripts/forge-discovery.mjs --theme school --role creature --limit 10

# New status mode:
node scripts/forge-discovery.mjs --theme-status
```

Theme mode reads from the theme pool file, filters by role and assignment status.

### creature-forge

Accepts `--theme school`. Phase 0 reads theme pool, picks highest-frequency unassigned creature-role word. After save, writes back `"assigned": "creature:<id>"` to the theme file.

**Move thematic discovery (new step):** After the creature's concept is locked, AI analyzes the concept and suggests thematically fitting verb concepts (e.g., fox → bite, sneak, howl, trick). Cross-references against `data/moves.json`. If enough matches exist, prioritizes them for learnset building. If gaps exist, flags them for move-forge.

### area-forge

Accepts `--theme school`. Area word, rank, and stage come from the theme file. Sub-areas draw modifier + location words from the theme pool.

### item-forge, npc-forge

Accept `--theme`, draw from pool, mark assigned.

### move-forge

Unchanged. Remains independent, driven by creature-forge gap feedback.

### stage-utils.js

New function `getThemeStage(themeId)` reads theme file and returns `computedStage` based on `avgRank`.

## Theme-to-Area Mapping

1:1 — one theme produces one area. Thematically similar but conceptually distinct themes are separate areas (school vs. university). Sub-concepts that are part of a larger setting are sub-areas within a theme (harbor is a sub-area of ocean, not its own theme).

## Legacy Content

The 37 existing creatures across 5 areas are noted as pre-theme prototypes. They are not retroactively assigned to themes. They may be reworked later once the theme landscape is established and gaps are identified.

## What Changes

| Component | Change |
|-----------|--------|
| **New:** `language/themes/*.json` | Theme pool files |
| **New:** `scripts/generate-theme-pool.mjs` | 3-filter generator |
| **Modified:** `forge-discovery.mjs` | `--theme` and `--theme-status` modes |
| **Modified:** `creature-forge` | `--theme` flag, move thematic discovery step |
| **Modified:** `area-forge` | `--theme` flag, draw sub-areas from pool |
| **Modified:** `item-forge`, `npc-forge` | `--theme` flag |
| **Modified:** `stage-utils.js` | `getThemeStage()` function |
| **Unchanged:** `move-forge` | Independent, gap-driven |
| **Unchanged:** Runtime game code | No changes |
| **Unchanged:** Data schemas | creatures.json, moves.json, items.json, areas.json formats unchanged |

## What Doesn't Change

- Game runtime code — no changes needed
- Ad-hoc forging — still works for one-offs, just not theme-tracked
- The i+1 system, DM narration, SRS — all unaffected
- Data file schemas — creatures, moves, items, areas JSON formats unchanged
