# Simulator Exposure Alignment

**Date:** 2026-04-10
**Status:** Approved

## Problem

The run simulator manually shadow-tracks word exposure and learning events locally via `logEvent('word_exposure', ...)` and `logEvent('word_learned', ...)` calls across room handlers and combat. After the universal token and server-side exposure migration (April 1-9), these local events are out of sync with what the server actually does:

1. **Bark word extraction broken** — `combat.js:138` reads `bark.word` (old singular field), but the server now sends `{ trigger, text, tokens: [...], words: [...] }`. All bark word exposures are silently missed.
2. **CID dialogue dead code** — `runner.js:141-151` processes `cidScript` from `start-run`, but the server hardcodes `cidScript: null`. Code does nothing.
3. **Befriend quiz prompts not captured** — Server returns `waitPrompt`, `namePrompt`, `successPrompt`, `wrongPrompt` with `{ tokens, words }`. Simulator ignores these entirely.
4. **Exposure is server-side** — `GameManager.exposeWords()` handles all FSRS exposure natively during API calls. The simulator's local tracking is redundant and now inaccurate.

## Design Principle

Stop shadow-tracking word exposure locally. The server is the source of truth. The simulator should drive APIs and read server state for learning metrics.

The server already tracks per-run:
- `runSummary.wordsExposed` — unique words seen during the run (array)
- `runSummary.wordsMastered` — words that crossed the FSRS threshold
- `buildRunSummary()` produces `wordsImmersed` (count) and `wordsMastered` (top 5)

The `POST /api/game/forfeit` endpoint returns `{ runSummary, state }` with this data.

## Changes

### 1. Capture `runSummary` from end-of-run (`runner.js`)

Always call forfeit at end of run (wiped or completed) and capture the response. Currently the simulator only forfeits on wipe and ignores the response.

**Note:** `forfeitRun()` is safe to call for both wipe and victory. The server never auto-clears `this.run` — on victory it sets `gameVictoryPending = true` but the run object stays alive until `forfeitRun()` explicitly nulls it (loop.js:1994). On wipe it sets `run.active = false` but also preserves the run object.

```js
const forfeitResult = await simCall('POST', '/api/game/forfeit',
  { isVictory: !runWiped }, `day ${day} run ${run} forfeit`);

const serverRunSummary = forfeitResult.data?.runSummary ?? {};
logEvent(day, run, 0, 'run_summary', {
  wiped: runWiped,
  completed: !runWiped,
  wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
  wordsMastered: serverRunSummary.wordsMastered ?? [],
  creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
  creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
  itemsCollected: serverRunSummary.itemsCollected ?? 0,
});
```

### 2. Snapshot known words at day boundaries (`runner.js`)

Query `/api/game/known-words` before the first run and after the last run each day. Derive metrics from the diff:

```js
// Before runs
const dayStartResult = await simCall('GET', '/api/game/known-words', null, `day ${day} start snapshot`);
const dayStartCount = dayStartResult.ok ? (dayStartResult.data?.words?.length ?? 0) : 0;

// ... runs ...

// After runs
const dayEndResult = await simCall('GET', '/api/game/known-words', null, `day ${day} end snapshot`);
const dayEndCount = dayEndResult.ok ? (dayEndResult.data?.words?.length ?? 0) : 0;
const newWordsToday = dayEndCount - dayStartCount;
```

Replaces the current event-counting logic for `total_known_words`, `new_words_today`.

### 3. Strip manual `word_exposure` / `word_learned` events

Remove all `logEvent(..., 'word_exposure', ...)` and `logEvent(..., 'word_learned', ...)` calls from:

- `simulator/engine/combat.js` — creature/move word extraction (lines 106-131), bark word extraction (lines 134-140)
- `simulator/engine/rooms/friendly-npc.js` — item and NPC name exposure logging
- `simulator/engine/rooms/word-discovery.js` — discovery word exposure and learned events
- `simulator/engine/rooms/speed-review.js` — review word exposure and mastered events
- `simulator/engine/runner.js` — hub speed review word exposure and mastered events

The `run_summary` event from Change 1 captures the aggregate per-run. The known-words snapshot from Change 2 captures per-day totals.

### 4. Clean up dead CID code (`runner.js`)

Remove `runner.js:141-151` which processes `startRunResult.data?.cidScript`. The server returns `cidScript: null` since CID scripts are disabled.

### 5. Log befriend prompt dialogue (`combat.js`)

When `cycle.befriendQuiz` includes prompt data (`waitPrompt`, `namePrompt`, `successPrompt`, `wrongPrompt`), log as `dialogue_seen` events. Server already handles word exposure for these prompts.

```js
if (cycle.befriendQuiz) {
  for (const key of ['waitPrompt', 'namePrompt', 'successPrompt', 'wrongPrompt']) {
    const prompt = cycle.befriendQuiz[key];
    if (prompt?.tokens) {
      dialogueSeen.push({ type: key, tokens: prompt.tokens });
      logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
        source: 'befriend_prompt', promptType: key, tokens: prompt.tokens
      });
    }
  }
}
```

### 6. Simplify bark handling (`combat.js`)

Remove word extraction from barks. Log as `dialogue_seen` only (server already exposed the words):

```js
if (cycle.barks) {
  for (const bark of cycle.barks) {
    barks.push(bark);
    if (bark.text) {
      dialogueSeen.push(bark);
      logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
        source: 'combat_bark', trigger: bark.trigger, line: bark.text
      });
    }
  }
}
```

### 7. Update daily snapshot metrics (`runner.js`)

Replace event-counting with server-derived metrics:

| Metric | Old source | New source |
|--------|-----------|------------|
| `total_known_words` | `GET /api/game/known-words` | Same (no change) |
| `new_words_today` | Count `word_learned` events | Day-end minus day-start known words (clamped to 0) |
| `words_exposed_today` | Count `word_exposure` events | Sum of `wordsImmersed` from run summaries |
| `dialogue_lines_encountered` | Count `dialogue_seen` events | Same (no change) |
| `rooms_explored` | Count `room_entered` events | Same (no change) |
| `speed_reviews_completed` | Count `word_exposure` events with `source: 'speed_review'` | Count successful `/api/game/known-words/review` calls in hub review loop |

## Files Modified

- `simulator/engine/runner.js` — Changes 1, 2, 4, 7
- `simulator/engine/combat.js` — Changes 3, 5, 6
- `simulator/engine/rooms/friendly-npc.js` — Change 3
- `simulator/engine/rooms/word-discovery.js` — Change 3
- `simulator/engine/rooms/speed-review.js` — Change 3
- `simulator/public/js/results.js` — Remove legacy `word_learned` fallback for creature befriend count (line ~101-111). No longer needed since `creature_befriended` events are retained and `run_summary` now includes the count.

## What Stays Unchanged

- `dialogue_seen` event logging (server doesn't track this)
- `room_entered` event logging (simulator-only analytics)
- `combat_round` event logging (simulator-only analytics)
- `creature_befriended` event logging (kept, also in run summary now)
- `item_acquired` event logging (kept, also in run summary now)
- Dashboard UI (`simulator/public/`) — no structural changes, reads from same SQLite schema
- Room handler structure — all handlers keep their existing flow, just drop exposure events
