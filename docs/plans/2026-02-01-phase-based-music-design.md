# Phase-Based Music System

## Overview

Add 8 distinct BGM tracks tied to game phases. All tracks initially point to `main.mp3` so they can be replaced individually as new music is sourced.

## Track Mapping

| Track Key | File | Phases |
|-----------|------|--------|
| `hub` | `hub.mp3` | `hub` |
| `exploration` | `exploration.mp3` | `exploring`, `room`, `shrine`, `quiz`, `wordDiscovery`, `ward_selection` |
| `combat` | `combat.mp3` | `combat` (non-boss) |
| `boss` | `boss.mp3` | `combat` (when in boss room) |
| `victory` | `victory.mp3` | `victory`, `post_combat_shop` |
| `defeat` | `defeat.mp3` | `defeat`, `run_ended` |
| `floorComplete` | `floor-complete.mp3` | `floor_complete` |
| `runComplete` | `run-complete.mp3` | `run_complete` |

## Implementation

### 1. Add track config to `audio.js`

```javascript
const PHASE_TRACKS = {
  hub: 'main',
  exploration: 'main',
  combat: 'main',
  boss: 'main',
  victory: 'main',
  defeat: 'main',
  floorComplete: 'main',
  runComplete: 'main',
};
```

### 2. Add phase-to-track resolver

```javascript
export function getTrackForPhase(phase, isBossRoom = false) {
  if (phase === 'combat' && isBossRoom) return PHASE_TRACKS.boss;

  const mapping = {
    hub: 'hub',
    exploring: 'exploration',
    room: 'exploration',
    shrine: 'exploration',
    quiz: 'exploration',
    wordDiscovery: 'exploration',
    ward_selection: 'exploration',
    combat: 'combat',
    victory: 'victory',
    post_combat_shop: 'victory',
    defeat: 'defeat',
    run_ended: 'defeat',
    floor_complete: 'floorComplete',
    run_complete: 'runComplete',
  };

  return PHASE_TRACKS[mapping[phase]] || PHASE_TRACKS.hub;
}
```

### 3. Add smart BGM updater

```javascript
let currentTrack = null;

export function updateBGMForPhase(phase, isBossRoom = false) {
  const track = getTrackForPhase(phase, isBossRoom);
  if (track !== currentTrack) {
    currentTrack = track;
    playBGM(track);
  }
}
```

### 4. Hook into `game.js`

Call `audio.updateBGMForPhase()` at the end of `updateUI()`:

```javascript
function updateUI() {
  updateStatusBar();
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();

  // Update BGM based on phase
  const isBossRoom = gameState.run?.rooms?.[gameState.run?.currentRoom]?.isBossRoom;
  audio.updateBGMForPhase(gameState.phase, isBossRoom);
}
```

### 5. Remove manual `playBGM` calls

Remove existing `audio.playBGM('main')` calls in:
- `startNewRun()` (line 334)
- `ensureAudio()` (lines 800-802)

The phase-based system handles these automatically.

## File Changes

| File | Change |
|------|--------|
| `public/js/audio.js` | Add `PHASE_TRACKS`, `getTrackForPhase()`, `updateBGMForPhase()` |
| `public/game.js` | Call `updateBGMForPhase()` in `updateUI()`, remove manual `playBGM()` calls |

## Replacing Tracks

To add a new track:
1. Add `trackname.mp3` to `/assets/audio/bgm/`
2. Change the value in `PHASE_TRACKS` from `'main'` to `'trackname'`

Example: To add a combat track, place `combat.mp3` in the bgm folder and change:
```javascript
combat: 'main',  // before
combat: 'combat',  // after
```
