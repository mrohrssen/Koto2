# Claude Prompt Caching for NPC Dialogue Generation

**Date**: 2026-02-14
**Status**: Approved

## Problem

When pre-generating NPC dialogues, the system sends the player's full vocabulary list (~8,000 words, ~10K+ tokens) in every API call. For N NPCs, that's N identical copies of the vocab list processed at full price. The repair loop adds up to 3 more calls per NPC with the same system prompt.

## Solution

Use Anthropic's prompt caching (`cache_control` breakpoints) so the vocab prefix is cached after the first call. Subsequent calls for the same user read from cache at 10% of the base input token price.

### Savings Estimate

For 10 NPCs with 1 repair each (20 calls), vocab portion (~10K tokens):
- Without caching: 20 × 10K = 200K tokens at base price
- With caching: 1 write (1.25×) + 19 reads (0.1×) = 31.5K effective tokens
- **~84% savings on the vocab portion of input**

## Approach: Structured Prompt Blocks

### 1. `assemblePrompt()` Returns Typed Blocks

Old return: `{ systemPrompt: string, userPrompt: string }`

New return:

```js
{
  systemBlocks: [
    { label: 'instructions', text: '...', cache: true },
    { label: 'vocab',        text: '...', cache: true },   // cache breakpoint
    { label: 'character',    text: '...', cache: false },
    { label: 'lorebook',     text: '...', cache: false },
    { label: 'memory',       text: '...', cache: false },
    { label: 'antiRepeat',   text: '...', cache: false }
  ],
  userPrompt: string
}
```

- `cache: true` = safe to cache across NPC calls for the same user
- `cache: false` = NPC-specific, must NOT be part of cached prefix
- Empty blocks are filtered out before sending to the API
- A helper `flattenSystemBlocks(blocks)` joins texts into a single string for non-Claude providers

### 2. `chatWithClaude()` Builds Cache-Aware System Array

When `systemBlocks` is provided, builds the `system` parameter as an array of text blocks with `cache_control` on the last cacheable block:

```js
system: [
  { type: 'text', text: 'instructions...' },
  { type: 'text', text: 'vocab list...', cache_control: { type: 'ephemeral' } },
  { type: 'text', text: 'character card...' },
  { type: 'text', text: 'memory...' }
]
```

The `cache_control` marker goes on the vocab block. Everything before and including it is cached as a prefix. Everything after is dynamic and uncached.

Backward compatible: if `systemBlocks` is not provided, uses flat `systemPrompt` string.

### 3. Thread `systemBlocks` Through the Call Chain

```
assemblePrompt()  →  systemBlocks
    ↓
generateAndCache()  →  passes to generateDialogue() + enforceDialogueVocab()
    ↓
generateDialogue()  →  passes to chatFn()
enforceDialogueVocab()  →  passes to chatFn() (repair calls also benefit)
    ↓
chat()  →  passes to chatWithClaude() only
    ↓
chatWithClaude()  →  builds system array with cache_control
```

Other providers (OpenAI, Gemini, OpenRouter) receive `systemPrompt` (flat string) and ignore `systemBlocks`.

### 4. Metrics & Observability

Capture Anthropic-specific cache metrics from the API response:
- `cache_creation_input_tokens` — tokens written to cache
- `cache_read_input_tokens` — tokens read from cache

Log cache stats with each NPC dialogue generation call.

### 5. Safety: Preventing NPC Personality Bleed

The cache boundary is **between the vocab block and the character card**. This means:
- Cached prefix: system instructions + vocab list (same for all NPCs of the same user)
- Uncached suffix: character card + lorebook + memory + anti-repetition (unique per NPC)

The character card, personality, goals, memory, and bond score are NEVER part of the cached prefix. Different NPCs always get their own personality in the dynamic portion.

### 6. What This Does NOT Change

- `buildSystemPrompt()` in ai-providers.js (used for chat conversations, not NPC dialogue)
- Non-Claude providers (they continue to receive flat string system prompts)
- The repair loop logic (it just threads `systemBlocks` through, same as initial generation)
- The existing per-user dialogue cache in `text-cache.js`

## Files Modified

| File | Change |
|------|--------|
| `src/narration-engine/prompt-assembler.js` | Return `{ systemBlocks, userPrompt }` instead of `{ systemPrompt, userPrompt }`. Add `flattenSystemBlocks()` helper. |
| `src/narration-engine/generation.js` | Accept + thread `systemBlocks` to `chatFn`. |
| `src/narration-engine/dialogue-repair.js` | Accept + thread `systemBlocks` to `chatFn` in repair calls. |
| `src/narration-engine/index.js` | Unpack `systemBlocks` from `assemblePrompt()`, pass to generation + repair. |
| `src/ai-providers.js` | `chat()` accepts `systemBlocks`, passes to `chatWithClaude()`. `chatWithClaude()` builds cache-aware system array. Capture cache metrics. |
| `src/ai-metrics.js` | Extend `recordCall()` to accept `cacheCreationTokens` and `cacheReadTokens`. |

## Testing

- Unit test: `assemblePrompt()` returns correct block structure with labels and cache flags
- Unit test: `flattenSystemBlocks()` produces identical output to old `systemPrompt`
- Unit test: Empty blocks are filtered
- Manual verification: Check API response `cache_read_input_tokens > 0` on second NPC in a batch
