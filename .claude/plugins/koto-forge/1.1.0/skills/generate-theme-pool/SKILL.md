---
name: generate-theme-pool
description: Generate a theme pool file from category scanning + AI gap-fill + JPDB enrichment. Usage: /generate-theme-pool <theme-concept> [area-word]
---

# Generate Theme Pool

Generates a `language/themes/<themeId>.json` file using the 3-filter thematic-frequency hybrid algorithm.

## Input

- **Theme concept** (required): English concept word, e.g., "school", "ocean", "kitchen"
- **Area word** (optional): Japanese location word, e.g., "学校". If not provided, the user picks from AI suggestions.

## Phase 0: Setup

1. Parse args: theme concept and optional area word.
2. If no area word provided, brainstorm 3-5 Japanese location words that match the theme. Present to user with JPDB rank and meanings. User picks one.
3. Look up the area word via JPDB API (use `scripts/lib/jpdb-helpers.mjs` patterns — `parseBatch` then `lookupVocab`) to confirm rank and reading.
4. Set `themeId` = lowercase English concept (e.g., "school", "ocean").

## Phase 1: Category Scanning (Parallel Subagents)

**IMPORTANT: Use subagents, NOT paid AI APIs.**

The 17 category files in `language/categories/` are too large for a single context. Dispatch **parallel subagents** to scan them.

Split the 17+1 category files into 6 batches:

| Batch | Files |
|-------|-------|
| 1 | `animals.json`, `nature.json`, `foods.json` |
| 2 | `objects.json`, `clothing.json`, `body-parts.json` |
| 3 | `actions.json`, `movement.json`, `combat.json` |
| 4 | `descriptors.json`, `emotions.json`, `colors.json` |
| 5 | `locations.json`, `occupations.json`, `social.json` |
| 6 | `abstract.json`, `numbers-time.json` |

For each batch, dispatch a **sonnet subagent** with this prompt:

```
You are scanning Japanese vocabulary category files for words thematically
associated with the concept: "{THEME_CONCEPT}"

Read these category files:
{LIST_OF_FILE_PATHS}

For each file, identify words that would naturally appear in or be associated
with a {THEME_CONCEPT} setting. Include words that:
- Name things found in this setting (objects, creatures, people, places)
- Describe qualities of this setting (adjectives, modifiers)
- Represent actions that happen in this setting (verbs)

Be INCLUSIVE — cast a wide net. It's better to include borderline words
(they'll be filtered later) than to miss good ones.

Return a JSON array of objects, each with: { word, reading, meaning, rank, source }
where source is the filename (without .json).
Return ONLY the JSON array, no other text.
```

Each subagent reads its batch files using the Read tool and returns JSON.

## Phase 2: AI Gap-Fill (Subagent)

Dispatch one **opus subagent** to generate 20-30 additional thematic words NOT found in any category file:

```
Generate 20-30 Japanese words thematically associated with "{THEME_CONCEPT}"
that would NOT typically appear in general vocabulary category files.

Think about:
- Specialized terminology for this setting
- Compound words specific to this context
- Less common but highly thematic words

For each word, provide: { word, reading, meaning, source: "ai-generated" }
Do NOT include rank (it will be looked up via JPDB).
Return ONLY the JSON array, no other text.
```

## Phase 3: Merge & Process

1. Collect all subagent results into a single candidates array.
2. Deduplicate by `word` field.
3. Write merged candidates to `/tmp/theme-pool-{themeId}-candidates.json`.
4. Run the processing script:

```bash
node scripts/generate-theme-pool.mjs --process /tmp/theme-pool-{themeId}-candidates.json \
  --theme {themeId} \
  --area-word {areaWord} \
  --area-reading {areaReading} \
  --area-meaning {areaMeaning}
```

This script:
- Enriches all candidates with JPDB frequency ranks
- Filters out rank > 30,000 and null-rank words
- Assigns roles based on POS (noun → creature/item/npc/sub-area, adj → modifier, verb → move/creature)
- Cross-references against existing game data (creatures.json, moves.json, items.json, areas.json, npcs.json)
- Computes avgRank and computedStage
- Writes `language/themes/{themeId}.json`

## Phase 4: Review & Present

1. Read the generated theme file.
2. Present summary to user:
   - Theme name, area word, computed stage
   - Total word count, role breakdown
   - Words with existing uses (already in game data)
   - Top 10 creature candidates, top 10 item candidates, etc.
3. Ask user if adjustments are needed.
4. Run validation: `node scripts/generate-theme-pool.mjs --validate {themeId}`

## Output

The theme pool file at `language/themes/{themeId}.json` is ready for use by forge skills:
- `/creature-forge --theme {themeId}` to forge creatures from this pool
- `/area-forge --theme {themeId}` to forge the area
- `/item-forge --theme {themeId}` to forge items
- `/npc-forge --theme {themeId}` to forge NPCs
- `node scripts/forge-discovery.mjs --theme {themeId} --role creature` to browse candidates
- `node scripts/forge-discovery.mjs --theme-status` to see all theme statuses
