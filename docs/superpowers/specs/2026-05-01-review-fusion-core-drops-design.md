# Review Fusion Core Drops Design

## Goal

Give vocab review actions a small chance to award Fusion Cores, while preventing first-time "I forgot" actions from being farmed for rewards. Also close the dictionary popup after the player chooses "I knew it" or "I forgot".

## Current Context

Fusion Cores are stored on `meta.fusionCores`. The fusion service already exposes `addFusionCore(meta)`, and tutorial code has a separate guaranteed Fusion Core reward.

Vocab review actions share `POST /api/game/known-words/review`:

- Speed review cards call `reviewVocabWord(word, grade)` through `speedReview.init({ sendReview })`.
- The dictionary popup calls `reviewVocabWord(word, 'good')` for "I knew it" and `reviewVocabWord(word, 'again')` for "I forgot".
- Word discovery rooms call `reviewVocabWord(word, 'again', true)` with `isDiscovery: true`.

The route currently auto-creates a vocab card if none exists, grades the card, and returns mastery/card state.

## Reward Rules

Each eligible review has an independent 5% chance to award 1 Fusion Core.

Eligibility is based on the server-side pre-review state:

- `good` reviews are eligible, including dictionary popup "I knew it" and speed review "known" swipes.
- `again` reviews are eligible only if the card already existed and was already reviewed/known before the current request.
- First-time `again` reviews are not eligible, because the route would auto-create a new card and this could be farmed by clicking "I forgot" on unknown words.
- `isDiscovery: true` reviews are not eligible.

"Already reviewed/known" should use the same broad definition as `getKnownWordsFromFsrs`: an existing vocab card whose state is `Learning`, `Review`, or `Relearning` before grading. A merely existing but never-reviewed `New` card does not qualify for the `again` reward path.

## Server Design

Update `src/routes/game/known-words.js` so `/review` captures the existing vocab card before any auto-create happens.

The route should:

1. Load existing vocab cards.
2. Find the pre-review card, if any.
3. Compute eligibility:
   - `grade === 'good' && !isDiscovery`
   - or `grade === 'again' && !isDiscovery && preReviewCard exists && preReviewCard.state is Learning/Review/Relearning`
4. Auto-create the card if missing, preserving current behavior.
5. Grade the card and update leaderboard/discovery counters as today.
6. If eligible, roll `Math.random() < 0.05`.
7. On success, increment `meta.fusionCores`, save the game, and include a reward payload plus the enriched game state in the JSON response.

Suggested response shape:

```json
{
  "ok": true,
  "mastered": true,
  "card": { "state": 2, "due": "...", "lapses": 0 },
  "fusionCoreDrop": {
    "awarded": true,
    "fusionCores": 3,
    "message": "Obtained 1x Fusion Core!"
  },
  "state": { "phase": "hub", "meta": { "fusionCores": 3 } }
}
```

When no drop happens, omit `fusionCoreDrop`. This keeps existing callers working without handling a new negative-result shape.

## Client Design

Handle the reward payload anywhere `reviewVocabWord()` is called directly:

- In `public/game.js` speed review `sendReview`, if `fusionCoreDrop.awarded`, update local game state from the response if present and show the existing `showWordLevelUp(..., { message })` reward popup near the reviewed card or active speed review area.
- In `public/js/ui/dialogue-word-lookup.js`, after a successful "I knew it" or "I forgot" response, show the Fusion Core reward popup if present.
- Close the dictionary popup after a successful "I knew it" or "I forgot" action. If the review fails, keep the popup open so the user can see the failure toast and retry.

`reviewVocabWord()` in `public/js/api.js` can keep its current signature. No client-provided source flag is required because eligibility is intentionally enforced from server state and `isDiscovery`.

## Testing

Add focused tests around the route/helper behavior:

- `good` review on a missing card can award a Fusion Core when the roll succeeds.
- `again` review on a missing card cannot award a Fusion Core, even when the roll succeeds.
- `again` review on an existing `Learning`, `Review`, or `Relearning` card can award a Fusion Core when the roll succeeds.
- `again` review on an existing `New` card cannot award a Fusion Core.
- `isDiscovery: true` never awards a Fusion Core.

Client tests should cover:

- Dictionary popup closes after successful "I knew it".
- Dictionary popup closes after successful "I forgot".
- Dictionary popup stays open on review failure.
- Dictionary popup shows the Fusion Core reward popup when the response includes an awarded drop.

If direct route tests cannot reliably control randomness, extract a small pure helper for eligibility and inject the random roll only in tests.

## Out Of Scope

- Changing Fusion Core spend costs.
- Changing tutorial guaranteed Fusion Core behavior.
- Adding analytics for reward sources.
- Showing a new inventory screen or persistent notification beyond the existing reward popup.
