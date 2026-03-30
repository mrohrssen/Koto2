# Koto vs PokeRogue Comparison Page — Design Spec

> **Date:** 2026-03-30
> **Output:** `public/koto-vs-pokerogue.html`
> **Purpose:** Side-by-side feature comparison for dev team — track parity, gaps, and Koto-unique features

## Goal

Create a single self-contained HTML page comparing Koto and PokeRogue feature-by-feature. Three tiers of detail: scannable feature matrix at top, per-system comparison sections, and inline mechanical detail (formulas, constants).

## Audience

Dev team. Accuracy and completeness over polish.

## Structure

### Feature Matrix (top of page)

Sticky-header table with columns: System | PokeRogue | Koto | Status | Key Difference. Each row links to the detailed section. Status badges: Built (green), Not Built (red), N/A (gray).

### Chapters (mirror PokeRogue's 8 + 3 Koto-unique)

1. **The Run** — wave structure vs area/room, game modes, win conditions, scaling
2. **Battle** — damage formulas, type chart (18 vs 5 elements), stats, status effects, turn order
3. **Party Building** — starters/budget vs collection, IVs/natures vs simplified stats, evolution, recruitment
4. **Items & Modifiers** — modifier tiers vs items, shops, stacking, equipment
5. **Economy & Progression** — money curves, meta-progression, achievements, unlockables
6. **Gacha & Eggs** — gacha system vs befriend mechanic
7. **Mystery Encounters** — event system vs room variety (shrines, quizzes, word discovery, whack-a-mole, skill master)
8. **AI & Trainers** — enemy AI, trainer configs vs NPC system
9. **Vocabulary & Learning** *(Koto-unique)* — JPDB, i+1, vocab cards, speed review, word discovery, hiragana SRS
10. **NPC Dialogue System** *(Koto-unique)* — AI dialogue, character cards, bonds, memory, vocab repair
11. **Audio & TTS** *(Koto-unique)* — VOICEVOX, speakers, caching

### Per-Chapter Format

- Brief intro for both games' version of the system
- Side-by-side comparison (two-column or table)
- Formulas/constants in parallel where both exist
- "Koto-unique" callout boxes (gold border)
- "Gap" callout boxes for missing features (red border)
- Implementation status badges inline

## Visual Design

- Same dark theme as v1 (`pokerogue-reference.html`) — reuse CSS variables
- Drawer nav, search overlay, mobile-friendly
- Two-column comparison: PokeRogue (blue accent #6c8cff), Koto (gold accent #ffb86c)
- Status badges: Built (#6effa8), Not Built (#ff8a8a), N/A (#8b8fa3)
- Cross-links between v1 and v2 in nav drawers

## Build Process

### Phase 1: Parallel Research (11 subagents)

Each agent gets:
- Its PokeRogue reference doc (chapters 1-8) or Koto source files (chapters 9-11)
- The Koto source files relevant to its chapter
- Output format: structured JSON/markdown with comparison data

### Phase 2: Assembly

- Combine all agent outputs into the single HTML page
- Build the feature matrix from agent summaries
- Apply consistent styling

### Phase 3: Verification

- Spot-check key claims against source
- Test the page loads and renders correctly

## Koto Source Files by Chapter

### Ch1 (The Run)
- `src/game/loop.js`, `src/game/state.js`, `src/game/rooms.js`
- `src/game/services/exploration-service.js`
- `data/areas.json`

### Ch2 (Battle)
- `src/game/services/creature-combat-service.js`
- `src/game/combat/effects.js`
- `data/moves.json`

### Ch3 (Party Building)
- `src/game/services/creature-collection-service.js`
- `src/game/creatures.js`
- `data/creatures.json`

### Ch4 (Items)
- `src/game/services/item-service.js`
- `data/items.json`

### Ch5 (Economy)
- `src/game/services/meta-shop-service.js`
- `src/game/state.js` (meta-progression)
- `data/meta-upgrades.json`

### Ch6 (Gacha vs Befriend)
- `src/game/services/creature-combat-service.js` (befriend logic)

### Ch7 (Mystery Encounters vs Rooms)
- `src/game/rooms.js` (ROOM_TYPES)
- `src/game/services/exploration-service.js`

### Ch8 (AI & Trainers vs NPCs)
- `src/game/services/npc-service.js`
- `src/narration-engine/`
- `data/npcs.json`, `data/npc-skills.json`

### Ch9 (Vocab — Koto-unique)
- `src/jpdb.js`, `src/vocab-manager.js`, `src/vocab-repair.js`
- `src/internal-srs.js`, `src/hiragana-deck.js`
- `src/word-tracking.js`

### Ch10 (NPC Dialogue — Koto-unique)
- `src/narration-engine/character-cards.js`
- `src/narration-engine/prompt-assembler.js`
- `src/narration-engine/generation.js`
- `src/narration-engine/dialogue-repair.js`
- `src/npc-memory.js`

### Ch11 (Audio — Koto-unique)
- `src/voicevox.js`, `src/tts.js`
- `src/services/tts-cache.js`, `src/services/tts-dialogue-cache.js`
