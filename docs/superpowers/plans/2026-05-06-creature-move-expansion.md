# Creature and Move Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved creature roster and approved move set, migrate creature vocabulary identity to name-centric fields, and manually author capped learnsets with no orphan approved moves.

**Architecture:** Treat this as a data/schema migration with validation-first guardrails and a human-authored design pass. Creature templates keep stat fields such as `baseHp` and `baseDex`, but vocabulary identity moves to `name`, `nameEn`, `reading`, `meaning`, and `rank`. Import scripts may make the bulk row import reproducible, and validation scripts may report illegal or orphaned authored results, but no script may choose which creature learns which move.

**Tech Stack:** Node.js ES modules, built-in `node:test`, JSON data files, existing Express routes and browser ES modules.

---

## File Structure

- Create: `tests/unit/creature/creature-move-expansion-data.test.js`
  - Owns data-contract checks for imported 2026-05-06 creatures and moves.
- Modify: `tests/unit/creature/creatures.test.js`
  - Migrates runtime creature identity assertions from legacy `base*` vocabulary fields to name-centric fields.
- Modify: `tests/unit/creature/starter-distribution.test.js`
  - Adds learnset cap and level-1 move legality checks.
- Modify: `tests/unit/game/whack-a-mole.test.js`
  - Adds a regression that creature pool entries use `name` / `reading` / `meaning`.
- Modify: `tests/unit/combat/creature-combat-service.test.js`
  - Migrates attack-record vocabulary assertions from `attackerBase*` / `targetBase*` to `attackerWord` / `targetWord` style fields.
- Modify: `tests/unit/sentence-renderer.test.js`
  - Updates `entityToToken` tests to use name-centric entities.
- Modify: `src/game/creatures.js`
  - Emits `reading`, `meaning`, and `rank` on runtime creatures and stops emitting creature vocabulary `base*` fields.
- Modify: `src/game/services/creature-combat-service.js`
  - Renames creature vocabulary attack-record fields to name-centric fields, while preserving NPC skill behavior.
- Modify: `src/game/services/combat-cycle-service.js`
  - Passes name-centric NPC combat vocabulary fields into shared combat helpers.
- Modify: `src/routes/game/run.js`
  - Builds whack-a-mole creature rows from `name`, `reading`, and `meaning`.
- Modify: `public/js/ui/bootstrap-client.js`
  - Makes `entityToToken()` prefer `word`, then `name`, with legacy fallbacks only for older payloads.
- Modify: `public/js/ui/attack-card.js`
  - Reads name-centric attack-record fields and keeps old fallbacks for old saved playback payloads.
- Modify: `public/js/ui/befriend.js`
  - Uses `reading` / `creatureReading` instead of `baseReading` / `creatureBaseReading`.
- Modify: `public/js/ui/combat-dom.js`
  - Uses `reading` for creature ruby labels.
- Modify: `public/js/ui/post-combat-shop.js`
  - Uses name-centric creature fields in target selection.
- Modify: `public/js/dev/battlefield-preview.js`
  - Updates preview fixtures to `reading`.
- Create: `scripts/import-approved-move-expansion.mjs`
  - Converts the approved move CSV into `data/moves.json` entries.
- Create: `scripts/import-approved-creature-expansion.mjs`
  - Joins the approved stats CSV with roster metadata and appends new creature templates.
- Create: `scripts/report-learnset-coverage.mjs`
  - Prints unused imported moves and illegal new-creature learnset entries after manual curation.
- Create: `docs/superpowers/specs/2026-05-06-creature-move-expansion-learnset-ledger.md`
  - Human-authored design ledger explaining every new creature's moveset choices.
- Modify: `data/moves.json`
  - Adds approved move entries with `createdAt: "2026-05-06"`.
- Modify: `data/creatures.json`
  - Adds approved creatures with name-centric fields, stats, and manually authored learnsets.
- Do not modify: `data/areas.json`
  - New creatures stay out of encounter areas in this task.

---

### Task 1: Add Failing Data-Contract Tests

**Files:**
- Create: `tests/unit/creature/creature-move-expansion-data.test.js`
- Modify: `tests/unit/creature/starter-distribution.test.js`
- Modify: `tests/unit/creature/creatures.test.js`
- Test: `tests/unit/creature/creature-move-expansion-data.test.js`
- Test: `tests/unit/creature/starter-distribution.test.js`
- Test: `tests/unit/creature/creatures.test.js`

- [ ] **Step 1: Create expansion data-contract tests**

Create `tests/unit/creature/creature-move-expansion-data.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));

const EXPANSION_DATE = '2026-05-06';
const EXPECTED_NEW_CREATURE_COUNT = 44;

const movesById = new Map(moves.map(move => [move.id, move]));
const newCreatures = creatures.filter(creature => creature.createdAt === EXPANSION_DATE);
const newMoves = moves.filter(move => move.createdAt === EXPANSION_DATE);

function allLearnedMoveIds() {
  const ids = new Set();
  for (const creature of creatures) {
    for (const entry of creature.learnset || []) {
      ids.add(entry.moveId);
    }
  }
  return ids;
}

function isCleanseMove(move) {
  return move?.statusEffect === 'cleanse';
}

describe('creature and move expansion data', () => {
  it('adds the approved 2026-05-06 creature roster', () => {
    assert.equal(newCreatures.length, EXPECTED_NEW_CREATURE_COUNT);
  });

  it('new creatures use name-centric vocabulary identity fields', () => {
    const invalid = newCreatures
      .filter(creature =>
        typeof creature.name !== 'string' ||
        typeof creature.nameEn !== 'string' ||
        typeof creature.reading !== 'string' ||
        typeof creature.meaning !== 'string' ||
        typeof creature.rank !== 'number' ||
        'baseWord' in creature ||
        'baseReading' in creature ||
        'baseMeaning' in creature ||
        'baseRank' in creature
      )
      .map(creature => creature.id);

    assert.deepEqual(invalid, []);
  });

  it('new creatures are not placed in any area yet', () => {
    const newIds = new Set(newCreatures.map(creature => creature.id));
    const placed = [];

    for (const area of areas) {
      for (const creatureId of area.creatures || []) {
        if (newIds.has(creatureId)) {
          placed.push(`${area.id}:${creatureId}`);
        }
      }
      if (area.bossCreatureId && newIds.has(area.bossCreatureId)) {
        placed.push(`${area.id}:boss:${area.bossCreatureId}`);
      }
    }

    assert.deepEqual(placed, []);
  });

  it('every imported move is used by at least one creature learnset', () => {
    const learned = allLearnedMoveIds();
    const orphaned = newMoves
      .filter(move => !learned.has(move.id))
      .map(move => move.id)
      .sort();

    assert.deepEqual(orphaned, []);
  });

  it('new creature learnsets are capped at 6 entries', () => {
    const overCap = newCreatures
      .filter(creature => (creature.learnset || []).length > 6)
      .map(creature => `${creature.id}:${creature.learnset.length}`);

    assert.deepEqual(overCap, []);
  });

  it('new creatures have exactly one legal level-1 move', () => {
    const illegal = [];

    for (const creature of newCreatures) {
      const levelOneEntries = (creature.learnset || []).filter(entry => entry.level === 1);
      if (levelOneEntries.length !== 1) {
        illegal.push(`${creature.id}:level1-count-${levelOneEntries.length}`);
        continue;
      }

      const move = movesById.get(levelOneEntries[0].moveId);
      if (!move) {
        illegal.push(`${creature.id}:unknown-${levelOneEntries[0].moveId}`);
        continue;
      }

      if (move.category !== 'damage') {
        illegal.push(`${creature.id}:${move.id}:category-${move.category}`);
      }
      if (move.category === 'drain' || isCleanseMove(move)) {
        illegal.push(`${creature.id}:${move.id}:support-rider`);
      }
      if ((move.tier || 1) > 2) {
        illegal.push(`${creature.id}:${move.id}:tier-${move.tier}`);
      }
      if (move.target === 'all_enemies') {
        illegal.push(`${creature.id}:${move.id}:multi-target`);
      }
    }

    assert.deepEqual(illegal, []);
  });
});
```

- [ ] **Step 2: Extend starter distribution tests**

In `tests/unit/creature/starter-distribution.test.js`, add this test inside `describe('creature starter-move distribution', ...)`:

```js
  it('no creature has more than 6 authored learnset entries', () => {
    const overCap = creatures
      .filter(creature => (creature.learnset || []).length > 6)
      .map(creature => `${creature.id}:${creature.learnset.length}`);

    assert.deepStrictEqual(overCap, []);
  });
```

- [ ] **Step 3: Add runtime identity expectations**

In `tests/unit/creature/creatures.test.js`, replace the old `includes baseReading from template` test with:

```js
  it('includes name-centric vocabulary fields from template', () => {
    const creature = instantiateCreature('mizu');
    assert.strictEqual(creature.reading, '\u307F\u305A');
    assert.strictEqual(creature.meaning, 'water');
    assert.strictEqual(creature.rank, 479);
    assert.ok(!('baseWord' in creature));
    assert.ok(!('baseReading' in creature));
    assert.ok(!('baseMeaning' in creature));
  });
```

Also update the Fire Cat and Stone Giant tests in the same file so they assert `reading`, `meaning`, and `rank` rather than `baseWord`, `baseReading`, and `baseMeaning`.

- [ ] **Step 4: Run the focused creature tests and verify failure**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js tests/unit/creature/creatures.test.js
```

Expected: fails because the imported data does not exist yet and runtime creatures still expose legacy vocabulary fields.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js tests/unit/creature/creatures.test.js
git commit -m "$(cat <<'EOF'
test: define creature move expansion data contract

EOF
)"
```

---

### Task 2: Migrate Creature Vocabulary Identity Consumers

**Files:**
- Modify: `src/game/creatures.js`
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/routes/game/run.js`
- Modify: `public/js/ui/bootstrap-client.js`
- Modify: `public/js/ui/attack-card.js`
- Modify: `public/js/ui/befriend.js`
- Modify: `public/js/ui/combat-dom.js`
- Modify: `public/js/ui/post-combat-shop.js`
- Modify: `public/js/dev/battlefield-preview.js`
- Modify: related tests that assert old payload names

- [ ] **Step 1: Update runtime creature identity**

In `src/game/creatures.js`, replace the runtime identity block:

```js
    archetype: template.archetype || 'Fighter',
    baseWord: template.baseWord,
    baseReading: template.baseReading,
    baseMeaning: template.baseMeaning,
```

with:

```js
    archetype: template.archetype || 'Fighter',
    reading: template.reading || template.baseReading,
    meaning: template.meaning || template.baseMeaning,
    rank: template.rank ?? template.baseRank ?? null,
```

This keeps old templates instantiable while making new runtime creatures name-centric.

- [ ] **Step 2: Update entity token creation**

In `public/js/ui/bootstrap-client.js`, replace `entityToToken()` with:

```js
export function entityToToken(entity) {
  const surface = entity.word || entity.name || entity.baseWord;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.meaning || entity.nameEn || entity.baseMeaning;
  return { surface, base: surface, reading, meaning, entity: true };
}
```

- [ ] **Step 3: Update attack records to name-centric fields**

In `src/game/services/creature-combat-service.js`, introduce this helper near the top of the file:

```js
function creatureVocabFields(creature = {}, prefix) {
  return {
    [`${prefix}Word`]: creature.name || creature.baseWord || '',
    [`${prefix}Reading`]: creature.reading || creature.baseReading || '',
    [`${prefix}Meaning`]: creature.meaning || creature.baseMeaning || creature.nameEn || ''
  };
}
```

For player, enemy, rest, and confuse/self-hit attack records, replace old `attackerBaseWord`, `attackerBaseReading`, `attackerBaseMeaning`, `targetBaseWord`, `targetBaseReading`, and `targetBaseMeaning` assignments with spreads:

```js
    ...creatureVocabFields(creature, 'attacker'),
    ...creatureVocabFields(target, 'target'),
```

Keep `attackerName`, `attackerNameJp`, `targetName`, and `targetNameJp` unchanged.

- [ ] **Step 4: Update NPC combat vocabulary input**

In `src/game/services/combat-cycle-service.js`, replace NPC combat vocabulary payload fields:

```js
            baseWord: fullNpc.baseWord || '',
            baseReading: fullNpc.baseReading || '',
            baseMeaning: fullNpc.baseMeaning || ''
```

with:

```js
            name: fullNpc.name || '',
            reading: fullNpc.reading || fullNpc.baseReading || '',
            meaning: fullNpc.meaning || fullNpc.baseMeaning || fullNpc.nameEn || ''
```

In `executeNpcSkill()` inside `src/game/services/creature-combat-service.js`, build the temporary NPC attacker using `name`, `reading`, and `meaning`, with legacy fallbacks only as input compatibility:

```js
    name: npcData.name || npcData.baseWord || npcData.nameEn || '',
    reading: npcData.reading || npcData.baseReading || '',
    meaning: npcData.meaning || npcData.baseMeaning || npcData.nameEn || '',
```

- [ ] **Step 5: Update whack-a-mole creature pool**

In `src/routes/game/run.js`, replace creature pool row vocabulary fields:

```js
        word: c.baseWord,
        reading: c.baseReading,
        meaning: c.baseMeaning,
```

with:

```js
        word: c.name,
        reading: c.reading || c.baseReading || c.name,
        meaning: c.meaning || c.baseMeaning || c.nameEn,
```

- [ ] **Step 6: Update browser UI fallbacks**

Make these targeted replacements:

In `public/js/ui/attack-card.js`, use new attack-record names first:

```js
const attackerToken = entityToToken({
  word: atk.attackerWord || atk.attackerBaseWord || atk.attackerNameJp || atk.attackerName,
  reading: atk.attackerReading || atk.attackerBaseReading,
  meaning: atk.attackerMeaning || atk.attackerBaseMeaning || atk.attackerName,
});
```

Use the same pattern for target tokens and sprite words:

```js
const targetToken = entityToToken({
  word: atk.targetWord || atk.targetBaseWord || atk.targetNameJp || atk.targetName,
  reading: atk.targetReading || atk.targetBaseReading,
  meaning: atk.targetMeaning || atk.targetBaseMeaning || atk.targetName,
});
```

In `public/js/ui/befriend.js`, update `buildCreatureSpeaker()`:

```js
function buildCreatureSpeaker(creature = {}, fallbackName = '') {
  const reading = creature.reading || creature.creatureReading || creature.baseReading || creature.creatureBaseReading || creature.name || fallbackName || '';
  const id = creature.id || creature.creatureId || '';
  return { name: reading, reading, meaning: '', id };
}
```

In `public/js/ui/combat-dom.js`, replace `creature.baseReading || creature.name || ''` with:

```js
creature.reading || creature.baseReading || creature.name || ''
```

In `public/js/ui/post-combat-shop.js`, replace the target card title with:

```js
title: `${c.reading || c.baseReading || c.name} (${c.nameEn})`,
```

In `public/js/dev/battlefield-preview.js`, rename fixture `baseReading` fields to `reading` and read `template.reading || template.baseReading` when creating preview creatures.

- [ ] **Step 7: Update tests for renamed attack and entity fields**

Update `tests/unit/combat/creature-combat-service.test.js` attack-record assertions from:

```js
assert.strictEqual(rec.targetBaseWord, '木');
assert.strictEqual(rec.targetBaseReading, 'き');
assert.strictEqual(rec.targetBaseMeaning, 'tree / wood');
```

to:

```js
assert.strictEqual(rec.targetWord, '木');
assert.strictEqual(rec.targetReading, 'き');
assert.strictEqual(rec.targetMeaning, 'tree / wood');
```

Update `tests/unit/sentence-renderer.test.js` entity-token fixtures from:

```js
entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' })
```

to:

```js
entityToToken({ name: '迷う', reading: 'まよう', meaning: 'get lost / hesitate' })
```

- [ ] **Step 8: Run focused runtime and UI tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creatures.test.js tests/unit/combat/creature-combat-service.test.js tests/unit/sentence-renderer.test.js tests/unit/game/whack-a-mole.test.js tests/unit/ui/befriend.test.js
```

Expected: the identity-migration tests pass, while expansion data tests still fail until imported data exists.

- [ ] **Step 9: Syntax-check edited browser modules**

Run:

```bash
node --check public/js/ui/bootstrap-client.js && node --check public/js/ui/attack-card.js && node --check public/js/ui/befriend.js && node --check public/js/ui/combat-dom.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/dev/battlefield-preview.js
```

Expected: all commands print no syntax errors.

- [ ] **Step 10: Commit identity migration**

```bash
git add src/game/creatures.js src/game/services/creature-combat-service.js src/game/services/combat-cycle-service.js src/routes/game/run.js public/js/ui/bootstrap-client.js public/js/ui/attack-card.js public/js/ui/befriend.js public/js/ui/combat-dom.js public/js/ui/post-combat-shop.js public/js/dev/battlefield-preview.js tests/unit/creature/creatures.test.js tests/unit/combat/creature-combat-service.test.js tests/unit/sentence-renderer.test.js tests/unit/game/whack-a-mole.test.js tests/unit/ui/befriend.test.js
git commit -m "$(cat <<'EOF'
refactor(creatures): use name-centric vocabulary fields

EOF
)"
```

---

### Task 3: Import Approved Moves

**Files:**
- Create: `scripts/import-approved-move-expansion.mjs`
- Modify: `data/moves.json`
- Test: `tests/unit/creature/creature-move-expansion-data.test.js`

- [ ] **Step 1: Create the move import script**

Create `scripts/import-approved-move-expansion.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const SOURCE = resolve(REPO_ROOT, 'output/move-verb-expansion-approved-mechanics.csv');
const MOVES_PATH = resolve(REPO_ROOT, 'data/moves.json');
const CREATED_AT = '2026-05-06';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const ID_OVERRIDES = new Map([
  ['当てる|Hit', 'ateru_hit'],
  ['打つ|Smack', 'utsu_smack'],
  ['吹く|Gust', 'fuku_gust'],
  ['噴く|Erupt', 'fuku_erupt']
]);

function slugifyReading(reading, nameEn) {
  const override = ID_OVERRIDES.get(`${reading}|${nameEn}`);
  if (override) return override;
  return reading
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStatChanges(value) {
  if (!value || !value.trim()) return undefined;
  return JSON.parse(value);
}

const sourceRows = parseCsv(readFileSync(SOURCE, 'utf8'))
  .filter(row => row['Human Judgement'].startsWith('Add'));

const existingMoves = JSON.parse(readFileSync(MOVES_PATH, 'utf8'));
const existingBySignature = new Map(existingMoves.map(move => [`${move.name}|${move.reading}|${move.nameEn}`, move]));
const usedIds = new Set(existingMoves.map(move => move.id));
const imported = [];

for (const row of sourceRows) {
  const name = row.Japanese;
  const reading = row.Reading;
  const nameEn = row['Approved Move Name'];
  const signature = `${name}|${reading}|${nameEn}`;
  if (existingBySignature.has(signature)) continue;

  let id = slugifyReading(reading, nameEn);
  if (!id || usedIds.has(id)) {
    const suffix = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    id = `${id || 'move'}_${suffix}`;
  }
  let uniqueId = id;
  let counter = 2;
  while (usedIds.has(uniqueId)) {
    uniqueId = `${id}_${counter++}`;
  }
  usedIds.add(uniqueId);

  const move = {
    id: uniqueId,
    name,
    nameEn,
    reading,
    meaning: row.Definition,
    rank: parseNumber(row['JPDB Rank']),
    element: row.Element,
    category: row.Category,
    target: row.Target,
    power: parseNumber(row.Power),
    mpCost: parseNumber(row['MP Cost']),
    statusEffect: row['Status Effect'] ? row['Status Effect'] : null,
    statusChance: parseNumber(row['Status Chance']),
    statusDuration: parseNumber(row['Status Duration']),
    tier: parseNumber(row.Tier),
    description: row.Description,
    stage: 1,
    createdAt: CREATED_AT
  };

  const statChanges = parseStatChanges(row['Stat Changes']);
  if (statChanges) move.statChanges = statChanges;

  imported.push(move);
}

const nextMoves = [...existingMoves, ...imported];
writeFileSync(MOVES_PATH, `${JSON.stringify(nextMoves, null, 2)}\n`);
console.log(`Imported ${imported.length} moves from ${sourceRows.length} approved rows`);
```

- [ ] **Step 2: Run the move import**

Run:

```bash
node scripts/import-approved-move-expansion.mjs
```

Expected: prints an import count and updates `data/moves.json`.

- [ ] **Step 3: Inspect duplicate-sensitive move IDs**

Run:

```bash
node -e "const moves=require('./data/moves.json'); const ids=moves.map(m=>m.id); const d=ids.filter((id,i)=>ids.indexOf(id)!==i); console.log(JSON.stringify(d));"
```

Expected: `[]`.

- [ ] **Step 4: Run move-related tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creature-move-expansion-data.test.js tests/unit/combat/creature-combat-service.test.js tests/unit/combat/effects.test.js
```

Expected: expansion data test still fails on missing creatures and orphaned imported moves; combat/effects tests pass.

- [ ] **Step 5: Commit imported moves and script**

```bash
git add scripts/import-approved-move-expansion.mjs data/moves.json
git commit -m "$(cat <<'EOF'
feat(moves): import approved verb mechanics

EOF
)"
```

---

### Task 4: Import Approved Creatures

**Files:**
- Create: `scripts/import-approved-creature-expansion.mjs`
- Modify: `data/creatures.json`
- Test: `tests/unit/creature/creature-move-expansion-data.test.js`

- [ ] **Step 1: Create the creature import script**

Create `scripts/import-approved-creature-expansion.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const STATS_SOURCE = process.env.APPROVED_CREATURE_STATS_CSV ||
  '/Users/michiarohrssen/Documents/Claude/koto-wt-approved-creature-roster-stats/output/approved-creature-roster-stats-proposal.csv';
const ROSTER_SOURCE = resolve(REPO_ROOT, 'output/roster-expansion-suggestions-master.csv');
const CREATURES_PATH = resolve(REPO_ROOT, 'data/creatures.json');
const CREATED_AT = '2026-05-06';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const ID_OVERRIDES = new Map([
  ['光', 'hikari'],
  ['月', 'tsuki'],
  ['影', 'kage'],
  ['星', 'hoshi'],
  ['馬', 'uma'],
  ['雪', 'yuki'],
  ['鬼', 'oni'],
  ['雲', 'kumo'],
  ['竜', 'ryuu'],
  ['雷', 'kaminari'],
  ['蛇', 'hebi'],
  ['幽霊', 'yuurei'],
  ['狼', 'ookami'],
  ['牛', 'ushi'],
  ['熊', 'kuma'],
  ['猿', 'saru'],
  ['豚', 'buta'],
  ['虎', 'tora'],
  ['鹿', 'shika'],
  ['妖精', 'yousei'],
  ['狐', 'kitsune'],
  ['羊', 'hitsuji'],
  ['亀', 'kame'],
  ['鼠', 'nezumi'],
  ['蛙', 'kaeru'],
  ['鴨', 'kamo'],
  ['鯨', 'kujira'],
  ['氷', 'koori'],
  ['土', 'tsuchi'],
  ['悪魔', 'akuma'],
  ['天使', 'tenshi'],
  ['砂', 'suna'],
  ['タコ', 'tako'],
  ['鶴', 'tsuru'],
  ['トカゲ', 'tokage'],
  ['イカ', 'ika'],
  ['猪', 'inoshishi'],
  ['カニ', 'kani'],
  ['獣', 'kemono'],
  ['エルフ', 'erufu'],
  ['ゴブリン', 'goburin'],
  ['骨', 'hone'],
  ['水晶', 'suishou'],
  ['スライム', 'suraimu']
]);

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

const statsRows = parseCsv(readFileSync(STATS_SOURCE, 'utf8'));
const rosterRows = parseCsv(readFileSync(ROSTER_SOURCE, 'utf8'));
const metadataByJapanese = new Map();

for (const row of rosterRows) {
  if (!metadataByJapanese.has(row.Japanese)) {
    metadataByJapanese.set(row.Japanese, row);
  }
}

const existing = JSON.parse(readFileSync(CREATURES_PATH, 'utf8'));
const existingIds = new Set(existing.map(creature => creature.id));
const imported = [];

for (const row of statsRows) {
  const japanese = row.japanese;
  const metadata = metadataByJapanese.get(japanese);
  if (!metadata) throw new Error(`No roster metadata for ${row.creature} / ${japanese}`);

  const id = ID_OVERRIDES.get(japanese);
  if (!id) throw new Error(`No id override for ${row.creature} / ${japanese}`);
  if (existingIds.has(id)) continue;

  imported.push({
    id,
    name: japanese,
    nameEn: row.creature,
    reading: metadata.Reading,
    meaning: metadata.Definition,
    rank: number(metadata['JPDB Rank']),
    element: row.element,
    rarity: row.rarity,
    baseHp: number(row.baseHp),
    baseAttack: number(row.baseAttack),
    baseMp: number(row.baseMp),
    baseDefense: number(row.baseDefense),
    baseDex: number(row.baseDex),
    archetype: row.archetype,
    isStarter: false,
    learnset: [],
    stage: 1,
    createdAt: CREATED_AT
  });
}

writeFileSync(CREATURES_PATH, `${JSON.stringify([...existing, ...imported], null, 2)}\n`);
console.log(`Imported ${imported.length} creatures from ${statsRows.length} approved rows`);
```

- [ ] **Step 2: Run the creature import**

Run:

```bash
node scripts/import-approved-creature-expansion.mjs
```

Expected: prints an import count and updates `data/creatures.json`.

- [ ] **Step 3: Verify imported creature count**

Run:

```bash
node -e "const c=require('./data/creatures.json'); console.log(c.filter(x=>x.createdAt==='2026-05-06').length)"
```

Expected: `44`.

- [ ] **Step 4: Run expansion tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creature-move-expansion-data.test.js
```

Expected: fails because new creature learnsets are empty and imported moves are orphaned.

- [ ] **Step 5: Commit imported creatures and script**

```bash
git add scripts/import-approved-creature-expansion.mjs data/creatures.json
git commit -m "$(cat <<'EOF'
feat(creatures): import approved roster templates

EOF
)"
```

---

### Task 5: Curate Learnsets and Enforce Coverage

**Files:**
- Create: `scripts/report-learnset-coverage.mjs`
- Create: `docs/superpowers/specs/2026-05-06-creature-move-expansion-learnset-ledger.md`
- Modify: `data/creatures.json`
- Test: `tests/unit/creature/creature-move-expansion-data.test.js`
- Test: `tests/unit/creature/starter-distribution.test.js`

- [ ] **Step 1: Create a learnset coverage report script**

Create `scripts/report-learnset-coverage.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const CREATED_AT = '2026-05-06';
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));

const movesById = new Map(moves.map(move => [move.id, move]));
const newMoves = moves.filter(move => move.createdAt === CREATED_AT);
const newCreatures = creatures.filter(creature => creature.createdAt === CREATED_AT);
const learned = new Set();
const errors = [];

for (const creature of creatures) {
  for (const entry of creature.learnset || []) learned.add(entry.moveId);
}

for (const creature of newCreatures) {
  const learnset = creature.learnset || [];
  if (learnset.length < 4 || learnset.length > 6) {
    errors.push(`${creature.id}: expected 4-6 moves, found ${learnset.length}`);
  }

  const levelOne = learnset.filter(entry => entry.level === 1);
  if (levelOne.length !== 1) {
    errors.push(`${creature.id}: expected exactly one level-1 move, found ${levelOne.length}`);
  }

  for (const entry of learnset) {
    const move = movesById.get(entry.moveId);
    if (!move) {
      errors.push(`${creature.id}: unknown move ${entry.moveId}`);
      continue;
    }
    if (entry.level === 1) {
      if (move.category !== 'damage') errors.push(`${creature.id}: illegal level-1 category ${move.id}:${move.category}`);
      if (move.statusEffect === 'cleanse') errors.push(`${creature.id}: illegal level-1 cleanse ${move.id}`);
      if ((move.tier || 1) > 2) errors.push(`${creature.id}: illegal level-1 tier ${move.id}:${move.tier}`);
      if (move.target === 'all_enemies') errors.push(`${creature.id}: illegal level-1 multi-target ${move.id}`);
    }
  }
}

const orphaned = newMoves.filter(move => !learned.has(move.id));
console.log(`New creatures: ${newCreatures.length}`);
console.log(`New moves: ${newMoves.length}`);
console.log(`Orphan new moves: ${orphaned.length}`);
for (const move of orphaned) {
  console.log(`  - ${move.id} (${move.nameEn}, ${move.element}, ${move.category}, tier ${move.tier})`);
}

if (errors.length > 0) {
  console.error('Learnset errors:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (orphaned.length > 0) process.exit(1);
```

- [ ] **Step 2: Create the manual learnset design ledger**

Create `docs/superpowers/specs/2026-05-06-creature-move-expansion-learnset-ledger.md`:

```markdown
# Creature and Move Expansion Learnset Ledger

**Date:** 2026-05-06  
**Purpose:** Human-authored design record for the approved creature/move expansion.

## Rules

- No algorithmic moveset assignment.
- No score-based candidate selection.
- No auto-filled leftover moves.
- Scripts may only import rows and validate the authored result.
- Every move listed here must have a creature-specific fantasy, balance, or vocabulary reason.

## Creature Learnsets

Use this section for all 44 new creatures. Each creature entry must include:

- Role read: rarity, element, archetype, stats that matter.
- Progression intent: what the early, mid, and late kit should teach.
- Learnset table: level, move ID, move name, reason.
- Coverage notes: any imported move placed mainly to avoid orphaning must still explain why this creature honestly supports it.

### hikari / Light / 光

Role read:

Progression intent:

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 |  |  |  |

Coverage notes:
```

Then add one section per imported creature ID:

```markdown
### <id> / <nameEn> / <name>

Role read:
<2-4 sentences. Mention rarity, element, archetype, and relevant stat shape.>

Progression intent:
<2-4 sentences. Explain how the creature starts, what it gains midgame, and what its final identity is.>

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | <moveId> | <nameEn> | <why this is the level-1 basic move> |

Coverage notes:
<Mention imported moves this creature is responsible for covering, if any. If all moves are obvious thematic fits, say so.>
```

Do not leave blank sections before editing `data/creatures.json`. The ledger is the design source of truth for the learnset JSON.

- [ ] **Step 3: Print move reference tables for human review**

Run:

```bash
node - <<'NODE'
const moves = require('./data/moves.json').filter(m => m.createdAt === '2026-05-06');
const by = {};
for (const m of moves) {
  const key = `${m.element}:${m.category}:tier${m.tier}`;
  (by[key] ||= []).push(`${m.id} (${m.nameEn}, rank ${m.rank})`);
}
for (const key of Object.keys(by).sort()) {
  console.log(`\n${key}`);
  for (const item of by[key].sort()) console.log(`  ${item}`);
}
NODE
```

Expected: grouped move reference tables by element, category, and tier. These tables are for human reading only. Do not copy them into `data/creatures.json` through an algorithm, sorted loop, or automatic assignment.

- [ ] **Step 4: Manually author every new creature learnset in the ledger**

Work creature-by-creature in `docs/superpowers/specs/2026-05-06-creature-move-expansion-learnset-ledger.md`.

For each creature:

1. Read its template in `data/creatures.json`.
2. Read relevant moves in `data/moves.json`.
3. Choose each move manually.
4. Write the reason in the ledger before or while editing JSON.
5. Check the kit as a whole: early move, midgame broadening, late signature, element fit, archetype fit, frequency exposure, and total combat usability.

Do not proceed creature-by-creature with a script. Do not use a generated assignment list. Do not let the orphan report choose placements. If a move is hard to place, spend the time to decide which creature can honestly support it, or revise an earlier weaker move choice.

- [ ] **Step 5: Apply the manually authored ledger to `data/creatures.json`**

Edit `data/creatures.json` for each `createdAt: "2026-05-06"` creature. Use these patterns:

```json
"learnset": [
  { "moveId": "level_1_basic_damage_move", "level": 1 },
  { "moveId": "early_tier_2_fit", "level": 6 },
  { "moveId": "mid_tier_2_or_3_fit", "level": 12 },
  { "moveId": "late_archetype_fit", "level": 20 },
  { "moveId": "signature_or_coverage_move", "level": 30 }
]
```

For 6-move creatures use:

```json
"learnset": [
  { "moveId": "level_1_basic_damage_move", "level": 1 },
  { "moveId": "early_tier_2_fit", "level": 5 },
  { "moveId": "mid_tier_2_fit", "level": 10 },
  { "moveId": "tier_3_or_support_fit", "level": 16 },
  { "moveId": "late_tier_3_fit", "level": 24 },
  { "moveId": "signature_tier_3_or_4_fit", "level": 34 }
]
```

Apply the spec rules while editing:

- Common creatures usually get 4-5 moves.
- Uncommon creatures usually get 5 moves.
- Rare, epic, legendary, and broad-theme creatures may get 6 moves.
- Level 1 must be a single-target `damage` move, tier 1-2.
- No level 1 `buff`, `debuff`, `heal`, `drain`, or cleanse.
- Prefer creature element or neutral moves.
- Use off-element moves only for obvious anatomy or theme.
- Use high-frequency moves earlier when the fit is comparable.
- Assign every imported `createdAt: "2026-05-06"` move at least once.

- [ ] **Step 6: Run the coverage report**

Run:

```bash
node scripts/report-learnset-coverage.mjs
```

Expected: prints `Orphan new moves: 0` and exits 0.

- [ ] **Step 7: Manually resolve any validation failures**

If the coverage report prints orphan moves or illegal learnset entries, return to the ledger first:

1. Add or revise the creature reasoning in the ledger.
2. Then update `data/creatures.json`.
3. Rerun `node scripts/report-learnset-coverage.mjs`.

Do not solve failures by appending leftover moves without a ledger reason.

- [ ] **Step 8: Run focused data tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js
```

Expected: both test files pass.

- [ ] **Step 9: Commit learnsets, ledger, and coverage script**

```bash
git add scripts/report-learnset-coverage.mjs docs/superpowers/specs/2026-05-06-creature-move-expansion-learnset-ledger.md data/creatures.json tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js
git commit -m "$(cat <<'EOF'
feat(creatures): add manually designed move learnsets

EOF
)"
```

---

### Task 6: Final Validation and Cleanup

**Files:**
- Modify only files touched by earlier tasks if verification finds issues.
- Test: all relevant unit and integration tests.

- [ ] **Step 1: Run JSON parse checks**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('data/creatures.json','utf8')); JSON.parse(require('fs').readFileSync('data/moves.json','utf8')); console.log('JSON OK')"
```

Expected: `JSON OK`.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check src/game/creatures.js && node --check src/game/services/creature-combat-service.js && node --check src/game/services/combat-cycle-service.js && node --check src/routes/game/run.js && node --check public/js/ui/bootstrap-client.js && node --check public/js/ui/attack-card.js && node --check public/js/ui/befriend.js && node --check public/js/ui/combat-dom.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/dev/battlefield-preview.js && node --check scripts/import-approved-move-expansion.mjs && node --check scripts/import-approved-creature-expansion.mjs && node --check scripts/report-learnset-coverage.mjs
```

Expected: no syntax errors.

- [ ] **Step 3: Run the learnset coverage report**

Run:

```bash
node scripts/report-learnset-coverage.mjs
```

Expected: `Orphan new moves: 0` and exit code 0.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js tests/unit/creature/creatures.test.js tests/unit/combat/creature-combat-service.test.js tests/unit/sentence-renderer.test.js tests/unit/game/whack-a-mole.test.js tests/unit/ui/befriend.test.js
```

Expected: all listed tests pass.

- [ ] **Step 5: Run full unit tests**

Run:

```bash
npm run test:unit
```

Expected: all unit tests pass.

- [ ] **Step 6: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: all integration tests pass.

- [ ] **Step 7: Confirm no area placement or art changes**

Run:

```bash
git diff -- data/areas.json public/assets
```

Expected: no diff output.

- [ ] **Step 8: Inspect changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to the planned data, scripts, source consumers, tests, spec, and plan files.

- [ ] **Step 9: Commit final fixes if any verification step required changes**

If Step 1-8 required fixes, commit only those fixes:

```bash
git add <fixed-files>
git commit -m "$(cat <<'EOF'
fix: stabilize creature move expansion data

EOF
)"
```

Do not run this command if no files changed after the previous task commits.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-creature-move-expansion.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
