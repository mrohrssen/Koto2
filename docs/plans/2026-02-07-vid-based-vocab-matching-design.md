# Vid-Based Vocabulary Matching for Narration Rewrite

Date: 2026-02-07

## Problem

The narration rewrite system validates AI-rewritten sentences by parsing them with JPDB and checking each token against the user's known vocabulary. However, there is a fundamental mismatch:

- The vocab Set contains **dictionary forms (lemmas)**: `食べる`, `走る`, `学ぶ`
- JPDB's `parseText()` returns **conjugated surface forms**: `食べた`, `走って`, `学びました`

`vocabSet.has("学びました")` returns false even though the user knows `学ぶ`. This causes:
- Sentences that are already at the user's level being flagged for repair
- AI rewrites being rejected because their conjugations also don't match
- Repair loops that fail twice then fall back to the original text
- The entire rewrite feature appearing broken

## Solution

Match on JPDB's **vocabulary ID (vid)** instead of string comparison. The vid is the same for all conjugated forms of a word (`学ぶ`, `学びました`, `学んで` all share the same vid). Both `parseText()` output and the vocab cache already store vids.

## Design

### Return type change: `getNarrationVocabularyForUser()`

Currently returns `string[]`. Will return:

```js
{ words: string[], vidSet: Set<number> }
```

- `words` — lemma strings, used in AI repair prompts (unchanged purpose)
- `vidSet` — Set of vocabulary IDs for all known words, used for validation

### Validation change: `checkSentenceViolations()`

New fallback chain for each parsed token:

1. `isWord === false` (punctuation, spaces) → skip
2. `word.vid` exists and `vidSet.has(word.vid)` → **known**, skip
3. Surface form in `ALLOWED_WORDS` → skip (grammar/particles)
4. Surface form is a game term → skip
5. Single hiragana character → skip
6. Otherwise → **unknown**

### Deduplication change

Switch `seen` Set to track vids when available (instead of surface spellings), so the same dictionary entry isn't reported as unknown twice for different conjugations.

### Pipeline flow

```
getUserNarrationVocabulary()     → { words, vidSet }
  ↓
applyVocabRepair()               → passes words to AI prompt, vidSet to validator
  ↓
enforceVocabLimit()              → receives vidSet parameter
  ↓
checkSentenceViolations()        → uses vidSet.has(word.vid) for matching
```

### What doesn't change

- `ALLOWED_WORDS` — still needed for particles/grammar without vids
- AI repair prompt — still sends string word list
- `getRelevantVocabulary()` — still selects string words for prompts
- `parseText()` in jpdb.js — already returns vid
- Frontend — no changes

### Edge cases

- **Tokens without vid**: `isWord: false` tokens are skipped at step 1
- **Empty vid Set (new user)**: degrades to current string-matching behavior
- **Numbers/punctuation**: parse as `isWord: false`, skipped automatically
- **Counters like 個**: legitimate vocab check, correctly validated via vid
