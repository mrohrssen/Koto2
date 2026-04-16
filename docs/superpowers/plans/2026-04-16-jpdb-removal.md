# JPDB Runtime Removal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove JPDB as a runtime SRS backend. FSRS (`internal-srs.js`) is already the source of truth — JPDB is a parallel system that duplicates it. Remove ~3,500 lines of JPDB code, rewire vocab-manager to FSRS, rewire vocab-repair to Sudachi.

**Architecture:** Contract-first for live UX, then delete-first for dead runtime code. First migrate the still-live JPDB-backed contracts (discovery review, speed-review room commits, lookup parsing/definitions) onto FSRS + local dictionary/Sudachi paths. Once those user-visible flows are stable, delete JPDB files/imports and rewire the two core modules that still depend on them (`vocab-manager` → FSRS, `vocab-repair` → Sudachi).

**Tech Stack:** Node.js, ES6 modules, FSRS via `ts-fsrs` package, Sudachi tokenizer via `src/tokenizer.js`

**Spec:** `docs/superpowers/specs/2026-04-16-jpdb-removal-design.md`

---

## Chunk 0: Replace Live JPDB Contracts Before Deletion

### Task 0A: Migrate Word Discovery Off `/api/jpdb/review`

Discovery is not dead JPDB plumbing. The current discovery room still renders with `actions.showFlashCards()` and still persists progress by posting `vid`/`sid` to `/api/jpdb/review` with `isDiscovery: true`. That contract must be replaced before JPDB route deletion.

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/api.js`
- Modify: `src/routes/game/known-words.js`
- Modify: `src/routes/game/run.js`
- Verify: `src/word-tracking.js`

- [ ] **Step 1: Rewire discovery review to internal word strings**

Replace the discovery review callback in `public/game.js` so discovery cards submit `{ word, grade: 'again'|'good', isDiscovery: true }` to an FSRS-backed route instead of calling `apiSendJpdbReview(vid, sid, grade, ...)`.

Do **not** remove `actions.showFlashCards()` here. Discovery still uses it for a single-card renderer.

- [ ] **Step 2: Extend the internal known-words review endpoint**

Update `src/routes/game/known-words.js` so `POST /api/game/known-words/review` can accept an optional `isDiscovery` flag and:
- auto-create the FSRS card if needed (already supported)
- apply the grade via `gradeCard()`
- increment discovery counts using the existing `src/word-tracking.js` helpers
- record leaderboard review counts if discovery/room review should still count
- return `{ ok, mastered, card, todayCount, atLimit }` when `isDiscovery` is set

This preserves the current discovery-room behavior without JPDB.

- [ ] **Step 3: Change discovery word payloads to string-based cards only**

Update `getNewWordsForDiscovery()` callers so discovery words are treated as:

```javascript
{ word, reading, meanings }
```

Remove frontend assumptions that discovery words carry `vid` / `sid`.

- [ ] **Step 4: Verify the discovery room no longer depends on JPDB IDs**

```bash
rg -n "isDiscovery|apiSwipeWord|\\.vid\\b|\\.sid\\b" public/js/ui/exploration.js public/game.js src/routes/game/known-words.js src/routes/game/run.js
```

Expected: discovery flow uses `word` strings and internal review endpoints only.

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/js/ui/exploration.js public/js/api.js src/routes/game/known-words.js src/routes/game/run.js
git commit -m "refactor: migrate word discovery review from JPDB ids to internal FSRS words"
```

---

### Task 0B: Migrate Speed Review Contracts to Word Strings

The current plan assumes speed review is already string-based, but the live room/hub contract is mixed. `speed-review.js`, `public/game.js`, `public/js/api.js`, `src/routes/game/run.js`, and `src/game/services/exploration-service.js` still use `vid`/`sid` for commits and queue identity in multiple places.

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/speed-review.js`
- Modify: `src/routes/game/run.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/services/exploration-service.js`

- [ ] **Step 1: Change room progress API to accept `word` instead of `vid`/`sid`**

Update the client and server contract:

```javascript
// old
progressSpeedReviewRoom(roomId, vid, sid, commitIndex)

// new
progressSpeedReviewRoom(roomId, word, commitIndex)
```

The request body for `/api/game/speed-review-room/progress` should become:

```json
{ "roomId": "...", "word": "洞窟", "commitIndex": 0 }
```

- [ ] **Step 2: Rebuild room snapshot keys from strings**

In `src/game/services/exploration-service.js`:
- source room cards from FSRS/internal due-word data
- store snapshot identity as `word`
- replace `buildSpeedReviewWordKey(word.vid, word.sid)` style identity with a string-based key
- compare committed room progress against the snapshot using the `word` string

Do **not** leave a hybrid `vid`/`sid` + string path behind unless a test proves it is still needed.

- [ ] **Step 3: Simplify hub speed review to internal cards only**

In `public/js/ui/speed-review.js`, remove the JPDB branch in `flushPendingReview()` / `triggerBatchRefresh()` after the room/hub contract is migrated. The steady state should be internal FSRS cards with:

```javascript
{ word, reading, meanings, source: 'internal' }
```

Queue refresh should use `getVocabDueWords()` and de-dupe by `word`, not by `vid`.

- [ ] **Step 4: Verify room + hub flows are fully string-based**

```bash
rg -n "speed-review-room|commitRoomReview|progressSpeedReviewRoom|\\.vid\\b|\\.sid\\b" public/game.js public/js/ui/speed-review.js public/js/api.js src/routes/game/run.js src/game/services/exploration-service.js
```

Expected: no runtime speed-review path depends on `vid`/`sid`.

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/game.js public/js/ui/speed-review.js src/routes/game/run.js src/game/loop.js src/game/services/exploration-service.js
git commit -m "refactor: migrate speed review contracts from JPDB ids to word strings"
```

---

### Task 0C: Replace Lookup Mode with Sudachi + Local Dictionary

Lookup mode is still live and fully JPDB-backed today. Do not delete `/api/jpdb/parse`, `/api/jpdb/lookup`, `parseJpdbText()`, `lookupJpdbWord()`, `lookupJpdbBatch()`, or the `lookup.js` `vid`/`sid` path until a replacement contract exists.

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/lookup.js`
- Modify: `src/routes/game/known-words.js` or create a small dedicated game lookup route if cleaner
- Reuse: `src/tokenizer.js`
- Reuse: `src/game/word-dictionary.js`

- [ ] **Step 1: Define the replacement lookup contract explicitly**

The replacement should be:
- parse text on the server with Sudachi
- enrich tokens from `word-dictionary.js`
- send tokens to the client keyed by word string, not JPDB ids

Target token shape:

```javascript
{
  surface: '洞窟',
  word: '洞窟',
  reading: 'どうくつ',
  meaning: 'cave',
  lookupable: true
}
```

- [ ] **Step 2: Add local parse + batch lookup endpoints**

Implement a local route that replaces the JPDB parse/lookup pair. Minimal acceptable surface:
- `POST /api/game/known-words/parse-text`
- optional `POST /api/game/known-words/lookup-batch`

The route should use `tokenize()` + `loadWordDictionary()` and return enough data for `lookup.js` to render clickable spans without `vid` / `sid`.

- [ ] **Step 3: Rewrite `lookup.js` around `data-word` instead of `data-vid` / `data-sid`**

Replace:
- `"vid:sid"` cache keys
- `data-vid` / `data-sid` DOM attributes
- JPDB-key gating copy

With:
- string word cache keys
- `data-word`
- local lookup availability messaging

- [ ] **Step 4: Only after the replacement works, delete the old JPDB lookup calls**

Once the local route is wired and verified, remove:
- `parseJpdbText()`
- `lookupJpdbWord()`
- `lookupJpdbBatch()`
- `/api/jpdb/parse`
- `/api/jpdb/lookup`
- `/api/jpdb/lookup-batch`

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/js/api.js public/js/ui/lookup.js src/routes/game/known-words.js
git commit -m "refactor: replace JPDB lookup with Sudachi and local dictionary lookup"
```

---

## Chunk 1: Delete JPDB Core + Fix Server Boot

### Task 1: Delete JPDB Core Files

**Files:**
- Delete: `src/jpdb.js`
- Delete: `data/jpdb-wordlist.json`
- Delete: `data/jpdb-tokenization-cache.json`
- Delete: `data/jpdb-frame-compare-cache.json`

- [ ] **Step 1: Delete the four files**

```bash
rm src/jpdb.js
rm data/jpdb-wordlist.json
rm data/jpdb-tokenization-cache.json
rm data/jpdb-frame-compare-cache.json
```

- [ ] **Step 2: Delete stale per-user JPDB caches**

```bash
rm -f data/vocab-cache-*.json
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete jpdb.js and JPDB cache/data files"
```

---

### Task 2: Remove JPDB from server.js

The server imports 15 functions from `jpdb.js` and calls `configureJpdb()`/`initializeJpdb()` at startup. It also loads `jpdb-wordlist.json`. The server will crash without these changes.

**Files:**
- Modify: `server.js` (lines 12–27 imports, lines 94–99 init, line ~106 wordlist, line ~130 jpdbDeckId)

- [ ] **Step 1: Read server.js to find exact JPDB references**

```bash
grep -n 'jpdb\|JPDB\|ALLOWED_WORDS\|jpdbDeckId\|configureJpdb\|initializeJpdb\|VOCAB_CACHE' server.js
```

- [ ] **Step 2: Remove JPDB import block** (lines 12–27)

Remove the entire import block:
```javascript
import {
  configure as configureJpdb,
  initialize as initializeJpdb,
  // ... all 15 imports
} from './src/jpdb.js';
```

- [ ] **Step 3: Remove JPDB initialization** (lines 94–99)

Remove:
```javascript
configureJpdb({
  vocabCacheFile: VOCAB_CACHE_FILE,
  vocabCacheDir: VOCAB_CACHE_DIR
});
initializeJpdb();
```

Also remove the `VOCAB_CACHE_FILE` / `VOCAB_CACHE_DIR` constants if only used by JPDB.

- [ ] **Step 4: Remove jpdb-wordlist.json loading** (line ~106)

Remove the line that loads the static word list from `data/jpdb-wordlist.json`.

- [ ] **Step 5: Remove jpdbDeckId default** from settings defaults (line ~130)

Remove `jpdbDeckId: 'all'` from the default settings object.

- [ ] **Step 6: Remove ALLOWED_WORDS duplicate** from server.js

The audit found a second copy of the particle/grammar exclusion list. Remove it. If server.js still needs it, it can import from `vocab-repair.js` where the canonical copy lives.

- [ ] **Step 7: Keep admin-word-exposures route registration**

Do **not** remove the import of `createWordExposureRoutes` from `src/routes/admin-word-exposures.js` or its `app.use()` call. Task 13 only removes the JPDB comparison endpoints inside that route file; `/api/admin/word-exposures` and `/api/admin/frames` stay live.

- [ ] **Step 8: Verify server.js has no remaining jpdb references**

```bash
grep -n 'jpdb\|JPDB' server.js
```

Expected: No matches (or only comments that should also be removed).

- [ ] **Step 9: Commit**

```bash
git add server.js
git commit -m "chore: remove all JPDB imports and initialization from server.js"
```

---

### Task 3: Stub vocab-manager.js to Prevent Import Crashes

`vocab-manager.js` imports from `jpdb.js` (now deleted). Before we properly rewire it in Chunk 3, temporarily stub the JPDB import so the server can boot and we can incrementally delete other files.

**Files:**
- Modify: `src/game/vocab-manager.js` (line 2)

- [ ] **Step 1: Remove JPDB import, add TODO**

Replace line 2:
```javascript
import { lookupWordStates, parseWordBatches } from '../jpdb.js';
```
With:
```javascript
// TODO(jpdb-removal): Rewire to FSRS — see Task in Chunk 3
const lookupWordStates = async () => ({});
const parseWordBatches = async () => ({});
```

- [ ] **Step 2: Delete `invalidateWordByVid` function** (lines 508–529)

This function's only caller was `jpdb.js` (deleted). Remove it entirely.

- [ ] **Step 3: Verify vocab-manager has no remaining jpdb imports**

```bash
grep -n 'jpdb' src/game/vocab-manager.js
```

Expected: Only the TODO comment.

- [ ] **Step 4: Commit**

```bash
git add src/game/vocab-manager.js
git commit -m "chore: stub jpdb imports in vocab-manager (temporary, rewired in chunk 3)"
```

---

### Task 4: Stub vocab-repair.js to Prevent Import Crashes

`vocab-repair.js` imports `parseText` from `jpdb.js`. Temporarily stub it.

**Files:**
- Modify: `src/game/vocab-repair.js` (line 1)

- [ ] **Step 1: Remove JPDB import, add TODO**

Replace line 1:
```javascript
import { parseText } from '../jpdb.js';
```
With:
```javascript
// TODO(jpdb-removal): Rewire to Sudachi tokenizer — see Task in Chunk 3
const parseText = async () => [];
```

- [ ] **Step 2: Verify no remaining jpdb imports**

```bash
grep -n 'jpdb' src/game/vocab-repair.js
```

Expected: Only the TODO comment.

- [ ] **Step 3: Commit**

```bash
git add src/game/vocab-repair.js
git commit -m "chore: stub jpdb parseText in vocab-repair (temporary, rewired in chunk 3)"
```

---

### Task 5: Verify Server Boots

- [ ] **Step 1: Run syntax check on modified files**

```bash
node --check server.js && echo "OK"
node --check src/game/vocab-manager.js && echo "OK"
node --check src/game/vocab-repair.js && echo "OK"
```

- [ ] **Step 2: Start server and verify it boots**

```bash
timeout 10 node server.js 2>&1 | head -20
```

Expected: Server starts without import errors. There may be runtime errors from missing routes (fixed in next tasks) but no crash on startup.

- [ ] **Step 3: Run existing tests to see what breaks**

```bash
npm test 2>&1 | tail -30
```

Record which tests fail — these will be fixed in later tasks.

---

## Chunk 2: Delete JPDB Routes, Frontend, Flash Card Combat

### Task 6: Delete JPDB API Routes

**Files:**
- Modify: `src/routes/vocab.js` — remove all `/api/jpdb/*` routes and JPDB imports
- Modify: `src/routes/index.js` — remove JPDB route comment

- [ ] **Step 1: Rewrite vocab.js to remove or shim JPDB routes after Chunk 0 lands**

Remove the imports from `jpdb.js` (lines 2–8). Remove these route handlers:
- `POST /jpdb/parse` (lines 48–62)
- `POST /jpdb/review` (lines 65–113)
- `POST /jpdb/lookup` (lines 116–143)
- `POST /jpdb/lookup-batch` (lines 146–164)
- `POST /vocab/due-words` (lines 28–45) — this calls JPDB's getDueWordsWithMeanings

Critical sequencing:
- do **not** remove `/jpdb/review` until Task 0A is complete
- do **not** remove `/jpdb/parse`, `/jpdb/lookup`, or `/jpdb/lookup-batch` until Task 0C is complete
- if needed, keep temporary shims that forward old callers to the new local/FSRS contracts during the migration window

Keep the Router creation and export. If the file is now empty of routes, just export an empty router.

- [ ] **Step 2: Remove JPDB comment from routes/index.js**

```bash
grep -n 'jpdb\|JPDB' src/routes/index.js
```

Remove the `// Vocab/JPDB routes` comment.

- [ ] **Step 3: Commit**

```bash
git add src/routes/vocab.js src/routes/index.js
git commit -m "chore: remove all /api/jpdb/* routes"
```

---

### Task 7: Remove JPDB from Game Routes

**Files:**
- Modify: `src/routes/game/misc.js` (JPDB imports, due-words endpoint, post-combat-refresh endpoint)
- Modify: `src/routes/game/run.js` (JPDB imports, vid/sid validation, discovery enrichment)
- Modify: `src/routes/game/combat.js` (vidSet passing)
- Modify: `src/routes/game/route-helpers.js` (vidSet, jpdbApiKey, checkViolationsFn gating)

- [ ] **Step 1: Clean misc.js**

Remove JPDB imports (lines 5–9: `getDueWordsWithMeanings`, `fetchDueWordsDirectly`, `parseWordBatch`).
Remove `POST /api/game/due-words` endpoint (lines 379–407).
Remove `POST /api/game/post-combat-refresh` endpoint (lines 349–376).
Remove session-start endpoint's `performFullParse` call (lines ~310–340) — this called JPDB to batch-parse the static word list on login. With FSRS, word states are always local. Remove the `performFullParse` import from vocab-manager and the `staticWordList` parameter if it's only used here. Check the DI chain in `server.js` for `staticWordList` and remove it if orphaned.
Also remove `updateWordStates` import from vocab-manager if it was only used by post-combat-refresh.

- [ ] **Step 2: Clean run.js**

Remove JPDB imports (lines 5–8).
Remove `lookupVocabularyBatch` import (if present).
Remove vid/sid validation in speed-review-room/progress endpoint (lines 556–569) — replace with word-string validation. The endpoint should accept a `word` string instead of `vid`/`sid`. Update the `recordSpeedReviewRoomCommit` call to pass `word` instead of `{ vid, sid }`.
Remove discovery-words JPDB enrichment code.
Also remove `vidSet` from the `{ words, vidSet, checkViolationsFn }` objects passed to dialogue queue functions (lines 88–108).

- [ ] **Step 3: Clean combat.js**

Remove `vidSet: vocabConfig.vidSet` passing (line 575). Change to just pass `words` and `checkViolationsFn` without vidSet.

- [ ] **Step 4: Rewrite route-helpers.js**

This is the key cascading change. Current code gates `checkViolationsFn` on `jpdbApiKey`:

```javascript
const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
  ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
  : null;
```

Replace both functions (`buildVocabConfig` and `buildBefriendDialogueVocabConfig`) to:
1. Remove `vidSet` from destructuring of `getUserVocabulary()`
2. Remove `vidSet` from return objects
3. Always create `checkViolationsFn` (Sudachi is local, no API key needed):

```javascript
const checkViolationsFn = checkSentenceViolations
  ? async (text) => checkSentenceViolations(text, vocabSet, new Set())
  : null;
```

This matches the new signature: `checkSentenceViolations(sentence, vocabSet, gameTerms)` (jpdbApiKey and vidSet removed).

4. Remove `jpdbApiKey` and `process.env.JPDB_API_KEY` references entirely.

- [ ] **Step 5: Verify no jpdb references remain in game routes**

```bash
grep -rn 'jpdb\|JPDB\|vidSet\|vid.*sid' src/routes/game/
```

Expected: No matches except possibly comments to clean up.

- [ ] **Step 6: Commit**

```bash
git add src/routes/game/
git commit -m "chore: remove JPDB from all game routes, drop vidSet"
```

---

### Task 8: Remove JPDB from Settings and Auth

**Files:**
- Modify: `src/routes/settings.js` (jpdbDeckId, clearVocabCache)
- Modify: `src/auth/routes.js` (hasJpdbKey, jpdbApiKey in updateKeys)
- Modify: `src/auth/users.js` (stale encrypted jpdbApiKey handling)
- Modify: `src/app.js` (vidSet in default mock)

- [ ] **Step 1: Clean settings.js**

Remove `jpdbDeckId` from GET response (line 35) and POST handler (lines 55–56).
Remove `clearVocabCache()` import and call.

- [ ] **Step 2: Clean auth/routes.js**

Remove `hasJpdbKey: false` from apiKeysInfo default (line 143).
Remove `hasJpdbKey: !!keys.jpdbApiKey` (line 155).
Remove `if (jpdbApiKey !== undefined) keys.jpdbApiKey = jpdbApiKey` from updateKeys (line 171).

- [ ] **Step 2b: Decide how to handle stored encrypted JPDB keys**

Update `src/auth/users.js` / key merge logic so old encrypted `jpdbApiKey` values are either:
- explicitly dropped on the next save/update, or
- intentionally tolerated but ignored forever

Do not leave this ambiguous in the implementation. Pick one and document it in code/tests.

- [ ] **Step 3: Clean app.js**

Change the `getUserVocabulary` default mock from:
```javascript
getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
```
To:
```javascript
getUserVocabulary: () => ({ words: [] }),
```

Also check line 76 for a `checkSentenceViolations` mock. If it returns `[]`, update it to return the correct shape: `{ sentence: '', unknownWords: [], count: 0 }`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings.js src/auth/routes.js src/app.js
git commit -m "chore: remove JPDB from settings, auth, and app defaults"
```

---

### Task 9: Remove JPDB from Game Loop and Exploration

**Files:**
- Modify: `src/game/loop.js` (jpdbApiKey parameter)
- Modify: `src/game/services/exploration-service.js` (JPDB imports, vid/sid)
- Modify: `src/narration-engine/dialogue-repair.js` (JPDB comments, null-guard semantics)

- [ ] **Step 1: Clean loop.js**

```bash
grep -n 'jpdb\|JPDB\|jpdbApiKey' src/game/loop.js
```

Remove `jpdbApiKey` parameter from `startSpeedReviewRoom()` and any other methods. Update callers of that method.

- [ ] **Step 2: Clean exploration-service.js**

Remove JPDB imports (`getDueWordsWithMeanings`).
Remove vid/sid properties from returned word objects.

**Speed review room data model migration:** The exploration service's speed review room system stores word snapshots with vid/sid keys (lines ~950–956, 1059–1132). These need to change to word-string keys:
- In `startSpeedReviewRoom()`: the word snapshot should store `word` (string) instead of `{ vid, sid }`. The room's word list comes from FSRS `getDueCards(userId, 'vocab')` which already returns cards with string IDs.
- In `recordSpeedReviewRoomCommit()`: accept `word` (string) instead of `{ vid, sid }` for identifying which word was committed.
- Update any loop that iterates room words to use string comparison instead of vid matching.
- Do **not** assume `public/js/ui/speed-review.js` is already migrated. It still has `vid`/`sid` branches today, so Task 0B must land first or be completed as part of this task.

- [ ] **Step 3: Update dialogue-repair.js**

Update JSDoc comments to remove JPDB references (lines 22–24):
Change "If null, validation is skipped (no JPDB API key available)" to "If null, validation is skipped."

Note: The `if (!checkViolationsFn) return []` guard stays for now — it handles the case where no AI config is available. The semantic change (Sudachi always available) will be fully realized in Chunk 3 when vocab-repair is rewired.

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js src/game/services/exploration-service.js src/narration-engine/dialogue-repair.js
git commit -m "chore: remove JPDB from game loop, exploration, and dialogue repair"
```

---

### Task 10: Delete Flash Card Combat System (Frontend)

**Files:**
- Delete: `public/js/word-practice.js`
- Delete: `public/js/ui/kana-combat.js`
- Modify: `public/game.js` (remove wordPractice import and all calls)
- Modify: `public/js/ui/combat-loop.js` (remove showNextDualCardsFromQueue, kana combat, word-practice calls)
- Modify: `public/js/ui/actions.js` (preserve single-card discovery renderer, remove combat-only behavior)

- [ ] **Step 1: Delete word-practice.js and kana-combat.js**

```bash
rm public/js/word-practice.js
rm public/js/ui/kana-combat.js
```

- [ ] **Step 2: Remove wordPractice from game.js**

Remove the import (line 82):
```javascript
import * as wordPractice from './js/word-practice.js';
```

Remove ALL `wordPractice.*` calls (lines 1261–1262, 1297–1298, 1727–1732, 1783, 2048, 2056).
Remove flash card callbacks (`dualCardSelect`, `cardFlip`).
Remove `parseJpdbText` lookup initialization.

- [ ] **Step 3: Remove flash card combat from combat-loop.js**

Remove `showNextDualCardsFromQueue()` function.
Remove kana combat references.
Remove all word-practice calls and imports.

- [ ] **Step 4: Keep discovery flash cards, remove combat-only flash card behavior from actions.js**

Do **not** delete `showFlashCards(words, { discoveryMode })` while discovery still depends on it.

Instead:
- remove combat-only dependencies from `actions.js`
- preserve the single-card discovery renderer and swipe handlers until discovery gets its own dedicated renderer or keeps using this module intentionally
- if you later split discovery rendering into its own module, do that first, then delete the unused path

- [ ] **Step 5: Verify speed review still has its own card rendering**

```bash
grep -n 'flash-card\|flashCard' public/js/ui/speed-review.js | head -10
```

Confirm speed-review.js renders its own `.flash-card` elements independently of `actions.js`.

- [ ] **Step 6: Syntax-check modified frontend files**

```bash
node --check public/game.js && echo "OK"
node --check public/js/ui/combat-loop.js && echo "OK"
node --check public/js/ui/actions.js && echo "OK"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove flash card combat and kana combat systems"
```

---

### Task 11: Remove JPDB from Remaining Frontend Files

**Files:**
- Modify: `public/js/api.js` (JPDB API functions)
- Modify: `public/js/settings.js` (jpdbApiKey storage)
- Modify: `public/js/ui/modals.js` (JPDB key input)
- Modify: `public/js/ui/lookup.js` (replace vid/sid cache with string-word cache)
- Modify: `public/js/ui/exploration.js` (vid/sid logging)
- Modify: `public/js/ui/speed-review.js` (vid/sid mapping)

- [ ] **Step 1: Replace JPDB API functions in api.js only after new callers exist**

Remove:
- `sendJpdbReview()` once Task 0A and Task 0B are complete
- `parseJpdbText()`, `lookupJpdbWord()`, `lookupJpdbBatch()` once Task 0C is complete

Add/keep explicit replacements for:
- internal vocab review
- local parse-text / lookup batch
- string-based speed-review room progress

- [ ] **Step 2: Remove JPDB from settings.js**

Remove: `jrpg_jpdbApiKey` localStorage key, `hasJpdbApiKey()` function, JPDB portions of `getApiKeys()`/`setApiKeys()`.

- [ ] **Step 3: Remove JPDB key input from modals.js**

Remove the password input field for JPDB API key and its label.

- [ ] **Step 4: Rewrite lookup.js around string keys**

Replace the `"vid:sid"` cache key pattern with string-based word lookup.
Replace `data-vid`/`data-sid` DOM attribute reads with `data-word`.
Update activation/gating copy so lookup no longer claims a JPDB key is required.

- [ ] **Step 5: Remove vid/sid from exploration.js**

Remove vid/sid logging in discovery interactions (lines 747, 751).

- [ ] **Step 6: Remove vid/sid mapping from speed-review.js**

Remove the remaining vid/sid mapping branches after Task 0B lands. The final speed-review contract should de-dupe, refresh, and commit by `word`.

- [ ] **Step 7: Syntax-check all modified files**

```bash
for f in public/js/api.js public/js/settings.js public/js/ui/modals.js public/js/ui/lookup.js public/js/ui/exploration.js public/js/ui/speed-review.js; do node --check "$f" && echo "OK: $f"; done
```

- [ ] **Step 8: Commit**

```bash
git add public/js/
git commit -m "chore: remove JPDB from all frontend modules"
```

---

### Task 12: Remove Combat-Only CSS and Clean game.css

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Identify which flash-card CSS speed review uses**

```bash
grep -n 'flash-card' public/js/ui/speed-review.js
```

Expect: speed-review.js creates elements with `.flash-card`, `.flash-card-front`, `.flash-card-back`, `.flash-card-word`, `.flash-card-meaning`, `.flash-card-hint` classes. These base CSS rules MUST stay.

- [ ] **Step 2: Remove combat-only CSS**

Remove `.combat-defend-indicator` and any dual-card layout rules that are not used by speed review. Keep all base `.flash-card*` rules and `.speed-review-slot .flash-card*` overrides.

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "chore: remove combat-only flash card CSS, keep speed review styles"
```

---

### Task 13: Gut Admin Word Exposures

**Files:**
- Modify: `src/routes/admin-word-exposures.js` (remove JPDB comparison functions, keep aggregation)
- Modify: `public/admin-word-exposures.html` (remove JPDB comparison UI)

- [ ] **Step 1: Gut admin-word-exposures.js**

Remove: `buildJpdbComparison()`, `buildFrameComparison()`, and any routes that call them.
Keep: `aggregateWordExposures()` and non-JPDB admin functionality.
Remove any JPDB imports.

- [ ] **Step 2: Clean admin-word-exposures.html**

Remove JPDB comparison UI columns and JavaScript that fetches from `/api/admin/word-exposures/jpdb-compare`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin-word-exposures.js public/admin-word-exposures.html
git commit -m "chore: remove JPDB comparison from admin word exposures"
```

---

### Task 14: Clean Config and Environment Files

**Files:**
- Modify: `.env.example` (remove JPDB_API_KEY)
- Modify: `.jrpg-settings.json` (remove jpdbDeckId, if file exists and is tracked)

- [ ] **Step 1: Remove JPDB_API_KEY from .env.example**

```bash
grep -n 'JPDB' .env.example
```

Remove the `JPDB_API_KEY` line and its comment.

- [ ] **Step 2: Remove jpdbDeckId from .jrpg-settings.json if tracked**

Only modify if the file is tracked in git. If it's gitignored, skip.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: remove JPDB_API_KEY from env config"
```

---

### Task 15: Verify Server Boots After Chunk 2

- [ ] **Step 1: Syntax-check all modified server files**

```bash
for f in server.js src/routes/vocab.js src/routes/game/misc.js src/routes/game/run.js src/routes/game/combat.js src/routes/game/route-helpers.js src/routes/settings.js src/auth/routes.js src/app.js src/game/loop.js src/game/services/exploration-service.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```

- [ ] **Step 2: Start server and verify boot**

```bash
timeout 10 node server.js 2>&1 | head -20
```

Expected: Clean startup, no import errors.

- [ ] **Step 3: Run tests to see remaining failures**

```bash
npm test 2>&1 | tail -40
```

---

## Chunk 3: Rewire vocab-manager to FSRS, Rewire vocab-repair to Sudachi

### Task 16: Rewire vocab-manager.js to FSRS

This is the most complex task. Replace JPDB word-state lookups with FSRS deck queries.

**Files:**
- Modify: `src/game/vocab-manager.js`

**FSRS State Mapping:**
| JPDB State | FSRS Equivalent |
|------------|-----------------|
| `'due'`/`'failed'` | `State.Relearning` (3) or card with `due < now` (overdue) |
| `'learning'` | `State.Learning` (1) |
| `'known'`/`'never-forget'` | `State.Review` (2) |
| `'new'` | `State.New` (0) — card exists but never reviewed |

Note: `State.Relearning` (3) means "was in Review but failed a review" — maps to JPDB's `'failed'` state.

- [ ] **Step 1: Replace imports**

Remove the JPDB stubs added in Task 3. Add FSRS imports:

```javascript
import { getDeckCards, getDueCards } from '../internal-srs.js';
import { State } from 'ts-fsrs';
```

- [ ] **Step 2: Remove cache file infrastructure**

FSRS data is already persisted in `srs-{userId}.json`. No separate cache layer needed.

Remove: `getUserCacheFile()`, `saveCache()`, `initVocabManager()` (file-loading part), `FULL_PARSE_CONFIG`, per-user cache file read/write logic.

Keep: `configureVocabManager()` (may still be needed for cacheDir), in-memory `userStates` for recently-used words ring buffer.

Simplify `getOrCreateUserState()` to only track `recentlyUsedWords`:
```javascript
function getOrCreateUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      recentlyUsedWords: []
    });
  }
  return userStates.get(userId);
}
```

- [ ] **Step 3: Rewrite `refreshWordStateCache` → delete**

This function fetched word states from JPDB. With FSRS, word states are always local. Delete the entire function.

- [ ] **Step 4: Rewrite `calculatePriority` for FSRS states**

Replace JPDB state names with FSRS state checks:

```javascript
function calculatePriority(card) {
  if (!card) return 0;
  const now = new Date();
  const dueDate = card.due instanceof Date ? card.due : new Date(card.due);
  const isOverdue = dueDate <= now;

  if (card.state === State.Relearning) return 1.0;        // Failed → highest priority
  if (card.state === State.Learning && isOverdue) return 0.9;  // Due learning
  if (card.state === State.Review && isOverdue) return 0.8;    // Due review
  if (card.state === State.Learning) return 0.7;           // Learning (not yet due)
  if (card.state === State.Review) return 0.3;             // Known/review
  return 0;  // New cards not prioritized here
}
```

- [ ] **Step 5: Rewrite `getPrimaryState` for FSRS states**

```javascript
function getPrimaryState(card) {
  if (!card) return 'unknown';
  const now = new Date();
  const dueDate = card.due instanceof Date ? card.due : new Date(card.due);
  const isOverdue = dueDate <= now;

  if (card.state === State.Relearning) return 'due';
  if (isOverdue && (card.state === State.Learning || card.state === State.Review)) return 'due';
  if (card.state === State.Learning) return 'learning';
  if (card.state === State.Review) return 'known';
  return 'new';
}
```

- [ ] **Step 6: Rewrite `selectSuggestedWords` to accept FSRS cards**

Change to build candidates from FSRS deck cards instead of a wordStates cache object:

```javascript
export function selectSuggestedWords(cards, recentWords, count = CONFIG.suggestionCount) {
  const recentSet = new Set(recentWords);
  const candidates = [];

  for (const card of cards) {
    const word = card.id;
    if (recentSet.has(word)) continue;
    if (word.length < 2) continue;

    const priority = calculatePriority(card);
    if (priority > 0) {
      candidates.push({ word, state: getPrimaryState(card), priority });
    }
  }

  shuffleArray(candidates);
  candidates.sort((a, b) => b.priority - a.priority);

  const selected = [];
  const targetDue = Math.floor(count * CONFIG.dueWordRatio);
  const targetLearning = Math.floor(count * CONFIG.learningWordRatio);
  const targetKnown = count - targetDue - targetLearning;

  selectByState(candidates, selected, 'due', targetDue);
  selectByState(candidates, selected, 'learning', targetLearning);
  selectByState(candidates, selected, 'known', targetKnown);

  for (const candidate of candidates) {
    if (selected.length >= count) break;
    if (!selected.find(s => s.word === candidate.word)) {
      selected.push(candidate);
    }
  }

  return selected.slice(0, count);
}
```

- [ ] **Step 7: Rewrite `getSuggestionsForNarration`**

```javascript
export function getSuggestionsForNarration(userId) {
  const cards = getDeckCards(userId, 'vocab');
  const recentWords = getRecentlyUsedWords(userId);
  return selectSuggestedWords(cards, recentWords);
}
```

Note: no longer async (FSRS is local), no apiKey or vocabulary params needed.

- [ ] **Step 8: Rewrite `getNarrationVocabularyForUser`**

Return type changes from `{ words, vidSet }` to `{ words }`:

```javascript
export function getNarrationVocabularyForUser(userId, fallbackVocabulary = []) {
  if (!userId) {
    const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
    return { words };
  }

  const cards = getDeckCards(userId, 'vocab');
  const knownWords = cards
    .filter(c => c.state === State.Learning || c.state === State.Review || c.state === State.Relearning)
    .map(c => c.id);

  if (knownWords.length > 0) {
    return { words: knownWords };
  }

  const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
  return { words };
}
```

- [ ] **Step 9: Rewrite `getNewWordsForDiscovery`**

```javascript
export function getNewWordsForDiscovery(limit = 2, userId) {
  const cards = getDeckCards(userId, 'vocab');
  const newCards = cards.filter(c => c.state === State.New);

  if (newCards.length === 0) {
    return { words: [], available: false };
  }

  const words = newCards.slice(0, limit).map(c => ({
    word: c.id,
    reading: c.reading || c.id,
    meanings: c.meaning ? [c.meaning] : []
  }));

  return { words, available: words.length > 0 };
}
```

- [ ] **Step 10: Delete remaining JPDB-only functions**

Delete: `performFullParse()`, `updateWordStates()`, `invalidateWordStateCache()`, `setTestCache()`.
Keep: `addUsedWords()`, `getRecentlyUsedWords()`, `clearVocabManagerCache()`, `getVocabManagerStats()`.

- [ ] **Step 11: Update exports**

Remove exports for deleted functions. The module's public API should now be:
- `configureVocabManager()`
- `addUsedWords(words, userId)`
- `getRecentlyUsedWords(userId)`
- `getSuggestionsForNarration(userId)`
- `getNarrationVocabularyForUser(userId, fallbackVocabulary)`
- `getNewWordsForDiscovery(limit, userId)`
- `selectSuggestedWords(cards, recentWords, count)`
- `clearVocabManagerCache(userId)`
- `getVocabManagerStats(userId)`

- [ ] **Step 12: Syntax check**

```bash
node --check src/game/vocab-manager.js && echo "OK"
```

- [ ] **Step 13: Commit**

```bash
git add src/game/vocab-manager.js
git commit -m "refactor: rewire vocab-manager from JPDB to FSRS"
```

---

### Task 17: Rewire vocab-repair.js to Sudachi

Replace JPDB's `parseText` with the local Sudachi tokenizer. Change matching from vid-based to string-based.

**Files:**
- Modify: `src/game/vocab-repair.js`

- [ ] **Step 1: Replace JPDB import with Sudachi tokenizer**

Remove the stub added in Task 4. Add:
```javascript
import { tokenize } from '../tokenizer.js';
```

- [ ] **Step 2: Rewrite `checkSentenceViolations` signature and implementation**

Old signature: `checkSentenceViolations(sentence, vocabSet, jpdbApiKey, gameTerms, vidSet)`
New signature: `checkSentenceViolations(sentence, vocabSet, gameTerms)`

```javascript
function checkSentenceViolations(sentence, vocabSet, gameTerms = null) {
  if (!sentence.trim()) {
    return { sentence, unknownWords: [], count: 0 };
  }

  // Parse sentence into words using Sudachi
  const tokens = tokenize(sentence);
  const unknownWords = [];
  const seen = new Set();

  const gameTermWords = new Set();
  if (gameTerms) {
    for (const term of gameTerms) {
      gameTermWords.add(term);
      const components = term.split(/[のが]/);
      components.forEach(c => c && gameTermWords.add(c));
    }
  }

  for (const token of tokens) {
    const baseForm = token.baseForm;
    const surface = token.surface;

    // Skip non-content words (particles, auxiliary verbs based on POS)
    if (token.pos?.startsWith('助詞') || token.pos?.startsWith('助動詞')) continue;
    if (token.pos?.startsWith('補助記号') || token.pos?.startsWith('空白')) continue;

    // Deduplication by baseForm
    if (seen.has(baseForm)) continue;
    seen.add(baseForm);

    // Allowed grammar words / particles
    if (ALLOWED_WORDS.has(baseForm) || ALLOWED_WORDS.has(surface)) continue;

    // Game-specific terms
    if (gameTermWords.has(baseForm) || gameTermWords.has(surface)) continue;

    // Single hiragana character
    if (surface.length === 1 && /[\u3040-\u309F]/.test(surface)) continue;

    // String-based vocab match (check both baseForm and surface)
    if (vocabSet.has(baseForm) || vocabSet.has(surface)) continue;

    unknownWords.push(surface);
  }

  return { sentence, unknownWords, count: unknownWords.length };
}
```

Note: This function is now **synchronous** (Sudachi tokenize is sync via execFileSync). All callers that `await` it will still work (awaiting a non-promise returns the value).

- [ ] **Step 3: Update `enforceVocabLimit` signature**

Remove `jpdbApiKey` and `vidSet` parameters:

Old: `enforceVocabLimit(narration, vocabulary, jpdbApiKey, chatFn, maxUnknownsPerSentence, gameTerms, vidSet)`
New: `enforceVocabLimit(narration, vocabulary, chatFn, maxUnknownsPerSentence, gameTerms)`

Update the early return check — remove the `!jpdbApiKey` guard:
```javascript
if (!narration) {
  return { narration, repairs: [], failures: [] };
}
```

Update all `checkSentenceViolations` calls inside to use new signature (remove jpdbApiKey and vidSet args).

- [ ] **Step 4: Update exports**

Ensure the new signatures are exported. The public API stays the same, just with fewer parameters.

- [ ] **Step 5: Syntax check**

```bash
node --check src/game/vocab-repair.js && echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add src/game/vocab-repair.js
git commit -m "refactor: rewire vocab-repair from JPDB parseText to Sudachi tokenizer"
```

---

### Task 18: Update All Callers of Changed Signatures

**Files:**
- Modify: `src/routes/game/route-helpers.js` (already partially done in Task 7, verify)
- Verify: `src/routes/game/combat.js`, `src/routes/game/run.js`
- Verify: `src/narration-engine/dialogue-repair.js`
- Verify: Any other callers of `enforceVocabLimit` or `checkSentenceViolations`

- [ ] **Step 1: Find all callers of changed functions**

```bash
grep -rn 'checkSentenceViolations\|enforceVocabLimit\|getNarrationVocabularyForUser\|getSuggestionsForNarration' src/ --include='*.js'
```

- [ ] **Step 2: Verify each caller uses the new signatures**

For each file found:
- `getNarrationVocabularyForUser(userId)` returns `{ words }` not `{ words, vidSet }`
- `checkSentenceViolations(sentence, vocabSet, gameTerms)` — no jpdbApiKey, no vidSet
- `enforceVocabLimit(narration, vocabulary, chatFn, maxUnknowns, gameTerms)` — no jpdbApiKey, no vidSet
- `getSuggestionsForNarration(userId)` — no apiKey, no vocabulary params

Fix any callers still using old signatures.

- [ ] **Step 3: Commit if any changes needed**

```bash
git add -A
git commit -m "fix: update all callers to use new vocab-manager and vocab-repair signatures"
```

---

## Chunk 4: Fix Tests, Update Docs, Final Verification

### Task 19: Delete JPDB-Only Test Files

**Files:**
- Delete: `tests/unit/vocab/jpdb-circuit-breaker.test.js`
- Delete: `tests/unit/vocab/jpdb-helpers.test.js`
- Delete: `tests/unit/vocab/repair-vid-integration.test.js`
- Delete: `tests/unit/admin-word-exposures.test.js`
- Delete: `tests/integration/vocab/discovery-words.test.js`

- [ ] **Step 1: Delete test files**

```bash
rm tests/unit/vocab/jpdb-circuit-breaker.test.js
rm tests/unit/vocab/jpdb-helpers.test.js
rm tests/unit/vocab/repair-vid-integration.test.js
rm tests/unit/admin-word-exposures.test.js
rm tests/integration/vocab/discovery-words.test.js
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: delete JPDB-only test files"
```

---

### Task 20: Update Remaining Test Files

**Files:**
- Modify: `tests/helpers/mocks.js` (remove createMockJPDB)
- Modify: `tests/unit/vocab/manager-per-user.test.js` (rewrite for FSRS-backed vocab-manager)
- Modify: `tests/unit/game/speed-review-room.test.js` (remove JPDB mocks)
- Modify: `tests/unit/vocab/phase-word-discovery.test.js` (discovery review contract migration)
- Modify: `tests/unit/auth/crypto.test.js` (remove jpdbApiKey from fixtures)
- Modify: `tests/unit/auth/users.test.js` (remove jpdbApiKey from assertions)
- Modify: `tests/integration/flows/vocab-review.test.js` (remove JPDB logic)
- Modify: `tests/smoke/narration-live.test.js` (remove JPDB todo)

- [ ] **Step 1: Clean test helpers**

Remove `createMockJPDB()` from `tests/helpers/mocks.js`.

- [ ] **Step 2: Update manager-per-user.test.js**

This is the biggest test rewrite. The test currently mocks JPDB imports. Rewrite to test the FSRS-backed vocab-manager:
- Mock `getDeckCards` and `getDueCards` from `internal-srs.js` instead of JPDB functions
- Test `selectSuggestedWords` with FSRS card objects (with `state`, `due`, `id` fields)
- Test `getNarrationVocabularyForUser` returns `{ words }` without vidSet
- Test `getNewWordsForDiscovery` filters by `State.New`

- [ ] **Step 3: Update speed-review-room.test.js**

Remove JPDB-specific mocks and assertions. Ensure tests use FSRS card IDs (strings) not vid/sid.

- [ ] **Step 4: Clean auth test fixtures**

In `crypto.test.js`: remove `jpdbApiKey: 'jpdb-key-123'` from test fixtures.
In `users.test.js`: remove `jpdbApiKey: 'test-key'` from test assertions.

- [ ] **Step 5: Clean remaining test files**

In `vocab-review.test.js`: remove JPDB-related comments and logic.
In `narration-live.test.js`: remove JPDB todo reference.
In `stage-utils.test.js`: update "JPDB rank" references in test names (keep tests, just rename).
In `phase-word-discovery.test.js`: verify discovery reviews use `word` strings and the internal review endpoint behavior, including daily-limit tracking.
Add at least one focused lookup test for the new Sudachi + local dictionary parse/lookup contract so lookup removal is not untested.

- [ ] **Step 5b: Check for additional affected test files**

```bash
grep -rn 'jpdb\|JPDB\|vidSet\|\.vid\b\|setTestCache' tests/ --include='*.js' | grep -v node_modules
```

Additional files likely needing updates:
- `tests/unit/vocab/manager-new-words.test.js` — uses `setTestCache()` which is deleted in Task 16. Rewrite to use FSRS card setup instead.
- `tests/unit/vocab/phase-speed-review-room.test.js` — may need vid/sid→string migration in test data.
- `tests/unit/vocab/phase-word-discovery.test.js` — may need updates after discovery endpoint changes.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Fix any remaining failures.

- [ ] **Step 7: Commit**

```bash
git add tests/
git commit -m "test: update tests for FSRS-backed vocab system, remove JPDB mocks"
```

---

### Task 21: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update CLAUDE.md**

Remove or update:
- "Show raw JPDB definitions" instruction in Japanese Translation Accuracy section
- `jpdb.js` from Key Directories listing
- `/api/jpdb/` from API Endpoint Namespaces
- Per-user JPDB migration note in Migration Notes section
- Keep forge skill references (they still use JPDB frequency lookups)

- [ ] **Step 2: Update docs/ARCHITECTURE.md**

Remove JPDB vocabulary integration section.
Update data flow descriptions to reference FSRS as the sole word state system.
Update API endpoint tables to remove `/api/jpdb/*`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md
git commit -m "docs: update CLAUDE.md and ARCHITECTURE.md to reflect JPDB removal"
```

---

### Task 22: Final Verification

- [ ] **Step 1: Global grep for any remaining JPDB runtime references**

```bash
grep -rn 'jpdb\|JPDB' src/ public/ tests/ server.js --include='*.js' --include='*.mjs' --include='*.html' --include='*.css' | grep -v node_modules | grep -v '.claude/' | grep -v 'scripts/' | grep -v 'language/'
```

Expected: No matches in runtime code. Only matches in kept dev-time scripts and forge tools.

- [ ] **Step 2: Global grep for orphaned vid/sid references**

```bash
grep -rn 'vidSet\|\.vid\b\|\.sid\b' src/ public/ tests/ server.js --include='*.js' | grep -v node_modules | grep -v scripts/
```

Expected: No matches in runtime code.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Start dev server and verify**

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: 200 response.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final JPDB removal cleanup"
```

---

## Summary

| Chunk | Tasks | What it does |
|-------|-------|-------------|
| **0** | 0A–0C | Replace live discovery, speed-review, and lookup contracts before deletion |
| **1** | 1–5 | Delete JPDB core files, fix server boot with temporary stubs |
| **2** | 6–15 | Delete JPDB routes/frontend paths once replacements exist, clean settings/auth/config |
| **3** | 16–18 | Rewire vocab-manager to FSRS, vocab-repair to Sudachi, update all callers |
| **4** | 19–22 | Fix tests, update docs, final verification |

**Expected outcome:** ~3,500+ lines removed, ~1.2MB of data files deleted, FSRS as sole word state system, Sudachi as sole tokenizer, discovery + speed review + lookup preserved on local/internal contracts, dev-time forge tools unaffected.
