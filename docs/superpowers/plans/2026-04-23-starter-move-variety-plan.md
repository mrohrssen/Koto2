# Starter Move Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `tataku` starter usage from 13/19 creatures to 1, giving each creature a thematically fitting level-1 move, and lock in the result with invariant tests.

**Architecture:** Three data mutations (creature L1 reassignments, creature mid-slot replacements where needed, two move stat rebalances) applied by a one-shot migration script. Three invariant tests guard the resulting data against future regression. The `learnset-builder` subskill is updated so future forged creatures follow the same rules.

**Tech Stack:** Node 20+, `node:test` runner, `node:assert`. Data lives in `data/creatures.json` and `data/moves.json`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-23-starter-move-variety-design.md`

---

## File Structure

**Created:**
- `tests/unit/creature/starter-distribution.test.js` — three invariant tests.
- `scripts/migrate-starter-moves.js` — one-shot migration; idempotent.

**Modified:**
- `data/creatures.json` — 13 `level: 1` reassignments + 9 mid-slot replacements.
- `data/moves.json` — `tobu` and `horu` stat rebalances.
- `.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/learnset-builder.md` — new Step 0 (starter selection) + Step 5 note.

**Not touched:** player save data, sprites, combat code, other skills.

---

## Task 1: Invariant tests (failing against current data)

**Files:**
- Create: `tests/unit/creature/starter-distribution.test.js`

- [ ] **Step 1: Write the three invariant tests**

```js
// tests/unit/creature/starter-distribution.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const creatures = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8')
);
const movesById = Object.fromEntries(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'))
    .map(m => [m.id, m])
);

const starterMove = (creature) => {
  const entry = creature.learnset.find(e => e.level === 1);
  return entry ? entry.moveId : null;
};

describe('creature starter-move distribution', () => {
  it('no move appears as level-1 starter for more than 2 creatures', () => {
    const counts = {};
    for (const c of creatures) {
      const id = starterMove(c);
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
    }
    const overCap = Object.entries(counts).filter(([, n]) => n > 2);
    assert.deepStrictEqual(
      overCap,
      [],
      `Starter cap is 2. Over-cap moves: ${JSON.stringify(overCap)}`
    );
  });

  it('level-1 move does not appear at any other level in the same learnset', () => {
    const duplicates = [];
    for (const c of creatures) {
      const starter = starterMove(c);
      if (!starter) continue;
      const laterWithSameMove = c.learnset.filter(
        e => e.level !== 1 && e.moveId === starter
      );
      if (laterWithSameMove.length > 0) {
        duplicates.push({ creature: c.id, move: starter, laterLevels: laterWithSameMove.map(e => e.level) });
      }
    }
    assert.deepStrictEqual(
      duplicates,
      [],
      `Duplicate L1 moves found: ${JSON.stringify(duplicates)}`
    );
  });

  it('no later-level damage move is strictly weaker than the level-1 damage move', () => {
    const regressions = [];
    for (const c of creatures) {
      const starter = starterMove(c);
      if (!starter) continue;
      const starterMove_ = movesById[starter];
      if (!starterMove_ || starterMove_.category !== 'damage') continue;
      const starterPower = starterMove_.power ?? 0;
      const weakerLater = c.learnset
        .filter(e => e.level !== 1)
        .map(e => ({ level: e.level, move: e.moveId, m: movesById[e.moveId] }))
        .filter(({ m }) => m && m.category === 'damage' && (m.power ?? 0) < starterPower);
      if (weakerLater.length > 0) {
        regressions.push({
          creature: c.id,
          starter,
          starterPower,
          weakerLater: weakerLater.map(x => ({ level: x.level, move: x.move, power: x.m.power }))
        });
      }
    }
    assert.deepStrictEqual(
      regressions,
      [],
      `Damage power regressions found: ${JSON.stringify(regressions)}`
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail against current data**

```bash
node --test tests/unit/creature/starter-distribution.test.js
```

Expected: first test (`no move appears as level-1 starter for more than 2 creatures`) FAILS with message naming `tataku` at count 13. The other two tests PASS (current data has no duplicates and no regression).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/creature/starter-distribution.test.js
git commit -m "test(creatures): add starter-move distribution invariants (failing)"
```

---

## Task 2: Migration script (data transformation source of truth)

**Files:**
- Create: `scripts/migrate-starter-moves.js`

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-starter-moves.js
// One-shot migration for docs/superpowers/specs/2026-04-23-starter-move-variety-design.md.
// Idempotent: re-running produces no change if the data already matches the target state.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// 13 creatures: new level-1 starter move.
const L1_REASSIGN = {
  hi: 'honoo',
  mizu: 'nagasu',
  ki: 'sasu',
  ishi: 'mamoru',
  tetsu: 'tataku',
  kaze: 'naku',
  mushi: 'kakureru',
  hana: 'nemuru',
  tori: 'tobu',
  sakana: 'nomu',
  neko: 'okoru',
  inu: 'horu',
  hineko: 'honoo',
};

// 9 creatures: mid-level slot replacements (resolves duplicates created by the L1 reassignments).
// Key: creatureId. Value: { level: number, newMoveId: string }.
const MID_REPLACE = {
  hi:     { level: 7,  newMoveId: 'okoru' },
  mizu:   { level: 7,  newMoveId: 'mamoru' },
  ishi:   { level: 5,  newMoveId: 'suwaru' },
  kaze:   { level: 5,  newMoveId: 'nemuru' },
  hana:   { level: 5,  newMoveId: 'nomu' },
  tori:   { level: 16, newMoveId: 'nemuru' },
  sakana: { level: 5,  newMoveId: 'kakureru' },
  neko:   { level: 5,  newMoveId: 'kakureru' },
  hineko: { level: 10, newMoveId: 'kesu' },
};

// 2 moves: stat rebalances.
const MOVE_REBALANCE = {
  tobu: { power: 15, mpCost: 10 },
  horu: { power: 15, mpCost: 12 },
};

const creaturesPath = resolve(REPO_ROOT, 'data/creatures.json');
const movesPath = resolve(REPO_ROOT, 'data/moves.json');

const creatures = JSON.parse(readFileSync(creaturesPath, 'utf8'));
const moves = JSON.parse(readFileSync(movesPath, 'utf8'));

const summary = { l1Changed: [], midChanged: [], movesChanged: [] };

for (const c of creatures) {
  const newL1 = L1_REASSIGN[c.id];
  if (newL1) {
    const entry = c.learnset.find(e => e.level === 1);
    if (!entry) throw new Error(`Creature ${c.id} has no level-1 learnset entry`);
    if (entry.moveId !== newL1) {
      summary.l1Changed.push({ id: c.id, old: entry.moveId, new: newL1 });
      entry.moveId = newL1;
    }
  }
  const mid = MID_REPLACE[c.id];
  if (mid) {
    const entry = c.learnset.find(e => e.level === mid.level);
    if (!entry) throw new Error(`Creature ${c.id} has no level-${mid.level} learnset entry`);
    if (entry.moveId !== mid.newMoveId) {
      summary.midChanged.push({ id: c.id, level: mid.level, old: entry.moveId, new: mid.newMoveId });
      entry.moveId = mid.newMoveId;
    }
  }
}

for (const m of moves) {
  const rebalance = MOVE_REBALANCE[m.id];
  if (!rebalance) continue;
  const before = { power: m.power, mpCost: m.mpCost };
  let changed = false;
  for (const [k, v] of Object.entries(rebalance)) {
    if (m[k] !== v) {
      m[k] = v;
      changed = true;
    }
  }
  if (changed) summary.movesChanged.push({ id: m.id, before, after: { ...rebalance } });
}

writeFileSync(creaturesPath, JSON.stringify(creatures, null, 2) + '\n');
writeFileSync(movesPath, JSON.stringify(moves, null, 2) + '\n');

console.log('Starter-move migration complete.');
console.log(`  L1 starter reassignments: ${summary.l1Changed.length}`);
for (const x of summary.l1Changed) console.log(`    ${x.id}: ${x.old} -> ${x.new}`);
console.log(`  Mid-slot replacements: ${summary.midChanged.length}`);
for (const x of summary.midChanged) console.log(`    ${x.id} L${x.level}: ${x.old} -> ${x.new}`);
console.log(`  Move rebalances: ${summary.movesChanged.length}`);
for (const x of summary.movesChanged) {
  console.log(`    ${x.id}: pwr ${x.before.power} -> ${x.after.power}, mp ${x.before.mpCost} -> ${x.after.mpCost}`);
}
```

- [ ] **Step 2: Run the migration script**

```bash
node scripts/migrate-starter-moves.js
```

Expected output (exact counts):
```
Starter-move migration complete.
  L1 starter reassignments: 12
    hi: tataku -> honoo
    mizu: tataku -> nagasu
    ki: tataku -> sasu
    ishi: tataku -> mamoru
    kaze: tataku -> naku
    mushi: tataku -> kakureru
    hana: tataku -> nemuru
    tori: tataku -> tobu
    sakana: tataku -> nomu
    neko: tataku -> okoru
    inu: tataku -> horu
    hineko: tataku -> honoo
  Mid-slot replacements: 9
    hi L7: honoo -> okoru
    mizu L7: nagasu -> mamoru
    ishi L5: mamoru -> suwaru
    kaze L5: naku -> nemuru
    hana L5: nemuru -> nomu
    tori L16: tobu -> nemuru
    sakana L5: nomu -> kakureru
    neko L5: okoru -> kakureru
    hineko L10: honoo -> kesu
  Move rebalances: 2
    tobu: pwr 20 -> 15, mp 10 -> 10
    horu: pwr 20 -> 15, mp 15 -> 12
```

Note: L1 reassignments shows 12, not 13 — `tetsu: tataku -> tataku` is a no-op.

- [ ] **Step 3: Verify re-running produces no changes (idempotency)**

```bash
node scripts/migrate-starter-moves.js
```

Expected:
```
Starter-move migration complete.
  L1 starter reassignments: 0
  Mid-slot replacements: 0
  Move rebalances: 0
```

- [ ] **Step 4: Run invariant tests — all three should now pass**

```bash
node --test tests/unit/creature/starter-distribution.test.js
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full unit test suite to catch collateral damage**

```bash
npm run test:unit
```

Expected: all tests PASS. If any creature-combat test hard-codes `tataku` as an expected attack for a specific creature, it will fail here — fix it by updating the expected move to whatever the creature's new L1 move is. Do not add compatibility shims.

- [ ] **Step 6: Commit the data changes and the script together**

```bash
git add scripts/migrate-starter-moves.js data/creatures.json data/moves.json
git commit -m "feat(creatures): diversify starter moves, reduce tataku exposure 13->1"
```

---

## Task 3: Update the learnset-builder subskill

**Files:**
- Modify: `.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/learnset-builder.md`

- [ ] **Step 1: Insert a new Step 0 before the existing Step 1**

Find the section heading `### Step 1: Read the Move Pool` and insert the following block immediately above it:

```markdown
### Step 0: Pick the level-1 starter move

The level-1 move is what a player sees the creature use most often in combat. Pick in this priority order:

1. **Thematic match** — a move whose meaning fits the creature's concept (e.g. bird → `tobu` fly, fish → `nomu` drink, cat → `okoru` get angry).
2. **Element-STAB match** — a damage/buff/debuff move sharing the creature's element.
3. **Archetype fit** — Fighter: damage; Mage: damage or buff; Trickster: debuff or hide; Tank/Healer: buff or heal.

**Starter-cap rule:** Before finalizing, read `data/creatures.json` and count how many creatures already have your candidate as their `level: 1` move. If the count is ≥ 2, pick a different move.

**`tataku` rule:** `tataku` is allowed as a starter only if no other candidate fits the thematic, element, or archetype tests.

**Anti-duplication rule:** The level-1 move must not appear at any other level in this creature's learnset. When building the rest of the learnset (Steps 1–6), exclude the level-1 move from the candidate pool.
```

- [ ] **Step 2: Update Step 5 (Tier Spread) to reflect that L1 is reserved**

In the Step 5 section, replace the line `- **Levels 1, 5:** Tier 1 moves (basic, low cost)` with:

```markdown
- **Level 1:** reserved for the starter chosen in Step 0 (do not re-pick here)
- **Level 5:** Tier 1 move (basic, low cost)
```

- [ ] **Step 3: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/learnset-builder.md
git commit -m "docs(forge): add Step 0 starter-move rules to learnset-builder"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS. No regressions in unit or integration tiers.

- [ ] **Step 2: Confirm distribution by hand**

```bash
node -e "
const c = require('./data/creatures.json');
const counts = {};
for (const x of c) {
  const l1 = x.learnset.find(e => e.level === 1);
  if (!l1) continue;
  counts[l1.moveId] = (counts[l1.moveId] || 0) + 1;
}
console.log(Object.entries(counts).sort((a,b) => b[1]-a[1]));
"
```

Expected: `tataku` appears exactly once (tetsu). `honoo`, `sasu`, `kakureru` appear twice each. Every other starter appears exactly once. Total = 19 creatures across 14 distinct moves.

- [ ] **Step 3: Sanity-check moves.json**

```bash
node -e "
const m = require('./data/moves.json');
const t = m.find(x => x.id === 'tobu');
const h = m.find(x => x.id === 'horu');
console.log('tobu:', { power: t.power, mpCost: t.mpCost });
console.log('horu:', { power: h.power, mpCost: h.mpCost });
"
```

Expected:
```
tobu: { power: 15, mpCost: 10 }
horu: { power: 15, mpCost: 12 }
```

- [ ] **Step 4: No extra commit needed if no changes appeared in Steps 1–3**

If Step 1 of this task required fixing a stale test, that fix was already committed in Task 2 Step 6. Nothing to commit here.

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 Starter reassignment (13 creatures) | Task 2 `L1_REASSIGN` table |
| §2 Mid-level replacements (9 creatures) | Task 2 `MID_REPLACE` table |
| §3 Move rebalances (tobu, horu) | Task 2 `MOVE_REBALANCE` table |
| §4 Learnset-builder skill update | Task 3 |
| §5 Migration script | Task 2 |
| §6 Invariant tests | Task 1 |

All six spec deliverables are covered. No placeholders, no TBDs, every step contains the actual code to write or command to run.

**Type consistency:** `starterMove()` helper used only in Task 1. Tables `L1_REASSIGN`, `MID_REPLACE`, `MOVE_REBALANCE` defined and consumed in the same file in Task 2. No cross-task identifiers to reconcile.
