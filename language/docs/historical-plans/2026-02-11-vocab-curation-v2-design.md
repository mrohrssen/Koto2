# Vocab Curation Pipeline v2

> Words first, themes second. Prioritize common vocabulary.

## Problem

Pipeline v1 told AI agents to favor rare words. They obliged — 68% of the output was rank 5000+, and the median word (rank 8067) is one most learners will never encounter. The game should teach words players actually need.

## Principles

1. **Common words are mandatory.** Every concrete noun in rank 1–5000 belongs in the game unless it is truly abstract. The agent cannot skip a word because it is "boring."
2. **Lower rank = higher priority.** When choosing between two words for a slot, always prefer the more common one.
3. **Rare words fill gaps, not seats.** Words ranked 5000+ may appear only when an area genuinely needs depth — a missing boss role, a compound that teaches a common root. Each must carry a justification.
4. **Code picks words. AI assigns themes.** The Node.js script decides the word pool mechanically. The AI agent decides only where words go and what they become.

## Pipeline

### Step 1 — Extract nouns (Node.js)

Read `data/jpdb-wordlist.csv` rows 1–15,000. Keep all nouns (POS tag `n`). Drop particles, conjunctions, counters, and other non-noun tags. Output a compact TSV sorted by rank.

**Reuses** `output/vocab-pipeline/extract-nouns.cjs` from v1.

**Output:** ~8,000 nouns, ~450KB TSV.

### Step 2 — Filter concrete vs. abstract (2 parallel Opus agents)

Split the rank 1–5000 nouns (~2,200 words) into two chunks of ~1,100. Each agent marks every word YES (concrete) or NO (abstract).

**Concrete** means an artist could draw it, a player could hold it, or a person could fill the role: animals, plants, food, tools, vehicles, weather, furniture, human roles.

**Abstract** means concepts, grammar, emotions, time words, measurements: 経験 (experience), 関係 (relationship), 以上 (more than).

**Hard rules in the prompt:**
- Animals, plants, food, tools, vehicles, weather, buildings, furniture → YES
- Human roles (teacher, doctor, soldier, king) → YES
- Body parts with clear visual form (hand, eye, leg) → YES
- Emotions, concepts, grammar, time, counters → NO
- **When uncertain, mark YES.** Better to include and drop later.

**Output format per agent:** One line per word. `Y\trank\tword\tmeaning` or `N\trank\tword\tmeaning`. Nothing else.

**Output:** ~400–600 concrete nouns expected.

### Step 3 — Discover areas and assign words (1 or 2 Opus agents)

If the concrete list exceeds 500 words, split into two agents. Otherwise, one agent handles everything.

The agent receives all concrete nouns sorted by rank (most common first) and:

1. **Discovers 8–12 areas** from natural word clusters. Areas should emerge from the vocabulary — if 30 food words exist, a market or kitchen area makes sense. Do not force fantasy themes onto everyday vocabulary.
2. **Categorizes each word** as creature, item, or boss:
   - Creature: anything that could be reimagined as a collectible monster (dog, spider, flame, umbrella)
   - Item: anything that suggests a gameplay buff (medicine, key, map, armor)
   - Boss: human roles that fit the area (teacher, doctor, king, chef)
3. **Assigns element** to each creature (wood/fire/water/metal/earth). Element should feel natural — 犬 (dog) is earth, 魚 (fish) is water.
4. **May propose rank 5000+ additions** with justification. Example: "Sakura Academy has no boss — proposing 校長 (principal, rank 8665)."

**Constraints:**
- Every concrete noun from Step 2 must appear. The agent cannot drop any.
- Each area needs at least 15 creatures, 8 items, and 3 bosses.
- No area may exceed 30 creatures.
- Element distribution per area should have at least 3 of 5 elements represented.

**Output format:** JSON with areas, each containing creatures/items/bosses arrays.

### Step 4 — Validate (Node.js)

A script checks:
- Every Step 2 concrete noun appears in exactly one area
- No rank 5000+ word lacks a justification field
- Each area meets size minimums (15c/8i/3b)
- No duplicates across areas
- Element balance (no area >70% one element unless thematically appropriate)
- Prints a summary report

### Step 5 — Assemble (Node.js)

Enriches entries with readings and meanings from the CSV. Computes per-area and global stats. Writes `output/vocab-areas.json` in the production schema:

```json
{
  "areas": [{
    "id": "kitchen",
    "name": "厨房エリア",
    "nameEn": "Kitchen District",
    "description": "...",
    "creatures": [{
      "word": "鍋", "reading": "なべ", "meaning": "pot",
      "rank": 3735, "element": "fire", "reasoning": "..."
    }],
    "items": [...],
    "bosses": [...],
    "stats": { "avgCreatureRank": ..., "elementDistribution": {...} }
  }],
  "globalStats": { "totalWords": ..., "rankRange": [...], "avgRank": ..., "elementTotals": {...} }
}
```

## Agent count

| Step | Agents | Purpose |
|------|--------|---------|
| 2 — Filter | 2 | Concrete/abstract classification |
| 3 — Assign | 1–2 | Area discovery + word assignment |
| **Total** | **3–4** | Down from 9 in v1 |

## Success criteria

1. Median word rank < 3000
2. 80%+ of words are rank 1–5000
3. Every area is recognizable from its word list alone
4. Every creature suggests a drawable sprite
5. Every boss is a human role
6. Every item suggests a gameplay buff
7. No concrete noun from rank 1–5000 is left unplaced

## Key differences from v1

| v1 | v2 |
|----|-----|
| "Favor rare words" | "Favor common words" |
| 9 agents, 3 phases | 3–4 agents, linear |
| AI picks which words to include | Code picks words, AI assigns them |
| Areas pre-themed (Enchanted Forest) | Areas emerge from vocabulary clusters |
| Avg rank 7560 | Target avg rank < 3000 |
| 362 words | As many as fit naturally |
