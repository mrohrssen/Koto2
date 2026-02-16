# Creature Forge Tooling — Design

**Date:** 2026-02-16
**Status:** Approved
**Problem:** The creature forge skill is too agentic. Each Claude Code session rewrites the same Gemini API script, HTML preview template, and JPDB batch-lookup logic from scratch, wasting tokens and introducing bugs (e.g., using defunct model IDs, wrong response field casing).

## Solution: Standalone CLI Scripts + Importable Helpers

Move the fragile, repetitive parts into permanent, tested scripts. Claude's role shifts from "write and debug infrastructure code" to "make creative decisions and invoke tools."

## Component 1: `scripts/creature-gemini-gen.mjs`

**Purpose:** Generate 3 creature concept art images via Gemini Flash.

**Interface:**
```bash
node scripts/creature-gemini-gen.mjs \
  --id kamedor \
  --visual-tier rare \
  --descriptions /tmp/creature-descriptions.json
```

**Input file** (`creature-descriptions.json`):
```json
{
  "a": "Description A text...",
  "b": "Description B text...",
  "c": "Description C text..."
}
```

**Behavior:**
- Reads API key from `data/.creature-forge-gemini-key`
- Constructs prompts: style prefix + description + visual tier directive
- Tier directives: common="cute mascot", uncommon="companion", rare="striking", epic="powerful", legendary="mythical"
- Calls `gemini-2.5-flash-image` concurrently via `Promise.allSettled`
- Parses camelCase `inlineData` from response parts array
- Writes PNGs to `/tmp/creature-forge-{id}-a.png`, `-b.png`, `-c.png`
- Retries once on network errors (not content policy blocks)
- Background: solid magenta (#FF00FF) specified in prompt
- Outputs structured JSON to stdout:
  ```json
  { "a": { "status": "ok", "bytes": 341000 }, "b": { "status": "ok", "bytes": 883000 }, "c": { "status": "failed", "error": "content policy" } }
  ```

**Why Node.js:** Matches codebase language, built-in `fetch`, no Python dependency.

## Component 2: `scripts/creature-preview.mjs`

**Purpose:** Generate HTML preview and serve it for Playwright viewing.

**Interface:**
```bash
node scripts/creature-preview.mjs \
  --id kamedor \
  --metadata /tmp/creature-metadata.json
```

**Input file** (`creature-metadata.json`):
```json
{
  "name": "Kamedor",
  "modifier": "Ancient",
  "baseMeaning": "Turtle",
  "element": "water",
  "archetype": "Tank/Healer",
  "visualTier": "rare",
  "attack": "Bite",
  "ultimate": "Harden",
  "descriptions": {
    "a": "Description A...",
    "b": "Description B...",
    "c": "Description C..."
  }
}
```

**Behavior:**
- Generates cyberpunk-styled HTML with 3-column card grid (rarity badges, element badges, images, description text, attack/ultimate labels)
- Writes HTML to `/tmp/creature-forge-{id}-preview.html`
- Images referenced by relative path (same `/tmp` directory as gen script output)
- Finds a free port dynamically (probes with `net.createServer`, not hardcoded 8787)
- Starts HTTP server on that port serving `/tmp`
- Outputs JSON to stdout: `{ "url": "http://localhost:8791/creature-forge-kamedor-preview.html", "pid": 12345 }`
- Server runs in foreground (Claude backgrounds it or kills by PID later)

**Cleanup flag:**
```bash
node scripts/creature-preview.mjs --cleanup --pid 12345
```

**Playwright tab handling** (in skill instructions, not script):
- Use `browser_tabs` → `new` if browser already has content
- Use `browser_navigate` if browser is fresh

## Component 3: `scripts/lib/jpdb-helpers.mjs`

**Purpose:** Importable helper functions for JPDB API integration. Granular building blocks, not an opinionated pipeline. Maximum flexibility — Claude composes these differently per session.

**Exports:**

```js
// Low-level API wrappers — these are the core primitives
export async function parseBatch(texts, apiKey, options)
// options: { tokenFields, vocabularyFields, batchSize }
// Handles: batch splitting, 1s delays, 429 retry
// Returns: raw JPDB parse response data

export async function lookupVocab(vidSidPairs, apiKey, fields)
// fields: array of field names (spelling, reading, frequency_rank, meanings, alt_spellings, etc.)
// Handles: batch splitting (max 500), 1s delays, 429 retry
// Returns: raw JPDB lookup response data

// Mid-level helpers
export async function vidVerify(spelling, expectedVid, apiKey)
// Parses a single spelling, checks if resolved vid matches expected
// Returns: boolean

export async function resolveCommonForms(words, apiKey)
// Convenience: full 3-step resolve (parse → lookup alt_spellings → vid-verify → pick lowest rank)
// Returns: [{ word, bestForm, reading, rank, allForms: [{spelling, rank}], meanings }]

// Pure utilities (no API calls)
export function tierFromRank(rank)
// Returns: "common" | "uncommon" | "rare" | "epic" | "legendary" | "rejected"

export function sleep(ms)
// Promise-based delay for rate limiting
```

**Built-in protections:**
- Automatic 1-second delays between consecutive API calls
- 429 detection → wait 60s → retry (once)
- Batch size enforcement (30 for parse, 500 for lookup)
- Auto-splits oversized batches transparently
- Structured error reporting per word

**Design principle:** Low-level primitives (`parseBatch`, `lookupVocab`) are the real value. `resolveCommonForms` is a convenience wrapper. Claude should be able to call any primitive directly with custom parameters for unusual lookup patterns (compound verb stripping, katakana-only resolution, etc.).

**Usage pattern** (what Claude writes per session — ~15 lines, not ~100):
```js
import { resolveCommonForms, tierFromRank } from './scripts/lib/jpdb-helpers.mjs';
import { readFile } from 'fs/promises';

const words = ['鋏', '切る', '挟む', '研ぐ'];
const apiKey = (await readFile('data/.jpdb-api-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(`${r.bestForm} (${r.reading}) — rank ${r.rank} [${tierFromRank(r.rank)}]`);
  console.log(`  meanings: ${JSON.stringify(r.meanings)}`);
  console.log(`  all forms: ${r.allForms.map(f => `${f.spelling}(${f.rank})`).join(', ')}`);
}
```

## Component 4: Skill File Updates

**SKILL.md changes:**

1. **Section 9 (Image Generation):** Replace ~150 lines of inline Python + HTML with ~20 lines invoking the two scripts:
   - Write descriptions JSON → run `creature-gemini-gen.mjs` → write metadata JSON → run `creature-preview.mjs` → navigate Playwright → screenshot

2. **JPDB sections:** Replace inline curl examples with guidance to import from `scripts/lib/jpdb-helpers.mjs`. Skill still explains WHAT to look up and WHEN; helpers handle HOW.

3. **Model reference fix:** Update `gemini-2.0-flash-preview-image-generation` to `gemini-2.5-flash-image` (the defunct model on line 475).

4. **Playwright tab guidance:** Add note about `browser_tabs` action `new` when browser is already open from a parallel session.

## Approval Flow (After Implementation)

**Before:** ~10-15 bash approvals per creature (curl calls, Python script, HTTP server, file copies)
**After:** ~3-5 approvals (write JSON inputs, run gen script, run preview script, copy selected image)

## File Inventory

| File | Type | Purpose |
|------|------|---------|
| `scripts/creature-gemini-gen.mjs` | New CLI script | Gemini image generation |
| `scripts/creature-preview.mjs` | New CLI script | HTML preview + HTTP server |
| `scripts/lib/jpdb-helpers.mjs` | New library | JPDB API helper functions |
| `.claude/skills/creature-forge/SKILL.md` | Edit | Update to use new scripts |

## Not In Scope

- ComfyUI sprite pipeline (`scripts/generate_creatures.py`) — separate workflow, already stable
- Discovery/thematic mode logic — skill handles this fine, just uses JPDB helpers
- Staging JSON save logic — simple enough that Claude handles it inline
- Background removal / sprite pipeline — separate future work
