# Pokemon-Style Move System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the auto-attack + flashcard combat system with a Pokemon-style shared move pool where 150 Japanese verbs are combat moves that creatures learn at specific levels.

**Architecture:** A static `data/moves.json` defines all moves. Each creature in `data/creatures.json` gains a `learnset` (list of moveIds + learn levels) and `baseMp`. Combat changes from "all creatures auto-attack with one skill" to "player picks a move per creature, then picks a target." The flashcard system exits combat entirely.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, JPDB API for frequency data, Opus API for move classification.

**Design Doc:** `docs/plans/2026-02-26-pokemon-move-system-design.md`

---

## Phase 1: Move Pool Data

### Task 1: Seed moves.json from existing creature abilities

Extract the ~80 existing autoSkill/ultimate abilities from `data/creatures.json` into a new `data/moves.json` file. Deduplicate moves that share the same word (e.g., multiple creatures might use 噛む).

**Files:**
- Create: `scripts/seed-moves-from-creatures.mjs`
- Create: `data/moves.json`
- Read: `data/creatures.json`

**Step 1: Write the seed script**

```js
// scripts/seed-moves-from-creatures.mjs
import { readFileSync, writeFileSync } from 'fs';

const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf-8'));
const moveMap = new Map(); // dedup by word

for (const c of creatures) {
  // Extract autoSkill
  if (c.autoSkill) {
    const key = c.autoSkill.word;
    if (!moveMap.has(key)) {
      moveMap.set(key, {
        id: c.autoSkill.nameEn.toLowerCase().replace(/\s+/g, '-'),
        name: c.autoSkill.name,
        nameEn: c.autoSkill.nameEn,
        reading: c.autoSkill.reading,
        meaning: c.autoSkill.nameEn.toLowerCase(), // placeholder — needs review
        rank: c.autoSkill.rank,
        element: c.autoSkill.element,
        category: c.autoSkill.type === 'damage' ? 'damage' : c.autoSkill.type,
        target: c.autoSkill.target,
        power: c.autoSkill.power,
        mpCost: 10, // default low cost for basic attacks
        statusEffect: null,
        statusChance: 0,
        statusDuration: 0,
        tier: 1,
        description: ''
      });
    }
  }

  // Extract ultimate
  if (c.ultimate) {
    const key = c.ultimate.word;
    if (!moveMap.has(key)) {
      const cat = mapUltimateType(c.ultimate.type);
      moveMap.set(key, {
        id: c.ultimate.nameEn.toLowerCase().replace(/\s+/g, '-'),
        name: c.ultimate.name,
        nameEn: c.ultimate.nameEn,
        reading: c.ultimate.reading,
        meaning: c.ultimate.nameEn.toLowerCase(),
        rank: c.ultimate.rank,
        element: c.ultimate.element,
        category: cat.category,
        target: c.ultimate.target,
        power: c.ultimate.power,
        mpCost: 40, // default medium-high cost for ultimates
        statusEffect: cat.statusEffect,
        statusChance: cat.statusChance,
        statusDuration: cat.statusDuration,
        tier: 2,
        description: ''
      });
    }
  }
}

function mapUltimateType(type) {
  // Map existing ultimate types to new move schema
  const statusTypes = ['poison', 'sleep', 'stun', 'confuse'];
  if (statusTypes.includes(type)) {
    return { category: 'debuff', statusEffect: type, statusChance: 80, statusDuration: 2 };
  }
  if (type === 'heal') return { category: 'heal', statusEffect: null, statusChance: 0, statusDuration: 0 };
  if (type === 'shield' || type === 'team_shield') return { category: 'shield', statusEffect: null, statusChance: 0, statusDuration: 0 };
  if (type === 'attack_buff') return { category: 'buff', statusEffect: 'attack_buff', statusChance: 100, statusDuration: 2 };
  if (type === 'haste') return { category: 'buff', statusEffect: 'haste', statusChance: 100, statusDuration: 1 };
  if (type === 'taunt') return { category: 'buff', statusEffect: 'taunt', statusChance: 100, statusDuration: 2 };
  return { category: 'damage', statusEffect: null, statusChance: 0, statusDuration: 0 };
}

const moves = [...moveMap.values()].sort((a, b) => a.rank - b.rank);
writeFileSync('data/moves.json', JSON.stringify(moves, null, 2));
console.log(`Seeded ${moves.length} moves from ${creatures.length} creatures`);
```

**Step 2: Run the seed script**

Run: `node scripts/seed-moves-from-creatures.mjs`
Expected: Creates `data/moves.json` with ~40-60 unique moves (many creatures share moves like 噛む)

**Step 3: Verify the output**

Spot-check `data/moves.json` — confirm moves have correct Japanese names, elements, and categories. Fix any obvious issues manually.

**Step 4: Commit**

```bash
git add scripts/seed-moves-from-creatures.mjs data/moves.json
git commit -m "feat: seed moves.json from existing creature abilities"
```

---

### Task 2: Write JPDB move candidate pull script

Pull top verbs by frequency from JPDB API. Filter to words that could plausibly be combat moves. Output ~250 candidates for Opus to classify.

**Files:**
- Create: `scripts/pull-move-candidates.mjs`
- Create: `data/move-candidates.json`
- Read: `src/jpdb.js` (for JPDB API patterns)
- Read: `data/moves.json` (to exclude already-seeded moves)

**Step 1: Study the JPDB API integration**

Read `src/jpdb.js` to understand the API client patterns, auth, and available endpoints. The key endpoint we need is vocabulary lookup by frequency.

**Step 2: Write the candidate pull script**

The script should:
- Use JPDB API to look up verbs by frequency rank
- Filter out words already in `data/moves.json`
- Filter out verbs that clearly aren't combat moves (e.g., いる "exist", ある "be")
- Include a manual skiplist for obvious non-combat verbs
- Output candidate objects with: word, reading, meanings, rank
- Target ~250 candidates

```js
// scripts/pull-move-candidates.mjs
// Pulls top Japanese verbs from JPDB, filters to combat-viable candidates
// Usage: node scripts/pull-move-candidates.mjs
```

Note: The exact JPDB API calls will depend on what endpoints are available. Check `src/jpdb.js` for the vocabulary search/lookup patterns. We may need to use the `/lookup` endpoint with a curated verb list, or iterate through frequency-ranked words.

**Step 3: Run and review**

Run: `node scripts/pull-move-candidates.mjs`
Expected: `data/move-candidates.json` with ~250 verb entries

**Step 4: Commit**

```bash
git add scripts/pull-move-candidates.mjs data/move-candidates.json
git commit -m "feat: pull JPDB verb candidates for move pool"
```

---

### Task 3: Write Opus move classification script

Feed each candidate verb to Opus. Opus assigns element, category, target, power tier, MP cost tier, and description. Flags non-combat verbs for removal.

**Files:**
- Create: `scripts/classify-moves.mjs`
- Create: `data/moves-classified.json`
- Read: `data/move-candidates.json`
- Read: `src/ai-providers.js` (for AI API patterns)

**Step 1: Study AI provider integration**

Read `src/ai-providers.js` to understand how to call Opus/Claude. Use the existing abstraction.

**Step 2: Write the classification script**

The script should:
- Load candidates from `data/move-candidates.json`
- For each verb, send a prompt to Opus asking it to classify as a game move
- Opus prompt includes: the game's element system, move categories, tier definitions, and examples from existing moves
- Opus returns: element, category, target, powerTier (1-4), mpCostTier (1-4), description, or "SKIP" if the verb doesn't work as a combat move
- Save results to `data/moves-classified.json`
- Rate-limit to avoid API throttling
- Support resuming (skip already-classified entries)

**CRITICAL**: The prompt to Opus must instruct it to use dictionary-accurate translations from the JPDB meanings array. No embellishment.

**Step 3: Run and review**

Run: `node scripts/classify-moves.mjs`
Expected: `data/moves-classified.json` with ~150-200 classified moves (some candidates will be SKIPped)

**Step 4: Commit**

```bash
git add scripts/classify-moves.mjs data/moves-classified.json
git commit -m "feat: classify verb candidates into game moves via Opus"
```

---

### Task 4: Write balance pass script

Convert tier numbers to concrete power/mpCost values. Ensure good distribution across elements and categories.

**Files:**
- Create: `scripts/balance-moves.mjs`
- Modify: `data/moves.json` (merge classified moves into the seeded pool)
- Read: `data/moves-classified.json`

**Step 1: Define the balance table**

```js
const BALANCE = {
  power: { 1: [15, 30], 2: [35, 55], 3: [60, 85], 4: [90, 130] },
  mpCost: { 1: [8, 15], 2: [18, 30], 3: [35, 55], 4: [60, 90] }
};
```

**Step 2: Write the balance script**

The script should:
- Load classified moves and existing seeded moves
- Assign concrete power and mpCost from balance table ranges (pick a value within the range)
- Deduplicate by word (in case a candidate duplicates a seed)
- Print distribution stats: count per element, category, tier
- Flag imbalances (e.g., <5 heal moves, <10 fire moves)
- Output final merged `data/moves.json`
- Trim to exactly 150 moves if we have more

**Step 3: Run and verify distribution**

Run: `node scripts/balance-moves.mjs`
Expected: Updated `data/moves.json` with ~150 balanced moves. Console output shows distribution stats.

**Step 4: Commit**

```bash
git add scripts/balance-moves.mjs data/moves.json
git commit -m "feat: balance move pool — 150 moves with stat distribution"
```

---

### Task 5: Assign creature learnsets

Use Opus to assign 4-6 moves from the pool to each creature based on element + archetype + thematic fit.

**Files:**
- Create: `scripts/assign-learnsets.mjs`
- Read: `data/moves.json`
- Read: `data/creatures.json`
- Output: `data/creature-learnsets.json` (separate file for review before merging)

**Step 1: Write the learnset assignment script**

The script should:
- Load all 150 moves and all creatures
- For each creature, send a prompt to Opus with: creature name, element, archetype, description, and the full move list
- Opus selects 4-6 moves that fit thematically, assigns learn levels (1, 3, 7, 12, 18, 25 roughly)
- First move must be a basic damage move at level 1
- At least one move should match the creature's element (for STAB)
- Mix of damage + utility appropriate to archetype
- Output `data/creature-learnsets.json` for human review

**Step 2: Run and review**

Run: `node scripts/assign-learnsets.mjs`
Expected: `data/creature-learnsets.json` with a learnset per creature

**Step 3: Commit**

```bash
git add scripts/assign-learnsets.mjs data/creature-learnsets.json
git commit -m "feat: assign creature learnsets via Opus"
```

---

## Phase 2: Update Creature Data Model

### Task 6: Add baseMp and learnset to creatures.json

Merge the reviewed learnsets into `data/creatures.json`. Add `baseMp` based on archetype. Remove `autoSkill` and `ultimate` fields.

**Files:**
- Create: `scripts/migrate-creature-schema.mjs`
- Modify: `data/creatures.json`

**Step 1: Write the migration script**

```js
// scripts/migrate-creature-schema.mjs
// Adds baseMp, learnset to creatures. Removes autoSkill, ultimate.
import { readFileSync, writeFileSync } from 'fs';

const MP_BY_ARCHETYPE = {
  'Fighter': 60,
  'Tank/Healer': 80,
  'Trickster': 90,
  'Mage': 120
};

const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf-8'));
const learnsets = JSON.parse(readFileSync('data/creature-learnsets.json', 'utf-8'));

for (const c of creatures) {
  c.baseMp = MP_BY_ARCHETYPE[c.archetype] || 80;
  c.learnset = learnsets[c.id] || [];
  delete c.autoSkill;
  delete c.ultimate;
}

writeFileSync('data/creatures.json', JSON.stringify(creatures, null, 2));
console.log(`Migrated ${creatures.length} creatures`);
```

**Step 2: Run the migration**

Run: `node scripts/migrate-creature-schema.mjs`
Expected: `data/creatures.json` updated — each creature now has `baseMp` and `learnset`, no more `autoSkill`/`ultimate`

**Step 3: Verify a few creatures**

Spot-check 3-4 creatures in `data/creatures.json`. Confirm baseMp matches archetype, learnset has 4-6 entries with level 1 first.

**Step 4: Commit**

```bash
git add scripts/migrate-creature-schema.mjs data/creatures.json
git commit -m "feat: migrate creatures to learnset + baseMp schema"
```

---

### Task 7: Update instantiateRobot for moves and MP

Modify `src/game/robots.js` to create robot instances with `mp`, `maxMp`, and `moves[]` instead of `autoSkill`/`ultimate`/`charges`.

**Files:**
- Modify: `src/game/robots.js:50-82` (`instantiateRobot`)
- Modify: `src/game/robots.js:83-89` (`getStatsForLevel`)
- Test: `tests/unit/robots.test.js` (if exists — check first)

**Step 1: Write failing test for new instantiateRobot**

Create or update test:
```js
// Test that instantiateRobot produces a robot with moves and MP
test('instantiateRobot creates robot with moves and MP', () => {
  const robot = instantiateRobot('kamedor');
  expect(robot.maxMp).toBeGreaterThan(0);
  expect(robot.mp).toBe(robot.maxMp);
  expect(robot.moves).toBeInstanceOf(Array);
  expect(robot.moves.length).toBeGreaterThanOrEqual(1);
  expect(robot.moves[0]).toHaveProperty('id');
  expect(robot.moves[0]).toHaveProperty('power');
  expect(robot.moves[0]).toHaveProperty('mpCost');
  expect(robot).not.toHaveProperty('autoSkill');
  expect(robot).not.toHaveProperty('ultimate');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "instantiateRobot creates robot with moves"`
Expected: FAIL

**Step 3: Update instantiateRobot**

In `src/game/robots.js:50`, modify `instantiateRobot(templateId)`:
- Load `data/moves.json` (cache it on first load)
- Look up creature's `learnset` from template
- Initialize `moves[]` with all moves at or below level 1
- Add `mp` and `maxMp` from `baseMp` * rarity multiplier
- Remove `autoSkill` and `ultimate` from the instance

**Step 4: Update getStatsForLevel**

In `src/game/robots.js:83`, add `maxMp` to the return value:
```js
function getStatsForLevel(baseHp, baseAttack, baseMp, level) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult),
    maxMp: Math.floor(baseMp * mult)
  };
}
```

**Step 5: Run test to verify it passes**

Run: `npm run test:unit -- --grep "instantiateRobot creates robot with moves"`
Expected: PASS

**Step 6: Update addXpToRobot for move learning**

In `src/game/robots.js:91` (`addXpToRobot`), after a level-up, check if the creature's learnset has a new move at this level. If so, add it to `robot.moves` (up to 3) or flag it as `pendingMoveLearn` for the UI to handle replacement.

**Step 7: Commit**

```bash
git add src/game/robots.js tests/unit/robots.test.js
git commit -m "feat: instantiateRobot produces robots with moves + MP"
```

---

## Phase 3: Rewrite Combat Backend

### Task 8: Add move execution to robot-combat-service

Replace `processAttackTurn` (all robots use autoSkill) with `processMoveTurn` (each robot uses a specified move against a specified target).

**Files:**
- Modify: `src/game/services/robot-combat-service.js:28-113` (`processAttackTurn` → `processMoveTurn`)
- Modify: `src/game/combat/effects.js` (no changes expected, existing effects work as-is)
- Test: Unit test for processMoveTurn

**Step 1: Write failing test for processMoveTurn**

```js
test('processMoveTurn executes each robot move against chosen target', () => {
  const allies = [makeRobot({ moves: [{ id: 'bite', power: 30, mpCost: 10, element: 'neutral', category: 'damage', target: 'single_enemy' }], mp: 100 })];
  const enemies = [makeEnemyRobot()];
  const moveChoices = [{ robotIndex: 0, moveId: 'bite', targetIndex: 0 }];

  const result = processMoveTurn(allies, enemies, moveChoices, {}, allies);

  expect(result.attacks.length).toBe(1);
  expect(result.attacks[0].moveId).toBe('bite');
  expect(allies[0].mp).toBe(90); // 100 - 10
  expect(enemies[0].hp).toBeLessThan(enemies[0].maxHp);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "processMoveTurn"`
Expected: FAIL

**Step 3: Implement processMoveTurn**

Replace `processAttackTurn` in `src/game/services/robot-combat-service.js:28`:

```js
function processMoveTurn(allies, enemies, moveChoices, itemBuffs, robotParty) {
  const attacks = [];
  const xpEvents = [];

  for (const choice of moveChoices) {
    const robot = allies[choice.robotIndex];
    if (!robot || robot.hp <= 0) continue;
    if (isIncapacitated(robot)) continue;

    const move = robot.moves.find(m => m.id === choice.moveId);
    if (!move || robot.mp < move.mpCost) continue;

    // Deduct MP
    robot.mp -= move.mpCost;

    // Execute based on category
    if (move.category === 'damage' || move.category === 'drain') {
      const targets = move.target === 'all_enemies'
        ? enemies.filter(e => e.hp > 0)
        : [enemies[choice.targetIndex]].filter(e => e && e.hp > 0);

      for (const target of targets) {
        const elemMult = getElementMultiplier(move.element, target.element);
        const stabMult = (move.element === robot.element) ? 1.5 : 1.0;
        const atkMult = getAttackMultiplier(robot);
        const buffedAttack = (robot.attack + getFlatAttackBonus(robot)) * atkMult;
        const variance = rollVariance();
        const damage = calculateRobotDamage(buffedAttack, move.power, elemMult * stabMult, variance);

        const reduction = getDamageReduction(target);
        const finalDamage = Math.max(1, Math.floor(damage * (1 - reduction / 100)));
        target.hp = Math.max(0, target.hp - finalDamage);
        breakSleep(target);

        attacks.push({
          attackerIndex: choice.robotIndex,
          attackerName: robot.nameEn,
          moveId: move.id,
          moveName: move.name,
          moveNameEn: move.nameEn,
          targetIndex: choice.targetIndex,
          targetName: target.nameEn,
          damage: finalDamage,
          element: move.element,
          stab: move.element === robot.element
        });

        if (move.category === 'drain') {
          const healAmount = Math.floor(finalDamage * 0.5);
          robot.hp = Math.min(robot.maxHp, robot.hp + healAmount);
        }

        if (target.hp <= 0) {
          const xpResult = awardKillXp(robotParty, target.level);
          if (xpResult) xpEvents.push(xpResult);
        }
      }
    } else if (move.category === 'heal') {
      // Heal logic — target allies
      // ...
    } else if (move.category === 'buff' || move.category === 'shield') {
      // Apply buff/shield to self or allies
      // ...
    } else if (move.category === 'debuff') {
      // Apply status to enemies
      // ...
    }

    // Handle haste (double action)
    if (hasHaste(robot)) {
      consumeHaste(robot);
      // Could allow a second move or just bonus attack
    }
  }

  // MP regen for all alive allies
  for (const ally of allies) {
    if (ally.hp > 0) {
      ally.mp = Math.min(ally.maxMp, ally.mp + Math.floor(ally.maxMp * 0.12));
    }
  }

  const allEnemiesDefeated = enemies.every(e => e.hp <= 0);
  return { attacks, allEnemiesDefeated, xpEvents };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --grep "processMoveTurn"`
Expected: PASS

**Step 5: Write tests for heal, buff, debuff categories**

Add tests for each move category to ensure status effects, heals, and buffs work.

**Step 6: Keep processEnemyTurn mostly as-is**

Enemy robots still auto-attack using their first move (enemies don't pick moves). Modify `processEnemyTurn` (line 132) to use `enemy.moves[0]` instead of `enemy.autoSkill`.

**Step 7: Remove processUltimate**

Delete `processUltimate` and its sub-functions (lines 271-567). Ultimates are now just high-cost moves in the shared pool — no special charge system.

**Step 8: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/
git commit -m "feat: replace processAttackTurn with move-based processMoveTurn"
```

---

### Task 9: Update GameManager combat cycle

Change `robotCombatCycle` in `src/game/loop.js` to accept move choices instead of a simple action type.

**Files:**
- Modify: `src/game/loop.js:734-1047` (`robotCombatCycle`, `_handleRobotAttackTurn`, `useRobotUltimate`)

**Step 1: Update robotCombatCycle signature**

In `src/game/loop.js:734`, change from:
```js
robotCombatCycle(actionType) // 'attack' | 'defend' | 'befriend'
```
To:
```js
robotCombatCycle(moveChoices) // [{ robotIndex, moveId, targetIndex }]
```

A "defend" turn is signaled by passing an empty `moveChoices` array (or a special defend flag). Befriend remains a separate action.

**Step 2: Update _handleRobotAttackTurn**

In `src/game/loop.js:760`, pass `moveChoices` through to `processMoveTurn` instead of calling `processAttackTurn`.

**Step 3: Remove useRobotUltimate**

Delete `useRobotUltimate` (line 1048) — ultimates are now regular moves in the move grid.

**Step 4: Update defend handling**

`_handleRobotDefendTurn` (line 868) stays mostly the same — when the player chooses defend, all robots skip their turn and MP still regenerates. Enemy turn proceeds at half damage.

**Step 5: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: update GameManager combat cycle for move choices"
```

---

### Task 10: Update combat API endpoints

Modify the `/robot-combat-cycle` endpoint to accept move choices. Remove the `/use-robot-ultimate` endpoint.

**Files:**
- Modify: `src/routes/game/combat.js:101-125`

**Step 1: Update /robot-combat-cycle**

At line 101, change the request body from `{ actionType }` to:
```js
// Attack: { actionType: 'attack', moveChoices: [{ robotIndex, moveId, targetIndex }] }
// Defend: { actionType: 'defend' }
// Befriend: { actionType: 'befriend', targetEnemyIndex }
```

**Step 2: Remove /use-robot-ultimate endpoint**

Delete lines 114-125 (the `/use-robot-ultimate` route).

**Step 3: Add /learn-move endpoint**

New endpoint for when a creature levels up and learns a new move:
```js
// POST /api/game/learn-move
// Body: { robotIndex, newMoveId, replaceIndex? }
// If replaceIndex is provided, replaces that move slot. Otherwise adds to an empty slot.
```

**Step 4: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "feat: update combat API for move selection, add learn-move endpoint"
```

---

## Phase 4: Rebuild Combat UI

### Task 11: Build move selection grid component

Replace the flashcard action area with a 2x2 move grid (3 moves + items button).

**Files:**
- Create: `public/js/ui/move-select.js`
- Modify: `public/js/ui/index.js` (add export)

**Step 1: Create the move selection module**

```js
// public/js/ui/move-select.js
// Renders a 2x2 grid of the active creature's moves + items button
// Calls back with { moveId } when a move is selected
// Calls back with 'items' when items button is tapped

export function init({ onMoveSelect, onItemSelect }) { ... }
export function showMoves(robot) { ... }  // Show the 2x2 grid for a robot
export function clear() { ... }
```

The grid shows for each move:
- Element icon (small, top-left corner)
- Japanese name with furigana (large, center)
- English name (smaller, below)
- Power and MP cost (bottom row)
- Greyed out + locked appearance if insufficient MP

**Step 2: Style the move grid**

Add CSS to `public/game.css` for `.move-grid`, `.move-cell`, `.move-cell--disabled`, element color accents.

**Step 3: Export from index**

Add to `public/js/ui/index.js`:
```js
export * as moveSelect from './move-select.js';
```

**Step 4: Commit**

```bash
git add public/js/ui/move-select.js public/js/ui/index.js public/game.css
git commit -m "feat: add move selection grid UI component"
```

---

### Task 12: Build target selection list component

Vertical list of enemies (or allies for heal moves) shown after selecting a move.

**Files:**
- Create: `public/js/ui/target-select.js`
- Modify: `public/js/ui/index.js` (add export)

**Step 1: Create the target selection module**

```js
// public/js/ui/target-select.js
// Shows a vertical list of targetable enemies (or allies for heals)
// Each row: sprite icon, Japanese name, base word/meaning, HP bar
// Calls back with { targetIndex } when a target is tapped

export function init({ onTargetSelect, onCancel }) { ... }
export function showEnemies(enemies) { ... }   // For damage/debuff moves
export function showAllies(allies) { ... }     // For heal/buff moves
export function clear() { ... }
```

**Step 2: Style the target list**

Add CSS for `.target-list`, `.target-row`, HP bar within rows.

**Step 3: Export from index**

Add to `public/js/ui/index.js`:
```js
export * as targetSelect from './target-select.js';
```

**Step 4: Commit**

```bash
git add public/js/ui/target-select.js public/js/ui/index.js public/game.css
git commit -m "feat: add target selection list UI component"
```

---

### Task 13: Update robot-row for MP bar

Replace the charge bar with an MP bar. Remove the ultimate popup button.

**Files:**
- Modify: `public/js/ui/robot-row.js:74-136` (render function)
- Modify: `public/js/ui/robot-row.js:137` (remove `buildChargeSegments`)
- Modify: `public/js/ui/robot-row.js:155-258` (popup — remove ultimate button, show move list instead)

**Step 1: Replace charge bar with MP bar in render()**

At line 109, replace:
```js
<div class="robot-charge-bar">
  ${buildChargeSegments(robot.ultimate.charges, robot.ultimate.chargesRequired)}
</div>
```
With:
```js
<div class="robot-mp-bar">
  <div class="robot-mp-fill" style="width:${(robot.mp / robot.maxMp) * 100}%"></div>
  <span class="robot-mp-text">${robot.mp}/${robot.maxMp} MP</span>
</div>
```

**Step 2: Update popup to show moves instead of ultimate**

In `showPopup` (line 155), replace the ultimate section with a list of the robot's current moves (name, element, power, mpCost).

**Step 3: Remove buildChargeSegments**

Delete the function at line 137 and its CSS.

**Step 4: Remove useUltimateCallback**

Update `init()` (line 51) to remove `useUltimateCallback`. It's no longer needed.

**Step 5: Add CSS for MP bar**

Style `.robot-mp-bar`, `.robot-mp-fill` (blue/purple gradient), `.robot-mp-text`.

**Step 6: Commit**

```bash
git add public/js/ui/robot-row.js public/game.css
git commit -m "feat: replace charge bar with MP bar in robot row"
```

---

### Task 14: Rewire combat-loop for move-based flow

The biggest UI change. Replace the vocab-card combat flow with: for each creature, show move grid → show target list → collect all choices → send to server → animate results.

**Files:**
- Modify: `public/js/ui/combat-loop.js` (major rewrite of combat flow)
- Modify: `public/js/game.js:1137-1248` (rewire action callbacks)

**Step 1: Replace pauseForNextVocab with startMoveSelection**

In `combat-loop.js`, replace `pauseForNextVocab()` (line 345) and `showNextDualCardsFromQueue()` (line 350) with:
```js
function startMoveSelection() {
  // Show move grid for robot 0, collect choice
  // Then show for robot 1, robot 2
  // Collect all moveChoices, then execute
}
```

**Step 2: Implement per-creature move selection flow**

```js
let moveChoices = [];
let currentRobotIndex = 0;

function startMoveSelection() {
  moveChoices = [];
  currentRobotIndex = 0;
  promptNextRobot();
}

function promptNextRobot() {
  const allies = getState().combat.allies;
  // Skip KO'd robots
  while (currentRobotIndex < allies.length && allies[currentRobotIndex].hp <= 0) {
    currentRobotIndex++;
  }
  if (currentRobotIndex >= allies.length) {
    // All robots have chosen — execute the turn
    executeMovesTurn(moveChoices);
    return;
  }
  // Highlight current robot in robot-row
  // Show their move grid in action area
  moveSelect.showMoves(allies[currentRobotIndex]);
}

function onMoveSelected(moveId) {
  const move = /* look up move */;
  if (move.target === 'single_enemy') {
    targetSelect.showEnemies(getState().combat.enemies);
  } else if (move.target === 'single_ally') {
    targetSelect.showAllies(getState().combat.allies);
  } else {
    // AoE or self — no target needed
    moveChoices.push({ robotIndex: currentRobotIndex, moveId, targetIndex: -1 });
    currentRobotIndex++;
    promptNextRobot();
  }
}

function onTargetSelected(targetIndex) {
  moveChoices.push({ robotIndex: currentRobotIndex, moveId: pendingMoveId, targetIndex });
  currentRobotIndex++;
  promptNextRobot();
}
```

**Step 3: Replace executeRobotPlayerAttack**

`executeRobotPlayerAttack()` (line 920) becomes `executeMovesTurn(moveChoices)`:
- Calls `POST /api/game/robot-combat-cycle` with `{ actionType: 'attack', moveChoices }`
- Server returns attack results
- Animate each attack sequentially (reuse existing split-attack-card animation)
- Then enemy phase
- Then `startMoveSelection()` for next turn

**Step 4: Handle defend**

Add a "Defend" option to the move grid (or a dedicated button). When chosen for any robot, that robot skips and gets a defense buff. If ALL robots defend, it's a full defend turn (half enemy damage).

**Step 5: Handle befriend**

Befriend becomes accessible as a button alongside the move grid when conditions are met (enemy at ≤50% HP). Same befriend flow as today, just triggered differently.

**Step 6: Remove flashcard-related code**

Remove/disable: `pauseForNextVocab`, `showNextDualCardsFromQueue`, `resumeCombatAfterVocab`, all flashcard swipe handling in combat context.

**Step 7: Rewire game.js callbacks**

In `public/js/game.js:1137-1248`:
- Remove `cardSwipe` and `dualCardSelect` combat callbacks
- Add `moveSelect.init({ onMoveSelect, onItemSelect })`
- Add `targetSelect.init({ onTargetSelect, onCancel })`
- Remove `useUltimateCallback` from `robotRow.init()`

**Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/game.js
git commit -m "feat: rewire combat loop for Pokemon-style move selection"
```

---

### Task 15: Handle move learning on level-up

When a creature levels up mid-combat or post-combat and learns a new move, show a UI prompt to either add it (if <3 moves) or replace an existing move.

**Files:**
- Create: `public/js/ui/move-learn.js`
- Modify: `public/js/ui/combat-loop.js` (hook into XP/level-up flow)
- Modify: `public/js/game.js` (wire the new UI)

**Step 1: Create move-learn UI module**

```js
// public/js/ui/move-learn.js
// Shows when a creature levels up and learns a new move
// Displays: creature name, new move details, current moves
// Player chooses: add (if slot open), replace (tap existing move), or skip

export function init({ onLearnMove, onSkipMove }) { ... }
export function showLearnPrompt(robot, newMove) { ... }
export function clear() { ... }
```

**Step 2: Hook into level-up flow**

After XP awards, if `addXpToRobot` returns a `pendingMoveLearn`, pause combat and show the learn prompt. After player decides, resume.

**Step 3: Wire to game.js**

Add `moveLearn.init(...)` in game.js initialization.

**Step 4: Commit**

```bash
git add public/js/ui/move-learn.js public/js/ui/combat-loop.js public/js/game.js public/js/ui/index.js
git commit -m "feat: add move learning UI on creature level-up"
```

---

### Task 16: Update attack animation cards for moves

The existing split-attack-card (`combat-loop.js:87-133`) shows autoSkill info. Update it to show the selected move's name, element, and power.

**Files:**
- Modify: `public/js/ui/combat-loop.js:87-133` (`buildSplitAttackCard`)

**Step 1: Update buildSplitAttackCard**

The function already takes an attack object. Update it to read `moveId`, `moveName`, `moveNameEn`, `element`, `stab` from the new attack result format (as returned by `processMoveTurn`).

**Step 2: Add STAB visual indicator**

When `stab: true`, add a visual indicator (glow, "STAB!" text, or element-colored border) to the attack card.

**Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.css
git commit -m "feat: update attack cards for move names + STAB indicator"
```

---

### Task 17: End-to-end integration test

Manual playtest through the full combat flow using Playwright MCP.

**Files:**
- No new files — manual testing

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Playtest flow**

Following `docs/playtest-guide.md`:
1. Start a run, enter an encounter
2. Verify move grid appears for first creature (3 moves or fewer + items)
3. Select a move → verify target list appears (vertical)
4. Select a target → verify move executes with animation
5. Verify MP decreases after move use
6. Verify MP regenerates each turn
7. Verify greyed-out moves when insufficient MP
8. Verify enemy attacks work
9. Test defend action
10. Test healing/buff moves targeting allies
11. Win combat, verify level-up move learning prompt (if applicable)

**Step 3: Fix any issues found**

**Step 4: Commit any fixes**

```bash
git commit -m "fix: post-playtest fixes for move combat system"
```
