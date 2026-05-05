# Failing Test Suite Triage Design

## Goal

Get `npm test` back to green by addressing only tests that currently fail, while preserving tests that protect player-visible behavior and removing or rewriting tests that only encode stale content counts or old setup assumptions.

## Current Failure Snapshot

The current suite has 13 failing tests:

- 9 unit failures from `npm run test:unit` without coverage.
- 4 integration failures from `npm run test:integration`.

The failures are not broad instability. They cluster into a few clear categories:

- Player-visible behavior tests whose setup or mock drifted.
- Integration setup that no longer matches creature quantity validation.
- Content inventory assertions that became stale as data grew or changed.
- Design heuristic assertions that may be useful, but should not block CI unless they represent an agreed content quality rule.

## Keep And Fix

These tests should remain in the gate because a regression here would affect gameplay or visible UI.

### Combat Turn Consistency

File: `tests/integration/flows/combat.test.js`

Failing test:

- `combat state is consistent after each turn`

Recommended action:

- Fix the test to submit valid move choices for the current combat contract.
- Do not delete it. It protects the server combat loop from returning invalid state after turns.

Likely issue:

- The test picks one living ally and sends only that ally's first move. Current combat-cycle validation may require a complete or different set of move choices.

### Speed Review Room Flow

File: `tests/integration/flows/vocab-review.test.js`

Failing tests:

- `start/complete cycle with empty vocab auto-completes the room`
- `progress rejects commits when snapshot is empty`
- `start is idempotent — second call returns reusedSnapshot true`

Recommended action:

- Keep all three tests.
- Update the test helper or debug endpoint usage so `debug-set-collection` seeds valid `creatureCounts` for `hi`, `mizu`, and `ki`.

Likely issue:

- The tests set `meta.creatureCollection`, but creature selection now also validates `meta.creatureCounts`. The behavior under test is speed review, so the fixture should satisfy the newer party validation rules.

### Exploration Scene NPC Helper

File: `tests/unit/ui/exploration-scene-helper.test.js`

Failing cause:

- Import-time mock drift: `exploration.js` imports `getFusionCoreNarration`, but the test mock for `tutorial-copy.js` does not export it.

Recommended action:

- Keep the test.
- Add the missing mocked exports used by `exploration.js`.

Why keep:

- This protects Cid/NPC sprite rendering across hub, prologue, and exploration scenes. A break is visible to players.

### NPC Sprite Disposal

File: `tests/unit/pixi/formation-npc-scene.test.js`

Failing test:

- `returns null if scene disposes during Assets.load`

Recommended action:

- Prefer rewriting the test around the current texture-loading abstraction.
- Delete only this subcase if it cannot meaningfully intercept the async load boundary anymore.

Why keep if possible:

- The behavior prevents sprites from being mounted onto disposed scenes, which protects visual stability during transitions.

## Rewrite Or Delete

These failures should not be fixed by updating magic numbers unless the number itself is a deliberate product rule.

### Starter Distribution Heuristics

File: `tests/unit/creature/starter-distribution.test.js`

Failing tests:

- `no move appears as level-1 starter for more than 2 creatures`
- `no later-level damage move is strictly weaker than the level-1 damage move`

Recommended action:

- Rewrite as explicit content-quality tests only if these are real design rules.
- Otherwise delete the two failing assertions.

Reason:

- The "max 2 starters per move" cap and "later damage move must never be weaker" are balancing heuristics, not correctness rules. They can block legitimate content additions.

Better replacements if kept:

- Every creature has at least one usable level-1 move.
- Every starting-area creature has a clear combat role.
- Every learnset references existing move IDs.
- No creature learns the exact same move twice unless explicitly allowed.

### NPC Count Assertion

File: `tests/unit/game/npc-service.test.js`

Failing test:

- `loads all NPCs (8 entries)`

Recommended action:

- Replace the exact count with contract checks:
  - NPC data loads.
  - Required starter-area NPC IDs exist, if any are required by flows.
  - Every NPC has required fields.
  - Area selection can return an NPC for areas that expect one.

Reason:

- The game now has 12 NPCs. More NPCs should not fail CI.

### Dialogue Frame Count Assertions

File: `tests/unit/tokenize-static.test.js`

Failing tests:

- `bark frames have correct category prefix and no slots`
- `CID frames have group field matching script ID`
- `befriend_wait has 7 i+1 ladder frames`
- `befriend_name has 7 i+1 ladder frames`

Recommended action:

- Keep structural checks, delete or relax stale inventory counts.
- Assert required frame IDs and schema instead of asserting old totals.

Reason:

- Dialogue frame counts change as content is added, removed, or reorganized. Count floors like "at least 60 barks" and exact ladder counts are not reliable correctness signals unless they are tied to a documented content requirement.

Better replacements:

- Every bark frame has a `bark_` category and no slots.
- CID frames, if present, have `group` and `cid_` IDs.
- Befriend prompt categories have at least one eligible frame.
- Required scaffolding frames such as `befriend_name_what` exist and preserve the correct `私` reading/override behavior.

## Proposed Execution Order

1. Repair stale mocks and integration fixtures first.
   - These are low-risk and should recover most behavioral coverage without changing product code.

2. Fix the combat consistency integration test.
   - This is the most important gameplay signal among the current failures.

3. Rewrite or remove stale content-count assertions.
   - Avoid swapping one magic number for another.

4. Re-run `npm test`.
   - Only broaden scope if failures remain after the current known set is addressed.

## Success Criteria

- `npm test` passes.
- No player-visible behavior test is removed just because it is failing.
- Exact data-count assertions are removed unless the count is an intentional documented rule.
- Test names describe behavior rather than historical fixture size.
- The suite remains fast enough for the existing Tier 1 and Tier 2 gates.

## Out Of Scope

- Adding new gameplay behavior.
- Rebalancing creature learnsets.
- Changing production debug endpoints unless necessary to support valid test setup.
- Auditing all passing tests.
- Visual browser verification, because this pass changes tests only.
