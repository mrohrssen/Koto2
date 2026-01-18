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

**Goal**: Split loop.js (GameManager) into focused manager classes
**Impact**: Single responsibility, easier testing
**Prerequisite**: Phase 3 complete (cleaner dependencies)

### Step 4.1: Extract CombatManager

**What**: Move combat orchestration from GameManager to dedicated class.

**Files changed**:
- Create `src/game/managers/combat-manager.js` (~300 lines)
- `src/game/loop.js` (delegate to CombatManager, -250 lines)

**Verification**: `npm test` - combat works

---

### Step 4.2: Extract RunManager

**What**: Move run/dungeon progression logic.

**Files changed**:
- Create `src/game/managers/run-manager.js` (~400 lines)
- `src/game/loop.js` (delegate to RunManager, -350 lines)

**Verification**: `npm test` - runs work

---

### Step 4.3: Extract EconomyManager

**What**: Move shop/economy/chip management logic.

**Files changed**:
- Create `src/game/managers/economy-manager.js` (~300 lines)
- `src/game/loop.js` (delegate to EconomyManager, -250 lines)

**Verification**: `npm test` - shop works

---

### Step 4.4: Extract ProgressionManager

**What**: Move meta-progression/upgrades logic.

**Files changed**:
- Create `src/game/managers/progression-manager.js` (~200 lines)
- `src/game/loop.js` (delegate, -150 lines)

**Verification**: `npm test` - upgrades work

---

### Step 4.5: GameManager cleanup

**What**: GameManager becomes coordinator that delegates to sub-managers.

**Files changed**:
- Create `src/game/managers/index.js` (re-export)
- `src/game/loop.js` (final cleanup)

**Verification**: `npm test` passes

**loop.js complete**: 2,789 lines → 5 files of ~300-500 lines each

---

## Phase 5: Frontend Secondary Extractions

**Goal**: Further modularize game.js beyond API layer
**Impact**: Prepare for future React/framework migration
**Prerequisite**: Phase 1 complete

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
- [ ] 1.1 Create API module scaffold
- [ ] 1.2 Convert game.html to ES modules
- [ ] 1.3 Extract game state endpoints
- [ ] 1.4 Extract player management endpoints
- [ ] 1.5 Extract run management endpoints
- [ ] 1.6 Extract room exploration endpoints
- [ ] 1.7 Extract combat endpoints
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
- [ ] 4.1 Extract CombatManager
- [ ] 4.2 Extract RunManager
- [ ] 4.3 Extract EconomyManager
- [ ] 4.4 Extract ProgressionManager
- [ ] 4.5 GameManager cleanup

### Phase 5: Frontend Secondary Extractions
- [ ] 5.1 Extract TTS module
- [ ] 5.2 Extract settings module
- [ ] 5.3 Extract background module
- [ ] 5.4 Extract narration module
- [ ] 5.5 Extract word practice module

---

## Summary

| Phase | Steps | Lines Moved | Primary File Impact |
|-------|-------|-------------|---------------------|
| 1 | 10 | ~500 | game.js: 7,301 → 6,800 |
| 2 | 10 | ~1,200 | server.js: 1,798 → ~100 |
| 3 | 10 | ~6,500 | chips.js + enemies.js → 10 focused files |
| 4 | 5 | ~1,200 | loop.js: 2,789 → ~500 coordinator |
| 5 | 5 | ~800 | game.js: 6,800 → ~6,000 |

**Total: 40 steps, each independently committable and testable**

After completion:
- No file over 1,000 lines (except data definition files)
- Clear module boundaries with single responsibilities
- Easy to find code by feature area
- Ready for React migration or other framework adoption
