# Kanji Kombat TTS Audio Prefetch — Design

**Date:** 2026-07-03
**Status:** Approved
**Scope:** Client-only. No server changes.

## Problem

In Kanji Kombat, word audio plays 1–2 seconds after the player taps an answer.
The delay comes from doing all the work at tap time:

1. Tap → `playCorrectAnswerAudio()` → `playDialogueLineAudio()` POSTs the text
   to `/api/tts/dialogue-line`.
2. On a server cache miss, VOICEVOX synthesizes the WAV (~0.5–2s; worse on
   prod, where TTS synthesis is the known CPU bottleneck).
3. The response only carries a URL; the client then makes a **second** request
   to download the WAV before playback starts.

Intro cards ("New discovery!") autoplay their word audio through the same path,
so the new word appears 1–2s before it is heard.

## Goal

Audio for the tapped answer (and intro-card reveal) starts instantly, by
prefetching upcoming clips in the background. The client already knows what is
coming: `state.run.kanjiKombat.promptBuffer` holds the next ~60 prompts
(server refills to `PROMPT_BUFFER_TARGET = 60` at every checkpoint).

## Non-goals

- No changes to server TTS routes or caches.
- No prefetching outside Kanji Kombat feeds (though the cache layer is shared,
  other features only benefit passively — e.g. instant replays).
- No persistence of audio across page loads.

## Design

Two parts: a transparent line-audio cache in `public/js/tts.js`, and a small
feeder in `public/js/ui/kanji-kombat.js` that tells it what is coming next.

### Part 1: Dialogue-line cache in tts.js

New module-level state, following the existing `narrationCache` /
`wordAudioCache` patterns:

- `dialogueLineCache` — `Map` keyed by `` `${speakerId}|${text}` ``.
  Entry: `{ status: 'pending' | 'ready' | 'error', blobUrl, audioMeta, promise }`.
  - `audioMeta` is the server's `audio` response object
    (`{ userId, key, url, speakerId }`) — required because callers such as
    `npc-dialogue-card.js` merge the returned `{userId, key}` into their own
    state for later `playDialogueAudio()` replays. Cache hits must return the
    identical shape.
- **LRU cap: 20 entries.** Insertion-order eviction (Map iteration order),
  same as `narrationCache`. Evicting a `ready` entry revokes its blob URL.
  `pending` entries are not evicted.
- **Error entries stay for the session** and are not retried (matches
  `wordAudioCache` behavior; avoids retry storms when VOICEVOX is down).

New export `prefetchDialogueLine({ text, speakerId })`:

- No-op when TTS is disabled, muted, text is empty, or the key is already
  `pending`/`ready`/`error`.
- Work is pushed onto a **sequential queue (concurrency 1)** — a simple
  promise chain — so background prefetch never sends VOICEVOX more than one
  synthesis at a time. Prod CPU saturation under TTS load is a known issue;
  prefetch must move work earlier, not multiply it.
- Each job: POST `/api/tts/dialogue-line` (with auth headers, exactly as
  `playDialogueLineAudio` does today) → GET the returned audio URL → blob →
  `URL.createObjectURL` → mark entry `ready` with `blobUrl` + `audioMeta`.
  Any failure marks the entry `error`.

`playDialogueLineAudio({ text, speakerId })` gains a cache check at the top;
its signature and return contract are unchanged:

- **Hit (`ready`):** play the blob URL through the same `stop()` /
  `trackTtsAudio` / volume plumbing as today, await playback end, return the
  stored `audioMeta`.
- **In-flight (`pending`):** await the prefetch promise; if it produced a
  `ready` entry, behave as a hit (still faster than starting from zero),
  otherwise fall through to the network path.
- **Miss or `error`:** today's network path, byte-for-byte unchanged. A miss
  additionally stores its own result into the cache so an immediate replay of
  the same line is instant.
- Await semantics are preserved: the promise resolves when playback ends
  (`npc-dialogue-card.js` keeps its replay button disabled until then).

**Implementation gotcha:** `playAudioUrl()` prepends `API_BASE` to any URL not
starting with `http`, which would mangle `blob:` URLs. The cached-play path
must either pass blob URLs through untouched (extend the check) or use a
dedicated small play helper. Either way, playback goes through
`trackTtsAudio` so volume/mute changes apply live.

### Part 2: Kanji Kombat feeder

New function `prefetchUpcomingKanjiKombatAudio(state)` in
`public/js/ui/kanji-kombat.js`:

- Reads `state.run.kanjiKombat.promptBuffer.slice(0, 5)`.
- Derives one audio text per prompt via the existing
  `kanjiKombatAudioText()` fallback chain
  (`audioText || reading || prompt || answer`):
  - `kind === 'quiz'` → `kanjiKombatAudioText(prompt.quiz)` (the correct
    answer's audio — only one clip per quiz, regardless of choice count).
  - `kind === 'intro'` → `kanjiKombatAudioText(prompt.intro.card)`.
  - Completion/other kinds → skipped (no audio).
- Calls `prefetchDialogueLine({ text, speakerId: getSpeakerId() })` for each.
  Dedupe in the cache makes repeated calls free.

**Hook point:** called from `rememberKanjiKombatState()` — the single
chokepoint every KK state update passes through (renders, optimistic drafts,
checkpoint merges). As prompts are consumed the window slides forward and new
tail prompts from server merges get warmed automatically.

**Depth 5 rationale:** one clip per answered prompt, ~1s synthesis each,
players answer every ~3–5s — the queue stays ahead at normal pace. Worst-case
waste on an abandoned session is 5 clips.

## Edge cases

- **Speaker change mid-session:** keys include `speakerId`; old-voice entries
  stop matching and age out of the LRU; the next state pass warms the new
  voice. Misses fall back gracefully in the interim.
- **Mute / TTS disabled:** prefetch skips entirely (no wasted synthesis).
  Unmuting warms the cache on the next state pass.
- **VOICEVOX down:** entries mark `error` once, no retries; tap-time playback
  falls back to the existing path, which already warns and degrades silently.
- **First card of a session:** prefetch starts when KK state first renders; a
  player answering within ~1s of the very first card may still hit the slow
  path once. Accepted.
- **PvE/PvP parity:** not applicable — Kanji Kombat is its own mode and the
  change touches no combat-loop audio. The cache layer itself is mode-agnostic
  (any `playDialogueLineAudio` caller benefits).

## Testing

Tier 1 unit tests (mocked `fetch`, `Audio`, `URL.createObjectURL`/`revokeObjectURL`):

- Prefetch dedupe: second call for the same key issues no fetch.
- Sequential queue: two prefetches never overlap their fetches.
- LRU: 21st insert evicts the oldest `ready` entry and revokes its blob URL;
  `pending` entries survive.
- Play hit: no `/dialogue-line` POST at play time; returns stored `audioMeta`.
- Play pending: awaits in-flight prefetch, no duplicate fetch.
- Play miss: falls back to network path and populates the cache.
- Mute/disabled: prefetch is a no-op.
- Feeder: given a sample `promptBuffer` (quiz + intro + completion), derives
  the right 5 texts and skips completion prompts.

Manual verification on dev (`npm run dev`, Playwright — ask before launching):
play a KK session, confirm tap-to-audio is instant, and confirm via the
network tab that `/dialogue-line` requests happen ahead of taps, one at a
time.

## Rollout

Client-only JS served through Vite/bundle — no `SPRITE_VERSION`-style cache
bump needed. Ships as a normal feature branch → `dev` → `master`.
