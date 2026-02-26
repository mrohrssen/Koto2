# Dual-Card Attack/Defend Combat System

## Overview

Replace the single flash card combat review with a dual-card system. Each turn shows two vocab cards - one for Attack, one for Defend. Player chooses which to review, and the choice determines combat behavior.

## User Experience

### Visual Layout

```
┌─────────────────────┐
│      ATTACK         │  ← Label
│       食べる         │  ← Random word A
└─────────────────────┘
        ↕ subtle gap
┌─────────────────────┐
│      DEFEND         │  ← Label
│       飲む          │  ← Random word B
└─────────────────────┘
```

- Vertical stack (JRPG menu style)
- Subtle spacing between cards
- Labels clearly identify each action

### Interaction Flow

1. Two cards displayed with different vocab words
2. Player taps one card to select
3. Selected card flips → existing review flow (swipe right/left to grade)
4. Unchosen word returns to available pool
5. Combat action resolves based on selection
6. Two new random cards shown, repeat

### Combat Resolution

| Choice | Player Attack | Enemy Damage | Chip Charge |
|--------|---------------|--------------|-------------|
| Attack | Chips fire normally | 100% | +1 all chips |
| Defend | Skipped (no damage dealt) | **50%** | +1 all chips |

## Tactical Value

**Skill charging strategy:** Players can defend for multiple turns to charge chip skills (5-turn charge) while taking reduced damage, then unleash powerful attacks.

**Survival:** When low HP, defending halves incoming damage while still progressing toward skill activation.

**Trade-off:** Defending sacrifices damage output for survivability and skill progression.

## Implementation

### Frontend Changes

**`public/js/ui/actions.js`**
- Add `showDualFlashCards(attackWord, defendWord)` function
- Render two cards vertically with labels and spacing
- Tap handler identifies which card selected (attack/defend)
- Selected card enters existing flip/swipe review flow
- Pass selection type back via callback

**`public/js/ui/combat-loop.js`**
- Replace `showNextFlashCardFromQueue()` with `showNextDualCardsFromQueue()`
- Pull two words from queue instead of one
- Modify `resumeCombatAfterVocab(grade, actionType)` to accept action type
- Pass `actionType` ('attack' or 'defend') to backend

**`public/js/word-practice.js`**
- Add `getTwoCombatWords()` - returns array of two words
- Add `returnWordToPool(word)` - puts unchosen word back in available queue

### Backend Changes

**`src/game/services/combat-service.js`**
- Modify `executeCombatCycle(attackerType, actionType)` to accept action type
- When `actionType === 'defend'`:
  - Skip player attack execution entirely
  - Apply 0.5x multiplier to enemy damage calculation
  - Still increment chip charges

**API endpoint** (`server.js` - `/api/game/combat-cycle`)
- Accept `actionType` in request body
- Pass to `executeCombatCycle()`

### Unchanged

- Chip skill activation (can fire any turn)
- JPDB review grading logic
- Chip pipeline execution
- Enemy attack mechanics (just damage multiplier applied)

## Edge Cases (Deferred)

- **1 word in queue:** Fall back to single card, attack only
- **0 words in queue:** Auto-attack with no review

These are unlikely in normal play and can break gracefully for now.

## Files to Modify

| File | Changes |
|------|---------|
| `public/js/ui/actions.js` | Add `showDualFlashCards()` |
| `public/js/ui/combat-loop.js` | Dual card display, action type tracking |
| `public/js/word-practice.js` | `getTwoCombatWords()`, `returnWordToPool()` |
| `src/game/services/combat-service.js` | Handle defend action type |
| `server.js` | Pass action type to combat service |
| `public/game.css` | Styling for dual card layout |
