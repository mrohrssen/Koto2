# Game Inspector & Intent Log System

**Date:** 2026-04-15
**Status:** Approved
**Problem:** Bugs fall into three categories — visual ghosts (stale sprites/UI), action blockers (errors that freeze the game), and logic violations (wrong turn order, dead creatures attacking, missing items). Claude cannot effectively find or debug these because every session starts fresh with no understanding of what correct behavior looks like. The user cannot playtest extensively right now.

## Design

### Overview

Four components that work together:

1. **Intent Log** — the game narrates every action with expectations to the console
2. **Inspector** — checks game state vs DOM vs PixiJS vs console errors
3. **Game Rule Invariants** — validated assertions about correct game behavior
4. **Exploratory QA + Regression Tests** — discovered through playtesting, not guessed upfront

### Architecture

```
Game Action (combat turn, item use, phase transition, etc.)
  │
  ├─ [ACT] log: what happened
  │
  ├─ [EXP] log: what should result (derived from game rules + state)
  │
  ├─ Inspector checks:
  │    ├─ UI Consistency: state vs DOM vs PixiJS counts/visibility
  │    ├─ Game Rule Invariants: state itself is valid
  │    └─ Error Detection: any console.error since last [ACT]
  │
  └─ [CHK] log: pass/fail with tag
       ✓           — all checks pass
       DOM_GHOST   — element in DOM/Pixi that shouldn't be
       LOGIC_BUG   — game state violates a rule
       ERROR_THROWN — console error during the action
```

### Component 1: Intent Log

Always-on console logging on every game action. Four prefixes:

- `[ACT]` — what happened (action name, targets, values)
- `[EXP]` — what should result (state changes, UI changes, derived from rules)
- `[ERR]` — console error captured between action and check
- `[CHK]` — pass/fail comparison of expected vs actual

Format is single-line, grep-friendly. Example:

```
[ACT] Player used 疾風 (gust) on Enemy #1 (カゼ, 23hp)
[EXP] Enemy #1 HP: 23→0 (KO). Sprite: animateKO. HP bar: remove. Turn order: exclude. Enemies remaining: 2/3
[CHK] state=2 dom=2 pixi=2 ✓

[ACT] Turn order computed: [Ally#0(spd:42), Enemy#0(spd:38), Ally#1(spd:25)]
[EXP] Enemy#1(0hp,KO) excluded. Order by speed descending.
[CHK] ✓

[ACT] Player receives skill: 突風 for Creature #1
[ERR] TypeError: Cannot read properties of undefined (reading 'moves')
[EXP] Creature #1 moves: 3→4. Skill matches offer.
[CHK] ✗ ERROR_THROWN: action produced console error
```

**Where the code lives: client-side only.** The intent log runs entirely in the browser. Server-side game logic (GameManager, services) is observed indirectly — the client calls an API endpoint, receives the updated state, and the intent log fires based on what changed in the response. There is no server-side logging component.

**Instrumentation strategy:** There is no centralized action dispatch to wrap. Instead, intent log calls are added at each client-side call site — the functions in `combat-loop.js`, `scene.js`, and the API-calling functions in `game.js` that trigger state changes. Each call site gets a small `intentLog.act(...)` / `intentLog.expect(...)` / `intentLog.check(...)` sequence around the action. This is manual per-action instrumentation, not middleware.

**Key call sites to instrument:**

- `public/js/ui/combat-loop.js` — combat turn execution, KOs, victory/defeat
- `public/js/ui/scene.js` — formation rendering, sprite show/hide
- `public/js/game.js` — API calls that mutate state (use item, learn skill, befriend, phase transitions)
- `public/js/ui/move-select.js` — move selection and skill learning
- `public/js/ui/exploration.js` — room entry, encounters

**What gets logged:**

| Domain | Actions logged |
|--------|---------------|
| Combat | Attacks, KOs, turn order computation, combat start/end |
| Buffs/debuffs | Applied, stacked, ticked, expired, cleansed |
| Status effects | Poison/burn tick, immunity checks, removal |
| Party skills | Trigger condition met/unmet, effect applied, targets, cooldown |
| NPC skills | NPC uses skill, effect on targets, visual result |
| Items | Received, used, consumed, buff applied, inventory count |
| Skills/moves | Learned, replaced, PP tracked |
| Creatures | Befriended, party add/remove, swap, KO, revival |
| Phase transitions | From→to, UI elements expected to appear/disappear |
| Exploration | Room entry, encounter triggered, loot |
| Befriend quiz | Triggered, answer submitted, pass/fail, creature side-switch |

### Component 2: Inspector

Exposed as `window.__inspector` with two modes.

**Passive mode** — called automatically by the intent log after every action. Only checks assertions relevant to that specific action. Generates the `[CHK]` line.

**Full scan mode** — called on demand via `window.__inspector.fullScan()`. Checks everything and returns structured data:

```js
window.__inspector.fullScan()
// → {
//   ok: false,
//   mismatches: [
//     { type: 'DOM_GHOST', detail: 'Enemy #2 HP bar in DOM but creature is KO' },
//     { type: 'LOGIC_BUG', detail: 'Buff ATK+1 on Enemy#0 has duration -1' }
//   ],
//   summary: {
//     allies:  { state: 3, dom: 3, pixi: 3 },
//     enemies: { state: 1, dom: 2, pixi: 1 }
//   }
// }
```

**Three-layer cross-check (UI consistency):**

| Layer | How to query | What to check |
|-------|-------------|---------------|
| Game state | `window.gameState` / `store.get('gameState')` | Source of truth: alive creatures, buffs, inventory, phase |
| DOM | Formation slots, `.formation-info--hidden`, HP bar elements | HP bars, status indicators, phase-specific UI presence |
| PixiJS | `window.__pixiApp()` layers + `getCreatureSprite(side, index)` for alpha/tint | Sprite visibility (alpha > 0, tint !== KO color), sprite count in creatures layer |

**Console error detection:** The diagnostics ring buffer already wraps `console.error`. The inspector checks if new errors appeared between `[ACT]` and `[CHK]`. Any error = automatic `ERROR_THROWN` failure.

**Four check outcomes:**

| Tag | Meaning |
|-----|---------|
| `✓` | State, DOM, Pixi all match, no errors |
| `DOM_GHOST` | Element visible in DOM or Pixi that state says shouldn't be |
| `LOGIC_BUG` | Game state itself violates a rule |
| `ERROR_THROWN` | Console error fired during the action |

### Component 3: Game Rule Invariants

Two layers of assertions with different authorship:

**Layer 1: UI Consistency (mechanical, written by Claude)**

These are objective — "does the UI match the data?" Hard to get wrong.

- `creatures.filter(c => c.hp > 0).length` === visible sprite count === visible HP bar count
- `combat === null` → no combat UI in DOM, no creature sprites in Pixi
- Phase-specific UI: hub elements only in hub, combat elements only in combat
- KO'd creature sprite alpha/tint matches KO visual state

**Layer 2: Game Rule Validation (drafted by Claude, validated by user)**

These encode design intent — "is the game state itself correct?"

Workflow for building this layer:
1. Claude reads each game system's code
2. Claude writes a draft rule list in plain English + code assertion
3. User reviews: corrects mistakes, adds missing rules
4. Claude implements the validated rules

Rule domains:

| Domain | Example rules (draft — user to validate) |
|--------|------------------------------------------|
| Turn order | KO'd creatures excluded. Speed determines order. Status effects modify participation. |
| Combat actions | Attacker must be alive. Target must be alive. Damage matches formula. |
| Buffs/debuffs | Correct creature targeted. Duration decrements each turn. Expired effects removed from state + UI. Stacking rules. |
| Status effects | Tick at correct timing. Immunity respected. Cleanse targets correct effects. |
| Party skills | Trigger condition checked correctly. Effect on correct targets. Cooldown enforced. |
| NPC skills | NPC skill fires at correct time. Effect applied correctly. Visual matches effect. |
| Items | Added to inventory on receive. Removed on use. Effect matches item definition. Stack limits. |
| Skills/moves | Creature can hold skill. No duplicates. Moveset size limits. |
| Befriending | Quiz pass → creature switches sides (enemy→ally). Quiz fail → creature stays enemy. Turn order updated. Sprites switch rows. |
| Phase transitions | Only VALID_TRANSITIONS allowed. Conditions for transition met. |
| Creatures | Party size limits. KO'd not selectable for actions. Collection updated on befriend. |

### Component 4: Exploratory QA + Regression Tests

**No predefined test list.** Tests are discovered through playtesting.

**Exploratory QA protocol:**

1. Launch Playwright, load game, start fresh run
2. Play through naturally — pick area, explore rooms, fight battles, interact with NPCs
3. After every action, read console for `[CHK]` lines
4. Any `✗` → screenshot, capture full inspector state, log the bug
5. Deliberately seek risky paths: befriend attempts, NPC battles, multi-enemy fights, item use mid-combat, let buffs expire, trigger party skills
6. Report: what was tested, bugs found with screenshot + `[ACT][EXP][CHK]` excerpt + which rule violated

**Regression test extraction:**

Each bug found during QA becomes a Playwright E2E test:
- Set up the game state that triggered the bug
- Execute the action sequence that caused it
- Call `window.__inspector.fullScan()` after each action
- Assert no mismatches, no `ERROR_THROWN`

These tests accumulate in CI over time, grown from real bugs, not speculation.

### Existing Infrastructure Leveraged

| Existing | How it's used |
|----------|--------------|
| `window.__pixiApp()` | Already exposes Pixi app + layers for inspector |
| `getCreatureSprite(side, index)` | Query sprite alpha/tint for KO detection |
| `diagnostics.js` ring buffers | Console error detection (50), network failures (20), action log (30) |
| `phase-machine.js` | VALID_TRANSITIONS used for phase transition assertions |
| `store.js` observable | State change notifications (not used to trigger intent log — see instrumentation strategy) |
| `diagnostics.js` action buffer | Intent log `[CHK] ✗` failures pushed into the action ring buffer so they appear in bug report snapshots |
| Playwright 1.57 | Already installed; used for exploratory QA and regression tests |

### fullScan Behavior Per Phase

The inspector's `fullScan()` adapts to the current game phase:

| Phase | What fullScan checks |
|-------|---------------------|
| `combat` | Ally/enemy counts across state/DOM/Pixi, buff durations, turn order validity, status effects |
| `hub` | No combat UI present, no stale creature sprites, phase-appropriate UI visible |
| `exploring` / `room` | No combat UI, no stale sprites from previous encounters |
| `victory` / `defeat` | Combat UI teardown in progress, no active turn order |
| `shop` / `post_combat_shop` | Inventory consistency, no combat sprites |
| Other phases | Phase-appropriate UI presence, no elements from other phases |

The `summary` field shape stays the same but `allies`/`enemies` fields read `{ state: 0, dom: 0, pixi: 0 }` outside combat.

### Implementation Phasing

Components have dependencies and should be built in order:

**Phase 1: Intent Log core + Inspector (foundation)**
- Build the `intentLog` module with `act()`, `expect()`, `check()` methods
- Build `window.__inspector` with `fullScan()` — UI consistency layer only (state vs DOM vs Pixi counts)
- Instrument combat actions first (highest bug density)
- Console error detection via diagnostics ring buffer
- Push `[CHK] ✗` failures into diagnostics action buffer for bug reports

**Phase 2: Combat rule invariants (user-validated)**
- Claude drafts combat rule assertions (turn order, damage, buffs, KO handling)
- User reviews and corrects
- Implement validated rules into inspector
- Instrument remaining combat-adjacent actions (items, skills, befriending)

**Phase 3: Exploratory QA + first regression tests**
- Claude playtests with Phase 1+2 running
- Bugs found become regression tests
- Instrument non-combat actions (exploration, shops, NPC dialogue, phase transitions)

**Phase 4: Expand invariants to all systems**
- Draft + validate rules for remaining domains (party skills, NPC skills, crafting, etc.)
- Regression test suite grows organically from QA findings

### What This Enables

**Before (today):**
- User finds bug during manual play
- Reports to Claude: "sprites came back after NPC dialogue"
- Claude doesn't know what "correct" looks like, goes in circles
- Multiple sessions of guessing before the fix lands

**After:**
- Claude playtests via Playwright
- Intent log: `[ACT] NPC dialogue started [EXP] Enemy sprites remain hidden (all KO) [CHK] ✗ DOM_GHOST: Enemy#2 sprite alpha=1 but hp=0`
- Bug is self-documenting: what happened, what should have happened, what went wrong
- Claude fixes the bug, writes regression test, moves on
- If user finds a bug in the field, the diagnostics capture includes the `[ACT][EXP][CHK]` trace — Claude reads it cold and understands immediately
