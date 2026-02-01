# Branching Rooms MVP Design

## Overview

Add branching room choices to floor exploration. After completing each room (except boss), players choose between two doors, each leading to a different room type.

## Flow

```
[Enter Floor] → [Room 1 auto] → [Branch: pick Room 2] → [Room 2] → [Branch: pick Room 3] → ... → [Boss auto] → [Next Floor]
```

- First room: auto-entered (no choice)
- Middle rooms: branch choice before each
- Boss: auto-entered (no choice)
- Post-boss: proceed to next floor automatically, branching resumes on new floor

## Data Model

**Run state additions:**

```javascript
run: {
  rooms: [
    room1,           // Index 0: Single room (auto-entered)
    [roomA, roomB],  // Index 1: Branch pair
    [roomA, roomB],  // Index 2: Branch pair
    boss             // Last: Single room (boss)
  ],
  currentRoom: 0,
  pendingBranch: false,    // True when showing branch choice
  selectedRooms: []        // Track door choices: [0, 1, 0, ...]
}
```

## Room Generation

Update `generateFloorRooms()` in `src/game/rooms.js`:

1. First room: single room, standard probability
2. Middle rooms: pairs of rooms
3. Last room: boss (single)

**Special room constraints (shrine, quiz, wordDiscovery):**

1. Same branch: Door 1 and Door 2 cannot be the same special type
2. Back-to-back: The special type just completed cannot appear in either door of the next branch
3. Encounters are exempt from both rules

## UI Flow

**Phase:** `branch_selection`

**Components:**

1. Persistent narration showing door contents: "扉1: 遭遇。扉2: 祠。"
2. Two door cards labeled "扉1" and "扉2" (reuse ward-select card style)
3. Confirm button "進む" - enters selected room immediately

No transition narration after selection.

## Phase Machine

**New phase:** `BRANCH_SELECTION`

**Derivation in `derivePhase()`:**

```javascript
if (run.pendingBranch) {
  return PHASES.BRANCH_SELECTION;
}
```

**Transitions:**

| From | Trigger | To |
|------|---------|-----|
| Floor entered | Auto | Room 1 phase |
| Room completed (not boss) | Set `pendingBranch: true` | `branch_selection` |
| Branch selected | Clear `pendingBranch`, advance | Selected room's phase |
| Boss defeated | Floor complete | Ward selection |

## API

**New endpoint:**

```
POST /api/game/select-branch
Body: { door: 0 | 1 }
```

**Service method `selectBranch(doorIndex)`:**

1. Validate `pendingBranch === true`
2. Get pair from `rooms[currentRoom]`
3. Record choice in `selectedRooms`
4. Replace pair with selected room
5. Mark room explored
6. Set `pendingBranch = false`
7. Emit state

## Files to Modify

| File | Changes |
|------|---------|
| `src/game/rooms.js` | Update `generateFloorRooms()` for pairs; add special room constraints |
| `src/game/phase-machine.js` | Add `BRANCH_SELECTION` phase; update `derivePhase()` |
| `src/game/services/exploration-service.js` | Add `selectBranch()`; update room completion to set `pendingBranch` |
| `src/game/state.js` | Add `pendingBranch`, `selectedRooms` to run state |
| `src/routes/game/run.js` | Add `/api/game/select-branch` endpoint |
| `public/js/ui/exploration.js` | Add `renderBranchSelection()` with ward-select style |
| `public/js/game.js` | Handle `branch_selection` phase |

## Out of Scope

- Combat/quiz/shrine/wordDiscovery handlers (unchanged)
- Ward selection (unchanged)
- Enemy/boss definitions (unchanged)
