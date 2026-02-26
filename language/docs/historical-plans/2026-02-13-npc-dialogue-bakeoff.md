# NPC Dialogue Model Bakeoff

## Goal

Compare 6 AI models (3 OpenAI, 3 Anthropic) on NPC dialogue generation. Measure cost, speed, vocab compliance, and output quality for the same NPC (Yuuki) using identical prompts.

## Models

| Tier | OpenAI | Claude |
|------|--------|--------|
| Budget | gpt-5-mini | claude-haiku-4-5 |
| Mid | gpt-5.2 | claude-sonnet-4-5 |
| Top | gpt-5.2-pro | claude-opus-4-6 |

## Metrics Per Model

- **Latency** — wall-clock seconds for generation
- **Tokens** — actual input/output counts from API response (not estimated)
- **Cost** — calculated from token counts and known pricing
- **i+1 violations** — fields with >1 unknown word (checked via JPDB)
- **Repair rounds** — how many repair attempts needed (0 = clean first try)
- **Final status** — pass (all fields at i+1 or below) or fail (violations remain after 3 repair rounds)

## Output

```
data/bakeoff/
  gpt-5-mini.json
  gpt-5.2.json
  gpt-5.2-pro.json
  claude-haiku-4-5.json
  claude-sonnet-4-5.json
  claude-opus-4-6.json
  scorecard.md
```

Each JSON file contains the generated dialogue, metadata (tokens, cost, latency), and validation results (violations, repair rounds). The scorecard summarizes all models in a comparison table.

Quality evaluation happens manually — the user reads each dialogue file and judges naturalness, personality, and creativity.

## Code Changes

### 1. `ai-providers.js` — two modifications

**a) Claude model parameter.** The Claude provider hardcodes `claude-sonnet-4-20250514`. Add a `claudeModel` parameter to `chat()` and `chatWithClaude()` so callers can specify haiku, sonnet, or opus.

**b) Usage data in return value.** `chat()` currently returns a plain string. Add an option to return `{ text, usage: { inputTokens, outputTokens } }` instead. Use a `returnUsage` flag so existing callers are unaffected.

### 2. `scripts/npc-bakeoff.mjs` — new file

The script:

1. Reads env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `JPDB_API_KEY`
2. Loads vocab cache for user `u_95d9752cf34bd5cc`, builds vocabSet and vidSet
3. Loads character card for `npc_01` and assembles the prompt (identical for all models)
4. Loops through all 6 models:
   - Calls `chat()` with `returnUsage: true`
   - Records latency and token counts
   - Parses and validates dialogue shape
   - Runs `checkSentenceViolations` on all 15 fields via JPDB
   - If violations exceed i+1, runs `enforceDialogueVocab` repair loop
   - Calculates cost from token counts and hardcoded pricing table
5. Writes each model's result to `data/bakeoff/<model>.json`
6. Writes `data/bakeoff/scorecard.md` with the comparison table

### Pricing Table (hardcoded in script)

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|--------------|
| gpt-5-mini | 0.25 | 2.00 |
| gpt-5.2 | 1.75 | 14.00 |
| gpt-5.2-pro | 21.00 | 168.00 |
| claude-haiku-4-5 | TBD | TBD |
| claude-sonnet-4-5 | TBD | TBD |
| claude-opus-4-6 | TBD | TBD |

Anthropic pricing will be filled in before running the script.

## Implementation Steps

1. Modify `chatWithClaude()` to accept a model parameter
2. Modify `chat()` to accept `claudeModel` and `returnUsage`, return usage data from all providers
3. Write `scripts/npc-bakeoff.mjs`
4. Run the bakeoff, review results

## What This Does NOT Change

- No changes to game routes, frontend, or NPC dialogue pipeline
- No new dependencies
- The bakeoff script is standalone tooling, not production code
