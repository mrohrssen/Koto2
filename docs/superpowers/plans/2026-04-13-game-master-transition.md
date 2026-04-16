# Game Master Transition Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clunky Game Master → whack-a-mole instant-launch with an i+1 dialogue moment where the GM asks the player to play, and the player can accept or decline.

**Architecture:** Add `gameMaster_ask` frames to the existing dialogue pipeline (frame-sources → tokenize → frames.json → dialogue-loader). Add a `skipWhackAMole()` method to `ExplorationService` and a server endpoint. Rewrite `renderWhackAMole()` to show narration + buttons before pool fetch. Also remove unused credits display.

**Tech Stack:** Node.js, Express, existing i+1 token pipeline, existing `renderButtons`/`renderJpSentence`/`narrationBox` UI components.

**Spec:** `docs/superpowers/specs/2026-04-13-game-master-transition-design.md`

**Note:** The spec says `POST /api/game/skip-whack-a-mole` but this plan uses `POST /whack-a-mole-skip` to match the existing naming convention (`whack-a-mole-pool`, `whack-a-mole-complete`). This is an intentional deviation.

---

## Chunk 1: Server-Side Dialogue + Skip Infrastructure

### Task 1: Add `gameMaster_ask` frames to frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json` (append to array)

- [ ] **Step 1: Add 4 gameMaster_ask entries to frame-sources.json**

Append these 4 entries to the end of the JSON array (before the final `]`):

```json
{
  "id": "gm_ask_1",
  "category": "gameMaster_ask",
  "raw": "遊びますか？",
  "slots": []
},
{
  "id": "gm_ask_2",
  "category": "gameMaster_ask",
  "raw": "一緒に遊びますか？",
  "slots": []
},
{
  "id": "gm_ask_3",
  "category": "gameMaster_ask",
  "raw": "楽しい言葉の遊びです！",
  "slots": []
},
{
  "id": "gm_ask_4",
  "category": "gameMaster_ask",
  "raw": "私と一緒に言葉で遊びますか？",
  "slots": []
}
```

- [ ] **Step 2: Regenerate frames.json**

Run: `node scripts/tokenize-static.js`
Expected: outputs line count, no errors. `data/dialogue/frames.json` is updated.

- [ ] **Step 3: Validate dialogue**

Run: `node scripts/validate-dialogue.js`
Expected: no validation errors for `gameMaster_ask` frames. All content words (`遊ぶ`, `一緒`, `楽しい`, `言葉`, `私`) are already in `data/dictionary.json`.

- [ ] **Step 4: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "content: add gameMaster_ask dialogue frames for GM transition"
```

---

### Task 2: Add `getGameMasterAskFrames()` to dialogue-loader.js + test

**Files:**
- Modify: `src/game/dialogue-loader.js:5` (add variable), `:23-24` (add filter), `:72` (add export)
- Modify: `tests/unit/dialogue-loader.test.js:3` (add import), append test

- [ ] **Step 1: Write the failing test**

In `tests/unit/dialogue-loader.test.js`, add import of `getGameMasterAskFrames` to the import block at line 3:

```javascript
import {
  loadDialoguePools,
  getBarkPool,
  getCidScripts,
  getNpcLines,
  getShopPurchaseFrames,
  getShopGreetingFrames,
  getBefriendFrames,
  getDialogueWordSet,
  getGameMasterAskFrames,
} from '../../src/game/dialogue-loader.js';
```

Add this test at the end of the `describe('dialogue-loader (frames.json)')` block (before the closing `});`):

```javascript
  it('getGameMasterAskFrames returns gameMaster_ask category frames', () => {
    const frames = getGameMasterAskFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 4, `expected at least 4 gameMaster_ask frames, got ${frames.length}`);
    assert.ok(frames.every(f => f.category === 'gameMaster_ask'));
    // Each frame should have tokens and words from the tokenizer
    for (const f of frames) {
      assert.ok(Array.isArray(f.tokens), `frame ${f.id} should have tokens`);
      assert.ok(Array.isArray(f.words), `frame ${f.id} should have words`);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/dialogue-loader.test.js`
Expected: FAIL — `getGameMasterAskFrames` is not exported.

- [ ] **Step 3: Implement in dialogue-loader.js**

In `src/game/dialogue-loader.js`:

1. Add variable at line 11 (after `let _shopGreetingFrames = [];`):
```javascript
let _gameMasterAskFrames = [];
```

2. Add filter at line 24 (after `_shopGreetingFrames = _frames.filter(...)` line):
```javascript
  _gameMasterAskFrames = _frames.filter(f => f.category === 'gameMaster_ask');
```

3. Add export at line 73 (after `getShopGreetingFrames`):
```javascript
export function getGameMasterAskFrames() { return _gameMasterAskFrames; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/dialogue-loader.test.js`
Expected: all tests PASS, including the new `getGameMasterAskFrames` test.

- [ ] **Step 5: Commit**

```bash
git add src/game/dialogue-loader.js tests/unit/dialogue-loader.test.js
git commit -m "feat: add getGameMasterAskFrames to dialogue-loader"
```

---

### Task 3: Add `skipWhackAMole()` to ExplorationService + GameManager proxy + test

**Files:**
- Modify: `src/game/services/exploration-service.js:586` (add method after `completeWhackAMole`)
- Modify: `src/game/loop.js:545` (add proxy method after `completeWhackAMole` proxy)
- Modify: `tests/unit/game/whack-a-mole.test.js` (add test block)

- [ ] **Step 1: Write the failing test**

Add this `describe` block at the end of `tests/unit/game/whack-a-mole.test.js`:

```javascript
// ============ SKIP (DECLINE) ============

describe('Whack-a-Mole Skip', () => {
  it('should mark room interacted and advance to next room', () => {
    const gm = new GameManager('test-wam-skip');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'whackAMole',
      interacted: false,
      whackAMole: { score: 0, completed: false },
      roomNumber: 1,
      totalRooms: 5
    };

    const result = gm.skipWhackAMole();

    assert.strictEqual(result.type, 'whack_a_mole_skipped');
    assert.strictEqual(run.rooms[roomIdx].interacted, true);
    // Should have advanced to next room
    assert.strictEqual(run.currentRoom, roomIdx + 1);
  });

  it('should reject skip for non-whackAMole rooms', () => {
    const gm = new GameManager('test-wam-skip2');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    run.rooms[run.currentRoom] = {
      type: 'encounter',
      interacted: false,
      roomNumber: 1,
      totalRooms: 5
    };

    assert.throws(() => gm.skipWhackAMole(), /No whack-a-mole room here/);
  });

  it('should return alreadySkipped for already-interacted rooms', () => {
    const gm = new GameManager('test-wam-skip3');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'whackAMole',
      interacted: true,
      whackAMole: { score: 0, completed: false },
      roomNumber: 1,
      totalRooms: 5
    };

    const result = gm.skipWhackAMole();
    assert.strictEqual(result.alreadySkipped, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/whack-a-mole.test.js`
Expected: FAIL — `gm.skipWhackAMole is not a function`.

- [ ] **Step 3: Implement skipWhackAMole in exploration-service.js**

Add this method in `src/game/services/exploration-service.js` after `completeWhackAMole()` (after the closing `}` on line 587):

```javascript
  skipWhackAMole() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'whackAMole') {
      throw new Error('No whack-a-mole room here');
    }

    if (room.interacted) {
      return { type: 'whack_a_mole_skipped', alreadySkipped: true };
    }

    room.interacted = true;

    const proceedResult = this.proceedToNextRoom();
    return { type: 'whack_a_mole_skipped', ...proceedResult };
  }
```

- [ ] **Step 4: Add GameManager proxy in loop.js**

In `src/game/loop.js`, after the `completeWhackAMole` proxy (after line 545), add:

```javascript
  skipWhackAMole() {
    return this.explorationService.skipWhackAMole();
  }
```

This follows the same delegate pattern as `completeWhackAMole` at line 543-545. Without this proxy, `req.gameManager.skipWhackAMole()` in the route handler and `gm.skipWhackAMole()` in tests will both fail.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/game/whack-a-mole.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js tests/unit/game/whack-a-mole.test.js
git commit -m "feat: add skipWhackAMole to ExplorationService + GameManager proxy"
```

---

### Task 4: Add server endpoints — dialogue + skip

**Files:**
- Modify: `src/routes/game/run.js:22` (add import), `:683` (add endpoints after whack-a-mole-complete)
- Modify: `tests/unit/game/whack-a-mole.test.js` (add route handler test)

- [ ] **Step 1: Write the failing test for the dialogue endpoint**

Add to the `describe('Whack-a-Mole Pool')` block in `tests/unit/game/whack-a-mole.test.js` (which already has the `getHandler` helper and `createRunRoutes` setup):

```javascript
  it('GET /whack-a-mole-dialogue should return dialogue tokens', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-dialogue');
    assert.ok(handler, 'GET /whack-a-mole-dialogue handler should exist');

    const req = {
      gameManager: {
        run: {
          areaPath: [],
          currentArea: { id: 'hajimari-no-hiroba' }
        },
        getCurrentRoom() {
          return { type: 'whackAMole', interacted: false, whackAMole: { score: 0, completed: false } };
        }
      },
      user: { id: 'test-gm-dialogue' }
    };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.body = d; return this; }
    };

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.dialogue, 'response should have dialogue');
    assert.ok(Array.isArray(res.body.dialogue.tokens), 'dialogue should have tokens array');
    assert.ok(Array.isArray(res.body.dialogue.words), 'dialogue should have words array');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/whack-a-mole.test.js`
Expected: FAIL — handler is null (endpoint doesn't exist yet).

- [ ] **Step 3: Add import of getGameMasterAskFrames to run.js**

In `src/routes/game/run.js` line 22, add `getGameMasterAskFrames` to the existing import:

```javascript
import { getShopPurchaseFrames, getShopGreetingFrames, getGameMasterAskFrames } from '../../game/dialogue-loader.js';
```

- [ ] **Step 4: Add both endpoints to run.js**

In `src/routes/game/run.js`, after the `whack-a-mole-complete` handler (after line 683), add:

```javascript
  // Whack-a-Mole: get GM dialogue (i+1 selected greeting)
  router.get('/whack-a-mole-dialogue', (req, res) => {
    try {
      const knownWords = getKnownWordsFromFsrs(req.user.id);
      const knownSet = new Set(knownWords);
      const askFrames = getGameMasterAskFrames();
      const candidates = askFrames.map(frame => assembleFrame(frame, {}));
      const eligible = candidates.filter(c => isEligible(c.tokens, knownSet));

      let dialogue;
      if (eligible.length > 0) {
        eligible.sort((a, b) => scoreCandidate(b.tokens, knownSet) - scoreCandidate(a.tokens, knownSet));
        dialogue = eligible[0];
      } else {
        dialogue = candidates[0] || { tokens: [], words: [] };
      }

      res.json({ dialogue });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Whack-a-Mole: skip (player declined)
  router.post('/whack-a-mole-skip', (req, res) => {
    try {
      const result = req.gameManager.skipWhackAMole();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/game/whack-a-mole.test.js`
Expected: all tests PASS including the new dialogue endpoint test.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/run.js tests/unit/game/whack-a-mole.test.js
git commit -m "feat: add whack-a-mole-dialogue and whack-a-mole-skip endpoints"
```

---

## Chunk 2: Client-Side Dialogue UI + Credits Removal

### Task 5: Add API functions for new endpoints

**Files:**
- Modify: `public/js/api.js:376` (add functions after `completeWhackAMole`)

- [ ] **Step 1: Add two new API functions**

In `public/js/api.js`, after the `completeWhackAMole` function (after line 376), add:

```javascript
/** Get GM dialogue tokens for whack-a-mole room */
async function getWhackAMoleDialogue() {
  return apiCall('/whack-a-mole-dialogue', 'GET');
}

/** Skip whack-a-mole room (player declined) */
async function skipWhackAMole() {
  return apiCall('/whack-a-mole-skip', 'POST');
}
```

- [ ] **Step 2: Add to exports**

Find the exports block in `public/js/api.js` where `getWhackAMolePool` and `completeWhackAMole` are exported (around line 765-766). Add the two new functions using bare names (the `as` aliasing happens at the import site in `game.js`, not here):

```javascript
  getWhackAMoleDialogue,
  skipWhackAMole,
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add apiGetWhackAMoleDialogue and apiSkipWhackAMole"
```

---

### Task 6: Wire API functions through game.js into exploration.js

**Files:**
- Modify: `public/game.js` (add imports + pass to callbacks)
- Modify: `public/js/ui/exploration.js` (add callback variables + init)

- [ ] **Step 1: Add imports in game.js**

In `public/game.js`, find the import line containing `apiGetWhackAMolePool` (around line 179-180). Add the new imports:

```javascript
  getWhackAMoleDialogue as apiGetWhackAMoleDialogue,
  skipWhackAMole as apiSkipWhackAMole,
```

- [ ] **Step 2: Pass callbacks in game.js**

In `public/game.js`, find the callbacks object passed to `exploration.init()` (around line 1775-1776 where `apiGetWhackAMolePool` and `apiCompleteWhackAMole` are passed). Add after `apiCompleteWhackAMole`:

```javascript
    apiGetWhackAMoleDialogue,
    apiSkipWhackAMole,
```

- [ ] **Step 3: Add callback variables in exploration.js**

In `public/js/ui/exploration.js`, find `let apiCompleteWhackAMole = null;` (line 107). Add after it:

```javascript
let apiGetWhackAMoleDialogue = null;
let apiSkipWhackAMole = null;
```

- [ ] **Step 4: Wire in init()**

In `public/js/ui/exploration.js`, find `apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;` (line 171). Add after it:

```javascript
  apiGetWhackAMoleDialogue = callbacks.apiGetWhackAMoleDialogue;
  apiSkipWhackAMole = callbacks.apiSkipWhackAMole;
```

- [ ] **Step 5: Syntax check both files**

Run: `node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: "OK"

- [ ] **Step 6: Commit**

```bash
git add public/game.js public/js/ui/exploration.js
git commit -m "feat: wire GM dialogue and skip APIs through to exploration module"
```

---

### Task 7: Rewrite renderWhackAMole() to show GM dialogue

**Files:**
- Modify: `public/js/ui/exploration.js:890-935` (rewrite `renderWhackAMole`)

This is the core change. Replace the current `renderWhackAMole` function with one that:
1. Fetches GM dialogue tokens from the server
2. Shows narration box with `renderJpSentence`
3. Shows はい/いいえ buttons via `renderButtons`
4. Yes → fetches pool → starts game directly (no intermediate start screen)
5. No → slides GM out → calls skip endpoint → `updateUI()`

- [ ] **Step 1: Replace the renderWhackAMole function**

Replace the function at `public/js/ui/exploration.js` lines 890-935 (from `export async function renderWhackAMole() {` to the closing `}` before `/** Skill Master room`) with:

```javascript
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

  // Fetch GM dialogue tokens (before pool — no wasted request on decline)
  let dialogue = null;
  try {
    const resp = await apiGetWhackAMoleDialogue();
    dialogue = resp?.dialogue;
  } catch (err) {
    // Fallback: proceed without dialogue
  }

  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));

  // Show GM greeting in narration box
  if (dialogue?.tokens?.length && sceneModule?.showNarration) {
    const html = renderJpSentence(dialogue.tokens, getKnownWords(), wordDict, {}, false);
    await sceneModule.showNarration(html, { html: true, speaker: 'Game Master' });
  }

  // Show yes/no buttons with renderJpSentence labels
  const yesTokens = [{ surface: 'はい', base: 'はい', reading: 'はい', meaning: 'yes' }];
  const noTokens = [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', meaning: 'no' }];
  const yesLabel = renderJpSentence(yesTokens, getKnownWords(), wordDict, {}, false);
  const noLabel = renderJpSentence(noTokens, getKnownWords(), wordDict, {}, false);

  renderButtons([
    {
      label: yesLabel,
      primary: true,
      onClick: async () => {
        // Fetch pool and start game directly (no intermediate start screen)
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

        startWhackAMoleGame(pool);
      }
    },
    {
      label: noLabel,
      onClick: async () => {
        await hideNpcSprite({ slideOut: true });
        try {
          const result = await apiSkipWhackAMole();
          if (result?.state) {
            updateGameState(result.state);
          }
        } catch (err) {
          // Fallback: just update UI
        }
        updateUI();
      }
    }
  ]);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: rewrite renderWhackAMole with GM dialogue + yes/no buttons"
```

---

### Task 8: Remove credits from game-finished screen

**Files:**
- Modify: `public/js/ui/whack-a-mole.js:373` (delete one line)

- [ ] **Step 1: Remove the credits line**

In `public/js/ui/whack-a-mole.js`, delete line 373:
```javascript
          <div class="wam-results-credits">${this.score} credits earned</div>
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/whack-a-mole.js && echo "OK"`
Expected: "OK"

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/whack-a-mole.js
git commit -m "fix: remove unused credits display from whack-a-mole results"
```

---

### Task 9: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Play through to a whack-a-mole room**

Using a browser (Playwright or manual):
1. Log in and start a run
2. Navigate rooms until you hit a whackAMole room
3. Verify: GM sprite slides in, narration box appears with i+1 Japanese question, then はい/いいえ buttons appear
4. Tap はい — verify game starts directly (no intermediate "play" screen)
5. Complete the game — verify no "credits earned" line in results

- [ ] **Step 3: Test the decline path**

1. Navigate to another whackAMole room (or restart)
2. Tap いいえ — verify GM slides out and game advances to next room

- [ ] **Step 4: Final commit if any fixes needed**
