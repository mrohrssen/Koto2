# NEO TOKYO: System Liberation - Architecture

This document describes the technical architecture of the JRPG codebase. It covers the game flow, core systems, data structures, and how the frontend and backend communicate.

## Table of Contents

1. [Overview](#overview)
2. [Game Flow and Phases](#game-flow-and-phases)
3. [Chip System (Core Mechanic)](#chip-system-core-mechanic)
4. [Combat System](#combat-system)
5. [Ward System (Dungeons)](#ward-system-dungeons)
6. [Vocabulary Integration (JPDB)](#vocabulary-integration-jpdb)
7. [AI Narration and TTS](#ai-narration-and-tts)
8. [Meta-Progression](#meta-progression)
9. [Frontend Architecture](#frontend-architecture)
10. [Backend Architecture](#backend-architecture)
11. [Data Schemas](#data-schemas)
12. [File Reference](#file-reference)

---

## Overview

NEO TOKYO: System Liberation is a Japanese vocabulary learning RPG set in cyberpunk Tokyo. Citizens are possessed by the SYSTEM AI and need liberation through turn-based dungeon combat.

**Tech Stack:**
- Backend: Express.js (Node.js ES modules)
- Frontend: Vanilla HTML/CSS/JS (no framework)
- Data: Local JSON files for persistence
- APIs: JPDB (vocabulary), OpenAI/Anthropic/Google (narration), VOICEVOX (TTS)

**Design Philosophy:**
The game intentionally simplifies traditional RPG mechanics to keep focus on Japanese language learning. Combat uses only attack and HP stats, removing the cognitive overhead of complex builds.

---

## Game Flow and Phases

The game implements a **state machine** with distinct phases. Each phase represents a discrete UI/interaction state.

### Phase Definitions

```
src/game/phase-machine.js
```

| Phase | Description |
|-------|-------------|
| `no_save` | No player exists, show character creation |
| `hub` | In town between runs, access shops and upgrades |
| `ward_selection` | Choosing starting or next ward |
| `exploring` | Generic exploring state in dungeon |
| `room` | In a room (general) |
| `room_encounter` | Room has unhandled encounter |
| `boss_ready` | At boss room, ready to fight |
| `combat` | In active battle |
| `victory` | Just won combat (before rewards) |
| `defeat` | Just lost combat |
| `shop` | In merchant shop |
| `blacksmith` | At blacksmith for upgrades |
| `post_combat_shop` | Buying drops after combat |
| `floor_complete` | Boss defeated, floor cleared |
| `run_complete` | Beat final boss, game won |
| `run_ended` | Run finished (victory or defeat) |

### Key Transitions

```
NO_SAVE ──────► HUB ──────► WARD_SELECTION
                               │
                               ▼
                            ROOM ◄─────────────────┐
                               │                   │
                               ▼                   │
                           COMBAT                  │
                           /    \                  │
                          ▼      ▼                 │
                     VICTORY   DEFEAT              │
                        │         │                │
                        ▼         ▼                │
               POST_COMBAT_SHOP  HUB               │
                        │                          │
                        └──────────────────────────┘

Boss Victory Flow:
VICTORY ──► FLOOR_COMPLETE ──► WARD_SELECTION (next ward)
                              or
                            RUN_COMPLETE ──► HUB (game won)
```

### Phase Derivation

The current phase is derived from game state, not stored directly:

```javascript
// src/game/phase-machine.js
function derivePhase({ player, run, combat }) {
  if (!player) return PHASES.NO_SAVE;
  if (!run) return PHASES.HUB;
  if (combat?.active) return PHASES.COMBAT;
  // ... additional logic
}
```

**Files:**
- `src/game/phase-machine.js` - Phase constants and transition logic
- `src/game/loop.js` - GameManager orchestrates phase changes
- `public/js/game.js` - Frontend responds to phase changes

---

## Chip System (Core Mechanic)

Chips are passive augmentations that form the game's primary build customization. They execute as a damage pipeline during combat.

### Pipeline Execution

Each weapon has **5 chip slots** that execute in sequential order:

```
Base Damage ──► [Chip 1] ──► [Chip 2] ──► [Chip 3] ──► [Chip 4] ──► [Chip 5] ──► Final Damage
```

**Order matters:**
- `+5` then `x2` = `(base + 5) * 2`
- `x2` then `+5` = `(base * 2) + 5`

### Effect Types

| Type | Description | Example |
|------|-------------|---------|
| `flatAdd` | Add flat damage | +5 damage |
| `multiply` | Multiply damage | x1.3 |
| `conditional` | Multiply if condition met | x1.5 if enemy <30% HP |
| `stacking` | Builds stacks during combat | +2 per stack |
| `recursion` | Chance to restart pipeline | 7% restart |
| `sacrifice` | Big boost but chip destroyed | x5, single use |
| `amplifyNext` | Boost next chip's effect | Next chip x1.3 |
| `copy` | Repeat previous chip's effect | Clone effect |
| `critMod` | Modify critical chance | +15% crit |
| `damageAndHeal` | Damage and heal player | Lifesteal |
| `killCounter` | Scales with kills this run | +1 per kill |
| `vsBoss` | Extra damage to bosses | x1.5 vs boss |
| `rampingMultiply` | Grows each attack | +5% per attack |
| `nthAttack` | Triggers every N attacks | Every 3rd attack |
| `perEquipped` | Scales with equipped items | +2 per chip |
| `emptySlots` | Scales with empty slots | +10 per empty |

### Chip Skills

Chips have secondary abilities that charge over **5 turns**:

```javascript
// Skill timing types
PRE_PIPELINE    // Executes before damage calculation
POST_PIPELINE   // Executes after damage dealt
PIPELINE_MODIFIER  // Modifies the pipeline itself
DEFENSIVE       // Defensive buff or heal
```

**Skill Categories:**
- Instant: Direct damage or heal
- Buff: Modify next attack

### Rarities

| Rarity | Stat Multiplier | Color |
|--------|-----------------|-------|
| Common | 1.0x | Gray |
| Uncommon | 1.5x | Green |
| Rare | 2.0x | Blue |
| Epic | 2.5x | Purple |
| Legendary | 3.0x | Gold |

**Files:**
- `src/game/items/chips.js` - Chip generation and pipeline execution
- `data/chips.json` - Chip definitions (20+ chips)
- `data/chip-config.json` - Rarity multipliers and upgrade costs
- `src/game/combat/player-actions.js` - Pipeline execution during combat
- `public/js/ui/chip-row.js` - Frontend chip slot UI
- `public/js/ui/chip-select.js` - Swipeable card UI for shopping

---

## Combat System

Combat is intentionally simplified to reduce cognitive load and keep focus on language learning.

### Stats

Only two stats matter:

| Stat | Purpose |
|------|---------|
| `attack` | How much damage you deal |
| `maxHp` | How much health you have |

**No hit/miss, no crits, no defense stat.**

### Damage Formula

```javascript
// 1. Base damage with variance
baseDamage = attack * random(0.85, 1.15)

// 2. PRE_PIPELINE buffs add flat bonuses
damage = baseDamage + prePipelineBonus

// 3. Chip pipeline executes (each chip modifies damage)
damage = executeChipPipeline(damage, chips)

// 4. POST_PIPELINE buffs multiply final damage
finalDamage = damage * postPipelineMultiplier

// 5. Enemy takes damage
enemy.hp -= finalDamage
```

### Enemy Intents

Enemies announce their intent before acting:

| Intent | Effect |
|--------|--------|
| `attack` | Normal damage (1.0x) |
| `heavy` | Heavy attack (2.0x) |
| `defend` | Takes 0.5x damage this turn |
| `special` | Varies by enemy |
| `rage` | Enraged attack (1.5x) |

### Status Effects

Cyberpunk-themed status conditions:

| Japanese | English | Effect |
|----------|---------|--------|
| デフラグ | Defrag | DoT: 5 damage/turn |
| バッファオーバーフロー | Buffer Overflow | Skip turn |
| 露出 | Exposed | Take 1.5x damage |
| オーバーヒート | Overheated | Stackable DoT, explodes at max stacks |

### Turn Order

Player always acts first.

**Files:**
- `src/game/stats.js` - Stat calculations
- `src/game/combat/mechanics.js` - Damage formulas
- `src/game/combat/player-actions.js` - Player attack execution
- `src/game/combat/enemy.js` - Enemy AI and intents
- `src/game/combat/status-effects.js` - Status effect definitions
- `src/game/enemies.js` - Enemy definitions

---

## Ward System (Dungeons)

The game takes place across 7 Tokyo wards, each representing a dungeon floor.

### Ward Map

```
         Tier 1 (Start)
        /              \
    Nerima           Setagaya
   (練馬区)          (世田谷区)
        \              /
         Tier 2
        /      \
    Nakano    Shibuya
   (中野区)   (渋谷区)
        \      /
         Tier 3
        /      \
   Shinjuku  Ikebukuro
   (新宿区)  (池袋区)
        \      /
         Tier 4
        /      \
    Minato   Chiyoda
    (港区)   (千代田区)
        \      /
         Tier 5 (Final)
            |
    Imperial Palace
       (皇居)
```

### Room Types

| Type | Probability | Description |
|------|-------------|-------------|
| Encounter | 60% | Combat with SYSTEM-possessed citizen |
| Shrine | 20% | Chip upgrade opportunity |
| Quiz | 20% | Knowledge test for rewards |
| Boss | 100% (last room) | Floor boss |

### Difficulty Scaling

| Floor | Ward Tier | Enemy Strength |
|-------|-----------|----------------|
| 1-2 | Tier 1 | Easy |
| 3-4 | Tier 2 | Medium |
| 5-6 | Tier 3 | Hard |
| 7 | Tier 4 | Final |

**Files:**
- `src/game/rooms.js` - Room generation and ward paths
- `src/game/enemies.js` - Enemy generation per tier
- `data/enemies.json` - Enemy definitions
- `data/bosses.json` - Boss definitions (7 floor bosses)

---

## Vocabulary Integration (JPDB)

JPDB (Japanese Dictionary Database) provides vocabulary data with spaced repetition learning states.

### Lookup Mode

Click any Japanese word to see a popup with:
- Definition
- Reading (furigana)
- Card state (new, learning, known)
- JPDB link

**Implementation:**
1. User activates lookup mode
2. All visible Japanese text is tokenized
3. Words are prefetched from JPDB
4. Clicking a word shows cached definition

**Cheating Prevention:** Lookup is blocked on quiz answers.

### Word Suggestions for AI

When generating narration, the system suggests vocabulary at the user's level:

```javascript
// Word selection distribution
60% - Due words (need review)
25% - Learning words (in progress)
15% - Known words (mastered)
```

A ring buffer of last 50 used words prevents repetition.

### Caching

| Cache | Purpose | File |
|-------|---------|------|
| Deck vocabulary | Full JPDB deck | `.jrpg-vocab-cache.json` |
| Definition cache | In-memory | Runtime only |

**Files:**
- `src/jpdb.js` - JPDB API client with rate limiting
- `src/vocab-manager.js` - Word suggestion logic
- `public/js/ui/lookup.js` - Frontend lookup UI
- `public/js/word-practice.js` - Optional vocab review during combat

---

## AI Narration and TTS

### AI Providers

| Provider | Model | Use Case |
|----------|-------|----------|
| OpenAI | GPT-4 | Primary narration |
| Anthropic | Claude | Alternative |
| Google | Gemini | Alternative |
| OpenRouter | Various | Fallback |

### Vocabulary-Constrained Narration

AI output is constrained to the user's vocabulary level:

1. **System prompt** includes user's known vocabulary (max 8000 words)
2. **JLPT grammar guidance** (N5-N1)
3. **Post-generation repair:** Sentences with >1 unknown word are rewritten

```javascript
// src/game/vocab-repair.js
// Rewrites AI output to match user's vocab level
```

### VOICEVOX Integration

Japanese text-to-speech synthesis:

- 47+ speaker voices mapped to enemy personalities
- Audio caching with 5-minute TTL
- Deployed separately (VOICEVOX server)

**Files:**
- `src/game/dm.js` - Dungeon Master narration generation
- `src/ai-providers.js` - Multi-provider AI abstraction
- `src/voicevox.js` - VOICEVOX client
- `src/game/vocab-repair.js` - Post-generation vocabulary repair
- `public/js/tts.js` - Frontend TTS playback

---

## Meta-Progression

Progress persists across runs and sessions.

### Essence (Shadow Currency)

Earned from runs:
- 10 essence per floor cleared
- 100 essence completion bonus
- +5 per 10 enemies defeated

### Upgrades

| Upgrade | Effect | Levels | Cost Range |
|---------|--------|--------|------------|
| Vitality | +10% maxHp per level | 5 | 50-800 |
| Attack Power | +2 ATK per level | 5 | 75-1200 |
| Treasure Sense | +25 starting gold | 4 | Variable |
| Gold Find | +10% gold earned | 5 | Variable |

### Achievements

| Achievement | Requirement |
|-------------|-------------|
| First Victory | Win first combat |
| Boss Slayer | Defeat a boss |
| Veteran Hunter | 100 enemies defeated |
| Dungeon Master | Clear floor 7 |
| Thousand Slayer | 1000 enemies defeated |
| Perfect Run | Complete run without dying |

### Persistence Model

| Data | Persists Across Runs | Persists Across Sessions |
|------|---------------------|-------------------------|
| Player base stats | Yes | Yes |
| Meta-progression (essence, upgrades) | Yes | Yes |
| Achievements | Yes | Yes |
| Run state (HP, gold, floor) | No | No |
| Equipped chips | No | No |

**Files:**
- `src/game/state.js` - State management and persistence

---

## Frontend Architecture

### Main Coordinator

`public/js/game.js` is the central coordinator:

- Central state management (`gameState` object)
- Phase-based UI routing
- Module initialization with callbacks
- API communication orchestration

### UI Modules

Located in `public/js/ui/`:

| Module | Purpose |
|--------|---------|
| `actions.js` | Bottom action area, flash cards |
| `exploration.js` | Hub, ward selection, room navigation |
| `combat-loop.js` | Turn-based combat orchestration |
| `chip-row.js` | 5 chip slots with drag-to-reorder |
| `chip-select.js` | Swipeable card UI for chip shopping |
| `scene.js` | Background, enemy sprite, enemy HP |
| `narration-box.js` | Dialogue display |
| `lookup.js` | Japanese word lookup mode |
| `economy.js` | Post-combat shop |
| `hp-bar.js` | Player health display |
| `character.js` | Character sheet and stats |
| `takeover.js` | Full-screen takeover UI |
| `modals.js` | Modal dialogs |
| `auth.js` | Authentication UI |
| `leaderboard.js` | High scores display |

### State Management

`public/js/store.js` implements pub/sub pattern:

```javascript
// Subscribe to state changes
store.subscribe('combat', (newState) => {
  updateCombatUI(newState);
});

// Update state (notifies subscribers)
store.set('combat', newCombatState);
```

### API Communication

`public/js/api.js` handles all server requests:

- JWT auth headers
- Error handling
- Request/response transformation

**Files:**
- `public/js/game.js` - Main coordinator
- `public/js/api.js` - API client
- `public/js/store.js` - State management
- `public/js/ui/*.js` - UI modules

---

## Backend Architecture

### Server

`server.js` is an Express.js server with 50+ endpoints.

### API Namespaces

| Namespace | Purpose |
|-----------|---------|
| `/api/auth/*` | Login, register, API key management |
| `/api/game/*` | Game state, combat, exploration, meta-progression |
| `/api/jpdb/*` | JPDB vocabulary integration |
| `/api/tts/*` | VOICEVOX text-to-speech |
| `/api/vocab/*` | Word suggestions |
| `/api/settings` | User preferences |

### GameManager

`src/game/loop.js` contains the `GameManager` class:

- Central coordinator for game logic
- Delegates to `CombatService` and `ExplorationService`
- Per-user instances via `manager-registry.js`
- Manages state: player, run, combat, meta

```javascript
// src/game/manager-registry.js
// Maps userId -> GameManager instance
```

### Services

| Service | Purpose | File |
|---------|---------|------|
| CombatService | Combat mechanics | `src/game/services/combat-service.js` |
| ExplorationService | Room navigation | `src/game/services/exploration-service.js` |

### Persistence

| File | Contents |
|------|----------|
| `.jrpg-save-{userId}.json` | Player state + meta-progression |
| `.jrpg-settings.json` | Server settings |
| `.jrpg-vocab-cache.json` | JPDB vocabulary cache |

**Files:**
- `server.js` - Express server and routes
- `src/game/loop.js` - GameManager class
- `src/game/manager-registry.js` - Per-user manager instances
- `src/game/services/*.js` - Business logic services

---

## Data Schemas

### Chip Definition (data/chips.json)

```javascript
{
  "id": "chip_amplifier",
  "name": "増幅器",
  "nameEn": "Amplifier",
  "description": "次のチップの効果を強化する",
  "rarity": "rare",
  "effect": {
    "type": "amplifyNext",
    "value": 1.3
  },
  "skill": {
    "name": "ブースト",
    "nameEn": "Boost",
    "description": "次の攻撃のダメージ+50%",
    "timing": "PRE_PIPELINE",
    "effect": { "type": "flatAdd", "value": 50 }
  }
}
```

### Enemy Definition (data/enemies.json)

```javascript
{
  "id": "salary_man",
  "name": "サラリーマン",
  "nameEn": "Salary Man",
  "tier": 1,
  "baseHp": 30,
  "baseAttack": 8,
  "intents": ["attack", "attack", "heavy", "defend"],
  "voicevoxSpeaker": 3,
  "dialogue": {
    "possessed": ["仕事...仕事...残業..."],
    "liberation": ["あ...今何時だ?"],
    "boss": null
  }
}
```

### Save File (.jrpg-save-{userId}.json)

```javascript
{
  "version": 2,
  "player": {
    "name": "Player Name",
    "class": "hacker",
    "hp": 85,
    "maxHp": 100,
    "attack": 15,
    "gold": 250,
    "chips": [/* equipped chip objects */],
    "equipment": {}
  },
  "meta": {
    "essence": 1500,
    "upgrades": {
      "vitality": 2,
      "attackPower": 1,
      "treasureSense": 0,
      "goldFind": 3
    },
    "lifetimeStats": {
      "enemiesDefeated": 156,
      "bossesDefeated": 4,
      "runsCompleted": 2
    },
    "achievements": ["first_victory", "boss_slayer"]
  },
  "savedAt": "2024-01-15T10:30:00.000Z"
}
```

### Chip Config (data/chip-config.json)

```javascript
{
  "rarityMultipliers": {
    "common": 1.0,
    "uncommon": 1.5,
    "rare": 2.0,
    "epic": 2.5,
    "legendary": 3.0
  },
  "upgradeCosts": {
    "common": 50,
    "uncommon": 100,
    "rare": 200,
    "epic": 400,
    "legendary": 800
  }
}
```

---

## File Reference

### Core Game Logic

| File | Purpose |
|------|---------|
| `src/game/loop.js` | GameManager class (main orchestration) |
| `src/game/phase-machine.js` | Phase state machine |
| `src/game/state.js` | Player/run/combat state, meta-progression |
| `src/game/stats.js` | Stat calculations |
| `src/game/enemies.js` | Enemy generation and definitions |
| `src/game/rooms.js` | Ward system and room generation |
| `src/game/dm.js` | Dungeon Master narration |

### Combat

| File | Purpose |
|------|---------|
| `src/game/combat/mechanics.js` | Damage formulas |
| `src/game/combat/player-actions.js` | Player attack execution |
| `src/game/combat/enemy.js` | Enemy AI |
| `src/game/combat/chip-skills.js` | Chip skill execution |
| `src/game/combat/status-effects.js` | Status effect definitions |
| `src/game/combat/rewards.js` | Combat reward generation |

### Items

| File | Purpose |
|------|---------|
| `src/game/items/chips.js` | Chip system |
| `src/game/items/index.js` | Item exports |

### Services

| File | Purpose |
|------|---------|
| `src/game/services/combat-service.js` | Combat business logic |
| `src/game/services/exploration-service.js` | Exploration business logic |
| `src/game/manager-registry.js` | Per-user GameManager instances |

### External APIs

| File | Purpose |
|------|---------|
| `src/jpdb.js` | JPDB API client |
| `src/ai-providers.js` | Multi-provider AI abstraction |
| `src/voicevox.js` | VOICEVOX TTS client |
| `src/vocab-manager.js` | Word suggestion logic |
| `src/game/vocab-repair.js` | Post-generation vocabulary repair |

### Frontend

| File | Purpose |
|------|---------|
| `public/js/game.js` | Main coordinator |
| `public/js/api.js` | API client |
| `public/js/store.js` | State management |
| `public/js/tts.js` | TTS playback |
| `public/js/word-practice.js` | Vocab review |
| `public/js/ui/*.js` | UI modules (16 files) |

### Data

| File | Purpose |
|------|---------|
| `data/chips.json` | Chip definitions |
| `data/enemies.json` | Enemy definitions |
| `data/bosses.json` | Boss definitions |
| `data/chip-config.json` | Rarity and upgrade config |

---

## What Does Not Exist

Despite what older documentation may suggest, the following features are **not implemented**:

- No STR/AGI/VIT/INT/DEX/LUK stats (simplified to attack + maxHp)
- No armor, weapons, or equipment slots (only chip pipeline)
- No class selection or skill trees
- No hit/miss or critical hit system

These were intentionally removed to keep the game simple and focus on language learning.
