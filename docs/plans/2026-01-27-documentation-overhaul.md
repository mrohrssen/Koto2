# Documentation Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all project documentation so the owner can understand the codebase and new Claude sessions can orient quickly.

**Architecture:** Top-down approach - explore actual code to understand current systems, then write documentation from truth. Use subagents to explore each system thoroughly before writing.

**Tech Stack:** Markdown, JSDoc comments

---

## Phase 1: Exploration (Parallel Subagents)

These tasks gather information. Run them in parallel to save time. Each produces a summary that feeds into Phase 2.

### Task 1: Explore Game Flow & Phases

**Goal:** Document all game states and transitions.

**Files to explore:**
- `src/game/loop.js` - GameManager class
- `src/game/phase-machine.js` - Phase definitions and transitions
- `public/js/game.js` - Frontend game loop

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-phases.md`

**Questions to answer:**
1. What are all the game phases/states?
2. What triggers each transition?
3. What happens in each phase?
4. Draw the state machine as ASCII/mermaid diagram

---

### Task 2: Explore Chip System

**Goal:** Document the chip pipeline mechanics completely.

**Files to explore:**
- `src/game/items/chips.js` - Chip logic
- `data/chips.json` - Chip definitions
- `data/chip-config.json` - Configuration
- `src/game/combat/player-actions.js` - Pipeline execution
- `public/js/ui/chip-select.js` - UI for chip selection

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-chips.md`

**Questions to answer:**
1. How many chips can be equipped? Where?
2. What are the pipeline effect types? How does each work?
3. What are chip skills? How do they charge and activate?
4. What are the rarity tiers and their multipliers?
5. How does chip order affect damage calculation?
6. How are chips acquired (shop, drops)?

---

### Task 3: Explore Combat System

**Goal:** Document combat mechanics and damage calculation.

**Files to explore:**
- `src/game/combat/mechanics.js` - Core damage formulas
- `src/game/combat/player-actions.js` - Player turn execution
- `src/game/combat/enemy.js` - Enemy turn execution
- `src/game/combat/chip-skills.js` - Skill/buff system
- `src/game/combat/status-effects.js` - Status effects
- `src/game/enemies.js` - Enemy definitions
- `src/game/stats.js` - Stats system (verify what exists)

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-combat.md`

**Questions to answer:**
1. What stats exist? (Verify if iRO stats are gone)
2. Exact damage formula with example calculation
3. How do enemy intents work?
4. What status effects exist and what do they do?
5. Turn order - who goes first and why?
6. What triggers combat end (victory/defeat)?

---

### Task 4: Explore Ward/Dungeon System

**Goal:** Document dungeon structure and progression.

**Files to explore:**
- `src/game/rooms.js` - Room generation
- `data/wards.json` or similar - Ward definitions (find the file)
- `src/game/enemies.js` - Enemy tiers per floor

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-wards.md`

**Questions to answer:**
1. What are the 7 wards? Names and order
2. How are rooms generated per floor?
3. What room types exist (encounter, shrine, boss)?
4. How does difficulty scale per ward?
5. How does player navigate between wards?

---

### Task 5: Explore Vocabulary Integration

**Goal:** Document JPDB integration and lookup mode.

**Files to explore:**
- `src/jpdb.js` - JPDB API client
- `src/vocab-manager.js` - Vocabulary suggestions
- `public/js/ui/lookup.js` - Lookup mode UI
- `public/js/word-practice.js` - Word practice feature

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-vocab.md`

**Questions to answer:**
1. What is JPDB and how does the game use it?
2. How does lookup mode work? What can be clicked?
3. How are word suggestions generated?
4. What is word practice and when does it trigger?
5. How is vocab data cached?
6. Server-side vs client-side API keys?

---

### Task 6: Explore AI & TTS

**Goal:** Document narration generation and text-to-speech.

**Files to explore:**
- `src/game/dm.js` - Dungeon Master narration
- `src/ai-providers.js` - AI provider abstraction
- `src/voicevox.js` or similar - TTS integration
- `public/js/tts.js` - Frontend TTS

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-ai-tts.md`

**Questions to answer:**
1. What gets narrated and when?
2. How is narration constrained to player vocab level?
3. Which AI providers are supported?
4. How does VOICEVOX integration work?
5. How is TTS audio cached?

---

### Task 7: Explore Meta-Progression

**Goal:** Document between-run progression systems.

**Files to explore:**
- `src/game/state.js` - State factories and persistence
- Look for essence, upgrades, achievements

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-meta.md`

**Questions to answer:**
1. What is essence and how is it earned?
2. What upgrades exist and what do they do?
3. What achievements exist?
4. What persists between runs vs sessions?
5. Where is save data stored?

---

### Task 8: Explore Frontend Architecture

**Goal:** Document how the frontend is organized.

**Files to explore:**
- `public/js/game.js` - Main coordinator
- `public/js/api.js` - Backend communication
- `public/js/store.js` - State management
- `public/js/ui/*.js` - List all UI modules and their purpose

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-frontend.md`

**Questions to answer:**
1. How does game.js coordinate the UI?
2. What are all the UI modules and what does each handle?
3. How does frontend communicate with backend?
4. What's stored in localStorage?
5. How does the swipeable card UI work?

---

### Task 9: Explore Backend Architecture

**Goal:** Document server structure and API endpoints.

**Files to explore:**
- `server.js` - All endpoints
- `src/game/loop.js` - GameManager

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-backend.md`

**Questions to answer:**
1. List all API endpoints grouped by namespace
2. What does each endpoint do?
3. How does GameManager coordinate game logic?
4. What services exist?

---

### Task 10: Explore Data Schemas

**Goal:** Document all JSON data file structures.

**Files to explore:**
- `data/*.json` - All data files
- Find save file format (.jrpg-save.json)
- Find settings format (.jrpg-settings.json)

**Output:** Write findings to `/private/tmp/claude/-Users-michia-Documents-jrpg/9f4a4c66-f122-434a-95a5-5476a9b2b89a/scratchpad/exploration-data.md`

**Questions to answer:**
1. What data files exist and what's in each?
2. Document schema for each JSON file
3. What's the save file format?
4. What's the settings file format?

---

## Phase 2: Write Documentation (Sequential)

After all exploration tasks complete, synthesize findings into documentation.

### Task 11: Write docs/ARCHITECTURE.md

**Files:**
- Create: `docs/ARCHITECTURE.md`

**Inputs:** All exploration scratchpad files from Tasks 1-10

**Step 1:** Read all exploration outputs from scratchpad

**Step 2:** Write ARCHITECTURE.md with these sections:
- Overview (what the game is)
- Game Flow & Phases (from Task 1)
- Chip System (from Task 2)
- Combat Mechanics (from Task 3)
- Ward System (from Task 4)
- Vocabulary Integration (from Task 5)
- AI Narration & TTS (from Task 6)
- Meta-Progression (from Task 7)
- Frontend Architecture (from Task 8)
- Backend Architecture (from Task 9)
- Data Schemas (from Task 10)
- Key Design Decisions (summarize "why" from plan docs if found)

**Step 3:** Verify accuracy by spot-checking 2-3 claims against actual code

**Step 4:** Commit
```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add comprehensive architecture documentation"
```

---

### Task 12: Write README.md

**Files:**
- Create: `README.md`

**Step 1:** Write README.md with:
- Project title and one-paragraph description
- Quick Start (npm install, npm run dev, open localhost:3000)
- Tech Stack (Express, Vanilla JS, JPDB, AI providers, VOICEVOX)
- Documentation links (Architecture, Art Style, Deployment)
- Environment Variables table
- Contributing section (link to CLAUDE.md)

**Step 2:** Commit
```bash
git add README.md
git commit -m "docs: add README for human contributors"
```

---

### Task 13: Rewrite CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Rewrite CLAUDE.md to contain ONLY:
- Git worktree workflow (keep existing, it's good)
- Testing rules (keep existing, it's critical)
- Quick file reference (brief list, link to ARCHITECTURE.md)
- Coding conventions (keep existing)
- Common mistakes to avoid

**Step 2:** Remove all game system descriptions (chips, stats, combat, etc.) - those now live in ARCHITECTURE.md

**Step 3:** Commit
```bash
git add CLAUDE.md
git commit -m "docs: simplify CLAUDE.md to workflow instructions only"
```

---

### Task 14: Update Backend JSDoc Headers

**Files to modify:**
- `src/game/loop.js`
- `src/game/state.js`
- `src/game/enemies.js`
- `src/game/rooms.js`
- `src/game/items/chips.js`
- `server.js`

**Step 1:** For each file, read current JSDoc header

**Step 2:** Compare against exploration findings - update if stale

**Step 3:** Ensure each header has: PURPOSE, KEY EXPORTS, DEPENDENCIES, ARCHITECTURE NOTES

**Step 4:** Commit
```bash
git add src/game/*.js src/game/items/chips.js server.js
git commit -m "docs: update backend JSDoc headers to match current code"
```

---

### Task 15: Add Frontend JSDoc Headers

**Files to modify:**
- `public/js/game.js`
- `public/js/ui/*.js` (all UI modules)

**Step 1:** Read each file's structure and exports

**Step 2:** Add JSDoc header with: PURPOSE, KEY EXPORTS, DEPENDENCIES

**Step 3:** Commit
```bash
git add public/js/game.js public/js/ui/*.js
git commit -m "docs: add JSDoc headers to frontend modules"
```

---

### Task 16: Archive Old Plan Docs

**Files:**
- Create: `docs/plans/archive/`
- Create: `docs/plans/README.md`
- Move: completed/abandoned plans to archive

**Step 1:** Create archive directory
```bash
mkdir -p docs/plans/archive
```

**Step 2:** Review each plan doc in `docs/plans/`:
- If completed or abandoned → move to archive
- If active work → keep in place

**Step 3:** Create `docs/plans/README.md` explaining folder structure

**Step 4:** Commit
```bash
git add docs/plans/
git commit -m "docs: archive completed plan documents"
```

---

## Verification

After all tasks complete:

1. Read README.md - can a new human understand what this project is?
2. Read ARCHITECTURE.md - does owner understand how the game works?
3. Read CLAUDE.md - can a new Claude session start working immediately?
4. Spot-check 3 JSDoc headers against actual code

---

## Estimated Effort

- Phase 1 (Exploration): 10 parallel subagent tasks
- Phase 2 (Writing): 6 sequential tasks
- Total: ~16 tasks, parallelizable exploration should make this efficient
