# Fix AI Narration Rewrite Logic

## Problem Summary

The game's AI rewrite flow adapts narration to the user's vocabulary level. When validation fails, repair attempts often still fail, causing fallback to original text. [WORD-REWRITE-ISSUES.md](../WORD-REWRITE-ISSUES.md) documents: unchanged output after repair, repair attempts failing twice, known words rejected, and opaque fallback behavior.

## Root Cause Analysis

### 1. Surface Form vs Dictionary Form Mismatch (Primary)

**Location:** [src/game/vocab-repair.js](../../src/game/vocab-repair.js) `checkSentenceViolations` (lines 288-309)

- User vocab cache stores **dictionary forms** (e.g., `学ぶ`, `勉強する`) from JPDB's word state cache.
- JPDB `parseText` returns **surface forms** (e.g., `学びました`, `勉強しませんでした`) from the actual text.
- Validation uses `vocabSet.has(spelling)` where `spelling` is the surface form.
- Result: User "knows" `学ぶ` but `学びました` fails validation.

**Evidence:** Issue doc #4: "words like 一切 and 勉強 appear as known" yet sentence fails. Issue #5: "Logged unknown sets include forms like 学びました".

### 2. Non-Word Tokens Counted as Unknown

**Location:** Same `checkSentenceViolations` loop

- `parseText` returns both word tokens (`isWord: true`) and non-word tokens (`isWord: false`) for punctuation, spaces, numbers.
- The loop iterates over **all** tokens and only skips `ALLOWED_WORDS` and single hiragana.
- Punctuation like `！` and numeric/counter tokens (e.g., `0`, `個`) are not in `ALLOWED_WORDS` and get counted as unknown.

**Evidence:** Issue #5: "punctuation-like tokens (！), depending on parse output" and "numeric/counter elements".

### 3. parseText Omits Dictionary Form

**Location:** [src/jpdb.js](../../src/jpdb.js) `parseText` (lines 475-484)

- The result pushes `spelling: actualSpelling` (surface form from text).
- `vocabLookup[vocabIndex].spelling` (dictionary form) is available but not exposed in the returned object.

---

## Proposed Solution

### Phase 1: Fix Validation Logic (High Impact)

**1a. Expose dictionary form in parseText**

- In [src/jpdb.js](../../src/jpdb.js), when pushing a recognized token, add:
  - `dictionarySpelling: vocabLookup[vocabIndex]?.spelling ?? null`
- For unrecognized tokens (`vocabIndex === null`), keep `dictionarySpelling: null`.

**1b. Use dictionary form in checkSentenceViolations**

- In [src/game/vocab-repair.js](../../src/game/vocab-repair.js):
  - Skip tokens with `isWord === false` (punctuation, spaces, inter-token text).
  - For vocab check: use `dictionarySpelling ?? spelling` and check `vocabSet.has(dictionarySpelling ?? spelling)`.
  - Add a fallback: if `dictionarySpelling` is absent, still check `vocabSet.has(spelling)` for backward compatibility.

**1c. Expand allowed non-vocabulary tokens**

- Skip tokens that are purely punctuation: `/[。！？、，,．.「」『』\s]/` (full-width and half-width).
- Skip tokens that are purely numeric: `/^\d+$/` or similar.
- Optionally add common counters (`個`, `つ`, `人`) to `ALLOWED_WORDS` if they appear frequently in narration and are not useful as "vocabulary to learn."

### Phase 2: Strengthen Repair Prompt (Medium Impact)

**2a. Feed dictionary forms to repair**

- In `repairSentence`, pass `unknownWords` as the **surface forms** that failed (current behavior).
- Optionally: if we have `dictionarySpelling` from parse, we could include "replace X (dictionary: Y)" in the prompt to help the AI choose simpler conjugations—but the main fix is validation, not the prompt.

**2b. Add explicit negative instruction**

- In the repair prompt: "Do not use any word not in the list. Check conjugations: if you use 学ぶ, conjugations like 学んだ、学びました are OK. Do not introduce new vocabulary."

**2c. Improve retry context**

- On retry, pass the **full list of unknown tokens from recheck** (surface forms) and explicitly say: "These specific words/tokens are still not allowed. Replace them with ONLY words from the list."

### Phase 3: Observability (Low Effort)

**3a. Return repair metadata from API**

- In [src/routes/game/misc.js](../../src/routes/game/misc.js), have `adaptExistingNarrationText` return an object: `{ narration, repaired, failed }` when possible.
- Or add a `X-Narration-Status` header: `unchanged | repaired | fallback` so the client can log without parsing.

**3b. Server-side logging**

- Ensure `[VocabRepair]` logs include: sentence index, attempt number, unknown words from recheck, and final status (repaired vs fallback).

---

## File Changes Summary

| File | Changes |
|------|---------|
| [src/jpdb.js](../../src/jpdb.js) | Add `dictionarySpelling` to parse result for recognized tokens |
| [src/game/vocab-repair.js](../../src/game/vocab-repair.js) | Skip non-word tokens; use dictionary form for vocab check; skip punctuation/numeric |
| [src/game/vocab-repair.js](../../src/game/vocab-repair.js) | Optionally strengthen repair prompt and retry context |
| [src/routes/game/misc.js](../../src/routes/game/misc.js) | Optional: return repair metadata |

---

## Validation Strategy

1. **Unit tests:** Add tests for `checkSentenceViolations` with:
  - Surface form (学びました) when vocab has dictionary form (学ぶ) → should pass.
  - Punctuation-only token → should be skipped.
  - Numeric token → should be skipped.
2. **Integration test:** Use a mock that returns parse with `dictionarySpelling` and verify repair flow.
3. **Manual:** Run a session with known vocab and confirm narration rewrites succeed instead of falling back.

---

## Out of Scope (per user)

- Speed/latency (future session).
- Global request lock blocking (separate concern).
