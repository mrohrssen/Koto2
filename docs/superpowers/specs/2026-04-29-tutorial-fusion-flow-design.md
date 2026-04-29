# Tutorial Fusion Flow Rework — Design

**Date:** 2026-04-29
**Target branch:** `feature/fusion-lab-mvp`
**Status:** Approved for implementation planning

## Problem

The first-run tutorial should now teach toward the new area progression and the existing Fusion Lab feature. New players should still experience the current prologue and Cid's early touch points, but the first successful Starting Meadow clear should naturally introduce Hineko boss data, Knowledge Review, Fusion Cores, and the Fusion Lab before sending the player into Wild Plains.

Fusion Lab is already built on `feature/fusion-lab-mvp`. This work must not rebuild it. The tutorial should only add progression gates, reward hooks, Cid guidance, and UI highlighting around the existing Fusion Lab recipe flow.

All Cid tutorial moments should use the existing Cid tutorial narration function/pattern. Reward and unlock popups should reuse the existing word-level-up animation style with custom text instead of adding a separate reward animation system.

## Current Context

`feature/fusion-lab-mvp` already contains:

- `src/game/services/fusion-service.js` with the Fire Cat recipe that fuses `hi` + `neko` into `hineko` for 1 Fusion Core.
- `src/routes/game/fusion.js` with `/api/game/fusion` and `/api/game/fusion/start`.
- `public/js/ui/fusion-lab.js` with the existing Fusion Lab UI and fusion animation.
- `public/game.js` routing `phase: 'fusion_lab'` to `fusionLabUI.show()`.

The Starting Meadow / Wild Plains worktree state already has:

- Starting Meadow (`hajimari-no-hiroba`) as a 10-room area.
- Wild Plains (`wild-plains`) as a 30-room area.
- Hineko (`hineko`) as the boss for both areas.

## Goals

1. Keep the prologue exactly as it is.
2. Make the first Starting Meadow encounter a Cat (`neko`) creature.
3. Add Cid's Hineko boss warning only for the Starting Meadow Hineko fight.
4. Unlock Hineko fusion data only when the player defeats Starting Meadow Hineko.
5. Keep Fusion Lab disabled until Hineko fusion data is unlocked.
6. Grant the tutorial Fusion Core during the post-Hineko Knowledge Review flow.
7. Guide the player through the existing Fusion Lab recipe and fuse action.
8. End the tutorial by telling the player Hineko makes them ready for the next area.
9. Keep the old first-death recovery guidance as fallback if the player loses before beating Hineko.

## Player Flow

### 1. Prologue

Leave the prologue exactly as implemented today.

### 2. Starting Meadow Entry

The first normal encounter in Starting Meadow should be hardcoded to `neko`.

This Cat encounter should stay inside the existing befriend tutorial/protection path so the player is expected to own `neko` before Hineko fusion is introduced. The player already starts with `hi`, so owning `neko` plus the tutorial Fusion Core gives the existing Fire Cat recipe all of its normal ingredients.

All existing Cid touch points before and during early Starting Meadow play should stay as-is unless they conflict with the new Hineko victory path.

### 3. Starting Meadow Hineko Boss Intro

When the player starts the Hineko boss battle in Starting Meadow, Cid appears at battle start and says:

1. "Careful! This creature is stronger than normal."
2. "You can't befriend this creature, but defeat it and our scientists can collect data."
3. "With enough data, our fusion scientists can add it to your team."

This Cid interjection should only happen when:

- The current area is `hajimari-no-hiroba`.
- The current room is a boss room.
- The boss creature is `hineko`.
- The player has not already unlocked Hineko fusion data.

Wild Plains Hineko should not show this tutorial boss intro.

### 4. Hineko Boss Defeat

When the player defeats Hineko in Starting Meadow for the first time:

- Record that Hineko fusion data is unlocked.
- Show a reward popup: "Obtained Hineko Fusion Data!"
- Use the same basic visual style as the Fusion Core reward popup: short floating text, light particles, and no new full-screen reward system.
- Do not add Hineko directly to the creature collection at this point.

This unlock is a real progression gate. Fusion Lab stays inaccessible until this flag exists.

### 5. Hub After Starting Meadow Victory

After the player returns to the hub from the successful Starting Meadow run, Cid congratulates them, then introduces Knowledge Review using the same theme as the existing due-words tutorial:

1. Congratulate the player for defeating Hineko / clearing Starting Meadow.
2. Say that it looks like they are starting to learn Japanese.
3. Point them to Knowledge Review.

The hub should highlight Knowledge Review and dim other actions while this tutorial step is active.

### 6. Knowledge Review Fusion Core Reward

During the post-Hineko Knowledge Review tutorial session, the final reviewed word should grant 1 Fusion Core.

On that final review:

- Persistently add 1 Fusion Core.
- Show a reward popup: "Obtained 1x Fusion Core!"
- Use the same basic visual style as the Hineko fusion data popup.
- Cid says:
  1. "Oh! You got a fusion core!"
  2. "The next area is tough, let's use it to get stronger."
- The player then clicks Return to Hub.

This reward should be idempotent. The player should not be able to farm tutorial Fusion Cores by repeating review sessions or refreshing.

### 7. Fusion Lab Tutorial

After returning to the hub with Hineko fusion data unlocked and at least 1 Fusion Core:

- Fusion Lab becomes clickable.
- Fusion Lab is highlighted and other hub actions are dimmed.
- Cid says:
  1. "Look! We unlocked the data for Hineko. Select it."
  2. "Now click Fuse."

The tutorial should guide the existing Fusion Lab UI:

- Do not rebuild the Fusion Lab.
- Do not create a parallel recipe picker.
- The existing Fire Cat / Hineko recipe should be selected or highlighted.
- The existing Start Fusion button should perform the existing fusion action.

When the player completes the fusion, the existing Fusion Lab service adds `hineko` to the player's collection.

### 8. Final Hub Message

When the player returns to the hub after fusing Hineko, Cid says:

1. "With Hineko in your party, you should be strong enough for the next area!"
2. "Keep exploring, discovering new creatures, and getting stronger."

After this message, the guided tutorial is complete. Wild Plains should be available through the existing area unlock flow because the player beat Starting Meadow.

## Fallback Loss Path

If the player loses before defeating Starting Meadow Hineko:

- Keep the current first-death Cid encouragement and recovery behavior.
- Keep Knowledge Review guidance as a recovery mechanic if due words exist.
- Do not unlock Hineko fusion data.
- Do not enable Fusion Lab.
- Do not grant the tutorial Fusion Core unless the player later defeats Starting Meadow Hineko and reaches the post-Hineko review step.

This preserves a recovery path without letting the player bypass the intended Hineko victory gate.

## State Model

Add focused meta-progression state rather than overloading one tutorial step with several meanings.

Recommended fields:

- `tutorialFusionDataUnlocked`: object or map keyed by creature ID; initially empty. For this flow, `hineko` is recorded after Starting Meadow Hineko defeat.
- `tutorialFusionCoreAwarded`: boolean; initially `false`, set to `true` after the post-Hineko review grants 1 Fusion Core.
- `tutorialFusionComplete`: boolean; initially `false`, set to `true` after Hineko fusion succeeds and the final hub message is shown.

The implementation may choose more general names if they fit existing meta conventions better, but the behavior should remain explicit and idempotent.

Existing saves without these fields should default to:

- No tutorial fusion data unlocked.
- Tutorial Fusion Core not awarded.
- Tutorial fusion not complete.

Existing players with completed tutorials should not be forced through the new tutorial unless they reset tutorial state.

## Fusion Recipe Gate

The existing Hineko recipe should require Hineko fusion data before it is available to fuse.

Recommended behavior:

- Before Hineko data unlock, Fusion Lab is visible but disabled/not clickable from the hub.
- If the Fusion Lab route/API is reached directly before the unlock, the Hineko recipe should report locked/not fuseable.
- After Hineko data unlock, normal recipe requirements apply: owned ingredients plus Fusion Core cost.

This protects the progression gate in both UI and server logic.

## UI / Animation

Reuse the existing word-level-up animation pattern instead of adding a new reward modal or separate reward animation system.

Two new tutorial reward popups are needed:

- "Obtained Hineko Fusion Data!" at Starting Meadow Hineko defeat.
- "Obtained 1x Fusion Core!" on the final post-Hineko review card.

Both should be brief, anchored to the relevant active UI when possible, and should not block combat/result flow longer than necessary.

Implementation should replicate these popups through the existing word-level-up animation classes/spark behavior, not through a new animation component.

Because this touches visible UI, implementation must be visually verified with screenshots before completion is reported.

## Tests

Add focused coverage for:

- First Starting Meadow encounter is forced to `neko` for the first tutorial run.
- Starting Meadow Hineko defeat unlocks Hineko fusion data.
- Wild Plains Hineko defeat does not trigger the Starting Meadow tutorial unlock path.
- Fusion Lab is disabled/locked before Hineko fusion data exists.
- Hineko recipe becomes fuseable only after data unlock, required ingredients, and 1 Fusion Core.
- Tutorial Fusion Core reward is granted exactly once.
- Existing saves without new fields migrate safely.
- Existing players with completed tutorials are not forced into the new tutorial.

## Non-Goals

- Do not rebuild Fusion Lab.
- Do not add new fusion recipes.
- Do not add Hineko directly to the player collection on boss defeat.
- Do not change the prologue.
- Do not change Wild Plains boss behavior beyond ensuring it does not trigger Starting Meadow-only tutorial copy.
- Do not modify `data/dictionary.json`.
- Do not hand-write or change Japanese dialogue frames for this tutorial unless implementation later requires player-facing Japanese text.

## Verification

Minimum automated verification:

```bash
node --test tests/unit/game/tutorial-service.test.js
node --test tests/unit/game/rooms-koto2.test.js
npm test
```

Minimum manual / visual verification:

1. Start a fresh tutorial save.
2. Confirm prologue is unchanged.
3. Confirm first Starting Meadow encounter is Cat.
4. Reach Starting Meadow Hineko and confirm Cid's boss warning appears.
5. Defeat Hineko and screenshot the "Obtained Hineko Fusion Data!" popup.
6. Return to hub and confirm Cid points to Knowledge Review.
7. Complete the guided review and screenshot the "Obtained 1x Fusion Core!" popup.
8. Confirm Fusion Lab is highlighted and existing Fusion Lab UI is used.
9. Fuse Hineko through the existing flow.
10. Return to hub and confirm final Cid message appears.
11. Confirm Wild Plains is available and Hineko tutorial boss copy does not repeat there.
