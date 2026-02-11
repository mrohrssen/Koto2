# Word Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Classify all 26,995 Japanese words from `data/jpdb-wordlist.json` into game-relevant categories (enemy, robot, room, descriptors, skill, skip) by dispatching parallel AI subagents, producing `data/word-classifications.csv`.

**Architecture:** A standalone Node.js script (`scripts/classify-words.mjs`) reads the wordlist JSON, splits it into 500-word batches, and dispatches batches to Claude's API in parallel rounds. Each batch returns CSV rows. A merge step stitches all batch files into one CSV with a header. A validation step confirms row count and spot-checks known words.

**Tech Stack:** Node.js ES modules, `@anthropic-ai/sdk` (already in package.json), `fs` for file I/O, `path` for paths. No server changes, no frontend changes.

---

## Context

### Source data

`data/jpdb-wordlist.json` — JSON array of 26,995 objects:
```json
[{"word":"する","rank":1},{"word":"ある","rank":2}, ...]
```

### Output format

`data/word-classifications.csv`:
```csv
word,rank,enemy,robot,room,enemy_descriptor,robot_descriptor,room_descriptor,skill,skip
先生,500,yes,no,no,no,no,no,no,no
赤い,200,no,no,no,yes,yes,no,no,no
```

### Categories

| Category | Type | Description |
|---|---|---|
| `enemy` | noun | Person, occupation, role (teacher, doctor) |
| `robot` | noun | Concrete everyday object (hammer, battery) |
| `room` | noun | Real-world place (school, park) |
| `enemy_descriptor` | adj | Personality/emotional (angry, kind) |
| `robot_descriptor` | adj | Physical/appearance (red, broken) |
| `room_descriptor` | adj | Atmospheric/environmental (dark, crowded) |
| `skill` | verb | Action verb (cut, heal, throw) |
| `skip` | — | Grammar, particles, abstract (する, だけ) |

A word can belong to multiple categories.

### AI SDK usage

The project already has `@anthropic-ai/sdk` installed. Direct usage pattern from `src/ai-providers.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey });
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 500,
  system: systemPrompt,
  messages: [{ role: 'user', content: userContent }]
});
const text = response.content[0]?.text || '';
```

### Existing script pattern

From `scripts/generate-wordlist.mjs`:
```javascript
import { readFileSync, writeFileSync } from 'fs';
// read → transform → write
```

### Test pattern

From `tests/unit/*.test.js`:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
```

---

## Task 1: Create the classification prompt module

**Files:**
- Create: `scripts/lib/classify-prompt.mjs`
- Create: `tests/unit/classify-prompt.test.js`

This module exports the system prompt and a function to format a batch of words into a user message.

**Step 1: Write the failing tests**

Create `tests/unit/classify-prompt.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('classify-prompt', () => {
  let mod;

  it('should export SYSTEM_PROMPT as a non-empty string', async () => {
    mod = await import('../../scripts/lib/classify-prompt.mjs');
    assert.strictEqual(typeof mod.SYSTEM_PROMPT, 'string');
    assert.ok(mod.SYSTEM_PROMPT.length > 100, 'System prompt should be substantial');
  });

  it('should export formatBatch function', async () => {
    mod = await import('../../scripts/lib/classify-prompt.mjs');
    assert.strictEqual(typeof mod.formatBatch, 'function');
  });

  it('formatBatch should produce one line per word with rank', async () => {
    mod = await import('../../scripts/lib/classify-prompt.mjs');
    const batch = [
      { word: '先生', rank: 500 },
      { word: '学校', rank: 800 }
    ];
    const result = mod.formatBatch(batch);
    const lines = result.trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0].includes('先生'));
    assert.ok(lines[0].includes('500'));
    assert.ok(lines[1].includes('学校'));
    assert.ok(lines[1].includes('800'));
  });

  it('SYSTEM_PROMPT should mention all 8 categories', async () => {
    mod = await import('../../scripts/lib/classify-prompt.mjs');
    const categories = ['enemy', 'robot', 'room', 'enemy_descriptor', 'robot_descriptor', 'room_descriptor', 'skill', 'skip'];
    for (const cat of categories) {
      assert.ok(mod.SYSTEM_PROMPT.includes(cat), `Missing category: ${cat}`);
    }
  });

  it('should export CATEGORIES array with 8 entries', async () => {
    mod = await import('../../scripts/lib/classify-prompt.mjs');
    assert.strictEqual(mod.CATEGORIES.length, 8);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/classify-prompt.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `scripts/lib/classify-prompt.mjs`:

```javascript
// scripts/lib/classify-prompt.mjs
// Prompt and formatting for word classification batches.

export const CATEGORIES = [
  'enemy', 'robot', 'room',
  'enemy_descriptor', 'robot_descriptor', 'room_descriptor',
  'skill', 'skip'
];

export const SYSTEM_PROMPT = `Classify each Japanese word for use in a cyberpunk vocabulary-learning RPG. For each word, mark yes or no for each category:

- enemy: A person, occupation, or role you'd encounter in real life (teacher, student, doctor, neighbor, chef). NOT animals, NOT abstract concepts.
- robot: A concrete everyday object that could become a robot/bot (hammer, scissors, battery, broom, bucket). Must be a physical thing you can hold or point at.
- room: A real-world place or location (school, hospital, park, station, kitchen).
- enemy_descriptor: Personality or emotional adjective for people (angry, sleepy, strict, kind, lonely).
- robot_descriptor: Physical or appearance adjective for objects (red, small, broken, heavy, sharp).
- room_descriptor: Atmospheric or environmental adjective for places (dark, wide, ancient, quiet, crowded).
- skill: A verb that works as an attack or ability name (cut, burn, teach, heal, throw). Action verbs, not state verbs.
- skip: Grammar words, particles, conjunctions, pronouns, abstract words that don't fit any above category.

A word can have multiple yes values (e.g. an adjective can be both enemy_descriptor and robot_descriptor).

Output CSV rows only — no headers, no explanation, no markdown fences.
Format: word,rank,enemy,robot,room,enemy_descriptor,robot_descriptor,room_descriptor,skill,skip`;

/**
 * Format a batch of {word, rank} objects into a user message.
 * One line per word: "word,rank"
 */
export function formatBatch(batch) {
  return batch.map(w => `${w.word},${w.rank}`).join('\n');
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/classify-prompt.test.js`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add scripts/lib/classify-prompt.mjs tests/unit/classify-prompt.test.js
git commit -m "feat: add word classification prompt module with tests"
```

---

## Task 2: Create the CSV parser/validator module

**Files:**
- Create: `scripts/lib/classify-csv.mjs`
- Create: `tests/unit/classify-csv.test.js`

Parses AI response CSV text into structured rows. Validates each row has the right column count and only `yes`/`no` values.

**Step 1: Write the failing tests**

Create `tests/unit/classify-csv.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('classify-csv', () => {
  let mod;

  it('should export parseResponse function', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    assert.strictEqual(typeof mod.parseResponse, 'function');
  });

  it('should parse a valid CSV response', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const csv = '先生,500,yes,no,no,no,no,no,no,no\n学校,800,no,no,yes,no,no,no,no,no';
    const rows = mod.parseResponse(csv);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].word, '先生');
    assert.strictEqual(rows[0].rank, 500);
    assert.strictEqual(rows[0].enemy, 'yes');
    assert.strictEqual(rows[0].skip, 'no');
    assert.strictEqual(rows[1].word, '学校');
    assert.strictEqual(rows[1].room, 'yes');
  });

  it('should skip blank lines', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const csv = '先生,500,yes,no,no,no,no,no,no,no\n\n学校,800,no,no,yes,no,no,no,no,no\n';
    const rows = mod.parseResponse(csv);
    assert.strictEqual(rows.length, 2);
  });

  it('should throw on wrong column count', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const csv = '先生,500,yes,no,no';
    assert.throws(() => mod.parseResponse(csv), /column/i);
  });

  it('should throw on invalid yes/no values', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const csv = '先生,500,maybe,no,no,no,no,no,no,no';
    assert.throws(() => mod.parseResponse(csv), /invalid value/i);
  });

  it('should export validateBatch to check row count matches input', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const input = [{ word: '先生', rank: 500 }, { word: '学校', rank: 800 }];
    const rows = [
      { word: '先生', rank: 500, enemy: 'yes', robot: 'no', room: 'no', enemy_descriptor: 'no', robot_descriptor: 'no', room_descriptor: 'no', skill: 'no', skip: 'no' },
      { word: '学校', rank: 800, enemy: 'no', robot: 'no', room: 'yes', enemy_descriptor: 'no', robot_descriptor: 'no', room_descriptor: 'no', skill: 'no', skip: 'no' }
    ];
    assert.doesNotThrow(() => mod.validateBatch(input, rows));
  });

  it('validateBatch should throw on row count mismatch', async () => {
    mod = await import('../../scripts/lib/classify-csv.mjs');
    const input = [{ word: '先生', rank: 500 }, { word: '学校', rank: 800 }];
    const rows = [
      { word: '先生', rank: 500, enemy: 'yes', robot: 'no', room: 'no', enemy_descriptor: 'no', robot_descriptor: 'no', room_descriptor: 'no', skill: 'no', skip: 'no' }
    ];
    assert.throws(() => mod.validateBatch(input, rows), /count mismatch/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/classify-csv.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `scripts/lib/classify-csv.mjs`:

```javascript
// scripts/lib/classify-csv.mjs
// Parse and validate AI classification CSV responses.

import { CATEGORIES } from './classify-prompt.mjs';

/**
 * Parse CSV text from AI response into structured row objects.
 * Throws on malformed rows.
 */
export function parseResponse(csvText) {
  const expectedCols = 2 + CATEGORIES.length; // word + rank + 8 categories = 10
  const lines = csvText.trim().split('\n').filter(l => l.trim() !== '');
  return lines.map((line, i) => {
    const cols = line.split(',').map(c => c.trim());
    if (cols.length !== expectedCols) {
      throw new Error(`Column count error on line ${i + 1}: expected ${expectedCols}, got ${cols.length}. Line: "${line}"`);
    }
    const [word, rankStr, ...flags] = cols;
    for (let j = 0; j < flags.length; j++) {
      if (flags[j] !== 'yes' && flags[j] !== 'no') {
        throw new Error(`Invalid value "${flags[j]}" for ${CATEGORIES[j]} on line ${i + 1}: "${line}"`);
      }
    }
    const row = { word, rank: parseInt(rankStr, 10) };
    CATEGORIES.forEach((cat, j) => { row[cat] = flags[j]; });
    return row;
  });
}

/**
 * Validate that parsed rows match the input batch size.
 */
export function validateBatch(inputBatch, parsedRows) {
  if (parsedRows.length !== inputBatch.length) {
    throw new Error(`Row count mismatch: expected ${inputBatch.length}, got ${parsedRows.length}`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/classify-csv.test.js`
Expected: 7/7 PASS

**Step 5: Commit**

```bash
git add scripts/lib/classify-csv.mjs tests/unit/classify-csv.test.js
git commit -m "feat: add CSV parser/validator for word classification"
```

---

## Task 3: Create the batch dispatcher module

**Files:**
- Create: `scripts/lib/classify-dispatcher.mjs`
- Create: `tests/unit/classify-dispatcher.test.js`

Handles calling the Anthropic API for one batch and parsing the result. Supports retry on failure.

**Step 1: Write the failing tests**

Create `tests/unit/classify-dispatcher.test.js`:

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

describe('classify-dispatcher', () => {
  it('should export classifyBatch function', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    assert.strictEqual(typeof mod.classifyBatch, 'function');
  });

  it('should export splitIntoBatches function', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    assert.strictEqual(typeof mod.splitIntoBatches, 'function');
  });

  it('splitIntoBatches should split words into correct batch sizes', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    const words = Array.from({ length: 1250 }, (_, i) => ({ word: `w${i}`, rank: i + 1 }));
    const batches = mod.splitIntoBatches(words, 500);
    assert.strictEqual(batches.length, 3);
    assert.strictEqual(batches[0].length, 500);
    assert.strictEqual(batches[1].length, 500);
    assert.strictEqual(batches[2].length, 250);
  });

  it('splitIntoBatches should handle exact multiples', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    const words = Array.from({ length: 1000 }, (_, i) => ({ word: `w${i}`, rank: i + 1 }));
    const batches = mod.splitIntoBatches(words, 500);
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].length, 500);
    assert.strictEqual(batches[1].length, 500);
  });

  it('should export rowsToCsv function', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    assert.strictEqual(typeof mod.rowsToCsv, 'function');
  });

  it('rowsToCsv should produce valid CSV lines', async () => {
    const mod = await import('../../scripts/lib/classify-dispatcher.mjs');
    const rows = [
      { word: '先生', rank: 500, enemy: 'yes', robot: 'no', room: 'no', enemy_descriptor: 'no', robot_descriptor: 'no', room_descriptor: 'no', skill: 'no', skip: 'no' }
    ];
    const csv = mod.rowsToCsv(rows);
    assert.strictEqual(csv, '先生,500,yes,no,no,no,no,no,no,no');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/classify-dispatcher.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `scripts/lib/classify-dispatcher.mjs`:

```javascript
// scripts/lib/classify-dispatcher.mjs
// Batch splitting, API dispatch, and CSV serialization.

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, formatBatch, CATEGORIES } from './classify-prompt.mjs';
import { parseResponse, validateBatch } from './classify-csv.mjs';

/**
 * Split an array of words into batches of batchSize.
 */
export function splitIntoBatches(words, batchSize) {
  const batches = [];
  for (let i = 0; i < words.length; i += batchSize) {
    batches.push(words.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Convert parsed row objects back to CSV lines (no header).
 */
export function rowsToCsv(rows) {
  return rows.map(r => {
    return [r.word, r.rank, ...CATEGORIES.map(c => r[c])].join(',');
  }).join('\n');
}

/**
 * Classify a single batch via Anthropic API. Returns parsed rows.
 * Retries up to maxRetries times on failure.
 */
export async function classifyBatch(client, batch, { maxRetries = 2, model = 'claude-sonnet-4-20250514' } = {}) {
  const userMessage = formatBatch(batch);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: batch.length * 60, // ~60 chars per CSV row
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      });

      const text = response.content[0]?.text || '';
      const rows = parseResponse(text);
      validateBatch(batch, rows);
      return rows;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = 1000 * (attempt + 1);
        console.warn(`  Batch retry ${attempt + 1}/${maxRetries}: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/classify-dispatcher.test.js`
Expected: 6/6 PASS

**Step 5: Commit**

```bash
git add scripts/lib/classify-dispatcher.mjs tests/unit/classify-dispatcher.test.js
git commit -m "feat: add batch dispatcher for word classification"
```

---

## Task 4: Create the main classification script

**Files:**
- Create: `scripts/classify-words.mjs`

This is the CLI entry point. Reads the wordlist, dispatches batches in parallel rounds, writes batch files to a scratchpad directory, then merges into the final CSV.

**Step 1: Write the script**

Create `scripts/classify-words.mjs`:

```javascript
#!/usr/bin/env node
// scripts/classify-words.mjs
// Classify all words from jpdb-wordlist.json into game categories.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node scripts/classify-words.mjs [options]
//
// Options:
//   --test-run        Only process first 4 batches (2000 words)
//   --start-batch=N   Resume from batch N (1-indexed, skips already-written batches)
//   --parallel=N      Number of parallel API calls per round (default: 5)
//   --batch-size=N    Words per batch (default: 500)
//   --output-dir=DIR  Directory for batch CSVs (default: scratchpad/classifications)
//   --model=MODEL     Anthropic model to use (default: claude-sonnet-4-20250514)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { splitIntoBatches, classifyBatch, rowsToCsv } from './lib/classify-dispatcher.mjs';

// --- CLI argument parsing ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    testRun: false,
    startBatch: 1,
    parallel: 5,
    batchSize: 500,
    outputDir: 'scratchpad/classifications',
    model: 'claude-sonnet-4-20250514'
  };
  for (const arg of args) {
    if (arg === '--test-run') opts.testRun = true;
    else if (arg.startsWith('--start-batch=')) opts.startBatch = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--parallel=')) opts.parallel = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--batch-size=')) opts.batchSize = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--output-dir=')) opts.outputDir = arg.split('=')[1];
    else if (arg.startsWith('--model=')) opts.model = arg.split('=')[1];
  }
  return opts;
}

// --- Main ---
async function main() {
  const opts = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  // Load wordlist
  const projectRoot = resolve(import.meta.dirname, '..');
  const wordlistPath = join(projectRoot, 'data', 'jpdb-wordlist.json');
  console.log(`Loading wordlist from ${wordlistPath}...`);
  const words = JSON.parse(readFileSync(wordlistPath, 'utf-8'));
  console.log(`Loaded ${words.length} words`);

  // Split into batches
  const allBatches = splitIntoBatches(words, opts.batchSize);
  const totalBatches = opts.testRun ? Math.min(4, allBatches.length) : allBatches.length;
  const batches = allBatches.slice(0, totalBatches);
  console.log(`${totalBatches} batches of ${opts.batchSize} (${opts.testRun ? 'TEST RUN' : 'FULL RUN'})`);

  // Create output directory
  mkdirSync(opts.outputDir, { recursive: true });

  // Initialize Anthropic client
  const client = new Anthropic({ apiKey });

  // Process batches in parallel rounds
  let processed = 0;
  const startIdx = opts.startBatch - 1; // Convert to 0-indexed

  for (let roundStart = startIdx; roundStart < batches.length; roundStart += opts.parallel) {
    const roundEnd = Math.min(roundStart + opts.parallel, batches.length);
    const roundBatches = batches.slice(roundStart, roundEnd);
    const roundNum = Math.floor(roundStart / opts.parallel) + 1;

    console.log(`\n--- Round ${roundNum}: batches ${roundStart + 1}-${roundEnd} of ${totalBatches} ---`);

    const promises = roundBatches.map(async (batch, i) => {
      const batchNum = roundStart + i + 1;
      const batchFile = join(opts.outputDir, `batch-${String(batchNum).padStart(3, '0')}.csv`);

      // Skip if already exists (resume support)
      if (existsSync(batchFile)) {
        console.log(`  Batch ${batchNum}: SKIP (already exists)`);
        return;
      }

      console.log(`  Batch ${batchNum}: classifying ${batch.length} words (ranks ${batch[0].rank}-${batch[batch.length - 1].rank})...`);
      const rows = await classifyBatch(client, batch, { model: opts.model });
      const csv = rowsToCsv(rows);
      writeFileSync(batchFile, csv + '\n');
      console.log(`  Batch ${batchNum}: DONE (${rows.length} rows)`);
    });

    await Promise.all(promises);
    processed += roundBatches.length;
    console.log(`Progress: ${Math.min(roundEnd, totalBatches)}/${totalBatches} batches`);
  }

  // Merge all batch files
  console.log('\n--- Merging batch files ---');
  const header = 'word,rank,enemy,robot,room,enemy_descriptor,robot_descriptor,room_descriptor,skill,skip';
  const batchFiles = readdirSync(opts.outputDir)
    .filter(f => f.startsWith('batch-') && f.endsWith('.csv'))
    .sort();

  let allRows = header + '\n';
  let totalRows = 0;
  for (const file of batchFiles) {
    const content = readFileSync(join(opts.outputDir, file), 'utf-8').trim();
    if (content) {
      allRows += content + '\n';
      totalRows += content.split('\n').length;
    }
  }

  const outputPath = join(projectRoot, 'data', 'word-classifications.csv');
  writeFileSync(outputPath, allRows);
  console.log(`\nWrote ${outputPath}`);
  console.log(`Total rows: ${totalRows} (expected: ${opts.testRun ? batches.reduce((s, b) => s + b.length, 0) : words.length})`);

  // Spot-check
  console.log('\n--- Spot Check ---');
  const spotWords = ['する', '先生', '学校', '切る', 'だけ'];
  const lines = allRows.split('\n').slice(1); // skip header
  for (const sw of spotWords) {
    const line = lines.find(l => l.startsWith(sw + ','));
    if (line) console.log(`  ${line}`);
    else console.log(`  ${sw}: NOT FOUND`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: Syntax check**

Run: `node --check scripts/classify-words.mjs && echo "OK"`
Expected: OK

**Step 3: Dry-run test (no API key — should fail gracefully)**

Run: `node scripts/classify-words.mjs --test-run`
Expected: "Error: ANTHROPIC_API_KEY environment variable is required" then exit 1.

**Step 4: Commit**

```bash
git add scripts/classify-words.mjs
git commit -m "feat: add main word classification script with batching and resume support"
```

---

## Task 5: Test run with real API (4 batches, 2000 words)

This task uses the real API. Requires `ANTHROPIC_API_KEY` to be set.

**Step 1: Run test classification**

```bash
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY node scripts/classify-words.mjs --test-run --parallel=4
```

Expected: 4 batch files in `scratchpad/classifications/`, 2000 CSV rows total.

**Step 2: Review output quality**

Read `scratchpad/classifications/batch-001.csv` and spot-check:
- `する` should be `skip`
- `思う` (to think) — could be `skill` or `skip` (state verb, probably skip)
- `私` (I/me) should be `skip`
- `見る` (to see/look) should be `skill`

If quality is poor, adjust `SYSTEM_PROMPT` in `scripts/lib/classify-prompt.mjs` and re-run.

**Step 3: Present sample output for user approval**

Show the first 20 rows of batch-001 to the user. Ask: "Does this classification quality look good? Should I proceed with the full run?"

---

## Task 6: Full run (all 54 batches)

**Step 1: Run full classification**

```bash
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY node scripts/classify-words.mjs --parallel=5
```

This will skip the 4 already-completed batches from the test run (resume support). Expected runtime: ~10 rounds of 5 parallel batches.

**Step 2: Validate final output**

```bash
# Row count (excluding header)
tail -n +2 data/word-classifications.csv | wc -l
# Expected: 26995

# Spot-check known words
grep '^先生,' data/word-classifications.csv
# Expected: 先生,500,yes,no,no,no,no,no,no,no

grep '^学校,' data/word-classifications.csv
# Expected: 学校,800,no,no,yes,no,no,no,no,no

grep '^切る,' data/word-classifications.csv
# Expected: 切る,350,no,no,no,no,no,no,yes,no

grep '^だけ,' data/word-classifications.csv
# Expected: だけ,17,no,no,no,no,no,no,no,yes
```

**Step 3: Category distribution sanity check**

```bash
# Count words per category
for cat in enemy robot room enemy_descriptor robot_descriptor room_descriptor skill skip; do
  count=$(grep -o ',yes' data/word-classifications.csv | head -1; awk -F',' -v col="$cat" 'NR==1{for(i=1;i<=NF;i++)if($i==col)c=i} NR>1&&$c=="yes"{n++} END{print n}' data/word-classifications.csv)
  echo "$cat: $count"
done
```

If any category has 0 or >20000, something is wrong.

**Step 4: Commit the final CSV**

```bash
git add data/word-classifications.csv
git commit -m "data: add word classifications for 26,995 Japanese words"
```

---

## Task 7: Cleanup

**Step 1: Remove scratchpad batch files**

```bash
rm -rf scratchpad/classifications/
```

**Step 2: Final commit with all files**

```bash
git add scripts/lib/classify-prompt.mjs scripts/lib/classify-csv.mjs scripts/lib/classify-dispatcher.mjs scripts/classify-words.mjs tests/unit/classify-prompt.test.js tests/unit/classify-csv.test.js tests/unit/classify-dispatcher.test.js
git commit -m "feat: word classification pipeline — script, libs, and tests"
```

**Step 3: Run full unit test suite to confirm no regressions**

Run: `npm run test:unit`
Expected: Pre-existing failures only (~48 known failures on dual-pool-pipeline and chip stats). No new failures.
