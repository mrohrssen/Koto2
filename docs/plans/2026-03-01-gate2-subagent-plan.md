# Gate 2 Subagent Mode + Action Icon QA Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update Gate 2 to accept pre-computed scores from subagents (instead of requiring Gemini), then run the full QA pipeline on 102 birefnet-trimmed action icons until all pass.

**Architecture:** Add `--scores <file>` flag to `sprite-gate2.mjs` that imports scores from a JSON file, skipping the Gemini API. Subagents evaluate sprites using vision (Read tool on images), scores are collected, and fed to the script. The existing Gemini path stays as fallback.

**Tech Stack:** Node.js (ES modules), Claude Code Agent subagents (vision), Python (Gate 1)

---

### Task 1: Add `--scores` flag to Gate 2 CLI

**Files:**
- Modify: `scripts/sprite-gate2.mjs`

**Step 1: Add `scores` to CLI argument parsing**

In `parseCli()`, add `scores` as an optional string argument. When `--scores` is provided, `--refs` and manifest are still required (for output enrichment), but Gemini API key is NOT required.

```javascript
// In parseCli(), add to options:
scores: { type: 'string' },

// After parsing, update validation:
const scores = args.values.scores;
if (!input || !type || !manifest) {
  // --refs is only required when not using --scores
  if (!scores && !refs) {
    console.error('Usage: ...');
    process.exit(1);
  }
}
return { input, type, refs, manifest, output, scores };
```

**Step 2: Add score-import path in `main()`**

After loading candidates and manifest, branch on `scores`:

```javascript
if (scores) {
  // Import pre-computed scores
  const rawScores = JSON.parse(await readFile(resolve(scores), 'utf-8'));
  const scoreMap = new Map();
  for (const s of rawScores) {
    scoreMap.set(s.file, s);
  }

  const results = [];
  for (const filename of candidateFiles) {
    const entry = findManifestEntry(filename, manifestMap);
    const word = entry?.word || '';
    const wordEn = entry?.wordEn || basename(filename, extname(filename));
    const s = scoreMap.get(filename);

    if (s) {
      const parsed = {
        concept: clampScore(s.concept),
        style: clampScore(s.style),
        readability: clampScore(s.readability),
        total: 0,
        passed: false,
        reasoning: s.reasoning || '',
      };
      parsed.total = parsed.concept + parsed.style + parsed.readability;
      parsed.passed = parsed.concept >= 3 && parsed.style >= 3 && parsed.readability >= 3;
      results.push({ file: filename, word, wordEn, ...parsed });
      console.error(`  [scores] ${filename}: concept=${parsed.concept} style=${parsed.style} read=${parsed.readability} total=${parsed.total} ${parsed.passed ? 'PASS' : 'FAIL'}`);
    } else {
      console.error(`  [scores] ${filename}: NO SCORE FOUND — marking as fail`);
      results.push({ file: filename, word, wordEn, concept: 0, style: 0, readability: 0, total: 0, passed: false, reasoning: 'No score provided' });
    }
  }

  await writeFile(output, JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.passed).length;
  console.error(`\nResults: ${passed} passed, ${results.length - passed} failed out of ${results.length}`);
  return;
}
```

Note: Import `clampScore` from `./sprite-gate2-lib.mjs` — it needs to be exported first.

**Step 3: Export `clampScore` from lib**

In `scripts/sprite-gate2-lib.mjs`, change `function clampScore(val)` to `export function clampScore(val)`.

**Step 4: Import clampScore in CLI**

Update the import in `sprite-gate2.mjs`:
```javascript
import {
  buildJudgePrompt,
  parseJudgeResponse,
  clampScore,
} from './sprite-gate2-lib.mjs';
```

**Step 5: Run existing tests**

Run: `npm run test:unit -- --grep "Gate 2"`
Expected: All existing tests still pass (we didn't change lib logic).

**Step 6: Commit**

```bash
git add scripts/sprite-gate2.mjs scripts/sprite-gate2-lib.mjs
git commit -m "feat: add --scores flag to Gate 2 for subagent-provided scores"
```

---

### Task 2: Add tests for score import mode

**Files:**
- Modify: `tests/unit/sprites/gate2.test.js`

**Step 1: Add test for clampScore export**

```javascript
import { clampScore } from '../../../scripts/sprite-gate2-lib.mjs';

describe('Gate 2 — clampScore', () => {
  it('clamps values to 1-5 range', () => {
    assert.equal(clampScore(0), 1);
    assert.equal(clampScore(6), 5);
    assert.equal(clampScore(3.7), 4);
    assert.equal(clampScore('abc'), 0);
  });
});
```

**Step 2: Run test**

Run: `npm run test:unit -- --grep "clampScore"`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/sprites/gate2.test.js
git commit -m "test: add clampScore export test"
```

---

### Task 3: Update skill documentation

**Files:**
- Modify: `.claude/skills/sprite-quality-pipeline.md`

**Step 1: Update Gate 2 section**

Replace the Gate 2 step with:

```markdown
### Step 3: Gate 2 — AI Vision Judge (Subagents)

Dispatch parallel Claude Code subagents to evaluate Gate 1 survivors. Each subagent:
1. Reads reference images from `data/quality-refs/<type>/` using the Read tool (vision)
2. Reads the candidate image
3. Evaluates concept clarity, style consistency, and readability (1-5 each)
4. Returns JSON: `{ "file": "name.png", "concept": N, "style": N, "readability": N, "reasoning": "..." }`

Collect all scores into a single JSON array and run:

```bash
node scripts/sprite-gate2.mjs \
  --input data/sprite-staging/<type> \
  --type <type> \
  --manifest <manifest.json> \
  --scores <scores.json> \
  [--output <path>]
```

**Subagent prompt template** (adapt per type using `buildJudgePrompt()` from `sprite-gate2-lib.mjs`):

> You are a quality judge for game sprites. Evaluate this candidate image against the reference images.
> Score 1-5 on: concept (can a learner guess the word?), style (matches references?), readability (clear at 128px?).
> Return JSON only: { "file": "<filename>", "concept": N, "style": N, "readability": N, "reasoning": "..." }

**Fallback:** If subagents are unavailable, the script still supports Gemini via:
```bash
node scripts/sprite-gate2.mjs --input <dir> --type <type> --refs <refs-dir> --manifest <manifest.json>
```
```

**Step 2: Commit**

```bash
git add .claude/skills/sprite-quality-pipeline.md
git commit -m "docs: update sprite pipeline skill to use subagents for Gate 2"
```

---

### Task 4: Run Gate 1 on all 102 action icons in staging

**Files:**
- Uses: `scripts/sprite-gate1.py`, `data/sprite-staging/actions/`

**Step 1: Generate manifest for the 102 trimmed icons**

```bash
cd /root/Koto
python3 -c "
import json
from pathlib import Path

with open('data/moves.json') as f:
    moves = json.load(f)

# Build lookup: nameEn lowered -> move data
lookup = {}
for m in moves:
    key = m['nameEn'].lower().replace(' ', '-')
    lookup[key] = m

# Get the 102 trimmed icon filenames from staging
staging = Path('data/sprite-staging/actions')
manifest = []
for png in sorted(staging.glob('*.png')):
    stem = png.stem
    move = lookup.get(stem)
    manifest.append({
        'id': stem,
        'word': move['name'] if move else stem,
        'wordEn': move['nameEn'] if move else stem.replace('-', ' ').title()
    })

with open('data/sprite-staging/actions/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f'Wrote manifest with {len(manifest)} entries')
"
```

**Step 2: Run Gate 1**

```bash
python3 scripts/sprite-gate1.py \
  --input data/sprite-staging/actions \
  --type action \
  --json
```

Review output. Since these already went through BiRefNet background removal, most should pass (transparent backgrounds, correct dimensions for 128x128... actually they may be different sizes from BiRefNet output).

Check if any fail. If some fail Gate 1, note which ones — they'll need fixing or skipping.

**Step 3: Save Gate 1 results**

The script writes `gate1-results.json` to the input directory. Verify it exists:
```bash
cat data/sprite-staging/actions/gate1-results.json | python3 -c "import sys,json; d=json.load(sys.stdin); passed=[x for x in d if x['passed']]; print(f'{len(passed)}/{len(d)} passed Gate 1')"
```

---

### Task 5: Run Gate 2 via subagents on Gate 1 survivors

**Step 1: Identify Gate 1 survivors**

```python
import json
with open('data/sprite-staging/actions/gate1-results.json') as f:
    g1 = json.load(f)
survivors = [r['file'] for r in g1 if r['passed']]
```

**Step 2: Dispatch parallel subagents**

For each batch of ~8-10 survivors, dispatch an Agent subagent with:
- Prompt that includes the reference image paths to Read
- List of candidate image paths to Read
- Instructions to score each on concept/style/readability (1-5)
- Return JSON array of scores

Reference images: `data/quality-refs/actions/` (8 files: blanket.webp, blow.webp, bomb.webp, fire.webp, gallop.webp, pour.webp, punch.webp, umbrella.webp)

**Step 3: Collect scores and run Gate 2 script**

```bash
node scripts/sprite-gate2.mjs \
  --input data/sprite-staging/actions \
  --type action \
  --manifest data/sprite-staging/actions/manifest.json \
  --scores data/sprite-staging/actions/subagent-scores.json \
  --output data/sprite-staging/actions/gate2-results.json
```

**Step 4: Queue for review**

```bash
node scripts/sprite-queue-review.mjs \
  --type action \
  --staging data/sprite-staging/actions
```

---

### Task 6: Review results and handle failures

**Step 1: Identify failures**

From `gate2-results.json`, find icons that failed (any score < 3).

**Step 2: For icons that failed on style (not anime style)**

These are the "old ones" the user mentioned. They need full regeneration with the anime style references, not just birefnet trimming.

Use `scripts/regen-qa-failures.mjs` or ComfyUI to regenerate them, then re-run through Gate 1 → Gate 2.

**Step 3: Repeat until all pass**

Loop: regen failures → Gate 1 → Gate 2 → check. Max 3 iterations.

**Step 4: Present results to user**

Update the review queue with all passing icons and tell the user to check the Needs Review tab.
