# JPDB Runtime Removal — Design Spec

**Date:** 2026-04-16
**Goal:** Remove JPDB as a runtime SRS backend. The game already uses FSRS (internal-srs.js) as its source of truth for known words, due cards, and review scheduling. JPDB is a parallel system that duplicates what FSRS does. Remove it.

**Out of scope:** JPDB frequency lookup tools used during development (forge skills, scripts/lib/jpdb-helpers.mjs, etc.) stay.

---

## Approach: Delete-First

Delete all JPDB code, let things break, fix the two spots that need rewiring (vocab-manager → FSRS, vocab-repair → Sudachi). The test suite catches what breaks.

Rationale: The codebase is already 90% on FSRS. Deleting first gives the clearest picture of what actually needs rewiring vs. what's just dead weight.

---

## Files to Delete Entirely

| File | Lines | Reason |
|------|-------|--------|
| `src/jpdb.js` | 1,522 | Core JPDB API client |
| `public/js/word-practice.js` | 771 | Flash card combat system, 100% JPDB |
| `public/js/ui/kana-combat.js` | ~120 | Kana combat flash cards |
| `tests/unit/vocab/jpdb-circuit-breaker.test.js` | — | JPDB-only tests |
| `tests/unit/vocab/jpdb-helpers.test.js` | — | JPDB-only tests |
| `tests/unit/vocab/repair-vid-integration.test.js` | — | JPDB vid/sid tests |
| `tests/unit/admin-word-exposures.test.js` | — | JPDB comparison tests |
| `tests/integration/vocab/discovery-words.test.js` | — | JPDB discovery tests |
| `data/jpdb-wordlist.json` | 886KB | Static JPDB word list (runtime) |
| `data/jpdb-tokenization-cache.json` | 53KB | JPDB parse cache |
| `data/jpdb-frame-compare-cache.json` | 299KB | JPDB frame cache |
| Runtime `data/vocab-cache-*.json` files | varies | Stale JPDB per-user caches — delete on deploy, no migration needed (FSRS state lives in `srs-{userId}.json`) |

## Files to Gut (Major Removals, Some Code Stays)

### Server Core

**`server.js`**
- Remove: All JPDB imports (`configure`, `initialize`, `getVocabulary`, `clearVocabCache`, `testConnection`, `parseText`, `lookupWordStates`, `CARD_STATES`, `reviewVocabulary`, `REVIEW_GRADES`, `getDueWordsWithMeanings`, `getWordState`, `invalidateWordStateCache`, `lookupVocabularyMeaning`)
- Remove: `configureJpdb()` / `initializeJpdb()` calls
- Remove: `ALLOWED_WORDS` duplicate (import from `vocab-repair.js` if still needed)
- Remove: `jpdb-wordlist.json` loading
- Remove: `jpdbDeckId` default in settings
- Remove: Import of `createWordExposureRoutes` from `admin-word-exposures.js` and its `app.use()` call

**`src/app.js`**
- Remove: `vidSet` from default `getUserVocabulary` mock return value
- Update: Return type becomes `{ words }` (or just `string[]`)

**`src/game/loop.js`**
- Remove: `jpdbApiKey` parameter from `startSpeedReviewRoom()` and any other methods that accept it

### Routes

**`src/routes/index.js`**
- Remove: Comment referencing JPDB routes (`// Vocab/JPDB routes: /api/vocab/*, /api/jpdb/*`)

**`src/routes/vocab.js`**
- Remove: All `/api/jpdb/*` routes (parse, review, lookup, lookup-batch)
- Remove: JPDB imports
- Keep: `/api/vocab/due-words` if it serves FSRS due words (or remove if redundant with `/api/game/known-words/due-words`)

**`src/routes/game/misc.js`**
- Remove: `POST /api/game/due-words` endpoint
- Remove: `POST /api/game/post-combat-refresh` endpoint
- Remove: JPDB imports (`getDueWordsWithMeanings`, `fetchDueWordsDirectly`, `parseWordBatch`)

**`src/routes/game/route-helpers.js`**
- Remove: `vidSet` passing to `checkSentenceViolations()`
- Remove: `jpdbApiKey` / `process.env.JPDB_API_KEY` fallback
- Remove: `vidSet` from return objects
- Update: `checkSentenceViolations` calls to use string-based matching only
- Note: `checkFn` should now always be provided (Sudachi is local, no API key gating needed)

**`src/routes/game/run.js`**
- Remove: vid/sid validation in speed review room commits
- Remove: `lookupVocabularyBatch` import from `jpdb.js` and discovery-words JPDB enrichment code (~20 lines)
- Update: Speed review to use FSRS string-based word IDs

**`src/routes/game/combat.js`**
- Remove: `vidSet: vocabConfig.vidSet` passing to combat system

**`src/routes/settings.js`**
- Remove: `jpdbDeckId` handling in GET/POST
- Remove: `clearVocabCache()` trigger on deck change

**`src/routes/admin-word-exposures.js`** (gut, not delete)
- Remove: `buildJpdbComparison()`, `buildFrameComparison()`, and JPDB comparison routes/endpoints
- Keep: `aggregateWordExposures()` and non-JPDB admin functionality

### Auth

**`src/auth/routes.js`**
- Remove: `hasJpdbKey: !!keys.jpdbApiKey` from `/api/auth/me`
- Remove: `jpdbApiKey` handling in PUT `/api/auth/api-keys`

**`src/auth/middleware.js`**
- Keep middleware, `jpdbApiKey` naturally disappears once removed from stored key objects

**`src/auth/users.js`**
- Remove: `jpdbApiKey` from key storage/retrieval patterns

### Game Services

**`src/game/services/exploration-service.js`**
- Remove: JPDB imports (`getDueWordsWithMeanings`)
- Remove: vid/sid properties on returned word objects

### Narration Engine

**`src/narration-engine/dialogue-repair.js`**
- Remove: JPDB references in JSDoc comments
- Update: The null-guard pattern `if (!checkFn) return []` changes semantics — with Sudachi (local), `checkFn` should always be available. Callers no longer need to gate on API key presence. Update the null check to reflect the new always-available validation.

### Frontend

**`public/js/api.js`**
- Remove: `sendJpdbReview()`, `parseJpdbText()`, `lookupJpdbWord()`, `lookupJpdbBatch()`

**`public/js/settings.js`**
- Remove: `jrpg_jpdbApiKey` localStorage key
- Remove: `hasJpdbApiKey()` function
- Remove: JPDB portions of `getApiKeys()` / `setApiKeys()`

**`public/js/ui/modals.js`**
- Remove: JPDB API Key input field from settings modal

**`public/js/ui/combat-loop.js`**
- Remove: `showNextDualCardsFromQueue()`
- Remove: Kana combat references
- Remove: All word-practice calls

**`public/js/ui/actions.js`**
- Remove: `showFlashCards()` — only called from `combat-loop.js` flash card flow which is being removed. Speed review has its own card rendering in `speed-review.js`.

**`public/game.js`** (note: file is at `public/game.js`, NOT `public/js/game.js`)
- Remove: All `wordPractice.*` calls (`getTwoCombatWords`, `prefetchCombatWords`, `clearWordCache`, `setReviewType`, `init`)
- Remove: Flash card callbacks (`dualCardSelect`, `cardFlip`)
- Remove: `parseJpdbText` lookup initialization
- Remove: word-practice import

**`public/js/ui/lookup.js`**
- Remove: vid/sid-based definition cache (`"vid:sid"` keys)
- Remove: `data-vid` / `data-sid` DOM attribute reads
- Update: Use string-based word lookup if lookup feature stays

**`public/js/ui/exploration.js`**
- Remove: vid/sid logging in discovery interactions

**`public/js/ui/speed-review.js`**
- Remove: vid/sid mapping (line 676) — already works with FSRS strings

**`public/game.css`**
- Keep: Base `.flash-card` CSS classes (`.flash-card-container`, `.flash-card`, `.flash-card-front`, `.flash-card-back`, `.flash-card-word`, `.flash-card-meaning`, `.flash-card-hint`) — **speed review uses these exact classes** (lines 318-325, 468-475 of `speed-review.js`). The `.speed-review-slot .flash-card` overrides (game.css lines 2861-2883) depend on the base rules existing.
- Remove: Combat-only flash card CSS that speed review does NOT use (e.g., `.combat-defend-indicator`, dual-card layout rules). Audit each rule against speed-review.js usage before deleting.

**`public/admin-word-exposures.html`**
- Remove: JPDB comparison UI columns and JavaScript that fetches from `/api/admin/word-exposures/jpdb-compare`
- Keep: Core word exposure display functionality

### Config / Data

**`.jrpg-settings.json`** — Remove `jpdbDeckId` field
**`.env` / `.env.example`** — Remove `JPDB_API_KEY` variable

### Tests to Update (not delete)

| File | Change |
|------|--------|
| `tests/unit/vocab/manager-per-user.test.js` | Remove JPDB-specific test cases, update to test FSRS-backed vocab-manager |
| `tests/unit/game/speed-review-room.test.js` | Remove JPDB-specific mocks/assertions |
| `tests/helpers/mocks.js` | Remove `createMockJPDB()` helper |
| `tests/integration/flows/vocab-review.test.js` | Remove JPDB-related comments and logic |
| `tests/unit/stages/stage-utils.test.js` | Update "JPDB rank" references in test names (dev-time concept, may keep) |
| `tests/unit/auth/crypto.test.js` | Remove `jpdbApiKey` from test fixtures |
| `tests/unit/auth/users.test.js` | Remove `jpdbApiKey` from test assertions |
| `tests/smoke/narration-live.test.js` | Remove JPDB todo reference |

### Documentation to Update

| File | Change |
|------|--------|
| `CLAUDE.md` | Remove "Show raw JPDB definitions" instruction, `jpdb.js` from key directories, `/api/jpdb/` from API namespaces, per-user JPDB migration note. Keep forge skill references. |
| `docs/ARCHITECTURE.md` | Remove JPDB vocabulary integration section, update data flow descriptions and API endpoint tables |

## Cascading Signature Changes

The `getUserVocabulary` function (wired as `getUserNarrationVocabulary` in server.js) currently returns `{ words, vidSet }`. After vocab-manager rewire, it returns `{ words }` only. Every caller that destructures `vidSet` must be updated:

- `src/routes/game/route-helpers.js` (lines 5, 56) — drop `vidSet` destructuring
- `src/routes/game/run.js` (lines 89, 100) — drop `vidSet` destructuring
- `src/routes/game/combat.js` (line 575) — drop `vidSet` passing
- `src/app.js` (line 62) — update mock return value

Similarly, `checkSentenceViolations` signature changes from `(sentence, vocabSet, jpdbApiKey, gameTerms, vidSet)` to `(sentence, vocabSet, gameTerms)`. All callers must update:

- `src/routes/game/route-helpers.js` — update closure
- `src/narration-engine/dialogue-repair.js` — update checkFn calls
- All test files that call checkSentenceViolations

## Files to Rewire

### `src/game/vocab-manager.js` (717 lines → rewire to FSRS)

**Current:** Imports `lookupWordStates` and `parseWordBatches` from `jpdb.js`. Caches JPDB word states (due/known/learning) per user. Selects word suggestions for narration with 60% due / 25% learning / 15% known ratio.

**Change:** Replace JPDB data source with FSRS equivalents:
- `lookupWordStates()` → `getDeckCards(userId, 'vocab')` from `internal-srs.js`
- `parseWordBatches()` → no longer needed (FSRS tracks by word string, not vid/sid)
- Per-user cache file (`vocab-cache-{userId}.json`) → delete. FSRS already persists in `srs-{userId}.json`. No separate cache layer needed since FSRS reads are local (no expensive API calls to cache).
- Recently-used word ring buffer → keep (still useful for narration variety), but store in memory only or alongside FSRS data
- `selectSuggestedWords()` → keep logic, change state queries to FSRS
- `getNewWordsForDiscovery()` → query FSRS for words in `State.New` or not in any deck
- `invalidateWordByVid()` → delete (only consumer was `jpdb.js`, which is being deleted)
- Remove all vid/sid references
- Return type of `getNarrationVocabularyForUser()` changes from `{ words, vidSet }` to `{ words }`

**FSRS State Mapping:**

| JPDB State | FSRS Equivalent | Notes |
|------------|-----------------|-------|
| `'new'` | `State.New` (0) | Card exists but never reviewed |
| `'learning'` | `State.Learning` (1) | In initial learning phase |
| `'known'` / `'never-forget'` | `State.Review` (2) | Graduated to review interval |
| `'failed'` / `'due'` | `State.Relearning` (3) or card with `due < now` | Failed review or overdue |
| `'suspended'` / `'blacklisted'` | No equivalent | Just don't create the card |
| `'not-in-deck'` / `'locked'` / `'redundant'` | No equivalent | Word not tracked |

### `src/game/vocab-repair.js` (763 lines → rewire to Sudachi)

**Current:** Imports `parseText` from `jpdb.js`. Uses JPDB morphological analysis to tokenize AI-generated text and validate i+1 compliance. Primary matching via `vidSet` (O(1) JPDB vocabulary ID lookup), string matching as fallback.

**Change:**
- Replace `parseText(apiKey, text)` with `tokenize(text)` from `src/tokenizer.js` (Sudachi wrapper already exists in the codebase)
- Word matching changes from JPDB's vocabulary-index model to Sudachi's baseForm-based model. Match against `vocabSet` using `token.baseForm` (dictionary form) instead of JPDB `vid`.
- Remove `vidSet` parameter from `checkSentenceViolations()` — use string-based vocabulary matching only
- Remove `jpdbApiKey` parameter throughout
- New signature: `checkSentenceViolations(sentence, vocabSet, gameTerms)` (drop jpdbApiKey and vidSet)
- Update all callers accordingly
- Key semantic change: validation is now **always available** (Sudachi is local, no API key needed). Code that previously skipped validation when no JPDB key was configured should now always validate.

## Explicitly Kept (Dev-Time JPDB Frequency Tools)

| File | Why |
|------|-----|
| `scripts/lib/jpdb-helpers.mjs` | Forge skill frequency lookups |
| `scripts/generate-theme-pool.mjs` | Theme generation |
| `scripts/item-forge-lookup.mjs` | Item forging |
| `scripts/creature-freq-lookup.mjs` | Creature forging |
| `scripts/theme-pool-consensus.mjs` | Theme consensus |
| `scripts/forge-discovery.mjs` | Forge discovery |
| `data/.creature-forge-jpdb-key` | Dev-time API key |
| `.claude/plugins/koto-forge/` | All forge skills |
| `language/scripts/enrich-jpdb-freq.mjs` | Frequency enrichment |
| `language/stage-utils.js` | Dev-time stage utilities |
| `data/stage-definitions.json` | Contains `jpdbKanaCap` fields used by kept forge scripts |
| `tests/unit/stages/stage-utils.test.js` | Tests dev-time stage utilities |

## Expected Outcome

- ~3,500+ lines of runtime JPDB code removed
- ~1.2MB of JPDB cache/data files removed
- `vocab-manager.js` rewired to FSRS (same logic, different data source)
- `vocab-repair.js` rewired to Sudachi (same validation, different tokenizer)
- Frontend simplified (no API key management, no JPDB-specific API calls)
- Auth simplified (no JPDB key encryption/storage)
- Flash card combat and kana combat systems fully removed
- FSRS is the single source of truth for all word state (no parallel system)
- Speed review, word exposure, known words — all continue working via FSRS
- Vocab validation (i+1) always available (no longer gated on API key)
- Dev-time forge tools unaffected
