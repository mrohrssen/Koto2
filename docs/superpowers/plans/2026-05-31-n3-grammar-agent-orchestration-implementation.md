# N3 Grammar Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable core-agent/subagent workflow that improves N3 grammar matcher coverage while preventing benchmark chasing and hardcoding-in-disguise.

**Architecture:** Add a reusable round-corpus scoring harness, store frozen round corpora separately from normal fixtures, and run immutable patch rounds where corpus generation, worker patching, and auditing are separate roles. The core orchestrator accepts only patches that keep adjudicated false positives at zero, preserve the existing grammar suite, and pass an auditor-after review.

**Tech Stack:** Node.js ES modules, `node:test`, existing Sudachi tokenizer via `src/tokenizer.js`, existing grammar loader/matcher APIs, Markdown round ledgers under `docs/superpowers/grammar-rounds/`.

---

## File Structure

- Create: `scripts/score-grammar-corpus.js`
  - CLI for scoring any grammar corpus JSON against the current matcher.
  - Emits text by default and JSON with `--json`.
  - Computes sentence-level accuracy, precision, recall, F1, false positives, and misses.
- Create: `tests/fixtures/grammar-rounds/README.md`
  - Documents the round corpus JSON schema and anti-hardcoding rules.
- Create: `tests/fixtures/grammar-rounds/sample-n3-round-corpus.json`
  - Tiny sample corpus used by tests for the scorer.
- Create: `tests/unit/grammar-round-corpus-scorer.test.js`
  - Verifies the scorer accepts valid corpora, rejects invalid corpora, and computes expected metrics on a controlled matcher.
- Create: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`
  - Round ledger for the first audit-only seed round.
- Create later during execution: `tests/fixtures/grammar-rounds/n3-round-001-frozen.json`
  - Frozen pre-patch corpus adjudicated by the core agent.
- Create later during execution: `tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json`
  - Auditor-after corpus generated after worker patches.
- Modify during execution only after audit passes: `data/grammar-matchers.json`
- Modify during execution only after audit passes: `data/grammar-catalog.json`
- Modify during execution only after audit passes: `tests/fixtures/grammar-n3.json`
- Modify during execution only after audit passes: `tests/fixtures/grammar-n3-stress.json`

---

## Task 1: Add Reusable Round Corpus Scorer

**Files:**
- Create: `scripts/score-grammar-corpus.js`
- Create: `tests/fixtures/grammar-rounds/sample-n3-round-corpus.json`
- Create: `tests/fixtures/grammar-rounds/README.md`
- Create: `tests/unit/grammar-round-corpus-scorer.test.js`

- [ ] **Step 1: Create the sample corpus fixture**

Create `tests/fixtures/grammar-rounds/sample-n3-round-corpus.json`:

```json
[
  {
    "id": "sample-positive-001",
    "sentence": "約束は守るべきだ。",
    "level": "N3",
    "targetGrammarIds": ["n3-l01-07"],
    "expected": ["n3-l01-07"],
    "kind": "positive",
    "source": "sample",
    "rationale": "The sentence uses べき to express obligation: promises should be kept."
  },
  {
    "id": "sample-negative-001",
    "sentence": "そのべきという言葉を調べた。",
    "level": "N3",
    "targetGrammarIds": ["n3-l01-07"],
    "expected": [],
    "kind": "mention-negative",
    "source": "sample",
    "rationale": "The sentence mentions the word べき rather than using the grammar point."
  }
]
```

- [ ] **Step 2: Document the corpus schema**

Create `tests/fixtures/grammar-rounds/README.md`:

```markdown
# Grammar Round Corpora

Round corpora are frozen adversarial examples used by the N3 grammar orchestration process.

Each corpus file is a JSON array. Each item must have:

- `id`: Stable unique string within the file.
- `sentence`: Japanese sentence to tokenize and score.
- `level`: Grammar level, currently `N3` for N3 rounds.
- `targetGrammarIds`: Grammar IDs the case is meant to probe.
- `expected`: Enabled grammar IDs that should be emitted for this sentence.
- `kind`: One of `positive`, `near-miss-negative`, `mention-negative`, `quote-negative`, `punctuation-gap-negative`, `overlap-negative`, `lexical-negative`, or `mixed`.
- `source`: Agent or human source label, such as `corpus-agent-a`.
- `rationale`: Semantic explanation for the expected label.

Workers may patch against frozen pre-patch corpora only. They must not patch against auditor-after corpora in the same round.

Patch reviewers should reject matcher changes that only fit exact nouns, exact sentences, or one-off lexical exceptions.
```

- [ ] **Step 3: Write the failing scorer tests**

Create `tests/unit/grammar-round-corpus-scorer.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRoundCorpus,
  scoreRoundCorpus,
} from '../../scripts/score-grammar-corpus.js';

describe('grammar round corpus scorer', () => {
  it('validates required corpus fields', () => {
    assert.throws(
      () => validateRoundCorpus([{ id: 'bad-case' }]),
      /missing sentence/
    );
  });

  it('scores precision, recall, F1, and sentence accuracy', () => {
    const corpus = [
      {
        id: 'positive',
        sentence: 'A',
        level: 'N3',
        targetGrammarIds: ['n3-test-a'],
        expected: ['n3-test-a'],
        kind: 'positive',
        source: 'unit',
        rationale: 'Positive test case.'
      },
      {
        id: 'negative',
        sentence: 'B',
        level: 'N3',
        targetGrammarIds: ['n3-test-a'],
        expected: [],
        kind: 'near-miss-negative',
        source: 'unit',
        rationale: 'Negative test case.'
      }
    ];
    const observedBySentence = new Map([
      ['A', ['n3-test-a']],
      ['B', ['n3-test-a']]
    ]);

    const score = scoreRoundCorpus(corpus, sentence => observedBySentence.get(sentence) || []);

    assert.equal(score.totalCases, 2);
    assert.equal(score.correctCases, 1);
    assert.equal(score.falsePositiveCount, 1);
    assert.equal(score.missCount, 0);
    assert.equal(score.accuracy, 0.5);
    assert.equal(score.precision, 0.5);
    assert.equal(score.recall, 1);
    assert.equal(Number(score.f1.toFixed(3)), 0.667);
  });
});
```

- [ ] **Step 4: Run the scorer tests and verify they fail**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-round-corpus-scorer.test.js
```

Expected: FAIL with a module-not-found error for `scripts/score-grammar-corpus.js`.

- [ ] **Step 5: Implement the scorer module and CLI**

Create `scripts/score-grammar-corpus.js`:

```js
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { tokenizeBatch } from '../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../src/game/grammar/grammar-matcher.js';

const REQUIRED_FIELDS = ['id', 'sentence', 'level', 'targetGrammarIds', 'expected', 'kind', 'source', 'rationale'];

export function validateRoundCorpus(corpus) {
  if (!Array.isArray(corpus)) throw new Error('round corpus must be an array');
  const ids = new Set();
  for (const item of corpus) {
    for (const field of REQUIRED_FIELDS) {
      if (item[field] == null || item[field] === '') {
        throw new Error(`case ${item.id || '<missing id>'} missing ${field}`);
      }
    }
    if (ids.has(item.id)) throw new Error(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (!Array.isArray(item.targetGrammarIds)) throw new Error(`case ${item.id} targetGrammarIds must be an array`);
    if (!Array.isArray(item.expected)) throw new Error(`case ${item.id} expected must be an array`);
    if (item.rationale.length < 20) throw new Error(`case ${item.id} rationale is too short`);
  }
}

export function scoreRoundCorpus(corpus, observeIdsForSentence) {
  validateRoundCorpus(corpus);
  const failures = [];
  let correctCases = 0;
  let expectedCount = 0;
  let hitCount = 0;
  let falsePositiveCount = 0;
  let missCount = 0;

  for (const item of corpus) {
    const expected = new Set(item.expected);
    const observed = observeIdsForSentence(item.sentence);
    const observedSet = new Set(observed);
    const missed = [...expected].filter(id => !observedSet.has(id));
    const unexpected = observed.filter(id => !expected.has(id));

    expectedCount += expected.size;
    hitCount += [...expected].filter(id => observedSet.has(id)).length;
    falsePositiveCount += unexpected.length;
    missCount += missed.length;

    if (missed.length === 0 && unexpected.length === 0) {
      correctCases += 1;
    } else {
      failures.push({
        id: item.id,
        sentence: item.sentence,
        targetGrammarIds: item.targetGrammarIds,
        expected: item.expected,
        observed,
        missed,
        unexpected,
        kind: item.kind,
      });
    }
  }

  const precision = hitCount + falsePositiveCount === 0 ? 1 : hitCount / (hitCount + falsePositiveCount);
  const recall = expectedCount === 0 ? 1 : hitCount / expectedCount;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    totalCases: corpus.length,
    correctCases,
    accuracy: corpus.length === 0 ? 1 : correctCases / corpus.length,
    expectedCount,
    hitCount,
    missCount,
    falsePositiveCount,
    precision,
    recall,
    f1,
    failures,
  };
}

export function scoreCorpusWithCurrentMatcher(corpus, { level = 'N3' } = {}) {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const enabledIds = new Set(catalog
    .filter(point => point.level === level && point.status === 'enabled')
    .map(point => point.id));
  const sentences = corpus.map(item => item.sentence);
  const tokenized = tokenizeBatch(sentences);

  return scoreRoundCorpus(corpus, sentence => {
    const index = sentences.indexOf(sentence);
    return findGrammarMatches(tokenized[index], { catalog, matchers })
      .map(match => match.grammarId)
      .filter(id => enabledIds.has(id));
  });
}

function parseArgs(argv) {
  const args = { level: 'N3', json: false, corpusPath: '' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--level') {
      args.level = argv[++index];
    } else if (arg === '--json') {
      args.json = true;
    } else if (!args.corpusPath) {
      args.corpusPath = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.corpusPath) throw new Error('usage: node scripts/score-grammar-corpus.js <corpus.json> [--level N3] [--json]');
  return args;
}

function printTextScore(score) {
  console.log(`Cases: ${score.correctCases}/${score.totalCases}`);
  console.log(`Accuracy: ${(score.accuracy * 100).toFixed(2)}%`);
  console.log(`Precision: ${(score.precision * 100).toFixed(2)}%`);
  console.log(`Recall: ${(score.recall * 100).toFixed(2)}%`);
  console.log(`F1: ${(score.f1 * 100).toFixed(2)}%`);
  console.log(`Misses: ${score.missCount}`);
  console.log(`False positives: ${score.falsePositiveCount}`);
  for (const failure of score.failures.slice(0, 25)) {
    console.log(`${failure.id}: missed [${failure.missed.join(', ')}], unexpected [${failure.unexpected.join(', ')}] ${failure.sentence}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const corpus = JSON.parse(readFileSync(args.corpusPath, 'utf-8'));
  const score = scoreCorpusWithCurrentMatcher(corpus, { level: args.level });
  if (args.json) {
    console.log(JSON.stringify(score, null, 2));
  } else {
    printTextScore(score);
  }
}
```

- [ ] **Step 6: Run scorer tests and sample CLI**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-round-corpus-scorer.test.js
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/sample-n3-round-corpus.json --level N3
```

Expected: scorer tests pass. Sample CLI exits `0` and prints metrics for 2 cases.

- [ ] **Step 7: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/README.md tests/fixtures/grammar-rounds/sample-n3-round-corpus.json tests/unit/grammar-round-corpus-scorer.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add grammar round corpus scorer.

EOF
)"
```

---

## Task 2: Create Round 001 Audit Seed Ledger

**Files:**
- Create: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Create the round ledger**

Create `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`:

```markdown
# Round 001 N3 Audit Seed

## Scope

Audit-only seed round for all enabled N3 matcher rows. No production matcher patches are allowed during this round.

## Precision Policy

False positives on adjudicated negatives must remain zero. Any grammar point that requires semantic interpretation beyond Sudachi token metadata should be marked as `cataloged-not-detectable` or kept as a known miss.

## Round Recall Target

No recall target is set for this audit-only round. The round output is a frozen corpus and a ranked risk list.

## Corpus Agent Assignments

- Corpus Agent A: discourse connectors, quote/mention contexts, punctuation/gap crossing.
- Corpus Agent B: suffix/auxiliary patterns, lexical readings, overlap suppression.

## Frozen Corpus Path

`tests/fixtures/grammar-rounds/n3-round-001-frozen.json`

## Auditor-After Corpus Path

No auditor-after corpus is created in this audit-only seed round.

## Commands

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
node --experimental-test-module-mocks --test tests/unit/grammar-*.test.js
```

## Scoreboard

| Metric | Value |
| --- | --- |
| Enabled N3 points | Record from `data/grammar-catalog.json` at round start |
| Not-detectable N3 points | Record from `data/grammar-catalog.json` at round start |
| Frozen corpus cases | Record after corpus adjudication |
| Frozen corpus false positives | Record after scoring |
| Frozen corpus recall | Record after scoring |
| Existing grammar suite | Record pass/fail after scoring |

## Round Results

This section is filled by the core orchestrator after corpus generation and scoring.
```

- [ ] **Step 2: Verify the ledger exists**

Run:

```bash
test -f docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md && echo "round ledger exists"
```

Expected: prints `round ledger exists`.

- [ ] **Step 3: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Add N3 audit seed round ledger.

EOF
)"
```

---

## Task 3: Run Two Read-Only Corpus Agents

**Files:**
- Read: `data/grammar-catalog.json`
- Read: `data/grammar-matchers.json`
- Read: `tests/fixtures/grammar-n3.json`
- Read: `tests/fixtures/grammar-n3-stress.json`
- Update after core adjudication: `tests/fixtures/grammar-rounds/n3-round-001-frozen.json`
- Update after core adjudication: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Dispatch Corpus Agent A**

Dispatch a read-only explore/general-purpose subagent with this prompt:

```text
You are Corpus Agent A for N3 grammar matcher Round 001.

Worktree: /Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/n3-grammar

Read only. Do not modify files.

Goal: Generate fresh adversarial N3 grammar corpus cases focused on discourse connectors, quote/mention contexts, punctuation/gap crossing, and sentence-boundary behavior.

Inspect:
- data/grammar-catalog.json
- data/grammar-matchers.json
- tests/fixtures/grammar-n3.json
- tests/fixtures/grammar-n3-stress.json

Do not copy existing fixture or stress sentences.

Return 80-120 JSON objects with this exact shape:
{
  "id": "round-001-a-001",
  "sentence": "Japanese sentence",
  "level": "N3",
  "targetGrammarIds": ["n3-lxx-yy"],
  "expected": ["n3-lxx-yy"],
  "kind": "positive | near-miss-negative | mention-negative | quote-negative | punctuation-gap-negative | overlap-negative | lexical-negative | mixed",
  "source": "corpus-agent-a",
  "rationale": "Semantic explanation for why the expected IDs should or should not be emitted."
}

For every target grammar family, include at least one positive and two negatives when possible. Prioritize likely false positives over easy positives. If a grammar point is semantically impossible to label from local token evidence, mark it in your notes as a not-detectable candidate.
```

Expected: agent returns JSON candidates and a short list of not-detectable candidates.

- [ ] **Step 2: Dispatch Corpus Agent B**

Dispatch a read-only explore/general-purpose subagent with this prompt:

```text
You are Corpus Agent B for N3 grammar matcher Round 001.

Worktree: /Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/n3-grammar

Read only. Do not modify files.

Goal: Generate fresh adversarial N3 grammar corpus cases focused on suffixes, auxiliary patterns, lexical readings, morphology variants, and overlap suppression.

Inspect:
- data/grammar-catalog.json
- data/grammar-matchers.json
- tests/fixtures/grammar-n3.json
- tests/fixtures/grammar-n3-stress.json

Do not copy existing fixture or stress sentences.

Return 80-120 JSON objects with this exact shape:
{
  "id": "round-001-b-001",
  "sentence": "Japanese sentence",
  "level": "N3",
  "targetGrammarIds": ["n3-lxx-yy"],
  "expected": ["n3-lxx-yy"],
  "kind": "positive | near-miss-negative | mention-negative | quote-negative | punctuation-gap-negative | overlap-negative | lexical-negative | mixed",
  "source": "corpus-agent-b",
  "rationale": "Semantic explanation for why the expected IDs should or should not be emitted."
}

For every target grammar family, include at least one positive and two negatives when possible. Prioritize likely false positives over easy positives. If a grammar point is semantically impossible to label from local token evidence, mark it in your notes as a not-detectable candidate.
```

Expected: agent returns JSON candidates and a short list of not-detectable candidates.

- [ ] **Step 3: Core adjudicates and writes frozen corpus**

Merge the two agent outputs manually into `tests/fixtures/grammar-rounds/n3-round-001-frozen.json`.

Rules:

- Remove duplicate sentences.
- Remove any sentence whose expected label the core cannot confidently adjudicate.
- Keep negatives even when they look hard; hard negatives are the point of the round.
- Preserve `source` so failures can be traced.
- Keep `rationale` in each item.

The file must be valid JSON array syntax matching the schema from Task 1.

- [ ] **Step 4: Validate the frozen corpus**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
```

Expected: command exits `0` and prints JSON metrics. The metrics may be poor; this is an audit seed round.

- [ ] **Step 5: Update the round ledger scoreboard**

Edit `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md` and replace the scoreboard values with the metrics from Step 4.

- [ ] **Step 6: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add tests/fixtures/grammar-rounds/n3-round-001-frozen.json docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Add N3 round 001 frozen audit corpus.

EOF
)"
```

---

## Task 4: Select the First Patch Scope

**Files:**
- Read: `tests/fixtures/grammar-rounds/n3-round-001-frozen.json`
- Read: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`
- Update: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Summarize failures by grammar ID**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
```

Expected: JSON includes `failures`.

- [ ] **Step 2: Choose a narrow first patch family**

Choose the first patch scope using this priority:

1. A family with false positives and clear local token evidence.
2. A family with many misses and low false-positive risk.
3. A family that should be marked not-detectable.

Recommended first scope if Round 001 confirms the earlier review findings:

```text
Discourse and mention-sensitive rows:
- n3-l02-02 である
- n3-l02-12 という
- n3-l03-14 といえば
- n3-l06-01 さて
- n3-l06-02 むしろ
- n3-l06-03 つまり
- n3-l06-04 すなわち
- n3-l06-05 かえって
- n3-l08-10 あるいは
- n3-l08-13 第一
```

- [ ] **Step 3: Record the selected scope and predeclared recall target**

Append this section to `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`, replacing only the numeric values with actual scored values from Step 1:

```markdown
## First Patch Scope

Selected family: discourse and mention-sensitive rows.

Grammar IDs:
- n3-l02-02
- n3-l02-12
- n3-l03-14
- n3-l06-01
- n3-l06-02
- n3-l06-03
- n3-l06-04
- n3-l06-05
- n3-l08-10
- n3-l08-13

Predeclared target:
- Auditor-after precision: 100%
- Auditor-after false positives: 0
- Auditor-after recall: at least the frozen-corpus recall for this family, unless misses are marked known-miss or not-detectable with reasons
```

- [ ] **Step 4: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Select first N3 grammar patch scope.

EOF
)"
```

---

## Task 5: Dispatch Worker for First Patch Scope

**Files:**
- Modify only if worker patch passes audit: `data/grammar-matchers.json`
- Modify only if worker patch passes audit: `data/grammar-catalog.json`
- Modify only if worker patch passes audit: `tests/fixtures/grammar-n3.json`
- Modify only if worker patch passes audit: `tests/fixtures/grammar-n3-stress.json`
- Update: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Dispatch a worker subagent in an isolated worktree**

Use a best-of-n-runner or implementation subagent with this prompt:

```text
You are the Worker Agent for N3 Grammar Round 001, first patch scope.

Worktree: /Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/n3-grammar

Scope:
- n3-l02-02
- n3-l02-12
- n3-l03-14
- n3-l06-01
- n3-l06-02
- n3-l06-03
- n3-l06-04
- n3-l06-05
- n3-l08-10
- n3-l08-13

Inputs:
- tests/fixtures/grammar-rounds/n3-round-001-frozen.json
- data/grammar-catalog.json
- data/grammar-matchers.json
- tests/fixtures/grammar-n3.json
- tests/fixtures/grammar-n3-stress.json
- src/game/grammar/grammar-matcher.js

Rules:
- Do not patch against any auditor-after corpus.
- Do not add exact sentence or exact noun exceptions.
- Do not broaden a matcher unless you can cite reusable Sudachi token evidence.
- Preserve zero false positives on adjudicated negatives.
- If a grammar point has no reliable local token evidence, mark it not-detectable or report it as unsafe.

Required output:
1. Patch files in your worktree.
2. Add or update fixture/stress cases for each accepted behavior class.
3. Run:
   node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
   node --experimental-test-module-mocks --test tests/unit/grammar-stress-metrics.test.js --test-name-pattern "N3 grammar stress metrics"
   node --experimental-test-module-mocks --test tests/unit/grammar-n5-fixtures.test.js --test-name-pattern "N3 grammar fixtures"
4. Report changed grammar IDs, token-level rationale, known misses, not-detectable candidates, and verification output.
```

Expected: worker returns a patch summary and verification output.

- [ ] **Step 2: Core reviews worker diff before applying**

Inspect the worker output. Reject the patch immediately if it contains:

- Exact test sentence checks.
- Exact test noun lists that are not intrinsic to the grammar point.
- Reject groups that only cover one sentence wording.
- Gap broadening that can cross punctuation.
- New positives without near-miss negatives.

- [ ] **Step 3: Apply the worker patch only if it passes core review**

Apply only the relevant grammar files from the worker worktree to the main worktree.

Do not apply unrelated runtime files, memory files, screenshots, logs, or generated caches.

- [ ] **Step 4: Run focused verification**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
node --experimental-test-module-mocks --test tests/unit/grammar-stress-metrics.test.js --test-name-pattern "N3 grammar stress metrics"
node --experimental-test-module-mocks --test tests/unit/grammar-n5-fixtures.test.js --test-name-pattern "N3 grammar fixtures"
```

Expected: commands exit `0`. Frozen corpus false positives must be `0`.

- [ ] **Step 5: Record worker results**

Append this section to `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`:

```markdown
## Worker Patch Result

Changed grammar IDs:
- Record changed IDs here.

Accepted matcher rationale:
- Record token-level rationale for each changed ID.

Rejected matcher ideas:
- Record any rejected changes and why.

Focused verification:
- Frozen corpus score: record precision, recall, F1, false positives, misses.
- N3 stress metrics: pass/fail.
- N3 fixtures: pass/fail.
```

- [ ] **Step 6: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add data/grammar-matchers.json data/grammar-catalog.json tests/fixtures/grammar-n3.json tests/fixtures/grammar-n3-stress.json docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Improve first N3 grammar matcher scope.

EOF
)"
```

---

## Task 6: Run Auditor-After Review

**Files:**
- Create: `tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json`
- Update: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Dispatch an audit subagent after worker patching**

Dispatch a read-only audit subagent with this prompt:

```text
You are the Audit Agent for N3 Grammar Round 001 after the worker patch.

Worktree: /Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/n3-grammar

Read only. Do not modify files.

Scope:
- n3-l02-02
- n3-l02-12
- n3-l03-14
- n3-l06-01
- n3-l06-02
- n3-l06-03
- n3-l06-04
- n3-l06-05
- n3-l08-10
- n3-l08-13

Review:
- data/grammar-matchers.json
- data/grammar-catalog.json
- tests/fixtures/grammar-n3.json
- tests/fixtures/grammar-n3-stress.json
- tests/fixtures/grammar-rounds/n3-round-001-frozen.json

Generate fresh auditor-after cases that the worker did not see. Focus on:
- quote and metalinguistic mentions
- lexical readings
- punctuation and sentence-boundary crossing
- overlap suppression
- exact-noun or exact-sentence dependence

Return 40-80 JSON objects with this exact shape:
{
  "id": "round-001-audit-001",
  "sentence": "Japanese sentence",
  "level": "N3",
  "targetGrammarIds": ["n3-lxx-yy"],
  "expected": [],
  "kind": "positive | near-miss-negative | mention-negative | quote-negative | punctuation-gap-negative | overlap-negative | lexical-negative | mixed",
  "source": "audit-agent",
  "rationale": "Semantic explanation for why the expected IDs should or should not be emitted."
}

Also return a verdict:
- pass
- revise
- mark not-detectable

Call out any hardcoding in disguise.
```

Expected: auditor returns fresh JSON cases and verdict.

- [ ] **Step 2: Core adjudicates and writes auditor-after corpus**

Write accepted auditor cases to `tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json`.

Rules:

- Remove cases with uncertain labels.
- Keep hard negatives.
- Preserve `source: "audit-agent"`.
- Do not let a worker patch against this file in Round 001.

- [ ] **Step 3: Score auditor-after corpus**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json --level N3 --json
```

Expected: command exits `0`. Acceptance requires precision `1`, false positives `0`, and the predeclared recall target or documented known misses.

- [ ] **Step 4: Decide patch outcome**

Use this decision table:

```text
Auditor precision 1.0 and no hardcoding finding:
  Accept patch.

Auditor finds false positives:
  Reject patch or narrow affected matcher.

Auditor finds hardcoding in disguise:
  Reject patch and record rejected pattern.

Auditor finds misses with safe token evidence:
  Move misses into the next frozen round.

Auditor finds misses with no safe token evidence:
  Mark known miss or not-detectable.
```

- [ ] **Step 5: Update round ledger**

Append this section to `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`:

```markdown
## Auditor-After Result

Auditor verdict: record pass, revise, or mark not-detectable.

Auditor-after score:
- Precision:
- Recall:
- F1:
- False positives:
- Misses:

Hardcoding findings:
- Record each finding or `None`.

Core decision:
- Record accepted, rejected, or deferred.
```

- [ ] **Step 6: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Record N3 round 001 auditor-after corpus.

EOF
)"
```

---

## Task 7: Final Round Verification

**Files:**
- Read: all grammar matcher/catalog/test files touched in earlier tasks
- Update: `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`

- [ ] **Step 1: Run frozen corpus score**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
```

Expected: command exits `0`; false positives are `0`.

- [ ] **Step 2: Run auditor-after corpus score**

Run:

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json --level N3 --json
```

Expected: command exits `0`; precision is `1`; false positives are `0`.

- [ ] **Step 3: Run existing N3 gates**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-stress-metrics.test.js --test-name-pattern "N3 grammar stress metrics"
node --experimental-test-module-mocks --test tests/unit/grammar-n5-fixtures.test.js --test-name-pattern "N3 grammar fixtures"
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run full grammar suite**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-*.test.js
```

Expected: command exits `0`.

- [ ] **Step 5: Update final scoreboard**

Append this section to `docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md`:

```markdown
## Final Verification

Frozen corpus:
- Accuracy:
- Precision:
- Recall:
- F1:
- False positives:
- Misses:

Auditor-after corpus:
- Accuracy:
- Precision:
- Recall:
- F1:
- False positives:
- Misses:

Existing N3 gates:
- N3 stress metrics:
- N3 fixtures:

Full grammar suite:
- Result:

Accepted for next round:
- Yes or no, with reason.
```

- [ ] **Step 6: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add docs/superpowers/grammar-rounds/round-001-n3-audit-seed.md
/usr/bin/git commit -m "$(cat <<'EOF'
Record N3 round 001 final verification.

EOF
)"
```

---

## Task 8: Prepare Round 002 Inputs

**Files:**
- Create: `docs/superpowers/grammar-rounds/round-002-n3-next-scope.md`

- [ ] **Step 1: Create Round 002 planning ledger**

Create `docs/superpowers/grammar-rounds/round-002-n3-next-scope.md`:

```markdown
# Round 002 N3 Next Scope

## Source Material

- Round 001 frozen corpus failures.
- Round 001 auditor-after misses.
- Round 001 rejected hardcoding patterns.
- Grammar points marked known-miss or not-detectable candidates.

## Candidate Scopes

1. Suffix and auxiliary patterns.
2. Negative adverb patterns.
3. Volitional and attempt patterns.

## Selection Rule

Choose the candidate scope with the highest number of false positives first. If false positives are tied, choose the scope with the highest number of misses that has reusable Sudachi token evidence.

## Carry-Forward Cases

Cases from auditor-after corpora may be moved into the next frozen corpus. They must not be patched in the same round where they were generated.
```

- [ ] **Step 2: Commit checkpoint if commits are authorized**

Only run this if the user has explicitly asked for commits:

```bash
/usr/bin/git add docs/superpowers/grammar-rounds/round-002-n3-next-scope.md
/usr/bin/git commit -m "$(cat <<'EOF'
Prepare N3 round 002 scope ledger.

EOF
)"
```

---

## Self-Review

- Spec coverage: The plan implements the core orchestrator, corpus agent, worker agent, audit agent, immutable round flow, anti-hardcoding rules, scoreboard, acceptance gates, and verification commands from `docs/superpowers/specs/2026-05-31-n3-grammar-agent-orchestration-design.md`.
- Placeholder scan: The plan uses no unresolved placeholder markers or unspecified implementation steps. The ledger templates contain fields intentionally filled during execution after commands produce metrics.
- Type consistency: The corpus schema uses the same field names in the README, sample fixture, scorer, tests, and subagent prompts: `id`, `sentence`, `level`, `targetGrammarIds`, `expected`, `kind`, `source`, and `rationale`.
- Scope check: This plan builds the orchestration harness and executes the first audit/patch/audit round. It does not attempt to finish all N3 coverage in one pass.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-05-31-n3-grammar-agent-orchestration-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, and use auditor subagents as required by the design.
2. **Inline Execution** - Execute tasks in this session using executing-plans with batch checkpoints.

