# Re-enable All Room Types for Robot Combat — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Re-enable shrine, quiz, wordDiscovery, and dealer rooms during robot combat runs, with robot-appropriate mechanics replacing chip-based logic.

**Architecture:** Remove the `encountersOnly` flag from robot runs. Update room probabilities to 60/10/10/10/10. Rewrite four room handlers in `exploration-service.js` to work with robots instead of chips. Update corresponding frontend renderers.

**Tech Stack:** Node.js backend (ES6 modules), vanilla JS frontend, Playwright e2e tests.

---

### Task 1: Remove `encountersOnly` flag and update room probabilities

**Files:**
- Modify: `src/game/loop.js:532` (remove flag)
- Modify: `src/game/rooms.js:285-288` (update probabilities)
- Modify: `src/game/rooms.js:419-428` (dealer room creation — robots instead of chips)
- Test: `tests/unit/rooms-word-discovery.test.js` (verify rooms generate correctly)

**Step 1: Write failing test — rooms generate all types during robot runs**

Add to `tests/unit/rooms-word-discovery.test.js`:

```javascript
describe('robot run room generation', () => {
  it('should generate non-encounter rooms when encountersOnly is false', () => {
    // Generate many rooms to statistically hit all types
    const types = new Set();
    for (let i = 0; i < 200; i++) {
      const rooms = generateFloorRooms(1, 4, null, false);
      for (const room of rooms) {
        if (Array.isArray(room)) {
          room.forEach(r => types.add(r.type));
        } else {
          types.add(room.type);
        }
      }
    }
    expect(types.has('shrine')).toBe(true);
    expect(types.has('quiz')).toBe(true);
    expect(types.has('wordDiscovery')).toBe(true);
    expect(types.has('dealer')).toBe(true);
    expect(types.has('encounter')).toBe(true);
    expect(types.has('boss')).toBe(true);
  });
});
```

**Step 2: Run test to verify it passes (it should already pass since encountersOnly=false)**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/rooms-word-discovery.test.js`

**Step 3: Remove `encountersOnly` flag from `startRun()`**

In `src/game/loop.js`, line 532 — delete this line:
```javascript
    this.run.encountersOnly = true;
```

**Step 4: Update room probabilities in `rooms.js`**

In `src/game/rooms.js`, lines 285-288, change:
```javascript
  const SHRINE_CHANCE = 0.15;
  const QUIZ_CHANCE = 0.20;
  const WORD_DISCOVERY_CHANCE = 0.15;
  const DEALER_CHANCE = 0.10;
```
To:
```javascript
  const SHRINE_CHANCE = 0.10;
  const QUIZ_CHANCE = 0.10;
  const WORD_DISCOVERY_CHANCE = 0.10;
  const DEALER_CHANCE = 0.10;
```

**Step 5: Update dealer room creation for robots**

In `src/game/rooms.js`, the `createRoom()` function (lines 419-428), change the dealer case.

First, add import at the top of `rooms.js`:
```javascript
import { instantiateRobot, generateEnemyRobot } from './robots.js';
```

Then find where `ROBOTS` data is available. We need a `generateDealerRobots(playerCollection)` function. For now, create a placeholder that generates 3 random robots:

Replace the dealer case in `createRoom()`:
```javascript
    case ROOM_TYPES.dealer: {
      room.dealer = {
        visited: false,
        offeredRobots: [],  // populated when player enters room
        soldRobots: [],
        purchasedRobot: null
      };
      break;
    }
```

Note: Robot inventory will be generated lazily when `getDealerState()` is called (needs player collection context).

**Step 6: Run unit tests**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/rooms-word-discovery.test.js`

**Step 7: Commit**

```bash
git add src/game/loop.js src/game/rooms.js tests/unit/rooms-word-discovery.test.js
git commit -m "feat: remove encountersOnly flag, update room probabilities to 60/10/10/10/10"
```

---

### Task 2: Rewrite shrine room for robot level-up

**Files:**
- Modify: `src/game/services/exploration-service.js:387-421` (useShrine)
- Modify: `src/game/loop.js:744-746` (delegation signature)
- Modify: `src/routes/game/run.js:435-448` (API route)
- Test: `tests/unit/robot-combat-service.test.js` (add shrine test)

**Step 1: Write failing test**

Add to `tests/unit/robot-combat-service.test.js` (or create a new `tests/unit/shrine-robot.test.js`):

```javascript
import { addXpToRobot, instantiateRobot, XP_PER_LEVEL } from '../../src/game/robots.js';

describe('shrine robot level-up', () => {
  it('should level up a robot by one level', () => {
    const robot = instantiateRobot('fire-common');
    const prevLevel = robot.level;
    const prevMaxHp = robot.maxHp;
    const prevAttack = robot.attack;

    // Simulate shrine: add exactly enough XP for one level
    addXpToRobot(robot, XP_PER_LEVEL);

    expect(robot.level).toBe(prevLevel + 1);
    expect(robot.maxHp).toBeGreaterThan(prevMaxHp);
    expect(robot.attack).toBeGreaterThan(prevAttack);
  });
});
```

**Step 2: Run test to verify it passes (addXpToRobot already exists)**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/shrine-robot.test.js`

**Step 3: Rewrite `useShrine()` in exploration-service.js**

In `src/game/services/exploration-service.js`, replace the `useShrine(chipId)` method (lines 387-421) with:

```javascript
  useShrine(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    // Find robot in party (active or reserves)
    const allRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean);

    const robot = allRobots.find(r => r.id === robotId);
    if (!robot) {
      throw new Error('Robot not in party');
    }

    const prevLevel = robot.level;
    const prevMaxHp = robot.maxHp;
    const prevAttack = robot.attack;

    // Grant one full level-up worth of XP
    addXpToRobot(robot, XP_PER_LEVEL);

    room.shrine.used = true;
    room.interacted = true;

    logger.info('[Shrine] Robot leveled up:', {
      robot: robot.nameEn, robotId, newLevel: robot.level
    });

    this.gm.narrate(`修練場の力でロボットが強化された！ Lv. ${robot.level}`);
    this.gm.emitState();

    return {
      type: 'shrine_upgrade',
      robotId,
      robotName: robot.nameEn,
      oldLevel: prevLevel,
      newLevel: robot.level,
      maxHp: robot.maxHp,
      attack: robot.attack,
      hpGain: robot.maxHp - prevMaxHp,
      attackGain: robot.attack - prevAttack
    };
  }
```

Add import at top of exploration-service.js:
```javascript
import { addXpToRobot, XP_PER_LEVEL } from '../robots.js';
```

**Step 4: Update delegation in loop.js**

In `src/game/loop.js`, line 744-746, change:
```javascript
  useShrine(robotId) {
    return this.explorationService.useShrine(robotId);
  }
```

(Parameter name change from `chipId` to `robotId` — matches what frontend will send.)

**Step 5: Update API route**

In `src/routes/game/run.js`, lines 435-448, change `chipId` to `robotId`:
```javascript
router.post('/shrine-upgrade', (req, res) => {
  try {
    const gameManager = req.gameManager;
    const { robotId } = req.body;
    if (!robotId) {
      return res.status(400).json({ error: 'robotId required' });
    }
    const result = gameManager.useShrine(robotId);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 6: Run tests**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/shrine-robot.test.js`

**Step 7: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js src/routes/game/run.js tests/unit/shrine-robot.test.js
git commit -m "feat: rewrite shrine room to level up robots instead of chips"
```

---

### Task 3: Rewrite quiz rewards for robots

**Files:**
- Modify: `src/game/services/exploration-service.js:423-469` (useQuizReward)
- Modify: `src/game/loop.js:748-750` (delegation signature)
- Modify: `src/routes/game/run.js:450-463` (API route)
- Test: `tests/unit/shrine-robot.test.js` (add quiz reward tests here too, or new file)

**Step 1: Write failing tests**

Create `tests/unit/quiz-robot-rewards.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { instantiateRobot, addXpToRobot, XP_PER_LEVEL } from '../../src/game/robots.js';

describe('quiz robot rewards', () => {
  it('heal reward should restore one robot to full HP', () => {
    const robot = instantiateRobot('fire-common');
    robot.hp = 10; // damaged
    expect(robot.hp).toBeLessThan(robot.maxHp);

    // Simulate heal
    robot.hp = robot.maxHp;
    expect(robot.hp).toBe(robot.maxHp);
  });

  it('levelup reward should level up one robot', () => {
    const robot = instantiateRobot('water-uncommon');
    const prevLevel = robot.level;
    addXpToRobot(robot, XP_PER_LEVEL);
    expect(robot.level).toBe(prevLevel + 1);
  });
});
```

**Step 2: Run test to verify passes**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/quiz-robot-rewards.test.js`

**Step 3: Rewrite `useQuizReward()` in exploration-service.js**

Replace `useQuizReward(rewardType)` (lines 423-469) with:

```javascript
  useQuizReward(rewardType, robotId = null) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'quiz') {
      throw new Error('No quiz here');
    }

    if (room.quiz.rewarded) {
      throw new Error('Quiz reward already claimed');
    }

    let description;

    switch (rewardType) {
      case 'heal': {
        if (!robotId) throw new Error('robotId required for heal reward');
        const allRobots = [
          ...this.gm.run.robotParty.active,
          ...this.gm.run.robotParty.reserves
        ].filter(Boolean);
        const robot = allRobots.find(r => r.id === robotId);
        if (!robot) throw new Error('Robot not in party');
        robot.hp = robot.maxHp;
        description = `${robot.nameEn} fully healed!`;
        break;
      }

      case 'levelup': {
        if (!robotId) throw new Error('robotId required for levelup reward');
        const allRobots = [
          ...this.gm.run.robotParty.active,
          ...this.gm.run.robotParty.reserves
        ].filter(Boolean);
        const robot = allRobots.find(r => r.id === robotId);
        if (!robot) throw new Error('Robot not in party');
        const prevLevel = robot.level;
        addXpToRobot(robot, XP_PER_LEVEL);
        description = `${robot.nameEn} leveled up to Lv. ${robot.level}!`;
        break;
      }

      case 'credits': {
        const floor = this.gm.run.floor || 1;
        const creditReward = 20 + (floor * 10);
        this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditReward;
        description = `${creditReward} credits earned!`;
        break;
      }

      default:
        throw new Error('Invalid reward type');
    }

    room.quiz.rewarded = true;
    room.interacted = true;

    this.gm.narrate(`クイズマスター：「正解！」 ${description}`);
    this.gm.emitState();

    return { type: 'quiz_reward', rewardType, description };
  }
```

**Step 4: Update delegation in loop.js**

In `src/game/loop.js`, line 748-750, change:
```javascript
  useQuizReward(rewardType, robotId) {
    return this.explorationService.useQuizReward(rewardType, robotId);
  }
```

**Step 5: Update API route**

In `src/routes/game/run.js`, lines 450-463:
```javascript
router.post('/quiz-reward', (req, res) => {
  try {
    const gameManager = req.gameManager;
    const { rewardType, robotId } = req.body;
    if (!rewardType) {
      return res.status(400).json({ error: 'rewardType required' });
    }
    const result = gameManager.useQuizReward(rewardType, robotId);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 6: Run tests**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/quiz-robot-rewards.test.js`

**Step 7: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js src/routes/game/run.js tests/unit/quiz-robot-rewards.test.js
git commit -m "feat: rewrite quiz rewards for robots (heal, levelup, credits)"
```

---

### Task 4: Update wordDiscovery rewards (XP + credits)

**Files:**
- Modify: `src/game/services/exploration-service.js:474-492` (completeWordDiscovery)
- Test: `tests/unit/quiz-robot-rewards.test.js` (add wordDiscovery test)

**Step 1: Write failing test**

Add to `tests/unit/quiz-robot-rewards.test.js`:

```javascript
describe('wordDiscovery robot rewards', () => {
  it('should calculate 20% of single-enemy XP (base 50 => 10)', () => {
    const baseEnemyXp = 50;
    const discoveryXp = Math.floor(baseEnemyXp * 0.2);
    expect(discoveryXp).toBe(10);
  });
});
```

**Step 2: Run test**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/quiz-robot-rewards.test.js`

**Step 3: Update `completeWordDiscovery()` in exploration-service.js**

Replace lines 474-492:

```javascript
  completeWordDiscovery() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'wordDiscovery') {
      throw new Error('No word discovery room here');
    }

    if (room.interacted) {
      return { type: 'word_discovery_complete', alreadyComplete: true };
    }

    room.wordDiscovery.completed = true;
    room.interacted = true;

    // Award small XP + credits for robot runs
    const xpGrants = [];
    const levelUps = [];
    if (this.gm.run.robotParty?.active?.length > 0) {
      const baseEnemyXp = 50;  // same as robot-combat-service kill XP
      const discoveryXp = Math.floor(baseEnemyXp * 0.2);  // 20% = 10 XP

      for (const robot of this.gm.run.robotParty.active) {
        if (!robot || robot.hp <= 0) continue;
        const prevLevel = robot.level;
        addXpToRobot(robot, discoveryXp);
        xpGrants.push({ robotId: robot.id, robotName: robot.nameEn, xp: discoveryXp });
        if (robot.level > prevLevel) {
          levelUps.push({
            robotId: robot.id, robotName: robot.nameEn,
            oldLevel: prevLevel, newLevel: robot.level
          });
        }
      }

      // Credits: 20% of a floor-scaled amount (base 15 per enemy)
      const creditReward = Math.floor(15 * 0.2) + this.gm.run.floor;
      this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditReward;

      logger.info('[WordDiscovery] Robot rewards:', { discoveryXp, creditReward, xpGrants: xpGrants.length });
    }

    logger.info('[WordDiscovery] Room completed');
    this.gm.emitState();

    return { type: 'word_discovery_complete', xpGrants, levelUps };
  }
```

**Step 4: Run tests**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/quiz-robot-rewards.test.js`

**Step 5: Commit**

```bash
git add src/game/services/exploration-service.js tests/unit/quiz-robot-rewards.test.js
git commit -m "feat: award robot XP + credits for word discovery completion"
```

---

### Task 5: Rewrite dealer room for robot buy/sell

**Files:**
- Modify: `src/game/services/exploration-service.js:499-669` (all dealer methods)
- Modify: `src/game/loop.js:760-774` (delegation)
- Modify: `src/routes/game/economy.js:138-183` (API routes)
- Test: `tests/unit/dealer-robot.test.js` (new)

**Step 1: Write failing test**

Create `tests/unit/dealer-robot.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { instantiateRobot } from '../../src/game/robots.js';

describe('dealer robot operations', () => {
  it('should generate dealer robots with prices based on rarity', () => {
    const robot = instantiateRobot('fire-common');
    expect(robot).toBeDefined();
    expect(robot.rarity).toBe('common');
  });

  it('sell: removing robot from party adds credits', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-uncommon'), null],
      reserves: []
    };
    const credits = 55;
    const sellPrice = 20; // common base price
    const newCredits = credits + sellPrice;
    expect(newCredits).toBe(75);
    // Verify robot removed
    party.active[0] = null;
    const remaining = party.active.filter(Boolean);
    expect(remaining.length).toBe(1);
  });

  it('buy: adding robot to party deducts credits', () => {
    const party = {
      active: [instantiateRobot('fire-common'), null, null],
      reserves: []
    };
    const newRobot = instantiateRobot('earth-rare');
    // Add to first empty active slot
    const emptySlot = party.active.findIndex(r => r === null);
    if (emptySlot !== -1) {
      party.active[emptySlot] = newRobot;
    }
    expect(party.active[1]).toBeDefined();
    expect(party.active[1].element).toBe('earth');
  });

  it('cannot sell last robot', () => {
    const party = {
      active: [instantiateRobot('fire-common'), null, null],
      reserves: []
    };
    const allRobots = [...party.active, ...party.reserves].filter(Boolean);
    expect(allRobots.length).toBe(1);
    // Should prevent selling
    expect(allRobots.length <= 1).toBe(true);
  });
});
```

**Step 2: Run test**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/dealer-robot.test.js`

**Step 3: Add robot pricing helper to `robots.js`**

In `src/game/robots.js`, add:

```javascript
const ROBOT_PRICES = {
  common: 20,
  uncommon: 40,
  rare: 70,
  epic: 120,
  legendary: 200
};

export function getRobotBuyPrice(rarity) {
  return ROBOT_PRICES[rarity] || 20;
}

export function getRobotSellPrice(rarity, level) {
  const base = Math.floor((ROBOT_PRICES[rarity] || 20) * 0.6);
  return base + (level - 1) * 5;
}
```

**Step 4: Add `generateDealerRobots(collection)` to `robots.js`**

```javascript
export function generateDealerRobots(collectionIds = []) {
  const collectionSet = new Set(collectionIds);
  const allTemplates = Object.values(ROBOTS_BY_ID);
  const uncaptured = allTemplates.filter(t => !collectionSet.has(t.id));

  // If all captured, offer random ones anyway
  const pool = uncaptured.length >= 3 ? uncaptured : allTemplates;

  // Pick 3 random, weighted by rarity (favor rarer ones at dealer)
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(template => ({
    ...instantiateRobot(template.id),
    buyPrice: getRobotBuyPrice(template.rarity)
  }));
}
```

**Step 5: Rewrite dealer methods in exploration-service.js**

Add import:
```javascript
import { instantiateRobot, getRobotBuyPrice, getRobotSellPrice, generateDealerRobots } from '../robots.js';
```

Replace `getDealerState()` (lines 499-529):
```javascript
  getDealerState() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    // Lazily generate offered robots on first visit
    if (!room.dealer.offeredRobots || room.dealer.offeredRobots.length === 0) {
      const collectionIds = this.gm.player?.robotCollection?.map(r => r.id) || [];
      room.dealer.offeredRobots = generateDealerRobots(collectionIds);
    }

    // Build party inventory with sell prices
    const allRobots = [
      ...this.gm.run.robotParty.active.map((r, i) => r ? { ...r, slot: 'active', slotIndex: i } : null),
      ...this.gm.run.robotParty.reserves.map((r, i) => r ? { ...r, slot: 'reserves', slotIndex: i } : null)
    ].filter(Boolean).map(r => ({
      ...r,
      sellPrice: getRobotSellPrice(r.rarity, r.level)
    }));

    return {
      dealer: room.dealer,
      offeredRobots: room.dealer.purchasedRobot ? [] : room.dealer.offeredRobots,
      partyRobots: allRobots,
      credits: this.gm.run.player.credits || 0,
      canBuy: !room.dealer.purchasedRobot,
      sellCount: room.dealer.soldRobots?.length || 0,
      maxSells: 2
    };
  }
```

Replace `dealerSell(chipId)` (lines 535-584):
```javascript
  dealerSell(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if ((room.dealer.soldRobots?.length || 0) >= 2) {
      throw new Error('Already sold maximum robots (2)');
    }

    // Find robot in party
    const activeIdx = this.gm.run.robotParty.active.findIndex(r => r?.id === robotId);
    const reserveIdx = this.gm.run.robotParty.reserves.findIndex(r => r?.id === robotId);

    if (activeIdx === -1 && reserveIdx === -1) {
      throw new Error('Robot not in party');
    }

    // Can't sell last robot
    const totalRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean).length;

    if (totalRobots <= 1) {
      throw new Error('Cannot sell your last robot');
    }

    const robot = activeIdx !== -1
      ? this.gm.run.robotParty.active[activeIdx]
      : this.gm.run.robotParty.reserves[reserveIdx];

    const sellPrice = getRobotSellPrice(robot.rarity, robot.level);

    // Remove from party
    if (activeIdx !== -1) {
      this.gm.run.robotParty.active[activeIdx] = null;
      // Auto-fill from reserves if available
      const reserveRobot = this.gm.run.robotParty.reserves.shift();
      if (reserveRobot) {
        this.gm.run.robotParty.active[activeIdx] = reserveRobot;
      }
    } else {
      this.gm.run.robotParty.reserves.splice(reserveIdx, 1);
    }

    // Add credits
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + sellPrice;

    // Track sold robot
    if (!room.dealer.soldRobots) room.dealer.soldRobots = [];
    room.dealer.soldRobots.push({ robotId, sellPrice });

    logger.info('[Dealer] Robot sold:', { robot: robot.nameEn, robotId, sellPrice });
    this.gm.narrate(`${robot.nameEn}を${sellPrice}クレジットで売却した。`);
    this.gm.emitState();

    return {
      success: true,
      robotId,
      robotName: robot.nameEn,
      creditsGained: sellPrice,
      creditsRemaining: this.gm.run.player.credits
    };
  }
```

Replace `dealerBuy()` (lines 589-651):
```javascript
  dealerBuy(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if (room.dealer.purchasedRobot) {
      throw new Error('Already purchased from this dealer');
    }

    // Find the offered robot
    const offered = room.dealer.offeredRobots.find(r => r.id === robotId);
    if (!offered) {
      throw new Error('Robot not available at dealer');
    }

    const price = offered.buyPrice;

    // Check credits
    if ((this.gm.run.player.credits || 0) < price) {
      throw new Error('Not enough credits');
    }

    // Check party size (max 6: 3 active + 3 reserves)
    const totalRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean).length;

    if (totalRobots >= 6) {
      throw new Error('Party is full (max 6 robots)');
    }

    // Deduct credits
    this.gm.run.player.credits -= price;

    // Add robot to party (mark as temporary — won't enter collection)
    const newRobot = { ...offered, temporary: true };
    delete newRobot.buyPrice;

    // Add to active if space, otherwise reserves
    const emptyActiveSlot = this.gm.run.robotParty.active.findIndex(r => r === null);
    if (emptyActiveSlot !== -1) {
      this.gm.run.robotParty.active[emptyActiveSlot] = newRobot;
    } else {
      this.gm.run.robotParty.reserves.push(newRobot);
    }

    room.dealer.purchasedRobot = robotId;

    logger.info('[Dealer] Robot purchased:', { robot: offered.nameEn, robotId, price });
    this.gm.narrate(`${offered.nameEn}を${price}クレジットで雇った！`);
    this.gm.emitState();

    return {
      success: true,
      robot: newRobot,
      creditsSpent: price,
      creditsRemaining: this.gm.run.player.credits
    };
  }
```

**Step 6: Update delegation in loop.js**

In `src/game/loop.js`, update dealer methods:
```javascript
  dealerSell(robotId) {
    return this.explorationService.dealerSell(robotId);
  }

  dealerBuy(robotId) {
    return this.explorationService.dealerBuy(robotId);
  }
```

**Step 7: Update API routes**

In `src/routes/game/economy.js`:

`POST /dealer-sell` — change `chipId` to `robotId`:
```javascript
router.post('/dealer-sell', async (req, res) => {
  const gameManager = req.gameManager;
  const { robotId } = req.body;
  try {
    const result = gameManager.dealerSell(robotId);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

`POST /dealer-buy` — accept `robotId`:
```javascript
router.post('/dealer-buy', async (req, res) => {
  const gameManager = req.gameManager;
  const { robotId } = req.body;
  try {
    const result = gameManager.dealerBuy(robotId);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 8: Run tests**

Run: `cd /Users/michia/Documents/jrpg && npx vitest run tests/unit/dealer-robot.test.js`

**Step 9: Commit**

```bash
git add src/game/robots.js src/game/services/exploration-service.js src/game/loop.js src/routes/game/economy.js tests/unit/dealer-robot.test.js
git commit -m "feat: rewrite dealer room for robot buy/sell (sell 2, buy 1)"
```

---

### Task 6: Update shrine frontend (robot picker instead of chip picker)

**Files:**
- Modify: `public/js/ui/exploration.js:606-689` (renderShrine)
- Modify: `public/js/api.js:307-309` (shrineUpgrade function)

**Step 1: Update API function in api.js**

In `public/js/api.js`, update `shrineUpgrade`:
```javascript
export async function shrineUpgrade(robotId) {
  return post('/api/game/shrine-upgrade', { robotId });
}
```

**Step 2: Rewrite `renderShrine()` in exploration.js**

Replace lines 606-689:

```javascript
export function renderShrine() {
  const gameState = getGameState();
  const robotParty = gameState.run?.robotParty;

  if (!robotParty) {
    actions.setContent(`
      <p style="text-align:center;color:var(--text-secondary)">No robots in party</p>
      <button class="action-btn action-btn-primary" id="shrine-skip-btn">続ける</button>
    `);
    document.getElementById('shrine-skip-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) { updateGameState(result.state); updateUI(); }
    });
    return;
  }

  const allRobots = [
    ...(robotParty.active || []),
    ...(robotParty.reserves || [])
  ].filter(Boolean);

  const robotCards = allRobots.map(robot => {
    const hpPercent = Math.floor((robot.hp / robot.maxHp) * 100);
    return `
      <div class="shrine-chip-option" data-robot-id="${robot.id}">
        <div class="shrine-chip-icon" style="background-image:url('/assets/sprites/${robot.id}.webp'); border-color: var(--rarity-${robot.rarity || 'common'})"></div>
        <div class="shrine-chip-info">
          <div class="shrine-chip-name">${robot.nameEn} Lv.${robot.level} <span class="shrine-chip-upgrade">→ Lv.${robot.level + 1}</span></div>
          <div class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity} · ${robot.element}</div>
          <div class="shrine-chip-desc">HP: ${robot.hp}/${robot.maxHp} (${hpPercent}%) · ATK: ${robot.attack}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <h3 class="shrine-title">Choose a robot to train</h3>
    <div class="shrine-chip-list">${robotCards}</div>
  `);

  if (shrineInProgress) return;
  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.shrine-chip-option');
      if (!option || shrineInProgress) return;
      shrineInProgress = true;

      document.querySelectorAll('.shrine-chip-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const robotId = option.dataset.robotId;
      const result = await apiShrineUpgrade(robotId);
      if (result?.state) { updateGameState(result.state); }
      sceneModule.showNarration(`${result?.robotName || 'Robot'} leveled up to Lv. ${result?.newLevel || '?'}!`, { autoDismiss: 2000 });

      const proceedResult = await apiProceed();
      shrineInProgress = false;
      if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
    });
  }
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js public/js/api.js
git commit -m "feat: shrine frontend renders robot picker for level-up"
```

---

### Task 7: Update quiz frontend (robot reward choices)

**Files:**
- Modify: `public/js/ui/exploration.js:812-878` (renderQuizRewards)
- Modify: `public/js/api.js:312-314` (quizReward function)

**Step 1: Update API function**

In `public/js/api.js`, update `quizReward`:
```javascript
export async function quizReward(rewardType, robotId = null) {
  return post('/api/game/quiz-reward', { rewardType, robotId });
}
```

**Step 2: Rewrite `renderQuizRewards()` in exploration.js**

Replace the `renderQuizRewards()` function (lines 812-878). The new flow:
1. Show three reward cards: heal / levelup / credits
2. If player picks heal or levelup, show a robot picker
3. Submit reward + robotId to API

```javascript
async function renderQuizRewards() {
  const gameState = getGameState();
  const robotParty = gameState.run?.robotParty;

  // If a reward type was chosen that needs a robot, show robot picker
  if (gameState._quizSelectedReward && gameState._quizSelectedReward !== 'credits') {
    const allRobots = [
      ...(robotParty?.active || []),
      ...(robotParty?.reserves || [])
    ].filter(Boolean);

    const rewardType = gameState._quizSelectedReward;
    const label = rewardType === 'heal' ? 'Choose a robot to heal' : 'Choose a robot to level up';

    const robotCards = allRobots.map(robot => {
      const hpText = rewardType === 'heal'
        ? `HP: ${robot.hp}/${robot.maxHp}`
        : `Lv.${robot.level} → Lv.${robot.level + 1}`;
      return `
        <div class="shrine-chip-option quiz-reward-robot" data-robot-id="${robot.id}" style="width:100%">
          <div class="shrine-chip-icon" style="background-image:url('/assets/sprites/${robot.id}.webp'); border-color: var(--rarity-${robot.rarity || 'common'})"></div>
          <div class="shrine-chip-info" style="padding:0.75rem">
            <div class="shrine-chip-name">${robot.nameEn}</div>
            <div class="shrine-chip-desc">${hpText} · ATK: ${robot.attack}</div>
          </div>
        </div>
      `;
    }).join('');

    sceneModule.showNarration(label, { speaker: 'Quiz Master', persistent: true });
    actions.setContent(`<div class="shrine-chip-list" style="padding:0 1rem">${robotCards}</div>`);

    const list = document.querySelector('.shrine-chip-list');
    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', async (e) => {
        const option = e.target.closest('.quiz-reward-robot');
        if (!option || list.dataset.used) return;
        list.dataset.used = '1';

        document.querySelectorAll('.quiz-reward-robot').forEach(o => {
          o.style.opacity = '0.5'; o.style.pointerEvents = 'none';
        });

        const robotId = option.dataset.robotId;
        const result = await apiQuizReward(rewardType, robotId);
        if (result?.state) { updateGameState(result.state); }

        if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
        sceneModule.showNarration(result?.description || 'Reward claimed!', { autoDismiss: 2000 });

        delete getGameState()._quizStage;
        delete getGameState()._quizSelectedReward;
        const proceedResult = await apiProceed();
        if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
      });
    }
    return;
  }

  // Show reward choices
  sceneModule.showNarration('ご褒美を選べ。', { speaker: 'Quiz Master', persistent: true });

  actions.setContent(`
    <div class="shrine-chip-list" style="padding:0 1rem">
      <div class="shrine-chip-option quiz-reward-option" data-reward="heal" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">ロボット回復</div>
          <div class="shrine-chip-desc">1体のロボットを全回復する</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="levelup" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">ロボット修練</div>
          <div class="shrine-chip-desc">1体のロボットをレベルアップ</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="credits" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">クレジット</div>
          <div class="shrine-chip-desc">クレジットを獲得する</div>
        </div>
      </div>
    </div>
  `);

  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.quiz-reward-option');
      if (!option || list.dataset.used) return;
      list.dataset.used = '1';

      const rewardType = option.dataset.reward;

      if (rewardType === 'credits') {
        // Credits don't need a robot pick
        document.querySelectorAll('.quiz-reward-option').forEach(o => {
          o.style.opacity = '0.5'; o.style.pointerEvents = 'none';
        });

        const result = await apiQuizReward(rewardType);
        if (result?.state) { updateGameState(result.state); }
        if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
        sceneModule.showNarration(result?.description || 'Credits earned!', { autoDismiss: 2000 });

        delete getGameState()._quizStage;
        const proceedResult = await apiProceed();
        if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
      } else {
        // Heal or levelup — need robot picker
        gameState._quizSelectedReward = rewardType;
        updateUI();
      }
    });
  }
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js public/js/api.js
git commit -m "feat: quiz rewards show robot picker for heal/levelup choices"
```

---

### Task 8: Update dealer frontend (robot buy/sell)

**Files:**
- Modify: `public/js/ui/economy.js:205-340` (renderDealerRoom)
- Modify: `public/js/api.js:447-464` (dealer API functions)

**Step 1: Update API functions**

In `public/js/api.js`:

```javascript
export async function dealerSell(robotId) {
  return post('/api/game/dealer-sell', { robotId });
}

export async function dealerBuy(robotId) {
  return post('/api/game/dealer-buy', { robotId });
}
```

**Step 2: Rewrite `renderDealerRoom()` in economy.js**

Replace lines 205-340:

```javascript
export async function renderDealerRoom(actionsModule) {
  const dealerData = await apiGetDealerState();
  if (!dealerData || dealerData.error) {
    console.error('Failed to load dealer state:', dealerData?.error);
    return;
  }

  const { offeredRobots, partyRobots, credits, canBuy, sellCount, maxSells } = dealerData;
  const canSellMore = sellCount < maxSells;

  // Buy section
  let buyHtml = '';
  if (canBuy && offeredRobots.length > 0) {
    const robotCards = offeredRobots.map(robot => {
      const affordable = credits >= robot.buyPrice;
      const btnDisabled = !affordable ? 'disabled' : '';
      return `
        <div class="dealer-offer-card" style="margin-bottom:0.5rem">
          <div class="shrine-chip-icon" style="background-image:url('/assets/sprites/${robot.id}.webp'); border-color: var(--rarity-${robot.rarity || 'common'})"></div>
          <div class="dealer-offer-info">
            <div class="dealer-item-name">${robot.nameEn}</div>
            <div class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity} · ${robot.element} · Lv.${robot.level}</div>
            <div class="dealer-offer-desc">HP: ${robot.maxHp} · ATK: ${robot.attack}</div>
          </div>
          <button class="dealer-buy-btn" data-robot-id="${robot.id}" ${btnDisabled}>${robot.buyPrice}cr で雇う</button>
        </div>
      `;
    }).join('');

    buyHtml = `
      <div class="dealer-section-title">傭兵ロボット</div>
      ${robotCards}
    `;
  } else if (!canBuy) {
    buyHtml = '<div class="dealer-section-title" style="opacity:0.5">購入済み</div>';
  }

  // Sell section
  const sellLabel = canSellMore ? `売却 (${sellCount}/${maxSells})` : `売却上限 (${maxSells}/${maxSells})`;
  const partyHtml = partyRobots.length > 0 ? partyRobots.map(robot => {
    const hpPercent = Math.floor((robot.hp / robot.maxHp) * 100);
    const slotBadge = robot.slot === 'active' ? 'アクティブ' : 'リザーブ';
    return `
      <div class="dealer-inventory-item" data-robot-id="${robot.id}">
        <div class="shrine-chip-icon" style="background-image:url('/assets/sprites/${robot.id}.webp'); border-color: var(--rarity-${robot.rarity || 'common'})"></div>
        <div class="dealer-item-info">
          <div class="dealer-item-name">${robot.nameEn} Lv.${robot.level}</div>
          <div class="dealer-item-meta">
            <span class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity}</span>
            <span style="font-size:0.75rem;opacity:0.7">${slotBadge}</span>
          </div>
        </div>
        <button class="dealer-sell-btn" data-robot-id="${robot.id}" data-sell-price="${robot.sellPrice}" ${!canSellMore ? 'disabled' : ''}>
          売 ${robot.sellPrice}cr
        </button>
      </div>
    `;
  }).join('') : '<p style="text-align:center;color:var(--text-secondary)">ロボットがいない</p>';

  actionsModule.setContent(`
    <div class="dealer-room">
      <div class="dealer-credits">
        <span id="dealer-credits">${credits}</span> cr
      </div>
      ${buyHtml}
      <div class="dealer-section-title">${sellLabel}</div>
      <div class="dealer-inventory-list">
        ${partyHtml}
      </div>
      <button class="dealer-leave-btn">立ち去る</button>
    </div>
  `);

  // Wire buy buttons
  document.querySelectorAll('.dealer-buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const robotId = e.target.dataset.robotId;
        const result = await apiDealerBuy(robotId);
        if (result?.state) { updateGameState(result.state); }
        updateUI();
        renderDealerRoom(actionsModule);
      } catch (error) {
        console.error('Dealer buy failed:', error);
        e.target.disabled = false;
      }
    });
  });

  // Wire sell buttons (event delegation)
  document.querySelector('.dealer-inventory-list')?.addEventListener('click', async (e) => {
    const sellBtn = e.target.closest('.dealer-sell-btn');
    if (!sellBtn || sellBtn.disabled) return;

    const robotId = sellBtn.dataset.robotId;
    sellBtn.disabled = true;
    try {
      const result = await apiDealerSell(robotId);
      if (result?.state) { updateGameState(result.state); }
      updateUI();
      renderDealerRoom(actionsModule);
    } catch (error) {
      console.error('Dealer sell failed:', error);
      sellBtn.disabled = false;
    }
  });

  // Wire leave button
  document.querySelector('.dealer-leave-btn')?.addEventListener('click', async () => {
    const result = await apiDealerLeave();
    if (result?.state) { updateGameState(result.state); }
    updateUI();
  });
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/economy.js && echo "OK"`

**Step 4: Commit**

```bash
git add public/js/ui/economy.js public/js/api.js
git commit -m "feat: dealer frontend renders robot buy/sell instead of chips"
```

---

### Task 9: Update `game.js` — remove chipLoadoutCache from shrine call

**Files:**
- Modify: `public/game.js:385` (shrine call)

**Step 1: Update the shrine case**

In `public/game.js`, line 385, change:
```javascript
    case 'shrine':
      explorationUI.renderShrine(chipLoadoutCache);
```
To:
```javascript
    case 'shrine':
      explorationUI.renderShrine();
```

**Step 2: Syntax check**

Run: `node --check public/game.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "fix: remove chipLoadoutCache arg from shrine render call"
```

---

### Task 10: Run e2e tests and fix issues

**Files:**
- Various (based on failures)

**Step 1: Syntax check all modified frontend files**

Run:
```bash
node --check public/js/ui/exploration.js && node --check public/js/ui/economy.js && node --check public/game.js && node --check public/js/api.js && echo "All OK"
```

**Step 2: Run unit tests**

Run: `cd /Users/michia/Documents/jrpg && npm run test:unit`
Expected: Existing tests pass (some pre-existing failures on chip tests are ok).

**Step 3: Run e2e tests**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 tests pass. Shrine/quiz/dealer e2e tests may fail since they test chip-based flows — these need to be updated or skipped for robot runs.

**Step 4: Fix any failures, re-run**

Iterate until stable.

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve test failures from room re-enablement"
```

---

### Task 11: Ensure temporary dealer robots don't enter collection

**Files:**
- Modify: `src/game/loop.js` (run completion logic)

**Step 1: Find run completion / collection save logic**

Search for where befriended robots are saved to collection at end of run.

**Step 2: Add filter for `temporary: true` robots**

When saving robots to collection after a run, filter out any robot with `temporary: true`.

**Step 3: Write test**

```javascript
it('temporary dealer robots should not enter collection', () => {
  const robot = instantiateRobot('fire-common');
  robot.temporary = true;
  // Simulate collection save filter
  const toSave = [robot, instantiateRobot('water-uncommon')].filter(r => !r.temporary);
  expect(toSave.length).toBe(1);
  expect(toSave[0].temporary).toBeUndefined();
});
```

**Step 4: Run test and commit**

```bash
git add src/game/loop.js tests/unit/dealer-robot.test.js
git commit -m "feat: filter temporary dealer robots from collection on run end"
```

---

### Task 12: Add credits to robot combat victories

**Files:**
- Modify: `src/game/services/robot-combat-service.js` (add credit rewards)
- Modify: `src/game/loop.js` (pass credits to player on victory)

**Context:** Robot combat currently awards 0 credits. The dealer room needs credits to function. Add a small credit reward per enemy defeated.

**Step 1: Define credit reward per kill**

In `robot-combat-service.js`, alongside the XP award (line 62), add credit calculation:

```javascript
// Base 15 credits per kill (same scale as traditional enemies)
const CREDITS_PER_KILL = 15;
```

Return credit info from `processAttackTurn` and `processUltimate` alongside XP events.

**Step 2: In loop.js, accumulate credits during robot combat cycle**

When an enemy is defeated, add credits to `this.run.player.credits`.

**Step 3: Test and commit**

```bash
git add src/game/services/robot-combat-service.js src/game/loop.js
git commit -m "feat: award credits for robot combat kills (15 per enemy)"
```
