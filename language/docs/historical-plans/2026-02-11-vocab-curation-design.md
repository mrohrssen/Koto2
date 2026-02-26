# Vocab Curation Pipeline Design

> Turn 27,000 Japanese words into 10 themed game areas, each populated with creatures, items, and bosses that players learn through play.

## Goal

Build a subagent pipeline that scans the JPDB wordlist (`data/jpdb-wordlist.csv`, ~27k rows) and produces a curated JSON file containing:

- **10 themed areas** discovered from natural word clusters in the data
- **~20 creatures per area** — physical objects reimagined as collectible monsters (Pokémon-style)
- **~10 items per area** — physical objects that provide one-time or ongoing gameplay buffs
- **~5 bosses per area** — human roles that fit the area's theme

**Total output: ~350 vocab words**, each tied to a specific area, category, and (for creatures) element.

## Design Principles

**Frequency optimization.** The pipeline favors lower-frequency words (higher rank numbers). A rank-8000 word teaches the player more than a rank-200 word they already know. Every output entry carries its frequency rank so we can audit this.

**Creative interpretation.** A word like 水 (water, rank ~600) isn't obviously a creature or item. But interpreted as a water bottle, it works as an item. Agents should think creatively about what each word *could represent* in a game world. Compound words are allowed when both components appear in the CSV — both ranks must be tracked.

**Natural element distribution.** Creatures get one of five elements: Wood, Fire, Water, Metal, Earth. Areas may skew toward certain elements (a kitchen area skews Fire) — this is intentional and creates strategic depth. Players must bring counter-element teams to element-heavy areas. Items and bosses have no element.

**Data-driven area discovery.** Rather than predefining areas, agents discover which thematic clusters the vocabulary supports. The data decides whether "Hospital," "Train Station," or "Festival" becomes an area.

## Replaces

This system replaces the current Tokyo ward system (Nerima, Setagaya, Shibuya, etc.) with themed areas derived from vocabulary clusters. The ward map, ward paths, and ward-specific enemies will be rebuilt around whatever areas emerge from this pipeline.

## Pipeline Architecture

### Phase 1 — Extraction (15 parallel agents + 3 verifiers)

**Input:** CSV rows 1–15,000, split into 15 chunks of 1,000 rows.

Each extraction agent receives one chunk and identifies every word that could serve as a creature, item, boss, or area name. The agent:

- Scans each row for concrete nouns — physical objects, places, human roles
- Skips grammar particles, abstract concepts, adjectives, and verbs (unless a verb strongly suggests a concrete thing, e.g., 泳ぐ/swim → swimming pool area)
- For each candidate, records: rank, word, reading, meaning, potential category, reasoning
- Flags compound opportunities where a common word could pair with another to form something specific
- Errs on the side of inclusion — Phase 2 will filter

**Verification (3 agents, each reviewing 5 chunks):**

Each verifier receives the output of 5 extraction agents and checks:

- Did the extractor miss obvious candidates? (Scan the raw CSV chunk for missed concrete nouns)
- Are any picks clearly wrong? (Abstract nouns slipping through, verbs with no concrete interpretation)
- Are compound suggestions reasonable? (Both components should be learnable words)
- Consistency: are similar words categorized similarly across chunks?

### Phase 2 — Categorization & Area Discovery (3 agents)

**Input:** Merged, verified master list from Phase 1 (~500–1,000 candidate words).

**Agent 2A — Area Discovery:**
Reviews the full candidate list and proposes 10 themed areas based on natural word clusters. For each area, provides:
- Area name (Japanese + English)
- Brief description
- Why this cluster is strong (word count, thematic coherence)
- Which candidates belong here

**Agent 2B — Assignment:**
Takes the 10 proposed areas and assigns every candidate word as creature, item, or boss:
- **Creature criteria:** Would make a visually distinctive sprite. Fits an element naturally. Physical object that can be "alive."
- **Item criteria:** Makes sense as a one-time use or ongoing buff. Tools, consumables, small objects.
- **Boss criteria:** Human role or authority figure. Fits the area thematically.
- Assigns elements to creatures only, based on material/nature associations.
- Targets ~20 creatures, ~10 items, ~5 bosses per area. Flexible if the data doesn't support it evenly.

**Agent 2C — Verification:**
Reviews all assignments and challenges them:
- Could any creature work better as an item, or vice versa?
- Are the areas distinct enough, or do two areas overlap heavily?
- For each area, could we push the average rank higher by swapping picks?
- Are any elements completely absent from an area that should have them?
- Are boss picks interesting and varied, or generic?

### Phase 3 — Final Assembly & Audit (2 agents)

**Agent 3A — Assembly:**
Produces the final structured JSON with all metadata:
- Full area definitions with creatures, items, bosses
- Rank on every entry
- Compound flag with both component ranks where applicable
- Reasoning for each pick
- Per-area statistics: average rank by category, element distribution
- Global statistics: total words used, rank range covered, element balance

**Agent 3B — Final Audit:**
The last line of defense. This agent receives the complete output and runs a critical review:
- Frequency check: Are we leaving lower-frequency words on the table? Could any high-frequency pick be replaced?
- Thematic check: Does each area tell a coherent story? Would a player recognize "this is a school" from the creatures/items/bosses?
- Sprite potential: Would an artist know what to draw for each creature?
- Learning value: Are these words a language learner would actually encounter?
- Balance: Is any area significantly weaker than others?

## Agent Summary

| Phase | Agents | Model | Purpose |
|-------|--------|-------|---------|
| 1 — Extraction | 15 | Opus 4.6 | Scan CSV chunks for candidates |
| 1 — Verification | 3 | Opus 4.6 | Review 5 chunks each, catch errors |
| 2 — Area Discovery | 1 | Opus 4.6 | Propose 10 areas from word clusters |
| 2 — Assignment | 1 | Opus 4.6 | Categorize words, assign elements |
| 2 — Verification | 1 | Opus 4.6 | Challenge all assignments |
| 3 — Assembly | 1 | Opus 4.6 | Produce final JSON |
| 3 — Audit | 1 | Opus 4.6 | Final quality gate |
| **Total** | **23** | | |

## Output Format

```json
{
  "areas": [
    {
      "id": "school",
      "name": "学園エリア",
      "nameEn": "School District",
      "description": "A sprawling campus overrun by possessed students and sentient supplies.",
      "creatures": [
        {
          "word": "鉛筆",
          "reading": "えんぴつ",
          "meaning": "pencil",
          "rank": 4523,
          "element": "wood",
          "compound": false,
          "reasoning": "Wooden pencil — natural wood element. Visually distinctive for sprite design."
        }
      ],
      "items": [
        {
          "word": "定規",
          "reading": "じょうぎ",
          "meaning": "ruler",
          "rank": 11234,
          "compound": false,
          "reasoning": "Precision measurement tool — buff for accuracy or critical hit."
        }
      ],
      "bosses": [
        {
          "word": "先生",
          "reading": "せんせい",
          "meaning": "teacher",
          "rank": 282,
          "compound": false,
          "reasoning": "Universal authority figure in school setting."
        }
      ],
      "stats": {
        "avgCreatureRank": 6200,
        "avgItemRank": 7800,
        "avgBossRank": 3100,
        "elementDistribution": { "wood": 6, "fire": 3, "water": 2, "metal": 5, "earth": 4 }
      }
    }
  ],
  "globalStats": {
    "totalWords": 350,
    "rankRange": [282, 14500],
    "avgRank": 5800,
    "elementTotals": { "wood": 40, "fire": 42, "water": 38, "metal": 41, "earth": 39 }
  }
}
```

## Risk Mitigation

**Sparse chunks.** Ranks 1–1,000 are mostly grammar. That extraction agent will return few candidates. This is expected — the verifier ensures nothing concrete was missed.

**Ambiguous categorization.** Many objects could be either creature or item (e.g., a cup). The Phase 2 assignment agent uses these tiebreakers: (1) Does it make a better sprite? → creature. (2) Does it make more sense as a buff/consumable? → item. (3) When truly ambiguous, prefer creature — the game needs more creatures than items.

**Area imbalance.** Some areas may naturally have more vocab than others. The Phase 2 verifier flags any area below 15 creatures or above 25. The assembly agent can split rich areas or merge thin ones.

**Compound frequency creep.** A compound like 水筒 (water bottle) combines rank-600 水 with another word. If the compound pushes effective frequency too high, the agent should prefer the standalone word or find a different compound.

## Success Criteria

The pipeline succeeds when:
1. All 10 areas are thematically distinct and recognizable
2. Average creature rank across all areas exceeds 3,000 (we're not just picking easy words)
3. Every creature could inspire a visually distinct sprite
4. Every boss is a human role that fits its area
5. Every item suggests a clear gameplay buff
6. Element distribution per area emerged naturally, not forced
7. A language learner playing through all 10 areas would encounter ~350 practical vocabulary words
