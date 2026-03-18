# Skill Master Room + Party Skills (MVP) — Design

**Status:** Draft

## Goal

Add a new special room type, `skillMaster`, that grants the player **1 of 3** randomly offered **party-wide combat skills**. For MVP, these skills apply to the entire party (not per-creature).

## Non-Goals (MVP)

- No per-creature skill assignment.
- No skill rarity/tiering system (common/legendary/etc.).
- No UI-heavy “build screen” or long-term skill tree.
- No enemy/NPC skill masters.
- No Japanese sentences anywhere in Skill Master UI for MVP. All Skill Master UI strings (room narration, buttons, skill names/descriptions) are English-only to avoid i+1 violations.

## Current Code Context (Key Observations)

- Room types and generation live in `src/game/rooms.js`.
- Room navigation and interaction behavior live in `src/game/services/exploration-service.js` and `src/routes/game/run.js`.
- Combat resolution and attack records live in `src/game/services/creature-combat-service.js`.
- Combat UI consumes `playerAttacks` records with fields including:
  - `elementMultiplier` (from `getElementMultiplier(move.element, target.element)`)
  - `targetDefeated`
  - `damage`, `healAmount`
  - `effectApplied` for status/buffs/shields
- Haste is already implemented as a status effect and already yields a second action in `processMoveTurn()` (consumed before move processing).

## Definitions

- **Super effective hit:** `elementMultiplier > 1` on an attack record. (This multiplier is computed *before* STAB is applied; STAB is tracked separately via `stab` and `stabMult`.)
  - Note: overall damage uses `buffedElemMult = elemMult * stabMult` (plus item/meta effects), but **super effectiveness should be based on `elemMult`** and not on STAB.

## Phase + UI Wiring (Required)

The frontend renders non-combat experiences based on `phase` derived by `src/game/phase-machine.js`, not only `room.type`.

MVP phase behavior:

- Add phase: `skillMaster`
- In `derivePhase(...)`: if `currentRoom.type === 'skillMaster' && !currentRoom.interacted`, phase becomes `skillMaster`.
- In `public/game.js` (UI switch): add a case to render the Skill Master UI when `phase === 'skillMaster'`.

## Data Model

### Run State

Add a list of acquired party skills on the active run:

- `run.partySkills: Array<{ id: string, params?: object }>`

MVP note: render names/descriptions from a server-owned static catalog keyed by `id` (do not persist arbitrary client-provided strings in saves). Avoid storing ephemeral per-combat counters here.

### Combat-Scoped State (in-memory)

Some skills need a counter for “every Nth party attack”. This counter should be combat-scoped:

- `combat.partyHitCounter: number`

Reset when a new creature encounter starts (`startCreatureEncounter()`), and increment when a player attack record is produced.

## Room Type: `skillMaster`

### Generation

- Add `ROOM_TYPES.skillMaster = 'skillMaster'`.
- Treat as a special room (so it obeys “don’t repeat last special room” constraints).
- Add a spawn chance similar to other specials (exact chance TBD, default 0.05–0.10).

### Room State Structure

In `createRoom()`:

```
room.skillMaster = {
  offered: null | Array<{ id, name, desc }>,
  chosenId: null | string,
  completed: boolean
}
```

### Narration & Actions

- `getRoomEntryNarration()` returns a short, safe string (or English-only if preferred by the current bootstrap language mode).
- `getRoomActions()` should return a single action when unfinished:
  - `{ id: 'skill_master_choose', ... }`
- Once completed, room behaves like other completed specials: allows `proceed`.

### API / Interaction Flow

Reuse the existing pattern of “room interaction triggers a route, which mutates run state and returns updated state”:

New endpoints in `src/routes/game/run.js`:

- `POST /api/game/skill-master-offers`
  - Generates and persists `room.skillMaster.offered` (3 skills), idempotent if already offered.
  - Returns `{ offered: [...] , state }`

- `POST /api/game/skill-master-choose`
  - Body: `{ skillId }`
  - Validates offered list exists and includes `skillId`.
  - Adds skill to `run.partySkills` (if not already present).
  - Marks room `completed=true`, `interacted=true`.
  - Returns `{ chosenId, partySkills, state }`

Frontend (`public/js/ui/exploration.js`):

- Add `renderSkillMaster()` that:
  - Fetches offers if not present.
  - Renders 3 selectable cards.
  - Posts chosen skill.
  - On success, calls `updateGameState` then `updateUI`.

Phase routing:

- Extend the phase machine / UI router to render this room type similarly to `renderWordDiscovery()` / `renderWhackAMole()`.
  - If the code already routes by `room.type`, add a case for `skillMaster`.

## Party Skills (MVP Set of 5)

All 5 are party-wide and implemented in combat resolution (server-side) using existing hooks.

### Skill 1: Super-Effective Mend

- **Trigger:** When a player attack record has `elementMultiplier > 1`.
- **Proc:** 20% chance per qualifying hit.
- **Effect:** Heal all alive allies by 10% of each ally’s max HP.
- **Implementation detail:** Use `applyHeal(ally, amount)` for each ally; record effect events for UI (optional MVP).

### Skill 2: Haste Spark

- **Trigger:** When a player attack record has `elementMultiplier > 1`.
- **Proc:** 25% chance per qualifying hit.
- **Effect:** Apply `haste` to the attacker creature (one-time extra action next turn, already implemented).
- **Implementation detail:** Use existing `applyHaste(attacker, { sourceId })`.

### Skill 3: Guard Pulse

- **Trigger:** When a player attack record has `elementMultiplier > 1`.
- **Proc:** 20% chance per qualifying hit.
- **Effect:** Apply a small team shield to all allies.
- **Implementation detail:** Use existing `applyTeamShield(allies, { percent, duration, sourceId })`. Pick MVP values (e.g., 10% shield for 2 turns).

### Skill 4: Battle Rhythm

- **Trigger:** Every 5th player attack record (party-wide counter).
- **Effect:** That attack deals +50% damage (multiply final computed damage by 1.5).
- **Implementation detail:** Add a combat-scoped `partyHitCounter` incremented for each *qualifying* player attack record:
  - `attackerIndex >= 0` (excludes NPC skill phase attacks which use `attackerIndex: -1`)
  - category is `damage` or `drain` (or equivalently `damage > 0`)
  - Only the `damage` field is modified; do not apply to heal/buff/debuff/shield records.

### Skill 5: Finisher Feast

- **Trigger:** When a player attack record has `targetDefeated === true`.
- **Effect:** Heal all alive allies by 5% max HP.

### Proc Safety / Loop Policy

To keep MVP safe and prevent runaway feedback:

- Party skills **only trigger from player attack records**, not from:
  - poison tick events
  - enemy attacks
  - NPC skill phase attacks
- Healing triggered by party skills does **not** recursively trigger additional party-skill effects (no “on heal” triggers in MVP).

## Telemetry / Debugging (Optional)

- Add minimal logging using existing `logger.debug(...)` when a party skill procs to validate behavior during playtests.

## Testing

### Unit Tests

- `tests/unit/game/rooms-skill-master.test.js`
  - Verifies room generation can include `skillMaster`.
  - Verifies `createRoom('skillMaster', ...)` structure.
  - Verifies `getRoomActions()` exposes `skill_master_choose` until completed.

- `tests/unit/combat/party-skills.test.js` (or extend `creature-combat-service.test.js`)
  - Deterministic tests with stubbed RNG to force procs.
  - Validate:
    - super-effective triggers fire when `elementMultiplier > 1`
    - `haste` gets applied to attacker on proc
    - team shield applied on proc
    - battle rhythm increases 5th hit damage
    - finisher heal triggers on `targetDefeated`
  - Validate procs only consider qualifying player damage/drain records (not NPC skill phase, not poison ticks, not heal/buff records).

### Manual Test Plan

- Use the existing debug queue route (see `src/routes/game/misc.js`) to force a `skillMaster` room in a short run:
  - `POST /api/game/debug-queue-rooms` with body `{ rooms: ['skillMaster'] }` (exact mount path depends on how the router is mounted; follow the `misc.js` pattern in this repo).
- Select a skill, enter combat, observe expected changes:
  - heals occur on strong hits / kills
  - haste proc yields double action next turn
  - team shield reduces incoming damage (via existing damage reduction path)

## Open Questions (Need Your Decision)

1. **Skill stacking:** Can the player acquire duplicates? MVP recommendation: **no duplicates** (ignore if already owned).
2. **Battle Rhythm count:** Count per “attack record” (multi-target moves count multiple) vs per “move cast”. MVP recommendation: **per attack record** (simpler; more fun).
3. **UI presentation:** show skills in inventory overlay (`exploration.js` already lists item buffs + active effects). MVP recommendation: add a “Party Skills” section in that overlay.

