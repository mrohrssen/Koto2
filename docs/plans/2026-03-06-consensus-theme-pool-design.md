# Consensus-Based Theme Pool Generation

**Date:** 2026-03-06
**Status:** Approved
**Replaces:** Old category-scanning + AI gap-fill approach in `generate-theme-pool` skill

## Problem

The current theme pool generation scans 17 category files for tangentially related words, producing noisy lists (e.g., 雨/rain, 涙/tears, 光/light in a "school" pool) while missing obvious domain vocabulary. A bake-off of 5 independent methods proved that **consensus across methods** is the strongest signal for word quality — words found by 3+ methods are almost always genuinely thematic.

## Solution

Replace single-source generation with a **5-method consensus pipeline** followed by **human curation** via an interactive review UI.

## Pipeline Overview

```
Theme concept + area word
        │
        ├─→ Agent 1: Pure LLM Brainstorm
        ├─→ Agent 2: Jisho.org Keyword Scraping
        ├─→ Agent 3: Textbook Curriculum Mining
        ├─→ Agent 4: Scene Walkthrough ("A Day at...")
        └─→ Agent 5: Web Lists Aggregation
              │
              ▼
        Merge & Deduplicate
              │
              ▼
        JPDB Enrichment (parse → lookup rank, POS, meanings)
              │
              ▼
        Master list with consensus scores
              │
              ▼
        Interactive Review HTML (served on :8766)
              │
              ▼
        Human checks words → Submit
              │
              ▼
        Final theme pool: language/themes/<themeId>.json
```

## The 5 Methods

### 1. Pure LLM Brainstorm (Opus subagent)
Ask the model to exhaustively list every word related to the theme, organized by semantic category (people, places, objects, actions, events, emotions, abstract concepts). No external sources — pure model knowledge.

**Strengths:** Fast, free, covers common + niche vocabulary, good verb/adjective coverage.

### 2. Jisho.org Keyword Scraping
Search jisho.org's API with 50+ English seed keywords derived from the theme. Collect all Japanese results, filter for school-relevance.

**Strengths:** Dictionary-verified words with real definitions, finds compound words LLMs miss.
**Note:** High rejection rate (~56%) — many obscure results. Kept because it finds unique valid words the other methods miss.

### 3. Textbook Curriculum Mining (Opus subagent)
Recall vocabulary from major Japanese textbook series (Genki, Minna no Nihongo, Tobira, Irodori, JLPT lists) that appears in theme-related chapters and dialogues.

**Strengths:** Pedagogically curated, highest precision (97% hit rate), appropriate for learners.

### 4. Scene Walkthrough (Opus subagent)
Narrate a detailed day/experience within the theme setting. Extract every noun, verb, and adjective encountered. For "school": morning routine → classes → lunch → clubs → going home → events.

**Strengths:** Naturally discovers action verbs and contextual vocabulary that lists miss. Largest output.

### 5. Web Lists Aggregation
Search the web for existing curated vocabulary lists (Tofugu, JapanesePod101, FluentU, Reddit, JLPT study sites). Aggregate and deduplicate.

**Strengths:** Community-curated, battle-tested by real learners.

## JPDB Enrichment

All 5 raw lists are merged, deduplicated by word, then enriched centrally:

1. **parseBatch** — Send words to JPDB `/api/v1/parse` (batches of 30, 1s delay)
2. **lookupVocab** — Get frequency_rank, POS, meanings (batches of 500, 1s delay)
3. **Filter** — Remove words with rank > 30000 or null rank
4. **Deduplicate** — By word and by vid (keep lowest rank)
5. **Sort** — By consensus (desc), then rank (asc)

## Output Artifacts

Each run produces three files in `tmp/`:

| File | Purpose |
|------|---------|
| `theme-<id>-master.json` | Full enriched word list with per-method flags and consensus scores |
| `theme-<id>-master.csv` | Same data as CSV for spreadsheet review |
| `theme-<id>-review.html` | Interactive review UI with checkboxes |

## Interactive Review UI

Self-contained HTML served at `http://srv1438246.hstgr.cloud:8766/theme-<id>-review.html`

Features:
- **Checkboxes** on every word (all unchecked by default)
- Filter by consensus level (5/5, 4+, 3+, 2+, All)
- Filter by tier (Common, Uncommon, Rare, Epic, Legendary)
- Sort by consensus, rank, or word
- Search by word, reading, or meaning
- Bulk actions: "Check all visible" / "Uncheck all visible"
- **Submit button** → POST checked words to server endpoint
- Server writes final pool to `language/themes/<themeId>.json`

## Server Endpoint

`POST /api/theme-pool/submit`

```json
{
  "themeId": "school",
  "areaWord": "学校",
  "areaReading": "がっこう",
  "areaMeaning": "school",
  "words": [
    { "word": "教室", "reading": "きょうしつ", "meaning": "...", "rank": 1500, "consensus": 5 },
    ...
  ]
}
```

Response: writes `language/themes/<themeId>.json` in existing theme pool format (with roles, existingUses, computedStage, etc.).

## Skill Interface

```
/generate-theme-pool <theme-concept> [area-word]
```

Same interface as before. The skill:
1. Resolves the area word (JPDB lookup, or brainstorm 3-5 candidates for user to pick)
2. Launches 5 agents in parallel (background)
3. Waits for all to complete
4. Runs JPDB enrichment script
5. Generates master JSON/CSV/HTML
6. Serves the review HTML and gives the user the URL
7. User curates and submits via the UI
8. Skill confirms the final pool was saved

## Bake-off Results (Validation)

Tested on "school" theme:

| Method | Input | Usable (≤30k) | Hit Rate | Common Tier |
|--------|-------|---------------|----------|-------------|
| Brainstorm | 506 | 289 | 67% | 63 |
| Jisho | 703 | 227 | 37% | 32 |
| Textbook | 171 | 133 | 97% | 60 |
| Scene | 907 | 602 | 73% | 235 |
| Web | 296 | 191 | 70% | 38 |

Union: 979 usable words. Consensus: 47 in all 5, 114 in 4+, 186 in 3+.

The 186 consensus-3+ words had near-zero noise — every word was genuinely school-related. This is a massive improvement over the old method's 349 words which included rain, tears, light, and food.
