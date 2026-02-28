# Koto - Architecture

This document describes the technical architecture of Koto. It covers the game flow, core systems, data structures, and how the frontend and backend communicate. For theme and lore, see [docs/WORLD.md](../WORLD.md).

## Table of Contents

1. [Overview](#overview)
2. [Frequency-Ordered Vocabulary Naming](#frequency-ordered-vocabulary-naming)
3. [Game Flow and Phases](#game-flow-and-phases)
4. [Creature Combat (Core Mechanic)](#creature-combat-core-mechanic)
5. [Combat System](#combat-system)
5. [Area System (Exploration)](#area-system-exploration)
6. [Vocabulary Integration (JPDB)](#vocabulary-integration-jpdb)
7. [AI Narration and TTS](#ai-narration-and-tts)
8. [Meta-Progression](#meta-progression)
9. [Logging System](#logging-system)
10. [Frontend Architecture](#frontend-architecture)
11. [Backend Architecture](#backend-architecture)
12. [Data Schemas](#data-schemas)
13. [File Reference](#file-reference)

---

## Overview

Koto is a Japanese vocabulary learning RPG set in a vibrant fantasy world inspired by Earth. The player explores areas, befriends creatures disrupted by a mysterious force, and learns Japanese through immersive gameplay.

**Tech Stack:**
- Backend: Express.js (Node.js ES modules)
- Frontend: Vanilla HTML/CSS/JS (no framework)
- Data: Local JSON files for persistence
- APIs: JPDB (vocabulary), OpenAI/Anthropic/Google (narration), VOICEVOX (TTS)

**Design Philosophy:**
The game intentionally simplifies traditional RPG mechanics to keep focus on Japanese language learning. Combat uses only attack and HP stats, removing the cognitive overhead of complex builds.

---

## Frequency-Ordered Vocabulary Naming

Everything the player encounters is named using real Japanese words from the **top 10,000 most frequent words**, sourced from JPDB deck 81. Words appear in rough frequency order: early floors use the most common words, later floors use less common ones. A player who quits at floor 3 still learned the most useful words first.

### Naming by Entity Type

| Entity | Word Class | Example |
|--------|-----------|---------|
| **Creatures** | Object nouns + adjective | 赤いハンマーロボ (Red Hammer Bot) |
| **Enemies** | People nouns + adjective | 怒った先生 (Angry Teacher) |
| **Locations** | Place nouns | 学校 (School), 病院 (Hospital) |
| **Attacks/Skills** | Verbs | 教える (To Teach), 焼く (To Grill) |

### How It Teaches

A single encounter can expose the player to **three word classes at once**:

```
Fight: 怒った先生 (Angry Teacher)
  - 怒った (angry)      → adjective
  - 先生 (teacher)      → person noun
  - 教える (to teach)   → verb (attack name)
```

**Creatures** are named after everyday objects — things you'd point at in a room (hammer, scissors, battery, broom). Adjective modifiers create variety and teach a second word per entity.

**Enemies** are named after real people and occupations — people you'd actually meet in Japan (student, teacher, doctor, shopkeeper, neighbor). Their attacks use **verbs that fit their identity**: the teacher 教える (teaches), the cook 焼く (grills), the doctor 治す (cures).

**Locations** are named after real places from the frequency list, reinforcing place vocabulary alongside the ward system.

### Adjective Types

Japanese has two adjective types, both used as modifiers:

| Type | Grammar | Example |
|------|---------|---------|
| い-adjective | Attaches directly | 赤い (red) → 赤いロボ |
| な-adjective | Uses な connector | 静かな (quiet) → 静かな先生 |

Players learn both adjective grammar patterns naturally by reading entity names.

### Writing System Exposure

Object nouns for creatures tend to include **katakana loanwords** (ハンマー, ナイフ, テーブル), while people and occupation nouns tend to use **kanji** (学生, 医者, 先生). This naturally exposes players to both writing systems.

### Data Source

The word list lives in `data/jpdb-wordlist.json`, sourced from JPDB deck 81 (~9,500 words). At session start, the server parses this list against each user's JPDB account to determine word states (due, learning, known, new) and caches the result per-user.

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

## Creature Combat (Core Mechanic)

Creatures are the core combat unit. Players build a party of 3 active creatures plus reserves.

### Creature Data

Creatures are defined in `data/creatures.json`. Each creature has:

- **Element:** wood, fire, earth, metal, or water (five-element cycle)
- **Stats:** attack, maxHp
- **Auto-skill:** Passive ability that triggers automatically
- **Ultimate:** Powerful ability that charges over multiple turns

### Damage Formula

```
damage = calculateCreatureDamage(attack, power, elementMultiplier, variance)
```

Element matchups follow the Wu Xing cycle (wood > earth > water > fire > metal > wood), providing a 1.5x damage bonus on advantageous matchups.

### Items

Consumable items (`data/items.json`) provide buffs during combat (healing, stat boosts, element shields). Items are purchased from shops between encounters.

**Files:**
- `data/creatures.json` - Creature definitions
- `data/items.json` - Consumable item definitions
- `src/game/services/creature-combat-service.js` - Creature combat logic
- `src/game/services/creature-collection-service.js` - Creature party management
- `src/game/services/item-service.js` - Item usage and inventory
- `public/js/ui/creature-row.js` - Frontend creature party UI

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

```
damage = calculateCreatureDamage(attack, power, elementMultiplier, variance)
```

Element matchups provide bonus damage (1.5x for advantageous elements). Variance adds slight randomness to keep combat unpredictable.

### Enemy Intents

Enemies announce their intent before acting:

| Intent | Effect |
|--------|--------|
| `attack` | Normal damage (1.0x) |
| `heavy` | Heavy attack (2.0x) |
| `defend` | Takes 0.5x damage this turn |
| `special` | Varies by enemy |
| `rage` | Enraged attack (1.5x) |

### Turn Order

Player always acts first.

**Files:**
- `src/game/stats.js` - Stat calculations
- `src/game/combat/mechanics.js` - Damage formulas
- `src/game/combat/player-actions.js` - Player attack execution
- `src/game/combat/enemy.js` - Enemy AI and intents
- `src/game/enemies.js` - Enemy definitions
- `src/game/services/creature-combat-service.js` - Creature combat orchestration

### Combat Visual Effects

Anime-style visual feedback during combat, implemented in `public/js/ui/combat-effects.js`.

**Animation Library:** anime.js (~14KB)

**Primitives:**
| Effect | Function | Description |
|--------|----------|-------------|
| Screen Shake | `screenShake(intensity)` | Camera jolt (light/medium/heavy) |
| Hit Stop | `hitStop(ms)` | Freeze frame on impact |
| Flash | `flashElement(target)` / `flashScreen()` | Brightness pulse |
| Particles | `spawnParticles(el, count, color)` | Burst outward from element |
| Speed Lines | `spawnSpeedLines(from, to)` | Lines traveling between elements |
| Recoil | `recoil(target, distance)` | Knockback spring animation |

**Combat Moments:**
| Moment | Effects | Trigger |
|--------|---------|---------|
| Creature Attack | Pop, particles, speed lines, screen pulse | Creature attacks |
| Enemy Damage | Hit stop, shake, flash, particles, recoil | Player attack lands |
| Player Damage | Hit stop, heavy shake, red vignette | Enemy attack lands |
| Big Damage (150+) | All above amplified: longer stop, double flash | High damage threshold |

**Files:**
- `public/js/ui/combat-effects.js` - Effect primitives and moment functions
- `public/game.css` - Overlay and particle styles

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
| Encounter | 45% | Combat with SYSTEM-possessed citizen |
| Shop | 20% | Buy items and recruit creatures |
| Quiz | 20% | Knowledge test for rewards |
| Word Discovery | 15% | Learn new vocabulary via flash cards |
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
| Creature party | No | No |

**Files:**
- `src/game/state.js` - State management and persistence

---

## Logging System

Both server and client have structured logging with configurable levels.

### Log Levels

| Level | Priority | Use Case |
|-------|----------|----------|
| `debug` | 0 (lowest) | Detailed diagnostic info |
| `info` | 1 | Normal operational messages |
| `warn` | 2 | Warning conditions |
| `error` | 3 (highest) | Error conditions |

### Server Logger

Configure via `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug npm start  # Show all logs
LOG_LEVEL=warn npm start   # Only warnings and errors
```

```javascript
// src/logger.js
import { logger } from './logger.js';
logger.info('[Combat] Enemy defeated', { enemy: 'Glitch Sprite' });
logger.debug('[JPDB] Cache refresh', { wordCount: 150 });
```

### Client Logger

Configure via browser console or localStorage:

```javascript
// Browser console
logger.setLevel('debug');  // Persists across reloads
logger.getLevel();         // Check current level
```

```javascript
// public/js/logger.js
import { logger } from './logger.js';
logger.info('[Combat] Word reviewed', { word: '食べる' });
```

**Files:**
- `src/logger.js` - Server-side logger module
- `public/js/logger.js` - Client-side logger with localStorage persistence

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
| `creature-row.js` | Creature party display |
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
| CreatureCombatService | Creature combat logic | `src/game/services/creature-combat-service.js` |
| CreatureCollectionService | Creature party management | `src/game/services/creature-collection-service.js` |
| ItemService | Item usage and inventory | `src/game/services/item-service.js` |
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
    "creatures": [/* active creature party */],
    "items": [/* consumable items */]
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
| `src/game/combat/rewards.js` | Combat reward generation |

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

### Infrastructure

| File | Purpose |
|------|---------|
| `src/logger.js` | Server-side structured logging |
| `public/js/logger.js` | Client-side logging with localStorage |

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
| `data/creatures.json` | Creature definitions |
| `data/items.json` | Consumable item definitions |
| `data/enemies.json` | Enemy definitions |
| `data/bosses.json` | Boss definitions |

---

## What Does Not Exist

Despite what older documentation may suggest, the following features are **not implemented**:

- No STR/AGI/VIT/INT/DEX/LUK stats (simplified to attack + maxHp)
- No armor, weapons, or equipment slots (players use creatures and consumable items only)
- No class selection or skill trees
- No hit/miss or critical hit system

These were intentionally removed to keep the game simple and focus on language learning.
