# Level System Design

## Goal

Replace the single repeatable run with a series of unlockable levels. Each level is a self-contained 7-floor run (~15-20 minutes). Beating a level unlocks the next. Players can replay any beaten level. V1 ships 10 levels; the system scales to hundreds.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Carryover between levels | Full reset | Each level is self-contained; meta-progression (essence/upgrades) still applies |
| Unlock structure | Linear with replay | Clear progression + vocab practice on old levels |
| Ward structure per level | Keep 7 floors as-is | Proven, no need to change |
| Level-specific vocab | Deferred | Ship the framework first, layer themed content later |
| Essence/meta-progression | Unchanged | Essence earned per level as before; upgrades work identically |
| Level select UI | List replacing "Start Run" | Scales to hundreds with scrolling; visual map can come later |

## Data Model

### Level Definitions (`data/levels.json`)

```json
[
  { "id": 1, "name": "Awakening", "nameJa": "覚醒" },
  { "id": 2, "name": "Signal", "nameJa": "信号" },
  { "id": 3, "name": "Underground", "nameJa": "地下" },
  { "id": 4, "name": "Frequency", "nameJa": "周波数" },
  { "id": 5, "name": "Disruption", "nameJa": "混乱" },
  { "id": 6, "name": "Convergence", "nameJa": "収束" },
  { "id": 7, "name": "Infiltration", "nameJa": "潜入" },
  { "id": 8, "name": "Resonance", "nameJa": "共鳴" },
  { "id": 9, "name": "Override", "nameJa": "上書き" },
  { "id": 10, "name": "Liberation", "nameJa": "解放" }
]
```

Each level is an ID plus display names. No mechanical differences yet. Future fields (vocab lists, story beats, custom ward maps) can be added per-level without restructuring.

### Player Save State (added to existing save)

```javascript
levels: {
  highestUnlocked: 1,   // furthest playable level (1-indexed, starts at 1)
  completed: [],         // array of beaten level IDs
  current: null          // levelId of in-progress run, or null
}
```

### Run State (added to existing run)

```javascript
run.levelId = 3  // which level this run belongs to
```

## Game Flow

### Current Flow
Hub → "Start Run" → Ward Select → Floor 1 → ... → Floor 7 Boss → Victory → Hub

### New Flow
Hub → **Level Select** → Pick level → Ward Select → Floor 1 → ... → Floor 7 Boss → Victory → Hub

### Phase Machine Change

Add `LEVEL_SELECT` phase between `HUB` and `RUN_ACTIVE`:

```
HUB → LEVEL_SELECT → RUN_ACTIVE → ... → RUN_COMPLETE → HUB
```

### Starting a Run

`GameManager.startRun()` receives a `levelId` parameter. The run state stores it:

```javascript
run.levelId = levelId
player.levels.current = levelId
```

Everything else stays identical: credits reset (55 + meta bonuses), no chips, ward select offered.

### Completing a Run (Victory)

When the player beats Floor 7 and returns to hub:

1. Add `levelId` to `levels.completed` (if not already present)
2. If `levelId >= levels.highestUnlocked`, set `highestUnlocked = levelId + 1`
3. Set `levels.current = null`
4. Essence rewards unchanged

### Dying Mid-Run

Same as today. No level progress. Player returns to hub, can retry the level.

### Replaying a Beaten Level

Player picks a completed level from level select. Normal run. Earns essence. No unlock effect (level already beaten).

### Endless Mode

Unchanged. If a player chooses "Keep Going" after Floor 7, endless mode works as before. Completing endless does not unlock the next level — only "Return to Hub" after victory does.

## Level Select UI

### Layout

- Title: "Select Level" / レベル選択
- Vertical scrollable list of level cards
- Each card: level number, name (Japanese + English), status indicator

### Card States

| State | Visual | Interaction |
|-------|--------|-------------|
| Completed | Checkmark, full opacity | Clickable (replay) |
| Unlocked (next) | Highlighted border, "NEW" badge | Clickable (start) |
| Locked | Greyed out, lock icon | Not clickable |

### Styling

Cyberpunk theme consistent with existing UI: dark backgrounds, neon accents, glitch effect on "NEW" badge.

## API Endpoints

### `GET /api/game/levels`

Returns level definitions and player's level progress.

```json
{
  "levels": [
    { "id": 1, "name": "Awakening", "nameJa": "覚醒" },
    ...
  ],
  "progress": {
    "highestUnlocked": 2,
    "completed": [1],
    "current": null
  }
}
```

### `POST /api/game/levels/select`

Starts a run for the given level.

```json
{ "levelId": 2 }
```

Returns the same response as current `startRun`, with `levelId` included in run state.

Validates: level must be unlocked (`levelId <= highestUnlocked`), no run already active.

## Files to Modify

| File | Change |
|------|--------|
| `src/game/state.js` | Add `levels` to player save factory; update victory logic for level unlock |
| `src/game/loop.js` | Accept `levelId` in `startRun()`; handle `LEVEL_SELECT` phase |
| `src/game/phase-machine.js` | Add `LEVEL_SELECT` phase and transitions |
| `server.js` / routes | Add `GET /api/game/levels` and `POST /api/game/levels/select` |
| `public/js/ui/exploration.js` | Add `renderLevelSelect()` |
| `public/game.js` | Wire level select phase to UI |
| `public/game.css` | Level select card styles |

## New Files

| File | Purpose |
|------|---------|
| `data/levels.json` | Level definitions (id, name, nameJa) |

## Not Changed

Combat, chips, enemies, wards, rooms, meta-progression, endless mode, JPDB integration, TTS, quiz rooms, shrines, word discovery, dealer rooms — all untouched.

## Future Extensions (Out of Scope for V1)

- Per-level vocab/grammar themes
- Level-specific story narration and dialogue
- Custom ward maps per level
- Difficulty scaling per level
- Visual level map (replace list with world/map view)
- Level-specific enemies and bosses
- Star ratings or score tracking per level
