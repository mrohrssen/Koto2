# Tokenized Shop Dialogue Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the tokenizer → renderer → exposure pipeline so the shop phrase `{item.word}、ください` renders with romaji word stacks and logs word exposures.

**Architecture:** Four changes: (1) add romaji `<ruby>` to `renderJpSentence`, (2) server tokenizes shop phrases at offer time, (3) `exposeWords` looks up meanings from the word dictionary instead of requiring callers to pass them, (4) replace hardcoded ください exposure with tokenized content words.

**Tech Stack:** SudachiPy tokenizer, Node.js ES modules, `node:test` runner

**Spec:** `docs/superpowers/specs/2026-04-07-tokenized-shop-dialogue-design.md`

---

## Chunk 1: Renderer — Add romaji to `renderJpSentence`

### Task 1: Update existing tests to expect romaji in output

The existing tests in `tests/unit/sentence-renderer.test.js` assert on the current HTML structure. After adding `<ruby>` romaji, known words will contain `<ruby>` and `<rt>` tags. Update the tests first so they define the new behavior.

**Files:**
- Modify: `tests/unit/sentence-renderer.test.js`

- [ ] **Step 1: Update test for known word rendering**

The test "renders known words as inline hiragana" currently asserts bare text. Change it to expect `<ruby>` with romaji:

```js
it('renders known words with romaji ruby annotation (useKanji=false)', () => {
  const tokens = [{ surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' }];
  const knownWords = new Set(['こんにちは']);
  const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
  assert.ok(html.includes('jp-known'));
  assert.ok(html.includes('<ruby>'));
  assert.ok(html.includes('こんにちは'));
  assert.ok(html.includes('<rt>konnichiwa</rt>'));
  assert.ok(!html.includes('jp-unknown'));
});
```

Replace the existing test at lines 13-20 with this version.

- [ ] **Step 2: Update test for unknown word rendering**

The test "renders unknown words as vertical stacks" should also expect `<ruby>` + romaji:

```js
it('renders unknown words with romaji and English', () => {
  const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
  const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
  assert.ok(html.includes('jp-unknown'));
  assert.ok(html.includes('<ruby>'));
  assert.ok(html.includes('いっしょ'));
  assert.ok(html.includes('<rt>issho</rt>'));
  assert.ok(html.includes('jp-stack-en'));
  assert.ok(html.includes('together'));
});
```

Replace the existing test at lines 22-30 with this version.

- [ ] **Step 3: Update useKanji test**

The test "uses kanji surface form when useKanji=true" should verify the surface goes inside `<ruby>`:

```js
it('uses kanji surface form when useKanji=true', () => {
  const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
  const html = renderJpSentence(tokens, new Set(['一緒']), wordDict, {}, true);
  assert.ok(html.includes('<ruby>一緒<'));
  assert.ok(html.includes('<rt>issho</rt>'));
  assert.ok(html.includes('jp-known'));
});
```

Replace the existing test at lines 39-44 with this version.

- [ ] **Step 4: Update mixed sentence test**

The mixed sentence test counts CSS classes — this stays the same since counts don't change. But add an assertion that known words have `<ruby>`:

```js
it('renders a mixed sentence correctly', () => {
  const tokens = [
    { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
    { surface: '！', baseForm: '！', pos: '記号', reading: '' },
    { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
    { surface: 'に', baseForm: 'に', pos: '助詞', reading: 'に' },
    { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
  ];
  const knownWords = new Set(['こんにちは', 'に']);
  const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
  assert.equal((html.match(/jp-known/g) || []).length, 2);
  assert.equal((html.match(/jp-unknown/g) || []).length, 2);
  assert.equal((html.match(/jp-punct/g) || []).length, 1);
  // All non-punctuation tokens get ruby
  assert.equal((html.match(/<ruby>/g) || []).length, 4);
});
```

Replace the existing test at lines 53-66 with this version.

- [ ] **Step 5: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/sentence-renderer.test.js 2>&1 | tail -20`

Expected: FAIL — tests expect `<ruby>` but the current code outputs bare text for known words.

### Task 2: Implement romaji in `renderJpSentence`

**Files:**
- Modify: `public/js/ui/bootstrap-client.js:97-129`

- [ ] **Step 1: Update the known-word branch**

In `renderJpSentence`, replace the known-word rendering (lines 112-116):

**Before:**
```js
if (isKnown) {
  // Known word: inline, no decoration
  const display = useKanji ? surface : displayReading;
  return `<span class="jp-word jp-known">${esc(display)}</span>`;
}
```

**After:**
```js
if (isKnown) {
  const display = useKanji ? surface : displayReading;
  return `<span class="jp-word jp-known">`
    + `<ruby>${esc(display)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
    + `</span>`;
}
```

- [ ] **Step 2: Update the unknown-word branch**

Replace the unknown-word rendering (lines 124-127):

**Before:**
```js
return `<span class="jp-word jp-unknown">`
  + `<span class="jp-stack-reading">${esc(displayReading)}</span>`
  + `<span class="jp-stack-en">${esc(enDef)}</span>`
  + `</span>`;
```

**After:**
```js
return `<span class="jp-word jp-unknown">`
  + `<ruby>${esc(displayReading)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
  + `<span class="jp-stack-en">${esc(enDef)}</span>`
  + `</span>`;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/sentence-renderer.test.js 2>&1 | tail -20`

Expected: PASS — all 7 tests green.

- [ ] **Step 4: Syntax-check the edited file**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add tests/unit/sentence-renderer.test.js public/js/ui/bootstrap-client.js
git commit -m "feat(renderer): add romaji ruby annotations to renderJpSentence"
```

---

## Chunk 2: `exposeWords` owns meaning lookup

### Task 3: Write test for dictionary-based meaning lookup

**Files:**
- Modify: `tests/unit/word-knowledge.test.js`
- Modify: `src/game/bootstrap/word-knowledge.js`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/unit/word-knowledge.test.js` that verifies `exposeWords` can look up meanings from a word dictionary when creating SRS cards. Since `exposeWords` calls `loadWordKnowledge`/`saveWordKnowledge` which read/write files, and `createCard` which also writes files, this test needs to mock those. Instead, test the new internal helper `lookupMeaning` directly.

Add at the end of the describe block, before the closing `});`:

```js
it('lookupMeaning returns primary definition from dictionary', async () => {
  // Dynamic import to get the new export
  const { lookupMeaning } = await import('../../src/game/bootstrap/word-knowledge.js');
  // The word dictionary should have ください from grammar-words.json
  const meaning = lookupMeaning('ください');
  assert.ok(meaning.length > 0, 'should find a meaning for ください');
  assert.ok(meaning.includes('please'), `meaning should contain "please", got: ${meaning}`);
});
```

Also add the import for `lookupMeaning` at the top (update the existing import):

```js
import {
  createWordKnowledge,
  registerExposure,
  markKnown,
  unmarkKnown,
  isWordKnown,
  getKnownWords,
  getSeenWords,
  seedKnownWords,
  exposeWords,
  lookupMeaning
} from '../../src/game/bootstrap/word-knowledge.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/word-knowledge.test.js 2>&1 | tail -15`

Expected: FAIL — `lookupMeaning` is not exported.

- [ ] **Step 3: Implement `lookupMeaning` and wire it into `exposeWords`**

In `src/game/bootstrap/word-knowledge.js`, add the word dictionary import and lazy-load, plus the `lookupMeaning` function. Then update `exposeWords` to use it.

Add after the existing imports (after line 5):

```js
import { loadWordDictionary } from '../word-dictionary.js';
import { join } from 'path';

let _wordDict = null;
function getWordDict() {
  if (!_wordDict) _wordDict = loadWordDictionary(join(process.cwd(), 'data'));
  return _wordDict;
}

/**
 * Look up the primary English meaning for a Japanese word.
 * @param {string} baseForm
 * @returns {string} English meaning or empty string
 */
export function lookupMeaning(baseForm) {
  const dict = getWordDict();
  const entry = dict.get(baseForm);
  if (!entry?.definitions?.length) return '';
  const primary = entry.definitions.find(d => d.primary);
  return primary?.en || entry.definitions[0]?.en || '';
}
```

Then update the SRS card creation inside `exposeWords` (the `createCard` call at lines 41-43):

**Before:**
```js
createCard(userId, 'vocab', word, {
  word, meaning, reading: word
});
```

**After:**
```js
const dictMeaning = lookupMeaning(word);
createCard(userId, 'vocab', word, {
  word, meaning: dictMeaning || meaning, reading: word
});
```

This prefers the dictionary meaning but falls back to the caller-provided meaning (for backwards compatibility during transition).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-test-module-mocks --test tests/unit/word-knowledge.test.js 2>&1 | tail -15`

Expected: PASS — all tests green (8 tests now including the new one).

- [ ] **Step 5: Run the full unit test suite to check for regressions**

Run: `npm run test:unit 2>&1 | tail -5`

Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge.test.js
git commit -m "feat(exposure): exposeWords looks up meanings from word dictionary"
```

---

## Chunk 3: Server tokenization + exposure wiring

### Task 4: Tokenize shop phrases at offer time

**Files:**
- Modify: `src/routes/game/run.js:616-639`

- [ ] **Step 1: Add imports**

At the top of `src/routes/game/run.js`, add the tokenizer import. Find the existing imports section and add:

```js
import { tokenize } from '../../tokenizer.js';
```

- [ ] **Step 2: Add tokenization after offers are rolled**

In the `/friendly-npc-offers` handler, after `room.friendlyNpc.offered = rollFriendlyNpcOffers(...)` (line 625) and before `req.saveGame()` (line 626), add tokenization:

```js
// Tokenize shop phrases for client rendering (batch all items in one tokenize call)
const PUNCT_POS = new Set(['記号', '補助記号', '空白']);
const phrases = room.friendlyNpc.offered
  .filter(item => item.word)
  .map(item => `${item.word}、ください`);

if (phrases.length > 0) {
  // Batch tokenize: one Python subprocess for all phrases
  const { execFileSync } = await import('child_process');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const helperPath = join(process.cwd(), 'scripts', 'sudachi-tokenize.py');
  const raw = execFileSync('python3', [helperPath], {
    input: JSON.stringify(phrases),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const allTokens = JSON.parse(raw);

  let idx = 0;
  for (const item of room.friendlyNpc.offered) {
    if (!item.word) continue;
    const tokens = allTokens[idx++];
    item.shopTokens = tokens;
    item.shopOverrides = { [item.word]: item.nameEn || '' };
    item.shopContentWords = tokens
      .filter(t => !PUNCT_POS.has(t.pos) && !/^[\p{P}\p{S}\s]+$/u.test(t.surface))
      .map(t => t.baseForm);
  }
}
```

This sends all phrases (typically 3) to the Python helper in a single subprocess call, matching the spec's "one batch call" requirement. The `tokenize()` wrapper from `src/tokenizer.js` only handles single strings, so we call the Python helper directly here using the same pattern.

- [ ] **Step 3: Syntax-check the file**

Run: `node --check src/routes/game/run.js && echo "OK"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat(shop): tokenize item phrases at offer time"
```

### Task 5: Replace hardcoded exposure with tokenized content words

**Files:**
- Modify: `src/routes/game/run.js:642-685`

- [ ] **Step 1: Replace the hardcoded ください exposure**

In the `/friendly-npc-choose` handler, find line 679:

```js
req.gameManager.exposeWords([{ word: 'ください', meaning: 'please (when requesting)' }]);
```

Replace with:

```js
if (item.shopContentWords?.length) {
  req.gameManager.exposeWords(item.shopContentWords);
}
```

This passes plain strings (baseForm values from the tokenizer). `exposeWords` now looks up meanings from the dictionary (Task 3).

- [ ] **Step 2: Syntax-check the file**

Run: `node --check src/routes/game/run.js && echo "OK"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat(shop): use tokenized content words for exposure logging"
```

### Task 6: Wire client rendering

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Add imports**

At the top of `exploration.js`, add the new imports after the existing imports (around line 40):

```js
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
```

- [ ] **Step 2: Replace the plain-text narration**

Find the shop phrase narration at line 1223-1225:

```js
if (item.word && sceneModule?.showNarration) {
  await sceneModule.showNarration(`${item.word}、ください`, { speaker: 'You' });
}
```

Replace with:

```js
if (item.shopTokens?.length && sceneModule?.showNarration) {
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  // useKanji=false for now (Areas 1-3 are hiragana-only; derive from area index when expanding)
  const html = renderJpSentence(item.shopTokens, getKnownWords(), wordDict, item.shopOverrides || {}, false);
  await sceneModule.showNarration(html, { html: true, speaker: 'You' });
} else if (item.word && sceneModule?.showNarration) {
  // Fallback: plain text if tokens not available
  await sceneModule.showNarration(`${item.word}、ください`, { speaker: 'You' });
}
```

The fallback ensures existing saved games without `shopTokens` still work.

- [ ] **Step 3: Syntax-check the file**

Run: `node --check public/js/ui/exploration.js && echo "OK"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat(shop): render item phrase with tokenized word stacks"
```

---

## Chunk 4: Integration verification

### Task 7: Run full test suite

- [ ] **Step 1: Run all unit + integration tests**

Run: `npm test 2>&1 | tail -10`

Expected: All tests pass. If any fail, investigate — the renderer change affects `renderJpSentence` which is used in other tests.

- [ ] **Step 2: Syntax-check all modified files**

Run:
```bash
node --check public/js/ui/bootstrap-client.js && \
node --check public/js/ui/exploration.js && \
node --check src/routes/game/run.js && \
node --check src/game/bootstrap/word-knowledge.js && \
echo "All OK"
```

Expected: `All OK`

### Task 8: Visual verification with Playwright

**Important:** Ask the user before launching Playwright. Only proceed if they approve.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev &` then wait 3 seconds and verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200`

- [ ] **Step 2: Navigate to the game, reach a friendly NPC room**

Play through to the point where you encounter a friendly NPC offering items. Take a screenshot when the item cards appear.

- [ ] **Step 3: Select an item and verify the narration**

Tap an item card. The narration box should show the `{item.word}、ください` phrase with:
- Romaji above every word
- Unknown words have English below in a blue-bordered stack
- Punctuation (、) renders inline without decoration

Take a screenshot of the narration and compare against the visual spec.

- [ ] **Step 4: Delete screenshots**

Remove any screenshots taken during verification — do not leave PNGs in the repo.
