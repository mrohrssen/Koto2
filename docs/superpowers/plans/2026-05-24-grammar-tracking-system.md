# Grammar Tracking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic N5 grammar annotation system that uses Sudachi Mode A metadata, Koto-owned grammar data, and the existing lookup UI to show grammar hints without changing vocabulary exposure.

**Architecture:** Extend tokenizer output additively, match grammar on the unmerged Sudachi stream, then project grammar hits onto merged render tokens. Store Koto-authored grammar content in `data/grammar-catalog.json`, deterministic matcher data in `data/grammar-matchers.json`, and bake static frame annotations at build time while keeping runtime AI out of matching entirely.

**Tech Stack:** Node.js ES modules, SudachiPy helper script, `node:test` + `assert/strict`, c8, existing `renderJpSentence()` / `dialogue-word-lookup.js` UI.

---

## File Structure

- Create `data/grammar-catalog.json`: Koto-owned grammar point metadata. Starts with representative fixture entries, then expands to full N5.
- Create `data/grammar-matchers.json`: deterministic matcher definitions keyed by `grammarId`.
- Modify `data/grammar-words.json`: move true vocabulary items out or leave only during transition; grammar hints stop depending on it.
- Modify `src/game/word-dictionary.js`: stop overlaying `grammar-words.json` once vocab entries are migrated.
- Modify `scripts/sudachi-tokenize.py`: add full POS tuple, conjugation metadata, normalized form, and token index without removing existing fields.
- Modify `src/tokenizer.js`: preserve API shape and document rich fields.
- Create `src/game/grammar/grammar-loader.js`: load and validate catalog/matcher files.
- Create `src/game/grammar/grammar-matcher.js`: pure deterministic matcher engine over rich Sudachi tokens.
- Create `src/game/grammar/annotate-tokens.js`: project raw-token grammar matches onto render tokens.
- Create `src/game/grammar/tokenize-and-annotate.js`: shared helper for future token-producing code paths.
- Create `tests/fixtures/grammar-n5-stress.json`: subagent-generated stress cases and adjudicated expected outcomes.
- Create `tests/unit/grammar-stress-metrics.test.js`: metrics gate for recall/miss rate and false positives.
- Modify `scripts/tokenize-static.js`: annotate frames at build time, preserving `words`.
- Modify `src/routes/admin-frame-audit.js`: annotate admin previews with the same helper.
- Modify `src/routes/game/known-words.js`: annotate `/parse-text` output.
- Modify `public/js/ui/bootstrap-client.js`: render grammar-only clickable particles and grammar data attributes.
- Modify `public/js/ui/dialogue-word-lookup.js`: show `Grammar Hint` and hide vocab SRS controls for grammar-only clicks.
- Modify `public/game.css`: style grammar-only clickable tokens and hint block.

---

## Task 1: Add Rich Sudachi Token Metadata

**Files:**
- Modify: `scripts/sudachi-tokenize.py`
- Modify: `src/tokenizer.js`
- Modify: `tests/unit/tokenizer.test.js`

- [ ] **Step 1: Add failing tokenizer metadata tests**

Append these tests to `tests/unit/tokenizer.test.js`:

```js
it('preserves top-level pos while adding full Sudachi POS fields', () => {
  const tokens = tokenize('読んでいる。');
  const verb = tokens.find(t => t.surface === '読ん');
  assert.ok(verb, 'should find conjugated verb token');
  assert.equal(verb.pos, '動詞');
  assert.equal(verb.pos0, '動詞');
  assert.equal(verb.pos1, '一般');
  assert.equal(verb.pos4, '五段-マ行');
  assert.equal(verb.pos5, '連用形-撥音便');
  assert.equal(verb.conjugationType, '五段-マ行');
  assert.equal(verb.conjugationForm, '連用形-撥音便');
  assert.equal(verb.normalizedForm, '読む');
  assert.equal(verb.index, 0);
});

it('keeps raw particle readings for grammar UI overrides', () => {
  const tokens = tokenize('本を読んでいる。');
  const wo = tokens.find(t => t.surface === 'を');
  assert.ok(wo, 'should find を');
  assert.equal(wo.pos0, '助詞');
  assert.equal(wo.reading, 'を');

  const heTokens = tokenize('東京へ行く。');
  const he = heTokens.find(t => t.surface === 'へ');
  assert.ok(he, 'should find へ');
  assert.equal(he.reading, 'へ');
});
```

- [ ] **Step 2: Run tokenizer tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "tokenizer"`

Expected: FAIL because `pos0`, `pos1`, `pos4`, `pos5`, `conjugationType`, `conjugationForm`, `normalizedForm`, and `index` are undefined.

- [ ] **Step 3: Extend the Sudachi helper additively**

In `scripts/sudachi-tokenize.py`, replace the `result.append({ ... })` block with:

```python
            pos = t.part_of_speech()
            result.append({
                'surface': t.surface(),
                'baseForm': t.dictionary_form(),
                'pos': pos[0],
                'reading': katakana_to_hiragana(t.reading_form()),
                'normalizedForm': t.normalized_form(),
                'pos0': pos[0],
                'pos1': pos[1],
                'pos2': pos[2],
                'pos3': pos[3],
                'pos4': pos[4],
                'pos5': pos[5],
                'conjugationType': pos[4],
                'conjugationForm': pos[5],
                'index': len(result),
            })
```

Update the docstring line:

```python
Each token includes existing fields {surface, baseForm, pos, reading} plus rich Sudachi metadata for grammar matching.
```

- [ ] **Step 4: Update tokenizer docs**

In `src/tokenizer.js`, update both JSDoc return shapes to:

```js
 * @returns {Array<{
 *   surface: string,
 *   baseForm: string,
 *   pos: string,
 *   reading: string,
 *   normalizedForm?: string,
 *   pos0?: string,
 *   pos1?: string,
 *   pos2?: string,
 *   pos3?: string,
 *   pos4?: string,
 *   pos5?: string,
 *   conjugationType?: string,
 *   conjugationForm?: string,
 *   index?: number
 * }>}
```

- [ ] **Step 5: Run tokenizer tests**

Run: `npm run test:unit -- --test-name-pattern "tokenizer"`

Expected: PASS.

- [ ] **Step 6: Run static token output tests**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static output"`

Expected: PASS. Existing code still reads `pos` as a top-level string.

- [ ] **Step 7: Commit**

```bash
git add scripts/sudachi-tokenize.py src/tokenizer.js tests/unit/tokenizer.test.js
git commit -m "$(cat <<'EOF'
Add rich Sudachi metadata for grammar matching

EOF
)"
```

---

## Task 2: Add Grammar Data Files and Loader

**Files:**
- Create: `data/grammar-catalog.json`
- Create: `data/grammar-matchers.json`
- Create: `src/game/grammar/grammar-loader.js`
- Create: `tests/unit/grammar-loader.test.js`

- [ ] **Step 1: Create failing loader tests**

Create `tests/unit/grammar-loader.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGrammarCatalog,
  loadGrammarMatchers,
  getGrammarPointMap,
} from '../../src/game/grammar/grammar-loader.js';

describe('grammar-loader', () => {
  it('loads Koto grammar catalog entries keyed by id', () => {
    const catalog = loadGrammarCatalog();
    const point = catalog.find(p => p.id === 'n5-wa-topic');
    assert.ok(point, 'n5-wa-topic should exist');
    assert.equal(point.level, 'N5');
    assert.equal(point.lesson, 1);
    assert.equal(point.title, 'は');
    assert.equal(point.meaning, 'as for');
    assert.equal(point.readingOverride, 'わ');
    assert.ok(point.shortExplanation.length > 0);
    assert.ok(point.tempSourceDeleteTagLater.includes('bunpro.jp/grammar_points/'));
  });

  it('loads matchers that reference existing catalog entries', () => {
    const catalogMap = getGrammarPointMap(loadGrammarCatalog());
    const matchers = loadGrammarMatchers();
    assert.ok(matchers.some(m => m.grammarId === 'n5-wa-topic'));
    for (const matcher of matchers) {
      assert.ok(catalogMap.has(matcher.grammarId), `missing catalog entry for ${matcher.grammarId}`);
      assert.equal(typeof matcher.priority, 'number', `${matcher.grammarId} matcher missing numeric priority`);
    }
  });

  it('rejects duplicate catalog ids', () => {
    assert.throws(
      () => getGrammarPointMap([{ id: 'x' }, { id: 'x' }]),
      /Duplicate grammar catalog id: x/
    );
  });
});
```

- [ ] **Step 2: Run loader tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "grammar-loader"`

Expected: FAIL because the loader module and data files do not exist.

- [ ] **Step 3: Create starter catalog data**

Create `data/grammar-catalog.json`:

```json
[
  {
    "id": "n5-wa-topic",
    "level": "N5",
    "lesson": 1,
    "lessonIndex": 3,
    "title": "は",
    "sense": "topic",
    "meaning": "as for",
    "shortExplanation": "Marks what the sentence is talking about.",
    "displayPattern": "Noun + は",
    "readingOverride": "わ",
    "status": "enabled",
    "tempSourceDeleteTagLater": "https://bunpro.jp/grammar_points/%E3%81%AF"
  },
  {
    "id": "n5-wo-object",
    "level": "N5",
    "lesson": 2,
    "lessonIndex": 6,
    "title": "を",
    "sense": "object-marker",
    "meaning": "object marker",
    "shortExplanation": "Marks the thing that receives the action.",
    "displayPattern": "Noun + を + Verb",
    "status": "enabled",
    "tempSourceDeleteTagLater": "https://bunpro.jp/grammar_points/%E3%82%92"
  },
  {
    "id": "n5-ga-aru-existence",
    "level": "N5",
    "lesson": 3,
    "lessonIndex": 7,
    "title": "がある",
    "sense": "existence-things",
    "meaning": "there is / has",
    "shortExplanation": "Says that a thing exists or that someone has it.",
    "displayPattern": "Noun + が + ある",
    "status": "enabled",
    "tempSourceDeleteTagLater": "https://bunpro.jp/grammar_points/%E3%81%8C%E3%81%82%E3%82%8B"
  },
  {
    "id": "n5-te-iru-progressive",
    "level": "N5",
    "lesson": 5,
    "lessonIndex": 10,
    "title": "～ている",
    "sense": "progressive",
    "meaning": "is/am/are doing",
    "shortExplanation": "Shows an action happening right now.",
    "displayPattern": "Verbて + いる",
    "status": "enabled",
    "tempSourceDeleteTagLater": "https://bunpro.jp/grammar_points/%E3%81%A6%E3%81%84%E3%82%8B1"
  }
]
```

- [ ] **Step 4: Create starter matcher data**

Create `data/grammar-matchers.json`:

```json
[
  {
    "grammarId": "n5-wa-topic",
    "type": "token-sequence",
    "priority": 10,
    "tokens": [
      { "pos0": "名詞" },
      { "surface": "は", "pos0": "助詞", "pos1": "係助詞" }
    ],
    "display": { "startTokenOffset": 1, "endTokenOffset": 1 }
  },
  {
    "grammarId": "n5-wo-object",
    "type": "token-sequence",
    "priority": 10,
    "tokens": [
      { "pos0": "名詞" },
      { "surface": "を", "pos0": "助詞", "pos1": "格助詞" },
      { "pos0": "動詞" }
    ],
    "display": { "startTokenOffset": 1, "endTokenOffset": 1 }
  },
  {
    "grammarId": "n5-ga-aru-existence",
    "type": "token-sequence",
    "priority": 30,
    "tokens": [
      { "pos0": "名詞" },
      { "surface": "が", "pos0": "助詞", "pos1": "格助詞" },
      { "baseForm": "ある", "pos0": "動詞" }
    ],
    "display": { "startTokenOffset": 1, "endTokenOffset": 2 }
  },
  {
    "grammarId": "n5-te-iru-progressive",
    "type": "token-sequence",
    "priority": 40,
    "tokens": [
      { "pos0": "動詞", "conjugationFormPrefix": "連用形" },
      { "surfaceOneOf": ["て", "で"], "pos0": "助詞", "pos1": "接続助詞" },
      { "baseForm": "いる", "pos0": "動詞" }
    ],
    "display": { "startTokenOffset": 0, "endTokenOffset": 2 }
  }
]
```

- [ ] **Step 5: Implement the loader**

Create `src/game/grammar/grammar-loader.js`:

```js
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CATALOG_PATH = join(ROOT, 'data', 'grammar-catalog.json');
const MATCHERS_PATH = join(ROOT, 'data', 'grammar-matchers.json');

let catalogCache = null;
let matcherCache = null;

export function loadGrammarCatalog({ path = CATALOG_PATH } = {}) {
  if (path === CATALOG_PATH && catalogCache) return catalogCache;
  const catalog = JSON.parse(readFileSync(path, 'utf-8'));
  validateCatalog(catalog);
  if (path === CATALOG_PATH) catalogCache = catalog;
  return catalog;
}

export function loadGrammarMatchers({ path = MATCHERS_PATH } = {}) {
  if (path === MATCHERS_PATH && matcherCache) return matcherCache;
  const matchers = JSON.parse(readFileSync(path, 'utf-8'));
  validateMatchers(matchers, getGrammarPointMap(loadGrammarCatalog()));
  if (path === MATCHERS_PATH) matcherCache = matchers;
  return matchers;
}

export function getGrammarPointMap(catalog) {
  const map = new Map();
  for (const point of catalog || []) {
    if (!point?.id) throw new Error('Grammar catalog entry missing id');
    if (map.has(point.id)) throw new Error(`Duplicate grammar catalog id: ${point.id}`);
    map.set(point.id, point);
  }
  return map;
}

export function invalidateGrammarCaches() {
  catalogCache = null;
  matcherCache = null;
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new Error('grammar-catalog.json must be an array');
  getGrammarPointMap(catalog);
  for (const point of catalog) {
    for (const field of ['level', 'lesson', 'lessonIndex', 'title', 'meaning', 'shortExplanation', 'displayPattern', 'status']) {
      if (point[field] == null || point[field] === '') {
        throw new Error(`Grammar catalog entry ${point.id} missing ${field}`);
      }
    }
  }
}

function validateMatchers(matchers, catalogMap) {
  if (!Array.isArray(matchers)) throw new Error('grammar-matchers.json must be an array');
  for (const matcher of matchers) {
    if (!catalogMap.has(matcher.grammarId)) {
      throw new Error(`Grammar matcher references unknown grammarId: ${matcher.grammarId}`);
    }
    if (typeof matcher.priority !== 'number') {
      throw new Error(`Grammar matcher ${matcher.grammarId} missing numeric priority`);
    }
    if (!Array.isArray(matcher.tokens) || matcher.tokens.length === 0) {
      throw new Error(`Grammar matcher ${matcher.grammarId} must define tokens`);
    }
  }
}
```

- [ ] **Step 6: Run loader tests**

Run: `npm run test:unit -- --test-name-pattern "grammar-loader"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add data/grammar-catalog.json data/grammar-matchers.json src/game/grammar/grammar-loader.js tests/unit/grammar-loader.test.js
git commit -m "$(cat <<'EOF'
Add grammar catalog and matcher loader

EOF
)"
```

---

## Task 3: Implement Deterministic Grammar Matcher

**Files:**
- Create: `src/game/grammar/grammar-matcher.js`
- Create: `tests/unit/grammar-matcher.test.js`

- [ ] **Step 1: Create failing matcher tests**

Create `tests/unit/grammar-matcher.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

function tokenized(text) {
  return tokenizeBatch([text])[0];
}

function ids(text) {
  return findGrammarMatches(tokenized(text), {
    catalog: loadGrammarCatalog(),
    matchers: loadGrammarMatchers(),
  }).map(m => m.grammarId);
}

describe('grammar-matcher', () => {
  it('matches topic は only with a noun before it', () => {
    assert.ok(ids('犬は走る。').includes('n5-wa-topic'));
    assert.ok(!ids('雨ではない。').includes('n5-wa-topic'));
  });

  it('matches object を with noun before and verb after', () => {
    assert.ok(ids('本を読む。').includes('n5-wo-object'));
    assert.ok(!ids('本を。').includes('n5-wo-object'));
  });

  it('matches がある as a longer phrase and suppresses nested generic conflicts', () => {
    const matches = findGrammarMatches(tokenized('本がある。'), {
      catalog: loadGrammarCatalog(),
      matchers: loadGrammarMatchers(),
    });
    assert.ok(matches.some(m => m.grammarId === 'n5-ga-aru-existence'));
    const gaAru = matches.find(m => m.grammarId === 'n5-ga-aru-existence');
    assert.equal(gaAru.matchedText, 'がある');
    assert.equal(gaAru.tokenStart, 1);
    assert.equal(gaAru.tokenEnd, 2);
  });

  it('matches ている with both て and sound-change で connector tokens', () => {
    assert.ok(ids('見ている。').includes('n5-te-iru-progressive'));
    assert.ok(ids('読んでいる。').includes('n5-te-iru-progressive'));
  });

  it('does not match ている when いる is not the auxiliary continuation', () => {
    assert.ok(!ids('犬がいる。').includes('n5-te-iru-progressive'));
  });
});
```

- [ ] **Step 2: Run matcher tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "grammar-matcher"`

Expected: FAIL because `grammar-matcher.js` does not exist.

- [ ] **Step 3: Implement matcher engine**

Create `src/game/grammar/grammar-matcher.js`:

```js
export function findGrammarMatches(tokens, { catalog = [], matchers = [] } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const catalogMap = new Map(catalog.map(point => [point.id, point]));
  const matches = [];

  for (const matcher of matchers) {
    for (let start = 0; start <= tokens.length - matcher.tokens.length; start++) {
      if (!matchesAt(tokens, start, matcher.tokens)) continue;
      const display = matcher.display || {};
      const tokenStart = start + (display.startTokenOffset ?? 0);
      const tokenEnd = start + (display.endTokenOffset ?? matcher.tokens.length - 1);
      const point = catalogMap.get(matcher.grammarId) || {};
      matches.push({
        grammarId: matcher.grammarId,
        title: point.title || matcher.grammarId,
        meaning: point.meaning || '',
        shortExplanation: point.shortExplanation || '',
        displayPattern: point.displayPattern || '',
        readingOverride: point.readingOverride || '',
        matchedText: tokens.slice(tokenStart, tokenEnd + 1).map(t => t.surface || '').join(''),
        tokenStart,
        tokenEnd,
        priority: matcher.priority || 0,
        matcherType: matcher.type || 'token-sequence',
      });
    }
  }

  return resolveOverlaps(matches);
}

function matchesAt(tokens, start, specs) {
  for (let offset = 0; offset < specs.length; offset++) {
    if (!tokenMatches(tokens[start + offset], specs[offset])) return false;
  }
  return true;
}

function tokenMatches(token, spec) {
  if (!token) return false;
  for (const [key, expected] of Object.entries(spec)) {
    if (key === 'surfaceOneOf') {
      if (!expected.includes(token.surface)) return false;
      continue;
    }
    if (key === 'baseFormOneOf') {
      if (!expected.includes(token.baseForm)) return false;
      continue;
    }
    if (key === 'conjugationFormPrefix') {
      if (!String(token.conjugationForm || '').startsWith(expected)) return false;
      continue;
    }
    if (token[key] !== expected) return false;
  }
  return true;
}

function resolveOverlaps(matches) {
  const sorted = [...matches].sort(compareMatches);
  const accepted = [];
  for (const candidate of sorted) {
    const conflict = accepted.some(existing => overlaps(existing, candidate));
    if (!conflict) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.tokenStart - b.tokenStart || a.tokenEnd - b.tokenEnd || a.grammarId.localeCompare(b.grammarId));
}

function compareMatches(a, b) {
  return (b.priority - a.priority)
    || (spanLength(b) - spanLength(a))
    || a.grammarId.localeCompare(b.grammarId);
}

function spanLength(match) {
  return match.tokenEnd - match.tokenStart + 1;
}

function overlaps(a, b) {
  return a.tokenStart <= b.tokenEnd && b.tokenStart <= a.tokenEnd;
}
```

- [ ] **Step 4: Run matcher tests**

Run: `npm run test:unit -- --test-name-pattern "grammar-matcher"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/grammar/grammar-matcher.js tests/unit/grammar-matcher.test.js
git commit -m "$(cat <<'EOF'
Add deterministic grammar matcher

EOF
)"
```

---

## Task 4: Project Grammar Matches Onto Render Tokens

**Files:**
- Create: `src/game/grammar/annotate-tokens.js`
- Create: `tests/unit/grammar-annotate-tokens.test.js`

- [ ] **Step 1: Create failing annotation tests**

Create `tests/unit/grammar-annotate-tokens.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { annotateRenderTokens } from '../../src/game/grammar/annotate-tokens.js';

describe('annotateRenderTokens', () => {
  it('attaches grammar hints to surface-only particle render tokens without adding base', () => {
    const rawTokens = [
      { surface: '犬', index: 0 },
      { surface: 'は', index: 1, reading: 'は' },
      { surface: '走る', index: 2 },
    ];
    const renderTokens = [
      { surface: '犬', base: '犬', reading: 'いぬ', rawTokenStart: 0, rawTokenEnd: 0 },
      { surface: 'は', reading: 'は', rawTokenStart: 1, rawTokenEnd: 1 },
      { surface: '走る', base: '走る', reading: 'はしる', rawTokenStart: 2, rawTokenEnd: 2 },
    ];
    const matches = [{
      grammarId: 'n5-wa-topic',
      title: 'は',
      meaning: 'as for',
      shortExplanation: 'Marks what the sentence is talking about.',
      matchedText: 'は',
      tokenStart: 1,
      tokenEnd: 1,
    }];
    const out = annotateRenderTokens(renderTokens, rawTokens, matches);
    assert.equal(out[1].base, undefined);
    assert.equal(out[1].reading, 'は');
    assert.equal(out[1].grammarHints.length, 1);
    assert.equal(out[1].grammarHints[0].grammarId, 'n5-wa-topic');
  });

  it('attaches phrase grammar hints to every render token covered by raw span', () => {
    const rawTokens = [
      { surface: '読ん', index: 0 },
      { surface: 'で', index: 1 },
      { surface: 'いる', index: 2 },
    ];
    const renderTokens = [
      { surface: '読ん', base: '読む', rawTokenStart: 0, rawTokenEnd: 0 },
      { surface: 'で', rawTokenStart: 1, rawTokenEnd: 1 },
      { surface: 'いる', rawTokenStart: 2, rawTokenEnd: 2 },
    ];
    const matches = [{
      grammarId: 'n5-te-iru-progressive',
      title: '～ている',
      matchedText: '読んでいる',
      tokenStart: 0,
      tokenEnd: 2,
    }];
    const out = annotateRenderTokens(renderTokens, rawTokens, matches);
    assert.equal(out[0].grammarHints[0].matchedText, '読んでいる');
    assert.equal(out[1].grammarHints[0].matchedText, '読んでいる');
    assert.equal(out[2].grammarHints[0].matchedText, '読んでいる');
  });
});
```

- [ ] **Step 2: Run annotation tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "annotateRenderTokens"`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement annotation projection**

Create `src/game/grammar/annotate-tokens.js`:

```js
export function annotateRenderTokens(renderTokens, rawTokens, matches) {
  if (!Array.isArray(renderTokens) || !Array.isArray(matches) || matches.length === 0) {
    return renderTokens;
  }

  return renderTokens.map((token, renderIndex) => {
    const rawStart = token.rawTokenStart ?? renderIndex;
    const rawEnd = token.rawTokenEnd ?? rawStart;
    const grammarHints = matches
      .filter(match => rangesOverlap(rawStart, rawEnd, match.tokenStart, match.tokenEnd))
      .map(toHint);

    if (grammarHints.length === 0) return token;
    return { ...token, grammarHints };
  });
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function toHint(match) {
  return {
    grammarId: match.grammarId,
    title: match.title || match.grammarId,
    meaning: match.meaning || '',
    shortExplanation: match.shortExplanation || '',
    displayPattern: match.displayPattern || '',
    readingOverride: match.readingOverride || '',
    matchedText: match.matchedText || '',
    tokenStart: match.tokenStart,
    tokenEnd: match.tokenEnd,
  };
}
```

- [ ] **Step 4: Run annotation tests**

Run: `npm run test:unit -- --test-name-pattern "annotateRenderTokens"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/grammar/annotate-tokens.js tests/unit/grammar-annotate-tokens.test.js
git commit -m "$(cat <<'EOF'
Project grammar matches onto render tokens

EOF
)"
```

---

## Task 5: Preserve Raw Token Spans During Static Tokenization

**Files:**
- Modify: `scripts/tokenize-static.js`
- Modify: `tests/unit/tokenize-static.test.js`

- [ ] **Step 1: Add failing static-token span tests**

Append to `tests/unit/tokenize-static.test.js`:

```js
  it('surface-only particles preserve reading and raw token span for grammar', () => {
    const frame = frames.find(f => f.raw.includes('私の名前'));
    assert.ok(frame, 'expected a frame containing 私の名前');
    const particle = frame.tokens.find(t => t.surface === 'の' && !t.base);
    assert.ok(particle, 'should find surface-only の particle');
    assert.equal(particle.reading, 'の');
    assert.equal(typeof particle.rawTokenStart, 'number');
    assert.equal(typeof particle.rawTokenEnd, 'number');
  });

  it('merged dictionary tokens preserve the raw token span they came from', () => {
    const frame = frames.find(f => f.id === 'shopPurchase_excuse');
    assert.ok(frame, 'shopPurchase_excuse frame should exist');
    const sumimasen = frame.tokens.find(t => t.base === 'すみません');
    assert.ok(sumimasen, 'should find merged すみません');
    assert.equal(typeof sumimasen.rawTokenStart, 'number');
    assert.equal(typeof sumimasen.rawTokenEnd, 'number');
    assert.ok(sumimasen.rawTokenEnd >= sumimasen.rawTokenStart);
  });
```

- [ ] **Step 2: Run static token tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static output"`

Expected: FAIL because `rawTokenStart`, `rawTokenEnd`, and demoted particle `reading` are missing from `frames.json`.

- [ ] **Step 3: Update demoted token output**

In `scripts/tokenize-static.js`, change `toUniversalToken` demotion from:

```js
return { token: { surface: st.surface }, isContent: false };
```

To:

```js
return {
  token: {
    surface: st.surface,
    reading: st.reading || st.surface,
    rawTokenStart: st.rawTokenStart ?? st.index,
    rawTokenEnd: st.rawTokenEnd ?? st.index,
  },
  isContent: false
};
```

Change the content token return to include spans:

```js
token: {
  surface: st.surface,
  base: st.baseForm,
  reading,
  pos: SUDACHI_POS_EN[st.pos] || st.pos,
  rawTokenStart: st.rawTokenStart ?? st.index,
  rawTokenEnd: st.rawTokenEnd ?? st.index,
},
```

- [ ] **Step 4: Update merge span tracking**

In `mergeSudachiTokens`, when pushing a merged token, add:

```js
rawTokenStart: sudachiTokens[i].index,
rawTokenEnd: sudachiTokens[i + len - 1].index,
```

When pushing an unmerged token, preserve its span:

```js
const token = sudachiTokens[i];
merged.push({
  ...token,
  rawTokenStart: token.index,
  rawTokenEnd: token.index,
});
```

- [ ] **Step 5: Regenerate frames**

Run: `node scripts/tokenize-static.js`

Expected: prints `Wrote <N> frames to .../data/dialogue/frames.json`.

- [ ] **Step 6: Run static token tests**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static output"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/tokenize-static.js data/dialogue/frames.json tests/unit/tokenize-static.test.js
git commit -m "$(cat <<'EOF'
Preserve raw token spans in static dialogue tokens

EOF
)"
```

---

## Task 6: Bake Grammar Annotations Into Static Frames

**Files:**
- Modify: `scripts/tokenize-static.js`
- Modify: `tests/unit/tokenize-static.test.js`

- [ ] **Step 1: Add failing frame grammar annotation tests**

Append to `tests/unit/tokenize-static.test.js`:

```js
  it('bakes grammar hints into static frames without changing words', () => {
    const frame = frames.find(f => f.raw.includes('私の名前'));
    assert.ok(frame, 'expected 私の名前 frame');
    const originalWords = frame.words.slice();
    const particle = frame.tokens.find(t => t.surface === 'の' && !t.base);
    assert.ok(particle, 'should find の particle');
    assert.ok(Array.isArray(particle.grammarHints), 'particle should carry grammarHints when matched');
    assert.deepEqual(frame.words, originalWords, 'grammar hints must not affect words');
  });
```

If the current static corpus does not contain an enabled matcher from the starter set, add this test instead:

```js
  it('allows frames without grammar hints while preserving the grammarHints field contract', () => {
    const anyTokenWithHint = frames.flatMap(f => f.tokens).find(t => Array.isArray(t.grammarHints));
    assert.ok(anyTokenWithHint, 'expected at least one static token to have grammarHints after annotation');
  });
```

- [ ] **Step 2: Run static tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "grammar hints into static frames|grammarHints field contract"`

Expected: FAIL because static tokenization does not call the grammar matcher yet.

- [ ] **Step 3: Import grammar helpers**

At the top of `scripts/tokenize-static.js`, add:

```js
import { loadGrammarCatalog, loadGrammarMatchers } from '../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../src/game/grammar/grammar-matcher.js';
import { annotateRenderTokens } from '../src/game/grammar/annotate-tokens.js';
```

- [ ] **Step 4: Annotate each segment before adding tokens to the frame**

After `const allSegmentTokens = tokenizeBatch(textsToTokenize);`, add:

```js
  const grammarCatalog = loadGrammarCatalog();
  const grammarMatchers = loadGrammarMatchers();
```

Inside the segment processing loop, replace:

```js
    const mergedTokens = mergeSudachiTokens(allSegmentTokens[i]);
    for (const st of mergedTokens) {
      const { token, isContent } = toUniversalToken(st, wordDict);
      frame.tokens.push(token);
      if (isContent) frame.words.push(token.base);
    }
```

With:

```js
    const rawTokens = allSegmentTokens[i];
    const matches = findGrammarMatches(rawTokens, {
      catalog: grammarCatalog,
      matchers: grammarMatchers,
    });
    const mergedTokens = mergeSudachiTokens(rawTokens);
    const segmentRenderTokens = [];
    const segmentWords = [];
    for (const st of mergedTokens) {
      const { token, isContent } = toUniversalToken(st, wordDict);
      segmentRenderTokens.push(token);
      if (isContent) segmentWords.push(token.base);
    }
    const annotated = annotateRenderTokens(segmentRenderTokens, rawTokens, matches);
    frame.tokens.push(...annotated);
    frame.words.push(...segmentWords);
```

- [ ] **Step 5: Regenerate frames**

Run: `node scripts/tokenize-static.js`

Expected: `frames.json` contains at least one token with `grammarHints`.

- [ ] **Step 6: Run static token tests**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static output"`

Expected: PASS.

- [ ] **Step 7: Run dialogue validation**

Run: `node scripts/validate-dialogue.js`

Expected: validation completes with no frame errors. `grammarHints` must not be treated as words.

- [ ] **Step 8: Commit**

```bash
git add scripts/tokenize-static.js data/dialogue/frames.json tests/unit/tokenize-static.test.js
git commit -m "$(cat <<'EOF'
Bake grammar annotations into static dialogue frames

EOF
)"
```

---

## Task 7: Deprecate `grammar-words.json` as Dictionary Overlay

**Files:**
- Create: `data/curriculum-words.json` or modify existing `data/glue-words.json`
- Modify: `src/game/word-dictionary.js`
- Modify: `tests/unit/word-dictionary.test.js` if present, otherwise create `tests/unit/word-dictionary-grammar.test.js`

- [ ] **Step 1: Create failing dictionary overlay test**

Create `tests/unit/word-dictionary-grammar.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadWordDictionary } from '../../src/game/word-dictionary.js';

describe('word dictionary grammar migration', () => {
  it('does not load grammar-words.json as vocabulary definitions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-dict-'));
    const liveDictPath = join(dir, 'dictionary.json');
    writeFileSync(liveDictPath, '{}', 'utf-8');
    writeFileSync(join(dir, 'grammar-words.json'), JSON.stringify([
      { word: 'は', reading: 'は', en: 'topic marker' }
    ]), 'utf-8');

    const dict = loadWordDictionary({ overlayDir: dir, liveDictPath });
    assert.equal(dict.has('は'), false);
  });

  it('still loads non-grammar curriculum words from curriculum-words.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-dict-'));
    const liveDictPath = join(dir, 'dictionary.json');
    writeFileSync(liveDictPath, '{}', 'utf-8');
    writeFileSync(join(dir, 'curriculum-words.json'), JSON.stringify([
      { word: 'こんにちは', reading: 'こんにちは', en: 'hello' }
    ]), 'utf-8');

    const dict = loadWordDictionary({ overlayDir: dir, liveDictPath });
    assert.equal(dict.get('こんにちは')?.definitions?.[0]?.en, 'hello');
  });
});
```

- [ ] **Step 2: Run dictionary test and verify failure**

Run: `npm run test:unit -- --test-name-pattern "word dictionary grammar migration"`

Expected: FAIL because `grammar-words.json` is still loaded and `curriculum-words.json` is not.

- [ ] **Step 3: Create curriculum words file**

Create `data/curriculum-words.json` with true vocabulary from `data/grammar-words.json`:

```json
[
  { "word": "こんにちは", "reading": "こんにちは", "en": "hello", "stage": "area1-early" },
  { "word": "おはよう", "reading": "おはよう", "en": "good morning", "stage": "area1-early" },
  { "word": "ありがとう", "reading": "ありがとう", "en": "thank you", "stage": "area1-early" },
  { "word": "はい", "reading": "はい", "en": "yes", "stage": "area1-early" },
  { "word": "いいえ", "reading": "いいえ", "en": "no", "stage": "area1-early" },
  { "word": "なに", "reading": "なに", "en": "what", "stage": "area1-early" },
  { "word": "どこ", "reading": "どこ", "en": "where", "stage": "area1-early" },
  { "word": "ください", "reading": "ください", "en": "please", "stage": "area1-early" },
  { "word": "すみません", "reading": "すみません", "en": "excuse me / sorry", "stage": "area1-early" },
  { "word": "うん", "reading": "うん", "en": "yeah", "stage": "area1-early" },
  { "word": "ある", "reading": "ある", "en": "to exist", "stage": "area1-mid" },
  { "word": "いる", "reading": "いる", "en": "to exist / to be", "stage": "area1-mid" },
  { "word": "する", "reading": "する", "en": "to do", "stage": "area1-mid" },
  { "word": "なる", "reading": "なる", "en": "to become", "stage": "area1-mid" },
  { "word": "こと", "reading": "こと", "en": "thing / fact", "stage": "area1-mid" },
  { "word": "もの", "reading": "もの", "en": "thing", "stage": "area1-mid" },
  { "word": "よう", "reading": "よう", "en": "appearance / way", "stage": "area1-mid" }
]
```

Do not include particles or auxiliary-only entries such as `は`, `が`, `を`, `に`, `で`, `へ`, `と`, `も`, `の`, `ね`, `よ`, `か`, `ます`, `です`, `ない`, `れる`, or `られる` in `curriculum-words.json`.

- [ ] **Step 4: Stop loading grammar-words as dictionary overlay**

In `src/game/word-dictionary.js`, change:

```js
for (const file of ['glue-words.json', 'grammar-words.json']) {
```

To:

```js
for (const file of ['glue-words.json', 'curriculum-words.json']) {
```

- [ ] **Step 5: Run dictionary tests**

Run: `npm run test:unit -- --test-name-pattern "word dictionary grammar migration"`

Expected: PASS.

- [ ] **Step 6: Run dialogue validation**

Run: `node scripts/validate-dialogue.js`

Expected: PASS. If missing vocabulary appears because a true word stayed only in `grammar-words.json`, move that word into `curriculum-words.json` and rerun.

- [ ] **Step 7: Commit**

```bash
git add data/curriculum-words.json src/game/word-dictionary.js tests/unit/word-dictionary-grammar.test.js
git commit -m "$(cat <<'EOF'
Deprecate grammar words as vocabulary overlay

EOF
)"
```

---

## Task 8: Add Shared Tokenize-And-Annotate Helper

**Files:**
- Create: `src/game/grammar/tokenize-and-annotate.js`
- Create: `tests/unit/tokenize-and-annotate.test.js`

- [ ] **Step 1: Create failing helper tests**

Create `tests/unit/tokenize-and-annotate.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeAndAnnotate } from '../../src/game/grammar/tokenize-and-annotate.js';

describe('tokenizeAndAnnotate', () => {
  it('returns render tokens, words, and raw tokens with grammar hints', () => {
    const result = tokenizeAndAnnotate('本を読んでいる。', {
      mergeDictionary: new Map(),
    });
    assert.ok(Array.isArray(result.rawTokens));
    assert.ok(Array.isArray(result.tokens));
    assert.ok(Array.isArray(result.words));
    assert.ok(result.tokens.some(t => Array.isArray(t.grammarHints)));
    assert.ok(result.words.includes('本'));
    assert.ok(result.words.includes('読む'));
    assert.ok(!result.words.includes('を'), 'grammar particle must not become vocab word');
  });
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "tokenizeAndAnnotate"`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/game/grammar/tokenize-and-annotate.js` with a focused version of the static-token pipeline:

```js
import { tokenize } from '../../tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from './grammar-loader.js';
import { findGrammarMatches } from './grammar-matcher.js';
import { annotateRenderTokens } from './annotate-tokens.js';

const DEMOTED_POS = new Set(['助詞', '助動詞', '補助記号', '記号', '空白', '接尾辞', '接頭辞']);
const DEMOTED_BASE_FORMS = new Set(['いる', 'ある', 'しまう', 'おく', 'みる', 'くる', 'いく', 'だ', 'です', 'ます', 'する']);
const SUDACHI_POS_EN = {
  '名詞': 'Noun',
  '動詞': 'Verb',
  '形容詞': 'Adjective',
  '副詞': 'Adverb',
  '連体詞': 'Pre-noun',
  '接続詞': 'Conjunction',
  '感動詞': 'Interjection',
  '形状詞': 'Na-adjective',
  '代名詞': 'Pronoun',
  '助詞': 'Particle',
  '助動詞': 'Auxiliary',
  '接尾辞': 'Suffix',
  '接頭辞': 'Prefix',
};

export function tokenizeAndAnnotate(text, options = {}) {
  const rawTokens = tokenize(text);
  const catalog = options.catalog || loadGrammarCatalog();
  const matchers = options.matchers || loadGrammarMatchers();
  const matches = findGrammarMatches(rawTokens, { catalog, matchers });
  const renderTokens = rawTokens.map(toRenderToken);
  const annotated = annotateRenderTokens(renderTokens, rawTokens, matches);
  return {
    rawTokens,
    tokens: annotated,
    words: annotated.filter(t => t.base).map(t => t.base),
  };
}

function toRenderToken(st) {
  const rawTokenStart = st.rawTokenStart ?? st.index;
  const rawTokenEnd = st.rawTokenEnd ?? st.index;
  if (isDemoted(st)) {
    return {
      surface: st.surface,
      reading: st.reading || st.surface,
      rawTokenStart,
      rawTokenEnd,
    };
  }
  return {
    surface: st.surface,
    base: st.baseForm,
    reading: st.reading,
    pos: SUDACHI_POS_EN[st.pos] || st.pos,
    rawTokenStart,
    rawTokenEnd,
  };
}

function isDemoted(st) {
  if (DEMOTED_POS.has(st.pos)) return true;
  if (DEMOTED_BASE_FORMS.has(st.baseForm)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(st.surface)) return true;
  return false;
}
```

This helper intentionally does not implement dictionary merging yet. Static tokenization keeps its existing merge path. Later route integrations can use this helper for non-frame text.

- [ ] **Step 4: Run helper tests**

Run: `npm run test:unit -- --test-name-pattern "tokenizeAndAnnotate"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/grammar/tokenize-and-annotate.js tests/unit/tokenize-and-annotate.test.js
git commit -m "$(cat <<'EOF'
Add shared tokenize and annotate helper

EOF
)"
```

---

## Task 9: Annotate Parse-Text and Admin Preview Outputs

**Files:**
- Modify: `src/routes/game/known-words.js`
- Modify: `src/routes/admin-frame-audit.js`
- Create or modify route tests if existing tests cover these endpoints

- [ ] **Step 1: Add unit coverage for parse-text token shape**

If no parse-text route test exists, create `tests/unit/known-words-parse-text-grammar.test.js` with a router-level test using the existing route factory pattern. The assertion should verify that `POST /api/game/known-words/parse-text` for `本を読んでいる。` returns a token for `を` with grammar hint `n5-wo-object` and does not return it as a vocabulary word.

Use this assertion shape in the test:

```js
assert.ok(tokens.some(t =>
  t.spelling === 'を'
  && Array.isArray(t.grammarHints)
  && t.grammarHints.some(h => h.grammarId === 'n5-wo-object')
));
```

- [ ] **Step 2: Run parse-text test and verify failure**

Run: `npm run test:unit -- --test-name-pattern "parse-text.*grammar|known-words.*grammar"`

Expected: FAIL because parse-text does not include grammar hints.

- [ ] **Step 3: Update parse-text route**

In `src/routes/game/known-words.js`, import:

```js
import { tokenizeAndAnnotate } from '../../game/grammar/tokenize-and-annotate.js';
```

Inside `router.post('/parse-text'...)`, replace:

```js
const tokens = tokenize(text);
const enriched = tokens.map(t => {
```

With:

```js
const annotated = tokenizeAndAnnotate(text);
const tokens = annotated.rawTokens;
const grammarByIndex = new Map();
for (const token of annotated.tokens) {
  if (Array.isArray(token.grammarHints)) {
    grammarByIndex.set(token.rawTokenStart, token.grammarHints);
  }
}
const enriched = tokens.map(t => {
```

Add `grammarHints` to the returned token object:

```js
grammarHints: grammarByIndex.get(t.index) || []
```

- [ ] **Step 4: Update admin frame audit preview**

In `src/routes/admin-frame-audit.js`, import grammar helpers:

```js
import { loadGrammarCatalog, loadGrammarMatchers } from '../game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../game/grammar/grammar-matcher.js';
import { annotateRenderTokens } from '../game/grammar/annotate-tokens.js';
```

In the tokenize preview handler, after `const batches = tokenizeBatch(raws);`, load catalog and matchers once:

```js
const grammarCatalog = loadGrammarCatalog();
const grammarMatchers = loadGrammarMatchers();
```

When normalizing each batch, call:

```js
const renderTokens = normalizeTokens(rawTokens);
const matches = findGrammarMatches(rawTokens, { catalog: grammarCatalog, matchers: grammarMatchers });
return annotateRenderTokens(renderTokens, rawTokens, matches);
```

- [ ] **Step 5: Run focused tests**

Run: `npm run test:unit -- --test-name-pattern "parse-text.*grammar|known-words.*grammar|admin-frame"`

Expected: PASS. If this fails, stop and inspect whether the failure is from grammar annotation or admin auth setup before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/routes/game/known-words.js src/routes/admin-frame-audit.js tests/unit/
git commit -m "$(cat <<'EOF'
Annotate parse text and admin token previews with grammar hints

EOF
)"
```

---

## Task 10: Render Grammar-Only Clickable Tokens

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`
- Modify: `tests/unit/ui/bootstrap-swap.test.js` or create `tests/unit/ui/grammar-renderer.test.js`

- [ ] **Step 1: Create failing renderer tests**

Create `tests/unit/ui/grammar-renderer.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence } from '../../../public/js/ui/bootstrap-client.js';

describe('renderJpSentence grammar hints', () => {
  it('renders grammar-only particles as clickable without data-base', () => {
    const html = renderJpSentence([
      { surface: '本', base: '本', reading: 'ほん', meaning: 'book', pos: 'Noun' },
      {
        surface: 'を',
        reading: 'を',
        grammarHints: [{
          grammarId: 'n5-wo-object',
          title: 'を',
          meaning: 'object marker',
          shortExplanation: 'Marks the thing that receives the action.',
          matchedText: 'を',
          readingOverride: 'を',
        }],
      },
      { surface: '読む', base: '読む', reading: 'よむ', meaning: 'read', pos: 'Verb' },
    ], new Set(['本', '読む']), null, {}, false);

    assert.match(html, /class="jp-grammar/);
    assert.match(html, /data-grammar-hints=/);
    assert.doesNotMatch(html, /class="jp-grammar[^"]*"[^>]*data-base=/);
    assert.match(html, /<rt>wo<\/rt>/);
  });

  it('adds grammar hint data to normal vocabulary word spans', () => {
    const html = renderJpSentence([
      {
        surface: '読ん',
        base: '読む',
        reading: 'よん',
        meaning: 'read',
        pos: 'Verb',
        grammarHints: [{
          grammarId: 'n5-te-iru-progressive',
          title: '～ている',
          meaning: 'is/am/are doing',
          shortExplanation: 'Shows an action happening right now.',
          matchedText: '読んでいる',
        }],
      },
    ], new Set(), null, {}, false);

    assert.match(html, /class="jp-word jp-unknown"/);
    assert.match(html, /data-grammar-hints=/);
  });
});
```

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "renderJpSentence grammar hints"`

Expected: FAIL because grammar-only tokens render as punctuation and no `data-grammar-hints` is emitted.

- [ ] **Step 3: Update renderer data attributes**

In `public/js/ui/bootstrap-client.js`, add helper near `esc`:

```js
function grammarHintsAttr(token) {
  if (!Array.isArray(token.grammarHints) || token.grammarHints.length === 0) return '';
  return ` data-grammar-hints="${esc(JSON.stringify(token.grammarHints))}"`;
}
```

In content-token data attributes, append:

```js
dataAttrs += grammarHintsAttr(token);
```

- [ ] **Step 4: Render grammar-only tokens before punctuation fallback**

Inside `renderJpSentence`, before:

```js
if (!isContentExposureToken(token)) {
```

Add:

```js
    if (!isContentExposureToken(token) && Array.isArray(token.grammarHints) && token.grammarHints.length > 0) {
      const displayReading = token.grammarHints.find(h => h.readingOverride)?.readingOverride || token.reading || surface;
      const dataAttrs = ` data-reading="${esc(displayReading)}"${grammarHintsAttr(token)}`;
      rendered.push(`<span class="jp-grammar"${dataAttrs}>`
        + `<ruby>${esc(surface)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
        + `</span>`);
      continue;
    }
```

Leave the existing punctuation branch in place after this new grammar-only branch.

- [ ] **Step 5: Run renderer tests**

Run: `npm run test:unit -- --test-name-pattern "renderJpSentence grammar hints"`

Expected: PASS.

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo OK`

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/bootstrap-client.js tests/unit/ui/grammar-renderer.test.js
git commit -m "$(cat <<'EOF'
Render clickable grammar-only tokens

EOF
)"
```

---

## Task 11: Show Grammar Hints in Lookup Popup

**Files:**
- Modify: `public/js/ui/dialogue-word-lookup.js`
- Modify: `public/game.css`
- Modify: `tests/unit/dialogue-word-lookup.test.js`

- [ ] **Step 1: Add unit tests for grammar hint parsing**

Append to `tests/unit/dialogue-word-lookup.test.js`:

```js
const { buildPopupMeanings, parseGrammarHints } = await import('../../public/js/ui/dialogue-word-lookup.js');

describe('parseGrammarHints', () => {
  it('parses grammar hints from data attribute JSON', () => {
    const hints = parseGrammarHints(JSON.stringify([
      {
        grammarId: 'n5-wo-object',
        title: 'を',
        meaning: 'object marker',
        shortExplanation: 'Marks the thing that receives the action.',
        matchedText: 'を',
      }
    ]));
    assert.equal(hints.length, 1);
    assert.equal(hints[0].grammarId, 'n5-wo-object');
  });

  it('returns empty array for invalid grammar JSON', () => {
    assert.deepEqual(parseGrammarHints('{bad json'), []);
  });
});
```

If the file already imports `buildPopupMeanings`, adjust the import instead of duplicating it.

- [ ] **Step 2: Run popup tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern "parseGrammarHints|buildPopupMeanings"`

Expected: FAIL because `parseGrammarHints` is not exported.

- [ ] **Step 3: Export grammar hint parser**

In `public/js/ui/dialogue-word-lookup.js`, add:

```js
export function parseGrammarHints(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Allow attaching handlers to grammar-only spans**

Change:

```js
const words = container.querySelectorAll('.jp-word');
```

To:

```js
const words = container.querySelectorAll('.jp-word, .jp-grammar');
```

Change:

```js
if (!span.dataset.base) continue;
```

To:

```js
if (!span.dataset.base && !span.dataset.grammarHints) continue;
```

- [ ] **Step 5: Update click handler for grammar-only spans**

In `handleWordClick`, change:

```js
const base = span.dataset.base;
if (!base) return;
```

To:

```js
const base = span.dataset.base || '';
const grammarHints = parseGrammarHints(span.dataset.grammarHints || '');
if (!base && grammarHints.length === 0) return;
```

Set `_currentWord` only for vocab:

```js
_currentWord = base || null;
```

Set popup word for grammar-only:

```js
const headword = base || grammarHints[0]?.matchedText || span.textContent || '';
dom.word.innerHTML = buildHeadwordRuby(headword, reading, useKanji);
```

After meaning list rendering, append grammar hints:

```js
  for (const hint of grammarHints) {
    const section = document.createElement('div');
    section.className = 'lookup-grammar-hint';

    const label = document.createElement('div');
    label.className = 'lookup-grammar-label';
    label.textContent = 'Grammar Hint';

    const title = document.createElement('div');
    title.className = 'lookup-grammar-title';
    title.textContent = `${hint.title}${hint.meaning ? ` - ${hint.meaning}` : ''}`;

    const explanation = document.createElement('div');
    explanation.className = 'lookup-grammar-explanation';
    explanation.textContent = hint.shortExplanation || '';

    section.append(label, title, explanation);
    dom.meanings.appendChild(section);
  }
```

For grammar-only clicks, hide SRS controls:

```js
if (!base) {
  dom.stateContainer.style.display = 'none';
  dom.forgotBtn.style.display = 'none';
  dom.knewBtn.style.display = 'none';
  dom.popup.classList.add('visible');
  return;
}

dom.forgotBtn.style.display = '';
dom.knewBtn.style.display = '';
```

- [ ] **Step 6: Add CSS**

In `public/game.css`, add near lookup popup styles:

```css
.jp-grammar {
  cursor: pointer;
  display: inline-block;
  color: inherit;
}

.jp-grammar ruby rt {
  font-size: 0.65em;
  color: var(--text-secondary);
}

.lookup-grammar-hint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
}

.lookup-grammar-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent-blue, #68b7ff);
  margin-bottom: 4px;
}

.lookup-grammar-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 3px;
}

.lookup-grammar-explanation {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.35;
}
```

- [ ] **Step 7: Run popup tests**

Run: `npm run test:unit -- --test-name-pattern "parseGrammarHints|buildPopupMeanings|dialogue word lookup"`

Expected: PASS.

- [ ] **Step 8: Syntax check**

Run: `node --check public/js/ui/dialogue-word-lookup.js && echo OK`

Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/dialogue-word-lookup.js public/game.css tests/unit/dialogue-word-lookup.test.js
git commit -m "$(cat <<'EOF'
Show grammar hints in dialogue lookup popup

EOF
)"
```

---

## Task 12: Build Full N5 Catalog and Matcher Coverage

**Files:**
- Modify: `data/grammar-catalog.json`
- Modify: `data/grammar-matchers.json`
- Create: `tests/unit/grammar-n5-fixtures.test.js`
- Create: `tests/fixtures/grammar-n5.json`

- [ ] **Step 1: Create N5 fixture test harness**

Create `tests/fixtures/grammar-n5.json` with the starter fixture set:

```json
[
  {
    "grammarId": "n5-wa-topic",
    "positive": ["犬は走る。", "私はミラです。"],
    "negative": ["雨ではない。"]
  },
  {
    "grammarId": "n5-wo-object",
    "positive": ["本を読む。", "水を飲む。"],
    "negative": ["本を。"]
  },
  {
    "grammarId": "n5-ga-aru-existence",
    "positive": ["本がある。", "水がある。"],
    "negative": ["犬が走る。"]
  },
  {
    "grammarId": "n5-te-iru-progressive",
    "positive": ["見ている。", "読んでいる。"],
    "negative": ["犬がいる。"]
  }
]
```

Create `tests/unit/grammar-n5-fixtures.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const FIXTURE_PATH = join(import.meta.dirname, '../fixtures/grammar-n5.json');
const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

function tokenizeFixtureSentences(fixtures) {
  const sentences = [...new Set(fixtures.flatMap(f => [...f.positive, ...f.negative]))];
  const batches = tokenizeBatch(sentences);
  return new Map(sentences.map((sentence, index) => [sentence, batches[index]]));
}

describe('N5 grammar fixtures', () => {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const tokenCache = tokenizeFixtureSentences(fixtures);

  for (const fixture of fixtures) {
    it(`${fixture.grammarId} matches positive examples`, () => {
      for (const sentence of fixture.positive) {
        const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers });
        assert.ok(
          matches.some(m => m.grammarId === fixture.grammarId),
          `${fixture.grammarId} should match ${sentence}`
        );
      }
    });

    it(`${fixture.grammarId} rejects negative examples`, () => {
      for (const sentence of fixture.negative) {
        const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers });
        assert.equal(
          matches.some(m => m.grammarId === fixture.grammarId),
          false,
          `${fixture.grammarId} should not match ${sentence}`
        );
      }
    });
  }

  it('every enabled N5 catalog entry has a matcher and fixture coverage', () => {
    const enabledIds = catalog.filter(p => p.level === 'N5' && p.status === 'enabled').map(p => p.id);
    const matcherIds = new Set(matchers.map(m => m.grammarId));
    const fixtureIds = new Set(fixtures.map(f => f.grammarId));
    for (const id of enabledIds) {
      assert.ok(matcherIds.has(id), `${id} missing matcher`);
      assert.ok(fixtureIds.has(id), `${id} missing fixture coverage`);
    }
  });

  it('cataloged-but-not-detectable entries include an explicit reason', () => {
    for (const point of catalog.filter(p => p.status === 'cataloged-not-detectable')) {
      assert.ok(point.notDetectableReason && point.notDetectableReason.length > 10, `${point.id} missing reason`);
    }
  });
});
```

- [ ] **Step 2: Run fixture tests**

Run: `npm run test:unit -- --test-name-pattern "N5 grammar fixtures"`

Expected: PASS for starter entries.

- [ ] **Step 3: Expand `data/grammar-catalog.json` to all N5 entries**

Use the Bunpro grammar list order from `https://bunpro.jp/grammar_points`. For every N5 entry:

- Use a Koto ID, not Bunpro numbering, e.g. `n5-te-iru-progressive`.
- Remove player-facing numbered senses such as `①`.
- Write original Koto short explanations.
- Include `status: "enabled"` only when the matcher will ship in this task.
- Use `status: "cataloged-not-detectable"` plus `notDetectableReason` when a reliable deterministic matcher is not ready.
- Include `tempSourceDeleteTagLater` with the Bunpro URL.

Before moving on, run a local JSON parse check:

```bash
node -e "JSON.parse(require('fs').readFileSync('data/grammar-catalog.json','utf8')); console.log('catalog ok')"
```

Expected: `catalog ok`.

- [ ] **Step 4: Expand matchers and fixtures incrementally**

For each new enabled N5 grammar point:

1. Add or update a matcher in `data/grammar-matchers.json`.
2. Add one positive fixture sentence.
3. Add one negative or ambiguous fixture sentence.
4. Run:

```bash
npm run test:unit -- --test-name-pattern "N5 grammar fixtures"
```

Expected: PASS before adding the next grammar point.

Use `status: "cataloged-not-detectable"` instead of weak generic matchers for ambiguous particles and broad concept points that cannot be detected safely.

- [ ] **Step 5: Run full grammar unit tests**

Run: `npm run test:unit -- --test-name-pattern "grammar"`

Expected: PASS.

- [ ] **Step 6: Run the N5 matcher stress gate before shipping enabled matchers**

Do not consider N5 complete until Task 13's stress-test gate passes:

- enabled matcher hit rate is at least 98% on adjudicated in-scope positive examples;
- enabled matcher false positive rate is exactly 0% on adjudicated negative and near-miss examples;
- every miss is either fixed by general matcher logic or explicitly moved to `knownMisses` with a reason;
- every false positive is fixed before the matcher remains enabled.

If the stress gate fails, return to Step 4 and improve matcher logic. Do not hardcode sentence-specific exceptions into `frame-sources` or fixtures.

- [ ] **Step 7: Commit**

```bash
git add data/grammar-catalog.json data/grammar-matchers.json tests/fixtures/grammar-n5.json tests/unit/grammar-n5-fixtures.test.js
git commit -m "$(cat <<'EOF'
Add N5 grammar catalog and deterministic matcher coverage

EOF
)"
```

---

## Task 13: Subagent Stress Test and Harden N5 Matchers

**Files:**
- Create: `tests/fixtures/grammar-n5-stress.json`
- Create: `tests/unit/grammar-stress-metrics.test.js`
- Modify: `data/grammar-matchers.json`
- Modify: `data/grammar-catalog.json` only to change matcher `status` or document `notDetectableReason`

- [ ] **Step 1: Dispatch independent matcher-audit subagents**

Use at least two fresh subagents to independently stress-test the enabled N5 matchers. Give each subagent this prompt, changing only the requested focus area so their examples differ:

```text
You are stress-testing Koto's deterministic Japanese grammar matchers.

Workspace: /Users/michiarohrssen/Documents/Claude/koto-wt-grammar-tracking-system

Do not modify files. Use the real tokenizer and matcher only:
- src/tokenizer.js
- scripts/sudachi-tokenize.py
- src/game/grammar/grammar-matcher.js
- data/grammar-catalog.json
- data/grammar-matchers.json

Generate at least 150 Japanese sentences focused on <FOCUS AREA>.
Use real Sudachi tokenization and findGrammarMatches. Do not hand-build tokens.

For each enabled matcher, report:
- true positives
- false positives
- false negatives
- ambiguous cases where no hint is safer
- exact Japanese sentence
- observed matched grammar IDs
- why the expected outcome is correct

Use "prefer no hint over a wrong hint" as the primary rule.
Do not propose sentence-specific hardcoding. Recommend only general matcher-logic changes, such as POS alternatives, optional token support, bounded skip patterns, negative guards, priorities, or disabling an unsafe matcher.
```

Run the subagents with different focus areas:

- common beginner dialogue with pronouns, names, `さん`, demonstratives, and short sentences;
- adversarial particle near-misses for `は`, `を`, `がある`, and `ている`;
- if a third subagent is available, motion/path/object ambiguity and negation/auxiliary chains.

- [ ] **Step 2: Convert subagent findings into adjudicated stress fixtures**

Create `tests/fixtures/grammar-n5-stress.json`:

```json
[
  {
    "sentence": "私は学生だ。",
    "expected": ["n5-wa-topic"],
    "knownMisses": [],
    "notes": "Pronoun topic は should be detected."
  },
  {
    "sentence": "公園を歩く。",
    "expected": [],
    "knownMisses": [],
    "notes": "Motion/path を must not be taught as object marker."
  },
  {
    "sentence": "行ったことがある。",
    "expected": [],
    "knownMisses": [],
    "notes": "Experience ことがある is not N5 existence がある."
  }
]
```

Rules for this fixture file:

- `expected` lists grammar IDs that should match.
- `knownMisses` lists grammar IDs that should match eventually but are deliberately accepted misses for now.
- Any case with `knownMisses` must have a concrete `notes` explanation.
- False positives are never allowed. If a matcher fires when `expected` does not include it, fix or disable the matcher.

- [ ] **Step 3: Write the failing metrics gate**

Create `tests/unit/grammar-stress-metrics.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const STRESS_PATH = join(import.meta.dirname, '../fixtures/grammar-n5-stress.json');
const stressCases = JSON.parse(readFileSync(STRESS_PATH, 'utf-8'));
const MIN_HIT_RATE = 0.98;

describe('N5 grammar stress metrics', () => {
  const catalog = loadGrammarCatalog();
  const enabledIds = new Set(catalog.filter(p => p.level === 'N5' && p.status === 'enabled').map(p => p.id));
  const matchers = loadGrammarMatchers();
  const sentences = stressCases.map(c => c.sentence);
  const tokenized = tokenizeBatch(sentences);

  it('has no false positives on adjudicated stress cases', () => {
    const failures = [];
    for (let i = 0; i < stressCases.length; i++) {
      const testCase = stressCases[i];
      const expected = new Set(testCase.expected || []);
      const observed = findGrammarMatches(tokenized[i], { catalog, matchers }).map(m => m.grammarId);
      for (const id of observed) {
        if (enabledIds.has(id) && !expected.has(id)) {
          failures.push(`${testCase.sentence}: unexpected ${id}; expected [${[...expected].join(', ')}]`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  it('hits at least 98 percent of adjudicated in-scope positives', () => {
    let expectedCount = 0;
    let hitCount = 0;
    const misses = [];

    for (let i = 0; i < stressCases.length; i++) {
      const testCase = stressCases[i];
      const knownMisses = new Set(testCase.knownMisses || []);
      const expected = (testCase.expected || []).filter(id => enabledIds.has(id) && !knownMisses.has(id));
      const observed = new Set(findGrammarMatches(tokenized[i], { catalog, matchers }).map(m => m.grammarId));
      for (const id of expected) {
        expectedCount += 1;
        if (observed.has(id)) {
          hitCount += 1;
        } else {
          misses.push(`${testCase.sentence}: missed ${id}`);
        }
      }
    }

    const hitRate = expectedCount === 0 ? 1 : hitCount / expectedCount;
    assert.ok(hitRate >= MIN_HIT_RATE, `hit rate ${hitRate.toFixed(3)} below ${MIN_HIT_RATE}; misses: ${misses.join(' | ')}`);
  });

  it('requires every accepted miss to have a reason', () => {
    for (const testCase of stressCases) {
      if ((testCase.knownMisses || []).length > 0) {
        assert.ok(testCase.notes && testCase.notes.length > 20, `${testCase.sentence} has knownMisses without a clear note`);
      }
    }
  });
});
```

- [ ] **Step 4: Run stress metrics and verify failure before hardening**

Run:

```bash
npm run test:unit -- --test-name-pattern "N5 grammar stress metrics"
```

Expected before hardening: FAIL if subagent findings exposed misses or false positives.

- [ ] **Step 5: Harden matcher logic without hardcoding sentences**

Use only general matcher improvements:

- POS alternatives, e.g. `pos0OneOf: ["名詞", "代名詞"]`.
- Optional token support, e.g. noun + optional `接尾辞,名詞的` + `は`.
- Bounded skip patterns for counters, e.g. `が + 数詞 + 接尾辞 + ある`.
- Negative guards, e.g. suppress `がある` for `ことがある` or polite negative `ありません`.
- Priority changes so more specific patterns win over generic particles.
- Disabling or broadening the player-facing meaning of a matcher if Sudachi cannot distinguish the senses safely.

Verified matcher DSL patterns from the starter hardening pass:

- Use generic `*OneOf` constraints for field alternatives, e.g. `pos0OneOf`, `baseFormOneOf`, and `surfaceOneOf`.
- Use `reject` guard groups with relative `offset` values for semantic near-misses, e.g. motion/path `を`, `ことがある`, and polite negative `ありません`.
- Use `sameBaseFormAsOffset` for repeated-token constructions such as `XはXでも`, so matchers can reject broad contrast/concession patterns without listing nouns.
- Represent noun-suffix topics as a separate matcher pattern (`名詞|代名詞 + 接尾辞,名詞的 + は`) rather than a sentence-specific exception.
- Represent quoted topics as a separate matcher pattern that bridges closing quote punctuation before `は`, rather than making punctuation generally ignorable.
- Represent counter-separated existence as a separate matcher pattern (`名詞|代名詞 + が + 数詞 + 接尾辞 + ある`) rather than loosening adjacency globally.
- Add parallel counter patterns for Sudachi variants where the counter is tagged as `名詞` or where the quantity appears as one noun token.
- Represent passive/causative `ている` as a separate auxiliary-chain matcher (`動詞 + 助動詞(連用形*) + て/で + いる`) rather than weakening the basic progressive matcher.
- Represent casual `てる`/`でる` contractions as separate matcher patterns over Sudachi's fused auxiliary token.
- If a surface grammar form reliably covers both ongoing actions and current states in beginner-facing text, broaden the Koto-owned explanation instead of forcing a too-narrow label that creates semantic false positives.

Do not:

- add sentence text to matcher logic;
- edit `frame-sources`;
- add runtime AI;
- accept any false positive for an enabled matcher.

- [ ] **Step 6: Re-run stress metrics after every matcher change**

Run:

```bash
npm run test:unit -- --test-name-pattern "N5 grammar stress metrics|N5 grammar fixtures|grammar-matcher"
```

Expected final result:

- PASS;
- 0 false positives;
- hit rate at least 0.98 for in-scope enabled positives.

- [ ] **Step 7: Record miss-rate notes in the fixture file**

For every `knownMisses` case that remains, make sure `notes` explains why it is intentionally not counted against the current enabled matcher target. Examples:

- "Casual contraction `見てる` is tokenized as one auxiliary; separate matcher planned."
- "Motion/path を intentionally excluded until a separate motion-を grammar point is enabled."
- "Broad discourse context cannot be detected from Sudachi morphology alone."

- [ ] **Step 8: Commit**

```bash
git add data/grammar-catalog.json data/grammar-matchers.json tests/fixtures/grammar-n5-stress.json tests/unit/grammar-stress-metrics.test.js tests/fixtures/grammar-n5.json tests/unit/grammar-n5-fixtures.test.js
git commit -m "$(cat <<'EOF'
Stress test and harden N5 grammar matchers

EOF
)"
```

---

## Task 14: Wire Grammar Annotation Through Token-Producing Routes

**Files:**
- Audit and modify: `src/routes/game/run.js`
- Audit and modify: `src/routes/game/combat.js`
- Audit and modify: `src/routes/game/misc.js`
- Audit and modify: `src/game/dialogue-filter.js`
- Audit and modify: `src/game/token-format.js`

- [ ] **Step 1: Enumerate token-producing sites**

Run:

```bash
rg "tokens\\s*:|assembleFrame\\(|getEligibleFrameTokens\\(|selectBestFrame\\(|selectNpcLine\\(|selectBark\\(" src/routes src/game
```

Expected: list of all server routes/helpers that return tokens consumed by `renderJpSentence()`.

- [ ] **Step 2: Classify each site**

For each result, write one of these decisions in the implementation notes before editing:

- Already uses `frames.json` tokens, so grammar annotations are baked at build time.
- Builds tokens dynamically from an entity, so no Sudachi grammar annotation is needed.
- Tokenizes free Japanese text, so it must call `tokenizeAndAnnotate()`.
- Selects a line from dialogue frames, so preserve existing `grammarHints`.

- [ ] **Step 3: Add focused tests for any dynamic text sites**

For every site classified as "tokenizes free Japanese text", add a test asserting grammar hints are present in its response for an N5 fixture sentence. Use route tests if the endpoint has existing coverage; otherwise add a unit test around the helper that constructs the response.

- [ ] **Step 4: Wire helpers**

Replace ad hoc `tokenize(text)` plus token formatting with `tokenizeAndAnnotate(text)` only for free-text Japanese sources. Do not re-annotate frame tokens that already come from `frames.json`.

- [ ] **Step 5: Run route/helper tests**

Run:

```bash
npm run test:unit -- --test-name-pattern "grammar|dialogue|known-words|combat|run|misc"
```

Expected: PASS. If unrelated pre-existing failures appear, stop and record the failing test names before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/routes src/game tests/unit
git commit -m "$(cat <<'EOF'
Wire grammar annotations through token-producing routes

EOF
)"
```

---

## Task 15: Verification and Visual Check

**Files:**
- No code files unless verification finds a bug.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check public/js/ui/bootstrap-client.js && node --check public/js/ui/dialogue-word-lookup.js && echo OK
```

Expected: `OK`.

- [ ] **Step 2: Run static generation and validation**

Run:

```bash
node scripts/tokenize-static.js && node scripts/validate-dialogue.js
```

Expected: frames regenerate and validation passes.

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 5: Run full gate**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Ask before Playwright visual verification**

This change affects UI rendering and must be visually checked, but project rules say not to launch Playwright without asking. Ask the user:

```text
Grammar hint UI is implemented and tests pass. May I open Playwright to visually verify a clicked grammar particle and a clicked grammar phrase?
```

- [ ] **Step 7: If approved, run visual check**

Start dev server:

```bash
npm run dev
```

Verify server:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

Use Playwright MCP following `docs/playtest-guide.md`. Navigate to `http://localhost:5173`, reach a dialogue surface containing an N5 grammar hint, click a grammar-only particle, and screenshot the popup. Confirm:

- particle displays romaji above it;
- popup shows `Grammar Hint`;
- vocab SRS actions are hidden for grammar-only particle;
- clicking a phrase token shows both word meaning and grammar hint when both exist.

Delete any screenshots immediately after display.

- [ ] **Step 8: Commit any verification fixes**

If visual verification required fixes:

```bash
git add public/js/ui/bootstrap-client.js public/js/ui/dialogue-word-lookup.js public/game.css tests/unit/ui/grammar-renderer.test.js tests/unit/dialogue-word-lookup.test.js
git commit -m "$(cat <<'EOF'
Fix grammar hint visual verification issues

EOF
)"
```

If visual fixes touched different files, add those exact files instead of the list above. If no fixes were needed, skip this commit.

---

## Task 16: Repeatable Expansion Template for N4-N1

**Files:**
- Modify later: `data/grammar-catalog.json`
- Modify later: `data/grammar-matchers.json`
- Modify later: `tests/fixtures/grammar-n4.json`, `grammar-n3.json`, `grammar-n2.json`, `grammar-n1.json`
- Modify later: `tests/fixtures/grammar-n4-stress.json`, `grammar-n3-stress.json`, `grammar-n2-stress.json`, `grammar-n1-stress.json`
- Modify later: `tests/unit/grammar-level-fixtures.test.js`
- Modify later: `tests/unit/grammar-stress-metrics.test.js`

- [ ] **Step 1: After N5 ships, create a level fixture file**

For each next level, create `tests/fixtures/grammar-<level>.json` using the same schema as N5:

```json
[
  {
    "grammarId": "n4-example-id",
    "positive": ["日本語の例文。"],
    "negative": ["別の例文。"]
  }
]
```

- [ ] **Step 2: Add catalog entries first**

Add every Bunpro-ordered grammar point for that level to `data/grammar-catalog.json` with:

- Koto-owned `id`
- Koto-owned `title`
- Koto-owned `shortExplanation`
- `readingOverride` when grammar pronunciation differs from Sudachi output, such as topic `は` pronounced `わ`
- `status`
- `tempSourceDeleteTagLater`

- [ ] **Step 3: Enable matchers one at a time**

For each point:

1. Add matcher.
2. Add fixtures.
3. Run level tests.
4. Keep ambiguous entries as `cataloged-not-detectable` until reliable.

- [ ] **Step 4: Run subagent stress testing before enabling a level**

For each level after N5:

1. Dispatch at least two fresh subagents with the Task 13 stress-test prompt, focused on that level's enabled matchers.
2. Convert findings into `tests/fixtures/grammar-<level>-stress.json`.
3. Run the stress metrics gate.
4. Do not enable the level unless enabled matchers have at least a 98% hit rate on adjudicated in-scope positives and 0 false positives.
5. If a matcher cannot meet 0 false positives, mark the grammar point `cataloged-not-detectable` or narrow the player-facing claim until the hint is always correct.

- [ ] **Step 5: Track miss rate over time**

Keep stress fixtures in source control. When a known miss is fixed, remove it from `knownMisses` and add it to `expected`. The miss rate must trend downward and never be hidden by deleting difficult examples.

- [ ] **Step 6: Remove temporary source field later**

When all levels are stable, perform a cleanup task:

```bash
rg "tempSourceDeleteTagLater" data/grammar-catalog.json
```

Then remove the field from every catalog entry and update catalog validation to reject it.

---

## Self-Review Checklist

- [ ] Spec coverage: rich Sudachi fields, Mode A, unmerged matching, projection, grammar catalog/matchers, `grammar-words.json` deprecation, static frame bake, parse-text/admin/runtime surfaces, UI popup, subagent stress testing, miss-rate metrics, tests, and expansion path all have tasks.
- [ ] Placeholder scan: no task relies on unresolved filler phrases or vague edge-case instructions without concrete steps.
- [ ] Type consistency: `grammarHints`, `grammarId`, `matchedText`, `tokenStart`, `tokenEnd`, `rawTokenStart`, `rawTokenEnd`, `readingOverride`, `conjugationFormPrefix`, and `tempSourceDeleteTagLater` are used consistently.
- [ ] Verification: final task includes syntax checks, static generation, dialogue validation, unit tests, integration tests, full gate, and visual verification request.
