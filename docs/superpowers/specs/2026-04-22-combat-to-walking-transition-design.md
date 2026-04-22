# Combat-to-Walking Transition: Tighten Pacing

**Date:** 2026-04-22
**Status:** Design

## Problem

After the last enemy is defeated, the player waits ~5 seconds before the party visibly starts walking again. During the dead time, the parallax background is already accelerating, so the player sees the world whooshing past static creature sprites — an unintentional "frozen characters" feel that reads as a freeze or lag spike.

## Current timing chain

Measured from server response for the killing blow to walking wobble becoming visible:

1. KO animation for each defeated enemy (~300–600 ms) — `await animateKOForScene(...)` in `combat-loop.js:1044`
2. **`await delay(500)`** — `combat-loop.js:1122`, fires on victory before `stopCombatLoop` runs
3. `stopCombatLoop` starts — flags cleared, `setScrollState('accelerating')` fires (BG starts easing up over 2 s), `syncCreatures({ enemies: [] })` clears enemy sprites
4. **`await delay(720)`** — `combat-loop.js:1529`, comment "let final damage numbers display"
5. `animateEnemyDefeat()` → `scene.hideEnemies()` — already a no-op since step 3 cleared them
6. Optional NPC dialogue / post-combat shop (user-gated)
7. `showVictoryModal(result)` in `game.js:1351`:
   - `audio.stopBGM()`, `actions.clear()`, maybe collection toast
   - **`setTimeout(..., 300)`** — `game.js:1367`, no visible UI during this wait
   - `await loadGameState()` — network round trip, ~100–400 ms
   - `updateUI()`
8. `await modalPromise`
9. `mgr.transition(ExplorationScene, { roomId, allies })`
10. `ExplorationScene.onEnter` — `await syncCreatures({ allies, initial: true })` spawns sprites (~100–300 ms image load)
11. `this.formation.walkingEnabled = true` — **wobble becomes visible**

**Hard-coded dead-air:** 500 + 720 + 300 = **1520 ms** even before any unavoidable work.

## Goals

1. Start the walking wobble at the moment combat ends, so the scrolling background and the party animation begin in lockstep. No more "BG moving, characters frozen."
2. Cut the redundant hard-coded waits on the critical path.
3. Keep the small breathing beat that lets the final KO/damage popups resolve — don't make it feel cut off.
4. Preserve the existing "ghost formation" fix (player sprites stay alive through the victory window — we don't regress that).

## Non-goals

- Parallelizing `loadGameState` with the scene transition (Option B from brainstorming — more invasive, saves less time).
- Any change to defeat-flow timing (`showGameOverModal` / adventure report).
- Touching PvP victory pacing in this pass. *(If PvP shares this code path, the fix applies there automatically — see "PvE/PvP parity" below.)*

## Design

Three changes, all in the same critical path:

### 1. Flip walking wobble on when combat ends (perceptual fix)

In `stopCombatLoop` (`combat-loop.js:~1510`), right next to the existing `setScrollState('accelerating')` call, enable walking on the current BattleScene's formation context:

```js
setScrollState('accelerating');
const battleSceneForCleanup = mgr.currentScene;
if (battleSceneForCleanup instanceof BattleScene && !battleSceneForCleanup.disposed && !mgr.transitioning) {
  battleSceneForCleanup.formation.walkingEnabled = true;
}
```

Use the same `disposed` / `transitioning` guard pattern that the adjacent `syncCreatures({ enemies: [] })` call already uses (`combat-loop.js:1512`), so the flag flip and the sprite diff live under identical preconditions. `BattleScene` already has a `formation` ctx with `walkingEnabled: false` and already registers `_updateFormations` as an updater (`battle-scene.js:57`). No new plumbing is needed — we just flip the flag. The ally sprites, which are explicitly kept alive through the victory modal, will start wobbling immediately.

When `ExplorationScene` takes over later in `stopCombatLoop`, its `onEnter` already sets `walkingEnabled = true` on its own formation context, so the wobble continues seamlessly across the scene transition.

Pairing with `setScrollState('accelerating')` guarantees background scroll and wobble start in the same frame — direct answer to the user's "BG should scroll when creatures walk" constraint. Parallax accelerates over 2 s (`ACCEL_RATE = 2.0` in `parallax.js`), which matches the natural feel of characters easing back into a walk.

### 2. Delete the redundant 720 ms delay

Remove `await delay(720)` at `combat-loop.js:1529` along with its comment. The stated reason — "let final damage numbers display" — is obsolete: KO animations already ran (step 1, awaited), and the separate 500 ms settle at `combat-loop.js:1122` already provides a post-victory beat. Damage popups use their own timing via the VFX module and aren't blocked by this delay.

This also lets us drop the DOM enemy-formation clear (`combat-loop.js:1535-1536`) one line earlier so the sequence stays visually tight. *(Keep the clear — just move it up to right after `syncCreatures({ enemies: [] })`, before any awaits.)*

### 3. Delete the invisible 300 ms pre-load wait

In `showVictoryModal` (`game.js:1351`), replace the `setTimeout(..., 300)` with an immediate call:

```js
function showVictoryModal(result) {
  audio.stopBGM();
  actions.clear();
  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }
  return (async () => {
    try {
      await loadGameState();
      updateUI();
    } catch (err) {
      console.error('[showVictoryModal] state reload failed', err);
    }
  })();
}
```

The 300 ms has no associated UI to display; it's an idle pause. Cutting it means `loadGameState` runs as soon as the collection toast is queued (the toast has its own lifecycle; it doesn't need modal time).

We keep the existing `await delay(500)` at `combat-loop.js:1122` — this is the load-bearing "you won" beat that lets KO sprites finish fading and gives the victory SFX room to breathe.

## Expected timing after changes

| Stage | Before | After |
|---|---|---|
| KO animations | 300–600 ms | 300–600 ms (unchanged) |
| Victory settle | 500 ms | 500 ms (kept) |
| `stopCombatLoop` pre-modal work | 720 ms + sync (~50 ms) | ~50 ms (sync only) |
| Pre-`loadGameState` wait | 300 ms | 0 ms |
| `loadGameState` + `updateUI` | 100–400 ms | 100–400 ms (unchanged) |
| Scene transition + sprite spawn | 150–400 ms | 150–400 ms (unchanged) |
| **Wobble visible after last KO** | **~2.0–2.8 s** | **~1.0–1.8 s, and starts moving within 50 ms of combat end** |

The perceived "waiting for walking" drops to zero because change #1 starts the wobble in lockstep with the background scroll. The measured wall-clock time to `ExplorationScene` drops by roughly **1 second**.

## Risks

- **BattleScene type import.** `combat-loop.js` already imports `BattleScene` (grep confirms). No new import needed.
- **Formation context access.** `scene.formation` is a documented public surface on both scenes; flipping its `walkingEnabled` is how `ExplorationScene.onEnter` already controls this (`exploration-scene.js:66`). Mirroring the pattern on BattleScene is in-bounds.
- **Race with `syncCreatures({ enemies: [] })`.** We flip the flag before the await. `_updateFormations` ticks only allies that remain in the sprite map, so removing enemies mid-tick is safe — the formation already tolerates this.
- **KO animation interaction.** The wobble is a positional/rotational sin wave; KO is a fade+alpha tween on the specific defeated enemy sprite. They operate on different properties and different sprites, so no conflict. (Verified: wobble in `formation.js` doesn't touch alpha; KO in the vfx module doesn't touch position-wobble offsets.)
- **Dropped `setTimeout(300)` breaking callers.** `showVictoryModal` is awaited exactly once, in `stopCombatLoop` (grep confirms — `combat-loop.js:1583`). The new async IIFE returns the same Promise<void> shape.

## PvE/PvP parity

Per CLAUDE.md, combat features must work across PvE and PvP. All three changes live in `combat-loop.js` / `game.js` shared code paths; PvP victory uses the same `stopCombatLoop` + `showVictoryModal` flow. Confirm this by searching for any PvP-specific override before implementation; if one exists, mirror the change there.

## Testing

- **Manual playtest (primary):** start a run, enter combat, defeat all enemies, visually confirm that:
  - The creature wobble animation starts within a frame of the last KO fade.
  - The background scroll acceleration and the wobble begin together.
  - No visual pop or "ghost formation" gap appears during the scene transition.
  - Damage numbers and KO animations complete naturally (not cut off).
- **Regression guard:** verify NPC-combat flow (enters `npcDialogueUI.runNpcDialogue` + `showPostCombatShop`) still blocks correctly before scene transition.
- **Unit/integration:** this is a visual/timing change; existing combat tests shouldn't need updates. Run `npm test` to confirm no regressions.
- **No automated timing assertion** — visual feel is the success criterion.

## Visual verification

Per CLAUDE.md, visual/animation changes MUST be verified with screenshots. After implementation:

1. Start dev server (`npm run dev`).
2. Navigate to combat via Playwright MCP.
3. Defeat all enemies.
4. Take screenshots immediately at: last KO, +500 ms, +1 s, +1.5 s after combat end.
5. Confirm wobble visible in the +500 ms frame and scene transition smooth by +1.5 s.
6. Delete screenshots after review.
