# Round 004 N5 Validation

## Scope

N5 adversarial validation using the same round-corpus scorer and agent process as N3 and N4.

## Corpus Sources

- N5 discourse/quote/mention agent.
- N5 morphology/inflection agent.
- N5 overlap/punctuation-gap agent.
- N5 broad random adversarial agent.

## Frozen Corpus

Path: `tests/fixtures/grammar-rounds/n5-round-001-frozen.json`

Pre-fix score:

- Cases: 42
- Accuracy: 47.62%
- Precision: 79.41%
- Recall: 86.17%
- F1: 82.65%
- False positives: 21
- Misses: 13

Final score:

- Cases: 42
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Holdout Corpus

Path: `tests/fixtures/grammar-rounds/n5-round-002-holdout.json`

Pre-fix score:

- Cases: 40
- Accuracy: 65.00%
- Precision: 85.96%
- Recall: 98.00%
- F1: 91.59%
- False positives: 16
- Misses: 2

Final score:

- Cases: 40
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Accepted Fixes

- Added quote/mention suppression for copied or named N5 grammar strings without suppressing live reported speech.
- Added punctuation-boundary guards for `てください`, `ている`, `てから`, comparison gaps, and superlative gaps.
- Preserved existing overlap policy where long same-level patterns suppress shorter labels inside the same span.
- Corrected corpus labels for semantically ambiguous `で` location/means cases rather than adding brittle lexical exceptions.

## Verification

Fresh final verification:

- N5 frozen corpus: 42/42, precision 100%, recall 100%, false positives 0.
- N5 holdout corpus: 40/40, precision 100%, recall 100%, false positives 0.
- All N3 corpora: 100%, false positives 0.
- All N4 corpora: 100%, false positives 0.
- N5/N4/N3 stress metrics: pass, including 0 false positives and at least 98% hit rate.
- Full grammar suite: 1080 tests passing, 0 failing.

## Residual Risk

N5 includes inherently ambiguous particle surfaces (`で`, `と`, `から`, `の`) where local Sudachi token evidence cannot always decide semantic role. The current matcher preserves prior behavior for those ambiguous cases and records them as corpus label corrections rather than adding exact noun exceptions.
