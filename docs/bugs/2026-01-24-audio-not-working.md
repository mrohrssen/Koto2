# Bug: Audio system not functioning — no settings, no music, no SFX

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** High (entire audio feature non-functional)

## Symptoms

1. No audio settings (volume sliders, mute checkbox) visible in the settings modal
2. No background music playing during runs
3. No sound effects on attacks, swipes, chip equips, etc.

## Context

The audio branch (`feature/mobile-ui-audio`) was merged and its files exist:
- `public/js/audio.js` exists and passes syntax check
- All 13 SFX files + BGM file exist and serve HTTP 200
- `public/game.js` has the `import * as audio` line
- UI modules have SFX trigger calls

## Likely Causes

1. **Audio module not initializing** — Web Audio API requires user interaction to start AudioContext. The initialization hook may not be wired up correctly in the merged version.
2. **Settings UI not rendering audio controls** — The audio branch modified `public/js/ui/modals.js` and `public/js/settings.js` to add volume sliders, but these may not be rendering.
3. **Import/module loading failure** — If `audio.js` fails to load (e.g., missing dependency), all audio calls become no-ops silently.

## Debugging Steps

1. Open browser DevTools console — check for import errors or audio-related warnings
2. Check if `window.audio` or the audio module is accessible
3. Check if settings modal HTML includes audio controls (volume range inputs)
4. Check if AudioContext is being created on first user tap

## Files to Investigate

- `public/js/audio.js` — audio module initialization, AudioContext setup
- `public/js/settings.js` — audio settings persistence and UI wiring
- `public/js/ui/modals.js` — settings modal content (should include volume sliders)
- `public/game.js` — audio import and `playBGM('main')` call on run start
- `public/game.css` — `.settings-range` styles for volume sliders
