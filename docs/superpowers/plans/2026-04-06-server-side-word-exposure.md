# Server-Side Word Exposure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all word exposure from client-side to server-side so the FSRS SRS captures every word the player encounters, regardless of client.

**Architecture:** Extract the exposure logic from the `/known-words/expose` route into a reusable `exposeWords(userId, words)` function. Store `userId` on GameManager. Call `exposeWords` at each content-generation point: combat attacks, barks, encounter start, NPC dialogue, CID dialogue, NPC item offers. Remove all client-side exposure calls. Remove simulator's redundant expose calls.

**Tech Stack:** Node.js, Express, ts-fsrs, node:test

**Spec:** `docs/superpowers/specs/2026-04-06-server-side-word-exposure-design.md`

---

## Chunk 1: Core `exposeWords` function + GameManager userId

### Task 1: Extract `exposeWords()` into word-knowledge.js

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`
- Modify: `src/routes/game/known-words.js`
- Test: `tests/unit/word-knowledge.test.js`

The `POST /known-words/expose` route handler (known-words.js:26-55) contains inline exposure logic. Extract it into a function that can be called directly from the game engine.

- [ ] **Step 1: Write failing tests for `exposeWords`**

Add to `tests/unit/word-knowledge.test.js`:

```js
import { mock } from 'node:test';

// At the top of the file, also import exposeWords:
// import { ..., exposeWords } from '../../src/game/bootstrap/word-knowledge.js';

describe('exposeWords', () => {
  // exposeWords needs createCard from internal-srs.js
  // We need a temp dir to avoid polluting real data.
  // Use the same pattern as admin-routes.test.js:
  let tempDir;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'expose-test-'));
    // Override DATA_DIR so loadWordKnowledge/saveWordKnowledge use tempDir
    // We'll need to set process.env or use a dependency injection approach
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers exposure and increments count', () => {
    const wk = createWordKnowledge('test-expose');
    registerExposure(wk, '火');
    assert.equal(wk.seen['火'].exposures, 1);
    registerExposure(wk, '火');
    assert.equal(wk.seen['火'].exposures, 2);
  });

  it('exposeWords is exported and callable', async () => {
    // Just verify the function exists and has the right signature
    assert.equal(typeof exposeWords, 'function');
  });
});
```

Note: Full integration testing of `exposeWords` (verifying card creation at threshold) requires mocking the filesystem for `internal-srs.js`. This is best done as an integration test. The unit test verifies the function exists and exposure counting works.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "exposeWords"`
Expected: FAIL — `exposeWords` is not exported

- [ ] **Step 3: Implement `exposeWords` in word-knowledge.js**

In `src/game/bootstrap/word-knowledge.js`, add `createCard` to the existing `getDeckCards` import on line 4:

```js
import { getDeckCards, createCard } from '../internal-srs.js';
```

Then add below the imports:

```js
const EXPOSURE_THRESHOLD = 5;

/**
 * Expose words to the FSRS SRS system.
 * Registers exposure for each word. Creates a vocab SRS card after
 * EXPOSURE_THRESHOLD exposures (matching the route handler logic).
 *
 * @param {string} userId
 * @param {Array<{word: string, meaning?: string}>} words
 */
export function exposeWords(userId, words) {
  if (!Array.isArray(words) || words.length === 0) return;

  const wk = loadWordKnowledge(userId) || createWordKnowledge(userId);

  for (const entry of words) {
    const word = typeof entry === 'string' ? entry : entry?.word;
    const meaning = typeof entry === 'string' ? '' : (entry?.meaning || '');
    if (typeof word !== 'string' || word.length === 0) continue;

    registerExposure(wk, word);

    if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
      const existingCards = getDeckCards(userId, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        createCard(userId, 'vocab', word, {
          word, meaning, reading: word
        });
      }
    }
  }

  saveWordKnowledge(wk);
}
```

- [ ] **Step 4: Update the route handler to use `exposeWords`**

In `src/routes/game/known-words.js`, replace the inline logic in the `POST /expose` handler (lines 26-55) with a call to the new function. Remove the local `EXPOSURE_THRESHOLD` constant and the `createCard`/`getDeckCards` imports (they move to word-knowledge.js):

```js
// POST /api/game/known-words/expose
router.post('/expose', (req, res) => {
  try {
    exposeWords(req.user.id, req.body?.words || []);
    res.json({ ok: true });
  } catch (e) {
    console.warn('[known-words/expose] Error:', e.message);
    res.json({ ok: false });
  }
});
```

Update the imports at top of `known-words.js`:
- Add `exposeWords` to the import from `word-knowledge.js`
- Remove `createCard, getDeckCards` import from `internal-srs.js` (unless used elsewhere in file — check: `gradeCard`, `getDueCards`, `getDueCount` are still needed, but `createCard` and `getDeckCards` can be removed if only used in the expose handler)

Actually, `getDeckCards` is NOT used elsewhere in known-words.js, but `gradeCard`, `getDueCards`, `getDueCount` are. So remove only `createCard` and `getDeckCards` from that import.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass (unit + integration). The route behavior is unchanged — same logic, just refactored.

- [ ] **Step 6: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js src/routes/game/known-words.js tests/unit/word-knowledge.test.js
git commit -m "refactor: extract exposeWords() from known-words route into word-knowledge.js"
```

### Task 2: Store userId on GameManager

**Files:**
- Modify: `src/game/manager-registry.js`
- Modify: `src/game/loop.js` (GameManager class)

- [ ] **Step 1: Add userId property to GameManager constructor**

In `src/game/loop.js`, in the `GameManager` class constructor (find `constructor()` or the class definition), add:

```js
this.userId = null;
```

Add an `exposeWords` convenience method on GameManager:

```js
/**
 * Expose words to the SRS system for this user.
 * No-op if userId is not set (e.g. during tests).
 * @param {Array<{word: string, meaning?: string}>} words
 */
exposeWords(words) {
  if (!this.userId) return;
  exposeWords_fn(this.userId, words);
}
```

At the top of `loop.js`, add the import (use an alias to avoid name collision with the method):

```js
import { exposeWords as exposeWords_fn } from './bootstrap/word-knowledge.js';
```

- [ ] **Step 2: Set userId in manager-registry.js**

In `src/game/manager-registry.js`, in `getManager(userId)` after `const manager = new GameManager();` (line 22), add:

```js
manager.userId = userId;
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass. No behavior change yet — just wiring.

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js src/game/manager-registry.js
git commit -m "feat: store userId on GameManager, add exposeWords() method"
```

---

## Chunk 2: Server-side exposure at combat and encounter call sites

### Task 3: Expose words during combat attacks

**Files:**
- Modify: `src/game/loop.js` (`_handleCreatureAttackTurn` method)
- Test: manual verification via simulator run (combat words should appear in SRS without client)

The `_handleCreatureAttackTurn` method has multiple return paths (victory at line ~828, NPC KO at ~884, enemy-phase victory at ~941, defeat at ~979, and continue at ~1002). Each return includes `playerAttacks` and `enemyAttacks` (or subsets). We need to extract words from attacks and expose them ONCE before any return.

- [ ] **Step 1: Add word extraction helper at top of method**

In `_handleCreatureAttackTurn`, after `processInterleavedPvERound` resolves (after line ~726), add:

```js
// Expose combat words to SRS
const combatWordsToExpose = [];
const allRoundAttacks = [...(playerResult.attacks || []), ...(playerResult.enemyAttacks || [])];
for (const atk of allRoundAttacks) {
  if (atk.attackerBaseWord) {
    combatWordsToExpose.push({
      word: atk.attackerBaseWord,
      meaning: atk.attackerBaseMeaning || ''
    });
  }
  if ((atk.attackerSkillName || atk.moveName) && (atk.attackerSkillName || atk.moveName) !== atk.attackerBaseWord) {
    combatWordsToExpose.push({
      word: atk.attackerSkillName || atk.moveName,
      meaning: atk.attackerSkillEn || ''
    });
  }
}
if (combatWordsToExpose.length > 0) {
  this.exposeWords(combatWordsToExpose);
}
```

This goes right after `processInterleavedPvERound` and before any of the return paths, so it runs exactly once per combat round regardless of outcome.

- [ ] **Step 2: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: expose combat attack words server-side via FSRS"
```

### Task 4: Expose enemy creature names at encounter start

**Files:**
- Modify: `src/game/loop.js` (`startCreatureEncounter` method)

- [ ] **Step 1: Add exposure after enemy creatures are generated**

In `startCreatureEncounter` (line ~530), after the enemy creatures are assigned and before `this.emitState()` or the return, add exposure for each enemy's name. Find the end of the enemy generation block (after the `if/else if/else` for boss/npcBattle/normal around line ~578). Add:

```js
// Expose enemy creature names to SRS
const enemyNameWords = enemyCreatures
  .filter(e => e && e.name)
  .map(e => ({ word: e.name, meaning: e.nameEn || '' }));
if (enemyNameWords.length > 0) {
  this.exposeWords(enemyNameWords);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: expose enemy creature names at encounter start"
```

### Task 5: Expose combat barks server-side

**Files:**
- Modify: `src/game/loop.js` (`_handleCreatureAttackTurn` method)

The `selectBark` function already exists in `src/game/dialogue-filter.js:86-104`. The bark pool is loaded by `dialogue-loader.js` and accessible via `getBarkPool()`. We need to:
1. Determine combat event triggers from the round results
2. Pick barks using `selectBark`
3. Expose bark content words
4. Return barks in the combat cycle response

- [ ] **Step 1: Import bark dependencies at top of loop.js**

Add to the imports in `src/game/loop.js`:

```js
import { selectBark } from './dialogue-filter.js';
import { getBarkPool } from './dialogue-loader.js';
import { getKnownWordsFromFsrs } from './bootstrap/word-knowledge.js';
```

Check if `getKnownWordsFromFsrs` is already imported — if so, skip that import.

- [ ] **Step 2: Add bark picking logic in `_handleCreatureAttackTurn`**

After the combat word exposure block (from Task 3) and before the first return path, add:

```js
// Pick combat barks server-side
let barks = [];
const barkPool = getBarkPool();
if (barkPool && Object.keys(barkPool).length > 0 && this.userId) {
  const knownWords = new Set(getKnownWordsFromFsrs(this.userId));
  if (!this.combat.usedBarks) this.combat.usedBarks = new Set();

  // Determine triggers from this round
  const triggers = ['onAttack']; // Player always attacks in attack turn
  const allyTookDamage = (playerResult.enemyAttacks || []).some(a => a.damage > 0);
  if (allyTookDamage) triggers.push('onHit');
  const allyKOd = (playerResult.enemyAttacks || []).some(a => a.targetDefeated);
  if (allyKOd) triggers.push('onKO');
  if (playerResult.allEnemiesDefeated) triggers.push('onVictory');
  const allyLowHp = this.combat.allies.some(a => a && a.hp > 0 && a.hp / a.maxHp < 0.25);
  if (allyLowHp) triggers.push('onLowHP');

  const barkWordsToExpose = [];
  for (const trigger of triggers) {
    if (Math.random() >= 0.25) continue; // 25% chance per trigger
    const bark = selectBark(barkPool, trigger, knownWords, { usedThisCombat: this.combat.usedBarks });
    if (bark) {
      barks.push({ trigger, text: bark.text, _tokens: bark._tokens || [], _contentWords: bark._contentWords || [] });
      this.combat.usedBarks.add(bark.text);
      for (const w of (bark._contentWords || [])) {
        barkWordsToExpose.push({ word: w, meaning: '' });
      }
    }
  }
  if (barkWordsToExpose.length > 0) {
    this.exposeWords(barkWordsToExpose);
  }
}
```

- [ ] **Step 3: Add `barks` to all return objects in `_handleCreatureAttackTurn`**

There are 5 return paths in this method. Add `barks,` to each return object. Search for every `return {` inside `_handleCreatureAttackTurn` and add `barks,` after `actionType: 'attack',`. The return objects are approximately at lines:
- ~778 (befriend quiz triggered)
- ~828 (victory)
- ~884 (NPC KO'd all allies)
- ~941 (enemy-phase victory)
- ~979 (defeat)
- ~1002 (combat continues)

For each, add `barks,` as a field.

- [ ] **Step 4: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: pick and expose combat barks server-side"
```

---

## Chunk 3: Dialogue and NPC item exposure call sites

### Task 6: Expose NPC battle dialogue content words

**Files:**
- Modify: `src/routes/game/combat.js` (the `start-creature-encounter` route)

NPC dialogue lines are already selected at lines 88-90 of combat.js. Each selected line has `_contentWords`. We need to expose them.

- [ ] **Step 1: Add exposure after dialogue selection**

In `src/routes/game/combat.js`, inside the `start-creature-encounter` route handler, after the dialogue lines are selected (after line ~90 where `defeatLine` is assigned), add:

```js
// Expose NPC dialogue content words to SRS
const dialogueWords = [];
for (const line of [greeting, fightStart, defeatLine]) {
  if (line && line._contentWords) {
    for (const w of line._contentWords) {
      dialogueWords.push({ word: w, meaning: '' });
    }
  }
}
if (dialogueWords.length > 0) {
  gameManager.exposeWords(dialogueWords);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "feat: expose NPC battle dialogue words server-side"
```

### Task 7: Expose CID dialogue content words

**Files:**
- Modify: `src/routes/game/run.js` (the `start-run` route)

CID scripts are selected at lines 136-137 of run.js. The selected script has `.lines`, each with `_contentWords` (via `_tokens`).

- [ ] **Step 1: Add exposure after CID script selection**

In `src/routes/game/run.js`, inside the `start-run` handler, after the CID script is selected and `cidScript` is built (after line ~149 where `meta.seenCidScripts.push(selected.id)`), add:

```js
// Expose CID dialogue content words to SRS
const cidWords = [];
for (const line of selected.lines) {
  for (const w of (line._contentWords || [])) {
    cidWords.push({ word: w, meaning: '' });
  }
}
if (cidWords.length > 0) {
  req.gameManager.exposeWords(cidWords);
}
```

This goes inside the `if (selected)` block, after the seenCidScripts push.

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: expose CID dialogue words server-side"
```

### Task 8: Expose friendly NPC item words

**Files:**
- Modify: `src/routes/game/run.js` (the `friendly-npc-offers` route)

Item offers are generated at line ~648. Each item has a `word` field (the Japanese word) and `nameEn` (English meaning).

- [ ] **Step 1: Add exposure after offers are generated**

In `src/routes/game/run.js`, in the `friendly-npc-offers` handler, after `room.friendlyNpc.offered = rollFriendlyNpcOffers(...)` (line ~648) and after `req.saveGame()`, add:

```js
// Expose item words to SRS
const itemWords = room.friendlyNpc.offered
  .filter(item => item.word)
  .map(item => ({ word: item.word, meaning: item.nameEn || '' }));
if (itemWords.length > 0) {
  req.gameManager.exposeWords(itemWords);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: expose friendly NPC item words server-side"
```

---

## Chunk 4: Remove client-side exposure + simulator cleanup

### Task 9: Remove `addExposure`/`flushExposures` from frontend

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` — delete `_pendingExposures`, `addExposure`, `flushExposures`, and the `_pendingExposures.set()` calls inside render functions
- Modify: 14 frontend files — remove all `addExposure()` and `flushExposures()` calls and their imports

The 14 files that import these functions:
1. `public/js/ui/combat-loop.js`
2. `public/js/ui/speech-bubble.js`
3. `public/js/ui/scene.js`
4. `public/js/ui/move-select.js`
5. `public/js/ui/room-transition.js`
6. `public/game.js`
7. `public/js/ui/exploration.js`
8. `public/js/ui/economy.js`
9. `public/js/ui/narration-box.js`
10. `public/js/ui/dialogue-display.js`
11. `public/js/ui/creature-row.js`
12. `public/js/ui/post-combat-shop.js`
13. `public/js/ui/pvp-lobby.js`
14. `public/js/ui/move-learn.js`

- [ ] **Step 1: In `bootstrap-client.js`, remove exposure infrastructure**

Remove:
- Line 9: `const _pendingExposures = new Map();`
- Lines 53, 76, 130: the `_pendingExposures.set(...)` calls inside render functions (keep the render logic, just remove the exposure tracking)
- Lines 140-163: the `addExposure` and `flushExposures` functions entirely
- Remove `addExposure` and `flushExposures` from the file's exports

Keep: `setKnownWords`, `getKnownWords`, `addKnownWord`, `removeKnownWord`, `renderJpFirst`, `renderJpSentence`, `renderEnFirst`, `esc`.

- [ ] **Step 2: Remove `addExposure`/`flushExposures` imports and calls from all 14 files**

For each file:
1. Remove `addExposure` and/or `flushExposures` from the import statement
2. Remove all calls to `addExposure(...)` and `flushExposures()`
3. If the import becomes empty after removal, delete the entire import line

Use grep to verify completeness:
```bash
grep -rn "addExposure\|flushExposures" public/ --include="*.js"
```
Expected: zero matches after cleanup.

- [ ] **Step 3: Syntax check all modified files**

```bash
for f in public/js/ui/bootstrap-client.js public/js/ui/combat-loop.js public/js/ui/speech-bubble.js public/js/ui/scene.js public/js/ui/move-select.js public/js/ui/room-transition.js public/game.js public/js/ui/exploration.js public/js/ui/economy.js public/js/ui/narration-box.js public/js/ui/dialogue-display.js public/js/ui/creature-row.js public/js/ui/post-combat-shop.js public/js/ui/pvp-lobby.js public/js/ui/move-learn.js; do
  node --check "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```
Expected: all OK.

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "refactor: remove client-side word exposure (now server-side)"
```

### Task 10: Update speech-bubble.js to use server-provided barks

**Files:**
- Modify: `public/js/ui/speech-bubble.js`

Currently `speech-bubble.js` picks barks client-side from `window.gameState.barkPool`. After Task 5, the server returns barks in `cycle.barks`. The speech bubble should render those instead.

- [ ] **Step 1: Study the animation flow before starting**

The `combatEvents.emit` calls happen deep inside animation sequences in `combat-loop.js` (around lines 1496, 2192, 3351). The barks array comes from the combat cycle API response. The simplest approach: store the current round's barks on a module-level variable in `combat-loop.js` when the cycle response arrives, then let `speech-bubble.js` read from it when combat events fire.

In `combat-loop.js`, after the combat cycle fetch returns data, store `data.barks` on a module-level variable:
```js
let _currentRoundBarks = [];
// ... after cycle response:
_currentRoundBarks = data.barks || [];
```

Export a getter so speech-bubble.js can access it:
```js
export function getCurrentBarks() { return _currentRoundBarks; }
```

In each `combatEvents.emit` call site, pass the barks relevant to that trigger type through the event data, or let speech-bubble read from the getter.

- [ ] **Step 2: Update speech-bubble.js to render server barks**

Replace the client-side bark picking logic with rendering from the event data:

- Remove `getBarkPool()`, `_barkPool`, and the `pickBark()` function
- In the event handler, if `event.barks` has entries, render the first one as a speech bubble
- Keep the rendering logic (`showBubble`) and the timeout/animation code

The core change: instead of `pickBark(triggerType)` → render, it becomes: `event.barks?.find(b => b.trigger === triggerType)` → render.

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/speech-bubble.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/ui/speech-bubble.js
git commit -m "feat: speech bubbles render server-provided barks instead of picking locally"
```

### Task 11: Remove simulator's redundant expose calls

**Files:**
- Modify: `simulator/engine/combat.js`
- Modify: `simulator/engine/rooms/friendly-npc.js`

- [ ] **Step 1: In `simulator/engine/combat.js`, remove the expose POST**

Remove lines 218-221 (the `known-words/expose` POST call at end of combat):

```js
// REMOVE THIS BLOCK:
if (wordsExposed.length > 0) {
  await simCall('POST', '/api/game/known-words/expose', {
    words: wordsExposed
  }, `expose ${wordsExposed.length} combat words`);
}
```

Keep the `wordsExposed` array collection logic (it's used for logging and the return value), just remove the POST.

- [ ] **Step 2: In `simulator/engine/rooms/friendly-npc.js`, remove the expose POST**

Remove lines 47-52 (the `known-words/expose` POST for shop words):

```js
// REMOVE THIS BLOCK:
if (exposedWords.length > 0) {
  await simCall('POST', '/api/game/known-words/expose', {
    words: exposedWords
  }, `expose ${exposedWords.length} shop words`);
}
```

Keep the `exposedWords` collection and `logEvent` calls — those are for simulator analytics, not SRS tracking.

- [ ] **Step 3: Syntax check**

```bash
node --check simulator/engine/combat.js && node --check simulator/engine/rooms/friendly-npc.js && echo "OK"
```
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add simulator/engine/combat.js simulator/engine/rooms/friendly-npc.js
git commit -m "fix: remove simulator's redundant known-words/expose calls (now server-side)"
```

---

## Chunk 5: Verification

### Task 12: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All unit + integration tests pass.

- [ ] **Step 2: Grep for leftover client-side exposure calls**

```bash
grep -rn "addExposure\|flushExposures" public/ --include="*.js"
grep -rn "known-words/expose" simulator/ --include="*.js"
```
Expected: First grep returns zero matches. Second grep returns zero matches (only the removed lines).

- [ ] **Step 3: Verify server exposes words by checking call sites**

```bash
grep -rn "this\.exposeWords\|req\.gameManager\.exposeWords" src/ --include="*.js"
```
Expected: Matches in:
- `src/game/loop.js` (combat attacks, barks, encounter start)
- `src/routes/game/combat.js` (NPC dialogue)
- `src/routes/game/run.js` (CID dialogue, item offers)

- [ ] **Step 4: Remove dead bark-pool fetch and endpoint**

After client-side bark picking is removed, the `GET /api/game/known-words/bark-pool` fetch in `public/game.js` (lines 685-696) and the `window.gameState.barkPool` assignment are dead code. Remove them. The `bark-pool` route in `known-words.js` (lines 111-114) can stay for now (harmless, and the word dictionary endpoint near it is still used).

```bash
grep -rn "barkPool\|bark-pool\|bark_pool" public/ --include="*.js"
```
Remove any remaining dead references.

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -A
git status
# Only commit if there are changes
git commit -m "fix: final cleanup for server-side word exposure"
```
