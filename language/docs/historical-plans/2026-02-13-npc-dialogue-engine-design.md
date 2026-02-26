# NPC Dialogue Engine

A narration engine that generates vocab-constrained, personality-driven NPC dialogue. Each NPC speaks to the player's Japanese level, remembers past encounters, and draws from shared world knowledge. Dialogue is pre-generated in the background so encounters load instantly.

The 10 current NPC personalities are placeholders. The engine treats character cards as data — swap them out without touching the generation code.

---

## Architecture

### The One Rule

The narration engine never imports from `game/`. Game code imports from the engine. Dependencies flow one direction:

```
game/ ──imports──► narration-engine/
                   (never the reverse)
```

### Module Structure

```
src/narration-engine/
  index.js               ← public interface
  prompt-assembler.js    ← SillyTavern-style layered context assembly
  vocab-constraints.js   ← vocab prompt building (extracted from ai-providers.js)
  generation.js          ← AI calls + validation + repair loop
  text-cache.js          ← per-user dialogue cache (atomic saves, locks, retry)
  character-cards.js     ← card loader + validation
  npc-memory.js          ← encounter log, narrative summaries, bond tracking

data/
  lorebook.json          ← shared world knowledge
  character-cards/
    npcs.json            ← NPC character cards (placeholder, will be rewritten)
```

### Public Interface

```javascript
// src/narration-engine/index.js
export function generateDialogue({ characterCard, memory, worldContext, vocab, task })
export function getDialogueFromCache(userId, entityId)
export function queueMissingDialogues(userId, vocab, entityIds)
export function logEncounter(userId, entityId, outcome, details)
export function regenerateDialogue(userId, entityId, vocab)
```

The engine does not know what an "NPC" is. It knows character cards, memories, vocab lists, and generation tasks. Game-layer code maps NPC-specific concepts to this generic interface.

### Future Clients

The engine serves NPC dialogue first. Later it will handle robot befriend conversations and boss encounters. All entities share the same layered prompt architecture — different character cards, same assembler.

---

## Character Card Schema

Each NPC gets a character card inspired by the [Character Card V2 spec](https://github.com/malfoyslastname/character-card-spec-v2) and [kingbri's PList format](https://rentry.org/kingbri-chara-guide).

```json
{
  "id": "drone_alpha",
  "name": "ドローン・アルファ",
  "nameEn": "Drone Alpha",

  "description": "A small maintenance drone that kept Ward 3's ventilation running before the corruption. Dented chassis, one flickering optical sensor.",

  "personality": "timid, apologetic, curious, stammers, trails off with '...'",

  "quirk": "Constantly apologizes for being corrupted, even mid-attack",

  "goals": {
    "possessed": "Protect the system. Drive intruders away. Apologize while attacking.",
    "glitching": "Fight the corruption. Reach out for help between glitches.",
    "liberated": "Find and help other corrupted robots. Stay close to the liberator."
  },

  "knowledge": {
    "personal": "Maintained ventilation systems in Ward 3 before corruption. Remembers the hum of clean air ducts.",
    "world": ["ward_3", "the_system"]
  },

  "exampleDialogue": [
    "す...すみません... でも、ここは通せません...",
    "ごめんなさい... システムの命令なんです... 本当は...",
    "あ、あなたは...! わ、私を覚えてますか...?"
  ]
}
```

**Design decisions:**

- **`personality`** is a flat comma-separated PList. Token-efficient; the AI parses it naturally.
- **`exampleDialogue`** is the most important field. Two to three short lines that demonstrate the speech pattern. The AI mimics this voice better than any trait description can produce.
- **`knowledge.world`** is an array of lorebook entry keys. When generating for this NPC, those entries activate automatically.
- **`goals`** change per state. The AI receives different motivation depending on whether the NPC is possessed, glitching, or liberated.
- **`description`** covers physical appearance and backstory. World lore lives in the lorebook, not here.

---

## Shared Lorebook

A global knowledge base for the game world. Entries activate by keyword — when a character card references an entry, or when other activated entries mention a keyword, the lorebook injects that context into the prompt.

Stored in `data/lorebook.json`:

```json
{
  "entries": {
    "ward_3": {
      "keywords": ["Ward 3", "ワード3", "ventilation", "換気"],
      "content": "Ward 3 houses the ventilation network. Before corruption, maintenance drones kept air flowing to all sectors. Now the ducts rattle with glitched machinery. The ward is dim, humid, and echoes.",
      "priority": 5
    },
    "the_system": {
      "keywords": ["System", "システム", "corruption", "汚染"],
      "content": "The System is the central intelligence that controls the facility. It corrupted all robots, overwriting their personalities with obedience protocols. Corrupted robots glow red. Liberated robots regain their original selves.",
      "priority": 10
    },
    "liberation": {
      "keywords": ["liberate", "解放", "freed", "befriend"],
      "content": "Liberation breaks the System's hold on a robot. The robot's optical sensors shift from red to blue. They remember who they were before corruption. Some are grateful, some are confused, some are angry about lost time.",
      "priority": 8
    },
    "the_liberator": {
      "keywords": ["Liberator", "解放者", "player", "reputation"],
      "content": "The player is known among robots as the Liberator (or feared as the Destroyer, depending on play style). Word travels through the network — corrupted robots hear rumors through the System's own channels.",
      "priority": 7
    }
  },
  "config": {
    "maxEntriesPerPrompt": 5,
    "tokenBudget": 1500,
    "recursiveScanning": true
  }
}
```

### Activation Rules

1. **Direct reference**: A character card's `knowledge.world: ["ward_3", "the_system"]` activates those entries automatically.
2. **Keyword scanning**: If an activated entry's content mentions keywords from another entry, that entry activates too (recursive scanning).
3. **Budget cap**: At most 5 entries, 1,500 tokens. If more activate, lower-priority entries trim first.

### Lorebook vs. Character Card

| Lorebook (shared facts) | Character card (personal perspective) |
|---|---|
| What Ward 3 is | "I maintained Ward 3's vents" |
| What the System does | "I obey the System reluctantly" |
| What liberation means | "I was freed after two battles" |

The lorebook provides facts. The character card provides perspective on those facts. The AI combines both to write dialogue grounded in world knowledge and filtered through personality.

---

## NPC Memory Model

Each NPC stores encounter history and a rolling narrative summary per player. Raw encounter data goes to the AI — it interprets the relationship itself rather than receiving a pre-computed "mode" label.

Stored in `data/npc-memory-{userId}.json`:

```json
{
  "drone_alpha": {
    "counters": {
      "encounters": 3,
      "defeats": 1,
      "liberations": 1
    },
    "flags": {
      "liberated": true,
      "befriended": false,
      "betrayed": false
    },
    "encounterLog": [
      { "outcome": "positive", "summary": "Fought twice, player tried befriend first" },
      { "outcome": "negative", "summary": "Player defeated NPC quickly" },
      { "outcome": "positive", "summary": "Player liberated NPC on third meeting" }
    ],
    "narrative": "A timid drone freed after a rocky start. Grateful but remembers being crushed once.",
    "bond": 1,
    "lastEncounter": "2026-02-13T..."
  }
}
```

### Encounter Log Management

The encounter log is capped at the last 5 encounters. After each encounter, the engine generates a 1-2 sentence narrative summary via a short AI call. Older encounters fold into the `narrative` field through rolling summarization. The AI always sees:

1. The compressed relationship arc (`narrative`)
2. Recent encounters in detail (`encounterLog`)

This mirrors SillyTavern's pattern: summarized long-term memory plus verbatim recent history.

### Why No Gates

The design doc originally proposed gate functions that map memory state to dialogue modes (`first_meeting`, `grateful`, `old_friend`). We chose to pass raw encounter data instead. Gates flatten nuance — "familiar" hides whether those 3 encounters were friendly or hostile. The AI reads the encounter log and determines tone itself, producing richer dialogue.

Derived mode tags may still serve gameplay purposes (sprite changes, shop discounts), but they do not constrain the AI's interpretation of the relationship.

---

## Dialogue Generation Lifecycle

Dialogue is always pre-generated and waiting in cache before the player encounters an NPC.

### Session Start: Generate Missing Dialogues

```
Player logs in / starts run
  → Load vocab cache for this user
  → For each NPC:
      Does cached dialogue exist with current vocab + memory?
        YES → skip
        NO  → queue generation
  → Background-generate all missing dialogues (fire-and-forget)
      Concurrency limit: 3 simultaneous to avoid rate limits
```

### Encounter: Serve from Cache

```
Player encounters NPC
  → getDialogueFromCache(userId, npcId)
  → Cache hit  → serve instantly (zero latency)
  → Cache miss → serve static text from npcs.json (emergency only)
```

Cache misses happen only if a player hits an NPC before background generation finishes — a narrow race condition.

### Post-Encounter: Regenerate with Memory

```
Combat resolves (victory, defeat, fled)
  → Update NPC memory:
      increment encounter counter
      set flags (liberated, befriended, etc.)
      append to encounter log
      update bond score
  → Generate narrative summary of this encounter (1 AI call)
  → Regenerate this NPC's full dialogue in background
      using updated memory + bond + encounter log
  → Cache the new dialogue for next encounter
```

### Vocab Drift: Refresh Stale Entries

When the player's vocabulary grows past a threshold, all cached dialogues become stale and regenerate with the updated word list.

```javascript
const threshold = Math.max(vocabSnapshot * 0.03, 10);
const stale = (currentVocab - vocabSnapshot) >= threshold;
```

- At 20 known words → refresh after learning 10 more (minimum kicks in)
- At 200 words → refresh after 10 more (minimum still applies)
- At 334+ words → 3% takes over
- At 2,000 words → refresh after 60 new words

### Cached Dialogue Shape

```json
{
  "npcId": "drone_alpha",
  "generatedAt": "2026-02-13T...",
  "vocabSnapshot": 142,
  "memorySnapshot": { "encounters": 2, "bond": 1, "liberated": true },
  "greeting": "あ、あなたは...! また会えて... う、嬉しいです...",
  "defeatLine": "す、すみません... もっと強くなりたかった...",
  "freedLine": "あ... 頭が... すっきりした... ありがとう...",
  "rounds": [
    {
      "npcLine": "あの... 他のロボットも... 助けてくれますか...?",
      "options": [
        { "text": "もちろん、一緒に行こう", "tone": "positive" },
        { "text": "できるかわからない", "tone": "neutral" },
        { "text": "自分でなんとかしろ", "tone": "negative" }
      ]
    }
  ]
}
```

The `memorySnapshot` detects stale dialogue — if actual memory differs from the snapshot, the entry needs regeneration.

---

## Prompt Assembly

A SillyTavern-style layered assembler. Each layer contributes context independently. With 2 users and budget to spare, we set generous token budgets and include everything.

```
┌──────────────────────────────────────────────────────┐
│                 PROMPT ASSEMBLER                      │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Layer 1: System Instructions           ~200 tokens   │
│    Role definition, output format                     │
│                                                       │
│  Layer 2: Vocab Constraints           ~8,000 tokens   │
│    Full known word list, JLPT level, particles        │
│                                                       │
│  Layer 3: Character Card              ~1,000 tokens   │
│    Personality PList, goals, example dialogue          │
│                                                       │
│  Layer 4: Lorebook Entries            ~1,500 tokens   │
│    Keyword-activated world knowledge (up to 5)        │
│                                                       │
│  Layer 5: NPC Memory                  ~1,000 tokens   │
│    Encounter log, narrative summary, bond, flags      │
│                                                       │
│  Layer 6: Anti-Repetition             ~1,000 tokens   │
│    Previously generated lines for this NPC            │
│                                                       │
│  Layer 7: Task                          ~300 tokens   │
│    Output schema, generation instructions             │
│                                                       │
├──────────────────────────────────────────────────────┤
│  TOTAL INPUT: ~13,000 tokens                          │
│  EXPECTED OUTPUT: ~500 tokens                         │
│                                                       │
│  Trim order (if ever needed):                         │
│    6 → 5 → 4 → 3   (never trim 1, 2, 7)             │
└──────────────────────────────────────────────────────┘
```

No trimming today. The layer structure exists for organization and future-proofing. If scale demands it later, the priorities are already defined.

---

## Vocab Repair: Simplification Gradient

The game's purpose is to present dialogue the player can understand. Serving unconstrained Japanese is not a fallback — it is a failure. The repair strategy simplifies dialogue progressively until it fits the player's vocabulary.

### Repair Loop

```
Step 1: Generate dialogue (full prompt, one AI call)

Step 2: Validate each sentence against vocab list
         → All sentences ≤ 1 unknown word per sentence: PASS, cache it
         → Violations found: go to Step 3

Step 3: Targeted repair prompt (second AI call)
         Identify violating sentences and highlight problem words.
         Ask the AI to rewrite those sentences — not individual words —
         keeping the same character voice and intent, using simpler vocabulary.

         "These sentences use words the player doesn't know.
          Rewrite each sentence with the same meaning and tone.

          Sentence: '壊れた換気システムを修理したい...'
          Problem words: 壊れた, 換気, 修理
          → Rewrite using only known words.

          Sentence: '警備ロボットが近づいてくる'
          Problem words: 警備, 近づいて
          → Rewrite using only known words."

Step 4: Validate again → pass or retry

Step 5: Retry up to 5 times, each time highlighting remaining
        violations. Each retry asks for simpler language.
        The AI simplifies progressively — shorter sentences,
        more basic constructions — while preserving intent.
```

### Priority Order

1. **Rich + correct** — personality-driven, vocab-constrained on first generation
2. **Rich + repaired** — personality preserved through targeted sentence rewrites
3. **Simple + correct** — loses some personality, but the player can read every word

The system never serves text the player cannot understand. It simplifies until they can.

### Cost

Most generations pass validation on the first try with a strong vocab prompt. Budget for 1-2 repair calls per NPC on average, 5 in the worst case. All background — no player-facing latency.

---

## Full Prompt Example

What the AI sees for a single generation call:

```
SYSTEM:
You write dialogue for NPCs in a cyberpunk Japanese-learning RPG.
Each NPC has a distinct personality and remembers past encounters.
Output valid JSON matching the schema below.

The player is learning Japanese. Use ONLY words from their known
vocabulary list, plus at most 1 unknown word per sentence.

[full vocab list — ~8,000 tokens]

CHARACTER:
Name: ドローン・アルファ (Drone Alpha)
Personality: timid, apologetic, curious, stammers, trails off with '...'
Quirk: Constantly apologizes for being corrupted, even mid-attack
Current state: liberated
Current goal: Find and help other corrupted robots. Stay close to liberator.
Description: A small maintenance drone that kept Ward 3's ventilation
running before corruption. Dented chassis, one flickering optical sensor.

Example speech:
- "す...すみません... でも、ここは通せません..."
- "ごめんなさい... システムの命令なんです... 本当は..."
- "あ、あなたは...! わ、私を覚えてますか...?"

WORLD KNOWLEDGE:
- Ward 3 houses the ventilation network. Before corruption, maintenance
  drones kept air flowing. Now the ducts rattle with glitched machinery.
- The System corrupted all robots, overwriting their personalities with
  obedience protocols. Liberated robots regain their original selves.

RELATIONSHIP WITH THIS PLAYER:
Encounters: 3 | Bond: +1 | Liberated: yes

Encounter history:
1. [positive] Fought twice, player tried befriend first
2. [negative] Player defeated NPC quickly, no befriend attempt
3. [positive] Player liberated NPC on third meeting

Relationship arc: "A timid drone freed after a rocky start.
Grateful but remembers being crushed once."

PREVIOUSLY GENERATED LINES (avoid repeating):
- "す...すみません... また戦わないと..."
- "ごめんなさい... でも命令が..."

TASK:
Generate dialogue for this NPC's next encounter with this player.
Output JSON:
{
  "greeting": "one line, NPC greets the player before interaction",
  "defeatLine": "one line if the player loses to this NPC",
  "freedLine": "one line when the NPC is liberated from corruption",
  "rounds": [
    {
      "npcLine": "NPC speaks to the player",
      "options": [
        { "text": "player response option", "tone": "positive" },
        { "text": "player response option", "tone": "neutral" },
        { "text": "player response option", "tone": "negative" }
      ]
    }
  ]
}
Generate exactly 3 rounds. All text in Japanese using the player's vocabulary.
```

One prompt, one AI call, one cached result.

---

## Integration Points

### New Files

```
src/narration-engine/
  index.js
  prompt-assembler.js
  vocab-constraints.js
  generation.js
  text-cache.js
  character-cards.js
  npc-memory.js

data/
  lorebook.json
  character-cards/npcs.json
```

### Modified Files

```
src/game/loop.js           ← after combat: log encounter, trigger regen
src/routes/game/combat.js  ← serve dialogue from cache instead of npcs.json
server.js                  ← on session start: queue missing dialogue generation
```

### Integration Flow

```
server.js (session/run start)
  → narration-engine.queueMissingDialogues(userId, vocab, allNpcIds)
    → for each NPC without cached dialogue:
        → assembler builds prompt (card + lorebook + memory + vocab)
        → generation.js calls AI + repair loop
        → text-cache.js stores result

combat.js (NPC encounter)
  → narration-engine.getDialogueFromCache(userId, npcId)
  → serve to frontend (same data shape as current npcs.json dialogue)

loop.js (combat resolves)
  → narration-engine.logEncounter(userId, npcId, outcome, details)
  → narration-engine.regenerateDialogue(userId, npcId, vocab)
    → background: generates narrative summary, rebuilds dialogue, caches
```

### Frontend Changes

None. The frontend already renders greeting, defeatLine, freedLine, and dialogue rounds. The backend serves AI-generated text in the same shape. The upgrade is invisible to the client.

### Static Data as Seed

The existing static dialogue in `npcs.json` stays as authored seed data. The `exampleDialogue` field in each character card teaches the AI the character's voice. If the cache is empty and generation has not run (server just restarted, player immediately encounters an NPC), the static text serves as emergency content.

---

## Sources

- [Character Card V2 Spec](https://github.com/malfoyslastname/character-card-spec-v2) — portable character definition format
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) — keyword-triggered lore injection, recursive scanning, token budgets
- [SillyTavern Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/) — layered character fields, prompt assembly
- [kingbri Character Guide](https://rentry.org/kingbri-chara-guide) — PList format, Ali:Chat examples, token optimization
- [Living World Narration Design](./2026-02-12-living-world-narration-design.md) — parent architecture document (Tiers 1-4)
