# Server-Prepared Reveal Buffer Room Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make room travel instant on the happy path while keeping the server authoritative and stopping client exposure of the full future room list.

**Architecture:** Keep `run.rooms` as the private canonical server spine for legacy saves and internal services. Serialize only `state.room` plus `run.revealedRooms`, a rolling current-plus-one-next-room buffer. Add `run.roomActionSeq` and require optimistic `/proceed` calls to echo the current sequence and room index so stale or skipped commits correct back to authoritative state.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, existing Phase 1 optimistic action ledger.

---

## Contract

Server state:

- `run.rooms`: private canonical full room list; never returned to the browser.
- `run.roomActionSeq`: monotonic integer. Created lazily for old saves, starts at `0`, increments once per accepted room advance.
- `run.roomRevealBufferSize`: optional saved override, default `1` future room.

Client state:

- `state.room`: authoritative current room with actions.
- `state.run.revealedRooms`: array of `{ index, room }` for current room and at most one next room.
- `state.run.roomActionSeq`: current server sequence to send with optimistic proceed.
- `state.run.totalRooms`: total room count for progress UI.
- No `state.run.rooms`.

`POST /api/game/proceed` request:

```json
{
  "actionId": "run_...",
  "fromRoom": 0,
  "actionSeq": 0
}
```

Legacy calls without `actionId` keep working. Optimistic calls validate `fromRoom` and `actionSeq` before mutating. Duplicate `actionId` responses replay through the Phase 1 action ledger before validation so retries are idempotent.

`POST /api/game/proceed` optimistic success response:

```json
{
  "status": "accepted",
  "actionId": "run_...",
  "actionType": "run.proceed",
  "room": { "room": { "type": "encounter" }, "ingredientDrops": [] },
  "ingredientDrops": [],
  "state": {
    "room": { "type": "encounter", "actions": [] },
    "run": {
      "currentRoom": 1,
      "totalRooms": 10,
      "roomActionSeq": 1,
      "revealedRooms": [
        { "index": 1, "room": { "type": "encounter" } },
        { "index": 2, "room": { "type": "friendlyNpc" } }
      ]
    }
  }
}
```

Optimistic correction response:

```json
{
  "status": "corrected",
  "actionId": "run_...",
  "reason": "Room action sequence mismatch",
  "authoritativeState": { "run": { "roomActionSeq": 1, "revealedRooms": [] } }
}
```

## Tasks

### Task 1: Reveal Buffer Serialization

**Files:**

- Create: `src/game/room-reveal-buffer.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/phase-machine.js`
- Test: `tests/unit/game/room-reveal-buffer.test.js`

- [x] Add tests proving `buildClientRoomReveal()` returns current plus one next room, does not mutate canonical rooms, and excludes rooms beyond the buffer.
- [x] Add tests proving `GameManager.getState()` omits `run.rooms`, includes `run.revealedRooms`, and keeps `state.room` as the current room.
- [x] Add a shared phase helper so `derivePhase()` can resolve current room from `run.rooms`, `run.revealedRooms`, or top-level `state.room`.
- [x] Implement serialization helpers and wire `GameManager.getState()` to use them.

### Task 2: Server Room Action Sequence

**Files:**

- Modify: `src/game/services/exploration-service.js`
- Modify: `src/routes/game/run.js`
- Test: `tests/unit/game/exploration-reveal-buffer.test.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: `tests/integration/flows/exploration.test.js`

- [x] Add tests proving area entry initializes `roomActionSeq` and prepares the first reveal window.
- [x] Add tests proving each accepted `proceedToNextRoom()` increments `roomActionSeq` exactly once.
- [x] Add route tests proving optimistic `/proceed` accepts matching `{ fromRoom, actionSeq }`.
- [x] Add route tests proving stale `fromRoom` or `actionSeq` returns `corrected` without advancing the run.
- [x] Add integration tests proving `/api/game/state` and `/api/game/proceed` do not leak full `run.rooms`.
- [x] Implement lazy sequence initialization for legacy saves and validation in `/proceed`.

### Task 3: Client Reveal-Buffer Optimistic Travel

**Files:**

- Create: `public/js/ui/room-reveal-buffer.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/room-transition.js`
- Modify: `public/game.js`
- Test: `tests/unit/ui/room-reveal-buffer-client.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`
- Test: `tests/unit/ui/auto-proceed-room-transition.test.js`

- [x] Add client helper tests for reading the current and next buffered room from `state.room`/`run.revealedRooms`.
- [x] Add client helper tests for applying optimistic next-room state without creating a full `run.rooms` array.
- [x] Update `api.proceed()` to send `{ actionId, fromRoom, actionSeq }`.
- [x] Update optimistic proceed to use the buffered next room and start verification before travel animation.
- [x] Update `playRoomTransition()` and auto-proceed to read rooms through the reveal-buffer helper and optimistic `/proceed` envelope.
- [x] Update source-level integration assertions so optimistic proceed no longer depends on `state.run.rooms`.

### Task 4: Compatibility And Verification

**Files:**

- Modify: focused tests only if new assertions require expected shape changes.
- Modify: `docs/playtest-guide.md` only if manual verification discovers a new interaction rule.

- [x] Run `node --check` for edited browser/server JS.
- [x] Run focused unit and integration tests for room reveal, optimistic routes, and UI helpers.
- [x] Run `npm test`.
- [x] Ask before launching Playwright for visual verification. Approved by user; verified auto room travel on `http://localhost:5173` with Playwright Chromium after local WebKit sandbox crashes. The delayed `/proceed` run observed `{ actionId, fromRoom, actionSeq }`, HUD advanced to `2/7` before release, authoritative state reconciled to room 2 with `roomActionSeq: 1`, and screenshots were inspected then deleted.

## Acceptance Criteria

- The browser never receives full future `run.rooms`.
- Happy-path room proceed animates immediately from the server-prepared buffer.
- The server rejects stale optimistic proceed commits with corrected authoritative state.
- Duplicate optimistic proceed retries remain idempotent through the action ledger.
- Random and support rooms are finalized before entering the reveal buffer.
- Old saves without `roomActionSeq` or reveal metadata continue working.
- Tier 1 + Tier 2 tests pass.
