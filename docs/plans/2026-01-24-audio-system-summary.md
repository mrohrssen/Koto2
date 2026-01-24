# Audio System Implementation Summary

**Branch:** `feature/mobile-ui-audio` (worktree: `jrpg-wt-mobile-ui-audio`)
**Base:** `feature/mobile-first-ui`
**Date:** 2026-01-24

---

## What Was Implemented

A complete audio system with 13 SFX triggers and BGM support, integrated across the mobile-first UI.

### Architecture

- **SFX Engine:** Web Audio API — low-latency, supports overlapping sounds
- **BGM Engine:** HTMLAudioElement — streaming, looping, crossfade-ready
- **Settings:** localStorage persistence (`jrpg_bgmVolume`, `jrpg_sfxVolume`, `jrpg_audioMuted`)
- **Init Strategy:** Audio context created on first user click/touch (browser autoplay policy)

### Files Created

| File | Purpose |
|------|---------|
| `public/js/audio.js` | Core audio module (exports: initAudio, playSFX, playBGM, stopBGM, pauseBGM, resumeBGM, setVolume, getVolume, mute, unmute, isMuted) |
| `public/assets/audio/sfx/*.mp3` | 13 SFX files (CC0, Kenney.nl) |
| `public/assets/audio/bgm/.gitkeep` | BGM directory placeholder |
| `public/assets/audio/LICENSES.md` | Full attribution table |

### Files Modified

| File | Changes |
|------|---------|
| `public/js/settings.js` | Added `bgmVolume`, `sfxVolume`, `audioMuted` storage keys + getter/setter functions |
| `public/js/ui/modals.js` | Added audio import, BGM/SFX volume sliders, mute checkbox to settings panel |
| `public/game.js` | Audio import, ensureAudio on first interaction, BGM start/stop, defeat SFX, tab visibility pause/resume |
| `public/js/ui/combat-loop.js` | `playSFX` calls for attack, player-hit, enemy-defeat, victory |
| `public/js/ui/actions.js` | `playSFX` calls for swipe-right, swipe-left, button-tap |
| `public/js/ui/economy.js` | `playSFX('chip-equip')` on chip purchase |
| `public/js/ui/chip-row.js` | `playSFX('chip-skill')` on Use Skill |
| `public/js/ui/takeover.js` | `playSFX` calls for takeover-open, takeover-close |
| `public/game.css` | `.settings-range` styling for volume sliders |

---

## SFX Trigger Points (for E2E Testing)

Each SFX is fire-and-forget (`playSFX(name)` returns immediately, no-ops if audio not initialized or file not loaded).

| SFX File | Trigger Location | When It Fires |
|----------|-----------------|---------------|
| `attack.mp3` | `combat-loop.js` → `executePlayerAttack()` | Player attack lands (not miss/dodge) |
| `player-hit.mp3` | `combat-loop.js` → `executeEnemyAttack()` + `executeEnemyAttackThenPause()` | Enemy attack lands on player |
| `enemy-defeat.mp3` | `combat-loop.js` → `stopCombatLoop()` | Victory — enemy defeated |
| `victory.mp3` | `combat-loop.js` → `stopCombatLoop()` | Victory modal shown |
| `defeat.mp3` | `game.js` → `showGameOverModal()` | Game over triggered |
| `heal.mp3` | **TODO: wire up** — the heal action exists in master's combat loop but was not present in the `feature/mobile-first-ui` branch this was based on. Wire `playSFX('heal')` where HP is restored (chip heal effect, heal item, or defrag-style regen). Look for heal/regen logic in `combat-loop.js` or chip pipeline results. | Player or chip heals HP |
| `swipe-right.mp3` | `actions.js` → `handleTouchEnd()` / `handleMouseUp()` | Card swiped right past threshold |
| `swipe-left.mp3` | `actions.js` → `handleTouchEnd()` / `handleMouseUp()` | Card swiped left past threshold |
| `button-tap.mp3` | `actions.js` → equip-bots-btn click, context-action-btn click | Any action button pressed |
| `chip-equip.mp3` | `economy.js` → chip shop selection | Chip acquired from shop |
| `chip-skill.mp3` | `chip-row.js` → Use Skill button click | Chip skill activated |
| `takeover-open.mp3` | `takeover.js` → `open()` | Any takeover panel slides in |
| `takeover-close.mp3` | `takeover.js` → `close()` | Any takeover panel slides out |

### BGM Triggers

| Action | Location | Behavior |
|--------|----------|----------|
| Start BGM | `game.js` → `startNewRun()` | Plays `main.mp3` on loop |
| Stop BGM (victory) | `game.js` → `showVictoryModal()` | Fade-out stop |
| Stop BGM (defeat) | `game.js` → `showGameOverModal()` | Fade-out stop |
| Pause BGM | `game.js` → `visibilitychange` (tab hidden) | Pauses playback |
| Resume BGM | `game.js` → `visibilitychange` (tab visible) | Resumes if was playing |

---

## E2E Testing Considerations

Since Web Audio API and HTMLAudioElement don't produce audible output in headless Playwright, tests should verify:

1. **Module loading:** `audio.js` imports don't break page load
2. **No errors in console:** SFX calls with missing AudioContext should silently no-op
3. **Settings UI:** Volume sliders and mute checkbox render correctly, save button persists values to localStorage
4. **No regressions:** All existing combat, card swipe, takeover, and chip tests still pass (SFX calls are non-blocking)

### Suggested test assertions:

```javascript
// Verify audio module doesn't break page load
await page.goto('/');
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
// ... run game actions ...
expect(errors.filter(e => e.includes('audio'))).toHaveLength(0);

// Verify settings UI has audio controls
await page.click('#settings-btn');
await expect(page.locator('#settings-bgm-volume')).toBeVisible();
await expect(page.locator('#settings-sfx-volume')).toBeVisible();
await expect(page.locator('#settings-audio-muted')).toBeVisible();

// Verify settings persist
await page.fill('#settings-bgm-volume', '50');
await page.click('#settings-save-btn');
const bgmVol = await page.evaluate(() => localStorage.getItem('jrpg_bgmVolume'));
expect(parseFloat(bgmVol)).toBeCloseTo(0.5, 1);
```

---

## SFX Asset Details

All from [Kenney.nl](https://kenney.nl), CC0 (public domain). Converted to mono MP3, 44.1kHz, 128kbps.

| File | Size | Source Pack | Original |
|------|------|------------|----------|
| attack.mp3 | 11KB | Impact Sounds | impactPunch_heavy_000.ogg |
| player-hit.mp3 | 4KB | Impact Sounds | impactGeneric_light_002.ogg |
| enemy-defeat.mp3 | 5KB | Impact Sounds | impactGlass_heavy_000.ogg |
| heal.mp3 | 10KB | Interface Sounds | confirmation_002.ogg |
| swipe-right.mp3 | 17KB | Interface Sounds | scroll_002.ogg |
| swipe-left.mp3 | 17KB | Interface Sounds | scroll_004.ogg |
| chip-equip.mp3 | 8KB | RPG Audio | metalClick.ogg |
| chip-skill.mp3 | 3KB | Interface Sounds | pluck_001.ogg |
| button-tap.mp3 | 1KB | Interface Sounds | click_003.ogg |
| takeover-open.mp3 | 6KB | Interface Sounds | open_002.ogg |
| takeover-close.mp3 | 6KB | Interface Sounds | close_002.ogg |
| victory.mp3 | 9KB | Interface Sounds | confirmation_004.ogg |
| defeat.mp3 | 3KB | Interface Sounds | error_004.ogg |

**Total SFX size:** ~100KB
