# Prefix Pool Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/curate-prefixes.mjs` and use it to produce `data/prefixes.json` — a curated pool of 250-700 Japanese adjective/descriptor words, capped at JPDB rank ≤ 15,000, fit for use as creature prefixes at fusion time.

**Architecture:** Four-stage resumable pipeline driven by a single Node.js CLI orchestrator. Stage 1 merges three source files, caps rank, filters by Sudachi POS. Stage 2 batches candidates through the Anthropic SDK for semantic review. Stage 3 optionally renders `maybe` verdicts as an HTML table for human triage. Stage 4 assigns stable IDs and writes the final JSON. Each stage writes intermediate JSON under `output/prefix-curation/` so stages are individually re-runnable with `--stage N --force`.

**Tech Stack:** Node.js ESM, `node:test` + `node:assert` (existing test runner), Sudachi tokenizer via `src/tokenizer.js` (existing), JPDB helper at `scripts/lib/jpdb-helpers.mjs` (existing), Anthropic SDK `@anthropic-ai/sdk` (already installed).

**Spec:** `docs/superpowers/specs/2026-04-20-prefix-pool-curation-design.md`

---

## File Structure

**New files:**
- `scripts/curate-prefixes.mjs` — CLI orchestrator
- `scripts/lib/prefix-curation/merge-sources.mjs` — merge + dedupe + rank cap
- `scripts/lib/prefix-curation/pos-filter.mjs` — Sudachi POS filtering
- `scripts/lib/prefix-curation/ai-review.mjs` — batched Claude semantic review
- `scripts/lib/prefix-curation/render-review.mjs` — stage 3 HTML page
- `scripts/lib/prefix-curation/finalize.mjs` — sort, slug, collision resolve
- `tests/unit/scripts/prefix-curation/merge-sources.test.js`
- `tests/unit/scripts/prefix-curation/pos-filter.test.js`
- `tests/unit/scripts/prefix-curation/ai-review.test.js`
- `tests/unit/scripts/prefix-curation/render-review.test.js`
- `tests/unit/scripts/prefix-curation/finalize.test.js`

**Modified files:**
- `.gitignore` — add `output/prefix-curation/`
- `data/prefixes.json` — committed final output (created by pipeline run in Task 11)

**Output directory (gitignored):**
- `output/prefix-curation/1-filtered.json`
- `output/prefix-curation/2-reviewed.json`
- `output/prefix-curation/3-approved.json`
- `output/prefix-curation/3-review.html`
- `output/prefix-curation/canary-log.json`

---

## Task 1: Scaffold directories, gitignore, and empty module stubs

**Files:**
- Create: `scripts/lib/prefix-curation/merge-sources.mjs`
- Create: `scripts/lib/prefix-curation/pos-filter.mjs`
- Create: `scripts/lib/prefix-curation/ai-review.mjs`
- Create: `scripts/lib/prefix-curation/render-review.mjs`
- Create: `scripts/lib/prefix-curation/finalize.mjs`
- Create: `scripts/curate-prefixes.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Verify prerequisites**

```bash
ls language/categories/descriptors.json language/categories/emotions.json language/categories/colors.json
ls scripts/lib/jpdb-helpers.mjs src/tokenizer.js
cat data/.creature-forge-jpdb-key | head -c 10 && echo
```

Expected: all files present, JPDB key prints first 10 chars.

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p scripts/lib/prefix-curation
mkdir -p tests/unit/scripts/prefix-curation
mkdir -p output/prefix-curation
```

- [ ] **Step 3: Add gitignore entry**

Read `.gitignore` and append one line (skip if already present):

```
output/prefix-curation/
```

- [ ] **Step 4: Create empty stub files**

Create each of these with a 1-line comment so imports work:

`scripts/lib/prefix-curation/merge-sources.mjs`:
```javascript
// Stage 1a: merge descriptor/emotion/color source files, dedupe, cap JPDB rank.
```

`scripts/lib/prefix-curation/pos-filter.mjs`:
```javascript
// Stage 1b: filter candidates by Sudachi POS.
```

`scripts/lib/prefix-curation/ai-review.mjs`:
```javascript
// Stage 2: Claude semantic review of filtered candidates.
```

`scripts/lib/prefix-curation/render-review.mjs`:
```javascript
// Stage 3: render HTML review table for human spot-check of "maybe" verdicts.
```

`scripts/lib/prefix-curation/finalize.mjs`:
```javascript
// Stage 4: sort approved candidates, assign stable IDs, write data/prefixes.json.
```

`scripts/curate-prefixes.mjs`:
```javascript
#!/usr/bin/env node
// CLI orchestrator for the prefix pool curation pipeline.
// Usage: node scripts/curate-prefixes.mjs [--stage N] [--force] [--skip-review]
console.log('Not yet implemented. See docs/superpowers/plans/2026-04-20-prefix-pool-curation.md');
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/ scripts/curate-prefixes.mjs .gitignore
git commit -m "chore(prefixes): scaffold curation pipeline module layout"
```

---

## Task 2: Merge sources helper (TDD)

**Files:**
- Modify: `scripts/lib/prefix-curation/merge-sources.mjs`
- Create: `tests/unit/scripts/prefix-curation/merge-sources.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/prefix-curation/merge-sources.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeSources, capRank } from '../../../../scripts/lib/prefix-curation/merge-sources.mjs';

describe('mergeSources', () => {
  it('tags each entry with its source file', () => {
    const descriptors = [{ word: '大きい', reading: 'おおきい', meaning: 'big', rank: 164 }];
    const emotions = [{ word: '元気', reading: 'げんき', meaning: 'healthy', rank: 892 }];
    const colors = [{ word: '赤', reading: 'あか', meaning: 'red', rank: 1234 }];
    const merged = mergeSources({ descriptors, emotions, colors });
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[0].source, 'descriptors');
    assert.strictEqual(merged[1].source, 'emotions');
    assert.strictEqual(merged[2].source, 'colors');
  });

  it('dedupes by word — first occurrence wins', () => {
    const descriptors = [{ word: '大きい', reading: 'おおきい', meaning: 'big', rank: 164 }];
    const emotions = [{ word: '大きい', reading: 'おおきい', meaning: 'big', rank: 164 }];
    const merged = mergeSources({ descriptors, emotions, colors: [] });
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].source, 'descriptors');
  });

  it('preserves original rank and meaning', () => {
    const descriptors = [{ word: '大きい', reading: 'おおきい', meaning: 'big', rank: 164 }];
    const merged = mergeSources({ descriptors, emotions: [], colors: [] });
    assert.strictEqual(merged[0].rank, 164);
    assert.strictEqual(merged[0].meaning, 'big');
  });
});

describe('capRank', () => {
  it('keeps entries with rank <= ceiling', () => {
    const entries = [
      { word: 'a', rank: 100 },
      { word: 'b', rank: 15000 },
      { word: 'c', rank: 15001 },
      { word: 'd', rank: 50000 },
    ];
    const capped = capRank(entries, 15000);
    assert.strictEqual(capped.length, 2);
    assert.deepStrictEqual(capped.map(e => e.word), ['a', 'b']);
  });

  it('drops entries with null or missing rank', () => {
    const entries = [
      { word: 'a', rank: null },
      { word: 'b' },
      { word: 'c', rank: 100 },
    ];
    const capped = capRank(entries, 15000);
    assert.strictEqual(capped.length, 1);
    assert.strictEqual(capped[0].word, 'c');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/scripts/prefix-curation/merge-sources.test.js
```

Expected: FAIL with "mergeSources is not a function" or similar import error.

- [ ] **Step 3: Implement the helper**

Replace the contents of `scripts/lib/prefix-curation/merge-sources.mjs`:
```javascript
// Stage 1a: merge descriptor/emotion/color source files, dedupe, cap JPDB rank.
import { readFile } from 'fs/promises';
import { join } from 'path';

export function mergeSources({ descriptors, emotions, colors }) {
  const seen = new Set();
  const out = [];
  const pools = [
    { name: 'descriptors', entries: descriptors },
    { name: 'emotions', entries: emotions },
    { name: 'colors', entries: colors },
  ];
  for (const { name, entries } of pools) {
    for (const entry of entries) {
      if (seen.has(entry.word)) continue;
      seen.add(entry.word);
      out.push({ ...entry, source: name });
    }
  }
  return out;
}

export function capRank(entries, ceiling) {
  return entries.filter(e => typeof e.rank === 'number' && e.rank <= ceiling);
}

export async function loadAllSources(rootDir) {
  const base = join(rootDir, 'language', 'categories');
  const [descriptors, emotions, colors] = await Promise.all([
    readFile(join(base, 'descriptors.json'), 'utf8').then(JSON.parse),
    readFile(join(base, 'emotions.json'), 'utf8').then(JSON.parse),
    readFile(join(base, 'colors.json'), 'utf8').then(JSON.parse),
  ]);
  return { descriptors, emotions, colors };
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/scripts/prefix-curation/merge-sources.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/merge-sources.mjs tests/unit/scripts/prefix-curation/merge-sources.test.js
git commit -m "feat(prefixes): merge/dedupe/cap sources helper"
```

---

## Task 3: POS filter helper (TDD)

**Files:**
- Modify: `scripts/lib/prefix-curation/pos-filter.mjs`
- Create: `tests/unit/scripts/prefix-curation/pos-filter.test.js`

The POS filter accepts entries whose Sudachi-tagged primary POS is an adjective (形容詞), na-adjective (形状詞), prenominal (連体詞). It also accepts entries whose source is `colors` or `emotions` regardless of POS — those files are pre-curated for adjectival use, so their content passes as descriptor-noun by convention. This handles Sudachi's habit of tagging words like 元気 as 名詞 even though they work as na-adjectives.

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/prefix-curation/pos-filter.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyPos, filterByPos } from '../../../../scripts/lib/prefix-curation/pos-filter.mjs';

describe('classifyPos', () => {
  it('maps Sudachi 形容詞 to i-adjective', () => {
    assert.strictEqual(classifyPos('形容詞'), 'i-adjective');
  });
  it('maps Sudachi 形状詞 to na-adjective', () => {
    assert.strictEqual(classifyPos('形状詞'), 'na-adjective');
  });
  it('maps Sudachi 連体詞 to prenominal', () => {
    assert.strictEqual(classifyPos('連体詞'), 'prenominal');
  });
  it('returns null for 名詞 (noun)', () => {
    assert.strictEqual(classifyPos('名詞'), null);
  });
  it('returns null for 動詞 (verb)', () => {
    assert.strictEqual(classifyPos('動詞'), null);
  });
  it('returns null for unknown POS', () => {
    assert.strictEqual(classifyPos(''), null);
    assert.strictEqual(classifyPos(undefined), null);
  });
});

describe('filterByPos', () => {
  // Fake tokenizer returns canned POS data per word.
  const fakePosLookup = new Map([
    ['大きい', '形容詞'],
    ['静か',   '形状詞'],
    ['大きな', '連体詞'],
    ['母',     '名詞'],
    ['走る',   '動詞'],
    ['元気',   '名詞'],
  ]);
  const fakeTokenizer = async (words) => words.map(w => ({
    word: w, pos: fakePosLookup.get(w) || '名詞',
  }));

  it('keeps i-adj, na-adj, prenominal candidates', async () => {
    const input = [
      { word: '大きい', source: 'descriptors' },
      { word: '静か',   source: 'descriptors' },
      { word: '大きな', source: 'descriptors' },
    ];
    const out = await filterByPos(input, { tokenize: fakeTokenizer });
    assert.strictEqual(out.length, 3);
    assert.strictEqual(out[0].pos, 'i-adjective');
    assert.strictEqual(out[1].pos, 'na-adjective');
    assert.strictEqual(out[2].pos, 'prenominal');
  });

  it('drops nouns and verbs', async () => {
    const input = [
      { word: '母', source: 'descriptors' },
      { word: '走る', source: 'descriptors' },
    ];
    const out = await filterByPos(input, { tokenize: fakeTokenizer });
    assert.strictEqual(out.length, 0);
  });

  it('accepts colors/emotions entries even if POS is noun (descriptor-noun bypass)', async () => {
    const input = [
      { word: '元気', source: 'emotions' },
      { word: '母',   source: 'descriptors' },
    ];
    const out = await filterByPos(input, { tokenize: fakeTokenizer });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].word, '元気');
    assert.strictEqual(out[0].pos, 'descriptor-noun');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/scripts/prefix-curation/pos-filter.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Replace `scripts/lib/prefix-curation/pos-filter.mjs`:
```javascript
// Stage 1b: filter candidates by Sudachi POS.
// Accepts adjective-like words; also accepts colors/emotions entries as
// descriptor-nouns since those source files are pre-curated for adjectival use.

const SUDACHI_TO_POS = {
  '形容詞': 'i-adjective',
  '形状詞': 'na-adjective',
  '連体詞': 'prenominal',
};

export function classifyPos(sudachiPos) {
  if (!sudachiPos) return null;
  return SUDACHI_TO_POS[sudachiPos] ?? null;
}

const DESCRIPTOR_NOUN_SOURCES = new Set(['colors', 'emotions']);

/**
 * @param {Array<{word, source, ...}>} entries
 * @param {{tokenize: (words: string[]) => Promise<Array<{word, pos}>>}} deps
 * @returns {Promise<Array<{word, source, pos, ...}>>}
 */
export async function filterByPos(entries, { tokenize }) {
  const tokens = await tokenize(entries.map(e => e.word));
  const posByWord = new Map(tokens.map(t => [t.word, t.pos]));
  const out = [];
  for (const entry of entries) {
    const sudachiPos = posByWord.get(entry.word);
    const classified = classifyPos(sudachiPos);
    if (classified) {
      out.push({ ...entry, pos: classified });
      continue;
    }
    if (DESCRIPTOR_NOUN_SOURCES.has(entry.source)) {
      out.push({ ...entry, pos: 'descriptor-noun' });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/scripts/prefix-curation/pos-filter.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/pos-filter.mjs tests/unit/scripts/prefix-curation/pos-filter.test.js
git commit -m "feat(prefixes): POS filter helper with descriptor-noun bypass"
```

---

## Task 4: Real Sudachi tokenizer adapter

**Files:**
- Modify: `scripts/lib/prefix-curation/pos-filter.mjs` (append)

This wires the pure `filterByPos` helper up to the project's actual Sudachi tokenizer from `src/tokenizer.js`. It's an adapter, not testable in isolation without Sudachi — we verify it end-to-end in Task 10.

- [ ] **Step 1: Inspect the existing tokenizer API**

```bash
grep -n 'export' src/tokenizer.js | head -10
```

Note the exported function name (e.g., `tokenizeBatch`). The next step assumes `tokenizeBatch(text) -> Promise<Token[]>` where each token has `.surface` and `.pos`. If the signature differs, adjust the adapter below accordingly.

- [ ] **Step 2: Append the adapter**

Append to `scripts/lib/prefix-curation/pos-filter.mjs`:
```javascript
import { tokenizeBatch } from '../../../src/tokenizer.js';

/**
 * Adapter over src/tokenizer.js. Tokenizes each word individually and takes
 * the POS of the token whose surface matches the input word (single-word
 * inputs can sometimes be split by Sudachi).
 */
export async function realTokenize(words) {
  const results = [];
  for (const word of words) {
    const tokens = await tokenizeBatch(word);
    // tokenizeBatch returns tokens for the whole string; find the one
    // whose surface equals the full word, else take the longest token.
    let match = tokens.find(t => t.surface === word);
    if (!match && tokens.length > 0) {
      match = tokens.reduce((a, b) => (b.surface.length > a.surface.length ? b : a));
    }
    results.push({ word, pos: match?.pos ?? null });
  }
  return results;
}
```

- [ ] **Step 3: Smoke-check the adapter manually**

```bash
node -e "
import('./scripts/lib/prefix-curation/pos-filter.mjs').then(async m => {
  const r = await m.realTokenize(['大きい', '静か', '母', '走る']);
  console.log(JSON.stringify(r, null, 2));
});
"
```

Expected output includes entries like `{word: '大きい', pos: '形容詞'}`, `{word: '母', pos: '名詞'}`. If Sudachi fails to start, stop and diagnose before continuing — the rest of the pipeline depends on this working.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/prefix-curation/pos-filter.mjs
git commit -m "feat(prefixes): real Sudachi tokenizer adapter for POS filter"
```

---

## Task 5: AI review helper (TDD, mocked Anthropic SDK)

**Files:**
- Modify: `scripts/lib/prefix-curation/ai-review.mjs`
- Create: `tests/unit/scripts/prefix-curation/ai-review.test.js`

AI review batches candidates into groups of 50 and asks Claude to label each as `yes`/`maybe`/`no`. For unit testing we inject a mock `callClaude` function. Canary words — a stable set of 5 entries whose verdicts we expect not to drift — are included in every batch; their verdicts are logged and mismatches are flagged in the final output so downstream steps can spot API drift.

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/prefix-curation/ai-review.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { reviewBatch, reviewAll, CANARY_WORDS } from '../../../../scripts/lib/prefix-curation/ai-review.mjs';

describe('reviewBatch', () => {
  it('returns yes/maybe/no verdict per input word', async () => {
    const batch = [
      { word: '大きい', reading: 'おおきい', meaning: 'big', rawMeanings: [['big']] },
      { word: '母', reading: 'はは', meaning: 'mother', rawMeanings: [['mother']] },
    ];
    const mockClaude = async () => JSON.stringify([
      { word: '大きい', verdict: 'yes', reason: 'size is a valid creature trait' },
      { word: '母', verdict: 'no', reason: 'mother is a relationship noun, not a creature descriptor' },
    ]);
    const out = await reviewBatch(batch, { callClaude: mockClaude });
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].verdict, 'yes');
    assert.strictEqual(out[1].verdict, 'no');
    assert.ok(out[0].reason.length > 0);
  });

  it('throws when Claude returns invalid JSON', async () => {
    const batch = [{ word: '大きい', reading: 'おおきい', meaning: 'big', rawMeanings: [['big']] }];
    const mockClaude = async () => 'not-json';
    await assert.rejects(() => reviewBatch(batch, { callClaude: mockClaude }), /JSON/);
  });

  it('throws when Claude response is missing a word', async () => {
    const batch = [
      { word: '大きい', reading: 'おおきい', meaning: 'big', rawMeanings: [['big']] },
      { word: '静か', reading: 'しずか', meaning: 'quiet', rawMeanings: [['quiet']] },
    ];
    const mockClaude = async () => JSON.stringify([
      { word: '大きい', verdict: 'yes', reason: '...' },
    ]);
    await assert.rejects(() => reviewBatch(batch, { callClaude: mockClaude }), /missing/);
  });
});

describe('reviewAll', () => {
  it('batches candidates into groups and appends canaries to each batch', async () => {
    const candidates = Array.from({ length: 120 }, (_, i) => ({
      word: `w${i}`, reading: `r${i}`, meaning: `m${i}`, rawMeanings: [[`m${i}`]],
    }));
    let batchCount = 0;
    let sawCanary = true;
    const mockClaude = async (prompt) => {
      batchCount++;
      // Prompt must contain each canary word.
      for (const c of CANARY_WORDS) {
        if (!prompt.includes(c.word)) sawCanary = false;
      }
      // Echo back a valid yes/no response for every word in the prompt.
      const words = prompt.match(/"word":\s*"([^"]+)"/g) || [];
      const extracted = words.map(s => s.match(/"word":\s*"([^"]+)"/)[1]);
      return JSON.stringify(extracted.map(w => ({ word: w, verdict: 'yes', reason: 'ok' })));
    };
    const { reviewed, canaryLog } = await reviewAll(candidates, { callClaude: mockClaude, batchSize: 50 });
    // 120 candidates / 50 per batch = 3 batches.
    assert.strictEqual(batchCount, 3);
    assert.strictEqual(sawCanary, true);
    // Reviewed contains only the 120 candidates (canaries stripped).
    assert.strictEqual(reviewed.length, 120);
    // Canary log has one entry per batch per canary.
    assert.strictEqual(canaryLog.length, 3 * CANARY_WORDS.length);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/scripts/prefix-curation/ai-review.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Replace `scripts/lib/prefix-curation/ai-review.mjs`:
```javascript
// Stage 2: Claude semantic review of filtered candidates.

export const CANARY_WORDS = [
  { word: '大きい', reading: 'おおきい', meaning: 'big', rawMeanings: [['big']], expected: 'yes' },
  { word: '母', reading: 'はは', meaning: 'mother', rawMeanings: [['mother']], expected: 'no' },
  { word: '静か', reading: 'しずか', meaning: 'quiet', rawMeanings: [['quiet']], expected: 'yes' },
  { word: '公的', reading: 'こうてき', meaning: 'public', rawMeanings: [['public']], expected: 'no' },
  { word: '古い', reading: 'ふるい', meaning: 'old', rawMeanings: [['old']], expected: 'yes' },
];

const PROMPT_PREAMBLE = `You are curating a pool of Japanese prefix-words for a vocabulary-learning creature-collection game. Each prefix will prepend a creature name at fusion time (e.g., "Energetic Fire", "Mighty Steel Bird").

For each word in the JSON array below, rate whether it could meaningfully describe a game creature's personality, appearance, size, age, or state. Rate: "yes" / "maybe" / "no". Give a one-sentence reason.

Reject words that are purely abstract ("public", "reverse"), domain-specific ("bureaucratic"), or nouns the source file misclassified ("mother", "contents").
Accept words that describe physical traits ("small", "strong"), temperament ("lazy", "brave"), appearance ("shiny", "rusty"), age ("ancient", "young"), or emotional state ("happy", "angry").

Respond with a JSON array of objects, one per input word, in the same order: [{"word": "...", "verdict": "yes"|"maybe"|"no", "reason": "..."}]. Respond with ONLY the JSON array — no markdown fences, no prose.

Input words:
`;

function buildPrompt(words) {
  return PROMPT_PREAMBLE + JSON.stringify(words.map(w => ({
    word: w.word, reading: w.reading, meaning: w.meaning, rawMeanings: w.rawMeanings,
  })), null, 2);
}

function parseResponse(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e.message}. Response: ${trimmed.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Claude response is not a JSON array: ${trimmed.slice(0, 200)}`);
  }
  return parsed;
}

export async function reviewBatch(batch, { callClaude }) {
  const prompt = buildPrompt(batch);
  const text = await callClaude(prompt);
  const parsed = parseResponse(text);
  const byWord = new Map(parsed.map(p => [p.word, p]));
  const out = [];
  for (const input of batch) {
    const got = byWord.get(input.word);
    if (!got) {
      throw new Error(`Claude response missing verdict for word: ${input.word}`);
    }
    out.push({ ...input, verdict: got.verdict, reason: got.reason });
  }
  return out;
}

export async function reviewAll(candidates, { callClaude, batchSize = 50 }) {
  const reviewed = [];
  const canaryLog = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    const slice = candidates.slice(i, i + batchSize);
    const combined = [...slice, ...CANARY_WORDS];
    const result = await reviewBatch(combined, { callClaude });
    for (const r of result) {
      const canary = CANARY_WORDS.find(c => c.word === r.word);
      if (canary) {
        canaryLog.push({
          batchIndex: Math.floor(i / batchSize),
          word: canary.word,
          expected: canary.expected,
          got: r.verdict,
          drift: r.verdict !== canary.expected,
        });
      } else {
        reviewed.push(r);
      }
    }
  }
  return { reviewed, canaryLog };
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/scripts/prefix-curation/ai-review.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/ai-review.mjs tests/unit/scripts/prefix-curation/ai-review.test.js
git commit -m "feat(prefixes): AI semantic review helper with canary drift detection"
```

---

## Task 6: Real Anthropic SDK adapter

**Files:**
- Modify: `scripts/lib/prefix-curation/ai-review.mjs` (append)

- [ ] **Step 1: Check for an available Anthropic API key**

```bash
ls data/.anthropic-key 2>/dev/null || ls data/.creature-forge-anthropic-key 2>/dev/null || echo "MISSING"
env | grep -i anthropic_api || true
```

Use whichever is found. If neither exists, create `data/.anthropic-key` containing the key (ask the user — DO NOT invent one). Add `data/.anthropic-key` to `.gitignore` if it's not already covered.

- [ ] **Step 2: Append the real Claude adapter**

Append to `scripts/lib/prefix-curation/ai-review.mjs`:
```javascript
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Creates a real callClaude function bound to the Anthropic SDK.
 * Uses claude-haiku-4-5 by default — cheap and fast, sufficient for this
 * grading task.
 */
export async function makeRealCallClaude(rootDir, { model = 'claude-haiku-4-5-20251001' } = {}) {
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const keyPath = join(rootDir, 'data', '.anthropic-key');
    apiKey = (await readFile(keyPath, 'utf8')).trim();
  }
  const client = new Anthropic({ apiKey });
  return async function callClaude(prompt) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content.find(b => b.type === 'text');
    if (!block) {
      throw new Error(`Claude response has no text block: ${JSON.stringify(response.content)}`);
    }
    return block.text;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/prefix-curation/ai-review.mjs
git commit -m "feat(prefixes): real Anthropic SDK adapter for AI review"
```

---

## Task 7: HTML review renderer (TDD)

**Files:**
- Modify: `scripts/lib/prefix-curation/render-review.mjs`
- Create: `tests/unit/scripts/prefix-curation/render-review.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/prefix-curation/render-review.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderReviewHtml, parseSelection } from '../../../../scripts/lib/prefix-curation/render-review.mjs';

describe('renderReviewHtml', () => {
  it('renders one row per maybe entry with a checkbox keyed by word', () => {
    const entries = [
      { word: '変', reading: 'へん', meaning: 'strange', rank: 486, verdict: 'maybe', reason: 'could go either way' },
      { word: '逆', reading: 'ぎゃく', meaning: 'reverse', rank: 645, verdict: 'maybe', reason: 'abstract but usable' },
    ];
    const html = renderReviewHtml(entries);
    assert.ok(html.includes('<tr'), 'should contain table rows');
    assert.ok(html.includes('変'), 'should contain the Japanese word');
    assert.ok(html.includes('value="変"'), 'checkbox value should be the word');
    assert.ok(html.includes('strange'), 'should contain English meaning');
    assert.ok(html.includes('486'), 'should contain rank');
  });

  it('shows a message when there are no maybe entries', () => {
    const html = renderReviewHtml([]);
    assert.ok(/no entries/i.test(html), 'should show empty-state message');
  });
});

describe('parseSelection', () => {
  it('parses a form-encoded submission into a set of approved words', () => {
    const formData = 'include=%E5%A4%89&include=%E9%80%86';
    const approved = parseSelection(formData);
    assert.strictEqual(approved.size, 2);
    assert.ok(approved.has('変'));
    assert.ok(approved.has('逆'));
  });

  it('returns empty set for empty form', () => {
    const approved = parseSelection('');
    assert.strictEqual(approved.size, 0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/scripts/prefix-curation/render-review.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Replace `scripts/lib/prefix-curation/render-review.mjs`:
```javascript
// Stage 3: render HTML review table for human spot-check of "maybe" verdicts.

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderReviewHtml(entries) {
  if (!entries.length) {
    return `<!DOCTYPE html><html><body><p>No entries to review. All "yes" verdicts from stage 2 will flow through to stage 4 automatically.</p></body></html>`;
  }
  const rows = entries.map(e => `
    <tr>
      <td><input type="checkbox" name="include" value="${escape(e.word)}" checked></td>
      <td lang="ja">${escape(e.word)}</td>
      <td lang="ja">${escape(e.reading)}</td>
      <td>${escape(e.meaning)}</td>
      <td>${escape(e.rank)}</td>
      <td>${escape(e.reason)}</td>
    </tr>
  `).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Prefix Curation Review</title>
<style>
  body { font-family: sans-serif; max-width: 900px; margin: 2em auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
  th { background: #f0f0f0; }
</style></head><body>
<h1>Review "maybe" verdicts</h1>
<p>Uncheck rows you want to exclude. Submit to save approvals.</p>
<form method="POST" action="/submit">
<table>
<thead><tr><th>Include</th><th>Word</th><th>Reading</th><th>Meaning</th><th>Rank</th><th>AI reason</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<button type="submit">Save approvals</button>
</form>
</body></html>`;
}

/**
 * Parse an `application/x-www-form-urlencoded` body with repeated
 * `include=<word>` fields into a Set of approved words.
 */
export function parseSelection(body) {
  const out = new Set();
  if (!body) return out;
  for (const part of body.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (k === 'include' && v !== undefined) {
      out.add(decodeURIComponent(v));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/scripts/prefix-curation/render-review.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/render-review.mjs tests/unit/scripts/prefix-curation/render-review.test.js
git commit -m "feat(prefixes): HTML review renderer + form parser"
```

---

## Task 8: Finalize helper (TDD)

**Files:**
- Modify: `scripts/lib/prefix-curation/finalize.mjs`
- Create: `tests/unit/scripts/prefix-curation/finalize.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/prefix-curation/finalize.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { slugify, assignIds, sortByRank, toFinalRecord } from '../../../../scripts/lib/prefix-curation/finalize.mjs';

describe('slugify', () => {
  it('lowercases and kebab-cases an English meaning', () => {
    assert.strictEqual(slugify('Energetic'), 'energetic');
    assert.strictEqual(slugify('Ancient Times'), 'ancient-times');
    assert.strictEqual(slugify('AT-PEACE'), 'at-peace');
  });
  it('strips punctuation and collapses runs', () => {
    assert.strictEqual(slugify('rough / tough'), 'rough-tough');
    assert.strictEqual(slugify("don't know"), 'dont-know');
  });
  it('handles empty or whitespace input', () => {
    assert.strictEqual(slugify(''), 'unnamed');
    assert.strictEqual(slugify('   '), 'unnamed');
  });
});

describe('assignIds', () => {
  it('assigns unique kebab-case ids from each entry meaning', () => {
    const entries = [
      { word: '元気', meaning: 'Energetic' },
      { word: '古代', meaning: 'Ancient' },
    ];
    const out = assignIds(entries);
    assert.strictEqual(out[0].id, 'energetic');
    assert.strictEqual(out[1].id, 'ancient');
  });

  it('resolves collisions by numeric suffix', () => {
    const entries = [
      { word: '古代', meaning: 'Ancient' },
      { word: '昔', meaning: 'Ancient' },
      { word: '旧', meaning: 'Ancient' },
    ];
    const out = assignIds(entries);
    assert.deepStrictEqual(out.map(e => e.id), ['ancient', 'ancient-2', 'ancient-3']);
  });
});

describe('sortByRank', () => {
  it('sorts ascending by rank', () => {
    const entries = [
      { word: 'c', rank: 500 },
      { word: 'a', rank: 100 },
      { word: 'b', rank: 300 },
    ];
    const sorted = sortByRank(entries);
    assert.deepStrictEqual(sorted.map(e => e.word), ['a', 'b', 'c']);
  });
});

describe('toFinalRecord', () => {
  it('includes only the schema fields in the final record', () => {
    const entry = {
      word: '元気',
      reading: 'げんき',
      meaning: 'Energetic',
      rank: 892,
      rawMeanings: [['healthy', 'vigorous']],
      pos: 'na-adjective',
      source: 'emotions',
      verdict: 'yes',
      reason: 'temperament word, obviously fits',
      id: 'energetic',
    };
    const out = toFinalRecord(entry);
    assert.deepStrictEqual(Object.keys(out).sort(), ['id', 'meaning', 'pos', 'rank', 'rawMeanings', 'reading', 'source', 'word']);
    assert.strictEqual(out.verdict, undefined);
    assert.strictEqual(out.reason, undefined);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test tests/unit/scripts/prefix-curation/finalize.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Replace `scripts/lib/prefix-curation/finalize.mjs`:
```javascript
// Stage 4: sort approved candidates, assign stable IDs, write data/prefixes.json.
import { writeFile } from 'fs/promises';

export function slugify(s) {
  const base = String(s || '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'unnamed';
}

export function assignIds(entries) {
  const counts = new Map();
  const out = [];
  for (const e of entries) {
    const base = slugify(e.meaning);
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    out.push({ ...e, id });
  }
  return out;
}

export function sortByRank(entries) {
  return [...entries].sort((a, b) => a.rank - b.rank);
}

export function toFinalRecord(entry) {
  return {
    id: entry.id,
    word: entry.word,
    reading: entry.reading,
    meaning: entry.meaning,
    rank: entry.rank,
    rawMeanings: entry.rawMeanings,
    pos: entry.pos,
    source: entry.source,
  };
}

/**
 * Sort, assign IDs, strip intermediate fields, write JSON.
 * Throws if pool size is outside [min, max].
 */
export async function finalize(entries, outputPath, { min = 250, max = 700 } = {}) {
  if (entries.length < min || entries.length > max) {
    throw new Error(`Pool size ${entries.length} outside allowed range [${min}, ${max}]. Widen filters or relax criteria.`);
  }
  const sorted = sortByRank(entries);
  const withIds = assignIds(sorted);
  const records = withIds.map(toFinalRecord);
  await writeFile(outputPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
  return records;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test tests/unit/scripts/prefix-curation/finalize.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/prefix-curation/finalize.mjs tests/unit/scripts/prefix-curation/finalize.test.js
git commit -m "feat(prefixes): finalize helper (slugify, assignIds, sortByRank, toFinalRecord)"
```

---

## Task 9: CLI orchestrator — stages 1, 2, 4

**Files:**
- Modify: `scripts/curate-prefixes.mjs`

This wires all four stages into a single CLI. Stage 3 (HTML review server) gets its own task.

- [ ] **Step 1: Implement the orchestrator**

Replace `scripts/curate-prefixes.mjs`:
```javascript
#!/usr/bin/env node
// CLI orchestrator for the prefix pool curation pipeline.
// Usage: node scripts/curate-prefixes.mjs [--stage N] [--force] [--skip-review]
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { mergeSources, capRank, loadAllSources } from './lib/prefix-curation/merge-sources.mjs';
import { filterByPos, realTokenize } from './lib/prefix-curation/pos-filter.mjs';
import { reviewAll, makeRealCallClaude } from './lib/prefix-curation/ai-review.mjs';
import { renderReviewHtml } from './lib/prefix-curation/render-review.mjs';
import { finalize } from './lib/prefix-curation/finalize.mjs';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'output', 'prefix-curation');
const RANK_CEILING = 15000;
const BATCH_SIZE = 50;

const PATHS = {
  stage1: join(OUT_DIR, '1-filtered.json'),
  stage2: join(OUT_DIR, '2-reviewed.json'),
  stage3Approved: join(OUT_DIR, '3-approved.json'),
  stage3Html: join(OUT_DIR, '3-review.html'),
  canaryLog: join(OUT_DIR, 'canary-log.json'),
  final: join(ROOT, 'data', 'prefixes.json'),
};

function parseArgs(argv) {
  const args = { stage: null, force: false, skipReview: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--stage') args.stage = Number(argv[++i]);
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--skip-review') args.skipReview = true;
  }
  return args;
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function runStage1() {
  console.log('[Stage 1] Merging sources, capping rank, POS-filtering...');
  const { descriptors, emotions, colors } = await loadAllSources(ROOT);
  const merged = mergeSources({ descriptors, emotions, colors });
  console.log(`[Stage 1] Merged: ${merged.length} unique entries across all pools`);
  const capped = capRank(merged, RANK_CEILING);
  console.log(`[Stage 1] After rank cap <=${RANK_CEILING}: ${capped.length}`);
  const filtered = await filterByPos(capped, { tokenize: realTokenize });
  console.log(`[Stage 1] After POS filter: ${filtered.length}`);
  await writeFile(PATHS.stage1, JSON.stringify(filtered, null, 2));
  console.log(`[Stage 1] Wrote ${PATHS.stage1}`);
  return filtered;
}

async function runStage2(candidates) {
  console.log(`[Stage 2] AI review of ${candidates.length} candidates in batches of ${BATCH_SIZE}...`);
  const callClaude = await makeRealCallClaude(ROOT);
  const { reviewed, canaryLog } = await reviewAll(candidates, { callClaude, batchSize: BATCH_SIZE });
  const yesCount = reviewed.filter(r => r.verdict === 'yes').length;
  const maybeCount = reviewed.filter(r => r.verdict === 'maybe').length;
  const noCount = reviewed.filter(r => r.verdict === 'no').length;
  console.log(`[Stage 2] Yes: ${yesCount}  Maybe: ${maybeCount}  No: ${noCount}`);
  const driftCount = canaryLog.filter(c => c.drift).length;
  if (driftCount > 0) {
    console.warn(`[Stage 2] WARNING: ${driftCount} canary drift events out of ${canaryLog.length}`);
  }
  await writeFile(PATHS.stage2, JSON.stringify(reviewed, null, 2));
  await writeFile(PATHS.canaryLog, JSON.stringify(canaryLog, null, 2));
  console.log(`[Stage 2] Wrote ${PATHS.stage2}`);
  return reviewed;
}

async function runStage3(reviewed, { skipReview }) {
  const maybes = reviewed.filter(r => r.verdict === 'maybe');
  const html = renderReviewHtml(maybes);
  await writeFile(PATHS.stage3Html, html);
  console.log(`[Stage 3] Wrote ${PATHS.stage3Html} (${maybes.length} maybe entries)`);
  if (skipReview || maybes.length === 0) {
    const approved = reviewed.filter(r => r.verdict === 'yes');
    await writeFile(PATHS.stage3Approved, JSON.stringify(approved, null, 2));
    console.log(`[Stage 3] --skip-review: wrote ${approved.length} approved (yes only)`);
    return approved;
  }
  console.log(`[Stage 3] Open ${PATHS.stage3Html} in a browser to review. Save selections via the review server (see Task 10), then re-run with --stage 4.`);
  console.log(`[Stage 3] Or rerun with --skip-review to bypass.`);
  process.exit(0);
}

async function runStage4(approved) {
  console.log(`[Stage 4] Finalizing ${approved.length} approved entries...`);
  const records = await finalize(approved, PATHS.final);
  console.log(`[Stage 4] Wrote ${PATHS.final} (${records.length} entries)`);
  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });

  const shouldRun = (stage) => args.stage === stage || args.stage === null;
  const canSkip = async (path) => !args.force && await fileExists(path);

  // Stage 1
  let stage1;
  if (shouldRun(1)) {
    stage1 = (await canSkip(PATHS.stage1))
      ? (console.log('[Stage 1] Output exists, skipping (use --force to rerun)'), JSON.parse(await readFile(PATHS.stage1, 'utf8')))
      : await runStage1();
  } else {
    stage1 = JSON.parse(await readFile(PATHS.stage1, 'utf8'));
  }
  if (args.stage === 1) return;

  // Stage 2
  let stage2;
  if (shouldRun(2)) {
    stage2 = (await canSkip(PATHS.stage2))
      ? (console.log('[Stage 2] Output exists, skipping (use --force to rerun)'), JSON.parse(await readFile(PATHS.stage2, 'utf8')))
      : await runStage2(stage1);
  } else {
    stage2 = JSON.parse(await readFile(PATHS.stage2, 'utf8'));
  }
  if (args.stage === 2) return;

  // Stage 3
  let stage3;
  if (shouldRun(3)) {
    stage3 = await runStage3(stage2, { skipReview: args.skipReview });
  } else {
    stage3 = JSON.parse(await readFile(PATHS.stage3Approved, 'utf8'));
  }
  if (args.stage === 3) return;

  // Stage 4
  await runStage4(stage3);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-run Stage 1 end-to-end**

```bash
node scripts/curate-prefixes.mjs --stage 1
```

Expected: prints merged/capped/filtered counts, writes `output/prefix-curation/1-filtered.json`. Inspect entry count and a few entries:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('output/prefix-curation/1-filtered.json','utf8')).length)"
head -30 output/prefix-curation/1-filtered.json
```

Expected: ~1,500-2,500 entries with `pos` field populated. If far outside that range, investigate before proceeding — POS filter is likely too strict or too loose.

- [ ] **Step 3: Commit**

```bash
git add scripts/curate-prefixes.mjs
git commit -m "feat(prefixes): CLI orchestrator wiring stages 1/2/4"
```

---

## Task 10: Stage 3 review server

**Files:**
- Create: `scripts/curate-prefixes-review.mjs`

Stage 3 needs an HTTP server to serve the review HTML and accept the form submission. This is separate from the main orchestrator so the review step can be run independently.

- [ ] **Step 1: Create the review server**

`scripts/curate-prefixes-review.mjs`:
```javascript
#!/usr/bin/env node
// Stage 3 review server. Serves output/prefix-curation/3-review.html and
// accepts POSTed selections, writing output/prefix-curation/3-approved.json.
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parseSelection } from './lib/prefix-curation/render-review.mjs';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'output', 'prefix-curation');
const PORT = 4321;

async function main() {
  const reviewed = JSON.parse(await readFile(join(OUT_DIR, '2-reviewed.json'), 'utf8'));
  const maybes = reviewed.filter(r => r.verdict === 'maybe');
  const byWord = new Map(maybes.map(m => [m.word, m]));

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(join(OUT_DIR, '3-review.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'POST' && req.url === '/submit') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        const approvedMaybes = parseSelection(body);
        const yes = reviewed.filter(r => r.verdict === 'yes');
        const approvedMaybeEntries = [...approvedMaybes].map(w => byWord.get(w)).filter(Boolean);
        const all = [...yes, ...approvedMaybeEntries];
        await writeFile(join(OUT_DIR, '3-approved.json'), JSON.stringify(all, null, 2));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Saved ${all.length} approved entries (${yes.length} yes + ${approvedMaybeEntries.length} maybes). You can now close this tab and run: node scripts/curate-prefixes.mjs --stage 4`);
        setTimeout(() => process.exit(0), 500);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, () => {
    console.log(`Review server listening on http://localhost:${PORT}/`);
    console.log(`Open in a browser, make selections, submit. Server exits after submit.`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test the server with a fake 2-reviewed.json**

```bash
mkdir -p output/prefix-curation
cat > output/prefix-curation/2-reviewed.json <<'EOF'
[
  {"word": "変", "reading": "へん", "meaning": "strange", "rank": 486, "verdict": "yes", "reason": "ok"},
  {"word": "逆", "reading": "ぎゃく", "meaning": "reverse", "rank": 645, "verdict": "maybe", "reason": "abstract"}
]
EOF
# Regenerate the HTML against this file.
node -e "
import('./scripts/lib/prefix-curation/render-review.mjs').then(async m => {
  const fs = await import('fs/promises');
  const r = JSON.parse(await fs.readFile('output/prefix-curation/2-reviewed.json','utf8'));
  await fs.writeFile('output/prefix-curation/3-review.html', m.renderReviewHtml(r.filter(x=>x.verdict==='maybe')));
});
"
node scripts/curate-prefixes-review.mjs &
SERVER_PID=$!
sleep 1
curl -s http://localhost:4321/ | head -20
curl -s -X POST -d 'include=%E9%80%86' http://localhost:4321/submit
wait $SERVER_PID 2>/dev/null || true
cat output/prefix-curation/3-approved.json
# Cleanup:
rm output/prefix-curation/2-reviewed.json output/prefix-curation/3-review.html output/prefix-curation/3-approved.json
```

Expected: `3-approved.json` contains 2 entries — the `yes` (strange) + the submitted `maybe` (reverse).

- [ ] **Step 3: Commit**

```bash
git add scripts/curate-prefixes-review.mjs
git commit -m "feat(prefixes): stage 3 review HTTP server"
```

---

## Task 11: Run the real pipeline and commit data/prefixes.json

**Files:**
- Create: `data/prefixes.json` (committed artifact)

- [ ] **Step 1: Run Stage 1 (POS filter) for real**

```bash
node scripts/curate-prefixes.mjs --stage 1 --force
node -e "console.log(JSON.parse(require('fs').readFileSync('output/prefix-curation/1-filtered.json','utf8')).length)"
```

Expected: ~1,500-2,500 entries. If outside that range, inspect with:
```bash
head -50 output/prefix-curation/1-filtered.json
```
and adjust POS filter criteria before continuing. Abort the pipeline if the count is <500 or >4000.

- [ ] **Step 2: Run Stage 2 (AI review) for real**

Prerequisite: `data/.anthropic-key` file exists with a valid key, or `ANTHROPIC_API_KEY` env var is set.

```bash
node scripts/curate-prefixes.mjs --stage 2 --force 2>&1 | tee /tmp/prefix-stage2.log
```

Watch for canary drift warnings. The full run should take ~5-15 minutes depending on candidate count.

Inspect verdict distribution:
```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('output/prefix-curation/2-reviewed.json','utf8'));
const counts = r.reduce((a,x)=>{a[x.verdict]=(a[x.verdict]||0)+1;return a;},{});
console.log(counts);
"
```

Expected: ~400-900 `yes`, ~100-300 `maybe`, ~500-1500 `no`. Canary log should show zero drift; if >10% of canary verdicts disagree with expected, rerun Stage 2 before proceeding.

- [ ] **Step 3: Run Stage 3 review server and triage maybes**

```bash
node scripts/curate-prefixes.mjs --stage 3
# This regenerates the HTML, then the orchestrator prints the next command.
node scripts/curate-prefixes-review.mjs
# In a browser: open http://localhost:4321/, review maybes, submit.
```

After submit the server exits and `output/prefix-curation/3-approved.json` is written.

If you want to skip human review entirely: `node scripts/curate-prefixes.mjs --stage 3 --skip-review`.

- [ ] **Step 4: Run Stage 4 (finalize)**

```bash
node scripts/curate-prefixes.mjs --stage 4 --force
```

Expected: writes `data/prefixes.json` with 250-700 entries. If the finalize helper throws about pool size, decide whether to relax filters (rerun from an earlier stage) or accept the bounds.

Sanity check:
```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/prefixes.json','utf8'));
console.log('count:', r.length);
console.log('first 5:'); console.log(r.slice(0,5));
console.log('last 5:'); console.log(r.slice(-5));
console.log('pos distribution:');
const counts = r.reduce((a,x)=>{a[x.pos]=(a[x.pos]||0)+1;return a;},{});
console.log(counts);
const dupWords = r.map(x=>x.word).filter((v,i,arr)=>arr.indexOf(v)!==i);
console.log('duplicate words:', dupWords);
const dupIds = r.map(x=>x.id).filter((v,i,arr)=>arr.indexOf(v)!==i);
console.log('duplicate ids:', dupIds);
"
```

Expected: `duplicate words: []`, `duplicate ids: []`, count between 250 and 700, all entries have valid `pos` values.

- [ ] **Step 5: Manual sniff test**

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('data/prefixes.json','utf8'));
const sample = [];
for (let i = 0; i < 30; i++) sample.push(r[Math.floor(Math.random()*r.length)]);
console.log('Random 30 for sniff test:');
for (const e of sample) console.log(\`  \${e.word} (\${e.meaning}) — rank \${e.rank}, \${e.pos}\`);
"
```

Read through the 30 entries. Ask: does `[prefix] [creature]` read naturally for each? If 3+ entries fail the sniff test, rerun stage 2 with a stricter prompt before accepting.

- [ ] **Step 6: Commit the final artifact**

```bash
git add data/prefixes.json
git commit -m "data(prefixes): initial curated pool of Japanese creature prefixes"
```

---

## Task 12: Run the full unit test suite

**Files:** (no changes)

- [ ] **Step 1: Run all new unit tests**

```bash
node --test tests/unit/scripts/prefix-curation/
```

Expected: all tests PASS.

- [ ] **Step 2: Run the full unit test suite to catch regressions**

```bash
npm run test:unit
```

Expected: all tests PASS with no regressions introduced.

- [ ] **Step 3: Commit if any new test exclusions or path tweaks are needed**

If npm test picks up the new tests automatically (glob matches `tests/unit/**/*.test.js`), no commit needed. Otherwise update whatever glob is missing them and commit.

---

## Completion Criteria

- `data/prefixes.json` exists, committed, containing 250-700 entries.
- Every entry has valid `id`, `word`, `reading`, `meaning`, `rank ≤ 15000`, `rawMeanings`, `pos`, `source`.
- No duplicate `word` or `id` values.
- Random sample of 30 passes the manual sniff test.
- `scripts/curate-prefixes.mjs` and `scripts/curate-prefixes-review.mjs` are committed and runnable.
- All new unit tests pass; full test suite passes with no regressions.
- Canary log from the real Stage 2 run shows <10% drift.
