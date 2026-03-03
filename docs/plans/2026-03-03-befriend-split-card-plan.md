# Befriend Split-Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore creature befriending in the move-based combat UI by splitting the item card to show a はなす (Talk) button, gated by an RNG acceptance check that scales with enemy rarity and HP.

**Architecture:** The item cell in the 2x2 move grid splits into a flex container with befriend + items halves when eligible. A new `rollTalkAcceptance()` function handles server-side RNG. A new `/befriend-talk` route gates the existing `/befriend-conversation` flow.

**Tech Stack:** Vanilla JS (ES modules), Express routes, Node test runner

**Design doc:** `docs/plans/2026-03-03-befriend-split-card-design.md`

---

### Task 1: Add `rollTalkAcceptance` to creature-combat-service

**Files:**
- Modify: `src/game/services/creature-combat-service.js` (add after line 562)
- Test: `tests/unit/combat/creature-combat-service.test.js`

**Step 1: Write failing tests**

Add to the end of `tests/unit/combat/creature-combat-service.test.js`:

```js
import {
  processMoveTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  awardBattleXp,
  awardKillXp,
  tickAllEffects,
  rollTalkAcceptance
} from '../../../src/game/services/creature-combat-service.js';

// ... (existing tests above) ...

describe('rollTalkAcceptance', () => {
  it('returns accepted boolean and computed chance', () => {
    const enemy = instantiateCreature('hikaribon'); // common
    enemy.hp = Math.floor(enemy.maxHp * 0.3); // 30% HP → 26-50% bracket
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(typeof result.accepted, 'boolean');
    assert.strictEqual(typeof result.chance, 'number');
    assert.strictEqual(result.chance, 80); // common base=80, hpBonus=0
  });

  it('gives higher chance at lower HP', () => {
    const enemy = instantiateCreature('hikaribon'); // common
    enemy.hp = 1; // ~0% HP → 1-10% bracket
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 95); // common base=80 + 15 = 95 (capped)
  });

  it('gives lower chance for rarer creatures', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.rarity = 'legendary';
    enemy.hp = Math.floor(enemy.maxHp * 0.4); // 40% HP
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 20); // legendary base=20, hpBonus=0
  });

  it('applies mid-bracket HP bonus', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.rarity = 'rare';
    enemy.hp = Math.floor(enemy.maxHp * 0.2); // 20% → 11-25% bracket
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 60); // rare base=50 + 10 = 60
  });

  it('caps chance at 95', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.rarity = 'common';
    enemy.hp = 1; // critical HP
    const result = rollTalkAcceptance(enemy);
    assert.ok(result.chance <= 95);
  });

  it('defaults to common rarity if missing', () => {
    const enemy = instantiateCreature('hikaribon');
    delete enemy.rarity;
    enemy.hp = Math.floor(enemy.maxHp * 0.4);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 80); // common base
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern="rollTalkAcceptance"`
Expected: FAIL — `rollTalkAcceptance` is not exported

**Step 3: Implement `rollTalkAcceptance`**

Add to `src/game/services/creature-combat-service.js` after the `processBefriend` function (after line 562):

```js
const TALK_BASE_CHANCE = { common: 80, uncommon: 65, rare: 50, epic: 35, legendary: 20 };

export function rollTalkAcceptance(enemy) {
  const hpPct = Math.round((enemy.hp / enemy.maxHp) * 100);
  const hpBonus = hpPct <= 10 ? 15 : hpPct <= 25 ? 10 : 0;
  const base = TALK_BASE_CHANCE[enemy.rarity] ?? TALK_BASE_CHANCE.common;
  const chance = Math.min(95, base + hpBonus);
  const roll = Math.random() * 100;
  return { accepted: roll < chance, chance };
}
```

**Step 4: Update the import in the test file**

The import at the top of the test file needs `rollTalkAcceptance` added (shown in Step 1).

**Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="rollTalkAcceptance"`
Expected: PASS (all 6 tests)

**Step 6: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
git commit -m "feat: add rollTalkAcceptance RNG gate for befriend attempts"
```

---

### Task 2: Add `/befriend-talk` server route

**Files:**
- Modify: `src/routes/game/combat.js` (add route before `/befriend-conversation`, around line 216)
- Modify: `src/game/services/creature-combat-service.js` (import needed)

**Step 1: Write the route**

In `src/routes/game/combat.js`, add the import of `rollTalkAcceptance` at line 8:

```js
import { processEnemyTurn, handleCreatureKO, handleBefriendAnswer, rollTalkAcceptance } from '../../game/services/creature-combat-service.js';
```

Add the route before the existing `/befriend-conversation` route (before line 217):

```js
  // Roll talk acceptance before starting befriend conversation
  router.post('/befriend-talk', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.isCreatureCombat) {
      return res.status(400).json({ error: 'No active creature combat' });
    }
    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer creatures' });
    }

    const enemies = combat.enemies || [];
    const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
    if (alive.length !== 1) {
      return res.status(400).json({ error: 'Befriend requires exactly 1 enemy alive' });
    }

    const target = alive[0];
    if ((target.hp / target.maxHp) > 0.5) {
      return res.status(400).json({ error: 'Enemy HP must be ≤50%' });
    }

    const { accepted, chance } = rollTalkAcceptance(target);

    if (!accepted) {
      // Creature refuses — it attacks
      const enemyResult = processEnemyTurn(
        combat.enemies, combat.allies, false, gameManager.run?.itemBuffs
      );

      // Handle KO'd allies
      const koSwaps = [];
      for (let i = 0; i < combat.allies.length; i++) {
        if (combat.allies[i] && combat.allies[i].hp <= 0) {
          const replacement = handleCreatureKO(gameManager.run.creatureParty, i);
          if (replacement) {
            koSwaps.push({ slot: i, replacement: replacement.nameEn });
          }
        }
      }
      combat.allies = gameManager.run.creatureParty.active;

      const allAlliesKO = combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKO) {
        combat.active = false;
        gameManager.run.active = false;
      }

      req.saveGame();

      return res.json({
        accepted: false,
        chance,
        enemyAttacks: enemyResult.attacks || [],
        koSwaps,
        combatEnded: allAlliesKO,
        allies: combat.allies,
        enemies: combat.enemies
      });
    }

    // Accepted — client should follow up with /befriend-conversation
    req.saveGame();
    res.json({ accepted: true, chance });
  });
```

**Step 2: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add src/routes/game/combat.js src/game/services/creature-combat-service.js
git commit -m "feat: add /befriend-talk route with RNG acceptance gate"
```

---

### Task 3: Add split cell to move-select.js

**Files:**
- Modify: `public/js/ui/move-select.js`

**Step 1: Add `buildBefriendCell` and `buildSplitCell` functions**

Add after `buildItemsCell()` (after line 86):

```js
function buildBefriendCell(onBefriend) {
  const cell = document.createElement('div');
  cell.className = 'move-befriend-half';
  cell.innerHTML = `<span class="move-items-emoji">💬</span><span class="move-items-label">はなす</span>`;
  cell.addEventListener('click', () => {
    if (onBefriend) onBefriend();
  });
  return cell;
}

function buildSplitCell(onBefriend) {
  const wrap = document.createElement('div');
  wrap.className = 'move-split-cell';
  wrap.appendChild(buildBefriendCell(onBefriend));
  wrap.appendChild(buildItemsCell());
  return wrap;
}
```

**Step 2: Modify `showMoves` to accept options**

Change the `showMoves` export signature and the items cell logic:

Replace `export function showMoves(creature, creatureIndex) {` with:

```js
export function showMoves(creature, creatureIndex, opts = {}) {
```

Replace `grid.appendChild(buildItemsCell());` (line 108) with:

```js
  if (opts.befriendAvailable && opts.onBefriend) {
    grid.appendChild(buildSplitCell(opts.onBefriend));
  } else {
    grid.appendChild(buildItemsCell());
  }
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/move-select.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/move-select.js
git commit -m "feat: add split befriend/items cell to move grid"
```

---

### Task 4: Add CSS for split cell

**Files:**
- Modify: `public/game.css` (after `.move-items-label` around line 4495)

**Step 1: Add split cell styles**

Insert after line 4495 (after `.move-items-label { font-size: 28px; }`):

```css
/* Split cell: befriend + items side by side */
.move-split-cell {
  display: flex;
  gap: 4px;
  animation: moveCardIn 0.25s ease-out 0.18s both;
}

.move-split-cell .move-items-cell,
.move-befriend-half {
  background: var(--glass-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: 1.5px solid rgba(255,255,255,0.5);
  border-radius: var(--card-radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  box-shadow: var(--shadow-soft);
  transition: background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  flex: 1;
  min-width: 0;
}

.move-split-cell .move-items-cell {
  animation: none;
}

.move-befriend-half:active,
.move-split-cell .move-items-cell:active {
  background: var(--bg-card-hover);
  transform: scale(0.97);
}

.move-befriend-half .move-items-emoji { font-size: 28px; }
.move-befriend-half .move-items-label { font-size: 18px; }
.move-split-cell .move-items-cell .move-items-emoji { font-size: 28px; }
.move-split-cell .move-items-cell .move-items-label { font-size: 18px; }
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add split-cell CSS for befriend/items layout"
```

---

### Task 5: Wire befriend into combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

This is the main wiring task — connecting `promptNextCreature` → `showMoves` with the befriend flag, and handling the talk attempt + rejection flow.

**Step 1: Add `apiBefriendTalk` to the callback list**

At line 256, add after `apiSubmitBefriendAnswer`:
```js
let apiBefriendTalk = null;
```

In the `init()` function (around line 313), add:
```js
  apiBefriendTalk = callbacks.apiBefriendTalk;
```

**Step 2: Add `isBefriendAvailable()` helper**

Add a helper function near the befriend eligibility check (around line 476 area, but as a standalone reusable function). Place it before `promptNextCreature` (before line 351):

```js
function isBefriendAvailable() {
  const state = getGameState();
  if (!state.combat?.isCreatureCombat || state.combat?.npcId) return false;
  const enemies = state.combat.enemies || [];
  const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
  if (alive.length !== 1) return false;
  return (alive[0].hp / alive[0].maxHp) <= 0.5;
}
```

**Step 3: Modify `promptNextCreature` to pass befriend opts**

Replace line 369 (`showMoves(creature, currentCreatureIndex);`) with:

```js
  const befriendAvailable = isBefriendAvailable();
  showMoves(creature, currentCreatureIndex, {
    befriendAvailable,
    onBefriend: befriendAvailable ? handleBefriendTalk : undefined
  });
```

**Step 4: Add `handleBefriendTalk()` function**

Add after `isBefriendAvailable()`:

```js
async function handleBefriendTalk() {
  if (!combatActive) return;

  return withAnimationActive(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/game/befriend-talk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      });
      const result = await resp.json();

      if (!result.accepted) {
        // Creature refused — show rejection + enemy attack
        const state = getGameState();
        const enemies = state.combat?.enemies || [];
        const alive = enemies.filter(e => e.hp > 0);
        const creatureName = alive[0]?.nameEn || alive[0]?.name || 'Creature';

        await narration.showNarration(`${creatureName} refused to talk!`, { persistent: false });
        if (delay) await delay(600);

        // Apply enemy attacks from the response
        if (result.enemyAttacks?.length) {
          for (const atk of result.enemyAttacks) {
            if (atk.targetIndex >= 0 && animatePlayerHurt) {
              animatePlayerHurt(atk.targetIndex);
            }
            if (showDamageNumber && atk.targetIndex >= 0) {
              showDamageNumber(atk.damage, atk.targetIndex, 'player');
            }
          }
          if (delay) await delay(400);
        }

        // Update state with new HP values
        if (result.allies || result.enemies) {
          updateGameState({
            combat: {
              ...state.combat,
              allies: result.allies || state.combat.allies,
              enemies: result.enemies || state.combat.enemies
            }
          });
          updateUI();
          if (updateCreatureRowData) {
            const updated = getGameState();
            updateCreatureRowData(updated.run?.creatureParty, updated.combat);
          }
        }

        if (result.combatEnded) {
          combatActive = false;
          if (showGameOverModal) showGameOverModal();
          return;
        }

        // Resume move selection for next turn
        startMoveSelection();
        return;
      }

      // Accepted — launch the existing befriend conversation flow
      await executeBefriendAction();

    } catch (err) {
      console.error('[CombatLoop] Befriend talk error:', err);
      startMoveSelection();
    }
  });
}
```

**Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire befriend talk into combat loop with rejection handling"
```

---

### Task 6: Register `apiBefriendTalk` callback in game.js

**Files:**
- Modify: `public/js/game.js` (where combat-loop callbacks are registered)

**Step 1: Find where combat-loop.init() is called**

Search for `combatLoop.init(` in `public/js/game.js`. The callback object there needs a new entry.

**Step 2: Add the callback**

Add to the callbacks object passed to `combatLoop.init()`:

```js
    apiBefriendTalk: async () => {
      const resp = await fetch('/api/game/befriend-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      });
      return resp.json();
    },
```

**Note:** If `handleBefriendTalk` in Task 5 already calls `fetch` directly (as written above), this callback may not be needed. Review whether the pattern in combat-loop.js uses injected API functions or direct `fetch`. If direct `fetch` is used in `handleBefriendTalk`, skip this step.

**Step 3: Syntax check**

Run: `node --check public/js/game.js && echo "OK"`
Expected: OK

**Step 4: Commit (if changes were made)**

```bash
git add public/js/game.js
git commit -m "feat: register befriend-talk API callback in game.js"
```

---

### Task 7: Integration test — full befriend flow

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (extend existing)

**Step 1: Add integration-style test for talk rejection triggering enemy attack**

```js
describe('rollTalkAcceptance integration', () => {
  it('rejection does not modify befriend conversation state', () => {
    // Ensure rollTalkAcceptance is pure — no side effects on combat state
    const enemy = instantiateCreature('hikaribon');
    enemy.hp = Math.floor(enemy.maxHp * 0.4);
    const before = { ...enemy };
    rollTalkAcceptance(enemy);
    assert.strictEqual(enemy.hp, before.hp);
    assert.strictEqual(enemy.befriended, before.befriended);
  });
});
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: All Tier 1 + Tier 2 tests pass

**Step 3: Commit**

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test: add rollTalkAcceptance integration test"
```

---

### Task 8: Manual playtest verification

**Do NOT automate this — use Playwright MCP browser.**

Follow `docs/playtest-guide.md` to:

1. Start a run, enter an area, reach a creature encounter
2. Attack the enemy until it's below 50% HP and alone
3. Verify the item cell splits to show 💬 はなす | 🎒 アイテム
4. Tap はなす — observe either rejection (enemy attacks) or conversation start
5. If conversation starts, complete 3 rounds and verify creature joins party
6. Verify the split cell reverts to normal items-only when befriend conditions aren't met

Take screenshots at each checkpoint for the user to review.

---

## File Change Summary

| File | Action | What |
|---|---|---|
| `src/game/services/creature-combat-service.js` | Add | `rollTalkAcceptance()` function + export |
| `src/routes/game/combat.js` | Add | `POST /befriend-talk` route, import `rollTalkAcceptance` |
| `public/js/ui/move-select.js` | Modify | `buildBefriendCell()`, `buildSplitCell()`, update `showMoves()` signature |
| `public/game.css` | Add | `.move-split-cell`, `.move-befriend-half` styles |
| `public/js/ui/combat-loop.js` | Add | `isBefriendAvailable()`, `handleBefriendTalk()`, wire into `promptNextCreature()` |
| `public/js/game.js` | Maybe | Register callback (depends on pattern used) |
| `tests/unit/combat/creature-combat-service.test.js` | Add | Tests for `rollTalkAcceptance` |
