# Stage System Design

## Problem

The GDD defines 10 progression stages but they're just a planning construct — nothing in code enforces or tracks them. Areas are picked randomly, creatures have no stage assignment, and there's nothing gating content by difficulty. As we add content, we need visibility into how vocabulary difficulty is distributed and a framework that future systems (meta AI, SRS-driven area selection) can build on.

## Solution

Three-layer stage system: guidelines + outlier budget + median tracking. No hard gates — stages are tracked and reported, not enforced at runtime.

### Layer 1: Stage Guidelines

Each stage maps to 6 WaniKani levels and a JPDB frequency cap for kana-only words:

| Stage | WK Levels | JPDB Kana Cap |
|-------|-----------|--------------|
| 1 | 1-6 | 500 |
| 2 | 7-12 | 1,200 |
| 3 | 13-18 | 2,000 |
| 4 | 19-24 | 3,000 |
| 5 | 25-30 | 4,500 |
| 6 | 31-36 | 6,500 |
| 7 | 37-42 | 9,000 |
| 8 | 43-48 | 12,000 |
| 9 | 49-54 | 16,000 |
| 10 | 55-60 | No cap |

**Word → strict stage assignment:**
- **Kanji word in WK:** `Math.ceil(wkLevel / 6)`
- **Kanji word NOT in WK:** Use JPDB rank against the kana cap thresholds
- **Kana-only word:** Use JPDB rank against the kana cap thresholds

### Layer 2: Outlier Budget

Up to **20% of a stage's total vocabulary** can be outside its strict band. This allows thematic coherence — cats can scratch (引っかく in Stage 1 despite being a Stage 7 word by frequency), おにぎり can appear in early stages despite JPDB rank 9100.

Outliers are tracked per-area and per-stage. The system flags when outlier % exceeds 20% but does not reject content.

### Layer 3: Median Frequency Tracking

Each stage's median JPDB rank across all content (creatures, moves, items, NPCs, area names) is tracked. This is the health metric — if Stage 1's median drifts from ~2,000 to ~8,000 as content is added, something is off. The utility reports this for each stage.

## Content Targets Per Stage

| Per Stage | Count | Purpose | Status |
|-----------|-------|---------|--------|
| Areas | 5 | Each with 5-8 sub-areas | Exists |
| Creatures | ~40 | 8 per area, some shared | Exists |
| Moves | ~60 | Verb-based abilities | Exists |
| Items | ~15-25 | Consumables | Exists |
| NPCs | ~10-15 | Dialogue, quests, trading | Planned |
| Equipment | ~10-15 | Weapons, armor, accessories | Planned |
| Crafting Resources | ~10 | Gathered materials | Planned |

## Deliverables

### 1. `data/stage-definitions.json`

Stage rules file defining the 10 stages with WK level ranges, JPDB kana caps, and the outlier budget percentage.

```json
{
  "version": 1,
  "maxOutlierPercent": 20,
  "stages": [
    { "stage": 1, "wkLevels": [1, 6], "jpdbKanaCap": 500 },
    { "stage": 2, "wkLevels": [7, 12], "jpdbKanaCap": 1200 },
    { "stage": 3, "wkLevels": [13, 18], "jpdbKanaCap": 2000 },
    { "stage": 4, "wkLevels": [19, 24], "jpdbKanaCap": 3000 },
    { "stage": 5, "wkLevels": [25, 30], "jpdbKanaCap": 4500 },
    { "stage": 6, "wkLevels": [31, 36], "jpdbKanaCap": 6500 },
    { "stage": 7, "wkLevels": [37, 42], "jpdbKanaCap": 9000 },
    { "stage": 8, "wkLevels": [43, 48], "jpdbKanaCap": 12000 },
    { "stage": 9, "wkLevels": [49, 54], "jpdbKanaCap": 16000 },
    { "stage": 10, "wkLevels": [55, 60], "jpdbKanaCap": null }
  ]
}
```

### 2. `language/stage-utils.js`

Validation and reporting utility. Loads WK vocab data and stage definitions. Functions:

- `getWordStrictStage(word, jpdbRank)` — returns the strict stage for a word based on WK level or JPDB rank
- `isWithinBudget(targetStage, wordStage)` — checks if a word is at-or-below stage, or within outlier tolerance
- `getStageReport(stageNumber)` — scans all content files and returns: total words, outlier count, outlier %, median rank, word list grouped by content type
- `getFullReport()` — runs stage report for all 10 stages
- `getContentWords(type, id)` — extracts all vocabulary words from a creature/item/area (base word, modifier, learnset moves, components, etc.)
- `suggestStage(contentObject, type)` — given a new creature/item, suggests best-fit stage and shows impact on metrics

### 3. Tag Existing Content

Add `"stage": N` field to:
- Each creature in `data/creatures.json`
- Each move in `data/moves.json`
- Each item in `data/items.json`
- Each area in `data/new-areas-staging.json`
- NPCs, equipment, and crafting resources when those systems are built (same tagging pattern)

Stage assignment for existing content uses `suggestStage()` — the stage where the area/creature best fits the 20% outlier rule, weighted by all its vocabulary.

## Design for Future Meta AI

The data shape is designed so a future SRS-like meta AI can:

1. **Look up what teaches a word:** Scan content files for any creature/move/item/area containing the word. The `stage` tag on each object tells the AI whether the player has access to it.

2. **Select review content:** Given words due for review, find game objects containing those words, filtered by the player's unlocked stages. Weight by exposure context (combat = high repetition, exploration = passive).

3. **Guide area selection:** Instead of random area picks after clearing, the meta AI picks areas whose creature/move/item vocabulary overlaps most with the player's due-for-review words.

No vocabulary index is needed now — the AI can derive word→object mappings from source data at runtime. If performance requires it, a pre-built index can be added later without changing the source data shape.

## What This Does NOT Include

- **No runtime stage-gating** — the game loop doesn't enforce stages yet (separate feature)
- **No new content creation** — just rules, tagging, and reporting for existing content
- **No meta AI implementation** — data is shaped for it, but the AI itself is future work
- **No UI changes** — no player-facing stage indicators
