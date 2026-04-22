# Frame Meaning Overrides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live dictionary the single source of truth for meanings in static dialogue, with a per-frame `overrides` hook in `frame-sources.json` for rare context-specific glosses.

**Architecture:** Drop `meaning` field from tokens in `frames.json`. Pipe `overrides` through from `frame-sources.json` → `frames.json` → `assembleFrame` → `renderJpSentence` → DOM (`data-override="1"`) → popup (augment behavior). Reuse the existing-but-unused `overrides` parameter throughout the render chain.

**Tech Stack:** Node.js ESM, Express, Sudachi tokenizer, `node:test` for unit tests, vanilla JS frontend.

**Spec:** `docs/superpowers/specs/2026-04-22-frame-meaning-overrides-design.md`

---

## Task 1: Drop `token.meaning` from the meaning-resolution priority

**Files:**
- Modify: `public/js/shared/exposure-extractor.js:27-37`
- Test: `tests/unit/exposure-extractor.test.js:28-43`

- [ ] **Step 1: Update the existing priority test to assert the new order**

Replace the existing test at `tests/unit/exposure-extractor.test.js:28-43`:

```javascript
  it('resolves meaning from override, then dictionary, then empty string', () => {
    const tokens = [
      { surface: '猫', base: '猫', pos: '名詞', meaning: 'stale baked meaning for cat' },
      { surface: '犬', baseForm: '犬', pos: '名詞' },
      { surface: '鳥', base: '鳥', pos: '名詞' },
    ];

    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, { 犬: 'dog from override' }),
      [
        { word: '猫', meaning: '' },
        { word: '犬', meaning: 'dog from override' },
        { word: '鳥', meaning: '' },
      ]
    );
  });

  it('override beats a live-dict entry', () => {
    const tokens = [
      { surface: '犬', base: '犬', pos: '名詞' },
    ];

    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, { 犬: 'pup (context)' }),
      [{ word: '犬', meaning: 'pup (context)' }]
    );
  });
```

Rationale: `token.meaning` is no longer consulted. `猫` has no override and no dict entry so it resolves to `''`. `犬` has an override that wins over the dict's "dog" entry.

- [ ] **Step 2: Run the test to verify it fails against the current implementation**

Run: `npm run test:unit -- --test-name-pattern="resolves meaning"`
Expected: FAIL — `猫` currently resolves to `'stale baked meaning for cat'` because `token.meaning` still has priority.

- [ ] **Step 3: Update `resolveExposureMeaning` to drop the `token.meaning` priority**

Replace `public/js/shared/exposure-extractor.js:27-37`:

```javascript
export function resolveExposureMeaning(token, wordDict, overrides = {}) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return '';

  const dictEntry = getDictEntry(wordDict, baseForm);
  return overrides?.[baseForm]
    || dictEntry?.definitions?.find(d => d.primary)?.en
    || dictEntry?.definitions?.[0]?.en
    || '';
}
```

- [ ] **Step 4: Run the updated tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="extractExposureEntries"`
Expected: PASS — all three tests (including the pre-existing ones) pass.

- [ ] **Step 5: Run full unit suite to catch adjacent breakage**

Run: `npm run test:unit`
Expected: PASS. If any test fails, it is likely asserting the old `token.meaning` priority; fix by updating the test to the new priority or (if the test was validating build-time baked meanings) move the fix to Task 2.

- [ ] **Step 6: Commit**

```bash
git add public/js/shared/exposure-extractor.js tests/unit/exposure-extractor.test.js
git commit -m "fix(dialogue): live dict beats baked token.meaning in resolver"
```

---

## Task 2: Stop baking `meaning` in `frames.json`; pass `overrides` through

**Files:**
- Modify: `scripts/tokenize-static.js:54-73`
- Modify: `scripts/tokenize-static.js:175-186` (frames output mapping)
- Modify: `tests/unit/tokenize-static.test.js:49-55, 100-114`
- Regenerate: `data/dialogue/frames.json`

- [ ] **Step 1: Update the existing `tokenize-static.test.js` assertions**

In `tests/unit/tokenize-static.test.js`, replace the existing content-word meaning test (~lines 49-55):

```javascript
  it('content words have base, reading, and pos but NOT meaning', () => {
    const polite = frames.find(f => f.id === 'shopPurchase_please');
    const kudasai = polite.tokens.find(t => t.base === 'くださる');
    assert.ok(kudasai, 'should have くださる content token');
    assert.ok(kudasai.reading, 'くださる should have reading');
    assert.ok(kudasai.pos, 'くださる should have pos');
    assert.equal(kudasai.meaning, undefined, 'meaning should NOT be baked into tokens (live dict is source of truth)');
  });
```

Replace the `いらっしゃいませ is merged` test's last line (~line 113):

```javascript
    assert.equal(irasshaimase.meaning, undefined, 'meaning should NOT be baked');
```

Add a new test at the bottom of the `describe` block (before the final `});`):

```javascript
  it('overrides field passes through from frame-sources when present', () => {
    // No frame in frame-sources has overrides today; verify the field is
    // NOT emitted when absent (clean output).
    for (const frame of frames) {
      if ('overrides' in frame) {
        assert.equal(typeof frame.overrides, 'object');
        assert.ok(frame.overrides !== null);
        assert.ok(Object.keys(frame.overrides).length > 0,
          `frame ${frame.id} has empty overrides — should be omitted`);
      }
    }
  });
```

- [ ] **Step 2: Run the tokenize-static test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="tokenize-static"`
Expected: FAIL — current `frames.json` has `meaning` on content tokens.

- [ ] **Step 3: Update `scripts/tokenize-static.js` to drop `meaning` and pass `overrides` through**

Replace `scripts/tokenize-static.js:54-73`:

```javascript
function toUniversalToken(st) {
  if (isDemoted(st)) {
    return { token: { surface: st.surface }, isContent: false };
  }
  return {
    token: { surface: st.surface, base: st.baseForm, reading: st.reading, pos: SUDACHI_POS_EN[st.pos] || st.pos },
    isContent: true,
  };
}
```

Note: `wordDict` parameter is removed from `toUniversalToken` — no longer needed since `lookupMeaning` is gone. Also remove the now-unused `lookupMeaning` function at lines 54-59.

Update the call site at line 164 (inside `main()`'s segment loop) — remove the `wordDict` argument:

```javascript
      const { token, isContent } = toUniversalToken(st);
```

Replace the frames output mapping (lines 175-186):

```javascript
  // Build final output
  const frames = sources.map((source, idx) => {
    const frame = {
      id: source.id,
      category: source.category,
      raw: source.raw,
      tokens: frameTokens[idx].tokens,
      words: frameTokens[idx].words,
    };
    if (source.group) frame.group = source.group;
    if (source.overrides && Object.keys(source.overrides).length > 0) {
      frame.overrides = source.overrides;
    }
    return frame;
  });
```

- [ ] **Step 4: Regenerate `frames.json`**

Run: `node scripts/tokenize-static.js`
Expected: Console prints `Wrote 256 frames to /.../frames.json` (or current count).

- [ ] **Step 5: Verify `meaning` is gone from `frames.json`**

Run: `grep -c '"meaning"' data/dialogue/frames.json`
Expected: `0`

- [ ] **Step 6: Run tokenize-static tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="tokenize-static"`
Expected: PASS — all tests pass against the regenerated `frames.json`.

- [ ] **Step 7: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS. If the `validate-dialogue` test or a dialogue-related test fails, note the failure and continue to Task 3 (which will be the validator update).

- [ ] **Step 8: Commit (code + regenerated artifact together)**

```bash
git add scripts/tokenize-static.js tests/unit/tokenize-static.test.js data/dialogue/frames.json
git commit -m "refactor(dialogue): drop baked meaning from frames.json tokens

The live dictionary is the sole source of truth for meanings now.
Adds passthrough for an optional 'overrides' field on frame entries
(none authored today — hook only)."
```

---

## Task 3: Validate `overrides` in `frame-sources.json`

**Files:**
- Modify: `scripts/validate-dialogue.js` (add override checks to the existing checker)
- Create: `tests/unit/validate-dialogue.test.js`

- [ ] **Step 1: Refactor `validate-dialogue.js` to expose a pure checker function**

Replace the whole file `scripts/validate-dialogue.js` with:

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadWordDictionary } from '../src/game/word-dictionary.js';
import { resolveLiveDictPath } from '../src/game/live-dict-path.js';

/**
 * Validate a single frame against the dictionary and override schema.
 * Returns an array of error strings (empty = valid).
 */
export function validateFrame(frame, dict) {
  const errors = [];
  const ctx = `frames[${frame.id}]`;

  if (Array.isArray(frame.words) && frame.words.length > 0) {
    for (const word of frame.words) {
      if (!dict.has(word)) {
        errors.push(`${ctx} — word "${word}" not in dictionary`);
      }
    }
    if (typeof frame.category === 'string' && frame.category.startsWith('bark_') && frame.words.length > 3) {
      errors.push(`${ctx} — bark has ${frame.words.length} content words (max 3)`);
    }
  }

  if (frame.overrides !== undefined) {
    if (frame.overrides === null || typeof frame.overrides !== 'object' || Array.isArray(frame.overrides)) {
      errors.push(`${ctx} — overrides must be a plain object`);
    } else {
      const tokenBases = new Set((frame.tokens || []).filter(t => t.base).map(t => t.base));
      for (const [key, value] of Object.entries(frame.overrides)) {
        if (!tokenBases.has(key)) {
          errors.push(`${ctx} — override key "${key}" is not a base form in this frame`);
        }
        if (typeof value !== 'string' || value.trim().length === 0) {
          errors.push(`${ctx} — override value for "${key}" must be a non-empty string`);
        }
      }
    }
  }

  return errors;
}

function main() {
  const DATA_DIR = join(process.cwd(), 'data');
  const DIALOGUE_DIR = join(DATA_DIR, 'dialogue');

  const dict = loadWordDictionary({
    overlayDir: DATA_DIR,
    liveDictPath: resolveLiveDictPath(),
  });
  const frames = JSON.parse(readFileSync(join(DIALOGUE_DIR, 'frames.json'), 'utf-8'));

  console.log(`Dictionary loaded: ${dict.size} entries`);
  console.log(`Validating frames.json (${frames.length} frames)...\n`);

  let errorCount = 0;
  for (const frame of frames) {
    const errs = validateFrame(frame, dict);
    for (const e of errs) {
      console.error(`  ERROR: ${e}`);
      errorCount++;
    }
  }

  const byCategory = {};
  for (const frame of frames) {
    byCategory[frame.category] = (byCategory[frame.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${count} frames`);
  }

  console.log(`\n${errorCount} errors`);
  if (errorCount > 0) {
    console.error('\nValidation FAILED.');
    process.exit(1);
  }
  console.log('Validation PASSED.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Create the unit test file**

Create `tests/unit/validate-dialogue.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrame } from '../../scripts/validate-dialogue.js';

const dict = new Map([
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }],
  ['猫', { reading: 'ねこ', definitions: [{ en: 'cat', primary: true }] }],
]);

describe('validateFrame', () => {
  it('passes a frame with valid words and no overrides', () => {
    const frame = {
      id: 'f1',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
    };
    assert.deepEqual(validateFrame(frame, dict), []);
  });

  it('flags words missing from the dictionary', () => {
    const frame = {
      id: 'f2',
      category: 'bark_onHit',
      words: ['狐'],
      tokens: [{ surface: '狐', base: '狐', reading: 'きつね', pos: 'Noun' }],
    };
    const errs = validateFrame(frame, dict);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /狐.*not in dictionary/);
  });

  it('flags bark frames with more than 3 content words', () => {
    const frame = {
      id: 'f3',
      category: 'bark_onHit',
      words: ['犬', '猫', '犬', '猫'],
      tokens: [],
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /bark.*max 3/.test(e)));
  });

  it('passes a valid override', () => {
    const frame = {
      id: 'f4',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '犬': 'pup (context)' },
    };
    assert.deepEqual(validateFrame(frame, dict), []);
  });

  it('flags an override key that is not a base form in the frame', () => {
    const frame = {
      id: 'f5',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '猫': 'kitten' },
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /override key "猫"/.test(e)));
  });

  it('flags empty override values', () => {
    const frame = {
      id: 'f6',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '犬': '   ' },
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /non-empty string/.test(e)));
  });

  it('flags overrides that are not an object', () => {
    const frame = {
      id: 'f7',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: ['not', 'an', 'object'],
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /plain object/.test(e)));
  });

  it('allows an override for a word not in the dict (rare but legitimate)', () => {
    const frame = {
      id: 'f8',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [
        { surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' },
        { surface: 'ぴよん', base: 'ぴよん', reading: 'ぴよん', pos: 'Interjection' },
      ],
      overrides: { 'ぴよん': 'boing' },
    };
    // Only dict-miss on 'ぴよん'; override itself is valid.
    const errs = validateFrame(frame, dict);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /ぴよん.*not in dictionary/);
  });
});
```

- [ ] **Step 3: Run the new test**

Run: `npm run test:unit -- --test-name-pattern="validateFrame"`
Expected: PASS — 8 cases pass.

- [ ] **Step 4: Run `validate-dialogue.js` against the current repo to make sure production behavior is unchanged**

Run: `node scripts/validate-dialogue.js`
Expected: Exits 0 with `Validation PASSED.` output.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-dialogue.js tests/unit/validate-dialogue.test.js
git commit -m "feat(dialogue): validate frame-level meaning overrides"
```

---

## Task 4: Thread `overrides` through `assembleFrame`

**Files:**
- Modify: `src/game/token-format.js:16-31`
- Test: `tests/unit/token-format.test.js` (add cases; create file if missing)

- [ ] **Step 1: Check whether a test file exists for token-format.js**

Run: `ls tests/unit/token-format.test.js 2>/dev/null && echo EXISTS || echo MISSING`

If `MISSING`, create the file with the header:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFrame } from '../../src/game/token-format.js';

describe('assembleFrame', () => {
});
```

- [ ] **Step 2: Add two failing tests inside the `describe('assembleFrame', ...)` block**

```javascript
  it('passes frame.overrides through into the returned object', () => {
    const frame = {
      id: 'f1',
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      words: ['犬'],
      overrides: { '犬': 'pup' },
    };
    const result = assembleFrame(frame, {});
    assert.deepEqual(result.overrides, { '犬': 'pup' });
  });

  it('omits overrides when the frame has none', () => {
    const frame = {
      id: 'f2',
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      words: ['犬'],
    };
    const result = assembleFrame(frame, {});
    assert.equal('overrides' in result, false);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern="assembleFrame"`
Expected: FAIL — `result.overrides` is undefined (or the key is not set).

- [ ] **Step 4: Update `assembleFrame` to pass overrides through**

Replace `src/game/token-format.js:16-31`:

```javascript
/**
 * Splice entity tokens into a frame template's slot positions and merge
 * the entity base forms into the word list. Passes frame.overrides through
 * when present. Never mutates the original frame.
 */
export function assembleFrame(frame, entities) {
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
  const result = { tokens, words: [...frame.words, ...extraWords] };
  if (frame.overrides && Object.keys(frame.overrides).length > 0) {
    result.overrides = frame.overrides;
  }
  return result;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="assembleFrame"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/token-format.js tests/unit/token-format.test.js
git commit -m "feat(dialogue): thread frame.overrides through assembleFrame"
```

---

## Task 5: Add `data-override="1"` attribute in `renderJpSentence`

**Files:**
- Modify: `public/js/ui/bootstrap-client.js:78-122`
- Test: `tests/unit/bootstrap-renderer.test.js` (or `sentence-renderer.test.js` — use whichever exists)

- [ ] **Step 1: Identify the renderer test file**

Run: `ls tests/unit/bootstrap-renderer.test.js tests/unit/sentence-renderer.test.js 2>/dev/null`

Expected: at least one exists. Use that file for the test below. If both exist, prefer `sentence-renderer.test.js`.

- [ ] **Step 2: Add two failing tests**

Append inside the existing `describe` block in the chosen test file:

```javascript
  it('adds data-override="1" on spans whose meaning came from overrides', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }];
    const knownWords = new Set();
    const wordDict = new Map([['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }]]);
    const html = renderJpSentence(tokens, knownWords, wordDict, { '犬': 'pup' }, false);
    assert.match(html, /data-override="1"/);
    assert.match(html, /data-meaning="pup"/);
  });

  it('does not add data-override when meaning came from the dictionary', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }];
    const knownWords = new Set();
    const wordDict = new Map([['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }]]);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.doesNotMatch(html, /data-override/);
    assert.match(html, /data-meaning="dog"/);
  });
```

If `renderJpSentence` isn't already imported in the test file, add `import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';` at the top.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern="data-override"`
Expected: FAIL — current renderer does not emit the attribute.

- [ ] **Step 4: Update `renderJpSentence` to emit `data-override="1"` when applicable**

Replace the dataAttrs construction at `public/js/ui/bootstrap-client.js:100` (the full block starting at line 96):

```javascript
    // Look up meaning for data attribute (needed for both known and unknown)
    const meaning = resolveExposureMeaning(token, wordDict, overrides);
    const isFromOverride = !!overrides?.[baseForm];

    const pos = token.pos || '';
    const dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"${isFromOverride ? ' data-override="1"' : ''}`;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="data-override"`
Expected: PASS.

- [ ] **Step 6: Run full renderer test suite to catch regressions**

Run: `npm run test:unit -- --test-name-pattern="renderJpSentence|bootstrap-renderer|sentence-renderer"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/bootstrap-client.js tests/unit/bootstrap-renderer.test.js tests/unit/sentence-renderer.test.js
git commit -m "feat(dialogue): mark override-sourced meanings with data-override attr"
```

(The `git add` includes both possible test filenames; only whichever you modified will be in the diff.)

---

## Task 6: Augment popup with "In this context:" when override applied

**Files:**
- Modify: `public/js/ui/dialogue-word-lookup.js:113-151`
- Modify: `public/game.css` (add `.contextual-meaning` rule)
- Test: `tests/unit/dialogue-word-lookup.test.js` (create)

- [ ] **Step 1: Check where popup CSS lives**

Run: `grep -n "lookup-popup-meanings\|contextual-meaning" public/game.css public/*.css 2>/dev/null | head -5`
Expected: `lookup-popup-meanings` rules in `public/game.css`. Note the file path for Step 5.

- [ ] **Step 2: Create the test file `tests/unit/dialogue-word-lookup.test.js`**

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stub — node:test runs in Node so we simulate the popup handler's
// inputs by directly calling the function under test with a fake span + dict.
// We test the *meaning-list-building* logic in isolation by extracting it.

// If dialogue-word-lookup.js does not yet export buildPopupMeanings, Task 6
// refactors handleWordClick to extract that helper.

import { buildPopupMeanings } from '../../public/js/ui/dialogue-word-lookup.js';

describe('buildPopupMeanings', () => {
  const dictEntry = { definitions: [{ en: 'dog', primary: true }, { en: 'hound' }] };

  it('returns only dict definitions when no override', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'dog',
      dataOverride: null,
      dictEntry,
    });
    assert.deepEqual(result, [
      { text: 'dog', contextual: false },
      { text: 'hound', contextual: false },
    ]);
  });

  it('returns override first with contextual flag, then dict definitions', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'pup',
      dataOverride: '1',
      dictEntry,
    });
    assert.deepEqual(result, [
      { text: 'pup', contextual: true },
      { text: 'dog', contextual: false },
      { text: 'hound', contextual: false },
    ]);
  });

  it('handles missing dict entry with override gracefully', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'boing',
      dataOverride: '1',
      dictEntry: null,
    });
    assert.deepEqual(result, [{ text: 'boing', contextual: true }]);
  });

  it('returns empty list when no meaning and no dict entry', () => {
    const result = buildPopupMeanings({
      dataMeaning: '',
      dataOverride: null,
      dictEntry: null,
    });
    assert.deepEqual(result, []);
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern="buildPopupMeanings"`
Expected: FAIL — `buildPopupMeanings` is not yet exported.

- [ ] **Step 4: Extract `buildPopupMeanings` and update `handleWordClick`**

In `public/js/ui/dialogue-word-lookup.js`, add this export near the top of the file (after the imports, before the `dom` object):

```javascript
/**
 * Build the ordered meaning list for the popup.
 *  - Override (when data-override="1") goes first, flagged contextual.
 *  - Dict definitions follow, in order.
 *  - Duplicates suppressed by exact string match.
 *
 * Exported for unit testing without a DOM.
 */
export function buildPopupMeanings({ dataMeaning, dataOverride, dictEntry }) {
  const result = [];
  const seen = new Set();

  if (dataOverride === '1' && dataMeaning) {
    result.push({ text: dataMeaning, contextual: true });
    seen.add(dataMeaning);
  }

  if (dictEntry?.definitions) {
    for (const def of dictEntry.definitions) {
      if (def.en && !seen.has(def.en)) {
        result.push({ text: def.en, contextual: false });
        seen.add(def.en);
      }
    }
  }

  return result;
}
```

Replace the meaning-list-building block inside `handleWordClick` (currently `public/js/ui/dialogue-word-lookup.js:122-141`) with:

```javascript
  // Meanings: override (labeled "In this context") + dict definitions
  dom.meanings.innerHTML = '';
  const dictEntry = _wordDict?.get(base) || null;
  const meanings = buildPopupMeanings({
    dataMeaning: meaning,
    dataOverride: span.dataset.override || null,
    dictEntry,
  });

  for (const m of meanings) {
    const li = document.createElement('li');
    if (m.contextual) {
      li.className = 'contextual-meaning';
      const em = document.createElement('em');
      em.textContent = 'In this context: ';
      li.appendChild(em);
      li.appendChild(document.createTextNode(m.text));
    } else {
      li.textContent = m.text;
    }
    dom.meanings.appendChild(li);
  }
```

- [ ] **Step 5: Add CSS for the contextual-meaning list item**

Append to `public/game.css` (or the file identified in Step 1):

```css
/* Override-sourced meaning in the lookup popup — visually distinguished from dict glosses */
.lookup-popup-meanings li.contextual-meaning {
  background: rgba(255, 220, 120, 0.15);
  border-left: 3px solid rgba(255, 180, 60, 0.6);
  padding-left: 8px;
  margin-left: -8px;
}
.lookup-popup-meanings li.contextual-meaning em {
  color: #b07000;
  font-style: normal;
  font-weight: 600;
  margin-right: 2px;
}
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern="buildPopupMeanings"`
Expected: PASS (4 cases).

- [ ] **Step 7: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/dialogue-word-lookup.js public/game.css tests/unit/dialogue-word-lookup.test.js
git commit -m "feat(popup): augment lookup popup with 'In this context' override label"
```

---

## Task 7: Wire `overrides` through every `renderJpSentence` call site

Two kinds of changes here:
1. **Server-side response shapes** that currently return bare token arrays need to return `{tokens, overrides}` instead, so the client can pass `.overrides` to `renderJpSentence`.
2. **Client call sites** that already receive a container object need to swap `{}` for `.overrides || {}`.

After Task 4, `assembleFrame` and `selectBestFrame` candidates carry `.overrides`. Task 7 extends the same to `getEligibleFrameTokens` and fixes the response/consumer shapes.

**Files:**
- Modify: `src/game/token-format.js:88-93` (`getEligibleFrameTokens` returns full frame object)
- Modify: `src/routes/game/run.js:227-228, 272-273` (skillSelectPrompt shape)
- Modify: `src/routes/game/combat.js:79-83` (`mapLine` threads `l.overrides`)
- Modify: `public/js/ui/exploration.js` (multiple call sites — see steps)
- Modify: `public/js/ui/whack-a-mole.js:361`
- Modify: `public/js/ui/room-transition.js:155-157`

(Lines `dialogue-display.js:32` and `npc-dialogue-ui.js:56` already thread `line.overrides || {}` — no change. Lines `exploration.js:1400, 1438` render `item.nameToken` — a bare entity token with no frame context; keep `{}`. Line `exploration.js:1455` already uses `item.shopOverrides || {}`.)

- [ ] **Step 1: Change `getEligibleFrameTokens` to return `{tokens, overrides}`**

Replace `src/game/token-format.js:85-93`:

```javascript
/**
 * Return a frame's rendered form for i+1-eligible output: tokens plus any overrides.
 * Singleton wrapper around filterEligible — a single frame always comes back (never
 * null for a valid frame).
 *
 * @returns {{tokens: Array, overrides?: Object}|null}
 */
export function getEligibleFrameTokens(frame, knownWords) {
  if (!frame?.tokens?.length) return null;
  const chosen = filterEligible([frame], knownWords)[0];
  const result = { tokens: [...chosen.tokens] };
  if (chosen.overrides && Object.keys(chosen.overrides).length > 0) {
    result.overrides = chosen.overrides;
  }
  return result;
}
```

Note: this is a **breaking shape change** — existing callers that treated the return value as a token array must now read `.tokens`. Step 2 handles the server-side callers; Step 6 handles the client-side consumers.

- [ ] **Step 2: Update server call sites for `getEligibleFrameTokens`**

In `src/routes/game/run.js`:

Line 227-228 — change:
```javascript
      const skillSelectPrompt = getEligibleFrameTokens(getSkillSelectFrame(), knownSet);
      res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
```
to (no code change — the new return shape is already `{tokens, overrides?}`, which is what we want to ship to the client):
```javascript
      const skillSelectPrompt = getEligibleFrameTokens(getSkillSelectFrame(), knownSet);
      res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
```

Same file, line 272-273 — identical, no text change but verify the field ships as `{tokens, overrides?}`.

Grep the rest of `src/` for other callers of `getEligibleFrameTokens`:

Run: `grep -rn "getEligibleFrameTokens" src/ public/ --include="*.js" | grep -v test`

For each hit, if the code treated the old return value as a token array (e.g. `.length`, `.map`, spread-into-renderJpSentence), fix it to read `.tokens`.

- [ ] **Step 3: Update `combat.js` `mapLine` to thread line overrides**

Replace `src/routes/game/combat.js:79-83`:

```javascript
          const mapLine = (l) => l ? {
            text: l.raw,
            tokens: l.tokens || [],
            overrides: l.overrides || {},
          } : null;
```

- [ ] **Step 4: Update `showSkillSelectPrompt` to accept the new shape**

In `public/js/ui/exploration.js`, replace the function at line 1036-1042:

```javascript
/** Show the どの能力？ prompt in the narration box, attributed to `speaker`. */
function showSkillSelectPrompt(prompt, speaker = 'Cid') {
  if (!prompt?.tokens?.length || !sceneModule?.showNarration) return;
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  const html = renderJpSentence(prompt.tokens, getKnownWords(), wordDict, prompt.overrides || {}, false);
  sceneModule.showNarration(html, { html: true, persistent: true, speaker });
}
```

The two call sites already pass a `promptTokens` object (line 1207 and 1687) — these were set from `resp?.skillSelectPrompt` which is now `{tokens, overrides?}`. The callers already pass the whole object; no change to call sites.

Verify state initialization still works — `skillMasterState.promptTokens = resp?.skillSelectPrompt || null;` remains correct (null or `{tokens, overrides?}`).

- [ ] **Step 5: Update `exploration.js` call sites 976, 979, 989, 1419, 1450**

Line 976 and 979 — currently:
```javascript
      resp?.yesTokens?.length
        ? renderJpSentence(resp.yesTokens, getKnownWords(), wordDict, {}, false)
        : null,
      resp?.noTokens?.length
        ? renderJpSentence(resp.noTokens, getKnownWords(), wordDict, {}, false)
        : null,
```

These come from the game-master yes/no frames. Look at the server path: `src/routes/game/run.js` around 700-710. The response uses `selectBestFrame` which now returns `{tokens, words, overrides?}`. Find where `resp.yesTokens` and `resp.noTokens` are set on the server; those should become `resp.yes = {tokens, overrides?}` and `resp.no = ...`. Update both server and client.

Concretely: run `grep -n "yesTokens\|noTokens" src/ public/ -r --include="*.js" | grep -v test` and update all sites:
- Server: build `yes: {tokens, overrides?}` and `no: {tokens, overrides?}` instead of bare `yesTokens` / `noTokens` arrays.
- Client: `resp.yes?.tokens?.length ? renderJpSentence(resp.yes.tokens, ..., resp.yes.overrides || {}, false) : null` (same for `resp.no`).

Line 989 — change:
```javascript
    const html = renderJpSentence(whackAMoleState.dialogue.tokens, getKnownWords(), wordDict, {}, false);
```
to:
```javascript
    const html = renderJpSentence(whackAMoleState.dialogue.tokens, getKnownWords(), wordDict, whackAMoleState.dialogue.overrides || {}, false);
```

`whackAMoleState.dialogue` is assigned from a server response whose current shape is `{tokens, words}` — Task 4's `selectBestFrame`/`assembleFrame` change means it now also has `overrides` when the frame had any. No server-side change needed as long as the server passes the full candidate object (check `grep -n "dialogue" src/routes/game/*.js | grep -v ';'` to confirm).

Line 1419 — change:
```javascript
      greetingContent = renderJpSentence(greetingTokens, getKnownWords(), wordDict, {}, false);
```
to:
```javascript
      greetingContent = renderJpSentence(greetingTokens, getKnownWords(), wordDict, friendlyNpcState.greeting?.overrides || {}, false);
```

Line 1450 — change:
```javascript
        const html = renderJpSentence(item.tokens, getKnownWords(), wordDict, {}, false);
```
to:
```javascript
        const html = renderJpSentence(item.tokens, getKnownWords(), wordDict, item.overrides || {}, false);
```

- [ ] **Step 6: Update `whack-a-mole.js:361`**

Change:
```javascript
      const html = renderJpSentence(finishDialogue.tokens, getKnownWords(), wordDict, {}, false);
```
to:
```javascript
      const html = renderJpSentence(finishDialogue.tokens, getKnownWords(), wordDict, finishDialogue.overrides || {}, false);
```

`finishDialogue` is `selectBestFrame(...)` output on the server (see `src/routes/game/run.js:689`), which now carries `overrides` from Task 4.

- [ ] **Step 7: Update `room-transition.js`**

Look at `public/js/ui/room-transition.js:153-163`. The local `bootstrapLine` variable is already used with `.overrides || {}` at line 160 per earlier grep. Line 156 is a separate call using the same source — update it the same way.

Change the call at ~line 155-157 to:
```javascript
    const html = renderJpSentence(
      bootstrapLine.tokens,
      getKnownWords(),
      wordDict,
      bootstrapLine.overrides || {},
      false
    );
```

(Preserve the existing line-wrapping style.)

- [ ] **Step 8: Grep for any remaining `renderJpSentence(..., {}, ...)` calls**

Run: `grep -n "renderJpSentence" public/js -r --include="*.js" | grep ", {}," | grep -v "shopOverrides"`
Expected: empty output, or a set of deliberate bare-entity-token cases with `// no frame context` comments.

If any hit remains that's not a bare entity token, trace its tokens back to a frame source and wire `.overrides` through.

- [ ] **Step 9: Run full unit + integration tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Start the dev server and verify the どの popup manually**

Run: `npm run dev` (leave running in background — use `run_in_background: true`).

Wait ~5s, then verify the server is up:

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`
Expected: `200`.

**Manual step (user or Playwright-assisted):** Navigate to the game, reach any scene containing the `どの能力？` prompt (skill_select room), activate lookup mode, tap `どの`. The popup should now show **only** `which / what (way)` (from the live dict) and no "Mr. / Mrs. / Miss / Ms." bullet.

- [ ] **Step 11: Commit**

```bash
git add src/game/token-format.js src/routes/game/run.js src/routes/game/combat.js public/js/ui/exploration.js public/js/ui/whack-a-mole.js public/js/ui/room-transition.js
git commit -m "feat(dialogue): pass frame.overrides through every render call site"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all Tier 1 + Tier 2 tests pass.

- [ ] **Step 2: Grep confirms `meaning` is fully absent from `frames.json` tokens**

Run: `grep -c '"meaning"' data/dialogue/frames.json`
Expected: `0`

- [ ] **Step 3: Grep confirms no stale `token.meaning` references remain in resolver**

Run: `grep -n "token\\?\\.meaning\|token\\.meaning" public/js/shared/exposure-extractor.js`
Expected: no matches.

- [ ] **Step 4: Playtest screenshot evidence**

Per the "Visual Verification Rule" in CLAUDE.md, take a Playwright screenshot of the lookup popup for `どの` in the skill-select prompt showing only "which / what (way)". Delete the screenshot after it has been shown, per session cleanup rules.

- [ ] **Step 5: Summary commit (if any cleanup needed)**

If any follow-up tweaks arose during manual verification, commit them. Otherwise skip.

---

## Self-review notes

- **Spec coverage:** Tasks 1-2 implement the resolver + frames.json changes. Task 3 implements override validation. Task 4 wires `assembleFrame`. Task 5 adds the DOM `data-override` attribute. Task 6 implements the augment popup. Task 7 wires every call site. Task 8 verifies.
- **No placeholders:** every step has either exact code or an exact command with expected output.
- **Type consistency:** `buildPopupMeanings` returns `[{text, contextual}]` — same shape used in both the test (Task 6 Step 2) and the implementation (Task 6 Step 4). `assembleFrame` adds an optional `overrides` key — consumed by the same-named parameter of `renderJpSentence` (already in that signature).
- **Commit points:** 7 commits (one per task + one at the end if needed). Each is green and self-contained.
