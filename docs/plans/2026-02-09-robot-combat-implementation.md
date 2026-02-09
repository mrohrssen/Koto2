# Robot Combat System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the chip-based combat system with Pokemon-style robot battling while preserving the vocab flash card review flow.

**Architecture:** Robots replace chips as the core combat unit. Each robot has HP, attack, element, auto-skill, and ultimate. Damage shifts from a dual-pool pipeline (`PWR × (1 + BW)`) to a per-robot formula (`attack × abilityPower × elementMultiplier × variance`). Robot party state lives on the run (not the player), resetting each run. The frontend swaps 5 chip slots for 3 robot slots with HP bars and ultimate charge bars, and adds a Befriend action card.

**Tech Stack:** Express.js backend (ES modules), vanilla HTML/CSS/JS frontend, node:test for unit tests, Playwright for E2E tests.

---

## Task 1: Robot Data File

**Files:**
- Create: `data/robots.json`

**Step 1: Create the robot definitions file**

Create `data/robots.json` with 25 robots (5 elements × 5 rarities). Each robot follows this structure:

```json
[
  {
    "id": "wood-common",
    "name": "モクボット",
    "nameEn": "Moku Bot",
    "element": "wood",
    "rarity": "common",
    "baseHp": 100,
    "baseAttack": 20,
    "autoSkill": {
      "name": "リーフ",
      "nameEn": "Leaf",
      "power": 20,
      "element": "wood"
    },
    "ultimate": {
      "name": "大嵐",
      "nameEn": "Great Storm",
      "power": 50,
      "element": "wood",
      "chargesRequired": 5
    }
  },
  {
    "id": "fire-common",
    "name": "ヒノボット",
    "nameEn": "Hino Bot",
    "element": "fire",
    "rarity": "common",
    "baseHp": 100,
    "baseAttack": 20,
    "autoSkill": {
      "name": "バーン",
      "nameEn": "Burn",
      "power": 20,
      "element": "fire"
    },
    "ultimate": {
      "name": "煉獄",
      "nameEn": "Inferno",
      "power": 50,
      "element": "fire",
      "chargesRequired": 5
    }
  }
]
```

Full 25-robot pool:

| Element | Common | Uncommon | Rare | Epic | Legendary |
|---------|--------|----------|------|------|-----------|
| Wood | モクボット (Moku Bot) | キノボット (Kino Bot) | ツルボット (Tsuru Bot) | モリボット (Mori Bot) | ジュカイ (Jukai) |
| Fire | ヒノボット (Hino Bot) | カジボット (Kaji Bot) | エンボット (En Bot) | マグマロボ (Magma Robo) | フェニクス (Phoenix) |
| Earth | ツチボット (Tsuchi Bot) | イワボット (Iwa Bot) | ガンボット (Gan Bot) | ダイチロボ (Daichi Robo) | テイタン (Titan) |
| Metal | テツボット (Tetsu Bot) | カネボット (Kane Bot) | コウボット (Kou Bot) | ギンロボ (Gin Robo) | プラチナ (Platinum) |
| Water | ミズボット (Mizu Bot) | ナミボット (Nami Bot) | カワボット (Kawa Bot) | ウミロボ (Umi Robo) | リヴァイア (Leviathan) |

Each robot's `baseHp` and `baseAttack` are the same across elements within the same rarity. Auto skill power and ultimate power also scale by rarity. No rarity multiplier is applied in the JSON — that's done at instantiation time (Task 2).

**Step 2: Verify the file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/robots.json','utf8')).length" `
Expected: `25`

**Step 3: Commit**

```bash
git add data/robots.json
git commit -m "feat: add 25-robot data file (5 elements × 5 rarities)"
```

---

## Task 2: Robot Service Module

**Files:**
- Create: `src/game/robots.js`
- Test: `tests/unit/robots.test.js`

This module handles robot instantiation, element cycle, damage, leveling, and targeting AI.

**Step 1: Write failing tests for element cycle**

```javascript
// tests/unit/robots.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getElementMultiplier,
  ELEMENT_CYCLE
} from '../../src/game/robots.js';

describe('Element Cycle', () => {
  it('wood beats earth (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('wood', 'earth'), 1.5);
  });
  it('earth beats water (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('earth', 'water'), 1.5);
  });
  it('water beats fire (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('water', 'fire'), 1.5);
  });
  it('fire beats metal (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('fire', 'metal'), 1.5);
  });
  it('metal beats wood (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('metal', 'wood'), 1.5);
  });
  it('reverse is 0.67x', () => {
    assert.strictEqual(getElementMultiplier('earth', 'wood'), 0.67);
  });
  it('neutral is 1.0x', () => {
    assert.strictEqual(getElementMultiplier('fire', 'earth'), 1.0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robots.test.js`
Expected: FAIL — module not found

**Step 3: Write failing tests for robot instantiation**

Add to `tests/unit/robots.test.js`:

```javascript
import { instantiateRobot, RARITY_MULTIPLIERS } from '../../src/game/robots.js';

describe('Robot Instantiation', () => {
  it('creates a level-1 common robot with base stats', () => {
    const robot = instantiateRobot('fire-common');
    assert.strictEqual(robot.element, 'fire');
    assert.strictEqual(robot.rarity, 'common');
    assert.strictEqual(robot.level, 1);
    assert.strictEqual(robot.xp, 0);
    assert.strictEqual(robot.maxHp, 100);
    assert.strictEqual(robot.hp, 100);
    assert.strictEqual(robot.attack, 20);
    assert.strictEqual(robot.ultimate.charges, 0);
    assert.strictEqual(robot.ultimate.chargesRequired, 5);
  });

  it('applies rarity multiplier for uncommon', () => {
    const robot = instantiateRobot('fire-uncommon');
    assert.strictEqual(robot.maxHp, 125); // 100 * 1.25
    assert.strictEqual(robot.attack, 25); // 20 * 1.25
  });

  it('applies rarity multiplier for legendary', () => {
    const robot = instantiateRobot('water-legendary');
    assert.strictEqual(robot.maxHp, 250); // 100 * 2.5
    assert.strictEqual(robot.attack, 50); // 20 * 2.5
  });
});
```

**Step 4: Write failing tests for damage calculation**

Add to `tests/unit/robots.test.js`:

```javascript
import { calculateRobotDamage } from '../../src/game/robots.js';

describe('Robot Damage', () => {
  it('calculates damage with element multiplier (seeded)', () => {
    // attack=20, power=20, element super effective (1.5x), variance=1.0
    const dmg = calculateRobotDamage(20, 20, 1.5, 1.0);
    // 20 * (20/100) * 1.5 * 1.0 = 6
    assert.strictEqual(dmg, 6);
  });

  it('calculates damage neutral (1.0x)', () => {
    const dmg = calculateRobotDamage(20, 20, 1.0, 1.0);
    assert.strictEqual(dmg, 4); // 20 * 0.2 * 1.0 * 1.0
  });
});
```

> Note: The design doc says `damage = attack * abilityPower * elementMultiplier * random(0.8, 1.2)`. But `attack * abilityPower` with base values (20 * 20 = 400) would be too high. Use `attack * (abilityPower / 100) * elementMultiplier * variance` to normalize power to a percentage-based scale. This produces reasonable damage: 20 * 0.20 * 1.0 * 1.0 = 4 per hit for a common robot. Adjust formula based on playtesting.

**Step 5: Write failing tests for leveling**

```javascript
import { addXpToRobot, getStatsForLevel } from '../../src/game/robots.js';

describe('Robot Leveling', () => {
  it('+10% stats per level', () => {
    const stats = getStatsForLevel(100, 20, 3); // baseHp, baseAtk, level 3
    assert.strictEqual(stats.maxHp, 120); // 100 * 1.2
    assert.strictEqual(stats.attack, 24); // 20 * 1.2
  });

  it('awards XP and levels up', () => {
    const robot = instantiateRobot('fire-common');
    addXpToRobot(robot, 100);
    assert.strictEqual(robot.level, 2);
    assert.strictEqual(robot.xp, 0); // remainder
  });
});
```

**Step 6: Write failing tests for targeting AI**

```javascript
import { selectTarget } from '../../src/game/robots.js';

describe('Targeting AI', () => {
  it('picks type-disadvantaged target first', () => {
    const attacker = { element: 'fire' }; // fire beats metal
    const targets = [
      { element: 'wood', hp: 50, maxHp: 100 },
      { element: 'metal', hp: 80, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.element, 'metal');
  });

  it('picks lowest %HP among disadvantaged targets', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'metal', hp: 80, maxHp: 100 }, // 80%
      { element: 'metal', hp: 30, maxHp: 100 }  // 30%
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.hp, 30);
  });

  it('falls back to neutral target', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'water', hp: 50, maxHp: 100 }, // water beats fire — skip
      { element: 'earth', hp: 80, maxHp: 100 }  // neutral
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.element, 'earth');
  });

  it('falls back to lowest %HP if all have advantage', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'water', hp: 50, maxHp: 100 },
      { element: 'water', hp: 20, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.hp, 20);
  });
});
```

**Step 7: Implement `src/game/robots.js`**

```javascript
// src/game/robots.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROBOT_DATA = JSON.parse(readFileSync(join(__dirname, '../../data/robots.json'), 'utf8'));

// Lookup by ID
const ROBOTS_BY_ID = {};
for (const r of ROBOT_DATA) {
  ROBOTS_BY_ID[r.id] = r;
}

// Element cycle: each element beats the next in the array
// Wood → Earth → Water → Fire → Metal → Wood
export const ELEMENT_CYCLE = ['wood', 'earth', 'water', 'fire', 'metal'];

export const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.25,
  rare: 1.5,
  epic: 2.0,
  legendary: 2.5
};

const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 30,
  rare: 12,
  epic: 6,
  legendary: 2
};

const XP_PER_LEVEL = 100; // XP needed to level up

/**
 * Get element damage multiplier
 * @returns 1.5 (super effective), 0.67 (not very effective), or 1.0 (neutral)
 */
export function getElementMultiplier(attackerElement, defenderElement) {
  const ai = ELEMENT_CYCLE.indexOf(attackerElement);
  const di = ELEMENT_CYCLE.indexOf(defenderElement);
  if (ai === -1 || di === -1) return 1.0;
  // attacker beats defender if defender is next in cycle
  if ((ai + 1) % ELEMENT_CYCLE.length === di) return 1.5;
  // defender beats attacker if attacker is next in cycle
  if ((di + 1) % ELEMENT_CYCLE.length === ai) return 0.67;
  return 1.0;
}

/**
 * Create a live robot instance from a template ID
 */
export function instantiateRobot(templateId) {
  const template = ROBOTS_BY_ID[templateId];
  if (!template) throw new Error(`Robot template not found: ${templateId}`);

  const mult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const hp = Math.floor(template.baseHp * mult);
  const attack = Math.floor(template.baseAttack * mult);

  return {
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: template.rarity,
    level: 1,
    xp: 0,
    hp,
    maxHp: hp,
    attack,
    autoSkill: { ...template.autoSkill },
    ultimate: {
      ...template.ultimate,
      charges: 0
    }
  };
}

/**
 * Calculate stats for a given level (used for leveling up)
 * +10% per level above 1
 */
export function getStatsForLevel(baseHp, baseAttack, level) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult)
  };
}

/**
 * Add XP to robot, leveling up as needed
 */
export function addXpToRobot(robot, xp) {
  robot.xp += xp;
  while (robot.xp >= XP_PER_LEVEL) {
    robot.xp -= XP_PER_LEVEL;
    robot.level++;
    const rarityMult = RARITY_MULTIPLIERS[robot.rarity] || 1.0;
    const baseHp = Math.floor(100 * rarityMult); // base for this rarity
    const baseAtk = Math.floor(20 * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, robot.level);
    const hpDiff = stats.maxHp - robot.maxHp;
    robot.maxHp = stats.maxHp;
    robot.attack = stats.attack;
    robot.hp += hpDiff; // heal by the HP gained
  }
}

/**
 * Calculate damage for one robot attack
 * damage = attack * (abilityPower / 100) * elementMultiplier * variance
 */
export function calculateRobotDamage(attack, abilityPower, elementMultiplier, variance) {
  return Math.floor(attack * (abilityPower / 100) * elementMultiplier * variance);
}

/**
 * Roll a random variance between 0.8 and 1.2
 */
export function rollVariance() {
  return 0.8 + Math.random() * 0.4;
}

/**
 * Targeting AI: pick best target from array of opponents
 * 1. Type-disadvantaged target (lowest %HP among them)
 * 2. Neutral target (lowest %HP)
 * 3. Fallback: lowest %HP overall
 */
export function selectTarget(attacker, targets) {
  const alive = targets.filter(t => t.hp > 0);
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0];

  // Sort by %HP ascending
  const byHpPct = (a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp);

  // 1. Type-disadvantaged targets
  const disadvantaged = alive.filter(t => getElementMultiplier(attacker.element, t.element) > 1.0);
  if (disadvantaged.length > 0) return disadvantaged.sort(byHpPct)[0];

  // 2. Neutral targets
  const neutral = alive.filter(t => getElementMultiplier(attacker.element, t.element) === 1.0);
  if (neutral.length > 0) return neutral.sort(byHpPct)[0];

  // 3. Fallback: lowest %HP
  return alive.sort(byHpPct)[0];
}

/**
 * Roll a random rarity using encounter weights
 */
export function rollRarity() {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

/**
 * Generate a random enemy robot for combat
 * @param {number} highestAllyLevel - Highest level robot in player party
 */
export function generateEnemyRobot(highestAllyLevel = 1) {
  const rarity = rollRarity();
  const elements = ['wood', 'fire', 'earth', 'metal', 'water'];
  const element = elements[Math.floor(Math.random() * elements.length)];
  const templateId = `${element}-${rarity}`;
  const robot = instantiateRobot(templateId);

  // Level scales with player's highest ±1-2
  const levelVariance = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  const targetLevel = Math.max(1, highestAllyLevel + levelVariance);
  while (robot.level < targetLevel) {
    addXpToRobot(robot, XP_PER_LEVEL);
  }

  return robot;
}

/**
 * Get all robot templates
 */
export function getAllRobots() {
  return ROBOT_DATA;
}

/**
 * Get starters (common fire, water, wood)
 */
export function getStarterRobots() {
  return ['fire-common', 'water-common', 'wood-common'].map(instantiateRobot);
}
```

**Step 8: Run tests to verify they pass**

Run: `node --test tests/unit/robots.test.js`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add src/game/robots.js tests/unit/robots.test.js
git commit -m "feat: robot service with element cycle, instantiation, damage, targeting AI"
```

---

## Task 3: Robot Party State

**Files:**
- Modify: `src/game/state.js` — `createNewRun()` function (lines 268-338)
- Modify: `src/game/state.js` — `createCombatState()` function (lines 349-363)
- Test: `tests/unit/robot-party.test.js`

**Step 1: Write failing tests for robot party state**

```javascript
// tests/unit/robot-party.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createCombatState, createNewPlayer } from '../../src/game/state.js';

describe('Robot Party in Run State', () => {
  it('run has robotParty with active, reserves, maxTotal', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.ok(run.robotParty);
    assert.deepStrictEqual(run.robotParty.active, []);
    assert.deepStrictEqual(run.robotParty.reserves, []);
    assert.strictEqual(run.robotParty.maxTotal, 6);
  });
});

describe('Combat State with Robot Arrays', () => {
  it('combat state has allies and enemies arrays', () => {
    const combat = createCombatState({ hp: 100, maxHp: 100 });
    assert.ok(Array.isArray(combat.allies));
    assert.ok(Array.isArray(combat.enemies));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-party.test.js`
Expected: FAIL — robotParty / allies / enemies not found

**Step 3: Modify `createNewRun()` in `src/game/state.js`**

Add `robotParty` to the run object (inside `createNewRun`, after `encounter: null`):

```javascript
// Robot party (run-scoped)
robotParty: {
  active: [],    // 0-3 deployed robots
  reserves: [],  // 0-3 bench robots
  maxTotal: 6
},
```

**Step 4: Modify `createCombatState()` in `src/game/state.js`**

Change `createCombatState` to include arrays:

```javascript
export function createCombatState(enemy) {
  return {
    active: true,
    turn: "player",
    turnCount: 1,
    enemy: { ...enemy },
    allies: [],    // references to run.robotParty.active
    enemies: [],   // MVP: single enemy robot
    lastAction: null,
    log: []
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `node --test tests/unit/robot-party.test.js`
Expected: PASS

**Step 6: Run existing tests to verify no regressions**

Run: `node --test tests/unit/chip-charges.test.js tests/unit/chip-skills.test.js`
Expected: PASS (combat state changes are additive)

**Step 7: Commit**

```bash
git add src/game/state.js tests/unit/robot-party.test.js
git commit -m "feat: add robotParty to run state, allies/enemies arrays to combat state"
```

---

## Task 4: Robot Combat Service

**Files:**
- Create: `src/game/services/robot-combat-service.js`
- Test: `tests/unit/robot-combat-service.test.js`

This service replaces `CombatService` for robot combat. It handles:
- Starting encounters (generate enemy robot)
- Processing attack turns (all allied robots auto-attack sequentially)
- Processing defend turns (50% damage, +1 ultimate charge)
- Befriend action
- Ultimate activation
- XP distribution after victory

**Step 1: Write failing tests**

```javascript
// tests/unit/robot-combat-service.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processAttackTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  processUltimate,
  awardBattleXp
} from '../../src/game/services/robot-combat-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Robot Combat - Attack Turn', () => {
  it('each allied robot attacks the enemy sequentially', () => {
    const allies = [instantiateRobot('fire-common'), instantiateRobot('water-common')];
    const enemies = [instantiateRobot('earth-common')];
    const result = processAttackTurn(allies, enemies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(result.attacks.length <= allies.length);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateRobot('fire-common'), instantiateRobot('water-common')];
    allies[0].hp = 0; // KO
    const enemies = [instantiateRobot('earth-common')];
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 1); // only water attacks
  });
});

describe('Robot Combat - Defend Turn', () => {
  it('all robots gain +1 ultimate charge', () => {
    const allies = [instantiateRobot('fire-common')];
    processDefendTurn(allies);
    assert.strictEqual(allies[0].ultimate.charges, 1);
  });
});

describe('Robot Combat - Enemy Turn', () => {
  it('enemy attacks allied robots using targeting AI', () => {
    const allies = [instantiateRobot('fire-common')];
    const enemies = [instantiateRobot('water-common')];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });
});

describe('Robot Combat - Befriend', () => {
  it('captures enemy at ≤30% HP', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = 20; // 20% of 100
    const party = { active: [instantiateRobot('fire-common')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(result.success);
    assert.strictEqual(enemies.length, 0); // removed from battle
  });

  it('rejects befriend if no enemy ≤30%', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = 50;
    const party = { active: [instantiateRobot('fire-common')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('rejects befriend if party full (6)', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = 20;
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common'), instantiateRobot('wood-common')],
      reserves: [instantiateRobot('metal-common'), instantiateRobot('earth-common'), instantiateRobot('fire-uncommon')],
      maxTotal: 6
    };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });
});

describe('Robot Combat - XP', () => {
  it('active robots get 100% XP, reserves get 50%', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')]
    };
    awardBattleXp(party, 100);
    assert.strictEqual(party.active[0].xp, 0);   // 100 XP → leveled up, 0 remainder
    assert.strictEqual(party.active[0].level, 2); // leveled up
    assert.strictEqual(party.reserves[0].xp, 50); // 50% of 100
    assert.strictEqual(party.reserves[0].level, 1);
  });
});
```

**Step 2: Run to verify fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL

**Step 3: Implement `src/game/services/robot-combat-service.js`**

```javascript
// src/game/services/robot-combat-service.js
import {
  calculateRobotDamage,
  getElementMultiplier,
  rollVariance,
  selectTarget,
  addXpToRobot,
  generateEnemyRobot
} from '../robots.js';
import { logger } from '../../logger.js';

/**
 * Process player attack turn: each alive allied robot auto-attacks
 */
export function processAttackTurn(allies, enemies) {
  const attacks = [];
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const target = selectTarget(robot, aliveEnemies);
    const elemMult = getElementMultiplier(robot.autoSkill.element, target.element);
    const variance = rollVariance();
    const damage = calculateRobotDamage(robot.attack, robot.autoSkill.power, elemMult, variance);
    target.hp = Math.max(0, target.hp - damage);

    attacks.push({
      attackerId: robot.id,
      attackerName: robot.nameEn,
      targetId: target.id,
      targetName: target.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: target.hp <= 0
    });
  }
  return { attacks, allEnemiesDefeated: enemies.every(e => e.hp <= 0) };
}

/**
 * Process defend turn: 50% damage reduction is handled by caller,
 * all allies gain +1 ultimate charge
 */
export function processDefendTurn(allies) {
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    robot.ultimate.charges = Math.min(
      robot.ultimate.charges + 1,
      robot.ultimate.chargesRequired
    );
  }
}

/**
 * Process enemy turn: each alive enemy robot attacks
 */
export function processEnemyTurn(enemies, allies, defendActive = false) {
  const attacks = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const target = selectTarget(enemy, aliveAllies);
    const elemMult = getElementMultiplier(enemy.autoSkill.element, target.element);
    const variance = rollVariance();
    let damage = calculateRobotDamage(enemy.attack, enemy.autoSkill.power, elemMult, variance);

    if (defendActive) {
      damage = Math.floor(damage * 0.5);
    }

    target.hp = Math.max(0, target.hp - damage);

    attacks.push({
      attackerId: enemy.id,
      attackerName: enemy.nameEn,
      targetId: target.id,
      targetName: target.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: target.hp <= 0
    });
  }
  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0) };
}

/**
 * Process befriend: capture lowest-HP enemy at ≤30%
 */
export function processBefriend(enemies, robotParty) {
  const totalRobots = robotParty.active.length + robotParty.reserves.length;
  if (totalRobots >= robotParty.maxTotal) {
    return { success: false, reason: 'Party full' };
  }

  // Find lowest HP enemy at ≤30%
  const eligible = enemies
    .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.3)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));

  if (eligible.length === 0) {
    return { success: false, reason: 'No enemy at ≤30% HP' };
  }

  const captured = eligible[0];
  // Remove from enemies array
  const idx = enemies.indexOf(captured);
  enemies.splice(idx, 1);

  // Heal captured robot to full
  captured.hp = captured.maxHp;
  captured.ultimate.charges = 0;

  // Add to party (active if < 3, otherwise reserves)
  if (robotParty.active.length < 3) {
    robotParty.active.push(captured);
  } else {
    robotParty.reserves.push(captured);
  }

  return {
    success: true,
    captured,
    allEnemiesDefeated: enemies.filter(e => e.hp > 0).length === 0
  };
}

/**
 * Fire a robot's ultimate ability (hits all enemies)
 */
export function processUltimate(robot, enemies) {
  if (robot.ultimate.charges < robot.ultimate.chargesRequired) {
    return { success: false, reason: 'Not enough charges' };
  }

  const hits = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const damage = calculateRobotDamage(robot.attack, robot.ultimate.power, elemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: enemy.hp <= 0
    });
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}

/**
 * Award XP after battle: active=100%, reserves=50%
 */
export function awardBattleXp(robotParty, baseXp) {
  for (const robot of robotParty.active) {
    if (robot.hp > 0 || robot.level > 0) { // award even to KO'd
      addXpToRobot(robot, baseXp);
    }
  }
  for (const robot of robotParty.reserves) {
    addXpToRobot(robot, Math.floor(baseXp * 0.5));
  }
}

/**
 * Handle robot KO: swap next reserve into active slot
 * @returns {object|null} The swapped-in robot, or null if no reserves
 */
export function handleRobotKO(robotParty, koRobotIndex) {
  if (robotParty.reserves.length === 0) return null;
  const replacement = robotParty.reserves.shift();
  robotParty.active[koRobotIndex] = replacement;
  return replacement;
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: robot combat service with attack/defend/befriend/ultimate/XP"
```

---

## Task 5: Integrate Robot Combat into GameManager

**Files:**
- Modify: `src/game/loop.js` — Add robot combat methods
- Modify: `src/game/services/combat-service.js` — Add robot-mode combat cycle
- Modify: `src/routes/game/combat.js` — Add robot combat endpoints

**Step 1: Add robot encounter start to `combat-service.js`**

Add a new method `startRobotEncounter()` to `CombatService` that:
1. Generates an enemy robot (via `generateEnemyRobot`)
2. Creates combat state with `allies` = `run.robotParty.active`, `enemies` = `[enemyRobot]`
3. Returns the combat state

**Step 2: Add `robotCombatCycle` to `combat-service.js`**

Add a method that accepts `actionType` ('attack' | 'defend' | 'befriend') and:
- For 'attack': calls `processAttackTurn`, then `processEnemyTurn`
- For 'defend': calls `processDefendTurn`, then `processEnemyTurn` with `defendActive=true`
- For 'befriend': calls `processBefriend`, if last enemy captured ends combat
- Handles victory: awards XP, credits
- Handles defeat: all robots KO'd → run over

**Step 3: Add `useRobotUltimate` endpoint to `combat.js` routes**

```javascript
// POST /api/game/use-robot-ultimate
router.post('/use-robot-ultimate', (req, res) => {
  const { robotIndex } = req.body;
  const gm = req.gameManager;
  // ... validate, call processUltimate, return result
});
```

**Step 4: Add `robotCombatCycle` endpoint to `combat.js` routes**

```javascript
// POST /api/game/robot-combat-cycle
router.post('/robot-combat-cycle', (req, res) => {
  const { actionType } = req.body; // 'attack' | 'defend' | 'befriend'
  const gm = req.gameManager;
  // ... call robot combat service, return result
});
```

**Step 5: Add `start-robot-encounter` endpoint**

```javascript
// POST /api/game/start-robot-encounter
router.post('/start-robot-encounter', async (req, res) => {
  const gm = req.gameManager;
  // ... generate enemy robot, create combat state, return
});
```

**Step 6: Wire up GameManager in `loop.js`**

Add delegation methods:
- `startRobotEncounter()` → delegates to combatService
- `robotCombatCycle(actionType)` → delegates to combatService
- `useRobotUltimate(robotIndex)` → delegates to combatService

**Step 7: Run E2E syntax check**

Run: `node --check src/game/services/combat-service.js && node --check src/game/loop.js && node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

**Step 8: Commit**

```bash
git add src/game/loop.js src/game/services/combat-service.js src/routes/game/combat.js
git commit -m "feat: wire robot combat into GameManager and API routes"
```

---

## Task 6: Starter Selection API

**Files:**
- Modify: `src/game/loop.js` — modify `startRun()` to include starter selection
- Modify: `src/routes/game/run.js` (or wherever start-run endpoint is)
- Test: `tests/unit/robot-starter.test.js`

**Step 1: Write failing test for starter selection**

```javascript
// tests/unit/robot-starter.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getStarterRobots } from '../../src/game/robots.js';

describe('Starter Selection', () => {
  it('returns 3 common starters: fire, water, wood', () => {
    const starters = getStarterRobots();
    assert.strictEqual(starters.length, 3);
    const elements = starters.map(s => s.element).sort();
    assert.deepStrictEqual(elements, ['fire', 'water', 'wood']);
    assert.ok(starters.every(s => s.rarity === 'common'));
  });
});
```

**Step 2: Run test**

Run: `node --test tests/unit/robot-starter.test.js`
Expected: PASS (already implemented in Task 2)

**Step 3: Modify `startRun()` in `loop.js`**

Add `starterId` parameter. On run start:
1. Call `instantiateRobot(starterId)` to create the starter
2. Set `run.robotParty.active = [starter]`
3. Keep existing run initialization for rooms (MVP: encounters only)

**Step 4: Add/modify start-run endpoint**

The start-run endpoint should accept `{ starterId: 'fire-common' | 'water-common' | 'wood-common' }` and pass it to `startRun()`.

**Step 5: Add `GET /api/game/starters` endpoint**

Returns the 3 starter options for the frontend to display.

**Step 6: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 7: Commit**

```bash
git add src/game/loop.js src/routes/game/run.js tests/unit/robot-starter.test.js
git commit -m "feat: starter robot selection on run start"
```

---

## Task 7: Frontend - Robot Slots UI (replaces chip-row.js)

**Files:**
- Create: `public/js/ui/robot-row.js`
- Modify: `public/js/ui/index.js` — add robot-row export
- Modify: `public/game.css` — add robot slot styles

**Step 1: Create `robot-row.js`**

This module renders 3 robot slots at the bottom of the combat screen (replaces the 5 chip slots from `chip-row.js`). Each slot shows:
- Robot element icon/color
- HP bar (green → red)
- Ultimate charge bar (5 segments, reuses chip charge UI pattern)
- Click → popup → "Use Ultimate" button (when fully charged)

```javascript
// public/js/ui/robot-row.js

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onUseUltimate = null;
let currentPopupIndex = -1;

const ELEMENT_COLORS = {
  wood: '#4CAF50',
  fire: '#F44336',
  earth: '#8D6E63',
  metal: '#9E9E9E',
  water: '#2196F3'
};

const ELEMENT_ICONS = {
  wood: '🌿',
  fire: '🔥',
  earth: '⛰️',
  metal: '⚙️',
  water: '💧'
};

export function init({ useUltimateCallback }) {
  onUseUltimate = useUltimateCallback;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.robot-slot') && !e.target.closest('.robot-popup')) {
      hidePopup();
    }
  });
}

export function render(robots) {
  const row = dom.chipRow; // Reuse same container
  row.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const robot = robots[i] || null;
    const slot = document.createElement('div');
    slot.className = 'robot-slot' + (robot ? '' : ' empty');
    slot.dataset.index = i;

    if (!robot) {
      slot.innerHTML = '<div class="robot-icon empty"></div>';
    } else {
      const hpPct = Math.max(0, (robot.hp / robot.maxHp) * 100);
      const chargePct = (robot.ultimate.charges / robot.ultimate.chargesRequired) * 100;
      const isCharged = robot.ultimate.charges >= robot.ultimate.chargesRequired;
      const isKO = robot.hp <= 0;

      slot.innerHTML = `
        <div class="robot-icon${isKO ? ' ko' : ''}${isCharged ? ' charged' : ''}"
             style="border-color: ${ELEMENT_COLORS[robot.element]}">
          <span class="robot-element-icon">${ELEMENT_ICONS[robot.element]}</span>
          <span class="robot-level-badge">Lv${robot.level}</span>
        </div>
        <div class="robot-hp-bar">
          <div class="robot-hp-fill" style="width: ${hpPct}%"></div>
        </div>
        <div class="robot-charge-bar">
          ${buildChargeSegments(robot.ultimate.charges, robot.ultimate.chargesRequired)}
        </div>
      `;

      if (!isKO) {
        slot.addEventListener('click', () => togglePopup(i, robot));
      }
    }
    row.appendChild(slot);
  }
}

function buildChargeSegments(charges, required) {
  let html = '';
  for (let i = 0; i < required; i++) {
    html += `<div class="charge-segment${i < charges ? ' filled' : ''}"></div>`;
  }
  return html;
}

function togglePopup(index, robot) {
  if (currentPopupIndex === index) {
    hidePopup();
    return;
  }
  showPopup(index, robot);
}

function showPopup(index, robot) {
  currentPopupIndex = index;
  const isReady = robot.ultimate.charges >= robot.ultimate.chargesRequired;

  dom.chipPopup.innerHTML = `
    <div class="robot-popup-name">${robot.name} (${robot.nameEn})</div>
    <div class="robot-popup-element">${ELEMENT_ICONS[robot.element]} ${robot.element}</div>
    <div class="robot-popup-stats">
      HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}
    </div>
    <div class="robot-popup-ultimate">
      Ultimate: ${robot.ultimate.name} (${robot.ultimate.nameEn})
      <br>Power: ${robot.ultimate.power} | Charges: ${robot.ultimate.charges}/${robot.ultimate.chargesRequired}
    </div>
    <button class="robot-popup-ultimate-btn" ${isReady ? '' : 'disabled'}>
      ${isReady ? 'Use Ultimate' : `${robot.ultimate.charges}/${robot.ultimate.chargesRequired} Charges`}
    </button>
  `;

  dom.chipPopup.classList.add('visible');

  const btn = dom.chipPopup.querySelector('.robot-popup-ultimate-btn');
  if (isReady && btn) {
    btn.addEventListener('click', () => {
      playSFX('chip-skill');
      hidePopup();
      if (onUseUltimate) onUseUltimate(index);
    });
  }
}

function hidePopup() {
  currentPopupIndex = -1;
  dom.chipPopup.classList.remove('visible');
}

export function isPopupVisible() {
  return currentPopupIndex >= 0;
}
```

**Step 2: Add robot-row to UI index**

Modify `public/js/ui/index.js` to export the new module:

```javascript
export * as robotRow from './robot-row.js';
```

**Step 3: Add CSS styles for robot slots**

Add to `public/game.css`:

```css
/* Robot Slots */
.robot-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}

.robot-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: var(--bg-dark, #1a1a2e);
  font-size: 20px;
}

.robot-icon.empty {
  border-color: #333;
  background: transparent;
}

.robot-icon.ko {
  opacity: 0.3;
  filter: grayscale(1);
}

.robot-icon.charged {
  animation: robot-charged-pulse 1.5s ease-in-out infinite;
}

@keyframes robot-charged-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(255, 215, 0, 0.4); }
  50% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.8); }
}

.robot-level-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 9px;
  background: var(--bg-dark, #1a1a2e);
  color: #ccc;
  padding: 1px 3px;
  border-radius: 3px;
  line-height: 1;
}

.robot-element-icon {
  font-size: 20px;
}

.robot-hp-bar {
  width: 44px;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.robot-hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #F44336, #4CAF50);
  transition: width 0.3s;
}

.robot-charge-bar {
  display: flex;
  gap: 1px;
}

.charge-segment {
  width: 7px;
  height: 3px;
  background: #333;
  border-radius: 1px;
}

.charge-segment.filled {
  background: var(--accent-gold, #FFD700);
}

.robot-popup-name { font-weight: bold; font-size: 14px; color: var(--text-primary); }
.robot-popup-element { font-size: 12px; color: #aaa; margin: 4px 0; }
.robot-popup-stats { font-size: 11px; color: #ccc; }
.robot-popup-ultimate { font-size: 11px; color: #aaa; margin: 8px 0; }
.robot-popup-ultimate-btn {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  background: var(--accent-gold, #FFD700);
  color: #000;
}
.robot-popup-ultimate-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}
```

**Step 4: Syntax check**

Run: `node --check public/js/ui/robot-row.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/robot-row.js public/js/ui/index.js public/game.css
git commit -m "feat: robot slots UI with HP bars, charge bars, and ultimate popup"
```

---

## Task 8: Frontend - Befriend Action Card

**Files:**
- Modify: `public/js/ui/actions.js` — add `showTripleFlashCards()` for attack/defend/befriend
- Modify: `public/js/ui/combat-loop.js` — add befriend action flow

**Step 1: Add `showTripleFlashCards` to `actions.js`**

Extend `actions.js` to support a third "Befriend" card. The function `showTripleFlashCards(attackWord, defendWord, befriendWord)` renders three swipeable cards. The `onDualCardSelect` callback already works — extend it to also accept `'befriend'` as `actionType`.

The Befriend card should:
- Only appear when `befriendAvailable` option is true
- Have distinct styling (green/friendly color)
- Use the same flash card review flow

**Step 2: Modify `combat-loop.js` to support befriend flow**

In `showNextDualCardsFromQueue()`, check if any enemy is ≤30% HP. If so and party isn't full, use `showTripleFlashCards` instead of `showDualFlashCards`.

The `resumeCombatAfterVocab` function needs to handle `actionType === 'befriend'`:
- Call `POST /api/game/robot-combat-cycle` with `{ actionType: 'befriend' }`
- If successful, animate the captured robot joining the party
- If last enemy was captured, end combat

**Step 3: Syntax check**

Run: `node --check public/js/ui/actions.js && node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/actions.js public/js/ui/combat-loop.js
git commit -m "feat: befriend action card with triple flash card support"
```

---

## Task 9: Frontend - Robot Combat Loop Integration

**Files:**
- Modify: `public/js/ui/combat-loop.js` — replace chip pipeline display with robot attack sequence
- Modify: `public/js/game.js` — wire robot-row and robot combat API calls
- Modify: `public/js/api.js` — add robot combat API functions

**Step 1: Add robot combat API functions to `api.js`**

```javascript
export async function startRobotEncounter() {
  const res = await fetch('/api/game/start-robot-encounter', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function robotCombatCycle(actionType) {
  const res = await fetch('/api/game/robot-combat-cycle', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionType })
  });
  return res.json();
}

export async function useRobotUltimate(robotIndex) {
  const res = await fetch('/api/game/use-robot-ultimate', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ robotIndex })
  });
  return res.json();
}

export async function getStarters() {
  const res = await fetch('/api/game/starters', {
    headers: getAuthHeaders()
  });
  return res.json();
}
```

**Step 2: Modify `combat-loop.js` for robot combat**

Replace `showChipActivationSequence()` with `showRobotAttackSequence()`:
- Show each robot's auto-attack damage in sequence
- Display element effectiveness text ("Super effective!" / "Not very effective...")
- Show damage numbers on enemy

Replace the chip pipeline math display (`PWR × (1 + BW) = DMG`) with a simpler robot attack log showing each robot's hit.

Update `executePlayerAttack()` to call `robotCombatCycle('attack')` instead of the old `/game/combat-cycle` endpoint.

Update `executeEnemyAttack()` to read enemy robot attack results from the new API response format.

**Step 3: Modify `game.js` to initialize robot-row**

In `game.js`, when initializing UI modules:
- Import `robotRow` from UI index
- Call `robotRow.init({ useUltimateCallback })`
- In `updateUI()`, call `robotRow.render(gameState.robotParty.active)` during combat phase
- Wire `useUltimateCallback` to call `useRobotUltimate(index)` API

**Step 4: Update `getEnrichedGameState()` in server to include `robotParty`**

In `server.js` (or wherever `getEnrichedGameState` is), ensure `robotParty` is included in the response so the frontend has party data.

**Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && node --check public/js/game.js && node --check public/js/api.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/game.js public/js/api.js
git commit -m "feat: wire robot combat loop into frontend"
```

---

## Task 10: Frontend - Starter Selection Screen

**Files:**
- Modify: `public/js/ui/exploration.js` — add starter selection UI when starting a run
- Modify: `public/game.css` — starter selection styles

**Step 1: Add starter selection to run start flow**

When the player starts a new run, instead of immediately entering the dungeon, show a screen with 3 starter robots (Fire, Water, Wood). Each card shows:
- Robot name + element icon
- Base stats (HP, ATK)
- Auto-skill name
- Ultimate name

Player taps a card to select their starter. This calls `POST /api/game/start-run` with `{ starterId }`.

**Step 2: Add CSS for starter cards**

Three horizontally-arranged cards with element-colored borders, similar to the existing chip-select card style.

**Step 3: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js public/game.css
git commit -m "feat: starter robot selection screen on run start"
```

---

## Task 11: Enemy Robot Display

**Files:**
- Modify: `public/js/ui/scene.js` — update enemy display for robots
- Modify: `public/game.css` — enemy robot styles

**Step 1: Update enemy display in scene.js**

The existing `scene.js` renders the enemy with an HP bar. Update it to also show:
- Element icon next to the enemy name
- Element-colored border on the enemy sprite area
- Robot name (Japanese + English)

The existing HP bar and damage number system should work as-is — just update the data source from `combat.enemy` to `combat.enemies[0]` (MVP: always 1 enemy).

**Step 2: Syntax check**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/ui/scene.js public/game.css
git commit -m "feat: enemy robot display with element icon and colored border"
```

---

## Task 12: Run All Tests

**Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: 154+ tests pass (existing + new robot tests)

**Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: 14+ tests pass

**Step 3: Fix any broken tests**

If existing chip-related tests break because of state.js changes, update them to account for the new `robotParty` / `allies` / `enemies` fields.

**Step 4: Run E2E tests**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 pass. Some combat-related tests may need updating since the combat flow changed.

**Step 5: Commit any test fixes**

```bash
git add -A
git commit -m "fix: update tests for robot combat system"
```

---

## Task 13: Update E2E Tests for Robot Combat

**Files:**
- Modify: `tests/e2e/specs/rooms/encounter.spec.ts` — update for robot combat flow
- Modify: `tests/e2e/specs/integration/full-playthrough.spec.ts` — update for starter selection

**Step 1: Update encounter test**

The encounter test currently expects chip pipeline behavior. Update it to:
- Expect robot attack results instead of pipeline results
- Handle the new "befriend" card when enemy is low HP
- Verify robot HP bars update after combat

**Step 2: Update full-playthrough test**

The full playthrough starts a run. Update it to:
- Select a starter robot at run start
- Proceed through encounters with robot combat

**Step 3: Run E2E tests**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 pass

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update E2E tests for robot combat system"
```

---

## Summary of Architecture Changes

| Layer | Old (Chips) | New (Robots) |
|-------|-------------|--------------|
| **Data** | `data/chips.json` (20+ chips) | `data/robots.json` (25 robots) |
| **Service** | `src/game/items/chips.js` (pipeline) | `src/game/robots.js` (element cycle, targeting) |
| **Combat** | `src/game/combat/player-actions.js` (pipeline execution) | `src/game/services/robot-combat-service.js` |
| **State** | `player.chips`, `player.equipment` | `run.robotParty` (run-scoped) |
| **Combat State** | `combat.enemy` (single) | `combat.allies[]`, `combat.enemies[]` |
| **API** | `POST /game/combat-cycle` | `POST /game/robot-combat-cycle` |
| **Frontend Slots** | `chip-row.js` (5 slots) | `robot-row.js` (3 slots) |
| **Frontend Combat** | Pipeline math display | Robot attack sequence |
| **Action Cards** | Attack / Defend | Attack / Defend / Befriend |

### Files NOT Modified (preserved as-is)
- Vocab flash card system (`actions.js` showFlashCard, word-practice.js)
- Combat effects (screen shake, damage flash — `combat-effects.js`)
- Victory/defeat modals (`modals.js`)
- Enemy HP bar rendering (`scene.js` — updated but preserved)
- TTS system
- AI narration system
- Meta-progression (essence, upgrades)
- Authentication

### Backward Compatibility
- Old chip endpoints remain functional (not removed)
- `createCombatState()` adds `allies`/`enemies` without breaking existing `enemy` field
- `createNewRun()` adds `robotParty` without removing existing chip state
- E2E tests updated incrementally

### Risk Areas
1. **combat-loop.js is 38KB** — the largest frontend file. Changes here need careful testing.
2. **game.js coordinator** — many callback wiring points. Missing one breaks combat.
3. **State serialization** — `robotParty` must survive JSON.parse/stringify for save/load.
4. **Damage balance** — formula normalization (`abilityPower / 100`) needs playtesting.
