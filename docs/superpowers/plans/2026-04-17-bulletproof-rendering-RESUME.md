---
name: Bulletproof Rendering — Resume Notes
checkpoint_date: 2026-04-17
branch: feature/bulletproof-rendering
worktree: /root/koto-wt-bulletproof-render
head_commit: 6810b23
---

# Resume Notes — Bulletproof Rendering Scene Controller

Checkpoint for the next session. Read this + the main plan
(`2026-04-17-bulletproof-rendering-scene-controller.md`) before dispatching any
implementer subagent.

## Where we are

- **10 of 18 tasks complete** (Tasks 6–15). Foundation + Phase 3/4/5 done under
  dual-API strategy.
- **32 commits ahead of master** on `feature/bulletproof-rendering`.
- **1378/1378 unit tests passing** as of commit `6810b23`.
- **~25 real bugs** caught by adversarial reviewers and fixed in-branch. Each
  task had full Path C review (implementer → spec → code quality → adversarial
  → fix → verify).

## What's left

Tasks 16–23. Task 16 is the "big swap" that consumes accumulated deferred items.
Tasks 17+ are smaller.

## Dual-API strategy (stick with it)

Tasks 6–15 deliberately kept legacy exports (ctx-based via `_defaultCtx`)
working alongside new scene-aware exports. This kept the branch incrementally
testable and each commit bisectable. When resuming Task 16, continue the same
pattern: migrate call sites atomically per-file, don't mix.

- Legacy path is signature-preserved but functionally dormant (since Task 6
  removed `initFormations()` from `initApp`, `_defaultCtx.playerContainer` is
  null — this is documented and accepted; legacy callers silently no-op on
  sprite operations until Task 16 switches them to the scene ctx).
- Scene-facing API is tested with 38+ new unit tests added across Tasks 7, 9,
  10, 12, 13, 14, 15.

## Accumulated deferred items that Task 16 MUST absorb

Each was marked as deferred in its task's review and/or TODO comments in the
code. Don't skip any — grep for `TODO(Task 16)` in `public/js/pixi/formation.js`
to find the JSDoc markers.

### From Task 9 (formation.js refactor)

- **IMP-2: visual parity in `spawnFormationSprite`**
  - Boss size: `isBoss ? 120 : 60` (currently hardcoded 60 → bosses render at
    half-size)
  - Enemy slide-in: set `_enterTarget`/`_entering` flags; the tick body already
    exists in `_updateFormations`, just needs the spawn to opt in
  - `revealFormationInfo(side, dataIndex)` DOM reveal after spawn for
    non-entering sprites
  - 3-slot layout mapping: 1 creature → middle (slot 1), 2 creatures → top+
    bottom (slots 0+2), 3 creatures → all three slots. Currently uses raw index.
- **IMP-4: `updateFormationSprite` must reposition on slot shift** (when an
  ally KOs and remaining allies re-anchor to different slots)

### From Task 10 (status-vfx.js)

- `combat-loop.js:1447` still calls `clearAllStatusVfx()`. Scene exit auto-
  cleans updaters, so this call becomes redundant once combat-loop transitions
  via SceneManager. Delete it during 16a.

### From Task 12 (scene.tween)

- `element-blasts.js`, `text.js`, `banners.js` signature migration to take
  `scene` as first param + use `scene.tween` for registry-tracked animations.
  Not strictly required for Task 16 to function, but any animation started
  inside combat won't auto-cancel on scene exit until these migrate. Can defer
  to Task 18 or a post-16 hardening pass if Playwright validation surfaces no
  issues.

### From Task 15 (creature-row)

- Atomic cutover: remove `dom.playerFormation.addEventListener(...)` and
  `document.addEventListener(...)` pair from inside `creature-row.init()`.
  Call `setupCreatureRowListeners(scene)` from BattleScene.enter AND
  ExplorationScene.enter. Double-fire bug if both paths stay active.

### From Task 13 (particle release)

- `BattleScene.beforeExit` already calls `releaseAllInFlight()`. Consider (not
  required) doing the same from ExplorationScene.beforeExit defensively. Two
  lines. Adversarial reviewer flagged as belt-and-suspenders only.

### Formation scene tick (Task 9 deferred infra)

- BattleScene.onEnter should wire formation updates through `scene.addUpdater`:
  ```javascript
  this.addUpdater((dt) => _updateFormations(this.formation, dt));
  ```
  (uses internal `_updateFormations`; `updateFormations` legacy export still
  ticks `_defaultCtx` and goes dormant once combat-loop switches over).

## Task 16 subtask breakdown (B built into the resume)

Break Task 16 into four subtasks. Each is an independent commit, each passes
unit tests on its own, and 16a is the first point where manual Playwright
verification is possible.

### 16a — SceneManager.transition wiring (scaffold only)

**Goal:** Flip combat-loop.js so it calls `SceneManager.transition(BattleScene,
{allies, enemies, parallaxSpeed})` at combat start, and transitions to
ExplorationScene on combat end. Do NOT change sprite-lookup calls yet.

Changes:
- `public/js/ui/combat-loop.js`: import SceneManager + BattleScene +
  ExplorationScene. Replace `showFormation(...)` calls at combat start with
  `await mgr.transition(BattleScene, {...})`. Replace combat-end cleanup with
  `await mgr.transition(ExplorationScene, {roomId: currentRoomId})`.
- `cleanupCombat()` body: remove `clearAllPixiStatusLabels()` +
  `clearAllStatusVfx()` calls (Task 10 deferred). Leave the timer clear.
- `BattleScene.onEnter`: add `this.addUpdater((dt) => _updateFormations(
  this.formation, dt))` (Task 9 deferred infra).
- `BattleScene.onEnter`: call `setupCreatureRowListeners(this)` (Task 15
  deferred cutover).
- `creature-row.js`: remove the two `addEventListener` calls from `init()`.
- `ExplorationScene.onEnter`: also call `setupCreatureRowListeners(this)`
  (because the player formation is visible in both modes).

Verification:
- 1378/1378 tests still pass.
- `npm run dev` boots.
- **User must manually smoke test in browser**: start game → encounter →
  combat → victory → return to exploration. If anything is broken, that's
  the place for a 16a fix commit before proceeding.

### 16b — Restore visual parity (IMP-2 + IMP-4 from Task 9)

**Goal:** `spawnFormationSprite` and `updateFormationSprite` match the visual
output of legacy `_showFormation`. This is where the TODO JSDoc comments
added in Task 9's fix commit (`c509b0e`) get resolved.

Changes to `public/js/pixi/formation.js`:
- `spawnFormationSprite` accepts an `opts` object (currently only 4 positional
  args: `ctx, side, creature, index`). Add `{isBoss = false, skipEnter = false}`.
- Honor `isBoss ? 120 : 60` for sprite size.
- Implement 3-slot layout mapping (1/2/3-creature formations).
- Set `_enterTarget`/`_entering` for enemy slide-in when `skipEnter` is false.
- Call `revealFormationInfo(side, dataIndex)` for non-entering sprites.
- `updateFormationSprite`: reposition sprite to its new slot index using the
  same DOM anchor lookup the spawn path uses.

Update `BattleScene._diff` to pass `isBoss`/`skipEnter` through to
`spawnFormationSprite`. Verify the 3-slot layout matches legacy output via
Playwright screenshot comparison on a 2-creature formation (this is the
specific case that would regress silently).

Remove the TODO JSDoc blocks from `spawnFormationSprite` and
`updateFormationSprite`.

### 16c — Sprite lookup migration

**Goal:** Replace `getCreatureSprite(side, index)` call sites in
`combat-loop.js` and `combat-vfx.js` with `scene.getSprite(uid)`.

For each call site:
- Identify the creature being looked up — usually from
  `getGameState().combat.allies[i]` or `enemies[i]`. The `.uid` is the
  replacement key.
- `const sprite = getSceneManager().currentScene.getSprite(creature.uid);`

Plus:
- `BattleScene._diff` already stores into `this.spritesByUid`. Verify the
  `getSprite(uid)` method on Scene returns from this map (it should, per
  Task 8 skeleton).
- `combat-vfx.js` HP-bar maps: migrate any remaining index-based keys to uid
  (Task 16 Step 4 in the plan).

### 16d — Extension of Task 10 migration

**Goal:** Switch `playStatusApplied` / `clearStatusVfx` call sites in combat-
loop / combat-vfx from legacy signatures to scene-ctx.

Changes:
- `combat-loop.js` + `combat-vfx.js`: replace
  `playStatusApplied(side, index, effectType)` with
  `playStatusAppliedForScene(getSceneManager().currentScene.statusVfx, side,
  creature.uid, effectType)`. Same for clear.
- After migration, `clearAllStatusVfx()` (legacy) has zero callers — leave
  the export for now, Task 18 deletes it alongside the other dead legacy
  exports.

Between 16a and 16d, run smoke Playwright after each subtask so regressions
are caught at their source commit (each is bisectable).

## Path C review discipline

Continue full Path C (implementer → spec → code quality → adversarial → fix)
for 16a, 16b, 16c, 16d. User ratified "Path C everywhere" at session start;
the adversarial reviewer has been earning its keep (Task 9 found a Critical
silent-drop bug; Task 10 found a timing regression; Task 14 found a
disposal race).

For 16a specifically, the spec reviewer should verify:
- Every pre-existing `showFormation` call in combat-loop is replaced or
  documented as obsolete.
- `cleanupCombat` no longer calls `clearAllPixiStatusLabels` /
  `clearAllStatusVfx`.
- No double-registration of creature-row listeners (init still registers
  OR setupCreatureRowListeners does, never both).

## Manual Playwright session protocol

Task 16's Step 6 needs human eyes. Plan says:
1. Open http://localhost:5173.
2. New game / load save.
3. Walk into a room, trigger an encounter.
4. Use a move; verify damage numbers, HP drops, status applies, KO animations
   all work.
5. Win battle; verify return to exploration with no ghost sprites.
6. Enter another room; verify room-transition + NPC sprites still work.

Ask user before launching Playwright (per CLAUDE.md rule). If the user is
available, run through the smoke test after 16a commits, then again after
16b, 16c, 16d.

## After Task 17

Tasks 18–23 are cleanup + testing + PR:
- Task 18: Delete the legacy `_showFormation`, `_hideFormation`, default-ctx
  helpers, `clearAllStatusVfx`, dead `creatureNameRuby` in combat-dom.js,
  etc. Grep for `@deprecated` JSDoc tags.
- Task 19: Dev-mode invariants (assertions behind DEV flag).
- Task 20: Settings-toggled debug overlay.
- Task 21: Cross-scene transition integration test.
- Task 22: Manual Playwright playthrough (full game flow, user in browser).
- Task 23: Open PR to master.

## Housekeeping

- Runtime memory JSONs are dirty in the working tree
  (`creature-memory-test-user-separate.json`,
  `npc-memory-test-user-separate.json`). Never stage them — CLAUDE.md rule.
- `git push origin feature/bulletproof-rendering` before ending the session
  so the worktree's work is safe on GitHub.

## Quick resume command

```bash
cd /root/koto-wt-bulletproof-render
git log --oneline -5    # Confirm HEAD is 6810b23 or later
npm run test:unit 2>&1 | grep -E "^# (tests|pass|fail)" | head
# If 1378/1378, ready to start Task 16a.
```

Then invoke the superpowers:subagent-driven-development skill and dispatch
the Task 16a implementer per the breakdown above.
