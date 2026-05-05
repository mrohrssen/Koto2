# Dialogue Translate Bottom Sheet Design

## Goal

Make the `Translate` button on the new dialogue card functional. The feature should give players a natural English translation of the current Japanese dialogue line without replacing the existing word-by-word learning scaffold or word lookup behavior.

The translation is an answer-key style comprehension aid. It is not a grammar explanation, literal translation, or word breakdown.

## User Experience

When the player taps `Translate`, the game opens a bottom sheet over the lower part of the screen. The dialogue card remains visually behind the sheet, and the player returns to the dialogue card by closing the sheet.

The sheet has three states:

- Loading: show the Japanese line at the top and a short `Translating...` status while the request is in flight.
- Success: show the Japanese line and the natural English translation. Protected game entity names inside the English translation are highlighted in green.
- Unavailable: show the Japanese line, a friendly unavailable message, and a `Try again` button.

Closing the sheet is transient UI behavior only. It must not advance dialogue, resolve `showNpcDialogueCard()`, change NPC dialogue state, or mark any words as learned.

The `Continue` button remains the only control that advances the dialogue card. The player should close the translation sheet before continuing.

## Translation Source

There is one canonical global translation cache keyed by exact Japanese text plus a deterministic entity-context signature.

On every translate request, the server resolves in this order:

1. Normalize and validate the optional protected entity list from the client.
2. Build a cache key from the exact Japanese text and the validated entity-context signature.
3. Look up that key in the global translation cache.
4. If found, return the cached natural English translation and cached entity spans.
5. If not found, call the master-level AI translation provider with a marker-based protected entity glossary.
6. Parse and validate the model's entity markers deterministically.
7. If AI translation succeeds and all marker rules are satisfied, save the plain translation plus entity spans into the same global cache and return it.
8. If AI translation fails, marker validation fails after one retry, or master config is unavailable, return an unavailable response without caching a bad result.

There is no separate hardcoded translation table. The cache is the durable source of truth; just-in-time AI results become effectively hardcoded for all future users and runs.

The cache key must not be only the exact Japanese string once entity context is present. The same source text can validly produce different English:

```text
花は強い！ + no entity context -> Flowers are strong!
花は強い！ + entity hana=Flower -> Flower is strong!
```

The entity-context signature should be stable and order-independent, built from validated fields that affect translation output: `id`, `type`, `surface`, and `displayName`. Do not include user ID, NPC dialogue memory ID, or transient UI state.

The cache must be global application state, not part of per-user NPC dialogue memory. Its backing store should follow the app's existing runtime-cache persistence conventions and remain ignored by git. Do not create generated cache files in the repo root.

## API Contract

Add a server endpoint for dialogue translation:

```http
POST /api/dialogue/translate
Content-Type: application/json

{
  "text": "花は強い！",
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
  "translation": "Flower is strong!",
  "entities": [
    {
      "id": "hana",
      "type": "creature",
      "text": "Flower",
      "start": 0,
      "end": 6
    }
  ],
  "cached": true
}
```

Unavailable response:

```json
{
  "ok": false,
  "error": "translation_unavailable"
}
```

The client should not send API keys, provider names, or model selections. Those are server-side master configuration.

The master translation configuration should come from deployment/server configuration, not from the requesting user's saved AI settings. User-specific AI keys should not affect this feature.

The client may send only entity records that come from game state or token metadata, not arbitrary player input. These records represent protected entity references for this exact source line, not a broad list of nearby possible entities. The server must validate shape and length, discard malformed entity records, and never render raw model marker syntax to the client.

## Master Configuration

Configure the translation provider with server environment variables. These should be set in Railway for both dev and production, and in local `.env` for local development:

```bash
DIALOGUE_TRANSLATION_PROVIDER=openai
DIALOGUE_TRANSLATION_API_KEY=
DIALOGUE_TRANSLATION_MODEL=gpt-5-mini
```

For OpenRouter, use the same variable names with an OpenRouter model slug:

```bash
DIALOGUE_TRANSLATION_PROVIDER=openrouter
DIALOGUE_TRANSLATION_API_KEY=
DIALOGUE_TRANSLATION_MODEL=anthropic/claude-sonnet-4.5
```

The implementation should also add these names to `.env.example` without values. Actual keys must stay in Railway or local ignored env files.

Supported `DIALOGUE_TRANSLATION_PROVIDER` values:

- `openai`
- `anthropic` or `claude`
- `gemini` or `google`
- `openrouter`

`DIALOGUE_TRANSLATION_MODEL` should be honored for every provider, including Gemini. If the existing shared AI provider helper uses a fixed Gemini model, the implementation should update that path or add a narrow translation-specific path so Gemini uses the configured translation model consistently.

## AI Prompt

Use a short translation-specific prompt. The model output is stored globally, so the prompt should strongly discourage explanations, alternatives, markdown, or extra commentary. When protected entities are present, the prompt must also require exact entity markers.

System prompt:

```text
You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary. Protected game entity names must be preserved exactly with the required marker syntax.
```

User prompt:

```text
Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.
- Every listed protected game entity is a game entity reference in this Japanese line. Output exactly that entity's marker for it.
- Do not translate, pluralize, lowercase, rename, or remove protected game entity names.
- Do not invent entity markers that are not listed.

Protected game entities:
- 花 = [[entity:hana|Flower]]

Japanese:
{sentence}
```

Use a low-temperature setting when the configured provider supports it. If the shared `chat()` helper does not currently expose per-purpose temperature control, the implementation plan should decide whether to add a narrow translation path or extend provider configuration carefully.

Expected raw AI output for `花は強い！` with the protected entity above:

```text
[[entity:hana|Flower]] is strong!
```

The raw marker syntax is an internal transport format only. The server parses it, validates it, strips it, and returns structured spans. The client never receives or renders raw `[[entity:...]]` markers.

## Marker Validation

Marker compliance must be deterministic. The implementation must not guess whether the model complied.

Valid marker syntax is:

```text
[[entity:<id>|<displayName>]]
```

A marked entity is valid only if:

- `<id>` exactly matches one of the validated request entities.
- `<displayName>` exactly matches that entity's `displayName`.
- The marker is syntactically complete.
- The final plain translation contains the entity text at the span returned to the client.

If raw model output contains malformed markers, unknown entity IDs, mismatched display names, extra commentary, or leftover marker fragments after parsing, the response is invalid.

When at least one protected entity is provided, each listed entity whose `surface` appears in the source text must appear through a valid marker in the raw model output. This is deterministic because the entity list is source-line-specific; the server does not infer entity meaning from ordinary vocabulary. If a required marker is missing, retry once.

The retry prompt should include the invalid raw output and a concise correction instruction:

```text
Your previous answer did not follow the protected entity marker rules. Return only the corrected English translation. The Japanese source contains the protected game entity 花. Use exactly [[entity:hana|Flower]] for that entity.
```

If the retry still fails validation, return `translation_unavailable` and do not cache.

## Data Model

Each global cache entry should store at least:

- `sourceText`: the exact Japanese text used as the key.
- `entitySignature`: stable signature for the validated entity context, or an empty signature when no entities were sent.
- `translation`: the natural English translation returned to users.
- `entities`: validated entity spans in the plain English translation.
- `provider`: the provider that produced the translation, if AI-generated.
- `model`: the model that produced the translation, if available.
- `createdAt`: first creation timestamp.
- `updatedAt`: last edit or regeneration timestamp.

The design does not require admin editing in the first pass, but the cache shape should not prevent future review/edit tooling.

## Client Integration

`public/js/ui/npc-dialogue-card.js` should enable `Translate` only when the current card has a non-empty Japanese source string. Tokenized dialogue should derive that source string from the current page tokens; fallback HTML/plain-text dialogue can opt out unless a safe plain Japanese source string is available.

For tokenized dialogue, the client should derive protected entities from source-line-specific token metadata and dialogue-card options:

- Creature speaker/entity references: `id`, `name`/`baseWord` as `surface`, `nameEn` as `displayName`, `type: "creature"`.
- NPC speaker/entity references: `id`, `name` as `surface`, `nameEn` as `displayName`, `type: "npc"`.
- Entity tokens produced by `entityToToken()` where enough identity metadata is available.

The first pass can focus on explicit speaker/entity references passed into the dialogue card, because the reported bug is a creature name being translated as an ordinary noun. Future work can broaden the context list to targets, items, moves, and other entities embedded in generated lines.

On click:

1. Open the bottom sheet immediately.
2. Render the current Japanese source line in the sheet.
3. Request translation from the server with source text and protected entity context.
4. Render success or unavailable state.
5. Allow retry from the unavailable state.
6. Close without altering the dialogue promise or page index.

The bottom sheet should reuse the visual language of the dialogue card: parchment surface, dark border, mobile-safe spacing, and a clear close/done control. It should not introduce a separate full-screen modal.

On success, the sheet should render the plain English translation with validated entity ranges wrapped in a green entity-name span. The renderer must escape plain translation text and apply spans by numeric offsets, not by injecting server-provided HTML.

## Error Handling

If master translation config is missing, the server should return `translation_unavailable`.

If AI returns empty text, markdown-only output, or a response that clearly violates the prompt by including explanation labels, do not cache it. Return `translation_unavailable` so the player can retry later after configuration or prompt fixes.

If AI returns entity marker output that fails deterministic validation after one retry, do not cache it. Return `translation_unavailable` so the UI can show a safe failure state rather than teaching a misleading entity translation.

If multiple users request the same uncached line at roughly the same time, the implementation should avoid corrupting the cache. It is acceptable for the first pass to tolerate duplicate AI calls as long as the stored result remains valid and deterministic by source text plus entity signature.

## Testing

Unit tests should cover:

- Cache hit returns the stored translation without calling AI.
- Cache miss calls AI once, stores the result, and future requests reuse it.
- Failed AI/config returns `translation_unavailable` and does not cache.
- Invalid or empty text is rejected without calling AI.
- The translation prompt requests natural English, plain text only, and exact protected entity marker syntax.
- Cache keys distinguish the same Japanese text with and without entity context.
- Valid model entity markers are parsed into plain translation text plus numeric spans.
- Invalid, unknown, mismatched, or malformed markers are rejected and not cached.
- Entity marker validation retries once, then fails closed with `translation_unavailable`.
- The dialogue card sends protected speaker entity context when available.
- The translation sheet renders validated entity spans in green without using server-provided HTML.
- The dialogue card `Translate` button opens the bottom sheet without resolving or advancing `showNpcDialogueCard()`.
- Loading, success, unavailable, retry, and close states render correctly.

Manual visual verification is required because this is a visual UI change. Use the Vite dev server and browser tooling to verify the bottom sheet on the dialogue-card screen before reporting completion.
