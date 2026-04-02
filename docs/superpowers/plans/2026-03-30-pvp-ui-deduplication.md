# PvP UI Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hand-rolled combat UI in pvp-battle.js by reusing existing shared components (target-select, attack cards, escapeHtml).

**Architecture:** Export private functions from combat-loop.js, import target-select.js in PvP, extract escapeHtml to a shared utility. Also fix a server bug where attack data is sent under the wrong field name.

**Tech Stack:** Vanilla ES6 modules, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-30-pvp-ui-deduplication-design.md`

---

### Task 1: Extract `escapeHtml` to shared utility

**Files:**
- Create: `public/js/ui/html-utils.js`
- Modify: `public/js/ui/pvp-battle.js`
- Modify: `public/js/ui/pvp-lobby.js`
- Modify: `public/js/ui/actions.js`
- Modify: `public/js/ui/speed-review.js`
- Modify: `public/js/ui/lookup.js`
- Modify: `public/game.js`

- [ ] **Step 1: Create the shared utility**

Create `public/js/ui/html-utils.js`:

```js
/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
```

- [ ] **Step 2: Replace in pvp-battle.js**

Add import at top:
```js
import { escapeHtml } from './html-utils.js';
```

Delete the local `escapeHtml` function (lines 538-542):
```js
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
```

- [ ] **Step 3: Replace in pvp-lobby.js**

Add import at top:
```js
import { escapeHtml } from './html-utils.js';
```

Delete the local `escapeHtml` function (lines 289-293):
```js
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **Step 4: Replace in actions.js**

Add import at top:
```js
import { escapeHtml } from './html-utils.js';
```

Delete the local `escapeHtml` function (around line 272).

- [ ] **Step 5: Replace in speed-review.js**

Add import at top:
```js
import { escapeHtml } from './html-utils.js';
```

Delete the local `escapeHtml` function (around line 815).

- [ ] **Step 6: Replace in lookup.js**

Add import at top:
```js
import { escapeHtml } from './html-utils.js';
```

Delete the local `escapeHtml` function (around line 389).

- [ ] **Step 7: Replace in game.js**

Add import at top:
```js
import { escapeHtml } from './js/ui/html-utils.js';
```

Delete the local `escapeHtml` function (around line 207).

- [ ] **Step 8: Syntax check all modified files**

Run:
```bash
node --check public/js/ui/html-utils.js && \
node --check public/js/ui/pvp-battle.js && \
node --check public/js/ui/pvp-lobby.js && \
node --check public/js/ui/actions.js && \
node --check public/js/ui/speed-review.js && \
node --check public/js/ui/lookup.js && \
node --check public/game.js && \
echo "OK"
```

Expected: `OK`

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/html-utils.js public/js/ui/pvp-battle.js public/js/ui/pvp-lobby.js public/js/ui/actions.js public/js/ui/speed-review.js public/js/ui/lookup.js public/game.js
git commit -m "refactor: extract escapeHtml to shared html-utils module"
```

---

### Task 2: Replace PvP target selection with `target-select.js`

**Files:**
- Modify: `public/js/ui/pvp-battle.js`

**Context:** `target-select.js` exports `init({ onTargetSelectCb, onCancelCb })`, `showEnemies(enemies, move)`, `showAllies(allies, move)`. PvE stores `pendingMove` and `currentCreatureIndex` in module state so the callback can reference them. PvP will use the same pattern.

- [ ] **Step 1: Add imports and module state**

Add to the imports section of `pvp-battle.js`:
```js
import { init as initTargetSelect, showEnemies as showEnemyTargets, showAllies as showAllyTargets } from './target-select.js';
```

Add after the `let pvpState = null;` line:
```js
// Pending move state for target selection callbacks
let pendingMove = null;
let pendingCreatureIndex = null;
```

- [ ] **Step 2: Initialize target-select in startPvpBattle**

Add at the beginning of `startPvpBattle(data)`, before creating `pvpState`:
```js
  // Initialize shared target-select with PvP callbacks
  initTargetSelect({
    onTargetSelectCb: (targetIndex) => {
      addMoveChoice(pendingCreatureIndex, pendingMove.id, targetIndex);
      pendingMove = null;
      pendingCreatureIndex = null;
    },
    onCancelCb: () => {
      pendingMove = null;
      pendingCreatureIndex = null;
      showMoveSelection();
    }
  });
```

- [ ] **Step 3: Replace handleMoveSelected to use shared target-select**

Replace the entire `handleMoveSelected` function with:

```js
function handleMoveSelected(creature, creatureIndex, move) {
  const targetType = move.target || 'single_enemy';

  if (targetType === 'single_enemy') {
    pendingMove = move;
    pendingCreatureIndex = creatureIndex;
    showEnemyTargets(pvpState.enemies, move);
  } else if (targetType === 'single_ally' || targetType === 'self') {
    if (targetType === 'self') {
      addMoveChoice(creatureIndex, move.id, creatureIndex);
    } else {
      pendingMove = move;
      pendingCreatureIndex = creatureIndex;
      showAllyTargets(pvpState.allies, move);
    }
  } else {
    // all_enemies, all_allies — no target selection needed
    addMoveChoice(creatureIndex, move.id, 0);
  }
}
```

- [ ] **Step 4: Delete the old hand-rolled functions**

Delete `showTargetSelection(creatureIndex, move)` (the entire function — roughly lines 212-255).

Delete `showAllyTargetSelection(creatureIndex, move)` (the entire function — roughly lines 261-304).

- [ ] **Step 5: Syntax check**

Run:
```bash
node --check public/js/ui/pvp-battle.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/pvp-battle.js
git commit -m "refactor: use shared target-select in PvP instead of hand-rolled buttons"
```

---

### Task 3: Fix server bug — send `attacks` field in round result

**Files:**
- Modify: `src/pvp/socket-handler.js`

**Context:** `resolveRound()` returns `{ attacks, ... }` but the socket handler sends `actions: result.actions` (undefined). The client tries `result.actions?.attacks || result.attacks || []` — both are undefined, so attack cards never display.

- [ ] **Step 1: Fix the field name in socket-handler.js**

In `src/pvp/socket-handler.js`, find the two `pvp:round-result` emissions (around lines 156-168). Change `actions: result.actions` to `attacks: result.attacks` in both:

```js
      if (p1Socket) {
        p1Socket.emit('pvp:round-result', {
          allies: result.sideA,
          enemies: result.sideB,
          attacks: result.attacks,
          winner: result.winner
        });
      }
      if (p2Socket) {
        p2Socket.emit('pvp:round-result', {
          allies: result.sideB,
          enemies: result.sideA,
          attacks: result.attacks,
          winner: result.winner
        });
      }
```

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check src/pvp/socket-handler.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/pvp/socket-handler.js
git commit -m "fix: send attacks field (not undefined actions) in PvP round result"
```

---

### Task 4: Replace PvP attack summary with shared `insertAttackCard`

**Files:**
- Modify: `public/js/ui/combat-loop.js` (export `insertAttackCard`)
- Modify: `public/js/ui/pvp-battle.js` (replace `showAttackSummary`)

**Context:** `insertAttackCard(atk, isEnemy)` renders a full split attack card with sprites, bilingual text, staggered row animation, and TTS audio. PvP attacks include a `.side` field (`'sideA'` or `'sideB'`); from each player's perspective, their side is always sideA.

- [ ] **Step 1: Export insertAttackCard from combat-loop.js**

Change line 171 in `combat-loop.js` from:
```js
function insertAttackCard(atk, isEnemy) {
```
to:
```js
export function insertAttackCard(atk, isEnemy) {
```

- [ ] **Step 2: Import in pvp-battle.js**

Add to imports:
```js
import { insertAttackCard } from './combat-loop.js';
```

- [ ] **Step 3: Replace showAttackSummary**

Replace the entire `showAttackSummary` function with:

```js
async function showAttackSummary(attacks) {
  for (const atk of attacks) {
    // From this player's perspective, sideA is always "us"
    const isEnemy = (atk.side !== 'sideA');
    insertAttackCard(atk, isEnemy);

    // Update formations after each attack for visual feedback
    if (sceneModule?.showFormation) {
      sceneModule.showFormation('player', pvpState.allies);
      sceneModule.showFormation('enemy', pvpState.enemies);
    }

    await delay(800);
  }
}
```

- [ ] **Step 4: Update handleRoundResult to use new field name**

In `handleRoundResult`, change:
```js
  const attacks = result.actions?.attacks || result.attacks || [];
```
to:
```js
  const attacks = result.attacks || [];
```

- [ ] **Step 5: Syntax check both files**

Run:
```bash
node --check public/js/ui/combat-loop.js && node --check public/js/ui/pvp-battle.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/ui/pvp-battle.js
git commit -m "refactor: use shared insertAttackCard in PvP instead of hand-rolled summary"
```

---

### Task 5: Clean up unused imports and verify

**Files:**
- Modify: `public/js/ui/pvp-battle.js`

- [ ] **Step 1: Remove unused import**

`renderJpFirst` was used by the old `showAttackSummary` and target selection. Check if it's still used elsewhere in pvp-battle.js. If not, remove from imports:
```js
import { renderJpFirst } from './bootstrap-client.js';
```

Similarly check if `toRomaji` is still used (it's used in `showMoveSelection` for creature name display, so likely stays).

- [ ] **Step 2: Remove the delay utility if duplicated**

Check if `delay()` at the bottom of pvp-battle.js is still needed (it is — used in `showAttackSummary`). Keep it.

- [ ] **Step 3: Run full syntax check**

Run:
```bash
node --check public/js/ui/pvp-battle.js && \
node --check public/js/ui/pvp-lobby.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/html-utils.js && \
node --check public/js/ui/actions.js && \
node --check public/js/ui/speed-review.js && \
node --check public/js/ui/lookup.js && \
node --check public/game.js && \
echo "ALL OK"
```

Expected: `ALL OK`

- [ ] **Step 4: Run tests**

Run:
```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "refactor: clean up unused imports after PvP UI deduplication"
```
