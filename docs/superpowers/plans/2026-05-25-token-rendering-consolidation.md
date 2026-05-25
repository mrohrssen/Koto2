# Token Rendering Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Japanese token classification so every token carrying `grammarHints` renders with consistent romaji and lookup behavior across inline narration and NPC dialogue grid layouts.

**Architecture:** Add a pure shared `japanese-token-cells.js` module that turns universal tokens into render-ready cells. Keep `renderJpSentence()` and `renderDialogueTokenRows()` as separate layout renderers, but make both consume the shared cell contract instead of reclassifying raw tokens independently. Exposure recording stays in call sites; clicked-word audio remains owned by the NPC dialogue card.

**Tech Stack:** ES modules, Node test runner (`node:test`), existing shared token helpers in `public/js/shared/exposure-extractor.js`, existing `toRomaji()` utility.

---

## File Structure

- Create `public/js/ui/japanese-token-cells.js`
  - Pure token-to-cell builder.
  - Owns classification matrix, grammar reading overrides, punctuation attachment, optional small-tsu continuation merging, vocabulary meanings, known/new state, and shared lookup attrs.
  - Does not record exposures, attach events, play audio, or touch the DOM.
- Create `tests/unit/ui/japanese-token-cells.test.js`
  - Unit tests for the shared contract and the classification matrix.
- Modify `public/js/ui/bootstrap-client.js`
  - Keep public APIs `renderJpSentence()`, `renderEnFirst()`, `setKnownWords()`, `getKnownWords()`, `esc()`, and entity helpers.
  - Replace local token interpretation inside `renderJpSentence()` with cells from `buildJapaneseTokenCells()`.
  - Preserve `recordExposure()` behavior in `renderJpSentence()`.
- Modify `public/js/ui/npc-dialogue-card.js`
  - Replace `dialogueCellsForTokens()`, punctuation/continuation helpers, meaning resolution, and direct `isContentExposureToken()` render checks with shared cells.
  - Keep `data-audio-text` generation in this file.
  - Keep `renderTranslationSourceRows()` read-only: pronunciation uses shared cells, but source rows do not emit shared lookup attrs or attach lookup handlers.
  - Update weight estimation to use `cell.kind`.
- Modify `tests/unit/ui/npc-dialogue-card.test.js`
  - Add grid grammar-token regression tests.
  - Add cross-renderer parity test importing `renderJpSentence()`.
  - Add translation-source non-clickability test.

## Task 1: Add Failing Tests For Shared Token Cells

**Files:**
- Create: `tests/unit/ui/japanese-token-cells.test.js`
- Test target: `public/js/ui/japanese-token-cells.js`

- [ ] **Step 1: Create the shared cell contract test file**

Create `tests/unit/ui/japanese-token-cells.test.js` with this content:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJapaneseTokenCells,
  grammarHintsAttr,
  tokenDataAttrs,
} from '../../../public/js/ui/japanese-token-cells.js';

const desuHint = {
  grammarId: 'n5-desu-copula',
  title: 'です',
  meaning: 'to be / is',
  shortExplanation: 'Marks a polite statement that something is something.',
  displayPattern: 'Noun + です',
  readingOverride: '',
  matchedText: 'です',
  tokenStart: 1,
  tokenEnd: 1,
};

const waHint = {
  grammarId: 'n5-wa-topic',
  title: 'は',
  meaning: 'as for',
  shortExplanation: 'Marks what the sentence is talking about.',
  displayPattern: 'Noun + は',
  readingOverride: 'わ',
  matchedText: 'は',
  tokenStart: 1,
  tokenEnd: 1,
};

describe('japanese token cells', () => {
  it('classifies content and grammar tokens with the shared matrix', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        { surface: '友達', base: '友達', reading: 'ともだち', meaning: 'friend', pos: 'Noun' },
        { surface: 'です', reading: 'です', grammarHints: [desuHint] },
        { surface: '！', reading: '!' },
      ],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells.length, 2);
    assert.equal(cells[0].kind, 'word');
    assert.equal(cells[0].lookupClass, 'jp-word');
    assert.equal(cells[0].base, '友達');
    assert.equal(cells[0].display, 'ともだち');
    assert.equal(cells[0].romaji, 'tomodachi');
    assert.equal(cells[0].meaning, 'friend');
    assert.equal(cells[0].trailingPunct, '');

    assert.equal(cells[1].kind, 'grammar');
    assert.equal(cells[1].lookupClass, 'jp-grammar');
    assert.equal(cells[1].base, '');
    assert.equal(cells[1].display, 'です！');
    assert.equal(cells[1].surface, 'です');
    assert.equal(cells[1].reading, 'です');
    assert.equal(cells[1].romaji, 'desu');
    assert.equal(cells[1].trailingPunct, '！');
    assert.deepEqual(cells[1].grammarHints, [desuHint]);
  });

  it('applies grammar readingOverride without hardcoding particles', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        { surface: '道', base: '道', reading: 'みち', meaning: 'road', pos: 'Noun' },
        { surface: 'は', reading: 'は', grammarHints: [waHint] },
      ],
      knownWords: new Set(['道']),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells[1].kind, 'grammar');
    assert.equal(cells[1].surface, 'は');
    assert.equal(cells[1].reading, 'わ');
    assert.equal(cells[1].romaji, 'wa');
    assert.equal(cells[1].display, 'は');
  });

  it('keeps content tokens as word cells even when they also carry grammar hints', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        {
          surface: '強い',
          base: '強い',
          reading: 'つよい',
          meaning: 'strong',
          pos: 'Adjective',
          grammarHints: [{
            grammarId: 'n5-i-adjective-predicate',
            title: 'い-Adjective + です',
            meaning: 'is adjective',
            shortExplanation: 'Lets an i-adjective end a polite sentence.',
            matchedText: '強いです',
          }],
        },
      ],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells.length, 1);
    assert.equal(cells[0].kind, 'word');
    assert.equal(cells[0].lookupClass, 'jp-word');
    assert.equal(cells[0].base, '強い');
    assert.equal(cells[0].grammarHints.length, 1);
  });

  it('merges small-tsu continuations only when requested', () => {
    const tokens = [
      { surface: '待っ', base: '待つ', reading: 'まっ', meaning: 'wait', pos: 'Verb' },
      { surface: 'て' },
      { surface: '！' },
    ];

    const inlineCells = buildJapaneseTokenCells({
      tokens,
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
      mergeSmallTsuContinuation: false,
    });

    assert.equal(inlineCells.length, 2);
    assert.equal(inlineCells[0].display, 'まっ');
    assert.equal(inlineCells[1].kind, 'punctuation');
    assert.equal(inlineCells[1].display, 'て！');

    const gridCells = buildJapaneseTokenCells({
      tokens,
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
      mergeSmallTsuContinuation: true,
    });

    assert.equal(gridCells.length, 1);
    assert.equal(gridCells[0].kind, 'word');
    assert.equal(gridCells[0].reading, 'まって');
    assert.equal(gridCells[0].display, 'まって！');
    assert.equal(gridCells[0].surfaceWithContinuation, '待って');
  });

  it('builds escaped shared lookup attrs without renderer-owned audio text', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [{
        surface: '森',
        base: '森',
        reading: 'もり',
        meaning: 'forest & woods',
        meanings: [{ en: 'forest & woods' }],
        pos: 'Noun',
      }],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: true,
    });

    const attrs = tokenDataAttrs(cells[0]);

    assert.match(attrs, /data-base="森"/);
    assert.match(attrs, /data-reading="もり"/);
    assert.match(attrs, /data-meaning="forest &amp; woods"/);
    assert.match(attrs, /data-pos="Noun"/);
    assert.match(attrs, /data-kanji-mode="1"/);
    assert.match(attrs, /data-meanings="/);
    assert.doesNotMatch(attrs, /data-audio-text/);
  });

  it('serializes grammar hints for lookup attrs', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [{ surface: 'です', reading: 'です', grammarHints: [desuHint] }],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.match(grammarHintsAttr(cells[0]), /data-grammar-hints="/);
    assert.match(grammarHintsAttr(cells[0]), /n5-desu-copula/);
    assert.equal(tokenDataAttrs(cells[0]).includes('data-base='), false);
    assert.match(tokenDataAttrs(cells[0]), /data-reading="です"/);
    assert.match(tokenDataAttrs(cells[0]), /data-grammar-hints="/);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/japanese-token-cells.test.js
```

Expected: FAIL with an import/module-not-found error for `public/js/ui/japanese-token-cells.js`.

- [ ] **Step 3: Commit the failing test**

```bash
/usr/bin/git add tests/unit/ui/japanese-token-cells.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
test: define Japanese token cell contract

EOF
)"
```

## Task 2: Implement Shared Japanese Token Cells

**Files:**
- Create: `public/js/ui/japanese-token-cells.js`
- Test: `tests/unit/ui/japanese-token-cells.test.js`

- [ ] **Step 1: Add the shared cell module**

Create `public/js/ui/japanese-token-cells.js` with this content:

```js
import { toRomaji } from './romaji.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';

const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;
const HIRAGANA_RE = /^[\u3040-\u309F]+$/u;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hasGrammarHints(token) {
  return Array.isArray(token?.grammarHints) && token.grammarHints.length > 0;
}

export function grammarReading(token) {
  return token?.grammarHints?.find(hint => hint.readingOverride)?.readingOverride
    || token?.reading
    || token?.surface
    || '';
}

export function grammarHintsAttr(cellOrToken) {
  const grammarHints = cellOrToken?.grammarHints || [];
  if (!Array.isArray(grammarHints) || grammarHints.length === 0) return '';
  return ` data-grammar-hints="${esc(JSON.stringify(grammarHints))}"`;
}

export function tokenDataAttrs(cell) {
  if (!cell || cell.kind === 'punctuation') return '';

  let attrs = '';
  if (cell.kind === 'word') {
    attrs += ` data-base="${esc(cell.base)}"`;
  }
  attrs += ` data-reading="${esc(cell.reading)}"`;

  if (cell.kind === 'word') {
    attrs += ` data-meaning="${esc(cell.meaning)}" data-pos="${esc(cell.pos)}"`;
    if (cell.isFromOverride) attrs += ' data-override="1"';
    if (Array.isArray(cell.meanings) && cell.meanings.length > 0) {
      attrs += ` data-meanings="${esc(JSON.stringify(cell.meanings))}"`;
    }
    if (cell.useKanji) attrs += ' data-kanji-mode="1"';
  }

  attrs += grammarHintsAttr(cell);
  return attrs;
}

export function buildJapaneseTokenCells({
  tokens = [],
  knownWords = new Set(),
  wordDict = null,
  overrides = {},
  useKanji = false,
  mergeSmallTsuContinuation = false,
} = {}) {
  const cells = [];

  for (const token of tokens || []) {
    const previousCell = cells[cells.length - 1];
    if (mergeSmallTsuContinuation && isSmallTsuContinuation(token, previousCell)) {
      previousCell.continuationSurface += token.surface || '';
      previousCell.continuationReading += token.reading || token.surface || '';
      finalizeCell(previousCell, { useKanji });
      continue;
    }

    if (isAttachablePunctuation(token) && cells.length > 0) {
      previousCell.trailingPunct += token.surface || '';
      finalizeCell(previousCell, { useKanji });
      continue;
    }

    const cell = createCell(token, { knownWords, wordDict, overrides, useKanji });
    finalizeCell(cell, { useKanji });
    cells.push(cell);
  }

  return cells;
}

function createCell(token, { knownWords, wordDict, overrides, useKanji }) {
  const content = isContentExposureToken(token);
  if (content) {
    const base = getTokenBaseForm(token);
    const meaning = resolveExposureMeaning(token, wordDict, overrides);
    const meanings = Array.isArray(token.meanings) ? token.meanings : [];
    return {
      kind: 'word',
      lookupClass: 'jp-word',
      token,
      surface: token.surface || '',
      surfaceWithContinuation: token.surface || '',
      base,
      reading: token.reading || token.surface || base,
      meaning,
      meanings,
      pos: token.pos || '',
      grammarHints: Array.isArray(token.grammarHints) ? token.grammarHints : [],
      isKnown: knownWords?.has?.(base) || false,
      isFromOverride: !!overrides?.[base],
      useKanji,
      clickable: true,
      continuationSurface: '',
      continuationReading: '',
      trailingPunct: '',
    };
  }

  if (hasGrammarHints(token)) {
    return {
      kind: 'grammar',
      lookupClass: 'jp-grammar',
      token,
      surface: token.surface || '',
      surfaceWithContinuation: token.surface || '',
      base: '',
      reading: grammarReading(token),
      meaning: '',
      meanings: [],
      pos: token.pos || '',
      grammarHints: token.grammarHints,
      isKnown: false,
      isFromOverride: false,
      useKanji,
      clickable: true,
      continuationSurface: '',
      continuationReading: '',
      trailingPunct: '',
    };
  }

  return {
    kind: 'punctuation',
    lookupClass: 'jp-punct',
    token,
    surface: token?.surface || '',
    surfaceWithContinuation: token?.surface || '',
    base: '',
    reading: token?.reading || token?.surface || '',
    meaning: '',
    meanings: [],
    pos: token?.pos || '',
    grammarHints: [],
    isKnown: false,
    isFromOverride: false,
    useKanji,
    clickable: false,
    continuationSurface: '',
    continuationReading: '',
    trailingPunct: '',
  };
}

function finalizeCell(cell, { useKanji }) {
  const continuationSurface = cell.continuationSurface || '';
  const continuationReading = cell.continuationReading || continuationSurface;

  if (cell.kind === 'word') {
    const baseDisplay = useKanji ? cell.surface : cell.reading;
    const continuation = useKanji ? continuationSurface : continuationReading;
    cell.reading = `${baseReading(cell)}${continuationReading}`;
    cell.surfaceWithContinuation = `${cell.surface}${continuationSurface}`;
    cell.displayBase = `${baseDisplay}${continuation}`;
    cell.display = `${cell.displayBase}${cell.trailingPunct || ''}`;
    cell.romaji = toRomaji(cell.reading);
    return;
  }

  if (cell.kind === 'grammar') {
    cell.surfaceWithContinuation = cell.surface;
    cell.displayBase = cell.surface;
    cell.display = `${cell.surface}${cell.trailingPunct || ''}`;
    cell.romaji = toRomaji(cell.reading);
    return;
  }

  cell.surfaceWithContinuation = cell.surface;
  cell.displayBase = cell.surface;
  cell.display = `${cell.surface}${cell.trailingPunct || ''}`;
  cell.romaji = '';
}

function baseReading(cell) {
  const raw = cell.token?.reading || cell.token?.surface || cell.base || '';
  const continuationReading = cell.continuationReading || cell.continuationSurface || '';
  if (continuationReading && raw.endsWith(continuationReading)) return raw.slice(0, -continuationReading.length);
  return raw;
}

function isAttachablePunctuation(token) {
  const surface = token?.surface || '';
  return !!surface && !isContentExposureToken(token) && !hasGrammarHints(token) && ATTACHABLE_PUNCT_RE.test(surface);
}

function isSmallTsuContinuation(token, previousCell) {
  if (!previousCell || previousCell.kind !== 'word') return false;
  if (isContentExposureToken(token) || hasGrammarHints(token)) return false;

  const previousReading = previousCell.reading || previousCell.surface || previousCell.base || '';
  const continuationReading = token?.reading || token?.surface || '';
  return previousReading.endsWith('っ') && HIRAGANA_RE.test(continuationReading);
}
```

- [ ] **Step 2: Run the shared cell tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/japanese-token-cells.test.js
```

Expected: PASS.

- [ ] **Step 3: Syntax-check the new module**

Run:

```bash
node --check public/js/ui/japanese-token-cells.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Commit the shared module**

```bash
/usr/bin/git add public/js/ui/japanese-token-cells.js tests/unit/ui/japanese-token-cells.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat: add shared Japanese token cells

EOF
)"
```

## Task 3: Migrate Inline Narration Renderer

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`
- Test: `tests/unit/ui/japanese-token-cells.test.js`
- Test: add coverage in `tests/unit/ui/npc-dialogue-card.test.js` for cross-renderer parity in Task 4

- [ ] **Step 1: Import shared cell helpers in `bootstrap-client.js`**

Replace the current top imports in `public/js/ui/bootstrap-client.js`:

```js
import { toRomaji } from './romaji.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning
} from '../shared/exposure-extractor.js';
import { record as recordExposure } from './exposure-buffer.js';
```

with:

```js
import { record as recordExposure } from './exposure-buffer.js';
import {
  buildJapaneseTokenCells,
  tokenDataAttrs,
} from './japanese-token-cells.js';
```

- [ ] **Step 2: Remove obsolete local constants/helpers**

Delete these definitions from `public/js/ui/bootstrap-client.js`:

```js
const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;

function grammarHintsAttr(token) {
  if (!Array.isArray(token.grammarHints) || token.grammarHints.length === 0) return '';
  return ` data-grammar-hints="${esc(JSON.stringify(token.grammarHints))}"`;
}
```

Keep `TAG_RE`, `_knownWords`, `renderEnFirst()`, known-word helpers, `entityToToken()`, and `esc()`.

- [ ] **Step 3: Replace `renderJpSentence()` internals**

Replace the body of `renderJpSentence()` with this implementation:

```js
export function renderJpSentence(tokens, knownWords, wordDict, overrides = {}, useKanji = false, options = {}) {
  if (!tokens || tokens.length === 0) return '';

  if (options.recordExposure !== false) {
    recordExposure(tokens, wordDict, overrides);
  }

  const cells = buildJapaneseTokenCells({
    tokens,
    knownWords,
    wordDict,
    overrides,
    useKanji,
    mergeSmallTsuContinuation: false,
  });

  return cells.map(cell => {
    if (cell.kind === 'punctuation') {
      return `<span class="jp-punct">${esc(cell.display)}</span>`;
    }

    if (cell.kind === 'grammar') {
      return `<span class="jp-grammar"${tokenDataAttrs(cell)}>`
        + `<ruby>${esc(cell.displayBase)}<rt>${esc(cell.romaji)}</rt></ruby>`
        + `${esc(cell.trailingPunct || '')}</span>`;
    }

    const typeClass = cell.token?.entity ? 'jp-entity' : cell.isKnown ? 'jp-known' : 'jp-unknown';
    if (cell.isKnown) {
      return `<span class="jp-word ${typeClass}"${tokenDataAttrs(cell)}>`
        + `<ruby>${esc(cell.displayBase)}<rt>${esc(cell.romaji)}</rt></ruby>`
        + `${esc(cell.trailingPunct || '')}</span>`;
    }

    const firstSense = cell.meaning.split('/')[0].trim();
    const parenIdx = firstSense.indexOf('(');
    const primaryEn = parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
    return `<span class="jp-word ${typeClass}"${tokenDataAttrs(cell)}>`
      + `<ruby>${esc(cell.displayBase)}<rt>${esc(cell.romaji)}</rt></ruby>`
      + `${esc(cell.trailingPunct || '')}`
      + `<span class="jp-stack-en">${esc(primaryEn)}</span>`
      + `</span>`;
  }).join('');
}
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check public/js/ui/bootstrap-client.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/japanese-token-cells.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS. If `npc-dialogue-card.test.js` fails before Task 4 because it still imports older helpers indirectly, finish Task 4 before committing this task.

- [ ] **Step 6: Commit inline migration**

```bash
/usr/bin/git add public/js/ui/bootstrap-client.js public/js/ui/japanese-token-cells.js tests/unit/ui/japanese-token-cells.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
refactor: render inline Japanese from shared token cells

EOF
)"
```

## Task 4: Migrate NPC Dialogue Grid Rendering

**Files:**
- Modify: `public/js/ui/npc-dialogue-card.js`
- Modify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Update imports in `npc-dialogue-card.js`**

Replace:

```js
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';
```

with:

```js
import { getTokenBaseForm } from '../shared/exposure-extractor.js';
import {
  buildJapaneseTokenCells,
  tokenDataAttrs,
} from './japanese-token-cells.js';
```

- [ ] **Step 2: Replace token/cell helpers in `npc-dialogue-card.js`**

Delete these local helpers and constants:

```js
const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;
const HIRAGANA_RE = /^[\u3040-\u309F]+$/u;

function displayReading(token, useKanji) {
  if (!isContentExposureToken(token)) return token.surface || '';
  if (useKanji) return token.surface || token.reading || token.baseForm || '';
  return token.reading || token.surface || token.baseForm || '';
}

function tokenMeaning(token, wordDict, overrides) {
  const meaning = resolveExposureMeaning(token, wordDict, overrides) || '';
  const firstSense = meaning.split('/')[0].trim();
  const parenIdx = firstSense.indexOf('(');
  return parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
}

function attrsForToken(token, { wordDict, overrides, useKanji }, cell = null) {
  const base = tokenBase(token);
  const reading = cell ? cellReading(cell) : (token.reading || token.surface || base);
  const audioText = `${token.surface || reading || base}${cell?.continuationSurface || ''}`;
  const meaning = tokenMeaning(token, wordDict, overrides);
  const pos = token.pos || '';
  const meaningsJson = Array.isArray(token.meanings) ? JSON.stringify(token.meanings) : '';
  let attrs = ` data-base="${esc(base)}" data-audio-text="${esc(audioText)}" data-reading="${esc(reading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;
  if (overrides?.[base]) attrs += ' data-override="1"';
  if (meaningsJson) attrs += ` data-meanings="${esc(meaningsJson)}"`;
  if (useKanji) attrs += ' data-kanji-mode="1"';
  return attrs;
}

function isAttachablePunctuation(token) {
  const surface = token?.surface || '';
  return !!surface && !isContentExposureToken(token) && ATTACHABLE_PUNCT_RE.test(surface);
}

function isSmallTsuContinuation(token, previousCell) {
  if (!previousCell || !isContentExposureToken(previousCell.token)) return false;
  if (isContentExposureToken(token)) return false;

  const previousReading = previousCell.token.reading || previousCell.token.surface || tokenBase(previousCell.token);
  const continuationReading = token?.reading || token?.surface || '';
  return previousReading.endsWith('っ') && HIRAGANA_RE.test(continuationReading);
}

function dialogueCellsForTokens(tokens = []) {
  const cells = [];
  for (const token of tokens) {
    const previousCell = cells[cells.length - 1];
    if (isSmallTsuContinuation(token, previousCell)) {
      previousCell.continuationSurface += token.surface || '';
      previousCell.continuationReading += token.reading || token.surface || '';
      continue;
    }

    if (isAttachablePunctuation(token) && cells.length > 0) {
      cells[cells.length - 1].trailingPunct += token.surface || '';
      continue;
    }
    cells.push({
      token,
      continuationSurface: '',
      continuationReading: '',
      trailingPunct: '',
      standalone: !isContentExposureToken(token),
    });
  }
  return cells;
}

function cellReading(cell) {
  const token = cell.token;
  const reading = token.reading || token.surface || tokenBase(token);
  return `${reading}${cell.continuationReading || cell.continuationSurface || ''}`;
}

function cellDisplay(cell, useKanji) {
  const token = cell.token;
  const continuation = useKanji
    ? cell.continuationSurface
    : (cell.continuationReading || cell.continuationSurface);
  return `${displayReading(token, useKanji)}${continuation || ''}${cell.trailingPunct || ''}`;
}
```

Add these replacement helpers near `tokenBase()`:

```js
function dialogueCellsForTokens(tokens = [], options = {}) {
  return buildJapaneseTokenCells({
    tokens,
    knownWords: options.knownWords || getKnownWords(),
    wordDict: options.wordDict || null,
    overrides: options.overrides || {},
    useKanji: !!options.useKanji,
    mergeSmallTsuContinuation: true,
  });
}

function primaryMeaning(cell) {
  const firstSense = String(cell.meaning || '').split('/')[0].trim();
  const parenIdx = firstSense.indexOf('(');
  return parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
}

function audioTextForCell(cell) {
  if (cell.kind !== 'word') return '';
  return cell.surfaceWithContinuation || cell.surface || cell.reading || cell.base || '';
}

function dialogueAttrsForCell(cell) {
  const sharedAttrs = tokenDataAttrs(cell);
  const audioText = audioTextForCell(cell);
  if (!audioText) return sharedAttrs;
  return `${sharedAttrs} data-audio-text="${esc(audioText)}"`;
}
```

- [ ] **Step 3: Update `estimateDialogueCellWeight()`**

Replace `estimateDialogueCellWeight()` with:

```js
function estimateDialogueCellWeight(cell, {
  includeMeaning = true,
} = {}) {
  if (cell.kind === 'punctuation') {
    return Math.max(1, textLength(cell.display) * 0.8);
  }

  const meaning = includeMeaning && cell.kind === 'word' && !cell.isKnown
    ? primaryMeaning(cell)
    : '';

  return Math.max(
    textLength(cell.display) * 1.5,
    textLength(cell.romaji) * 0.75,
    textLength(meaning) * 0.65,
    1
  );
}
```

- [ ] **Step 4: Update callers that build dialogue cells**

Replace this call in `renderTranslationSourceRows()`:

```js
const lines = chunkDialogueCells(dialogueCellsForTokens(tokens || []), { useKanji, includeMeaning: false });
```

with:

```js
const lines = chunkDialogueCells(dialogueCellsForTokens(tokens || [], { useKanji }), { includeMeaning: false });
```

Replace this call in `renderDialogueTokenRows()`:

```js
const lines = chunkDialogueCells(dialogueCellsForTokens(tokens || []), {
  knownWords,
  wordDict,
  overrides,
  useKanji,
});
```

with:

```js
const lines = chunkDialogueCells(dialogueCellsForTokens(tokens || [], {
  knownWords,
  wordDict,
  overrides,
  useKanji,
}), {
  includeMeaning: true,
});
```

Replace this page split condition in `paginateTokens()`:

```js
if (current.length >= MAX_TOKENS_PER_PAGE && !isAttachablePunctuation(token)) {
```

with:

```js
const tokenCell = buildJapaneseTokenCells({ tokens: [token], mergeSmallTsuContinuation: false })[0];
if (current.length >= MAX_TOKENS_PER_PAGE && tokenCell?.kind !== 'punctuation') {
```

- [ ] **Step 5: Update `renderTranslationSourceRows()` rendering loop**

Replace the loop body inside `renderTranslationSourceRows()` with:

```js
for (const cell of lineCells) {
  if (cell.kind === 'punctuation') {
    pronunciation.push('<span class="npc-dialogue-cell npc-dialogue-cell--punct"></span>');
    jp.push(`<span class="npc-dialogue-cell jp-punct">${esc(cell.display)}</span>`);
    continue;
  }

  const pronunciationText = useKanji ? cell.reading : cell.romaji;
  pronunciation.push(`<span class="npc-dialogue-cell">${esc(pronunciationText)}</span>`);

  const className = cell.kind === 'grammar' ? 'jp-grammar' : 'jp-word';
  jp.push(`<span class="npc-dialogue-cell ${className}">${esc(cell.display)}</span>`);
}
```

This intentionally omits lookup attrs in translation-source rows.

- [ ] **Step 6: Update `renderDialogueTokenRows()` rendering loop**

Replace the loop body inside `renderDialogueTokenRows()` with:

```js
for (const cell of lineCells) {
  if (cell.kind === 'punctuation') {
    romaji.push('<span class="npc-dialogue-cell npc-dialogue-cell--punct"></span>');
    jp.push(`<span class="npc-dialogue-cell jp-punct">${esc(cell.display)}</span>`);
    en.push('<span class="npc-dialogue-cell"></span>');
    continue;
  }

  if (cell.kind === 'grammar') {
    romaji.push(`<span class="npc-dialogue-cell">${esc(cell.romaji)}</span>`);
    jp.push(`<span class="npc-dialogue-cell jp-grammar"${tokenDataAttrs(cell)}>${esc(cell.display)}</span>`);
    en.push('<span class="npc-dialogue-cell"></span>');
    continue;
  }

  const meaning = cell.isKnown ? '' : primaryMeaning(cell);
  const typeClass = cell.token?.entity ? 'jp-entity' : cell.isKnown ? 'jp-known' : 'jp-unknown';

  romaji.push(`<span class="npc-dialogue-cell">${esc(cell.romaji)}</span>`);
  jp.push(`<span class="npc-dialogue-cell jp-word ${typeClass}"${dialogueAttrsForCell(cell)}>${esc(cell.display)}</span>`);
  en.push(`<span class="npc-dialogue-cell">${esc(meaning)}</span>`);
}
```

- [ ] **Step 7: Add NPC grid grammar regression tests**

Add these tests after the existing “renders tokenized dialogue in shared romaji/kana/english rows” test in `tests/unit/ui/npc-dialogue-card.test.js`:

```js
  it('renders non-content grammar hints as clickable grammar cells in grid dialogue', () => {
    const grammarHints = [{
      grammarId: 'n5-desu-copula',
      title: 'です',
      meaning: 'to be / is',
      shortExplanation: 'Marks a polite statement that something is something.',
      displayPattern: 'Noun + です',
      readingOverride: '',
      matchedText: 'です',
    }];

    const html = renderDialogueTokenRows({
      tokens: [
        { surface: '友達', base: '友達', reading: 'ともだち', meaning: 'friend', pos: 'Noun' },
        { surface: 'です', reading: 'です', grammarHints },
        { surface: '！', reading: '!' },
      ],
      knownWords: new Set(),
      overrides: {},
      useKanji: false,
    });

    assert.match(html, />desu<\/span>/);
    assert.match(html, /class="npc-dialogue-cell jp-grammar"/);
    assert.match(html, /data-reading="です"/);
    assert.match(html, /data-grammar-hints="/);
    assert.match(html, /n5-desu-copula/);
    assert.match(html, />です！<\/span>/);
    assert.doesNotMatch(html, /<span class="npc-dialogue-cell jp-punct">です！<\/span>/);
  });

  it('uses grammar readingOverride in grid dialogue pronunciation', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: '道', base: '道', reading: 'みち', meaning: 'road', pos: 'Noun' },
        {
          surface: 'は',
          reading: 'は',
          grammarHints: [{
            grammarId: 'n5-wa-topic',
            title: 'は',
            meaning: 'as for',
            shortExplanation: 'Marks what the sentence is talking about.',
            displayPattern: 'Noun + は',
            readingOverride: 'わ',
            matchedText: 'は',
          }],
        },
      ],
      knownWords: new Set(['道']),
      overrides: {},
      useKanji: false,
    });

    assert.match(html, />wa<\/span>/);
    assert.match(html, /data-reading="わ"/);
    assert.match(html, />は<\/span>/);
  });
```

- [ ] **Step 8: Add cross-renderer parity test**

First add this import to the existing import block near line 215 in `tests/unit/ui/npc-dialogue-card.test.js`:

```js
const { renderJpSentence } = await import('../../../public/js/ui/bootstrap-client.js');
```

Then add this test near the grid grammar tests:

```js
  it('keeps grammar lookup attrs in parity between inline and grid renderers', () => {
    const grammarHints = [{
      grammarId: 'n5-ne-confirmation',
      title: 'ね',
      meaning: "right? / isn't it?",
      shortExplanation: 'Invites agreement or shared feeling from the listener.',
      displayPattern: 'Sentence + ね',
      readingOverride: '',
      matchedText: 'ね',
    }];
    const tokens = [
      { surface: '強い', base: '強い', reading: 'つよい', meaning: 'strong', pos: 'Adjective' },
      { surface: 'ね', reading: 'ね', grammarHints },
      { surface: '！', reading: '!' },
    ];

    const inlineHtml = renderJpSentence(tokens, new Set(), null, {}, false, { recordExposure: false });
    const gridHtml = renderDialogueTokenRows({
      tokens,
      knownWords: new Set(),
      overrides: {},
      useKanji: false,
    });

    assert.match(inlineHtml, /class="jp-grammar"/);
    assert.match(gridHtml, /class="npc-dialogue-cell jp-grammar"/);
    assert.match(inlineHtml, /data-reading="ね"/);
    assert.match(gridHtml, /data-reading="ね"/);
    assert.match(inlineHtml, /data-grammar-hints="/);
    assert.match(gridHtml, /data-grammar-hints="/);
    assert.match(inlineHtml, /n5-ne-confirmation/);
    assert.match(gridHtml, /n5-ne-confirmation/);
  });
```

- [ ] **Step 9: Add translation-source read-only grammar test**

Add this test after the existing translation-source tests:

```js
  it('shows grammar pronunciation in translation source rows without lookup attrs', async () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [
        { surface: '友達', base: '友達', reading: 'ともだち', meaning: 'friend', pos: 'Noun' },
        {
          surface: 'です',
          reading: 'です',
          grammarHints: [{
            grammarId: 'n5-desu-copula',
            title: 'です',
            meaning: 'to be / is',
            shortExplanation: 'Marks a polite statement that something is something.',
            displayPattern: 'Noun + です',
            readingOverride: '',
            matchedText: 'です',
          }],
        },
      ],
      knownWords: new Set(),
      useKanji: false,
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const translationSourceHtml = actionArea.innerHTML.slice(actionArea.innerHTML.indexOf('npc-dialogue-translation-source'));
    assert.match(translationSourceHtml, />desu<\/span>/);
    assert.match(translationSourceHtml, /class="npc-dialogue-cell jp-grammar"/);
    assert.doesNotMatch(translationSourceHtml, /data-grammar-hints=/);
    assert.doesNotMatch(translationSourceHtml, /data-base=/);
  });
```

- [ ] **Step 10: Run syntax checks**

Run:

```bash
node --check public/js/ui/npc-dialogue-card.js && node --check public/js/ui/bootstrap-client.js && node --check public/js/ui/japanese-token-cells.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 11: Run focused unit tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/japanese-token-cells.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 12: Commit NPC grid migration**

```bash
/usr/bin/git add public/js/ui/npc-dialogue-card.js public/js/ui/bootstrap-client.js public/js/ui/japanese-token-cells.js tests/unit/ui/npc-dialogue-card.test.js tests/unit/ui/japanese-token-cells.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
fix: render grammar tokens in dialogue grids

EOF
)"
```

## Task 5: Final Verification

**Files:**
- Verify: `public/js/ui/bootstrap-client.js`
- Verify: `public/js/ui/npc-dialogue-card.js`
- Verify: `public/js/ui/japanese-token-cells.js`
- Verify: `tests/unit/ui/japanese-token-cells.test.js`
- Verify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Run all JS syntax checks for edited files**

Run:

```bash
node --check public/js/ui/japanese-token-cells.js && node --check public/js/ui/bootstrap-client.js && node --check public/js/ui/npc-dialogue-card.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/japanese-token-cells.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Inspect git diff for scope**

Run:

```bash
/usr/bin/git diff --stat HEAD
/usr/bin/git diff -- public/js/ui/japanese-token-cells.js public/js/ui/bootstrap-client.js public/js/ui/npc-dialogue-card.js tests/unit/ui/japanese-token-cells.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: only the shared cell module, the two renderers, and the two focused test files changed.

- [ ] **Step 5: Commit final verification-only adjustments if any were needed**

If Step 4 revealed no additional code changes since the previous commit, skip this step. If small corrections were needed during verification, commit them:

```bash
/usr/bin/git add public/js/ui/japanese-token-cells.js public/js/ui/bootstrap-client.js public/js/ui/npc-dialogue-card.js tests/unit/ui/japanese-token-cells.test.js tests/unit/ui/npc-dialogue-card.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
test: verify token renderer parity

EOF
)"
```

## Completion Notes

- This plan intentionally avoids changing `renderEnFirst()`.
- This plan intentionally keeps translation-source rows read-only.
- This plan intentionally keeps exposure recording in `renderJpSentence()` rather than the shared cell builder.
- If visual CSS or layout output changes beyond grammar tokens appearing in existing rows, perform a browser screenshot verification before reporting completion.
