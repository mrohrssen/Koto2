# Whack-a-Mole Finish Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fullscreen katakana `.wam-results` card at the end of whack-a-mole with a GM i+1 narration line + a system narration (`Your team gained N XP!`) that fires combat-style Pixi popups over the player formation, then auto-advances via `apiProceed`.

**Architecture:** Reuse existing primitives — the narration box, `renderJpSentence` (which now auto-records exposure via `exposure-buffer.js`), `pixiXpPopup`/`pixiLevelUpPopup` from `pixi/text.js`, `animateLevelUpForScene` from `pixi/formation.js`, `spritePos` from `combat-vfx.js`, and the standard `apiProceed → playRoomTransition → updateUI` room-advance path. Add one new dialogue category (`gameMaster_finish`), one new dialogue-loader export, and one response field on `/whack-a-mole-complete`. No new UI functions, no new CSS, no new animation primitives.

**Tech Stack:** Node.js 18+, Express, Pixi.js, vanilla ES modules, `node:test` for unit tests, existing Sudachi-based tokenizer pipeline, existing i+1 frame selector.

**Spec:** [`docs/superpowers/specs/2026-04-21-whack-a-mole-finish-redesign-design.md`](../specs/2026-04-21-whack-a-mole-finish-redesign-design.md)

---

## File Map

- **Create:** none
- **Modify:**
  - `data/dialogue/frame-sources.json` — 5 new `gameMaster_finish` entries
  - `data/dialogue/frames.json` — regenerated artifact (do not hand-edit)
  - `src/game/dialogue-loader.js` — add `_gameMasterFinishFrames` pool + `getGameMasterFinishFrames()` export
  - `src/routes/game/run.js` — extend `/whack-a-mole-complete` to return `finishDialogue`
  - `tests/unit/dialogue-loader.test.js` — new test for `getGameMasterFinishFrames`
  - `tests/unit/game/whack-a-mole.test.js` — new test for `finishDialogue` in complete response
  - `public/js/ui/whack-a-mole.js` — rewrite `_endGame()` body, add top-level imports
  - `public/js/ui/exploration.js` — rewrite interacted-branch, extend `startWhackAMoleGame` deps
  - `public/game.css` — delete `.wam-results*` blocks

---

## Task 0: Worktree setup

**Files:** none (shell only)

- [ ] **Step 1: Confirm we're on dev and pull latest**

Run:
```bash
/usr/bin/git rev-parse --show-toplevel
/usr/bin/git status --short
/usr/bin/git pull origin dev
```

Expected: `/Users/michia/Documents/Claude Projects/Koto2` (or whatever the dev checkout path is), clean or known-safe status, pull succeeds.

- [ ] **Step 2: Create worktree**

```bash
PROJECT_ROOT=$(/usr/bin/git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"
/usr/bin/git fetch origin
/usr/bin/git worktree add ../koto-wt-wam-finish -b feature/wam-finish-redesign
cd ../koto-wt-wam-finish
```

Expected: `../koto-wt-wam-finish` exists, new branch `feature/wam-finish-redesign` checked out inside it, cwd is the worktree.

- [ ] **Step 3: Install dependencies in the worktree if needed**

Run:
```bash
[ -d node_modules ] || npm install
```

Expected: silent no-op (symlinks in a worktree usually share node_modules) OR full `npm install` completing cleanly.

---

## Task 1: Add finish dialogue frames + regenerate frames.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`
- Regenerate: `data/dialogue/frames.json` (by script)

- [ ] **Step 1: Verify all new-frame words exist in the dictionary**

Run this exact command:
```bash
node -e "
const dict = JSON.parse(require('fs').readFileSync('data/dictionary.json', 'utf8'));
const missing = [];
for (const word of ['上手', '楽しい', '遊び', '言葉', 'の']) {
  if (!dict[word]) missing.push(word);
}
if (missing.length > 0) {
  console.error('MISSING:', missing.join(', '));
  process.exit(1);
}
console.log('OK - all words present');
"
```

Expected: `OK - all words present`. **If any word is missing, STOP and ask the user** — per CLAUDE.md, do not modify `data/dictionary.json` without explicit user confirmation.

- [ ] **Step 2: Add the five `gameMaster_finish` frames to `frame-sources.json`**

Find the block at lines 1491-1496 (the `gm_ask_4` entry, the last `gameMaster_ask` frame) and insert the five new entries immediately after. Use `Edit` with these exact strings:

`old_string` (exact match, including the trailing `,`):
```json
  {
    "id": "gm_ask_4",
    "category": "gameMaster_ask",
    "raw": "私と一緒に言葉で遊びますか？",
    "slots": []
  },
```

`new_string`:
```json
  {
    "id": "gm_ask_4",
    "category": "gameMaster_ask",
    "raw": "私と一緒に言葉で遊びますか？",
    "slots": []
  },
  {
    "id": "gm_finish_1",
    "category": "gameMaster_finish",
    "raw": "上手！",
    "slots": []
  },
  {
    "id": "gm_finish_2",
    "category": "gameMaster_finish",
    "raw": "楽しい！",
    "slots": []
  },
  {
    "id": "gm_finish_3",
    "category": "gameMaster_finish",
    "raw": "楽しい遊び！",
    "slots": []
  },
  {
    "id": "gm_finish_4",
    "category": "gameMaster_finish",
    "raw": "言葉の遊び！",
    "slots": []
  },
  {
    "id": "gm_finish_5",
    "category": "gameMaster_finish",
    "raw": "楽しい言葉の遊び！",
    "slots": []
  },
```

- [ ] **Step 3: Regenerate `frames.json` via the Sudachi tokenizer**

Run:
```bash
node scripts/tokenize-static.js
```

Expected: the script reports it processed the new entries; `data/dialogue/frames.json` gets rewritten. No errors.

- [ ] **Step 4: Validate dialogue against the dictionary**

Run:
```bash
node scripts/validate-dialogue.js
```

Expected: `OK` or similar success output with no dictionary violations. If the script reports missing words for the new frames, STOP and report to the user — something is off with the tokenizer output vs. the dictionary.

- [ ] **Step 5: Sanity-check the new frames in `frames.json`**

Run:
```bash
node -e "
const frames = JSON.parse(require('fs').readFileSync('data/dialogue/frames.json', 'utf8'));
const finish = frames.filter(f => f.category === 'gameMaster_finish');
console.log('Count:', finish.length);
for (const f of finish) console.log(f.id, '|', f.raw, '|', f.words?.join(',') || '(no words)');
"
```

Expected output:
```
Count: 5
gm_finish_1 | 上手！ | 上手
gm_finish_2 | 楽しい！ | 楽しい
gm_finish_3 | 楽しい遊び！ | 楽しい,遊び
gm_finish_4 | 言葉の遊び！ | 言葉,遊び
gm_finish_5 | 楽しい言葉の遊び！ | 楽しい,言葉,遊び
```

(The `の` particle is not a content word, so it shouldn't appear in `words`; if it does, that's fine — the list format is loose.)

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add data/dialogue/frame-sources.json data/dialogue/frames.json
/usr/bin/git commit -m "$(cat <<'EOF'
feat(dialogue): add gameMaster_finish i+1 frames

Five sub-N5 frames (no conjugations, no copula, particle の only)
scaling 1→3 content words for the whack-a-mole GM finish narration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 2: Add `getGameMasterFinishFrames()` loader export (TDD)

**Files:**
- Test: `tests/unit/dialogue-loader.test.js` (modify existing)
- Modify: `src/game/dialogue-loader.js`

- [ ] **Step 1: Add the failing test**

Open `tests/unit/dialogue-loader.test.js`. At the top, add `getGameMasterFinishFrames` to the existing import block.

`old_string`:
```js
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
  getNpcDefeatFrames,
} from '../../src/game/dialogue-loader.js';
```

`new_string`:
```js
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
  getGameMasterFinishFrames,
  getNpcDefeatFrames,
} from '../../src/game/dialogue-loader.js';
```

Then append a new test after the `getGameMasterAskFrames` test (lines 88-97 in current file). Insert directly after the closing `});` of that test.

`old_string`:
```js
  it('getGameMasterAskFrames returns gameMaster_ask category frames', () => {
    const frames = getGameMasterAskFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 4, `expected at least 4 gameMaster_ask frames, got ${frames.length}`);
    assert.ok(frames.every(f => f.category === 'gameMaster_ask'));
    for (const f of frames) {
      assert.ok(Array.isArray(f.tokens), `frame ${f.id} should have tokens`);
      assert.ok(Array.isArray(f.words), `frame ${f.id} should have words`);
    }
  });
```

`new_string`:
```js
  it('getGameMasterAskFrames returns gameMaster_ask category frames', () => {
    const frames = getGameMasterAskFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 4, `expected at least 4 gameMaster_ask frames, got ${frames.length}`);
    assert.ok(frames.every(f => f.category === 'gameMaster_ask'));
    for (const f of frames) {
      assert.ok(Array.isArray(f.tokens), `frame ${f.id} should have tokens`);
      assert.ok(Array.isArray(f.words), `frame ${f.id} should have words`);
    }
  });

  it('getGameMasterFinishFrames returns gameMaster_finish category frames', () => {
    const frames = getGameMasterFinishFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 5, `expected at least 5 gameMaster_finish frames, got ${frames.length}`);
    assert.ok(frames.every(f => f.category === 'gameMaster_finish'));
    for (const f of frames) {
      assert.ok(Array.isArray(f.tokens), `frame ${f.id} should have tokens`);
      assert.ok(Array.isArray(f.words), `frame ${f.id} should have words`);
    }
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run:
```bash
node --test tests/unit/dialogue-loader.test.js
```

Expected: `getGameMasterFinishFrames returns gameMaster_finish category frames` fails with a `SyntaxError` or `ReferenceError` about `getGameMasterFinishFrames not exported`.

- [ ] **Step 3: Implement the loader export**

Edit `src/game/dialogue-loader.js`. Three changes in one file:

**3a:** Add the module-level pool variable. Find:

`old_string`:
```js
let _gameMasterAskFrames = [];
let _befriendFrames = {};
```

`new_string`:
```js
let _gameMasterAskFrames = [];
let _gameMasterFinishFrames = [];
let _befriendFrames = {};
```

**3b:** Populate the pool inside `loadDialoguePools`. Find:

`old_string`:
```js
  _gameMasterAskFrames = _frames.filter(f => f.category === 'gameMaster_ask');
  _npcDefeatFrames = _frames.filter(f => f.category === 'npcDefeat');
```

`new_string`:
```js
  _gameMasterAskFrames = _frames.filter(f => f.category === 'gameMaster_ask');
  _gameMasterFinishFrames = _frames.filter(f => f.category === 'gameMaster_finish');
  _npcDefeatFrames = _frames.filter(f => f.category === 'npcDefeat');
```

**3c:** Add the getter export next to `getGameMasterAskFrames`. Find:

`old_string`:
```js
export function getGameMasterAskFrames() { return _gameMasterAskFrames; }
```

`new_string`:
```js
export function getGameMasterAskFrames() { return _gameMasterAskFrames; }
export function getGameMasterFinishFrames() { return _gameMasterFinishFrames; }
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/dialogue-loader.test.js
```

Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add tests/unit/dialogue-loader.test.js src/game/dialogue-loader.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat(dialogue-loader): add getGameMasterFinishFrames export

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Return `finishDialogue` from `/whack-a-mole-complete` (TDD)

**Files:**
- Test: `tests/unit/game/whack-a-mole.test.js` (modify existing)
- Modify: `src/routes/game/run.js`

- [ ] **Step 1: Add the failing route test**

Open `tests/unit/game/whack-a-mole.test.js`. Find the existing test `GET /whack-a-mole-dialogue should return dialogue tokens` (lines 182-211). Insert a new test immediately after it. Note that the existing `POST /whack-a-mole-complete` handler is currently tested only indirectly via `GameManager.completeWhackAMole` (describe block "Whack-a-Mole Completion"). We're adding a new, route-level test.

Find this `old_string`:
```js
  it('should only include creatures and items from the current area', () => {
```

Replace with `new_string`:
```js
  it('POST /whack-a-mole-complete should include finishDialogue in response', async () => {
    const handler = getHandler(router, 'post', '/whack-a-mole-complete');
    assert.ok(handler, 'POST /whack-a-mole-complete handler should exist');

    let saved = false;
    const req = {
      body: { score: 3 },
      user: { id: 'test-wam-finish-dialogue' },
      gameManager: {
        completeWhackAMole(score) {
          return {
            type: 'whack_a_mole_complete',
            score,
            creditsAwarded: score,
            xpGrants: [],
            levelUps: [],
          };
        },
      },
      saveGame: () => { saved = true; },
      getEnrichedGameState: () => ({ run: {} }),
    };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.body = d; return this; },
    };

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.finishDialogue, 'response should include finishDialogue');
    assert.ok(Array.isArray(res.body.finishDialogue.tokens), 'finishDialogue.tokens should be an array');
    assert.ok(Array.isArray(res.body.finishDialogue.words), 'finishDialogue.words should be an array');
    assert.strictEqual(res.body.score, 3, 'existing response fields remain');
    assert.ok(saved, 'saveGame should have been called');
  });

  it('should only include creatures and items from the current area', () => {
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/game/whack-a-mole.test.js
```

Expected: the new test fails with `response should include finishDialogue` — because `res.body.finishDialogue` is `undefined`.

- [ ] **Step 3: Wire `finishDialogue` into the route handler**

Edit `src/routes/game/run.js`. Two changes:

**3a:** Add `getGameMasterFinishFrames` to the dialogue-loader import. Find:

`old_string`:
```js
import { getShopPurchaseFrames, getShopGreetingFrames, getGameMasterAskFrames, getGameMasterYesFrame, getGameMasterNoFrame, getSkillSelectFrame } from '../../game/dialogue-loader.js';
```

`new_string`:
```js
import { getShopPurchaseFrames, getShopGreetingFrames, getGameMasterAskFrames, getGameMasterFinishFrames, getGameMasterYesFrame, getGameMasterNoFrame, getSkillSelectFrame } from '../../game/dialogue-loader.js';
```

**3b:** Extend the `/whack-a-mole-complete` handler at line 674. Find:

`old_string`:
```js
  // Whack-a-Mole: complete game and award credits
  router.post('/whack-a-mole-complete', (req, res) => {
    try {
      const { score } = req.body;
      const result = req.gameManager.completeWhackAMole(score);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
```

`new_string`:
```js
  // Whack-a-Mole: complete game and award credits
  router.post('/whack-a-mole-complete', (req, res) => {
    try {
      const { score } = req.body;
      const result = req.gameManager.completeWhackAMole(score);
      req.saveGame();

      // Pick best i+1 finish dialogue for GM narration (words auto-exposed on client render)
      const knownWords = getKnownWordsFromFsrs(req.user.id);
      const knownSet = new Set(knownWords);
      const finishFrames = getGameMasterFinishFrames();
      const candidates = finishFrames.map(frame => assembleFrame(frame, {}));
      const finishDialogue = selectBestFrame(candidates, knownSet) || { tokens: [], words: [] };

      res.json({ ...result, finishDialogue, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/game/whack-a-mole.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Run the full backend test suite to catch regressions**

```bash
npm test
```

Expected: all tests pass. If any test fails, fix before proceeding.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add tests/unit/game/whack-a-mole.test.js src/routes/game/run.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat(wam): return finishDialogue from /whack-a-mole-complete

Server picks the best i+1-eligible gameMaster_finish frame and attaches
tokens/words to the existing completion response. Client will render
via renderJpSentence, which auto-records exposure via exposure-buffer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `_endGame()` in `whack-a-mole.js`

**Files:**
- Modify: `public/js/ui/whack-a-mole.js`

No unit tests — this is DOM + Pixi + network orchestration. Verified via manual playtest in Task 8.

- [ ] **Step 1: Extend the top-level imports**

Open `public/js/ui/whack-a-mole.js`. Find the existing import block at lines 1-2. Replace the entire import block:

`old_string`:
```js
import { animate as anime } from 'animejs';
import { toRomaji } from './romaji.js';
```

`new_string`:
```js
import { animate as anime } from 'animejs';
import { toRomaji } from './romaji.js';
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';
import { showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup } from '../pixi/text.js';
import { animateLevelUpForScene } from '../pixi/formation.js';
import { spritePos } from './combat-vfx.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { playRoomTransition } from './room-transition.js';
```

- [ ] **Step 2: Update the constructor JSDoc + deps extraction**

Find:

`old_string`:
```js
  /**
   * @param {Array} pool - Array of { id, word, reading, sprite } objects (min 9)
   * @param {Object} deps - Injected dependencies from the exploration module
   * @param {Object} deps.actions - Actions module with setContent()
   * @param {Function} deps.apiCompleteWhackAMole - API call to save score
   * @param {Function} deps.updateGameState - Callback to update game state
   * @param {Function} deps.updateUI - Callback to re-render the main UI
   * @param {Function} deps.playSFX - Sound effect player (optional, errors swallowed)
   */
  constructor(pool, deps) {
    this.pool = pool;
    this.actions = deps.actions;
    this.apiCompleteWhackAMole = deps.apiCompleteWhackAMole;
    this.updateGameState = deps.updateGameState;
    this.updateUI = deps.updateUI;
    this.playSFX = deps.playSFX;
```

`new_string`:
```js
  /**
   * @param {Array} pool - Array of { id, word, reading, sprite } objects (min 9)
   * @param {Object} deps - Injected dependencies from the exploration module
   * @param {Object} deps.actions - Actions module with setContent()
   * @param {Function} deps.apiCompleteWhackAMole - API call to save score
   * @param {Function} deps.apiProceed - API call to advance to the next room
   * @param {Function} deps.updateGameState - Callback to update game state
   * @param {Function} deps.updateUI - Callback to re-render the main UI
   * @param {Function} deps.playSFX - Sound effect player (optional, errors swallowed)
   */
  constructor(pool, deps) {
    this.pool = pool;
    this.actions = deps.actions;
    this.apiCompleteWhackAMole = deps.apiCompleteWhackAMole;
    this.apiProceed = deps.apiProceed;
    this.updateGameState = deps.updateGameState;
    this.updateUI = deps.updateUI;
    this.playSFX = deps.playSFX;
```

- [ ] **Step 3: Replace the entire `_endGame()` body**

Find the existing `_endGame()` at lines 327-363. Replace with:

`old_string`:
```js
  async _endGame() {
    this.gameOver = true;
    clearTimeout(this.flipTimeout);
    clearInterval(this.timerInterval);

    let xpGrants = [];
    let levelUps = [];
    try {
      const result = await this.apiCompleteWhackAMole(this.score);
      this.updateGameState(result.state);
      xpGrants = result.xpGrants || [];
      levelUps = result.levelUps || [];
    } catch (err) {
      // Still show results even if save fails
    }

    const xpPerCreature = xpGrants.length > 0 ? xpGrants[0].xp : 0;
    const levelUpHtml = levelUps.length > 0
      ? levelUps.map(lu => `<div class="wam-results-levelup">${lu.creatureName} Lv${lu.oldLevel} → ${lu.newLevel}!</div>`).join('')
      : '';

    this.actions.setContent(`
      <div class="wam-container">
        <div class="wam-results">
          <div class="wam-results-title">タイムアップ!</div>
          <div class="wam-results-score">★ ${this.score}</div>
          ${xpPerCreature > 0 ? `<div class="wam-results-xp">+${xpPerCreature} XP to party</div>` : ''}
          ${levelUpHtml}
          <button class="ui-btn ui-btn--primary wam-continue-btn">Continue</button>
        </div>
      </div>
    `);

    document.querySelector('.wam-continue-btn')?.addEventListener('click', () => {
      this.updateUI();
    });
  }
```

`new_string`:
```js
  async _endGame() {
    this.gameOver = true;
    clearTimeout(this.flipTimeout);
    clearInterval(this.timerInterval);

    let xpGrants = [];
    let levelUps = [];
    let finishDialogue = null;
    try {
      const result = await this.apiCompleteWhackAMole(this.score);
      if (result?.state) this.updateGameState(result.state);
      xpGrants = result?.xpGrants || [];
      levelUps = result?.levelUps || [];
      finishDialogue = result?.finishDialogue || null;
    } catch (err) {
      // Network failure — still tear down the overlay and attempt to proceed below.
    }

    // Tear down fullscreen .wam-container so the ExplorationScene is visible.
    this.actions.setContent('');

    // Narration 1: GM i+1 line (skip when no tokens — backend fallback path).
    if (finishDialogue?.tokens?.length) {
      const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
      const html = renderJpSentence(finishDialogue.tokens, getKnownWords(), wordDict, {}, false);
      await narrationBox.show(html, { html: true, speaker: 'Game Master' });
    }

    // Narration 2: system XP line + sprite popups over the player formation.
    const perCreatureXp = xpGrants[0]?.xp ?? 0;

    if (perCreatureXp > 0) {
      const activeParty = window.gameState?.run?.creatureParty?.active || [];
      for (const grant of xpGrants) {
        const index = activeParty.findIndex(c => c && c.id === grant.creatureId);
        if (index < 0) continue;
        const pos = spritePos('player', index);
        if (pos) pixiXpPopup(grant.xp, pos);
      }
      for (const lu of levelUps) {
        const index = activeParty.findIndex(c => c && c.id === lu.creatureId);
        if (index < 0) continue;
        const pos = spritePos('player', index);
        if (pos) setTimeout(() => pixiLevelUpPopup(lu.newLevel, pos), 400);
        setTimeout(() => animateLevelUpForScene(getSceneManager().currentScene, 'player', index), 400);
      }
    }

    const xpLine = perCreatureXp > 0
      ? `Your team gained ${perCreatureXp} XP!`
      : `Your team gained 0 XP. Better luck next time!`;
    await narrationBox.show(xpLine, { html: true });

    // Advance to the next room via the standard exploration path.
    try {
      const advanced = await this.apiProceed();
      if (advanced?.state) {
        this.updateGameState(advanced.state);
        await playRoomTransition(advanced.state);
      }
    } catch (err) {
      // Fall through to updateUI — the next-room state may already be applied server-side.
    }
    this.updateUI();
  }
```

- [ ] **Step 4: Syntax-check the file**

Run:
```bash
node --check public/js/ui/whack-a-mole.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/ui/whack-a-mole.js
/usr/bin/git commit -m "$(cat <<'EOF'
refactor(wam): rewrite _endGame to use narration box + Pixi popups

Tear down the fullscreen .wam-container overlay on game end, show the
GM i+1 finish line via narrationBox with speaker='Game Master', fire
combat-style XP/level-up popups over the player formation, then show a
system narration ("Your team gained N XP!" or zero-score fallback),
then advance via apiProceed + playRoomTransition. Zero new UI
functions; all primitives are direct imports of existing modules.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire new deps in `startWhackAMoleGame` + exploration module setup

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Extend the `startWhackAMoleGame` call-site to pass `apiProceed`**

Open `public/js/ui/exploration.js`. Find the existing function at line 1493.

`old_string`:
```js
function startWhackAMoleGame(pool) {
  new WhackAMoleGame(pool, {
    actions,
    apiCompleteWhackAMole,
    updateGameState,
    updateUI,
    playSFX
  }).start();
}
```

`new_string`:
```js
function startWhackAMoleGame(pool) {
  new WhackAMoleGame(pool, {
    actions,
    apiCompleteWhackAMole,
    apiProceed,
    updateGameState,
    updateUI,
    playSFX
  }).start();
}
```

(`apiProceed` is already a module-level variable set by the `setup(callbacks)` function at line 148 — no further wiring is needed.)

- [ ] **Step 2: Syntax-check**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/exploration.js
/usr/bin/git commit -m "$(cat <<'EOF'
refactor(wam): pass apiProceed dep into WhackAMoleGame

_endGame now calls apiProceed directly to advance to the next room.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Replace interacted-branch with auto-proceed

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Replace the interacted branch**

Find the existing branch at lines 955-963. Replace:

`old_string`:
```js
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
```

`new_string`:
```js
  // Already completed — auto-proceed (matches renderQuiz pattern).
  if (room?.interacted) {
    try {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        await playRoomTransition(result.state);
      }
    } catch (err) {
      // Fall through to updateUI — server state may already have advanced.
    }
    updateUI();
    return;
  }
```

- [ ] **Step 2: Syntax-check**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/exploration.js
/usr/bin/git commit -m "$(cat <<'EOF'
refactor(wam): auto-proceed on re-entry to completed room

Replaces the orphaned katakana results card with the same
apiProceed + playRoomTransition + updateUI path renderQuiz uses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete stale `.wam-results*` CSS

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Delete the unused CSS blocks**

Find lines 4247-4288 (the comment `/* Results screen */` through the closing brace of `.wam-results-credits`).

`old_string`:
```css
/* Results screen */
.wam-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1rem;
  text-align: center;
  flex: 1;
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

.wam-results-xp {
  font-size: 1.1rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-cyan, #00bcd4);
  margin-bottom: 4px;
}

.wam-results-levelup {
  font-size: 0.95rem;
  font-weight: var(--font-weight-bold);
  color: var(--accent-amber);
  margin-bottom: 2px;
}

.wam-results-credits {
  font-size: 1rem;
  color: var(--text-secondary);
}

```

`new_string`: (empty — three blank lines below preserves spacing to the next block)
```css

```

(Confirm the `.wam-error` block remains intact after the delete.)

- [ ] **Step 2: Grep-verify no references remain**

Run:
```bash
grep -rn "wam-results-title\|wam-results-score\|wam-results-xp\|wam-results-levelup\|wam-results-credits\|wam-continue-btn" public/ src/ data/ tests/ simulator/ 2>/dev/null
```

Expected: no output (or only the `.wam-results` class without suffix — confirm that's also gone; our `_endGame` rewrite removed the last HTML reference).

Double-check `.wam-results` on its own:
```bash
grep -rn "wam-results" public/ src/ tests/ 2>/dev/null
```

Expected: no output. If any reference remains, investigate before proceeding.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "$(cat <<'EOF'
chore(css): remove unused .wam-results* rules

The finish screen no longer renders the results card; all selectors in
this block are unreferenced after the _endGame refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual playtest via Playwright

**Files:** none

**Before starting:** ask the user to approve launching Playwright (per CLAUDE.md: "Don't launch Playwright without asking first"). Wait for explicit OK.

- [ ] **Step 1: Start dev server**

Run:
```bash
npm run dev
```

Start in the background. Wait 5s, then verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 2: Open browser and walk to a whack-a-mole room**

Follow `docs/playtest-guide.md`. Log in as the test user, start a run, and progress through rooms until a whack-a-mole room is triggered (Game Master sprite slides in).

Playwright MCP tool pattern (abbreviated):
- `browser_navigate` → `http://localhost:5173`
- `browser_snapshot` → identify login flow
- `browser_fill_form` + `browser_click` → log in
- `browser_click` → start run / progress
- Repeat until the Game Master appears and the "遊びますか？" (or similar) narration appears

If the whack-a-mole room doesn't appear in a reasonable number of rooms, use `browser_evaluate` + the dev testing hook (if any) to force a whack-a-mole room. If no hook exists, restart the run.

- [ ] **Step 3: Accept the GM's game invite (はい)**

Click the `はい` button. The fullscreen `.wam-container` minigame board should appear with the 3x3 tile grid.

- [ ] **Step 4: Play through to high score (verify win path)**

Tap correct tiles rapidly for a score of 3+ (so XP is nonzero and at least some creatures likely level up). When the 12s timer expires (or the game ends):

**Expected:**
- `.wam-container` overlay disappears — the ExplorationScene becomes visible with the GM sprite + player formation sprites.
- Narration box appears, speaker label "Game Master", content is tokenized Japanese (one of the 5 finish frames).
- Click outside the narration box to dismiss.
- Narration box immediately shows "Your team gained N XP!" (no speaker label).
- Pixi XP popup numbers float up from each player-formation sprite.
- If any creature leveled up, a level-up popup + burst animation plays.
- Click outside to dismiss the XP narration.
- Next room begins (exploration-scene transition fires).

Take a `browser_take_screenshot` at the moment of Narration 1 and again at Narration 2 to verify visually. Delete screenshots via `rm` after reviewing.

- [ ] **Step 5: Play through to zero score (verify 0 XP path)**

Trigger another whack-a-mole room. This time, tap no tiles (or tap only wrong tiles until time runs out). Final score = 0.

**Expected:**
- Overlay tears down as before.
- GM narration (same pool — i+1 selection may pick the same or a different frame, either is fine).
- Dismiss → Narration 2 text reads: `Your team gained 0 XP. Better luck next time!`. No sprite popups fire.
- Dismiss → next room.

- [ ] **Step 6: Verify re-entry auto-proceed (if achievable)**

If the game has floor navigation / state reload that can land the player back in an already-completed whack-a-mole room, verify the interacted branch auto-proceeds with no card/narration. If the UX has no natural way to re-enter a completed room, document that and skip this step.

- [ ] **Step 7: Stop the dev server, clean up**

Kill the background `npm run dev` process. Remove any leftover screenshots:
```bash
ls -la *.png 2>/dev/null && rm -f *.png
```

- [ ] **Step 8: Record playtest findings**

If any bug surfaced, STOP and loop back to the offending task. Do not proceed to merge. Fix the bug, re-commit, re-playtest, then continue.

If playtest is clean, no commit needed — this task produces no code changes.

---

## Task 9: Final verification, merge, cleanup

**Files:** none

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all Tier 1 + Tier 2 tests pass.

- [ ] **Step 2: Confirm no untracked artifacts in the worktree**

```bash
/usr/bin/git status --short
```

Expected: empty (or only gitignored files — no PNGs, logs, caches).

- [ ] **Step 3: Merge into dev**

```bash
PROJECT_ROOT_MAIN=$(/usr/bin/git worktree list --porcelain | awk '/^worktree/ {print $2; exit}')
cd "$PROJECT_ROOT_MAIN"
/usr/bin/git checkout dev
/usr/bin/git pull origin dev
/usr/bin/git merge --no-ff feature/wam-finish-redesign
/usr/bin/git push origin dev
```

Expected: merge succeeds cleanly, push succeeds.

- [ ] **Step 4: Remove the worktree + branch**

```bash
/usr/bin/git worktree remove ../koto-wt-wam-finish
/usr/bin/git branch -d feature/wam-finish-redesign
```

Expected: worktree directory deleted; branch deleted.

---

## Spec Coverage Check

| Spec requirement | Task |
|------------------|------|
| Tear down `.wam-container` overlay at end of game | Task 4, Step 3 |
| Narration 1: GM i+1 frame with `speaker: 'Game Master'` | Task 4, Step 3 |
| Narration 2: English system line, no speaker | Task 4, Step 3 |
| Zero-score variant: "Your team gained 0 XP. Better luck next time!" | Task 4, Step 3 |
| Sprite XP popups over player formation | Task 4, Step 3 |
| Level-up popups + burst at 400ms stagger | Task 4, Step 3 |
| Standard `apiProceed → playRoomTransition → updateUI` advance | Task 4, Step 3 |
| New `gameMaster_finish` category, 5 sub-N5 frames | Task 1 |
| `getGameMasterFinishFrames()` loader export | Task 2 |
| `/whack-a-mole-complete` returns `finishDialogue` | Task 3 |
| Interacted-branch auto-proceed | Task 6 |
| Delete stale `.wam-results*` CSS | Task 7 |
| SRS exposure (auto via render-is-exposure) | no task — happens via existing bootstrap-client |
| Dictionary-accuracy safety check before dictionary mutation | Task 1, Step 1 (verification gate) |
| Manual playtest coverage of all three paths | Task 8, Steps 4-6 |

All spec sections are mapped to at least one task.
