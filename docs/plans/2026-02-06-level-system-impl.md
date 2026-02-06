# Level System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a level progression system where players unlock and replay levels, each equivalent to one full 7-floor run.

**Architecture:** Levels are data-driven definitions in `data/levels.json`. Level progress (`highestUnlocked`, `completed`) is stored in meta-progression and persisted in the per-user save file. A new `LEVEL_SELECT` phase sits between HUB and run start. The hub's "Infiltrate" button navigates to level select instead of directly starting a run.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, JSON data files, Playwright e2e tests.

**Design doc:** `docs/plans/2026-02-06-level-system-design.md`

---

### Task 1: Create level definitions data file

**Files:**
- Create: `data/levels.json`

**Step 1: Create the data file**

```json
[
  { "id": 1, "name": "Awakening", "nameJa": "覚醒" },
  { "id": 2, "name": "Signal", "nameJa": "信号" },
  { "id": 3, "name": "Underground", "nameJa": "地下" },
  { "id": 4, "name": "Frequency", "nameJa": "周波数" },
  { "id": 5, "name": "Disruption", "nameJa": "混乱" },
  { "id": 6, "name": "Convergence", "nameJa": "収束" },
  { "id": 7, "name": "Infiltration", "nameJa": "潜入" },
  { "id": 8, "name": "Resonance", "nameJa": "共鳴" },
  { "id": 9, "name": "Override", "nameJa": "上書き" },
  { "id": 10, "name": "Liberation", "nameJa": "解放" }
]
```

**Step 2: Verify JSON parses**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/levels.json','utf-8')).length)"`
Expected: `10`

**Step 3: Commit**

```bash
git add data/levels.json
git commit -m "feat: add level definitions data file (10 levels)"
```

---

### Task 2: Add level progress to meta-progression state

**Files:**
- Modify: `src/game/state.js:51-83` (createMetaProgression)
- Modify: `src/game/state.js:261-338` (createNewRun)

**Step 1: Add `levels` to `createMetaProgression()`**

In `src/game/state.js`, inside `createMetaProgression()` (line 51), add a `levels` field to the returned object, after the `achievements` array (line 81):

```javascript
    // Level progression
    levels: {
      highestUnlocked: 1,  // 1-indexed, player starts with level 1 unlocked
      completed: [],        // array of beaten level IDs
      current: null          // levelId of in-progress run, or null
    }
```

**Step 2: Add `levelId` to `createNewRun()`**

In `src/game/state.js`, inside `createNewRun()` (line 261), add `levelId: null` to the run object, right after `active: true` (line 263):

```javascript
    active: true,
    levelId: null,        // which level this run belongs to
    floor: 1,
```

**Step 3: Syntax check**

Run: `node --check src/game/state.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add src/game/state.js
git commit -m "feat: add level progress to meta-progression and run state"
```

---

### Task 3: Update GameManager to accept levelId in startRun

**Files:**
- Modify: `src/game/loop.js:482-521` (startRun method)

**Step 1: Add `levelId` parameter to `startRun()`**

In `src/game/loop.js`, change the `startRun()` method (line 482) to accept and store a `levelId`:

Change line 482 from:
```javascript
  startRun() {
```
to:
```javascript
  startRun(levelId = null) {
```

After `this.run = createNewRun(this.player);` (line 487), add:
```javascript
    // Track which level this run belongs to
    if (levelId !== null) {
      this.run.levelId = levelId;
      if (this.meta?.levels) {
        this.meta.levels.current = levelId;
      }
    }
```

**Step 2: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: accept levelId parameter in GameManager.startRun()"
```

---

### Task 4: Add level unlock logic to victory handling

**Files:**
- Modify: `src/game/services/combat-service.js:564-591` (handleGameVictory)
- Modify: `src/game/loop.js:824-840` (forfeitRun)

**Step 1: Add level completion to `handleGameVictory()`**

In `src/game/services/combat-service.js`, inside `handleGameVictory()` (line 564), after the essence/stats/achievements block (after line 573), add level unlock logic:

```javascript
    // Level progression: mark level as completed and unlock next
    const levelId = this.gm.run.levelId;
    if (levelId !== null && this.gm.meta?.levels) {
      const levels = this.gm.meta.levels;
      if (!levels.completed.includes(levelId)) {
        levels.completed.push(levelId);
      }
      if (levelId >= levels.highestUnlocked) {
        levels.highestUnlocked = levelId + 1;
      }
      levels.current = null;
    }
```

**Step 2: Clear `levels.current` on forfeit**

In `src/game/loop.js`, inside `forfeitRun()` (line 824), after `this.run.active = false;` (line 829), add:

```javascript
        // Clear current level tracking
        if (this.meta?.levels) {
          this.meta.levels.current = null;
        }
```

**Step 3: Syntax check both files**

Run: `node --check src/game/services/combat-service.js && node --check src/game/loop.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add src/game/services/combat-service.js src/game/loop.js
git commit -m "feat: unlock next level on victory, clear current level on forfeit"
```

---

### Task 5: Add level progress to save/load

**Files:**
- Modify: `src/game/manager-registry.js:23-29` (load) and `src/game/manager-registry.js:48-53` (save)

**Step 1: Persist levels in save file**

In `src/game/manager-registry.js`, update `saveManager()` (line 43). The `meta` already gets saved via `manager.getMeta()` which returns `this.meta` — and since we added `levels` to the meta object in `createMetaProgression()`, it's automatically included. **No change needed for save.**

For load (line 23-29): The `initMeta(data.meta)` call on line 28 already restores the full meta object including any `levels` field. **No change needed for load.**

However, we need to handle **migration** for existing saves that don't have `levels` in their meta. In `getManager()`, after `if (data.meta) manager.initMeta(data.meta);` (line 28), add migration:

```javascript
        if (data.meta) {
          // Migrate: add levels if missing from old saves
          if (!data.meta.levels) {
            data.meta.levels = {
              highestUnlocked: 1,
              completed: [],
              current: null
            };
          }
          manager.initMeta(data.meta);
        }
```

Replace the existing `if (data.meta) manager.initMeta(data.meta);` line with the block above.

**Step 2: Syntax check**

Run: `node --check src/game/manager-registry.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/manager-registry.js
git commit -m "feat: migrate existing saves to include level progress"
```

---

### Task 6: Add LEVEL_SELECT phase to phase machine

**Files:**
- Modify: `src/game/phase-machine.js:29-61` (PHASES)
- Modify: `src/game/phase-machine.js:67-162` (VALID_TRANSITIONS)
- Modify: `src/game/phase-machine.js:184-256` (derivePhase)
- Modify: `src/game/phase-machine.js:264-284` (getPhaseName)

**Step 1: Add LEVEL_SELECT to PHASES constant**

In `src/game/phase-machine.js`, add to the PHASES object (after line 32, the `HUB` line):

```javascript
  LEVEL_SELECT: 'level_select',    // Choosing which level to play
```

**Step 2: Add LEVEL_SELECT transitions**

In VALID_TRANSITIONS, change HUB transitions (line 70-74) to include LEVEL_SELECT:

```javascript
  [PHASES.HUB]: [
    PHASES.LEVEL_SELECT,    // Choose a level
    PHASES.WARD_SELECTION,  // Start new run (legacy/direct)
    PHASES.SHOP,            // Visit town shop
    PHASES.BLACKSMITH       // Visit town blacksmith
  ],

  [PHASES.LEVEL_SELECT]: [
    PHASES.HUB,             // Go back
    PHASES.WARD_SELECTION   // Start run for selected level
  ],
```

Also add LEVEL_SELECT to RUN_COMPLETE transitions (line 154-157):

```javascript
  [PHASES.RUN_COMPLETE]: [
    PHASES.HUB,             // Return to hub
    PHASES.LEVEL_SELECT,    // Back to level select
    PHASES.EXPLORING        // Continue to endless mode
  ],
```

And to RUN_ENDED transitions (line 159-161):

```javascript
  [PHASES.RUN_ENDED]: [
    PHASES.HUB,             // Return to hub
    PHASES.LEVEL_SELECT     // Back to level select
  ],
```

**Step 3: Add LEVEL_SELECT to derivePhase**

In `derivePhase()` (line 184), add level_select derivation. After the HUB check (line 191 `if (!run) return PHASES.HUB;`), add:

```javascript
  // Level select screen active
  if (!run && player._showLevelSelect) return PHASES.LEVEL_SELECT;
```

Wait — this approach uses a flag on the player object, which is awkward. Better approach: the level select is a **frontend-only phase**. The server doesn't need to derive it. The frontend transitions from HUB to LEVEL_SELECT when the user clicks the "Infiltrate" button. The server still sees `HUB` phase. When the user picks a level, the frontend calls `POST /api/game/levels/select` which calls `startRun(levelId)`, and the server transitions to `WARD_SELECTION`.

**Revised Step 3: No change to `derivePhase()` needed.** The LEVEL_SELECT phase is handled purely on the frontend via `updateGameContent()` in `game.js`. The phase machine transitions are still useful for documentation/validation.

**Step 4: Add to getPhaseName**

In `getPhaseName()` (line 263), add:

```javascript
    [PHASES.LEVEL_SELECT]: 'Level Select',
```

**Step 5: Syntax check**

Run: `node --check src/game/phase-machine.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat: add LEVEL_SELECT phase to phase machine"
```

---

### Task 7: Add API endpoints for levels

**Files:**
- Modify: `src/routes/game/run.js:26-31` (factory params) and add routes
- Modify: `src/routes/game/run.js:35-52` (start-run route)

**Step 1: Add level data import**

At the top of `src/routes/game/run.js`, after the existing imports (line 16), add:

```javascript
const levelsPath = join(__dirname, '../../data/levels.json');

function loadLevels() {
  return JSON.parse(readFileSync(levelsPath, 'utf-8'));
}
```

Note: `__dirname` is already defined on line 18.

**Step 2: Add `GET /levels` endpoint**

After the `start-run` route block (after line 52), add:

```javascript
  // Get level definitions and player progress
  router.get('/levels', (req, res) => {
    try {
      const levels = loadLevels();
      const meta = req.gameManager.getMeta();
      res.json({
        levels,
        progress: meta.levels || { highestUnlocked: 1, completed: [], current: null }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
```

**Step 3: Add `POST /levels/select` endpoint**

After the GET endpoint, add:

```javascript
  // Select a level and start a run
  router.post('/levels/select', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { levelId } = req.body;
      if (!levelId || typeof levelId !== 'number') {
        return res.status(400).json({ error: 'levelId (number) required' });
      }

      const meta = gameManager.getMeta();
      const levels = meta.levels || { highestUnlocked: 1, completed: [], current: null };

      if (levelId > levels.highestUnlocked) {
        return res.status(400).json({ error: 'Level not yet unlocked' });
      }

      if (gameManager.run?.active) {
        return res.status(400).json({ error: 'A run is already active' });
      }

      gameManager.startRun(levelId);

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 4: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: add GET /levels and POST /levels/select API endpoints"
```

---

### Task 8: Add level progress to game state response

**Files:**
- Modify: `src/game/loop.js:334-437` (getState method)

**Step 1: Include levels in state response**

In `src/game/loop.js`, inside `getState()`, the `meta` section (lines 431-435) already returns `this.meta` fields. Add `levels` to the meta block:

Change:
```javascript
      meta: this.meta ? {
        essence: this.meta.essence,
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements
      } : null,
```

To:
```javascript
      meta: this.meta ? {
        essence: this.meta.essence,
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements,
        levels: this.meta.levels || { highestUnlocked: 1, completed: [], current: null }
      } : null,
```

Also include `levelId` in the run state. In the `run:` block (around line 340), add after `active: this.run.active,` (line 350):

```javascript
        levelId: this.run.levelId,
```

**Step 2: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: include level progress and levelId in game state response"
```

---

### Task 9: Add frontend API functions for levels

**Files:**
- Modify: `public/js/api.js`

**Step 1: Add `getLevels()` function**

In `public/js/api.js`, after `getMetaProgression()` (line 111), add:

```javascript
/**
 * Get level definitions and player progress
 * @returns {Promise<object>} { levels, progress }
 */
async function getLevels() {
  try {
    const response = await fetch('/api/game/levels', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch levels:', error.message);
    return { levels: [], progress: { highestUnlocked: 1, completed: [], current: null } };
  }
}
```

**Step 2: Add `selectLevel()` function**

After `getLevels()`, add:

```javascript
/**
 * Select a level and start a run
 * @param {number} levelId - Level to start
 * @returns {Promise<object>} Result with state and narration
 */
async function selectLevel(levelId) {
  return apiCall('/levels/select', 'POST', { levelId });
}
```

**Step 3: Add to exports**

In the `export` block (line 610), add after `getMetaProgression,`:

```javascript
  getLevels,
  selectLevel,
```

**Step 4: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add getLevels and selectLevel API functions"
```

---

### Task 10: Add level select UI rendering

**Files:**
- Modify: `public/js/ui/exploration.js`

**Step 1: Add API callback slots**

In `public/js/ui/exploration.js`, add module-level variables after the existing API function variables (around line 86):

```javascript
// Level select API functions
let apiGetLevels = null;
let apiSelectLevel = null;
```

In the `init()` function (line 88), add after `apiGetDueWords = callbacks.apiGetDueWords;` (line 120):

```javascript
  apiGetLevels = callbacks.apiGetLevels;
  apiSelectLevel = callbacks.apiSelectLevel;
```

**Step 2: Add `renderLevelSelect()` function**

After the `renderHub()` function (after line 151), add:

```javascript
/** Level select — show scrollable list of level cards */
export async function renderLevelSelect() {
  const result = await apiGetLevels();
  if (!result?.levels) {
    actions.setContent('<p style="text-align:center">Failed to load levels</p>');
    return;
  }

  const { levels, progress } = result;
  const { highestUnlocked, completed } = progress;

  const cardsHtml = levels.map(level => {
    const isCompleted = completed.includes(level.id);
    const isUnlocked = level.id <= highestUnlocked;
    const isNext = level.id === highestUnlocked && !isCompleted;

    let statusIcon = '';
    let stateClass = '';
    if (isCompleted) {
      statusIcon = '<span class="level-status level-complete">✓</span>';
      stateClass = 'level-completed';
    } else if (isUnlocked) {
      statusIcon = '<span class="level-status level-new">NEW</span>';
      stateClass = 'level-unlocked';
    } else {
      statusIcon = '<span class="level-status level-locked">🔒</span>';
      stateClass = 'level-locked';
    }

    return `
      <div class="level-card ${stateClass}" data-level-id="${level.id}" ${!isUnlocked ? 'aria-disabled="true"' : ''}>
        <div class="level-number">${level.id}</div>
        <div class="level-info">
          <div class="level-name">${level.nameJa}</div>
          <div class="level-name-en">${level.name}</div>
        </div>
        ${statusIcon}
      </div>
    `;
  }).join('');

  actions.setContent(`
    <div class="level-select-header">レベル選択</div>
    <div class="level-select-list">${cardsHtml}</div>
    <button class="action-btn action-btn-tertiary" id="level-back-btn">戻る</button>
  `);

  // Click handlers for unlocked levels
  document.querySelectorAll('.level-card:not(.level-locked)').forEach(card => {
    card.addEventListener('click', async () => {
      const levelId = parseInt(card.dataset.levelId);
      playSFX('button-tap');
      const runResult = await apiSelectLevel(levelId);
      if (runResult?.state) {
        updateGameState(runResult.state);
        updateUI();
        if (runResult.state.run?.startingChipShop?.active) {
          // Trigger starting chip shop render (handled by economy UI)
          const economyMod = await import('./economy.js');
          await economyMod.renderStartingChipShop();
        }
      }
    });
  });

  // Back button
  document.getElementById('level-back-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    updateUI();  // re-renders hub
  });
}
```

**Step 3: Update `renderHub()` to go to level select instead of directly starting a run**

In `renderHub()` (line 124), change the "Infiltrate" button click handler. Replace the existing handler (lines 147-150):

```javascript
  document.getElementById('context-action-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    startNewRun();
  });
```

With:

```javascript
  document.getElementById('context-action-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    renderLevelSelect();
  });
```

**Step 4: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add level select UI with card rendering"
```

---

### Task 11: Wire level select into game.js

**Files:**
- Modify: `public/game.js`

**Step 1: Import API functions**

In `public/game.js`, add to the API imports (around line 106, where `startRun as apiStartRun` is). Find the import block from `'./js/api.js'` and add:

```javascript
  getLevels as apiGetLevels,
  selectLevel as apiSelectLevel,
```

**Step 2: Pass new callbacks to explorationUI.init()**

In the `explorationUI.init()` call (line 968), add after `apiGetDueWords,` (line 1001 area):

```javascript
    apiGetLevels,
    apiSelectLevel,
```

**Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat: wire level select API into game.js"
```

---

### Task 12: Add level select CSS styles

**Files:**
- Modify: `public/game.css`

**Step 1: Add level select styles**

In `public/game.css`, after the ward-option styles (after line 1055, before the chip equip section), add:

```css
/* ===== LEVEL SELECT ===== */
.level-select-header {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.level-select-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
}

.level-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,255,255,0.9);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  box-shadow: var(--shadow-soft);
}

.level-card:active:not(.level-locked) {
  transform: scale(0.98);
}

.level-card.level-unlocked {
  box-shadow: 0 0 0 2px var(--accent-blue);
}

.level-card.level-locked {
  opacity: 0.4;
  cursor: default;
}

.level-number {
  font-size: 20px;
  font-weight: 800;
  min-width: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.level-info {
  flex: 1;
}

.level-name {
  font-weight: 700;
  font-size: 15px;
}

.level-name-en {
  font-size: 12px;
  color: var(--text-secondary);
}

.level-status {
  font-size: 14px;
}

.level-complete {
  color: #22c55e;
  font-weight: 700;
}

.level-new {
  color: var(--accent-blue);
  font-weight: 700;
  font-size: 11px;
  animation: pulse-glow 2s ease-in-out infinite;
}

.level-locked {
  color: var(--text-secondary);
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add level select card styles"
```

---

### Task 13: Run e2e tests

**Step 1: Run the full e2e test suite**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 tests pass (known flakiness threshold).

If tests fail with errors related to level select, investigate and fix. The change to `renderHub()` (replacing `startNewRun()` with `renderLevelSelect()`) could affect tests that click the "Infiltrate" button — those tests may now see the level select screen and need to click a level card first.

**Step 2: Fix any broken e2e tests**

If the "start a run" flow in tests breaks because it now shows level select first:
- Find the test that clicks "Infiltrate" / `#context-action-btn`
- After clicking it, add a step to click the first `.level-card:not(.level-locked)` to select level 1
- This mirrors the new user flow: Hub → Level Select → Pick Level → Ward Select

**Step 3: Commit any test fixes**

```bash
git add tests/
git commit -m "fix: update e2e tests for level select flow"
```

---

### Task 14: Final verification and cleanup

**Step 1: Syntax check all modified files**

Run:
```bash
node --check src/game/state.js && \
node --check src/game/loop.js && \
node --check src/game/phase-machine.js && \
node --check src/game/services/combat-service.js && \
node --check src/game/manager-registry.js && \
node --check src/routes/game/run.js && \
node --check public/js/api.js && \
node --check public/js/ui/exploration.js && \
node --check public/game.js && \
echo "All files OK"
```
Expected: `All files OK`

**Step 2: Run e2e tests one final time**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 pass

**Step 3: Manual smoke test (start dev server)**

Run: `npm run dev`

Verify in browser:
1. Hub shows "Infiltrate" button
2. Clicking "Infiltrate" shows level select list
3. Level 1 has "NEW" badge and is clickable
4. Levels 2-10 are locked (greyed out)
5. Clicking Level 1 starts a run (ward selection appears)
6. "Back" button returns to hub
7. (If you complete a run) Level 2 becomes unlocked

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "feat: level system complete — 10 levels with unlock progression"
```
