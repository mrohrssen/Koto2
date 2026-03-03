# Befriend Split-Card Design

## Problem

The move-based combat UI replaced flash cards, severing the only entry point to the creature befriend conversation system. All backend befriend logic (3-round AI dialogue, party management, collection tracking) is intact but unreachable from the UI.

## Solution

Split the item card in the move-selection grid to show a **はなす (Talk)** button alongside it when befriending is available. Failed talk attempts trigger an enemy attack. Success chance scales with enemy rarity and remaining HP.

## UI Layout

### Normal (no befriend available)

```
┌──────────┬──────────┐
│  Move 1   │  Move 2   │
├──────────┼──────────┤
│  Move 3   │ 🎒 アイテム │
└──────────┴──────────┘
```

### Befriend available (1 enemy alive, ≤50% HP)

```
┌──────────┬──────────┐
│  Move 1   │  Move 2   │
├──────────┼─────┬────┤
│  Move 3   │ 💬   │ 🎒  │
│           │はなす│アイテム│
└──────────┴─────┴────┘
```

The bottom-right cell splits into two halves via a flex container. Left half is the befriend trigger, right half is the original items button (narrower). Both halves share the same glassmorphic styling as the original item cell.

## Trigger Conditions

All four must be true:

1. **Creature combat** — `isCreatureCombat === true`
2. **Exactly 1 enemy alive** — `enemies.filter(e => e.hp > 0).length === 1`
3. **That enemy's HP ≤ 50%** — `(enemy.hp / enemy.maxHp) <= 0.5`
4. **Not an NPC trainer fight** — `!state.combat?.npcId`

## Talk Acceptance (RNG Gate)

When the player taps はなす, a server-side RNG check determines whether the creature agrees to talk. On failure, the creature attacks instead (the player loses their turn and takes damage).

### Formula

```
base = { common: 80, uncommon: 65, rare: 50, epic: 35, legendary: 20 }
hpPct = Math.round((enemy.hp / enemy.maxHp) * 100)
hpBonus = hpPct <= 10 ? 15 : hpPct <= 25 ? 10 : 0
chance = Math.min(95, base[rarity] + hpBonus)
```

### Success Probability Table

| HP ↓ \ Rarity → | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| **1–10%** (critical) | 95% | 80% | 65% | 50% | 35% |
| **11–25%** (low) | 90% | 75% | 60% | 45% | 30% |
| **26–50%** (cautious) | 80% | 65% | 50% | 35% | 20% |

### On failure

- The creature refuses (brief message/animation)
- Enemy immediately attacks the player's active creature
- Turn ends — player must select moves again next round
- Player can attempt はなす again on their next turn

### On success

- The existing 3-round befriend conversation launches (`executeBefriendAction()` → `/api/game/befriend-conversation` → `/api/game/befriend-answer`)
- Conversation rounds are AI-generated, vocab-validated (i+1), personality-driven
- Wrong answer during conversation also triggers an enemy attack (existing behavior)
- All 3 rounds correct → creature joins party (or release prompt if full)

## Code Changes

### `public/js/ui/move-select.js`

- Add `buildSplitItemsBefriendCell()` — returns a flex container with befriend (left) + items (right)
- Modify `showMoves()` signature to accept `{ befriendAvailable, onBefriend }` options
- When `befriendAvailable`, append the split cell instead of the normal items cell

### `public/js/ui/combat-loop.js`

- Compute befriend eligibility before calling `showMoves()` (reuse existing check at line 476)
- Pass `befriendAvailable` and `onBefriend` callback to `showMoves()`
- The `onBefriend` callback calls a new endpoint or adapts the existing befriend flow
- Handle the talk-rejection case: show brief refusal, trigger enemy attack animation

### `public/game.css`

- Add `.move-split-cell` — flex container, same dimensions as `.move-items-cell`
- Add `.move-befriend-half` and `.move-items-half` — each takes ~50% width with a small gap
- Both halves inherit glassmorphic styling from `.move-items-cell`
- Befriend half gets the same `moveCardIn` entrance animation

### `src/game/services/creature-combat-service.js`

- Add `rollTalkAcceptance(enemy)` — implements the RNG formula above
- Returns `{ accepted: boolean, chance: number }` for logging/debugging

### Server route (in combat routes)

- New endpoint `POST /api/game/befriend-talk` or extend existing `/befriend-conversation`
- Rolls talk acceptance first; if rejected, triggers enemy attack turn and returns failure
- If accepted, proceeds to generate/return the 3-round conversation as before

## What Does NOT Change

- The 3-round conversation system (narration engine, dialogue generation, answer validation)
- Party management (pending captures, release prompt, collection tracking)
- Backend befriend logic (`processBefriend`, `handleBefriendAnswer`)
- Any other combat UI elements (move cards, creature row, enemy sprites)
