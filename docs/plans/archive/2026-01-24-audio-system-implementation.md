# Audio System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add BGM and SFX to NEO TOKYO: System Liberation with Web Audio API for effects and HTMLAudioElement for background music, integrated into the mobile-first UI.

**Architecture:** A single `audio.js` module manages both BGM (HTMLAudioElement, looped, crossfade-ready) and SFX (Web Audio API, low-latency, overlap). Settings persist via localStorage following the existing `settings.js` pattern. SFX calls are injected at trigger points across combat, actions, takeover, and chip modules.

**Tech Stack:** Web Audio API, HTMLAudioElement, ES6 modules, localStorage

**Worktree:** `/Users/michia/Documents/jrpg-wt-mobile-ui` (branch `feature/mobile-first-ui`)

---

## Task 1: Create Audio Module with SFX Support

**Files:**
- Create: `public/js/audio.js`

**Step 1: Create the audio module with Web Audio API SFX engine**

```javascript
/**
 * Audio Module - BGM & SFX Manager
 *
 * SFX: Web Audio API (low latency, overlap support)
 * BGM: HTMLAudioElement (streaming, looping)
 */

const SFX_PATH = '/assets/audio/sfx/';
const BGM_PATH = '/assets/audio/bgm/';

const SFX_FILES = [
  'attack', 'player-hit', 'enemy-defeat', 'heal',
  'swipe-right', 'swipe-left', 'chip-equip', 'chip-skill',
  'button-tap', 'takeover-open', 'takeover-close',
  'victory', 'defeat'
];

let audioCtx = null;
const sfxBuffers = {};
let sfxVolume = 0.8;
let bgmVolume = 0.7;
let muted = false;

// BGM state
let bgmElement = null;
let bgmPlaying = false;

// ============ INITIALIZATION ============

/**
 * Initialize audio context and preload SFX buffers.
 * Must be called after first user interaction (autoplay policy).
 */
export async function initAudio() {
  if (audioCtx) return; // already initialized
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Load saved preferences
  const savedSfxVol = localStorage.getItem('jrpg_sfxVolume');
  const savedBgmVol = localStorage.getItem('jrpg_bgmVolume');
  const savedMuted = localStorage.getItem('jrpg_audioMuted');
  if (savedSfxVol !== null) sfxVolume = parseFloat(savedSfxVol);
  if (savedBgmVol !== null) bgmVolume = parseFloat(savedBgmVol);
  if (savedMuted === 'true') muted = true;

  // Preload all SFX
  await Promise.allSettled(SFX_FILES.map(loadSfx));

  // Set up BGM element
  bgmElement = new Audio();
  bgmElement.loop = true;
  bgmElement.volume = muted ? 0 : bgmVolume;
}

async function loadSfx(name) {
  try {
    const response = await fetch(`${SFX_PATH}${name}.mp3`);
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    sfxBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn(`Failed to load SFX: ${name}`, e);
  }
}

// ============ SFX ============

/**
 * Play a sound effect (fire-and-forget, supports overlap).
 * @param {string} name - SFX name (without extension)
 */
export function playSFX(name) {
  if (muted || !audioCtx || !sfxBuffers[name]) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = sfxBuffers[name];

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = sfxVolume;

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

// ============ BGM ============

/**
 * Start/resume background music.
 * @param {string} [track='main'] - Track name (without extension)
 */
export function playBGM(track = 'main') {
  if (!bgmElement) return;
  const src = `${BGM_PATH}${track}.mp3`;
  if (bgmElement.src !== new URL(src, location.href).href) {
    bgmElement.src = src;
  }
  bgmElement.volume = muted ? 0 : bgmVolume;
  bgmElement.play().catch(() => {}); // ignore autoplay rejection
  bgmPlaying = true;
}

/** Stop BGM with a short fade out */
export function stopBGM() {
  if (!bgmElement || !bgmPlaying) return;
  const fadeInterval = setInterval(() => {
    if (bgmElement.volume > 0.05) {
      bgmElement.volume = Math.max(0, bgmElement.volume - 0.05);
    } else {
      clearInterval(fadeInterval);
      bgmElement.pause();
      bgmElement.currentTime = 0;
      bgmPlaying = false;
    }
  }, 50);
}

// ============ VOLUME & MUTE ============

/**
 * Set volume for BGM or SFX.
 * @param {'bgm'|'sfx'} type
 * @param {number} val - 0 to 1
 */
export function setVolume(type, val) {
  const clamped = Math.max(0, Math.min(1, val));
  if (type === 'sfx') {
    sfxVolume = clamped;
    localStorage.setItem('jrpg_sfxVolume', String(clamped));
  } else if (type === 'bgm') {
    bgmVolume = clamped;
    localStorage.setItem('jrpg_bgmVolume', String(clamped));
    if (bgmElement && !muted) bgmElement.volume = clamped;
  }
}

/**
 * Get current volume.
 * @param {'bgm'|'sfx'} type
 * @returns {number} 0 to 1
 */
export function getVolume(type) {
  return type === 'sfx' ? sfxVolume : bgmVolume;
}

/** Mute all audio */
export function mute() {
  muted = true;
  localStorage.setItem('jrpg_audioMuted', 'true');
  if (bgmElement) bgmElement.volume = 0;
}

/** Unmute all audio */
export function unmute() {
  muted = false;
  localStorage.removeItem('jrpg_audioMuted');
  if (bgmElement) bgmElement.volume = bgmVolume;
}

/** Check mute state */
export function isMuted() {
  return muted;
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/audio.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/audio.js
git commit -m "feat(audio): add audio module with Web Audio SFX and BGM support"
```

---

## Task 2: Create Audio Asset Directory Structure

**Files:**
- Create: `public/assets/audio/sfx/.gitkeep`
- Create: `public/assets/audio/bgm/.gitkeep`
- Create: `public/assets/audio/LICENSES.md`

**Step 1: Create directory structure and license tracking file**

```bash
mkdir -p public/assets/audio/sfx public/assets/audio/bgm
touch public/assets/audio/sfx/.gitkeep
touch public/assets/audio/bgm/.gitkeep
```

Create `public/assets/audio/LICENSES.md`:
```markdown
# Audio Asset Licenses

## SFX

| File | Source | License | Attribution |
|------|--------|---------|-------------|
| (pending) | - | - | - |

## BGM

| File | Source | License | Attribution |
|------|--------|---------|-------------|
| main.mp3 | User-provided | - | - |
```

**Step 2: Commit**

```bash
git add public/assets/audio/
git commit -m "chore(audio): add audio asset directory structure"
```

---

## Task 3: Add Audio Settings Persistence

**Files:**
- Modify: `public/js/settings.js` (add audio settings functions)

**Step 1: Add audio settings storage keys and functions to settings.js**

Add to `STORAGE_KEYS` object (after line 24):
```javascript
  bgmVolume: 'jrpg_bgmVolume',
  sfxVolume: 'jrpg_sfxVolume',
  audioMuted: 'jrpg_audioMuted'
```

Add after the TTS section (after line 178):
```javascript

// ============ AUDIO SETTINGS ============

/**
 * Get BGM volume (0-1)
 * @returns {number}
 */
export function getBgmVolume() {
  const val = localStorage.getItem('jrpg_bgmVolume');
  return val !== null ? parseFloat(val) : 0.7;
}

/**
 * Set BGM volume
 * @param {number} vol - 0 to 1
 */
export function setBgmVolume(vol) {
  localStorage.setItem('jrpg_bgmVolume', String(Math.max(0, Math.min(1, vol))));
}

/**
 * Get SFX volume (0-1)
 * @returns {number}
 */
export function getSfxVolume() {
  const val = localStorage.getItem('jrpg_sfxVolume');
  return val !== null ? parseFloat(val) : 0.8;
}

/**
 * Set SFX volume
 * @param {number} vol - 0 to 1
 */
export function setSfxVolume(vol) {
  localStorage.setItem('jrpg_sfxVolume', String(Math.max(0, Math.min(1, vol))));
}

/**
 * Check if audio is muted
 * @returns {boolean}
 */
export function isAudioMuted() {
  return localStorage.getItem('jrpg_audioMuted') === 'true';
}

/**
 * Set audio mute state
 * @param {boolean} muted
 */
export function setAudioMuted(muted) {
  if (muted) {
    localStorage.setItem('jrpg_audioMuted', 'true');
  } else {
    localStorage.removeItem('jrpg_audioMuted');
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/settings.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/settings.js
git commit -m "feat(audio): add audio volume/mute settings persistence"
```

---

## Task 4: Add Audio Settings UI to Settings Takeover

**Files:**
- Modify: `public/js/ui/modals.js`

**Step 1: Import audio module and add controls to settings panel**

Add import at top of `modals.js` (after line 5):
```javascript
import * as audio from '../audio.js';
```

Replace the `content.innerHTML` block (lines 24-39) with:
```javascript
  content.innerHTML = `
    <h3 style="margin:16px">Settings</h3>
    <div style="padding:0 16px">
      <label class="settings-label">
        JPDB API Key
        <input type="password" id="settings-jpdb-key" class="settings-input"
          value="${apiKeys.jpdbApiKey || ''}" placeholder="Enter JPDB API key">
      </label>
      <label class="settings-label" style="margin-top:12px">
        <input type="checkbox" id="settings-tts-enabled"
          ${settingsModule.isTtsEnabled?.() ? 'checked' : ''}>
        Enable TTS
      </label>

      <h4 style="margin:20px 0 8px;color:var(--accent)">Audio</h4>
      <label class="settings-label">
        BGM Volume
        <input type="range" id="settings-bgm-volume" min="0" max="100"
          value="${Math.round(audio.getVolume('bgm') * 100)}" class="settings-range">
      </label>
      <label class="settings-label">
        SFX Volume
        <input type="range" id="settings-sfx-volume" min="0" max="100"
          value="${Math.round(audio.getVolume('sfx') * 100)}" class="settings-range">
      </label>
      <label class="settings-label">
        <input type="checkbox" id="settings-audio-muted"
          ${audio.isMuted() ? 'checked' : ''}>
        Mute All Audio
      </label>

      <button class="action-btn action-btn-primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;
```

Update the save handler (replace lines 42-53) to include audio settings:
```javascript
  document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    const jpdbKey = document.getElementById('settings-jpdb-key')?.value?.trim();
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;
    const bgmVol = parseInt(document.getElementById('settings-bgm-volume')?.value || '70') / 100;
    const sfxVol = parseInt(document.getElementById('settings-sfx-volume')?.value || '80') / 100;
    const audioMuted = document.getElementById('settings-audio-muted')?.checked;

    settingsModule.saveApiKey('jpdbApiKey', jpdbKey);
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }

    audio.setVolume('bgm', bgmVol);
    audio.setVolume('sfx', sfxVol);
    if (audioMuted) { audio.mute(); } else { audio.unmute(); }

    sceneModule.showToast('Settings saved', 2000);
    takeover.close('settings');
  });
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/modals.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/modals.js
git commit -m "feat(audio): add BGM/SFX volume controls to settings UI"
```

---

## Task 5: Initialize Audio in Game Entry Point

**Files:**
- Modify: `public/game.js`

**Step 1: Import audio module and initialize on first interaction**

Add import (after the existing imports, around line 16):
```javascript
import * as audio from './js/audio.js';
```

Add audio initialization inside the `DOMContentLoaded` event handler, after the existing module inits. Find where the first user interaction happens (character creation or game resume) and add:

```javascript
// Initialize audio on first user interaction (browser autoplay policy)
async function ensureAudio() {
  await audio.initAudio();
  document.removeEventListener('click', ensureAudio);
  document.removeEventListener('touchstart', ensureAudio);
}
document.addEventListener('click', ensureAudio, { once: true });
document.addEventListener('touchstart', ensureAudio, { once: true });
```

**Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(audio): initialize audio context on first user interaction"
```

---

## Task 6: Add SFX to Combat (Attack, Hit, Defeat, Heal, Victory)

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Import audio and add SFX calls to combat events**

Add import at top of `combat-loop.js`:
```javascript
import { playSFX } from '../audio.js';
```

Find `animateEnemyHurt` callback usage (where player attack lands) and add after the animation call:
```javascript
playSFX('attack');
```

Find `animatePlayerHurt` callback usage (where enemy hits player) and add after the animation call:
```javascript
playSFX('player-hit');
```

Find `animateEnemyDefeat` callback usage and add:
```javascript
playSFX('enemy-defeat');
```

Find heal effect application and add:
```javascript
playSFX('heal');
```

Find victory condition (combat won) and add:
```javascript
playSFX('victory');
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat(audio): add combat SFX (attack, hit, defeat, heal, victory)"
```

---

## Task 7: Add SFX to Card Swipes and Button Taps

**Files:**
- Modify: `public/js/ui/actions.js`

**Step 1: Import audio and add SFX to card interactions**

Add import at top of `actions.js`:
```javascript
import { playSFX } from '../audio.js';
```

Find the swipe right handler (where `onCardSwipe('right')` is called) and add before/after:
```javascript
playSFX('swipe-right');
```

Find the swipe left handler (where `onCardSwipe('left')` is called) and add:
```javascript
playSFX('swipe-left');
```

Find button click handlers (equip bots, context action) and add:
```javascript
playSFX('button-tap');
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/actions.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/actions.js
git commit -m "feat(audio): add SFX to card swipes and button taps"
```

---

## Task 8: Add SFX to Chip Equip and Chip Skill

**Files:**
- Modify: `public/js/ui/economy.js`
- Modify: `public/js/ui/chip-row.js`

**Step 1: Add chip-equip SFX to economy module**

Add import at top of `economy.js`:
```javascript
import { playSFX } from '../audio.js';
```

Find where chip is successfully purchased (after the API call succeeds, near the "Chip acquired!" toast) and add:
```javascript
playSFX('chip-equip');
```

**Step 2: Add chip-skill SFX to chip-row module**

Add import at top of `chip-row.js`:
```javascript
import { playSFX } from '../audio.js';
```

Find where "Use Skill" button triggers the callback (`onUseSkill(index)`) and add before the callback call:
```javascript
playSFX('chip-skill');
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/economy.js && node --check public/js/ui/chip-row.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/ui/economy.js public/js/ui/chip-row.js
git commit -m "feat(audio): add SFX to chip equip and chip skill activation"
```

---

## Task 9: Add SFX to Takeover Open/Close

**Files:**
- Modify: `public/js/ui/takeover.js`

**Step 1: Import audio and add SFX to open/close**

Add import at top of `takeover.js` (after the dom import):
```javascript
import { playSFX } from '../audio.js';
```

In the `open()` function, add after `view.classList.add('active')`:
```javascript
    playSFX('takeover-open');
```

In the `close()` function, add after `view.classList.remove('active')`:
```javascript
    playSFX('takeover-close');
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/takeover.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/takeover.js
git commit -m "feat(audio): add SFX to takeover open/close transitions"
```

---

## Task 10: Add SFX to Game Over (Defeat)

**Files:**
- Modify: `public/game.js`

**Step 1: Add defeat SFX to game over handler**

Find where the game over / defeat state is triggered (the function that opens the gameover takeover or shows the game over modal) and add:
```javascript
audio.playSFX('defeat');
```

This should be near the `showGameOverModal` equivalent in game.js, where `phase === 'game_over'` is detected or where the gameover view is opened.

**Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(audio): add defeat SFX to game over"
```

---

## Task 11: Add BGM Playback on Game Start

**Files:**
- Modify: `public/game.js`

**Step 1: Start BGM after audio is initialized and a run begins**

Find where a run starts (after `apiStartRun` succeeds or when game resumes an existing run) and add:
```javascript
audio.playBGM('main');
```

Find where a run ends (victory screen closed, or game over acknowledged) and add:
```javascript
audio.stopBGM();
```

**Step 2: Handle tab visibility for BGM pause/resume**

Add in the `DOMContentLoaded` handler:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (bgmElement) bgmElement.pause();
  } else if (bgmPlaying && !muted) {
    bgmElement?.play().catch(() => {});
  }
});
```

Note: Since `bgmElement` and `bgmPlaying` are internal to audio.js, instead expose and use:

In `audio.js`, add these exports:
```javascript
/** Pause BGM (for tab hidden) */
export function pauseBGM() {
  if (bgmElement && bgmPlaying) bgmElement.pause();
}

/** Resume BGM (for tab visible) */
export function resumeBGM() {
  if (bgmElement && bgmPlaying && !muted) bgmElement.play().catch(() => {});
}
```

Then in `game.js`:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.pauseBGM();
  } else {
    audio.resumeBGM();
  }
});
```

**Step 3: Verify syntax**

Run: `node --check public/js/audio.js && node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/audio.js public/game.js
git commit -m "feat(audio): add BGM playback with tab visibility handling"
```

---

## Task 12: Add CSS for Range Slider in Settings

**Files:**
- Modify: `public/game.css`

**Step 1: Add styling for the audio volume range sliders**

Find the settings-related CSS section and add:
```css
.settings-range {
  width: 100%;
  margin-top: 4px;
  accent-color: var(--accent);
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "style(audio): add range slider styling for audio settings"
```

---

## Task 13: Download and Add SFX Assets

**Files:**
- Create: `public/assets/audio/sfx/attack.mp3`
- Create: `public/assets/audio/sfx/player-hit.mp3`
- Create: `public/assets/audio/sfx/enemy-defeat.mp3`
- Create: `public/assets/audio/sfx/heal.mp3`
- Create: `public/assets/audio/sfx/swipe-right.mp3`
- Create: `public/assets/audio/sfx/swipe-left.mp3`
- Create: `public/assets/audio/sfx/chip-equip.mp3`
- Create: `public/assets/audio/sfx/chip-skill.mp3`
- Create: `public/assets/audio/sfx/button-tap.mp3`
- Create: `public/assets/audio/sfx/takeover-open.mp3`
- Create: `public/assets/audio/sfx/takeover-close.mp3`
- Create: `public/assets/audio/sfx/victory.mp3`
- Create: `public/assets/audio/sfx/defeat.mp3`
- Update: `public/assets/audio/LICENSES.md`

**Step 1: Source and download CC0/CC-BY SFX files**

Sources to try:
- **Kenney.nl**: UI Audio pack (button-tap, takeover-open/close, swipe sounds), Impact Sounds (attack, player-hit)
- **Freesound.org**: Search for "rpg heal", "equip sound", "victory fanfare jrpg"
- **OpenGameArt.org**: "RPG sound effects pack"

**Requirements per file:**
- Format: MP3, mono, 44.1kHz
- Size: <100KB each
- Normalize volume levels across all files
- Style: Polished JRPG (bright, clean, satisfying — not retro, not dark)

**Step 2: Convert if needed (ffmpeg)**

```bash
# Example conversion to mono mp3, normalized
ffmpeg -i input.wav -ac 1 -ar 44100 -b:a 128k -filter:a loudnorm public/assets/audio/sfx/attack.mp3
```

**Step 3: Update LICENSES.md with actual attribution**

Fill in the table with source URL, license type, and required attribution for each file.

**Step 4: Commit**

```bash
git add public/assets/audio/
git commit -m "feat(audio): add SFX audio assets (13 effects)"
```

---

## Task 14: Run E2E Tests

**Step 1: Run full e2e test suite to verify nothing broke**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
./scripts/e2e-test.sh
```

Expected: 80+/87 tests passing (known flakiness threshold).

**Step 2: Fix any failures caused by audio changes**

Common issues:
- Module import errors if paths are wrong
- Settings UI tests may need updated selectors if the HTML changed
- Combat tests shouldn't be affected since SFX calls are fire-and-forget

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(audio): resolve test failures from audio integration"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Audio module (SFX + BGM engine) | `audio.js` |
| 2 | Asset directory structure | `public/assets/audio/` |
| 3 | Settings persistence | `settings.js` |
| 4 | Settings UI (volume sliders) | `modals.js` |
| 5 | Audio init on first interaction | `game.js` |
| 6 | Combat SFX | `combat-loop.js` |
| 7 | Card & button SFX | `actions.js` |
| 8 | Chip SFX | `economy.js`, `chip-row.js` |
| 9 | Takeover SFX | `takeover.js` |
| 10 | Defeat SFX | `game.js` |
| 11 | BGM playback + tab visibility | `audio.js`, `game.js` |
| 12 | Range slider CSS | `game.css` |
| 13 | Download SFX assets | `public/assets/audio/sfx/` |
| 14 | E2E tests | - |
