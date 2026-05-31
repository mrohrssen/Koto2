# N3 Grammar Agent Orchestration Design

## Purpose

N3 grammar matching needs to improve without repeating the benchmark-chasing failure mode. The process must make it hard for a worker agent to tune matchers to visible examples and easy for a reviewer to reject patches that are hardcoding in disguise.

The priority is precision before recall. A missed grammar hint is acceptable; a wrong grammar hint teaches the wrong thing.

## Goals

- Improve N3 grammar coverage through small, auditable matcher batches.
- Keep false positives at zero on all adjudicated negative corpora.
- Require every matcher expansion to cite reusable Sudachi token evidence.
- Separate corpus generation, patching, and auditing so no agent grades its own work.
- Treat `cataloged-not-detectable` as a valid outcome when local token evidence is not reliable enough.

## Non-Goals

- Do not chase a single benchmark to 100%.
- Do not accept exact sentence or exact noun exceptions as matcher quality.
- Do not use AI/runtime semantic interpretation in production matching.
- Do not require all N3 points to be detectable if deterministic evidence is insufficient.

## Roles

### Core Orchestrator

The core agent owns scope, scoring, work allocation, and final integration. It is the only agent allowed to apply accepted patches to the main worktree.

Responsibilities:

- Pick one small round scope, usually 10-20 N3 grammar points or one risky matcher family.
- Freeze the round corpus before worker patching starts.
- Set the round recall target before worker patching starts.
- Keep the scoreboard current.
- Decide whether failures are patchable, known misses, or not-detectable.
- Reject worker changes that improve recall by creating ambiguous matches.
- Run global verification after every accepted batch.

### Corpus Agent

The corpus agent creates fresh examples before patching.

Responsibilities:

- Generate positive examples, near-miss negatives, quote/mention negatives, punctuation/gap negatives, and overlap cases.
- Explain each expected label semantically, not just by surface form.
- Avoid copying existing fixture or stress sentences.
- Include tokenization observations when a case depends on Sudachi behavior.

### Worker Agent

The worker agent patches only the assigned scope.

Responsibilities:

- Inspect Sudachi tokenization for every new behavior class before editing.
- Patch matchers only when token evidence is reusable across sentences.
- Add or update fixture/stress cases for behavior classes, not one-off wording.
- Report each grammar point as `improved`, `already acceptable`, `unsafe/not-detectable`, or `needs human adjudication`.

### Audit Agent

The audit agent reviews a completed worker patch and tries to break it.

Responsibilities:

- Generate fresh examples after the worker patch, without reusing worker cases.
- Test quote/mention contexts, punctuation crossing, lexical readings, and overlap suppression.
- Identify exact-noun dependence, exact-sentence dependence, or narrow lexical exceptions.
- Return `pass`, `revise`, or `mark not-detectable`.

### Judge Agent

The judge agent is optional and used for disputed Japanese examples.

Responsibilities:

- Decide whether an example truly expresses the target grammar point.
- Prefer conservative labels when a sentence is semantically ambiguous.
- Escalate uncertain language-learning judgments to the user.

## Round Flow

Each round is immutable after it starts.

1. Core selects a small grammar slice and records the baseline.
2. Corpus agents generate fresh unseen examples.
3. Core adjudicates expected IDs before any patching.
4. Worker agents patch against only the frozen corpus.
5. Core runs the local round scorer and existing grammar gates.
6. Audit agents generate a second unseen corpus after patching.
7. Core accepts, rejects, or sends the work back for another round.

Important rule: workers do not patch against the auditor-after corpus in the same round. If the auditor finds failures, those failures become seed material for the next round.

## Anti-Hardcoding Rules

Reject patches that:

- Mention exact test nouns unless the grammar point itself requires those nouns.
- Add one-off lexical exceptions without a broader token class.
- Rely only on surface strings where Sudachi provides no reliable distinction.
- Broaden recall into known ambiguous territory.
- Add positives without corresponding near-miss negatives.
- Pass current fixtures while failing fresh quote/mention/metalinguistic probes.
- Use large gaps that can cross punctuation or unrelated clauses.

Prefer patches that:

- Use POS, base form, conjugation, adjacency, sentence boundaries, bounded gaps, and reject groups.
- Reuse token evidence across multiple fresh examples.
- Add reusable reject classes for quote/mention contexts.
- Mark unsafe points `cataloged-not-detectable` instead of forcing fragile matchers.

## Scoreboard

The core agent maintains these metrics for each round:

- Enabled N3 points.
- Not-detectable N3 points.
- Existing fixture pass/fail.
- Existing stress false positives, which must stay at zero.
- Existing stress hit rate, target `>= 98%`.
- Frozen unseen corpus precision, recall, and F1.
- Auditor-after corpus precision, recall, and F1.
- Round recall target and whether it was met.
- Number of rejected hardcoding patches.
- Grammar IDs newly marked not-detectable.
- Remaining known misses with reasons.

## Acceptance Gates

A batch is accepted only when all of these are true:

- Existing grammar suite passes.
- No unexpected enabled N3 matches on adjudicated negatives.
- Auditor-after precision is `100%`.
- The predeclared auditor-after recall target is met, or misses are explicitly accepted as known misses/not-detectable.
- No unresolved auditor finding says the patch is hardcoding in disguise.
- Every new matcher row has at least one positive fixture and meaningful negative coverage.

## Patch Decision Rules

When a matcher misses positives:

1. Check Sudachi tokenization for multiple positive variants.
2. Check at least three near-miss negatives.
3. If a local token distinction exists, patch narrowly.
4. If no reliable local distinction exists, mark as not-detectable or keep as known miss.

When a matcher creates false positives:

1. Add the negative case to the adjudicated corpus.
2. Identify whether the false positive is quote/mention, lexical reading, punctuation crossing, overlap, or semantic ambiguity.
3. Add a general reject only if it applies to a reusable class.
4. If the reject would become a list of one-off exceptions, disable or narrow the matcher instead.

## Verification Commands

Core verification after each accepted batch:

```bash
node --experimental-test-module-mocks --test tests/unit/grammar-stress-metrics.test.js --test-name-pattern "N3 grammar stress metrics"
node --experimental-test-module-mocks --test tests/unit/grammar-n5-fixtures.test.js --test-name-pattern "N3 grammar fixtures"
node --experimental-test-module-mocks --test tests/unit/grammar-*.test.js
```

The core may run smaller focused tests during iteration, but no batch is accepted without the full grammar suite.

## Deliverables Per Round

Each completed round should produce:

- A corpus summary with positive/negative counts and expected IDs.
- Worker patch summary with token-level rationale.
- Auditor report with fresh examples and verdict.
- Scoreboard before and after.
- List of accepted matcher changes.
- List of rejected changes and why.
- Any grammar points moved to `cataloged-not-detectable`.

## Open Risks

- Some grammar points require semantic interpretation beyond Sudachi token metadata.
- The process can still overfit if the auditor-after corpus is too similar to the frozen corpus.
- Multiple agents may disagree on Japanese grammar labels; the judge role is needed for disputed cases.
- Precision-first policy will leave some valid hints undetected.

## Initial Recommendation

Start with one audit-only seed round before patching. Have two independent corpus agents attack the current N3 matcher data, merge and adjudicate their examples, then run workers on one narrow family at a time. This creates a cleaner baseline and reduces the temptation to patch from a single visible benchmark.
