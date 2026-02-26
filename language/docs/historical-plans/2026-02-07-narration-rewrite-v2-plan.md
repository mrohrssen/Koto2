# Narration Rewrite V2 (Own Plan): Guaranteed 0-Unknown Output with Deterministic Recovery

## Summary
Build a new rewrite pipeline that guarantees displayed narration contains zero unknown lexical tokens (excluding punctuation and numbers), preserves intent when possible, and never silently falls back to the original invalid line.

This plan prioritizes correctness over speed.

## Public API / Interface / Type Changes
1. Update `src/jpdb.js` `parseText()` token shape to include `dictionarySpelling` for recognized JPDB tokens.
2. Update `src/game/vocab-repair.js` result shape to include per-line rewrite metadata:
`{ narration, rewriteStatus, attempts, unknownBefore, unknownAfter, repairs, failures }`.
3. Update `src/routes/game/misc.js` `/rewrite-narration` response to keep `narration` and add:
`rewriteStatus`, `attempts`, `unknownBefore`, `unknownAfter`, `fallbackUsed`.
4. Update `public/js/api.js` `rewriteNarration()` return type to pass through metadata.
5. Keep backward compatibility: existing callers reading only `narration` continue to work.

## Implementation Plan

### Phase 1: Canonical Validator (Core Correctness)
1. In `src/jpdb.js`, include both `spelling` (surface) and `dictionarySpelling` (JPDB lemma) in parsed word tokens.
2. In `src/game/vocab-repair.js`, rebuild `checkSentenceViolations()` to:
- Ignore tokens where `isWord === false`.
- Ignore pure punctuation and pure numeric tokens.
- Validate by `dictionarySpelling` first, then `spelling` as fallback.
- Keep game-term exemptions.
3. Change unknown tracking from string array to structured entries:
`{ surface, dictionary, reason }`.
4. Set rewrite strictness to hard `0` unknown lexical tokens for displayed output.

### Phase 2: AI Repair Loop V2 (Targeted and Convergent)
1. Replace the current generic retry with two-stage targeted repair in `src/game/vocab-repair.js`.
2. Attempt 1 prompt: rewrite for meaning preservation with explicit allowed list and explicit zero-unknown goal.
3. Attempt 2 prompt: surgical retry using exact remaining unknown tokens from recheck and instruction to replace only offending parts.
4. Validate after each attempt with the canonical validator; accept only if `unknownAfter === 0`.

### Phase 3: Deterministic Fallback (No Original-Text Reversion)
1. Add a deterministic fallback builder in `src/game/vocab-repair.js`.
2. Fallback algorithm:
- Parse source sentence.
- Keep only tokens already valid under canonical validator.
- Recompose sentence preserving original punctuation where possible.
- If recomposed text is empty or degenerate, emit a guaranteed-safe minimal sentence.
3. Revalidate fallback output; if invalid, use a final absolute-safe sentence that is guaranteed valid.
4. Remove fallback-to-original behavior for the rewrite endpoint.

### Phase 4: Vocabulary Source Stability (Prevent Impossible Rewrites)
1. Update `src/game/vocab-manager.js` `getNarrationVocabularyForUser()` to avoid tiny partial-cache vocab sets.
2. Rule: until a user has completed `lastFullParse`, use fallback vocabulary source; after full parse, use state-filtered ranked list.
3. Keep per-user behavior; do not reintroduce shared-cache behavior.

### Phase 5: Observability and Client Transparency
1. In `src/routes/game/misc.js`, return explicit rewrite outcome metadata.
2. In `public/js/ui/narration-box.js`, log status categories:
`unchanged_valid`, `ai_repaired`, `deterministic_fallback`.
3. In `server.js`, standardize log lines with sentence index, attempt, unknown counts before and after, and final status.

## Test Cases and Scenarios

### Unit Tests
1. Dictionary-form match passes: known `学ぶ` accepts surface `学びました`.
2. Punctuation and numeric tokens are ignored.
3. Unknown structured output includes both surface and dictionary when available.
4. Deterministic fallback always returns validator-clean sentence (`unknownAfter === 0`).

### Integration Tests
1. Extend `tests/integration/rewrite-narration.test.js`:
- Valid source returns `rewriteStatus=unchanged_valid`.
- Failed AI attempt but successful retry returns `rewriteStatus=ai_repaired`.
- Failed retries trigger deterministic fallback with `rewriteStatus=deterministic_fallback`.
- Rewrite path no longer returns original invalid text.

### End-to-End Verification
1. Syntax check modified files with `node --check`.
2. Run targeted integration tests.
3. Run required wrapper command for rewrite-relevant flow:
`./scripts/e2e-test.sh specs/features/run-and-exploration`.
4. Acceptance gate: rewrite endpoint never emits invalid text in strict mode.

## Rollout and Safety
1. Ship behind server flag `REWRITE_ENGINE_V2` in `server.js`.
2. Keep debug logs enabled for first rollout window to verify status distribution and fallback frequency.
3. Promote to default after clean test and e2e pass and stable production logs.

## Assumptions and Defaults
1. Strictness is fixed to `0 unknowns` for displayed rewritten narration.
2. If AI cannot satisfy constraints, deterministic safe fallback is mandatory.
3. Latency optimization and global request-lock UX changes are out of scope for this change.
4. Quiz Master question text continues to use `skipRewrite: true` in `public/js/ui/exploration.js`.
