---
name: item-forge
description: Generate food-themed game items in batches of 10 with JPDB frequency data. Triggers on "item forge", "new items", "forge items", "food items".
---

# Item Forge

Generate 10 food-themed consumable items for NEO TOKYO: System Liberation. Each item is a Japanese food word (often compound) with JPDB frequency data driving its rarity and combat effect.

## Workflow

You handle the entire pipeline autonomously. The user only sees the final polished table of 10 items.

### Phase 1: Brainstorm Candidates

Generate ~20-30 food item candidates. Each candidate needs:
- `id`: kebab-case English name (e.g., `salmon-sushi`)
- `compound`: the full Japanese word (e.g., `鮭寿司`)
- `components`: array of component Japanese words (e.g., `["鮭", "寿司"]`)
- `meaning`: English meaning (e.g., `salmon sushi`)
- `reading`: expected reading (e.g., `さけずし`)

**Diversity targets:**
- Mix Japanese-origin foods (寿司, おにぎり, 味噌汁) and loanwords (チーズバーガー, ピザ)
- Cover all food types: rice, noodles, sushi, bread, drinks, desserts, snacks, soups
- Spread across difficulty tiers (don't make them all common or all legendary)
- Smart compound combos: "salmon sushi", "melon bread", "curry rice", "green tea"
- Single-word foods are fine too: ラーメン, うどん, おにぎり

**Check for duplicates:** Read `data/new-items-staging.json` (if it exists). Skip any food whose `id` or `word` matches an existing entry.

### Phase 2: JPDB Lookup

Write your candidates array as JSON to `/tmp/item-forge-candidates.json`, then run:

```bash
JPDB_API_KEY=$(cat data/.creature-forge-jpdb-key) \
  node scripts/item-forge-lookup.mjs < /tmp/item-forge-candidates.json \
  > /tmp/item-forge-results.json
```

Read the results. Each item now has enriched `components` with `rank` and `meanings` arrays, plus `compoundRank` and `tierRank`.

### Phase 3: Filter

Remove items that fail any of these checks:
- ANY component has `rank: null` (not found in JPDB)
- ANY component rank > 30,000 (too obscure for a game)
- ALL components rank < 100 (too trivially common -- boring to learn)
- Already exists in `data/new-items-staging.json`

### Phase 4: Retry if Needed

If fewer than 10 items survive filtering, brainstorm more candidates (avoiding ones you already tried) and repeat Phases 2-3. Keep going until you have at least 10 viable items.

### Phase 5: Select Best 10

From surviving items, pick the best 10 with:
- Good tier spread (aim for ~3 common, ~3 uncommon, ~2 rare, ~1 epic, ~1 legendary)
- Diverse food types (not all sushi, not all drinks)
- Interesting vocabulary (prefer words players will actually encounter)

### Phase 6: Assign Effects

Use the tier rank (rarest component) to determine rarity and assign effects:

| JPDB Rank | Rarity | Effect Options |
|-----------|--------|----------------|
| 1-3,000 | common | `healPercent: 0.15` or `healPercent: 0.20` |
| 3,001-6,000 | uncommon | `healAllPercent: 0.10`, `healAllPercent: 0.15`, or `{ field: "attackMult", value: 0.02 }` |
| 6,001-12,000 | rare | `healMostDamaged: true`, `chargeBoost: 2`, or `{ field: "attackMult", value: 0.03 }` |
| 12,001-20,000 | epic | `revivePercent: 0.50`, compound effects, or `tempBoost` (schema only) |
| 20,001-30,000 | legendary | `revivePercent: 1.0`, `tempBoost` (schema only), or multi-effect |

Pick effects that feel thematic -- a hearty meal heals more, a caffeinated drink boosts attack, etc.

**tempBoost schema** (not yet implemented in game code):
```json
{ "tempBoost": { "field": "attack", "value": 3, "turns": 5, "target": "single" } }
```

### Phase 7: Present to User

Show the final 10 items in this table format:

```
| # | Item | Japanese | Components | Tier Rank | Rarity | Effect |
|---|------|----------|------------|-----------|--------|--------|
| 1 | Salmon Sushi | 鮭寿司 (さけずし) | 鮭 ["salmon"] rank 8,521 + 寿司 ["sushi"] rank 5,890 | 8,521 | rare | Heal most damaged to full |
```

**CRITICAL:** Show raw JPDB `meanings` arrays for each component. Never paraphrase. The user must verify translations against source data.

Ask: "Approve all 10? Or tell me which numbers to change and what to fix."

### Phase 8: Save

For each approved item, build the full item object:

```json
{
  "id": "salmon-sushi",
  "word": "鮭寿司",
  "reading": "さけずし",
  "meaning": "salmon sushi",
  "components": [
    { "word": "鮭", "reading": "さけ", "meanings": ["salmon"], "rank": 8521 },
    { "word": "寿司", "reading": "すし", "meanings": ["sushi"], "rank": 5890 }
  ],
  "compoundRank": null,
  "rank": 8521,
  "rarity": "rare",
  "type": "heal",
  "effect": { "healMostDamaged": true },
  "description": "Heal the most damaged creature to full HP",
  "descriptionJa": "最もダメージを受けたクリーチャーを全回復"
}
```

Read `data/new-items-staging.json` (or initialize `[]` if missing). Append approved items. Write back.

Confirm: **"Saved N items to staging! X total items now in data/new-items-staging.json."**

## Translation Accuracy Rules

- **Show raw JPDB meanings arrays.** Never summarize or paraphrase.
- **Use primary dictionary definitions** for the `meaning` field.
- **Transitivity matters.** Don't flip intransitive <-> transitive.
- **No embellishment.** Don't upgrade "rice ball" to "power sphere" or "healing orb."
- **Compound meanings are literal.** 鮭寿司 = "salmon sushi", not "oceanic feast."

## Re-running

The skill can be run multiple times. Each run appends to `data/new-items-staging.json`. The duplicate check in Phase 1 prevents adding the same item twice.
