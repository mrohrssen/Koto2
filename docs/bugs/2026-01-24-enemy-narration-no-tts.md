# Bug: Enemy narration doesn't use TTS (text-to-speech)

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (feature regression — TTS was available in old version)

## Symptoms

- Enemy dialogue appears as text only
- No VOICEVOX TTS audio plays for enemy narration
- The TTS system exists (server logs show `[Prefetch] TTS synthesizer registered`)

## Context

The old game had TTS integration via VOICEVOX. The mobile-ui rewrite may have dropped the TTS playback calls when it rewrote the narration/dialogue display code.

## Likely Cause

- The mobile-ui frontend doesn't call the TTS API endpoint when displaying enemy dialogue
- Or the narration display module was rewritten without the audio playback hook
- The old `narration.js` was deleted during mobile-ui rewrite — its TTS logic may not have been ported

## Files to Investigate

- `public/js/ui/combat-loop.js` — where enemy dialogue is displayed (should trigger TTS)
- `public/js/ui/takeover.js` — if narration shows in a takeover view
- `public/js/api.js` — check if TTS API call function exists
- `src/routes/game/misc.js` or `server.js` — `/api/tts/` endpoint (backend is likely fine)
- Old `public/js/narration.js` on master — reference for how TTS was triggered
