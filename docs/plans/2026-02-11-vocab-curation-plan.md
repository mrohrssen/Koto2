# Vocab Curation Pipeline — Execution Plan (v2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scan `data/jpdb-wordlist.csv` (rows 1–15,000) and produce `output/vocab-areas.json` — 10 themed areas each with ~20 creatures, ~10 items, ~5 bosses.

**Architecture:** Two-phase approach. Phase 1 uses a Node.js script to mechanically extract all concrete nouns from the CSV (fast, no AI needed). Phase 2 dispatches Opus 4.6 subagents to do the creative work — area discovery, categorization, element assignment — on the much smaller filtered dataset. This avoids the context-window problem of passing 500KB+ of raw JSON through subagent returns.

**Design Doc:** `docs/plans/2026-02-11-vocab-curation-design.md`

**Key constraint:** Subagents CANNOT use Write or Bash tools (permission denied). All file I/O must happen in the main agent. Subagents receive data via their prompt and return results as text. Keep subagent input/output small enough to not blow up main agent context (~50KB max per agent return).

**Tech Stack:** Node.js for data extraction, Opus 4.6 subagents for creative judgment.

---

### Task 1: Create directory structure

**Step 1:**
```bash
mkdir -p output/vocab-pipeline/{phase1,phase2,phase3}
```

---

### Task 2: Phase 1 — Extract concrete nouns via Node script

Write and run a Node.js script that reads the CSV and produces a filtered candidate list. No AI needed — pure mechanical filtering.

**Files:**
- Read: `data/jpdb-wordlist.csv`
- Create: `output/vocab-pipeline/phase1/candidates-raw.json`

**Step 1: Write the extraction script**

Create `output/vocab-pipeline/extract-nouns.js`:

```javascript
const fs = require('fs');
const path = require('path');

// Read CSV
const csv = fs.readFileSync(path.join(__dirname, '../../data/jpdb-wordlist.csv'), 'utf8');
const lines = csv.split('\n');
const header = lines[0];
const dataLines = lines.slice(1, 15001); // ranks 1-15000

// POS tags that indicate nouns (the useful ones for our game)
const NOUN_POS = ['n'];
const SKIP_POS = ['prt', 'conj', 'aux', 'cop', 'pn', 'int', 'pref', 'suf', 'ctr', 'exp', 'aux-v', 'aux-adj'];

// Parse CSV line (handles quoted fields with commas)
function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

const candidates = [];

for (const line of dataLines) {
  if (!line.trim()) continue;
  const parts = parseLine(line);
  if (parts.length < 7) continue;

  const rank = parseInt(parts[0]);
  const word = parts[1];
  const reading = parts[2];
  const pos = parts[5].trim();
  const meanings = parts[6].trim();

  // Must have noun in POS
  const posTags = pos.split(';').map(t => t.trim());
  const isNoun = posTags.some(t => t === 'n');

  // Skip if ONLY grammar/function word POS
  const isOnlySkippable = posTags.every(t => SKIP_POS.includes(t));
  if (isOnlySkippable) continue;

  // Include if it's a noun
  if (!isNoun) continue;

  // Skip single-kana words (usually grammar particles that slipped through)
  if (word.length === 1 && /^[\u3040-\u309F\u30A0-\u30FF]$/.test(word)) continue;

  candidates.push({ rank, word, reading, pos, meanings });
}

// Write output
fs.writeFileSync(
  path.join(__dirname, 'phase1/candidates-raw.json'),
  JSON.stringify(candidates, null, 2)
);

console.log(`Extracted ${candidates.length} noun candidates from ranks 1-15000`);
console.log(`Rank range: ${candidates[0]?.rank} - ${candidates[candidates.length-1]?.rank}`);

// Also write a compact summary for agent prompts (word + rank + meaning only, <100KB target)
const compact = candidates.map(c => `${c.rank}\t${c.word}\t${c.reading}\t${c.meanings.slice(0, 60)}`);
fs.writeFileSync(
  path.join(__dirname, 'phase1/candidates-compact.tsv'),
  compact.join('\n')
);
console.log(`Compact TSV: ${(compact.join('\n').length / 1024).toFixed(1)}KB`);
```

**Step 2: Run it**

```bash
node output/vocab-pipeline/extract-nouns.js
```

Expected: ~3000-5000 noun candidates. A compact TSV file under 100KB for feeding to agents.

**Step 3: Verify output sizes**

```bash
wc -l output/vocab-pipeline/phase1/candidates-raw.json
wc -c output/vocab-pipeline/phase1/candidates-compact.tsv
```

If compact TSV is over 200KB, add a second filter to remove obvious non-game words (abstract nouns like 理由, 結果, 意味 etc).

---

### Task 3: Phase 1B — Split compact TSV into agent-sized chunks

Split the compact TSV into 5 chunks (~600-1000 words each). These will be small enough to paste directly into subagent prompts.

**Step 1: Write splitter script**

```javascript
const fs = require('fs');
const tsv = fs.readFileSync('output/vocab-pipeline/phase1/candidates-compact.tsv', 'utf8');
const lines = tsv.split('\n');
const chunkSize = Math.ceil(lines.length / 5);
for (let i = 0; i < 5; i++) {
  const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize);
  fs.writeFileSync(`output/vocab-pipeline/phase1/chunk-${i+1}.tsv`, chunk.join('\n'));
  console.log(`Chunk ${i+1}: ${chunk.length} words, ${(chunk.join('\n').length/1024).toFixed(1)}KB`);
}
```

**Step 2: Run it**

```bash
node -e "<above script>"
```

Each chunk should be under 40KB — small enough to embed in a subagent prompt.

---

### Task 4: Phase 2A — Curation agents (5 parallel, one per chunk)

Dispatch 5 Opus 4.6 subagents in parallel. Each receives one chunk of the compact TSV **embedded directly in its prompt**. Each agent:

1. Reads its chunk (received as text in prompt, NOT from a file)
2. For each word, decides: CREATURE, ITEM, BOSS, AREA, or SKIP
3. Returns a compact JSON array (rank + word + category + element-if-creature + 1-line reasoning)

**Key constraint:** The agent's PROMPT includes the TSV data. The agent returns ONLY compact JSON. No file reads or writes by the agent. Main agent captures the return and writes to disk.

**Prompt template (fill in CHUNK_NUM and TSV_DATA):**

```
You are a Japanese vocabulary curator for a monster-collecting RPG. Below is a list of Japanese nouns with frequency ranks. For each word, decide if it works as a CREATURE, ITEM, BOSS, AREA name, or should be SKIPPED.

CATEGORIES:
- CREATURE: Physical objects that would make cool/cute collectible monsters. Assign element: wood/fire/water/metal/earth
- ITEM: Objects that suggest gameplay buffs (healing, attack boost, defense). No element.
- BOSS: Human roles or authority figures. No element.
- AREA: Places or locations. No element.
- SKIP: Abstract concepts, body parts that aren't interesting creatures, generic words.

OPTIMIZE FOR LEARNING: Prefer higher-rank words (less common = more valuable to learn). Be creative — a simple word can become an interesting creature with imagination.

RULES:
- Be selective. We need ~350 total across 10 areas. Skip aggressively.
- Creatures should be things an artist could draw a distinct sprite for.
- Items should suggest a clear gameplay effect.
- Bosses must be human roles, not objects.
- Areas must be real places a language learner encounters.

DATA (rank, word, reading, meaning):
TSV_DATA

Return ONLY a JSON array. Keep reasoning under 15 words. Example:
[{"r":4523,"w":"鉛筆","c":"creature","e":"wood","n":"Pencil — wooden writing tool, cute creature potential"},{"r":282,"w":"先生","c":"boss","n":"Teacher — school authority figure"},{"r":11234,"w":"定規","c":"item","n":"Ruler — precision tool, accuracy buff"}]

Use short keys: r=rank, w=word, c=category (creature/item/boss/area), e=element (creatures only), n=note. This keeps output small.
```

**Step 1:** Read each chunk TSV file. Embed it in the prompt. Dispatch 5 agents in parallel with `run_in_background: true`.

**Step 2:** As each agent completes, use a Node.js one-liner to extract the JSON from the agent's output file and write it to `output/vocab-pipeline/phase2/curated-chunk-{N}.json`. Do NOT read the agent output into main context — use `node -e` scripts to extract.

**Step 3:** Verify each file has valid JSON:
```bash
for f in output/vocab-pipeline/phase2/curated-chunk-*.json; do
  node -e "const d=JSON.parse(require('fs').readFileSync('$f','utf8'));console.log('$(basename $f):', d.length, 'entries')"
done
```

---

### Task 5: Merge curated chunks into master list

**Step 1:** Write and run a Node script that:
1. Reads all 5 curated chunk files
2. Merges into one array
3. Deduplicates by word
4. Sorts by rank
5. Writes to `output/vocab-pipeline/phase2/master-curated.json`
6. Prints summary stats (counts by category, rank ranges) to stdout

**Step 2:** Read ONLY the summary stats (not the full JSON). Verify:
- Total entries: 400-800 (enough to fill 10 areas)
- Category breakdown makes sense
- No category is severely under-represented

If counts are too low, the curation agents were too aggressive — re-dispatch with relaxed instructions.

---

### Task 6: Phase 2B — Area Discovery + Assignment (1 agent)

This is the creative heart of the pipeline. One Opus agent sees the FULL curated master list and:
1. Discovers 10 themed areas from word clusters
2. Assigns each word to an area
3. Assigns creature/item/boss role within each area
4. Assigns elements to creatures

**Key:** The master-curated.json should be small enough (~50-80KB) to embed in a single agent prompt. If it's too large, use the compact format (rank + word + category + note only).

**Prompt:** Embed the full master list. Ask the agent to return the complete 10-area structure as JSON. The agent returns this as text — main agent writes it to disk.

**Save to:** `output/vocab-pipeline/phase2/area-assignments.json`

**Verify:** Run a Node script to check:
- 10 areas exist
- Each area has 15+ creatures, 7+ items, 3+ bosses
- No duplicate words across areas
- All creatures have elements
- Print summary table

---

### Task 7: Phase 2C — Verification agent

Dispatch one Opus agent that receives the area-assignments JSON and the master curated list. Its job: challenge every decision.

**Agent reviews:**
1. Category swaps (creature↔item)
2. Area distinctness
3. Frequency optimization (push average rank higher)
4. Element distribution
5. Boss quality
6. Sprite potential

**Returns:** A compact list of recommended changes + overall assessment.

**Save to:** `output/vocab-pipeline/phase2/verification.json`

---

### Task 8: User checkpoint — review verification feedback

Present verification agent's assessment and key recommendations to the user. Apply approved changes.

**Save to:** `output/vocab-pipeline/phase2/assignments-final.json`

---

### Task 9: Phase 3A — Assembly agent

One Opus agent takes the final assignments and produces production-ready JSON with:
- Full area definitions
- Computed stats (avg rank, element distribution)
- Area descriptions

**Save to:** `output/vocab-pipeline/phase3/vocab-areas-draft.json`

---

### Task 10: Phase 3B — Final audit agent

One Opus agent does a ruthless quality review. Returns pass/fail + issues list.

**Save to:** `output/vocab-pipeline/phase3/final-audit.json`

---

### Task 11: Finalize and present

If audit passes, copy draft to `output/vocab-areas.json`. Present summary table to user.

---

## Context Window Protection Rules

1. **NEVER read agent output files directly** — always use `node -e` scripts to extract JSON and write to disk
2. **NEVER read the full master-curated.json into main context** — only read summary stats via scripts
3. **Embed data in agent prompts via file reads done inside script, not main context**
4. **Agent return values are captured by Task tool** — if they're too large, read only the output file's last few lines for status
5. **All intermediate data stays on disk** — main agent only sees summaries and small verification reports

## Agent Count (revised)

| Phase | Agents | Purpose |
|-------|--------|---------|
| 2A — Curation | 5 | Categorize ~1000 words each |
| 2B — Area Discovery | 1 | Propose 10 areas, assign all words |
| 2C — Verification | 1 | Challenge decisions |
| 3A — Assembly | 1 | Produce final JSON |
| 3B — Audit | 1 | Quality gate |
| **Total** | **9** | Down from 23 — smarter, not harder |
