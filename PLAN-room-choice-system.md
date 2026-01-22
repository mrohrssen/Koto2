# Room Choice System Implementation Plan

## Overview

Replace linear room progression with binary choice at each room. Player sees two options for the next room and picks one. Styled like ward picker. No AI narration yet—just raw room type display.

## Flow

```
Enter Floor
    → Generate total room count for floor (e.g., 5)
    → Set roomsRemaining = count

Enter Room
    → Resolve room (combat, trap, treasure, etc.)
    → Post-combat shop (if applicable)
    → IF roomsRemaining > 1:
        → Generate 2 candidate rooms
        → Show room choice UI (ward picker style)
        → Player picks one
        → Decrement roomsRemaining
        → Enter chosen room
    → ELSE:
        → Enter boss room (no choice)
```

## State Changes

**Run state needs:**
- `roomsRemaining` - counter set at floor start, decrements each room
- `nextRoomOptions` - array of 2 generated room objects (cleared after choice)

**Remove/modify:**
- Current `rooms[]` array pre-generation at floor start
- `currentRoom` index tracking

## UI Component: Room Choice

**Location:** Appears after post-combat shop closes (or after room resolution if no shop)

**Layout:** Same as ward picker
- Two cards side by side
- Each card shows room type plainly
- Click to select

**Display per card (placeholder, no narration):**
```
┌─────────────────────┐
│                     │
│   roomType: trap    │
│   trapType: spike   │
│                     │
│     [ Select ]      │
└─────────────────────┘
```

Show all relevant room properties raw:
- `roomType` (encounter, trap, treasure, shrine, merchant, body)
- Subtype if applicable (trapType, enemy tier, etc.)
- No flavor text, no narration, just data

## Room Generation Changes

**Current:** `generateFloorRooms(floor, ward)` creates full array upfront

**New:**
- `initFloorRoomCount(floor)` - returns number of rooms for this floor
- `generateRoomOption(floor, ward)` - generates single room object
- Call `generateRoomOption` twice when player needs to choose

Keep existing room generation logic (weights, trap types, etc.) but call it per-room instead of per-floor.

## Game Loop Integration

**After room resolution:**
1. Check if `roomsRemaining > 1`
2. If yes: generate 2 options, show choice UI, wait for selection
3. If no: proceed directly to boss

**New game phase:** `room_choice` (between `post_combat_shop` and `exploring`)

## Boss Room

- Always final room
- No choice presented
- Triggered when `roomsRemaining === 1`

## Edge Cases

- **Merchant/shrine rooms:** Still show choice after interaction complete
- **Death:** Normal death handling, choice state doesn't persist
- **Floor transition:** Reset `roomsRemaining` for new floor

## Not In Scope (Future)

- AI-generated hacker narration for room descriptions
- Hacker drone character/personality
- Vocab-constrained text generation
- Meta-narrative breadcrumbs
- Room preview beyond raw type

## Testing

- Verify choice appears after every non-boss room
- Verify boss triggers when counter hits 1
- Verify room weights still respected in generation
- Verify both options are valid room types
- Verify UI matches ward picker styling
