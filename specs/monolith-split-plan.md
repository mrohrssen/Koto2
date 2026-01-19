# Monolith Split Plan

A meticulous, incremental refactoring plan for splitting the JRPG monolith. Each step is:
- **Small**: <100 lines changed ideally, never >200
- **Safe**: Backwards compatible, no behavior changes
- **Verifiable**: `npm test` passes after each step
- **Committable**: Can be reviewed and merged independently

## Current State

| File | Lines | Problem |
|------|-------|---------|
| `public/game.js` | 7,301 | Frontend monolith - all UI, state, API calls mixed |
| `server.js` | 1,798 | 86 endpoints in one file |
| `src/game/items/chips.js` | 3,894 | Data + logic + pipeline + upgrades mixed |
| `src/game/enemies.js` | 3,818 | Data + generation + AI behavior mixed |
| `src/game/loop.js` | 2,789 | GameManager handles 8+ different concerns |

## Existing Successful Patterns

The `combat/` and `items/` directories demonstrate the target pattern:
```
src/game/combat/
├── index.js          ← Re-export wrapper (public API)
├── mechanics.js      ← Core formulas
├── player-actions.js ← Player combat logic
├── enemy.js          ← Enemy AI
├── status-effects.js ← Status system
└── rewards.js        ← Victory processing
```

**Pattern rules:**
1. `index.js` re-exports everything - external code imports from index
2. Internal files import from each other directly
3. Each file has one clear responsibility
4. Constants/data separated from logic where >500 lines

---

## Architectural Decisions

This section documents the architectural patterns to adopt **incrementally** during the refactor. These aren't separate phases—they're design decisions applied as we split files.

### Current Architecture Analysis

**What exists now:**
```
┌─────────────────────────────────────────────────────────────┐
│                        server.js                            │
│  (86 endpoints, persistence, narration, all glued together) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     GameManager (loop.js)                   │
│  - God class: 2,789 lines, 80+ methods                      │
│  - Combat, exploration, economy, progression all mixed      │
│  - Manual emitState() calls (50+ places, easy to forget)    │
│  - Callbacks: onStateChange(), onNarration()                │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ combat/  │        │ items/   │        │ enemies  │
    │ (split)  │        │ (split)  │        │ (monolith)│
    └──────────┘        └──────────┘        └──────────┘
```

**Frontend (game.js):**
```
┌─────────────────────────────────────────────────────────────┐
│                      game.js (7,301 lines)                  │
│  - Global state: gameState object (no reactivity)           │
│  - 50+ inline fetch() calls scattered everywhere            │
│  - Direct DOM manipulation (tightly coupled)                │
│  - No state management pattern                              │
│  - TTS, narration, word practice all interleaved            │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture

**Pattern 1: Event Bus (Backend)**

Replace callback-based events with pub/sub for decoupling.

```javascript
// Current (tightly coupled):
this.stateCallback = null;
this.emitState(); // Manual call in 50+ places, easy to forget

// Target (decoupled):
import { eventBus } from './events.js';
eventBus.emit('state:changed', this.getState());
eventBus.on('combat:damage', (data) => this.trackDamage(data));
```

**When to apply:** During Phase 4 (GameManager decomposition). Create `src/game/events.js` as first step, then managers subscribe to events instead of direct coupling.

---

**Pattern 2: Command Pattern (Backend)**

Game actions become command objects for logging, undo, and replay.

```javascript
// Current (direct method calls):
gameManager.attack('light');
gameManager.useItem('potion_hp');

// Target (command objects):
const cmd = new AttackCommand({ type: 'light', target: enemy });
commandExecutor.execute(cmd);
// Automatically logs, validates, and emits state changes
```

**When to apply:** Not required for initial split. Add after Phase 4 if replay/logging needed. This is a future enhancement, not part of the core refactor.

---

**Pattern 3: Repository Pattern (Backend)**

Separate persistence from business logic.

```javascript
// Current (mixed in server.js):
function loadGameSave() { /* file I/O */ }
function saveGameData(player, meta) { /* file I/O */ }

// Target (abstracted):
// src/repositories/save-repository.js
export class SaveRepository {
  async load() { /* file I/O */ }
  async save(state) { /* file I/O */ }
}

// server.js just uses:
const repo = new SaveRepository();
const state = await repo.load();
```

**When to apply:** During Phase 2 Step 2.10 (server cleanup). Extract persistence to `src/repositories/` before final server.js cleanup.

---

**Pattern 4: State Machine (Backend)**

Make phase transitions explicit and validated.

```javascript
// Current (implicit):
getPhase() {
  if (!this.player) return 'no_save';
  if (this.combat) return 'combat';
  // ... complex conditionals
}

// Target (explicit state machine):
// src/game/phase-machine.js
const VALID_TRANSITIONS = {
  'hub': ['ward_selection', 'shop', 'blacksmith'],
  'ward_selection': ['exploring'],
  'exploring': ['combat', 'shop', 'blacksmith', 'hub'],
  'combat': ['victory', 'defeat'],
  // ...
};

export function transition(from, to) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
  return to;
}
```

**When to apply:** During Phase 4 Step 4.2 (RunManager extraction). The phase logic naturally belongs in RunManager.

---

**Pattern 5: Service Layer (Backend)**

Domain services with single responsibilities.

```javascript
// Current (GameManager does everything):
class GameManager {
  attack() { /* combat */ }
  buyFromShop() { /* economy */ }
  purchaseUpgrade() { /* progression */ }
  proceedToNextRoom() { /* exploration */ }
}

// Target (focused services):
// src/game/services/combat-service.js
export class CombatService {
  constructor(eventBus) { this.events = eventBus; }
  executeAttack(attacker, defender, type) { /* only combat */ }
}

// src/game/services/economy-service.js
export class EconomyService {
  buyItem(player, item, shop) { /* only economy */ }
}

// GameManager becomes coordinator:
class GameManager {
  constructor() {
    this.combat = new CombatService(eventBus);
    this.economy = new EconomyService(eventBus);
  }
}
```

**When to apply:** This IS Phase 4. The "managers" we extract become services.

---

**Pattern 6: Observable Store (Frontend)**

Reactive state management for UI updates.

```javascript
// Current (manual updates):
gameState = await apiCall('/api/game/state');
updateUI(); // Must remember to call this everywhere

// Target (reactive):
// public/js/store.js
class Store {
  constructor() {
    this.state = {};
    this.listeners = [];
  }
  setState(newState) {
    this.state = newState;
    this.listeners.forEach(fn => fn(this.state));
  }
  subscribe(fn) {
    this.listeners.push(fn);
  }
}

export const store = new Store();

// In game.js:
store.subscribe(updateUI); // Auto-updates on any state change
store.setState(await api.getGameState());
```

**When to apply:** During Phase 5 Step 5.2 (settings module). Create `public/js/store.js` as foundation, then modules subscribe to relevant state slices.

---

### Architecture Integration into Phases

| Phase | Architectural Pattern Applied |
|-------|------------------------------|
| Phase 1 | **API Client**: Single source of truth for server communication |
| Phase 2 | **Repository Pattern**: Extract persistence to `src/repositories/` |
| Phase 3 | **Data/Logic Separation**: Definitions vs behavior in separate files |
| Phase 4 | **Service Layer + Event Bus**: Managers become services with events |
| Phase 5 | **Observable Store**: Frontend state management foundation |

### What We're NOT Doing (Intentionally)

1. **No framework adoption** (React, Vue, etc.) - Keep vanilla JS, but organized
2. **No Entity-Component-System** - Overkill for this game's complexity
3. **No full CQRS** - Simple state sync is sufficient
4. **No microservices** - Stay monorepo, just better organized
5. **No GraphQL** - REST endpoints are fine, just organized

### Migration Safety Rules

1. **Never break the API contract** - Frontend expects specific response shapes
2. **Never change behavior during extraction** - Pure refactor, no fixes
3. **Always maintain backwards compatibility** - Old imports still work via re-exports
4. **Test after every step** - `npm test` must pass
5. **One concern per step** - Don't mix extraction with architecture changes

---

## Phase 1: Frontend API Extraction

**Goal**: Extract all server calls from `game.js` into `public/js/api.js`
**Impact**: Reduce game.js by ~500 lines, create portable API client
**Prerequisite**: None - this is the first step

### Step 1.1: Create API module scaffold

**What**: Create `public/js/api.js` with the core `apiCall` wrapper only.

**Files changed**:
- Create `public/js/api.js` (~40 lines)

**Changes**:
```javascript
// public/js/api.js
function getApiKeys() {
  // Extract from game.js - reads localStorage
}

async function apiCall(endpoint, body = {}) {
  // Extract from game.js - the fetch wrapper
}

export { apiCall, getApiKeys };
```

**Verification**: File exists, exports work (manual check)

---

### Step 1.2: Convert game.html to ES modules

**What**: Add `type="module"` to game.html script tag, update game.js to use imports.

**Files changed**:
- `public/game.html` (1 line change)
- `public/game.js` (add import at top)

**Changes**:
```html
<!-- game.html -->
<script type="module" src="game.js"></script>
```

```javascript
// game.js top
import { apiCall, getApiKeys } from './js/api.js';
```

**Verification**: `npm test` - page loads, basic functionality works

---

### Step 1.3: Extract game state endpoints

**What**: Move these read-only endpoints to api.js:
- `getGameState()`
- `getMetaProgression()`
- `getSettings()`

**Files changed**:
- `public/js/api.js` (+30 lines)
- `public/game.js` (update 3 call sites)

**Verification**: `npm test` - state loads correctly

---

### Step 1.4: Extract player management endpoints

**What**: Move player endpoints:
- `createPlayer()`
- `allocateStat()`
- `getUpgrades()`
- `purchaseUpgrade()`

**Files changed**:
- `public/js/api.js` (+40 lines)
- `public/game.js` (update 4 call sites)

**Verification**: `npm test` - character creation works

---

### Step 1.5: Extract run management endpoints

**What**: Move run endpoints:
- `startRun()`
- `forfeitRun()`
- `enterFloor()`
- `getStartingWards()`
- `selectStartingWard()`

**Files changed**:
- `public/js/api.js` (+50 lines)
- `public/game.js` (update 5 call sites)

**Verification**: `npm test` - can start and forfeit runs

---

### Step 1.6: Extract room exploration endpoints

**What**: Move room endpoints:
- `proceed()`
- `interactTrap()`
- `lootBody()`
- `openTreasure()`

**Files changed**:
- `public/js/api.js` (+40 lines)
- `public/game.js` (update 4 call sites)

**Verification**: `npm test` - room exploration works

---

### Step 1.7: Extract combat endpoints

**What**: Move combat endpoints:
- `attack()`
- `defend()`
- `flee()`
- `useItem()`
- `useSkill()`
- `enemyTurn()`

**Files changed**:
- `public/js/api.js` (+60 lines)
- `public/game.js` (update 6 call sites)

**Verification**: `npm test` - combat works end-to-end

---

### Step 1.8: Extract shop/economy endpoints

**What**: Move economy endpoints:
- `shopBuy()`
- `refine()`
- `equipChip()`
- `unequipChip()`
- `getChipLoadout()`

**Files changed**:
- `public/js/api.js` (+50 lines)
- `public/game.js` (update 5 call sites)

**Verification**: `npm test` - shop and chips work

---

### Step 1.9: Extract vocab/JPDB endpoints

**What**: Move vocabulary endpoints:
- `getVocabSuggestions()`
- `submitVocabAnswer()`
- `getWordStates()`
- `jpdbLookup()`

**Files changed**:
- `public/js/api.js` (+40 lines)
- `public/game.js` (update 4 call sites)

**Verification**: `npm test` - vocab review works

---

### Step 1.10: Extract remaining endpoints and cleanup

**What**: Move any remaining endpoints, remove old `apiCall` from game.js.

**Files changed**:
- `public/js/api.js` (+30 lines final)
- `public/game.js` (-80 lines removing old apiCall and duplicates)

**Verification**:
- `npm test` passes
- `grep -r "fetch\(" public/game.js` returns 0 results
- `grep -r "apiCall" public/game.js` only shows imports

**Phase 1 Complete**: game.js reduced by ~500 lines

---

## Phase 2: Server Route Organization

**Goal**: Organize 86 endpoints into logical route modules
**Impact**: Reduce server.js by ~1000 lines, improve maintainability
**Prerequisite**: None (independent of Phase 1)

### Step 2.1: Create route directory structure

**What**: Create `src/routes/` with index.js that server.js will import.

**Files changed**:
- Create `src/routes/index.js` (~20 lines, empty router aggregator)
- `server.js` (add single import, no route changes yet)

**Verification**: Server starts, all endpoints work

---

### Step 2.2: Extract settings routes

**What**: Move `/api/config` and `/api/settings` routes.

**Files changed**:
- Create `src/routes/settings.js` (~50 lines)
- `src/routes/index.js` (add import)
- `server.js` (remove 2 route handlers)

**Verification**: `npm test` - settings work

---

### Step 2.3: Extract TTS routes

**What**: Move `/api/tts/*` routes (4 endpoints).

**Files changed**:
- Create `src/routes/tts.js` (~80 lines)
- `src/routes/index.js` (add import)
- `server.js` (remove 4 route handlers)

**Verification**: TTS endpoints work (manual test)

---

### Step 2.4: Extract vocab routes

**What**: Move `/api/vocab/*` and `/api/jpdb/*` routes.

**Files changed**:
- Create `src/routes/vocab.js` (~100 lines)
- `src/routes/index.js` (add import)
- `server.js` (remove vocab route handlers)

**Verification**: `npm test` - vocab features work

---

### Step 2.5: Extract game state routes

**What**: Move game state read endpoints:
- `/api/game/state`
- `/api/game/meta`
- `/api/game/stats`

**Files changed**:
- Create `src/routes/game/state.js` (~60 lines)
- Create `src/routes/game/index.js` (~20 lines)
- `src/routes/index.js` (add game routes)
- `server.js` (remove handlers)

**Verification**: `npm test` - game state loads

---

### Step 2.6: Extract player routes

**What**: Move player management endpoints.

**Files changed**:
- Create `src/routes/game/player.js` (~80 lines)
- `src/routes/game/index.js` (add import)
- `server.js` (remove handlers)

**Verification**: `npm test` - player creation works

---

### Step 2.7: Extract run routes

**What**: Move run management endpoints.

**Files changed**:
- Create `src/routes/game/run.js` (~100 lines)
- `src/routes/game/index.js` (add import)
- `server.js` (remove handlers)

**Verification**: `npm test` - runs work

---

### Step 2.8: Extract combat routes

**What**: Move combat action endpoints.

**Files changed**:
- Create `src/routes/game/combat.js` (~120 lines)
- `src/routes/game/index.js` (add import)
- `server.js` (remove handlers)

**Verification**: `npm test` - combat works

---

### Step 2.9: Extract economy routes

**What**: Move shop/chip/economy endpoints.

**Files changed**:
- Create `src/routes/game/economy.js` (~100 lines)
- `src/routes/game/index.js` (add import)
- `server.js` (remove handlers)

**Verification**: `npm test` - shop works

---

### Step 2.10: Extract remaining routes and cleanup

**What**: Move debug, prefetch, and any remaining routes.

**Files changed**:
- Create `src/routes/game/debug.js` (~60 lines)
- Create `src/routes/prefetch.js` (~80 lines)
- `server.js` (final cleanup, remove all route handlers)

**Verification**:
- `npm test` passes
- `server.js` only contains: imports, middleware, static serving, route mounting
- All 86 endpoints still work

**Final server.js structure**:
```javascript
// server.js (~100 lines)
import express from 'express';
import routes from './src/routes/index.js';
// ... middleware setup
app.use('/api', routes);
// ... error handling, listen
```

**Phase 2 Complete**: server.js reduced from 1,798 to ~100 lines

---

## Phase 3: Backend Large File Splits

**Goal**: Split 3,800+ line files into focused modules
**Impact**: Easier maintenance, better code navigation
**Prerequisite**: None (independent of Phases 1-2)

### Step 3.1: Split chips.js - Extract definitions

**What**: Move CHIPS constant and category definitions to separate file.

**Files changed**:
- Create `src/game/items/chip-definitions.js` (~600 lines)
- `src/game/items/chips.js` (import from definitions, -500 lines)

**Verification**: `npm test` - chips work

---

### Step 3.2: Split chips.js - Extract pipeline

**What**: Move `executeChipPipeline()` and related functions.

**Files changed**:
- Create `src/game/items/chip-pipeline.js` (~400 lines)
- `src/game/items/chips.js` (import and re-export, -350 lines)

**Verification**: `npm test` - pipeline chips work

---

### Step 3.3: Split chips.js - Extract upgrades

**What**: Move chip upgrade/refinement logic.

**Files changed**:
- Create `src/game/items/chip-upgrades.js` (~300 lines)
- `src/game/items/chips.js` (import and re-export, -250 lines)

**Verification**: `npm test` - chip upgrades work

---

### Step 3.4: Split chips.js - Extract on-event processors

**What**: Move `processChipEffects()` and event handlers.

**Files changed**:
- Create `src/game/items/chip-events.js` (~500 lines)
- `src/game/items/chips.js` (import and re-export, -450 lines)

**Verification**: `npm test` - chip effects trigger correctly

---

### Step 3.5: Cleanup chips.js index

**What**: Convert chips.js to a re-export index file.

**Files changed**:
- `src/game/items/chips.js` (becomes ~100 line re-export file)
- `src/game/items/index.js` (update if needed)

**Verification**: `npm test` - all chip features work

**chips.js complete**: 3,894 lines → 5 files of ~400-600 lines each

---

### Step 3.6: Split enemies.js - Extract definitions

**What**: Move ENEMIES constant to separate file.

**Files changed**:
- Create `src/game/enemies/definitions.js` (~1,200 lines)
- Create `src/game/enemies/index.js` (~30 lines)
- `src/game/enemies.js` (becomes re-export wrapper)

**Verification**: `npm test` - enemies spawn correctly

---

### Step 3.7: Split enemies.js - Extract generation

**What**: Move `generateEnemy()` and related functions.

**Files changed**:
- Create `src/game/enemies/generation.js` (~400 lines)
- `src/game/enemies/index.js` (add export)

**Verification**: `npm test` - enemy generation works

---

### Step 3.8: Split enemies.js - Extract boss logic

**What**: Move boss definitions and boss-specific behavior.

**Files changed**:
- Create `src/game/enemies/bosses.js` (~400 lines)
- `src/game/enemies/index.js` (add export)

**Verification**: `npm test` - boss fights work

---

### Step 3.9: Split enemies.js - Extract AI/intent

**What**: Move intent selection and behavior logic.

**Files changed**:
- Create `src/game/enemies/ai.js` (~600 lines)
- `src/game/enemies/index.js` (add export)

**Verification**: `npm test` - enemy behavior works

---

### Step 3.10: Cleanup enemies.js

**What**: Final cleanup, ensure enemies.js is just a re-export.

**Files changed**:
- `src/game/enemies.js` (slim down to re-export only)

**Verification**: `npm test` passes

**enemies.js complete**: 3,818 lines → 5 files of ~400-600 lines each

---

## Phase 4: GameManager Decomposition

**Goal**: Split loop.js (GameManager) into focused services with event-based communication
**Impact**: Single responsibility, easier testing, decoupled components
**Prerequisite**: Phase 3 complete (cleaner dependencies)
**Architecture**: Applies Service Layer + Event Bus patterns

### Step 4.0: Create Event Bus foundation

**What**: Create lightweight event bus for decoupled communication between services.

**Files changed**:
- Create `src/game/events.js` (~50 lines)

**Implementation**:
```javascript
// src/game/events.js
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback); // Return unsubscribe fn
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx > -1) callbacks.splice(idx, 1);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }
}

export const eventBus = new EventBus();

// Event types for type safety and documentation
export const GameEvents = {
  STATE_CHANGED: 'state:changed',
  COMBAT_STARTED: 'combat:started',
  COMBAT_ENDED: 'combat:ended',
  DAMAGE_DEALT: 'combat:damage',
  ROOM_ENTERED: 'exploration:room',
  ITEM_ACQUIRED: 'inventory:item',
  GOLD_CHANGED: 'economy:gold',
  NARRATION: 'ui:narration'
};
```

**Verification**: Unit test the event bus (create simple test)

**Why first**: All services will import this. Must exist before extraction.

---

### Step 4.1: Create Phase State Machine

**What**: Extract phase logic into explicit state machine with valid transitions.

**Files changed**:
- Create `src/game/phase-machine.js` (~80 lines)
- `src/game/loop.js` (use phase machine in getPhase(), -20 lines)

**Implementation**:
```javascript
// src/game/phase-machine.js
export const PHASES = {
  NO_SAVE: 'no_save',
  HUB: 'hub',
  WARD_SELECTION: 'ward_selection',
  EXPLORING: 'exploring',
  COMBAT: 'combat',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  SHOP: 'shop',
  BLACKSMITH: 'blacksmith',
  POST_COMBAT_SHOP: 'post_combat_shop',
  BOSS_DEFEATED: 'boss_defeated',
  RUN_COMPLETE: 'run_complete'
};

const VALID_TRANSITIONS = {
  [PHASES.NO_SAVE]: [PHASES.HUB],
  [PHASES.HUB]: [PHASES.WARD_SELECTION, PHASES.SHOP, PHASES.BLACKSMITH],
  [PHASES.WARD_SELECTION]: [PHASES.EXPLORING],
  [PHASES.EXPLORING]: [PHASES.COMBAT, PHASES.SHOP, PHASES.BLACKSMITH, PHASES.BOSS_DEFEATED],
  [PHASES.COMBAT]: [PHASES.VICTORY, PHASES.DEFEAT],
  [PHASES.VICTORY]: [PHASES.POST_COMBAT_SHOP, PHASES.EXPLORING],
  [PHASES.DEFEAT]: [PHASES.HUB],
  // ... complete mapping
};

export function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function derivePhase(state) {
  // Extract current getPhase() logic here
}
```

**Verification**: `npm test` - phase transitions still work correctly

---

### Step 4.2: Extract CombatService

**What**: Move combat orchestration to dedicated service with event emissions.

**Files changed**:
- Create `src/game/services/combat-service.js` (~350 lines)
- Create `src/game/services/index.js` (~20 lines)
- `src/game/loop.js` (delegate to CombatService, -300 lines)

**Key changes**:
```javascript
// src/game/services/combat-service.js
import { eventBus, GameEvents } from '../events.js';

export class CombatService {
  constructor(gameState) {
    this.state = gameState;
  }

  executeAttack(attackType) {
    // Move attack logic from GameManager
    const result = executePlayerAttack(/*...*/);

    // Emit events instead of manual callbacks
    eventBus.emit(GameEvents.DAMAGE_DEALT, {
      source: 'player',
      target: this.state.combat.enemy,
      damage: result.damage
    });

    return result;
  }

  // ... other combat methods
}
```

**Verification**: `npm test` - combat works

---

### Step 4.3: Extract ExplorationService

**What**: Move room navigation, ward selection, and dungeon progression.

**Files changed**:
- Create `src/game/services/exploration-service.js` (~400 lines)
- `src/game/services/index.js` (add export)
- `src/game/loop.js` (delegate, -350 lines)

**Verification**: `npm test` - exploration works

---

### Step 4.4: Extract EconomyService

**What**: Move shop, refinement, and chip management.

**Files changed**:
- Create `src/game/services/economy-service.js` (~300 lines)
- `src/game/services/index.js` (add export)
- `src/game/loop.js` (delegate, -250 lines)

**Verification**: `npm test` - shop and chips work

---

### Step 4.5: Extract ProgressionService

**What**: Move meta-progression, upgrades, and achievements.

**Files changed**:
- Create `src/game/services/progression-service.js` (~200 lines)
- `src/game/services/index.js` (add export)
- `src/game/loop.js` (delegate, -150 lines)

**Verification**: `npm test` - upgrades work

---

### Step 4.6: GameManager becomes Coordinator

**What**: GameManager now only coordinates services, holds shared state, and handles persistence hooks.

**Files changed**:
- `src/game/loop.js` (final refactor to coordinator pattern)

**Final GameManager structure**:
```javascript
// src/game/loop.js (~400 lines - down from 2,789)
import { eventBus, GameEvents } from './events.js';
import { CombatService } from './services/combat-service.js';
import { ExplorationService } from './services/exploration-service.js';
import { EconomyService } from './services/economy-service.js';
import { ProgressionService } from './services/progression-service.js';
import { derivePhase } from './phase-machine.js';

export class GameManager {
  constructor() {
    // Shared state
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;

    // Services (lazy init or inject)
    this.combatService = null;
    this.explorationService = null;
    this.economyService = null;
    this.progressionService = null;

    // Subscribe to events for state sync
    eventBus.on(GameEvents.STATE_CHANGED, () => this.onStateChanged());
  }

  // Delegate to services
  attack(type) {
    return this.combatService.executeAttack(type);
  }

  // Coordinator methods
  getPhase() {
    return derivePhase({ player: this.player, run: this.run, combat: this.combat });
  }

  getState() {
    return { player: this.player, run: this.run, combat: this.combat, meta: this.meta };
  }
}
```

**Verification**:
- `npm test` passes
- `loop.js` under 500 lines
- All game features work

**Phase 4 Complete**:
- loop.js: 2,789 → ~400 lines (coordinator only)
- 4 focused services + event bus + phase machine
- Decoupled via events, testable in isolation

---

## Phase 5: Frontend Secondary Extractions

**Goal**: Further modularize game.js beyond API layer with reactive state management
**Impact**: Prepare for future React/framework migration
**Prerequisite**: Phase 1 complete
**Architecture**: Applies Observable Store pattern

### Step 5.0: Create Observable Store foundation

**What**: Create a simple reactive store that auto-triggers UI updates on state changes.

**Files changed**:
- Create `public/js/store.js` (~60 lines)
- `public/game.js` (integrate store, wire up updateUI)

**Implementation**:
```javascript
// public/js/store.js
class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Map(); // key -> [callbacks]
  }

  // Get current state or a slice
  get(key = null) {
    return key ? this.state[key] : this.state;
  }

  // Update state and notify listeners
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Notify key-specific listeners
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(value, oldValue));
    }

    // Notify global listeners
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => cb(this.state));
    }
  }

  // Batch update multiple keys
  update(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.state[key] = value;
    });

    // Single notification for batch
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => cb(this.state));
    }
  }

  // Subscribe to changes
  subscribe(keyOrCallback, callback = null) {
    const key = callback ? keyOrCallback : '*';
    const cb = callback || keyOrCallback;

    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(cb);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      const idx = callbacks.indexOf(cb);
      if (idx > -1) callbacks.splice(idx, 1);
    };
  }
}

export const store = new Store({
  gameState: null,
  ttsEnabled: true,
  isLoading: false
});
```

**Integration in game.js**:
```javascript
import { store } from './js/store.js';

// Replace: gameState = await apiCall('/api/game/state');
// With:
const response = await apiCall('/api/game/state');
store.update({ gameState: response, isLoading: false });

// Auto-update UI on any state change
store.subscribe(updateUI);

// Modules can subscribe to specific slices
store.subscribe('ttsEnabled', (enabled) => {
  // React to TTS toggle
});
```

**Verification**: UI still updates correctly, no manual updateUI() calls needed after state changes

**Why first**: All other Phase 5 modules will use the store for their state.

---

### Step 5.1: Extract TTS module

**What**: Move VOICEVOX/TTS code to `public/js/tts.js`.

**Files changed**:
- Create `public/js/tts.js` (~150 lines)
- `public/game.js` (import and update calls, -140 lines)

**Verification**: TTS works in game

---

### Step 5.2: Extract settings module

**What**: Move settings management to `public/js/settings.js`.

**Files changed**:
- Create `public/js/settings.js` (~120 lines)
- `public/game.js` (import and update, -110 lines)

**Verification**: Settings persist correctly

---

### Step 5.3: Extract background module

**What**: Move background/ward visual system.

**Files changed**:
- Create `public/js/background.js` (~100 lines)
- `public/game.js` (import and update, -90 lines)

**Verification**: Backgrounds display correctly

---

### Step 5.4: Extract narration module

**What**: Move visual novel narration system.

**Files changed**:
- Create `public/js/narration.js` (~200 lines)
- `public/game.js` (import and update, -180 lines)

**Verification**: Narration displays correctly

---

### Step 5.5: Extract word practice module

**What**: Move vocab review/word practice system.

**Files changed**:
- Create `public/js/word-practice.js` (~250 lines)
- `public/game.js` (import and update, -230 lines)

**Verification**: Word practice works during combat

---

## Execution Guidelines

### Before Each Step

1. **Read the specific functions** you'll be extracting
2. **Identify all call sites** in the source file
3. **Check for hidden dependencies** (closures, shared state)
4. **Create the new file** with extracted code
5. **Update imports** in the source file
6. **Run `npm test`** immediately

### After Each Step

1. **Commit immediately**: `git commit -m "refactor: <step description>"`
2. **Verify no behavior change**: manual smoke test if needed
3. **Update this spec**: check off completed step

### Red Flags - Stop and Reassess

- Test failures after extraction
- Circular dependency errors
- Need to change >200 lines in one step
- Multiple files need simultaneous changes
- Hidden shared state between modules

### Context Management for Claude Sessions

Each step is designed for a single Claude session to complete:
1. **Tight scope**: One extraction concern per step
2. **Clear inputs**: Which functions to move, where they go
3. **Clear outputs**: Expected file structure, test verification
4. **Reversible**: Easy to git revert if something breaks

---

## Progress Tracking

### Phase 1: Frontend API Extraction
- [x] 1.1 Create API module scaffold
- [x] 1.2 Convert game.html to ES modules
- [x] 1.3 Extract game state endpoints
- [x] 1.4 Extract player management endpoints
- [x] 1.5 Extract run management endpoints
- [x] 1.6 Extract room exploration endpoints
- [x] 1.7 Extract combat endpoints
- [ ] 1.8 Extract shop/economy endpoints
- [ ] 1.9 Extract vocab/JPDB endpoints
- [ ] 1.10 Extract remaining endpoints and cleanup

### Phase 2: Server Route Organization
- [ ] 2.1 Create route directory structure
- [ ] 2.2 Extract settings routes
- [ ] 2.3 Extract TTS routes
- [ ] 2.4 Extract vocab routes
- [ ] 2.5 Extract game state routes
- [ ] 2.6 Extract player routes
- [ ] 2.7 Extract run routes
- [ ] 2.8 Extract combat routes
- [ ] 2.9 Extract economy routes
- [ ] 2.10 Extract remaining routes and cleanup

### Phase 3: Backend Large File Splits
- [ ] 3.1 Split chips.js - Extract definitions
- [ ] 3.2 Split chips.js - Extract pipeline
- [ ] 3.3 Split chips.js - Extract upgrades
- [ ] 3.4 Split chips.js - Extract on-event processors
- [ ] 3.5 Cleanup chips.js index
- [ ] 3.6 Split enemies.js - Extract definitions
- [ ] 3.7 Split enemies.js - Extract generation
- [ ] 3.8 Split enemies.js - Extract boss logic
- [ ] 3.9 Split enemies.js - Extract AI/intent
- [ ] 3.10 Cleanup enemies.js

### Phase 4: GameManager Decomposition
- [ ] 4.0 Create Event Bus foundation
- [ ] 4.1 Create Phase State Machine
- [ ] 4.2 Extract CombatService
- [ ] 4.3 Extract ExplorationService
- [ ] 4.4 Extract EconomyService
- [ ] 4.5 Extract ProgressionService
- [ ] 4.6 GameManager becomes Coordinator

### Phase 5: Frontend Secondary Extractions
- [ ] 5.0 Create Observable Store foundation
- [ ] 5.1 Extract TTS module
- [ ] 5.2 Extract settings module
- [ ] 5.3 Extract background module
- [ ] 5.4 Extract narration module
- [ ] 5.5 Extract word practice module

### Phase 6: Frontend UI Module Extraction
- [ ] 6.0 Extract Combat UI module
- [ ] 6.1 Extract Room/Exploration UI module
- [ ] 6.2 Extract Shop/Economy UI module
- [ ] 6.3 Extract Character/Stats UI module
- [ ] 6.4 Extract Modals module
- [ ] 6.5 Extract Realtime Combat module
- [ ] 6.6 Game.js becomes UI coordinator

---

## Phase 6: Frontend UI Module Extraction

**Goal**: Break down the remaining game.js UI code into focused modules
**Impact**: Reduce game.js from ~5,900 to ~2,500 lines (core orchestration only)
**Prerequisite**: Phase 5 complete (store foundation in place)
**Architecture**: Component-style modules that subscribe to store slices

### Step 6.0: Extract Combat UI module

**What**: Move combat rendering, action buttons, and combat-specific UI updates.

**Files changed**:
- Create `public/js/ui/combat.js` (~500 lines)
- `public/game.js` (import and delegate, -480 lines)

**Includes**:
- `COMBAT ACTIONS` section (~284 lines)
- `COMBAT UI` section (~223 lines)
- Combat-related parts of `updateUI()`

**Verification**: Combat UI renders correctly, actions work

---

### Step 6.1: Extract Room/Exploration UI module

**What**: Move room exploration, dungeon navigation, and content views.

**Files changed**:
- Create `public/js/ui/exploration.js` (~450 lines)
- `public/game.js` (import and delegate, -430 lines)

**Includes**:
- `ROOM EXPLORATION UI` section (~265 lines)
- `CONTENT VIEWS` section (~150 lines)
- Room-related parts of `updateUI()`

**Verification**: Room navigation works, content displays

---

### Step 6.2: Extract Shop/Economy UI module

**What**: Move shop, blacksmith, and chip upgrade UI.

**Files changed**:
- Create `public/js/ui/economy.js` (~850 lines)
- `public/game.js` (import and delegate, -820 lines)

**Includes**:
- `SHOP FUNCTIONS` section (~307 lines)
- `BLACKSMITH FUNCTIONS` section (~129 lines)
- `CHIP UPGRADE (MODDER) FUNCTIONS` section (~390 lines)

**Verification**: Shop, blacksmith, and modder all work

---

### Step 6.3: Extract Character/Stats UI module

**What**: Move stat allocation, character creation, and VN stage rendering.

**Files changed**:
- Create `public/js/ui/character.js` (~800 lines)
- `public/game.js` (import and delegate, -780 lines)

**Includes**:
- `STAT ALLOCATION` section (~488 lines)
- `VN STAGE UPDATES` section (~305 lines)

**Verification**: Character creation works, sprites render

---

### Step 6.4: Extract Modals module

**What**: Move all modal dialogs to a dedicated module.

**Files changed**:
- Create `public/js/ui/modals.js` (~1,000 lines)
- `public/game.js` (import and delegate, -950 lines)

**Includes**:
- `MODALS` section (~125 lines)
- `CHIP SLOT MODAL` section (~428 lines)
- `LIBERATION TRACKER` section (~391 lines)
- `GAME STATS MODAL` section (~155 lines)

**Verification**: All modals open/close correctly

---

### Step 6.5: Extract Realtime Combat module

**What**: Move the realtime/timer-based combat system (if still used).

**Files changed**:
- Create `public/js/ui/realtime-combat.js` (~480 lines)
- `public/game.js` (import and delegate, -470 lines)

**Includes**:
- `REALTIME COMBAT FUNCTIONS` section (~474 lines)

**Verification**: Realtime combat mode works (if enabled)

---

### Step 6.6: Game.js becomes UI coordinator

**What**: Final cleanup - game.js only handles initialization and orchestration.

**Files changed**:
- `public/game.js` (final cleanup)
- Create `public/js/ui/index.js` (re-export all UI modules)

**Final game.js structure**:
```javascript
// public/game.js (~800 lines - down from 7,301)
import { store } from './js/store.js';
import { api } from './js/api.js';
import * as ui from './js/ui/index.js';

// ============ STATE ============
// ~80 lines - gameState, ttsEnabled, etc.

// ============ DOM ELEMENTS ============
// ~95 lines - cached element references

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const state = await api.getGameState();
  store.update({ gameState: state });
  store.subscribe(ui.updateAll);
  setupKeyboardShortcuts();
}

// ============ KEYBOARD SHORTCUTS ============
// ~100 lines - event listeners for Enter, R, 1-5, etc.

// ============ UI COORDINATOR ============
// ~50 lines - updateUI() that dispatches to ui modules

// ============ EVENT WIRING ============
// ~200 lines - connecting UI events to API calls
```

**What remains in game.js:**
| Section | Lines | Why it stays |
|---------|-------|--------------|
| State variables | ~80 | Shared across modules |
| DOM element cache | ~95 | Shared element refs |
| Initialization | ~180 | App bootstrap |
| Keyboard shortcuts | ~100 | Global handlers |
| updateUI coordinator | ~50 | Dispatch to modules |
| Event wiring | ~200 | Glue code |
| **Total** | **~700-800** | |

**Verification**:
- `npm test` passes
- All UI features work
- game.js under 1,000 lines ✓

**Phase 6 Complete**:
- game.js: 5,900 → ~800 lines (89% reduction from original 7,301)
- 6 focused UI modules in `public/js/ui/`
- Each module subscribes to relevant store slices
- Clear separation: orchestration vs rendering

---

## Summary

| Phase | Steps | Lines Moved | Primary File Impact | Architecture Pattern |
|-------|-------|-------------|---------------------|---------------------|
| 1 | 10 | ~500 | game.js: 7,301 → 6,800 | API Client |
| 2 | 10 | ~1,200 | server.js: 1,798 → ~100 | Repository Pattern |
| 3 | 10 | ~6,500 | chips.js + enemies.js → 10 files | Data/Logic Separation |
| 4 | 7 | ~2,400 | loop.js: 2,789 → ~400 | Service Layer + Event Bus |
| 5 | 6 | ~900 | game.js: 6,800 → ~5,900 | Observable Store |
| 6 | 7 | ~5,100 | game.js: 5,900 → ~800 | UI Components |

**Total: 50 steps, each independently committable and testable**

After completion:
- **No file over 1,000 lines** (enforced, not aspirational)
- Clear module boundaries with single responsibilities
- Event-driven backend communication
- Reactive frontend state management
- Easy to find code by feature area
- Ready for React migration or other framework adoption

---

## Architecture Before/After

**Before:**
```
server.js (1,798 lines, 86 endpoints)
    └─ GameManager (2,789 lines, god class)
           └─ Manual emitState() everywhere

game.js (7,301 lines, everything global)
    └─ Manual updateUI() everywhere
```

**After:**
```
src/
├── routes/                    # HTTP layer only
│   ├── game/
│   │   ├── combat.js
│   │   ├── exploration.js
│   │   └── economy.js
│   └── index.js
├── repositories/
│   └── save-repository.js     # Persistence abstraction
├── game/
│   ├── events.js              # Event bus
│   ├── phase-machine.js       # State machine
│   ├── services/              # Business logic
│   │   ├── combat-service.js
│   │   ├── exploration-service.js
│   │   ├── economy-service.js
│   │   └── progression-service.js
│   └── loop.js                # Coordinator (~400 lines)

public/js/
├── api.js                     # Server communication
├── store.js                   # Observable state
├── tts.js                     # Audio
├── settings.js                # Configuration
├── background.js              # Ward visuals
├── narration.js               # VN system
├── word-practice.js           # Vocab review
└── ui/                        # UI components
    ├── index.js               # Re-exports
    ├── combat.js              # Combat UI (~500 lines)
    ├── exploration.js         # Room/dungeon UI (~450 lines)
    ├── economy.js             # Shop/blacksmith/modder (~850 lines)
    ├── character.js           # Stats/VN stage (~800 lines)
    ├── modals.js              # All modals (~1,000 lines)
    └── realtime-combat.js     # Timer combat (~480 lines)

server.js (~100 lines)         # Just wiring
game.js (~800 lines)           # UI coordinator only
```

This architecture enables:
- **Unit testing** services in isolation
- **Swapping implementations** (different persistence, different AI)
- **Framework migration** (React could consume the store)
- **Feature flags** via event bus
- **Debugging** with event logging
