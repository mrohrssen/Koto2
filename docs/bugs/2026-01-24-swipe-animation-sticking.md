# Bug: Card swipe animation sticks at edges instead of gliding off screen

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Low-Medium (UX polish issue)

## Symptoms

1. Swiping a flash card left or right is initially smooth
2. Card reaches the far edge and hangs/sticks instead of smoothly animating off-screen
3. Problem is worse when dialogue (enemy narration) interrupts mid-swipe — card gets stuck

## Expected Behavior

Card should smoothly glide off the edge of the viewport and disappear, then the next card slides in.

## Likely Cause

- The swipe animation may be waiting for a callback/promise (e.g., API response for answer submission) before removing the card
- Dialogue interruption likely blocks or delays the completion handler
- The CSS transition endpoint may not extend past the viewport edge

## Files to Investigate

- `public/js/ui/combat-loop.js` — swipe gesture handling and card transition logic
- `public/js/ui/actions.js` — may handle swipe completion callbacks
- `public/game.css` — card transition/transform CSS (check translateX endpoint values)
- `public/js/ui/takeover.js` — dialogue interruption flow
