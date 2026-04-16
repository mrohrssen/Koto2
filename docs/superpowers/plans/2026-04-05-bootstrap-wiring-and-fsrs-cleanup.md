# Bootstrap Dialogue Wiring & FSRS Cleanup

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the missing frontend CID dialogue display, fix NPC dialogue to use FSRS instead of stale word-knowledge files, and remove the split-brain FSRS/word-knowledge parallel writes.

**Architecture:** The bootstrap dialogue backend is complete (tokenizer, dictionary, filter, data). Three gaps remain: (1) frontend never renders the CID script returned by `/start-run`, (2) NPC dialogue gating in `combat.js` reads the old `word-knowledge-*.json` instead of FSRS, (3) the `/expose` and `/review` endpoints write to both FSRS and the old word-knowledge files. We fix all three and remove the old system.

**Tech Stack:** Express server, vanilla JS frontend, FSRS (ts-fsrs), narration-box UI component, renderJpSentence renderer

---

## Task 1: Display CID Script on Run Start (Frontend)

**Files:**
- Modify: `public/game.js:844-868` (startNewRun function)
- Modify: `public/js/ui/narration-box.js:29` (add renderJpSentence import)

The server already returns `cidScript` in the start-run response (`src/routes/game/run.js:163`). The frontend discards it. We need `startNewRun()` to show each CID line in the narration box using `renderJpSentence`.

The narration box already supports `html: true` mode. We render each CID line as HTML via `renderJpSentence()`, then show it sequentially. The player taps through each line (narration-box handles pagination/click-to-dismiss).

- [ ] **Step 1: Add renderJpSentence import to game.js**

`public/game.js` already imports `setKnownWords, addKnownWord, removeKnownWord, renderEnFirst, renderJpFirst, flushExposures` from `./js/ui/bootstrap-client.js` (line 113). Add `renderJpSentence, getKnownWords` to that import.

```js
// line 113 — add renderJpSentence, getKnownWords to existing import
import { setKnownWords, addKnownWord, removeKnownWord, renderEnFirst, renderJpFirst, flushExposures, renderJpSentence, getKnownWords } from './js/ui/bootstrap-client.js';
```

- [ ] **Step 2: Wire CID script display into startNewRun()**

Replace the current `startNewRun()` (lines 844-868) to consume `result.cidScript`:

```js
async function startNewRun() {
  diagnostics.logAction('start_run');

  const collectionResult = await apiGetCreatureCollection();
  const catalog = collectionResult?.catalog;
  const collection = collectionResult?.collection;

  if (catalog && catalog.length > 0) {
    const starterIds = await showCollectionSelect(catalog, collection);
    if (!starterIds || starterIds.length === 0) {
      removeCollectionOverlay();
      return;
    }

    const result = await apiStartRun({ starterIds });

    removeCollectionOverlay();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();

      // Show CID dialogue if server returned a script
      if (result.cidScript?.lines?.length) {
        const knownWords = getKnownWords();
        const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
        for (const line of result.cidScript.lines) {
          const html = renderJpSentence(
            line.tokens || [],
            knownWords,
            wordDict,
            line.overrides || {},
            result.useKanji || false
          );
          if (html) {
            await narrationBox.show(html, { speaker: 'CID', html: true });
          }
        }
        flushExposures();
      }
    }
  }
}
```

- [ ] **Step 3: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat: display CID bootstrap dialogue on run start"
```

---

## Task 2: Fix NPC Dialogue Gating to Use FSRS

**Files:**
- Modify: `src/routes/game/combat.js:15,79-80` (replace word-knowledge import with FSRS)
- Modify: `src/routes/game/run.js:21,134` (same fix for CID script selection)

Both `combat.js` and `run.js` import `loadWordKnowledge` / `createWordKnowledge` and build `knownWords` from the old `wk.known` map. This reads stale data. Switch to `getKnownWordsFromFsrs()` which queries FSRS cards with `state === State.Review`.

- [ ] **Step 1: Fix combat.js NPC dialogue gating**

In `src/routes/game/combat.js`:

Replace line 15:
```js
// OLD:
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';
// NEW:
import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
```

Replace lines 79-80:
```js
// OLD:
const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
const knownWords = new Set(Object.keys(wk.known));
// NEW:
const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));
```

- [ ] **Step 2: Fix run.js CID script selection**

In `src/routes/game/run.js`:

Replace line 21:
```js
// OLD:
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';
// NEW:
import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
```

Replace line 134:
```js
// OLD:
const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
const knownWords = new Set(Object.keys(wk.known));
// NEW:
const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/routes/game/combat.js && node --check src/routes/game/run.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass (dialogue-filter and dialogue-bootstrap tests don't hit these routes directly)

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/combat.js src/routes/game/run.js
git commit -m "fix: use FSRS for NPC and CID dialogue word gating instead of stale word-knowledge files"
```

---

## Task 3: Remove Parallel `known` Map Writes (Keep Exposure Counting)

**Files:**
- Modify: `src/routes/game/known-words.js:3,57-84` (remove `markKnown`/`unmarkKnown` from review)

The 5-exposure gate is a hard requirement (design spec section 4.2): a word must be seen 5 times in dialogue/barks before it earns an FSRS card. The `/expose` endpoint's exposure counting and FSRS card creation at threshold are correct and stay as-is.

What's dead weight is the `/review` endpoint writing to BOTH FSRS AND the old `known`/`seen` maps in `word-knowledge-*.json`. The `known` map is never read (GET queries FSRS), so those writes are wasted I/O creating split-brain state.

- [ ] **Step 1: Trim unused imports**

In `src/routes/game/known-words.js`, line 3, remove `markKnown` and `unmarkKnown` (no longer used after step 2):

```js
// OLD:
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge, markKnown, unmarkKnown, getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
// NEW:
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge, getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
```

- [ ] **Step 2: Simplify /review to FSRS only**

Replace the `/review` handler (lines 57-84). Remove the parallel `markKnown`/`unmarkKnown`/`saveWordKnowledge` calls, keep only FSRS:

```js
  // POST /api/game/known-words/review
  router.post('/review', (req, res) => {
    const { word, grade } = req.body || {};
    if (!word || !['good', 'again'].includes(grade)) {
      return res.status(400).json({ error: 'word and grade (good|again) required' });
    }
    try {
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
      res.json({
        ok: true,
        mastered: grade === 'good',
        card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses }
      });
    } catch (e) {
      console.warn('[known-words/review] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
```

The `/expose` endpoint is unchanged. It keeps:
- `registerExposure()` for the 5-exposure counter
- `createCard()` at `EXPOSURE_THRESHOLD` (5) to gate FSRS card creation
- `saveWordKnowledge()` to persist the exposure count

- [ ] **Step 3: Verify syntax**

Run: `node --check src/routes/game/known-words.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/known-words.js
git commit -m "refactor: remove parallel known-map writes from /review, FSRS is source of truth for mastery"
```

---

## Task 4: Fix Registration to Seed FSRS Instead of Word-Knowledge

**Files:**
- Modify: `src/auth/routes.js:11,80-88` (seed FSRS vocab deck on registration)

When a new user registers with an uploaded word list, the current code creates a `word-knowledge-*.json` file and seeds it. Since FSRS is now the source of truth, we should seed the FSRS vocab deck instead.

- [ ] **Step 1: Update imports in auth/routes.js**

Replace line 11:
```js
// OLD:
import { createWordKnowledge, seedKnownWords, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';
// NEW (no word-knowledge import needed):
```

Add FSRS import:
```js
import { createCard, getDeckCards, gradeCard } from '../game/internal-srs.js';
```

- [ ] **Step 2: Replace word-knowledge seeding with FSRS seeding**

Replace lines 80-88:
```js
// OLD:
const wk = createWordKnowledge(user.id);
if (req.file) {
  const words = parseWordList(req.file.buffer.toString('utf-8'));
  if (words.length > 0) {
    seedKnownWords(wk, words);
  }
}
saveWordKnowledge(wk);

// NEW:
if (req.file) {
  const words = parseWordList(req.file.buffer.toString('utf-8'));
  for (const word of words) {
    createCard(user.id, 'vocab', word, { word, meaning: '', reading: word });
    gradeCard(user.id, 'vocab', word, 'good');
  }
}
```

The `gradeCard(... 'good')` call moves each card to `State.Review`, which is how FSRS marks a word as "known". This matches what the migration script does (`scripts/migrate-word-knowledge-to-fsrs.js:48`).

- [ ] **Step 3: Verify syntax**

Run: `node --check src/auth/routes.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/auth/routes.js
git commit -m "refactor: seed FSRS vocab deck on registration instead of word-knowledge files"
```

---

## Task 5: Wire Bootstrap NPC Greeting into Battle Intro

**Files:**
- Modify: `public/game.js:1139-1150` (pass npcDialogue to playNpcBattleIntro)
- Modify: `public/js/ui/room-transition.js:46-72` (render bootstrap greeting via renderJpSentence)

Currently `playNpcBattleIntro` shows `npcData.greeting` (the old AI-generated greeting) via `renderEnFirst`. The server now returns `result.npcDialogue` with word-gated tokenized lines. We should prefer the bootstrap greeting when available, falling back to the old greeting.

- [ ] **Step 1: Pass npcDialogue through to playNpcBattleIntro**

In `public/game.js`, modify the `startEncounter()` call at line 1142:

```js
// OLD:
await playNpcBattleIntro(
  result.npc,
  (name, id, npc, opts) => scene.showNpcTrainer(name, id, npc, opts),
  () => scene.hideNpcTrainer()
);

// NEW:
await playNpcBattleIntro(
  result.npc,
  (name, id, npc, opts) => scene.showNpcTrainer(name, id, npc, opts),
  () => scene.hideNpcTrainer(),
  result.npcDialogue
);
```

- [ ] **Step 2: Update playNpcBattleIntro to render bootstrap greeting**

In `public/js/ui/room-transition.js`, add imports and modify the function:

Add to imports (line 6):
```js
import { renderEnFirst, flushExposures, renderJpSentence, getKnownWords } from './bootstrap-client.js';
```
(Replace the existing partial import on line 6.)

Update `playNpcBattleIntro` signature and greeting logic (lines 46-72):

```js
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn, npcDialogue) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  showNpcSpriteFn(npcName, npcData.id, npcData, { skipPixi: true });
  const spritePath = npcData.id
    ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  await showNpcSprite(spritePath, { slideIn: true });

  // Prefer bootstrap word-gated greeting over legacy AI greeting
  const bootstrapGreeting = npcDialogue?.greeting;
  if (bootstrapGreeting?.tokens?.length) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    const knownWords = getKnownWords();
    const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
    const html = renderJpSentence(
      bootstrapGreeting.tokens,
      knownWords,
      wordDict,
      bootstrapGreeting.overrides || {},
      npcDialogue.useKanji || false
    );
    await narrationBox.show(html, { speaker: npcName, html: true });
    flushExposures();
  } else if (npcData.greeting) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
    flushExposures();
  }

  await hideNpcSprite({ slideOut: true });
  hideNpcSpriteFn();
}
```

- [ ] **Step 3: Store npcDialogue for combat-loop access**

The `defeatLine` is needed after combat victory. Store it on the game state so `combat-loop.js` can access it:

In `public/game.js`, after `updateGameState(result.state)` (line 1135), add:

```js
// Store bootstrap NPC dialogue for use after combat
if (result.npcDialogue) {
  window.gameState._npcDialogue = result.npcDialogue;
}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/game.js && node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/js/ui/room-transition.js
git commit -m "feat: wire bootstrap NPC greeting into battle intro with fallback to legacy"
```

---

## Task 6: Integration Test — Full Pipeline

**Files:**
- Modify: `tests/integration/dialogue-bootstrap.test.js`

Add a test that verifies the FSRS-based word gating works end-to-end for CID script selection.

- [ ] **Step 1: Add FSRS integration test**

Append to `tests/integration/dialogue-bootstrap.test.js`:

```js
test('CID script selection uses FSRS known words', async () => {
  const { getKnownWordsFromFsrs } = await import('../../src/game/bootstrap/word-knowledge.js');
  const { filterEligibleScripts, selectCidScript } = await import('../../src/game/dialogue-filter.js');
  const { getCidScripts } = await import('../../src/game/dialogue-loader.js');

  // With no FSRS data, getKnownWordsFromFsrs returns empty array
  const known = getKnownWordsFromFsrs('test-user-nonexistent');
  assert.ok(Array.isArray(known), 'returns array');

  const knownSet = new Set(known);
  const scripts = getCidScripts();
  const eligible = filterEligibleScripts(scripts, knownSet);

  // At 0 known words, at least the simplest script should be eligible
  // (single-word sentences like こんにちは！ pass i+1 with 1 unknown)
  assert.ok(eligible.length > 0, 'at least one script eligible at 0 known words');

  const selected = selectCidScript(eligible, knownSet, []);
  assert.ok(selected, 'a script is selected');
  assert.ok(selected.lines.length > 0, 'selected script has lines');
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:integration`
Expected: All tests pass including the new one

- [ ] **Step 3: Commit**

```bash
git add tests/integration/dialogue-bootstrap.test.js
git commit -m "test: verify CID script selection with FSRS word gating"
```

---

## Task 7: Clean Up Dead Word-Knowledge Imports

**Files:**
- Audit: `src/routes/vocab.js` for any remaining word-knowledge references

- [ ] **Step 1: Check for remaining word-knowledge references**

Run: `grep -rn "loadWordKnowledge\|createWordKnowledge\|saveWordKnowledge\|registerExposure\|markKnown\|unmarkKnown\|seedKnownWords" src/ --include="*.js"`

After Tasks 2-4, the only remaining references should be in:
- `src/game/bootstrap/word-knowledge.js` (the module itself, kept for `getKnownWordsFromFsrs`)
- `scripts/migrate-word-knowledge-to-fsrs.js` (migration utility, fine to keep)

If any route files still import the old functions, update them.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: remove dead word-knowledge imports"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `public/game.js` | Consume `cidScript` from start-run, pass `npcDialogue` to battle intro, store for combat-loop |
| `public/js/ui/room-transition.js` | Render bootstrap greeting via `renderJpSentence` with fallback |
| `src/routes/game/combat.js` | Use `getKnownWordsFromFsrs()` for NPC dialogue gating |
| `src/routes/game/run.js` | Use `getKnownWordsFromFsrs()` for CID script selection |
| `src/routes/game/known-words.js` | Remove parallel `known` map writes from `/review` (expose keeps 5-exposure gate) |
| `src/auth/routes.js` | Seed FSRS vocab deck on registration instead of word-knowledge |
| `tests/integration/dialogue-bootstrap.test.js` | Add FSRS integration test |
