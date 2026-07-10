# Explore Online/Offline Sync Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standard Explore mode preserve one canonical ordered history and recover automatically across genuine online/offline transitions without blank controls, skipped rewards, duplicate rewards, stale state adoption, or combat transcript forks.

**Architecture:** Keep the prepared-runway plus in-memory-session-log architecture. Enforce append-before-mutation on the client, preflight and canonically authorize every server batch, share deterministic party transitions across browser/server, and fence server-only mutations until an authoritative checkpoint is adopted. Treat server idempotency and browser result consumption as separate concerns, and serialize live combat rather than preparing another fight during runway refresh.

**Tech Stack:** Node.js ES modules, Express, browser ES modules, deterministic shared PvE resolver, Node test runner (`node:test`), c8, Playwright WebKit, Vite.

## Global Constraints

- Work only in `/Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/explore-offline-sync` on `fix/explore-offline-sync-reliability`; do not modify the dirty persistent `koto-dev` worktree.
- Start from amended design commit `bdeac9e3` and use `/usr/bin/git` for every Git operation.
- Follow red-green TDD: add one focused failing regression, run it and confirm the expected failure, then write the minimum production change.
- Standard Explore PvE only. PvP mechanics, resolvers, transcripts, VFX, and playback remain shared and unchanged.
- No persistent offline queue, reload-proof unsynced progress, offline AI befriending, storage-engine rewrite, combat balance change, new reward, dictionary edit, or Japanese copy change.
- No client mutation may occur without an accepted replayable session entry.
- Deterministic browser-safe party mutations are mirrored; server-only XP/item/stat mutations are dependency-fenced until the checkpoint's authoritative party has been adopted.
- `replayed: true` means the server deduped an action; it never means this browser consumed the returned terminal/befriend result.
- A bare `GET /api/game/state` is a boot/reload boundary only. Every in-session fetch must pass `adoptSession=1`.
- Scope clarification for amended invariant 6: remove snapshot/restore-across-await from Explore sync response materialization. The shared legacy optimistic-action runner retains rollback, but its restore must rebind `combat.allies === run.creatureParty.active`.
- Preserve compatibility endpoints. Fence them from live session work instead of deleting them.
- Playwright use is approved for this task. Before browser verification, read `docs/playtest-guide.md`, use `npm run dev`, and navigate through Vite rather than Express directly.
- Do not leave screenshots, logs, generated memory JSON changes, or install-time `package-lock.json` changes in the branch.

## File and Interface Map

**Create**

- `src/game/room-entry-party.js` — browser-safe deterministic room-entry recovery.
- `src/game/npc-battle-reward.js` — durable NPC reward resolution and old-save inference.
- `public/js/ui/game-state-adoption.js` — pure stale/error response guards for state GETs.
- `tests/unit/game/room-entry-party.test.js`
- `tests/unit/game/npc-battle-reward.test.js`
- `tests/unit/game/exploration-service-combat-room-guard.test.js`
- `tests/unit/ui/game-state-adoption.test.js`

**Modify: client/session**

- `public/js/ui/explore-session.js`
- `public/js/ui/combat-loop.js`
- `public/js/ui/exploration.js`
- `public/js/ui/room-reveal-buffer.js`
- `public/js/api.js`
- `public/game.js`
- `src/shared/combat/local-combat-start.js`

**Modify: server/contract**

- `src/game/services/explore-session-contract.js`
- `src/game/services/explore-session-sync-service.js`
- `src/game/services/explore-runway-service.js`
- `src/game/services/exploration-service.js`
- `src/game/services/npc-service.js`
- `src/routes/game/combat.js`
- `src/routes/game/explore-session.js`
- `src/routes/game/optimistic-action-response.js`
- `src/routes/game/run.js`

**Stable interfaces introduced by this plan**

```js
// public/js/ui/explore-session.js
session.getPauseReason();                  // string | null
session.getLocalRevision();                // monotonic number
session.consumeResultOnce(actionId);       // true first time in epoch, false later
session.pause(reason);                     // idempotent recoverable pause

// public/js/ui/game-state-adoption.js
captureGameStateFetchToken(session);
isGameStateFetchCurrent(token, currentSession);
isGameStateErrorResponse(data);

// src/game/room-entry-party.js
applyRoomEntryPartyRecovery(run);

// src/game/npc-battle-reward.js
isNpcBattleRewardResolved(room);
armNpcBattleReward(room);
markNpcBattleRewardResolved(room, { chosenSkillId });

// src/game/services/explore-session-contract.js
validateExploreSessionBatch(entries);
acceptedExploreActionsForRoom(room, {
  combat,
  isCurrentRoom,
  includeProjectedCombatCycle,
});

// src/routes/game/optimistic-action-response.js
rebindGameManagerAliases(gameManager);
```

---

### Task 1: Make ExploreSession own revision, result consumption, pause state, and sync callback ordering

**Files:**
- Modify: `public/js/ui/explore-session.js:98-469`
- Test: `tests/unit/ui/explore-session.test.js`

**Interfaces:**
- Produces: `getPauseReason()`, `getLocalRevision()`, `consumeResultOnce(actionId)`, and `pause(reason)` on every session.
- Produces: `adoptRunwayInternal(nextRunway, { fromSync, deferResume })` ordering used by Tasks 3, 4, and 8.

- [ ] **Step 1: Add failing session-state and result-consumption tests**

Append these tests using the file's existing `makeRunway()`, `preparedRoom()`, and `okResponse()` helpers:

```js
test('exposes pause reason and a monotonic local revision', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());
  const r0 = session.getLocalRevision();

  const rejected = session.recordRoomAction('dealer.buy', {});
  assert.equal(rejected.reason, 'actionNotAccepted');
  assert.equal(session.getPauseReason(), 'actionNotAccepted');
  assert.equal(session.getLocalRevision(), r0);

  session.adoptRunway(makeRunway());
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'x' });
  assert.equal(session.getLocalRevision(), r0 + 1);

  session.reset();
  assert.equal(session.getLocalRevision(), r0 + 2);
});

test('consumes each returned action result once per session epoch', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());

  assert.equal(session.consumeResultOnce('run_es_result_1'), true);
  assert.equal(session.consumeResultOnce('run_es_result_1'), false);

  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_2222222222222222' }));
  assert.equal(session.consumeResultOnce('run_es_result_1'), true);
});

test('a sync-delivered epoch change rotates result consumption and revision', async () => {
  const nextEpochRunway = makeRunway({
    sessionEpoch: 'ese_3333333333333333',
  });
  const session = createExploreSession({
    syncRequest: async () => okResponse(1, {
      exploreRunway: nextEpochRunway,
    }),
  });
  session.adoptRunway(makeRunway({
    sessionEpoch: 'ese_2222222222222222',
  }));
  const before = session.getLocalRevision();
  assert.equal(session.consumeResultOnce('run_es_result_2'), true);
  assert.equal(session.consumeResultOnce('run_es_result_2'), false);

  assert.equal(session.recordRoomAction('friendlyNpc.choose', {
    itemId: 'field-tonic',
  }).accepted, true);
  await session.syncNow();

  assert.ok(session.getLocalRevision() > before);
  assert.equal(session.consumeResultOnce('run_es_result_2'), true);
});
```

- [ ] **Step 2: Add the failing runway-before-callback/deferred-resume test**

```js
test('sync callbacks see the response runway before a paused session resumes', async () => {
  const scheduler = makeManualScheduler();
  const events = [];
  const refreshed = makeRunway({
    currentRoom: 1,
    roomActionSeq: 88,
    preparedRooms: [preparedRoom(1, { actionSeq: 88 })],
  });
  let session;
  session = createExploreSession({
    syncRequest: async () => okResponse(1, { exploreRunway: refreshed }),
    onCheckpoint: () => events.push([
      'checkpoint',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    onResume: () => events.push([
      'resume',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['partyStats'] },
      }),
      preparedRoom(1, { dependencies: ['partyStats'] }),
    ],
  }));

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  await scheduler.fire();

  assert.deepEqual(events, [
    ['checkpoint', 88, true],
    ['resume', 88, false],
  ]);
});
```

Add the correction case explicitly:

```js
test('correction callback sees corrected runway before resume', async () => {
  const scheduler = makeManualScheduler();
  const events = [];
  const correctedRunway = makeRunway({
    currentRoom: 1,
    roomActionSeq: 99,
    preparedRooms: [preparedRoom(1, { actionSeq: 99 })],
  });
  let session;
  session = createExploreSession({
    syncRequest: async () => ({
      status: 'corrected',
      confirmedThroughSeq: null,
      rejectedSeq: 1,
      reason: 'server_correction',
      results: [],
      exploreRunway: correctedRunway,
    }),
    onCorrection: () => events.push([
      'correction',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    onResume: () => events.push([
      'resume',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['partyStats'] },
      }),
      preparedRoom(1, { dependencies: ['partyStats'] }),
    ],
  }));

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  await scheduler.fire();

  assert.deepEqual(events, [
    ['correction', 99, true],
    ['resume', 99, false],
  ]);
});
```

- [ ] **Step 3: Run the tests and verify the intended red failures**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session.test.js
```

Expected: missing-method failures for `getLocalRevision`/`consumeResultOnce`; current callbacks observe the old runway. A naïve adopt-first change also fails because it emits `resume` before `checkpoint`.

- [ ] **Step 4: Implement the session primitives and ordered adoption**

Add monotonically increasing state beside `generation`:

```js
let localRevision = 0;
let handledResultActionIds = new Set();

function getPauseReason() { return pauseReason; }
function getLocalRevision() { return localRevision; }

function consumeResultOnce(actionId) {
  if (typeof actionId !== 'string' || actionId.length === 0) return true;
  if (handledResultActionIds.has(actionId)) return false;
  handledResultActionIds.add(actionId);
  return true;
}
```

Increment `localRevision` after every accepted `log.push(entry)`, on `reset()`, and on a non-initial epoch/session boundary. Never set it back to zero. Clear `handledResultActionIds` on reset and epoch boundary. Make `noPreparedRoom` and `actionNotAccepted` call `enterPause(reason)` before rejecting. Expose `pause: enterPause`.

Change adoption and drain ordering exactly as follows:

```js
function adoptRunwayInternal(
  nextRunway,
  { fromSync = false, deferResume = false } = {},
) {
  const previousEpoch = sessionEpoch;
  const nextEpoch = nextRunway?.sessionEpoch ?? null;
  const epochChanged = Boolean(previousEpoch)
    && (!nextEpoch || previousEpoch !== nextEpoch);
  const sessionBoundary = !fromSync && epochChanged;

  runway = cloneValue(nextRunway) ?? null;
  sessionEpoch = nextEpoch;
  const rooms = preparedRoomsFor(runway);
  const firstRoomIndex = roomIndexFor(rooms[0]);
  localCurrentRoom = Number.isInteger(runway?.currentRoom)
    ? runway.currentRoom
    : firstRoomIndex;
  if (fromSync) replayPendingProceedCursor();

  if (epochChanged) {
    localRevision += 1;
    handledResultActionIds = new Set();
  }

  if (sessionBoundary) {
    generation += 1;
    activeDrainToken += 1;
    activeDrainPromise = null;
    clearTimers();
    log = [];
    syncing = false;
    attempts = 0;
    forceDrainRequested = false;
  }

  if (!deferResume) maybeResumeAfterDrain();
  return runway;
}

// In each corrected/ok drain branch, after mutating the log:
if (Object.hasOwn(response, 'exploreRunway')) {
  adoptRunwayInternal(response.exploreRunway, {
    fromSync: true,
    deferResume: true,
  });
}
notify(onCheckpoint, response, { logEmpty: log.length === 0 });
maybeResumeAfterDrain();
```

Use `notify(onCorrection, response)` instead of `notify(onCheckpoint, ...)` in the corrected branch, but keep the same adopt → callback → resume order.

- [ ] **Step 5: Re-run and commit**

Run the Step 3 command; expect all tests to pass. Then:

```bash
node --check public/js/ui/explore-session.js
/usr/bin/git add public/js/ui/explore-session.js tests/unit/ui/explore-session.test.js
/usr/bin/git commit -m "fix: enforce explore session ordering"
```

---

### Task 2: Append combat turns before playback and serialize seed-runway fallback

**Files:**
- Modify: `public/js/ui/combat-loop.js:537-862`
- Test: `tests/unit/ui/combat-session-local.test.js`

**Interfaces:**
- Consumes: Task 1 session methods.
- Produces: `getActiveStandardExploreSession()` so every compatibility fallback in a live standard run has one owner.
- Produces: `fenceExploreSessionBeforeLegacyCombat(session): Promise<boolean>`.

- [ ] **Step 1: Extend the fake session and add rejected/cap-reaching turn tests**

Extend `makeFakeSession()` with `pendingCount()`, `isPaused()`, `getLocalRevision()`, and `pause(reason)`. Set `run.active = true` in `sessionCombatState()`. Change the local helper to accept the real pending side:

```js
async function runTurn(
  harness,
  playback,
  { pendingFlag = 'player' } = {},
) {
  return combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
    actionType: 'attack',
    moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
    turnTiming: {
      actionType: 'attack',
      startedAt: 0,
      animationStartedAt: null,
      requestMs: null,
      logged: false,
    },
    pendingFlag,
    playback: playback || (async transcript => { playbackCalls.push(transcript); }),
    startMoveSelection: () => {},
    stopCombatLoop: () => {},
  });
}
```

Add:

```js
it('does not play, mutate, or leave attack pending when append is rejected', async () => {
  fakeSession.recordRoomAction = () => ({
    accepted: false,
    reason: 'hardCap',
    pendingCount: 50,
  });
  fakeSession.isPaused = () => true;
  const harness = initHarness(sessionCombatState());
  const before = structuredClone(harness.state);
  let plays = 0;
  combatLoop.__combatNetworkTest.setPendingFlags({ player: true });

  const handled = await runTurn(harness, async () => { plays += 1; });

  assert.equal(handled, true);
  assert.equal(plays, 0);
  assert.deepEqual(harness.state, before);
  assert.equal(verifyCalls.length, 0);
  assert.deepEqual(
    combatLoop.__combatNetworkTest.getPendingFlags(),
    { player: false, enemy: false },
  );
});

it('plays a cap-reaching accepted turn once without reopening move selection', async () => {
  let restarts = 0;
  fakeSession.isPaused = () => true;
  const harness = initHarness(sessionCombatState());

  await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
    actionType: 'attack',
    moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
    turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
    playback: async transcript => { playbackCalls.push(transcript); },
    startMoveSelection: () => { restarts += 1; },
    stopCombatLoop: () => {},
  });

  assert.equal(fakeSession.recorded.length, 1);
  assert.equal(playbackCalls.length, 1);
  assert.equal(harness.state.combat.optimistic.stateVersion, 1);
  assert.equal(restarts, 0);
});
```

Expose only these two flag helpers on `__combatNetworkTest` so the regression can verify the real module gates:

```js
setPendingFlags({ player = false, enemy = false } = {}) {
  playerAttackPending = player;
  enemyAttackPending = enemy;
},
getPendingFlags() {
  return { player: playerAttackPending, enemy: enemyAttackPending };
},
```

- [ ] **Step 2: Add the deferred seed-fallback ordering tests**

```js
it('drains the session before using the legacy verifier at seed exhaustion', async () => {
  const events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  fakeSession.pendingCount = () => 1;
  fakeSession.getLocalRevision = () => 1;
  fakeSession.isPaused = () => false;
  fakeSession.syncNow = async () => {
    events.push('sync:start');
    await gate;
    events.push('sync:end');
    fakeSession.pendingCount = () => 0;
  };
  combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => {
    events.push('verify');
    return { status: 'accepted', stateVersion: 1, nextSeed: 'seed-b' };
  });

  const turn = runTurn(initHarness(sessionCombatState({ turnSeeds: ['seed-a'] })));
  await Promise.resolve();
  assert.deepEqual(events, ['sync:start']);
  release();
  await turn;
  assert.deepEqual(events.slice(0, 3), ['sync:start', 'sync:end', 'verify']);
});
```

Add both blocked-fallback cases:

```js
it('does not verify when the session fence cannot clear its log', async () => {
  const pauses = [];
  fakeSession.pendingCount = () => 1;
  fakeSession.getLocalRevision = () => 7;
  fakeSession.isPaused = () => false;
  fakeSession.syncNow = async () => {};
  fakeSession.pause = reason => { pauses.push(reason); };
  combatLoop.__combatNetworkTest.setPendingFlags({ player: true });
  const harness = initHarness(sessionCombatState({ turnSeeds: ['seed-a'] }));

  const handled = await runTurn(harness, async () => {
    throw new Error('playback must not run');
  });

  assert.equal(handled, true);
  assert.equal(verifyCalls.length, 0);
  assert.deepEqual(pauses, ['syncPending']);
  assert.deepEqual(
    combatLoop.__combatNetworkTest.getPendingFlags(),
    { player: false, enemy: false },
  );
});

it('pauses instead of calling legacy verify when combat capability is missing', async () => {
  const pauses = [];
  fakeSession.currentPreparedRoom = () => ({ acceptedActions: [] });
  fakeSession.pause = reason => { pauses.push(reason); };
  combatLoop.__combatNetworkTest.setPendingFlags({ enemy: true });
  const harness = initHarness(sessionCombatState({
    turnSeeds: ['seed-a', 'seed-b'],
  }));

  const handled = await runTurn(harness, async () => {
    throw new Error('playback must not run');
  }, { pendingFlag: 'enemy' });

  assert.equal(handled, true);
  assert.equal(verifyCalls.length, 0);
  assert.deepEqual(pauses, ['missingPayload']);
  assert.deepEqual(
    combatLoop.__combatNetworkTest.getPendingFlags(),
    { player: false, enemy: false },
  );
});
```

- [ ] **Step 3: Run and confirm red**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/combat-session-local.test.js
```

Expected: rejected append still plays and shifts HP/version/seeds; cap-reaching turn reopens selection; length-1 seed chain calls verify without first draining.

- [ ] **Step 4: Implement append-first turns and the legacy fence**

Split standard-Explore ownership from capability and seed sufficiency:

```js
function getActiveStandardExploreSession() {
  const session = getExploreSession?.();
  const state = getGameState?.();
  return session
    && state?.run?.active === true
    && state.run.mode !== 'kanjiKombat'
    && state?.combat
    ? session
    : null;
}

function getExploreSessionCombatOwner(session = getActiveStandardExploreSession()) {
  const accepted = session?.currentPreparedRoom?.()?.acceptedActions;
  return Array.isArray(accepted) && accepted.includes('combat.cycle')
    ? session
    : null;
}

function hasSafeExploreSessionSeedRunway() {
  const seeds = getGameState()?.combat?.optimistic?.turnSeeds;
  return Array.isArray(seeds) && seeds.length > 1;
}

function clearCombatPendingFlag(pendingFlag) {
  if (pendingFlag === 'enemy') enemyAttackPending = false;
  else playerAttackPending = false;
}

async function fenceExploreSessionBeforeLegacyCombat(session) {
  const revision = session?.getLocalRevision?.() ?? 0;
  try {
    await session?.syncNow?.({ reason: 'combatSeedFallback' });
  } catch {}
  const unchanged = (session?.getLocalRevision?.() ?? revision) === revision;
  const empty = (session?.pendingCount?.() ?? 0) === 0;
  const online = globalThis.navigator?.onLine !== false;
  const ready = online && empty && unchanged && session?.isPaused?.() !== true;
  if (!ready) {
    session?.pause?.(empty && !online ? 'runwayExhausted' : 'syncPending');
  }
  return ready;
}
```

In `runSessionCreatureCombatTurn()`, build the prediction but do not start a drain there. Call `recordRoomAction()` synchronously. If it rejects, call `clearCombatPendingFlag(pendingFlag)` and return `true` so the caller cannot fall through to legacy verification. Only after acceptance call `markCombatAnimationStart()`, `playback()`, and `updateGameState()`.

Replace the wrapper branch with this ownership order:

```js
const standardSession = getActiveStandardExploreSession();
if (standardSession) {
  const owner = getExploreSessionCombatOwner(standardSession);
  if (!owner) {
    standardSession.pause?.('missingPayload');
    clearCombatPendingFlag(pendingFlag);
    return true;
  }

  if (hasSafeExploreSessionSeedRunway()) {
    const handled = await runSessionCreatureCombatTurn({
      actionType,
      moveChoices,
      turnTiming,
      playback,
      pendingFlag,
    });
    if (handled) {
      if (
        combatActive
        && isRecoveredCombatActive(getGameState())
        && standardSession.isPaused?.() !== true
        && !isEnemyDialogueActive?.()
      ) {
        await waitBeforeMoveSelection(nextSelectionDelayMs);
        restartMoveSelection();
      }
      return true;
    }
  }

  const legacyReady = await fenceExploreSessionBeforeLegacyCombat(owner);
  if (!legacyReady) {
    clearCombatPendingFlag(pendingFlag);
    return true;
  }
}
```

Only the path after this block may construct or call the strict legacy verifier. Therefore null prediction, seed exhaustion, and any other standard-Explore fallback await the same fence; missing/stale capability pauses for runway recovery and never invokes compatibility transport.

- [ ] **Step 5: Re-run, syntax-check, and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/combat-session-local.test.js
node --check public/js/ui/combat-loop.js
/usr/bin/git add public/js/ui/combat-loop.js tests/unit/ui/combat-session-local.test.js
/usr/bin/git commit -m "fix: serialize explore combat commits"
```

---

### Task 3: Preserve server dedupe and consume replayed terminal/befriend results once in the browser

**Files:**
- Modify: `public/js/ui/exploration.js:143-172`
- Test: `tests/unit/ui/explore-session-cutover.test.js:652-785`
- Test: `tests/unit/game/explore-session-sync-combat.test.js`

**Interfaces:**
- Consumes: `session.consumeResultOnce(actionId)` from Task 1.

- [ ] **Step 1: Replace the incorrect replayed-terminal test with two-delivery tests**

The first response must contain an unseen replayed result. Queue a second action and return the same action ID again. Define the fixture in each test so it is independent of neighboring cases:

```js
it('finishes an unseen replayed terminal result once', async () => {
  const combatRunway = {
    sessionEpoch: 'ese_replay111111',
    currentRoom: 0,
    roomActionSeq: 100,
    preparedRooms: [
      preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      }),
      preparedRoom(1),
    ],
  };
  let syncCalls = 0;
  const terminal = {
    seq: 1,
    actionId: 'run_es_replayed_terminal',
    combatEnded: true,
    victory: true,
    replayed: true,
  };
  const harness = initCutoverHarness({
    initialState: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
    apiSyncExploreSession: async () => {
      syncCalls += 1;
      return {
        status: 'ok',
        confirmedThroughSeq: syncCalls,
        results: [terminal],
        state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
        exploreRunway: combatRunway,
      };
    },
  });
  getExploreSession().adoptRunway(combatRunway);

  getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'one' });
  await getExploreSession().syncNow();
  getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'two' });
  await getExploreSession().syncNow();

  assert.equal(harness.finishCombatCalls.length, 1);
});

it('resumes an unseen replayed befriend result once', async () => {
  const combatRunway = {
    sessionEpoch: 'ese_befriend1111',
    currentRoom: 0,
    roomActionSeq: 100,
    preparedRooms: [
      preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      }),
      preparedRoom(1),
    ],
  };
  let syncCalls = 0;
  const befriend = {
    seq: 1,
    actionId: 'run_es_replayed_befriend',
    befriendQuizTriggered: true,
    combatEnded: false,
    replayed: true,
    befriendQuiz: {
      targetIndex: 0,
      creatureId: 'mizu',
      options: [],
    },
  };
  const harness = initCutoverHarness({
    initialState: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
    apiSyncExploreSession: async () => {
      syncCalls += 1;
      return {
        status: 'ok',
        confirmedThroughSeq: syncCalls,
        results: [befriend],
        state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
        exploreRunway: combatRunway,
      };
    },
  });
  getExploreSession().adoptRunway(combatRunway);

  getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'one' });
  await getExploreSession().syncNow();
  getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'two' });
  await getExploreSession().syncNow();

  assert.equal(harness.befriendResumeCalls.length, 1);
  assert.equal(harness.finishCombatCalls.length, 0);
});
```

In `explore-session-sync-combat.test.js`, add the lost-response server guarantees:

```js
it('replays a landed terminal victory without duplicating rewards', async () => {
  const gm = makeCombatGm({ roomType: ROOM_TYPES.npcBattle, enemyHp: 10 });
  const service = new ExploreSessionSyncService(gm);
  await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [startEntry(gm, {
      seq: 1,
      actionId: 'run_es_terminal_start',
      kind: 'npcBattle.start',
    })],
  });
  const cycle = matchingCycleEntry(gm, {
    seq: 2,
    actionId: 'run_es_terminal_cycle',
    moveId: BIG_MOVE.id,
  });

  const first = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [cycle],
  });
  const afterFirst = structuredClone({
    party: gm.run.creatureParty,
    room: gm.run.rooms[0],
    combat: gm.combat,
    stats: gm.run.stats,
    summary: gm.run.runSummary,
  });
  const replay = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [cycle],
  });

  assert.equal(first.results[0].combatEnded, true);
  assert.equal(replay.results[0].combatEnded, true);
  assert.equal(replay.results[0].replayed, true);
  assert.deepEqual({
    party: gm.run.creatureParty,
    room: gm.run.rooms[0],
    combat: gm.combat,
    stats: gm.run.stats,
    summary: gm.run.runSummary,
  }, afterFirst);
});

it('replays a landed befriend trigger without rerolling or granting twice', async () => {
  const gm = makeCombatGm({ roomType: ROOM_TYPES.encounter, enemyHp: 10 });
  const service = new ExploreSessionSyncService(gm);
  await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [startEntry(gm, {
      seq: 1,
      actionId: 'run_es_befriend_start',
      kind: 'encounter.start',
    })],
  });
  const cycle = matchingCycleEntry(gm, {
    seq: 2,
    actionId: 'run_es_befriend_cycle',
    moveId: BIG_MOVE.id,
  });

  const first = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [cycle],
  });
  const afterFirst = structuredClone({
    party: gm.run.creatureParty,
    enemies: gm.combat.enemies,
    quiz: gm.combat.befriendQuiz,
    pendingCaptures: gm.run.creatureParty.pendingCaptures,
  });
  const replay = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [cycle],
  });

  assert.equal(first.results[0].befriendQuizTriggered, true);
  assert.equal(replay.results[0].befriendQuizTriggered, true);
  assert.equal(replay.results[0].replayed, true);
  assert.deepEqual({
    party: gm.run.creatureParty,
    enemies: gm.combat.enemies,
    quiz: gm.combat.befriendQuiz,
    pendingCaptures: gm.run.creatureParty.pendingCaptures,
  }, afterFirst);
});
```

- [ ] **Step 2: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session-cutover.test.js tests/unit/game/explore-session-sync-combat.test.js
```

Expected: first replayed terminal/befriend delivery is ignored, producing zero calls.

- [ ] **Step 3: Implement newest-unconsumed result selection**

```js
function findLastUnconsumedSessionResult(results, predicate) {
  const session = getExploreSession?.();
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (!predicate(result)) continue;
    if (
      !result?.actionId
      || !session?.consumeResultOnce
      || session.consumeResultOnce(result.actionId)
    ) {
      return result;
    }
  }
  return null;
}
```

Call it for befriend results only when `resumeSessionCombatBefriendQuiz` is a function, then for terminal results only when `finishCombatLoop` is a function. This prevents consuming a result before its handler exists. Remove every `!result.replayed` predicate; retain action-ID consumption as the only browser idempotency gate.

- [ ] **Step 4: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session-cutover.test.js tests/unit/game/explore-session-sync-combat.test.js
node --check public/js/ui/exploration.js
/usr/bin/git add public/js/ui/exploration.js tests/unit/ui/explore-session-cutover.test.js tests/unit/game/explore-session-sync-combat.test.js
/usr/bin/git commit -m "fix: consume replayed explore results once"
```

---

### Task 4: Serialize reconnect recovery, classify permanent sync failures, and fence legacy proceed

**Files:**
- Modify: `public/js/ui/exploration.js:80-287,1089-1161`
- Modify: `public/js/ui/explore-session.js:361-438`
- Modify: `public/js/api.js:248-270`
- Test: `tests/unit/ui/explore-session-cutover.test.js`
- Test: `tests/unit/ui/explore-session.test.js`
- Test: `tests/unit/ui/auto-proceed-room-transition.test.js`
- Test: `tests/unit/api-network-hardening.test.js`

**Interfaces:**
- Produces: `triggerExploreSessionRecovery(reason): Promise<{ recovered, retryable }>`.
- Consumes: Task 1 pause/revision methods.

- [ ] **Step 1: Add real offline→online empty-log recovery and retry tests**

Using `pausingRunway()`, `makeEventTarget()`, and `waitFor()` from the cutover test:

```js
it('refreshes and resumes an offline empty-log pause on the online event', async () => {
  const originalNavigator = globalThis.navigator;
  const windowTarget = makeEventTarget();
  let online = false;
  Object.defineProperty(globalThis, 'navigator', {
    value: { get onLine() { return online; } },
    configurable: true,
  });
  let refreshCalls = 0;
  const stalled = pausingRunway();
  const ready = makeRunway({
    sessionEpoch: stalled.sessionEpoch,
    preparedRooms: [preparedRoom(0), preparedRoom(1)],
  });
  initRecoveryHarness({
    refreshRunwayState: async () => {
      refreshCalls += 1;
      getExploreSession().adoptRunway(ready);
    },
  });
  wireExploreSessionRecoveryDrains({ windowTarget, documentTarget: null });
  getExploreSession().adoptRunway(stalled);
  assert.equal(getExploreSession().recordRoomAction('proceed').reason, 'nextRoomNotReady');
  assert.equal(refreshCalls, 0);

  online = true;
  windowTarget.dispatch('online');
  await waitFor(() => refreshCalls === 1 && !getExploreSession().isPaused());

  assert.equal(getExploreSession().pendingCount(), 0);
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
});

it('retries a failed runway refresh once at the first bounded delay', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, delay) => {
    const timer = { fn, delay, cancelled: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => {
    if (timer) timer.cancelled = true;
  };

  try {
    const stalled = pausingRunway();
    const ready = makeRunway({
      sessionEpoch: stalled.sessionEpoch,
      preparedRooms: [preparedRoom(0), preparedRoom(1)],
    });
    let refreshCalls = 0;
    initRecoveryHarness({
      refreshRunwayState: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) throw new Error('temporary outage');
        getExploreSession().adoptRunway(ready);
      },
    });
    getExploreSession().adoptRunway(stalled);
    assert.equal(
      getExploreSession().recordRoomAction('proceed').reason,
      'nextRoomNotReady',
    );
    await waitFor(() => refreshCalls === 1 && timers.length === 1);

    assert.equal(timers[0].delay, 500);
    await timers[0].fn();
    await waitFor(() => refreshCalls === 2 && !getExploreSession().isPaused());

    assert.equal(getExploreSession().pendingCount(), 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
```

- [ ] **Step 2: Add permanent-response and legacy-fence red tests**

In `api-network-hardening.test.js`:

```js
it('classifies Explore sync HTTP responses without flattening correction bodies', async () => {
  const api = await import('../../public/js/api.js');
  for (const [status, transient] of [[403, false], [429, true], [500, true]]) {
    globalThis.fetch = mock.fn(async () => jsonResponse({ error: `e${status}` }, status));
    const result = await api.__networkTest.apiCall(
      '/explore/sync',
      'POST',
      { entries: [{}] },
      null,
      {
        returnErrorBody: true,
        classifyHttpErrors: true,
        requireObjectResponse: true,
        maxAttempts: 1,
      },
    );
    assert.deepEqual(result, {
      error: `e${status}`,
      httpStatus: status,
      transient,
    });
  }

  globalThis.fetch = mock.fn(async () => jsonResponse({
    status: 'corrected',
    reason: 'server_correction',
    confirmedThroughSeq: null,
    rejectedSeq: 1,
    results: [],
  }, 409));
  const correction = await api.syncExploreSession({
    sessionEpoch: 'ese_1111111111111111',
    entries: [{}],
  });
  assert.equal(correction.status, 'corrected');
  assert.equal(correction.httpStatus, 409);
  assert.equal(correction.transient, false);
});

it('returns permanent auth and malformed-2xx Explore sync responses', async () => {
  const api = await import('../../public/js/api.js');
  globalThis.fetch = mock.fn(async () => jsonResponse({ error: 'expired' }, 401));
  const auth = await api.syncExploreSession({
    sessionEpoch: 'ese_1111111111111111',
    entries: [{}],
  });
  assert.equal(auth.httpStatus, 401);
  assert.equal(auth.transient, false);
  assert.equal(globalThis.window.location.href, '/');

  globalThis.fetch = mock.fn(async () => jsonResponse(null, 200));
  const malformed = await api.syncExploreSession({
    sessionEpoch: 'ese_1111111111111111',
    entries: [{}],
  });
  assert.deepEqual(malformed, {
    error: 'invalid_response',
    httpStatus: 200,
    transient: false,
  });
});
```

In `explore-session.test.js`, cover permanent, malformed, and HTTP-correction ordering:

```js
for (const response of [
  { error: 'forbidden', httpStatus: 403, transient: false },
  { unexpected: 'malformed 2xx body' },
]) {
  const scheduler = makeManualScheduler();
  const session = createExploreSession({
    syncRequest: async () => response,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });

  await session.syncNow();

  assert.equal(session.pendingCount(), 1);
  assert.equal(session.getPauseReason(), 'syncRejected');
  assert.equal(scheduler.delays().includes(500), false);
}

let correctionCalls = 0;
const correctedSession = createExploreSession({
  syncRequest: async () => ({
    status: 'corrected',
    error: 'HTTP 409',
    httpStatus: 409,
    transient: false,
    confirmedThroughSeq: null,
    rejectedSeq: 1,
    reason: 'server_correction',
    results: [],
    exploreRunway: makeRunway(),
  }),
  onCorrection: () => { correctionCalls += 1; },
});
correctedSession.adoptRunway(makeRunway());
correctedSession.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
await correctedSession.syncNow();
assert.equal(correctionCalls, 1);
assert.equal(correctedSession.pendingCount(), 0);
assert.notEqual(correctedSession.getPauseReason(), 'syncRejected');
```

In `explore-session-cutover.test.js`, define a legacy-only support fixture and add all three fences:

```js
function legacyOnlySupportRunway() {
  return {
    sessionEpoch: 'ese_legacyfence11',
    currentRoom: 0,
    roomActionSeq: 100,
    preparedRooms: [preparedRoom(0, {
      room: room(0, { type: 'shrine' }),
      acceptedActions: ['shrine.choose'],
      actionEffects: { 'shrine.choose': ['partyStats'] },
    })],
  };
}

it('does not legacy-proceed when the session drain fails', async () => {
  const runway = legacyOnlySupportRunway();
  let proceedCalls = 0;
  initCutoverHarness({
    initialState: makeState({ currentRoom: 0, exploreRunway: runway }),
    apiProceed: async () => { proceedCalls += 1; return null; },
    apiSyncExploreSession: async () => { throw new Error('offline'); },
  });
  getExploreSession().adoptRunway(runway);
  getExploreSession().recordRoomAction('shrine.choose', {
    rewardType: 'heal_all',
  });

  await proceedWithRevealBuffer();

  assert.equal(proceedCalls, 0);
  assert.equal(getExploreSession().pendingCount(), 1);
});

it('does not legacy-proceed when local revision changes during drain', async () => {
  const runway = legacyOnlySupportRunway();
  const requests = [];
  let proceedCalls = 0;
  initCutoverHarness({
    initialState: makeState({ currentRoom: 0, exploreRunway: runway }),
    apiProceed: async () => { proceedCalls += 1; return null; },
    apiSyncExploreSession: payload => new Promise(resolve => {
      requests.push({ payload, resolve });
    }),
  });
  getExploreSession().adoptRunway(runway);
  getExploreSession().recordRoomAction('shrine.choose', {
    rewardType: 'heal_all',
  });

  const proceeding = proceedWithRevealBuffer();
  await waitFor(() => requests.length === 1);
  getExploreSession().recordRoomAction('shrine.choose', {
    rewardType: 'credits',
  });
  requests[0].resolve({
    status: 'ok',
    confirmedThroughSeq: 2,
    results: [],
    exploreRunway: runway,
  });
  await proceeding;

  assert.equal(proceedCalls, 0);
  assert.equal(getExploreSession().pendingCount(), 0);
});

it('does not legacy-proceed from an empty paused session', async () => {
  const emptyRunway = {
    sessionEpoch: 'ese_emptypause111',
    currentRoom: 0,
    roomActionSeq: 100,
    preparedRooms: [],
  };
  let proceedCalls = 0;
  initCutoverHarness({
    initialState: makeState({ currentRoom: 0, exploreRunway: emptyRunway }),
    apiProceed: async () => { proceedCalls += 1; return null; },
  });
  getExploreSession().adoptRunway(emptyRunway);
  getExploreSession().pause('missingPayload');

  await proceedWithRevealBuffer();

  assert.equal(proceedCalls, 0);
  assert.equal(getExploreSession().pendingCount(), 0);
  assert.equal(getExploreSession().isPaused(), true);
});
```

Keep the current happy test, but make it assert `['sync:start', 'sync:end', 'proceed']` exactly.

- [ ] **Step 3: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/api-network-hardening.test.js
```

Expected: online event only drains the empty log; refresh remains zero. Permanent/malformed responses schedule retries or corrections become `syncRejected`. Legacy proceed still fires after failed or stale drains.

- [ ] **Step 4: Add HTTP status classification and stop blind permanent retries**

Add opt-in response classification to `apiCall()` so unrelated compatibility callers retain their existing response shape. Handle 401 before the general non-OK block:

```js
if (response.status === 401) {
  if (!hasRedirectedFor401) {
    hasRedirectedFor401 = true;
    localStorage.removeItem('authToken');
    sessionStorage.setItem('sessionExpiredMsg', 'Session expired, please log in again');
    window.location.href = '/';
  }
  onApiSuccess();
  if (opts.returnErrorBody && opts.classifyHttpErrors) {
    return {
      ...(data && typeof data === 'object' ? data : {}),
      error: data?.error || 'Session expired',
      httpStatus: 401,
      transient: false,
    };
  }
  throw new Error('Session expired');
}

if (!response.ok && opts.returnErrorBody) {
  if (!opts.classifyHttpErrors) return data;
  const httpStatus = response.status;
  return {
    ...(data && typeof data === 'object' ? data : {}),
    error: data?.error || `HTTP ${httpStatus}`,
    httpStatus,
    transient: httpStatus === 429 || httpStatus >= 500,
  };
}

if (
  response.ok
  && opts.requireObjectResponse
  && (!data || typeof data !== 'object' || Array.isArray(data))
) {
  return {
    error: 'invalid_response',
    httpStatus: response.status,
    transient: false,
  };
}
```

Make the wrapper explicit:

```js
async function syncExploreSession({ sessionEpoch, entries }) {
  const response = await apiCall(
    '/explore/sync',
    'POST',
    { sessionEpoch, entries },
    null,
    {
      bypassLoadingGate: true,
      returnErrorBody: true,
      classifyHttpErrors: true,
      requireObjectResponse: true,
    },
  );
  return response || { error: 'network_unavailable', transient: true };
}
```

In `drainOnce()`, process recognized protocol statuses before inspecting the HTTP metadata. The branch order is mandatory:

```js
if (response?.status === 'corrected') {
  log = [];
  attempts = 0;
  if (Object.hasOwn(response, 'exploreRunway')) {
    adoptRunwayInternal(response.exploreRunway, {
      fromSync: true,
      deferResume: true,
    });
  }
  notify(onCorrection, response);
  maybeResumeAfterDrain();
  return { ok: true, appendedAfterSnapshot: false };
} else if (response?.status === 'ok') {
  attempts = 0;
  const confirmed = Number.isInteger(response.confirmedThroughSeq)
    ? response.confirmedThroughSeq
    : -1;
  log = log.filter(entry => entry.seq > confirmed);
  const appendedAfterSnapshot = log.some(
    entry => entry.seq > snapshotMaxSeq,
  );
  if (Object.hasOwn(response, 'exploreRunway')) {
    adoptRunwayInternal(response.exploreRunway, {
      fromSync: true,
      deferResume: true,
    });
  }
  notify(onCheckpoint, response, { logEmpty: log.length === 0 });
  maybeResumeAfterDrain();
  return { ok: true, appendedAfterSnapshot };
} else if (
  response?.transient === false
  || (response && typeof response === 'object' && !response?.error)
) {
  enterPause('syncRejected');
  return { ok: false, permanent: true };
} else {
  throw new Error(response?.error || 'explore session sync failed');
}
```

Thus an HTTP 409 body with `status: 'corrected'` is still applied as a correction even though it carries `transient: false`; 401/403 and malformed 2xx bodies pause permanently; null/network/5xx/429 remain retryable. Do not call `scheduleRetry()` for a permanent branch.

- [ ] **Step 5: Implement one serialized recovery promise**

Replace the cooldown with one `runwayRecoveryPromise`, a retry timer, and attempt counter. Replace the current recovery-reason set with:

```js
const RUNWAY_RECOVERY_REASONS = new Set([
  'noPreparedRoom',
  'currentRoomNotReady',
  'nextRoomNotReady',
  'runwayExhausted',
  'missingPayload',
  'actionNotAccepted',
]);
```

The serialized operation must be:

```js
async function runExploreSessionRecovery(reason) {
  const session = getExploreSession?.();
  if (!session || globalThis.navigator?.onLine === false) {
    return { recovered: false, retryable: false };
  }

  if ((session.pendingCount?.() ?? 0) > 0) {
    await session.syncNow({ reason: 'onlineRecovery' });
  }
  if (session.getPauseReason?.() === 'syncRejected') {
    return { recovered: false, retryable: false };
  }
  if ((session.pendingCount?.() ?? 0) > 0) {
    session.pause?.('syncPending');
    return { recovered: false, retryable: true };
  }

  const pausedFor = reason || session.getPauseReason?.();
  if (!RUNWAY_RECOVERY_REASONS.has(pausedFor)) {
    return {
      recovered: session.isPaused?.() !== true,
      retryable: false,
    };
  }

  const revision = session.getLocalRevision?.() ?? 0;
  await refreshRunwayState();
  const recovered = (session.getLocalRevision?.() ?? revision) === revision
    && (session.pendingCount?.() ?? 0) === 0
    && session.isPaused?.() !== true;
  return { recovered, retryable: !recovered };
}
```

Implement the controller exactly once around that operation:

```js
const RUNWAY_RECOVERY_RETRY_MS = [500, 1000, 2000, 4000, 8000, 15000];
let runwayRecoveryPromise = null;
let runwayRecoveryTimer = null;
let runwayRecoveryAttempt = 0;

function scheduleExploreSessionRecovery() {
  if (runwayRecoveryTimer) return;
  const index = Math.min(
    runwayRecoveryAttempt,
    RUNWAY_RECOVERY_RETRY_MS.length - 1,
  );
  const delay = RUNWAY_RECOVERY_RETRY_MS[index];
  runwayRecoveryAttempt += 1;
  runwayRecoveryTimer = setTimeout(() => {
    runwayRecoveryTimer = null;
    void triggerExploreSessionRecovery();
  }, delay);
}

function triggerExploreSessionRecovery(reason) {
  if (runwayRecoveryPromise) return runwayRecoveryPromise;
  runwayRecoveryPromise = Promise.resolve()
    .then(() => runExploreSessionRecovery(reason))
    .catch(() => ({ recovered: false, retryable: true }))
    .then(outcome => {
      if (outcome.recovered) {
        runwayRecoveryAttempt = 0;
        if (runwayRecoveryTimer) clearTimeout(runwayRecoveryTimer);
        runwayRecoveryTimer = null;
        updateUI?.();
      } else if (outcome.retryable) {
        scheduleExploreSessionRecovery();
      }
      return outcome;
    })
    .finally(() => { runwayRecoveryPromise = null; });
  return runwayRecoveryPromise;
}
```

`showExploreSoftPause()` calls `session.pause(reason || 'missingPayload')` only when not already paused, renders, then calls `triggerExploreSessionRecovery(reason)`. Online and visible-page listeners call `triggerExploreSessionRecovery()` with no event-name argument so the operation reads the actual session pause reason. A `syncRejected` outcome never arms the recovery timer; a later explicit online/visible/manual signal may retry its retained log once.

- [ ] **Step 6: Fence both legacy proceed sites**

```js
async function flushPendingSessionBeforeLegacyProceed(session) {
  if (!session) return true;
  const revision = session.getLocalRevision?.() ?? 0;
  try {
    if ((session.pendingCount?.() ?? 0) > 0) {
      await session.syncNow({ reason: 'legacyProceed' });
    }
  } catch {
    return false;
  }
  return (session.pendingCount?.() ?? 0) === 0
    && session.isPaused?.() !== true
    && (session.getLocalRevision?.() ?? revision) === revision;
}
```

Before each `apiProceed()` call, require true. Otherwise call `showExploreSoftPause({ reason: session?.getPauseReason?.() || 'syncPending' })` and return `null`.

- [ ] **Step 7: Re-run, syntax-check, and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/api-network-hardening.test.js
node --check public/js/ui/explore-session.js
node --check public/js/ui/exploration.js
node --check public/js/api.js
/usr/bin/git add public/js/ui/explore-session.js public/js/ui/exploration.js public/js/api.js tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/api-network-hardening.test.js
/usr/bin/git commit -m "fix: recover explore sessions automatically"
```

---

### Task 5: Share deterministic room-entry party recovery between server and browser

**Files:**
- Create: `src/game/room-entry-party.js`
- Modify: `src/game/services/exploration-service.js:141-181,351-366,500-520`
- Modify: `public/js/ui/room-reveal-buffer.js`
- Create: `tests/unit/game/room-entry-party.test.js`
- Modify: `tests/unit/ui/room-reveal-buffer-client.test.js`
- Modify: `tests/unit/game/exploration-service-room-heal.test.js`
- Modify: `tests/unit/combat/resolution.test.js`
- Modify: `tests/unit/game/skill-master-service.test.js`

**Interfaces:**
- Produces: `applyRoomEntryPartyRecovery(run): creatureParty | null`.

- [ ] **Step 1: Add the failing pure and cross-path parity tests**

Create `room-entry-party.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRoomEntryPartyRecovery } from '../../../src/game/room-entry-party.js';

test('heals living creatures without reviving and clears combat effects', () => {
  const run = {
    partySkills: [{ id: 'hpMaster', level: 2 }],
    creatureParty: {
      active: [
        { id: 'hi', hp: 40, maxHp: 80, statStages: { atk: 2, def: -1, dex: 3 }, activeEffects: [{ type: 'poison' }] },
        { id: 'ko', hp: 0, maxHp: 80, statStages: { atk: -2, def: 1, dex: 0 }, activeEffects: [{ type: 'sleep' }] },
      ],
      reserves: [
        { id: 'reserve', hp: 79, maxHp: 80, statStages: { atk: 1, def: 1, dex: 1 }, activeEffects: [{ type: 'stun' }] },
      ],
    },
  };

  applyRoomEntryPartyRecovery(run);

  assert.equal(run.creatureParty.active[0].maxHp, 100);
  assert.equal(run.creatureParty.active[0].hp, 60);
  assert.equal(run.creatureParty.active[1].maxHp, 100);
  assert.equal(run.creatureParty.active[1].hp, 0);
  assert.equal(run.creatureParty.reserves[0].maxHp, 100);
  assert.equal(run.creatureParty.reserves[0].hp, 100);
  for (const creature of [...run.creatureParty.active, ...run.creatureParty.reserves]) {
    assert.deepEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
    assert.deepEqual(creature.activeEffects, []);
  }
});
```

Extend `room-reveal-buffer-client.test.js` with an actual server/client comparison:

```js
it('matches server room-entry recovery byte-for-byte', () => {
  const rooms = [
    createRoom(ROOM_TYPES.friendlyNpc, 'okunomori', 1, 2),
    createRoom(ROOM_TYPES.friendlyNpc, 'okunomori', 2, 2),
  ];
  rooms[0].interacted = true;
  const creatureParty = {
    active: [
      {
        id: 'hi',
        hp: 40,
        maxHp: 80,
        statStages: { atk: 2, def: -1, dex: 3 },
        activeEffects: [{ type: 'poison', remainingTurns: 2 }],
      },
      {
        id: 'ko',
        hp: 0,
        maxHp: 80,
        statStages: { atk: -2, def: 1, dex: 0 },
        activeEffects: [{ type: 'sleep', remainingTurns: 1 }],
      },
    ],
    reserves: [{
      id: 'reserve',
      hp: 20,
      maxHp: 160,
      statStages: { atk: 1, def: 1, dex: 1 },
      activeEffects: [{ type: 'stun', remainingTurns: 1 }],
    }],
  };
  const baseRun = {
    active: true,
    rooms,
    currentRoom: 0,
    roomsExplored: 1,
    totalEncounters: 1,
    stats: { roomsExplored: 0, areasCleared: 0 },
    runStats: { roomsCleared: 0 },
    areasCompleted: 0,
    areasToWin: 99,
    areaPath: [],
    currentArea: { id: 'okunomori', nameEn: 'Okunomori' },
    areaCleared: false,
    areaSelectionRequired: false,
    player: { credits: 0 },
    partySkills: [{ id: 'hpMaster', level: 2 }],
    creatureParty,
  };
  const serverGm = {
    run: structuredClone(baseRun),
    narrate() {},
    emitState() {},
  };
  const clientState = {
    phase: 'room',
    room: structuredClone(rooms[0]),
    run: {
      ...structuredClone(baseRun),
      exploreRunway: {
        preparedRooms: [
          { index: 0, room: structuredClone(rooms[0]) },
          { index: 1, room: structuredClone(rooms[1]) },
        ],
      },
    },
  };

  new ExplorationService(serverGm).proceedToNextRoom();
  const clientDraft = applyOptimisticRoomAdvance(clientState);

  assert.deepEqual(
    clientDraft.run.creatureParty,
    serverGm.run.creatureParty,
  );
  assert.equal(clientDraft.run.creatureParty.active[0].hp, 60);
  assert.equal(clientDraft.run.creatureParty.active[1].hp, 0);
  assert.deepEqual(
    clientDraft.run.creatureParty.active[0].statStages,
    { atk: 0, def: 0, dex: 0 },
  );
  assert.deepEqual(
    clientDraft.run.creatureParty.active[0].activeEffects,
    [],
  );
});
```

Add `createRoom` and `ExplorationService` imports to that test.

- [ ] **Step 2: Run and confirm red**

```bash
node --test tests/unit/game/room-entry-party.test.js tests/unit/ui/room-reveal-buffer-client.test.js tests/unit/game/exploration-service-room-heal.test.js tests/unit/combat/resolution.test.js tests/unit/game/skill-master-service.test.js
```

Expected: new module is missing; current optimistic advance leaves HP/stages/effects unchanged.

- [ ] **Step 3: Implement the shared recovery function**

```js
import {
  getPostCombatRecoveryMultiplier,
  syncPartySkillHpBonuses,
} from './party-skills.js';
import { applyHeal, resetStatStages } from './combat/effects.js';

export const ROOM_ENTRY_HEAL_PERCENT = 0.05;

export function applyRoomEntryPartyRecovery(run) {
  const party = run?.creatureParty;
  if (!party) return null;
  syncPartySkillHpBonuses(party, run.partySkills || []);
  const multiplier = getPostCombatRecoveryMultiplier(run.partySkills || []);
  const creatures = [...(party.active || []), ...(party.reserves || [])].filter(Boolean);

  for (const creature of creatures) {
    if (
      typeof creature.hp === 'number'
      && creature.hp > 0
      && typeof creature.maxHp === 'number'
    ) {
      applyHeal(
        creature,
        Math.floor(creature.maxHp * ROOM_ENTRY_HEAL_PERCENT * multiplier),
      );
    }
    resetStatStages(creature);
    creature.activeEffects = [];
  }
  return party;
}
```

Replace both server heal/clear pairs with `applyRoomEntryPartyRecovery(this.gm.run)` and remove the duplicate private methods. In `advanceStateToBufferedNextRoom()`, install the next room, apply recovery, then derive phase.

- [ ] **Step 4: Re-run and commit**

```bash
node --test tests/unit/game/room-entry-party.test.js tests/unit/ui/room-reveal-buffer-client.test.js tests/unit/game/exploration-service-room-heal.test.js tests/unit/combat/resolution.test.js tests/unit/game/skill-master-service.test.js
node --check src/game/room-entry-party.js
node --check public/js/ui/room-reveal-buffer.js
/usr/bin/git add src/game/room-entry-party.js src/game/services/exploration-service.js public/js/ui/room-reveal-buffer.js tests/unit/game/room-entry-party.test.js tests/unit/ui/room-reveal-buffer-client.test.js tests/unit/game/exploration-service-room-heal.test.js tests/unit/combat/resolution.test.js tests/unit/game/skill-master-service.test.js
/usr/bin/git commit -m "fix: mirror explore room entry recovery"
```

---

### Task 6: Mirror party-skill choices and source combat allies from current run state

**Files:**
- Modify: `public/js/ui/exploration.js:308-320,2143-2190,2690-2715`
- Modify: `src/shared/combat/local-combat-start.js`
- Modify: `public/game.js:1644-1665`
- Test: `tests/unit/ui/exploration-skill-master.test.js`
- Test: `tests/unit/game/explore-session-sync-combat.test.js`
- Test: `tests/unit/game/explore-support-room-batch-parity.test.js`
- Test: `tests/unit/ui/start-encounter-session-first.test.js`

**Interfaces:**
- Produces: one-shot `mutateDraft` option on `updateSupportRoomDraft()`.
- Extends: `buildLocalCombatFromStart(combatStart, seedChain, { allies, fallbackAllies })`, preferring explicit `allies` while preserving old callers.

- [ ] **Step 1: Add failing optimistic Skill Master and NPC reward tests**

Use distinct `state.room`, `run.rooms[currentRoom]`, and runway-room objects so accidental triple application is visible:

```js
it('optimistically applies one HP Master level before marking Skill Master complete', async () => {
  const originalDocument = globalThis.document;
  const actionArea = createElementStub();
  const room = {
    id: 'skill-parity-room',
    type: 'skillMaster',
    interacted: false,
    skillMaster: { completed: false, chosenId: null },
  };
  let state = {
    phase: 'skillMaster',
    meta: { tutorialStep: 1 },
    room,
    run: {
      active: true,
      mode: 'standard',
      stats: { startTime: 901 },
      currentRoom: 0,
      roomActionSeq: 0,
      initialSkillPick: { chosenId: 'arcStrike' },
      partySkills: [],
      creatureParty: {
        active: [{ id: 'hi', hp: 80, maxHp: 100 }],
        reserves: [],
      },
      rooms: [structuredClone(room)],
      exploreRunway: {
        sessionEpoch: 'ese_skillparity111',
        currentRoom: 0,
        roomActionSeq: 0,
        preparedRooms: [{
          index: 0,
          roomId: room.id,
          actionSeq: 0,
          room: structuredClone(room),
          acceptedActions: ['skillMaster.choose', 'proceed'],
          actionEffects: {
            'skillMaster.choose': ['partySkills'],
            proceed: ['areaProgress'],
          },
          dependencies: ['partySkills'],
          offlineReady: true,
          interactionPayload: {
            offered: [{ id: 'hpMaster', level: 1, title: 'HP Master' }],
          },
        }],
      },
    },
  };
  globalThis.document = {
    getElementById: id => (id === 'action-area' ? actionArea : null),
    createElement: () => createElementStub(),
  };
  configureExploreSession({
    syncRequest: async () => ({ status: 'ok', results: [] }),
  });
  init({
    getGameState: () => state,
    updateGameState: next => { state = next; },
    updateUI: () => {},
    actions: {
      setContent: html => { actionArea.innerHTML = html; },
      clear: () => { actionArea.innerHTML = ''; },
    },
    scene: { showNarration: () => {} },
  });

  try {
    await renderSkillMaster();
    await renderedChoices.onSelect(0);
  } finally {
    globalThis.document = originalDocument;
    resetExploreSession();
  }

  assert.deepEqual(state.run.partySkills, [{ id: 'hpMaster', level: 1 }]);
  assert.equal(state.run.creatureParty.active[0].maxHp, 125);
  assert.equal(state.run.creatureParty.active[0].hp, 100);
});

it('optimistically applies one HP Master level for an NPC battle reward', async () => {
  const originalDocument = globalThis.document;
  const actionArea = createElementStub();
  const room = {
    id: 'npc-skill-parity-room',
    type: 'npcBattle',
    interacted: true,
    npcBattle: { skillSelectionPending: true },
  };
  let state = {
    phase: 'npc_skill_selection',
    room,
    run: {
      active: true,
      mode: 'standard',
      stats: { startTime: 902 },
      currentRoom: 0,
      roomActionSeq: 0,
      partySkills: [],
      creatureParty: {
        active: [{ id: 'hi', hp: 80, maxHp: 100 }],
        reserves: [],
      },
      rooms: [structuredClone(room)],
      exploreRunway: {
        sessionEpoch: 'ese_npcskillpar11',
        currentRoom: 0,
        roomActionSeq: 0,
        preparedRooms: [{
          index: 0,
          roomId: room.id,
          actionSeq: 0,
          room: structuredClone(room),
          acceptedActions: ['npcBattleSkill.choose'],
          actionEffects: { 'npcBattleSkill.choose': ['partySkills'] },
          dependencies: ['partySkills'],
          offlineReady: true,
        }],
      },
    },
  };
  globalThis.document = {
    getElementById: id => (id === 'action-area' ? actionArea : null),
    createElement: () => createElementStub(),
  };
  configureExploreSession({
    syncRequest: async () => ({ status: 'ok', results: [] }),
  });
  init({
    getGameState: () => state,
    updateGameState: next => { state = next; },
    updateUI: () => {},
    actions: {
      setContent: html => { actionArea.innerHTML = html; },
      clear: () => { actionArea.innerHTML = ''; },
    },
    scene: { showNarration: () => {} },
  });

  try {
    await renderNpcBattleSkillSelection({
      fetchOffers: async () => ({
        offered: [{ id: 'hpMaster', level: 1, title: 'HP Master' }],
      }),
    });
    await renderedChoices.onSelect(0);
  } finally {
    globalThis.document = originalDocument;
    resetExploreSession();
  }

  assert.deepEqual(state.run.partySkills, [{ id: 'hpMaster', level: 1 }]);
  assert.equal(state.run.creatureParty.active[0].maxHp, 125);
  assert.equal(state.run.creatureParty.active[0].hp, 100);
});
```

- [ ] **Step 2: Add the failing current-allies combat test**

```js
test('local combat prefers explicitly supplied current allies over stale payload allies', () => {
  const stale = [{ id: 'hi', hp: 10, maxHp: 100 }];
  const current = [{ id: 'hi', hp: 75, maxHp: 125 }];
  const combat = buildLocalCombatFromStart({
    enemies: [{ id: 'mizu', hp: 100, maxHp: 100 }],
    allies: stale,
    optimistic: { combatId: 'combat-current-party', stateVersion: 0, nextTurnSeed: 'seed-1' },
  }, ['seed-1'], { allies: current });

  assert.strictEqual(combat.allies, current);
  assert.equal(combat.allies[0].hp, 75);
});
```

In `start-encounter-session-first.test.js`, add the exact source assertion:

```js
const sessionStartSource = sourceBetween(
  gameSrc,
  'async function startCreatureEncounterFromSession(session)',
  'let encounterStarting = false',
);
assert.match(
  sessionStartSource,
  /buildLocalCombatFromStart\([\s\S]*\{\s*allies:\s*draft\.run\?\.creatureParty\?\.active\s*\|\|\s*\[\]\s*\}/,
);
```

Together with the pure strict-equality assertion above, this proves the production call preserves `draft.combat.allies === draft.run.creatureParty.active`.

- [ ] **Step 3: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/exploration-skill-master.test.js
node --test tests/unit/game/explore-session-sync-combat.test.js tests/unit/game/explore-support-room-batch-parity.test.js tests/unit/ui/start-encounter-session-first.test.js
```

Expected: party skills remain unchanged and local combat uses `combatStart.allies`.

- [ ] **Step 4: Implement one-shot draft mutation and explicit allies**

```js
function updateSupportRoomDraft(
  mutateRoom,
  { phase = 'room', advance = false, mutateDraft = null } = {},
) {
  const currentState = getGameState?.();
  if (!currentState) return null;
  const draft = cloneStateForExploreSession(currentState);
  if (typeof mutateDraft === 'function') mutateDraft(draft);
  activeRoomDrafts(draft).forEach(room => mutateRoom(room, draft));
  if (advance) {
    advanceStateToBufferedNextRoom(draft);
    alignExploreRunwayCursor(draft);
  } else if (phase) {
    draft.phase = phase;
  }
  updateGameState(draft);
  return draft;
}

function applyPartySkillChoiceToDraft(draft, skillId) {
  draft.run.partySkills = applyPartySkillChoice(draft.run.partySkills || [], skillId);
  syncPartySkillHpBonuses(draft.run.creatureParty, draft.run.partySkills);
}
```

Pass `mutateDraft: draft => applyPartySkillChoiceToDraft(draft, skillId)` from both skill selectors.

Preserve existing callers of `buildLocalCombatFromStart()`:

```js
export function buildLocalCombatFromStart(
  combatStart,
  seedChain,
  { allies = null, fallbackAllies = [] } = {},
) {
  const enemies = combatStart.enemies
    || (combatStart.enemy ? [combatStart.enemy] : []);
  const resolvedAllies = Array.isArray(allies)
    ? allies
    : (combatStart.allies || fallbackAllies);
  const combat = createCombatState(enemies[0] || null);
  combat.allies = resolvedAllies;
  combat.enemies = enemies;
  combat.actionCursor = createPveOpeningCursor({
    allies: resolvedAllies,
    enemies,
  });
  combat.actionCount = 0;
  combat.cycleCount = 0;
  combat.openingResolved = false;
  combat.isCreatureCombat = true;
  combat.isBoss = combatStart.isBoss === true;
  combat.swapPhase = true;
  for (const creature of [...combat.allies, ...combat.enemies]) {
    if (creature) resetStatStages(creature);
  }
  combat.optimistic = {
    combatId: combatStart.optimistic?.combatId ?? null,
    stateVersion: combatStart.optimistic?.stateVersion ?? 0,
    nextTurnSeed: combatStart.optimistic?.nextTurnSeed
      ?? (seedChain?.[0] || null),
    turnSeeds: Array.isArray(seedChain) ? [...seedChain] : [],
    acceptedActionIds: {},
  };
  if (combatStart.npc) {
    combat.npcId = combatStart.npc.id;
    combat.npcData = combatStart.npc;
  }
  return combat;
}
```

In `public/game.js`, pass `{ allies: draft.run?.creatureParty?.active || [] }`.

- [ ] **Step 5: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/exploration-skill-master.test.js
node --test tests/unit/game/explore-session-sync-combat.test.js tests/unit/game/explore-support-room-batch-parity.test.js tests/unit/ui/start-encounter-session-first.test.js
node --check public/js/ui/exploration.js
node --check src/shared/combat/local-combat-start.js
node --check public/game.js
/usr/bin/git add public/js/ui/exploration.js src/shared/combat/local-combat-start.js public/game.js tests/unit/ui/exploration-skill-master.test.js tests/unit/game/explore-session-sync-combat.test.js tests/unit/game/explore-support-room-batch-parity.test.js tests/unit/ui/start-encounter-session-first.test.js
/usr/bin/git commit -m "fix: mirror explore skill choices before combat"
```

---

### Task 7: Declare honest XP effects and split Whack resolution from room advance

**Files:**
- Modify: `src/game/services/explore-session-contract.js:21-42`
- Modify: `src/game/services/exploration-service.js:888-965`
- Modify: `src/routes/game/run.js:896-958`
- Modify: `public/js/ui/exploration.js:1790-1945,2730-2750`
- Test: `tests/unit/game/explore-session-contract.test.js`
- Test: `tests/unit/game/explore-session-sync-service.test.js`
- Test: `tests/unit/ui/exploration-whack-a-mole.test.js`
- Test: `tests/unit/game/whack-a-mole.test.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: `tests/unit/ui/explore-session.test.js`
- Test: `tests/unit/game/explore-support-room-batch-parity.test.js`

**Interfaces:**
- Produces: one `whackAMole.complete|skip` entry followed by a separate `proceed` entry.

- [ ] **Step 1: Change contract expectations first**

```js
assert.deepEqual(predictedEffectsForAction('whackAMole.complete'), [
  EXPLORE_EFFECTS.CREDITS,
  EXPLORE_EFFECTS.PARTY_STATS,
]);
assert.deepEqual(predictedEffectsForAction('wordDiscovery.complete'), [
  EXPLORE_EFFECTS.CREDITS,
  EXPLORE_EFFECTS.PARTY_STATS,
]);
assert.deepEqual(predictedEffectsForAction('whackAMole.skip'), []);
assert.equal(
  predictedEffectsForAction('proceed').includes(EXPLORE_EFFECTS.PARTY_STATS),
  false,
);
```

- [ ] **Step 2: Add separate-resolution/proceed red tests**

Client decline must produce:

```js
assert.deepEqual(
  getExploreSession().snapshot().map(entry => entry.kind),
  ['whackAMole.skip', 'proceed'],
);
assert.equal(state.run.currentRoom, 1);
```

Update `makeWhackAMoleState()` so its default current-room actions are `['whackAMole.complete', 'whackAMole.skip', 'proceed']`, with `proceed` effects present. Change the existing decline test to the two-entry expectation above and retain its interacted/completed/skipped assertions.

Replace the server's implicit-advance test with a real performer table:

```js
for (const testCase of [
  {
    kind: 'whackAMole.complete',
    payload: { score: 4 },
    actionId: 'run_es_wamcomplete1',
    proceedActionId: 'run_es_wamc_go',
  },
  {
    kind: 'whackAMole.skip',
    payload: {},
    actionId: 'run_es_wamskip0001',
    proceedActionId: 'run_es_wams_go',
  },
]) {
  const gm = makeGm([ROOM_TYPES.whackAMole, ROOM_TYPES.friendlyNpc]);
  gm.run.roomActionSeq = 5;
  gm.run.rooms[0].whackAMole = { score: 0, completed: false };
  const room = gm.run.rooms[0];
  const service = new ExploreSessionSyncService(gm);
  const completion = makeEntry(gm, {
    seq: 1,
    actionId: testCase.actionId,
    kind: testCase.kind,
    roomIndex: 0,
    roomId: room.id,
    actionSeq: 5,
    payload: testCase.payload,
  });

  const resolved = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [completion],
  });

  assert.equal(resolved.status, 'ok');
  assert.equal(resolved.confirmedThroughSeq, 1);
  assert.equal(room.interacted, true);
  assert.equal(gm.run.currentRoom, 0);
  assert.equal(gm.run.roomActionSeq, 5);

  const proceeded = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [makeEntry(gm, {
      seq: 2,
      actionId: testCase.proceedActionId,
      kind: 'proceed',
      roomIndex: 0,
      roomId: room.id,
      actionSeq: 5,
      payload: {},
    })],
  });

  assert.equal(proceeded.status, 'ok');
  assert.equal(proceeded.confirmedThroughSeq, 2);
  assert.equal(gm.run.currentRoom, 1);
  assert.equal(gm.run.roomActionSeq, 6);
}
```

Add this client dependency test to `explore-session.test.js`:

```js
function whackThenCombatRunway({ completed = false } = {}) {
  return makeRunway({
    sessionEpoch: 'ese_4444444444444444',
    currentRoom: 0,
    roomActionSeq: 5,
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 5,
        type: 'whackAMole',
        room: {
          id: 'room-0',
          type: 'whackAMole',
          interacted: completed,
          whackAMole: { completed },
        },
        acceptedActions: completed
          ? ['proceed']
          : ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
        actionEffects: {
          'whackAMole.complete': ['credits', 'partyStats'],
          'whackAMole.skip': [],
          proceed: ['ingredients', 'areaProgress'],
        },
      }),
      preparedRoom(1, {
        actionSeq: 6,
        type: 'encounter',
        dependencies: ['partyStats'],
        acceptedActions: ['encounter.start', 'combat.cycle'],
        actionEffects: {
          'encounter.start': [],
          'combat.cycle': ['partyStats'],
        },
        interactionPayload: {
          combatStart: { optimistic: { nextTurnSeed: 'seed-a' } },
          seedChain: ['seed-a', 'seed-b'],
        },
        offlineReady: true,
      }),
    ],
  });
}

test('XP completion checkpoints before proceed into combat', async () => {
  const scheduler = makeManualScheduler();
  const session = createExploreSession({
    syncRequest: async ({ entries }) => okResponse(entries.at(-1).seq, {
      exploreRunway: whackThenCombatRunway({ completed: true }),
    }),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(whackThenCombatRunway());

  const complete = session.recordRoomAction('whackAMole.complete', { score: 4 });
  const blockedProceed = session.recordRoomAction('proceed');

  assert.equal(complete.accepted, true);
  assert.deepEqual(blockedProceed, {
    accepted: false,
    reason: 'dependency',
    pendingCount: 1,
  });
  assert.equal(session.isPaused(), true);

  await scheduler.fire();

  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), false);
});
```

The cross-layer test below proves that the authoritative response party, rather than the stale prepared ally snapshot, is the one hashed.

- [ ] **Step 3: Add the server-only XP checkpoint-to-combat hash regression**

In `explore-support-room-batch-parity.test.js`, make these exact edits to the existing fixture:

```js
function makeGm({
  allyLevel = 3,
  enemyHp = 200,
  supportRoomType = ROOM_TYPES.shrine,
} = {}) {
```

Within that helper's existing `run` object, replace only its `rooms` property with:

```js
rooms: [
  createRoom(supportRoomType, AREA_ID, 1, 3),
  createRoom(ROOM_TYPES.encounter, AREA_ID, 2, 3),
],
```

Immediately after the run object, initialize only the selected support shape:

```js
if (supportRoomType === ROOM_TYPES.shrine) {
  run.rooms[0].shrine = {
    offered: true,
    used: false,
    completed: false,
    chosenReward: null,
    greeting: null,
  };
}
if (supportRoomType === ROOM_TYPES.wordDiscovery) {
  run.rooms[0].wordDiscovery = { completed: false };
}
if (supportRoomType === ROOM_TYPES.whackAMole) {
  run.rooms[0].whackAMole = { completed: false, score: 0 };
}
```

Replace only the existing `gm.getState()` body with:

```js
getState() {
  return structuredClone({
    phase: this.combat?.active ? 'combat' : 'room',
    run: this.run,
    combat: this.combat,
    room: this.run.rooms[this.run.currentRoom] || null,
  });
},
```

After the `gm` object is created, set `run.player = gm.player`; both XP-room completion methods award credits through `run.player`. Do not duplicate the helper or remove its existing combat-service wiring and deterministic enemy roll. Add:

```js
for (const testCase of [
  {
    roomType: ROOM_TYPES.wordDiscovery,
    kind: 'wordDiscovery.complete',
    payload: {},
    actionId: 'run_es_xp_word_done',
    proceedActionId: 'run_es_xp_word_go',
    startActionId: 'run_es_xp_word_start',
  },
  {
    roomType: ROOM_TYPES.whackAMole,
    kind: 'whackAMole.complete',
    payload: { score: 4 },
    actionId: 'run_es_xp_whack_done',
    proceedActionId: 'run_es_xp_whack_go',
    startActionId: 'run_es_xp_whack_start',
  },
]) {
  const gm = makeGm({ supportRoomType: testCase.roomType, allyLevel: 3 });
  const service = new ExploreSessionSyncService(gm);
  const supportRoom = gm.run.rooms[0];
  const combatRoom = gm.run.rooms[1];
  const prepared = gm.combatCycleService.prepareCombatStart(combatRoom);
  const staleCombatStart = {
    enemy: structuredClone(prepared.enemies[0]),
    enemies: structuredClone(prepared.enemies),
    allies: structuredClone(gm.run.creatureParty.active),
    optimistic: {
      combatId: prepared.combatId,
      stateVersion: 0,
      nextTurnSeed: prepared.turnSeeds[0],
    },
  };
  const xpBefore = gm.run.creatureParty.active[0].xp;

  const checkpoint = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [{
      seq: 1,
      actionId: testCase.actionId,
      kind: testCase.kind,
      roomIndex: 0,
      roomId: supportRoom.id,
      actionSeq: 0,
      payload: testCase.payload,
    }],
  });

  assert.ok(checkpoint.state.run.creatureParty.active[0].xp > xpBefore);
  assert.equal(gm.run.currentRoom, 0);
  const clientState = structuredClone(checkpoint.state);
  applyRoomEntryPartyRecovery(clientState.run);

  await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [{
      seq: 2,
      actionId: testCase.proceedActionId,
      kind: 'proceed',
      roomIndex: 0,
      roomId: supportRoom.id,
      actionSeq: 0,
      payload: {},
    }],
  });
  await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries: [{
      seq: 3,
      actionId: testCase.startActionId,
      kind: 'encounter.start',
      roomIndex: 1,
      roomId: combatRoom.id,
      actionSeq: 1,
      payload: {},
    }],
  });

  const clientCombat = buildLocalCombatFromStart(
    staleCombatStart,
    prepared.turnSeeds,
    { allies: clientState.run.creatureParty.active },
  );
  const seed = gm.combat.optimistic.nextTurnSeed;
  const moveChoices = [{
    creatureIndex: 0,
    moveId: BIG_MOVE.id,
    targetIndex: 0,
  }];
  const clientTurn = resolvePveCursorTurn({
    combat: clientCombat,
    run: clientState.run,
    moveChoices,
  }, { actionType: 'attack', seed });
  const serverTurn = resolvePveCursorTurn({
    combat: gm.combat,
    run: gm.run,
    moveChoices,
  }, { actionType: 'attack', seed });

  assert.equal(
    hashTranscript(clientTurn.transcript),
    hashTranscript(serverTurn.transcript),
    `${testCase.kind} checkpoint party must hash-converge`,
  );
}
```

Import `applyRoomEntryPartyRecovery` in the test. This table is load-bearing: it proves both XP-producing room types, checkpoint state adoption, Task 5 room-entry recovery, and Task 6 current-party ally sourcing converge on the first combat turn.

- [ ] **Step 4: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/game/whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/explore-session.test.js tests/unit/game/explore-support-room-batch-parity.test.js
```

Expected: effects are incomplete; complete/skip advance canonically inside the first action; client logs only one action.

- [ ] **Step 5: Implement explicit advancement**

Change `applyWhackAMoleComplete()` to return only `completeWhackAMole(score)`. Change `skipWhackAMole()` to mark completed/skipped/interacted and return without proceeding. Both optimistic helpers use `advance: false`.

Pass the real proceed owner into the minigame:

```js
activeWhackAMoleGame = new WhackAMoleGame(pool, {
  actions,
  apiCompleteWhackAMole: completeWhackAMoleOptimistically,
  apiProceed: proceedWithRevealBuffer,
  updateGameState,
  updateUI,
  playSFX,
  isActive: () => getGameState()?.phase === 'whackAMole'
    && getCurrentWhackAMoleRoomId() === activeWhackAMoleRoomId,
});
```

The decline branch awaits `skipWhackAMoleOptimistically()` and then `proceedWithRevealBuffer()`. Retain interacted-room auto-proceed for reload recovery.

Preserve legacy skip semantics only in the compatibility route:

```js
const result = req.gameManager.skipWhackAMole();
const proceedResult = req.gameManager.explorationService.proceedToNextRoom();
return {
  ...result,
  ...proceedResult,
  state: req.getEnrichedGameState(),
};
```

- [ ] **Step 6: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/game/whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/explore-session.test.js tests/unit/game/explore-support-room-batch-parity.test.js
node --check src/game/services/explore-session-contract.js
node --check src/game/services/exploration-service.js
node --check public/js/ui/exploration.js
/usr/bin/git add src/game/services/explore-session-contract.js src/game/services/exploration-service.js src/routes/game/run.js public/js/ui/exploration.js tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/game/whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/explore-session.test.js tests/unit/game/explore-support-room-batch-parity.test.js
/usr/bin/git commit -m "fix: separate whack resolution from room advance"
```

---

### Task 8: Reject stale/error state GETs and adopt the initial-skill response runway

**Files:**
- Create: `public/js/ui/game-state-adoption.js`
- Modify: `public/game.js:842-922,1145-1156,748-765`
- Modify: `public/js/ui/exploration.js:2172-2190`
- Create: `tests/unit/ui/game-state-adoption.test.js`
- Modify: `tests/unit/ui/load-game-state-adopts-runway.test.js`
- Modify: `tests/unit/ui/exploration-skill-master.test.js`
- Modify: `tests/unit/api-network-hardening.test.js`

**Interfaces:**
- Consumes: Task 1 `getLocalRevision()`.
- Produces: pure state-response guards.

- [ ] **Step 1: Add pure stale/error guard tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureGameStateFetchToken,
  isGameStateErrorResponse,
  isGameStateFetchCurrent,
} from '../../../public/js/ui/game-state-adoption.js';

test('rejects HTTP error bodies but accepts explicit fresh-account state', () => {
  assert.equal(isGameStateErrorResponse({ error: 'HTTP 500' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'rate_limited' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'forbidden' }), true);
  assert.equal(isGameStateErrorResponse({
    player: null,
    run: null,
    meta: { prologueComplete: false },
    phase: 'no_save',
  }), false);
});

test('a local action or session replacement makes an in-flight GET stale', () => {
  let revision = 7;
  let pending = 0;
  const session = {
    getLocalRevision: () => revision,
    pendingCount: () => pending,
  };
  const token = captureGameStateFetchToken(session);
  revision = 8;
  pending = 1;
  assert.equal(isGameStateFetchCurrent(token, session), false);
  assert.equal(isGameStateFetchCurrent(token, { ...session }), false);
});
```

- [ ] **Step 2: Add initial-skill and epoch-discipline red tests**

In the existing “resets Cid from the scene before rendering the first room” test, import `getExploreSession` and add:

```js
const oldRunway = {
  sessionEpoch: 'ese_5555555555555555',
  currentRoom: 0,
  roomActionSeq: 0,
  preparedRooms: [{
    index: 0,
    roomId: 'old-room',
    actionSeq: 0,
    room: { id: 'old-room', type: 'friendlyNpc' },
    acceptedActions: ['friendlyNpc.choose'],
    offlineReady: true,
  }],
};
const responseRunway = {
  ...oldRunway,
  preparedRooms: [{
    index: 0,
    roomId: 'room-from-skill-choice-response',
    actionSeq: 0,
    room: { id: 'room-from-skill-choice-response', type: 'encounter' },
    acceptedActions: ['encounter.start', 'combat.cycle'],
    offlineReady: true,
  }],
};
const session = configureExploreSession({
  syncRequest: async () => ({ status: 'ok', results: [] }),
});
session.adoptRunway(oldRunway);
```

Make the test's `apiSkillMasterChoose` response carry `run.exploreRunway = responseRunway`. Change its `updateUI` callback to:

```js
updateUI: () => events.push([
  'updateUI',
  getExploreSession().currentPreparedRoom()?.roomId,
]),
```

The final expected event must be:

```js
['updateUI', 'room-from-skill-choice-response']
```

In `load-game-state-adopts-runway.test.js`, retain its current explicit in-session checks and add:

```js
const recoveryInitSource = sourceBetween(
  gameSrc,
  'refreshRunwayState:',
  'apiGetAreaOptions,',
);
assert.match(
  recoveryInitSource,
  /loadGameState\(\{\s*adoptSession:\s*true\s*\}\)/,
  'empty-log runway recovery is in-session and must preserve the epoch',
);

const combatLoopSrc = readFileSync(
  resolve(repoRoot, 'public/js/ui/combat-loop.js'),
  'utf8',
);
assert.doesNotMatch(
  combatLoopSrc,
  /apiGetGameState\(\s*\)/,
  'combat recovery must never issue a bare state GET',
);
```

Add a behavioral source-order regression that composes with the pure HTTP 500/429/error-envelope cases from Step 1:

```js
test('loadGameState preserves the current run for HTTP error envelopes', () => {
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus',
  );
  const errorGuardIndex = loadGameStateSource.indexOf(
    'isGameStateErrorResponse(data)',
  );
  const playerBranchIndex = loadGameStateSource.indexOf('if (data.player)');
  const noSaveIndex = loadGameStateSource.indexOf(
    "phase: data.phase || 'no_save'",
  );

  assert.ok(errorGuardIndex >= 0, 'loadGameState must reject error envelopes');
  assert.ok(playerBranchIndex >= 0 && noSaveIndex >= 0, 'state adoption branches exist');
  assert.ok(
    errorGuardIndex < playerBranchIndex && errorGuardIndex < noSaveIndex,
    'the HTTP error guard must return before player/no-save state adoption',
  );
});
```

Keep the three intentional bare `loadGameState()` boundaries explicit: boot, return-to-hub after `apiForfeitRun()`, and adventure-report return after `apiForfeitRun()`. Every source slice that still has an active run—victory, post-combat shop, empty-log runway recovery, and null combat POST recovery—must assert `{ adoptSession: true }`.

- [ ] **Step 3: Run and confirm red**

```bash
node --test tests/unit/ui/game-state-adoption.test.js tests/unit/ui/load-game-state-adopts-runway.test.js tests/unit/api-network-hardening.test.js
node --experimental-test-module-mocks --test tests/unit/ui/exploration-skill-master.test.js
```

Expected: helper module missing; `{error}` reaches the no-save branch; initial selection retains old runway.

- [ ] **Step 4: Implement pure guards and fetch-token checks**

```js
export function captureGameStateFetchToken(session) {
  return {
    session: session || null,
    revision: session?.getLocalRevision?.() ?? null,
  };
}

export function isGameStateFetchCurrent(token, currentSession) {
  if (!token?.session) return currentSession == null;
  return currentSession === token.session
    && (currentSession.pendingCount?.() ?? 0) === 0
    && (currentSession.getLocalRevision?.() ?? null) === token.revision;
}

export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}
```

Implement the fetch wrapper in this exact order:

```js
async function apiGetGameStateAfterExploreDrain(
  reason,
  { adoptSession = false } = {},
) {
  await drainExploreSessionBeforeStateFetch(reason);
  const session = getExploreSession?.();
  if (session && (session.pendingCount?.() ?? 0) > 0) return null;

  const token = captureGameStateFetchToken(session);
  const data = await apiGetGameState({ adoptSession });
  if (!isGameStateFetchCurrent(token, getExploreSession?.())) return null;
  return data;
}
```

In `loadGameState()`, before `if (data.player)`:

```js
if (data === null) return gameState;
if (isGameStateErrorResponse(data)) {
  scene.showToast?.('Connection is slow. Retrying...', 3000);
  return null;
}
```

In creature-selection cancellation, require `state && !isGameStateErrorResponse(state)` before `updateGameState(state)`. In the post-combat-shop callback, remove its redundant `updateGameState(state)` because `loadGameState()` already validates and adopts the response; keep only `if (state) updateUI()`.

In `chooseInitialSkillMasterSkill()`, after `updateGameState(nextState)` and before scene reset/UI:

```js
getExploreSession()?.adoptRunway(nextState.run?.exploreRunway || null);
```

- [ ] **Step 5: Re-run and commit**

```bash
node --test tests/unit/ui/game-state-adoption.test.js tests/unit/ui/load-game-state-adopts-runway.test.js tests/unit/api-network-hardening.test.js
node --experimental-test-module-mocks --test tests/unit/ui/exploration-skill-master.test.js
node --check public/js/ui/game-state-adoption.js
node --check public/game.js
/usr/bin/git add public/js/ui/game-state-adoption.js public/game.js public/js/ui/exploration.js tests/unit/ui/game-state-adoption.test.js tests/unit/ui/load-game-state-adopts-runway.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/api-network-hardening.test.js
/usr/bin/git commit -m "fix: reject stale explore state refreshes"
```

---

### Task 9: Resolve empty NPC rewards canonically and durably

**Files:**
- Create: `src/game/npc-battle-reward.js`
- Modify: `src/game/services/exploration-service.js:1108-1150`
- Modify: `src/game/services/npc-service.js:145-155`
- Modify: `src/routes/game/combat.js:712-724`
- Modify: `src/routes/game/run.js:480-518`
- Modify: `src/game/services/explore-runway-service.js`
- Modify: `public/js/ui/exploration.js:2535-2655`
- Create: `tests/unit/game/npc-battle-reward.test.js`
- Modify: `tests/unit/game/exploration-service-npc-battle-reward-guard.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`
- Modify: `tests/unit/game/explore-runway-combat.test.js`
- Modify: `tests/unit/ui/exploration-skill-master.test.js`

**Interfaces:**
- Produces: durable `room.npcBattle.rewardResolved` with old-save inference.
- Produces: `armNpcBattleReward(room)` as the only way the combat and dialogue paths open a reward.
- Produces: `ExplorationService.ensureNpcBattleSkillOffers(room)` returning `{ offered, rewardResolved }`.

- [ ] **Step 1: Add durable-resolution unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armNpcBattleReward,
  isNpcBattleRewardResolved,
  markNpcBattleRewardResolved,
} from '../../../src/game/npc-battle-reward.js';

test('recognizes explicit and inferred old-save NPC reward resolution', () => {
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { rewardResolved: true },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { chosenSkillId: 'arcStrike' },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { skillSelectionPending: false },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { skillSelectionPending: true },
  }), false);
});

test('arming an NPC battle reward explicitly reopens resolution', () => {
  const room = {
    type: 'npcBattle',
    interacted: true,
    npcBattle: { rewardResolved: true, skillSelectionPending: false },
  };
  armNpcBattleReward(room);
  assert.equal(room.npcBattle.skillSelectionPending, true);
  assert.equal(room.npcBattle.rewardResolved, false);
});

test('marking an NPC battle reward persists the chosen skill and closes it', () => {
  const room = {
    type: 'npcBattle',
    interacted: false,
    npcBattle: { rewardResolved: false, skillSelectionPending: true },
  };
  markNpcBattleRewardResolved(room, { chosenSkillId: 'hpMaster' });
  assert.equal(room.interacted, true);
  assert.equal(room.npcBattle.skillSelectionPending, false);
  assert.equal(room.npcBattle.rewardResolved, true);
  assert.equal(room.npcBattle.chosenSkillId, 'hpMaster');
});
```

In `optimistic-run-routes.test.js`, import `PARTY_SKILL_TREE_IDS` and add:

```js
it('canonically resolves zero eligible NPC rewards across a lost response', async () => {
  const offersHandler = getHandler(
    createRunRouter(),
    'post',
    '/npc-battle-skill-offers',
  );
  const room = {
    id: 'npc-maxed',
    type: 'npcBattle',
    interacted: true,
    npcBattle: { skillSelectionPending: true, offered: null },
  };
  const run = {
    active: true,
    mode: 'standard',
    currentRoom: 0,
    roomActionSeq: 4,
    partySkills: PARTY_SKILL_TREE_IDS.map(id => ({ id, level: 5 })),
  };
  const gm = attachExplorationService({ run }, room);
  gm.explorationService.buildExploreRunway = async () => {
    const runway = {
      sessionEpoch: 'ese_6666666666666666',
      currentRoom: 0,
      roomActionSeq: 4,
      preparedRooms: [],
    };
    run.exploreRunway = runway;
    return runway;
  };
  let saveCalls = 0;
  const req = {
    body: {},
    user: { id: 'test-user' },
    gameManager: gm,
    saveGame: async () => { saveCalls += 1; },
    getEnrichedGameState: () => ({
      phase: room.npcBattle.skillSelectionPending
        ? 'npc_skill_selection'
        : 'room',
      room: structuredClone(room),
      run: {
        currentRoom: run.currentRoom,
        partySkills: structuredClone(run.partySkills),
        exploreRunway: structuredClone(run.exploreRunway),
      },
    }),
  };

  const first = makeRes();
  await offersHandler(req, first);
  const retry = makeRes();
  await offersHandler(req, retry);

  for (const response of [first, retry]) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.offered, []);
    assert.equal(response.body.rewardResolved, true);
    assert.equal(response.body.state.room.npcBattle.rewardResolved, true);
  }
  assert.equal(room.npcBattle.skillSelectionPending, false);
  assert.equal(room.npcBattle.rewardResolved, true);
  assert.ok(saveCalls >= 1);
});
```

- [ ] **Step 2: Add runway and client order red tests**

In `explore-runway-combat.test.js`:

```js
const gm = makeGm([ROOM_TYPES.npcBattle, ROOM_TYPES.friendlyNpc], {
  currentRoom: 0,
});
gm.explorationService = new ExplorationService(gm);
const opts = {
  userId: 'runway-combat-user',
  getKnownWords: () => [],
  getDialogueCardAudio: async () => null,
};
const room = gm.run.rooms[0];
room.interacted = true;
room.npcBattle ||= {};
room.npcBattle.skillSelectionPending = true;
room.npcBattle.offered = [{ id: 'hpMaster', level: 1 }];
let runway = await buildExploreRunway(gm, opts);
let entry = runway.preparedRooms.find(item => item.index === 0);
assert.deepEqual(entry.acceptedActions, ['npcBattleSkill.choose']);
assert.equal(entry.offlineReady, true);

markNpcBattleRewardResolved(room);
runway = await buildExploreRunway(gm, opts);
entry = runway.preparedRooms.find(item => item.index === 0);
assert.deepEqual(entry.acceptedActions, ['proceed']);
assert.equal(entry.offlineReady, true);
assert.equal(room.preparedCombat, undefined);
```

Import `ExplorationService` and `markNpcBattleRewardResolved`.

Replace the current client zero-offer test's local clear with a canonical response and ordered event assertions:

```js
function makeNpcRewardState({ currentRoom, rewardResolved }) {
  const room = {
    id: `npc-room-${currentRoom}`,
    type: 'npcBattle',
    interacted: true,
    npcBattle: {
      skillSelectionPending: !rewardResolved,
      rewardResolved,
    },
  };
  const next = {
    id: `room-${currentRoom + 1}`,
    type: 'friendlyNpc',
    interacted: false,
  };
  const rooms = [];
  rooms[currentRoom] = room;
  rooms[currentRoom + 1] = next;
  const runway = {
    sessionEpoch: 'ese_7777777777777777',
    currentRoom,
    roomActionSeq: 10,
    preparedRooms: [
      {
        index: currentRoom,
        roomId: room.id,
        actionSeq: 10,
        room: structuredClone(room),
        acceptedActions: rewardResolved
          ? ['proceed']
          : ['npcBattleSkill.choose'],
        actionEffects: rewardResolved
          ? { proceed: ['ingredients', 'areaProgress'] }
          : { 'npcBattleSkill.choose': ['partySkills'] },
        dependencies: ['partyStats'],
        offlineReady: true,
      },
      {
        index: currentRoom + 1,
        roomId: next.id,
        actionSeq: 11,
        room: structuredClone(next),
        acceptedActions: ['friendlyNpc.choose', 'proceed'],
        actionEffects: {
          'friendlyNpc.choose': ['partyStats'],
          proceed: ['ingredients', 'areaProgress'],
        },
        dependencies: [],
        offlineReady: true,
      },
    ],
  };
  return {
    phase: rewardResolved ? 'room' : 'npc_skill_selection',
    room,
    run: {
      active: true,
      mode: 'standard',
      currentRoom,
      roomActionSeq: 10,
      rooms,
      creatureParty: { active: [], reserves: [] },
      partySkills: [],
      exploreRunway: runway,
    },
  };
}

const canonicalResolvedState = makeNpcRewardState({
  currentRoom: 5,
  rewardResolved: true,
});
const events = [];
let currentState = makeNpcRewardState({
  currentRoom: 5,
  rewardResolved: false,
});
const session = configureExploreSession({
  syncRequest: async () => ({ status: 'ok', results: [] }),
});
const originalAdopt = session.adoptRunway;
session.adoptRunway = runway => {
  if (runway === canonicalResolvedState.run.exploreRunway) {
    events.push('adopt-canonical-runway');
  }
  return originalAdopt(runway);
};

init({
  getGameState: () => currentState,
  updateGameState: next => {
    if (next === canonicalResolvedState) events.push('update-canonical-state');
    if (next?.run?.currentRoom === 6) events.push('proceed');
    currentState = next;
  },
  updateUI: () => {},
  actions: { setContent: () => {}, clear: () => {} },
  scene: { showNarration: () => {} },
});

await renderNpcBattleSkillSelection({
  fetchOffers: async () => ({
    offered: [],
    rewardResolved: true,
    state: canonicalResolvedState,
  }),
});

assert.deepEqual(events.slice(0, 3), [
  'update-canonical-state',
  'adopt-canonical-runway',
  'proceed',
]);
assert.equal(currentState.run.currentRoom, 6);
```

No `updateGameState` call may set `skillSelectionPending = false` before the exact canonical state object is adopted.

- [ ] **Step 3: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/npc-battle-reward.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/game/explore-runway-combat.test.js tests/unit/ui/exploration-skill-master.test.js
```

Expected: module missing; retry returns 400; client local draft clears a guard the server still holds.

- [ ] **Step 4: Implement durable markers and one server offer owner**

```js
export function isNpcBattleRewardResolved(room) {
  const reward = room?.npcBattle;
  return reward?.rewardResolved === true
    || Boolean(reward?.chosenSkillId)
    || (
      room?.interacted === true
      && reward?.skillSelectionPending === false
    );
}

export function armNpcBattleReward(room) {
  room.npcBattle ||= {};
  room.npcBattle.skillSelectionPending = true;
  room.npcBattle.rewardResolved = false;
  return room.npcBattle;
}

export function markNpcBattleRewardResolved(
  room,
  { chosenSkillId = null } = {},
) {
  room.npcBattle ||= {};
  room.npcBattle.skillSelectionPending = false;
  room.npcBattle.rewardResolved = true;
  if (chosenSkillId) room.npcBattle.chosenSkillId = chosenSkillId;
  room.interacted = true;
  return room.npcBattle;
}
```

Add the single owner to `ExplorationService`:

```js
ensureNpcBattleSkillOffers(room = this.getCurrentRoom()) {
  if (!room || room.type !== ROOM_TYPES.npcBattle) {
    throw new Error('Not in an NPC battle room');
  }
  if (isNpcBattleRewardResolved(room)) {
    return { offered: [], rewardResolved: true };
  }
  room.npcBattle ||= {};
  this.gm.run.partySkills = normalizePartySkills(
    this.gm.run?.partySkills || [],
  );
  if (!Array.isArray(room.npcBattle.offered)) {
    room.npcBattle.offered = rollSkillMasterOffers({
      ownedSkillIds: this.gm.run.partySkills,
      count: 3,
    }).map(({ id, level }) => ({ id, level }));
  }
  const offered = room.npcBattle.offered
    .map(offer => getPartySkillOfferDisplay(
      offer,
      this.gm.run.partySkills,
    ))
    .filter(Boolean);
  if (offered.length === 0) {
    markNpcBattleRewardResolved(room);
    return { offered: [], rewardResolved: true };
  }
  return { offered, rewardResolved: false };
}
```

The route and runway builder call this method. `applyNpcBattleSkillChoose()` calls `markNpcBattleRewardResolved(room, { chosenSkillId: canonicalSkillId })`. Replace the direct `skillSelectionPending = true` assignments in `src/routes/game/combat.js` and `src/game/services/npc-service.js` with `armNpcBattleReward(currentRoom)` so both entry paths also set `rewardResolved = false`. Remove the now-unused `normalizePartySkills`, `rollSkillMasterOffers`, and `getPartySkillOfferDisplay` imports from `src/routes/game/run.js`.

Before Tasks 10 and 13 generalize all lifecycle actions, make the current runway builder handle the NPC post-victory state directly:

```js
if (
  room.type === ROOM_TYPES.npcBattle
  && room.interacted
  && room.npcBattle?.skillSelectionPending === true
) {
  gm.explorationService?.ensureNpcBattleSkillOffers?.(room);
}
const npcPostVictory = room.type === ROOM_TYPES.npcBattle
  && room.interacted === true;
if (npcPostVictory) delete room.preparedCombat;
if (
  combatKindForRoom(room)
  && !npcPostVictory
  && !room.preparedCombat
  && gm?.combatCycleService?.prepareCombatStart
) {
  gm.combatCycleService.prepareCombatStart(room);
}
```

In the private accepted-action switch, a post-victory pending NPC returns only `['npcBattleSkill.choose']`, a resolved NPC returns `['proceed']`, and an unresolved post-victory NPC returns `[]`. `missingPayloadReasonsFor()` returns `[]` for every interacted NPC post-victory shell so reward selection/resolution is `offlineReady` without enemies/seeds. Task 10 moves these actions into the shared contract; Task 13 replaces the special-case preparation gate with the full not-started/active/resolved lifecycle.

The offers route no longer rejects solely because pending is false; it calls the idempotent owner first. After it gets `{ offered, rewardResolved }`, it rebuilds `gm.run.exploreRunway`, awaits `req.saveGame()`, then serializes `req.getEnrichedGameState()`. The client handles:

```js
if (resp?.state) {
  updateGameState(resp.state);
  getExploreSession()?.adoptRunway(resp.state.run?.exploreRunway || null);
}
if (resp?.rewardResolved === true) {
  await proceedWithRevealBuffer();
  updateUI();
  return;
}
```

Delete the local-only clearing branch.

- [ ] **Step 5: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/npc-battle-reward.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/game/explore-runway-combat.test.js tests/unit/ui/exploration-skill-master.test.js
node --check src/game/npc-battle-reward.js
node --check src/game/services/npc-service.js
node --check src/game/services/exploration-service.js
node --check src/game/services/explore-runway-service.js
node --check src/routes/game/combat.js
node --check src/routes/game/run.js
node --check public/js/ui/exploration.js
/usr/bin/git add src/game/npc-battle-reward.js src/game/services/exploration-service.js src/game/services/npc-service.js src/routes/game/combat.js src/routes/game/run.js src/game/services/explore-runway-service.js public/js/ui/exploration.js tests/unit/game/npc-battle-reward.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/game/explore-runway-combat.test.js tests/unit/ui/exploration-skill-master.test.js
/usr/bin/git commit -m "fix: resolve empty NPC rewards canonically"
```

---

### Task 10: Preflight batches and authorize canonical room actions

**Files:**
- Modify: `src/game/services/explore-session-contract.js:84-142`
- Modify: `src/game/services/explore-session-sync-service.js:98-300`
- Modify: `src/game/services/explore-runway-service.js:104-145`
- Modify: `src/game/services/exploration-service.js:400-425`
- Test: `tests/unit/game/explore-session-contract.test.js`
- Test: `tests/unit/game/explore-session-sync-service.test.js`
- Test: `tests/unit/game/exploration-service-npc-battle-reward-guard.test.js`
- Create: `tests/unit/game/exploration-service-combat-room-guard.test.js`

**Interfaces:**
- Consumes: Task 9 `isNpcBattleRewardResolved()`.
- Produces: `validateExploreSessionBatch(entries)`.
- Produces: `acceptedExploreActionsForRoom(room, { combat = null, isCurrentRoom = false, includeProjectedCombatCycle = false } = {})`.

- [ ] **Step 1: Add pure malformed-batch and lifecycle tests**

```js
const valid = (seq, actionId) => ({ seq, actionId });
assert.deepEqual(validateExploreSessionBatch(null), {
  ok: false,
  reason: 'invalid_explore_batch',
  rejectedSeq: null,
});
assert.deepEqual(validateExploreSessionBatch([]), {
  ok: false,
  reason: 'empty_explore_batch',
  rejectedSeq: null,
});
assert.deepEqual(validateExploreSessionBatch([
  valid(1, 'run_es_batch0001'),
  valid(2, 'run_es_batch0002'),
]), { ok: true });

for (const [entries, reason, rejectedSeq] of [
  [[valid(2, 'run_es_batch0011'), valid(1, 'run_es_batch0012')], 'non_contiguous_explore_seq', 1],
  [[valid(1, 'run_es_batch0021'), valid(1, 'run_es_batch0022')], 'non_contiguous_explore_seq', 1],
  [[valid(1, 'run_es_batch0031'), valid(3, 'run_es_batch0032')], 'non_contiguous_explore_seq', 3],
  [[valid(0, 'run_es_batch0041')], 'invalid_explore_seq', 0],
  [[valid(1, 'bad')], 'invalid_explore_action_id', 1],
  [[valid(1, 'run_es_batch0051'), valid(2, 'run_es_batch0051')], 'duplicate_explore_action_id', 2],
]) {
  assert.deepEqual(validateExploreSessionBatch(entries), { ok: false, reason, rejectedSeq });
}
```

Add exact lifecycle assertions:

```js
const boss = { id: 'boss-1', type: 'boss', interacted: false };
assert.deepEqual(acceptedExploreActionsForRoom(boss, {
  isCurrentRoom: true,
  includeProjectedCombatCycle: true,
}), ['boss.start', 'combat.cycle']);
assert.deepEqual(acceptedExploreActionsForRoom(boss, {
  isCurrentRoom: true,
}), ['boss.start']);
assert.deepEqual(acceptedExploreActionsForRoom(boss, {
  combat: { active: true },
  isCurrentRoom: true,
}), ['combat.cycle']);
boss.interacted = true;
assert.deepEqual(acceptedExploreActionsForRoom(boss, {
  isCurrentRoom: true,
}), ['proceed']);

const npc = {
  id: 'npc-1',
  type: 'npcBattle',
  interacted: true,
  npcBattle: { skillSelectionPending: true },
};
assert.deepEqual(acceptedExploreActionsForRoom(npc), ['npcBattleSkill.choose']);
npc.npcBattle.skillSelectionPending = false;
assert.deepEqual(acceptedExploreActionsForRoom(npc), ['proceed']);
npc.npcBattle = { chosenSkillId: 'hpMaster' };
assert.deepEqual(acceptedExploreActionsForRoom(npc), ['proceed']);
npc.npcBattle = { rewardResolved: false };
assert.deepEqual(acceptedExploreActionsForRoom(npc), []);

assert.deepEqual(acceptedExploreActionsForRoom({
  type: 'friendlyNpc',
  interacted: false,
}), ['friendlyNpc.choose', 'proceed']);
```

- [ ] **Step 2: Add service no-partial-mutation and boss-skip red tests**

Replace the current “invalid actionId after prior commits” test with:

```js
for (const testCase of [
  { name: 'reordered', seqs: [2, 1], ids: ['run_es_shape0001', 'run_es_shape0002'] },
  { name: 'duplicate seq', seqs: [1, 1], ids: ['run_es_shape0011', 'run_es_shape0012'] },
  { name: 'gapped', seqs: [1, 3], ids: ['run_es_shape0021', 'run_es_shape0022'] },
  { name: 'invalid second id', seqs: [1, 2], ids: ['run_es_shape0031', 'bad'] },
  { name: 'duplicate id', seqs: [1, 2], ids: ['run_es_shape0041', 'run_es_shape0041'] },
]) {
  const gm = makeGm([ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc]);
  const room = gm.run.rooms[0];
  const service = new ExploreSessionSyncService(gm);
  const entries = [
    makeEntry(gm, {
      seq: testCase.seqs[0],
      actionId: testCase.ids[0],
      kind: 'friendlyNpc.choose',
      roomIndex: 0,
      roomId: room.id,
      actionSeq: 0,
      payload: {
        itemId: TEST_EQUIPMENT.id,
        targetCreatureIndex: 0,
      },
    }),
    makeEntry(gm, {
      seq: testCase.seqs[1],
      actionId: testCase.ids[1],
      kind: 'proceed',
      roomIndex: 0,
      roomId: room.id,
      actionSeq: 0,
      payload: {},
    }),
  ];

  const result = await service.applySessionSync({
    sessionEpoch: LIVE_EPOCH,
    entries,
  });

  assert.equal(result.status, 'corrected', testCase.name);
  assert.equal(result.confirmedThroughSeq, null, testCase.name);
  assert.deepEqual(result.results, [], testCase.name);
  assert.equal(gm.run.currentRoom, 0, testCase.name);
  assert.equal(gm.run.roomActionSeq, 0, testCase.name);
  assert.equal(room.interacted, false, testCase.name);
  assert.equal(gm.run.runSummary.itemsCollected, 0, testCase.name);
  assert.deepEqual(gm.meta.actionLedger.order, [], testCase.name);
}
```

Add the forged boss case:

```js
const gm = makeGm([ROOM_TYPES.boss, ROOM_TYPES.friendlyNpc]);
gm.run.rooms[0].boss = { creatureId: 'mizu', defeated: false };
const result = await new ExploreSessionSyncService(gm).applySessionSync({
  sessionEpoch: LIVE_EPOCH,
  entries: [makeEntry(gm, {
    seq: 1,
    actionId: 'run_es_boss_skip',
    kind: 'proceed',
    roomIndex: 0,
    roomId: gm.run.rooms[0].id,
    actionSeq: 0,
  })],
});
assert.equal(result.status, 'corrected');
assert.equal(result.reason, 'explore_action_not_accepted:proceed');
assert.equal(gm.run.currentRoom, 0);
assert.equal(gm.run.areaCleared, false);
assert.equal(gm.run.gameVictoryPending, false);
```

- [ ] **Step 3: Add direct compatibility guards**

Create `exploration-service-combat-room-guard.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';

const AREA_ID = 'hajimari-no-hiroba';

function makeGuardGm(room, { combat = null } = {}) {
  return {
    combat,
    run: {
      active: true,
      mode: 'standard',
      currentRoom: 0,
      roomActionSeq: 4,
      roomsExplored: 1,
      totalEncounters: 1,
      stats: { roomsExplored: 3, areasCleared: 0 },
      runStats: { roomsCleared: 2 },
      areasCompleted: 0,
      areasToWin: 10,
      areaPath: [],
      currentArea: { id: AREA_ID, nameEn: 'Starting Meadow' },
      areaCleared: false,
      gameVictoryPending: false,
      areaSelectionRequired: false,
      player: { credits: 0 },
      creatureParty: { active: [], reserves: [] },
      partySkills: [],
      rooms: [room, createRoom(ROOM_TYPES.friendlyNpc, AREA_ID, 2, 2)],
    },
    narrate() {},
    emitState() {},
  };
}

for (const testCase of [
  {
    name: 'unfinished boss',
    room: Object.assign(createRoom(ROOM_TYPES.boss, AREA_ID, 1, 2), {
      interacted: false,
      boss: { creatureId: 'mizu', defeated: false },
    }),
    combat: null,
  },
  {
    name: 'unfinished NPC battle',
    room: Object.assign(createRoom(ROOM_TYPES.npcBattle, AREA_ID, 1, 2), {
      interacted: false,
      npcBattle: { skillSelectionPending: false },
    }),
    combat: null,
  },
  {
    name: 'active interacted encounter',
    room: Object.assign(createRoom(ROOM_TYPES.encounter, AREA_ID, 1, 2), {
      interacted: true,
    }),
    combat: { active: true },
  },
]) {
  const gm = makeGuardGm(testCase.room, { combat: testCase.combat });
  const before = structuredClone(gm.run);
  const service = new ExplorationService(gm);

  assert.throws(
    () => service.proceedToNextRoom(),
    /Must complete|Must claim|Must resolve/,
    testCase.name,
  );
  assert.deepEqual(gm.run, before, testCase.name);
}
```

Add the green resolved-NPC table:

```js
for (const npcBattle of [
  { rewardResolved: true },
  { chosenSkillId: 'hpMaster' },
  { skillSelectionPending: false },
]) {
  const room = Object.assign(
    createRoom(ROOM_TYPES.npcBattle, AREA_ID, 1, 2),
    { interacted: true, npcBattle },
  );
  const gm = makeGuardGm(room);
  const service = new ExplorationService(gm);

  service.proceedToNextRoom();

  assert.equal(gm.run.currentRoom, 1);
  assert.equal(gm.run.roomActionSeq, 5);
}
```

- [ ] **Step 4: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/game/exploration-service-combat-room-guard.test.js
```

Expected: malformed tails partially commit; forged boss proceed advances; direct boss/active-combat guards are absent.

- [ ] **Step 5: Implement preflight and canonical actions**

Implement batch validation exactly:

```js
export function validateExploreSessionBatch(entries) {
  if (!Array.isArray(entries)) {
    return { ok: false, reason: 'invalid_explore_batch', rejectedSeq: null };
  }
  if (entries.length === 0) {
    return { ok: false, reason: 'empty_explore_batch', rejectedSeq: null };
  }
  const actionIds = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!Number.isInteger(entry?.seq) || entry.seq <= 0) {
      return { ok: false, reason: 'invalid_explore_seq', rejectedSeq: entry?.seq ?? null };
    }
    if (index > 0 && entry.seq !== entries[index - 1].seq + 1) {
      return { ok: false, reason: 'non_contiguous_explore_seq', rejectedSeq: entry.seq };
    }
    if (!isExploreSessionActionId(entry?.actionId)) {
      return { ok: false, reason: 'invalid_explore_action_id', rejectedSeq: entry.seq };
    }
    if (actionIds.has(entry.actionId)) {
      return { ok: false, reason: 'duplicate_explore_action_id', rejectedSeq: entry.seq };
    }
    actionIds.add(entry.actionId);
  }
  return { ok: true };
}
```

Move the runway's support lists into the contract and implement the complete cross-layer function:

```js
const SUPPORT_ACTIONS = Object.freeze({
  friendlyNpc: ['friendlyNpc.choose', 'proceed'],
  shrine: ['shrine.choose', 'proceed'],
  skillMaster: ['skillMaster.choose', 'proceed'],
  whackAMole: ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
  campfire: ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'],
  speedReviewRoom: ['speedReview.commit', 'speedReview.complete', 'proceed'],
  wordDiscovery: ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'],
  dealer: ['dealer.sell', 'dealer.buy', 'dealer.leave', 'proceed'],
});

const COMBAT_START_ACTION = Object.freeze({
  encounter: 'encounter.start',
  npcBattle: 'npcBattle.start',
  boss: 'boss.start',
});

export function acceptedExploreActionsForRoom(
  room,
  {
    combat = null,
    isCurrentRoom = false,
    includeProjectedCombatCycle = false,
  } = {},
) {
  const support = SUPPORT_ACTIONS[room?.type];
  if (support) return [...support];

  const startAction = COMBAT_START_ACTION[room?.type];
  if (!startAction) return ['proceed'];
  if (isCurrentRoom && combat?.active) return ['combat.cycle'];

  if (room?.interacted) {
    if (room.type !== 'npcBattle') return ['proceed'];
    if (room.npcBattle?.skillSelectionPending === true) {
      return ['npcBattleSkill.choose'];
    }
    return isNpcBattleRewardResolved(room) ? ['proceed'] : [];
  }

  return includeProjectedCombatCycle
    ? [startAction, 'combat.cycle']
    : [startAction];
}
```

Run epoch validation first. Pass raw `entries` to preflight before creating `results` or entering the loop:

```js
const batch = validateExploreSessionBatch(entries);
if (!batch.ok) {
  return this.correction({
    reason: batch.reason,
    rejectedSeq: batch.rejectedSeq,
    mutateContext: false,
  });
}
const replayEntries = entries;
```

Task 12 renames `mutateContext: false` to `refreshRunway: false` when it removes snapshot/restore response construction. Change `validateEntryPosition()` to return `currentRoom`, then add:

```js
validateEntryAction(entry) {
  const currentRoom = this.validateEntryPosition(entry);
  const accepted = acceptedExploreActionsForRoom(currentRoom, {
    combat: this.gm?.combat,
    isCurrentRoom: true,
  });
  if (!accepted.includes(entry?.kind)) {
    throw new Error(`explore_action_not_accepted:${entry?.kind}`);
  }
  return currentRoom;
}
```

Call `validateEntryAction(entry)` only for fresh entries, after the ledger lookup/replay branch, because a lost-response retry may refer to a room already advanced by its original commit. Runway calls the same helper with `{ combat: gm.combat, isCurrentRoom: index === currentRoom, includeProjectedCombatCycle: true }`.

Add direct guard:

```js
const combatRoom = ['encounter', 'npcBattle', 'boss'].includes(currentRoom.type);
if (combatRoom && (this.gm.combat?.active || !currentRoom.interacted)) {
  throw new Error(`Must complete ${currentRoom.type} before proceeding`);
}
if (
  currentRoom.type === 'npcBattle'
  && currentRoom.npcBattle?.skillSelectionPending === true
) {
  throw new Error('Must claim NPC battle reward before proceeding');
}
if (
  currentRoom.type === 'npcBattle'
  && !isNpcBattleRewardResolved(currentRoom)
) {
  throw new Error('Must resolve NPC battle reward before proceeding');
}
```

- [ ] **Step 6: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/game/exploration-service-combat-room-guard.test.js
node --check src/game/services/explore-session-contract.js
node --check src/game/services/explore-session-sync-service.js
/usr/bin/git add src/game/services/explore-session-contract.js src/game/services/explore-session-sync-service.js src/game/services/explore-runway-service.js src/game/services/exploration-service.js tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/game/exploration-service-combat-room-guard.test.js
/usr/bin/git commit -m "fix: validate canonical explore actions"
```

---

### Task 11: Preserve committed corrections across ledger retries

**Files:**
- Modify: `src/game/services/explore-session-sync-service.js:231-297`
- Test: `tests/unit/game/explore-session-sync-combat.test.js:244-274`

**Interfaces:**
- Consumes: Task 10 preflight/action ordering.

- [ ] **Step 1: Extend the tampered-hash test with a lost-response retry and trailing entry**

```js
const replay = await service.applySessionSync({
  sessionEpoch: LIVE_EPOCH,
  entries: [tampered, {
    seq: 3,
    actionId: 'run_es_00000303',
    kind: 'proceed',
    roomIndex: 0,
    roomId: room.id,
    actionSeq: 0,
    payload: {},
  }],
});

assert.equal(replay.status, 'corrected');
assert.equal(replay.reason, 'transcript_mismatch');
assert.equal(replay.confirmedThroughSeq, 2);
assert.equal(replay.rejectedSeq, 2);
assert.deepEqual(replay.results, []);
assert.equal(gm.run.currentRoom, 0);
assert.equal(getActionLedgerEntry(gm.meta, 'run_es_00000303'), null);
```

- [ ] **Step 2: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-sync-combat.test.js
```

Expected: retry returns `ok`, exposes corrected action as an ordinary replay, and applies the trailing proceed.

- [ ] **Step 3: Store and replay correction semantics**

Store:

```js
response: {
  seq: entry.seq,
  corrected: true,
  correctionReason: error?.message || 'explore_entry_failed',
  entryFingerprint,
},
```

Before ordinary ledger replay:

```js
if (existing.response.corrected === true) {
  return this.correction({
    reason: existing.response.correctionReason || 'explore_entry_failed',
    rejectedSeq: entry.seq,
    confirmedThroughSeq: entry.seq,
    results,
  });
}
```

Do not append a replay result or continue the loop.

- [ ] **Step 4: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-sync-combat.test.js
/usr/bin/git add src/game/services/explore-session-sync-service.js tests/unit/game/explore-session-sync-combat.test.js
/usr/bin/git commit -m "fix: replay explore corrections as corrections"
```

---

### Task 12: Materialize Explore responses without stale rollback and repair legacy aliases

**Files:**
- Modify: `src/game/services/explore-session-sync-service.js:13-95,177-215`
- Modify: `src/routes/game/explore-session.js:5-63`
- Modify: `src/routes/game/optimistic-action-response.js:24-30`
- Test: `tests/unit/game/explore-session-sync-service.test.js`
- Test: `tests/unit/routes/explore-session-route.test.js`
- Test: `tests/unit/routes/optimistic-action-response.test.js`

**Interfaces:**
- Produces: `responseContext({ refreshRunway })` and `rebindGameManagerAliases(gameManager)`.

- [ ] **Step 1: Add stale-context, decoration-fallback, and alias red tests**

Replace the stale-epoch snapshot/restore expectation with:

```js
const active = gm.run.creatureParty.active;
gm.combat = { active: true, allies: active };
let buildCalls = 0;
let releaseBuild;
const buildGate = new Promise(resolve => { releaseBuild = resolve; });
gm.explorationService.buildExploreRunway = async () => {
  buildCalls += 1;
  await buildGate;
  return { sessionEpoch: LIVE_EPOCH, preparedRooms: [] };
};

const pending = service.applySessionSync({
  sessionEpoch: 'ese_2222222222222222',
  entries: [makeEntry(gm, { seq: 40 })],
});
await Promise.resolve();
gm.run.creatureParty.active[0].hp = 7;
gm.meta.concurrentMarker = 'landed';
releaseBuild?.();
const result = await pending;

assert.equal(result.status, 'corrected');
assert.equal(result.reason, 'session_epoch_mismatch');
assert.equal(buildCalls, 0);
assert.equal(gm.run.creatureParty.active[0].hp, 7);
assert.equal(gm.meta.concurrentMarker, 'landed');
assert.strictEqual(gm.combat.allies, gm.run.creatureParty.active);
```

The current implementation calls the builder once, then its `finally` restore erases the HP/marker changes and severs the alias.

Add:

```js
gm.run.exploreRunway = { sessionEpoch: LIVE_EPOCH, preparedRooms: [] };
gm.explorationService.buildExploreRunway = async () => {
  throw new Error('decoration unavailable');
};
const result = await service.ok();
assert.equal(result.status, 'ok');
assert.deepEqual(result.exploreRunway, gm.run.exploreRunway);
```

Add the retained legacy rollback regression:

```js
it('rebinds combat allies after legacy save rollback', async () => {
  const active = [{ id: 'hi', hp: 10 }];
  const req = {
    body: { actionId: actionId('aliasrollback') },
    gameManager: {
      run: { creatureParty: { active, reserves: [] } },
      combat: { active: true, allies: active },
      meta: { actionLedger: { entries: {}, order: [] } },
    },
    getEnrichedGameState: () => ({}),
    saveGame: async () => { throw new Error('disk unavailable'); },
  };
  const res = makeRes();
  const runOptimisticAction = createOptimisticActionRunner({
    owner: request => request.gameManager.meta,
  });

  await runOptimisticAction(req, res, {
    actionType: 'test.alias',
    perform: async () => {
      req.gameManager.combat.allies[0].hp = 1;
      return { ok: true };
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(req.gameManager.run.creatureParty.active[0].hp, 10);
  assert.strictEqual(
    req.gameManager.combat.allies,
    req.gameManager.run.creatureParty.active,
  );
  req.gameManager.combat.allies[0].hp = 6;
  assert.equal(req.gameManager.run.creatureParty.active[0].hp, 6);
});
```

- [ ] **Step 2: Add route save-error no-stale-restore test**

First update the existing stale route test: its stale epoch must return a correction while `buildOpts` remains `null`; regular `service.ok()` tests retain runway-option forwarding coverage.

Then add:

```js
it('does not roll back a committed Explore action when response save fails', async () => {
  const handler = getHandler(
    createExploreSessionRoutes(),
    'post',
    '/sync',
  );
  const active = [{ id: 'hi', hp: 10, maxHp: 10 }];
  const room = {
    id: 'route-friendly',
    type: 'friendlyNpc',
    interacted: false,
    friendlyNpc: { completed: false, offered: [] },
  };
  const run = {
    active: true,
    mode: 'standard',
    exploreSessionEpoch: 'ese_aaaaaaaaaaaaaaaa',
    exploreRunway: null,
    currentRoom: 0,
    roomActionSeq: 0,
    creatureParty: { active, reserves: [] },
    rooms: [room],
  };
  const gameManager = {
    run,
    combat: { active: false, allies: active },
    meta: { actionLedger: { entries: {}, order: [] } },
    explorationService: {
      applyFriendlyNpcChoose() {
        run.committedMarker = true;
        room.interacted = true;
        return { chosen: true };
      },
      async buildExploreRunway() {
        const runway = {
          sessionEpoch: run.exploreSessionEpoch,
          currentRoom: 0,
          roomActionSeq: 0,
          preparedRooms: [],
        };
        run.exploreRunway = runway;
        return runway;
      },
    },
    getState() {
      return {
        phase: 'room',
        run: {
          currentRoom: run.currentRoom,
          roomActionSeq: run.roomActionSeq,
          committedMarker: run.committedMarker === true,
          creatureParty: run.creatureParty,
          exploreRunway: run.exploreRunway,
        },
      };
    },
  };
  const req = {
    user: { id: 'route-user' },
    body: {
      sessionEpoch: run.exploreSessionEpoch,
      entries: [{
        seq: 1,
        actionId: 'run_es_route_commit',
        kind: 'friendlyNpc.choose',
        roomIndex: 0,
        roomId: room.id,
        actionSeq: 0,
        payload: { itemId: 'none', targetCreatureIndex: 0 },
      }],
    },
    gameManager,
    saveGame: async () => { throw new Error('disk unavailable'); },
    getEnrichedGameState: () => gameManager.getState(),
  };
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(req.gameManager.run.committedMarker, true);
  assert.equal(res.body.state.run.committedMarker, true);
  assert.strictEqual(
    req.gameManager.combat.allies,
    req.gameManager.run.creatureParty.active,
  );
});
```

- [ ] **Step 3: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-sync-service.test.js tests/unit/routes/explore-session-route.test.js tests/unit/routes/optimistic-action-response.test.js
```

- [ ] **Step 4: Remove Explore response snapshots and add fallback context**

Delete the sync service's private snapshot/restore functions. Implement:

```js
async responseContext({ refreshRunway = true } = {}) {
  let exploreRunway = this.gm?.run?.exploreRunway || null;
  if (refreshRunway) {
    try {
      const build = this.gm?.explorationService?.buildExploreRunway;
      if (typeof build === 'function') {
        const built = await build.call(this.gm.explorationService, this.runwayOpts);
        if (built) {
          exploreRunway = built;
          if (this.gm?.run) this.gm.run.exploreRunway = built;
        }
      }
    } catch {
      exploreRunway = this.gm?.run?.exploreRunway || exploreRunway;
    }
  }
  const state = typeof this.gm?.getState === 'function' ? this.gm.getState() : null;
  return {
    state,
    exploreRunway: state?.run?.exploreRunway
      || this.gm?.run?.exploreRunway
      || exploreRunway
      || null,
  };
}
```

Stale epoch and malformed-batch corrections pass `refreshRunway: false`. Remove the request-spanning snapshot/restore from `src/routes/game/explore-session.js`; unexpected/save errors return current enriched state/runway.

- [ ] **Step 5: Repair only the retained legacy rollback alias**

```js
export function rebindGameManagerAliases(gameManager) {
  if (!gameManager || typeof gameManager !== 'object') return null;
  if (gameManager.combat && gameManager.run?.creatureParty?.active) {
    gameManager.combat.allies = gameManager.run.creatureParty.active;
  }
  return gameManager;
}
```

Call it at the end of `restoreGameManager()`.

- [ ] **Step 6: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-session-sync-service.test.js tests/unit/routes/explore-session-route.test.js tests/unit/routes/optimistic-action-response.test.js
node --check src/game/services/explore-session-sync-service.js
node --check src/routes/game/explore-session.js
node --check src/routes/game/optimistic-action-response.js
/usr/bin/git add src/game/services/explore-session-sync-service.js src/routes/game/explore-session.js src/routes/game/optimistic-action-response.js tests/unit/game/explore-session-sync-service.test.js tests/unit/routes/explore-session-route.test.js tests/unit/routes/optimistic-action-response.test.js
/usr/bin/git commit -m "fix: avoid stale explore response rollback"
```

---

### Task 13: Serialize active combat in runway rebuilds without rerolling

**Files:**
- Modify: `src/game/services/explore-runway-service.js:487-670`
- Test: `tests/unit/game/explore-runway-combat.test.js`
- Test: `tests/unit/game/explore-session-sync-combat.test.js`
- Test: `tests/integration/flows/explore-session-sync.test.js`

**Interfaces:**
- Consumes: Task 10 canonical actions and Task 9 reward lifecycle.
- Produces: internal `combatLifecycleForRoom()`, prepared/live/resolved payload builders.

- [ ] **Step 1: Add active and resolved runway red tests**

Add one complete lifecycle test:

```js
const gm = makeGm([ROOM_TYPES.encounter], { currentRoom: 0 });
const opts = {
  userId: 'runway-combat-user',
  getKnownWords: () => [],
  getDialogueCardAudio: async () => null,
};
const preparedRunway = await buildExploreRunway(gm, opts);
const preparedEntry = preparedRunway.preparedRooms[0];
const preparedId = preparedEntry.interactionPayload.combatId;
gm.combatCycleService.startCreatureEncounter();
const liveId = gm.combat.optimistic.combatId;
const liveEnemies = structuredClone(gm.combat.enemies);
const liveSeeds = [...gm.combat.optimistic.turnSeeds];
const liveVersion = gm.combat.optimistic.stateVersion;
const refreshed = await buildExploreRunway(gm, opts);
const activeEntry = refreshed.preparedRooms[0];

assert.equal(gm.run.rooms[0].preparedCombat, undefined);
assert.deepEqual(activeEntry.acceptedActions, ['combat.cycle']);
assert.equal(liveId, preparedId);
assert.equal(activeEntry.interactionPayload.combatId, liveId);
assert.equal(activeEntry.interactionPayload.initialStateVersion, liveVersion);
assert.deepEqual(activeEntry.interactionPayload.combatStart.enemies, liveEnemies);
assert.deepEqual(activeEntry.interactionPayload.seedChain, liveSeeds);
assert.equal(activeEntry.offlineReady, true);

gm.combat.active = false;
gm.run.rooms[0].interacted = true;
const resolved = await buildExploreRunway(gm, opts);
const resolvedEntry = resolved.preparedRooms[0];
assert.equal(gm.run.rooms[0].preparedCombat, undefined);
assert.deepEqual(resolvedEntry.acceptedActions, ['proceed']);
assert.equal(resolvedEntry.interactionPayload.combatStart, null);
assert.equal(resolvedEntry.offlineReady, true);
```

Extend the Task 9 NPC runway test with the unresolved post-victory shape `{ interacted: true, npcBattle: { rewardResolved: false } }`; it must advertise `[]` and remain offline-ready. Retain pending `['npcBattleSkill.choose']` and resolved `['proceed']` assertions.

- [ ] **Step 2: Add ordinary `ok` sync and HTTP integration assertions**

In `explore-session-sync-combat.test.js`:

```js
const gm = makeCombatGm({
  roomType: ROOM_TYPES.encounter,
  enemyHp: 500,
  allyMove: WEAK_MOVE,
});
gm.run.rooms = [gm.run.rooms[0]];
gm.explorationService.buildExploreRunway = opts =>
  buildExploreRunway(gm, opts);
const service = new ExploreSessionSyncService(gm);
const start = startEntry(gm, {
  seq: 1,
  actionId: 'run_es_live_start',
  kind: 'encounter.start',
});

const first = await service.applySessionSync({
  sessionEpoch: LIVE_EPOCH,
  entries: [start],
});
const liveId = gm.combat.optimistic.combatId;
const liveEnemies = structuredClone(gm.combat.enemies);
const liveSeeds = [...gm.combat.optimistic.turnSeeds];
const activeEntry = first.exploreRunway.preparedRooms[0];

assert.equal(first.status, 'ok');
assert.equal(activeEntry.interactionPayload.combatId, liveId);
assert.deepEqual(activeEntry.interactionPayload.combatStart.enemies, liveEnemies);
assert.deepEqual(activeEntry.interactionPayload.seedChain, liveSeeds);
assert.deepEqual(activeEntry.acceptedActions, ['combat.cycle']);
assert.equal(gm.run.rooms[0].preparedCombat, undefined);

const replay = await service.applySessionSync({
  sessionEpoch: LIVE_EPOCH,
  entries: [start],
});
const replayEntry = replay.exploreRunway.preparedRooms[0];
assert.equal(replay.status, 'ok');
assert.equal(replay.results[0].replayed, true);
assert.equal(replayEntry.interactionPayload.combatId, liveId);
assert.deepEqual(replayEntry.interactionPayload.combatStart.enemies, liveEnemies);
assert.deepEqual(replayEntry.interactionPayload.seedChain, liveSeeds);
assert.deepEqual(replayEntry.acceptedActions, ['combat.cycle']);
assert.equal(gm.run.rooms[0].preparedCombat, undefined);
```

Import `buildExploreRunway`. In the HTTP integration start/replay test, add:

```js
const firstEntry = startRes.body.exploreRunway.preparedRooms.find(
  entry => entry.index === startRes.body.state.run.currentRoom,
);
const replayEntry = replayRes.body.exploreRunway.preparedRooms.find(
  entry => entry.index === replayRes.body.state.run.currentRoom,
);
assert.ok(firstEntry);
assert.ok(replayEntry);
assert.deepEqual(firstEntry.acceptedActions, ['combat.cycle']);
assert.deepEqual(replayEntry.acceptedActions, ['combat.cycle']);
assert.equal(
  replayEntry.interactionPayload.combatId,
  firstEntry.interactionPayload.combatId,
);
assert.deepEqual(
  replayEntry.interactionPayload.combatStart.enemies,
  firstEntry.interactionPayload.combatStart.enemies,
);
assert.deepEqual(
  replayEntry.interactionPayload.seedChain,
  firstEntry.interactionPayload.seedChain,
);
const firstRoom = startRes.body.state.run.rooms?.[
  startRes.body.state.run.currentRoom
];
const replayRoom = replayRes.body.state.run.rooms?.[
  replayRes.body.state.run.currentRoom
];
assert.equal(firstRoom?.preparedCombat, undefined);
assert.equal(replayRoom?.preparedCombat, undefined);
```

- [ ] **Step 3: Run and confirm red**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-runway-combat.test.js tests/unit/game/explore-session-sync-combat.test.js
node --test tests/integration/flows/explore-session-sync.test.js
```

Expected: ordinary response rebuild creates a second prepared fight with a different ID/seed chain.

- [ ] **Step 4: Implement lifecycle-aware payloads**

```js
function combatLifecycleForRoom(gm, room, { index, currentRoom }) {
  if (index === currentRoom && gm?.combat?.active) return 'active';
  if (room?.interacted) return 'resolved';
  return 'notStarted';
}
```

Add explicit payload builders:

```js
function buildActiveCombatPayload(gm, room) {
  const seeds = ensureTurnSeeds(gm.combat, {
    target: PVE_TURN_SEED_CHAIN_TARGET,
  });
  const optimistic = gm.combat.optimistic;
  return {
    kind: combatKindForRoom(room),
    lifecycle: 'active',
    combatStart: {
      enemy: cloneExploreValue(gm.combat.enemies?.[0] || null),
      enemies: cloneExploreValue(gm.combat.enemies || []),
      allies: cloneExploreValue(gm.run?.creatureParty?.active || []),
      playerGoesFirst: true,
      npc: cloneExploreValue(gm.combat.npcData || null),
      isBoss: gm.combat.isBoss === true,
      isNpcBattle: Boolean(gm.combat.npcId || gm.combat.npcData),
      tutorialBossIntro: null,
      optimistic: {
        combatId: optimistic.combatId,
        stateVersion: optimistic.stateVersion,
        nextTurnSeed: optimistic.nextTurnSeed,
      },
    },
    seedChain: cloneExploreValue(seeds),
    combatId: optimistic.combatId,
    initialStateVersion: optimistic.stateVersion,
  };
}

function buildResolvedCombatPayload(room) {
  return {
    kind: combatKindForRoom(room),
    lifecycle: 'resolved',
    combatStart: null,
    seedChain: [],
    combatId: null,
    initialStateVersion: 0,
  };
}
```

In the runway loop:

```js
const lifecycle = combatKindForRoom(room)
  ? combatLifecycleForRoom(gm, room, { index, currentRoom })
  : null;
if (lifecycle === 'resolved') delete room.preparedCombat;
if (
  lifecycle === 'notStarted'
  && !room.preparedCombat
  && gm?.combatCycleService?.prepareCombatStart
) {
  gm.combatCycleService.prepareCombatStart(room);
}

const interactionPayload = lifecycle === 'active'
  ? buildActiveCombatPayload(gm, room)
  : lifecycle === 'resolved'
    ? buildResolvedCombatPayload(room)
    : await buildInteractionPayload(gm, room, payloadOpts);
const acceptedActions = acceptedExploreActionsForRoom(room, {
  combat: gm?.combat,
  isCurrentRoom: index === currentRoom,
  includeProjectedCombatCycle: true,
});
const missingPayloadReasons = lifecycle === 'resolved'
  ? []
  : missingPayloadReasonsFor(room, interactionPayload);
```

Import `ensureTurnSeeds` and `PVE_TURN_SEED_CHAIN_TARGET`. This ensures only `notStarted` can create/reuse a prepared roll; active serializes live state; resolved is a ready non-start shell.

- [ ] **Step 5: Re-run and commit**

```bash
node --experimental-test-module-mocks --test tests/unit/game/explore-runway-combat.test.js tests/unit/game/explore-session-sync-combat.test.js
node --test tests/integration/flows/explore-session-sync.test.js
node --check src/game/services/explore-runway-service.js
/usr/bin/git add src/game/services/explore-runway-service.js tests/unit/game/explore-runway-combat.test.js tests/unit/game/explore-session-sync-combat.test.js tests/integration/flows/explore-session-sync.test.js
/usr/bin/git commit -m "fix: keep active explore combat canonical"
```

---

### Task 14: Convert the Explore subway harness to genuine browser offline/online transitions

**Files:**
- Modify: `tests/smoke/explore-subway-runway.test.js`
- Modify: `tests/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: all prior client/server behavior.
- Produces: deterministic room indices 1-4 while leaving the fixed NPC battle and boss slots untouched.

- [ ] **Step 1: Install browser network-event tracking and real offline transitions**

Before navigation:

```js
await page.addInitScript(() => {
  window.__networkTransitions = [];
  addEventListener('offline', () => window.__networkTransitions.push('offline'));
  addEventListener('online', () => window.__networkTransitions.push('online'));
});
```

Beside the existing `let offline = false`, initialize both window counters:

```js
let offline = false;
let offlineWindowsStarted = 0;
let offlineWindowsCompleted = 0;
```

Then replace the route-abortion implementations with:

```js

async function goOffline() {
  await context.setOffline(true);
  offline = true;
  offlineWindowsStarted += 1;
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

async function goOnline() {
  await context.setOffline(false);
  offline = false;
  offlineWindowsCompleted += 1;
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
}
```

- [ ] **Step 2: Drive run entry live and measure taps from before dispatch**

Replace `startExplorationRun()` and the setup reload with a UI driver:

```js
async function startExplorationRunThroughUi(page) {
  const dailyDismiss = page.locator('.crystal-daily-dismiss');
  if (await dailyDismiss.count()) await dailyDismiss.click();

  await page.getByRole('button', { name: /Explore/ }).click();
  await expect(page.locator('.ui-choice-heading')).toHaveText('Choose an area');
  await page.locator('#action-area .ui-choice').first().click();

  await expect(page.locator('.collection-select')).toBeVisible();
  for (const id of DEV_TEAM) {
    await page.locator(`.collection-cell[data-id="${id}"]`).click();
  }
  await expect(page.locator('#collection-confirm-btn')).toBeEnabled();
  await page.locator('#collection-confirm-btn').click();

  await expect.poll(async () => (
    await page.locator('.npc-dialogue-continue').count()
    + await page.locator('.narration-box.visible').count()
    + await page.locator('#action-area .ui-choice').count()
  )).toBeGreaterThan(0);
  for (let step = 0; step < 8; step += 1) {
    const dialogueContinue = page.locator('.npc-dialogue-continue');
    if (await dialogueContinue.count()) {
      await dialogueContinue.click();
      await page.waitForTimeout(150);
      continue;
    }
    if (await page.locator('.narration-box.visible').count()) {
      await page.evaluate(() => document.querySelector('.scene-area')?.click());
      await page.waitForTimeout(600);
      continue;
    }
    if (await page.locator('#action-area .ui-choice').count()) break;
    await page.waitForTimeout(100);
  }

  await expect(page.locator('#action-area .ui-choice').first()).toBeVisible();
  await page.locator('#action-area .ui-choice').first().click();
  await expect.poll(async () => {
    const state = await gameState(page);
    return state?.run?.exploreRunway?.preparedRooms?.length || 0;
  }, { timeout: 20_000 }).toBeGreaterThan(0);
}
```

Call it after login and deterministic queue setup. Do not reload after setup; the same document/session that entered the run must cross both connectivity windows.

Replace the optional speed-review-only queue helper with a deterministic gate layout:

```js
async function queueDeterministicExploreLayout(page) {
  const rooms = FORCE_SPEED_REVIEW
    ? ['shrine', 'speedReviewRoom', 'friendlyNpc', 'encounter']
    : ['shrine', 'encounter', 'friendlyNpc', 'encounter'];
  const result = await page.evaluate(async queuedRooms => {
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const post = async (path, body) => {
      const response = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    };
    const debug = await post('/api/game/debug-mode', { enabled: true });
    if (debug.status !== 200) return { error: 'debug-mode', debug };
    const queued = await post('/api/game/debug-queue-rooms', {
      rooms: queuedRooms,
    });
    if (queued.status !== 200) return { error: 'debug-queue', queued };
    return { ok: true };
  }, rooms);
  expect(result).toEqual({ ok: true });
}
```

Four queued entries populate room indices 1-4 only; the ordinary fixed NPC battle and boss positions later in the area remain available. The first outage arms at badge 2, which is the queued shrine, guaranteeing a support interaction while genuinely offline.

Measure the full dispatch-to-ack interval:

```js
const before = await page.locator('#action-area').innerHTML().catch(() => '');
const started = Date.now();
await locator.click();
```

Keep the existing first-DOM-change polling and `< TAP_ACK_MS` assertion after this reordered prefix.

- [ ] **Step 3: Strengthen offline coverage and final reconciliation**

Remove the generic offline holds from support choice/button branches. Add `npcRewardScreens` and `npcRewardChoices` to `played`, plus a `seenNpcRewardRooms` set. When `roomType === 'npcBattle'` and the heading is `Choose a skill`, add the current room index to the set/count once; increment choices only after its choice click succeeds.

At end, dynamically import the live session and assert:

```js
await expect.poll(async () => page.evaluate(async () => {
  const { getExploreSession } = await import('/js/ui/explore-session.js');
  const session = getExploreSession();
  return {
    pendingCount: session?.pendingCount?.() ?? 0,
    paused: session?.isPaused?.() ?? false,
    pauseReason: session?.getPauseReason?.() ?? null,
  };
}), { timeout: 20_000 }).toEqual({
  pendingCount: 0,
  paused: false,
  pauseReason: null,
});
```

Add an exact digest helper and gates:

```js
function partyDigest(state) {
  const run = state?.run;
  if (!run?.creatureParty) return null;
  const digestCreature = creature => creature ? {
    uid: creature.uid ?? null,
    id: creature.id ?? null,
    hp: creature.hp ?? null,
    maxHp: creature.maxHp ?? null,
    level: creature.level ?? null,
    xp: creature.xp ?? null,
    statStages: creature.statStages ?? null,
    activeEffects: creature.activeEffects ?? [],
  } : null;
  return {
    partySkills: run.partySkills || [],
    active: (run.creatureParty.active || []).map(digestCreature),
    reserves: (run.creatureParty.reserves || []).map(digestCreature),
  };
}

const transitions = await page.evaluate(() => window.__networkTransitions);
const client = await gameState(page);
expect(offlineWindowsStarted).toBe(OFFLINE_WINDOWS.length);
expect(offlineWindowsCompleted).toBe(OFFLINE_WINDOWS.length);
expect(transitions.filter(value => value === 'offline')).toHaveLength(2);
expect(transitions.filter(value => value === 'online')).toHaveLength(2);
expect(played.supportActions).toBeGreaterThan(0);
expect(played.combatStarts).toBeGreaterThan(0);
expect(played.combatTurns).toBeGreaterThan(0);
expect(played.npcRewardScreens).toBeGreaterThan(0);
expect(played.npcRewardChoices).toBeGreaterThan(0);
expect(played.reachedEnd).toBe(true);
expect(correctedSyncs).toBe(0);
expect(partyDigest(client)).toEqual(partyDigest(server));
```

- [ ] **Step 4: Add the documented command**

Add to `package.json`:

```json
"test:subway:explore": "npm run seed:dev-user && EXPLORE_SUBWAY_SMOKE=1 EXPLORE_SUBWAY_COMBAT=1 EXPLORE_SUBWAY_LAYOUT=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js --workers=1"
```

Gate `queueDeterministicExploreLayout(page)` on `EXPLORE_SUBWAY_LAYOUT === '1'`. Document the deterministic first-four-room queue and true `navigator.onLine` behavior in `tests/README.md`.

- [ ] **Step 5: Run the genuine subway gate and commit**

Run:

```bash
npm run test:subway:explore
```

Expected final result: both real offline windows complete; standard Explore reaches terminal state with no corrections, pending entries, persistent pause, blank action panel, missing NPC reward, or client/server party divergence.

Then:

```bash
/usr/bin/git add tests/smoke/explore-subway-runway.test.js tests/README.md package.json
/usr/bin/git commit -m "test: exercise real offline explore recovery"
```

---

### Task 15: Run complete verification and review the branch

**Files:**
- Verify all modified production/test files.
- Do not create committed artifacts.

**Interfaces:**
- Consumes: Tasks 1-14.
- Produces: evidence-backed completion report and a clean branch.

- [ ] **Step 1: Run syntax checks**

```bash
node --check public/js/ui/explore-session.js
node --check public/js/ui/combat-loop.js
node --check public/js/ui/exploration.js
node --check public/js/ui/room-reveal-buffer.js
node --check public/js/ui/game-state-adoption.js
node --check public/js/api.js
node --check public/game.js
node --check src/shared/combat/local-combat-start.js
node --check src/game/room-entry-party.js
node --check src/game/npc-battle-reward.js
node --check src/game/services/npc-service.js
node --check src/game/services/explore-session-contract.js
node --check src/game/services/explore-session-sync-service.js
node --check src/game/services/explore-runway-service.js
node --check src/game/services/exploration-service.js
node --check src/routes/game/combat.js
node --check src/routes/game/explore-session.js
node --check src/routes/game/optimistic-action-response.js
node --check src/routes/game/run.js
```

Expected: every command exits 0 with no output.

- [ ] **Step 2: Run the focused Explore regression matrix**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/explore-session.test.js tests/unit/ui/combat-session-local.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/game-state-adoption.test.js tests/unit/ui/load-game-state-adopts-runway.test.js tests/unit/ui/room-reveal-buffer-client.test.js tests/unit/ui/start-encounter-session-first.test.js tests/unit/game/room-entry-party.test.js tests/unit/game/npc-battle-reward.test.js tests/unit/game/explore-session-contract.test.js tests/unit/game/explore-session-sync-service.test.js tests/unit/game/explore-session-sync-combat.test.js tests/unit/game/explore-runway-combat.test.js tests/unit/game/explore-support-room-batch-parity.test.js tests/unit/game/exploration-service-room-heal.test.js tests/unit/game/exploration-service-npc-battle-reward-guard.test.js tests/unit/game/exploration-service-combat-room-guard.test.js tests/unit/game/skill-master-service.test.js tests/unit/game/whack-a-mole.test.js tests/unit/combat/resolution.test.js tests/unit/routes/explore-session-route.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/api-network-hardening.test.js
node --test tests/integration/flows/explore-session-sync.test.js tests/integration/flows/exploration.test.js
```

Expected: all focused tests pass.

- [ ] **Step 3: Run the repository gate**

```bash
npm test
```

Expected: no new failures versus the recorded `67edd31e` baseline. Investigate every failure in a file touched by this plan before continuing; do not label it unrelated without reproducing it on the base commit.

- [ ] **Step 4: Run the genuine browser gate once more**

```bash
npm run test:subway:explore
```

Expected: both offline windows and the full success criteria from Task 14 pass.

- [ ] **Step 5: Inspect artifacts and working tree**

```bash
/usr/bin/git status --short
/usr/bin/git diff --check
/usr/bin/git log --oneline --decorate -16
```

If tests changed tracked memory fixtures or `package-lock.json`, restore only those known generated changes with `/usr/bin/git restore -- <exact-path>` and rerun `git status`. Expected final status: clean.

- [ ] **Step 6: Request code review before integration**

Invoke `superpowers:requesting-code-review`. Review against the amended design and this plan, with special attention to append-before-mutation, deferred resume ordering, server batch preflight, alias preservation, and live-combat runway identity. Address findings through `superpowers:receiving-code-review`, one red-green fix at a time.

- [ ] **Step 7: Commit review-only corrections if any**

If review required changes, stage only their exact files and commit:

```bash
/usr/bin/git commit -m "fix: close explore sync review findings"
```

If no files changed, do not create an empty commit.
