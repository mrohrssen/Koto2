# Speed Review Mode Design

## Overview

A new game mode for rapid vocabulary review, accessible from the hub screen. Displays three flashcards in a vertical stack. Users flip and grade cards independently, with each graded card immediately replaced by the next word in queue.

## Entry Point

- New "速習" (Speed Review) button on hub screen, above "ボット装備" (Equip Bots)
- Opens full-screen takeover using existing `takeover.js` pattern

## Screen Layout

```
┌──────────────────────────────┐
│ Cards Reviewed: 12 / 87    ✕ │  ← Header
│                              │
│  ┌────────────────────────┐  │
│  │       Card 1           │  │  ← Fixed height (~200px)
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │       Card 2           │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │       Card 3           │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘
```

### Header

- Left: "Cards Reviewed: X / Y"
  - X = cards reviewed this session (increments on each grade)
  - Y = initial queue size when entering (fixed, does not change)
  - X can exceed Y if cards cycle back via batch refresh
- Right: ✕ exit button, positioned to match existing modal close button

### Cards

- Three fixed-height cards in vertical stack
- Reuse existing flashcard component from `actions.js`
- Cards do not resize when flipped (fixed height accommodates back content)

## Card Interaction

Reuse existing flashcard mechanics exactly:

1. **Tap card** → flips in place (shows reading + meanings)
2. **After flip:**
   - Swipe right OR click right side → "knew it" (grade 4)
   - Swipe left OR click left side → "didn't know" (grade 1)
3. **On grade:**
   - TTS plays word audio
   - Review sent to JPDB immediately
   - Card pops out (scale to zero, ~100ms)
   - New card pops in (scale 0.8→1, ~150ms), showing front

## Word Queue

### Source

JPDB review queue (due + failed words), same source as combat.

### Global Change: Remove 50-Word Cap

Currently the queue is capped at 50 words. Remove this cap globally for both combat and speed review. Fetch the user's full due+failed list from JPDB.

### Batch Refresh Logic

New logic for both combat and speed review:

```
reviewedBatch = []

onCardGraded(word, grade):
  sendReviewToJPDB(word, grade)  // immediate
  reviewedBatch.push(word)

  if reviewedBatch.length >= 50:
    triggerBatchRefresh()

onCombatEnd() / onSpeedReviewExit():
  if reviewedBatch.length > 0:
    triggerBatchRefresh()

triggerBatchRefresh():
  fetchFreshQueueFromJPDB()
  replaceQueueWithFreshData()  // respects JPDB priority ordering
  reviewedBatch = []
```

When batch refresh occurs:
- Fetch fresh queue from JPDB (already sorted by priority)
- Replace current queue with fresh data
- Cards currently displayed on screen remain until graded
- Newly-due cards (from SRS "again" intervals) get slotted in by priority

## Empty State

When queue exhausted and all three card slots empty:

- Display centered message: "復習完了!" (Review Complete!)
- Exit button remains visible
- User taps ✕ to return to hub

## Exit Behavior

- ✕ button always visible in top-right
- Tapping exit:
  1. Triggers batch refresh if any pending reviews
  2. Closes takeover
  3. Returns to hub
- No confirmation dialog (speed is priority)

## Files to Modify

### Frontend

- `public/js/ui/exploration.js` - Add speed review button to `renderHub()`
- `public/js/ui/actions.js` - May need minor adjustments for card sizing
- `public/js/ui/takeover.js` - Add new `speedReview` takeover
- `public/game.html` - Add speed review takeover HTML structure
- `public/game.css` - Speed review specific styles
- `public/game.js` - Speed review initialization and state management

### Backend

- `src/jpdb.js` - Remove 50-word queue cap

### Shared Logic

- New module or section for batch refresh logic (used by both combat and speed review)

## Counter Display (Speed Review Only)

The "Cards Reviewed: X / Y" counter is specific to Speed Review mode. Combat does not display this counter.
