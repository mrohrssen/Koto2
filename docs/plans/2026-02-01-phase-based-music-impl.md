# Phase-Based Music System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 8 BGM tracks tied to game phases, all initially pointing to `main.mp3` for gradual replacement.

**Architecture:** Add phase-to-track mapping in `audio.js`, call `updateBGMForPhase()` from `updateUI()` in `game.js`. Track changes only trigger `playBGM()` when the track actually differs.

**Tech Stack:** Vanilla JS, HTMLAudioElement for BGM

---

## Task 1: Add Phase Track Config and Resolver to audio.js

**Files:**
- Modify: `public/js/audio.js:26-27` (after bgmPlaying declaration)

**Step 1: Add PHASE_TRACKS config and currentTrack state**

Add after line 26 (`let bgmPlaying = false;`):

```javascript
// Phase-based BGM tracking
let currentTrack = null;

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

**Step 2: Verify syntax**

Run: `node --check public/js/audio.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/audio.js
git commit -m "feat(audio): add phase track config"
```

---

## Task 2: Add getTrackForPhase Function

**Files:**
- Modify: `public/js/audio.js` (after PHASE_TRACKS, before SFX section)

**Step 1: Add the resolver function**

Add after PHASE_TRACKS block:

```javascript
/**
 * Get the BGM track name for a game phase.
 * @param {string} phase - Current game phase
 * @param {boolean} isBossRoom - Whether currently in boss room
 * @returns {string} Track filename (without extension)
 */
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

**Step 2: Verify syntax**

Run: `node --check public/js/audio.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/audio.js
git commit -m "feat(audio): add getTrackForPhase resolver"
```

---

## Task 3: Add updateBGMForPhase Function

**Files:**
- Modify: `public/js/audio.js` (after getTrackForPhase)

**Step 1: Add the phase-aware BGM updater**

Add after `getTrackForPhase`:

```javascript
/**
 * Update BGM based on game phase. Only changes track if different.
 * @param {string} phase - Current game phase
 * @param {boolean} isBossRoom - Whether currently in boss room
 */
export function updateBGMForPhase(phase, isBossRoom = false) {
  const track = getTrackForPhase(phase, isBossRoom);
  if (track !== currentTrack) {
    currentTrack = track;
    playBGM(track);
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/audio.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/audio.js
git commit -m "feat(audio): add updateBGMForPhase function"
```

---

## Task 4: Hook updateBGMForPhase into game.js updateUI

**Files:**
- Modify: `public/game.js:148-154` (updateUI function)

**Step 1: Add BGM update call at end of updateUI**

Change `updateUI()` from:

```javascript
function updateUI() {
  updateStatusBar();
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();
}
```

To:

```javascript
function updateUI() {
  updateStatusBar();
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();

  // Update BGM based on current phase
  const isBossRoom = gameState.run?.rooms?.[gameState.run?.currentRoom]?.isBossRoom;
  audio.updateBGMForPhase(gameState.phase, isBossRoom);
}
```

**Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(audio): hook phase-based BGM into updateUI"
```

---

## Task 5: Remove Manual playBGM Calls

**Files:**
- Modify: `public/game.js:334` (startNewRun)
- Modify: `public/game.js:800-802` (ensureAudio)

**Step 1: Remove playBGM from startNewRun**

In `startNewRun()`, remove this line (around line 334):

```javascript
    audio.playBGM('main');
```

**Step 2: Remove conditional playBGM from ensureAudio**

In `ensureAudio()`, remove these lines (around lines 800-802):

```javascript
    // Start BGM if there's an active run
    if (gameState.phase && gameState.phase !== 'hub') {
      audio.playBGM('main');
    }
```

**Step 3: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/game.js
git commit -m "refactor(audio): remove manual playBGM calls"
```

---

## Task 6: Manual Test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test phase transitions**

1. Load game in browser
2. Click to initialize audio
3. Verify BGM plays in hub
4. Start a run - BGM should continue (same track for now)
5. Enter combat - BGM should continue
6. Win/lose - BGM should continue
7. Check browser console for errors

**Step 3: Verify no errors**

Expected: No JavaScript errors in console, BGM plays throughout

---

## Task 7: Final Commit

**Step 1: Squash or verify commits**

Run: `git log --oneline -6`

Expected: 5 commits for the feature

**Step 2: Tag completion**

The phase-based music system is ready. To add new tracks:
1. Add `trackname.mp3` to `/public/assets/audio/bgm/`
2. Update the corresponding value in `PHASE_TRACKS` from `'main'` to `'trackname'`
