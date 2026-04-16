# Tutorial Skill Selection Lock

**Date:** 2026-04-13
**Status:** Approved

## Problem

During tutorial step 0, the player is shown 3 skill offers and Cid says "Let's just pick the first one." But all 3 cards are equally clickable — nothing enforces picking the first one or visually guides the player.

## Solution

A dedicated `renderTutorialSkillMaster()` function in `exploration.js` that renders the 3 skill cards with the first one glowing and the other two dimmed/unclickable.

## Behavior

1. `renderSkillMaster()` checks `tutorialStep === 0` — if true, calls `renderTutorialSkillMaster()` instead of `renderChoices()`
2. `renderTutorialSkillMaster()` builds the same 3 cards using `.ui-choice` markup
3. Card 0 gets `.tutorial-highlight` (existing pulsing gold glow)
4. Cards 1 and 2 get `.tutorial-dimmed` (existing: opacity 0.3, pointer-events none)
5. Card 0's click handler calls `apiSkillMasterChoose` + `updateGameState` — same flow as normal

## Files Changed

- `public/js/ui/exploration.js` — add `renderTutorialSkillMaster()`, branch from `renderSkillMaster()`

No CSS or server changes needed. Existing `.tutorial-highlight` and `.tutorial-dimmed` classes cover the styling. Server already hardcodes the 3 tutorial skills.
