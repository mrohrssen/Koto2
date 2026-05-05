---
name: generate-theme-pool
description: "[DEPRECATED — DO NOT USE] Stale skill — do not invoke. Original (for reference only): Generate a theme pool file from 5-method consensus + JPDB enrichment + human curation."
user_invocable: false
---

> **DEPRECATED — DO NOT USE**
>
> This skill is stale and should not be invoked. Its tables, workflows, and
> assumptions reflect an older version of the game systems and may produce
> incorrect content. Do not run `/generate-theme-pool`. See current reference
> docs (e.g. `docs/move-system-reference.md`) for the actual design space.

# Generate Theme Pool

Generates a `language/themes/<themeId>.json` file using a **5-method consensus pipeline** followed by **human curation** via an interactive review UI.

Five independent methods generate candidate words in parallel. Each word is tagged with how many methods found it (consensus score). Words are JPDB-enriched, then the user curates the final list via a browser-based review page with checkboxes.

## Input

- **Theme concept** (required): English concept word, e.g., "school", "ocean", "kitchen"
- **Area word** (optional): Japanese location word, e.g., "学校". If not provided, the user picks from AI suggestions.

## JPDB API Key

The JPDB API key is stored at `data/.creature-forge-jpdb-key` (a single-line text file). Both `scripts/theme-pool-consensus.mjs` and `scripts/generate-theme-pool.mjs` auto-load it from this path. The `JPDB_API_KEY` env var is also accepted as an override. **Do not ask the user for the key — it's already in the repo.**

## Phase 0: Setup

1. Parse args: theme concept and optional area word.
2. If no area word provided, brainstorm 3-5 Japanese location words that match the theme. Present to user with JPDB rank and meanings. User picks one.
3. Look up the area word via JPDB API (use `scripts/lib/jpdb-helpers.mjs` patterns — `parseBatch` then `lookupVocab`) to confirm rank and reading.
4. Set `themeId` = lowercase English concept (e.g., "school", "ocean").

## Phase 1: Launch 5 Agents in Parallel

**IMPORTANT: Use subagents, NOT paid AI APIs.** All 5 agents run as background agents simultaneously.

Each agent writes its output to `tmp/theme-{themeId}-N-{method}.json` as a JSON array of `[{word, reading, meaning}, ...]`.

### Agent 1: Pure LLM Brainstorm (Opus)

```
You are generating a comprehensive Japanese vocabulary list for the theme "{THEME}".

Brainstorm EVERY Japanese word a learner would want to know related to {THEME}. Be exhaustive. Organize by category:

- People (who is involved in this setting)
- Places (locations, rooms, areas)
- Objects (things you'd find, use, see)
- Subjects/Topics (if applicable)
- Actions (verbs — what people DO in this setting)
- Events (things that happen)
- Time/Schedule (when things happen)
- Emotions/States (how people feel, descriptors)
- Abstract concepts (ideas, systems)

For each word provide: the Japanese word, its hiragana reading, and English meaning.
IMPORTANT: Only include REAL Japanese words. If unsure, skip it.

Write the output as a JSON array to {OUTPUT_PATH}:
[{"word": "学校", "reading": "がっこう", "meaning": "school"}, ...]
```

### Agent 2: Jisho.org Keyword Scraping (Opus)

```
You are generating a Japanese vocabulary list for the theme "{THEME}" by searching jisho.org.

Search jisho.org's API with 50+ English seed keywords related to {THEME}:
  https://jisho.org/api/v1/search/words?keyword=KEYWORD

Think of every relevant keyword: people, places, objects, actions, events, equipment, etc.
Also try Japanese keywords (e.g., the area word and related kanji compounds).

For each search result:
- Only include words clearly related to {THEME}
- Prefer words tagged as "common"
- Skip purely grammatical words
- Deduplicate across searches

Save as JSON array to {OUTPUT_PATH}:
[{"word": "学校", "reading": "がっこう", "meaning": "school"}, ...]
```

### Agent 3: Textbook Curriculum Mining (Opus)

```
You are generating a Japanese vocabulary list for the theme "{THEME}" by mining real textbook vocabulary.

Recall vocabulary from major Japanese textbook series that appears in {THEME}-related chapters:
- Genki I & II
- Minna no Nihongo I & II
- Tobira (intermediate)
- Irodori (Japan Foundation)
- JLPT vocabulary lists (N5-N1)

Include words from:
- Dialogues set in {THEME} contexts
- Chapter vocabulary lists for {THEME}-themed lessons
- Classroom expressions and instructions related to {THEME}
- JLPT questions commonly set in {THEME} contexts

Only include words you are confident actually appear in Japanese textbooks.

Save as JSON array to {OUTPUT_PATH}:
[{"word": "学校", "reading": "がっこう", "meaning": "school"}, ...]
```

### Agent 4: Scene Walkthrough (Opus)

```
You are generating a Japanese vocabulary list for the theme "{THEME}" using a scene walkthrough.

Mentally walk through a detailed experience of {THEME}. Narrate every moment in vivid detail and extract EVERY noun, verb, and adjective you encounter.

{THEME_SCENES}

For each scene, think cinematically: what would you SEE, DO, HEAR, FEEL? Extract every word.

Be EXHAUSTIVE — every object, action, descriptor, person, place, and concept.

Save as JSON array to {OUTPUT_PATH}:
[{"word": "学校", "reading": "がっこう", "meaning": "school"}, ...]
```

The `{THEME_SCENES}` placeholder should be filled with 8-12 detailed scene descriptions appropriate to the theme. For example, for "school":
- Morning: wake up, uniform, commute, shoe lockers
- Classes: each subject, teacher, board work, notes
- Lunch: cafeteria, bento, eating together
- After school: clubs, cleaning, library, cram school
- Events: sports day, cultural festival, field trips, exams, graduation

### Agent 5: Web Lists Aggregation (Opus)

```
You are generating a Japanese vocabulary list for the theme "{THEME}" by searching the web for existing curated vocabulary lists.

Search for these queries using WebSearch:
- "Japanese {THEME} vocabulary list"
- "Japanese {THEME} words"
- "JLPT {THEME} vocabulary"
- "{THEME} vocabulary for Japanese learners"
- And 6-10 more relevant search queries

For each promising result, use WebFetch to get the page and extract vocabulary.

Good sources: Tofugu, WaniKani, JapanesePod101, FluentU, Reddit r/LearnJapanese, language learning blogs.

Deduplicate and save as JSON array to {OUTPUT_PATH}:
[{"word": "学校", "reading": "がっこう", "meaning": "school"}, ...]
```

## Phase 2: Enrich and Generate Review

Once all 5 agents complete, run the consensus enrichment script:

```bash
node scripts/theme-pool-consensus.mjs \
  --theme {themeId} \
  --area-word {areaWord} \
  --area-reading {areaReading} \
  --area-meaning {areaMeaning} \
  --input tmp/theme-{themeId}-1-brainstorm.json \
  --input tmp/theme-{themeId}-2-jisho.json \
  --input tmp/theme-{themeId}-3-textbook.json \
  --input tmp/theme-{themeId}-4-scene.json \
  --input tmp/theme-{themeId}-5-web.json
```

This script:
- Merges all 5 lists, tracking which methods found each word
- Enriches via JPDB (frequency rank, POS, verified meanings)
- Filters out rank > 30,000 and words JPDB can't parse
- Generates three output files:
  - `tmp/theme-{themeId}-master.json` — full word data
  - `tmp/theme-{themeId}-master.csv` — spreadsheet format
  - `tmp/theme-{themeId}-review.html` — interactive curation UI

## Phase 3: Serve and Present

Start the review server if not already running:

```bash
pkill -f "python3 -m http.server 8766" 2>/dev/null
cd tmp && nohup python3 -m http.server 8766 --bind 0.0.0.0 > /dev/null 2>&1 &
```

Present the review URL to the user:

```
Review URL: http://srv1438246.hstgr.cloud:8766/theme-{themeId}-review.html
```

Show summary stats:
- Total words generated
- Per-method counts
- Consensus breakdown (5/5, 4/5, 3/5, etc.)
- Tier distribution

Tell the user:
> Open the review URL on your phone or browser. Check the words you want in the final pool — all boxes start unchecked. Use the filters (consensus, tier) and "Check visible" button to work quickly. When done, hit Submit.

## Phase 4: Confirm Submission

After the user submits via the review UI, the server writes:
- `language/themes/{themeId}.json` — the final theme pool
- `language/themes/{themeId}.csv` — CSV export

Validate the result:
```bash
node scripts/generate-theme-pool.mjs --validate {themeId}
```

Present final stats: word count, computed stage, role breakdown.

## Phase 5: Commit

```bash
git add language/themes/{themeId}.json language/themes/{themeId}.csv
git commit -m "feat: add {themeId} theme pool (N words, stage X)"
```

## Output

The theme pool file at `language/themes/{themeId}.json` is ready for use by forge skills:
- `/creature-forge --theme {themeId}` to forge creatures from this pool
- `/area-forge --theme {themeId}` to forge the area
- `/item-forge --theme {themeId}` to forge items
- `/npc-forge --theme {themeId}` to forge NPCs
- `node scripts/forge-discovery.mjs --theme {themeId} --role creature` to browse candidates
- `node scripts/forge-discovery.mjs --theme-status` to see all theme statuses
