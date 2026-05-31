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
