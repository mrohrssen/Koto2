# Kanji Kombat Onboarding Design

**Date:** 2026-06-03  
**Status:** Approved for spec review  
**Feature:** First-entry Kanji Kombat script preference onboarding

## Summary

When a player enters Kanji Kombat for the first time after this feature ships, Cid appears on the battlefield and asks whether they already know hiragana and katakana. The answers become reversible Kanji Kombat preferences that decide which script deck the mode starts from. The questionnaire does not mutate script SRS card progress.

This onboarding runs for every account, including existing accounts, the next time they start Kanji Kombat. After the answers are saved successfully, it does not appear again unless a future settings/reset feature changes the stored onboarding state.

The existing project character and code path are named `Cid`; this spec uses `Cid` even if conversational notes call her `Sid`.

## Goals

- Run a short Cid onboarding sequence the first time any account enters Kanji Kombat.
- Show the sequence after creature selection, on the Kanji Kombat battlefield.
- Reuse existing Cid sprite slide-in/slide-out, narration box, and action-area choice button frameworks.
- Save reversible preferences for whether the player already knows hiragana and katakana.
- Use those preferences to skip hiragana and/or katakana in Kanji Kombat deck selection.
- Preserve all existing script SRS card progress regardless of the answers.
- Recover cleanly if the page reloads during onboarding.

## Non-Goals

- No new dialogue box component.
- No new Cid sprite animation framework.
- No new response-button component.
- No settings UI for changing the preferences yet.
- No SRS reset, card graduation, or card deletion.
- No changes to Speed Review.
- No dictionary edits.

## Player Flow

The hub `Kanji Kombat` button keeps its current entry pattern:

1. Player clicks `Kanji Kombat`.
2. Player chooses one unlocked creature with the existing creature collection picker.
3. The server starts a Kanji Kombat run.
4. The client transitions to the normal Kanji Kombat battlefield.
5. Before any intro card or quiz is actionable, Cid slides in and runs the onboarding sequence.
6. The client submits both answers.
7. The server saves preferences, clears the pending onboarding gate, queues the first real Kanji Kombat prompt, and returns state.
8. Cid slides out and normal Kanji Kombat begins.

Cid copy:

1. `Hey, welcome to Kanji Kombat. Here, you can practice your hiragana, katakana, and kanji all the way up to full fluency.`
2. `First things first. Do you already know all hiragana?`
3. Buttons:
   - `Yes, I know all of them`
   - `No, please teach me`
4. Acknowledgement:
   - If hiragana is `true`: `Great, we won't spend time teaching you hiragana.`
   - If hiragana is `false`: `Great, we'll teach you hiragana.`
5. `Do you already know all katakana?`
6. Buttons:
   - `Yes, I know all of them`
   - `No, please teach me`
7. Acknowledgement:
   - If katakana is `true`: `Great, we won't spend time teaching you katakana.`
   - If katakana is `false`: `Great, we'll teach you katakana.`
8. Final line:
   - If hiragana is `false`: `Great, we'll start by teaching you hiragana and go from there.`
   - Else if katakana is `false`: `Great, we'll start by teaching you katakana and go from there.`
   - Else: `Okay, great, we'll start by teaching you kanji. Let's jump right into it.`

The acknowledgement lines must not add extra choices or alter the two-answer data model.

## Reused UI Frameworks

Implementation must compose existing systems:

- Use the existing battle scene / current scene with an `npcs` layer.
- Use the existing Cid NPC display helpers that slide Cid in and out.
- Use the existing narration box for all Cid text.
- Use the existing action-area button helper for yes/no responses.
- Use the existing combat action refresh path after the server returns updated state.

The onboarding code may orchestrate these pieces, but it must not create a new renderer for dialogue, Cid sprites, answer buttons, or battle-scene overlays.

## State Model

Add a meta progression object:

```javascript
kanjiKombatOnboarding: {
  completed: false,
  knowsHiragana: null,
  knowsKatakana: null
}
```

Missing `kanjiKombatOnboarding` defaults to this object, including for existing accounts. That means all existing accounts see onboarding once on their next Kanji Kombat start.

Add a run-scoped gate while a Kanji Kombat run is waiting for onboarding:

```javascript
run.kanjiKombat.onboardingPending = true
```

When onboarding is pending, the server should not queue a script intro card or quiz yet. This prevents the first prompt from being selected before the preferences are known.

After successful submit:

```javascript
meta.kanjiKombatOnboarding = {
  completed: true,
  knowsHiragana,
  knowsKatakana
};
run.kanjiKombat.onboardingPending = false;
```

## SRS Safety

The questionnaire never mutates script SRS card state.

- If the player says they know hiragana, Kanji Kombat skips the hiragana deck by preference only.
- If the player says they do not know hiragana, Kanji Kombat includes hiragana using the user's existing FSRS state as-is.
- If the player says they know katakana, Kanji Kombat skips the katakana deck by preference only.
- If the player says they do not know katakana, Kanji Kombat includes katakana using the user's existing FSRS state as-is.
- No card is marked `Review` because of onboarding.
- No due dates, reps, lapses, or learning states are reset because of onboarding.

This keeps the answers easy to undo later: a future settings/reset surface can change the preferences and the untouched script cards will become eligible again.

## Deck Selection

Kanji Kombat currently chooses the first non-graduated script type in this order:

1. Hiragana
2. Katakana
3. Kanji

Update script selection to apply onboarding preferences before graduation checks:

1. If `knowsHiragana === true`, skip hiragana.
2. If `knowsKatakana === true`, skip katakana.
3. Kanji is never skipped.
4. For any non-skipped script, preserve the current FSRS graduation and due/new-card behavior.

Examples:

- `knowsHiragana: false`, `knowsKatakana: false` starts from hiragana unless hiragana is already graduated.
- `knowsHiragana: true`, `knowsKatakana: false` starts from katakana unless katakana is already graduated.
- `knowsHiragana: true`, `knowsKatakana: true` starts from kanji.
- `knowsHiragana: false`, with half of hiragana already practiced, continues from the existing hiragana progress.

## API Design

Add:

```text
POST /api/game/kanji-kombat/onboarding
```

Request body:

```javascript
{
  knowsHiragana: boolean,
  knowsKatakana: boolean
}
```

Server validation:

- The user must have an active run.
- `run.mode` must be `kanjiKombat`.
- `run.kanjiKombat.onboardingPending` must be `true`.
- Both submitted values must be booleans.

Server behavior:

1. Save the meta preferences and `completed: true`.
2. Clear `run.kanjiKombat.onboardingPending`.
3. Queue the first Kanji Kombat prompt using the existing script SRS state plus preferences.
4. Save game state.
5. Return enriched game state.

If validation fails, return a normal 400 error and do not save partial answers.

## Reload And Failure Behavior

Onboarding answers are submitted only once, after both questions are answered. Partial answers are client-local and can be lost on reload.

If the page reloads while onboarding is pending:

- The restored game state still has `run.kanjiKombat.onboardingPending = true`.
- The battlefield returns to the onboarding interrupt.
- The player answers both questions again.

If the onboarding submit fails:

- Do not mark onboarding complete.
- Do not queue the first script prompt.
- Keep or restore the onboarding sequence so the user can retry.

## Testing

Unit and route coverage should prove:

- Missing `meta.kanjiKombatOnboarding` defaults to incomplete.
- Starting Kanji Kombat with incomplete onboarding sets `onboardingPending` and does not queue a prompt.
- Submitting onboarding validates boolean answers.
- Submitting onboarding saves only preferences/completion and clears `onboardingPending`.
- Submitting onboarding queues the first prompt after preferences are saved.
- Deck selection skips hiragana and/or katakana only by preference.
- Saying `false` for either script preserves and uses existing script SRS progress.
- No onboarding path mutates script card FSRS fields.
- The UI onboarding orchestrator uses existing narration/button flow and blocks normal Kanji Kombat action rendering until complete.

Fast verification after implementation:

```bash
node --check public/game.js
node --check public/js/ui/kanji-kombat.js
npm test
```

Because this feature changes visible Cid/battlefield behavior, visual verification is required before reporting implementation complete.
