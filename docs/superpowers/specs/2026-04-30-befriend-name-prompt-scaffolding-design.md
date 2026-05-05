# Befriend Name Prompt Scaffolding Design

## Context

Playtesting showed that the bare befriend quiz prompt `名前は？` confused players. The phrase is natural Japanese in context, but the current word-by-word scaffold only exposes `名前` as "name", so learners do not reliably infer that the creature is asking them to choose its name.

The fix should use the existing static frame and contextual override systems. It should not add a new hint UI, a new phrase translation layer, or a new dictionary/glue-word mechanism.

## Design

The befriend name quiz should never select or render bare `名前は？`. Replace that base frame with `私の名前は？`, keeping the prompt simple and natural while giving learners enough visible structure to understand the quiz.

Add a contextual frame override for `私` in the befriend name prompt so the inline scaffold can show "my" for this sentence. The dictionary entry for `私` remains unchanged as "I/me"; the existing word lookup behavior should show the override first as contextual meaning, followed by the original dictionary meanings.

The frame source should remain the source of truth:

```json
{
  "id": "befriend_name_what",
  "category": "befriend_name",
  "raw": "私の名前は？",
  "slots": [],
  "overrides": { "私": "my" }
}
```

Any other befriend name frames that use `私` in the same possessive pattern may also carry the same override if they need the inline scaffold to read naturally. Do not modify `data/dictionary.json`.

## Data Flow

`data/dialogue/frame-sources.json` carries the raw Japanese and optional `overrides`. `scripts/tokenize-static.js` preserves those overrides into `data/dialogue/frames.json`.

`selectBestFrame()` already enriches selected tokens with overrides when a dictionary is provided. The befriend quiz response should include `overrides` alongside `text`, `tokens`, and `words` for each prompt.

`renderBefriendQuiz()` should pass `quizData.namePrompt.overrides || {}` into `renderJpSentence()`, matching the existing pattern used by other narration paths.

## Behavior

When the selected befriend prompt is `私の名前は？`, the narration displays through the normal token renderer. Learners see the existing scaffolded Japanese, with `私` contextually glossed as "my" and `名前` as "name".

When the player clicks `私`, the popup should still include the dictionary definition "I/me" after the contextual "my" meaning. This preserves translation accuracy while making the sentence understandable in context.

## Testing

Update static-frame tests so no `befriend_name` frame has raw text `名前は？`.

Add or update a befriend quiz UI test to verify the name prompt renderer passes frame overrides into `renderJpSentence()`.

Run the tokenizer and dialogue validator after changing frame sources:

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

Run the focused unit tests for static frames and befriend UI before implementation is considered complete.
