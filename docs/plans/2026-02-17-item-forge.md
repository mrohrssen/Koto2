# Item Forge Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `/item-forge` Claude Code skill that generates 10 food-themed game items per batch, with live JPDB frequency lookups driving rarity tiers and effects.

**Architecture:** Single-agent skill at `~/.claude/skills/item-forge/SKILL.md`. The skill brainstorms ~20-30 food candidates, writes a temp Node.js script to look up JPDB frequencies for all components, filters/retries autonomously, then presents 10 polished items for user approval. Approved items are appended to `data/new-items-staging.json`.

**Tech Stack:** Claude Code skill (markdown), JPDB API via `scripts/lib/jpdb-helpers.mjs`, Node.js temp scripts

---

### Task 1: Create the JPDB lookup helper script

The skill needs a reusable script that takes a JSON array of food item candidates (each with component words), looks up JPDB frequency data for every component and the compound, and outputs enriched JSON. This runs from `/tmp/` each invocation.

**Files:**
- Create: `scripts/item-forge-lookup.mjs`

**Step 1: Write the lookup script**

This script reads candidate items from stdin (JSON), looks up each component word and compound via JPDB, and writes enriched results to stdout.

```javascript
#!/usr/bin/env node
// Usage: echo '[{"id":"salmon-sushi","compound":"鮭寿司","components":["鮭","寿司"]}]' | \
//   JPDB_API_KEY=xxx node scripts/item-forge-lookup.mjs

import { parseBatch, lookupVocab, sleep } from './lib/jpdb-helpers.mjs';

const apiKey = process.env.JPDB_API_KEY;
if (!apiKey) {
  console.error('JPDB_API_KEY env var required');
  process.exit(1);
}

const input = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => resolve(JSON.parse(data)));
});

// Collect all unique words (components + compounds)
const allWords = new Set();
for (const item of input) {
  for (const comp of item.components) allWords.add(comp);
  if (item.compound) allWords.add(item.compound);
}

const wordList = [...allWords];

// Step 1: Parse all words to get vid/sid
const parseResult = await parseBatch(wordList, apiKey, {
  vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
  batchSize: 30,
  interBatchDelayMs: 1000
});

// Build word -> parsed entry map
const wordMap = new Map();
for (const entry of parseResult.vocabulary) {
  // entry: [spelling, reading, vid, sid, meanings]
  wordMap.set(entry[0], {
    spelling: entry[0],
    reading: entry[1],
    vid: entry[2],
    sid: entry[3],
    meanings: entry[4] || []
  });
}

// Step 2: Lookup frequency for all parsed words with valid vid/sid
const validEntries = [...wordMap.values()].filter(e => e.vid != null);
if (validEntries.length > 0) {
  await sleep(1000);
  const vidSidPairs = validEntries.map(e => [e.vid, e.sid]);
  const lookupResult = await lookupVocab(vidSidPairs, apiKey,
    ['spelling', 'reading', 'frequency_rank', 'meanings'],
    { batchSize: 500, interBatchDelayMs: 1000 }
  );
  for (let i = 0; i < validEntries.length; i++) {
    const info = lookupResult.vocabulary_info[i];
    // info: [spelling, reading, frequency_rank, meanings]
    const entry = validEntries[i];
    entry.rank = info[2];
    entry.meanings = info[3] || entry.meanings;
  }
}

// Step 3: Enrich each input item with lookup results
const results = input.map(item => {
  const enrichedComponents = item.components.map(comp => {
    const entry = wordMap.get(comp);
    if (!entry) return { word: comp, reading: null, meanings: [], rank: null };
    return {
      word: entry.spelling,
      reading: entry.reading,
      meanings: entry.meanings,
      rank: entry.rank ?? null
    };
  });

  const compoundEntry = item.compound ? wordMap.get(item.compound) : null;
  const compoundRank = compoundEntry?.rank ?? null;

  // Tier rank = max rank among components (rarest component)
  const componentRanks = enrichedComponents.map(c => c.rank).filter(r => r != null);
  const tierRank = componentRanks.length > 0 ? Math.max(...componentRanks) : null;

  return {
    ...item,
    components: enrichedComponents,
    compoundRank,
    tierRank
  };
});

console.log(JSON.stringify(results, null, 2));
```

**Step 2: Verify it runs (syntax check)**

Run: `node --check scripts/item-forge-lookup.mjs`
Expected: No output (clean syntax)

**Step 3: Commit**

```bash
git add scripts/item-forge-lookup.mjs
git commit -m "feat: add JPDB lookup script for item forge"
```

---

### Task 2: Create the item-forge skill file

The main skill file that Claude Code loads when the user runs `/item-forge`.

**Files:**
- Create: `~/.claude/skills/item-forge/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/item-forge
```

**Step 2: Write the skill file**

Create `~/.claude/skills/item-forge/SKILL.md` with this content:

````markdown
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

Write a temp script to `/tmp/item-forge-candidates.json` with your candidates array, then run:

```bash
JPDB_API_KEY=$(cat /Users/michia/Documents/jrpg/data/.creature-forge-jpdb-key) \
  node /Users/michia/Documents/jrpg/scripts/item-forge-lookup.mjs < /tmp/item-forge-candidates.json \
  > /tmp/item-forge-results.json
```

Read the results. Each item now has enriched `components` with `rank` and `meanings` arrays, plus `compoundRank` and `tierRank`.

### Phase 3: Filter

Remove items that fail any of these checks:
- ANY component has `rank: null` (not found in JPDB)
- ANY component rank > 30,000 (too obscure for a game)
- ALL components rank < 100 (too trivially common — boring to learn)
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
| 1–3,000 | common | `healPercent: 0.15` or `healPercent: 0.20` |
| 3,001–6,000 | uncommon | `healAllPercent: 0.10`, `healAllPercent: 0.15`, or `{ field: "attackMult", value: 0.02 }` |
| 6,001–12,000 | rare | `healMostDamaged: true`, `chargeBoost: 2`, or `{ field: "attackMult", value: 0.03 }` |
| 12,001–20,000 | epic | `revivePercent: 0.50`, compound effects, or `tempBoost` (schema only) |
| 20,001–30,000 | legendary | `revivePercent: 1.0`, `tempBoost` (schema only), or multi-effect |

Pick effects that feel thematic — a hearty meal heals more, a caffeinated drink boosts attack, etc.

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
- **Transitivity matters.** Don't flip intransitive ↔ transitive.
- **No embellishment.** Don't upgrade "rice ball" to "power sphere" or "healing orb."
- **Compound meanings are literal.** 鮭寿司 = "salmon sushi", not "oceanic feast."

## Re-running

The skill can be run multiple times. Each run appends to `data/new-items-staging.json`. The duplicate check in Phase 1 prevents adding the same item twice.
````

**Step 3: Verify the skill is discoverable**

```bash
ls -la ~/.claude/skills/item-forge/SKILL.md
```

Expected: File exists with the content above.

**Step 4: Commit the lookup script (skill file is outside repo)**

The skill file lives at `~/.claude/skills/item-forge/SKILL.md` (outside git). The lookup script is in-repo and was committed in Task 1.

---

### Task 3: Initialize the staging file

**Files:**
- Create: `data/new-items-staging.json`

**Step 1: Create empty staging array**

Write `data/new-items-staging.json`:
```json
[]
```

**Step 2: Verify item-service can handle both old and new schemas**

Read `src/game/services/item-service.js`. The service reads `data/items.json` directly. The new staging file is independent — it won't be loaded by the game until the user explicitly copies it to `items.json`. No code changes needed for staging.

**Step 3: Commit**

```bash
git add data/new-items-staging.json
git commit -m "feat: initialize empty items staging file for item forge"
```

---

### Task 4: Test the full skill end-to-end

**Step 1: Verify JPDB API key exists**

```bash
test -f data/.creature-forge-jpdb-key && echo "Key exists" || echo "No key"
```

Expected: "Key exists" (shared with creature forge)

**Step 2: Dry-run the lookup script with test data**

Write test candidates to `/tmp/item-forge-test.json`:
```json
[
  {"id": "green-tea", "compound": "緑茶", "components": ["緑", "茶"], "meaning": "green tea", "reading": "りょくちゃ"},
  {"id": "rice-ball", "compound": "おにぎり", "components": ["おにぎり"], "meaning": "rice ball", "reading": "おにぎり"}
]
```

Run:
```bash
JPDB_API_KEY=$(cat data/.creature-forge-jpdb-key) \
  node scripts/item-forge-lookup.mjs < /tmp/item-forge-test.json
```

Expected: JSON output with enriched components — each should have `rank`, `reading`, and `meanings` populated. `tierRank` should be the max component rank.

**Step 3: Run the skill**

Start a new Claude Code session and run `/item-forge`. Verify:
- It brainstorms ~20-30 food candidates
- Runs JPDB lookups autonomously
- Filters out bad results
- Presents a table of 10 items with raw JPDB meanings
- Saves approved items to `data/new-items-staging.json`

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | JPDB lookup helper script | `scripts/item-forge-lookup.mjs` |
| 2 | Skill file | `~/.claude/skills/item-forge/SKILL.md` |
| 3 | Empty staging file | `data/new-items-staging.json` |
| 4 | End-to-end test | Manual verification |
