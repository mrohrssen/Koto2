# Grammar Allowlist Reform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two divergent "free word" mechanisms (the `ALLOWED_WORDS` set in `src/game/vocab-repair.js` and the demotion rules inside `scripts/tokenize-static.js`) with one shared grammar allowlist consumed by both validators, fix the known budget bugs (くださる, noise interjections, kana auxiliaries, honorific suffixes), and start tracking the five core question words as taught vocabulary.

**Architecture:** A new `data/grammar-allowlist.json` (three lists: `demotedPos`, `demotedBaseForms`, `allowedSurfaces`) with a loader/predicate module `src/game/grammar-allowlist.js`. `checkSentenceViolations` (AI text) and `tokenize-static.js` (frames pipeline) both consume the predicate, so a word is free on one side iff it is free on the other. Question words 何/どう/どこ/誰/いつ leave the free list and get FSRS cards created at prologue-complete (+ a one-time backfill for existing users). frames.json is regenerated; affected test assertions updated.

**Tech Stack:** Node ESM, node:test + assert/strict (`--experimental-test-module-mocks` available), Sudachi via `python3 scripts/sudachi-tokenize.py` (spawned by `src/tokenizer.js` and `scripts/tokenize-static.js`).

**Origin:** Follow-up scope documented in `docs/superpowers/specs/2026-07-07-frames-to-ai-dialogue-transition-design.md` §5, from the 2026-07-07 from-scratch evaluation of the April-era word lists.

## Global Constraints

- Work in a feature worktree off `dev`; use `/usr/bin/git` (never Homebrew git).
- Gate on **failing-set equality** for `npm test` (~48 sudachipy/numpy failures are permanent locally). Record baseline before starting; compare failing test NAMES after each task.
- **Never edit `data/dialogue/frames.json` by hand** — regenerate via `node scripts/tokenize-static.js`, then `node scripts/validate-dialogue.js`.
- **No `data/live-dictionary.json` changes in this plan** (none are needed; the dictionary rule requires explicit user sign-off).
- The 74-word glue pool (translator-upgrade plan Task 2) is TAUGHT vocabulary — no pool word may ever appear in the allowlist. Task 7 adds a guard for this.
- Regeneration needs working Sudachi (python3 + sudachipy); run it on the dev machine where `node scripts/tokenize-static.js` already works.

## Design Decisions (fixed — do not re-litigate during implementation)

| Decision | Rationale |
|---|---|
| One shared list, both consumers | Today ください is free for AI text but frames count くださる; こと/もの are AI-free but frames-content; さん burns AI budget but not frames. Divergence is the bug. |
| `demotedPos` = 助詞, 助動詞, 補助記号, 記号, 空白, 接尾辞, 接頭辞 (frames' current 7) | AI side today skips only 4 (助詞/助動詞/補助記号/空白) — adopting all 7 fixes honorific suffixes (さん/ちゃん = 接尾辞) on the AI side. 感動詞 deliberately NOT demoted wholesale — teachable exclamations (ごめん, やった, 大丈夫) stay content. |
| `demotedBaseForms` = frames' current list + なる + くださる | なる: kana become-auxiliary (〜になる), same family as demoted する/ある/いる — unify as grammar on both sides. くださる: fixes the shopPurchase budget bug (formulaic ください lemmatizes to くださる). Kana auxiliaries みる/くる/いく were already demoted frames-side; sharing fixes the AI side counting てみる/ていく. Kanji main verbs 見る/来る/行く lemmatize to kanji forms and are unaffected. |
| `allowedSurfaces` = current `ALLOWED_WORDS` minus (何, なに, どう, どこ, いつ, だれ, 誰) minus (する, なる, ある, いる → moved to demotedBaseForms), plus noise interjections (ああ, うわ, くっ, わあ, えっ, あっ) | Question words 何/どう/どこ/誰/いつ become taught vocabulary (they are top-300 JPDB and the frames side already counts them). なぜ/どれ/どの STAY free for now (rarer; later curriculum). Noise interjections stop wasting bark teaching slots. |
| Question-word tracking = FSRS cards created at prologue-complete + backfill for all existing users | Frames already treat them as content, so un-freeing them AI-side is safe once every account holds cards. Card creation uses the existing fast-track pattern (`createCard` if absent). |
| AI-side single-hiragana skip stays | Out of scope; documented in the module header. |
| `_isMerged` bypass narrows | Dictionary-merged tokens skip POS demotion only; explicit base/surface listings (こんにちは, すみません, くださる) demote even merged tokens. Without this, merged greetings can never be freed. |

## Key Existing Code (read-only reference)

- `src/game/vocab-repair.js:40-143` — `ALLOWED_WORDS` Set (surfaces); `checkSentenceViolations(sentence, vocabSet, gameTerms)` at :245 — per-token skips: POS startsWith 助詞/助動詞/補助記号/空白 → ALLOWED (base or surface) → gameTerms → single hiragana char → vocabSet. Exports `ALLOWED_WORDS` at :741/:752. The ":36 should match ALLOWED_WORDS in server.js" comment is stale — server.js only imports `checkSentenceViolations` (server.js:42).
- `scripts/tokenize-static.js:15-31` — `DEMOTED_POS` (7 POS) + `DEMOTED_BASE_FORMS` (いる ある しまう おく みる くる いく だ です ます する); `isDemoted(sudachiToken)` at :53-59 (`_isMerged` → false first, then POS, then base forms, then punctuation regex); demoted tokens get no `base` and stay out of `words[]` (:245-255 via `toUniversalToken`'s `isContent`).
- `src/tokenizer.js` — `tokenize(text)` shells to `python3 scripts/sudachi-tokenize.py`; returns tokens `{ surface, baseForm, pos, ... }` (pos is the Japanese string, e.g. `助詞`).
- `tests/unit/tokenize-static.test.js` — asserts against the generated frames.json. **Contains `excuse.tokens[0].base === 'すみません'` which this reform breaks on purpose** (すみません becomes surface-only); Task 5 updates it.
- `scripts/validate-dialogue.js` — `validateFrame`: every `words[]` entry must be in the dictionary; barks ≤ 3 content words.
- `scripts/validate-glue-progression.js` — reachability sim (gameplay + barks + frame iteration) used by the translator-upgrade plan's Task 12.
- Prologue completion: `src/routes/game/misc.js:342-348` (`POST /prologue-complete` sets `meta.prologueComplete = true`).
- Card fast-track pattern: `src/routes/game/known-words.js:66-69` — `createCard(userId, 'vocab', word, { word })` guarded by existing-card check. `createCard`/`getDeckCards` from `src/game/internal-srs.js:390-413`.
- All users: `loadUsers(filePath).users` from `src/auth/users.js`; per-user manager: `getManager(userId)` from `src/game/manager-registry.js`.
- Test conventions: `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';` — run one file: `node --experimental-test-module-mocks --test tests/unit/<file>.test.js`.

---

### Task 1: Create the feature worktree + baseline

**Files:** none (git only)

- [ ] **Step 1: Sync dev and create worktree**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-grammar-allowlist -b feature/grammar-allowlist-reform
cd ../koto-wt-grammar-allowlist
npm install
```

Expected: new worktree on `feature/grammar-allowlist-reform`.

- [ ] **Step 2: Record the npm test baseline failing set**

```bash
npm test 2>&1 | tee /tmp/allowlist-baseline.txt | tail -5
grep -E "^(✖|not ok|✗|failing)" /tmp/allowlist-baseline.txt | sort > /tmp/allowlist-baseline-failures.txt
wc -l /tmp/allowlist-baseline-failures.txt
```

- [ ] **Step 3: Snapshot current frames words for later diffing**

```bash
node -e "
const frames = require('./data/dialogue/frames.json');
const words = {};
for (const f of frames) words[f.id] = f.words;
require('fs').writeFileSync('/tmp/frames-words-before.json', JSON.stringify(words, null, 1));
console.log('snapshot:', Object.keys(words).length, 'frames');
"
```

---

### Task 2: Shared allowlist data + predicate module

**Files:**
- Create: `data/grammar-allowlist.json`
- Create: `src/game/grammar-allowlist.js`
- Test: `tests/unit/grammar-allowlist.test.js`

**Interfaces:**
- Produces: `loadGrammarAllowlist() -> { demotedPos: string[], demotedBaseForms: string[], allowedSurfaces: string[] }`;
  `isGrammarToken({ surface, baseForm, pos }) -> boolean` (the single shared predicate);
  `getAllowedSurfaceSet() -> Set<string>`; `getDemotedBaseFormSet() -> Set<string>`; `getDemotedPosSet() -> Set<string>`;
  `clearGrammarAllowlistCache() -> void` (tests).

- [ ] **Step 1: Write the data file**

Create `data/grammar-allowlist.json`. The `allowedSurfaces` array is the current `ALLOWED_WORDS` from `src/game/vocab-repair.js:40-143` with the Design-Decision removals/additions applied — copy it verbatim from the source file, then: REMOVE `何`, `なに`, `どう`, `どこ`, `いつ`, `だれ`, `誰`, `する`, `なる`, `ある`, `いる`; ADD the noise interjections. Result:

```json
{
  "demotedPos": ["助詞", "助動詞", "補助記号", "記号", "空白", "接尾辞", "接頭辞"],
  "demotedBaseForms": [
    "いる", "ある", "しまう", "おく", "みる", "くる", "いく",
    "だ", "です", "ます", "する", "なる", "くださる"
  ],
  "allowedSurfaces": [
    "は", "が", "を", "に", "で", "へ", "と", "も", "の", "か", "よ", "ね", "や",
    "から", "まで", "より", "など", "って", "けど", "でも", "しか", "ばかり",
    "だけ", "ほど", "くらい", "ぐらい", "のに", "ので", "のは", "のが", "のを",
    "です", "ます", "ました", "ません", "だ", "な", "ない",
    "れる", "られる", "せる", "させる", "たい", "てる",
    "こと", "もの", "ところ", "よう", "そう", "らしい", "みたい",
    "ですか", "ますか", "でした", "ましたか", "ませんか", "ですね", "ですよ",
    "ますね", "ますよ", "だった", "じゃない", "ではない", "かな", "のか",
    "んです", "のです", "んですか", "のですか", "でしょう", "でしょうか",
    "なぜ", "どれ", "どの",
    "こんにちは", "こんばんは", "おはよう", "ありがとう", "すみません",
    "ください", "お願い", "はい", "いいえ", "うん", "ええ",
    "ああ", "うわ", "くっ", "わあ", "えっ", "あっ"
  ]
}
```

(Cross-check against the actual `ALLOWED_WORDS` in the file before committing — if the live list has entries this plan's copy missed, keep them unless they are in the removal list above.)

- [ ] **Step 2: Write the failing test**

Create `tests/unit/grammar-allowlist.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGrammarAllowlist,
  clearGrammarAllowlistCache,
  isGrammarToken,
  getAllowedSurfaceSet
} from '../../src/game/grammar-allowlist.js';

describe('grammar allowlist data', () => {
  beforeEach(() => clearGrammarAllowlistCache());

  it('loads the three lists', () => {
    const list = loadGrammarAllowlist();
    assert.ok(list.demotedPos.includes('接尾辞'));
    assert.ok(list.demotedBaseForms.includes('くださる'));
    assert.ok(list.allowedSurfaces.includes('こと'));
  });

  it('question words 何/どう/どこ/誰/いつ are NOT free; なぜ/どれ/どの still are', () => {
    const surfaces = getAllowedSurfaceSet();
    for (const w of ['何', 'なに', 'どう', 'どこ', 'いつ', '誰', 'だれ']) {
      assert.equal(surfaces.has(w), false, `${w} must not be free`);
    }
    for (const w of ['なぜ', 'どれ', 'どの']) {
      assert.equal(surfaces.has(w), true, `${w} stays free`);
    }
  });
});

describe('isGrammarToken', () => {
  it('demotes by POS (incl. honorific suffixes)', () => {
    assert.equal(isGrammarToken({ surface: 'さん', baseForm: 'さん', pos: '接尾辞' }), true);
    assert.equal(isGrammarToken({ surface: 'を', baseForm: 'を', pos: '助詞' }), true);
  });

  it('demotes kana auxiliaries and くださる by base form', () => {
    assert.equal(isGrammarToken({ surface: 'ください', baseForm: 'くださる', pos: '動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'みて', baseForm: 'みる', pos: '動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'なった', baseForm: 'なる', pos: '動詞' }), true);
  });

  it('demotes by surface or base match against allowedSurfaces', () => {
    assert.equal(isGrammarToken({ surface: 'ああ', baseForm: 'ああ', pos: '感動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞' }), true);
  });

  it('keeps real vocabulary as content', () => {
    assert.equal(isGrammarToken({ surface: '猫', baseForm: '猫', pos: '名詞' }), false);
    assert.equal(isGrammarToken({ surface: '何', baseForm: '何', pos: '代名詞' }), false);
    assert.equal(isGrammarToken({ surface: 'ごめん', baseForm: 'ごめん', pos: '感動詞' }), false);
    assert.equal(isGrammarToken({ surface: '行く', baseForm: '行く', pos: '動詞' }), false);
    assert.equal(isGrammarToken({ surface: '来る', baseForm: '来る', pos: '動詞' }), false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-allowlist.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

Create `src/game/grammar-allowlist.js`:

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _list = null;
let _posSet = null;
let _baseSet = null;
let _surfaceSet = null;

/**
 * Single source of truth for "free" grammar across BOTH validators:
 * - checkSentenceViolations (AI-generated text, src/game/vocab-repair.js)
 * - the frames pipeline (scripts/tokenize-static.js content demotion)
 *
 * A token is grammar (never counts against the i+1 budget, never a teaching
 * word) when its POS is demoted, its base form is a listed auxiliary, or its
 * surface/base is a listed grammar chunk / formulaic expression.
 *
 * NOT covered here (documented divergence): the AI-side single-hiragana-char
 * skip in checkSentenceViolations remains local to that function.
 */
export function loadGrammarAllowlist() {
  if (!_list) {
    _list = JSON.parse(
      readFileSync(join(__dirname, '../../data/grammar-allowlist.json'), 'utf8')
    );
  }
  return _list;
}

export function clearGrammarAllowlistCache() {
  _list = null;
  _posSet = null;
  _baseSet = null;
  _surfaceSet = null;
}

export function getDemotedPosSet() {
  if (!_posSet) _posSet = new Set(loadGrammarAllowlist().demotedPos);
  return _posSet;
}

export function getDemotedBaseFormSet() {
  if (!_baseSet) _baseSet = new Set(loadGrammarAllowlist().demotedBaseForms);
  return _baseSet;
}

export function getAllowedSurfaceSet() {
  if (!_surfaceSet) _surfaceSet = new Set(loadGrammarAllowlist().allowedSurfaces);
  return _surfaceSet;
}

/**
 * The shared predicate. `pos` is Sudachi's Japanese POS string (e.g. 助詞).
 * POS matching uses startsWith so subtyped strings (助詞,格助詞,...) match.
 */
export function isGrammarToken({ surface = '', baseForm = '', pos = '' } = {}) {
  for (const demoted of getDemotedPosSet()) {
    if (pos.startsWith(demoted)) return true;
  }
  if (getDemotedBaseFormSet().has(baseForm)) return true;
  const surfaces = getAllowedSurfaceSet();
  return surfaces.has(surface) || surfaces.has(baseForm);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-allowlist.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add data/grammar-allowlist.json src/game/grammar-allowlist.js tests/unit/grammar-allowlist.test.js
/usr/bin/git commit -m "feat: shared grammar allowlist — one free-word source for both validators"
```

---

### Task 3: checkSentenceViolations consumes the shared list

**Files:**
- Modify: `src/game/vocab-repair.js` (delete the inline `ALLOWED_WORDS` literal :40-143, rewrite the skip logic in `checkSentenceViolations` :274-284, derive the back-compat export)
- Test: `tests/unit/vocab-repair-allowlist.test.js`

**Interfaces:**
- Consumes: `isGrammarToken`, `getAllowedSurfaceSet` (Task 2).
- Produces: `checkSentenceViolations(sentence, vocabSet, gameTerms)` — same signature, new skip semantics. `ALLOWED_WORDS` remains exported (now derived: `getAllowedSurfaceSet()`) for back-compat; grep consumers and update any that relied on removed entries.

- [ ] **Step 1: Write the failing test (module-mocked tokenizer — no live Sudachi needed)**

Create `tests/unit/vocab-repair-allowlist.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock the Sudachi bridge before importing the module under test.
const tok = (surface, baseForm, pos) => ({ surface, baseForm, pos });
let currentTokens = [];
mock.module('../../src/tokenizer.js', {
  namedExports: { tokenize: () => currentTokens }
});

const { checkSentenceViolations } = await import('../../src/game/vocab-repair.js');

describe('checkSentenceViolations with shared allowlist', () => {
  it('skips honorific suffixes (接尾辞) — new POS skip', () => {
    currentTokens = [
      tok('ミチア', 'ミチア', '名詞'),
      tok('さん', 'さん', '接尾辞')
    ];
    const result = checkSentenceViolations('ミチアさん', new Set(['ミチア']), new Set());
    assert.deepEqual(result.unknownWords, []);
  });

  it('skips kana auxiliaries by base form (てみる)', () => {
    currentTokens = [
      tok('見', '見る', '動詞'),
      tok('て', 'て', '助詞'),
      tok('みて', 'みる', '動詞')
    ];
    const result = checkSentenceViolations('見てみて', new Set(['見る']), new Set());
    assert.deepEqual(result.unknownWords, []);
  });

  it('counts question words as vocabulary now (何 no longer free)', () => {
    currentTokens = [tok('何', '何', '代名詞')];
    const unknown = checkSentenceViolations('何', new Set(), new Set());
    assert.deepEqual(unknown.unknownWords, ['何']);
    const known = checkSentenceViolations('何', new Set(['何']), new Set());
    assert.deepEqual(known.unknownWords, []);
  });

  it('skips noise interjections but counts teachable exclamations', () => {
    currentTokens = [tok('ああ', 'ああ', '感動詞'), tok('ごめん', 'ごめん', '感動詞')];
    const result = checkSentenceViolations('ああ、ごめん', new Set(), new Set());
    assert.deepEqual(result.unknownWords, ['ごめん']);
  });

  it('still skips ください via base form くださる', () => {
    currentTokens = [tok('ください', 'くださる', '動詞')];
    const result = checkSentenceViolations('ください', new Set(), new Set());
    assert.deepEqual(result.unknownWords, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/vocab-repair-allowlist.test.js
```

Expected: FAIL — `何` currently returns no violation (it is in the old inline list) and さん is counted.

- [ ] **Step 3: Rewrite the skip logic**

In `src/game/vocab-repair.js`:

(a) Delete the inline `const ALLOWED_WORDS = new Set([...])` block (lines 40-143) and its stale "should match server.js" comment. Add the import:

```js
import { isGrammarToken, getAllowedSurfaceSet } from './grammar-allowlist.js';
```

(b) In `checkSentenceViolations`, replace Steps 1 and 3 of the per-token loop (the POS-prefix skip and the `ALLOWED_WORDS` check):

```js
  for (const token of tokens) {
    const { surface, baseForm, pos } = token;

    // Steps 1+3 unified: shared grammar allowlist (POS, auxiliary base forms,
    // grammar chunks / formulaic surfaces) — same list the frames pipeline uses.
    if (isGrammarToken({ surface, baseForm, pos })) continue;

    // Step 2: Deduplicate by baseForm
    if (seen.has(baseForm)) continue;
    seen.add(baseForm);

    // Step 4: Game-specific terms
    if (gameTermWords.has(baseForm) || gameTermWords.has(surface)) continue;

    // Step 5: Single hiragana character (documented AI-side-only divergence)
    if (surface.length === 1 && /[぀-ゟ]/.test(surface)) continue;

    // Step 6: Vocabulary match (check both baseForm and surface)
    if (vocabSet.has(baseForm) || vocabSet.has(surface)) continue;

    unknownWords.push(baseForm);
  }
```

(Keep the dedupe ordering exactly as shown — grammar check first, then dedupe, then game terms.)

(c) Replace the `ALLOWED_WORDS` in the export blocks (:735-752) with a derived value so old imports keep working:

```js
const ALLOWED_WORDS = getAllowedSurfaceSet();
```

(d) Find other consumers and update if they relied on removed entries:

```bash
grep -rn "ALLOWED_WORDS" src/ scripts/ tests/ --include="*.js" | grep -v grammar-allowlist | grep -v vocab-repair
```

For each hit, decide: if it tests that 何/する/なる are allowed, update the expectation (they no longer are); otherwise leave.

- [ ] **Step 4: Run tests**

```bash
node --experimental-test-module-mocks --test tests/unit/vocab-repair-allowlist.test.js
npm run test:unit 2>&1 | tail -5
```

Expected: new test PASS; unit failing-set equal to baseline except tests that asserted the OLD free-list semantics — update those assertions to the new semantics (they encode the removed behavior, not a regression).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/vocab-repair.js tests/unit/vocab-repair-allowlist.test.js
/usr/bin/git commit -m "feat: AI-text validator consumes shared grammar allowlist"
```

---

### Task 4: tokenize-static consumes the shared list

**Files:**
- Modify: `scripts/tokenize-static.js:15-59` (replace `DEMOTED_POS`/`DEMOTED_BASE_FORMS` literals and `isDemoted`)
- Test: `tests/unit/grammar-allowlist-demotion.test.js`

**Interfaces:**
- Consumes: `getDemotedPosSet`, `getDemotedBaseFormSet`, `getAllowedSurfaceSet` (Task 2).
- Produces: exported `isDemoted(sudachiToken) -> boolean` from `scripts/tokenize-static.js` (add `export` so it is unit-testable; the script's CLI behavior is unchanged).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/grammar-allowlist-demotion.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDemoted } from '../../scripts/tokenize-static.js';

const st = (surface, baseForm, pos, extra = {}) => ({ surface, baseForm, pos, ...extra });

describe('frames-pipeline demotion via shared allowlist', () => {
  it('demotes くださる so shopPurchase templates stop counting it', () => {
    assert.equal(isDemoted(st('ください', 'くださる', '動詞')), true);
  });

  it('demotes なる (now unified with する/ある/いる)', () => {
    assert.equal(isDemoted(st('なる', 'なる', '動詞')), true);
  });

  it('demotes noise interjections and greetings by surface, even when dictionary-merged', () => {
    assert.equal(isDemoted(st('ああ', 'ああ', '感動詞')), true);
    assert.equal(isDemoted(st('こんにちは', 'こんにちは', '感動詞', { _isMerged: true })), true);
    assert.equal(isDemoted(st('すみません', 'すみません', '感動詞', { _isMerged: true })), true);
  });

  it('keeps merged content compounds as content (POS bypass preserved)', () => {
    assert.equal(isDemoted(st('大丈夫', '大丈夫', '形状詞', { _isMerged: true })), false);
  });

  it('keeps question words and teachable exclamations as content', () => {
    assert.equal(isDemoted(st('何', '何', '代名詞')), false);
    assert.equal(isDemoted(st('ごめん', 'ごめん', '感動詞')), false);
  });

  it('still demotes particles and punctuation', () => {
    assert.equal(isDemoted(st('を', 'を', '助詞')), true);
    assert.equal(isDemoted(st('！', '！', '補助記号')), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-allowlist-demotion.test.js
```

Expected: FAIL — `isDemoted` is not exported (and くださる/なる/こんにちは are not demoted yet). Note: importing the script must not run its CLI — check the bottom of `tokenize-static.js`; if it executes on import, wrap the run in `if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()))` or the file's existing main-guard pattern (look before assuming; many repo scripts already guard).

- [ ] **Step 3: Rewrite the demotion rules**

In `scripts/tokenize-static.js`, replace lines 15-31 (both literals) and the `isDemoted` function (:53-59) with:

```js
import {
  getDemotedPosSet,
  getDemotedBaseFormSet,
  getAllowedSurfaceSet
} from '../src/game/grammar-allowlist.js';

export function isDemoted(sudachiToken) {
  // Explicit listings demote even dictionary-merged tokens (formulaic
  // greetings like こんにちは merge from the dictionary but are still grammar).
  if (getDemotedBaseFormSet().has(sudachiToken.baseForm)) return true;
  const surfaces = getAllowedSurfaceSet();
  if (surfaces.has(sudachiToken.surface) || surfaces.has(sudachiToken.baseForm)) return true;

  // Dictionary-merged compounds skip POS demotion (they are always content
  // unless explicitly listed above).
  if (sudachiToken._isMerged) return false;

  if (getDemotedPosSet().has(sudachiToken.pos)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(sudachiToken.surface)) return true;
  return false;
}
```

(Delete `DEMOTED_POS` and `DEMOTED_BASE_FORMS` — the data moved to `data/grammar-allowlist.json`. Everything else in the script stays.)

- [ ] **Step 4: Run test to verify it passes**

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-allowlist-demotion.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add scripts/tokenize-static.js tests/unit/grammar-allowlist-demotion.test.js
/usr/bin/git commit -m "feat: frames pipeline demotion driven by shared grammar allowlist"
```

---

### Task 5: Regenerate frames.json + reconcile tests

**Files:**
- Regenerate: `data/dialogue/frames.json` (via script — never by hand)
- Modify: `tests/unit/tokenize-static.test.js` (the すみません base assertion)
- Possibly modify: other tests that assert old `words[]` contents (discovered by the run)

- [ ] **Step 1: Regenerate and validate**

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

Expected: both succeed. If `validate-dialogue.js` reports words no longer in the dictionary, that means a regression in the demotion logic (words that should have been demoted still present) — fix Task 4, do not touch the dictionary.

- [ ] **Step 2: Diff the words[] changes and sanity-check them**

```bash
node -e "
const before = require('/tmp/frames-words-before.json');
const frames = require('./data/dialogue/frames.json');
let changed = 0;
const removedWords = new Set();
for (const f of frames) {
  const b = (before[f.id] || []).join(',');
  const a = (f.words || []).join(',');
  if (a !== b) {
    changed++;
    for (const w of before[f.id] || []) if (!f.words.includes(w)) removedWords.add(w);
  }
}
console.log('frames with changed words[]:', changed);
console.log('words removed from content:', [...removedWords].sort().join(' '));
"
```

Expected removals include: くださる, なる, ああ, うわ, くっ, すみません, ありがとう, こんにちは, おはよう (whichever appear in current content). Expected NON-removals: 何, ごめん, 大丈夫, and every 74-pool glue word. **If any glue-pool word appears in the removed list, STOP — the allowlist and the pool overlap; fix the data file (Task 7's guard will enforce this permanently).**

- [ ] **Step 3: Update the known-breaking assertion**

In `tests/unit/tokenize-static.test.js`, the `shopPurchase_excuse` assertion `excuse.tokens[0].base === 'すみません'` now fails (すみません is surface-only). Replace with:

```js
    const excuse = frames.find(f => f.id === 'shopPurchase_excuse');
    assert.equal(excuse.tokens[0].surface, 'すみません', 'shopPurchase_excuse: すみません surface should be first');
    assert.equal(excuse.tokens[0].base, undefined, 'すみません is grammar (surface-only) after the allowlist reform');
    const slotIdx = excuse.tokens.findIndex(t => t.slot === 'item');
    assert.ok(slotIdx > 0, 'shopPurchase_excuse: slot should come after すみません');
```

- [ ] **Step 4: Full test run + reconcile**

```bash
npm test 2>&1 | tee /tmp/task5.txt | tail -5
grep -E "^(✖|not ok|✗|failing)" /tmp/task5.txt | sort > /tmp/task5-failures.txt
diff /tmp/allowlist-baseline-failures.txt /tmp/task5-failures.txt
```

Any NEW failures must be tests encoding the old free/content split (e.g. asserting ありがとう in a bark's `words[]`). Update those assertions to the new semantics. Any new failure that is NOT about the free/content split is a regression — fix before proceeding.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add data/dialogue/frames.json tests/
/usr/bin/git commit -m "feat: regenerate frames.json under shared allowlist (grammar words leave words[])"
```

---

### Task 6: Question-word cards at prologue-complete + backfill

**Files:**
- Modify: `src/routes/game/misc.js:341-348` (`/prologue-complete`)
- Create: `scripts/backfill-question-word-cards.js`
- Test: `tests/unit/question-word-cards.test.js`

**Interfaces:**
- Consumes: `createCard(userId, 'vocab', word, { word })`, `getDeckCards(userId, 'vocab')` (`src/game/internal-srs.js`).
- Produces: `ensureQuestionWordCards(userId) -> string[]` (newly created card ids) exported from a new tiny module `src/game/question-word-cards.js`, used by both the route and the backfill script.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/question-word-cards.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureQuestionWordCards, QUESTION_WORDS } from '../../src/game/question-word-cards.js';
import { getDeckCards, clearSrsData, configureSrs } from '../../src/game/internal-srs.js';
import { createTestTmpDir } from '../helpers/tmp.js';

describe('question word cards', () => {
  it('QUESTION_WORDS is the un-freed five', () => {
    assert.deepEqual(QUESTION_WORDS, ['何', 'どこ', 'どう', '誰', 'いつ']);
  });

  it('creates missing cards once, idempotently', async () => {
    const tmp = await createTestTmpDir('qword-cards-');
    configureSrs({ dataDir: tmp.path });
    const userId = 'qword-test-user';
    clearSrsData(userId);

    const created = ensureQuestionWordCards(userId);
    assert.deepEqual(created.sort(), ['いつ', 'どう', 'どこ', '何', '誰'].sort());

    const again = ensureQuestionWordCards(userId);
    assert.deepEqual(again, []);

    const ids = getDeckCards(userId, 'vocab').map(c => c.id);
    for (const w of QUESTION_WORDS) assert.ok(ids.includes(w));

    clearSrsData(userId);
    await tmp.cleanup?.();
  });
});
```

(Check `tests/helpers/tmp.js` for the actual helper name/shape and `configureSrs` usage in existing internal-srs tests — mirror whichever setup pattern those tests use if it differs.)

- [ ] **Step 2: Run test to verify it fails, then implement**

```bash
node --experimental-test-module-mocks --test tests/unit/question-word-cards.test.js
```

Create `src/game/question-word-cards.js`:

```js
import { createCard, getDeckCards } from './internal-srs.js';

/**
 * The five question words removed from the grammar allowlist on 2026-07-07
 * (they are top-300 vocabulary, not grammar). Cards are created at
 * prologue-complete so every account tracks them; they enter the review
 * flow as ordinary New cards. なぜ/どれ/どの remain free for now.
 */
export const QUESTION_WORDS = ['何', 'どこ', 'どう', '誰', 'いつ'];

/**
 * Create vocab cards for any question words the user does not have yet.
 * Returns the newly created card ids (empty when all exist).
 */
export function ensureQuestionWordCards(userId) {
  const existing = new Set(getDeckCards(userId, 'vocab').map(c => c.id));
  const created = [];
  for (const word of QUESTION_WORDS) {
    if (existing.has(word)) continue;
    createCard(userId, 'vocab', word, { word });
    created.push(word);
  }
  return created;
}
```

Run the test again — expected: PASS.

- [ ] **Step 3: Hook prologue-complete**

In `src/routes/game/misc.js`, the `/prologue-complete` handler (:341-348) becomes:

```js
  router.post('/prologue-complete', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    meta.prologueComplete = true;
    ensureQuestionWordCards(req.user.id);
    req.saveGame();
    res.json({ ok: true });
  });
```

with the import added at the top: `import { ensureQuestionWordCards } from '../../game/question-word-cards.js';`

- [ ] **Step 4: Write the backfill script**

Create `scripts/backfill-question-word-cards.js`:

```js
#!/usr/bin/env node
// One-time backfill: create question-word vocab cards for every existing
// user (safe + idempotent — skips cards that already exist).
// Usage: node scripts/backfill-question-word-cards.js
import { loadUsers } from '../src/auth/users.js';
import { ensureQuestionWordCards, QUESTION_WORDS } from '../src/game/question-word-cards.js';

const { users } = loadUsers();
let touched = 0;
for (const user of users) {
  const created = ensureQuestionWordCards(user.id);
  if (created.length > 0) {
    touched++;
    console.log(`${user.username || user.id}: created ${created.join(', ')}`);
  }
}
console.log(`Done. ${touched}/${users.length} users backfilled with [${QUESTION_WORDS.join(' ')}] cards.`);
```

Verify locally:

```bash
node scripts/backfill-question-word-cards.js
node scripts/backfill-question-word-cards.js   # second run: 0 users touched (idempotent)
```

(If `loadUsers()` requires a file path argument in this repo version, mirror how `scripts/seed-dev-user.js` or `migrateAiConsentForExistingUsers` obtains it.)

- [ ] **Step 5: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/question-word-cards.test.js
npm test 2>&1 | tail -5   # failing-set equality vs baseline
/usr/bin/git add src/game/question-word-cards.js src/routes/game/misc.js scripts/backfill-question-word-cards.js tests/unit/question-word-cards.test.js
/usr/bin/git commit -m "feat: track question words as vocabulary (prologue cards + user backfill)"
```

**Deploy note (record in the PR/merge message):** run `node scripts/backfill-question-word-cards.js` once on the Railway volume after this ships, BEFORE relying on question-word AI generation for existing users.

---### Task 7: Pool/allowlist disjointness guard + refresh reachability numbers

**Files:**
- Modify: `scripts/validate-glue-progression.js` (add the disjointness check)
- Modify: `docs/superpowers/plans/2026-07-07-translator-upgrade-frames-to-ai-dialogue.md` (Task 12 "Known state" numbers, if regeneration moved them)

- [ ] **Step 1: Add the disjointness guard**

In `scripts/validate-glue-progression.js`, after the existing checks, add (adapting to the script's current reporting style):

```js
// Guard: taught glue words must never be free grammar.
import { getAllowedSurfaceSet, getDemotedBaseFormSet } from '../src/game/grammar-allowlist.js';
const allowed = getAllowedSurfaceSet();
const demotedBases = getDemotedBaseFormSet();
const overlap = [...GLUE_WORDS].filter(w => allowed.has(w) || demotedBases.has(w));
if (overlap.length > 0) {
  console.error(`❌ POOL/ALLOWLIST OVERLAP (${overlap.length}): ${overlap.join(' ')}`);
  process.exitCode = 1;
} else {
  console.log('✓ glue pool and grammar allowlist are disjoint');
}
```

Note: the script's `GLUE_WORDS` constant must match the 74-word pool from the translator-upgrade plan (Task 2 config). If the script still carries the old 50-word April list, update it to read from `data/dialogue-switch-config.json` when that file exists, falling back to the inline list — or simply replace the inline list with the 74 words if the config file has not been created yet.

- [ ] **Step 2: Run reachability against the regenerated frames**

```bash
node scripts/validate-glue-progression.js
```

Record the new reachable/unreachable counts. The regeneration (Task 5) removed grammar words from bark `words[]`, which slightly shrinks the simulated known set — expect the unreachable count to stay ~45 ± a few.

- [ ] **Step 3: Refresh the translator-upgrade plan numbers**

If the counts moved, update the "**Known state at plan time (2026-07-07 audit)**" block in `docs/superpowers/plans/2026-07-07-translator-upgrade-frames-to-ai-dialogue.md` (Task 12) with the new numbers and word list, adding: "(refreshed after grammar-allowlist reform)".

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add scripts/validate-glue-progression.js docs/superpowers/plans/2026-07-07-translator-upgrade-frames-to-ai-dialogue.md
/usr/bin/git commit -m "feat: glue-pool/allowlist disjointness guard + refreshed reachability numbers"
```

---

### Task 8: Full verification + merge

**Files:** none new

- [ ] **Step 1: Full suite + failing-set equality**

```bash
npm test 2>&1 | tee /tmp/final.txt | tail -5
grep -E "^(✖|not ok|✗|failing)" /tmp/final.txt | sort > /tmp/final-failures.txt
diff /tmp/allowlist-baseline-failures.txt /tmp/final-failures.txt && echo "FAILING SET UNCHANGED"
```

Expected: `FAILING SET UNCHANGED` (after the deliberate assertion updates from Tasks 3/5 are accounted for — those files' tests should now PASS, so they must not appear in either list).

- [ ] **Step 2: End-to-end sanity of both validators agreeing**

```bash
node -e "
import('./src/game/grammar-allowlist.js').then(async ({ isGrammarToken }) => {
  const frames = (await import('fs')).readFileSync('./data/dialogue/frames.json', 'utf8');
  const parsed = JSON.parse(frames);
  // Every content word in frames must NOT be grammar per the shared predicate.
  let bad = [];
  for (const f of parsed) {
    for (const w of (f.words || [])) {
      if (isGrammarToken({ surface: w, baseForm: w, pos: '名詞' })) bad.push(f.id + ':' + w);
    }
  }
  console.log(bad.length === 0 ? '✓ frames words[] and allowlist agree' : '❌ ' + bad.join(' '));
});
"
```

Expected: `✓ frames words[] and allowlist agree`.

- [ ] **Step 3: Merge via the finishing skill**

Use superpowers:finishing-a-development-branch. Per repo workflow:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/grammar-allowlist-reform
git push origin dev
git push origin dev:master
/usr/bin/git worktree remove ../koto-wt-grammar-allowlist
/usr/bin/git branch -d feature/grammar-allowlist-reform
```

- [ ] **Step 4: Post-merge deploy step**

On Railway (dev, then prod): run `node scripts/backfill-question-word-cards.js` once against the persistent volume (Task 6 deploy note).

## Sequencing Note

This reform should land **before** the translator-upgrade plan's Task 12 (glue gap-filler authoring): the regenerated `words[]` and the disjointness guard change what "teachable" means, and authoring against the pre-reform frames wastes effort. The translator-upgrade plan is otherwise independent.
