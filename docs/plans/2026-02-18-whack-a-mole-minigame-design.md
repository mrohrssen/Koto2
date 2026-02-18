# Whack-a-Mole Mini Game — Design

## Overview

A timed creature/item matching mini game. A Japanese word appears at the top; a 3x3 grid of mahjong-style tiles randomly flips to reveal creature and item sprites. The player must tap the tile showing the creature or item that matches the word before time runs out.

New room type with 5% spawn chance.

## Game Flow

1. Player enters a `whackAMole` room. A "Play" button starts the game.
2. Server provides a pool of ~15-20 entries (creatures + items) with their words, readings, meanings, and sprite paths.
3. A random entry becomes the **target word**, displayed above the grid (kanji, reading, English meaning).
4. Tiles flip randomly on a relaxed cadence (one flip event every 1-2s). Roughly 4-5 tiles are face-up at any moment.
5. Exactly 1 tile shows the correct sprite at all times.
6. **Correct tap:** Score +1, timer +5s, new target word in ~0.1s, non-blocking celebration animation.
7. **Wrong tap (face-up tile):** Timer -3s, tile shakes briefly.
8. **Tap face-down tile:** Ignored.
9. Timer counts from 30 to 0. When it hits 0, game ends.
10. Results screen: score displayed, credits awarded (1 credit per point). Server records result.

## Data

Pool endpoint returns a mix of creatures and items:

```json
{
  "pool": [
    {
      "id": "kamedor",
      "type": "creature",
      "word": "亀",
      "reading": "かめ",
      "meaning": "turtle",
      "sprite": "/assets/sprites/creatures/kamedor.webp"
    },
    {
      "id": "curry-bread",
      "type": "item",
      "word": "カレーパン",
      "reading": "かれーぱん",
      "meaning": "curry bread",
      "sprite": "/assets/sprites/items/curry-bread.webp"
    }
  ]
}
```

Drawn randomly from `creatures.json` (using `baseWord`, `baseReading`, `baseMeaning`) and `items.json` (using `word`, `reading`, `meaning`).

## Mobile Layout

```
┌─────────────────────────────┐
│                             │
│  ┌───────────────────────┐  │
│  │     ⭐ SCORE: 7       │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │      ⏱ 00:23          │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │    亀   かめ           │  │
│  │    turtle             │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────┐┌───────┐┌───────┐│
│  │░░░░░░░││ sprite ││░░░░░░░││
│  │░BACK░░││       ││░BACK░░││
│  └───────┘└───────┘└───────┘│
│  ┌───────┐┌───────┐┌───────┐│
│  │ sprite ││░░░░░░░││ sprite ││
│  │       ││░BACK░░││       ││
│  └───────┘└───────┘└───────┘│
│  ┌───────┐┌───────┐┌───────┐│
│  │░░░░░░░││ sprite ││ sprite ││
│  │░BACK░░││       ││       ││
│  └───────┘└───────┘└───────┘│
│                             │
└─────────────────────────────┘
```

Tiles show only the sprite image (no text labels). Square tiles ~100px with 8px gaps.

## Tile Mechanics

- **Flip cadence:** One tile event every 1-2 seconds (random interval). A tile event either flips a face-down tile up (with a random sprite) or flips a face-up tile back down.
- **Target guarantee:** The correct answer sprite is always visible on exactly 1 tile. If it would be flipped down, a different tile flips instead.
- **On new target:** The old correct tile becomes a normal distractor. One tile is assigned the new correct sprite (either replacing a face-up tile's image or flipping up a face-down tile).
- **Duplicates allowed:** Distractor tiles can show the same sprite. The correct sprite appears on exactly 1 tile.

## Visual Design

Whimsical gacha aesthetic matching the game's existing light, friendly style.

- **Face-down tiles:** White/ivory with subtle decorative pattern, elevated shadow for physical tile feel.
- **Face-up tiles:** White background, sprite centered at ~80% fill, gentle inner shadow.
- **Flip animation:** CSS 3D `rotateY(180deg)` over ~0.3s.
- **Hit feedback:** Soft gold glow border (`--accent-amber`), floating "+1" that drifts up and fades. Non-blocking.
- **Miss feedback:** Soft red flash (`--accent-red`), gentle shake animation. Timer text briefly turns red.
- **Timer urgency:** Orange at ≤10s, red at ≤5s, gentle pulse when red.
- **Word card:** Standard `--bg-card` with `--shadow-soft`. Kanji large (~2rem), reading + meaning in `--text-secondary`.
- CSS classes prefixed `.wam-*` (whack-a-mole).

## Integration

### Room Type
- `ROOM_TYPES.whackAMole = 'whackAMole'`
- 5% chance in `generateSingleRoom()` (encounter drops from 60% to 55%)
- Room state: `{ score: 0, completed: false }`
- No consecutive-duplicate constraint needed (5% is low enough)

### Phase Machine
- New phase `'whackAMole'`
- Derived when `room.type === 'whackAMole' && !room.interacted`
- Transition: `whackAMole → room`

### API Endpoints
- `GET /api/game/whack-a-mole-pool` — returns ~15-20 random creatures + items with words and sprites
- `POST /api/game/whack-a-mole-complete` — receives `{ score }`, awards credits (1:1), marks room interacted

### Frontend
- `renderWhackAMole()` in `exploration.js`
- All game logic client-side (timer, flip scheduling, tap detection, scoring via `setInterval`)
- New CSS section for `.wam-*` classes

### Background & Narration
- Reuses current area's room background (no dedicated background)
- No narration, no NPC sprite — the game UI renders directly

## Architecture: Client-Side Game Loop

Server provides the data pool. All real-time logic runs in the browser:
- `setInterval` for tile flip scheduling and timer countdown
- Click handlers on tiles for tap detection
- Score tracked in local state, sent to server on completion
- Score is not cheat-proofed (single-player learning game, not competitive)
