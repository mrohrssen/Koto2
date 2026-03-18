# Skill Master Room + Party Skills (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `skillMaster` special room that offers 1-of-3 party-wide combat skills, and implement 5 MVP skills that hook into existing creature-combat resolution.

**Architecture:** Implement party skills as server-side modifiers in `src/game/services/creature-combat-service.js` driven by existing attack records (`elementMultiplier`, `targetDefeated`, `category`, `attackerIndex`). Store acquired skills on the run as ids (`run.partySkills`) and render UI from a static catalog. Add a new room type in `src/game/rooms.js`, expose offers/choose endpoints in `src/routes/game/run.js` using the established ExplorationService mutation pattern, and wire a new `skillMaster` phase in `src/game/phase-machine.js` + frontend render path.

**Tech Stack:** Node/Express routes, pure game logic in `src/game/*`, vanilla JS frontend under `public/js/ui`, node:test unit tests.

---

## Scope & Constraints (MVP)

- Skill Master UI strings are **English-only** (avoid i+1 violations).
- Party skills are **party-wide** only (no per-creature selection).
- No duplicates: choosing a skill you already own is rejected or treated as no-op (spec-approved).
- Battle Rhythm counts per qualifying **damage/drain** attack record (AOE counts multiple) (spec-approved).
- Party skill procs trigger only from **player** damage/drain records (not NPC skill phase, not poison ticks, not enemy attacks).

## File Map (Create/Modify)

**Room + phase + routes**
- Modify: `src/game/rooms.js` (add `ROOM_TYPES.skillMaster`, generation chance, createRoom shape, narration, actions)
- Modify: `src/game/phase-machine.js` (derive `phase === 'skillMaster'` when room active)
- Modify: `src/game/services/exploration-service.js` (add service methods to manage offers/choose and set room completion + run.partySkills)
- Modify: `src/routes/game/run.js` (add endpoints: offers + choose, delegating to GameManager/ExplorationService)
- Modify: `src/game/state.js` (ensure new-run initializes `run.partySkills = []`; add `combat.partyHitCounter = 0` in `createCombatState`)
- Modify: `src/game/loop.js` (`GameManager.getState()` must include `run.partySkills` so UI can render it)
- Create (recommended): `src/game/party-skills.js` (server-owned catalog + helper functions)

**Frontend**
- Modify: `public/js/api.js` (add `skillMasterOffers()` and `skillMasterChoose(skillId)`)
- Modify: `public/js/ui/exploration.js` (add `renderSkillMaster()`; add “Party Skills” section in inventory overlay)
- Modify: `public/game.js` (add `case 'skillMaster'` in `updateGameContent()` to call `renderSkillMaster()` when `phase === 'skillMaster'`)

**Combat skills**
- Modify: `src/game/services/creature-combat-service.js` (implement party skills as a post-processing hook after player attacks; apply effects + hit counter rules)
- Modify (optional for UI feedback): `src/game/services/creature-combat-service.js` to append `effectEvents` entries when party skills trigger (if needed)

**Tests**
- Create: `tests/unit/game/rooms-skill-master.test.js`
- Modify or Create: `tests/unit/combat/party-skills.test.js` (preferred) OR extend `tests/unit/combat/creature-combat-service.test.js`

---

## Task 1: Add `skillMaster` room type generation + actions

**Files:**
- Modify: `src/game/rooms.js`
- Test: `tests/unit/game/rooms-skill-master.test.js`

- [ ] **Step 1: Write failing unit tests for room structure + actions**

Create `tests/unit/game/rooms-skill-master.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ROOM_TYPES, generateAreaRooms, getRoomActions, createRoom } from '../../../src/game/rooms.js';

describe('Skill Master Room', () => {
  it('ROOM_TYPES includes skillMaster', () => {
    assert.strictEqual(ROOM_TYPES.skillMaster, 'skillMaster');
  });

  it('createRoom(skillMaster) has expected structure', () => {
    const room = createRoom('skillMaster', 'okunomori', 1, 3);
    assert.strictEqual(room.type, 'skillMaster');
    assert.ok(room.skillMaster);
    assert.deepStrictEqual(room.skillMaster.completed, false);
    assert.deepStrictEqual(room.skillMaster.offered, null);
    assert.deepStrictEqual(room.skillMaster.chosenId, null);
  });

  it('unfinished skillMaster exposes choose action and not proceed', () => {
    const room = { type: 'skillMaster', interacted: false, skillMaster: { completed: false } };
    const actions = getRoomActions(room);
    assert.ok(actions.find(a => a.id === 'skill_master_choose'));
    assert.strictEqual(actions.find(a => a.id === 'proceed'), undefined);
  });

  it('completed skillMaster exposes proceed', () => {
    const room = { type: 'skillMaster', interacted: true, skillMaster: { completed: true } };
    const actions = getRoomActions(room);
    assert.ok(actions.find(a => a.id === 'proceed'));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:unit -- tests/unit/game/rooms-skill-master.test.js`  
Expected: FAIL (ROOM_TYPES.skillMaster missing, createRoom doesn’t support skillMaster, actions missing).

- [ ] **Step 3: Implement `skillMaster` in `src/game/rooms.js`**

Implementation checklist:
- Add `ROOM_TYPES.skillMaster = 'skillMaster'`
- Update `isSpecialType()` to include `skillMaster`
- Add `SKILL_MASTER_CHANCE` and include in `generateSingleRoom()` roll ladder
- In `createRoom()`, add `room.skillMaster = { offered: null, chosenId: null, completed: false }`
- In `getRoomEntryNarration()`, add an **English-only** string for `skillMaster`
- In `getRoomActions()`:
  - If unfinished `skillMaster` (`!room.interacted`): include `{ id: 'skill_master_choose', name: 'Skills', description: 'Choose 1 of 3 party skills' }` (English-only)
  - Ensure `proceed` only appears once completed (matches the existing “unfinished” gating)

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:unit -- tests/unit/game/rooms-skill-master.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/rooms.js tests/unit/game/rooms-skill-master.test.js
git commit -m "feat(rooms): add skillMaster room type"
```

---

## Task 2: Add `skillMaster` phase wiring (server) + render routing (client)

**Files:**
- Modify: `src/game/phase-machine.js`
- Modify: `public/game.js` (phase router; `updateGameContent()` switch)
- (Optional test) Modify/Create: `tests/unit/game/phase-skill-master.test.js` if phase-machine has tests; otherwise keep manual verification

- [ ] **Step 1: Add server phase derivation for skillMaster**

In `src/game/phase-machine.js` (pattern-match existing wordDiscovery/whackAMole handling):
- If `room?.type === 'skillMaster' && !room.interacted` → return `'skillMaster'`

- [ ] **Step 2: Wire frontend phase routing**

In `public/game.js` (where `phase` chooses the renderer), add:
- `case 'skillMaster': exploration.renderSkillMaster(); break;`

- [ ] **Step 3: Manual verification**

Run dev server: `npm run dev`  
Use existing debug room queue to force `skillMaster` room (see Task 5 manual steps) and verify the UI switches into the Skill Master screen (not the generic “Exploring” buttons).

- [ ] **Step 4: Commit**

```bash
git add src/game/phase-machine.js public/js/game.js
git commit -m "feat: add skillMaster phase rendering"
```

---

## Task 3: Add Skill Master endpoints + ExplorationService logic

**Files:**
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/game/loop.js` (GameManager delegation methods if needed)
- Modify: `src/routes/game/run.js`
- Modify: `src/game/state.js` (initialize `run.partySkills`)
- Create: `src/game/party-skills.js` (catalog + helpers)

- [ ] **Step 1: Add `run.partySkills` initialization**

In `createNewRun(...)` (in `src/game/state.js`), add:
- `partySkills: []`

Also update `src/game/loop.js` `GameManager.getState()` to include `partySkills` inside the serialized `run` object, otherwise the client UI cannot render acquired party skills.

Add a unit test if `state` has tests; otherwise rely on smoke playtest.

- [ ] **Step 2: Implement Skill catalog (server-owned)**

Implement `src/game/party-skills.js` exporting:
- `PARTY_SKILLS_CATALOG` (English-only strings)
- `rollSkillMasterOffers({ ownedSkillIds, count })`
- `getPartySkillDisplay(id)` (returns `{ id, name, desc, params }`)

Catalog entries (English-only):
- id
- name
- desc
- params

- [ ] **Step 3: Add ExplorationService methods**

Add methods:
- `getSkillMasterOffers()`:
  - Validate current room is `skillMaster` and not completed
  - If `room.skillMaster.offered` exists, return it
  - Otherwise choose 3 distinct skills from catalog (exclude already-owned ids) and persist to `room.skillMaster.offered`
- `chooseSkillMasterOffer(skillId)`:
  - Validate offered list exists and includes `skillId`
  - Add to `run.partySkills` if not present
  - Set `room.skillMaster.chosenId = skillId`, `room.skillMaster.completed = true`, `room.interacted = true`

Idempotency:
- choosing the same skill twice should not duplicate

- [ ] **Step 4: Add routes in `src/routes/game/run.js`**

Add:
- `POST /api/game/skill-master-offers` (router path `'/skill-master-offers'`) → calls service getter, returns `{ offered, state }`
- `POST /api/game/skill-master-choose` (router path `'/skill-master-choose'`) with `{ skillId }` → calls chooser, returns `{ chosenId, partySkills, state }`

Ensure `req.saveGame()` is called.

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js src/game/services/exploration-service.js src/routes/game/run.js src/game/loop.js
git commit -m "feat: add skillMaster offers and choose endpoints"
```

---

## Task 4: Frontend Skill Master UI + inventory overlay display

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Add API helpers**

In `public/js/api.js`, add:
- `skillMasterOffers()` → `apiCall('/skill-master-offers', 'POST')` (hits `POST /api/game/skill-master-offers`)
- `skillMasterChoose(skillId)` → `apiCall('/skill-master-choose', 'POST', { skillId })` (hits `POST /api/game/skill-master-choose`)
Export or plumb through callbacks as done for other room APIs.

- [ ] **Step 2: Add `renderSkillMaster()`**

In `public/js/ui/exploration.js`:
- Fetch offers (once per room id; persist in module-level state similar to `discoveryState`)
- Render 3 selectable cards (name/desc)
- On click: POST choose, then update state + UI

Keep it minimal (reuse existing button + card styles where possible).

- [ ] **Step 3: Display acquired party skills in inventory overlay**

In `showInventory()`:
- Add section “Party Skills” listing `run.partySkills` names/descs (from catalog supplied in state or from a client-side mirror catalog).
  - Preferred: include catalog rendering data in the `/skill-master-offers` response and/or in `state.run.partySkillsDetailed` derived on server. If you keep ids only in state, also include a small `partySkillsCatalog` map in state.

- [ ] **Step 4: Manual verification**

Verify:
- Skill Master screen appears, selection works, then `proceed` resumes normal exploration.
- Inventory overlay shows party skills after selection.

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/js/ui/exploration.js
git commit -m "feat(ui): add skillMaster room UI and party skills display"
```

---

## Task 5: Implement the 5 party skills in combat resolution

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/game/state.js` (add `partyHitCounter` to `createCombatState`)
- Modify: `src/game/loop.js` (call post-processing hook after `processMoveTurn`)
- Test: `tests/unit/combat/party-skills.test.js` (preferred) OR extend `tests/unit/combat/creature-combat-service.test.js`

- [ ] **Step 1: Add `partyHitCounter` to combat state**

In `createCombatState(...)` in `src/game/state.js`, initialize:
- `partyHitCounter: 0`

- [ ] **Step 2: Write failing tests for party skills**

Create `tests/unit/combat/party-skills.test.js`:
- Stub `Math.random()` to deterministic values
- Create allies/enemies with known elements so `elementMultiplier > 1` occurs (super effective)
- Simulate a move turn via `processMoveTurn(...)` while providing a `runPartySkills` input (see Step 3)

Assertions:
- Super-Effective Mend heals allies when proc forced
- Haste Spark applies haste to attacker (then next `processMoveTurn` results in 2 attacks)
- Guard Pulse applies team shield effect
- Battle Rhythm increases damage on 5th qualifying hit
- Finisher Feast heals party on `targetDefeated`
- Does not trigger off:
  - NPC skill attacks (attackerIndex === -1)
  - non-damage categories

- [ ] **Step 3: Implement party skill hook plumbing**

Implement party skills without changing `processMoveTurn(...)` signature:

- Add a new exported helper in `src/game/services/creature-combat-service.js`, e.g.
  - `applyPartySkillsAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat })`
  - It post-processes the `attacks` array from `processMoveTurn`, applying party-skill effects, updating `combat.partyHitCounter`, and (optionally) returning `effectEvents` additions.
- Call it from exactly one place: `src/game/loop.js` in `GameManager._handleCreatureAttackTurn()` immediately after:

```js
const playerResult = processMoveTurn(...);
applyPartySkillsAfterPlayerAttacks({
  attacks: playerResult.attacks || [],
  allies: this.combat.allies,
  enemies: this.combat.enemies,
  runPartySkills: this.run.partySkills || [],
  combat: this.combat
});
```

Implementation rules (from spec):
- Qualifying record for triggers:
  - `attackerIndex >= 0`
  - category in `damage|drain` (or `damage > 0`)
- Super-effective check uses `atk.elementMultiplier > 1`
- Procs only on player records (the filter above enforces this)

Skill effects:
- Super-Effective Mend: 20% chance; heal each alive ally `floor(maxHp * 0.10)`
- Haste Spark: 25% chance; `applyHaste(attacker, { sourceId: 'partySkill:hasteSpark' })`
- Guard Pulse: 20% chance; `applyTeamShield(aliveAllies, { percent: 10, duration: 2, sourceId: 'partySkill:guardPulse' })`
- Battle Rhythm: every 5th qualifying hit: multiply that record’s `damage = floor(damage * 1.5)`
- Finisher Feast: on `targetDefeated`: heal each alive ally `floor(maxHp * 0.05)`

Note: prefer to emit minimal `effectEvents` (optional) only if you need UI feedback. Otherwise rely on HP bars changing + existing shield/haste effects.

Battle Rhythm implementation detail (post-hoc safe approach):
- When the 5th qualifying record is identified, compute `bonus = floor(record.damage * 0.5)`.
- Apply `bonus` immediately to the same target’s `hp` (enemy creature object already referenced in `enemies`), and update `record.damage += bonus`.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- tests/unit/combat/party-skills.test.js`  
Expected: PASS.

Run: `npm run test:unit`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js src/game/services/creature-combat-service.js src/game/loop.js tests/unit/combat/party-skills.test.js
git commit -m "feat(combat): add party skills procs and battle counter"
```

---

## Task 6: Manual end-to-end check (dev)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Force a Skill Master room**

Use the existing debug room queue route implemented in `src/routes/game/misc.js` to queue `skillMaster`, then proceed into the run until it appears:
- `POST /api/game/debug-queue-rooms` with body `{ "rooms": ["skillMaster"] }`
- Note: requires debug mode unless `NODE_ENV === 'test'` (see `misc.js` guard).

- [ ] **Step 3: Choose a skill**

Verify:
- Offer list shows 3
- Choose persists after reload
- Proceed works after completion

- [ ] **Step 4: Enter combat and validate procs**

Pick an enemy where you can land super-effective hits (or temporarily adjust elements via debug if available).

---

## Plan Review Loop

After saving this plan:

1. Dispatch a plan-document-reviewer with:
   - Plan: `docs/superpowers/plans/2026-03-18-skill-master-room-and-party-skills.md`
   - Spec: `docs/superpowers/specs/2026-03-18-skill-master-room-and-party-skills-design.md`
2. If issues found: fix and re-dispatch once.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-18-skill-master-room-and-party-skills.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh worker per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?

