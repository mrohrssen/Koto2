# Living World Narration System

A four-tier architecture for vocab-personalized, memory-driven NPC dialogue. Every robot in the game speaks to the player's Japanese level, remembers past encounters, and reacts to the player's reputation across the world.

---

## Build vs Buy Decision

We evaluated four commercial platforms: [Neocortex](https://docs.neocortex.link), [Inworld AI](https://inworld.ai/), [Charisma.ai](https://docs.charisma.ai/), and [Convai](https://www.convai.com/). All solve real-time conversational NPC AI. None support vocabulary-constrained generation, JPDB integration, or the i+1 learning principle.

We also studied [SillyTavern](https://docs.sillytavern.app/), the open-source roleplay frontend with the most mature memory and context management system in the community.

**Verdict: build in-house.** The vocab constraint is the core pedagogical feature and requires full control over the generation prompt. No platform exposes this. However, we borrow architectural patterns from all five systems (detailed below).

### What already exists in the codebase

| System | Location | What it does |
|--------|----------|-------------|
| Multi-provider AI | `src/ai-providers.js` | Routes to OpenAI, Claude, Gemini, OpenRouter with vocab-constrained system prompts |
| Vocab repair | `src/game/vocab-repair.js` | Post-generation enforcement of i+1 (max 1 unknown word per sentence) |
| Befriend dialogue cache | `src/game/services/befriend-dialogue-service.js` | Per-user file cache with atomic saves, retry, locking, rollback |
| Door hint service | `src/game/services/door-hint-service.js` | Seed phrase + AI remix pattern with vocab constraints |
| Narration generation | `src/game/dm.js` | Event-driven narration with memory, lorebook, and sample-based prompting |

The befriend dialogue service provides the caching pattern. The door hint service provides the seed-and-remix pattern. The narration system provides the prompt architecture. Tiers 1-4 extend these systems; they don't replace them.

---

## Separation Strategy: Module Now, Service Later

The narration engine serves multiple future games and a potential Unity rebuild. But with 2 players today, a separate repo and deployment adds pain without benefit. We follow the standard practice: **build a well-isolated module inside the monolith, extract when a second client needs it.**

### Module Structure

```
src/
  narration-engine/              ← the future service, isolated NOW
    index.js                     ← clean public interface
    prompt-assembler.js          ← layered context + token budgets
    text-cache.js                ← per-user caching (befriend pattern)
    npc-memory.js                ← typed memories, gates (Tier 3)
    character-cards.js           ← card loader
    vocab-constraints.js         ← i+1 prompt building
    generation.js                ← LLM calls via injected provider
  game/                          ← game logic, unchanged
    ...
```

### The One Rule

**The narration engine never imports from `game/`.** Game-specific code (event hooks, route handlers) imports from the engine, never the reverse. Dependencies flow one direction:

```
game/ ──imports──► narration-engine/
                   (never the reverse)
```

### Public Interface

```javascript
// src/narration-engine/index.js
export function generateDialogue({ characterCard, memory, worldContext, vocab, task }) { ... }
export function logInteraction(userId, npcId, event) { ... }
export function getTextFromCache(userId, entryKey) { ... }
export function refreshStaleEntries(userId, vocab) { ... }
```

### Future Extraction Path

When a second game client (Unity, another web game) needs the engine:

1. Move `src/narration-engine/` to its own repo
2. Put Express/Fastify routes in front of the exported functions
3. Point the game at `http://narration-service/` instead of importing directly
4. Add auth between services, rate limiting, and a real database (replace JSON files)

This is a weekend of work, not a rewrite. The clean boundary makes extraction mechanical.

### Scaling Lessons from Industry

Research into [Death by AI](https://inworld.ai/blog/how-inworld-helped-the-ai-game-death-by-ai-with-20-million-players-reach-profitability) (20M players), [Roblox](https://about.roblox.com/engineering/infrastructure) (70M DAU, 2,000+ services), and [general game AI infrastructure](https://series.inc/scalable-ai-infrastructure-for-live-games/) surfaced patterns relevant to our eventual scale-out:

- **Model cascading**: Use cheap, fast models (Haiku) for 90% of dialogue; reserve expensive models (Sonnet/Opus) for boss encounters or narratively complex moments. Build this into the prompt assembler from day one.
- **Cost as a design constraint**: Death by AI's costs went from $5K to $250K/day in two weeks. Our pre-generation + caching architecture avoids this — we generate offline, not in the hot path.
- **Stateless services scale horizontally**: When we extract, the service should be stateless. State (caches, memories) lives in a database, not in-process. Our current JSON files migrate to Redis/Postgres at that point.
- **Pre-generation beats real-time**: "You can't pre-cache what doesn't exist until the instant it's needed" — but we *can*, because our text is tied to vocab state, not real-time conversation. This is our architectural advantage over every platform we evaluated.

None of these require action today. They inform the module's interface design so extraction stays clean.

---

## Stolen Patterns

### From Convai: Hierarchical Memory (Mimir)

[Technical overview](https://convai.com/blog/long-term-memory---a-technical-overview)

Five memory tiers, each more compressed than the last:

| Tier | Content | Retention |
|------|---------|-----------|
| Scene awareness | Current room, visible entities | Per-request |
| Short-term | Last 3-5 NPC lines, verbatim | Per-encounter |
| Medium-term | LLM-summarized encounter segments | Per-NPC |
| Long-term | Merged similar medium-term memories | Permanent |
| Working memory | Combined prompt (all layers) | Per-generation |

Key technique: each memory gets an **importance score (1-10)** via LLM extraction. Retrieval uses `0.5 * semantic_score + 0.5 * keyword_score` with recency bias (Gaussian decay).

**We adopt:** Importance scoring and rolling summarization. After each encounter, generate a 1-2 sentence summary. After N encounters with the same NPC, summarize the summaries into a relationship arc.

### From Charisma: Typed Memories + Gates

[Memory docs](https://docs.charisma.ai/memories-gates)

Not all memories are the same shape:

- **Counter memories** — encounters: 3, defeats: 1
- **Flag memories** — liberated: true, befriended: false
- **Decision memories** — "player chose to spare rather than defeat"
- **Word memories** — player's name, favorite chip type

**Gates** route dialogue based on memory conditions: "If `liberated == true` AND `encounters > 2`, use `old_friend` template."

**We adopt:** Typed memory entries per NPC. Gates select which personality mode to feed the prompt.

### From Inworld: Character Brain Components

[Character brain blog](https://inworld.ai/blog/improved-character-brain)

Four interacting layers define each NPC:

1. **Personality** — traits, speech style
2. **Goals** — what the NPC wants right now (changes based on state)
3. **Knowledge** — world facts vs personal facts (different confidence levels)
4. **Memory** — what the NPC remembers about the player

**We adopt:** Goals per NPC state. A corrupted sentinel's goal is "stop intruders." A liberated drone's goal is "find others to help." Goals give the AI something to drive toward, not just react from.

### From SillyTavern: Layered Context Assembly

[Context and memory architecture](https://deepwiki.com/SillyTavern/SillyTavern/6-context-and-memory-systems)

SillyTavern's core insight: **five independent context layers, each with its own token budget, assembled by a Prompt Manager.**

1. **Character card** — personality, goals, system prompt
2. **World Info** — keyword-triggered lore fragments (activate only when relevant)
3. **Vector recall** — semantically similar past messages retrieved via RAG
4. **Summarized memory** — compressed history of old interactions
5. **Recent chat** — last N messages verbatim

Each layer has a priority. When context gets tight, lower-priority layers are trimmed first. Layers are independent — adding one never breaks another.

**We adopt:** The full layered assembly pattern. Each tier adds context layers without changing the ones below. Token budgets prevent prompt bloat.

### From SillyTavern: Keyword-Triggered Lore Injection

[World Info docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)

World Info entries activate when their keywords appear in the current context:

- **Sticky duration** — entry stays active for N more messages after triggering
- **Cooldown** — minimum messages before re-activation
- **Recursive scanning** — activated entries can trigger other entries via their content

**We adopt:** NPC memories and world lore activate only when relevant. When generating dialogue for Drone Alpha, its memory activates. If that memory mentions Sentinel 9 by name, Sentinel 9's lore activates too. Cross-referencing without bloat.

---

## Tier 1: Vocab-Personalized Text Cache

**Player experience:** Every line of flavor text uses words the player knows. Enemy dialogue, chip descriptions, item descriptions — all rewritten for their level. Text feels fresh after learning new words because seen entries regenerate with updated vocab.

### Data Structure

```
data/text-cache-{userId}.json
```

```json
{
  "version": 1,
  "generatedAt": "2026-02-12T...",
  "vocabSnapshot": 142,
  "entries": {
    "enemy.drone_alpha.possessed.0": {
      "text": "システムに従え...",
      "seed": "Obey the system...",
      "seen": false,
      "category": "dialogue",
      "generatedWithVocab": 142
    },
    "chip.firewall.description": {
      "text": "ファイアウォールは...",
      "seed": "Blocks incoming damage for one turn",
      "seen": false,
      "category": "description",
      "generatedWithVocab": 142
    }
  }
}
```

### Categories and Refresh Rules

| Category | Type | Count | Refresh when... |
|----------|------|-------|-----------------|
| Enemy dialogue (possessed/glitching/liberated) | dialogue | ~840 | Every time seen |
| Combat end narration (victory/defeat) | dialogue | ~10 | Every time seen |
| Door hints (Chippy) | dialogue | ~100 | Every time seen |
| Chip descriptions | description | ~128 | Vocab drifts 20+ words |
| Item descriptions | description | ~92 | Vocab drifts 20+ words |
| Robot descriptions | description | ~46 | Vocab drifts 20+ words |
| Ward/floor descriptions | description | ~45 | Vocab drifts 20+ words |

**Total: ~1,250 entries per user.**

### Lifecycle

1. **First run / empty cache:** Batch-generate all entries using the player's current vocab. Use existing `ai-providers.chat()` with `buildSystemPrompt()` for vocab constraints.
2. **Serve:** Pull from cache instantly — zero AI latency.
3. **Mark seen:** After displaying text, set `seen: true`.
4. **Background refresh:** On run start, find stale entries (dialogue: `seen == true`; descriptions: vocab drift > threshold). Regenerate with updated vocab. Fire-and-forget, same pattern as `generateMissingDialogues()`.
5. **Fallback:** If cache miss, serve the original hardcoded text.

### Generation Prompt (Tier 1)

```
System: You rewrite game text using only the player's known Japanese vocabulary.
        Preserve the meaning and tone of the original.
        [vocab constraints from buildSystemPrompt()]

User:   Rewrite this line for a player who knows 142 words:
        Original: "Obey the system or be deleted."
        Context: Enemy dialogue, possessed state, aggressive tone.
```

### Cost

~1,250 AI calls per new user at initial generation. At Haiku pricing: ~$0.10-0.30 per user. Incremental refreshes cost less (only stale entries).

### What to Build

- `src/narration-engine/text-cache.js` — cache CRUD, atomic saves (copy befriend pattern)
- `src/narration-engine/generation.js` — generation prompts per category
- `src/narration-engine/vocab-constraints.js` — extract vocab prompt building from ai-providers
- `src/narration-engine/index.js` — public interface (`getTextFromCache`, `refreshStaleEntries`)
- Backend enrichment in `server.js`: inject cached text into API responses before sending to frontend
- Background refresh trigger on run start
- Remove wasted narration calls (`runStart`, `floorEnter`, `encounterStart` per the original overhaul doc)

---

## Tier 2: Personality-Driven NPCs

**Player experience:** Each robot has a distinct voice. The shy drone stammers. The corrupted sentinel barks orders. The philosophical archive bot speaks in riddles. Encounters with the same enemy produce new dialogue that still sounds like *them*.

### NPC Character Card

Extend `enemies.json` and `robots.json` with personality blocks inspired by the [Character Card V2 spec](https://github.com/malfoyslastname/character-card-spec-v2):

```json
{
  "id": "drone_alpha",
  "name": "ドローン・アルファ",
  "nameEn": "Drone Alpha",
  "personality": {
    "traits": ["timid", "apologetic", "curious"],
    "speechStyle": "Short stuttering sentences, trailing off with '...'",
    "quirk": "Constantly apologizes for being corrupted",
    "voice": "Soft, glitchy, with static interruptions"
  },
  "goals": {
    "possessed": "Protect the system. Drive intruders away. Apologize while attacking.",
    "glitching": "Fight the corruption. Reach out for help between glitches.",
    "liberated": "Find and help other corrupted robots. Stay close to the liberator."
  },
  "knowledge": {
    "personal": "Maintained ventilation systems in Ward 3 before corruption.",
    "world": "Knows the layout of Ward 3. Heard rumors about the System's core."
  }
}
```

### Generation Shift

Tier 1 rewrites a seed. Tier 2 **authors original lines** from the character card:

```
System: You write dialogue for NPCs in a cyberpunk game.
        Each NPC has a distinct personality and goals.
        Use only the player's known Japanese vocabulary.
        [vocab constraints]

User:   Generate a line of dialogue for this character:
        Name: Drone Alpha
        State: possessed
        Personality: timid, apologetic, curious
        Speech style: Short stuttering sentences, trailing off with '...'
        Goal: Protect the system. Drive intruders away. Apologize while attacking.
        Quirk: Constantly apologizes for being corrupted

        The line should feel different from these previously generated lines:
        - "す...すみません... でも、ここは..."
        - "ごめんなさい... システムの命令..."
```

The seed from Tier 1 becomes a **tone anchor** — included as a reference, not a script. The AI produces original dialogue shaped by the character card.

### Refresh Produces Variety

When a line is marked seen, regeneration produces a *new* line from the same personality — not a vocab-updated copy. The "previously generated lines" list prevents repetition. Over multiple encounters, each NPC builds a body of unique dialogue.

### Cost

Same call count as Tier 1. Personality profiles are prompt context, not extra calls. Richer prompts add ~200 tokens per call.

### What to Build

- `src/narration-engine/character-cards.js` — card loader and schema validation
- Character card data in `data/character-cards/` (one JSON per NPC or bundled)
- `src/narration-engine/prompt-assembler.js` — layered prompt assembly with token budgets
- Updated generation prompts that take personality + state + goals + previous lines
- "Previously seen" tracking to prevent repetition across regenerations

---

## Tier 3: NPCs That Remember You

**Player experience:** You fight a sentinel three times, and the third time it says "またお前か..." (*You again...*). You liberate a drone, and next run it recognizes you. Relationships develop across runs.

### Per-NPC Typed Memory

Store alongside the text cache in `data/text-cache-{userId}.json` or a separate `data/npc-memory-{userId}.json`:

```json
{
  "drone_alpha": {
    "counters": {
      "encounters": 3,
      "defeats": 1,
      "liberations": 1,
      "befriends": 0
    },
    "flags": {
      "liberated": true,
      "befriended": false,
      "betrayed": false
    },
    "decisions": [
      "Spared after first fight",
      "Liberated on third encounter"
    ],
    "narrative": "A timid drone you freed after two fierce battles. Grateful but still nervous around you.",
    "lastEncounter": "2026-02-12T...",
    "importance": 7
  }
}
```

### Memory Gates

Gates select which dialogue mode to use, inspired by [Charisma's gate system](https://docs.charisma.ai/memories-gates):

```javascript
function selectDialogueMode(npcMemory, npcCard) {
  if (!npcMemory) return { mode: 'first_meeting', goal: npcCard.goals.possessed };
  if (npcMemory.flags.liberated && npcMemory.counters.encounters > 2)
    return { mode: 'old_friend', goal: npcCard.goals.liberated };
  if (npcMemory.flags.liberated)
    return { mode: 'grateful', goal: npcCard.goals.liberated };
  if (npcMemory.counters.encounters > 1)
    return { mode: 'recognized', goal: npcCard.goals.possessed };
  return { mode: 'first_meeting', goal: npcCard.goals.possessed };
}
```

### Narrative Summary Generation

After each encounter, generate a compact summary using the Convai/SillyTavern rolling summarization pattern:

```
System: Summarize this encounter in 1-2 sentences. Focus on what matters
        for future interactions. Include emotional tone.

User:   NPC: Drone Alpha (timid, apologetic)
        Previous narrative: "A timid drone encountered once before. Player won."
        This encounter: Player fought Drone Alpha. Used befriend action.
        Befriend succeeded. Drone was liberated.

Result: "A timid drone you freed after two fierce battles.
         Grateful but still nervous around you."
```

This summary replaces the previous narrative, keeping memory compact.

### Generation Prompt (Tier 3)

```
System: You write dialogue for NPCs in a cyberpunk game.
        Each NPC remembers past encounters with the player.
        [vocab constraints]

User:   Character: Drone Alpha
        Personality: timid, apologetic, curious
        Speech style: Short stuttering sentences
        Current state: liberated
        Current goal: Find and help other corrupted robots

        Memory of this player:
        - Encounters: 3 | Liberations: 1
        - "A timid drone you freed after two fierce battles.
           Grateful but still nervous around you."
        - Dialogue mode: old_friend

        Generate a line. This NPC recognizes the player and is grateful.
```

### Interaction Logger

Hook into existing game events to record encounters:

```javascript
// After combat resolution
logNpcInteraction(userId, npcId, {
  type: 'combat',
  outcome: 'victory',    // victory | defeat | fled
  actions: ['attack', 'befriend'],
  liberated: true
});

// After shop visit
logNpcInteraction(userId, npcId, {
  type: 'shop',
  outcome: 'purchased',
  items: ['shield_boost']
});
```

### Cost

Same call count as Tier 2. Memory is prompt context (~100-200 extra tokens). One extra LLM call per encounter for narrative summarization — small and cheap (summary generation uses minimal tokens).

### What to Build

- `src/narration-engine/npc-memory.js` — typed memory CRUD, interaction logging
- Narrative summary generation after each encounter
- Memory gates for dialogue mode selection
- Extended generation prompts with memory context

---

## Tier 4: The Interconnected World

**Player experience:** You liberate a drone in Ward 3, and a sentinel in Ward 5 says "あのドローンの話を聞いた..." (*I heard about that drone...*). NPCs gossip. Your reputation precedes you. The world reacts to the shape of your choices.

### World Reputation Profile

Aggregate all NPC interactions into a player reputation:

```json
{
  "reputation": {
    "liberations": 12,
    "defeats": 8,
    "befriends": 5,
    "betrayals": 0,
    "shops_visited": 3
  },
  "worldMood": "hopeful",
  "recentEvents": [
    { "text": "Liberated Drone Alpha in Ward 3", "importance": 7, "when": "2026-02-12" },
    { "text": "Defeated Sentinel 9 in Ward 5", "importance": 4, "when": "2026-02-12" },
    { "text": "Bought rare chip from Shop Bot 2", "importance": 3, "when": "2026-02-11" }
  ],
  "title": "Liberator"
}
```

### World Mood Derivation

```javascript
function deriveWorldMood(reputation) {
  const liberationRate = reputation.liberations / (reputation.liberations + reputation.defeats);
  if (liberationRate > 0.7) return 'hopeful';     // NPCs have heard good things
  if (liberationRate > 0.4) return 'uncertain';    // Mixed signals
  if (liberationRate > 0.2) return 'tense';        // NPCs are wary
  return 'fearful';                                 // NPCs dread the player
}
```

### Keyword-Triggered Cross-NPC Lore

Inspired by [SillyTavern's World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/), NPC memories activate when their keywords appear in the current generation context:

```javascript
function gatherCrossReferences(currentNpcId, recentEvents, allNpcMemories) {
  const references = [];
  for (const event of recentEvents) {
    // If this event mentions another NPC, pull that NPC's summary
    for (const [npcId, memory] of Object.entries(allNpcMemories)) {
      if (npcId === currentNpcId) continue;
      if (event.text.includes(memory.name) && memory.importance >= 5) {
        references.push({
          npcName: memory.name,
          summary: memory.narrative,
          relationship: memory.flags.liberated ? 'liberated' : 'hostile'
        });
      }
    }
  }
  return references.slice(0, 3); // Cap at 3 cross-references
}
```

### Knowledge Separation

NPCs distinguish personal knowledge from hearsay, inspired by [Inworld's character brain](https://inworld.ai/blog/improved-character-brain):

```
Personal knowledge (high confidence):
  "I fought this player twice. They are strong."
  → Speaks with certainty.

World knowledge (hearsay):
  "I heard they freed a drone in Ward 3."
  → Speaks with uncertainty: "...らしい" (apparently), "...と聞いた" (I heard).
```

This distinction emerges from the prompt, not from code:

```
Memories from direct experience (speak with certainty):
- You fought this player once. They defeated you.

Things you've heard (speak with uncertainty, use らしい/と聞いた):
- A drone in Ward 3 was liberated by this player.
- This player has freed 12 robots across the network.

World mood: hopeful — robots across the network feel hope.
Player title: Liberator
```

### Generation Prompt (Tier 4)

```
System: You write dialogue for NPCs in a cyberpunk game.
        NPCs exist in an interconnected world. They hear rumors,
        react to the player's reputation, and reference other NPCs.
        [vocab constraints]

User:   Character: Sentinel 9
        Personality: stoic, duty-bound, conflicted
        Current state: possessed
        Current goal: Guard Ward 5. Confront the so-called Liberator.

        Direct memory of this player:
        - Encounters: 1 | No prior relationship
        - Dialogue mode: first_meeting

        Things heard about this player (use uncertainty markers):
        - "Liberated Drone Alpha in Ward 3" (importance: 7)
        - Player title: Liberator
        - World mood: hopeful

        Cross-NPC references:
        - Drone Alpha: "A timid drone freed after two battles. Now grateful."

        Generate a line where this sentinel confronts the player,
        referencing what it has heard about the drone.
```

### Cost

Same call count as Tier 3. World reputation and cross-references add ~200-300 tokens of context per generation. The reputation aggregation itself is pure arithmetic — no AI calls.

### What to Build

- Reputation aggregation service (event listener, counter updates)
- World mood derivation (threshold logic)
- Recent events feed (capped at ~10 entries, sorted by importance)
- Cross-NPC reference gathering (keyword matching against event log)
- Knowledge separation in prompt templates (personal vs hearsay)
- Extended generation prompts with reputation + cross-references

---

## Prompt Assembly Pipeline

All tiers feed into one prompt assembler. Each tier adds layers; the assembler manages token budgets.

```
┌──────────────────────────────────────────────┐
│              PROMPT ASSEMBLER                 │
├──────────────────────────────────────────────┤
│                                              │
│  Layer 1: System Instructions (always)       │
│    - Role definition                         │
│    - Output format                           │
│    Budget: unlimited                         │
│                                              │
│  Layer 2: Vocab Constraints (always)         │
│    - Known word list                         │
│    - JLPT grammar level                      │
│    - Allowed particles                       │
│    Budget: ~500 tokens                       │
│                                              │
│  Layer 3: Character Card (Tier 2+)           │
│    - Personality, goals, speech style        │
│    - Knowledge (personal + world)            │
│    Budget: ~300 tokens                       │
│                                              │
│  Layer 4: NPC Memory (Tier 3+)              │
│    - Counters, flags, decisions              │
│    - Narrative summary                       │
│    - Dialogue mode from gates                │
│    Budget: ~200 tokens                       │
│                                              │
│  Layer 5: World Context (Tier 4+)            │
│    - Reputation profile                      │
│    - Recent notable events                   │
│    - Cross-NPC references                    │
│    - World mood                              │
│    Budget: ~300 tokens                       │
│                                              │
│  Layer 6: Anti-Repetition (Tier 2+)          │
│    - Previously generated lines              │
│    Budget: ~200 tokens                       │
│                                              │
│  Layer 7: Seed / Task (always)               │
│    - Original text (Tier 1) or              │
│      generation instruction (Tier 2+)        │
│    Budget: ~100 tokens                       │
│                                              │
├──────────────────────────────────────────────┤
│  TOTAL BUDGET: ~1,600 tokens input           │
│  Expected output: ~50-100 tokens             │
├──────────────────────────────────────────────┤
│                                              │
│  → AI Generation                             │
│  → Vocab Repair (i+1 enforcement)            │
│  → Cache to text-cache-{userId}.json         │
│                                              │
└──────────────────────────────────────────────┘
```

When context budget is tight (small models), the assembler trims from the bottom priority up:
1. First to trim: Layer 5 (world context)
2. Then: Layer 6 (anti-repetition)
3. Then: Layer 4 (NPC memory)
4. Never trim: Layers 1, 2, 7 (system, vocab, task)

---

## Implementation Roadmap

| Tier | Depends on | Key deliverable | Estimated calls/user |
|------|-----------|-----------------|---------------------|
| **1** | Nothing | `narration-engine/text-cache.js` + background refresh | ~1,250 initial |
| **2** | Tier 1 | Character card schema + `prompt-assembler.js` | ~same |
| **3** | Tier 2 | `narration-engine/npc-memory.js` + interaction logger + gates | ~same + 1 summary/encounter |
| **4** | Tier 3 | Reputation service + cross-NPC references | ~same |

Each tier is independently shippable. Tier 1 alone improves the game. Each subsequent tier enriches the experience without changing the tiers below.

### Tier 1 Implementation Order

1. Create `src/narration-engine/` directory structure with `index.js` public interface
2. Remove wasted narration calls (`runStart`, `floorEnter`, `encounterStart`)
3. Build `narration-engine/text-cache.js` (copy befriend pattern: atomic saves, locks, retry)
4. Build `narration-engine/vocab-constraints.js` (extract from ai-providers)
5. Build `narration-engine/generation.js` with prompts per category
6. Wire `server.js` to enrich API responses from cache (game imports from engine)
7. Add background refresh on run start
8. Benchmark across Haiku / Sonnet / user-configured provider

### Tier 2 Implementation Order

1. Design character card schema in `narration-engine/character-cards.js`
2. Populate character cards for all enemies and robots in `data/character-cards/`
3. Build `narration-engine/prompt-assembler.js` with layered context + token budgets
4. Update generation prompts to use personality + goals
5. Add anti-repetition tracking (previously seen lines)
6. Test personality consistency across regenerations

### Tier 3 Implementation Order

1. Build `narration-engine/npc-memory.js` with typed memory (counters, flags, decisions, narrative)
2. Add interaction logger hooks in `game/` that call `narration-engine/` (one-directional)
3. Build narrative summary generation (post-encounter)
4. Implement memory gates for dialogue mode selection
5. Extend prompt assembler with memory context layer

### Tier 4 Implementation Order

1. Add reputation aggregation to `narration-engine/npc-memory.js`
2. Implement world mood derivation
3. Add recent events feed with importance filtering
4. Build cross-NPC reference gathering (keyword-triggered lore)
5. Add knowledge separation (personal vs hearsay) to prompt assembler
6. Test interconnected world feel across multi-run playthroughs

---

## Sources

- [Convai Memory Architecture (Mimir)](https://convai.com/blog/long-term-memory---a-technical-overview) — hierarchical memory, importance scoring, hybrid retrieval
- [Charisma.ai Memory & Gates](https://docs.charisma.ai/memories-gates) — typed memories, conditional story routing
- [Inworld Character Brain](https://inworld.ai/blog/improved-character-brain) — personality + goals + knowledge + memory layers
- [SillyTavern Context Systems](https://deepwiki.com/SillyTavern/SillyTavern/6-context-and-memory-systems) — layered prompt assembly, token budgeting
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) — keyword-triggered lore injection, sticky/cooldown, recursive scanning
- [SillyTavern Summarize](https://docs.sillytavern.app/extensions/summarize/) — rolling summarization for long-term memory
- [SillyTavern Chat Vectorization](https://docs.sillytavern.app/extensions/chat-vectorization/) — RAG over conversation history
- [Character Card V2 Spec](https://github.com/malfoyslastname/character-card-spec-v2) — portable character definition format
- [Inworld Long-Term Memory](https://inworld.ai/blog/introducing-long-term-memory) — flash memory → synthesized long-term memory
- [Neocortex](https://docs.neocortex.link) — node-based agent editor (evaluated, not adopted)
