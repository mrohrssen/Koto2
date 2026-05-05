---
name: item-forge
description: "[DEPRECATED — DO NOT USE] Stale skill — do not invoke. Original (for reference only): Generate game items (consumables, equipment, crafting resources)."
user_invocable: false
---

> **DEPRECATED — DO NOT USE**
>
> This skill is stale and should not be invoked. Its tables, workflows, and
> assumptions reflect an older version of the game systems and may produce
> incorrect content. Do not run `/item-forge`. See current reference docs
> (e.g. `docs/move-system-reference.md`) for the actual design space.

# Item Forge

Generate game items for Koto. Each item is a Japanese word (often compound) with JPDB frequency data driving its rarity and combat effect. Supports three item types: consumables (food-themed), equipment (persistent gear), and crafting resources.

## Input Modes

- `/item-forge` — default: 10 consumable food items
- `/item-forge --type equipment` — generate equipment items
- `/item-forge --type crafting` — generate crafting resources
- `/item-forge --stage 3` — target specific stage
- `/item-forge --type equipment --stage 5 --count 5` — full control

## Theme Pool Mode: `/item-forge --theme school`

When `--theme <themeId>` is provided, draw item seed words from the theme pool:

1. Run `node scripts/forge-discovery.mjs --theme school --role item --limit 20` to get unassigned item-role words from the theme pool.
2. Use these words as seeds for compound item brainstorming (Phase 1).
3. Prioritize items whose component words come from the theme pool.
4. **After save:** Mark used words as assigned in the theme file via `markAssigned()` from `scripts/lib/theme-utils.mjs`.

## Discovery Mode (all types)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps item` to see which stages need items most.
2. **Discover candidates by type:**
   - Consumables: `node scripts/forge-discovery.mjs --type item-consumable --stage N --limit 20`
   - Equipment: `node scripts/forge-discovery.mjs --type item-equipment --stage N --limit 20`
   - Crafting: `node scripts/forge-discovery.mjs --type item-crafting --stage N --limit 20`
3. Cross-ref existing items in `data/items.json` and `data/new-items-staging.json`.

## Workflow

You handle the entire pipeline autonomously. The user only sees the final polished table of 10 items.

### Phase 1: Brainstorm Candidates

Generate ~20-30 item candidates. Each candidate needs:
- `id`: kebab-case English name (e.g., `salmon-sushi`)
- `compound`: the full Japanese word (e.g., `鮭寿司`)
- `components`: array of component Japanese words (e.g., `["鮭", "寿司"]`)
- `meaning`: English meaning (e.g., `salmon sushi`)
- `reading`: expected reading (e.g., `さけずし`)
- `itemType`: `"consumable"`, `"equipment"`, or `"crafting"`

**Diversity targets (consumables):**
- Mix Japanese-origin foods (寿司, おにぎり, 味噌汁) and loanwords (チーズバーガー, ピザ)
- Cover all food types: rice, noodles, sushi, bread, drinks, desserts, snacks, soups
- Spread across difficulty tiers (don't make them all common or all legendary)
- Smart compound combos: "salmon sushi", "melon bread", "curry rice", "green tea"
- Single-word foods are fine too: ラーメン, うどん, おにぎり

**Check for duplicates:** Read `data/new-items-staging.json` (if it exists). Skip any item whose `id` or `word` matches an existing entry.

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

| Type | Effect Options |
|------|---------------|
| xpCharm | `{ xpMultiplier: 0.25 }` — +25% XP multiplier (stacks) |
| xpBalance | `{ xpBalance: true }` — redistribute XP toward lower-level creatures |

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
  "itemType": "consumable",
  "components": [
    { "word": "鮭", "reading": "さけ", "meanings": ["salmon"], "rank": 8521 },
    { "word": "寿司", "reading": "すし", "meanings": ["sushi"], "rank": 5890 }
  ],
  "compoundRank": null,
  "rank": 8521,
  "rarity": "rare",
  "stage": 4,
  "type": "heal",
  "effect": { "healMostDamaged": true },
  "description": "Heal the most damaged creature to full HP",
  "descriptionJa": "最もダメージを受けたクリーチャーを全回復"
}
```

Read `data/new-items-staging.json` (or initialize `[]` if missing). Append approved items. Write back.

Confirm: **"Saved N items to staging! X total items now in data/new-items-staging.json."**

## Equipment Items

Equipment is persistent (stays in creature collection), one slot per creature.

### Equipment Fields

| Field | Description |
|-------|-------------|
| `itemType` | `"equipment"` |
| `slot` | `"weapon"` \| `"armor"` \| `"accessory"` |
| `statBonus` | Object: `{ attackPercent, hpPercent, mpPercent, elementEdge }` (one or more) |
| `creatureTypeRestriction` | Optional archetype or element restriction |

### Equipment Effect Guidelines

| Rarity | Stat Bonus Range |
|--------|-----------------|
| common | +3-5% one stat |
| uncommon | +5-8% one stat or +3% two stats |
| rare | +8-12% one stat or +5% two stats |
| epic | +12-15% one stat or +8% two stats, may include elementEdge |
| legendary | +15-20% or multi-stat + elementEdge |

### Equipment Word Sources

- Weapons: tool/weapon nouns in `objects.json` (剣 sword, 弓 bow, 杖 staff, 槍 spear)
- Armor: defensive nouns (盾 shield, 鎧 armor, 兜 helmet)
- Accessories: ornamental nouns (指輪 ring, 首飾り necklace, 腕輪 bracelet)
- Compound preferred: 鉄の剣 (iron sword) teaches both 鉄 and 剣

## Crafting Resources

Crafting resources are run-scoped (gathered during runs, not persistent). They combine to create equipment or consumables.

### Crafting Fields

| Field | Description |
|-------|-------------|
| `itemType` | `"crafting"` |
| `yieldsItemId` | ID of the item this crafts into |
| `quantity` | How many of this resource needed per craft |

### Crafting Word Sources

- Raw materials from `nature.json` and `objects.json`: 鉄 (iron), 木 (wood), 石 (stone), 糸 (thread)
- Compound word teaching: combining 鉄 + 剣 → 鉄の剣 teaches a compound

## Translation Accuracy Rules

- **Show raw JPDB meanings arrays.** Never summarize or paraphrase.
- **Use primary dictionary definitions** for the `meaning` field.
- **Transitivity matters.** Don't flip intransitive <-> transitive.
- **No embellishment.** Don't upgrade "rice ball" to "power sphere" or "healing orb."
- **Compound meanings are literal.** 鮭寿司 = "salmon sushi", not "oceanic feast."

## Re-running

The skill can be run multiple times. Each run appends to `data/new-items-staging.json`. The duplicate check in Phase 1 prevents adding the same item twice.
