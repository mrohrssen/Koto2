# renderJpSentence Dictionary Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Before starting:** Create a worktree per `CLAUDE.md` — `git worktree add ../koto-wt-dict-lookup -b feature/dict-lookup`, `cd` into it, `npm install`. All implementation tasks run from that worktree.

**Spec:** `docs/superpowers/specs/2026-04-23-renderjpsentence-dictionary-lookup-design.md`

**Goal:** Move Japanese-word meaning resolution into one shared priority function called server-side at token assembly, so every rendered token carries live-dictionary meanings that reflect current admin edits and no render path depends on a client-side dictionary.

**Architecture:** One shared `resolveExposureMeaning` (override → entity → token.meaning → dict primary) delegates its dict step to `lookupDictPrimary`. Server helpers (`assembleFrame`, `selectBestFrame`, `selectNpcLine`, `tokenize`-based endpoints) call a new `enrichTokens(tokens, overrides, dict)` to stamp `token.meaning` and `token.meanings` on every content token before response. Client `renderJpSentence` reads pre-stamped meanings; the popup reads `data-meanings` from the span. The filtered `/api/game/known-words/word-dictionary` endpoint and `window.gameState.wordDictionary` are removed.

**Tech Stack:** Node `node:test` + `assert/strict` for unit tests, Express for routes, ES modules throughout.

---

## Phase 1 — Shared resolve function

### Task 1: Add `lookupDictPrimary` and fix `resolveExposureMeaning` priority

**Files:**
- Modify: `public/js/shared/exposure-extractor.js`
- Modify: `tests/unit/exposure-extractor.test.js`

- [ ] **Step 1: Update the existing failing test cases and add new ones**

Replace `tests/unit/exposure-extractor.test.js` contents with:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExposureEntries,
  resolveExposureMeaning,
  lookupDictPrimary,
} from '../../public/js/shared/exposure-extractor.js';

const wordDict = new Map([
  ['遊ぶ', { definitions: [{ en: 'to play', primary: true }] }],
  ['一緒', { definitions: [{ en: 'together' }, { en: 'togetherness', primary: true }] }],
  ['犬', { definitions: [{ en: 'dog' }] }],
  ['茶', { definitions: [{ en: 'tea', primary: true }] }],
]);

describe('lookupDictPrimary', () => {
  it('returns the primary definition from a dict entry', () => {
    assert.equal(lookupDictPrimary(wordDict, '遊ぶ'), 'to play');
  });

  it('falls back to definitions[0] when no entry is marked primary', () => {
    assert.equal(lookupDictPrimary(wordDict, '犬'), 'dog');
  });

  it('returns empty string when word is absent', () => {
    assert.equal(lookupDictPrimary(wordDict, '未知'), '');
  });

  it('accepts a plain object as a dict-shaped map', () => {
    const dictObj = { 火: { definitions: [{ en: 'fire', primary: true }] } };
    assert.equal(lookupDictPrimary(dictObj, '火'), 'fire');
  });

  it('returns empty string for null/undefined dict', () => {
    assert.equal(lookupDictPrimary(null, '火'), '');
    assert.equal(lookupDictPrimary(undefined, '火'), '');
  });
});

describe('resolveExposureMeaning priority', () => {
  it('override beats entity beats token.meaning beats dict', () => {
    const token = { base: '茶', entity: true, meaning: 'Chachamaru' };
    assert.equal(
      resolveExposureMeaning(token, wordDict, { 茶: 'tea (override)' }),
      'tea (override)'
    );
  });

  it('entity wins over dict when no override', () => {
    const token = { base: '茶', entity: true, meaning: 'Chachamaru' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'Chachamaru');
  });

  it('entity without meaning falls through to dict', () => {
    const token = { base: '茶', entity: true };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'tea');
  });

  it('token.meaning (no entity flag) is honored before dict', () => {
    const token = { base: '茶', meaning: 'server-enriched tea' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'server-enriched tea');
  });

  it('dict primary is used when token carries no meaning', () => {
    const token = { base: '遊ぶ' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'to play');
  });

  it('returns empty string when nothing resolves', () => {
    const token = { base: '未知' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), '');
  });

  it('returns empty string when token has no base form', () => {
    assert.equal(resolveExposureMeaning({}, wordDict, {}), '');
  });
});

describe('extractExposureEntries', () => {
  it('extracts one exposure per qualifying content token', () => {
    const tokens = [
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '一緒', base: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [
        { word: '遊ぶ', meaning: 'to play' },
        { word: '一緒', meaning: 'togetherness' },
      ]
    );
  });

  it('honors token.meaning (server-enriched) over dict', () => {
    const tokens = [
      { surface: '犬', base: '犬', pos: '名詞', meaning: 'puppy (enriched)' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [{ word: '犬', meaning: 'puppy (enriched)' }]
    );
  });

  it('override beats token.meaning and dict', () => {
    const tokens = [
      { surface: '犬', base: '犬', pos: '名詞', meaning: 'puppy (enriched)' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, { 犬: 'pup (context)' }),
      [{ word: '犬', meaning: 'pup (context)' }]
    );
  });

  it('skips tokens with no base or baseForm', () => {
    const tokens = [
      { surface: 'を' },
      { surface: '！', pos: '補助記号' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [{ word: '遊ぶ', meaning: 'to play' }]
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:unit -- --grep "lookupDictPrimary|resolveExposureMeaning priority|extractExposureEntries"`

Expected: `lookupDictPrimary` import fails and several assertions fail (the priority tests test new behavior).

- [ ] **Step 3: Update `public/js/shared/exposure-extractor.js`**

Replace the file's exported functions (keep `SYMBOL_ONLY_RE`, `PUNCT_POS`, `getDictEntry`, `getTokenBaseForm`, `isContentExposureToken` unchanged) with:

```js
const SYMBOL_ONLY_RE = /^[\p{P}\p{S}\s]+$/u;

export const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

function getDictEntry(wordDict, baseForm) {
  if (!wordDict || !baseForm) return null;
  if (typeof wordDict.get === 'function') {
    return wordDict.get(baseForm) || null;
  }
  return wordDict[baseForm] || null;
}

export function getTokenBaseForm(token) {
  return token?.base || token?.baseForm || '';
}

export function isContentExposureToken(token) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return false;

  const surface = token?.surface || '';
  if (SYMBOL_ONLY_RE.test(surface)) return false;

  return !PUNCT_POS.has(token?.pos);
}

export function lookupDictPrimary(wordDict, baseForm) {
  const entry = getDictEntry(wordDict, baseForm);
  if (!entry?.definitions?.length) return '';
  const primary = entry.definitions.find(d => d.primary);
  return primary?.en || entry.definitions[0]?.en || '';
}

export function resolveExposureMeaning(token, wordDict, overrides = {}) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return '';
  if (overrides?.[baseForm]) return overrides[baseForm];
  if (token?.entity && token?.meaning) return token.meaning;
  if (token?.meaning) return token.meaning;
  return lookupDictPrimary(wordDict, baseForm);
}

export function extractExposureEntries(tokens, wordDict, overrides = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  return tokens
    .filter(isContentExposureToken)
    .map(token => ({
      word: getTokenBaseForm(token),
      meaning: resolveExposureMeaning(token, wordDict, overrides),
    }));
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:unit -- --grep "lookupDictPrimary|resolveExposureMeaning priority|extractExposureEntries"`

Expected: all pass.

- [ ] **Step 5: Run full unit suite to catch regressions**

Run: `npm run test:unit`

Expected: all pass (other callers of `resolveExposureMeaning` may have picked up new behavior — investigate any failures before proceeding).

- [ ] **Step 6: Commit**

```bash
git add public/js/shared/exposure-extractor.js tests/unit/exposure-extractor.test.js
git commit -m "feat(exposure): add lookupDictPrimary and fix resolve priority to override→entity→token.meaning→dict"
```

---

### Task 2: Consolidate `word-knowledge.js` inline lookups

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js:33-58`
- Verify: `tests/unit/hydrate-card.test.js` still passes

- [ ] **Step 1: Run existing hydrate-card tests as a before-baseline**

Run: `npm run test:unit -- --grep hydrateCard`

Expected: all pass (they're unchanged behavior).

- [ ] **Step 2: Rewrite the two lookup functions**

In `src/game/bootstrap/word-knowledge.js`, add at the top of the import block:

```js
import { lookupDictPrimary } from '../../../public/js/shared/exposure-extractor.js';
```

Replace lines 33-58 (both `lookupMeaning` and `lookupMeaningFrom` bodies) with:

```js
/**
 * Look up the primary English meaning for a Japanese word from the singleton dict.
 */
export function lookupMeaning(baseForm) {
  return lookupDictPrimary(getWordDict(), baseForm);
}

/**
 * Look up the hiragana reading for a Japanese word.
 * @param {string} baseForm
 * @returns {string} Hiragana reading, or the word itself if not found
 */
export function lookupReading(baseForm) {
  const dict = getWordDict();
  const entry = dict.get(baseForm);
  return entry?.reading || baseForm;
}

/** Look up primary English meaning from a given dict Map. */
export function lookupMeaningFrom(dict, baseForm) {
  return lookupDictPrimary(dict, baseForm);
}

/** Look up hiragana reading from a given dict Map. */
export function lookupReadingFrom(dict, baseForm) {
  const entry = dict.get(baseForm);
  return entry?.reading || baseForm;
}
```

- [ ] **Step 3: Run hydrate-card tests, verify they still pass**

Run: `npm run test:unit -- --grep hydrateCard`

Expected: all pass.

- [ ] **Step 4: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js
git commit -m "refactor(word-knowledge): delegate primary-def lookup to shared lookupDictPrimary"
```

---

### Task 3: Consolidate admin-route inline lookups

**Files:**
- Modify: `src/routes/admin-word-exposures.js:68-70`
- Modify: `src/routes/admin.js:225-227`
- Verify: `tests/unit/admin-word-exposures.test.js` and `tests/unit/admin-routes.test.js`

- [ ] **Step 1: Run existing admin tests as baseline**

Run: `npm run test:unit -- --grep "admin-word-exposures|admin-routes"`

Expected: current pass/fail state (note it — we don't expect behavior changes).

- [ ] **Step 2: Update `admin-word-exposures.js`**

Add import near the top:

```js
import { lookupDictPrimary } from '../../public/js/shared/exposure-extractor.js';
```

Replace lines 67-75 (read the file first to get the surrounding context right). Change this block:

```js
    const entry = dictionary.get(word);
    const primaryDef = entry?.definitions?.find(d => d.primary) || entry?.definitions?.[0];
    const jmEntry = jmdict ? jmdict[word] : null;
    const jmPrimary = jmEntry?.definitions?.find(d => d.primary) || jmEntry?.definitions?.[0];
    words.push({
      word,
      reading: entry?.reading || null,
      definition: primaryDef?.en || null,
      jmdictDefinition: jmPrimary?.en || null,
```

To:

```js
    const entry = dictionary.get(word);
    const definition = lookupDictPrimary(dictionary, word) || null;
    const jmdictDefinition = jmdict ? (lookupDictPrimary(jmdict, word) || null) : null;
    words.push({
      word,
      reading: entry?.reading || null,
      definition,
      jmdictDefinition,
```

- [ ] **Step 3: Update `admin.js`**

Add import near the top:

```js
import { lookupDictPrimary } from '../../public/js/shared/exposure-extractor.js';
```

Replace lines 225-227 (read the file to confirm surrounding context). Change this block:

```js
        const entry = dict.get(word);
        const primaryDef = entry?.definitions?.find(d => d.primary);
        const meaning = primaryDef?.en || entry?.definitions?.[0]?.en || '';
```

To:

```js
        const entry = dict.get(word);
        const meaning = lookupDictPrimary(dict, word);
```

- [ ] **Step 4: Run admin tests**

Run: `npm run test:unit -- --grep "admin-word-exposures|admin-routes"`

Expected: same pass/fail as baseline (no behavior changes).

- [ ] **Step 5: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin-word-exposures.js src/routes/admin.js
git commit -m "refactor(admin): delegate primary-def lookup to shared lookupDictPrimary"
```

---

## Phase 2 — Enrichment helper

### Task 4: Export the singleton dict accessor

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js:13-26`

- [ ] **Step 1: Export `getWordDict` alongside `invalidateWordDict`**

Change `function getWordDict()` at line 13 to `export function getWordDict()`. `invalidateWordDict` is already exported — leave it. No other call-site changes: internal callers inside the same file keep working.

- [ ] **Step 2: Run full unit suite to confirm nothing broke**

Run: `npm run test:unit`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js
git commit -m "refactor(word-knowledge): export getWordDict singleton accessor"
```

---

### Task 5: Add `enrichTokens` helper

**Files:**
- Create: `src/game/enrich-tokens.js`
- Create: `tests/unit/enrich-tokens.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/enrich-tokens.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTokens } from '../../src/game/enrich-tokens.js';

const dict = new Map([
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }, { en: 'hound' }] }],
  ['茶', { reading: 'ちゃ', definitions: [{ en: 'tea', primary: true }] }],
]);

describe('enrichTokens', () => {
  it('stamps .meaning on each content token via the priority chain', () => {
    const tokens = [
      { surface: '遊ぶ', base: '遊ぶ', reading: 'あそぶ', pos: '動詞' },
      { surface: '！', pos: '記号' },
    ];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'to play');
    assert.equal(out[1].meaning, undefined, 'punctuation untouched');
  });

  it('stamps .meanings (full definitions) on content tokens with a dict entry', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.deepEqual(out[0].meanings, [{ en: 'dog', primary: true }, { en: 'hound' }]);
  });

  it('omits .meanings when no dict entry exists', () => {
    const tokens = [{ surface: 'XYZ', base: 'XYZ', reading: 'XYZ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, '');
    assert.equal('meanings' in out[0], false);
  });

  it('honors overrides over dict', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const out = enrichTokens(tokens, { 犬: 'pup (context)' }, dict);
    assert.equal(out[0].meaning, 'pup (context)');
  });

  it('preserves entity.meaning over dict', () => {
    const tokens = [
      { surface: '茶', base: '茶', reading: 'ちゃ', meaning: 'Chachamaru', entity: true },
    ];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'Chachamaru');
  });

  it('does not mutate the input tokens', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const frozen = tokens.map(t => Object.freeze({ ...t }));
    enrichTokens(frozen, {}, dict);
    assert.equal(frozen[0].meaning, undefined);
  });

  it('returns non-array input unchanged', () => {
    assert.equal(enrichTokens(null, {}, dict), null);
    assert.equal(enrichTokens(undefined, {}, dict), undefined);
  });

  it('tolerates an undefined dict (meaning stays from token.meaning or empty)', () => {
    const tokens = [
      { surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' },
      { surface: '茶', base: '茶', reading: 'ちゃ', meaning: 'Tea-mon', entity: true },
    ];
    const out = enrichTokens(tokens, {}, undefined);
    assert.equal(out[0].meaning, '');
    assert.equal(out[1].meaning, 'Tea-mon');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:unit -- --grep enrichTokens`

Expected: FAIL — `src/game/enrich-tokens.js` does not exist.

- [ ] **Step 3: Create `src/game/enrich-tokens.js`**

```js
import {
  isContentExposureToken,
  getTokenBaseForm,
  resolveExposureMeaning,
} from '../../public/js/shared/exposure-extractor.js';

function getDictEntry(dict, baseForm) {
  if (!dict || !baseForm) return null;
  if (typeof dict.get === 'function') return dict.get(baseForm) || null;
  return dict[baseForm] || null;
}

/**
 * Stamp `meaning` (and `meanings` when dict has an entry) on every content token,
 * resolved via the shared override → entity → token.meaning → dict priority.
 *
 * @param {Array} tokens
 * @param {Object<string,string>} overrides
 * @param {Map|Object} dict
 * @returns {Array} new token array (input is not mutated)
 */
export function enrichTokens(tokens, overrides, dict) {
  if (!Array.isArray(tokens)) return tokens;
  return tokens.map(token => {
    if (!isContentExposureToken(token)) return token;
    const meaning = resolveExposureMeaning(token, dict, overrides);
    const entry = getDictEntry(dict, getTokenBaseForm(token));
    const meanings = entry?.definitions || null;
    const next = { ...token, meaning };
    if (meanings) next.meanings = meanings;
    return next;
  });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:unit -- --grep enrichTokens`

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/enrich-tokens.js tests/unit/enrich-tokens.test.js
git commit -m "feat(server): add enrichTokens helper — stamps meaning and meanings via shared priority"
```

---

## Phase 3 — Wire enrichment into server token-producers

### Task 6: Enrich frame-assembly helpers in `token-format.js`

**Files:**
- Modify: `src/game/token-format.js`
- Modify: `tests/unit/` (any `token-format` tests — grep before editing)

Three helpers here return `{tokens, ...}` and are used by 6 of 9 server token-producing sites: `assembleFrame`, `getEligibleFrameTokens`, `selectBestFrame`. We enrich at each helper's exit so every caller gets enriched tokens automatically.

- [ ] **Step 1: Find existing token-format tests**

Run: `grep -rln "token-format\|assembleFrame\|getEligibleFrameTokens\|selectBestFrame" tests/`

Note any files; you'll need to re-run them as a regression check.

- [ ] **Step 2: Add an enrichment test**

Create `tests/unit/token-format-enrichment.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleFrame,
  getEligibleFrameTokens,
  selectBestFrame,
} from '../../src/game/token-format.js';

const dict = new Map([
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }],
]);

describe('token-format enrichment', () => {
  it('assembleFrame stamps meaning on non-entity tokens when dict is supplied', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
    };
    const out = assembleFrame(frame, {}, { dict });
    assert.equal(out.tokens[0].meaning, 'dog');
  });

  it('assembleFrame preserves entity.meaning from spliced entities', () => {
    const frame = {
      tokens: [{ slot: 'creature' }],
      words: [],
    };
    const entities = { creature: { baseWord: '犬', baseReading: 'いぬ', baseMeaning: 'Pup-mon' } };
    const out = assembleFrame(frame, entities, { dict });
    assert.equal(out.tokens[0].meaning, 'Pup-mon');
    assert.equal(out.tokens[0].entity, true);
  });

  it('assembleFrame leaves tokens unmeaning when dict is omitted', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
    };
    const out = assembleFrame(frame, {});
    assert.equal(out.tokens[0].meaning, undefined);
  });

  it('getEligibleFrameTokens passes overrides through to enrichment', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
      overrides: { 犬: 'pup' },
    };
    const known = new Set(['犬']);
    const out = getEligibleFrameTokens(frame, known, { dict });
    assert.equal(out.tokens[0].meaning, 'pup');
  });

  it('selectBestFrame enriches the winning candidate', () => {
    const candidates = [
      { tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }] },
    ];
    const known = new Set(['犬']);
    const best = selectBestFrame(candidates, known, { dict });
    assert.equal(best.tokens[0].meaning, 'dog');
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm run test:unit -- --grep "token-format enrichment"`

Expected: FAIL — helpers don't accept a `dict` option yet.

- [ ] **Step 4: Update `src/game/token-format.js`**

Add to the import block at the top:

```js
import { enrichTokens } from './enrich-tokens.js';
```

Modify `assembleFrame` (at lines 17-36) to accept `{dict}` and enrich:

```js
export function assembleFrame(frame, entities, { dict } = {}) {
  const tokens = [];
  const extraWords = [];
  for (const token of frame.tokens) {
    if (token.slot && entities[token.slot]) {
      const entityToken = entityToToken(entities[token.slot]);
      tokens.push(entityToken);
      extraWords.push(entityToken.base);
    } else if (token.slot) {
      continue;
    } else {
      tokens.push(token);
    }
  }
  const overrides = frame.overrides && Object.keys(frame.overrides).length > 0
    ? frame.overrides
    : {};
  const enriched = dict ? enrichTokens(tokens, overrides, dict) : tokens;
  const result = { tokens: enriched, words: [...frame.words, ...extraWords] };
  if (Object.keys(overrides).length > 0) result.overrides = overrides;
  return result;
}
```

Modify `getEligibleFrameTokens` (lines 98-106) to accept `{dict}` and enrich:

```js
export function getEligibleFrameTokens(frame, knownWords, { dict } = {}) {
  if (!frame?.tokens?.length) return null;
  const chosen = filterEligible([frame], knownWords)[0];
  const overrides = chosen.overrides && Object.keys(chosen.overrides).length > 0
    ? chosen.overrides
    : {};
  const rawTokens = [...chosen.tokens];
  const enriched = dict ? enrichTokens(rawTokens, overrides, dict) : rawTokens;
  const result = { tokens: enriched };
  if (Object.keys(overrides).length > 0) result.overrides = overrides;
  return result;
}
```

Modify `selectBestFrame` (lines 135-153) to accept `{dict}` and enrich the winning candidate:

```js
export function selectBestFrame(candidates, knownWords, { randomizeTies = false, dict } = {}) {
  if (!candidates.length) return null;
  const eligible = filterEligible(candidates, knownWords);

  let winner;
  if (randomizeTies) {
    const scored = eligible.map(c => ({
      c,
      score: scoreCandidate(c.tokens, knownWords),
    }));
    const bestScore = Math.max(...scored.map(s => s.score));
    const topTier = scored.filter(s => s.score === bestScore);
    winner = topTier[Math.floor(Math.random() * topTier.length)].c;
  } else {
    eligible.sort(
      (a, b) => scoreCandidate(b.tokens, knownWords) - scoreCandidate(a.tokens, knownWords)
    );
    winner = eligible[0];
  }

  if (!dict || !winner) return winner;
  const overrides = winner.overrides && Object.keys(winner.overrides).length > 0
    ? winner.overrides
    : {};
  return { ...winner, tokens: enrichTokens(winner.tokens, overrides, dict) };
}
```

- [ ] **Step 5: Run new enrichment tests, verify they pass**

Run: `npm run test:unit -- --grep "token-format enrichment"`

Expected: all 5 pass.

- [ ] **Step 6: Run full unit suite to catch regressions**

Run: `npm run test:unit`

Expected: all pass. If any existing token-format tests call `assembleFrame`/`selectBestFrame` without a dict, they keep working (the `dict` option is purely additive).

- [ ] **Step 7: Wire the singleton dict into route call sites**

The helpers now accept `{dict}`; route handlers must pass it. Update these callers — read the file around the line, add a `dict` option to the existing call. Pass `getWordDict()` imported from `src/game/bootstrap/word-knowledge.js`.

Call sites to update:
- `src/routes/game/run.js` — any call to `assembleFrame`, `getEligibleFrameTokens`, `selectBestFrame` (greps `grep -n "assembleFrame\|getEligibleFrameTokens\|selectBestFrame" src/routes/game/run.js` first).
- `src/routes/game/combat.js` — same grep.
- `src/routes/game/misc.js` — same grep.
- `src/game/dialogue-loader.js` — if it calls any internally.
- Any other `src/routes/**` file a grep surfaces.

For each file:
1. Add `import { getWordDict } from '../../game/bootstrap/word-knowledge.js';` (adjust relative path).
2. At each call, add `{ dict: getWordDict() }` — merging with any existing options. Example: `selectBestFrame(pool, known, { randomizeTies: true, dict: getWordDict() })`.

Run `grep -rn "assembleFrame\|getEligibleFrameTokens\|selectBestFrame" src/routes/ src/game/` and handle every match not under `tests/`.

- [ ] **Step 8: Run full test suite**

Run: `npm test`

Expected: all pass. Any integration tests that build tokens through these helpers now see enriched tokens.

- [ ] **Step 9: Commit**

```bash
git add src/game/token-format.js tests/unit/token-format-enrichment.test.js src/routes/game/*.js src/game/dialogue-loader.js
git commit -m "feat(token-format): enrich tokens in assembleFrame/getEligibleFrameTokens/selectBestFrame when dict provided"
```

---

### Task 7: Enrich `selectNpcLine` and `selectBark` in `dialogue-filter.js`

**Files:**
- Modify: `src/game/dialogue-filter.js:41-71`
- Modify: `tests/unit/dialogue-filter.test.js`

Both `selectNpcLine` (lines 41-52) and `selectBark` (lines 54-71) return a single line object from a pool. Both are consumed by `renderJpSentence` downstream (NPC dialogue and combat barks / speech bubbles respectively). Both need enrichment.

- [ ] **Step 1: Add enrichment tests**

Append to `tests/unit/dialogue-filter.test.js`:

```js
import { selectNpcLine, selectBark } from '../../src/game/dialogue-filter.js';

describe('dialogue-filter enrichment', () => {
  const dict = new Map([
    ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }],
  ]);

  it('selectNpcLine stamps meaning on the chosen line when dict supplied', () => {
    const lines = [
      { tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }], words: ['犬'], raw: '犬' },
    ];
    const chosen = selectNpcLine(lines, new Set(['犬']), { dict });
    assert.equal(chosen.tokens[0].meaning, 'dog');
  });

  it('selectNpcLine returns raw line when dict omitted (backward-compatible)', () => {
    const lines = [
      { tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }], words: ['犬'], raw: '犬' },
    ];
    const chosen = selectNpcLine(lines, new Set(['犬']));
    assert.equal(chosen.tokens[0].meaning, undefined);
  });

  it('selectBark stamps meaning on the chosen bark when dict supplied', () => {
    const barkPool = {
      onHit: [
        { tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }], words: ['犬'], raw: '犬' },
      ],
    };
    const chosen = selectBark(barkPool, 'onHit', new Set(['犬']), { dict });
    assert.equal(chosen.tokens[0].meaning, 'dog');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:unit -- --grep "dialogue-filter enrichment"`

Expected: FAIL — `dict` option not supported yet.

- [ ] **Step 3: Update `src/game/dialogue-filter.js`**

Add to the import block at the top:

```js
import { enrichTokens } from './enrich-tokens.js';
```

Add a private helper at the top of the file, below the imports:

```js
function maybeEnrich(line, dict) {
  if (!line || !dict) return line;
  const overrides = line.overrides && Object.keys(line.overrides).length > 0
    ? line.overrides
    : {};
  return { ...line, tokens: enrichTokens(line.tokens, overrides, dict) };
}
```

Replace `selectNpcLine` (lines 41-52) with:

```js
export function selectNpcLine(lines, knownWords, options = {}) {
  const { lastSeenText, curriculumWords = [], dict } = options;
  const eligible = filterEligible(lines, knownWords);
  const curriculumSet = new Set(curriculumWords);
  const teaching = eligible.filter(line =>
    (line.tokens || []).filter(t => t.base).some(t => !knownWords.has(t.base) && curriculumSet.has(t.base))
  );
  const pool = teaching.length > 0 ? teaching : eligible;
  const nonRepeat = pool.filter(l => l.raw !== lastSeenText);
  const finalPool = nonRepeat.length > 0 ? nonRepeat : pool;
  const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];
  return maybeEnrich(chosen, dict);
}
```

Replace `selectBark` (lines 54-71) with:

```js
export function selectBark(barkPool, trigger, knownWords, options = {}) {
  const { usedThisCombat = new Set(), dict } = options;
  const pool = barkPool[trigger];
  if (!pool || pool.length === 0) return null;
  const eligible = filterEligible(pool, knownWords);
  const getContentTokens = (line) => (line.tokens || []).filter(t => t.base);
  const reinforcement = eligible.filter(line =>
    getContentTokens(line).every(t => knownWords.has(t.base))
  );
  const teachable = eligible.filter(line =>
    getContentTokens(line).some(t => !knownWords.has(t.base))
  );
  const useTeaching = teachable.length > 0 && Math.random() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);
  const nonRepeat = selectedPool.filter(l => !usedThisCombat.has(l.raw));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;
  const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];
  return maybeEnrich(chosen, dict);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm run test:unit -- --grep "dialogue-filter enrichment"`

Expected: all 3 pass.

- [ ] **Step 5: Update route callers to pass `dict`**

Run: `grep -rn "selectNpcLine\|selectBark" src/routes/ src/game/`

For each match, add `dict: getWordDict()` to the options object (importing `getWordDict` from `../../game/bootstrap/word-knowledge.js` if not already imported). Example:

```js
// Before
selectBark(barkPool, 'onHit', knownSet, { usedThisCombat: used })
// After
selectBark(barkPool, 'onHit', knownSet, { usedThisCombat: used, dict: getWordDict() })
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/dialogue-filter.js tests/unit/dialogue-filter.test.js src/routes/ src/game/
git commit -m "feat(dialogue-filter): enrich selectNpcLine and selectBark tokens when dict provided"
```

---

### Task 8: Enrich `POST /parse-text` in `known-words.js`

**Files:**
- Modify: `src/routes/game/known-words.js:141-170` (the `parse-text` handler)
- Modify: `tests/unit/routes/` (if a parse-text test exists — grep first)

- [ ] **Step 1: Read the current handler**

Read `src/routes/game/known-words.js` lines 140-170 to understand the current shape.

- [ ] **Step 2: Update the handler to enrich**

Add to imports at the top:

```js
import { enrichTokens } from '../../game/enrich-tokens.js';
```

In the handler body, after `const enriched = tokens.map(...)`, replace `res.json({ tokens: enriched })` with:

```js
const final = enrichTokens(enriched, {}, dict);
res.json({ tokens: final });
```

(The handler already has `const dict = getWordDict();` — reuse it. If the variable has a different name, use whichever one is already bound.)

- [ ] **Step 3: Manual smoke check**

Run: `npm start` in a second terminal; in the first, `curl -X POST http://localhost:3000/api/game/known-words/parse-text -H "Content-Type: application/json" -d '{"text":"犬が遊ぶ。"}' -H "Authorization: Bearer <token>"`

Expected: response tokens include `meaning` and (for in-dict words) `meanings` fields.

Stop the server when done.

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/known-words.js
git commit -m "feat(parse-text): enrich tokens before response"
```

---

### Task 9: Enrich prologue scenes in `misc.js`

**Files:**
- Modify: `src/routes/game/misc.js:302-316`

- [ ] **Step 1: Read the handler**

Read `src/routes/game/misc.js` lines 295-320 to confirm the shape of the scenes response and where tokens are assembled.

- [ ] **Step 2: Wrap token arrays with `enrichTokens` before responding**

Add to imports:

```js
import { enrichTokens } from '../../game/enrich-tokens.js';
import { getWordDict } from '../../game/bootstrap/word-knowledge.js';
```

Find each scene's `tokens` array in the response construction and replace with `enrichTokens(scene.tokens, scene.overrides || {}, getWordDict())`. If scenes are mapped via an array:

```js
const dict = getWordDict();
const scenes = rawScenes.map(s => ({
  ...s,
  tokens: enrichTokens(s.tokens, s.overrides || {}, dict),
}));
```

- [ ] **Step 3: Manual smoke check**

Run the game locally; start a new prologue; open devtools; inspect the `GET /api/game/misc/prologue` response and confirm scene tokens have `meaning` fields.

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/misc.js
git commit -m "feat(prologue): enrich jpDemo scene tokens before response"
```

---

### Task 10: Audit all 9 token-producing endpoints

**Files:**
- Read-only audit across: `src/routes/game/run.js`, `src/routes/game/combat.js`, `src/routes/game/misc.js`, `src/routes/game/known-words.js`

- [ ] **Step 1: Enumerate every `tokens:` response field**

Run: `grep -rn "tokens\s*[:]" src/routes/ | grep -v node_modules | grep -v ".test.js"`

For each line, confirm the tokens were produced by one of the enriched helpers (`assembleFrame`, `getEligibleFrameTokens`, `selectBestFrame`, `selectNpcLine`, `enrichTokens` directly, or a helper that itself returns enriched tokens).

Sites from the spec's enumeration to verify:
1. `src/routes/game/known-words.js:160` — parse-text → enriched in Task 8.
2. `src/routes/game/run.js:228` — skill-master-offers → uses `getEligibleFrameTokens` (enriched in Task 6).
3. `src/routes/game/run.js:273` — npc-battle-skill-offers → uses `getEligibleFrameTokens` (Task 6).
4. `src/routes/game/run.js:689-691` — whack-a-mole-complete → uses `selectBestFrame` (Task 6).
5. `src/routes/game/run.js:706-708` — whack-a-mole-dialogue → mixed (Task 6).
6. `src/routes/game/run.js:747-770` — friendly-npc-offers → uses `selectBestFrame` per shop item + greeting frame (Task 6).
7. `src/routes/game/combat.js:79-92` — start-creature-encounter → `selectNpcLine` (Task 7).
8. `src/routes/game/combat.js:513-527` — npc-dialogue-start → `selectBestFrame` (Task 6).
9. `src/routes/game/misc.js:302-316` — prologue scenes (Task 9).

- [ ] **Step 2: For any site that directly builds tokens without a helper, add an explicit `enrichTokens` call**

If Step 1 surfaces a site that doesn't flow through an enriched helper, wrap the tokens with `enrichTokens(tokens, overrides || {}, getWordDict())` before the `res.json(...)`.

- [ ] **Step 3: Add a dev-only log to catch misses**

In `public/js/ui/bootstrap-client.js:renderJpSentence`, add a one-line check (gated on a dev flag that is already present in the file, or unconditional if simpler) that warns when a content token is rendered without `.meaning` AND without a dict hit:

```js
// After `const meaning = resolveExposureMeaning(token, wordDict, overrides) || (token.entity ? token.meaning || '' : '');`
// (but before the block is deleted in Task 11 — this log survives into Task 11 inside the simplified form)
if (!meaning && !token.entity && typeof window !== 'undefined' && window.__DEV__) {
  console.warn('[renderJpSentence] unenriched content token:', token);
}
```

Skip this if the project already has a dev-flag pattern; otherwise omit the log and move on.

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 5: Commit if any files changed**

```bash
git add src/routes/
git commit -m "fix(token-producers): audit and cover any direct token-building routes with enrichTokens"
```

If no files changed, skip the commit.

---

## Phase 4 — Client simplification

### Task 11: Simplify `renderJpSentence` and stamp `data-meanings`

**Files:**
- Modify: `public/js/ui/bootstrap-client.js:78-128`
- Modify: `tests/unit/bootstrap-renderer.test.js` (if meaning tests exist) and/or `tests/unit/exposure-extractor.test.js`

- [ ] **Step 1: Run current renderer tests as baseline**

Run: `npm run test:unit -- --grep bootstrap-renderer`

Note pass/fail baseline.

- [ ] **Step 2: Add a rendering test that asserts `data-meanings` is emitted**

Append to `tests/unit/bootstrap-renderer.test.js` (or create if it doesn't exist):

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';

describe('renderJpSentence data-meanings', () => {
  it('emits data-meanings as JSON when the token carries .meanings', () => {
    const tokens = [{
      surface: '犬',
      base: '犬',
      reading: 'いぬ',
      pos: '名詞',
      meaning: 'dog',
      meanings: [{ en: 'dog', primary: true }, { en: 'hound' }],
    }];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.match(html, /data-meanings="[^"]*dog[^"]*hound[^"]*"/);
  });

  it('omits data-meanings when the token has no .meanings', () => {
    const tokens = [{
      surface: '犬',
      base: '犬',
      reading: 'いぬ',
      pos: '名詞',
      meaning: 'dog',
    }];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.doesNotMatch(html, /data-meanings=/);
  });

  it('reads meaning from pre-stamped token.meaning without consulting the dict', () => {
    const tokens = [{
      surface: '犬',
      base: '犬',
      reading: 'いぬ',
      pos: '名詞',
      meaning: 'pre-stamped',
    }];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.match(html, /data-meaning="pre-stamped"/);
    assert.match(html, /<span class="jp-stack-en">pre-stamped<\/span>/);
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npm run test:unit -- --grep "data-meanings"`

Expected: FAIL — `data-meanings` is not emitted yet.

- [ ] **Step 4: Update `renderJpSentence` in `public/js/ui/bootstrap-client.js`**

Replace the body of `renderJpSentence` (lines 78-128) with:

```js
export function renderJpSentence(tokens, knownWords, wordDict, overrides = {}, useKanji = false) {
  if (!tokens || tokens.length === 0) return '';

  recordExposure(tokens, wordDict, overrides);

  return tokens.map(token => {
    const { surface } = token;

    const baseForm = getTokenBaseForm(token);
    const reading = token.reading;

    if (!isContentExposureToken(token)) {
      return `<span class="jp-punct">${esc(surface)}</span>`;
    }

    const isKnown = knownWords.has(baseForm);
    const displayReading = reading || surface;

    const meaning = resolveExposureMeaning(token, wordDict, overrides);
    const isFromOverride = !!overrides?.[baseForm];

    const pos = token.pos || '';
    const meaningsJson = Array.isArray(token.meanings)
      ? JSON.stringify(token.meanings)
      : '';

    let dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;
    if (isFromOverride) dataAttrs += ' data-override="1"';
    if (meaningsJson) dataAttrs += ` data-meanings="${esc(meaningsJson)}"`;

    if (isKnown) {
      const display = useKanji ? surface : displayReading;
      return `<span class="jp-word jp-known"${dataAttrs}>`
        + `<ruby>${esc(display)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
        + `</span>`;
    }

    const typeClass = token.entity ? 'jp-entity' : 'jp-unknown';
    const firstSense = meaning.split('/')[0].trim();
    const parenIdx = firstSense.indexOf('(');
    const primaryEn = parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
    return `<span class="jp-word ${typeClass}"${dataAttrs}>`
      + `<ruby>${esc(displayReading)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
      + `<span class="jp-stack-en">${esc(primaryEn)}</span>`
      + `</span>`;
  }).join('');
}
```

Ensure `resolveExposureMeaning`, `isContentExposureToken`, and `getTokenBaseForm` are imported from `../shared/exposure-extractor.js` at the top of the file (they already are — verify).

- [ ] **Step 5: Run new tests, verify pass**

Run: `npm run test:unit -- --grep "data-meanings"`

Expected: all 3 pass.

- [ ] **Step 6: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass. Entity tokens still render their `meaning` correctly because `resolveExposureMeaning` now honors `token.meaning` natively.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/bootstrap-client.js tests/unit/bootstrap-renderer.test.js
git commit -m "feat(render): stamp data-meanings and drop entity inline fallback in renderJpSentence"
```

---

### Task 12: Remove `_wordDict`/`setWordDictionary` from `dialogue-display.js`

**Files:**
- Modify: `public/js/ui/dialogue-display.js`

- [ ] **Step 1: Rewrite the file**

Replace the file contents with:

```js
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';

/**
 * Display a sequence of dialogue lines in the narration box.
 * Tokens are pre-enriched by the server — each content token carries
 * `meaning` and optionally `meanings`.
 *
 * @param {Array<{text: string, tokens: Array, overrides?: Object}>} lines
 * @param {Object} options
 * @param {string|Object} [options.speaker]
 * @param {boolean} [options.useKanji]
 */
export async function showDialogueLines(lines, options = {}) {
  const { speaker, useKanji = false } = options;
  const knownWords = getKnownWords();

  for (const line of lines) {
    const html = renderJpSentence(
      line.tokens,
      knownWords,
      null,
      line.overrides || {},
      useKanji
    );
    await narrationBox.show(html, { speaker, html: true });
  }
}
```

- [ ] **Step 2: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass. `setWordDictionary` was never imported anywhere, so removing it breaks nothing.

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/dialogue-display.js
git commit -m "refactor(dialogue-display): drop orphan _wordDict state; tokens arrive enriched"
```

---

### Task 13: Update `dialogue-word-lookup.js` to read `data-meanings`

**Files:**
- Modify: `public/js/ui/dialogue-word-lookup.js:20-165`
- Modify: `tests/unit/dialogue-word-lookup.test.js` (should still pass — `buildPopupMeanings` signature unchanged)

- [ ] **Step 1: Run existing popup tests as baseline**

Run: `npm run test:unit -- --grep buildPopupMeanings`

Expected: all pass (current state).

- [ ] **Step 2: Update the popup to parse `data-meanings` and drop `_wordDict`**

In `public/js/ui/dialogue-word-lookup.js`:

Remove line 20: `let _wordDict = null;`

Remove the `wordDictionary` parameter from `init({...})` at line 60 and the `_wordDict = wordDictionary;` assignment at line 61. New signature:

```js
export function init({ showToast, pauseAutoDismiss, getKanaMode }) {
```

In `handleWordClick` at line 126, replace the dict-entry lookup + `buildPopupMeanings` call (currently lines 151-158):

```js
  dom.meanings.innerHTML = '';
  const dictEntry = _wordDict?.get(base) || null;
  const meanings = buildPopupMeanings({
    dataMeaning: meaning,
    dataOverride: span.dataset.override || null,
    dictEntry,
  });
```

With:

```js
  dom.meanings.innerHTML = '';
  let dictEntry = null;
  if (span.dataset.meanings) {
    try {
      dictEntry = { definitions: JSON.parse(span.dataset.meanings) };
    } catch {
      dictEntry = null;
    }
  }
  const meanings = buildPopupMeanings({
    dataMeaning: meaning,
    dataOverride: span.dataset.override || null,
    dictEntry,
  });
```

`buildPopupMeanings` itself is unchanged — its signature still takes `dictEntry` with a `definitions` array.

- [ ] **Step 3: Run popup tests**

Run: `npm run test:unit -- --grep buildPopupMeanings`

Expected: all pass unchanged.

- [ ] **Step 4: Update the `dialogueLookup.init(...)` call in `public/game.js:2113`**

Remove the `wordDictionary: ...` line from the options object. New form:

```js
dialogueLookup.init({
  showToast: (msg) => scene.showToast(msg, 3000),
  pauseAutoDismiss: narrationBox.pauseAutoDismiss,
  getKanaMode: () => gameState.meta?.kanaMode ?? false,
});
```

- [ ] **Step 5: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/dialogue-word-lookup.js public/game.js
git commit -m "refactor(popup): read data-meanings from span, drop client-side dict dependency"
```

---

## Phase 5 — Remove dead code

### Task 14: Remove the word-dictionary endpoint + bootstrap fetch

**Files:**
- Modify: `src/routes/game/known-words.js:118-133`
- Modify: `public/game.js:775-786` and `:2093-2118`

- [ ] **Step 1: Remove the route handler**

Delete lines 118-133 (the `GET /word-dictionary` handler) from `src/routes/game/known-words.js`. Adjust surrounding blank lines.

- [ ] **Step 2: Remove the client fetch**

In `public/game.js`, delete lines 775-786 (the `try { ... } catch` block that fetches the dictionary and assigns it to `window.gameState.wordDictionary`).

- [ ] **Step 3: Remove `wordDictionary` from `gameState` initializer**

In `public/game.js` near line 204 (the `let gameState = { ... }` declaration), find any `wordDictionary` field and remove it. If no such field exists explicitly, skip.

- [ ] **Step 4: Remove any other reads of `window.gameState.wordDictionary` / `gameState.wordDictionary`**

Run: `grep -n "wordDictionary" public/`

For each remaining match in client JS that still reads `window.gameState.wordDictionary` (e.g., exploration.js calls at 969, 1044, 1363, 1456, 1461, and prologue at game.js:857): replace the `new Map(Object.entries(window.gameState?.wordDictionary || {}))` construction with `null` (since `renderJpSentence` no longer consults the dict).

Example: `public/js/ui/exploration.js:969`:

```js
// Before
const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
// After — tokens arrive enriched
const wordDict = null;
```

Repeat for every match. Alternative for clarity: inline `null` directly at the `renderJpSentence` call and delete the local `const wordDict` entirely.

- [ ] **Step 5: Run full unit suite**

Run: `npm run test:unit`

Expected: all pass.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 7: Manual smoke check**

Start dev server (`npm run dev`), log in, play through:
1. Prologue — confirm jpDemo scenes render English glosses below unknown words.
2. Main dialogue (talk to an NPC or enter a shop) — confirm frame-dialogue words render glosses.
3. Click a word — confirm the popup shows "In this context:" (if override present) and the full dict definitions.

Stop the server when done.

- [ ] **Step 8: Commit**

```bash
git add src/routes/game/known-words.js public/game.js public/js/ui/exploration.js public/js/ui/
git commit -m "feat: remove client-side dict bootstrap and /word-dictionary endpoint"
```

---

## Phase 6 — Verification

### Task 15: Integration test — dict edit propagates live

**Files:**
- Create: `tests/integration/dict-edit-propagation.test.js`

- [ ] **Step 1: Write the integration test**

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/game/tokenize.js';
import { enrichTokens } from '../../src/game/enrich-tokens.js';
import { getWordDict, invalidateWordDict } from '../../src/game/bootstrap/word-knowledge.js';

describe('dict edit propagation', () => {
  after(() => invalidateWordDict());

  it('enrichTokens reflects the current dict primary definition', () => {
    const dict = new Map([
      ['雨', { reading: 'あめ', definitions: [{ en: 'rain', primary: true }] }],
    ]);
    const tokens = [{ surface: '雨', base: '雨', reading: 'あめ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'rain');
  });

  it('a subsequent dict with a changed primary yields the new meaning', () => {
    const tokens = [{ surface: '雨', base: '雨', reading: 'あめ', pos: '名詞' }];
    const newDict = new Map([
      ['雨', { reading: 'あめ', definitions: [{ en: 'precipitation', primary: true }] }],
    ]);
    const out = enrichTokens(tokens, {}, newDict);
    assert.equal(out[0].meaning, 'precipitation');
  });

  it('live-dict-only word (not in any frame) gets enriched', () => {
    const obscureDict = new Map([
      ['碑', { reading: 'ひ', definitions: [{ en: 'monument', primary: true }] }],
    ]);
    const tokens = [{ surface: '碑', base: '碑', reading: 'ひ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, obscureDict);
    assert.equal(out[0].meaning, 'monument');
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm run test:integration -- --grep "dict edit propagation"`

Expected: all 3 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/dict-edit-propagation.test.js
git commit -m "test(integration): dict edits propagate through enrichTokens without restart"
```

---

### Task 16: Manual playtest

**Files:** none

- [ ] **Step 1: Confirm CI-gate tests are green**

Run: `npm test`

Expected: all Tier 1 + Tier 2 tests pass.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`

Wait until Vite shows the local URL (5s). Verify with: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` → 200.

- [ ] **Step 3: Ask the user to playtest**

Ask the user (do not spin up Playwright without asking per CLAUDE.md) to:
1. Walk through a few dialogues (NPC greeting, shop, whack-a-mole prompt).
2. Confirm English glosses appear below unknown Japanese words.
3. Tap words to open the popup; confirm dict definitions appear for both frame and non-frame words.
4. If the admin dict-edit UI is accessible, change a definition (e.g., `雨` → "precipitation") and reload the dialogue; confirm the new gloss appears without a server restart.

- [ ] **Step 4: Stop the dev server when the user confirms**

Kill the `npm run dev` process.

- [ ] **Step 5: Merge the branch**

Per CLAUDE.md worktree workflow:

```bash
cd $(git rev-parse --show-toplevel)
git checkout master
git pull origin master
git merge feature/dict-lookup
git push origin master
git worktree remove ../koto-wt-dict-lookup
git branch -d feature/dict-lookup
```

---

## Self-Review checklist (run after plan is complete)

- [ ] Every spec requirement has a task (override-entity-dict priority; shared `resolveExposureMeaning`; single `lookupDictPrimary`; server-side `enrichTokens`; every server token-producer enriched; popup reads `data-meanings`; client dict endpoint + bootstrap removed; orphan `_wordDict` cleanup).
- [ ] No "TBD" / "TODO" / "as appropriate" placeholders.
- [ ] Function signatures match across tasks (`enrichTokens(tokens, overrides, dict)` everywhere; `lookupDictPrimary(dict, baseForm)` everywhere).
- [ ] Each task ends with a commit.
- [ ] Tests precede implementation where feasible.
