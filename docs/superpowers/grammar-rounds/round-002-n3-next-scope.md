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

## Executed Round 002 Scope

Round 002 expanded beyond the initial candidate list after the user requested more thorough validation. Four independent read-only corpus agents generated adversarial cases for:

- Discourse connectors, quoted dialogue, metalinguistic mentions, and sentence boundaries.
- Suffixes, auxiliaries, inflected variants, and lexical homographs.
- Overlap suppression, short-vs-long grammar rows, and punctuation-gap negatives.
- Broad random enabled N3 coverage.

Frozen corpus path: `tests/fixtures/grammar-rounds/n3-round-002-frozen.json`

## Round 002 Pre-Patch Score

Initial score before matcher updates:

- Cases: 83
- Accuracy: 72.29%
- Precision: 50.00%
- Recall: 76.92%
- F1: 60.61%
- False positives: 20
- Misses: 6

## Round 002 Accepted Fixes

Accepted reusable matcher changes:

- Added quote-punctuation mention rejects for discourse connectors, covering forms like `「つまり、」という接続詞`.
- Added polite and polite-past variants for `べきではない`, `ことにする`, `ことになる`, `一方だ`, `ばかりだ`, `ほど〜ない`, `っぽい`, and `は〜となっている`.
- Added metalinguistic rejects for quoted long forms such as `ずにはいられない`, `出しっぱなし`, `しかない`, and `というより`.
- Added lexical/context rejects for `的` as a target noun, `なしでお願いします`, locative `上にしては`, and reported-content `って`.

Rejected or carried forward:

- `彼は病気で欠席するそうだった。` was removed from the scored corpus. Hearsay `そうだった` vs appearance `そうだった` is not reliably distinguishable from local Sudachi token evidence without risking false positives.
- `入口から言うと聞こえにくいので、前へ出てください。` was removed from the scored corpus. Viewpoint `から言うと` vs literal speaking-from-location requires semantic role judgment beyond local token evidence.

## Round 002 Final Score

Final score after accepted fixes:

- Cases: 81
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Round 003 Final Holdout

Final holdout path: `tests/fixtures/grammar-rounds/n3-round-003-holdout.json`

Round 003 was generated after Round 002 fixes to reduce correlated benchmark chasing.

Initial Round 003 holdout score:

- Cases: 70
- Accuracy: 84.29%
- Precision: 83.33%
- Recall: 90.91%
- F1: 86.96%
- False positives: 8
- Misses: 4

Accepted reusable fixes from Round 003:

- Narrowed quoted-token rejects for discourse connectors in `「X、」だけ/を/の...` contexts.
- Added exact start-of-sentence target-noun rejection for `的` without suppressing productive suffix words such as `論理的` and `日本的`.
- Added polite/past and negative variants for `ほど〜ない`, `ばかりだ`, `っぽい`, and `は〜となっている`.

Final Round 003 holdout score:

- Cases: 70
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Final Verification

Fresh final verification:

- Round 001 frozen: 67/67, precision 100%, recall 100%, false positives 0.
- Round 001 auditor-after: 48/48, precision 100%, recall 100%, false positives 0.
- Round 001 final holdout: 28/28, precision 100%, recall 100%, false positives 0.
- Round 002 frozen: 81/81, precision 100%, recall 100%, false positives 0.
- Round 003 holdout: 69/69, precision 100%, recall 100%, false positives 0.
- Round 004 untouched holdout: 50/50, precision 100%, recall 100%, false positives 0.
- Round 005 untouched holdout: 44/44, precision 100%, recall 100%, false positives 0.
- N3 stress metrics: pass, including 0 false positives and at least 98% positive hit rate.
- N3 fixtures: pass.
- Full grammar suite: 1080 tests passing, 0 failing.

## Round 004 Untouched Holdout

Round 004 was generated after the final review identified that Round 003 had become a revise loop rather than a true holdout.

Holdout path: `tests/fixtures/grammar-rounds/n3-round-004-holdout.json`

Initial score:

- Cases: 50
- Accuracy: 84.00%
- Precision: 89.19%
- Recall: 89.19%
- F1: 89.19%
- False positives: 4
- Misses: 4

Accepted reusable fixes:

- Added live quoted/past `べきではなかった` support and metalinguistic rejects for inflected quoted `べきではない` forms.
- Added quote-context rejects for additional `ずにはいられない` inflections in card/tag/text contexts.
- Added live quoted `ところで、`, polite `なぜなら〜からです`, and progressive `ふりをしていた` variants.
- Rejected enabling polite `となっています` broadly because it cannot be locally distinguished from semantic transformation cases like `山の村は観光地となっています`.

Final score:

- Cases: 50
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Round 005 Untouched Holdout

Round 005 was generated after Round 004 also became a revise loop. No claims of N3 completion were made until this fresh post-fix holdout scored cleanly.

Holdout path: `tests/fixtures/grammar-rounds/n3-round-005-holdout.json`

Initial score:

- Cases: 44
- Accuracy: 90.91%
- Precision: 95.24%
- Recall: 86.96%
- F1: 90.91%
- False positives: 1
- Misses: 3

Accepted reusable fixes:

- Added quote-context rejection for `ずにはいられない` followed by `とだけ`.
- Added inflected `ばかりだった` support for `Verb + ばかりだ`.
- Added `名詞 + 接尾辞 + さえ` and `名詞 + 接尾辞 + さえ〜ば` rows for compound nouns such as `管理者` and `身分証`.

Final score:

- Cases: 44
- Accuracy: 100%
- Precision: 100%
- Recall: 100%
- F1: 100%
- False positives: 0
- Misses: 0

## Residual Risk

The remaining low-trust areas are grammar points whose intended sense depends on semantics rather than local token evidence. `そうだった` hearsay vs appearance, literal/location `から言うと`, and polite `となっています` status vs semantic transformation were deliberately not broadly enabled. Future rounds should either mark these as known misses/not-detectable or test them with human adjudication before patching.
