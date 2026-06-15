# Explore Session Runway Sync Design

**Date:** 2026-06-15
**Status:** Draft for review
**Feature:** Subway-resilient regular explore mode via prepared room runway, client action log, and batch checkpoint sync

## Problem

Kanji Kombat's offline problems were resolved by replacing overlapping online-first systems with one session architecture: server-issued runway, client action log, and batched checkpoint sync. Regular explore mode has a similar shape today.

Explore mode already has useful pieces:

- `revealedRooms` exposes current plus one future room.
- `roomActionSeq` protects optimistic proceed requests.
- `verifiedRunAction` and the action ledger provide idempotent endpoint-level commits.
- Many support rooms already store idempotent room-local state.

The problem is that these pieces are not one architecture. Each room renderer still owns its own pending action, failure copy, rollback behavior, and payload fetch timing. Friendly NPC, shrine, skill master, whack-a-mole, speed review, campfire, dealer, word discovery, and proceed each have bespoke online-first paths. This is the same style of system Kanji Kombat had before the session-log rebuild: locally useful patches, globally fragile behavior.

The target is not full reload-proof offline persistence. The target is subway-resilient room play: if the server has prepared the next room payloads, the player can keep exploring through short network gaps without taps being ignored, room screens going blank, or room-specific "did not save" recovery paths taking over the experience.

## Decisions Made During Brainstorm

- **Architecture match:** follow the latest Kanji Kombat implementation style as closely as possible: server runway -> client in-memory action log -> batch checkpoint sync.
- **Scope:** start with subway-resilient explore, not whole-area offline persistence. Reload loses unsynced local explore actions; server truth wins.
- **Runway size:** prepare the current room plus 5 rooms ahead, for up to 6 prepared room entries visible to the client. This replaces today's default current plus 1 room reveal buffer.
- **Dialogue/audio:** i+1 dialogue and audio metadata are part of the runway, not online-only render-time fetches. The server should select frames against the player's known vocabulary and attach cached or requestable audio metadata before the room is needed.
- **Migration discipline:** old endpoints may remain for compatibility during rollout, but the new client path should flow through one explore session model. Room-specific optimistic pending paths should be deleted after cutover.
- **Combat boundary:** explore sync prepares and enters combat rooms, but PvE/PvP combat mechanics remain in the combat subsystem. Offline combat changes are separate and must preserve PvE/PvP parity.

## Goals

- A player can move through prepared explore rooms during 1-2 minute connectivity gaps.
- Every room tap that can be satisfied from the prepared runway receives visible acknowledgment within 250ms.
- Room support payloads are ready before render: i+1 dialogue, audio metadata, offers, pools, due-word snapshots, and deterministic random outcomes.
- One client reconciliation path replaces room-specific pending action/retry/correction logic.
- Brief slow-network windows sync the maximum accumulated room progress in one batched request.
- Existing action ledger idempotency remains the dedupe mechanism.

## Non-Goals

- No IndexedDB/localStorage persistence for unsynced explore actions.
- No full-area pack in the first implementation.
- No PvE/PvP combat contract changes.
- No new static Japanese copy outside the frames pipeline.
- No dictionary changes.
- No removal of legacy endpoints until compatibility risk is acceptable.

## Architecture

Explore mode becomes three things.

### 1. Prepared Room Runway

The server owns canonical `run.rooms`. The client receives a bounded, prepared runway:

```js
{
  sessionEpoch: "ese_...",
  roomActionSeq: 12,
  currentRoom: 8,
  preparedAhead: 5,
  preparedRooms: [
    {
      index: 8,
      roomId: "room_...",
      room: { /* client-safe room state */ },
      entryPayload: { /* narration, background, drops */ },
      interactionPayload: { /* room-type-specific payload */ },
      offlineReady: true
    }
  ]
}
```

`preparedRooms` is the successor to `revealedRooms`. It does more than reveal type. It prepares every payload the client needs to render the room and accept the next expected action without a network call.

The runway builder should:

- Resolve random/support room types before they enter the runway.
- Assign friendly NPCs before their room is shown.
- Pre-roll room-entry ingredient drops.
- Select all frame-backed dialogue against the player's known vocabulary.
- Attach dialogue audio metadata using the existing dialogue-card TTS cache path. It may return cached keys immediately or requestable metadata while synthesis continues in the background.
- Roll offers, pools, and snapshots that must stay stable during offline play.
- Mark each prepared room with `offlineReady` and explicit missing payload reasons when incomplete.

### 2. Client Explore Action Log

The client owns an ordered in-memory log of player actions:

```js
{
  seq: 17,
  actionId: "run_...",
  kind: "friendlyNpc.choose",
  roomIndex: 8,
  roomId: "room_...",
  actionSeq: 12,
  payload: {
    itemId: "iron-charm",
    targetCreatureIndex: 0
  },
  createdAt: 1780000000000
}
```

The log replaces independent pending action state in room renderers. A new `public/js/ui/explore-session.js` owns:

- session epoch adoption
- action sequence assignment
- log append/drop
- sync debounce and retry backoff
- hard cap pause/resume
- checkpoint handling
- correction handling
- soft-pause state

Room renderers should ask the session for the current prepared payload and record actions through the session. They should not own `pendingRunActionId` style state after cutover.

### 3. Batch Checkpoint Sync

One endpoint commits room progress:

```http
POST /api/game/explore/sync
{
  "sessionEpoch": "ese_...",
  "entries": [ ...ordered log entries... ]
}
```

The server replays entries in order against canonical run state. For each entry:

- Validate `sessionEpoch`.
- Validate `roomIndex`, `roomId`, and `actionSeq`.
- Check action ledger for idempotent replay.
- Apply the action through the same server business logic used by legacy endpoints.
- Record the action ledger result.
- Stop at the first invalid entry and return a correction.

The response shape mirrors Kanji Kombat:

```js
{
  status: "ok" | "corrected",
  confirmedThroughSeq: 17,
  rejectedSeq: null,
  reason: null,
  results: [ /* per-entry committed results */ ],
  state,
  exploreRunway
}
```

The syncer should be single-flight and debounced after actions. Retry triggers should include online event, visibility restore, and backoff. Batching is the point: a short working connection should drain several rooms of progress in one request.

## Room Payload Contract

A prepared room is offline-ready only if the client can render it and accept the next expected action without an immediate fetch.

### Proceed and Entry

Prepared payload:

- next room identity and finalized type
- room background and sub-area metadata
- entry narration
- pre-rolled ingredient drops
- `roomActionSeq`

Client actions:

- `proceed`

### Friendly NPC

Prepared payload:

- assigned NPC
- greeting frame plus audio metadata
- offered equipment items
- item name tokens
- player request frames plus audio metadata

Client actions:

- `friendlyNpc.choose`

### Shrine

Prepared payload:

- selected greeting frame plus audio metadata
- reward options
- eligible creature targets can be derived locally from current party state

Client actions:

- `shrine.choose`

### Skill Master and NPC Battle Reward

Prepared payload:

- rolled skill offers
- skill-select prompt frame plus audio metadata
- speaker metadata

Client actions:

- `skillMaster.choose`
- `npcBattleSkill.choose`

### Whack-a-Mole

Prepared payload:

- intro dialogue frame plus audio metadata
- yes/no frames
- stable game pool
- finish dialogue line or finish dialogue candidates selected before completion

Client actions:

- `whackAMole.complete`
- `whackAMole.skip`

The final score remains client-provided. Server replay clamps and awards from that score as today.

### Campfire

Prepared payload:

- ingredient catalog
- owned ingredient counts
- cookable recipe hints
- discovered recipes
- yes/no frames
- current campfire state

Client actions:

- `campfire.cook`
- `campfire.feed`
- `campfire.skip`

Cooking results should be deterministic from selected ingredients. If any randomness is introduced later, it must be pre-issued in the runway.

### Speed Review Room

Prepared payload:

- due-word snapshot
- snapshot word keys
- target/required card count
- already-awarded review keys
- pending review keys

Client actions:

- `speedReview.commit`
- `speedReview.complete`

Commits are replayed by snapshot order. The client can keep swiping while offline as long as the snapshot exists.

### Word Discovery

Prepared payload:

- discovery status
- selected discovery words
- daily limit state
- auto-complete marker when no words are available or limit is reached

Client actions:

- `wordDiscovery.review`
- `wordDiscovery.complete`

Because this is a language-learning surface, prepared words must come from the existing dictionary-backed discovery path and retain accurate meanings.

### Dealer

Prepared payload:

- offered creatures
- party creature sell prices
- credits
- sell count and max sells

Client actions:

- `dealer.sell`
- `dealer.buy`
- `dealer.leave`

Dealer leave should move into the session model too. Today it is less idempotent than buy/sell and should not remain a special case.

### Encounter, Boss, and NPC Battle Combat

Prepared payload:

- room identity and combat start metadata
- NPC metadata for NPC battles
- any frame-backed intro copy that belongs to room entry

Client actions:

- `encounter.start`
- `npcBattle.start`
- `boss.start`

Explore sync may prepare and commit the handoff into combat. Combat turns and offline combat behavior stay in the combat subsystem.

## Server-Owned vs Locally Predicted

Predicted locally:

- room screen transitions within the prepared runway
- support room completion flags
- chosen reward/item/skill markers
- whack-a-mole score display
- speed review room local review progress
- campfire selected/cooked/fed UI when deterministic

Confirmed only by checkpoint:

- durable save state
- meta progression
- item discovery records
- creature stat changes and level-up persistence
- credits
- XP and rewards
- area clear and run victory
- action ledger state

If a locally predicted room outcome can affect a later prepared payload, the server must either pre-roll that dependency or make the client pause at that boundary until a checkpoint refreshes the runway.

## Reconciliation

Every sync response carries `confirmedThroughSeq`.

- **Checkpoint:** Drop confirmed entries, apply server-owned results, merge refreshed runway. Silent.
- **Correction:** Drop entries from the rejected entry onward, replace state and runway from server truth, rerender after any current animation/dialogue finishes.
- **Epoch mismatch:** Treat as correction. Server truth wins.
- **Reload with unsynced log:** Log is lost by design. Server truth wins.
- **Timed-out request that landed:** Resend is safe because action ids are idempotent.

The client should merge runway append-only where possible, using room index and room id high-water marks, but a correction may replace the whole runway.

## Pause Conditions

Use one soft pause pattern, not room-specific failure panels:

- prepared runway exhausted
- current room is missing required payload
- unsynced log reaches hard cap
- the next local prediction depends on a server-owned result not present in the runway

The copy should be calm and non-blaming, similar to Kanji Kombat's spotty-connection copy. Avoid "did not save", "invalid choice", and endpoint-specific failure wording for ordinary network drops.

## Deletions After Cutover

After the new client path is fully live, remove or stop using:

- `pendingRunActionId` in `exploration.js`
- `pendingCampfireActionId` in `campfire.js`
- `pendingDealerActionId` in `economy.js`
- room-specific rollback/correction branches in support room renderers
- render-time fetches for support room payloads already present in the runway
- direct client use of legacy room mutation endpoints

Legacy endpoints can remain server-side for one release with comments marking them as compatibility paths.

## Testing

### Phase 0 Harness

Build an explore subway harness first. It should fail against current code before the rebuild.

The harness should:

- Start from the dev test user.
- Enter regular explore mode.
- Queue a deterministic room sequence covering support rooms.
- Toggle offline windows of 60-120 seconds.
- Assert every eligible tap acknowledges within 250ms.
- Assert prepared rooms continue rendering while offline.
- Assert no room-specific "did not save" copy appears for ordinary drops.
- Assert no blank action area appears.
- Assert server state after reconnect matches the number and type of actions taken.

### Unit Tests

- Runway builder prepares current plus 5 ahead.
- Random/support rooms finalize before entering the runway.
- Each room payload builder returns `offlineReady` only when required payloads exist.
- Dialogue frame selection respects known vocabulary and carries overrides/audio metadata.
- Explore session batches actions, retries, pauses at cap, resumes after drain, and handles corrections.
- Sync service replays ordered entries, dedupes action ids, and rejects stale epochs.

### Integration Tests

- Proceed through several rooms under delayed/failed responses; one batch drains on recovery.
- Timed-out-but-landed sync does not double-commit.
- Stale `roomActionSeq` returns a correction with authoritative state.
- Reload during outage drops local log and resumes from server truth.
- Friendly NPC, shrine, campfire, whack-a-mole, speed review, and dealer all work through `/explore/sync`.

### Manual Validation

- Manual throttled playtest per `docs/playtest-guide.md`.
- Verify visual transitions with screenshots for any UI/CSS changes.
- Verify i+1 dialogue appears from prepared payloads while offline.
- Verify audio buttons/autoplay use cached or requestable metadata without blocking room render.

## Rollout Phases

1. **Harness:** Add the explore subway harness as the executable acceptance test.
2. **Server runway:** Add explore session epoch and prepared room runway builder. Keep current endpoints unchanged.
3. **Sync service:** Add `applyExploreSessionSync` and `/api/game/explore/sync`.
4. **Client session:** Add `explore-session.js` with log, syncer, pause, and correction handling.
5. **Proceed cutover:** Route room transitions through the session runway first.
6. **Support room cutover:** Move friendly NPC, shrine, skill master, whack-a-mole, campfire, speed review, word discovery, and dealer into session actions.
7. **Cleanup:** Delete old client pending-action layers and render-time payload fetches.
8. **Verification:** Turn the harness green, run `npm test`, then do manual throttled playtesting.

## Relationship to Kanji Kombat Session Sync

This design intentionally mirrors `docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md`.

| Kanji Kombat | Explore Mode |
| --- | --- |
| prompt buffer | prepared room runway |
| turn seed chain | pre-rolled room randomness |
| queued waves/rewards | prepared support-room payloads |
| client session log | client explore action log |
| `/kanji-kombat/sync` | `/explore/sync` |
| `sessionEpoch` | explore `sessionEpoch` |
| prompt exhausted pause | runway exhausted pause |

The main adaptation is heterogeneity. Kanji Kombat has one loop with repeated prompt/quiz entries. Explore mode has many room types, so the runway must define a payload contract per room type. The architecture should still stay one model.

