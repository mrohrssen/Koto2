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

`tests/fixtures/grammar-rounds/n3-round-001-auditor-after.json`

## Commands

```bash
node scripts/score-grammar-corpus.js tests/fixtures/grammar-rounds/n3-round-001-frozen.json --level N3 --json
node --experimental-test-module-mocks --test tests/unit/grammar-*.test.js
```

## Scoreboard

| Metric | Value |
| --- | --- |
| Enabled N3 points | 202 |
| Not-detectable N3 points | 18 |
| Frozen corpus cases | 67 |
| Frozen corpus false positives | 0 |
| Frozen corpus recall | 100% |
| Existing grammar suite | Pass |

## Round Results

The frozen corpus was adjudicated from Corpus Agent A, Corpus Agent B, and core-added `である` cases. Invalid labels discovered during scoring were corrected rather than patched against.

## First Patch Scope

Selected family: discourse and mention-sensitive rows, plus the `ずに` / `ずにはいられない` overlap found in the same round.

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
- n3-l08-19
- n3-l08-20

Predeclared target:
- Auditor-after precision: 100%
- Auditor-after false positives: 0
- Auditor-after recall: at least the frozen-corpus recall for this family, unless misses are marked known-miss or not-detectable with reasons

## Worker Patch Result

Changed grammar IDs:
- n3-l02-02
- n3-l02-12
- n3-l03-14
- n3-l06-01
- n3-l06-02
- n3-l06-03
- n3-l06-04
- n3-l06-05
- n3-l08-10
- n3-l08-19
- n3-l08-20

Accepted matcher rationale:
- Added reusable quote/object/mention rejection for discourse particles and connectors where Sudachi exposes quote brackets, object marker `を`, or metalinguistic nouns such as `語`, `表現`, `副詞`, and split `接続` + `詞`.
- Added local rejects for literal or edited `といえば` phrases such as `と言えばいい` and `といえば、を`.
- Added quoted-label `という` rows that allow quoted names before ordinary nouns while rejecting metalinguistic labels such as `文法項目`, `文末表現`, `練習`, and `番号`.
- POS-gated one-token discourse connectors so lexical nouns such as clog `つまり` and mat `むしろ` do not match connector grammar.
- Replaced blanket quote-start rejection with narrower quoted-token-only rejection, preserving live quoted dialogue such as `「さて、始めましょう」`.
- Made `ずにはいられない` inflection-aware for plain, past, polite, polite-past, `ぬ`, and continuative `ず`, while suppressing the shorter `ずに` row inside the longer pattern.

Rejected matcher ideas:
- Rejected treating all quoted speech as negative; only clear metalinguistic quote/mention cases were kept.
- Rejected the initial `図書館である本` negative because Sudachi marks it as a copular relative-clause use, not a safe locative negative.
- Rejected suppressing legitimate out-of-scope grammar such as `例文として`, `はじめに`, and conjunctive 連用形; those were added to expected labels instead.

Focused verification:
- Frozen corpus score: accuracy 100%, precision 100%, recall 100%, F1 100%, false positives 0, misses 0.
- N3 stress metrics: pass.
- N3 fixtures: pass.

## Auditor-After Result

Auditor verdict: revise, then pass after core adjudication and matcher updates.

Auditor-after score:
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

Hardcoding findings:
- Initial auditor concern: mention handling was too narrow around exact labels like `語`, `言葉`, and `表現`.
- Resolution: added broader metalinguistic token classes, including split Sudachi forms like `接続` + `詞`, without adding exact sentence or noun exceptions.

Core decision:
- Accepted.

## Final Holdout Result

Final holdout path: `tests/fixtures/grammar-rounds/n3-round-001-final-holdout.json`

The final holdout was generated after the auditor-after revise loop to restore an unpatched-against check before completion.

Final holdout score:
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Final Verification

Frozen corpus:
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

Auditor-after corpus:
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

Final holdout corpus:
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

Existing N3 gates:
- N3 stress metrics: pass, including 0 false positives and at least 98% positive hit rate.
- N3 fixtures: pass.

Full grammar suite:
- Result: pass, 1080 tests passing and 0 failing.

Accepted for next round:
- Yes. Round 001 meets the precision policy and recall target on the frozen, auditor-after, and final holdout corpora.
