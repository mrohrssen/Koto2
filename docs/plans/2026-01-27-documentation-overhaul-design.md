# Documentation Overhaul Design

## Problem

The codebase documentation is outdated and scattered. CLAUDE.md describes systems that no longer exist (iRO stats, armor, weapons). No README exists. JSDoc headers may be stale. 43 plan documents accumulate without tracking.

The owner cannot understand their own codebase from current documentation.

## Goals

1. Owner can read docs and understand how the game works
2. New Claude sessions can orient quickly
3. Human contributors can onboard
4. Documentation stays maintainable

## Deliverables

### 1. README.md (new)
Project landing page for humans:
- One-paragraph description
- Quick start (install, run, open browser)
- Tech stack summary
- Links to Architecture, Art Style, Deployment docs
- Environment variables table
- Link to CLAUDE.md for coding conventions

### 2. docs/ARCHITECTURE.md (new)
Comprehensive system documentation:
- How the game works (player perspective)
- Game flow and phases
- Chip system (the core mechanic)
- Combat mechanics
- Ward/dungeon structure
- Vocabulary integration (JPDB, lookup mode)
- AI narration and TTS
- Meta-progression (essence, upgrades)
- Frontend architecture
- Backend architecture
- API endpoint reference
- Data file schemas
- Key design decisions

Each section requires exploring actual code to document accurately.

### 3. CLAUDE.md (rewrite)
Strip to workflow instructions only:
- Git worktree workflow
- Testing rules (e2e wrapper, thresholds)
- File locations (brief, link to ARCHITECTURE.md for details)
- Coding conventions
- What NOT to do (common mistakes)

Remove all game system descriptions - those belong in ARCHITECTURE.md.

### 4. JSDoc Headers
Update or add file-level documentation:

**Backend (update existing):**
- src/game/loop.js
- src/game/state.js
- src/game/enemies.js
- src/game/rooms.js
- src/game/items/chips.js
- server.js

**Frontend (add new):**
- public/js/game.js
- public/js/ui/*.js (16 modules)

Each header should include:
- PURPOSE: What the file does
- KEY EXPORTS: Main functions/classes
- DEPENDENCIES: What it imports
- ARCHITECTURE: How it fits in the system

### 5. docs/plans/ Cleanup
- Create docs/plans/archive/ folder
- Move completed/abandoned plans to archive
- Keep only active work in main folder
- Add README.md to plans/ explaining the folder structure

## Approach

Use subagents to explore each system thoroughly before writing documentation. Each major section of ARCHITECTURE.md gets its own exploration task.

### Exploration Tasks (parallel where possible)

1. **Game Flow & Phases** - Explore loop.js, phase-machine.js, understand all game states
2. **Chip System** - Explore chips.js, chip-config.json, chips.json, understand pipeline mechanics
3. **Combat System** - Explore combat/, mechanics.js, understand damage calculation
4. **Ward/Dungeon System** - Explore rooms.js, understand floor generation
5. **Vocabulary Integration** - Explore jpdb.js, vocab-manager.js, lookup.js
6. **AI & TTS** - Explore dm.js, ai-providers.js, voicevox.js
7. **Meta-Progression** - Explore state.js for essence, upgrades, achievements
8. **Frontend Architecture** - Explore game.js, ui/ modules, understand coordination
9. **Backend Architecture** - Explore server.js, understand API structure
10. **Data Schemas** - Explore data/*.json files, document shapes

### Writing Tasks (sequential after exploration)

1. Write ARCHITECTURE.md sections based on exploration findings
2. Write README.md
3. Rewrite CLAUDE.md
4. Update/add JSDoc headers
5. Archive old plan docs

## Out of Scope

- OpenAPI/Swagger spec
- Inline code comments (only file-level headers)
- Consolidating deployment docs (RAILWAY_DEPLOY.md etc. are fine)
- Changing any game code

## Success Criteria

- Owner reads ARCHITECTURE.md and understands how the game works
- New Claude session reads CLAUDE.md and can start working immediately
- No documentation references non-existent systems
- JSDoc headers match actual file contents
