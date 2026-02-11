# Robot Combat V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-enemy encounters (1-3 robots), in-combat robot swapping, and a post-combat item shop to the robot combat system.

**Architecture:** Three independent features layered onto the existing MVP. Multi-enemy changes the backend generation and frontend display. Swapping adds a UI button in the existing robot popup and a new API endpoint. The item shop adds a new data file, service, UI module, and API endpoint triggered after every victory. All work happens in the existing worktree at `/Users/michia/Documents/jrpg/.worktrees/robot-combat` on branch `feature/robot-combat`.

**Tech Stack:** Express.js backend (ES modules), vanilla HTML/CSS/JS frontend, node:test for unit tests, Playwright for E2E tests.

---

## Task 1: Multi-Enemy Generation

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/robots.js` (lines 129-143)
- Test: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/tests/unit/robots.test.js`

**Step 1: Write failing tests for multi-enemy generation**

Add to the bottom of `tests/unit/robots.test.js`:

```javascript
import { generateEnemyRobots } from '../../src/game/robots.js';

describe('Multi-Enemy Generation', () => {
  it('generates 1-3 enemy robots', () => {
    const enemies = generateEnemyRobots(1);
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.element);
      assert.ok(e.hp > 0);
      assert.ok(e.maxHp > 0);
    }
  });

  it('each enemy is independently generated', () => {
    // Run multiple times to check variety
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(generateEnemyRobots(1));
    }
    // At least one result should have >1 enemy
    const hasMultiple = results.some(r => r.length > 1);
    assert.ok(hasMultiple, 'Expected at least one multi-enemy encounter in 20 rolls');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/robots.test.js`
Expected: FAIL — `generateEnemyRobots` not found

**Step 3: Implement `generateEnemyRobots` in `src/game/robots.js`**

Add after the existing `generateEnemyRobot` function (after line 143):

```javascript
const ENEMY_COUNT_WEIGHTS = [
  { count: 1, weight: 60 },
  { count: 2, weight: 30 },
  { count: 3, weight: 10 }
];

export function generateEnemyRobots(highestAllyLevel = 1) {
  // Roll enemy count
  const totalWeight = ENEMY_COUNT_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of ENEMY_COUNT_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }

  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push(generateEnemyRobot(highestAllyLevel));
  }
  return enemies;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/robots.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/robots.js tests/unit/robots.test.js
/usr/bin/git commit -m "feat: multi-enemy generation with weighted 1-3 count"
```

---

## Task 2: Wire Multi-Enemy into GameManager

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/loop.js` (lines 851-874, `startRobotEncounter`)

**Step 1: Update import in loop.js**

Find the import of `generateEnemyRobot` at the top of `loop.js` and add `generateEnemyRobots`:

```javascript
import { generateEnemyRobot, generateEnemyRobots, getStarterRobots, instantiateRobot } from './robots.js';
```

**Step 2: Modify `startRobotEncounter()` to use multi-enemy**

Replace lines 860-864 in `startRobotEncounter()`:

Old:
```javascript
    const enemyRobot = generateEnemyRobot(highestLevel);

    this.combat = createCombatState(enemyRobot);
    this.combat.allies = this.run.robotParty.active;
    this.combat.enemies = [enemyRobot];
    this.combat.isRobotCombat = true;
```

New:
```javascript
    const enemyRobots = generateEnemyRobots(highestLevel);

    this.combat = createCombatState(enemyRobots[0]);
    this.combat.allies = this.run.robotParty.active;
    this.combat.enemies = enemyRobots;
    this.combat.isRobotCombat = true;
```

**Step 3: Update the return value** (line 869-873)

Old:
```javascript
    return {
      enemy: enemyRobot,
      allies: this.run.robotParty.active,
      playerGoesFirst: true
    };
```

New:
```javascript
    return {
      enemy: enemyRobots[0],
      enemies: enemyRobots,
      allies: this.run.robotParty.active,
      playerGoesFirst: true
    };
```

**Step 4: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/loop.js
/usr/bin/git commit -m "feat: wire multi-enemy generation into startRobotEncounter"
```

---

## Task 3: Multi-Enemy Frontend Display

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/scene.js` (lines 48-87, 210-226)
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/game.css`

This task adds a `showEnemies(enemies[])` function that renders 1-3 enemy robots in a horizontal row, and `updateEnemyHPAtIndex(index, current, max)` for targeted HP updates.

**Step 1: Add `showEnemies()` and `updateEnemyHPAtIndex()` to scene.js**

Add these new exports after the existing `showEnemy` function (after line 87):

```javascript
/** Show multiple enemy robots in horizontal row */
export function showEnemies(enemies) {
  if (!enemies || enemies.length === 0) {
    hideEnemy();
    return;
  }
  if (enemies.length === 1) {
    showEnemy(enemies[0]);
    return;
  }

  // Clear existing single-enemy display
  dom.enemySprite.classList.remove('visible');
  removePlaceholder();
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  dom.enemyName.textContent = '';

  // Remove any previous multi-enemy container
  dom.enemySpriteContainer.querySelector('.multi-enemy-row')?.remove();

  const row = document.createElement('div');
  row.className = 'multi-enemy-row';

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const icon = ELEMENT_ICONS[enemy.element] || '';
    const color = ELEMENT_COLORS[enemy.element] || '#666';
    const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);

    const slot = document.createElement('div');
    slot.className = 'enemy-robot-slot';
    slot.dataset.enemyIndex = i;
    slot.innerHTML = `
      <div class="enemy-robot-icon" style="border-color: ${color}">
        <span class="enemy-robot-element">${icon}</span>
        <span class="enemy-robot-level">Lv${enemy.level || 1}</span>
      </div>
      <div class="enemy-robot-name">${enemy.nameEn || enemy.name}</div>
      <div class="enemy-robot-hp-bar">
        <div class="enemy-robot-hp-fill" style="width: ${hpPct}%"></div>
      </div>
    `;
    row.appendChild(slot);
  }

  dom.enemySpriteContainer.appendChild(row);
}

/** Update HP bar for a specific enemy by index (multi-enemy) */
export function updateEnemyHPAtIndex(index, current, max) {
  const slot = dom.enemySpriteContainer.querySelector(`.enemy-robot-slot[data-enemy-index="${index}"]`);
  if (!slot) {
    // Fallback to single-enemy update
    updateEnemyHP(current, max);
    return;
  }
  const fill = slot.querySelector('.enemy-robot-hp-fill');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    fill.style.width = `${pct}%`;
  }
  // Mark defeated
  if (current <= 0) {
    slot.classList.add('defeated');
  }
}

/** Hide all enemies (single and multi) */
export function hideEnemies() {
  hideEnemy();
  dom.enemySpriteContainer.querySelector('.multi-enemy-row')?.remove();
}
```

**Step 2: Add CSS for multi-enemy row**

Add to the end of the robot-related CSS section in `public/game.css`:

```css
/* Multi-Enemy Row */
.multi-enemy-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
}

.enemy-robot-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: opacity 0.3s;
}

.enemy-robot-slot.defeated {
  opacity: 0.25;
  filter: grayscale(1);
}

.enemy-robot-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: var(--bg-dark, #1a1a2e);
  font-size: 24px;
}

.enemy-robot-element {
  font-size: 24px;
}

.enemy-robot-level {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 8px;
  background: var(--bg-dark, #1a1a2e);
  color: #ccc;
  padding: 1px 3px;
  border-radius: 3px;
  line-height: 1;
}

.enemy-robot-name {
  font-size: 9px;
  color: #aaa;
  max-width: 64px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enemy-robot-hp-bar {
  width: 50px;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.enemy-robot-hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #F44336, #4CAF50);
  transition: width 0.3s;
}
```

**Step 3: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/ui/scene.js public/game.css
/usr/bin/git commit -m "feat: multi-enemy display with horizontal row and per-enemy HP bars"
```

---

## Task 4: Update Combat Loop for Multi-Enemy

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/combat-loop.js`

This task updates the robot combat attack and defend functions to handle multiple enemies: progressive HP per-enemy, befriend eligibility across all enemies, and multi-enemy display initialization.

**Step 1: Update `executeRobotPlayerAttack()` for multi-enemy HP tracking**

In `executeRobotPlayerAttack()` (line 780), replace the single-enemy HP tracking (lines 807-811) with multi-enemy tracking:

Old (lines 807-811):
```javascript
    // Track enemy HP for progressive updates
    const gs = getGameState();
    const enemyStart = result.enemies?.[0];
    let enemyRunningHp = enemyStart ? (enemyStart.hp + (result.playerAttacks || []).reduce((sum, a) => sum + a.damage, 0)) : 0;
    const enemyMaxHp = enemyStart?.maxHp || 1;
```

New:
```javascript
    // Track each enemy's HP for progressive updates
    const gs = getGameState();
    const enemyHpMap = {};
    if (result.enemies) {
      for (const enemy of result.enemies) {
        // Reconstruct pre-attack HP by adding back damage dealt to this enemy
        const dmgToThisEnemy = (result.playerAttacks || [])
          .filter(a => a.targetId === enemy.id)
          .reduce((sum, a) => sum + a.damage, 0);
        enemyHpMap[enemy.id] = { hp: enemy.hp + dmgToThisEnemy, maxHp: enemy.maxHp, index: result.enemies.indexOf(enemy) };
      }
    }
```

Then update the player attack animation loop. Replace the enemy HP update line (line 838-839):

Old:
```javascript
        enemyRunningHp = Math.max(0, enemyRunningHp - atk.damage);
        characterUI.updateEnemyHPBar({ current: enemyRunningHp, max: enemyMaxHp });
```

New:
```javascript
        if (enemyHpMap[atk.targetId]) {
          enemyHpMap[atk.targetId].hp = Math.max(0, enemyHpMap[atk.targetId].hp - atk.damage);
          const entry = enemyHpMap[atk.targetId];
          if (result.enemies.length > 1) {
            characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
          } else {
            characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
          }
        }
```

Also update the final state HP bars (lines 898-900):

Old:
```javascript
      if (result.enemies?.[0]) {
        characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
      }
```

New:
```javascript
      if (result.enemies?.length > 1) {
        result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
      } else if (result.enemies?.[0]) {
        characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
      }
```

**Step 2: Update befriend eligibility check for multiple enemies**

In `showNextDualCardsFromQueue()` (line 186-195), change the befriend check from checking `enemies[0]` to checking any enemy:

Old (lines 189-195):
```javascript
  const enemy = state.combat?.enemies?.[0];
  const party = state.run?.robotParty;
  const befriendAvailable = isRobotCombat && enemy &&
    enemy.hp > 0 &&
    (enemy.hp / enemy.maxHp) <= 0.5 &&
    party &&
    (party.active.length + party.reserves.length) < party.maxTotal;
```

New:
```javascript
  const enemies = state.combat?.enemies || [];
  const party = state.run?.robotParty;
  const anyEnemyBefriendable = enemies.some(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5);
  const befriendAvailable = isRobotCombat && anyEnemyBefriendable &&
    party &&
    (party.active.length + party.reserves.length) < party.maxTotal;
```

**Step 3: Import `showEnemies`, `updateEnemyHPAtIndex`, `hideEnemies` in the combat-loop init**

The `characterUI` callback object passed to `init()` should include the new scene functions. Find where `characterUI` is set up (in the `init` function around line 96-128) and ensure it exposes `updateEnemyHPAtIndex` and `showEnemies`. These are passed from `game.js` — the caller must wire them. (This will be connected in Task 5.)

**Step 4: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/ui/combat-loop.js
/usr/bin/git commit -m "feat: update combat loop for multi-enemy HP tracking and befriend"
```

---

## Task 5: Wire Multi-Enemy Display into game.js

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/game.js`

The `game.js` coordinator passes UI callbacks to modules. We need to wire `scene.showEnemies`, `scene.updateEnemyHPAtIndex`, and `scene.hideEnemies` through to the combat loop so it can update multi-enemy displays.

**Step 1: Find where scene functions are wired into the characterUI callback object**

Search for where `updateEnemyHPBar` is wired in `game.js`. The `characterUI` object likely includes `updateEnemyHPBar` already — add `updateEnemyHPAtIndex` and `showEnemies` alongside it.

**Step 2: Find where `showEnemy` is called on combat start**

Search for the encounter start flow that calls `scene.showEnemy()`. Update it to call `scene.showEnemies(enemies)` when the response includes multiple enemies.

Where the encounter start handler receives the API result:
- If `result.enemies?.length > 1`: call `scene.showEnemies(result.enemies)`
- Else: call `scene.showEnemy(result.enemy)` (existing behavior)

**Step 3: Export `showEnemies`, `updateEnemyHPAtIndex`, `hideEnemies` from scene.js via ui/index.js**

These are already auto-exported since `public/js/ui/index.js` uses `export * as scene from './scene.js'`. No changes needed to index.js.

**Step 4: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/game.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/game.js
/usr/bin/git commit -m "feat: wire multi-enemy display into game coordinator"
```

---

## Task 6: Item Data File

**Files:**
- Create: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/data/items.json`

**Step 1: Create item definitions**

```json
[
  {
    "id": "atk-boost",
    "name": "攻撃強化",
    "nameEn": "ATK Boost",
    "description": "All robots +2% attack",
    "type": "stat",
    "effect": { "field": "attackMult", "value": 0.02 }
  },
  {
    "id": "hp-boost",
    "name": "体力強化",
    "nameEn": "HP Boost",
    "description": "All robots +2% max HP (heals that amount)",
    "type": "stat",
    "effect": { "field": "hpMult", "value": 0.02 }
  },
  {
    "id": "auto-power",
    "name": "自動攻撃強化",
    "nameEn": "Auto Power",
    "description": "All robots +3% auto-skill power",
    "type": "stat",
    "effect": { "field": "autoPowerMult", "value": 0.03 }
  },
  {
    "id": "ultimate-power",
    "name": "必殺技強化",
    "nameEn": "Ultimate Power",
    "description": "All robots +5% ultimate power",
    "type": "stat",
    "effect": { "field": "ultimatePowerMult", "value": 0.05 }
  },
  {
    "id": "element-edge",
    "name": "属性強化",
    "nameEn": "Element Edge",
    "description": "Super-effective damage +0.05",
    "type": "stat",
    "effect": { "field": "elementEdge", "value": 0.05 }
  },
  {
    "id": "thick-armor",
    "name": "装甲強化",
    "nameEn": "Thick Armor",
    "description": "All incoming damage reduced by 1",
    "type": "stat",
    "effect": { "field": "flatDamageReduction", "value": 1 }
  },
  {
    "id": "team-heal",
    "name": "チーム回復",
    "nameEn": "Team Heal",
    "description": "Heal all robots for 25% of max HP",
    "type": "heal",
    "effect": { "healPercent": 0.25 }
  },
  {
    "id": "patch-up",
    "name": "応急処置",
    "nameEn": "Patch Up",
    "description": "Heal the most damaged robot to full",
    "type": "heal",
    "effect": { "healMostDamaged": true }
  },
  {
    "id": "revive",
    "name": "蘇生",
    "nameEn": "Revive",
    "description": "Revive one random KO'd robot at 30% HP",
    "type": "heal",
    "effect": { "revivePercent": 0.3 }
  },
  {
    "id": "quick-charge",
    "name": "急速充電",
    "nameEn": "Quick Charge",
    "description": "All robots gain +2 ultimate charges",
    "type": "utility",
    "effect": { "chargeBoost": 2 }
  }
]
```

**Step 2: Validate JSON**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node -e "console.log(JSON.parse(require('fs').readFileSync('data/items.json','utf8')).length)"`
Expected: `10`

**Step 3: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add data/items.json
/usr/bin/git commit -m "feat: add 10-item pool for post-combat shop"
```

---

## Task 7: Item Service with Buff Integration

**Files:**
- Create: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/services/item-service.js`
- Test: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/tests/unit/item-service.test.js`

**Step 1: Write failing tests**

```javascript
// tests/unit/item-service.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  rollShopItems,
  applyItem,
  createItemBuffs,
  getBuffedAttack,
  getBuffedAutoPower,
  getBuffedUltimatePower,
  getBuffedElementMultiplier,
  applyDamageReduction
} from '../../src/game/services/item-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Item Shop - Roll', () => {
  it('returns exactly 3 items', () => {
    const items = rollShopItems();
    assert.strictEqual(items.length, 3);
  });

  it('each item has id, name, description, type', () => {
    const items = rollShopItems();
    for (const item of items) {
      assert.ok(item.id);
      assert.ok(item.nameEn);
      assert.ok(item.description);
      assert.ok(item.type);
    }
  });
});

describe('Item Buffs - Stat Boosts', () => {
  it('ATK Boost stacks +2% per application', () => {
    const buffs = createItemBuffs();
    const atkItem = { type: 'stat', effect: { field: 'attackMult', value: 0.02 } };
    const party = { active: [instantiateRobot('fire-common')], reserves: [] };
    applyItem(atkItem, party, buffs);
    assert.strictEqual(buffs.attackMult, 1.02);
    applyItem(atkItem, party, buffs);
    assert.strictEqual(buffs.attackMult, 1.04);
  });

  it('getBuffedAttack applies multiplier', () => {
    const buffs = createItemBuffs();
    buffs.attackMult = 1.10; // +10%
    assert.strictEqual(getBuffedAttack(10, buffs), 11); // floor(10 * 1.10)
  });

  it('Element Edge adds to super-effective multiplier', () => {
    const buffs = createItemBuffs();
    buffs.elementEdge = 0.10;
    assert.strictEqual(getBuffedElementMultiplier(1.5, buffs), 1.6);
    assert.strictEqual(getBuffedElementMultiplier(1.0, buffs), 1.0); // only applies to super-effective
  });

  it('Flat damage reduction reduces incoming damage (min 1)', () => {
    const buffs = createItemBuffs();
    buffs.flatDamageReduction = 3;
    assert.strictEqual(applyDamageReduction(10, buffs), 7);
    assert.strictEqual(applyDamageReduction(2, buffs), 1); // min 1
  });
});

describe('Item Buffs - Heals', () => {
  it('Team Heal heals all robots for 25% max HP', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common')],
      reserves: []
    };
    party.active[0].hp = 50; // 50% of 100
    party.active[1].hp = 30;
    const healItem = { type: 'heal', effect: { healPercent: 0.25 } };
    const buffs = createItemBuffs();
    applyItem(healItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 75); // 50 + 25
    assert.strictEqual(party.active[1].hp, 55); // 30 + 25
  });

  it('Patch Up heals most damaged robot to full', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common')],
      reserves: []
    };
    party.active[0].hp = 80;
    party.active[1].hp = 30; // most damaged
    const patchItem = { type: 'heal', effect: { healMostDamaged: true } };
    const buffs = createItemBuffs();
    applyItem(patchItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 80); // unchanged
    assert.strictEqual(party.active[1].hp, 100); // healed to full
  });

  it('Revive restores one KO robot at 30% HP', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')]
    };
    party.active[0].hp = 0; // KO'd
    const reviveItem = { type: 'heal', effect: { revivePercent: 0.3 } };
    const buffs = createItemBuffs();
    applyItem(reviveItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 30); // 30% of 100
  });

  it('Quick Charge adds +2 charges to all robots', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: []
    };
    const chargeItem = { type: 'utility', effect: { chargeBoost: 2 } };
    const buffs = createItemBuffs();
    applyItem(chargeItem, party, buffs);
    assert.strictEqual(party.active[0].ultimate.charges, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/item-service.test.js`
Expected: FAIL

**Step 3: Implement item-service.js**

```javascript
// src/game/services/item-service.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../../data/items.json'), 'utf8'));

export function createItemBuffs() {
  return {
    attackMult: 1.0,
    hpMult: 1.0,
    autoPowerMult: 1.0,
    ultimatePowerMult: 1.0,
    elementEdge: 0,
    flatDamageReduction: 0
  };
}

export function rollShopItems() {
  const pool = [...ITEMS];
  const selected = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    selected.push({ ...pool[idx] });
    pool.splice(idx, 1);
    if (pool.length === 0) break;
  }
  return selected;
}

export function applyItem(item, robotParty, itemBuffs) {
  const allRobots = [...robotParty.active, ...robotParty.reserves].filter(Boolean);

  if (item.type === 'stat') {
    const { field, value } = item.effect;
    if (field === 'flatDamageReduction') {
      itemBuffs[field] = (itemBuffs[field] || 0) + value;
    } else {
      itemBuffs[field] = (itemBuffs[field] || 1.0) + value;
    }
    // HP Boost also heals the gained amount
    if (field === 'hpMult') {
      for (const robot of allRobots) {
        const hpGain = Math.floor(robot.maxHp * value);
        robot.hp = Math.min(robot.maxHp + hpGain, robot.hp + hpGain);
      }
    }
    return { applied: true };
  }

  if (item.type === 'heal') {
    if (item.effect.healPercent) {
      for (const robot of allRobots) {
        if (robot.hp <= 0) continue;
        const heal = Math.floor(robot.maxHp * item.effect.healPercent);
        robot.hp = Math.min(robot.maxHp, robot.hp + heal);
      }
      return { applied: true };
    }

    if (item.effect.healMostDamaged) {
      const alive = allRobots.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const mostDamaged = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        mostDamaged.hp = mostDamaged.maxHp;
      }
      return { applied: true };
    }

    if (item.effect.revivePercent) {
      const kos = allRobots.filter(r => r.hp <= 0);
      if (kos.length > 0) {
        const target = kos[Math.floor(Math.random() * kos.length)];
        target.hp = Math.floor(target.maxHp * item.effect.revivePercent);
      }
      return { applied: true };
    }
  }

  if (item.type === 'utility') {
    if (item.effect.chargeBoost) {
      for (const robot of allRobots) {
        robot.ultimate.charges = Math.min(
          robot.ultimate.charges + item.effect.chargeBoost,
          robot.ultimate.chargesRequired
        );
      }
      return { applied: true };
    }
  }

  return { applied: false };
}

export function getBuffedAttack(baseAttack, itemBuffs) {
  return Math.floor(baseAttack * (itemBuffs?.attackMult || 1.0));
}

export function getBuffedAutoPower(basePower, itemBuffs) {
  return Math.floor(basePower * (itemBuffs?.autoPowerMult || 1.0));
}

export function getBuffedUltimatePower(basePower, itemBuffs) {
  return Math.floor(basePower * (itemBuffs?.ultimatePowerMult || 1.0));
}

export function getBuffedElementMultiplier(baseMult, itemBuffs) {
  if (baseMult > 1.0 && itemBuffs?.elementEdge) {
    return +(baseMult + itemBuffs.elementEdge).toFixed(2);
  }
  return baseMult;
}

export function applyDamageReduction(damage, itemBuffs) {
  if (itemBuffs?.flatDamageReduction) {
    return Math.max(1, damage - itemBuffs.flatDamageReduction);
  }
  return damage;
}
```

**Step 4: Run tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/item-service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/services/item-service.js data/items.json tests/unit/item-service.test.js
/usr/bin/git commit -m "feat: item service with stat buffs, heals, and damage formula integration"
```

---

## Task 8: Add itemBuffs to Run State and Wire into Damage Formula

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/state.js` (line 305, after `robotParty`)
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/services/robot-combat-service.js`

**Step 1: Add `itemBuffs` to `createNewRun()` in state.js**

After the `robotParty` block (line 305), add:

```javascript
    // Item buff stacking (run-scoped)
    itemBuffs: {
      attackMult: 1.0,
      hpMult: 1.0,
      autoPowerMult: 1.0,
      ultimatePowerMult: 1.0,
      elementEdge: 0,
      flatDamageReduction: 0
    },
```

**Step 2: Wire itemBuffs into `processAttackTurn` in robot-combat-service.js**

Add import at the top of `robot-combat-service.js`:

```javascript
import {
  getBuffedAttack,
  getBuffedAutoPower,
  getBuffedElementMultiplier,
  applyDamageReduction
} from './item-service.js';
```

Modify `processAttackTurn` signature (line 10) to accept `itemBuffs`:

```javascript
export function processAttackTurn(allies, enemies, itemBuffs = null) {
```

Inside the attack loop (line 20), replace the damage calculation:

Old:
```javascript
    const damage = calculateRobotDamage(robot.attack, robot.autoSkill.power, elemMult, variance);
```

New:
```javascript
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedPower = itemBuffs ? getBuffedAutoPower(robot.autoSkill.power, itemBuffs) : robot.autoSkill.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
```

**Step 3: Wire itemBuffs into `processEnemyTurn`**

Modify `processEnemyTurn` signature (line 57) to accept `itemBuffs`:

```javascript
export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null) {
```

After damage calculation (line 67-71), apply damage reduction:

Old:
```javascript
    if (defendActive) {
      damage = Math.floor(damage * 0.5);
    }
```

New:
```javascript
    if (defendActive) {
      damage = Math.floor(damage * 0.5);
    }
    if (itemBuffs) {
      damage = applyDamageReduction(damage, itemBuffs);
    }
```

**Step 4: Wire itemBuffs into `processUltimate`**

Modify `processUltimate` signature (line 123) to accept `itemBuffs`:

```javascript
export function processUltimate(robot, enemies, itemBuffs = null) {
```

Inside the hits loop (line 133), replace damage calculation:

Old:
```javascript
    const damage = calculateRobotDamage(robot.attack, robot.ultimate.power, elemMult, variance);
```

New:
```javascript
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedPower = itemBuffs ? getBuffedUltimatePower(robot.ultimate.power, itemBuffs) : robot.ultimate.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
```

**Step 5: Pass `itemBuffs` in `loop.js` calls**

In `loop.js`, update the calls inside `robotCombatCycle()`:
- Line 892: `processAttackTurn(this.combat.allies, this.combat.enemies, this.run.itemBuffs)`
- Line 938: `processEnemyTurn(this.combat.enemies, this.combat.allies, defendActive, this.run.itemBuffs)`

And in `useRobotUltimate()`:
- Line 999: `processUltimate(robot, this.combat.enemies, this.run.itemBuffs)`

**Step 6: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check src/game/state.js && node --check src/game/services/robot-combat-service.js && node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 7: Run existing unit tests to check for regressions**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/robot-combat-service.test.js`
Expected: PASS (all existing tests should pass since `itemBuffs` defaults to `null`)

**Step 8: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/state.js src/game/services/robot-combat-service.js src/game/loop.js
/usr/bin/git commit -m "feat: wire item buffs into damage formula and run state"
```

---

## Task 9: Post-Combat Shop API Endpoint

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/loop.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/routes/game/combat.js`

**Step 1: Add `rollPostCombatShop()` and `selectShopItem()` methods to GameManager**

Add import in `loop.js`:

```javascript
import { rollShopItems, applyItem } from './services/item-service.js';
```

Add after `useRobotUltimate()` method (after line 1019):

```javascript
  /**
   * Roll 3 random items for the post-combat shop
   */
  rollPostCombatShop() {
    if (!this.run?.active) throw new Error('No active run');
    const items = rollShopItems();
    this.run._pendingShopItems = items;
    return { items };
  }

  /**
   * Player selects one item from the post-combat shop
   * @param {number} itemIndex - 0, 1, or 2
   */
  selectShopItem(itemIndex) {
    if (!this.run?.active) throw new Error('No active run');
    const items = this.run._pendingShopItems;
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');

    const selectedItem = items[itemIndex];
    applyItem(selectedItem, this.run.robotParty, this.run.itemBuffs);
    this.run._pendingShopItems = null;

    this.emitState();
    return {
      selected: selectedItem,
      robotParty: this.run.robotParty,
      itemBuffs: this.run.itemBuffs
    };
  }
```

**Step 2: Add API routes in combat.js**

Add before the `return router;` line (before line 213):

```javascript
  // Post-combat item shop
  router.post('/robot-shop-roll', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.rollPostCombatShop();
      req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/robot-shop-select', (req, res) => {
    const gameManager = req.gameManager;
    const { itemIndex } = req.body;
    try {
      const result = gameManager.selectShopItem(itemIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 3: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check src/game/loop.js && node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/loop.js src/routes/game/combat.js
/usr/bin/git commit -m "feat: post-combat shop API endpoints (roll and select)"
```

---

## Task 10: Post-Combat Shop Frontend

**Files:**
- Create: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/post-combat-shop.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/index.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/api.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/game.css`

**Step 1: Add API functions to api.js**

Add before the export block:

```javascript
async function rollPostCombatShop() {
  return apiCall('/robot-shop-roll', 'POST');
}

async function selectShopItem(itemIndex) {
  return apiCall('/robot-shop-select', 'POST', { itemIndex });
}
```

Add `rollPostCombatShop` and `selectShopItem` to the export list.

**Step 2: Create post-combat-shop.js**

```javascript
// public/js/ui/post-combat-shop.js
import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onItemSelected = null;

const ITEM_ICONS = {
  'atk-boost': '⚔️',
  'hp-boost': '❤️',
  'auto-power': '🔄',
  'ultimate-power': '💥',
  'element-edge': '🔷',
  'thick-armor': '🛡️',
  'team-heal': '💚',
  'patch-up': '🩹',
  'revive': '✨',
  'quick-charge': '⚡'
};

export function init({ itemSelectedCallback }) {
  onItemSelected = itemSelectedCallback;
}

export function show(items) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  actionArea.innerHTML = `
    <div class="post-combat-shop">
      <div class="shop-title">Choose a Reward</div>
      <div class="shop-items">
        ${items.map((item, i) => `
          <div class="shop-item-card" data-index="${i}">
            <div class="shop-item-icon">${ITEM_ICONS[item.id] || '📦'}</div>
            <div class="shop-item-name">${item.nameEn}</div>
            <div class="shop-item-desc">${item.description}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Add click handlers
  const cards = actionArea.querySelectorAll('.shop-item-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index, 10);
      playSFX('chip-equip');
      // Highlight selected card
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      // Disable further clicks
      cards.forEach(c => c.style.pointerEvents = 'none');
      if (onItemSelected) onItemSelected(index);
    });
  });
}

export function hide() {
  const actionArea = dom.actionArea;
  if (actionArea) actionArea.innerHTML = '';
}
```

**Step 3: Add shop CSS to game.css**

```css
/* Post-Combat Shop */
.post-combat-shop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px;
}

.shop-title {
  font-size: 16px;
  font-weight: bold;
  color: var(--accent-gold, #FFD700);
}

.shop-items {
  display: flex;
  gap: 8px;
  justify-content: center;
  width: 100%;
}

.shop-item-card {
  flex: 1;
  max-width: 120px;
  background: var(--bg-dark, #1a1a2e);
  border: 2px solid #333;
  border-radius: 8px;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.1s;
}

.shop-item-card:active {
  transform: scale(0.97);
}

.shop-item-card.selected {
  border-color: var(--accent-gold, #FFD700);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
}

.shop-item-icon {
  font-size: 28px;
}

.shop-item-name {
  font-size: 11px;
  font-weight: bold;
  color: var(--text-primary, #eee);
  text-align: center;
}

.shop-item-desc {
  font-size: 9px;
  color: #aaa;
  text-align: center;
  line-height: 1.3;
}
```

**Step 4: Export from ui/index.js**

Add to `public/js/ui/index.js`:

```javascript
export * as postCombatShop from './post-combat-shop.js';
```

**Step 5: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/post-combat-shop.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/ui/post-combat-shop.js public/js/ui/index.js public/js/api.js public/game.css
/usr/bin/git commit -m "feat: post-combat shop UI with item cards"
```

---

## Task 11: Wire Shop into Victory Flow

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/combat-loop.js` (lines 1596-1602, victory flow)
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/game.js`

**Step 1: Modify `stopCombatLoop` to show shop before victory modal**

In `stopCombatLoop()` at line 1596, the victory path currently does:

```javascript
    if (result.victory) {
      playSFX('victory');
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
    }
```

Change it to insert the shop between narration and the victory modal. The shop flow is:

1. Narration completes (existing)
2. If robot combat victory → roll shop items, show shop UI
3. Player picks an item → call select API
4. Show victory modal (existing)

Replace lines 1596-1602 with:

```javascript
    if (result.victory) {
      playSFX('victory');
      const gs = getGameState();
      const isRobotCombat = gs?.combat?.isRobotCombat;
      if (isRobotCombat && showPostCombatShop) {
        await showPostCombatShop();
      }
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
    } else {
      showGameOverModal(result);
    }
```

The `showPostCombatShop` function is a callback passed via init. It returns a Promise that resolves when the player selects an item.

**Step 2: Wire the shop flow in game.js**

In `game.js`, create the `showPostCombatShop` callback that:
1. Calls `rollPostCombatShop()` API
2. Calls `postCombatShop.show(items)`
3. Returns a Promise that resolves when the player picks an item (via `postCombatShop.init({ itemSelectedCallback })`)
4. Callback calls `selectShopItem(index)` API, then resolves

Pass this callback to `combatLoop.init()`.

**Step 3: Initialize `postCombatShop` module in game.js**

Import the module and call `postCombatShop.init()` during game initialization.

**Step 4: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/combat-loop.js && node --check public/js/game.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/ui/combat-loop.js public/js/game.js
/usr/bin/git commit -m "feat: wire post-combat shop into victory flow"
```

---

## Task 12: Robot Swapping — Backend

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/loop.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/routes/game/combat.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/src/game/state.js` (combat state)
- Test: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/tests/unit/robot-swap.test.js`

**Step 1: Write failing tests for swap logic**

```javascript
// tests/unit/robot-swap.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Robot Swap', () => {
  it('swaps active robot with reserve', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common'), instantiateRobot('wood-common')],
      reserves: [instantiateRobot('metal-common'), instantiateRobot('earth-common')],
      maxTotal: 6
    };
    const swappedOut = party.active[1]; // water
    const swappedIn = party.reserves[0]; // metal

    // Perform swap
    party.active[1] = swappedIn;
    party.reserves[0] = swappedOut;

    assert.strictEqual(party.active[1].element, 'metal');
    assert.strictEqual(party.reserves[0].element, 'water');
  });

  it('can swap a KO robot out for a healthy reserve', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')],
      maxTotal: 6
    };
    party.active[0].hp = 0; // KO

    const swappedIn = party.reserves[0];
    party.reserves[0] = party.active[0];
    party.active[0] = swappedIn;

    assert.ok(party.active[0].hp > 0);
    assert.strictEqual(party.reserves[0].hp, 0);
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --test tests/unit/robot-swap.test.js`
Expected: PASS (these are pure state operations)

**Step 3: Add `swapPhase` to combat state in state.js**

In `createCombatState()` (line 356-373), add after `isRobotCombat`:

Note: `isRobotCombat` is set by `loop.js` after creation, not in the factory. Add `swapPhase` the same way — it will be set by loop.js. For now, just document that it will exist.

Actually, add a default field in `createCombatState()` after the `log` array:

```javascript
    // Robot swap state
    swapPhase: true  // true = free swaps allowed, false = swap costs action
```

**Step 4: Add `swapRobot()` method to GameManager in loop.js**

Add after `selectShopItem()`:

```javascript
  /**
   * Swap an active robot with a reserve
   * @param {number} activeIndex - Index in robotParty.active (0-2)
   * @param {number} reserveIndex - Index in robotParty.reserves (0-2)
   * @returns {Object} Result with updated party and whether enemy attacks
   */
  swapRobot(activeIndex, reserveIndex) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.robotParty) throw new Error('No robot party');

    const party = this.run.robotParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active robot index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve robot index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const isFreeSwap = this.combat.swapPhase;

    if (!isFreeSwap) {
      // Paid swap: enemy attacks, no player action
      const enemyResult = processEnemyTurn(
        this.combat.enemies,
        this.combat.allies,
        false,
        this.run.itemBuffs
      );

      // Handle KO'd allies after enemy attack
      for (let i = 0; i < this.combat.allies.length; i++) {
        if (this.combat.allies[i].hp <= 0) {
          handleRobotKO(this.run.robotParty, i);
        }
      }
      this.combat.allies = this.run.robotParty.active;

      // Check defeat
      const allAlliesKO = this.combat.allies.every(a => a.hp <= 0);
      if (allAlliesKO) {
        this.combat.active = false;
        this.run.active = false;
      }

      this.combat.turnCount++;
      this.emitState();

      return {
        swapped: true,
        freeSwap: false,
        enemyAttacks: enemyResult.attacks,
        combatEnded: allAlliesKO,
        victory: false,
        robotParty: party,
        allies: this.combat.allies,
        enemies: this.combat.enemies
      };
    }

    this.emitState();
    return {
      swapped: true,
      freeSwap: true,
      robotParty: party,
      allies: this.combat.allies,
      enemies: this.combat.enemies
    };
  }
```

**Step 5: Set `swapPhase` in `robotCombatCycle()`**

In `robotCombatCycle()` (around line 880), after the player phase completes and before showing the next cards, set `swapPhase` to `true`:

Add at the end of `robotCombatCycle()`, just before the return on line 973:

```javascript
    // Reset swap phase for next turn (free swaps available again)
    this.combat.swapPhase = true;
```

And in `resumeCombatAfterVocab` on the frontend, set `swapPhase = false` once an action is committed. This is handled by the backend — when `robotCombatCycle` is called (attack/defend/befriend), set:

At the top of `robotCombatCycle()` (after line 888):

```javascript
    // Once an action is committed, free swap window closes
    this.combat.swapPhase = false;
```

**Step 6: Add API route in combat.js**

Add before `return router`:

```javascript
  // Robot swap
  router.post('/swap-robot', (req, res) => {
    const gameManager = req.gameManager;
    const { activeIndex, reserveIndex } = req.body;
    try {
      const result = gameManager.swapRobot(activeIndex, reserveIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 7: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check src/game/loop.js && node --check src/routes/game/combat.js && node --check src/game/state.js && echo "OK"`
Expected: OK

**Step 8: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add src/game/loop.js src/routes/game/combat.js src/game/state.js tests/unit/robot-swap.test.js
/usr/bin/git commit -m "feat: robot swapping backend with free/paid swap logic"
```

---

## Task 13: Robot Swapping — Frontend (Popup Swap Button)

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/ui/robot-row.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/api.js`
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/game.css`

**Step 1: Add swap API function to api.js**

Add before the export block:

```javascript
async function swapRobot(activeIndex, reserveIndex) {
  return apiCall('/swap-robot', 'POST', { activeIndex, reserveIndex });
}
```

Add `swapRobot` to the export list.

**Step 2: Update robot-row.js to support swap**

Add a new callback and reserves state:

At the top (after line 23):

```javascript
let onSwapRobot = null;
let currentReserves = [];
```

Update `init()` to accept the swap callback:

```javascript
export function init({ useUltimateCallback, swapRobotCallback }) {
  onUseUltimate = useUltimateCallback;
  onSwapRobot = swapRobotCallback;
  // ... existing click listener
```

Add a `setReserves` export:

```javascript
export function setReserves(reserves) {
  currentReserves = reserves || [];
}
```

**Step 3: Add Swap button to the popup in `showPopup()`**

In `showPopup()` (line 105), add a Swap button after the ultimate button. The popup already renders in `dom.chipPopup`. Add the swap button and reserve picker:

Replace the popup HTML (lines 109-122) with:

```javascript
  const hasReserves = currentReserves.length > 0;
  const isKO = robot.hp <= 0;

  dom.chipPopup.innerHTML = `
    <div class="robot-popup-name">${robot.name} (${robot.nameEn})</div>
    <div class="robot-popup-element">${ELEMENT_ICONS[robot.element]} ${robot.element}</div>
    <div class="robot-popup-stats">
      HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}
    </div>
    ${!isKO ? `
      <div class="robot-popup-ultimate">
        Ultimate: ${robot.ultimate.name} (${robot.ultimate.nameEn})
        <br>Power: ${robot.ultimate.power} | Charges: ${robot.ultimate.charges}/${robot.ultimate.chargesRequired}
      </div>
      <button class="robot-popup-ultimate-btn" ${isReady ? '' : 'disabled'}>
        ${isReady ? 'Use Ultimate' : `${robot.ultimate.charges}/${robot.ultimate.chargesRequired} Charges`}
      </button>
    ` : ''}
    ${hasReserves ? `
      <div class="robot-popup-swap-section">
        <div class="robot-popup-swap-label">Swap with:</div>
        <div class="robot-popup-swap-list">
          ${currentReserves.map((r, ri) => `
            <button class="robot-popup-swap-btn" data-reserve-index="${ri}">
              ${ELEMENT_ICONS[r.element]} ${r.nameEn} (Lv${r.level}) ${r.hp}/${r.maxHp}HP
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
```

Add swap button click handlers after the existing ultimate click handler:

```javascript
  // Swap button handlers
  const swapBtns = dom.chipPopup.querySelectorAll('.robot-popup-swap-btn');
  swapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const reserveIndex = parseInt(btn.dataset.reserveIndex, 10);
      hidePopup();
      if (onSwapRobot) onSwapRobot(index, reserveIndex);
    });
  });
```

Also allow KO'd robots to open the popup (for swap-only). In `render()` (line 81-83), change:

Old:
```javascript
      if (!isKO) {
        slot.addEventListener('click', () => togglePopup(i, robot));
      }
```

New:
```javascript
      slot.addEventListener('click', () => togglePopup(i, robot));
```

**Step 4: Add CSS for swap section**

```css
/* Robot Swap in Popup */
.robot-popup-swap-section {
  margin-top: 8px;
  border-top: 1px solid #333;
  padding-top: 8px;
}

.robot-popup-swap-label {
  font-size: 10px;
  color: #888;
  margin-bottom: 4px;
}

.robot-popup-swap-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.robot-popup-swap-btn {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #444;
  border-radius: 4px;
  background: var(--bg-dark, #1a1a2e);
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.robot-popup-swap-btn:active {
  background: #333;
}
```

**Step 5: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/robot-row.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/ui/robot-row.js public/js/api.js public/game.css
/usr/bin/git commit -m "feat: swap button in robot popup with reserve picker"
```

---

## Task 14: Wire Swap into game.js

**Files:**
- Modify: `/Users/michia/Documents/jrpg/.worktrees/robot-combat/public/js/game.js`

**Step 1: Wire the swapRobotCallback**

Find where `robotRow.init()` is called in `game.js` and add the `swapRobotCallback`:

```javascript
robotRow.init({
  useUltimateCallback: async (index) => { /* existing */ },
  swapRobotCallback: async (activeIndex, reserveIndex) => {
    const result = await swapRobot(activeIndex, reserveIndex);
    if (result.error) {
      console.error('Swap failed:', result.error);
      return;
    }
    // Update game state with new party
    if (result.state) {
      updateGameState(result.state);
    }
    // Re-render robot row with updated active roster
    robotRow.setReserves(result.robotParty?.reserves || []);
    robotRow.render(result.robotParty?.active || []);
    // If paid swap triggered enemy attacks, animate them
    if (result.enemyAttacks?.length > 0) {
      // Show enemy attacks in action area
      for (const atk of result.enemyAttacks) {
        const actionArea = document.getElementById('action-area');
        if (actionArea) {
          actionArea.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong></div>`;
        }
      }
    }
    if (result.combatEnded) {
      combatLoop.stopCombatLoop(result);
    }
    updateUI();
  }
});
```

**Step 2: Update robotRow.setReserves() calls**

Wherever the game state is refreshed during combat (like at the start of combat and after each turn), call `robotRow.setReserves(state.run.robotParty.reserves)` so the popup has up-to-date reserve data.

Find the `updateUI` function or the combat state update code and add:

```javascript
if (state.run?.robotParty?.reserves) {
  robotRow.setReserves(state.run.robotParty.reserves);
}
```

**Step 3: Syntax check**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/game.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add public/js/game.js
/usr/bin/git commit -m "feat: wire robot swap callback into game coordinator"
```

---

## Task 15: Run All Tests

**Step 1: Run unit tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && npm run test:unit`
Expected: All robot tests pass. Pre-existing chip test failures (~48) are acceptable.

**Step 2: Run integration tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && npm run test:integration`
Expected: 14+ pass

**Step 3: Syntax-check all modified frontend files**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && node --check public/js/ui/scene.js && node --check public/js/ui/combat-loop.js && node --check public/js/ui/robot-row.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/game.js && node --check public/js/api.js && echo "ALL OK"`
Expected: ALL OK

**Step 4: Run E2E tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && ./scripts/e2e-test.sh`
Expected: 60+/66 pass

**Step 5: Fix any broken tests**

If tests fail, investigate and fix. Common issues:
- State shape changed (add `itemBuffs` to test fixtures)
- Combat service signatures changed (add null defaults for `itemBuffs`)
- Frontend expectations for single enemy need updating for multi-enemy responses

**Step 6: Commit fixes**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add -A
/usr/bin/git commit -m "fix: test fixes for V1 multi-enemy, swap, and shop features"
```

---

## Summary

| Task | Feature | Files | Tests |
|------|---------|-------|-------|
| 1 | Multi-enemy generation | robots.js | robots.test.js |
| 2 | Wire multi-enemy into GameManager | loop.js | — |
| 3 | Multi-enemy frontend display | scene.js, game.css | — |
| 4 | Combat loop multi-enemy support | combat-loop.js | — |
| 5 | Wire display into game.js | game.js | — |
| 6 | Item data file | data/items.json | — |
| 7 | Item service + buffs | item-service.js | item-service.test.js |
| 8 | Wire buffs into damage formula | state.js, robot-combat-service.js, loop.js | robot-combat-service.test.js (regression) |
| 9 | Shop API endpoints | loop.js, combat.js | — |
| 10 | Shop frontend UI | post-combat-shop.js, api.js, game.css | — |
| 11 | Wire shop into victory flow | combat-loop.js, game.js | — |
| 12 | Swap backend | loop.js, combat.js, state.js | robot-swap.test.js |
| 13 | Swap frontend (popup button) | robot-row.js, api.js, game.css | — |
| 14 | Wire swap into game.js | game.js | — |
| 15 | Run all tests, fix regressions | various | all test suites |
