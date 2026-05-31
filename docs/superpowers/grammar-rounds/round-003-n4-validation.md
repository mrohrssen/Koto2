# Round 003 N4 Validation

## Scope

N4 adversarial validation using the same scorer and corpus process as the completed N3 work.

## Corpus Sources

- N4 discourse/quote/mention agent.
- N4 morphology/inflection agent.
- N4 overlap/punctuation-gap agent.
- N4 broad random adversarial agent.

## Frozen Corpus

Path: `tests/fixtures/grammar-rounds/n4-round-001-frozen.json`

Pre-fix score:

- Cases: 48
- Accuracy: 52.08%
- Precision: 53.19%
- Recall: 78.13%
- F1: 63.29%
- False positives: 22
- Misses: 7

Final score:

- Cases: 48
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Holdout Corpus

Path: `tests/fixtures/grammar-rounds/n4-round-002-holdout.json`

Pre-fix score:

- Cases: 43
- Accuracy: 83.72%
- Precision: 81.82%
- Recall: 96.43%
- F1: 88.52%
- False positives: 6
- Misses: 1

Final score:

- Cases: 43
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Accepted Fixes

- Added quote/mention suppression for N4 grammar names and quoted sentence fragments.
- Added punctuation-gap boundaries for `とか〜とか`, `しか〜ない`, `あまり〜ない`, and related gap matchers.
- Added or broadened reusable morphology rows for polite/past variants such as `にくくありませんでした`, `はずがありません`, and `なければいけません`.
- Generalized `と考えられている`, `とされている`, and `と言われている` away from exact `大切` examples while suppressing the generic passive row on those longer spans.
- Added lexical guards for connector-looking `それに` / `それで` uses and physical `の中で`.

## Verification

Fresh final verification:

- N4 frozen corpus: 48/48, precision 100%, recall 100%, false positives 0.
- N4 holdout corpus: 43/43, precision 100%, recall 100%, false positives 0.
- N4 stress metrics: pass, including 0 false positives and at least 98% hit rate.
- N4 fixtures: pass.
- Full grammar suite: 1080 tests passing, 0 failing.

## Residual Risk

N4 still has semantically sensitive families where local Sudachi token evidence can be ambiguous. Future rounds should keep carrying forward cases that require world knowledge or broad sentence semantics instead of encoding exact lexical exceptions.
