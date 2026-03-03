# TTS Pre-Cache Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

Every TTS request hits VOICEVOX in real-time (two HTTP calls per word: `audio_query` → `synthesis`). For ~250 static game words that every player encounters, this adds unnecessary latency.

## Solution

Pre-generate WAV audio for all static game vocabulary using VOICEVOX speaker ID 11 (Kurono Takehiro ノーマル) at 0.9x speed. Store on disk at `data/tts-cache/`. Server checks cache before calling VOICEVOX — cache hit serves the file instantly, cache miss falls through to live synthesis.

## Architecture

```
Pre-generation (one-time):
  scripts/generate-tts-cache.mjs
    → reads moves.json, creatures.json, items.json
    → calls VOICEVOX for each word (speaker 11, speed 0.9)
    → writes WAV files to data/tts-cache/
    → writes data/tts-cache/manifest.json

Runtime serving:
  POST /api/tts/synthesize { text, speakerId, speed }
    → ttsCacheService.lookup(text, speakerId, speed)
    → HIT:  return cached WAV from disk (instant)
    → MISS: synthesize live via VOICEVOX (existing behavior)
```

## Cache Lookup Logic

Manifest maps `text → filename`. Cache hit requires exact match on: text, speakerId (11), speedScale (0.9). Requests for different speakers (NPC dialogue) or custom speeds skip the cache entirely.

## Words Cached (~250 deduplicated)

- 150 move names (走る, 隠れる, 倒す...)
- 37 creature base words (亀, 馬, 蛇...)
- 37 creature modifiers (古代, 荒い...)
- 27 item names (カレーパン, 緑茶...)
- ~50 item component words (カレー, パン, 茶...)

## Files

| File | Change |
|------|--------|
| `scripts/generate-tts-cache.mjs` | **New** — pre-generation script |
| `src/services/tts-cache.js` | **New** — cache lookup service |
| `src/routes/tts.js` | **Modify** — add cache check before VOICEVOX |
| `data/tts-cache/` | **New dir** — WAV files + manifest.json |

## What Doesn't Change

- Frontend code (zero changes)
- NPC dialogue / narration (still live synthesis)
- User speed/volume settings (respected for non-cached audio)
- Existing in-memory prefetch system (still works for narration)

## Estimated Size

~250 words × ~20KB WAV = ~5MB total
