# Game Inspector & Intent Log Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-narrating game that logs every action with expectations and cross-checks state vs DOM vs PixiJS, so an AI agent can independently find and diagnose bugs.

**Architecture:** Client-side only. Two new modules (`intent-log.js`, `inspector.js`) accept dependencies via injection (state getter, DOM querier, Pixi querier) so they're testable in Node without a browser. Intent log calls are inserted at specific call sites in combat-loop.js, scene.js, and game.js. The inspector is exposed as `window.__inspector` for Playwright access.

**Tech Stack:** Vanilla ES6 modules, Node built-in test runner, existing diagnostics.js ring buffers, existing PixiJS formation API.

**Spec:** `docs/superpowers/specs/2026-04-15-game-inspector-intent-log-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `public/js/intent-log.js` | Core logging module: `act()`, `expect()`, `check()`. Manages action context, formats `[ACT]/[EXP]/[ERR]/[CHK]` lines. |
| `public/js/inspector.js` | State-DOM-Pixi cross-checker: `checkUI()` (passive, per-action), `fullScan()` (on-demand, everything). Exposed as `window.__inspector`. |
| `tests/unit/ui/intent-log.test.js` | Unit tests for intent log formatting, action context, error detection. |
| `tests/unit/ui/inspector.test.js` | Unit tests for inspector UI consistency checks, fullScan report shape. |

### Modified Files

| File | What changes |
|------|-------------|
| `public/js/diagnostics.js` | Add `pushFailure(entry)` to action ring buffer so `[CHK] ✗` appears in bug report snapshots. |
| `public/js/ui/combat-loop.js` | Add intent log calls at: attack API call (~line 2239), defend API call (~line 2364), attack animation loop (~line 2272), KO animations, combat end check (~line 2331). |
| `public/js/ui/scene.js` | Add intent log calls at: `showFormation()` (~line 72), `hideFormation()` (~line 227), `updateEnemyHPAtIndex()` (~line 291). |
| `public/game.js` | Initialize intent log + inspector on game load. Wire inspector to `window.__inspector`. Add `getCreatureSprite` to existing formation.js import. Use existing `diagnostics` namespace import for `pushFailure` and `snapshot`. |

---

## Chunk 1: Intent Log Core Module

### Task 1: Create intent-log.js with act/expect/check API

The intent log is a state machine: `idle → acting → checked`. Each `act()` starts an action context. `expect()` adds expectations. `check()` closes the context and logs the result. Error detection happens between `act()` and `check()` by comparing diagnostic error counts.

**Files:**
- Create: `public/js/intent-log.js`
- Test: `tests/unit/ui/intent-log.test.js`

- [ ] **Step 1: Write failing tests for act/expect/check cycle**

```javascript
// tests/unit/ui/intent-log.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createIntentLog } from '../../../public/js/intent-log.js';

describe('IntentLog', () => {
  let log;
  let lines;

  beforeEach(() => {
    lines = [];
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => 0,
    });
  });

  it('logs act/expect/check cycle with pass', () => {
    log.act('Player attacks Enemy #0');
    log.expect('Enemy #0 HP: 20→5');
    log.check({ ok: true });

    assert.equal(lines.length, 3);
    assert.match(lines[0], /^\[ACT\] Player attacks Enemy #0$/);
    assert.match(lines[1], /^\[EXP\] Enemy #0 HP: 20→5$/);
    assert.match(lines[2], /^\[CHK\] ✓$/);
  });

  it('logs check failure with tag', () => {
    log.act('Combat ended');
    log.expect('Enemy row cleared');
    log.check({ ok: false, tag: 'DOM_GHOST', detail: 'Enemy #2 HP bar in DOM but KO' });

    assert.match(lines[2], /^\[CHK\] ✗ DOM_GHOST: Enemy #2 HP bar in DOM but KO$/);
  });

  it('detects console errors between act and check', () => {
    let errorCount = 0;
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => errorCount,
    });

    log.act('Player receives item');
    errorCount = 1; // simulate console error fired
    log.check({ ok: true }); // even if checks pass, error means failure

    assert.match(lines[1], /^\[ERR\] 1 console error\(s\) during action$/);
    assert.match(lines[2], /^\[CHK\] ✗ ERROR_THROWN$/);
  });

  it('supports multiple expect lines', () => {
    log.act('KO Enemy #1');
    log.expect('Sprite: animateKO');
    log.expect('HP bar: remove');
    log.expect('Turn order: exclude');
    log.check({ ok: true });

    assert.equal(lines.length, 5); // 1 act + 3 expect + 1 check
  });

  it('resets context after check', () => {
    log.act('First action');
    log.check({ ok: true });
    log.act('Second action');
    log.check({ ok: true });

    assert.equal(lines.length, 4);
    assert.match(lines[2], /^\[ACT\] Second action$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/ui/intent-log.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement intent-log.js**

```javascript
// public/js/intent-log.js

/**
 * Intent Log — narrates every game action with expectations and checks.
 *
 * Usage:
 *   const log = createIntentLog({ output: console.log, getErrorCount: () => diagnostics.errorCount() });
 *   log.act('Player attacks Enemy #0');
 *   log.expect('Enemy #0 HP: 20→5');
 *   log.check({ ok: true });
 *
 * Output:
 *   [ACT] Player attacks Enemy #0
 *   [EXP] Enemy #0 HP: 20→5
 *   [CHK] ✓
 */

export function createIntentLog({ output, getErrorCount, onFailure } = {}) {
  const write = output || console.log;
  const errCount = getErrorCount || (() => 0);
  const failCallback = onFailure || (() => {});

  let errorCountAtAct = 0;
  let acting = false;

  return {
    act(message) {
      acting = true;
      errorCountAtAct = errCount();
      write(`[ACT] ${message}`);
    },

    expect(message) {
      write(`[EXP] ${message}`);
    },

    check({ ok, tag, detail } = {}) {
      const newErrors = errCount() - errorCountAtAct;

      if (newErrors > 0) {
        write(`[ERR] ${newErrors} console error(s) during action`);
        write(`[CHK] ✗ ERROR_THROWN`);
        failCallback({ tag: 'ERROR_THROWN', detail: `${newErrors} console error(s)` });
      } else if (!ok) {
        const msg = tag && detail ? `${tag}: ${detail}` : (tag || 'FAIL');
        write(`[CHK] ✗ ${msg}`);
        failCallback({ tag, detail });
      } else {
        write(`[CHK] ✓`);
      }

      acting = false;
    },

    isActing() {
      return acting;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/ui/intent-log.test.js`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/intent-log.js tests/unit/ui/intent-log.test.js
git commit -m "feat: add intent log core module with act/expect/check API"
```

---

### Task 2: Wire intent log failures into diagnostics ring buffer

When a `[CHK] ✗` fires, it should appear in the diagnostics action buffer so bug reports include it.

**Files:**
- Modify: `public/js/diagnostics.js` — add `pushFailure()` export
- Test: `tests/unit/ui/intent-log.test.js` — add onFailure callback test

- [ ] **Step 1: Write failing test for onFailure callback**

Add to `tests/unit/client/intent-log.test.js`:

```javascript
it('calls onFailure callback on check failure', () => {
  const failures = [];
  log = createIntentLog({
    output: (line) => lines.push(line),
    getErrorCount: () => 0,
    onFailure: (f) => failures.push(f),
  });

  log.act('Item use');
  log.check({ ok: false, tag: 'LOGIC_BUG', detail: 'Item not in inventory' });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].tag, 'LOGIC_BUG');
  assert.equal(failures[0].detail, 'Item not in inventory');
});

it('calls onFailure on ERROR_THROWN', () => {
  let errorCount = 0;
  const failures = [];
  log = createIntentLog({
    output: (line) => lines.push(line),
    getErrorCount: () => errorCount,
    onFailure: (f) => failures.push(f),
  });

  log.act('Skill learn');
  errorCount = 1;
  log.check({ ok: true });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].tag, 'ERROR_THROWN');
});
```

- [ ] **Step 2: Run tests to verify new tests pass** (onFailure already implemented in Task 1)

Run: `node --test tests/unit/ui/intent-log.test.js`
Expected: All 7 tests PASS

- [ ] **Step 3: Add pushFailure to diagnostics.js**

Read `public/js/diagnostics.js` to find the `logAction` function and the action ring buffer. Add a `pushFailure` function that calls `logAction` with type `'intent_check_fail'`:

Add to `public/js/diagnostics.js` near the existing `logAction` export:

```javascript
export function pushFailure({ tag, detail }) {
  logAction('intent_check_fail', `${tag}: ${detail}`);
}
```

- [ ] **Step 4: Verify diagnostics still works**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add public/js/diagnostics.js tests/unit/ui/intent-log.test.js
git commit -m "feat: wire intent log failures into diagnostics ring buffer"
```

---

## Chunk 2: Inspector Core Module

### Task 3: Create inspector.js with UI consistency checks

The inspector compares three layers: game state, DOM elements, and PixiJS sprites. It accepts query functions as dependencies so it's testable without a browser.

**Files:**
- Create: `public/js/inspector.js`
- Test: `tests/unit/ui/inspector.test.js`

- [ ] **Step 1: Write failing tests for checkCreatures and fullScan**

```javascript
// tests/unit/ui/inspector.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInspector } from '../../../public/js/inspector.js';

describe('Inspector', () => {
  // Mock query functions that return counts/state
  function mockQueries({
    stateAllies = [], stateEnemies = [],
    domAllyBars = 0, domEnemyBars = 0,
    pixiAllySprites = [], pixiEnemySprites = [],
    phase = 'combat', errorCount = 0,
  } = {}) {
    return {
      getState: () => ({
        combat: {
          allies: stateAllies,
          enemies: stateEnemies,
        },
        run: { active: true },
      }),
      getPhase: () => phase,
      countDomBars: (side) => side === 'player' ? domAllyBars : domEnemyBars,
      getPixiSprites: (side) => side === 'player' ? pixiAllySprites : pixiEnemySprites,
      getErrorCount: () => errorCount,
    };
  }

  describe('checkCreatures', () => {
    it('returns ok when all layers match', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }, { hp: 20 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,
        domEnemyBars: 1,
        pixiAllySprites: [{ alpha: 1 }, { alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);
      assert.equal(result.mismatches.length, 0);
    });

    it('detects DOM ghost — extra HP bar', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }],  // 1 alive
        domEnemyBars: 2,              // 2 HP bars visible
        pixiEnemySprites: [{ alpha: 1 }],
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.equal(result.mismatches[0].type, 'DOM_GHOST');
      assert.match(result.mismatches[0].detail, /enemy.*dom.*2.*state.*1/i);
    });

    it('detects Pixi ghost — extra sprite visible', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }],  // 1 alive
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 0.8 }],  // 2 visible sprites
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.equal(result.mismatches[0].type, 'DOM_GHOST');
      assert.match(result.mismatches[0].detail, /pixi/i);
    });

    it('ignores KO sprites with alpha <= 0.3', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 0 }],  // 1 alive, 1 dead
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 0.3 }],  // KO sprite faded
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);
    });

    it('excludes befriended creatures from alive count', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 20, befriended: true }],  // 1 alive, 1 befriended
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }],  // only 1 visible
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);  // befriended excluded, counts match
    });

    it('detects KO sprite not faded', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 0 }],  // 1 alive, 1 dead
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 1 }],  // KO sprite still full alpha!
      }));

      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.match(result.mismatches[0].detail, /KO.*alpha/i);
    });
  });

  describe('fullScan', () => {
    it('returns structured report with summary', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }, { hp: 20 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,
        domEnemyBars: 1,
        pixiAllySprites: [{ alpha: 1 }, { alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));

      const report = inspector.fullScan();
      assert.equal(report.ok, true);
      assert.deepEqual(report.summary.allies, { state: 2, dom: 2, pixi: 2 });
      assert.deepEqual(report.summary.enemies, { state: 1, dom: 1, pixi: 1 });
    });

    it('returns zeros outside combat', () => {
      const inspector = createInspector(mockQueries({ phase: 'hub' }));
      const report = inspector.fullScan();
      assert.deepEqual(report.summary.allies, { state: 0, dom: 0, pixi: 0 });
      assert.deepEqual(report.summary.enemies, { state: 0, dom: 0, pixi: 0 });
    });

    it('collects all mismatches in report', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,       // ghost
        domEnemyBars: 2,      // ghost
        pixiAllySprites: [{ alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));

      const report = inspector.fullScan();
      assert.equal(report.ok, false);
      assert.ok(report.mismatches.length >= 2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/ui/inspector.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement inspector.js**

```javascript
// public/js/inspector.js

/**
 * Inspector — cross-checks game state vs DOM vs PixiJS.
 *
 * Accepts query functions as dependencies for testability:
 *   getState()          → { combat: { allies, enemies }, run, ... }
 *   getPhase()          → string (current phase name)
 *   countDomBars(side)  → number of visible HP bars for 'player'|'enemy'
 *   getPixiSprites(side)→ array of { alpha } objects for each sprite slot
 *   getErrorCount()     → number of console errors captured
 */

export function createInspector({ getState, getPhase, countDomBars, getPixiSprites, getErrorCount } = {}) {

  function getAliveCount(creatures) {
    if (!creatures) return 0;
    return creatures.filter(c => c.hp > 0 && !c.befriended).length;
  }

  function getVisiblePixiCount(sprites) {
    if (!sprites) return 0;
    return sprites.filter(s => s.alpha > 0.3).length;
  }

  function checkCreatures() {
    const mismatches = [];
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';

    if (!inCombat) {
      return { ok: true, mismatches };
    }

    for (const side of ['player', 'enemy']) {
      const creatures = side === 'player' ? state.combat.allies : state.combat.enemies;
      const aliveCount = getAliveCount(creatures);
      const domCount = countDomBars(side);
      const pixiSprites = getPixiSprites(side);
      const pixiVisibleCount = getVisiblePixiCount(pixiSprites);

      // Check DOM bar count matches alive count
      if (domCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} dom=${domCount} but state=${aliveCount} alive`,
        });
      }

      // Check Pixi visible sprite count matches alive count
      if (pixiVisibleCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} pixi=${pixiVisibleCount} visible but state=${aliveCount} alive`,
        });
      }

      // Check individual KO'd creatures have faded sprites
      if (creatures && pixiSprites) {
        for (let i = 0; i < creatures.length; i++) {
          const c = creatures[i];
          const s = pixiSprites[i];
          if (c && s && c.hp <= 0 && s.alpha > 0.3) {
            mismatches.push({
              type: 'DOM_GHOST',
              detail: `${side}[${i}] KO (hp=${c.hp}) but sprite alpha=${s.alpha} — should be ≤0.3`,
            });
          }
        }
      }
    }

    return {
      ok: mismatches.length === 0,
      mismatches,
    };
  }

  function fullScan() {
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';

    const creatureResult = checkCreatures();

    const summary = {
      allies: { state: 0, dom: 0, pixi: 0 },
      enemies: { state: 0, dom: 0, pixi: 0 },
    };

    if (inCombat) {
      summary.allies = {
        state: getAliveCount(state.combat.allies),
        dom: countDomBars('player'),
        pixi: getVisiblePixiCount(getPixiSprites('player')),
      };
      summary.enemies = {
        state: getAliveCount(state.combat.enemies),
        dom: countDomBars('enemy'),
        pixi: getVisiblePixiCount(getPixiSprites('enemy')),
      };
    }

    return {
      ok: creatureResult.ok,
      mismatches: creatureResult.mismatches,
      summary,
      phase,
    };
  }

  return { checkCreatures, fullScan };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/ui/inspector.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing + new tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/inspector.js tests/unit/ui/inspector.test.js
git commit -m "feat: add inspector module with state-DOM-Pixi consistency checks"
```

---

### Task 4: Initialize and expose inspector on window

Wire the intent log and inspector into the game's initialization so they're available from Playwright via `window.__inspector`.

**Files:**
- Modify: `public/game.js` — add initialization

**Important:** Read `public/game.js` before making changes. The exact initialization point depends on when the store and diagnostics are available. Look for where `diagnostics.init()` is called — the intent log should initialize right after. The HTML template is `public/index.html` (NOT `game.html`), but modules are loaded via ES6 imports from game.js so no HTML changes should be needed.

- [ ] **Step 1: Read public/game.js to find initialization sequence**

Identify:
- Where `diagnostics.init()` is called
- Where `store` is first available
- Where game state is first set
- The module import section at the top
- The existing `import { ... } from './js/pixi/formation.js'` line (add `getCreatureSprite` to it)
- The existing `import * as diagnostics from './js/diagnostics.js'` line (use `diagnostics.pushFailure` and `diagnostics.snapshot` via namespace, don't add duplicate import)

- [ ] **Step 3: Add imports and initialization to game.js**

At the top of game.js, add new imports (do NOT duplicate existing imports):
```javascript
import { createIntentLog } from './js/intent-log.js';
import { createInspector } from './js/inspector.js';
// NOTE: diagnostics is already imported as `import * as diagnostics from './js/diagnostics.js'`
// Use diagnostics.pushFailure and diagnostics.snapshot — do NOT add a second import.
// NOTE: formation.js is already imported — add getCreatureSprite to the existing import line.
```

After diagnostics init and store setup, add initialization:
```javascript
// Intent Log — narrates every game action for AI debugging
const intentLog = createIntentLog({
  output: console.log,
  getErrorCount: () => diagnostics.snapshot().consoleErrors.length,
  onFailure: (failure) => diagnostics.pushFailure(failure),
});

// Inspector — cross-checks state vs DOM vs Pixi
const inspector = createInspector({
  getState: () => store.get('gameState'),
  getPhase: () => {
    const gs = store.get('gameState');
    return gs?.phase || 'unknown';
  },
  countDomBars: (side) => {
    const container = side === 'player'
      ? document.querySelector('.player-formation')
      : document.querySelector('.enemy-formation');
    if (!container) return 0;
    // Count non-defeated, non-befriended formation slots that have HP bars.
    // scene.js only creates slots for creatures that exist (no empty placeholders).
    // Defeated slots get .defeated class (opacity → 0 via CSS animation).
    // Befriended slots get .befriended class (opacity → 0).
    return container.querySelectorAll('.formation-slot:not(.defeated):not(.befriended) .formation-hp-fill').length;
  },
  getPixiSprites: (side) => {
    // Max 3 creatures per side (formation limit). getCreatureSprite returns null for empty slots.
    const sprites = [];
    for (let i = 0; i < 3; i++) {
      const s = getCreatureSprite(side, i);
      if (s) sprites.push({ alpha: s.alpha, tint: s.tint });
      else sprites.push(null);
    }
    return sprites.filter(Boolean);
  },
});

// Expose for Playwright
window.__inspector = inspector;
window.__intentLog = intentLog;
```

**Note:** The DOM selectors above use `.defeated` and `.befriended` classes which scene.js applies to formation slots when creatures are KO'd or befriended. The implementer MUST read `public/js/ui/scene.js` to verify these class names match the actual code. Search for `defeated` and `befriended` in scene.js.

- [ ] **Step 4: Verify the game still loads**

Run: `npm run dev`
Then in a separate terminal: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: 200

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: initialize intent log and inspector, expose window.__inspector"
```

---

## Chunk 3: Combat Instrumentation

### Task 5: Instrument attack flow in combat-loop.js

Add intent log calls around the main attack API call and the attack animation loop. This is the highest-value instrumentation point — most bugs occur during combat.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Important:** Read `public/js/ui/combat-loop.js` before making changes. The line numbers below are approximate. The API call is a raw `fetch()` to `/api/game/creature-combat-cycle`, NOT a function called `creatureCombatCycle`. The result object has `playerAttacks` and `enemyAttacks` (separate arrays), NOT a combined `attacks` field. Attacks have `targetDefeated` (boolean), NOT `targetHpAfter`.

Find the actual locations by searching for:
- `creature-combat-cycle` (the fetch URL string)
- `executeCreatureMovesTurn` (the function that calls the API)
- `buildMergedInitiativeAttacks` (where turn order is computed)
- `combatEnded` (where combat end is checked)
- `showKoSwapAnimations` or `animateKO` references (where KOs are handled)

- [ ] **Step 1: Read combat-loop.js to find exact instrumentation points**

Search for:
1. The `executeCreatureMovesTurn` function definition
2. The `fetch` call to `/api/game/creature-combat-cycle` (~line 2239)
3. The loop that processes `mergedAttacks` or the attack animation sequence
4. The `result.combatEnded` check
5. Where KO'd creatures are detected and animated
6. How to access current game state — look for `getGameState` callback (set via `init()` ~line 647)

- [ ] **Step 2: Import intentLog at top of combat-loop.js**

The intent log instance needs to be accessible from combat-loop.js. Since the instance is created in game.js, either:
- (a) Export it from game.js and import it in combat-loop.js, OR
- (b) Access it via `window.__intentLog`

Use option (b) to avoid circular dependency issues:

```javascript
function getLog() { return window.__intentLog; }
```

Add this helper near the top of combat-loop.js, after the existing imports.

- [ ] **Step 3: Add intent log to attack API call**

Find the `fetch` call to `/api/game/creature-combat-cycle` inside `executeCreatureMovesTurn`. The variables `allies` and `enemies` are NOT in local scope — you need to get them via `getGameState()` (a callback injected at init time, stored as a module-level variable). Read the function to find how game state is accessed.

```javascript
// Before the API call:
const log = getLog();
if (log) {
  // Access game state via the callback — allies/enemies are NOT local variables
  const gs = getGameState();  // module-level callback, find how it's stored
  const allies = gs?.combat?.allies || [];
  const enemies = gs?.combat?.enemies || [];
  const moveDesc = choices.map(c => {
    const creature = allies[c.creatureIndex];
    const move = creature?.moves?.find(m => m.id === c.moveId);
    const target = enemies[c.targetIndex];
    return `${creature?.nameEn || '?'}→${move?.nameEn || '?'}→${target?.nameEn || '?'}`;
  }).join(', ');
  log.act(`Attack: ${moveDesc}`);
}

// ... existing fetch() call to /api/game/creature-combat-cycle ...

// After API response (result variable), before animations:
if (log) {
  // result has .allies, .enemies (post-action), .playerAttacks, .enemyAttacks
  const aliveEnemies = result.enemies.filter(e => e.hp > 0 && !e.befriended).length;
  const aliveAllies = result.allies.filter(a => a.hp > 0).length;
  log.expect(`Enemies alive: ${aliveEnemies}/${result.enemies.length}. Allies alive: ${aliveAllies}/${result.allies.length}`);

  // Check playerAttacks and enemyAttacks for KOs (targetDefeated is boolean, NOT targetHpAfter)
  for (const atk of [...(result.playerAttacks || []), ...(result.enemyAttacks || [])]) {
    if (atk.targetDefeated) {
      log.expect(`KO: target[${atk.targetIndex}] — sprite fade, HP bar remove`);
    }
  }
}
```

- [ ] **Step 4: Add inspector check after attack animations complete**

After all attack animations have played and HP bars are updated, add:

```javascript
// After animation loop completes:
if (window.__inspector) {
  const scanResult = window.__inspector.checkCreatures();
  const log = getLog();
  if (log) {
    if (scanResult.ok) {
      log.check({ ok: true });
    } else {
      const first = scanResult.mismatches[0];
      log.check({ ok: false, tag: first.type, detail: first.detail });
      // Log all mismatches
      for (const m of scanResult.mismatches.slice(1)) {
        console.warn(`[CHK] additional: ${m.type}: ${m.detail}`);
      }
    }
  }
}
```

- [ ] **Step 5: Add intent log to combat end check**

Find where `result.combatEnded` is checked. Add:

```javascript
if (result.combatEnded) {
  const log = getLog();
  if (log) {
    log.act(`Combat ended: ${result.victory ? 'VICTORY' : 'DEFEAT'}`);
    log.expect('All combat sprites cleared. Combat UI removed.');
  }
  // ... existing combat end logic ...
  // After combat cleanup:
  if (window.__inspector) {
    const scanResult = window.__inspector.fullScan();
    if (log) {
      if (scanResult.ok) {
        log.check({ ok: true });
      } else {
        const first = scanResult.mismatches[0];
        log.check({ ok: false, tag: first.type, detail: first.detail });
      }
    }
  }
}
```

- [ ] **Step 6: Verify game still works with syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: instrument combat attack flow with intent log + inspector checks"
```

---

### Task 6: Instrument defend flow and turn transitions

Add intent log calls around the defend action and turn transitions.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Find executeCreatureDefendThenPause**

Search for `executeCreatureDefendThenPause` and the defend API call (`creatureCombatCycle('defend')`).

- [ ] **Step 2: Add intent log around defend action**

```javascript
const log = getLog();
if (log) {
  log.act('Defend: all creatures defend this turn');
  log.expect('Enemy attacks only. No ally attacks this turn.');
}

// ... existing defend API call ...
const result = await creatureCombatCycle('defend');

// After animations:
if (window.__inspector && log) {
  const scan = window.__inspector.checkCreatures();
  if (scan.ok) {
    log.check({ ok: true });
  } else {
    log.check({ ok: false, tag: scan.mismatches[0].type, detail: scan.mismatches[0].detail });
  }
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: instrument combat defend flow with intent log"
```

---

### Task 7: Instrument formation rendering in scene.js

Add intent log calls when formations are shown or hidden, to catch ghost sprites at the source.

**Files:**
- Modify: `public/js/ui/scene.js`

- [ ] **Step 1: Read scene.js to find showFormation and hideFormation**

Find the exact function definitions and their parameters.

- [ ] **Step 2: Add intent log to showFormation**

**Important:** `showFormation` has TWO code paths — a fast path (same creatures by ID, only updates HP bars, returns early ~line 108) and a full rebuild path. Both paths must close the intent log action with `check()`. Read the function to find both paths.

At the start of `showFormation(side, creatures, options)`:

```javascript
const log = window.__intentLog;
if (log) {
  const alive = creatures.filter(c => c.hp > 0 && !c.befriended);
  log.act(`Show ${side} formation: ${creatures.length} total, ${alive.length} alive`);
  log.expect(`${side}: ${alive.length} visible sprites, ${alive.length} HP bars`);
}
```

On the fast-path early return (~line 108, where same creatures are already rendered):
```javascript
// Before the return statement on the fast path:
if (window.__inspector && window.__intentLog) {
  const scan = window.__inspector.checkCreatures();
  window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
}
return; // existing return
```

At the end of `showFormation` full rebuild path (after `await pixiFormation.showFormation(...)` completes — Pixi sprites are already loaded by this point, NO setTimeout needed):
```javascript
if (window.__inspector && window.__intentLog) {
  const scan = window.__inspector.checkCreatures();
  window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
}
```

- [ ] **Step 3: Add intent log to hideFormation**

At the start of `hideFormation(side)`:

```javascript
const log = window.__intentLog;
if (log) {
  log.act(`Hide ${side} formation`);
  log.expect(`${side}: 0 sprites, 0 HP bars after hide`);
}
```

After the hide logic completes:
```javascript
if (window.__inspector && window.__intentLog) {
  // Verify DOM and Pixi are actually cleared — don't assume success
  const scan = window.__inspector.checkCreatures();
  window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: instrument formation show/hide with intent log"
```

---

## Chunk 4: Game Rule Invariants (User-Validated)

### Task 8: Draft combat rule invariants for user review

This task produces a rule list for the user to validate — not code. The rules will be implemented in Task 9 after validation.

**Files:**
- Create: `docs/combat-rules-draft.md` (temporary, deleted after validation)

- [ ] **Step 1: Read combat service code**

Read these files to understand the actual game rules:
- `src/game/services/creature-combat-service.js` — KO handling, turn order, befriending
- `src/game/combat/effects.js` — buff/debuff tick, expiry, status checks
- `src/game/state.js` — combat state creation

- [ ] **Step 2: Write draft rules document**

Write a markdown file listing every invariant rule, organized by domain. Each rule has:
- Plain English description
- The code condition it checks
- Whether you're confident or unsure

Example format:
```markdown
## Turn Order
- [ ] **KO exclusion**: Creatures with `hp <= 0` must not appear in the turn execution sequence
  - Check: After server returns attacks, no attack has `attackerHp <= 0` at time of attack
  - Confidence: HIGH

- [ ] **Dead creature can't attack**: If `creature.hp <= 0` before a turn, it must not be in `result.attacks` as attacker
  - Check: `result.attacks.every(atk => atk.attackerHpBefore > 0)`
  - Confidence: HIGH — but UNSURE if there are revival mechanics

## Buffs/Debuffs
- [ ] **Duration decrement**: Every effect with `remainingTurns` must decrement by 1 each turn
  - Check: Compare effect durations before and after turn
  - Confidence: MEDIUM — unsure about turn boundaries

...
```

- [ ] **Step 3: Present to user for review**

Show the draft rules and ask the user to:
1. Correct any rules that are wrong
2. Add missing rules
3. Confirm rules marked as "unsure"

**STOP HERE — do not proceed to Task 9 until the user has reviewed and approved the rules.**

- [ ] **Step 4: Commit draft**

```bash
git add docs/combat-rules-draft.md
git commit -m "docs: draft combat rule invariants for user review"
```

---

### Task 9: Implement validated game rule invariants

After the user validates the rules from Task 8, implement them as check functions in the inspector.

**Files:**
- Modify: `public/js/inspector.js` — add `checkGameRules(result)` method
- Modify: `tests/unit/client/inspector.test.js` — add tests for rule checks

- [ ] **Step 1: Write failing tests for validated rules**

Tests will depend on which rules the user validated. General pattern:

```javascript
describe('checkGameRules', () => {
  it('detects KO creature in attack results', () => {
    const inspector = createInspector(mockQueries({ /* ... */ }));
    const result = {
      attacks: [
        { attackerSide: 'enemy', attackerIndex: 0, attackerHpBefore: 0, damage: 5 },
      ],
      enemies: [{ hp: 0 }],
    };

    const check = inspector.checkGameRules(result);
    assert.equal(check.ok, false);
    assert.equal(check.mismatches[0].type, 'LOGIC_BUG');
    assert.match(check.mismatches[0].detail, /KO.*attack/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/ui/inspector.test.js`
Expected: FAIL — checkGameRules not defined

- [ ] **Step 3: Implement checkGameRules**

Add to `createInspector` return object. Implementation depends on validated rules.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/ui/inspector.test.js`
Expected: All tests pass

- [ ] **Step 5: Wire into combat-loop.js**

After each combat turn resolves, call `inspector.checkGameRules(result)` and log via intent log.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Delete draft document, commit**

```bash
rm docs/combat-rules-draft.md
git add public/js/inspector.js tests/unit/ui/inspector.test.js
git rm docs/combat-rules-draft.md
git commit -m "feat: implement user-validated game rule invariants in inspector"
```

---

## Chunk 5: Integration Verification

### Task 10: Manual integration test via Playwright

Verify the entire system works end-to-end by playtesting through Playwright.

**Files:** No code changes. This is a verification task.

**Important:** Ask the user before launching Playwright (per CLAUDE.md rules).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Ask user permission to launch Playwright**

- [ ] **Step 3: Navigate to game, start a run**

Open `http://localhost:3000`, log in or create account, start a new run.

- [ ] **Step 4: Enter combat and verify intent log output**

Read browser console via `page.evaluate(() => /* read console */)` or check that `window.__intentLog` is defined:

```javascript
const hasLog = await page.evaluate(() => !!window.__intentLog);
const hasInspector = await page.evaluate(() => !!window.__inspector);
// Both should be true
```

- [ ] **Step 5: Set up console listener BEFORE entering combat**

To capture `[ACT]/[EXP]/[CHK]` lines, set up a Playwright console listener before navigating to combat:
```javascript
const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  if (text.startsWith('[ACT]') || text.startsWith('[EXP]') || text.startsWith('[ERR]') || text.startsWith('[CHK]')) {
    consoleLogs.push(text);
  }
});
```

- [ ] **Step 6: Fight a battle and verify intent log output**

After combat actions, check:
1. `consoleLogs` array has `[ACT]` and `[EXP]` and `[CHK]` entries
2. Call `window.__inspector.fullScan()` via `page.evaluate` and verify the report has correct creature counts
3. Check for any `[CHK] ✗` entries in the console logs

- [ ] **Step 7: Screenshot any mismatches found**

If `fullScan()` reports `ok: false`, take a screenshot and log the mismatch details.

- [ ] **Step 8: Document findings**

Report what worked, what didn't, any instrumentation points that were missed.

- [ ] **Step 9: Commit any fixes needed**

If integration testing reveals bugs in the instrumentation, fix and commit.

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | Tasks 1-2 | Intent log module with `[ACT]/[EXP]/[ERR]/[CHK]` logging, wired to diagnostics |
| 2 | Tasks 3-4 | Inspector module with state-DOM-Pixi cross-checking, exposed on `window.__inspector` |
| 3 | Tasks 5-7 | Combat fully instrumented (attacks, defends, KOs, formations) |
| 4 | Tasks 8-9 | Game rule invariants (user-validated, catches logic bugs) |
| 5 | Task 10 | End-to-end verification via Playwright |

After Chunk 5, the system is operational. Future work (not in this plan):
- Instrument non-combat actions (exploration, shops, NPC dialogue)
- Add more game rule domains (items, skills, befriending, party skills)
- Build regression test suite from bugs found during QA
- Expand fullScan checks for phase-specific UI (hub elements, shop UI, etc.)
