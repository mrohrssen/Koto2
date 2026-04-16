# Speed Review Tutorial Step + Delete Chest/Crest Tutorial

**Date:** 2026-04-13
**Status:** Approved

## Summary

Replace the chest-open and crest-equip tutorial steps with a new speed review introduction step. Simplify the death hub narration. Comment out fire drops gifting (elements are no longer a thing).

## New Tutorial Sequence

```
Step  Name                Trigger
----  ------------------  -------------------------------------------
0     SKILL_SELECTION     First skill master encounter
1     BEFRIEND            First befriend-eligible combat
2     ITEM_SHOP           First item shop encounter
3     DEATH_HUB           First death, return to hub (auto-advance to 4)
4     SPEED_REVIEW        Hub render when dueCount > 0 (condition-gated)
5     CREATURE_FORMATION  Hub render after befriending multiple creatures
6     COMPLETE            Tutorial finished
```

## Changes by File

### src/game/services/tutorial-service.js
- Remove `CHEST_OPEN` and `CREST_EQUIP` from `TUTORIAL_STEPS` enum
- Add `SPEED_REVIEW: 4`
- Renumber: `CREATURE_FORMATION: 5`, `COMPLETE: 6`
- Remove `NARRATIONS` entries for CHEST_OPEN and CREST_EQUIP
- Add `NARRATIONS` entry for SPEED_REVIEW (see narration text below)
- Replace DEATH_HUB narration: `["That was tough huh?", "Don't worry, you'll get stronger each run!"]`
- Comment out `giftTutorialFireDrops()` and `shouldGiftFireDrops()` (elements deprecated)
- Comment out `shouldHardcodeCrestReward()` (chests no longer in tutorial)
- Update `getTutorialStep()` default: `?? 7` becomes `?? 6`

### src/game/loop.js
- `_onRunDefeat()` (line 177-183): Comment out the `giftTutorialFireDrops(this.meta)` call. Keep the `advanceTutorialStep` call — it advances step 2→3 on defeat, which is still needed. After defeat, step 3 (DEATH_HUB) will show narration in the hub, then auto-advance to 4.

### src/game/services/crest-service.js
- Comment out the import of `shouldHardcodeCrestReward` (line 9) and its usage (line 76). The function is being commented out in tutorial-service.js, so the import would break.

### src/routes/game/tutorial.js
- Update allowed client-advance range (line 16): change from `DEATH_HUB...CREATURE_FORMATION` to `SPEED_REVIEW...CREATURE_FORMATION` (steps 4-5). Step 3 (DEATH_HUB) auto-advances in the hub, not via client endpoint.

### public/js/ui/exploration.js — renderHub()
- **Step 3 (DEATH_HUB):** When `tutorialStep === 3`, show Cid narration ("That was tough huh?", "Don't worry, you'll get stronger each run!"), then auto-advance to step 4 via `/api/game/tutorial-advance` with `expectedStep: 3`. This replaces the old "Click Chests!" flow.
- **Step 4 (SPEED_REVIEW):** When `tutorialStep === 4` AND `dueCount > 0`, show Cid narration (5 pages), then apply glow to speed review button and dim others. Step advances to 5 when the player taps the glowing button.
- **Step 5 (CREATURE_FORMATION):** Update hardcoded `=== 6` to `=== 5`.

### public/js/ui/chests.js
- Remove the tutorial step 4 narration block (lines 46-54) — old CHEST_OPEN narration
- Remove the tutorial step 4 advance call (lines 130-138)

### public/js/ui/crests-equip.js
- Remove the `tutorialStep === 5` narration block (lines 51-53)

### public/game.js
- Update `tutorialStep === 6` to `=== 5` (line 858) for CREATURE_FORMATION advance
- Update `expectedStep: 6` to `expectedStep: 5` (line 863)
- Update `?? 7` fallbacks to `?? 6` for getTutorialStep defaults (lines 1831, 1842)

### tests/unit/game/tutorial-service.test.js
- Renumber all step assertions (7→6 for COMPLETE, etc.)
- Remove the `describe('tutorial chest override')` block (tests for shouldHardcodeCrestReward with CHEST_OPEN)
- Remove/update fire drops test cases
- Add test cases for new SPEED_REVIEW step number

## New: SPEED_REVIEW Step (Step 4)

### Trigger
Hub renders with `tutorialStep === 4` AND `dueCount > 0`.

When `dueCount === 0` at step 4: hub renders normally, no glow, no narration. Player uses all buttons freely. Tutorial fires next time they return to the hub with due words.

### Narration (Cid, 5 pages)
1. "Hey! It looks like you're starting to learn some Japanese."
2. "The Translator detected {dueCount} words for you to review."
3. "If you pass the review, you'll just see the Japanese for these words from now on."
4. "But don't worry, you can always click them to see the full translation."
5. "Keep exploring and watch your Japanese grow!"

Page 2 interpolates the actual `dueCount` value from the API.

### Glow Behavior
After narration completes:
- Speed review button (`📚 速習`) gets `.tutorial-highlight`
- All other hub buttons get `.tutorial-dimmed` (opacity 0.3, pointer-events none)

### Advancement
Step advances to 5 when the player taps the glowing speed review button. The button's onClick handler calls `/api/game/tutorial-advance` with `expectedStep: 4` before launching the speed review.

## Step 3→4 Advancement

When the hub renders at step 3 (DEATH_HUB):
1. Show Cid narration: "That was tough huh?" / "Don't worry, you'll get stronger each run!"
2. Call `/api/game/tutorial-advance` with `expectedStep: 3` to advance to step 4
3. Hub continues rendering normally (may immediately trigger step 4 narration if dueCount > 0)

The route's allowed-range must include step 3 for this auto-advance, OR the advancement can happen in `_onRunDefeat` in loop.js by changing the `=== 2` check to advance from 2 directly to 4 (skipping the DEATH_HUB render-time advance). **Recommended:** Keep step 3 in the allowed client-advance range so the narration shows first.

Updated route range: steps 3-5 are client-advanceable.

## Implementation Notes

### Existing patterns to reuse
- `showTutorialNarration(pages)` in exploration.js for Cid dialogue delivery
- `.tutorial-highlight` / `.tutorial-dimmed` CSS classes for glow system
- `apiGetVocabDueCount()` already called in `renderHub()` — reuse the result
- `/api/game/tutorial-advance` endpoint for client-side step advancement

### Edge case: dueCount timing
The player will almost certainly have due words by the time they've played enough to befriend multiple creatures (step 5 trigger). If not, step 4 simply waits — the hub is fully functional, just without the tutorial narration. Will be verified via playtesting.

### Migration
Existing players with `tutorialStep >= 4` (past the old CHEST_OPEN) need no migration — they map to COMPLETE or beyond. `getTutorialStep()` defaults missing values to 6 (COMPLETE), so old saves are safe. New saves start at 0.
