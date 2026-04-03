# Fix: Ghost Sprites & Player Disappearance During Room Transitions

**Date:** 2026-04-02
**Status:** Applied + bulletproofed (A+C)

## Symptoms

1. **Enemy ghost sprites** — After winning combat, the defeated enemy team's sprites reappear at full opacity during the room transition, before the next room's NPC arrives. They sit at the final formation positions like "ghosts."
2. **Player sprite disappearance** — Player creature sprites vanish momentarily during every room transition, then reappear.

## Root Causes

### Enemy ghost: premature `updateUI()` in `stopCombatLoop`

`stopCombatLoop` (combat-loop.js) follows this sequence after a victory:

1. `pixiHideFormation('player')` + `pixiHideFormation('enemy')` — clears Pixi sprites
2. `showVictoryModal(result)` — shows "Victory!" narration, starts a 1500ms timer that calls `loadGameState()` + `updateUI()` with the **new** room phase
3. `updateUI()` — runs **immediately**, while `gameState.phase` is still `'combat'`

Step 3 was the bug. `updateUI()` calls `updateScene()`, which for `phase: 'combat'` re-renders the enemy formation via `scene.showEnemies()` and the player formation via `pixiShowFormation('player')`. This recreated the defeated enemies as live sprites at their final positions. These persisted for 1500ms until the timer's `loadGameState()` fetched the new phase and hid them — but by then, `playRoomTransition` had already started, so the user saw enemy "ghosts" during the transition.

### Player disappearance: full formation rebuild on HP-only changes

Between rooms, `_healAllLivingCreaturesForRoomEntry()` on the server heals creatures, changing their HP. The DOM dedup check in `scene.showFormation` compared creatures by `id:hp`. Any HP change caused a full teardown:

1. `container.innerHTML = ''` — DOM slots removed
2. `pixiFormation.showFormation()` — old Pixi sprites removed via `container.removeChildren()`
3. Async texture loading begins for each creature
4. New sprites appear one by one as textures resolve

Between steps 2 and 4, the Pixi container is empty — player sprites vanish for at least one frame (often several, since each `Assets.load()` is an async microtask even for cached textures).

## Fixes Applied

### 1. Remove premature `updateUI()` from `stopCombatLoop`

**File:** `public/js/ui/combat-loop.js`

Removed the `updateUI()` call at the end of `stopCombatLoop`. The victory modal covers the screen during the 1500ms gap, and `showVictoryModal`'s timer already handles the proper `loadGameState()` + `updateUI()` with the correct new phase. `showGameOverModal` handles its own UI independently.

### 2. Hide enemy formation at start of `playRoomTransition`

**File:** `public/js/ui/room-transition.js`

Added `hideFormation('enemy')` as the first action in `playRoomTransition()`. This is a safety net ensuring no stale enemy formation (DOM or Pixi) survives into a new room, regardless of what happened in the previous phase.

### 3. In-place HP bar updates instead of full formation rebuild

**File:** `public/js/ui/scene.js`

Changed the DOM dedup check in `showFormation()` to compare creature **IDs only** (not `id:hp`). When the same creatures are present but HP/MP changed:

- HP bar fill width and color are updated in-place
- MP bar fill width is updated in-place
- KO class is toggled on the sprite element
- `dataset.hp` is updated on the slot
- Pixi `showFormation` is called with `skipEnter: true` (reuses existing sprites)

This eliminates the full DOM teardown + async Pixi texture reload cycle, so player sprites remain continuously visible through room transitions.

### 4. Earlier fix: View Transition API removal

**File:** `public/js/ui/scene.js`, `public/game.css`

The `document.startViewTransition()` call in `setBackground()` was removed, along with all View Transition API CSS rules. The View Transition API captures a static screenshot of the page (including the Pixi canvas) before applying changes, then crossfades the screenshot with the live page. This screenshot included stale enemy sprites even after `pixiHideFormation` had been called, because Pixi's ticker hadn't yet repainted the canvas when the snapshot was taken. Background changes are now instant (no crossfade).

## Files Changed

| File | Change |
|------|--------|
| `public/js/ui/combat-loop.js` | Removed `updateUI()` at end of `stopCombatLoop` |
| `public/js/ui/room-transition.js` | Added `hideFormation('enemy')` at start of `playRoomTransition`; added import |
| `public/js/ui/scene.js` | ID-only dedup check with in-place HP/MP bar updates; removed View Transition API from `setBackground`; added `opacity` reset in `showFormation`/`hideFormation` |
| `public/game.css` | Removed View Transition API CSS rules |

### 5. Bulletproof fixes (2026-04-03)

**Fix A — Client-side combat deactivation (combat-loop.js)**

`stopCombatLoop` now sets `gameState.combat.active = false` on the client immediately after `combatActive = false`. This makes `derivePhase()` return a non-combat phase instantly, so any `updateUI()` call during the ~2200ms victory window hits `scene.hideEnemies()` instead of re-rendering defeated enemies.

**Fix C — DOM formation clear after damage numbers (combat-loop.js)**

After the 720ms damage-number delay, the DOM `#enemy-formation` container is cleared (`innerHTML = ''`). This closes the window where stale DOM formation slots could trigger the `showFormation()` dedup path to recreate Pixi sprites via `skipEnter: true`.

**Fix D — Pixi sameFormation() ID-only comparison (formation.js, 2026-04-03)**

Fix #3 changed the DOM dedup in `scene.js` to compare creature IDs only (not HP), enabling in-place bar updates. But the Pixi layer's `sameFormation()` in `formation.js` still compared HP values. When creatures were healed between rooms (`_healAllLivingCreaturesForRoomEntry`), the HP mismatch caused:

1. `sameFormation()` returns false → full `container.removeChildren()`
2. Async `Assets.load()` begins for each creature texture
3. On mobile with rapid state updates, cascading `loadRequestId` increments cancel in-flight loads
4. Pixi canvas stays empty — sprites "disappear"

Fix: removed HP from `sameFormation()` (ID-only, matching scene.js). Added in-place KO state updates (alpha/tint) on the match path so defeated creatures still show correctly without a full rebuild.

**Fix E — Stop destroying player pixi sprites at combat end (combat-loop.js, 2026-04-03)**

`stopCombatLoop` called `pixiHideFormation('player')` alongside `pixiHideFormation('enemy')`. This destroyed the player's creature sprites the instant combat ended. But the corresponding DOM formation slots (name plates, HP bars) were NOT cleared — they survived because the DOM dedup path in scene.js keeps them alive. Result: for 1500ms+ (victory timer + async texture reload), the player saw DOM info boxes floating in the scene with no creature images underneath — the "ghost formation" effect.

Fix: removed `pixiHideFormation('player')` from stopCombatLoop. Only enemy sprites are destroyed at combat end. Player sprites persist through victory → room transition → next room, matching the DOM formation lifecycle.
