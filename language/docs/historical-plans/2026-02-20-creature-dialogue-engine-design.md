# Creature Dialogue Engine: Absorb Befriend into Narration Engine

**Date:** 2026-02-20
**Trigger:** [Befriend Dialogue Audit](2026-02-20-befriend-dialogue-audit.md) — cache never written, no vocab repair, 5 bugs
**Approach:** Make the narration engine entity-type-aware; delete befriend-dialogue-service.js entirely

## Problem

The befriend dialogue system is a broken parallel implementation of the narration engine. It has no vocab repair (i+1 violation), aborts entire batches on first failure, has no staleness detection, processes sequentially (6-9 min for 37 creatures), and maintains two duplicate generation code paths. The narration engine already solves all these problems for NPC dialogue.

## Design

### Entity Type System

The narration engine becomes a generic entity dialogue engine supporting multiple entity types. Each type provides its own prompt template, response validator, and string extractor. Shared infrastructure (TextCache, batch generation, vocab repair, staleness) is reused.

```
src/narration-engine/
  index.js                    # Generic — accepts entityType param on public functions
  text-cache.js               # Generic — cache file becomes type-prefixed
  dialogue-repair.js          # extractDialogueStrings dispatches to type-specific extractor
  generation.js               # validateDialogueShape dispatches to type-specific validator
  entity-types/
    npc.js                    # NPC prompt, validator, string extractor (extracted from current code)
    creature.js               # Befriend prompt, validator, string extractor (new)
  character-cards.js           # Loads by type: data/character-cards/{type}.json
  prompt-assembler.js          # Shared layers + type-specific dispatch
  npc-memory.js               # Unchanged (generic, works for creatures too)
  vocab-constraints.js         # Unchanged
  lorebook.js                  # Unchanged
```

### Entity Type Interface

Each entity type module (`entity-types/npc.js`, `entity-types/creature.js`) exports:

```js
export const REQUIRED_CARD_FIELDS = ['id', 'name', 'nameEn', 'personality'];
export function validateDialogueShape(obj)    // → { valid, errors }
export function extractDialogueStrings(dialogue)  // → [{ path, text }]
export function buildRepairInstruction(violations) // → string
export function assemblePrompt({ characterCard, vocabWords, jlptLevel, memory, previousLines })
  // → { systemBlocks, userPrompt }
```

### Creature Character Cards

File: `data/character-cards/creatures.json`

Generated once by AI (Opus subagents) from `data/creatures.json`. Future creatures get cards at forge time.

```json
{
  "kamedor": {
    "id": "kamedor",
    "name": "カメドル",
    "nameEn": "Kamedor",
    "element": "water",
    "personality": "Patient and steady. Speaks slowly, choosing words carefully.",
    "quirk": "Always mentions water or shells in conversation",
    "description": "An ancient turtle creature with a crystalline shell",
    "exampleDialogue": ["ゆっくり行こう。", "水の中は気持ちいい。"],
    "archetype": "Tank/Healer"
  }
}
```

No `goals` (creatures don't have possessed/glitching/liberated states). No `knowledge.world` (no lorebook). Added `element` and `archetype` for prompt flavoring.

### Befriend Dialogue Shape (Unchanged)

```json
{
  "rounds": [
    {
      "speaker": "creature's line in Japanese",
      "options": ["option A", "option B", "option C"],
      "correctIndex": 0
    }
  ]
}
```

3 rounds. Each round: `speaker` (string), `options` (3 strings), `correctIndex` (0-2). Vocab repair validates all 12 Japanese text fields (3 speakers + 9 options).

### Creature Prompt Template

Layers:
1. **Instructions** (cached): i+1 rules, "you are a wild creature the player wants to befriend"
2. **Vocab constraints** (cached): Full vocabulary list (shared with NPC)
3. **Character card** (uncached): Creature personality, element, quirk, example dialogue
4. **Memory** (uncached): Befriend attempt count
5. **Anti-repetition** (uncached): Previously generated speaker lines
6. **Task/user prompt**: Befriend quiz JSON schema

No lorebook layer (creatures don't activate world knowledge entries).

### Creature Memory

Uses existing `NpcMemory` class (already generic). Separate file: `data/creature-memory-{userId}.json`.

Tracked fields:
- `counters.befriendAttempts` — incremented each befriend conversation start
- `flags.befriended` — set true on successful capture

Staleness triggers:
- `befriendAttempts` changes (player tried and failed → fresh dialogue next time)
- Vocab grows 3%+ (standard threshold from `vocab-constraints.js`)

### Cache

File: `data/creature-dialogue-cache-{userId}.json`

Per-creature entries with `vocabSnapshot` and `memorySnapshot` (befriendAttempts count).

### API Changes

All public functions in `index.js` gain `entityType` parameter (default `'npc'`):

```js
getDialogueFromCache(userId, entityId, entityType = 'npc')
queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, entityType = 'npc')
regenerateDialogue(userId, entityId, chatFn, aiConfig, vocabContext, entityType = 'npc')
logEncounter(userId, entityId, outcome, summary, entityType = 'npc')
setMemoryFlag(userId, entityId, flag, value, entityType = 'npc')
```

### Route Changes

**`combat.js` — `POST /befriend-conversation`:**
- Replace: `getDialogueForRobot(userId, robotId)` → `getDialogueFromCache(userId, creatureId, 'creature')`
- Replace: `generateBefriendConversationFn()` fallback → `regenerateDialogue(userId, creatureId, ..., 'creature')`
- Remove: separate `triggerDialogueRegen` function

**`run.js` — `queueBackgroundDialogues`:**
- Replace: `generateMissingDialoguesFn(userId, aiConfig, vocabulary)` → `queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, 'creature')`

### Deletions

- `src/game/services/befriend-dialogue-service.js` — entire file
- `robot-combat-service.js` lines 621-658 — duplicate `generateBefriendConversation`
- `robot-combat-service.js` lines 761-790 — stale static fallback `getStaticConversation`
- `data/befriend-conversations.json` — stale static file with old creature IDs

### Bugs Fixed

All 5 from the audit:
1. **Abort-on-first-failure** → `Promise.allSettled` (inherited from narration engine)
2. **No vocab staleness** → `vocabSnapshot` + 3% threshold (inherited)
3. **Sequential processing** → Concurrency 3 (inherited)
4. **Stale static fallback** → Deleted; cache miss triggers on-demand generation with vocab repair
5. **Duplicate code paths** → Single code path through narration engine
