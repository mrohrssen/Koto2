# Tutorial: Lock Talk/Fight to "Talk" with Glow

**Date:** 2026-04-13
**Status:** Approved

## Summary

During tutorial step 1 (BEFRIEND), apply the existing tutorial glow treatment to the talk/fight buttons: "Talk" gets `.tutorial-highlight` (gold pulse), "Fight" gets `.tutorial-dimmed` (faded + unclickable). This prevents the player from choosing Fight, which breaks the tutorial flow.

## Problem

When the befriend quiz triggers during the tutorial, both "Fight" and "Talk" buttons are equally clickable. If the player picks "Fight", the creature dies and the tutorial breaks — the befriend step can't complete.

## Design

**Frontend only.** In `renderBefriendQuiz()` in `public/js/ui/combat-loop.js` (~line 2926), after `renderButtonsAsync()` creates the two buttons, check `gameState.meta.tutorialStep`. If it equals 1 (BEFRIEND step):

- Button 0 ("Fight"): add `.tutorial-dimmed` — fades to 0.3 opacity, `pointer-events: none`
- Button 1 ("Talk"): add `.tutorial-highlight` — gold pulsing glow

The CSS classes already exist in `game.css` (lines 5773-5787) and are used by the skill selection glow (commit `9d22166`).

**No backend changes needed.** `shouldProtectBefriend(meta)` already handles wrong-answer retries on the server side. This change just prevents the Fight button from being clicked at all during the tutorial.

## Files Changed

| File | Change |
|------|--------|
| `public/js/ui/combat-loop.js` | Add tutorial glow to fight/talk buttons in `renderBefriendQuiz()` |
