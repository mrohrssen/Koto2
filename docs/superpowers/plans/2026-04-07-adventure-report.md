# Adventure Report Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal defeat/victory screens with a positive "Adventure Report" showing run stats, discovery progress, and word learning metrics.

**Architecture:** Server builds a `runSummary` object incrementally during the run and snapshots it before clearing run state. The forfeit endpoint returns this summary. A new frontend module renders the report in the existing takeover overlay. No new API endpoints needed — just enriched response data from `/forfeit`.

**Tech Stack:** Node.js (ES modules), vanilla JS frontend, existing CSS custom properties.

---

## Chunk 1: Server-Side Run Summary Tracking

### Task 1: Add per-run tracking fields to run state

**Files:**
- Modify: `src/game/state.js:154-237` (createNewRun)
- Test: `tests/unit/game/adventure-report.test.js` (new)

- [ ] **Step 1: Write failing test for new run state fields**

Create `tests/unit/game/adventure-report.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewRun } from '../../../src/game/state.js';

describe('adventure-report: run state tracking fields', () => {
  const mockPlayer = { name: 'Test', hp: 100, maxHp: 100, attack: 10, credits: 50 };

  it('createNewRun includes runSummary with tracking fields', () => {
    const run = createNewRun(mockPlayer);
    assert.ok(run.runSummary, 'runSummary should exist');
    assert.equal(run.runSummary.creaturesBefriended, 0);
    assert.equal(run.runSummary.creaturesDefeated, 0);
    assert.equal(run.runSummary.itemsCollected, 0);
    assert.deepStrictEqual(run.runSummary.elementsCollected, { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 });
    assert.ok(run.runSummary.wordsExposed instanceof Set || Array.isArray(run.runSummary.wordsExposed));
    assert.ok(Array.isArray(run.runSummary.wordsMastered));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: FAIL — `run.runSummary` is undefined.

- [ ] **Step 3: Add runSummary to createNewRun**

In `src/game/state.js`, add inside `createNewRun()` after the `runStats` block (after line 236, before the closing `};`):

```javascript
    // Adventure report tracking (populated during run, snapshot on end)
    runSummary: {
      creaturesBefriended: 0,
      creaturesDefeated: 0,
      itemsCollected: 0,
      elementsCollected: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
      wordsExposed: [],       // unique word strings seen this run
      wordsMastered: [],      // { word, meaning, exposures } for words crossing threshold
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js tests/unit/game/adventure-report.test.js
git commit -m "feat(adventure-report): add runSummary tracking fields to run state"
```

---

### Task 2: Add itemsDiscovered to meta-progression

**Files:**
- Modify: `src/game/state.js:39-90` (createMetaProgression)
- Modify: `src/game/manager-registry.js` (migration for existing saves)
- Test: `tests/unit/game/adventure-report.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/unit/game/adventure-report.test.js`:

```javascript
import { createMetaProgression } from '../../../src/game/state.js';

describe('adventure-report: meta-progression discovery tracking', () => {
  it('createMetaProgression includes itemsDiscovered as empty array', () => {
    const meta = createMetaProgression();
    assert.ok(Array.isArray(meta.itemsDiscovered));
    assert.equal(meta.itemsDiscovered.length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: FAIL — `meta.itemsDiscovered` is undefined.

- [ ] **Step 3: Add itemsDiscovered to createMetaProgression**

In `src/game/state.js`, add after `equippedCrests` (after line 88):

```javascript
    // Lifetime discovery tracking
    itemsDiscovered: [],   // array of item IDs ever obtained
```

- [ ] **Step 4: Add migration in manager-registry.js**

In `src/game/manager-registry.js`, find the block that patches missing fields (around line 52 where `elementDrops` is patched). Add nearby:

```javascript
          if (!data.meta.itemsDiscovered) {
            data.meta.itemsDiscovered = [];
          }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: PASS

- [ ] **Step 6: Run full test suite to check no regressions**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/state.js src/game/manager-registry.js tests/unit/game/adventure-report.test.js
git commit -m "feat(adventure-report): add itemsDiscovered to meta-progression"
```

---

### Task 3: Increment runSummary counters during gameplay

**Files:**
- Modify: `src/game/loop.js` (multiple locations)
- Test: `tests/unit/game/adventure-report.test.js` (append)

This task wires up the six counters that must be incremented as events happen during a run.

- [ ] **Step 1: Write failing tests for counter increments**

Append to `tests/unit/game/adventure-report.test.js`:

```javascript
describe('adventure-report: buildRunSummary', () => {
  it('buildRunSummary produces correct summary from run and meta state', async () => {
    // We'll test the summary builder function directly
    const { buildRunSummary } = await import('../../../src/game/adventure-report.js');

    const run = {
      areasCompleted: 3,
      areasToWin: 10,
      stats: { startTime: 1000, endTime: 61000 },
      runSummary: {
        creaturesBefriended: 2,
        creaturesDefeated: 5,
        itemsCollected: 3,
        elementsCollected: { fire: 3, water: 1, earth: 0, wood: 2, metal: 0 },
        wordsExposed: ['光', 'ください', 'こんにちは'],
        wordsMastered: [
          { word: 'ください', meaning: 'please', exposures: 5 },
          { word: 'こんにちは', meaning: 'hello', exposures: 5 },
        ],
      },
    };

    const meta = {
      lifetimeStats: { totalRuns: 7 },
      creatureCollection: ['hikaribon', 'hanatchi', 'tsukimochi', 'tetsu', 'nami', 'mori', 'iwa', 'hagane'],
      itemsDiscovered: ['ocha', 'toufu', 'ringo', 'tamago', 'sake', 'raamen', 'hon', 'kutsu', 'boushi', 'ichigo', 'bentou', 'sushi'],
    };

    const summary = buildRunSummary(run, meta);

    assert.equal(summary.areasCompleted, 3);
    assert.equal(summary.areasToWin, 10);
    assert.equal(summary.creaturesBefriended, 2);
    assert.equal(summary.creaturesDefeated, 5);
    assert.equal(summary.itemsCollected, 3);
    assert.deepStrictEqual(summary.elementsCollected, { fire: 3, water: 1, earth: 0, wood: 2, metal: 0 });
    assert.equal(summary.wordsImmersed, 3);
    assert.equal(summary.wordsMastered.length, 2);
    assert.equal(summary.runNumber, 7);
    assert.equal(summary.durationMs, 60000);
    assert.equal(summary.creaturesDiscovered, 8);
    assert.ok(summary.totalCreatures > 0, 'totalCreatures should come from creatures.json');
    assert.equal(summary.itemsDiscoveredCount, 12);
    assert.ok(summary.totalItems > 0, 'totalItems should come from items.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: FAIL — module `src/game/adventure-report.js` does not exist.

- [ ] **Step 3: Create adventure-report.js summary builder**

Create `src/game/adventure-report.js`:

```javascript
// src/game/adventure-report.js
// Builds the adventure report summary from run and meta state.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURES = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf-8'));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../data/items.json'), 'utf-8'));

/**
 * Build the adventure report summary object from run and meta state.
 * Called just before run state is cleared.
 *
 * @param {object} run - Current run state (with runSummary populated)
 * @param {object} meta - Meta-progression state
 * @returns {object} Summary object for frontend rendering
 */
export function buildRunSummary(run, meta) {
  const rs = run.runSummary || {};
  return {
    // Run metrics
    areasCompleted: run.areasCompleted || 0,
    areasToWin: run.areasToWin || 1,
    creaturesBefriended: rs.creaturesBefriended || 0,
    creaturesDefeated: rs.creaturesDefeated || 0,
    itemsCollected: rs.itemsCollected || 0,
    elementsCollected: rs.elementsCollected || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },

    // Word stats
    wordsImmersed: (rs.wordsExposed || []).length,
    wordsMastered: (rs.wordsMastered || []).sort((a, b) => (b.exposures || 0) - (a.exposures || 0)).slice(0, 5),

    // Run info
    runNumber: meta?.lifetimeStats?.totalRuns || 0,
    durationMs: (run.stats?.endTime && run.stats?.startTime)
      ? run.stats.endTime - run.stats.startTime
      : 0,

    // Discovery (lifetime)
    creaturesDiscovered: (meta?.creatureCollection || []).length,
    totalCreatures: CREATURES.length,
    itemsDiscoveredCount: (meta?.itemsDiscovered || []).length,
    totalItems: ITEMS.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: PASS

- [ ] **Step 5: Wire up creaturesDefeated counter in loop.js**

In `src/game/loop.js`, element drops are collected from defeated enemies in multiple combat resolution paths. Each location has a pattern like:

```javascript
for (const enemy of this.combat.enemies || []) {
  if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
    this.meta.elementDrops[enemy.element] = ...
  }
}
```

At **each** of these locations (approximately lines 874, 1022, 1277, 1625, 1702, 1790), add run summary tracking **inside the same `enemy.hp <= 0` check block**:

```javascript
// Inside the existing enemy defeat loop, after element drop increment:
if (this.run?.runSummary) {
  this.run.runSummary.creaturesDefeated++;
  if (enemy.element && enemy.element !== 'neutral') {
    this.run.runSummary.elementsCollected[enemy.element] =
      (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
  }
}
```

**Important:** There are ~6 nearly-identical combat resolution paths in loop.js that each handle enemy defeat. All of them must be updated. Search for `elementDropsCollected` to find each location.

- [ ] **Step 6: Wire up creaturesBefriended counter**

In `src/game/loop.js`, find `_flushPendingCaptures()` (around line 659). Inside the loop that processes `pendingCaptures`, **inside** the `if (this.meta && !creature.temporary)` block, after the `befriendCount` increment, add:

```javascript
// Inside: if (this.meta && !creature.temporary) { ... after befriendCount increment:
if (this.run?.runSummary) {
  this.run.runSummary.creaturesBefriended++;
}
```

Place it inside the `!creature.temporary` guard so temporary creatures aren't counted.

- [ ] **Step 7: Wire up itemsCollected counter**

In `src/game/loop.js`, find `selectShopItem()` (around line 1413). After the item is successfully applied, add:

```javascript
if (this.run?.runSummary) {
  this.run.runSummary.itemsCollected++;
}
```

Also add the item to `meta.itemsDiscovered` if not already present:

```javascript
if (this.meta && selectedItem?.id) {
  if (!this.meta.itemsDiscovered) this.meta.itemsDiscovered = [];
  if (!this.meta.itemsDiscovered.includes(selectedItem.id)) {
    this.meta.itemsDiscovered.push(selectedItem.id);
  }
}
```

- [ ] **Step 8: Wire up itemsCollected for friendly NPC route**

In `src/routes/game/run.js`, find the `friendly-npc-choose` route (line 675). After `applyItem()` is called (line 698), add run summary tracking:

```javascript
      applyItem(item, gm.run.creatureParty, gm.run.itemBuffs, targetIdx);
      // Track for adventure report
      if (gm.run?.runSummary) {
        gm.run.runSummary.itemsCollected++;
      }
      if (gm.meta && item?.id) {
        if (!gm.meta.itemsDiscovered) gm.meta.itemsDiscovered = [];
        if (!gm.meta.itemsDiscovered.includes(item.id)) {
          gm.meta.itemsDiscovered.push(item.id);
        }
      }
```

- [ ] **Step 9: Wire up word tracking**

In `src/game/loop.js`, find `exposeWords()` (around line 1830). Before calling `exposeWords_fn`, add run-scoped tracking:

```javascript
exposeWords(words) {
  if (!this.userId) return;

  // Track words exposed this run for adventure report
  if (this.run?.runSummary) {
    for (const entry of words) {
      const word = typeof entry === 'string' ? entry : entry?.word;
      if (word && !this.run.runSummary.wordsExposed.includes(word)) {
        this.run.runSummary.wordsExposed.push(word);
      }
    }
  }

  exposeWords_fn(this.userId, words);
}
```

For words mastered tracking, modify `src/game/bootstrap/word-knowledge.js` `exposeWords()` to return newly mastered words:

```javascript
export function exposeWords(userId, words) {
  if (!Array.isArray(words) || words.length === 0) return [];

  const wk = loadWordKnowledge(userId) || createWordKnowledge(userId);
  const newlyMastered = [];

  for (const entry of words) {
    const word = typeof entry === 'string' ? entry : entry?.word;
    const meaning = typeof entry === 'string' ? '' : (entry?.meaning || '');
    if (typeof word !== 'string' || word.length === 0) continue;

    const wasBelowThreshold = !wk.seen[word] || wk.seen[word].exposures < EXPOSURE_THRESHOLD;
    registerExposure(wk, word);

    if (wasBelowThreshold && wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
      newlyMastered.push({ word, meaning, exposures: wk.seen[word].exposures });
      const existingCards = getDeckCards(userId, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        createCard(userId, 'vocab', word, { word, meaning, reading: word });
      }
    } else if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
      // Already had a card — still create if missing
      const existingCards = getDeckCards(userId, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        createCard(userId, 'vocab', word, { word, meaning, reading: word });
      }
    }
  }

  saveWordKnowledge(wk);
  return newlyMastered;
}
```

Then in `src/game/loop.js` `exposeWords()`, capture the return value:

```javascript
exposeWords(words) {
  if (!this.userId) return;

  // Track words exposed this run
  if (this.run?.runSummary) {
    for (const entry of words) {
      const word = typeof entry === 'string' ? entry : entry?.word;
      if (word && !this.run.runSummary.wordsExposed.includes(word)) {
        this.run.runSummary.wordsExposed.push(word);
      }
    }
  }

  const newlyMastered = exposeWords_fn(this.userId, words);

  // Track words that crossed mastery threshold this run
  if (this.run?.runSummary && newlyMastered?.length) {
    this.run.runSummary.wordsMastered.push(...newlyMastered);
  }
}
```

- [ ] **Step 9: Run existing word-knowledge tests**

Run: `node --test tests/unit/word-knowledge.test.js`
Expected: PASS — the `exposeWords` function change should be backwards-compatible (it returned `undefined` before, callers didn't use the return value).

- [ ] **Step 10: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 11: Commit**

```bash
git add src/game/adventure-report.js src/game/loop.js src/game/bootstrap/word-knowledge.js tests/unit/game/adventure-report.test.js
git commit -m "feat(adventure-report): wire run summary counters and word mastery tracking"
```

---

### Task 4: Capture and return summary from forfeitRun

**Files:**
- Modify: `src/game/loop.js:1838-1857` (forfeitRun)
- Modify: `src/routes/game/run.js:456-462` (forfeit endpoint)
- Test: `tests/unit/game/adventure-report.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/unit/game/adventure-report.test.js`:

```javascript
describe('adventure-report: forfeitRun returns summary', () => {
  it('forfeitRun returns runSummary before clearing run', async () => {
    // Integration-style test using GameManager
    const { GameManager } = await import('../../../src/game/loop.js');
    const gm = new GameManager();
    gm.initMeta();
    gm.createPlayer('test');
    gm.startRun();

    // Simulate some activity
    gm.run.areasCompleted = 2;
    gm.run.runSummary.creaturesDefeated = 3;
    gm.run.runSummary.creaturesBefriended = 1;
    gm.run.runSummary.itemsCollected = 2;

    const result = gm.forfeitRun();

    assert.ok(result.runSummary, 'forfeitRun should return runSummary');
    assert.equal(result.runSummary.areasCompleted, 2);
    assert.equal(result.runSummary.creaturesDefeated, 3);
    assert.equal(result.runSummary.creaturesBefriended, 1);
    assert.equal(result.runSummary.itemsCollected, 2);
    assert.equal(gm.run, null, 'run should be cleared after forfeit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: FAIL — `result.runSummary` is undefined (forfeitRun currently returns nothing).

- [ ] **Step 3: Modify forfeitRun to accept isVictory flag and capture summary**

In `src/game/loop.js`, modify `forfeitRun()`:

**Note:** The existing code only sets `endTime` when `run.active` is true. On defeat, `run.active` is set to `false` by the combat handler, so `endTime` never gets set and duration shows 0. Fix: always set `endTime` if missing. Also accept `isVictory` parameter so victory runs record `runsCompleted` correctly.

```javascript
  forfeitRun(isVictory = false) {
    let runSummary = null;
    if (this.run) {
      logger.info('[GameManager] Run forfeited:', { areasCompleted: this.run.areasCompleted, roomsExplored: this.run.roomsExplored });

      // Always set endTime if missing (defeat path sets active=false but not endTime)
      if (!this.run.stats.endTime) {
        this.run.stats.endTime = Date.now();
      }

      if (this.run.active) {
        this.run.active = false;
        if (this.meta?.levels) {
          this.meta.levels.current = null;
        }
        this.updateLifetimeStats(isVictory);
        this.checkAchievements(this.run.stats);
      }

      // Capture summary before clearing run
      runSummary = buildRunSummary(this.run, this.meta);

      this.combat = null;
      this.run = null;
    }
    this.emitState();
    return { runSummary };
  }
```

Add the import at the top of `src/game/loop.js`:

```javascript
import { buildRunSummary } from './adventure-report.js';
```

- [ ] **Step 4: Update forfeit route to pass isVictory from request body**

Modify the route at `src/routes/game/run.js:456-462`:

```javascript
router.post('/forfeit', (req, res) => {
  const isVictory = req.body?.isVictory === true;
  const result = req.gameManager.forfeitRun(isVictory);
  cancelPendingPrefetches();
  clearPrefetchCache();
  req.saveGame();
  res.json({ ...result, state: req.getEnrichedGameState() });
});
```

The frontend will pass `{ isVictory: true }` when calling forfeit from the victory path.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/game/adventure-report.test.js`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/loop.js tests/unit/game/adventure-report.test.js
git commit -m "feat(adventure-report): capture and return run summary from forfeitRun"
```

---

## Chunk 2: Frontend Adventure Report UI

### Task 5: Create adventure-report.js frontend module

**Files:**
- Create: `public/js/ui/adventure-report.js`
- Test: Manual visual verification via Playwright

The frontend module renders the adventure report using the summary data from the API response.

- [ ] **Step 1: Create the adventure-report UI module**

Create `public/js/ui/adventure-report.js`:

```javascript
/**
 * @file adventure-report.js — End-of-Run Adventure Report
 *
 * Renders a positive, stats-rich report when a run ends (defeat or victory).
 * Replaces the old skull-emoji defeat screen and minimal victory screen.
 *
 * USAGE:
 *   import { renderAdventureReport } from './adventure-report.js';
 *   renderAdventureReport(container, summary, isVictory);
 */

// No external dependencies — all strings are hardcoded English for now.

/**
 * Format milliseconds as "Xm Ys"
 */
function formatDuration(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, '0')}s`;
}

/**
 * Render the adventure report into a container element.
 *
 * @param {HTMLElement} container - The DOM element to render into
 * @param {object} summary - Run summary from server
 * @param {boolean} isVictory - Whether the run was completed successfully
 * @param {function} onReturnToHub - Callback when player clicks return button
 */
export function renderAdventureReport(container, summary, isVictory, onReturnToHub) {
  const s = summary || {};
  const icon = isVictory ? '\u{1F3C6}' : '\u{1F4DC}';
  const title = isVictory ? 'Adventure Complete!' : 'Adventure Report';
  const flavor = isVictory
    ? 'You conquered every challenge!'
    : 'A valiant journey through the unknown!';
  const duration = formatDuration(s.durationMs);
  const el = s.elementsCollected || {};

  container.innerHTML = `
    <div class="adventure-report">
      <div class="ar-header">
        <div class="ar-icon">${icon}</div>
        <div class="ar-title">${title}</div>
        <div class="ar-subtitle">Run #${s.runNumber || '?'} &middot; ${duration}</div>
        <div class="ar-flavor">${flavor}</div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">RUN STATS</div>
        <div class="ar-metrics-grid">
          <div class="ar-metric featured">
            <div class="ar-metric-icon">\u{1F5FA}\uFE0F</div>
            <div class="ar-metric-value">${s.areasCompleted || 0} <span class="ar-metric-total">/ ${s.areasToWin || '?'}</span></div>
            <div class="ar-metric-label">Furthest Area</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u{1F91D}</div>
            <div class="ar-metric-value">${s.creaturesBefriended || 0}</div>
            <div class="ar-metric-label">Befriended</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u2694\uFE0F</div>
            <div class="ar-metric-value">${s.creaturesDefeated || 0}</div>
            <div class="ar-metric-label">Defeated</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u{1F392}</div>
            <div class="ar-metric-value">${s.itemsCollected || 0}</div>
            <div class="ar-metric-label">Items Collected</div>
          </div>
        </div>
        <div class="ar-elements-label">Elements Collected</div>
        <div class="ar-elements-row">
          <div class="ar-element"><div class="ar-element-icon fire">\u{1F525}</div><div class="ar-element-count">${el.fire || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon water">\u{1F4A7}</div><div class="ar-element-count">${el.water || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon earth">\u26F0\uFE0F</div><div class="ar-element-count">${el.earth || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon wood">\u{1F33F}</div><div class="ar-element-count">${el.wood || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon metal">\u2699\uFE0F</div><div class="ar-element-count">${el.metal || 0}</div></div>
        </div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">DISCOVERY</div>
        <div class="ar-discovery-row">
          <div class="ar-discovery-label">Creatures</div>
          <div class="ar-bar-track"><div class="ar-bar-fill creatures" style="width:${pct(s.creaturesDiscovered, s.totalCreatures)}%"></div></div>
          <div class="ar-discovery-count">${s.creaturesDiscovered || 0} / ${s.totalCreatures || '?'}</div>
        </div>
        <div class="ar-discovery-row">
          <div class="ar-discovery-label">Items</div>
          <div class="ar-bar-track"><div class="ar-bar-fill items" style="width:${pct(s.itemsDiscoveredCount, s.totalItems)}%"></div></div>
          <div class="ar-discovery-count">${s.itemsDiscoveredCount || 0} / ${s.totalItems || '?'}</div>
        </div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">WORD PROGRESS</div>
        <div class="ar-word-summary">
          <div class="ar-word-box">
            <div class="ar-word-value immersed">${s.wordsImmersed || 0}</div>
            <div class="ar-word-label">Words Immersed</div>
          </div>
          <div class="ar-word-box">
            <div class="ar-word-value mastered">${(s.wordsMastered || []).length}</div>
            <div class="ar-word-label">Words Mastered</div>
          </div>
        </div>
        ${renderMasteredList(s.wordsMastered)}
      </div>

      <button class="ar-btn" id="ar-hub-btn">${isVictory ? 'Return to Hub' : 'Return to Hub'}</button>
    </div>
  `;

  container.querySelector('#ar-hub-btn')?.addEventListener('click', onReturnToHub);
}

function pct(n, total) {
  if (!total || !n) return 0;
  return Math.min(100, Math.round((n / total) * 100));
}

function renderMasteredList(words) {
  if (!words || words.length === 0) return '';
  return `<ul class="ar-mastered-list">${words.map(w => `
    <li class="ar-mastered-word">
      <div class="ar-mastered-dot"></div>
      <div class="ar-mastered-jp">${w.word || ''}</div>
      <div class="ar-mastered-meaning">${w.meaning || ''}</div>
      <div class="ar-mastered-exp">${w.exposures || 0}x</div>
    </li>
  `).join('')}</ul>`;
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/adventure-report.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/adventure-report.js
git commit -m "feat(adventure-report): create frontend UI module"
```

---

### Task 6: Add CSS for adventure report

**Files:**
- Modify: `public/game.css` (append near the existing `.gameover-*` styles around line 1964)

- [ ] **Step 1: Add adventure report CSS**

In `public/game.css`, find the existing `.gameover-content` block (around line 1964). Replace the existing gameover styles or add after them:

```css
/* ===== ADVENTURE REPORT ===== */
.adventure-report {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 16px 32px;
  max-width: 400px;
  margin: 0 auto;
  overflow-y: auto;
  max-height: 100vh;
  -webkit-overflow-scrolling: touch;
}

.ar-header {
  text-align: center;
  padding: 20px 0 8px;
}
.ar-icon { font-size: 40px; margin-bottom: 8px; }
.ar-title { font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.5px; }
.ar-subtitle { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.ar-flavor { font-size: 14px; color: var(--accent-lavender); font-style: italic; margin-top: 8px; }

.ar-section {
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  padding: 16px;
}
.ar-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* Metrics grid */
.ar-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ar-metric {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 12px;
  text-align: center;
}
.ar-metric.featured {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, rgba(79,195,247,0.08), rgba(179,157,219,0.08));
  border: 1px solid rgba(79,195,247,0.15);
}
.ar-metric-icon { font-size: 20px; margin-bottom: 4px; }
.ar-metric-value { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.ar-metric-total { font-size: 14px; font-weight: 400; color: var(--text-muted); }
.ar-metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

/* Elements row */
.ar-elements-label {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  margin: 12px 0 8px;
}
.ar-elements-row {
  display: flex;
  justify-content: space-around;
}
.ar-element {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ar-element-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: white;
}
.ar-element-icon.fire { background: linear-gradient(135deg, #ef5350, #ff7043); }
.ar-element-icon.water { background: linear-gradient(135deg, #42a5f5, #4fc3f7); }
.ar-element-icon.earth { background: linear-gradient(135deg, #ffb74d, #ffa726); }
.ar-element-icon.wood { background: linear-gradient(135deg, #66bb6a, #81c784); }
.ar-element-icon.metal { background: linear-gradient(135deg, #b0b8c4, #90a4ae); }
.ar-element-count { font-size: 13px; font-weight: 600; color: var(--text-primary); }

/* Discovery bars */
.ar-discovery-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.ar-discovery-row + .ar-discovery-row {
  border-top: 1px solid var(--border-subtle);
}
.ar-discovery-label { font-size: 13px; color: var(--text-secondary); min-width: 72px; }
.ar-bar-track {
  flex: 1;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}
.ar-bar-fill {
  height: 100%;
  border-radius: 4px;
}
.ar-bar-fill.creatures { background: linear-gradient(90deg, var(--accent-cyan), var(--accent-lavender)); }
.ar-bar-fill.items { background: linear-gradient(90deg, var(--accent-amber), var(--accent-green)); }
.ar-discovery-count { font-size: 13px; font-weight: 600; color: var(--text-primary); min-width: 44px; text-align: right; }

/* Word progress */
.ar-word-summary { display: flex; gap: 12px; margin-bottom: 12px; }
.ar-word-box {
  flex: 1;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 12px;
  text-align: center;
}
.ar-word-value { font-size: 22px; font-weight: 700; }
.ar-word-value.immersed { color: var(--accent-blue); }
.ar-word-value.mastered { color: var(--accent-green); }
.ar-word-label { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }

.ar-mastered-list { list-style: none; }
.ar-mastered-word {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 12px;
}
.ar-mastered-word + .ar-mastered-word {
  border-top: 1px solid var(--border-subtle);
}
.ar-mastered-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
  flex-shrink: 0;
}
.ar-mastered-jp { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.ar-mastered-meaning { font-size: 12px; color: var(--text-secondary); margin-left: auto; }
.ar-mastered-exp { font-size: 11px; color: var(--accent-green); font-weight: 600; flex-shrink: 0; min-width: 20px; text-align: right; }

/* Return button */
.ar-btn {
  display: block;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--card-radius);
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(79,195,247,0.3);
  letter-spacing: 0.5px;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat(adventure-report): add CSS styles"
```

---

### Task 7: Wire adventure report into game flow

**Files:**
- Modify: `public/game.js:1249-1281` (showGameOverModal)
- Modify: `public/game.js:1213-1224` (returnToHub)
- Modify: `public/js/ui/exploration.js:524-537` (renderRunComplete)
- Modify: `public/js/api.js:210-212` (forfeitRun)

This task replaces both the defeat and victory screens with the adventure report.

- [ ] **Step 1: Update forfeitRun API call to accept isVictory**

In `public/js/api.js`, update the `forfeitRun` function (line 210):

```javascript
async function forfeitRun(isVictory = false) {
  return apiCall('/forfeit', 'POST', { isVictory });
}
```

- [ ] **Step 2: Add adventure-report import to game.js**

At the top of `public/game.js`, add with the other UI imports:

```javascript
import { renderAdventureReport } from './js/ui/adventure-report.js';
```

- [ ] **Step 2: Replace showGameOverModal with adventure report**

Replace the entire `showGameOverModal` function in `public/game.js` (lines 1249-1281):

```javascript
function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');
  actions.clear();

  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }

  updateCreatureRow();
  takeover.open('gameover');
  const content = takeover.getContent('gameover');

  // Fetch summary from forfeit endpoint, then render report
  apiForfeitRun().then(response => {
    const summary = response?.runSummary || {};
    renderAdventureReport(content, summary, false, async () => {
      takeover.close('gameover');
      await loadGameState();
      updateUI();
      wordPractice.clearWordCache();
      wordPractice.prefetchCombatWords();
    });
  });
}
```

- [ ] **Step 3: Remove redundant forfeit call from returnToHub**

The `returnToHub` function (line 1213) currently calls `apiForfeitRun()` independently. Since `showGameOverModal` now calls forfeit itself, update `returnToHub` to skip forfeit when called from the report button (the report's `onReturnToHub` callback already handled forfeit):

Actually, `returnToHub` is still used by the victory path (`renderRunComplete`), so keep it but make it so the game-over modal no longer calls it. The refactored `showGameOverModal` above already handles its own forfeit + state reload in the `onReturnToHub` callback. No change needed to `returnToHub` itself.

- [ ] **Step 4: Wire victory path to use adventure report**

In `public/js/ui/exploration.js`, modify `renderRunComplete()` (line 524). The victory path needs a summary too. Since the run is still active at victory time, we need a different approach — call forfeit (which captures summary) and render the report.

First, add the import at the top of `exploration.js`:

```javascript
import { renderAdventureReport } from './adventure-report.js';
```

Then add `takeover` to the callbacks that `exploration.js` receives in `init()`. In the `init()` function, capture it:

```javascript
let takeover = null;
// In init():
takeover = callbacks.takeover;
```

Replace `renderRunComplete()`:

```javascript
export function renderRunComplete() {
  // Forfeit to capture run summary, then show adventure report
  apiForfeitRun().then(response => {
    const summary = response?.runSummary || {};
    takeover.open('gameover');
    const content = takeover.getContent('gameover');
    renderAdventureReport(content, summary, true, async () => {
      takeover.close('gameover');
      await loadGameState();
      updateUI();
    });
  });
}
```

Also ensure `apiForfeitRun` is available in exploration.js callbacks. Check the existing init callback list — if `apiForfeitRun` is not passed, add it. In `public/game.js`, where exploration callbacks are set (search for `explorationUI.init`), add:

```javascript
apiForfeitRun,
takeover,
```

Then in `exploration.js` init, capture them:

```javascript
let apiForfeitRun = null;
// In init():
apiForfeitRun = callbacks.apiForfeitRun;
```

The existing `apiReturnToHub` callback already points to `returnToHub()`, but we need the raw `apiForfeitRun` for the adventure report path. Or alternatively, we can create a new API wrapper that returns the summary.

**Simpler approach:** Use the existing `apiReturnToHub` pattern but have it call a new function that shows the report. Actually, the simplest approach: add a `showAdventureReport(isVictory)` function to `game.js` and expose it as a callback:

In `public/game.js`, add a new function:

```javascript
async function showAdventureReport(isVictory) {
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const response = await apiForfeitRun(isVictory);
  const summary = response?.runSummary || {};
  renderAdventureReport(content, summary, isVictory, async () => {
    takeover.close('gameover');
    await loadGameState();
    updateUI();
    wordPractice.clearWordCache();
    wordPractice.prefetchCombatWords();
  });
}
```

Pass it as a callback to exploration.js init:

```javascript
showAdventureReport,
```

Then in `exploration.js`:

```javascript
let showAdventureReport = null;
// In init():
showAdventureReport = callbacks.showAdventureReport;
```

And update `renderRunComplete()`:

```javascript
export function renderRunComplete() {
  showAdventureReport(true);
}
```

- [ ] **Step 5: Update showGameOverModal to use shared function**

Simplify `showGameOverModal` to use the same shared function:

```javascript
function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');
  actions.clear();

  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }

  updateCreatureRow();
  showAdventureReport(false);
}
```

- [ ] **Step 6: Syntax check all modified files**

```bash
node --check public/game.js && node --check public/js/ui/exploration.js && node --check public/js/ui/adventure-report.js && echo "OK"
```

Expected: OK

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add public/game.js public/js/ui/exploration.js public/js/ui/adventure-report.js
git commit -m "feat(adventure-report): wire report into defeat and victory flows"
```

---

## Chunk 3: Integration Testing and Polish

### Task 8: Manual integration test via dev server

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Play through to defeat**

Use Playwright to:
1. Navigate to `http://localhost:3000`
2. Login/register
3. Start a run
4. Enter combat and lose (or use dev tools to trigger defeat)
5. Verify the adventure report appears instead of the old skull screen
6. Take screenshot for visual verification
7. Click "Return to Hub" and verify it works

- [ ] **Step 3: Play through to victory**

Use dev tools or game state manipulation to trigger a victory, verify the adventure report appears with the trophy icon and "Adventure Complete!" title.

- [ ] **Step 4: Verify data accuracy**

Check that:
- Areas completed count matches what was explored
- Duration is reasonable
- Discovery bars show lifetime totals
- Word stats section renders (even if 0)

- [ ] **Step 5: Fix any visual issues found**

If spacing, overflow, or other CSS issues are found, fix them and commit.

### Task 9: Handle edge cases

**Files:**
- Modify: `src/game/adventure-report.js` (if needed)
- Modify: `public/js/ui/adventure-report.js` (if needed)

- [ ] **Step 1: Handle missing runSummary gracefully**

The frontend `renderAdventureReport` already defaults all fields to 0/empty. Verify that if `runSummary` is null/undefined (e.g., from an old game session), the report still renders with zeros.

- [ ] **Step 2: Handle PvP team save on victory**

The current `renderRunComplete()` has a "Save Team for PvP" button. The run data is destroyed by `forfeitRun()`, so PvP team must be saved BEFORE showing the report.

In `public/game.js`, modify `showAdventureReport` to save PvP team data before forfeit when it's a victory:

```javascript
async function showAdventureReport(isVictory) {
  // On victory, capture creature party for PvP save before forfeit destroys it
  let pvpPartySnapshot = null;
  if (isVictory && gameState.run?.creatureParty) {
    pvpPartySnapshot = JSON.parse(JSON.stringify(gameState.run.creatureParty));
  }

  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const response = await apiForfeitRun(isVictory);
  const summary = response?.runSummary || {};

  renderAdventureReport(content, summary, isVictory, async () => {
    takeover.close('gameover');
    await loadGameState();
    updateUI();
    wordPractice.clearWordCache();
    wordPractice.prefetchCombatWords();
  });

  // Add PvP save button after report renders (victory only)
  if (isVictory && pvpPartySnapshot) {
    const reportEl = content.querySelector('.adventure-report');
    const pvpBtn = document.createElement('button');
    pvpBtn.className = 'ar-btn';
    pvpBtn.style.marginTop = '-12px';
    pvpBtn.style.background = 'var(--accent-lavender)';
    pvpBtn.textContent = 'Save Team for PvP';
    pvpBtn.addEventListener('click', () => showPvpTeamSaveFromSnapshot(pvpPartySnapshot));
    reportEl?.querySelector('#ar-hub-btn')?.before(pvpBtn);
  }
}
```

The `showPvpTeamSaveFromSnapshot` function can reuse the existing PvP save logic with the captured party data. This is a stretch goal — implement only if the PvP save feature is actively used.

- [ ] **Step 3: Run full test suite one final time**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Final commit**

```bash
git add src/game/adventure-report.js public/js/ui/adventure-report.js public/game.js public/js/ui/exploration.js public/game.css src/routes/game/run.js
git commit -m "feat(adventure-report): edge case handling and polish"
```
