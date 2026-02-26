# Speed Review Undo Button Design

## Overview

Add an undo button to speed review that allows users to correct mistaken swipes within a 5-second window. Reviews are queued before being sent to JPDB, giving users time to undo.

## Behavior

**Core flow:**
1. User swipes card → card animates out, 5-second timer starts, undo button activates
2. If user swipes another card → pending review sends immediately, new card becomes pending
3. If user hits undo → pending review cancelled, card restores to slot (flipped)
4. If 5 seconds pass → review sends to JPDB, undo button deactivates
5. If user exits → pending review sends immediately before closing

**Single pending review:** Only one review can be pending at a time. Swiping a new card flushes the previous pending review.

## State Model

```js
let pendingReview = null;  // { word, slotIndex, grade, direction, timerId }
```

## UI Design

**Undo button:**
- Location: In `.speed-review-header`, before close button
- Icon: Rewind (⏪ or CSS-drawn)
- Style: Matches close button size/style

**Button states:**
- Inactive (default): Greyed out, `opacity: 0.3`, non-clickable
- Active: Full opacity, progress ring visible, clickable

**Progress ring:**
- SVG circle stroke depleting over 5 seconds
- Cyan glow (`#0ff`) matching cyberpunk theme
- `stroke-dashoffset` animation

**Card restoration:**
- Slides back from exit direction (reverse animation)
- Already flipped (showing meaning side)
- Uses anime.js

## File Changes

**game.html:**
- Add undo button with SVG icon + ring in `.speed-review-header`

**game.css:**
- `.speed-review-undo` base styles
- `.speed-review-undo.inactive` greyed state
- `.speed-review-undo-ring` SVG + animation
- Ring depletion keyframes (5s linear)

**speed-review.js:**
- Add `pendingReview` to state
- `queueReview(slotIndex, word, grade, direction)` - queue instead of immediate send
- `flushPendingReview()` - send pending review now
- `handleUndo()` - cancel pending, restore card
- `restoreCard(slotIndex, word, direction)` - animate card back
- Modify `gradeCard()` to use `queueReview()`
- Modify `handleExit()` to flush pending review

**dom.js:**
- Add `speedReviewUndo` getter

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User exits while pending | Flush review, then close |
| All cards complete while pending | Timer continues, undo works, celebration waits |
| Rapid triple-swipe | Each swipe flushes previous, last is undoable |
| Undo then re-swipe same card | Normal flow, new pending review |
| Tab closed while pending | Review lost (acceptable for 5s window) |
