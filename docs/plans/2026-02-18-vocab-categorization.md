# Vocab Categorization Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Categorize all 26,995 words in `data/jpdb-wordlist.csv` into 17 semantic categories, outputting one JSON file per category to `data/vocab-categories/`.

**Architecture:** A Bash script splits the CSV into 27 batches of ~1,000 words. Sonnet 4.6 subagents (via Task tool, `model: sonnet`) each read one batch from `/tmp`, categorize every word, and write a result JSON to `/tmp`. A Node merge script combines all 27 result files into per-category JSON files.

**Tech Stack:** Bash (splitting), Claude Code Task tool with Sonnet subagents (categorization), Node.js (merging)

**Design doc:** `docs/plans/2026-02-18-vocab-categorization-design.md`

---

### Task 1: Split CSV into Batches

**Files:**
- Read: `data/jpdb-wordlist.csv` (26,996 lines including header)
- Create: `/tmp/vocab-cat-batch-{01..27}.csv` (27 batch files)

**Step 1: Create the batch files**

Split the CSV (skipping header) into files of 1,000 lines each. Each batch gets the header prepended.

```bash
# Store header
head -1 /Users/michia/Documents/jrpg/data/jpdb-wordlist.csv > /tmp/vocab-cat-header.csv

# Split body into 1000-line chunks
tail -n +2 /Users/michia/Documents/jrpg/data/jpdb-wordlist.csv | split -l 1000 -d -a 2 - /tmp/vocab-cat-chunk-

# Prepend header to each chunk and rename to final batch files
i=1
for chunk in /tmp/vocab-cat-chunk-*; do
  batch=$(printf "/tmp/vocab-cat-batch-%02d.csv" $i)
  cat /tmp/vocab-cat-header.csv "$chunk" > "$batch"
  rm "$chunk"
  i=$((i + 1))
done

# Clean up
rm /tmp/vocab-cat-header.csv

# Verify
ls -la /tmp/vocab-cat-batch-*.csv | wc -l
wc -l /tmp/vocab-cat-batch-01.csv /tmp/vocab-cat-batch-27.csv
```

Expected: 27 batch files. Batch 01 has 1,001 lines (header + 1,000 words). Batch 27 has the remainder (header + 995 words).

**Step 2: Spot-check a batch**

```bash
head -3 /tmp/vocab-cat-batch-01.csv
tail -3 /tmp/vocab-cat-batch-27.csv
```

Expected: Batch 01 starts with rank 1 (する). Batch 27 ends with the last word in the CSV.

---

### Task 2: Dispatch Categorization Subagents (Batches 1-9)

**Files:**
- Read: `/tmp/vocab-cat-batch-{01..09}.csv`
- Create: `/tmp/vocab-cat-result-{01..09}.json`

**Step 1: Dispatch 3 subagents in parallel (batches 1-3)**

Use the Task tool with `model: sonnet`, `subagent_type: general-purpose`, `run_in_background: true` for each. The prompt for EVERY subagent must be:

```
You are categorizing Japanese vocabulary words into semantic categories.

Read the CSV file at /tmp/vocab-cat-batch-{NN}.csv. It has columns: rank, word, reading, vid, sid, part_of_speech, meanings.

For each word, assign it to one or more of these 17 categories based on its meaning:

- animals: Real animals, insects, fish, birds
- foods: Foods, drinks, ingredients, dishes
- locations: Places, buildings, geographic features
- occupations: Jobs, roles, social positions
- body-parts: Human/animal body parts
- nature: Plants, weather, seasons, natural phenomena
- objects: Tools, furniture, household items, instruments
- clothing: Clothes, accessories, fabrics
- emotions: Feelings, mental states
- actions: Physical action verbs (hit, run, cut, break, throw)
- movement: Motion verbs (fly, swim, walk, fall, climb)
- descriptors: Adjectives for appearance, size, quality, temperature
- colors: Color words
- numbers-time: Numbers, counters, time/date words
- combat: Fighting, conflict, damage, defense words
- social: Communication, relationships, group words
- abstract: Abstract concepts, philosophy, states that don't fit elsewhere

Rules:
- A word can belong to multiple categories (e.g. 鮭 salmon → animals AND foods)
- Grammar particles, conjunctions, sentence-enders, and pure function words get NO categories (empty array)
- Use the English "meanings" column to determine categories, not just the POS tag
- For the "meaning" output field, write a SHORT primary meaning (under 10 words). Not the full JPDB paragraph.
- Verbs: categorize by what the action IS, not what POS it is. 食べる (to eat) → foods. 走る (to run) → movement.
- If a word genuinely doesn't fit any category, use an empty categories array.

Write your output as a JSON array to /tmp/vocab-cat-result-{NN}.json:

[
  {"rank": 1, "word": "する", "reading": "する", "meaning": "to do", "categories": ["actions"]},
  {"rank": 2, "word": "ある", "reading": "ある", "meaning": "to exist", "categories": []},
  ...
]

Process ALL words in the batch. Do not skip any. Do not truncate. Write the complete JSON file.
```

Replace `{NN}` with the zero-padded batch number (01, 02, 03).

**Step 2: Wait for batches 1-3 to complete, then dispatch batches 4-6**

Check each background agent's output file. Once all 3 are done, dispatch the next 3 (batches 4-6) with the same prompt template.

**Step 3: Wait for batches 4-6, then dispatch batches 7-9**

Same pattern.

**Step 4: Verify all 9 result files exist and are valid JSON**

```bash
for i in $(seq -w 1 9); do
  echo -n "Batch $i: "
  node -e "const d=require('/tmp/vocab-cat-result-0${i}.json'); console.log(d.length + ' words')"
done
```

Expected: Each result file has ~1,000 entries.

---

### Task 3: Dispatch Categorization Subagents (Batches 10-18)

Same as Task 2 but for batches 10-18. Same prompt template, same 3-at-a-time parallel pattern.

**Step 1:** Dispatch batches 10-12 in parallel (background).
**Step 2:** Wait, then dispatch batches 13-15.
**Step 3:** Wait, then dispatch batches 16-18.
**Step 4:** Verify all 9 result files.

```bash
for i in $(seq 10 18); do
  echo -n "Batch $i: "
  node -e "const d=require('/tmp/vocab-cat-result-${i}.json'); console.log(d.length + ' words')"
done
```

---

### Task 4: Dispatch Categorization Subagents (Batches 19-27)

Same as Task 2 but for batches 19-27.

**Step 1:** Dispatch batches 19-21 in parallel (background).
**Step 2:** Wait, then dispatch batches 22-24.
**Step 3:** Wait, then dispatch batches 25-27.
**Step 4:** Verify all 9 result files.

```bash
for i in $(seq 19 27); do
  echo -n "Batch $i: "
  node -e "const d=require('/tmp/vocab-cat-result-${i}.json'); console.log(d.length + ' words')"
done
```

---

### Task 5: Write Merge Script

**Files:**
- Create: `scripts/merge-vocab-categories.mjs`

**Step 1: Write the merge script**

```javascript
#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const CATEGORIES = [
  'animals', 'foods', 'locations', 'occupations', 'body-parts',
  'nature', 'objects', 'clothing', 'emotions', 'actions',
  'movement', 'descriptors', 'colors', 'numbers-time',
  'combat', 'social', 'abstract'
];

const BATCH_COUNT = 27;
const RESULT_DIR = '/tmp';
const OUTPUT_DIR = '/Users/michia/Documents/jrpg/data/vocab-categories';

async function main() {
  // Read all batch results
  const allWords = [];
  for (let i = 1; i <= BATCH_COUNT; i++) {
    const pad = String(i).padStart(2, '0');
    const path = `${RESULT_DIR}/vocab-cat-result-${pad}.json`;
    const data = JSON.parse(await readFile(path, 'utf8'));
    allWords.push(...data);
    console.log(`Batch ${pad}: ${data.length} words`);
  }
  console.log(`\nTotal words loaded: ${allWords.length}`);

  // Group by category
  const buckets = {};
  for (const cat of CATEGORIES) buckets[cat] = [];

  let uncategorized = 0;
  for (const word of allWords) {
    if (!word.categories || word.categories.length === 0) {
      uncategorized++;
      continue;
    }
    for (const cat of word.categories) {
      if (!buckets[cat]) {
        console.warn(`Unknown category "${cat}" for word "${word.word}" — skipping`);
        continue;
      }
      buckets[cat].push({
        rank: word.rank,
        word: word.word,
        reading: word.reading,
        meaning: word.meaning
      });
    }
  }

  // Sort each bucket by rank and write
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const cat of CATEGORIES) {
    buckets[cat].sort((a, b) => a.rank - b.rank);
    const path = `${OUTPUT_DIR}/${cat}.json`;
    await writeFile(path, JSON.stringify(buckets[cat], null, 2) + '\n');
    console.log(`${cat}: ${buckets[cat].length} words`);
  }

  console.log(`\nUncategorized (no categories): ${uncategorized}`);
  console.log(`Output written to ${OUTPUT_DIR}/`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 2: Verify syntax**

```bash
node --check /Users/michia/Documents/jrpg/scripts/merge-vocab-categories.mjs && echo "OK"
```

Expected: OK

---

### Task 6: Run Merge and Spot Check

**Files:**
- Read: `/tmp/vocab-cat-result-{01..27}.json`
- Create: `data/vocab-categories/*.json` (17 files)

**Step 1: Run the merge script**

```bash
node /Users/michia/Documents/jrpg/scripts/merge-vocab-categories.mjs
```

Expected: Prints word counts per category and total. All 17 files created.

**Step 2: Verify output files exist**

```bash
ls -la /Users/michia/Documents/jrpg/data/vocab-categories/
```

Expected: 17 JSON files.

**Step 3: Spot check — animals**

```bash
node -e "const d=require('/Users/michia/Documents/jrpg/data/vocab-categories/animals.json'); console.log('Count:', d.length); d.slice(0,10).forEach(w => console.log(w.rank, w.word, w.meaning))"
```

Verify the top entries are actual animals (犬, 猫, 馬, etc.).

**Step 4: Spot check — foods**

```bash
node -e "const d=require('/Users/michia/Documents/jrpg/data/vocab-categories/foods.json'); console.log('Count:', d.length); d.slice(0,10).forEach(w => console.log(w.rank, w.word, w.meaning))"
```

Verify the top entries are actual foods/drinks.

**Step 5: Spot check — locations**

```bash
node -e "const d=require('/Users/michia/Documents/jrpg/data/vocab-categories/locations.json'); console.log('Count:', d.length); d.slice(0,10).forEach(w => console.log(w.rank, w.word, w.meaning))"
```

Verify the top entries are actual places.

**Step 6: Check for obvious problems**

```bash
# Any category with 0 entries?
for f in /Users/michia/Documents/jrpg/data/vocab-categories/*.json; do
  echo -n "$(basename $f .json): "
  node -e "console.log(require('$f').length)"
done
```

If any category has 0 entries, investigate the batch results for that category.

---

### Task 7: Commit

**Step 1: Commit the merge script and output**

```bash
cd /Users/michia/Documents/jrpg
git add scripts/merge-vocab-categories.mjs data/vocab-categories/ docs/plans/2026-02-18-vocab-categorization-design.md docs/plans/2026-02-18-vocab-categorization.md
git commit -m "feat: categorize 27K JPDB words into 17 semantic categories for forge brainstorming"
```

---

## Notes for Implementer

- **Do NOT read result files into your own context.** Each result file is ~1,000 entries of JSON. Let the merge script handle them. Only spot-check small slices (first 10 entries).
- **Subagent prompt is identical for every batch** — only the batch number `{NN}` changes.
- **If a subagent fails or produces invalid JSON**, re-dispatch it for that single batch. Don't re-run everything.
- **3 subagents in parallel at a time** to avoid overload. Wait for all 3 to finish before dispatching the next 3.
- **The `/tmp/` files are ephemeral.** The only permanent output is `data/vocab-categories/` and the merge script.
