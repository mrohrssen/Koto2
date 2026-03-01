# Sub-Area System Design

**Date**: 2026-03-01
**Status**: Approved design — ready for implementation planning

## Goal

Add named sub-areas to each area, turning anonymous room slots ("エリア3/10") into named Japanese locations ("小さな池 — 3/10"). Each sub-area teaches 2 vocabulary words (modifier + location noun) and displays a specific background image.

At full scale (Stage 10): 50 areas × 5-8 sub-areas = ~300 unique named locations = ~330-380 vocabulary words. This makes the area system one of the largest vocabulary delivery mechanisms in the game.

## Design Decisions

- **Unique sub-areas per area.** Each area has its own set of 5-8 sub-areas. No shared pool — sub-areas are thematically tied to their parent area. Words CAN overlap with other systems (creature modifiers, narration adjectives) — that's intentional cross-system reinforcement.
- **Rooms become named sub-areas.** Each procedurally generated room gets assigned a sub-area from the area's pool. Room types (encounter, shrine, quiz, etc.) are unchanged — the sub-area is a vocabulary label + background, not a gameplay modifier.
- **Sub-areas affect backgrounds.** Each sub-area maps to a specific background variant from the area's existing set (20 variants available per area). This replaces the current random background selection.
- **No gameplay logic changes.** Room type algorithm, creature spawning, branching, win condition, and NPC assignments are all unchanged. Sub-areas are a data + display feature.

## Data Structure

### Per-Area Sub-Area Definitions

Added as a `subAreas` array on each area object in `data/new-areas-staging.json`:

```json
{
  "id": "okunomori",
  "name": "奥の森",
  "nameEn": "Deep Forest",
  "subAreas": [
    {
      "id": "okunomori-pond",
      "name": "小さな池",
      "reading": "ちいさないけ",
      "nameEn": "Small Pond",
      "modifier": {
        "word": "小さな",
        "reading": "ちいさな",
        "meaning": "small",
        "rank": 890
      },
      "location": {
        "word": "池",
        "reading": "いけ",
        "meaning": "pond",
        "rank": 2100
      },
      "background": "areas/okunomori/okunomori_03.webp"
    }
  ]
}
```

Each sub-area has:
- `id` — unique identifier (`{areaId}-{slug}`)
- `name` — Japanese name (modifier + location noun)
- `reading` — full hiragana reading
- `nameEn` — English translation
- `modifier` — the modifier word with JPDB rank and dictionary-accurate meaning
- `location` — the location noun with JPDB rank and dictionary-accurate meaning
- `background` — specific background variant from the area's set

### Stage 1 Content: 5 Areas × 6 Sub-Areas = 30 Sub-Areas

Sub-area names will be hand-curated using JPDB frequency data. Each modifier and location noun must have a dictionary-accurate English meaning (per CLAUDE.md translation rules). Words are chosen to be thematically appropriate for their parent area.

Example distribution:

```
奥の森 (Deep Forest) — 6 sub-areas
├── 小さな池 (Small Pond)
├── 古い小屋 (Old Hut)
├── 暗い道 (Dark Path)
├── 苔の草原 (Mossy Clearing)
├── 隠れた泉 (Hidden Spring)
└── 深い洞窟 (Deep Cave)

静かな公園 (Peaceful Park) — 6 sub-areas
├── 広い芝生 (Wide Lawn)
├── 白い花壇 (White Flower Bed)
├── ...

秘密の図書館 (Secret Library) — 6 sub-areas
├── 長い廊下 (Long Corridor)
├── ...

隠れた浜 (Hidden Beach) — 6 sub-areas
├── 浅い入り江 (Shallow Cove)
├── ...

魔法の学校 (Magic School) — 6 sub-areas
├── 高い塔 (Tall Tower)
├── ...
```

Vocabulary target: ~30-40 unique words (some modifiers/nouns may repeat across areas as cross-system reinforcement with creature modifiers, narration adjectives, etc.).

## Code Changes

### 1. Room Generation (`src/game/rooms.js`)

In `generateFloorRooms()`, assign a sub-area to each room:

```javascript
export function generateFloorRooms(areaId, roomCount, ...) {
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];

  for (let i = 0; i < roomCount; i++) {
    const room = generateSingleRoom(...) || generateBranchPair(...);
    // Assign sub-area, cycling through pool
    if (subAreas.length > 0) {
      if (Array.isArray(room)) {
        // Branch pair — both doors get the same sub-area (it's one location)
        room[0].subArea = subAreas[i % subAreas.length];
        room[1].subArea = subAreas[i % subAreas.length];
      } else {
        room.subArea = subAreas[i % subAreas.length];
      }
    }
  }
}
```

### 2. Room Narration (`src/game/rooms.js`)

Update `getRoomEntryNarration()` to use sub-area name:

```javascript
export function getRoomEntryNarration(room) {
  const locationLabel = room.subArea
    ? `${room.subArea.name} — ${room.roomNumber}/${room.totalRooms}`
    : `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.encounter:
      return `${locationLabel}に入った。SYSTEM接続された市民がいる！`;
    // ... same for other types
  }
}
```

### 3. Background Selection (`src/game/services/exploration-service.js`)

Replace `randomAreaBg(areaId)` with sub-area-specific background:

```javascript
// Before:
this.gm.run.background = randomAreaBg(areaId);

// After:
const currentRoom = this.gm.run.rooms[this.gm.run.currentRoom];
const activeRoom = Array.isArray(currentRoom) ? currentRoom[0] : currentRoom;
this.gm.run.background = activeRoom?.subArea?.background || randomAreaBg(areaId);
```

### 4. Frontend Display

In the exploration UI, display sub-area name where "エリア X/Y" currently appears. The parent area name (奥の森) stays as the area header.

### 5. Branch Selection Display

When showing door choices, include the sub-area name:

```
Door 1: 小さな池 — Encounter
Door 2: 小さな池 — Shrine
```

Both doors in a branch pair share the same sub-area (you're in one location choosing between activities).

## What Does NOT Change

- Room type selection algorithm (encounter/shrine/quiz/dealer probabilities)
- Creature spawning (still uses area-level creature pool)
- Branching/door system mechanics
- Win condition (10 areas to complete a run)
- NPC assignments (still area-locked)
- Area selection flow
- State persistence format (sub-area is stored on the room object)

## Vocabulary Scaling

| Stage | Areas | Sub-Areas per Area | Total Sub-Areas | Est. Unique Words |
|---|---|---|---|---|
| 1 | 5 | 6 | 30 | ~50 |
| 2 | 10 | 6-7 | 65 | ~100 |
| 3 | 20 | 6-7 | 130 | ~160 |
| 5 | 35 | 6-8 | 230 | ~280 |
| 10 | 50 | 5-8 | 330 | ~380 |

Word counts include area names (modifier + noun) plus sub-area names (modifier + noun). Overlap with other systems is expected and intentional.

## Testing

- Unit: Sub-area assignment in `generateFloorRooms()` — all rooms get a sub-area, cycling works correctly
- Unit: `getRoomEntryNarration()` uses sub-area name when present
- Unit: Background selection uses sub-area background when available, falls back to random
- Integration: Full area → room → narration flow includes sub-area data in state
- Manual: Playtest to verify sub-area names and backgrounds display correctly
