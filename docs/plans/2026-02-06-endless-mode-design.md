# Endless Mode Design

## Overview

After defeating the AI Emperor (Floor 7), players can choose to keep going into an endless mode. Floors 8, 9, 10... continue indefinitely in a generic zone called "The Outskirts," reusing existing enemies and bosses with scaled stats. The run ends when the player dies.

## Core Flow

1. Player defeats AI Emperor (Floor 7 boss)
2. Victory screen offers two choices: **Return to Hub** or **Keep Going**
3. "Return to Hub" — existing behavior, run ends, essence awarded
4. "Keep Going" — run stays active, floor increments to 8, ward set to The Outskirts
5. Each endless floor generates rooms normally (7-10 encounters + boss)
6. Enemies drawn from all tiers, stats scaled to current floor
7. Boss at end of each floor is a random pick from `bosses.json`, scaled
8. On death: normal run-end flow — hub, essence, lifetime stats updated
9. No way to "win" — it goes until you die
10. No hub unlock or persistent gate — you earn endless mode by beating Floor 7 each run

## Enemy & Boss Scaling

**Regular enemies (floors 8+):**
- Selected randomly from full enemy pool (all enemies, ignoring ward/tier filters)
- Tier derived from floor: `Math.ceil(floor / 2)` (floor 8-9 = tier 5, 10-11 = tier 6, etc.)
- `hp = 45 + (tier * 30)`, `attack = 5 + (tier * 4)`
- Existing `1.1^runKills` HP compounding still applies
- Existing ±20% variance still applies

**Bosses:**
- Random pick from `bosses.json`
- `hp = 225 + (tier * 60)`, `attack = 20 + (tier * 5)`
- Same 3-phase AI, dialogue, and drops reused as-is

## The Outskirts

- Single new ward entry in `WARD_INFO`
- New background image (to be created)
- No branching ward selection — after each endless floor boss, next floor is always The Outskirts
- Thematically: the unmapped edges of Neo Tokyo beyond the Imperial Palace

## Implementation Scope

### Files to modify

1. **`src/game/services/combat-service.js`** — `handleGameVictory()` returns a result allowing the frontend to offer "Keep Going" instead of immediately ending the run.
2. **`src/game/rooms.js`** — Add The Outskirts to `WARD_INFO`. `getNextWardOptions()` returns The Outskirts for floors 8+.
3. **`src/game/enemies.js`** — For endless floors, bypass ward/tier filtering, pull from full enemy pool, scale to current floor tier.
4. **`src/game/loop.js`** — Handle "keep going" action: increment floor, set ward to Outskirts, generate rooms, continue run.
5. **`server.js`** — Endpoint to accept the player's post-victory choice.
6. **Frontend (`public/js/`)** — Victory screen shows "Return to Hub / Keep Going" choice. "Keep Going" triggers next floor.
7. **`public/assets/`** — New background image for The Outskirts.
8. **`src/game/state.js`** — Ensure `highestFloor` in lifetime stats updates beyond 7.

### What stays the same

- Essence rewards, meta-progression, achievements
- Room generation logic (already parameterized by floor)
- Combat system
- Hub and ward selection UI for floors 1-7
