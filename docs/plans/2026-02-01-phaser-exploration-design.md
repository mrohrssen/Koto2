# Phaser Exploration System Design

> **Status:** Approved design spec
> **Date:** 2026-02-01
> **Goal:** Add walk-around exploration between encounters using Phaser 3

## Overview

Integrate Phaser 3 for room exploration while keeping existing HTML/CSS combat and UI systems. Players walk around rooms, collect credits, talk to NPCs, and enter doors to proceed.

```
┌─────────────────────────────────────────────────────────┐
│                    Game Container                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │  Phaser Canvas  │ OR │      HTML UI Layer          │ │
│  │  (exploration)  │    │  (combat, menus, dialogue)  │ │
│  └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Phase Flow

1. Player enters room → Phaser canvas shows exploration scene
2. Player walks near object → context button appears at bottom
3. Player taps button → Phaser hides, HTML UI takes over
4. Interaction completes → HTML hides, Phaser shows
5. Player walks to door, taps ENTER → next room loads in Phaser

### Design Principles

- **Rapid prototype:** Simple but attractive, avoid over-engineering
- **HD2D aesthetic:** Layered depth, atmospheric lighting, pixel-art sprites
- **Mobile-first:** Portrait orientation, touch controls, iPhone 15 Pro/Max target
- **Incremental:** Start simple, enhance later (scrolling, parallax, animations)

---

## Room System

### Five Room Templates

| Template | Contents | Interaction |
|----------|----------|-------------|
| **Encounter** | Enemy sprite, 0-2 credit pickups | TALK → combat |
| **Shrine** | Fox NPC, altar object | TALK → shrine UI |
| **Quiz** | Quiz Master NPC, podium | TALK → quiz UI |
| **Word Discovery** | Terminal/scroll object | TALK → word discovery UI |
| **Boss** | Large enemy, no exit until defeated | TALK → boss combat |

### Room Layout (Portrait, Single-Screen)

```
┌──────────────────────┐
│   [Door]   [Door]    │  ← Top: 2 exit doors (fixed count for prototype)
│                      │
│    [NPC/Enemy]       │  ← Upper-mid: main interaction target
│                      │
│  [Credit] [Credit]   │  ← Mid: optional pickups
│                      │
│      [Player]        │  ← Lower-mid: player spawn
│                      │
│   ══════════════     │  ← Bottom: entry point
└──────────────────────┘
```

### Door Placement

- 2 doors fixed for prototype (left-third and right-third of top)
- Each door leads to a different room option (existing branching system)
- Walk to door + tap ENTER to transition

---

## Visual Design

### HD2D Approach (Phase 1 - Simplified)

- **Single background layer** per floor (parallax layers added later)
- **Phaser lighting system** for atmosphere (ambient + point lights)
- **Bloom/glow effects** on light sources, doors, pickups
- **Particles** for dust motes, energy wisps
- **Vignette** for edge darkening

### Resolution & Scaling

| Device | Aspect Ratio | Handling |
|--------|--------------|----------|
| iPhone 15 Pro | ~19.5:9 | Base design, scales to fit |
| iPhone 15 Pro Max | ~19.5:9 | Scales up, same proportions |
| iPad | ~4:3 | Pillarbox (bars on sides) |

**Base canvas:** 400 × 760 pixels (portrait)

```javascript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  width: 400,
  height: 760
}
```

---

## Controls

### Floating Touch Control

- Touch anywhere on canvas to start
- Drag in any direction to move
- Distance from start point = movement speed (with deadzone)
- Release to stop
- 8-directional movement, smooth acceleration

### Desktop Fallback

- Arrow keys / WASD for movement
- Mouse click-drag same as touch

### Context Button System

When player walks near an object (~40px radius), a context button appears at bottom:

| Near Object | Button | Action |
|-------------|--------|--------|
| Door | `ENTER` | Advance to next room |
| Credit pickup | `GRAB` | Collect credits |
| NPC (fox, quiz master) | `TALK` | Open HTML interaction |
| Enemy | `TALK` | Start combat |

**Behavior:**
- Only one button at a time (nearest object wins)
- Button fades in/out with brief animation
- Styled to match existing UI (cyberpunk, orange accent)
- Large touch target for mobile

---

## Phaser Architecture

### Scene Structure

```javascript
ExplorationScene {
  // Layers (back to front)
  backgroundLayer    // Floor background image
  entityLayer        // NPCs, enemies, items, player, doors
  lightingLayer      // Phaser light effects
  uiLayer            // Context button
}
```

### Scene Lifecycle

1. `init(roomData)` - Receive room type, floor, door destinations
2. `preload()` - Load floor background, room-type objects
3. `create()` - Build layers, place entities, set up lighting
4. `update()` - Handle movement, check proximity for context button

### Phaser ↔ HTML Bridge

```javascript
// Phaser → HTML (trigger interaction)
window.gameEvents.emit('startInteraction', { type: 'combat', enemyId: 'drone_01' });

// HTML → Phaser (interaction complete)
window.phaserGame.scene.getScene('exploration').onInteractionComplete({ canProceed: true });
```

---

## API Integration

### Existing Endpoints Used

```javascript
GET  /api/game/state           // Get room data on load
POST /api/game/start-combat    // When TALK on enemy
POST /api/game/interact-shrine // When TALK on fox
POST /api/game/advance-room    // When ENTER on door
```

### New Endpoint

```javascript
POST /api/game/collect-credits
Body: { amount: 10 }
Response: { success: true, newTotal: 150 }
```

### State Flow

```
[Phaser: exploring]
       │
       ├── TALK on enemy → POST /api/game/start-combat
       │                   → Phase becomes 'combat'
       │                   → Phaser hides, HTML shows
       │
       ├── TALK on NPC → POST /api/game/interact-shrine (or quiz, etc.)
       │                 → HTML UI shows interaction interface
       │
       ├── GRAB on credit → POST /api/game/collect-credits
       │                    → Credit disappears, total updates
       │
       └── ENTER on door → POST /api/game/advance-room
                          → New room data returned
                          → Phaser reloads scene with new room
```

---

## Asset Specification

### Summary

| Category | Count | Source |
|----------|-------|--------|
| Floor backgrounds | 7 | AI-generated (3090 GPU) |
| Room objects | 5 | AI-generated |
| NPC sprites | 2 | Source externally (need animation potential) |
| Player spritesheet | 1 | Source externally (animated) |
| **Total** | **15** | |

### Background Assets (AI-Generated)

Generate at 400×760 pixels, PNG format.

| Asset | Filename | Prompt Guidelines |
|-------|----------|-------------------|
| Floor 1 - Nerima | `exploration/bg_floor1.png` | Residential Tokyo suburb, night, neon signs, apartment buildings, HD2D cyberpunk |
| Floor 2 - Toshima | `exploration/bg_floor2.png` | Urban commercial district, busier streets, more neon, vending machines |
| Floor 3 - Shinjuku | `exploration/bg_floor3.png` | Dense city center, towering buildings, holographic ads, rain-slicked streets |
| Floor 4 - Shibuya | `exploration/bg_floor4.png` | Iconic crossing vibes, massive screens, crowds silhouetted, vibrant |
| Floor 5 - Chiyoda | `exploration/bg_floor5.png` | Government district, imposing architecture, darker mood, surveillance drones |
| Floor 6 - Minato | `exploration/bg_floor6.png` | Corporate towers, sleek glass, cold blue lighting, oppressive |
| Floor 7 - Imperial | `exploration/bg_floor7.png` | Palace grounds corrupted by tech, traditional meets cyber, final area |

**Base generation prompt:**
```
HD2D style game background, portrait orientation, cyberpunk Tokyo [district],
night scene, pixel-art inspired but high detail, atmospheric lighting,
neon accents, suitable for 2D game exploration, no characters,
room for player movement in lower half, door areas visible at top
```

### Room Object Assets (AI-Generated)

Transparent PNG, dimensions as specified.

| Asset | Filename | Dimensions | Description |
|-------|----------|------------|-------------|
| Shrine altar | `exploration/obj_shrine.png` | 120×100 | Glowing tech-shrine with cyberpunk fox statue |
| Quiz podium | `exploration/obj_podium.png` | 100×120 | Holographic game-show podium, retro-futuristic |
| Word terminal | `exploration/obj_terminal.png` | 80×100 | Floating data scroll or cracked terminal screen |
| Door | `exploration/door.png` | 60×80 | Sliding cyber-door with glowing edges |
| Credit | `exploration/credit.png` | 24×24 | Small glowing crystal/coin |

### Sprite Assets (Source Externally)

These need animation frames - source from asset packs or commission.

| Asset | Filename | Dimensions | Description |
|-------|----------|------------|-------------|
| Player | `exploration/player.png` | 128×128 spritesheet | 32×32 sprites, 4 directions × 4 walk frames |
| Shrine Fox | `exploration/npc_fox.png` | 48×48 | Cyber-kitsune spirit |
| Quiz Master | `exploration/npc_quizmaster.png` | 48×64 | Holographic game show host |

---

## File Structure

### New Files

```
public/
  js/
    phaser/
      exploration-scene.js    # Main Phaser scene
      exploration-controls.js # Touch input, movement
      exploration-ui.js       # Context button
      phaser-bridge.js        # Phaser ↔ HTML communication

  assets/
    exploration/
      bg_floor1.png          # Backgrounds (7)
      bg_floor2.png
      bg_floor3.png
      bg_floor4.png
      bg_floor5.png
      bg_floor6.png
      bg_floor7.png
      obj_shrine.png         # Objects (5)
      obj_podium.png
      obj_terminal.png
      door.png
      credit.png
      npc_fox.png            # NPCs (2)
      npc_quizmaster.png
      player.png             # Player spritesheet

src/
  game/
    exploration-service.js   # Backend service for exploration
```

### Modified Files

| File | Changes |
|------|---------|
| `public/game.html` | Add Phaser script tag, canvas container div |
| `public/js/game.js` | Toggle Phaser/HTML visibility based on phase |
| `public/js/ui/exploration.js` | Integrate with Phaser bridge for transitions |
| `server.js` | Add `/api/game/collect-credits` endpoint |
| `src/game/loop.js` | Handle credit collection in game state |

### Phaser Loading

```html
<script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>
```

---

## Future Enhancements

Noted for later iterations:

| Enhancement | Description |
|-------------|-------------|
| **Camera scrolling** | Rooms larger than screen, camera follows player |
| **Parallax layers** | Background/midground/foreground at different scroll speeds |
| **Idle animations** | NPCs/enemies have subtle breathing/movement |
| **Variable doors** | 1-3 doors based on branching logic |
| **Enemy patrol** | Enemies move on paths, can ambush player |

---

## Implementation Notes

### Phase 1 Scope (Rapid Prototype)

- Single-screen rooms (no scrolling)
- Single background layer (no parallax)
- Static NPC/enemy sprites
- 2 fixed doors per room
- Basic lighting effects
- Context button interactions

### Integration Checkpoints

1. Phaser loads and displays test scene
2. Player movement works with touch controls
3. Context buttons appear near objects
4. Phaser ↔ HTML transitions work (hide/show)
5. Room data loads from API
6. Door transitions load new rooms
7. Credits collect and persist

---

## Currency Note

In-game currency is called **credits** (not gold/essence in the UI).
