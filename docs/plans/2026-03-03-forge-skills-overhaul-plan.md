# Forge Skills Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all 6 Koto Forge skills to align with the current game systems (Pokemon-style moves/learnsets, stage system, vocab category files, sub-areas, unified item types, bond-based NPCs).

**Architecture:** The forge skills are Claude Code plugin skill files (markdown) in `.claude/plugins/koto-forge/1.0.0/skills/`. A new shared helper script `scripts/forge-discovery.mjs` provides stage-aware word discovery from `language/categories/` files. Each skill file is updated to reference the new discovery flow and produce output matching current data schemas in `data/`.

**Tech Stack:** Node.js ES modules (helper script), Markdown (skill files), JSON (category data, game data)

**Design doc:** `docs/plans/2026-03-03-forge-skills-overhaul-design.md`

---

## Task 1: Create Shared `forge-discovery.mjs` Helper Script

This script reads vocab category files and WK data, filters by stage, excludes existing content, and returns ranked word candidates. All forges will reference this script in their discovery phases.

**Files:**
- Create: `scripts/forge-discovery.mjs`
- Read: `language/stage-utils.js` (reuse `getWordStrictStage`)
- Read: `language/dictionaries/wanikani-vocab.json` (WK POS tags)
- Read: `language/categories/*.json` (category data)
- Read: `data/creatures.json`, `data/moves.json`, `data/items.json`, `data/new-areas-staging.json` (exclusion sets)

**Step 1: Write the failing test**

Create `tests/unit/scripts/forge-discovery.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We'll test the module's exported functions
// The module reads real data files so this is closer to integration,
// but the functions themselves are pure filters

describe('forge-discovery', () => {
  let discover;

  it('should load the module', async () => {
    discover = await import('../../../scripts/forge-discovery.mjs');
    assert.ok(discover.discoverWords);
    assert.ok(discover.getStageGaps);
  });

  it('should return words filtered by stage for creature base words', async () => {
    const results = await discover.discoverWords({
      contentType: 'creature-base',
      targetStage: 3,
      limit: 10
    });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results.length <= 10);
    // Each result should have word, reading, meaning, rank, stage, source
    const first = results[0];
    assert.ok(first.word);
    assert.ok(first.meaning);
    assert.ok(typeof first.rank === 'number');
    assert.ok(typeof first.stage === 'number');
    assert.ok(first.stage <= 3);
  });

  it('should exclude words already used in creatures.json', async () => {
    const results = await discover.discoverWords({
      contentType: 'creature-base',
      targetStage: 6, // stage 6 has 亀 (turtle) which is in creatures.json
      limit: 100
    });
    const words = results.map(r => r.word);
    // 亀 (turtle) is baseWord for kamedor — should be excluded
    assert.ok(!words.includes('亀'), '亀 should be excluded (already used as creature base word)');
  });

  it('should return verbs for move discovery', async () => {
    const results = await discover.discoverWords({
      contentType: 'move',
      targetStage: 1,
      limit: 10
    });
    assert.ok(results.length > 0);
    // All should be verbs — can't check POS directly but word should exist
    for (const r of results) {
      assert.ok(r.word);
      assert.ok(r.meaning);
    }
  });

  it('should return foods for item-consumable discovery', async () => {
    const results = await discover.discoverWords({
      contentType: 'item-consumable',
      targetStage: 5,
      limit: 10
    });
    assert.ok(results.length > 0);
  });

  it('should return locations for area discovery', async () => {
    const results = await discover.discoverWords({
      contentType: 'area',
      targetStage: 5,
      limit: 10
    });
    assert.ok(results.length > 0);
  });

  it('should return occupations for npc discovery', async () => {
    const results = await discover.discoverWords({
      contentType: 'npc',
      targetStage: 5,
      limit: 10
    });
    assert.ok(results.length > 0);
  });

  it('should identify stage gaps via getStageGaps', async () => {
    const gaps = await discover.getStageGaps('creature');
    assert.ok(Array.isArray(gaps));
    assert.ok(gaps.length === 10); // one entry per stage
    // Each entry: { stage, count, target }
    const first = gaps[0];
    assert.ok(typeof first.stage === 'number');
    assert.ok(typeof first.count === 'number');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `scripts/forge-discovery.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Forge Discovery — shared stage-aware word discovery for all Koto Forge skills.
 *
 * Usage as CLI:
 *   node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 20
 *   node scripts/forge-discovery.mjs --type move --stage 1 --limit 10
 *   node scripts/forge-discovery.mjs --gaps creature
 *
 * Usage as module:
 *   import { discoverWords, getStageGaps } from './scripts/forge-discovery.mjs';
 *   const results = await discoverWords({ contentType: 'creature-base', targetStage: 3, limit: 20 });
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Data loading ────────────────────────────────────────────────────

function loadJson(relPath) {
  try {
    return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
  } catch { return []; }
}

function loadJsonObj(relPath) {
  try {
    return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
  } catch { return {}; }
}

// Lazy-load caches
let _stageDefs, _wkVocab, _categories;

function stageDefs() {
  if (!_stageDefs) _stageDefs = loadJsonObj('data/stage-definitions.json');
  return _stageDefs;
}

function wkVocab() {
  if (!_wkVocab) {
    const raw = loadJsonObj('language/dictionaries/wanikani-vocab.json');
    _wkVocab = raw.vocabulary || [];
  }
  return _wkVocab;
}

function categoryWords(filename) {
  if (!_categories) _categories = {};
  if (!_categories[filename]) {
    _categories[filename] = loadJson(`language/categories/${filename}`);
  }
  return _categories[filename];
}

// ── Stage utils (inline to avoid import issues) ─────────────────────

function getWordStage(word, jpdbRank) {
  // Check WK first
  const wkEntry = wkVocab().find(v => v.characters === word);
  if (wkEntry) return Math.ceil(wkEntry.level / 6);
  // Fall back to JPDB rank
  if (jpdbRank == null) return null;
  for (const s of stageDefs().stages) {
    if (s.jpdbKanaCap === null) return s.stage;
    if (jpdbRank <= s.jpdbKanaCap) return s.stage;
  }
  return 10;
}

// ── Content type → category files + exclusion logic ─────────────────

const CONTENT_TYPE_CONFIG = {
  'creature-base': {
    categories: ['animals.json', 'objects.json', 'nature.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const creatures = loadJson('data/creatures.json');
      const staging = loadJson('data/new-creatures-staging.json');
      return new Set([...creatures, ...staging].map(c => c.baseWord));
    }
  },
  'creature-modifier': {
    categories: ['descriptors.json', 'emotions.json', 'colors.json'],
    wkPosFilter: pos => pos.some(p =>
      p.includes('adjective') || p.includes('no-adjective') || p.includes('na-adjective')
    ),
    getExcluded: () => {
      const creatures = loadJson('data/creatures.json');
      const staging = loadJson('data/new-creatures-staging.json');
      return new Set([...creatures, ...staging].filter(c => c.modifier).map(c => c.modifier.word));
    }
  },
  'move': {
    categories: ['actions.json', 'movement.json', 'combat.json'],
    wkPosFilter: pos => pos.some(p =>
      p.includes('verb') && !p.includes('verbal noun')
    ),
    getExcluded: () => {
      const moves = loadJson('data/moves.json');
      const staging = loadJson('data/new-moves-staging.json');
      return new Set([...moves, ...staging].map(m => m.name));
    }
  },
  'item-consumable': {
    categories: ['foods.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const items = loadJson('data/items.json');
      const staging = loadJson('data/new-items-staging.json');
      return new Set([...items, ...staging].map(i => i.word));
    }
  },
  'item-equipment': {
    categories: ['objects.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const items = loadJson('data/items.json');
      const staging = loadJson('data/new-items-staging.json');
      return new Set([...items, ...staging].map(i => i.word));
    }
  },
  'item-crafting': {
    categories: ['nature.json', 'objects.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const items = loadJson('data/items.json');
      const staging = loadJson('data/new-items-staging.json');
      return new Set([...items, ...staging].map(i => i.word));
    }
  },
  'area': {
    categories: ['locations.json', 'nature.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const areas = loadJson('data/new-areas-staging.json');
      return new Set(areas.map(a => a.name));
    }
  },
  'npc': {
    categories: ['occupations.json', 'social.json'],
    wkPosFilter: pos => pos.some(p => p.includes('noun')),
    getExcluded: () => {
      const npcs = loadJson('data/new-npcs-staging.json');
      const prod = loadJsonObj('data/npcs.json');
      const prodList = Object.values(prod);
      return new Set([...npcs, ...prodList].map(n => n.baseWord).filter(Boolean));
    }
  }
};

// ── Core discovery function ─────────────────────────────────────────

/**
 * Discover candidate words for a forge, filtered by stage and excluding existing content.
 * @param {Object} opts
 * @param {string} opts.contentType - One of: creature-base, creature-modifier, move,
 *   item-consumable, item-equipment, item-crafting, area, npc
 * @param {number} opts.targetStage - Game stage 1-10 to filter to
 * @param {number} [opts.limit=20] - Max results to return
 * @returns {Array<{word, reading, meaning, rank, stage, source}>}
 */
export function discoverWords({ contentType, targetStage, limit = 20 }) {
  const config = CONTENT_TYPE_CONFIG[contentType];
  if (!config) throw new Error(`Unknown content type: ${contentType}`);

  const excluded = config.getExcluded();

  // Build WK word lookup for POS filtering
  const wkByWord = new Map();
  for (const v of wkVocab()) {
    wkByWord.set(v.characters, v);
  }

  // Collect candidates from all category files
  const seen = new Set();
  const candidates = [];

  for (const catFile of config.categories) {
    for (const entry of categoryWords(catFile)) {
      if (seen.has(entry.word)) continue;
      seen.add(entry.word);

      // Exclude already-used words
      if (excluded.has(entry.word)) continue;

      // Compute stage
      const stage = getWordStage(entry.word, entry.rank);
      if (stage == null || stage > targetStage) continue;

      // WK POS filter (if word is in WK)
      const wkEntry = wkByWord.get(entry.word);
      if (wkEntry && config.wkPosFilter && !config.wkPosFilter(wkEntry.partsOfSpeech)) {
        continue;
      }

      candidates.push({
        word: entry.word,
        reading: entry.reading,
        meaning: entry.meaning,
        rank: entry.rank,
        stage,
        source: catFile.replace('.json', ''),
        wkLevel: wkEntry ? wkEntry.level : null
      });
    }
  }

  // Sort by rank (most common first), take limit
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.slice(0, limit);
}

// ── Stage gap analysis ──────────────────────────────────────────────

const CONTENT_TARGETS = {
  creature: { file: 'data/creatures.json', staging: 'data/new-creatures-staging.json', perStage: 50 },
  move: { file: 'data/moves.json', staging: 'data/new-moves-staging.json', perStage: 100 },
  item: { file: 'data/items.json', staging: 'data/new-items-staging.json', perStage: 25 },
  area: { file: 'data/new-areas-staging.json', staging: null, perStage: 5 },
  npc: { file: 'data/new-npcs-staging.json', staging: null, perStage: 14 }
};

/**
 * Get per-stage content counts to identify which stages need more content.
 * @param {string} type - creature, move, item, area, npc
 * @returns {Array<{stage, count, target, deficit}>}
 */
export function getStageGaps(type) {
  const cfg = CONTENT_TARGETS[type];
  if (!cfg) throw new Error(`Unknown content type for gaps: ${type}`);

  const main = loadJson(cfg.file);
  const staging = cfg.staging ? loadJson(cfg.staging) : [];
  const all = [...main, ...staging];

  return Array.from({ length: 10 }, (_, i) => {
    const stage = i + 1;
    const count = all.filter(obj => obj.stage === stage).length;
    return { stage, count, target: cfg.perStage, deficit: Math.max(0, cfg.perStage - count) };
  });
}

// ── CLI mode ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  if (args.includes('--gaps')) {
    const type = getArg('--gaps');
    const gaps = getStageGaps(type);
    console.log(`\nStage gaps for ${type}:`);
    console.log('Stage | Count | Target | Deficit');
    console.log('------|-------|--------|--------');
    for (const g of gaps) {
      console.log(`  ${g.stage}   |  ${String(g.count).padStart(3)}  |  ${String(g.target).padStart(4)}  |  ${String(g.deficit).padStart(4)}`);
    }
  } else {
    const contentType = getArg('--type');
    const targetStage = parseInt(getArg('--stage') || '5');
    const limit = parseInt(getArg('--limit') || '20');

    if (!contentType) {
      console.error('Usage: node scripts/forge-discovery.mjs --type <type> --stage <N> [--limit <N>]');
      console.error('       node scripts/forge-discovery.mjs --gaps <creature|move|item|area|npc>');
      console.error('Types: creature-base, creature-modifier, move, item-consumable, item-equipment, item-crafting, area, npc');
      process.exit(1);
    }

    const results = discoverWords({ contentType, targetStage, limit });
    console.log(`\n${results.length} candidates for ${contentType} at stage <= ${targetStage}:\n`);
    console.log('Rank  | Stage | Word     | Reading    | Meaning                        | Source');
    console.log('------|-------|----------|------------|--------------------------------|-------');
    for (const r of results) {
      const rank = String(r.rank).padStart(5);
      const wk = r.wkLevel ? ` (WK${r.wkLevel})` : '';
      console.log(`${rank} |   ${r.stage}   | ${r.word.padEnd(8)} | ${r.reading.padEnd(10)} | ${r.meaning.slice(0, 30).padEnd(30)} | ${r.source}${wk}`);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: All tests PASS

**Step 5: Verify CLI works**

Run: `node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 5`
Expected: Table of 5 animal/object/nature nouns at stage <= 3

Run: `node scripts/forge-discovery.mjs --gaps creature`
Expected: 10-row table showing creature count per stage

**Step 6: Commit**

```bash
git add scripts/forge-discovery.mjs tests/unit/scripts/forge-discovery.test.js
git commit -m "feat: add forge-discovery.mjs shared stage-aware word discovery"
```

---

## Task 2: Update Creature Forge — Replace `combat-vocab` with `learnset-builder`

The old combat-vocab subskill generates attack/ultimate verbs. The game now uses learnsets of 4-6 moves from `moves.json`. Delete the old subskill and create a new one.

**Files:**
- Delete: `.claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/combat-vocab.md`
- Create: `.claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/learnset-builder.md`

**Step 1: Delete obsolete combat-vocab.md**

```bash
rm .claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/combat-vocab.md
```

**Step 2: Create learnset-builder.md**

Write `.claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/learnset-builder.md`:

```markdown
# Learnset Builder (Subagent 2)

You are building a learnset (list of learnable moves) for a creature in Koto, a Japanese vocabulary learning RPG. Creatures learn moves as they level up, Pokemon-style.

## Input

Read the baton JSON file at the path provided to you. Key fields you need:

- `baseMeaning` — the creature's concept (e.g., "scissors", "turtle")
- `frequencyTier` — the creature's rarity tier
- `archetype` — Fighter, Mage, Trickster, or Tank/Healer
- `element` — fire, water, wood, earth, or metal
- `stage` — the creature's game stage (1-10)

## Your Task

Search `data/moves.json` and build a learnset of 4-6 moves for this creature. Each move in the learnset is a reference to an existing move by its `id`, paired with the level at which the creature learns it.

### Step 1: Read the Move Pool

Read `data/moves.json`. Each move has:
```json
{
  "id": "hashiru",
  "name": "走る",
  "element": "neutral|fire|water|wood|earth|metal",
  "category": "damage|heal|buff|debuff|shield|drain",
  "tier": 1|2|3,
  "stage": 1-10,
  "mpCost": 8-42,
  "power": 0-65,
  "statusEffect": null|"poison"|"sleep"|"stun"|"confuse"|"attack_buff"|"haste"|"shield"|"team_shield"|"taunt"
}
```

### Step 2: Filter Eligible Moves

A move is eligible if:
1. **Stage ≤ creature's stage** — the creature shouldn't learn words beyond its difficulty tier
2. **Not over-assigned** — check `data/creatures.json` to see how many creatures already have this move in their learnset. Avoid moves used by 4+ creatures unless there's no alternative.

### Step 3: Select Moves by Archetype

Pick moves that match the creature's archetype role:

| Archetype | Target Mix (4-6 moves) |
|-----------|----------------------|
| **Fighter** | 3-4 damage, 1 buff or shield, 0-1 other |
| **Mage** | 2 damage, 1-2 buff/debuff, 1 heal or shield |
| **Trickster** | 2 damage, 2-3 debuff (status effects), 0-1 buff |
| **Tank/Healer** | 1-2 damage, 2-3 heal/shield, 0-1 buff (taunt preferred) |

### Step 4: Ensure STAB Coverage

At least 1 move MUST match the creature's element (for Same-Type Attack Bonus — 1.5x damage). Prioritize same-element damage moves.

### Step 5: Tier Spread

Distribute moves across tiers for level progression:
- **Levels 1, 5:** Tier 1 moves (basic, low cost)
- **Levels 9, 12:** Tier 2 moves (stronger, moderate cost)
- **Levels 16, 20:** Tier 3 moves (powerful, high cost) — only if creature has 5-6 moves

If fewer than 6 eligible moves exist at the creature's stage, reduce the learnset to 4-5.

### Step 6: Thematic Coherence

Choose moves that feel natural for the creature's concept:
- A turtle creature (water/Tank) → bite, drink, sleep, harden, shield moves
- A scissors creature (metal/Fighter) → cut, slash, sharpen, clamp moves
- A book creature (wood/Mage) → read, write, confuse, illuminate moves

Don't force thematic matches if the move doesn't mechanically fit — archetype fit > theme.

## Output

Read the baton JSON, add your output fields, write it back. Append:

```json
{
  "learnset": [
    {
      "moveId": "kamu",
      "moveName": "噛む",
      "moveNameEn": "Bite",
      "element": "neutral",
      "category": "damage",
      "tier": 1,
      "level": 1,
      "reason": "Basic physical attack, thematic for a turtle — tier 1 damage at level 1"
    },
    {
      "moveId": "nomu",
      "moveName": "飲む",
      "moveNameEn": "Drink",
      "element": "water",
      "category": "heal",
      "tier": 1,
      "level": 5,
      "reason": "STAB water move, healing fits Tank/Healer archetype — tier 1 at level 5"
    }
  ],
  "learnsetSummary": {
    "totalMoves": 6,
    "stabMoves": 2,
    "damageCount": 2,
    "healCount": 2,
    "buffCount": 1,
    "shieldCount": 1,
    "tierSpread": "T1: 3, T2: 2, T3: 1"
  }
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
```

**Step 3: Commit**

```bash
git add -A .claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/
git commit -m "feat(forge): replace combat-vocab with learnset-builder subskill"
```

---

## Task 3: Update Creature Forge SKILL.md

Update the main orchestrator to use stage-aware discovery, learnset-builder, and output the new schema.

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/creature-forge/SKILL.md`

**Step 1: Update the description and title**

Change line 2-3:
- Old: `description: Design a new game creature from an English word. Generates name, Japanese vocab, combat skills...`
- New: `description: Design a new game creature from an English word. Generates name, Japanese vocab, learnset, archetype, element, modifier, visual description, and concept art preview with JPDB frequency data. Triggers on "creature forge", "new creature", "design creature", "creature from word".`

Change line 8:
- Old: `Turn any English word into a collectible creature for NEO TOKYO: System Liberation, a Japanese vocabulary learning RPG.`
- New: `Turn any English word into a collectible creature for Koto, a Japanese vocabulary learning RPG.`

**Step 2: Update Discovery Mode (lines 31-42)**

Replace the existing Discovery Mode section with:

```markdown
## Discovery Mode (no arguments)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps creature` to see which stages need creatures most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or let user specify.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type creature-base --stage N --limit 10` to get stage-filtered noun candidates from `animals.json`, `objects.json`, and `nature.json`.
4. Read `data/creatures.json` and `data/new-creatures-staging.json`. The discovery script already excludes existing baseWords.
5. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | WK Level | Stage | Source |
|---|------|---------|---------|-----------|----------|-------|--------|

6. User picks or provides their own word. Proceed to Phase 0.
```

**Step 3: Add stage to Phase 0 baton (lines 96-127)**

After tier determination, add stage computation. Add to the Phase 0 section:

```markdown
7. **Compute stage** using `language/stage-utils.js`:
   - WK words: `stage = Math.ceil(wkLevel / 6)`
   - Non-WK: lowest stage where `jpdbKanaCap >= baseRank`
   - Or run: `node -e "import {getWordStrictStage} from './language/stage-utils.js'; console.log(getWordStrictStage('${BASE_WORD}', ${BASE_RANK}))"`
```

Add `stage` and `baseMp` to the baton JSON template:

```json
{
  "stage": 6,
  "baseMp": 80,
  ...existing fields...
}
```

Remove `rosterVerbs` from the baton (no longer needed — learnsets reference moves.json, not per-creature verbs).

**Step 4: Update Phase 1 subagent relay (lines 140-184)**

Replace "Subagent 2: Combat Vocab" with:

```markdown
### Subagent 2: Learnset Builder

```
Task tool (general-purpose, model: sonnet):
  description: "Build learnset for [baseMeaning]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/learnset-builder.md
    Then read the baton at /tmp/creature-forge-{id}-baton.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `learnset` and `learnsetSummary` were added.
```

**Step 5: Update Phase 2 user picks (lines 186-245)**

Remove the "Attack (pick A/B/C)" and "Ultimate (pick A/B/C)" tables. Replace with:

```markdown
### Learnset (review)
| Lv | Move | Japanese | Element | Category | Tier | Reason |
|----|------|----------|---------|----------|------|--------|

Summary: [N] total, [M] STAB, tier spread: T1: X, T2: Y, T3: Z
```

Remove `attack` and `ultimate` from the locked identity JSON. Add:

```json
{
  "stage": 6,
  "baseMp": 80,
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "nomu", "level": 5 }
  ],
  ...existing fields minus attack/ultimate...
}
```

**Step 6: Update Phase 5 output schema (lines 324-365)**

Replace the save object template. Remove `autoSkill` and `ultimate` fields. Add `baseMp`, `stage`, `learnset`:

```json
{
  "id": "<lowercase-romaji>",
  "name": "<katakana-name>",
  "nameEn": "<Romaji-Name>",
  "baseWord": "<kanji-or-kana>",
  "baseReading": "<hiragana>",
  "baseMeaning": "<english>",
  "baseRank": 1234,
  "rarity": "<common|uncommon|rare|epic|legendary>",
  "baseHp": 100,
  "baseAttack": 10,
  "baseMp": 60,
  "modifier": {
    "word": "<japanese>",
    "reading": "<hiragana>",
    "meaning": "<English-capitalized>",
    "rank": 1234
  },
  "element": "<lowercase>",
  "archetype": "<capitalized>",
  "description": "<chosen rich description>",
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "nomu", "level": 5 }
  ],
  "stage": 6,
  "createdAt": "YYYY-MM-DD"
}
```

Add baseMp lookup table:

```markdown
**baseMp by archetype:**
| Archetype | baseHp | baseAttack | baseMp |
|-----------|--------|------------|--------|
| Fighter | 100 | 10 | 60 |
| Mage | 75 | 8 | 120 |
| Trickster | 85 | 9 | 90 |
| Tank/Healer | 160 | 8 | 80 |
```

**Step 7: Update checklist (lines 380-396)**

Remove:
- `Attack/ultimate within tier skill ceiling`
- `Attack/ultimate verbs work as natural combat actions in Japanese`
- `Base word, attack, and ultimate are three different words`

Add:
- `Learnset contains 4-6 moves from moves.json`
- `At least 1 STAB move (same element as creature)`
- `Learnset tier spread: mix of T1, T2, and T3 moves`
- `All learnset moves have stage <= creature's stage`
- `baseMp matches archetype (Fighter=60, Mage=120, Trickster=90, Tank/Healer=80)`
- `stage field computed from baseWord + baseRank`

**Step 8: Update re-roll handling**

Change `"redo attacks" → re-dispatch Subagent 2` to `"redo learnset" → re-dispatch Subagent 2`

**Step 9: Global search-replace**

- Replace all instances of "NEO TOKYO: System Liberation" with "Koto" throughout the file
- Remove any references to `attack`, `ultimate`, `autoSkill`, `rosterVerbs` that weren't caught above

**Step 10: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/creature-forge/SKILL.md
git commit -m "feat(forge): update creature-forge for learnsets, stages, and discovery"
```

---

## Task 4: Update Creature Forge — identity-modifier.md (Stage-Aware)

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/identity-modifier.md`

**Step 1: Add stage-aware modifier discovery**

After the existing rules section, add:

```markdown
### Stage-Aware Modifier Selection

Use the forge-discovery script to find stage-appropriate modifiers:

```bash
node scripts/forge-discovery.mjs --type creature-modifier --stage ${CREATURE_STAGE} --limit 20
```

This returns adjectives from `descriptors.json`, `emotions.json`, and `colors.json` filtered to the creature's stage. Use these as a starting pool — you may still use JPDB to look up additional words, but prefer words from this list as they are pre-verified.
```

**Step 2: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/creature-forge/subskills/identity-modifier.md
git commit -m "feat(forge): add stage-aware modifier discovery to identity-modifier"
```

---

## Task 5: Create Move Forge — NEW Skill

**Files:**
- Create: `.claude/plugins/koto-forge/1.0.0/skills/move-forge/SKILL.md`

**Step 1: Create the skill file**

Write `.claude/plugins/koto-forge/1.0.0/skills/move-forge/SKILL.md`:

```markdown
---
name: move-forge
description: Design new combat moves from Japanese verbs. Each move teaches a verb and has element, category, power, status effects. Triggers on "move forge", "new moves", "forge moves", "move from verb".
user_invocable: true
---

# Move Forge

Turn Japanese verbs into combat moves for Koto, a Japanese vocabulary learning RPG. Each move is named after a Japanese verb and teaches that word to the player.

## Quick Reference: The Flow

```
Phase 0: Input & Discovery    → find verbs, JPDB lookup
Phase 1: Move Design           → element, category, target, power, status, tier
Phase 2: Balance Check         → compare against existing moves.json distribution
Phase 3: User Review           → present table for approval
Phase 4: Save                  → append to staging JSON
```

## Input Mode Detection

Parse skill arguments:

- **Direct mode:** `/move-forge 走る` — verb provided. JPDB lookup, proceed to Phase 1.
- **Discovery mode:** `/move-forge` or `/move-forge --stage 3` — discover verbs for a target stage.
- **Batch mode:** `/move-forge --stage 3 --count 10` — design multiple moves for a stage.

---

## Discovery Mode

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps move` to see which stages need moves most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or use the `--stage` flag.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type move --stage N --limit 20` to get stage-filtered verb candidates from `actions.json`, `movement.json`, and `combat.json`.
4. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | WK Level | Stage | Source |
|---|------|---------|---------|-----------|----------|-------|--------|

5. User picks verbs or provides their own. Proceed to Phase 1 for each.

---

## Phase 0: Input & JPDB Lookup

1. **JPDB lookup** for the verb using `scripts/lib/jpdb-helpers.mjs`. Write a temp script to `/tmp/` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['走る']; // use kanji form
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
```

2. Present results:

| Word | Reading | Rank | Raw Meanings | All Forms |
|------|---------|------|-------------|-----------|

**Always show raw JPDB `meanings` array.** Never paraphrase.

3. Verify the verb is not already in `data/moves.json`. If it is, warn and suggest alternatives.

---

## Phase 1: Move Design

For each verb, determine the move's combat properties:

### Element Assignment

Based on verb meaning and imagery:
| Verb Feel | Element | Examples |
|-----------|---------|----------|
| Physical force, weight, earth | earth | 打つ (hit), 押す (push), 踏む (step on) |
| Speed, cutting, precision, metal | metal | 切る (cut), 刺す (stab), 磨く (polish) |
| Growth, nature, life, wood | wood | 育てる (raise), 巻く (wrap), 絡む (entangle) |
| Heat, energy, explosion, fire | fire | 焼く (burn), 爆ぜる (burst), 照らす (shine) |
| Flow, cold, cleansing, water | water | 流す (pour), 凍る (freeze), 洗う (wash) |
| Generic, universal actions | neutral | 走る (run), 食べる (eat), 見る (look) |

### Category Assignment

Based on verb semantics:
| Verb Type | Category | Target |
|-----------|----------|--------|
| Physical action (切る, 打つ, 投げる) | damage | single_enemy or all_enemies |
| Protective (守る, 隠れる, 防ぐ) | shield | self, single_ally, or all_allies |
| Mental/status (惑わす, 眠る, 混乱) | debuff | single_enemy or all_enemies |
| Enhancement (走る, 強める, 急ぐ) | buff | self or single_ally |
| Caring/restoring (治す, 助ける, 癒す) | heal | single_ally or all_allies |
| Consuming (吸う, 奪う) | drain | single_enemy |

### Power, MP Cost, and Tier

Assign based on verb "intensity" and JPDB rank:

| Tier | Power | MP Cost | Rank Range | Description |
|------|-------|---------|------------|-------------|
| 1 | 15-30 | 8-18 | Any | Basic moves, common verbs |
| 2 | 28-50 | 18-26 | Any | Stronger, more specific verbs |
| 3 | 50-65 | 30-42 | Any | Powerful, dramatic verbs |

**Non-damage moves:** Power is 0 for buffs/debuffs. Heals use power as heal %. Shields use power as damage reduction %.

### Status Effects

If the verb implies a status, assign it:
| Status | Duration | Chance | Example Verbs |
|--------|----------|--------|---------------|
| poison | 3 turns | 50-80% | 毒を盛る, 汚す |
| sleep | 2 turns | 40-60% | 眠る, 歌う (lullaby) |
| stun | 1 turn | 30-50% | 驚かす, 叩く (hard hit) |
| confuse | 2 turns | 40-60% | 惑わす, 混ぜる |
| attack_buff | 2-3 turns | 80-100% | 鍛える, 強める |
| haste | 1 turn (consumed) | 100% | 走る, 急ぐ |
| shield | 2 turns | 100% | 守る, 隠れる |
| team_shield | 2 turns | 100% | 庇う, 囲む |
| taunt | 2 turns | 100% | 挑む, 吠える |

### Stage Assignment

Compute via `language/stage-utils.js`:
- WK words: `stage = Math.ceil(wkLevel / 6)`
- Non-WK: lowest stage where `jpdbKanaCap >= rank`

### nameEn (English Display Name)

A short, evocative English name (1-2 words) based on the verb meaning. Must be dictionary-accurate — no embellishment.
- 走る → "Dash", 切る → "Slash", 守る → "Guard", 治す → "Heal"

### description

One sentence describing the move's combat effect in plain English. Matches what the player sees.

---

## Phase 2: Balance Check

After designing the move(s), check against existing `data/moves.json`:

1. **Element distribution:** Count moves per element. Flag if adding this move makes any element > 25% of total.
2. **Category distribution:** Target ~40% damage, ~15% buff, ~15% debuff, ~12% shield, ~10% heal, ~8% drain. Flag large imbalances.
3. **Stage distribution:** Ensure the target stage has moves across all categories (no stage with zero heals).
4. **Duplicate check:** No two moves with the same `id` or same `name`.

Present a brief balance summary.

---

## Phase 3: User Review

Present the designed move(s):

| Field | Value |
|-------|-------|
| id | hashiru |
| name | 走る |
| nameEn | Dash |
| reading | はしる |
| meaning | to run / to rush, to dash |
| rank | 400 |
| element | neutral |
| category | buff |
| target | self |
| power | 0 |
| mpCost | 10 |
| statusEffect | haste |
| statusChance | 100 |
| statusDuration | 1 |
| tier | 1 |
| description | Rushes forward at full speed, gaining an extra action. |
| stage | 1 |

For batch mode, show a summary table:

| # | Move | Element | Category | Tier | Power | MP | Status | Stage |
|---|------|---------|----------|------|-------|----|--------|-------|

Ask: "Approve? Or tell me what to change."

---

## Phase 4: Save

1. Read `data/new-moves-staging.json` (or initialize `[]`).
2. Build move object(s) matching `data/moves.json` schema:

```json
{
  "id": "hashiru",
  "name": "走る",
  "nameEn": "Dash",
  "reading": "はしる",
  "meaning": "to run / to rush, to dash",
  "rank": 400,
  "element": "neutral",
  "category": "buff",
  "target": "self",
  "power": 0,
  "mpCost": 10,
  "statusEffect": "haste",
  "statusChance": 100,
  "statusDuration": 1,
  "tier": 1,
  "description": "Rushes forward at full speed, gaining an extra action.",
  "stage": 1
}
```

3. Append. Write back.
4. Confirm: **"Saved [N] move(s) to staging! [M] total moves now in data/new-moves-staging.json."**

---

## Translation Accuracy (NON-NEGOTIABLE)

- **Show raw JPDB meanings arrays.** Never summarize.
- **Use primary dictionary definitions** for the `meaning` field.
- **Transitivity matters.** 狂う = "go mad" (intransitive), NOT "drive mad."
- **No embellishment.** "run" stays "run", not "blazing sprint."
- **nameEn must be dictionary-accurate.** Short and evocative, but truthful.

---

## Checklist Before Saving

- [ ] All JPDB ranks from API calls (not guessed)
- [ ] Raw meanings arrays shown to user and verified
- [ ] English translations dictionary-accurate
- [ ] Element assignment makes sense for the verb
- [ ] Category assignment matches verb semantics
- [ ] Power/mpCost within tier ranges
- [ ] Status effect appropriate for the verb (or null)
- [ ] Stage computed from word rank/WK level
- [ ] No duplicate id or name with existing moves
- [ ] Balance check passed (element/category/stage distribution)
- [ ] `description` is one plain English sentence
- [ ] `nameEn` is 1-2 words, dictionary-accurate
```

**Step 2: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/move-forge/
git commit -m "feat(forge): add move-forge skill for creating combat moves from verbs"
```

---

## Task 6: Update Item Forge — Unified Types

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/item-forge/SKILL.md`

**Step 1: Update description and title**

- Change description to: `description: Generate game items (consumables, equipment, crafting resources) with JPDB frequency data. Triggers on "item forge", "new items", "forge items".`
- Change title text to reference "Koto" not "NEO TOKYO: System Liberation"

**Step 2: Add input modes and type selection**

Add before the Workflow section:

```markdown
## Input Modes

- `/item-forge` — default: 10 consumable food items (current behavior)
- `/item-forge --type equipment` — generate equipment items
- `/item-forge --type crafting` — generate crafting resources
- `/item-forge --stage 3` — target specific stage
- `/item-forge --type equipment --stage 5 --count 5` — full control

## Discovery Mode (all types)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps item` to see which stages need items most.
2. **Discover candidates by type:**
   - Consumables: `node scripts/forge-discovery.mjs --type item-consumable --stage N --limit 20`
   - Equipment: `node scripts/forge-discovery.mjs --type item-equipment --stage N --limit 20`
   - Crafting: `node scripts/forge-discovery.mjs --type item-crafting --stage N --limit 20`
3. Cross-ref existing items in `data/items.json` and `data/new-items-staging.json`.
```

**Step 3: Add equipment and crafting sections**

After the existing consumable phases, add new sections:

```markdown
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

- Weapons: look for tool/weapon nouns in `objects.json` (剣 sword, 弓 bow, 杖 staff, 槍 spear)
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
```

**Step 4: Update output schema**

Add `itemType` to the save object, default `"consumable"` for backwards compatibility. Add `stage` field. Ensure `components` array and `compoundRank` are included.

**Step 5: Add new item types to effect table**

Add to the rarity-effect table:

```markdown
| Type | Effect Options |
|------|---------------|
| xpCharm | `{ xpMultiplier: 0.25 }` — +25% XP multiplier (stacks) |
| xpBalance | `{ xpBalance: true }` — redistribute XP toward lower-level creatures |
```

**Step 6: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/item-forge/SKILL.md
git commit -m "feat(forge): unify item-forge for consumables, equipment, and crafting"
```

---

## Task 7: Update Area Forge — Sub-Areas and Stages

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/area-forge/SKILL.md`

**Step 1: Update title and game name references**

Replace "NEO TOKYO: System Liberation" with "Koto" throughout.

**Step 2: Replace Discovery Mode with stage-aware discovery**

Replace the existing Discovery Mode section with:

```markdown
## Discovery Mode (no arguments)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps area` to see which stages need areas most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or let user specify with `--stage N`.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type area --stage N --limit 10` to get stage-filtered location nouns from `locations.json` and `nature.json`.
4. Also read `data/creatures.json` — group creatures by stage to see which stages have creatures but no areas.
5. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | Stage | Creatures at this stage |
|---|------|---------|---------|-----------|-------|------------------------|

6. User picks or provides their own word. Proceed to Phase 0.
```

**Step 3: Add stage to Phase 0 output**

Add after JPDB lookup:

```markdown
4. **Compute stage** for the area word:
   - Use `language/stage-utils.js`: `getWordStrictStage(word, rank)`
   - Or accept explicit `--stage N` from user input
```

**Step 4: Update creature matching (Phase 1)**

Add stage constraint:

```markdown
**Stage matching** — the area's creature pool should contain creatures at or near the area's stage. Prefer creatures where `creature.stage` is within ±1 of the area's stage. Creatures outside this range can be included for thematic fit but should not be the majority.
```

**Step 5: Add new Phase 2.5 — Sub-Area Generation**

Insert between the current Phase 2 (Visual Description) and Phase 3 (Save):

```markdown
## Phase 2.5: Sub-Area Generation

Generate 6 named sub-areas for the area. Each sub-area is a Japanese location name using modifier + noun pattern.

### Sub-Area Structure

Each sub-area has:
- `id` — lowercase romaji
- `name` — Japanese name (modifier + の + location noun or modifier + location noun)
- `nameEn` — English name
- `reading` — hiragana reading
- `backgroundDescription` — 100-200 word visual description for background image generation

### Generation Steps

1. **Discover modifier candidates.** Run `node scripts/forge-discovery.mjs --type creature-modifier --stage N --limit 20` to get adjectives at the area's stage.
2. **Pair modifiers with the area's location word** (or related location nouns from `locations.json`).
3. Examples:
   - Area: 森 (forest) → 静かな森 (quiet forest), 深い森 (deep forest), 光の森 (forest of light)
   - Area: 水族館 (aquarium) → 暗い水族館 (dark aquarium), 古い水族館 (old aquarium)
4. Each sub-area's background description should vary in lighting, mood, and specific features.

### Present Sub-Areas

| # | Name | Reading | English | Background Summary |
|---|------|---------|---------|--------------------|
| 1 | 静かな泉 | しずかないずみ | Quiet Spring | A glassy pool fed by... |

User can adjust names, swap modifiers, or request regeneration.
```

**Step 6: Update Phase 3 (Save) output schema**

Add `stage` and `subAreas` to the save object:

```json
{
  "id": "<lowercase-romaji>",
  "name": "<japanese-location-word>",
  "nameEn": "<English-translation>",
  "reading": "<hiragana-reading>",
  "rank": 13500,
  "meanings": [["aquarium"]],
  "stage": 7,
  "theme": "<one-sentence thematic summary>",
  "creatures": ["creature-id-1", "creature-id-2"],
  "description": "<200-400 word visual/atmosphere description>",
  "subAreas": [
    {
      "id": "shizukana-izumi",
      "name": "静かな泉",
      "nameEn": "Quiet Spring",
      "reading": "しずかないずみ",
      "backgroundDescription": "A glassy pool fed by..."
    }
  ],
  "tags": ["water", "aquatic"],
  "createdAt": "YYYY-MM-DD"
}
```

**Step 7: Update checklist**

Add:
- `stage field computed from area word`
- `6 sub-areas generated with modifier + noun names`
- `Creature pool stage-aligned (creatures within ±1 stage of area)`
- `Sub-area background descriptions are visual only (no game mechanics)`

**Step 8: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/area-forge/SKILL.md
git commit -m "feat(forge): add sub-areas, stages, and discovery to area-forge"
```

---

## Task 8: Update NPC Forge — Stages and Bond System

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/npc-forge/SKILL.md`
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/npc-forge/subskills/concept-naming.md`
- Modify: `.claude/plugins/koto-forge/1.0.0/skills/npc-forge/subskills/character-cards.md`

**Step 1: Update SKILL.md — game name and discovery**

Replace "NEO TOKYO: System Liberation" with "Koto" throughout.

Add stage-aware discovery to Phase 0:

```markdown
### Stage-Aware NPC Discovery

After area selection, discover occupation words for the area's stage:

```bash
node scripts/forge-discovery.mjs --type npc --stage ${AREA_STAGE} --limit 20
```

This returns person-nouns (occupations, social roles) from `occupations.json` and `social.json` filtered to the area's stage.

Pass these candidates to the concept-naming subagent via the baton as `discoveredOccupations`.
```

**Step 2: Update SKILL.md — replace tier with stage**

In Phase 3, section 3.2, replace the tier assignment rules:

Old:
```
**Tier assignment rules:**
- Tier 1: Early-game areas (residential, nature, parks, academic)
- Tier 2: Commercial/entertainment areas (shops, aquariums, theaters)
- Tier 3: Urban center areas (transit hubs, downtown, office districts)
- Tier 4: Corporate/government core areas (headquarters, labs, restricted zones)
```

New:
```markdown
**Stage assignment:** NPCs inherit their stage from their area. Set `stage` to the area's stage number (1-10). This replaces the old tier system.
```

Replace `"tier": 1` with `"stage": 7` in the game data object template.

**Step 3: Update SKILL.md — character card goals**

Replace the possessed/glitching/liberated goals with bond-based goals:

In the character card template (section 3.3), replace:
```json
"goals": {
  "possessed": "...",
  "glitching": "...",
  "liberated": "..."
}
```

With:
```json
"goals": {
  "default": "Initial goal when first meeting the player",
  "highBond": "Goal that emerges as bond deepens (bond >= 5)"
},
"bondHints": {
  "3": "What the NPC shares at bond level 3",
  "5": "What the NPC offers at bond level 5",
  "10": "Special interaction at bond level 10"
}
```

**Step 4: Update checklist**

Replace:
- `Character card goals cover all 3 states (possessed / glitching / liberated)` → `Character card has default + highBond goals and bondHints for levels 3, 5, 10`
- `Tier is consistent and appropriate for the area` → `Stage inherited from area`

**Step 5: Update concept-naming.md**

Add to the subskill instructions:

```markdown
### Stage-Aware Word Selection

If the baton contains `discoveredOccupations` (from forge-discovery.mjs), use these as your primary candidate pool. They are already:
- Filtered to the area's stage
- Verified to exist in JPDB
- Sorted by frequency rank

You may supplement with your own ideas, but prefer the discovered candidates as they are stage-appropriate.
```

**Step 6: Update character-cards.md**

Replace all references to possessed/glitching/liberated goals with the bond-based system:

```markdown
### Goals (Bond-Based)

NPCs have two goal modes:
- **default** — the NPC's initial goal when the player first meets them. This is their everyday concern or worry.
- **highBond** — a deeper goal that emerges as the bond grows (bond >= 5). This reveals more of their personality and may unlock special interactions.

### Bond Hints

For each NPC, define what happens at bond milestones:
- **Bond 3:** NPC shares a personal story or gives a small gift
- **Bond 5:** NPC offers something meaningful (rare item, special knowledge, quest)
- **Bond 10:** NPC has a unique interaction (teaches a rare word, reveals hidden lore)

### Example Dialogue

3 example lines in Japanese — must be i+1 appropriate for the NPC's stage. For early-stage NPCs (stage 1-3), use simple vocabulary. For late-stage NPCs (stage 7-10), more complex vocabulary is acceptable.
```

**Step 7: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/skills/npc-forge/
git commit -m "feat(forge): update npc-forge with stages, discovery, and bond system"
```

---

## Task 9: Update Plugin Manifest

**Files:**
- Modify: `.claude/plugins/koto-forge/1.0.0/.claude-plugin/plugin.json`

**Step 1: Update manifest**

The plugin.json auto-discovers skills from the skills/ directory, so adding move-forge/ should be picked up automatically. But verify the manifest description reflects the new capabilities:

```json
{
  "name": "koto-forge",
  "description": "Koto game content forges: creature, move, item, area, NPC design pipelines with JPDB integration and stage-aware vocabulary discovery",
  "version": "1.1.0",
  "author": { "name": "Koto", "email": "noreply@koto.dev" },
  "keywords": ["koto", "creature", "move", "item", "area", "npc", "jpdb", "forge", "stage"]
}
```

**Step 2: Update CLAUDE.md forge skills table**

In the root `CLAUDE.md`, update the "Available skills" table to add move-forge:

```markdown
| `move-forge` | `/move-forge [verb]` | Design combat moves from Japanese verbs |
```

**Step 3: Commit**

```bash
git add .claude/plugins/koto-forge/1.0.0/.claude-plugin/plugin.json CLAUDE.md
git commit -m "feat(forge): update plugin manifest and CLAUDE.md for move-forge"
```

---

## Task 10: Run Tests and Final Verification

**Step 1: Run the forge-discovery tests**

```bash
node --test tests/unit/scripts/forge-discovery.test.js
```

Expected: All tests PASS.

**Step 2: Verify CLI works for all content types**

```bash
node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 5
node scripts/forge-discovery.mjs --type move --stage 1 --limit 5
node scripts/forge-discovery.mjs --type item-consumable --stage 5 --limit 5
node scripts/forge-discovery.mjs --type area --stage 5 --limit 5
node scripts/forge-discovery.mjs --type npc --stage 5 --limit 5
node scripts/forge-discovery.mjs --gaps creature
node scripts/forge-discovery.mjs --gaps move
```

Expected: Each command outputs a formatted table of candidates.

**Step 3: Syntax-check all skill files**

Verify no broken markdown links or references. Each skill file should:
- Reference `scripts/forge-discovery.mjs` for discovery mode
- Use "Koto" not "NEO TOKYO: System Liberation"
- Have a `stage` field in its output schema
- Have an updated checklist

**Step 4: Run full test suite**

```bash
npm test
```

Expected: All existing tests PASS (forge changes are skill files, not runtime code — no test regressions expected).

**Step 5: Final commit**

If any fixups were needed:

```bash
git add -A
git commit -m "fix: address test failures from forge skills overhaul"
```
