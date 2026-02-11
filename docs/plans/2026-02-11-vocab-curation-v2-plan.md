# Vocab Curation Pipeline v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the v1 vocab pipeline (avg rank 7560, 362 words) with a v2 that prioritizes common words (target avg rank < 3000, 80%+ from rank 1–5000).

**Architecture:** A 5-step linear pipeline. Steps 1, 4, 5 are Node.js scripts. Steps 2, 3 are Claude Task tool agents dispatched from this session. All scripts live in `output/vocab-pipeline-v2/`. The v1 pipeline in `output/vocab-pipeline/` is left untouched for reference.

**Tech Stack:** Node.js (CommonJS `.cjs`), Claude Task tool (Opus agents for classification/assignment), TSV/JSON intermediate files.

**Design doc:** `docs/plans/2026-02-11-vocab-curation-v2-design.md`

---

## Task 1: Set up v2 directory and run noun extraction

**Files:**
- Create: `output/vocab-pipeline-v2/` (directory)
- Create: `output/vocab-pipeline-v2/step1-extract-nouns.cjs`
- Reference: `output/vocab-pipeline/extract-nouns.cjs` (v1 version to adapt)
- Reference: `data/jpdb-wordlist.csv`

**Step 1: Create the directory**

```bash
mkdir -p output/vocab-pipeline-v2/step2 output/vocab-pipeline-v2/step3 output/vocab-pipeline-v2/step4 output/vocab-pipeline-v2/step5
```

**Step 2: Write the noun extraction script**

Adapt `output/vocab-pipeline/extract-nouns.cjs`. Key changes from v1:
- Output TWO files: `step1-nouns-all.json` (all ~8000 nouns from rank 1–15000) and `step1-nouns-priority.tsv` (rank 1–5000 only, for Step 2 agents)
- The TSV format: `rank\tword\treading\tfirst_meaning` (one line per word)
- Also output `step1-nouns-rare.tsv` (rank 5001–15000, for Step 3 gap-filling)

```javascript
const fs = require('fs');
const path = require('path');

const BASE = __dirname;

// CSV parser (handles quoted fields)
function parseCsvLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

const csv = fs.readFileSync(path.join(BASE, '../../data/jpdb-wordlist.csv'), 'utf8');
const lines = csv.split('\n');
const dataLines = lines.slice(1, 15001);

const SKIP_POS = new Set(['prt','conj','aux','cop','pn','int','pref','suf','ctr','exp','aux-v','aux-adj']);

const allNouns = [];

for (const line of dataLines) {
  if (!line.trim()) continue;
  const parts = parseCsvLine(line);
  if (parts.length < 7) continue;

  const rank = parseInt(parts[0]);
  const word = parts[1];
  const reading = parts[2];
  const pos = parts[5].trim();
  const meanings = parts[6].trim();

  const posTags = pos.split(';').map(t => t.trim());
  if (!posTags.includes('n')) continue;
  if (posTags.every(t => SKIP_POS.has(t))) continue;
  // Skip single-kana grammar particles
  if (word.length === 1 && /^[\u3040-\u309F\u30A0-\u30FF]$/.test(word)) continue;

  const firstMeaning = meanings.split(';')[0].trim();
  allNouns.push({ rank, word, reading, pos, meanings, firstMeaning });
}

// Write full JSON
fs.writeFileSync(path.join(BASE, 'step1-nouns-all.json'), JSON.stringify(allNouns, null, 2));

// Write priority TSV (rank 1-5000)
const priority = allNouns.filter(n => n.rank <= 5000);
const priorityTsv = priority.map(n => `${n.rank}\t${n.word}\t${n.reading}\t${n.firstMeaning}`).join('\n');
fs.writeFileSync(path.join(BASE, 'step1-nouns-priority.tsv'), priorityTsv);

// Write rare TSV (rank 5001-15000)
const rare = allNouns.filter(n => n.rank > 5000);
const rareTsv = rare.map(n => `${n.rank}\t${n.word}\t${n.reading}\t${n.firstMeaning}`).join('\n');
fs.writeFileSync(path.join(BASE, 'step1-nouns-rare.tsv'), rareTsv);

console.log(`Total nouns extracted: ${allNouns.length}`);
console.log(`Priority (rank 1-5000): ${priority.length}`);
console.log(`Rare (rank 5001-15000): ${rare.length}`);
console.log(`Priority TSV size: ${(priorityTsv.length / 1024).toFixed(1)}KB`);
```

**Step 3: Run the script**

```bash
node output/vocab-pipeline-v2/step1-extract-nouns.cjs
```

Expected output:
```
Total nouns extracted: ~8000
Priority (rank 1-5000): ~2200
Rare (rank 5001-15000): ~5800
Priority TSV size: ~60KB
```

**Step 4: Spot-check output**

Read first 20 lines of `step1-nouns-priority.tsv` and confirm format is `rank\tword\treading\tmeaning`. Confirm sorted by rank ascending.

**Step 5: Commit**

```bash
git add output/vocab-pipeline-v2/step1-extract-nouns.cjs
git commit -m "feat(vocab-v2): step 1 — extract nouns from jpdb wordlist"
```

---

## Task 2: Write concrete/abstract classification prompt and parser

**Files:**
- Create: `output/vocab-pipeline-v2/step2-classify-prompt.md`
- Create: `output/vocab-pipeline-v2/step2-parse-results.cjs`

**Step 1: Write the classification prompt template**

This is the system prompt for each of the 2 parallel agents. It will be loaded as a string by the runner.

```markdown
# Concrete/Abstract Noun Classification

You are classifying Japanese nouns for a monster-collecting RPG. For each word, decide:
- **Y** = concrete (an artist could draw it, a player could hold it, or a person could fill the role)
- **N** = abstract (concepts, grammar, emotions, time, measurements)

## Hard Rules

Always Y:
- Animals, plants, food, drinks
- Tools, weapons, instruments, machines, vehicles
- Weather phenomena (rain, snow, lightning, wind)
- Buildings, rooms, furniture, containers
- Human roles (teacher, doctor, soldier, king, chef)
- Body parts with clear visual form (hand, eye, leg, wing)
- Clothing, accessories, materials (wood, stone, metal, cloth)
- Natural features (mountain, river, ocean, island, forest)

Always N:
- Emotions (love, anger, joy, sadness)
- Abstract concepts (experience, relationship, freedom, peace)
- Grammar/function words (thing, matter, way, case, point)
- Time words (today, morning, moment, era)
- Counters and measurements (degree, percent, times)
- Directions (north, south, left, right)
- Pronouns that slipped through (self, everyone)

When uncertain, mark Y. Better to include and drop later.

## Input Format

One word per line: `rank\tword\treading\tmeaning`

## Output Format

One line per word, nothing else:
`Y\trank\tword\tmeaning` or `N\trank\tword\tmeaning`

Do not add headers, commentary, or explanations. Just the classification lines.

## Words to Classify

```

**Step 2: Write the results parser**

```javascript
const fs = require('fs');
const path = require('path');

const BASE = __dirname;

// Parse agent output files (step2/chunk-1-result.txt, step2/chunk-2-result.txt)
// Format: Y\trank\tword\tmeaning or N\trank\tword\tmeaning

const concrete = [];
const abstract = [];

for (const chunk of [1, 2]) {
  const file = path.join(BASE, `step2/chunk-${chunk}-result.txt`);
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Handle various separator formats the agent might use
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const verdict = parts[0].trim().toUpperCase();
    const rank = parseInt(parts[1]);
    const word = parts[2].trim();
    const meaning = parts.slice(3).join('\t').trim();

    if (isNaN(rank)) continue;

    const entry = { rank, word, meaning };
    if (verdict === 'Y') concrete.push(entry);
    else if (verdict === 'N') abstract.push(entry);
    else console.warn(`Unknown verdict "${verdict}" for ${word}`);
  }
}

// Sort by rank
concrete.sort((a, b) => a.rank - b.rank);
abstract.sort((a, b) => a.rank - b.rank);

// Write outputs
fs.writeFileSync(path.join(BASE, 'step2/concrete-nouns.json'), JSON.stringify(concrete, null, 2));
fs.writeFileSync(path.join(BASE, 'step2/abstract-nouns.json'), JSON.stringify(abstract, null, 2));

// Write concrete TSV for Step 3 input
const concreteTsv = concrete.map(c => `${c.rank}\t${c.word}\t${c.meaning}`).join('\n');
fs.writeFileSync(path.join(BASE, 'step2/concrete-nouns.tsv'), concreteTsv);

console.log(`=== Step 2 Results ===`);
console.log(`Concrete (Y): ${concrete.length}`);
console.log(`Abstract (N): ${abstract.length}`);
console.log(`Total classified: ${concrete.length + abstract.length}`);
console.log(`Concrete TSV size: ${(concreteTsv.length / 1024).toFixed(1)}KB`);
console.log(`\nTop 10 concrete by rank:`);
concrete.slice(0, 10).forEach(c => console.log(`  r${c.rank} ${c.word} = ${c.meaning}`));
console.log(`\nTop 10 abstract by rank:`);
abstract.slice(0, 10).forEach(a => console.log(`  r${a.rank} ${a.word} = ${a.meaning}`));
```

**Step 3: Commit**

```bash
git add output/vocab-pipeline-v2/step2-classify-prompt.md output/vocab-pipeline-v2/step2-parse-results.cjs
git commit -m "feat(vocab-v2): step 2 — concrete/abstract classification prompt and parser"
```

---

## Task 3: Run concrete/abstract classification agents

**Files:**
- Input: `output/vocab-pipeline-v2/step1-nouns-priority.tsv`
- Input: `output/vocab-pipeline-v2/step2-classify-prompt.md`
- Create: `output/vocab-pipeline-v2/step2/chunk-1-result.txt`
- Create: `output/vocab-pipeline-v2/step2/chunk-2-result.txt`
- Output: `output/vocab-pipeline-v2/step2/concrete-nouns.json`
- Output: `output/vocab-pipeline-v2/step2/concrete-nouns.tsv`

**Step 1: Split the priority nouns into 2 chunks**

Read `step1-nouns-priority.tsv`, split in half, save as `step2/chunk-1-input.tsv` and `step2/chunk-2-input.tsv`.

```bash
# Quick split — get line count, divide in two
wc -l output/vocab-pipeline-v2/step1-nouns-priority.tsv
# Split at midpoint
total=$(wc -l < output/vocab-pipeline-v2/step1-nouns-priority.tsv)
half=$((total / 2))
head -n $half output/vocab-pipeline-v2/step1-nouns-priority.tsv > output/vocab-pipeline-v2/step2/chunk-1-input.tsv
tail -n +$((half + 1)) output/vocab-pipeline-v2/step1-nouns-priority.tsv > output/vocab-pipeline-v2/step2/chunk-2-input.tsv
```

**Step 2: Dispatch 2 parallel Claude agents**

Use the Task tool with `subagent_type: "general-purpose"` and `model: "opus"`. Each agent receives:
- The full classification prompt from `step2-classify-prompt.md`
- One chunk of TSV data appended after `## Words to Classify`
- Instruction to write output to `step2/chunk-N-result.txt`

Run both agents in parallel (single message, two Task tool calls).

**Step 3: Parse results**

```bash
node output/vocab-pipeline-v2/step2-parse-results.cjs
```

Expected output:
```
Concrete (Y): ~400-600
Abstract (N): ~1600-1800
```

**Step 4: Spot-check**

Review concrete list for obvious mistakes:
- Any abstract concepts marked Y? (経験, 関係, 状態 should be N)
- Any concrete nouns marked N? (犬, 魚, 山 should be Y)

If > 10 errors found, re-run the problematic chunk with corrections noted in the prompt.

**Step 5: Commit**

```bash
git add output/vocab-pipeline-v2/step2/
git commit -m "feat(vocab-v2): step 2 — classify ~2200 nouns as concrete/abstract"
```

---

## Task 4: Write area discovery prompt and parser

**Files:**
- Create: `output/vocab-pipeline-v2/step3-assign-prompt.md`
- Create: `output/vocab-pipeline-v2/step3-parse-results.cjs`

**Step 1: Write the area discovery + assignment prompt**

```markdown
# Area Discovery & Word Assignment

You are a game designer building areas for a Japanese vocabulary monster-collecting RPG. You receive a list of concrete Japanese nouns sorted by frequency rank (most common first). Your job:

1. **Discover 8–12 areas** that emerge naturally from the vocabulary. Areas should feel like real places suggested by the words — if 30 food words exist, create a market or kitchen area. Do not force fantasy themes onto everyday vocabulary.

2. **Assign every word** to exactly one area as creature, item, or boss:
   - **creature**: anything reimaginable as a collectible monster (dog, spider, flame, umbrella). Gets an element.
   - **item**: anything suggesting a gameplay buff (medicine, key, map, armor). No element.
   - **boss**: human roles that fit the area (teacher, doctor, king, chef). No element.

3. **Assign an element** to each creature: wood, fire, water, metal, earth. The element should feel natural — 犬 (dog) → earth, 魚 (fish) → water, 花 (flower) → wood.

4. **Optionally propose rare words** (rank 5001+) ONLY to fill genuine gaps. Each must have a `justification` field explaining why the area needs it. Limit to ~20 total across all areas.

## Constraints

- **Every word in the input MUST appear in exactly one area.** You cannot drop any.
- Each area needs: minimum 15 creatures, 8 items, 3 bosses.
- No area may exceed 30 creatures.
- Each area must have at least 3 of 5 elements represented.
- Lower-rank words should go where they fit best — don't cluster all common words in one area.

## Rare Word Pool (for gap-filling only)

Below the main word list, a separate section lists rank 5001–15000 nouns. Draw from this ONLY when an area genuinely needs depth (e.g., a missing boss role or a compound teaching a common root).

## Output Format

Output valid JSON. No markdown fences, no commentary before or after. Just the JSON object:

```json
{
  "areas": [
    {
      "id": "kitchen",
      "nameJp": "厨房エリア",
      "nameEn": "Kitchen District",
      "theme": "A bustling kitchen full of culinary creatures",
      "creatures": [
        { "r": 3735, "w": "鍋", "e": "fire", "n": "Pot creature bubbling with battle energy" }
      ],
      "items": [
        { "r": 1200, "w": "塩", "n": "Salt — boosts attack temporarily" }
      ],
      "bosses": [
        { "r": 2500, "w": "料理人", "n": "Chef — master of the kitchen" }
      ],
      "rareAdditions": [
        { "r": 8665, "w": "校長", "n": "Principal", "justification": "Area has no authority boss" }
      ]
    }
  ]
}
```

Field key: `r` = rank, `w` = word, `e` = element (creatures only), `n` = reasoning/description.

## Words to Assign

```

**Step 2: Write the results parser**

```javascript
const fs = require('fs');
const path = require('path');

const BASE = __dirname;

// Parse area assignment JSON from agent output
// Agent may output with or without markdown fences
const raw = fs.readFileSync(path.join(BASE, 'step3/assignment-result.txt'), 'utf8');

// Strip markdown fences if present
let jsonStr = raw;
const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
if (fenceMatch) jsonStr = fenceMatch[1];

// Try to find the JSON object
const firstBrace = jsonStr.indexOf('{');
const lastBrace = jsonStr.lastIndexOf('}');
if (firstBrace === -1 || lastBrace === -1) {
  console.error('No JSON object found in agent output');
  process.exit(1);
}
jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

let data;
try {
  data = JSON.parse(jsonStr);
} catch (e) {
  console.error('JSON parse error:', e.message);
  // Show context around error position
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  console.error('Context:', jsonStr.slice(Math.max(0, pos - 100), pos + 100));
  process.exit(1);
}

if (!data.areas || !Array.isArray(data.areas)) {
  console.error('Missing "areas" array in output');
  process.exit(1);
}

// Write parsed JSON
fs.writeFileSync(path.join(BASE, 'step3/assignments-parsed.json'), JSON.stringify(data, null, 2));

// Summary
console.log(`=== Step 3 Results ===`);
console.log(`Areas: ${data.areas.length}`);
let totalC = 0, totalI = 0, totalB = 0, totalRare = 0;
for (const area of data.areas) {
  const c = (area.creatures || []).length;
  const i = (area.items || []).length;
  const b = (area.bosses || []).length;
  const rare = (area.rareAdditions || []).length;
  totalC += c; totalI += i; totalB += b; totalRare += rare;
  console.log(`  ${area.id} "${area.nameEn}": ${c}c ${i}i ${b}b (+${rare} rare)`);
}
console.log(`\nTotal: ${totalC + totalI + totalB} words (${totalC}c ${totalI}i ${totalB}b) + ${totalRare} rare additions`);
```

**Step 3: Commit**

```bash
git add output/vocab-pipeline-v2/step3-assign-prompt.md output/vocab-pipeline-v2/step3-parse-results.cjs
git commit -m "feat(vocab-v2): step 3 — area discovery prompt and parser"
```

---

## Task 5: Dispatch area discovery agent and parse results

**Files:**
- Input: `output/vocab-pipeline-v2/step2/concrete-nouns.tsv`
- Input: `output/vocab-pipeline-v2/step1-nouns-rare.tsv` (for rare pool)
- Input: `output/vocab-pipeline-v2/step3-assign-prompt.md`
- Create: `output/vocab-pipeline-v2/step3/assignment-result.txt`
- Output: `output/vocab-pipeline-v2/step3/assignments-parsed.json`

**Step 1: Check concrete noun count**

```bash
wc -l output/vocab-pipeline-v2/step2/concrete-nouns.tsv
```

If > 500 words, split into 2 chunks and run 2 agents. Otherwise, 1 agent handles all.

**Step 2: Dispatch the agent(s)**

Use Task tool with `subagent_type: "general-purpose"`, `model: "opus"`. The agent receives:
- The assignment prompt from `step3-assign-prompt.md`
- The concrete nouns TSV appended after `## Words to Assign`
- A `## Rare Word Pool` section with the first ~2000 lines of `step1-nouns-rare.tsv` (truncated to stay within context)
- Instruction to write JSON output to `step3/assignment-result.txt`

If splitting into 2 agents:
- Each agent gets half the concrete nouns + the full rare pool
- Each outputs to `step3/assignment-result-1.txt` and `step3/assignment-result-2.txt`
- A merge step combines the area lists, deduplicating by word

**Step 3: Parse results**

```bash
node output/vocab-pipeline-v2/step3-parse-results.cjs
```

**Step 4: Quick sanity check**

- Each area has 15+ creatures, 8+ items, 3+ bosses
- No word appears in two areas
- Total word count matches concrete noun count + rare additions

**Step 5: Commit**

```bash
git add output/vocab-pipeline-v2/step3/
git commit -m "feat(vocab-v2): step 3 — area discovery and word assignment"
```

---

## Task 6: Write and run validation script

**Files:**
- Create: `output/vocab-pipeline-v2/step4-validate.cjs`
- Input: `output/vocab-pipeline-v2/step2/concrete-nouns.json`
- Input: `output/vocab-pipeline-v2/step3/assignments-parsed.json`

**Step 1: Write the validation script**

```javascript
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const concrete = JSON.parse(fs.readFileSync(path.join(BASE, 'step2/concrete-nouns.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(BASE, 'step3/assignments-parsed.json'), 'utf8'));

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`ERROR: ${msg}`); errors++; }
function warn(msg) { console.warn(`WARN: ${msg}`); warnings++; }

// 1. Every concrete noun appears in exactly one area
const concreteWords = new Set(concrete.map(c => c.word));
const placedWords = new Map(); // word -> area id

for (const area of data.areas) {
  for (const type of ['creatures', 'items', 'bosses']) {
    for (const entry of (area[type] || [])) {
      if (placedWords.has(entry.w)) {
        error(`Duplicate: "${entry.w}" in ${placedWords.get(entry.w)} AND ${area.id}`);
      }
      placedWords.set(entry.w, area.id);
    }
  }
  // Rare additions count as placed
  for (const entry of (area.rareAdditions || [])) {
    if (placedWords.has(entry.w)) {
      error(`Duplicate rare: "${entry.w}" in ${placedWords.get(entry.w)} AND ${area.id}`);
    }
    placedWords.set(entry.w, area.id);
  }
}

const missing = [];
for (const word of concreteWords) {
  if (!placedWords.has(word)) missing.push(word);
}
if (missing.length > 0) {
  error(`${missing.length} concrete nouns not placed: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`);
}

// 2. No rank 5000+ word without justification
for (const area of data.areas) {
  for (const entry of (area.rareAdditions || [])) {
    if (!entry.justification) {
      error(`Rare word "${entry.w}" (r${entry.r}) in ${area.id} has no justification`);
    }
  }
}

// 3. Area size minimums (15c/8i/3b)
for (const area of data.areas) {
  const c = (area.creatures || []).length;
  const i = (area.items || []).length;
  const b = (area.bosses || []).length;
  if (c < 15) error(`${area.id}: only ${c} creatures (need 15)`);
  if (i < 8) error(`${area.id}: only ${i} items (need 8)`);
  if (b < 3) error(`${area.id}: only ${b} bosses (need 3)`);
  if (c > 30) warn(`${area.id}: ${c} creatures exceeds max 30`);
}

// 4. Element balance (at least 3 of 5 elements per area)
const ELEMENTS = ['wood', 'fire', 'water', 'metal', 'earth'];
for (const area of data.areas) {
  const elementCounts = {};
  for (const c of (area.creatures || [])) {
    if (c.e) elementCounts[c.e] = (elementCounts[c.e] || 0) + 1;
  }
  const representedElements = ELEMENTS.filter(e => (elementCounts[e] || 0) > 0);
  if (representedElements.length < 3) {
    error(`${area.id}: only ${representedElements.length} elements (need 3): ${representedElements.join(', ')}`);
  }

  // Warn if one element > 70%
  const totalCreatures = (area.creatures || []).length;
  for (const [elem, count] of Object.entries(elementCounts)) {
    if (totalCreatures > 0 && count / totalCreatures > 0.7) {
      warn(`${area.id}: ${elem} is ${Math.round(count / totalCreatures * 100)}% of creatures`);
    }
  }
}

// 5. All creatures have elements
for (const area of data.areas) {
  for (const c of (area.creatures || [])) {
    if (!c.e || !ELEMENTS.includes(c.e)) {
      error(`Creature "${c.w}" in ${area.id} has invalid element: "${c.e}"`);
    }
  }
}

// Summary
console.log(`\n=== Validation Summary ===`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
console.log(`Areas: ${data.areas.length}`);
console.log(`Concrete nouns: ${concreteWords.size} | Placed: ${placedWords.size}`);

// Rank stats
const allRanks = [];
for (const area of data.areas) {
  for (const type of ['creatures', 'items', 'bosses']) {
    for (const entry of (area[type] || [])) {
      allRanks.push(entry.r);
    }
  }
}
allRanks.sort((a, b) => a - b);
const median = allRanks[Math.floor(allRanks.length / 2)];
const avg = Math.round(allRanks.reduce((s, r) => s + r, 0) / allRanks.length);
const under5000 = allRanks.filter(r => r <= 5000).length;
const pct5000 = Math.round(under5000 / allRanks.length * 100);

console.log(`\nRank stats:`);
console.log(`  Median rank: ${median} (target: < 3000)`);
console.log(`  Average rank: ${avg} (target: < 3000)`);
console.log(`  Rank 1-5000: ${pct5000}% (target: 80%+)`);

if (errors > 0) {
  console.log(`\nFAIL — ${errors} errors must be fixed before assembly.`);
  process.exit(1);
} else {
  console.log(`\nPASS — ready for assembly.`);
}
```

**Step 2: Run validation**

```bash
node output/vocab-pipeline-v2/step4-validate.cjs
```

Expected: PASS with 0 errors. Some warnings are OK.

**Step 3: If validation fails, fix**

Common fixes:
- Missing nouns → re-run step 3 agent with the missing list appended
- Duplicates → manually edit `assignments-parsed.json` to remove duplicates
- Size minimums not met → manually redistribute or re-run agent with stricter constraints

**Step 4: Commit**

```bash
git add output/vocab-pipeline-v2/step4-validate.cjs
git commit -m "feat(vocab-v2): step 4 — validation script"
```

---

## Task 7: Write and run assembly script

**Files:**
- Create: `output/vocab-pipeline-v2/step5-assemble.cjs`
- Input: `output/vocab-pipeline-v2/step3/assignments-parsed.json`
- Input: `output/vocab-pipeline-v2/step1-nouns-all.json`
- Output: `output/vocab-areas-v2.json`

**Step 1: Write the assembly script**

Enriches each entry with reading/meaning from the full noun list (or the CSV directly for rare additions). Computes per-area and global stats. Writes `output/vocab-areas-v2.json` in the production schema matching `output/vocab-areas.json`.

```javascript
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(BASE, 'step3/assignments-parsed.json'), 'utf8'));
const allNouns = JSON.parse(fs.readFileSync(path.join(BASE, 'step1-nouns-all.json'), 'utf8'));

// Build lookup: word -> { reading, meanings }
const nounLookup = new Map();
for (const noun of allNouns) {
  nounLookup.set(noun.word, { reading: noun.reading, meaning: noun.firstMeaning });
}

// For rare words not in the noun list, parse from CSV directly
function parseCsvLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

const csvLines = fs.readFileSync(path.join(BASE, '../../data/jpdb-wordlist.csv'), 'utf8').split('\n');
const csvLookup = new Map();
for (let i = 1; i < csvLines.length; i++) {
  if (!csvLines[i].trim()) continue;
  const parts = parseCsvLine(csvLines[i]);
  if (parts.length < 7) continue;
  csvLookup.set(parts[1], { reading: parts[2], meaning: parts[6].split(';')[0].trim() });
}

function enrich(entry, includeElement) {
  const lookup = nounLookup.get(entry.w) || csvLookup.get(entry.w) || {};
  const result = {
    word: entry.w,
    reading: lookup.reading || '',
    meaning: lookup.meaning || '',
    rank: entry.r,
    reasoning: entry.n || ''
  };
  if (includeElement && entry.e) {
    result.element = entry.e;
  }
  return result;
}

const ELEMENTS = ['wood', 'fire', 'water', 'metal', 'earth'];

const areas = data.areas.map(area => {
  // Merge rareAdditions into their respective categories
  // (They should already be categorized by the agent, but handle both cases)
  let creatures = (area.creatures || []).map(c => enrich(c, true));
  let items = (area.items || []).map(i => enrich(i, false));
  let bosses = (area.bosses || []).map(b => enrich(b, false));

  // Compute stats
  const allInArea = [...creatures, ...items, ...bosses];
  const avgRank = allInArea.length > 0
    ? Math.round(allInArea.reduce((s, e) => s + e.rank, 0) / allInArea.length)
    : 0;

  const elementDist = {};
  creatures.forEach(c => {
    if (c.element) elementDist[c.element] = (elementDist[c.element] || 0) + 1;
  });

  return {
    id: area.id,
    name: area.nameJp || area.name || '',
    nameEn: area.nameEn || area.name || '',
    description: area.theme || '',
    creatures,
    items,
    bosses,
    stats: {
      avgCreatureRank: creatures.length > 0
        ? Math.round(creatures.reduce((s, c) => s + c.rank, 0) / creatures.length)
        : 0,
      elementDistribution: elementDist
    }
  };
});

// Global stats
const allCreatures = areas.flatMap(a => a.creatures);
const allItems = areas.flatMap(a => a.items);
const allBosses = areas.flatMap(a => a.bosses);
const allEntries = [...allCreatures, ...allItems, ...allBosses];
const allRanks = allEntries.map(e => e.rank).filter(r => r > 0);
const elementTotals = {};
allCreatures.forEach(c => {
  if (c.element) elementTotals[c.element] = (elementTotals[c.element] || 0) + 1;
});

const output = {
  areas,
  globalStats: {
    totalWords: allEntries.length,
    totalCreatures: allCreatures.length,
    totalItems: allItems.length,
    totalBosses: allBosses.length,
    rankRange: [Math.min(...allRanks), Math.max(...allRanks)],
    avgRank: Math.round(allRanks.reduce((a, b) => a + b, 0) / allRanks.length),
    medianRank: allRanks.sort((a, b) => a - b)[Math.floor(allRanks.length / 2)],
    pctUnder5000: Math.round(allRanks.filter(r => r <= 5000).length / allRanks.length * 100),
    elementTotals
  }
};

// Write to output/
const outPath = path.join(BASE, '../vocab-areas-v2.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// Also write to pipeline dir for reference
fs.writeFileSync(path.join(BASE, 'step5/vocab-areas-v2.json'), JSON.stringify(output, null, 2));

// Print summary
console.log('=== ASSEMBLY COMPLETE ===');
console.log(`Areas: ${output.areas.length}`);
console.log(`Total words: ${output.globalStats.totalWords} (${output.globalStats.totalCreatures}c ${output.globalStats.totalItems}i ${output.globalStats.totalBosses}b)`);
console.log(`Rank range: ${output.globalStats.rankRange[0]} - ${output.globalStats.rankRange[1]}`);
console.log(`Avg rank: ${output.globalStats.avgRank} (target: < 3000)`);
console.log(`Median rank: ${output.globalStats.medianRank} (target: < 3000)`);
console.log(`Rank 1-5000: ${output.globalStats.pctUnder5000}% (target: 80%+)`);
console.log(`Elements: ${JSON.stringify(output.globalStats.elementTotals)}`);
console.log(`\nPer-area:`);
for (const a of output.areas) {
  console.log(`  ${a.id} "${a.nameEn}": ${a.creatures.length}c ${a.items.length}i ${a.bosses.length}b | avg creature rank: ${a.stats.avgCreatureRank} | elements: ${JSON.stringify(a.stats.elementDistribution)}`);
}
console.log(`\nFile: ${(fs.statSync(outPath).size / 1024).toFixed(1)}KB`);
```

**Step 2: Run assembly**

```bash
node output/vocab-pipeline-v2/step5-assemble.cjs
```

Expected:
```
Avg rank: < 3000
Median rank: < 3000
Rank 1-5000: 80%+
```

**Step 3: Verify success criteria**

Check all 7 criteria from the design doc:

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Median rank < 3000 | Assembly output |
| 2 | 80%+ rank 1-5000 | Assembly output |
| 3 | Areas recognizable from words alone | Read area creature/item/boss lists — does each area make sense? |
| 4 | Every creature suggests a drawable sprite | Scan creature list for abstract concepts |
| 5 | Every boss is a human role | Scan boss list for non-human entries |
| 6 | Every item suggests a gameplay buff | Scan item list for abstract concepts |
| 7 | No concrete noun from rank 1-5000 left unplaced | Validation script already checks this |

Criteria 3–6 require a quick manual review of the assembled JSON.

**Step 4: Commit**

```bash
git add output/vocab-pipeline-v2/step5-assemble.cjs output/vocab-areas-v2.json
git commit -m "feat(vocab-v2): step 5 — assemble final vocab-areas-v2.json"
```

---

## Task 8: Final review and promote to production

**Files:**
- Input: `output/vocab-areas-v2.json`
- Modify: `output/vocab-areas.json` (replace with v2)

**Step 1: Compare v1 vs v2 stats**

```bash
node -e "
const v1 = JSON.parse(require('fs').readFileSync('output/vocab-areas.json','utf8'));
const v2 = JSON.parse(require('fs').readFileSync('output/vocab-areas-v2.json','utf8'));
console.log('        v1        v2');
console.log('Words:', v1.globalStats.totalWords, '    ', v2.globalStats.totalWords);
console.log('Avg:  ', v1.globalStats.avgRank, '    ', v2.globalStats.avgRank);
console.log('Areas:', v1.areas.length, '      ', v2.areas.length);
"
```

**Step 2: Promote v2 to production**

```bash
cp output/vocab-areas.json output/vocab-areas-v1-backup.json
cp output/vocab-areas-v2.json output/vocab-areas.json
```

**Step 3: Run e2e tests to verify nothing broke**

```bash
./scripts/e2e-test.sh
```

Threshold: 60+/66 pass (known flakiness).

**Step 4: Commit**

```bash
git add output/vocab-areas.json output/vocab-areas-v1-backup.json
git commit -m "feat(vocab-v2): promote v2 vocab areas to production

Replaces v1 (avg rank 7560, 362 words) with v2 (target avg rank < 3000).
v1 backed up as output/vocab-areas-v1-backup.json."
```

---

## Task Dependency Graph

```
Task 1 (extract) ─→ Task 2 (classify prompt) ─→ Task 3 (run classify agents) ─→ Task 4 (assign prompt) ─→ Task 5 (run assign agent) ─→ Task 6 (validate) ─→ Task 7 (assemble) ─→ Task 8 (promote)
```

Tasks 2 and 4 (prompt writing) can be done in parallel with each other since they don't depend on each other's output. But their execution tasks (3 and 5) are sequential — Step 3's output feeds Step 5.

## Estimated Agent Usage

| Step | Agent Type | Count | Model |
|------|-----------|-------|-------|
| 3 — Classify | Task tool | 2 (parallel) | Opus |
| 5 — Assign | Task tool | 1–2 | Opus |
| **Total** | | **3–4** | |
