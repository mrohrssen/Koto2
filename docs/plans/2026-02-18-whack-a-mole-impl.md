# Whack-a-Mole Mini Game Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a timed creature/item matching mini game as a new room type (5% spawn chance) where players match Japanese words to creature/item sprites on a 3x3 flipping tile grid.

**Architecture:** Client-side game loop with server providing the data pool and recording results. Two API endpoints (pool + complete). New room type wired through the existing phase machine, room generation, frontend routing, and UI rendering pipeline.

**Tech Stack:** Express routes (server), vanilla JS + CSS 3D transforms (client), existing game state system

**Design doc:** `docs/plans/2026-02-18-whack-a-mole-minigame-design.md`

---

### Task 1: Register the room type and generation logic

**Files:**
- Modify: `src/game/rooms.js` (ROOM_TYPES, isSpecialType, generateSingleRoom, createRoom, getRoomEntryNarration, getRoomActions)

**Step 1: Add ROOM_TYPES.whackAMole**

In `src/game/rooms.js:94-100`, add `whackAMole` to the ROOM_TYPES object:

```js
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  dealer: 'dealer',
  whackAMole: 'whackAMole'
};
```

**Step 2: Add whackAMole to isSpecialType**

In `src/game/rooms.js:107-112`, add the new type:

```js
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.quiz ||
         type === ROOM_TYPES.wordDiscovery ||
         type === ROOM_TYPES.dealer ||
         type === ROOM_TYPES.whackAMole;
}
```

**Step 3: Add 5% chance in generateSingleRoom**

In `src/game/rooms.js:117-155`, add `WHACK_A_MOLE_CHANCE` and adjust the roll thresholds. Encounter drops from 60% to 55%:

```js
function generateSingleRoom(areaId, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false) {
  const SHRINE_CHANCE = 0.10;
  const QUIZ_CHANCE = 0.10;
  const WORD_DISCOVERY_CHANCE = 0.10;
  const DEALER_CHANCE = 0.10;
  const WHACK_A_MOLE_CHANCE = 0.05;

  const queuedType = popTestRoomType();
  let type;

  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else if (encountersOnly) {
    type = ROOM_TYPES.encounter;
  } else {
    let attempts = 0;
    do {
      const roll = Math.random();
      if (roll < SHRINE_CHANCE) {
        type = ROOM_TYPES.shrine;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
        type = ROOM_TYPES.quiz;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE) {
        type = ROOM_TYPES.wordDiscovery;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE) {
        type = ROOM_TYPES.dealer;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE + WHACK_A_MOLE_CHANCE) {
        type = ROOM_TYPES.whackAMole;
      } else {
        type = ROOM_TYPES.encounter;
      }
      attempts++;
    } while (
      excludeSpecialType &&
      isSpecialType(type) &&
      type === excludeSpecialType &&
      attempts < 10
    );
  }

  return createRoom(type, areaId, roomNumber, totalRooms);
}
```

**Step 4: Add room state in createRoom**

In `src/game/rooms.js:201-239`, add a case for whackAMole in the switch:

```js
    case ROOM_TYPES.whackAMole: {
      room.whackAMole = { score: 0, completed: false };
      break;
    }
```

**Step 5: Add narration and actions**

In `getRoomEntryNarration()` (~line 249), add:

```js
    case ROOM_TYPES.whackAMole:
      return `${roomNum}に入った。不思議なゲーム機がある...`;
```

In `getRoomActions()` (~line 268), add to the `isUnfinished` check and switch:

Add `whackAMole` to the "block proceed" check:
```js
  const isUnfinishedWhackAMole = room.type === 'whackAMole' && !room.interacted;
```

Update the condition:
```js
  if (!isUnfinishedEncounter && !isUnfinishedWordDiscovery && !isUnfinishedDealer && !isUnfinishedWhackAMole) {
```

Add switch case:
```js
    case ROOM_TYPES.whackAMole:
      if (!room.interacted) {
        actions.push({ id: 'play_whack_a_mole', name: 'プレイ', description: 'ゲームをプレイする' });
      }
      break;
```

**Step 6: Syntax check**

Run: `node --check src/game/rooms.js && echo "OK"`
Expected: `OK`

**Step 7: Commit**

```bash
git add src/game/rooms.js
git commit -m "feat(whack-a-mole): register room type with 5% spawn chance"
```

---

### Task 2: Wire phase machine

**Files:**
- Modify: `src/game/phase-machine.js` (PHASES, VALID_TRANSITIONS, derivePhase, getPhaseName)

**Step 1: Add WHACK_A_MOLE phase constant**

In `src/game/phase-machine.js:19-45`, add to PHASES:

```js
  WHACK_A_MOLE: 'whackAMole',
```

Add after the DEALER line (between DEALER and COMBAT blocks).

**Step 2: Add transition rules**

In VALID_TRANSITIONS, add the whackAMole phase. It can transition to ROOM (after completion):

```js
  [PHASES.WHACK_A_MOLE]: [
    PHASES.ROOM
  ],
```

Also add `PHASES.WHACK_A_MOLE` to the arrays for ROOM and EXPLORING (since those phases can transition into whackAMole rooms):

In the `[PHASES.ROOM]` array, add `PHASES.WHACK_A_MOLE`.
In the `[PHASES.EXPLORING]` array, add `PHASES.WHACK_A_MOLE`.

**Step 3: Add phase derivation**

In `derivePhase()` (~line 172-179), add before the encounter check:

```js
    if (currentRoom.type === 'whackAMole' && !currentRoom.interacted) return PHASES.WHACK_A_MOLE;
```

**Step 4: Add phase name**

In `getPhaseName()` (~line 185-206), add:

```js
    [PHASES.WHACK_A_MOLE]: 'Whack-a-Mole',
```

**Step 5: Syntax check**

Run: `node --check src/game/phase-machine.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat(whack-a-mole): wire phase machine transitions"
```

---

### Task 3: Add server API endpoints

**Files:**
- Modify: `src/routes/game/run.js` (add two endpoints)
- Modify: `src/game/loop.js` (add GameManager delegate method)
- Modify: `src/game/services/exploration-service.js` (add completeWhackAMole method)

**Step 1: Add pool endpoint in run.js**

The pool endpoint reads from `creatures.json` and `items.json` (already loaded in the server context). Add at the end of `createRunRoutes()`, before the `return router;`:

```js
  // Whack-a-Mole: get pool of creatures + items
  router.get('/whack-a-mole-pool', (req, res) => {
    try {
      const { readFileSync } = await import('fs');
      const { dirname, join } = await import('path');
      const { fileURLToPath } = await import('url');
      // ...
    }
  });
```

Actually, `run.js` already loads data files at the top. Let me check what's available.

Look at the top of `src/routes/game/run.js` — it loads quiz questions from JSON. The creatures and items are loaded elsewhere. The simplest approach: load them in the route file and build the pool there.

Add these imports/loads near the top of `createRunRoutes()`:

```js
  const creaturesPath = join(__dirname, '../../../data/creatures.json');
  const itemsPath = join(__dirname, '../../../data/items.json');
  const allCreatures = JSON.parse(readFileSync(creaturesPath, 'utf8'));
  const allItems = JSON.parse(readFileSync(itemsPath, 'utf8'));
```

Note: `run.js` already imports `readFileSync`, `dirname`, `join`, `fileURLToPath` at lines 1-21. Reuse those.

Then add the endpoint:

```js
  // Whack-a-Mole: get random pool of creatures + items for matching game
  router.get('/whack-a-mole-pool', (req, res) => {
    try {
      // Shuffle and pick ~8 creatures + ~8 items
      const shuffledCreatures = [...allCreatures].sort(() => Math.random() - 0.5);
      const shuffledItems = [...allItems].sort(() => Math.random() - 0.5);

      const creaturePool = shuffledCreatures.slice(0, 8).map(c => ({
        id: c.id,
        type: 'creature',
        word: c.baseWord,
        reading: c.baseReading,
        meaning: c.baseMeaning,
        sprite: `/assets/sprites/robots/${c.id}.webp`
      }));

      const itemPool = shuffledItems.slice(0, 8).map(i => ({
        id: i.id,
        type: 'item',
        word: i.word,
        reading: i.reading,
        meaning: i.meaning,
        sprite: `/assets/sprites/items/${i.id}.webp`
      }));

      const pool = [...creaturePool, ...itemPool].sort(() => Math.random() - 0.5);
      res.json({ pool });
    } catch (err) {
      res.status(500).json({ error: 'Failed to build whack-a-mole pool' });
    }
  });
```

**Step 2: Add complete endpoint in run.js**

```js
  // Whack-a-Mole: complete game and award credits
  router.post('/whack-a-mole-complete', (req, res) => {
    try {
      const { score } = req.body;
      const result = req.gameManager.completeWhackAMole(score);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

**Step 3: Add GameManager delegate in loop.js**

In `src/game/loop.js`, find the section with `completeWordDiscovery()` (~line 556) and add after it:

```js
  completeWhackAMole(score) {
    return this.explorationService.completeWhackAMole(score);
  }
```

**Step 4: Add ExplorationService method**

In `src/game/services/exploration-service.js`, find `completeWordDiscovery()` (~line 422) and add a new method after it:

```js
  /**
   * Complete whack-a-mole game and award credits
   */
  completeWhackAMole(score) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'whackAMole') {
      throw new Error('No whack-a-mole room here');
    }

    if (room.interacted) {
      return { type: 'whack_a_mole_complete', alreadyComplete: true, score: room.whackAMole.score, creditsAwarded: 0 };
    }

    const clampedScore = Math.max(0, Math.floor(score || 0));
    room.whackAMole.score = clampedScore;
    room.whackAMole.completed = true;
    room.interacted = true;

    // Award 1 credit per point
    const creditsAwarded = clampedScore;
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditsAwarded;

    return { type: 'whack_a_mole_complete', score: clampedScore, creditsAwarded };
  }
```

**Step 5: Syntax check all three files**

Run: `node --check src/routes/game/run.js && node --check src/game/loop.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/routes/game/run.js src/game/loop.js src/game/services/exploration-service.js
git commit -m "feat(whack-a-mole): add pool and complete API endpoints"
```

---

### Task 4: Wire frontend routing

**Files:**
- Modify: `public/js/api.js` (add API functions)
- Modify: `public/game.js` (add imports, phase routing, scene handling)

**Step 1: Add API functions in api.js**

In `public/js/api.js`, add two new functions near the dealer functions (~line 396):

```js
async function getWhackAMolePool() {
  return apiCall('/game/whack-a-mole-pool', 'GET');
}

async function completeWhackAMole(score) {
  return apiCall('/game/whack-a-mole-complete', 'POST', { score });
}
```

**Step 2: Add to game.js imports**

In `public/game.js:108-154`, add to the import block:

```js
  getWhackAMolePool as apiGetWhackAMolePool,
  completeWhackAMole as apiCompleteWhackAMole,
```

**Step 3: Add phase case in updateGameContent()**

In `public/game.js` (~line 325-377), in the `updateGameContent()` switch, add before the `'branch_selection'` case:

```js
    case 'whackAMole':
      explorationUI.renderWhackAMole();
      break;
```

**Step 4: Add scene handling in updateScene()**

In `public/game.js` (~line 252-282), the whackAMole phase doesn't need a special NPC or background — it uses the area's room background. No changes needed here; the existing `else if (gameState.run?.background)` fallback at line 281-282 already handles it.

**Step 5: Add phase entry handling**

In `public/game.js` (~line 755-774), in the switch that handles entering phases, add:

```js
      case 'whackAMole':
        await loadGameState();
        updateUI();
        break;
```

**Step 6: Pass API functions to exploration.js init**

In `public/game.js`, find where `explorationUI.init()` is called and ensure `apiGetWhackAMolePool` and `apiCompleteWhackAMole` are passed. Check how other API functions are passed.

Look at the `explorationUI.init()` call and add the new API functions as callbacks. The pattern is that API functions are passed as named callbacks during init.

**Step 7: Syntax check**

Run: `node --check public/js/api.js && node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 8: Commit**

```bash
git add public/js/api.js public/game.js
git commit -m "feat(whack-a-mole): wire frontend phase routing and API"
```

---

### Task 5: Build the game UI renderer

**Files:**
- Modify: `public/js/ui/exploration.js` (add renderWhackAMole function)

This is the largest task. The `renderWhackAMole()` function contains the entire client-side game loop.

**Step 1: Add callback variables**

At the top of exploration.js where other callback vars are declared (~line 32-112), add:

```js
let apiGetWhackAMolePool = null;
let apiCompleteWhackAMole = null;
```

In the `init()` function, add:

```js
  apiGetWhackAMolePool = callbacks.apiGetWhackAMolePool;
  apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;
```

**Step 2: Add the renderWhackAMole function**

Add after the `renderWordDiscovery()` function. This is the full game implementation:

```js
/** Whack-a-Mole mini game — match Japanese words to creature/item sprites */
export async function renderWhackAMole() {
  const gameState = getGameState();
  const room = gameState.run.rooms[gameState.run.currentRoom];

  // Already completed — just show proceed
  if (room?.interacted) {
    actions.setContent(`
      <div class="wam-results">
        <div class="wam-results-title">ゲーム完了!</div>
        <div class="wam-results-score">Score: ${room.whackAMole?.score || 0}</div>
      </div>
    `);
    return;
  }

  // Fetch pool from server
  let pool;
  try {
    const resp = await apiGetWhackAMolePool();
    pool = resp.pool;
  } catch (err) {
    actions.setContent('<div class="wam-error">Failed to load game data</div>');
    return;
  }

  if (!pool || pool.length < 9) {
    actions.setContent('<div class="wam-error">Not enough creatures/items for game</div>');
    return;
  }

  // Show start screen
  actions.setContent(`
    <div class="wam-container">
      <div class="wam-start">
        <div class="wam-start-title">ワードマッチ!</div>
        <div class="wam-start-desc">Match the word to the correct creature or item</div>
        <button class="action-btn action-btn-primary wam-start-btn">プレイ</button>
      </div>
    </div>
  `);

  document.querySelector('.wam-start-btn')?.addEventListener('click', () => {
    startWhackAMoleGame(pool, room);
  });
}

function startWhackAMoleGame(pool, room) {
  let score = 0;
  let timeLeft = 30.0;
  let targetIndex = 0;
  let tiles = Array(9).fill(null).map(() => ({ faceUp: false, poolIndex: -1, isCorrect: false }));
  let gameOver = false;
  let flipInterval = null;
  let timerInterval = null;

  // Pick initial target
  targetIndex = Math.floor(Math.random() * pool.length);

  // Render game UI
  function renderGameUI() {
    const target = pool[targetIndex];
    actions.setContent(`
      <div class="wam-container">
        <div class="wam-hud">
          <div class="wam-score">★ ${score}</div>
          <div class="wam-timer" id="wam-timer">${formatTime(timeLeft)}</div>
        </div>
        <div class="wam-word-card">
          <div class="wam-word-kanji">${target.word}</div>
          <div class="wam-word-reading">${target.reading}</div>
          <div class="wam-word-meaning">${target.meaning}</div>
        </div>
        <div class="wam-grid" id="wam-grid">
          ${tiles.map((_, i) => `
            <div class="wam-tile" data-index="${i}">
              <div class="wam-tile-inner">
                <div class="wam-tile-front"></div>
                <div class="wam-tile-back">
                  <img class="wam-tile-img" src="" alt="" />
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // Bind click handlers
    document.querySelectorAll('.wam-tile').forEach(tile => {
      tile.addEventListener('click', () => handleTileTap(parseInt(tile.dataset.index)));
    });
  }

  function formatTime(t) {
    const secs = Math.max(0, Math.ceil(t));
    return secs.toString().padStart(2, '0');
  }

  function updateTimerDisplay() {
    const el = document.getElementById('wam-timer');
    if (!el) return;
    const secs = Math.max(0, Math.ceil(timeLeft));
    el.textContent = secs.toString().padStart(2, '0');
    el.classList.toggle('wam-timer-warn', timeLeft <= 10 && timeLeft > 5);
    el.classList.toggle('wam-timer-danger', timeLeft <= 5);
  }

  function updateWordCard() {
    const target = pool[targetIndex];
    const kanji = document.querySelector('.wam-word-kanji');
    const reading = document.querySelector('.wam-word-reading');
    const meaning = document.querySelector('.wam-word-meaning');
    if (kanji) kanji.textContent = target.word;
    if (reading) reading.textContent = target.reading;
    if (meaning) meaning.textContent = target.meaning;
  }

  function updateScoreDisplay() {
    const el = document.querySelector('.wam-score');
    if (el) el.textContent = `★ ${score}`;
  }

  // Tile state management
  function setTileFaceUp(index, poolIdx, isCorrect) {
    tiles[index] = { faceUp: true, poolIndex: poolIdx, isCorrect };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.add('wam-flipped');
    const img = tileEl.querySelector('.wam-tile-img');
    if (img) img.src = pool[poolIdx].sprite;
  }

  function setTileFaceDown(index) {
    tiles[index] = { faceUp: false, poolIndex: -1, isCorrect: false };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.remove('wam-flipped');
  }

  // Get a random distractor index (not the current target)
  function randomDistractorIndex() {
    let idx;
    do {
      idx = Math.floor(Math.random() * pool.length);
    } while (idx === targetIndex);
    return idx;
  }

  // Ensure exactly one correct tile is visible
  function ensureCorrectTileVisible() {
    const correctTiles = tiles.filter(t => t.faceUp && t.isCorrect);
    if (correctTiles.length === 0) {
      // Pick a random tile to show the correct answer
      const candidates = [];
      for (let i = 0; i < 9; i++) candidates.push(i);
      const shuffled = candidates.sort(() => Math.random() - 0.5);
      // Prefer a face-down tile
      const downTile = shuffled.find(i => !tiles[i].faceUp);
      const target = downTile !== undefined ? downTile : shuffled[0];
      setTileFaceUp(target, targetIndex, true);
    }
  }

  // Flip event: randomly flip a tile up or down
  function flipEvent() {
    if (gameOver) return;

    const faceUpCount = tiles.filter(t => t.faceUp).length;
    const faceDownCount = 9 - faceUpCount;

    // Bias: try to keep 4-5 face up
    let shouldFlipUp;
    if (faceUpCount <= 3) shouldFlipUp = true;
    else if (faceUpCount >= 7) shouldFlipUp = false;
    else shouldFlipUp = Math.random() < 0.5;

    if (shouldFlipUp && faceDownCount > 0) {
      // Flip a random face-down tile up with a distractor
      const downIndices = tiles.map((t, i) => (!t.faceUp ? i : -1)).filter(i => i >= 0);
      const pick = downIndices[Math.floor(Math.random() * downIndices.length)];
      setTileFaceUp(pick, randomDistractorIndex(), false);
    } else if (!shouldFlipUp && faceUpCount > 1) {
      // Flip a random face-up tile down (but NOT the correct one)
      const upIndices = tiles.map((t, i) => (t.faceUp && !t.isCorrect ? i : -1)).filter(i => i >= 0);
      if (upIndices.length > 0) {
        const pick = upIndices[Math.floor(Math.random() * upIndices.length)];
        setTileFaceDown(pick);
      }
    }

    ensureCorrectTileVisible();
  }

  // Handle tile tap
  function handleTileTap(index) {
    if (gameOver) return;
    const tile = tiles[index];
    if (!tile.faceUp) return; // ignore face-down

    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);

    if (tile.isCorrect) {
      // HIT
      score++;
      timeLeft = Math.min(timeLeft + 5, 99);
      updateScoreDisplay();
      updateTimerDisplay();

      // Non-blocking celebration
      if (tileEl) {
        tileEl.classList.add('wam-hit');
        // Float +1
        const plus = document.createElement('div');
        plus.className = 'wam-plus-one';
        plus.textContent = '+1';
        tileEl.appendChild(plus);
        setTimeout(() => {
          tileEl.classList.remove('wam-hit');
          plus.remove();
        }, 600);
      }

      // Pick new target
      const oldTarget = targetIndex;
      // Mark old correct tile as distractor
      for (let i = 0; i < 9; i++) {
        if (tiles[i].isCorrect) {
          tiles[i].isCorrect = false;
          // Optionally re-assign as a random distractor
          tiles[i].poolIndex = randomDistractorIndex();
          const img = document.querySelector(`.wam-tile[data-index="${i}"] .wam-tile-img`);
          if (img) img.src = pool[tiles[i].poolIndex].sprite;
        }
      }

      // Choose new target (different from old)
      do {
        targetIndex = Math.floor(Math.random() * pool.length);
      } while (targetIndex === oldTarget && pool.length > 1);

      updateWordCard();
      ensureCorrectTileVisible();

      playSFX('correct');
    } else {
      // MISS
      timeLeft = Math.max(0, timeLeft - 3);
      updateTimerDisplay();

      if (tileEl) {
        tileEl.classList.add('wam-miss');
        setTimeout(() => tileEl.classList.remove('wam-miss'), 400);
      }

      if (timeLeft <= 0) endGame();
    }
  }

  // End game
  async function endGame() {
    gameOver = true;
    clearInterval(flipInterval);
    clearInterval(timerInterval);

    try {
      const result = await apiCompleteWhackAMole(score);
      updateGameState(result.state);
    } catch (err) {
      // Still show results even if save fails
    }

    actions.setContent(`
      <div class="wam-container">
        <div class="wam-results">
          <div class="wam-results-title">タイムアップ!</div>
          <div class="wam-results-score">★ ${score}</div>
          <div class="wam-results-credits">${score} credits earned</div>
          <button class="action-btn action-btn-primary wam-continue-btn">Continue</button>
        </div>
      </div>
    `);

    document.querySelector('.wam-continue-btn')?.addEventListener('click', () => {
      updateUI();
    });
  }

  // Initialize game
  renderGameUI();

  // Set up initial board: 4-5 face-up tiles
  const initialUp = 4 + Math.floor(Math.random() * 2);
  const indices = [0,1,2,3,4,5,6,7,8].sort(() => Math.random() - 0.5);

  // First, place the correct answer
  setTileFaceUp(indices[0], targetIndex, true);

  // Then fill remaining initial tiles with distractors
  for (let i = 1; i < initialUp; i++) {
    setTileFaceUp(indices[i], randomDistractorIndex(), false);
  }

  // Start flip scheduling (random interval 1-2s)
  function scheduleFlip() {
    if (gameOver) return;
    const delay = 1000 + Math.random() * 1000;
    flipInterval = setTimeout(() => {
      flipEvent();
      scheduleFlip();
    }, delay);
  }
  scheduleFlip();

  // Start timer countdown (update every 100ms for smooth display)
  timerInterval = setInterval(() => {
    if (gameOver) return;
    timeLeft -= 0.1;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
  }, 100);
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat(whack-a-mole): implement client-side game UI and logic"
```

---

### Task 6: Add CSS styles

**Files:**
- Modify: `public/game.css` (add `.wam-*` styles at the end)

**Step 1: Add all whack-a-mole styles**

Append to the end of `public/game.css`:

```css
/* ===== WHACK-A-MOLE MINI GAME ===== */

.wam-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

/* HUD: score + timer */
.wam-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 1rem;
}

.wam-score {
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-amber);
}

.wam-timer {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  transition: color 0.3s;
}

.wam-timer-warn {
  color: var(--accent-amber);
}

.wam-timer-danger {
  color: var(--accent-red);
  animation: wam-pulse 0.6s ease-in-out infinite;
}

@keyframes wam-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Word card */
.wam-word-card {
  background: var(--bg-card);
  border-radius: var(--card-radius);
  padding: 0.75rem 1.25rem;
  text-align: center;
  box-shadow: var(--shadow-soft);
  width: 100%;
}

.wam-word-kanji {
  font-size: 2rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.2;
}

.wam-word-reading {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.wam-word-meaning {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 0.125rem;
}

/* 3x3 Tile Grid */
.wam-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  aspect-ratio: 1;
  perspective: 800px;
}

/* Individual tile — mahjong style */
.wam-tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.wam-tile-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}

.wam-flipped .wam-tile-inner {
  transform: rotateY(180deg);
}

/* Tile faces (shared) */
.wam-tile-front,
.wam-tile-back {
  position: absolute;
  inset: 0;
  border-radius: var(--card-radius-sm);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Face-down: ivory tile back with pattern */
.wam-tile-front {
  background: linear-gradient(135deg, #f5f0e8 0%, #ebe5d9 100%);
  border: 2px solid rgba(0,0,0,0.08);
  box-shadow: 0 2px 6px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Decorative pattern on tile back */
.wam-tile-front::after {
  content: '✦';
  font-size: 1.5rem;
  color: rgba(0,0,0,0.08);
}

/* Face-up: white tile with sprite */
.wam-tile-back {
  background: #ffffff;
  border: 2px solid rgba(0,0,0,0.08);
  box-shadow: 0 2px 6px rgba(0,0,0,0.10), inset 0 1px 4px rgba(0,0,0,0.04);
  transform: rotateY(180deg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10%;
  overflow: hidden;
}

.wam-tile-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

/* Hit feedback — gold glow */
.wam-hit {
  z-index: 2;
}

.wam-hit .wam-tile-back {
  border-color: var(--accent-amber);
  box-shadow: 0 0 12px rgba(255, 183, 77, 0.5);
}

/* Miss feedback — red shake */
.wam-miss .wam-tile-inner {
  animation: wam-shake 0.3s ease;
}

.wam-miss .wam-tile-back {
  border-color: var(--accent-red);
  box-shadow: 0 0 8px rgba(239, 83, 80, 0.3);
}

@keyframes wam-shake {
  0%, 100% { transform: rotateY(180deg) translateX(0); }
  25% { transform: rotateY(180deg) translateX(-4px); }
  75% { transform: rotateY(180deg) translateX(4px); }
}

/* Floating +1 */
.wam-plus-one {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.25rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-amber);
  pointer-events: none;
  z-index: 10;
  animation: wam-float-up 0.6s ease-out forwards;
}

@keyframes wam-float-up {
  0% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
  100% { opacity: 0; transform: translate(-50%, -50%) translateY(-30px); }
}

/* Start screen */
.wam-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 1rem;
  text-align: center;
}

.wam-start-title {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.wam-start-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

/* Results screen */
.wam-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 1rem;
  text-align: center;
}

.wam-results-title {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.wam-results-score {
  font-size: 2rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-amber);
}

.wam-results-credits {
  font-size: 1rem;
  color: var(--text-secondary);
}

.wam-error {
  padding: 2rem;
  text-align: center;
  color: var(--accent-red);
}
```

**Step 2: Syntax check (CSS doesn't have node --check, but verify no typos)**

Run: `grep -c 'wam-' public/game.css`
Expected: A count > 50 confirming the styles were added.

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(whack-a-mole): add mahjong tile CSS styles"
```

---

### Task 7: Smoke test in browser

**Files:** None (testing only)

**Step 1: Start the dev server**

Run: `npm start &`
Wait 3 seconds, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

**Step 2: Open browser and navigate to game**

Navigate to `http://localhost:3000` in the Playwright browser. Log in and start a run. Use the test room queue (if accessible) or play through rooms until a whack-a-mole room appears.

Alternatively, temporarily set the WHACK_A_MOLE_CHANCE to 1.0 in rooms.js for testing, then revert.

**Step 3: Verify the game works:**
- Start screen appears with "プレイ" button
- Clicking "プレイ" starts the game
- 3x3 grid of mahjong tiles renders
- Tiles flip randomly
- Tapping correct tile: score +1, timer +5, new word
- Tapping wrong tile: timer -3, shake animation
- Timer counting down
- Game over screen with score and credits
- "Continue" button advances to next room

**Step 4: Revert any test changes and commit if needed**

---

### Task 8: Final review and cleanup

**Files:** All modified files

**Step 1: Run syntax checks on all modified files**

```bash
node --check src/game/rooms.js && \
node --check src/game/phase-machine.js && \
node --check src/routes/game/run.js && \
node --check src/game/loop.js && \
node --check src/game/services/exploration-service.js && \
node --check public/js/api.js && \
node --check public/game.js && \
node --check public/js/ui/exploration.js && \
echo "ALL OK"
```

**Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: Existing tests pass (pre-existing failures may remain but no new failures)

**Step 3: Final commit if any cleanup was needed**
