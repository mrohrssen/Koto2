# Dialogue Learn Standard Study Card Design

## Goal

Make the disabled `Learn` button on the dialogue card open a full-screen, scrollable sentence lesson that teaches the player how to understand the current Japanese line themselves.

`Translate` answers, "What did this mean?" `Learn` answers, "How do I read this kind of Japanese next time?"

The first version is explanation-only. It does not quiz the player, change SRS state, mark words known or forgotten, or personalize content to the player's current known-word list.

## Approved Modal Structure

Use design option A from `learn-modal-design-options.canvas.tsx`: **Standard Study Card**.

The app renders one full-screen takeover with this fixed section order:

1. `Sentence`
2. `Pronunciation`
3. `Translation`
4. `Word by word`
5. `Grammar hints`
6. `Other tips`

The player opens the takeover from the dialogue card and closes it back to the same dialogue card page. Closing Learn must not advance dialogue, resolve `showNpcDialogueCard()`, mark any words learned, or change NPC dialogue state.

The Learn modal should be visually distinct from the Translate bottom sheet:

- `Translate`: quick bottom sheet answer key.
- `Learn`: full-screen study view for deeper explanation.

## Content Rules

Learn teaches the entire current sentence, not only an unknown word.

The lesson is globally cacheable and must not depend on per-player known/new word state. If a player taps Learn, assume they may need help with any word in the line, including words that were previously known.

The lesson may explain the sentence in English, but it must not introduce new Japanese example sentences. Every Japanese string shown in the lesson must come from one of these trusted inputs:

- the exact source sentence,
- tokenizer token surfaces,
- tokenizer readings,
- tokenizer base forms,
- protected entity surfaces supplied for that exact source line.

This keeps the feature aligned with the i+1 principle and avoids teaching unvalidated Japanese text.

## Entity Handling

Protected game entities are required. The same Japanese surface can be an ordinary word or a game entity depending on the current line.

Example:

```text
花は森で光を見た。
```

If dialogue metadata says `花` is a creature named `Flower`, the lesson must teach both:

- `In Koto`: `花` is the creature `Flower`.
- `Ordinary Japanese`: `花` usually means `flower / blossom`.

The natural translation should use the protected game entity name:

```text
Flower saw a light in the forest.
```

not:

```text
The flower saw a light in the forest.
```

Entity handling should reuse the same entity context shape as dialogue translation where possible:

```json
{
  "id": "hana",
  "type": "creature",
  "surface": "花",
  "displayName": "Flower",
  "ordinaryMeaning": "flower / blossom"
}
```

`ordinaryMeaning` may be supplied by token/dictionary data on the server. The client should not invent it.

## Cache Strategy

Use one canonical global Learn lesson cache. Lessons are reusable across users.

Cache key:

```text
source Japanese text + entity signature + schema version
```

The entity signature must be stable and order-independent. It should include only fields that affect lesson output:

- `id`
- `type`
- `surface`
- `displayName`
- ordinary meaning if included in the generated entity note

Do not include user ID, known-word state, NPC memory ID, run ID, or transient UI state.

Changing the lesson schema or validation contract must bump `schemaVersion`, causing new cache entries rather than silently reusing old incompatible JSON.

## API Contract

Add a server endpoint:

```http
POST /api/dialogue/learn
Content-Type: application/json

{
  "text": "花は森で光を見た。",
  "tokens": [
    {
      "surface": "花",
      "reading": "はな",
      "baseForm": "花",
      "pos": "noun",
      "meaning": "flower / blossom",
      "entity": true
    },
    {
      "surface": "は",
      "reading": "は",
      "baseForm": "は",
      "pos": "particle"
    }
  ],
  "entities": [
    {
      "id": "hana",
      "type": "creature",
      "surface": "花",
      "displayName": "Flower"
    }
  ]
}
```

Successful response:

```json
{
  "ok": true,
  "lesson": {
    "schemaVersion": 1,
    "sourceText": "花は森で光を見た。",
    "pronunciation": {
      "kana": "はな は もり で ひかり を みた",
      "romaji": "hana wa mori de hikari o mita"
    },
    "translation": "Flower saw a light in the forest.",
    "tokens": [],
    "grammarHints": [],
    "otherTips": []
  },
  "cached": false
}
```

Unavailable response:

```json
{
  "ok": false,
  "error": "learn_lesson_unavailable"
}
```

The client should not send provider names, model choices, API keys, or player vocabulary state.

## Strict Lesson JSON Schema

The AI must return JSON only. The app owns layout, section order, headers, emphasis, and CSS.

Top-level shape:

```json
{
  "schemaVersion": 1,
  "sourceText": "花は森で光を見た。",
  "pronunciation": {
    "kana": "はな は もり で ひかり を みた",
    "romaji": "hana wa mori de hikari o mita"
  },
  "translation": "Flower saw a light in the forest.",
  "tokens": [
    {
      "surface": "花",
      "reading": "はな",
      "romaji": "hana",
      "baseForm": "花",
      "role": "noun · subject",
      "meaning": "the creature Flower",
      "detail": "Marked as a Koto creature in this sentence.",
      "entity": {
        "id": "hana",
        "type": "creature",
        "displayName": "Flower",
        "kotoMeaning": "the creature Flower",
        "ordinaryMeaning": "flower / blossom"
      }
    },
    {
      "surface": "は",
      "reading": "は",
      "romaji": "wa",
      "baseForm": "は",
      "role": "topic marker",
      "meaning": "marks the thing the sentence is about",
      "detail": "Read 花は as “as for Flower…”"
    }
  ],
  "grammarHints": [
    {
      "title": "Verb goes last.",
      "body": "Japanese sentences put the verb at the end. Read to the end first to find the action: 見た, saw."
    }
  ],
  "otherTips": [
    {
      "title": "Entity vs ordinary noun.",
      "body": "In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom."
    },
    {
      "title": "Reading habit.",
      "body": "Scan to the verb at the end, then use は, で, and を to assign topic, place, and object."
    }
  ]
}
```

Required top-level keys:

- `schemaVersion`
- `sourceText`
- `pronunciation`
- `translation`
- `tokens`
- `grammarHints`
- `otherTips`

No other top-level keys are allowed.

`tokens[]` must be the canonical word-by-word lesson data. The renderer should not reconstruct role/meaning/detail prose from freeform markdown.

## Validation Rules

Add deterministic validation before caching or returning a lesson. Invalid AI output must return `learn_lesson_unavailable` and must not be cached.

Structural validation:

- Output must parse as one JSON object.
- No markdown fences, prose wrappers, or labels before/after JSON.
- Top-level keys must exactly match the schema.
- Required nested fields must be present.
- Unexpected keys are rejected.
- `schemaVersion` must equal the server's current supported Learn lesson schema version.
- Arrays must respect min/max lengths:
  - `tokens`: exactly the source token count for tokenized dialogue.
  - `grammarHints`: 1-6.
  - `otherTips`: 1-5.

Length validation:

- `translation`: 1-240 characters.
- token `role`: 1-60 characters.
- token `meaning`: 1-120 characters.
- token `detail`: optional, max 180 characters.
- hint/tip `title`: 1-80 characters.
- hint/tip `body`: 1-300 characters.

Japanese text validation:

- `sourceText` must exactly match the request source text.
- token `surface`, `reading`, and `baseForm` must match the trusted tokenizer data for the same token index.
- No Japanese sentence may appear in `translation`, `grammarHints[].body`, `otherTips[].body`, or token prose unless it is a substring of:
  - the source text,
  - a trusted token surface,
  - a trusted token reading,
  - a trusted token base form,
  - a protected entity surface.

Entity validation:

- If a trusted token is a protected entity, the corresponding lesson token must include `entity`.
- `entity.id`, `type`, and `displayName` must match the normalized entity context.
- `entity.kotoMeaning` must include the protected display name.
- `entity.ordinaryMeaning` must be non-empty when dictionary/token data has an ordinary meaning.
- At least one `otherTips[]` entry must distinguish Koto entity meaning from ordinary Japanese meaning when protected entities are present.

Safety validation:

- Reject markdown headings, bullet syntax, code fences, HTML, or raw links in AI strings.
- Reject empty or generic filler such as `N/A`, `TBD`, or `No notes`.
- Reject content that claims the lesson has been personalized to the player's known vocabulary.
- Reject content that asks the player a quiz question or requests an SRS action.

## AI Prompt Contract

Use a Learn-specific prompt. The prompt must strongly require strict JSON and forbid extra Japanese examples.

System prompt:

```text
You are a careful Japanese sentence tutor for a language-learning RPG. Return only valid JSON matching the provided schema. Explain how the given sentence works using concise English. Do not add Japanese examples beyond the provided sentence, token surfaces, readings, base forms, and protected entity surfaces.
```

User prompt should include:

- the exact source sentence,
- trusted token list,
- protected entity list,
- current `schemaVersion`,
- full JSON schema/template,
- validation rules summary,
- instruction to return JSON only.

The AI should not decide section order or visual layout. It only fills lesson data.

If the AI returns malformed JSON or schema-invalid data, the first pass may fail closed without retry. A later implementation may retry once with a correction prompt if tests prove it is useful.

## Client Integration

`public/js/ui/npc-dialogue-card.js` should enable `Learn` only when the current page has tokenized dialogue.

On click:

1. Open the full-screen Learn takeover immediately.
2. Render loading state with the source sentence.
3. POST the exact source text, current page tokens, and protected entity context to `/api/dialogue/learn`.
4. Render the Standard Study Card sections on success.
5. Render a friendly unavailable state with `Try again` on failure.
6. Close back to the dialogue card without advancing dialogue.

The Standard Study Card renderer maps JSON to fixed sections:

- `Sentence`: `sourceText`
- `Pronunciation`: `pronunciation.kana` and `pronunciation.romaji`
- `Translation`: `translation`
- `Word by word`: `tokens[]`
- `Grammar hints`: `grammarHints[]`
- `Other tips`: `otherTips[]`

The renderer must escape all text. It must not render server-provided HTML.

## Server Integration

Add a `src/dialogue-learn/` service layer analogous to dialogue translation:

- config reader for master AI provider/model,
- global cache class,
- entity normalization/signature helper,
- prompt builder,
- JSON parser,
- strict validator,
- lesson generation service.

Environment variables can mirror translation config naming:

```bash
DIALOGUE_LEARN_PROVIDER=openai
DIALOGUE_LEARN_API_KEY=
DIALOGUE_LEARN_MODEL=gpt-5-mini
```

The app may choose to share the same AI provider helper as translation, but Learn should have its own purpose label and config so it can be tuned independently.

## Error Handling

Return `learn_lesson_unavailable` when:

- source text is empty,
- tokenized dialogue is unavailable,
- master config is missing,
- AI call fails,
- AI output is not strict JSON,
- schema validation fails,
- entity validation fails,
- generated content includes untrusted Japanese examples.

Do not cache failed or partially valid lessons.

If the cache contains an older schema version, treat it as a miss.

## Testing

Unit tests should cover:

- cache key includes source text, entity signature, and schema version.
- cache hit returns stored lesson without calling AI.
- cache miss calls AI, validates JSON, stores the lesson, and returns it.
- missing config returns `learn_lesson_unavailable`.
- invalid JSON is rejected and not cached.
- extra top-level keys are rejected.
- missing required fields are rejected.
- unexpected nested keys are rejected.
- wrong `schemaVersion` is rejected.
- token count mismatch is rejected.
- token surface/reading/base mismatch is rejected.
- extra Japanese example sentence in prose is rejected.
- protected entity token without entity object is rejected.
- entity object with mismatched display name is rejected.
- protected entity lessons require both Koto meaning and ordinary meaning when available.
- markdown, HTML, code fences, and commentary wrappers are rejected.
- client sends source text, current page tokens, and protected entities.
- Learn opens full-screen without resolving/advancing dialogue.
- Standard Study Card renders all six sections in order.
- unavailable/retry/close states work.

Manual visual verification is required because this is a visual UI feature. Use the Vite dev server and browser tooling to verify the Learn takeover on a dialogue-card screen before reporting implementation complete.

## Out Of Scope For First Pass

- Player-specific known/new word personalization.
- Quizzes or comprehension checks.
- SRS actions from the Learn screen.
- Multiple visual templates.
- Admin lesson editing UI.
- Extra Japanese example sentences.
- Learn support for non-tokenized fallback dialogue.
