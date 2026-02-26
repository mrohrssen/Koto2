# Befriend Dialogue System: Audit & Findings

**Date:** 2026-02-20
**Trigger:** Production befriend attempt took 44.5 seconds (OpenAI provider)

## The Problem

When a player clicks "befriend" in combat, the server calls `POST /api/game/befriend-conversation`. This endpoint is supposed to look up pre-generated dialogue from a per-user cache file, but **no cache file has ever been successfully written**. Every befriend attempt falls through to live AI generation — a 30-45 second round-trip on OpenAI.

## Root Cause

The batch pre-generation system (`generateMissingDialogues` in `befriend-dialogue-service.js`) **aborts the entire batch on the first creature failure**. Since it processes 37 creatures sequentially, one bad AI response kills the whole run and no cache file is written.

The system *is* triggered on run start (fire-and-forget from `run.js:queueBackgroundDialogues`), but silently fails every time.

## How NPC Dialogue Works (the model to follow)

The NPC dialogue system (`src/narration-engine/`) handles the same problem correctly:

| Aspect | NPC System | Befriend System |
|--------|-----------|-----------------|
| **Cache file** | `data/npc-dialogue-cache-{userId}.json` | `data/befriend-{userId}.json` (never written) |
| **Failure handling** | `Promise.allSettled` — skip failures, save successes | Abort entire batch on first failure |
| **Concurrency** | 3 simultaneous AI calls | Sequential (1 at a time) |
| **Staleness detection** | Yes — vocab grows 3%+ or NPC memory changes → regenerate | None — once "ready", cached forever |
| **Vocab snapshot** | Saves `vocabSnapshot` count at generation time | Not saved |
| **Cache structure** | Per-NPC entries with greeting, rounds, defeatLine, freedLine, vocabSnapshot, memorySnapshot | Per-robot entries with status, rounds, generatedAt |

### NPC staleness logic (`text-cache.js:isStale`)
- Regenerates when player's vocab count grows 3%+ past the snapshot (min 10 words)
- Regenerates when NPC memory changes (encounter count, bond level, liberated status)
- This keeps dialogue fresh and maintains i+1 compliance as players learn

### NPC batch generation (`narration-engine/index.js:queueMissingDialogues`)
- Loads all NPC character cards
- Filters to stale/missing entries
- Processes in batches of 3 with `Promise.allSettled`
- Each success is cached individually; failures are skipped

## What's Broken in Befriend (5 issues)

### 1. Abort-on-first-failure kills the batch
`befriend-dialogue-service.js:265-274` — if `generateWithRetry` returns null for any creature, the function returns `{ aborted: true }` immediately. No cache file is written for the creatures that *did* succeed earlier in the loop.

### 2. No vocab staleness tracking
The cache entry stores `{ status, rounds, generatedAt }` but no `vocabSnapshot`. Even if the cache worked, dialogue generated when a player knew 50 words would never refresh when they know 500. The i+1 constraint would drift — old dialogues would be too easy, using only words the player already mastered.

### 3. Sequential processing is slow
37 creatures x ~10-15s each = 6-9 minutes to generate the full set. NPC system does 3 concurrent calls, cutting wall time by ~3x.

### 4. Static fallback file is stale
`data/befriend-conversations.json` uses old creature IDs (`petalia`, `whiskit`) that no longer exist in `creatures.json`. When the on-the-fly AI generation also fails, the ultimate fallback `getStaticConversation()` in `robot-combat-service.js` returns hardcoded generic dialogue — not i+1 compliant.

### 5. Two separate generation code paths
- `befriend-dialogue-service.js:generateOneRobotDialogue` — used by the batch system
- `robot-combat-service.js:generateBefriendConversation` — used by the on-the-fly fallback

Both do the same thing (call AI with `DM_PROMPTS.befriendConversation`, parse JSON, validate). The route handler in `combat.js:241-315` checks the cache first, then falls back to the second function. These should be unified.

## Architecture Question

The befriend dialogue service was built as a separate system from the NPC narration engine, but they solve the same problem: "pre-generate per-user AI dialogue, cache it, regenerate when stale." The key differences:

- **NPC dialogue** has richer structure (greeting, multiple rounds, defeat/freed lines, memory integration)
- **Befriend dialogue** is simpler (3 rounds of speaker + 3 options + correctIndex)

Options:
1. **Fix befriend as a standalone system** — add staleness, fix batch resilience, add concurrency. Keep it separate.
2. **Absorb befriend into the narration engine** — treat creatures as "entities" alongside NPCs, using the same TextCache, staleness, and batch infrastructure. The narration engine already has the pattern; befriend would just need a different prompt template and response shape.

## File Map

```
src/game/services/befriend-dialogue-service.js   # Broken batch system (this audit)
src/game/services/robot-combat-service.js:621-658 # Duplicate on-the-fly generation
src/game/services/robot-combat-service.js:761-790 # Static fallback (stale IDs)
src/routes/game/combat.js:241-315                 # Route: cache lookup → on-the-fly fallback
src/routes/game/run.js:49-78                      # Trigger: fire-and-forget on run start
src/narration-engine/index.js:62-98               # NPC batch generation (the working model)
src/narration-engine/text-cache.js                # NPC cache with staleness detection
src/narration-engine/vocab-constraints.js:29-32   # isVocabStale (3% threshold)
data/befriend-conversations.json                  # Static fallback (stale creature IDs)
data/creatures.json                               # 37 creatures
```
