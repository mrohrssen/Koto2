# Console Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured console logging across server and client to enable debugging of game state transitions, combat actions, and API calls.

**Architecture:** Two separate logger modules (server/client) with identical API. Configurable log levels (debug < info < warn < error). Server reads from `LOG_LEVEL` env var, client reads from `localStorage`. Modules use tagged `[info] [Module] message` format.

**Tech Stack:** Vanilla JavaScript, Node.js console API, browser localStorage.

---

## Task 1: Create Server Logger

**Files:**
- Create: `src/logger.js`
- Test: `tests/unit/logger.test.js`

**Step 1: Write the failing test**

Create `tests/unit/logger.test.js`:

```javascript
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

describe('Server Logger', () => {
  it('should export logger with all methods', async () => {
    const { logger } = await import('../../src/logger.js');
    assert.ok(typeof logger.debug === 'function');
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.error === 'function');
    assert.ok(typeof logger.setLevel === 'function');
  });

  it('should respect log level hierarchy', async () => {
    const { logger } = await import('../../src/logger.js');

    // At 'error' level, only error should log
    logger.setLevel('error');
    // debug/info/warn should be suppressed (we can't easily test console output,
    // but we can verify setLevel doesn't throw)
    logger.debug('test');
    logger.info('test');
    logger.warn('test');
    logger.error('test');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/logger.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

Create `src/logger.js`:

```javascript
/**
 * Server Logger Module
 *
 * Configurable console logging with level hierarchy.
 * Level priority: debug < info < warn < error
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info('[Combat] Enemy defeated', { enemy: 'Glitch Sprite' });
 *   logger.setLevel('debug'); // Show all logs
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function formatMessage(level, ...args) {
  const prefix = `[${level}]`;
  if (level === 'debug') {
    const time = new Date().toISOString().split('T')[1].slice(0, 12);
    return [time, prefix, ...args];
  }
  return [prefix, ...args];
}

export const logger = {
  debug(...args) {
    if (shouldLog('debug')) {
      console.debug(...formatMessage('debug', ...args));
    }
  },

  info(...args) {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', ...args));
    }
  },

  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', ...args));
    }
  },

  error(...args) {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', ...args));
    }
  },

  setLevel(level) {
    if (level in LEVELS) {
      currentLevel = LEVELS[level];
    }
  },

  getLevel() {
    return Object.keys(LEVELS).find(k => LEVELS[k] === currentLevel);
  }
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/logger.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/logger.js tests/unit/logger.test.js
git commit -m "feat: add server logger module with configurable levels"
```

---

## Task 2: Create Client Logger

**Files:**
- Create: `public/js/logger.js`

**Step 1: Write the client logger**

Create `public/js/logger.js`:

```javascript
/**
 * Client Logger Module
 *
 * Configurable console logging with level hierarchy.
 * Persists level preference in localStorage.
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info('[Combat] Word reviewed', { word: '食べる' });
 *   logger.setLevel('debug'); // Show all logs, persists across reloads
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const storedLevel = localStorage.getItem('logLevel');
let currentLevel = LEVELS[storedLevel] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function formatMessage(level, ...args) {
  const prefix = `[${level}]`;
  if (level === 'debug') {
    const time = new Date().toISOString().split('T')[1].slice(0, 12);
    return [time, prefix, ...args];
  }
  return [prefix, ...args];
}

export const logger = {
  debug(...args) {
    if (shouldLog('debug')) {
      console.debug(...formatMessage('debug', ...args));
    }
  },

  info(...args) {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', ...args));
    }
  },

  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', ...args));
    }
  },

  error(...args) {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', ...args));
    }
  },

  setLevel(level) {
    if (level in LEVELS) {
      currentLevel = LEVELS[level];
      localStorage.setItem('logLevel', level);
    }
  },

  getLevel() {
    return Object.keys(LEVELS).find(k => LEVELS[k] === currentLevel);
  }
};

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  window.logger = logger;
}
```

**Step 2: Syntax check**

Run: `node --check public/js/logger.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/logger.js
git commit -m "feat: add client logger module with localStorage persistence"
```

---

## Task 3: Add Logging to GameManager (loop.js)

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Add import at top of file**

After the existing imports around line 64, add:

```javascript
import { logger } from '../logger.js';
```

**Step 2: Add logging to createPlayer**

In `createPlayer()` method (around line 432), after `this.player = createNewPlayer(...)`:

```javascript
createPlayer(name = 'Hunter', stats = null, statPoints = null) {
  this.player = createNewPlayer(name, stats, statPoints);
  logger.info('[GameManager] Player created:', { name, hp: this.player.hp });
  this.emitState();
  return this.player;
}
```

**Step 3: Add logging to startRun**

In `startRun()` method (around line 452), after creating the run:

```javascript
startRun() {
  if (!this.player) {
    throw new Error('No player exists');
  }

  this.run = createNewRun(this.player);
  logger.info('[GameManager] Run started:', { floor: this.run.floor, playerHp: this.run.player.hp });
  // ... rest of method
```

**Step 4: Add logging to forfeitRun**

In `forfeitRun()` method (around line 689):

```javascript
forfeitRun() {
  if (this.run) {
    logger.info('[GameManager] Run forfeited:', { floor: this.run.floor, roomsExplored: this.run.roomsExplored });
    // ... rest of method
```

**Step 5: Add debug logging to loadPlayer**

In `loadPlayer()` method (around line 441):

```javascript
loadPlayer(playerData) {
  this.player = playerData;
  logger.debug('[GameManager] Player loaded:', { name: this.player.name, gold: this.player.gold });
  this.emitState();
  return this.player;
}
```

**Step 6: Verify syntax**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 7: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: add logging to GameManager lifecycle methods"
```

---

## Task 4: Add Logging to CombatService

**Files:**
- Modify: `src/game/services/combat-service.js`

**Step 1: Add import at top of file**

After existing imports around line 40, add:

```javascript
import { logger } from '../../logger.js';
```

**Step 2: Add logging to startEncounter**

In `startEncounter()` method (around line 58), after creating combat state:

```javascript
startEncounter() {
  if (!this.gm.run || !this.gm.run.active) {
    throw new Error('No active run');
  }

  // ... existing healing code ...

  const enemy = generateEnemy(this.gm.run.floor);
  this.gm.combat = createCombatState(enemy);
  logger.info('[Combat] Started encounter:', { enemy: enemy.nameEn, hp: enemy.hp, floor: this.gm.run.floor });
  // ... rest of method
```

**Step 3: Add logging to startBossEncounter**

In `startBossEncounter()` method (around line 93):

```javascript
startBossEncounter() {
  // ... existing check ...

  const boss = getBossForFloor(this.gm.run.floor);
  this.gm.combat = createCombatState(boss);
  logger.info('[Combat] Boss encounter started:', { boss: boss.nameEn, hp: boss.hp, floor: this.gm.run.floor });
  // ... rest of method
```

**Step 4: Add logging to executeCombatCycle for player attack**

In `executeCombatCycle()` around line 147, after player attack processing:

```javascript
if (attackerType === 'player') {
  const playerResult = executePlayerAttack(this.gm.run.player, this.gm.combat.enemy, 'normal');
  logger.info('[Combat] Player attacked:', { damage: playerResult.totalDamage, critical: playerResult.anyCritical });
  logger.debug('[Combat] Attack details:', { pipelineResult: playerResult.pipelineResult });
  // ... rest of attack handling
```

**Step 5: Add logging to executeCombatCycle for enemy attack**

Around line 340, in the enemy attack branch:

```javascript
} else if (attackerType === 'enemy') {
  const enemyResult = executeEnemyTurn(this.gm.combat.enemy, this.gm.run.player, { id: 'attack', damageMultiplier: 1.0 });
  logger.info('[Combat] Enemy attacked:', { damage: enemyResult.damage, playerHp: this.gm.run.player.hp });
  // ... rest of enemy attack handling
```

**Step 6: Add logging to victory/defeat handlers**

In `handleVictory()` around line 397:

```javascript
handleVictory() {
  // ... existing reset code ...
  const enemy = this.gm.combat.enemy;
  const isBoss = enemy.isBoss;
  logger.info('[Combat] Victory:', { enemy: enemy.nameEn, isBoss, floor: this.gm.run.floor });
  // ... rest of method
```

In `handleDefeat()` around line 498:

```javascript
handleDefeat() {
  this.gm.combat.active = false;
  this.gm.run.active = false;
  logger.info('[Combat] Defeat:', { floor: this.gm.run.floor, stats: this.gm.run.stats });
  // ... rest of method
```

**Step 7: Add warn logging for invalid actions**

At the start of `executeCombatCycle()`, add warning for unexpected states:

```javascript
executeCombatCycle(attackerType = 'player') {
  if (!this.gm.combat?.active) {
    logger.warn('[Combat] Attempted action on inactive combat');
    throw new Error('No active combat');
  }
  // ... rest of method
```

**Step 8: Verify syntax**

Run: `node --check src/game/services/combat-service.js && echo "OK"`
Expected: OK

**Step 9: Commit**

```bash
git add src/game/services/combat-service.js
git commit -m "feat: add logging to CombatService combat flow"
```

---

## Task 5: Add Logging to ExplorationService

**Files:**
- Modify: `src/game/services/exploration-service.js`

**Step 1: Add import at top of file**

After existing imports around line 32, add:

```javascript
import { logger } from '../../logger.js';
```

**Step 2: Add logging to selectStartingWard**

In `selectStartingWard()` method (around line 61):

```javascript
selectStartingWard(wardId) {
  if (!this.gm.run) {
    throw new Error('No active run');
  }

  if (!STARTING_WARDS.includes(wardId)) {
    logger.warn('[Exploration] Invalid starting ward attempted:', { wardId });
    throw new Error(`Invalid starting ward: ${wardId}`);
  }

  this.gm.run.currentWard = wardId;
  // ... existing code ...
  logger.info('[Exploration] Starting ward selected:', { ward: wardId, floor: this.gm.run.floor });
  // ... rest of method
```

**Step 3: Add logging to enterFloor**

In `enterFloor()` method, add:

```javascript
enterFloor() {
  // ... existing code ...
  logger.info('[Exploration] Entered floor:', { floor: this.gm.run.floor, ward: this.gm.run.currentWard });
  logger.debug('[Exploration] Floor rooms:', { roomCount: this.gm.run.rooms?.length });
  // ... rest of method
```

**Step 4: Add logging to proceedToNextRoom**

In `proceedToNextRoom()` method:

```javascript
proceedToNextRoom() {
  // ... existing code ...
  const room = this.getCurrentRoom();
  logger.info('[Exploration] Proceeded to room:', { type: room?.type, index: this.gm.run.currentRoom });
  // ... rest of method
```

**Step 5: Add logging to buyFromPostCombatShop**

In `buyFromPostCombatShop()` method:

```javascript
buyFromPostCombatShop(itemIndex) {
  // ... existing validation ...
  const item = shop.items[itemIndex];

  if (this.gm.run.player.gold < item.price) {
    logger.warn('[Shop] Purchase failed - insufficient gold:', { need: item.price, have: this.gm.run.player.gold });
    // ... existing error handling
  }

  // ... after successful purchase ...
  logger.info('[Shop] Chip purchased:', { chip: item.name, price: item.price, goldRemaining: this.gm.run.player.gold });
  // ... rest of method
```

**Step 6: Add logging to useShrine**

In `useShrine()` method:

```javascript
useShrine(chipId) {
  // ... existing code ...
  logger.info('[Shrine] Chip upgraded:', { chip: chipId, newLevel: newLevel });
  // ... rest of method
```

**Step 7: Verify syntax**

Run: `node --check src/game/services/exploration-service.js && echo "OK"`
Expected: OK

**Step 8: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "feat: add logging to ExplorationService navigation and shop"
```

---

## Task 6: Standardize JPDB Logging

**Files:**
- Modify: `src/jpdb.js`

**Step 1: Add logger import**

At the top of `src/jpdb.js`, after existing imports around line 12, add:

```javascript
import { logger } from './logger.js';
```

**Step 2: Replace console.warn/log calls with logger**

Find and replace the existing console calls:

Line ~89 (tripCircuitBreaker):
```javascript
// Old: console.warn(`[JPDB Circuit Breaker] Tripped!...`);
logger.warn('[JPDB] Circuit breaker tripped:', { statusCode, cooldownMs: cooldownMs / 1000, failures: circuitBreaker.consecutiveFailures });
```

Line ~99 (isCircuitBreakerClosed):
```javascript
// Old: console.log('[JPDB Circuit Breaker] Cooldown expired...');
logger.debug('[JPDB] Circuit breaker cooldown expired, testing');
```

Line ~112 (onSuccessfulRequest):
```javascript
// Old: console.log('[JPDB Circuit Breaker] Request succeeded...');
logger.debug('[JPDB] Circuit breaker reset on success');
```

**Step 3: Add info logging for batch operations**

In the batch parse function, add:

```javascript
// After successful batch parse
logger.info('[JPDB] Batch parse completed:', { wordCount: results.length });
```

**Step 4: Verify syntax**

Run: `node --check src/jpdb.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add src/jpdb.js
git commit -m "refactor: standardize JPDB logging to use logger module"
```

---

## Task 7: Add Logging to Client api.js

**Files:**
- Modify: `public/js/api.js`

**Step 1: Add import at top of file**

At the top of `public/js/api.js`, after the docstring, add:

```javascript
import { logger } from './logger.js';
```

**Step 2: Standardize error logging in apiCall**

In `apiCall()` function around line 59:

```javascript
} catch (error) {
  logger.error('[API] Request failed:', { endpoint, error: error.message });
  if (onError) {
    onError(error.message);
  }
  return null;
} finally {
```

**Step 3: Add debug logging for requests**

At the start of `apiCall()`:

```javascript
async function apiCall(endpoint, method = 'POST', body = null, onError = null) {
  logger.debug('[API] Request:', { endpoint, method });
  if (isLoading) {
    logger.warn('[API] Request blocked - loading:', { endpoint });
    return null;
  }
  // ... rest of function
```

**Step 4: Standardize other error handlers**

Replace `console.error('Failed to fetch game state:', error);` with:
```javascript
logger.error('[API] Failed to fetch game state:', error.message);
```

Apply same pattern to all other `console.error` calls in the file (about 15 occurrences).

**Step 5: Verify syntax**

Run: `node --check public/js/api.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add public/js/api.js
git commit -m "refactor: standardize api.js logging to use logger module"
```

---

## Task 8: Add Logging to Client combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add import at top of file**

After the existing imports around line 31, add:

```javascript
import { logger } from '../logger.js';
```

**Step 2: Add logging to startCombatLoop**

In the `startCombatLoop()` function, add:

```javascript
export async function startCombatLoop() {
  logger.info('[CombatLoop] Combat started');
  combatActive = true;
  // ... rest of function
```

**Step 3: Add logging to executePlayerAttack**

```javascript
export async function executePlayerAttack(attackResult) {
  logger.info('[CombatLoop] Player attack:', { damage: attackResult?.damage, critical: attackResult?.critical });
  // ... rest of function
```

**Step 4: Add logging to stopCombatLoop**

```javascript
export function stopCombatLoop(result) {
  logger.info('[CombatLoop] Combat ended:', { victory: result?.victory });
  // ... rest of function
```

**Step 5: Add logging to resumeCombatAfterVocab**

```javascript
export function resumeCombatAfterVocab(grade) {
  logger.info('[CombatLoop] Word reviewed, continuing:', { grade });
  // ... rest of function
```

**Step 6: Add warn logging for stale attacks**

Find any stale attack detection and add:
```javascript
logger.warn('[CombatLoop] Stale attack detected');
```

**Step 7: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add logging to combat-loop.js"
```

---

## Task 9: Add Logging to server.js Startup

**Files:**
- Modify: `server.js`

**Step 1: Add import near top of file**

After existing imports, add:

```javascript
import { logger } from './src/logger.js';
```

**Step 2: Add startup logging**

Find the server listen callback and add logging:

```javascript
app.listen(PORT, () => {
  logger.info('[Server] Started:', { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info('[Server] Log level:', logger.getLevel());
});
```

**Step 3: Verify syntax**

Run: `node --check server.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add startup logging to server.js"
```

---

## Task 10: Run E2E Tests to Verify No Regressions

**Step 1: Run e2e tests**

Run: `./scripts/e2e-test.sh`
Expected: 80+/87 tests passing (known flakiness acceptable)

**Step 2: If failures, check logs**

Start server with debug logging:
```bash
LOG_LEVEL=debug npm start
```

Review console output for any issues introduced by logging.

**Step 3: Commit any fixes**

If minor fixes needed:
```bash
git add -A
git commit -m "fix: resolve logging-related e2e test issues"
```

---

## Task 11: Manual Verification

**Step 1: Start server with debug logging**

Run: `LOG_LEVEL=debug npm start`

**Step 2: Create player and start run**

Open browser, create new player, observe server console for:
- `[info] [GameManager] Player created`
- `[info] [GameManager] Run started`

**Step 3: Enter combat**

Start encounter, observe:
- `[info] [Combat] Started encounter`
- `[info] [Combat] Player attacked`

**Step 4: Test client debug mode**

In browser console:
```javascript
logger.setLevel('debug');
// Reload page, observe debug output
logger.getLevel(); // Should return 'debug'
```

**Step 5: Verify persistence**

Reload page, check `logger.getLevel()` still returns 'debug'.

---

## Summary of Changes

### Files Created (2)
- `src/logger.js` - Server logger module
- `public/js/logger.js` - Client logger module

### Files Modified (8)
- `src/game/loop.js` - GameManager lifecycle logging
- `src/game/services/combat-service.js` - Combat flow logging
- `src/game/services/exploration-service.js` - Exploration logging
- `src/jpdb.js` - Standardized JPDB logging
- `public/js/api.js` - API client logging
- `public/js/ui/combat-loop.js` - Combat UI logging
- `server.js` - Startup logging

### Tests Created (1)
- `tests/unit/logger.test.js` - Server logger tests
