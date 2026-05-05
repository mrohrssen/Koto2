# Dialogue Translate Bottom Sheet Design

## Goal

Make the `Translate` button on the new dialogue card functional. The feature should give players a natural English translation of the current Japanese dialogue line without replacing the existing word-by-word learning scaffold or word lookup behavior.

The translation is an answer-key style comprehension aid. It is not a grammar explanation, literal translation, or word breakdown.

## User Experience

When the player taps `Translate`, the game opens a bottom sheet over the lower part of the screen. The dialogue card remains visually behind the sheet, and the player returns to the dialogue card by closing the sheet.

The sheet has three states:

- Loading: show the Japanese line at the top and a short `Translating...` status while the request is in flight.
- Success: show the Japanese line and the natural English translation.
- Unavailable: show the Japanese line, a friendly unavailable message, and a `Try again` button.

Closing the sheet is transient UI behavior only. It must not advance dialogue, resolve `showNpcDialogueCard()`, change NPC dialogue state, or mark any words as learned.

The `Continue` button remains the only control that advances the dialogue card. The player should close the translation sheet before continuing.

## Translation Source

There is one canonical global translation cache keyed by exact Japanese text.

On every translate request, the server resolves in this order:

1. Look up the exact Japanese text in the global translation cache.
2. If found, return the cached natural English translation.
3. If not found, call the master-level AI translation provider.
4. If AI translation succeeds, save the result into the same global cache and return it.
5. If AI translation fails or master config is unavailable, return an unavailable response without caching a bad result.

There is no separate hardcoded translation table. The cache is the durable source of truth; just-in-time AI results become effectively hardcoded for all future users and runs.

The cache key should be the exact Japanese source string. Do not include speaker, user, NPC ID, or generated-dialogue identity in the key for this first design.

The cache must be global application state, not part of per-user NPC dialogue memory. Its backing store should follow the app's existing runtime-cache persistence conventions and remain ignored by git. Do not create generated cache files in the repo root.

## API Contract

Add a server endpoint for dialogue translation:

```http
POST /api/dialogue/translate
Content-Type: application/json

{ "text": "いまは怖いけど、一緒に行こう。" }
```

Successful response:

```json
{
  "ok": true,
  "translation": "It is scary right now, but let's go together.",
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

Use a short translation-specific prompt. The model output is stored globally, so the prompt should strongly discourage explanations, alternatives, markdown, or extra commentary.

System prompt:

```text
You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary.
```

User prompt:

```text
Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.

Japanese:
{sentence}
```

Use a low-temperature setting when the configured provider supports it. If the shared `chat()` helper does not currently expose per-purpose temperature control, the implementation plan should decide whether to add a narrow translation path or extend provider configuration carefully.

## Data Model

Each global cache entry should store at least:

- `sourceText`: the exact Japanese text used as the key.
- `translation`: the natural English translation returned to users.
- `provider`: the provider that produced the translation, if AI-generated.
- `model`: the model that produced the translation, if available.
- `createdAt`: first creation timestamp.
- `updatedAt`: last edit or regeneration timestamp.

The design does not require admin editing in the first pass, but the cache shape should not prevent future review/edit tooling.

## Client Integration

`public/js/ui/npc-dialogue-card.js` should enable `Translate` only when the current card has a non-empty Japanese source string. Tokenized dialogue should derive that source string from the current page tokens; fallback HTML/plain-text dialogue can opt out unless a safe plain Japanese source string is available.

On click:

1. Open the bottom sheet immediately.
2. Render the current Japanese source line in the sheet.
3. Request translation from the server.
4. Render success or unavailable state.
5. Allow retry from the unavailable state.
6. Close without altering the dialogue promise or page index.

The bottom sheet should reuse the visual language of the dialogue card: parchment surface, dark border, mobile-safe spacing, and a clear close/done control. It should not introduce a separate full-screen modal.

## Error Handling

If master translation config is missing, the server should return `translation_unavailable`.

If AI returns empty text, markdown-only output, or a response that clearly violates the prompt by including explanation labels, do not cache it. Return `translation_unavailable` so the player can retry later after configuration or prompt fixes.

If multiple users request the same uncached line at roughly the same time, the implementation should avoid corrupting the cache. It is acceptable for the first pass to tolerate duplicate AI calls as long as the stored result remains valid and deterministic by exact text.

## Testing

Unit tests should cover:

- Cache hit returns the stored translation without calling AI.
- Cache miss calls AI once, stores the result, and future requests reuse it.
- Failed AI/config returns `translation_unavailable` and does not cache.
- Invalid or empty text is rejected without calling AI.
- The translation prompt requests natural English and plain text only.
- The dialogue card `Translate` button opens the bottom sheet without resolving or advancing `showNpcDialogueCard()`.
- Loading, success, unavailable, retry, and close states render correctly.

Manual visual verification is required because this is a visual UI change. Use the Vite dev server and browser tooling to verify the bottom sheet on the dialogue-card screen before reporting completion.
