# Vocab Categorization Pipeline Design

**Date:** 2026-02-18
**Status:** Approved

## Problem

The forge skills (creature, item, area, NPC) brainstorm Japanese words from Claude's internal knowledge, which is unsystematic. We have `data/jpdb-wordlist.csv` with ~27K frequency-ranked Japanese words including English meanings and POS tags, but no semantic categorization. The forges can't easily answer "what animals haven't we used yet?" or "what food words exist in the top 5K?"

## Solution

Categorize all 27K words into 17 semantic categories using Sonnet 4.6 subagents. Output one JSON file per category in `data/vocab-categories/`. Forges read only the files they need.

## Category Taxonomy (17 categories)

| Category | Description | Primary Forge Use |
|---|---|---|
| `animals` | Real animals, insects, fish, birds | Creature forge base words |
| `foods` | Foods, drinks, ingredients, dishes | Item forge brainstorming |
| `locations` | Places, buildings, geographic features | Area forge discovery |
| `occupations` | Jobs, roles, social positions | NPC forge base words |
| `body-parts` | Human/animal body parts | Creature combat vocab |
| `nature` | Plants, weather, seasons, natural phenomena | Area descriptions, modifiers |
| `objects` | Tools, furniture, household items, instruments | Creature forge (object creatures) |
| `clothing` | Clothes, accessories, fabrics | Future content |
| `emotions` | Feelings, mental states | NPC personality, modifiers |
| `actions` | Physical action verbs (hit, run, cut) | Creature attack/ultimate vocab |
| `movement` | Motion verbs (fly, swim, fall) | Creature combat vocab |
| `descriptors` | Adjectives for appearance/quality | Creature/NPC modifiers |
| `colors` | Color words | Visual design |
| `numbers-time` | Numbers, counters, time words | General game text |
| `combat` | Fighting, conflict, damage words | Combat UI, skill names |
| `social` | Communication, relationships, groups | NPC dialogue |
| `abstract` | Abstract concepts, philosophy, state | Catch-all for non-concrete |

Words can belong to multiple categories (e.g. 鮭 → animals + foods). Words that fit no category (grammar particles, conjunctions, sentence-enders) are omitted from all files.

## Pipeline Architecture

### Step 1: Prep (main agent, Bash)

Split `data/jpdb-wordlist.csv` into ~27 batch files of 1,000 words each. Write to `/tmp/vocab-cat-batch-{01..27}.csv`. Each batch retains the CSV header and includes rank, word, reading, POS, and meaning columns.

### Step 2: Categorize (Sonnet subagents, parallel)

For each batch, dispatch a Task tool subagent (`model: sonnet`) that:
1. Reads `/tmp/vocab-cat-batch-{N}.csv`
2. Categorizes every word into 1+ of the 17 categories
3. Writes result to `/tmp/vocab-cat-result-{N}.json`

Result format per batch:
```json
[
  {"rank": 283, "word": "切る", "reading": "きる", "meaning": "to cut", "categories": ["actions", "combat"]},
  {"rank": 512, "word": "飛ぶ", "reading": "とぶ", "meaning": "to fly", "categories": ["movement"]},
  ...
]
```

The `meaning` field is a short primary meaning (not the full JPDB paragraph). Words that fit no category are included with `"categories": []`.

Run 3-4 subagents in parallel at a time. Subagents read from disk and write to disk — no large data returns to main context.

### Step 3: Merge (main agent, Bash)

A Node script reads all 27 result JSON files, groups entries by category, and writes one file per category to `data/vocab-categories/{category}.json`.

Each output file format:
```json
[
  {"rank": 283, "word": "切る", "reading": "きる", "meaning": "to cut"},
  {"rank": 512, "word": "飛ぶ", "reading": "とぶ", "meaning": "to fly"}
]
```

Sorted by rank (most frequent first). Words appearing in multiple categories are duplicated across files — keeps each file self-contained.

### Step 4: Spot Check (main agent)

Verify a few entries from 3-4 category files. Check that counts aren't obviously broken (no category with 0 entries, no category with nearly all 27K entries). No specific count targets — just sanity checking.

## Output

```
data/vocab-categories/
  animals.json
  foods.json
  locations.json
  occupations.json
  body-parts.json
  nature.json
  objects.json
  clothing.json
  emotions.json
  actions.json
  movement.json
  descriptors.json
  colors.json
  numbers-time.json
  combat.json
  social.json
  abstract.json
```

## Forge Integration (future)

After categorization, forge skills can reference these files in their discovery/brainstorming phases. For example, creature forge discovery mode could scan `animals.json` and diff against existing creature base words to find gaps. This integration is out of scope for this task — categorization only.

## Cost

~27 Sonnet 4.6 subagent calls. Each processes ~1,000 words with a short taxonomy prompt. No external API keys needed — runs entirely through Claude Code Task tool.
