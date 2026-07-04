import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const transitionCalls = [];
let actionArea = null;

globalThis.document = {
  getElementById: id => (id === 'action-area' ? actionArea : null),
};

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: null }) },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', { namedExports: {} });
await mock.module('../../../public/js/ui/whack-a-mole.js', {
  namedExports: { WhackAMoleGame: class {} },
});
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/native/index.js', { namedExports: { hapticLight: () => {} } });
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureBgUrl: () => '',
    itemSpriteHtml: () => '',
    creatureStaticPath: () => '',
    SPRITE_VERSION: 'test',
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...args) => args.join(' '), isJapanified: () => false },
});
await mock.module('../../../public/js/ui/chests.js', { namedExports: {} });
await mock.module('../../../public/js/ui/crests-equip.js', { namedExports: {} });
await mock.module('../../../public/js/ui/campfire.js', {
  namedExports: { init: () => {}, show: async () => {} },
});
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: {
    playRoomTransition: async (state, opts) => {
      transitionCalls.push({ state, opts });
    },
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: { renderButtons: () => {}, renderChoices: () => {} },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async () => {} },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: { buff: () => {}, itemGained: () => {} },
});
await mock.module('../../../public/js/ui/dom-effects.js', {
  namedExports: { pop: () => {}, flashElement: () => {} },
});
await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: { showIngredientDropPopups: () => {}, showWordLevelUp: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(token => token.text || token.base || '').join(''),
    getKnownWords: () => new Set(),
  },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => [],
    getFormationNarration: () => '',
    getPostHinonekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const {
  init,
  proceedWithRevealBuffer,
  wireExploreSessionRecoveryDrains,
} = await import('../../../public/js/ui/exploration.js');
const { getExploreSession, resetExploreSession } = await import('../../../public/js/ui/explore-session.js');

function room(index, overrides = {}) {
  return { id: `room-${index}`, type: 'empty', ...overrides };
}

function preparedRoom(index, overrides = {}) {
  return {
    index,
    roomId: `room-${index}`,
    actionSeq: 100 + index,
    room: room(index),
    acceptedActions: ['proceed'],
    actionEffects: { proceed: [] },
    dependencies: [],
    offlineReady: true,
    ...overrides,
  };
}

function makeState({ currentRoom = 0, exploreRunway, roomCount = 3 } = {}) {
  const rooms = Array.from({ length: roomCount }, (_, index) => room(index));
  return {
    player: { id: 'player-1' },
    phase: 'room',
    room: rooms[currentRoom],
    run: {
      active: true,
      currentRoom,
      roomActionSeq: 100 + currentRoom,
      rooms,
      exploreRunway,
    },
  };
}

function makeRunway(overrides = {}) {
  const roomCount = overrides.roomCount ?? 3;
  return {
    sessionEpoch: 'ese_cutover111111',
    roomActionSeq: 100,
    currentRoom: 0,
    preparedRooms: Array.from({ length: roomCount }, (_, index) => preparedRoom(index, { actionSeq: 100 + index })),
    ...overrides,
  };
}

function initCutoverHarness({
  initialState,
  apiProceed = async () => null,
  apiSyncExploreSession = async () => ({ status: 'ok', confirmedThroughSeq: 0, results: [] }),
} = {}) {
  let currentState = initialState;
  let updateUiCalls = 0;
  const actionClears = [];
  const finishCombatCalls = [];
  const befriendResumeCalls = [];
  init({
    getGameState: () => currentState,
    updateGameState: state => { currentState = state; },
    updateUI: () => { updateUiCalls += 1; },
    actions: {
      clear: () => { actionClears.push('clear'); },
      setContent: () => {},
    },
    scene: { showNarration: () => {} },
    finishCombatLoop: result => { finishCombatCalls.push(result); },
    resumeSessionCombatBefriendQuiz: result => { befriendResumeCalls.push(result); },
    apiProceed,
    apiSyncExploreSession,
  });
  return {
    get currentState() { return currentState; },
    get updateUiCalls() { return updateUiCalls; },
    actionClears,
    finishCombatCalls,
    befriendResumeCalls,
  };
}

function makeEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler]);
    },
    dispatch(type) {
      for (const handler of listeners.get(type) || []) handler();
    },
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('condition was not met');
}

describe('explore session proceed cutover', () => {
  beforeEach(() => {
    transitionCalls.length = 0;
    actionArea = { innerHTML: 'stale action area' };
    resetExploreSession();
  });

  afterEach(() => {
    resetExploreSession();
  });

  it('falls back to legacy apiProceed when exploreRunway is an empty shell', async () => {
    const advancedState = makeState({ currentRoom: 1, exploreRunway: null });
    const proceedCalls = [];
    const harness = initCutoverHarness({
      initialState: makeState({
        currentRoom: 0,
        exploreRunway: {
          sessionEpoch: 'ese_empty11111111',
          currentRoom: 0,
          roomActionSeq: 100,
          preparedRooms: [],
        },
      }),
      apiProceed: async options => {
        proceedCalls.push(options);
        return { state: advancedState };
      },
    });

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls.length, 1);
    assert.equal(proceedCalls[0], undefined);
    assert.equal(harness.currentState, advancedState);
    assert.equal(transitionCalls.length, 1);
    assert.equal(transitionCalls[0].state.run.currentRoom, 1);
    assert.equal(actionArea.innerHTML, '');
    assert.equal(result.state, advancedState);
  });

  it('falls back to legacy apiProceed when the current prepared room cannot proceed', async () => {
    const advancedState = makeState({ currentRoom: 1, exploreRunway: null });
    const proceedCalls = [];
    initCutoverHarness({
      initialState: makeState({
        currentRoom: 0,
        exploreRunway: makeRunway({
          preparedRooms: [
            preparedRoom(0, { acceptedActions: ['campfire.cook'] }),
            preparedRoom(1),
          ],
        }),
      }),
      apiProceed: async options => {
        proceedCalls.push(options);
        return { state: advancedState };
      },
    });

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls.length, 1);
    assert.equal(proceedCalls[0], undefined);
    assert.equal(result.state, advancedState);
    assert.equal(transitionCalls.length, 1);
  });

  it('queues consecutive offline proceeds for the advanced room instead of duplicating the stale runway room', async () => {
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: makeRunway() }),
    });

    const first = await proceedWithRevealBuffer();
    assert.equal(harness.currentState.run.currentRoom, 1,
      'first queued proceed advances the optimistic cursor by one room');
    assert.ok(
      harness.currentState.run.exploreRunway.preparedRooms.some(entry => entry.index === 2),
      'runway still exposes the room one ahead of the advanced cursor'
    );
    const second = await proceedWithRevealBuffer();

    assert.deepEqual(
      getExploreSession().snapshot().map(entry => ({
        roomIndex: entry.roomIndex,
        actionSeq: entry.actionSeq,
      })),
      [
        { roomIndex: 0, actionSeq: 100 },
        { roomIndex: 1, actionSeq: 101 },
      ]
    );
    assert.equal(first.status, 'queued');
    assert.equal(second.status, 'queued');
    assert.equal(harness.currentState.run.currentRoom, 2);
    assert.equal(harness.currentState.run.exploreRunway.currentRoom, 2);
    assert.deepEqual(transitionCalls.map(call => call.state.run.currentRoom), [1, 2]);
  });

  it('does not apply non-empty checkpoints that would rewind pending optimistic proceeds', async () => {
    const syncRequests = [];
    initCutoverHarness({
      initialState: makeState({ currentRoom: 0, roomCount: 4, exploreRunway: makeRunway({ roomCount: 4 }) }),
      apiSyncExploreSession: payload => new Promise(resolve => {
        syncRequests.push({ payload, resolve });
      }),
    });

    await proceedWithRevealBuffer();
    void getExploreSession().syncNow();
    await waitFor(() => syncRequests.length === 1);

    await proceedWithRevealBuffer();
    const checkpointRunway = makeRunway({ currentRoom: 1, roomActionSeq: 101, roomCount: 4 });
    syncRequests[0].resolve({
      status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: makeState({ currentRoom: 1, roomCount: 4, exploreRunway: checkpointRunway }),
      exploreRunway: checkpointRunway,
    });
    await waitFor(() => syncRequests.length === 2);

    await proceedWithRevealBuffer();

    assert.deepEqual(
      getExploreSession().snapshot().map(entry => ({
        roomIndex: entry.roomIndex,
        actionSeq: entry.actionSeq,
      })),
      [
        { roomIndex: 1, actionSeq: 101 },
        { roomIndex: 2, actionSeq: 102 },
      ]
    );
  });

  it('keeps refreshed runway from partial checkpoints without rewinding optimistic room state', async () => {
    const syncRequests = [];
    const legacyProceedCalls = [];
    const harness = initCutoverHarness({
      initialState: makeState({
        currentRoom: 0,
        roomCount: 4,
        exploreRunway: makeRunway({ roomCount: 3 }),
      }),
      apiProceed: async options => {
        legacyProceedCalls.push(options);
        return null;
      },
      apiSyncExploreSession: payload => new Promise(resolve => {
        syncRequests.push({ payload, resolve });
      }),
    });

    await proceedWithRevealBuffer();
    void getExploreSession().syncNow();
    await waitFor(() => syncRequests.length === 1);

    await proceedWithRevealBuffer();
    assert.equal(harness.currentState.run.currentRoom, 2);
    assert.equal(
      harness.currentState.run.exploreRunway.preparedRooms.some(entry => entry.index === 3),
      false
    );

    const refreshedRunway = makeRunway({ currentRoom: 1, roomActionSeq: 101, roomCount: 4 });
    syncRequests[0].resolve({
      status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: makeState({ currentRoom: 1, roomCount: 4, exploreRunway: refreshedRunway }),
      exploreRunway: refreshedRunway,
    });
    await waitFor(() => syncRequests.length === 2);

    assert.equal(harness.currentState.run.currentRoom, 2);
    assert.equal(
      harness.currentState.run.exploreRunway.preparedRooms.some(entry => entry.index === 3),
      true
    );

    await proceedWithRevealBuffer();

    assert.equal(legacyProceedCalls.length, 0);
    assert.deepEqual(
      getExploreSession().snapshot().map(entry => ({
        roomIndex: entry.roomIndex,
        actionSeq: entry.actionSeq,
      })),
      [
        { roomIndex: 1, actionSeq: 101 },
        { roomIndex: 2, actionSeq: 102 },
      ]
    );
  });

  it('wires recovery drains once per target and skips hidden visibility drains', async () => {
    initCutoverHarness({ initialState: makeState({ currentRoom: 0, exploreRunway: null }) });
    let syncCalls = 0;
    getExploreSession().syncNow = () => { syncCalls += 1; };
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();
    documentTarget.visibilityState = 'hidden';

    wireExploreSessionRecoveryDrains({ windowTarget, documentTarget });
    wireExploreSessionRecoveryDrains({ windowTarget, documentTarget });

    assert.equal(windowTarget.listeners.get('online').length, 1);
    assert.equal(documentTarget.listeners.get('visibilitychange').length, 1);

    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    assert.equal(syncCalls, 1);

    documentTarget.visibilityState = 'visible';
    documentTarget.dispatch('visibilitychange');
    assert.equal(syncCalls, 2);
  });

  // Regression: F1 (explore subway rooms tier). A support room (shrine/friendlyNpc)
  // is not `proceed`-capable in the runway, so its completion is queued in the
  // session and the room auto-advances via the LEGACY /api/game/proceed. That
  // legacy proceed must NOT race ahead of the queued choose — otherwise the
  // server cursor moves past the room, the choose syncs into a room_index_mismatch
  // correction (reward lost, no-corrected-syncs invariant broken). proceed must
  // drain the session FIRST.
  it('drains pending session actions before a legacy proceed from a support room', async () => {
    const events = [];
    const supportRunway = {
      sessionEpoch: 'ese_support11111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        // Current room is a shrine: accepts shrine.choose, NOT proceed.
        preparedRoom(0, {
          room: room(0, { type: 'shrine' }),
          acceptedActions: ['shrine.choose'],
          actionEffects: { 'shrine.choose': [] },
        }),
        preparedRoom(1),
      ],
    };
    initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: supportRunway }),
      apiProceed: async () => { events.push('proceed'); return null; },
      apiSyncExploreSession: async () => {
        events.push('sync');
        return { status: 'ok', confirmedThroughSeq: 1, results: [] };
      },
    });

    // Queue the support-room choice so the session has a pending action.
    getExploreSession().adoptRunway(supportRunway);
    const queued = getExploreSession().recordRoomAction('shrine.choose', { rewardType: 'heal_all', creatureKey: null });
    assert.equal(queued.accepted, true, 'shrine.choose should be accepted by the prepared support room');
    assert.equal(getExploreSession().pendingCount(), 1);

    await proceedWithRevealBuffer();

    // The drain (sync) must happen, and it must precede the legacy proceed.
    assert.ok(events.includes('sync'), 'pending session must be drained before legacy proceed');
    assert.ok(events.includes('proceed'), 'legacy proceed should still run for the support room');
    assert.ok(
      events.indexOf('sync') < events.indexOf('proceed'),
      `sync must precede proceed, got order: ${JSON.stringify(events)}`
    );
    assert.equal(getExploreSession().pendingCount(), 0, 'session should be flushed after the drain');
  });

  // BLOCKER 1 (explore subway combat tier): a completed SUPPORT room advances OUT
  // through the session, NOT the legacy /api/game/proceed. The server grants every
  // support room `proceed` in its runway acceptedActions (Task 8 rider), so with a
  // pending `shrine.choose` queued, recording `proceed` must append a second entry
  // and advance the optimistic cursor — all with ZERO network. Offline the legacy
  // apiProceed cannot run (it throws → bare soft pause → the room hangs forever,
  // never retried on reconnect); routing through the session avoids that entirely.
  // The queued pair's seq layout is asserted: the `proceed` carries the actionSeq
  // of the room it LEAVES (the shrine's), stamped alongside the choose.
  it('advances a completed support room through the session offline (queues [choose, proceed], no network)', async () => {
    const supportRunway = {
      sessionEpoch: 'ese_shrinesess111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        // REAL runway: the shrine accepts BOTH shrine.choose AND proceed.
        preparedRoom(0, {
          room: room(0, { type: 'shrine' }),
          acceptedActions: ['shrine.choose', 'proceed'],
          actionEffects: { 'shrine.choose': ['partyStats'], proceed: ['ingredients', 'areaProgress'] },
          dependencies: ['partyStats'],
        }),
        // Next room is a plain combat encounter (deps []): no dependency-pause,
        // offlineReady so the proceed queues rather than pausing.
        preparedRoom(1, {
          room: room(1, { type: 'encounter' }),
          acceptedActions: ['encounter.start', 'combat.cycle'],
          actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
          dependencies: [],
          interactionPayload: { combatStart: {} },
        }),
      ],
    };
    let proceedCalls = 0;
    let syncCalls = 0;
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: supportRunway }),
      apiProceed: async () => { proceedCalls += 1; throw new Error('OFFLINE: apiProceed must not run'); },
      apiSyncExploreSession: async () => { syncCalls += 1; throw new Error('OFFLINE: sync must not run'); },
    });

    getExploreSession().adoptRunway(supportRunway);
    const choose = getExploreSession().recordRoomAction('shrine.choose', { rewardType: 'heal_all', creatureKey: null });
    assert.equal(choose.accepted, true, 'shrine.choose accepted by the prepared support room');

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls, 0, 'legacy apiProceed must NOT run — the support-room proceed routes through the session');
    assert.equal(syncCalls, 0, 'no drain fires offline — the pair stays queued for the reconnect drain');
    assert.equal(result?.status, 'queued', 'the proceed is queued locally, acknowledged instantly');
    assert.equal(harness.currentState.run.currentRoom, 1, 'the optimistic cursor advanced to the next room');
    // Seq layout: choose then proceed, BOTH stamped with the shrine room's actionSeq
    // (the room being left). This is exactly what the server replays choose→proceed.
    assert.deepEqual(
      getExploreSession().snapshot().map(entry => ({ seq: entry.seq, kind: entry.kind, roomIndex: entry.roomIndex, actionSeq: entry.actionSeq })),
      [
        { seq: 1, kind: 'shrine.choose', roomIndex: 0, actionSeq: 100 },
        { seq: 2, kind: 'proceed', roomIndex: 0, actionSeq: 100 },
      ],
      'queued pair is [shrine.choose@seq1, proceed@seq2], both carrying the shrine actionSeq (the room left)',
    );
  });

  // BLOCKER 1 hang-prevention: when the room AFTER a completed support room is NOT
  // offline-ready (combat pre-roll missing / support content uncached / beyond the
  // reveal window), the OLD code fell to the legacy apiProceed — which offline
  // throws → bare soft pause → the run hangs at the support room and is never
  // retried. Routing through the session instead yields a RESUMABLE session pause
  // (enterPause), whose onResume re-renders and re-attempts the advance once the
  // reconnect drain refreshes the runway. The legacy apiProceed must never run.
  it('does not fall to the hanging legacy proceed when the next room is not offline-ready (support room)', async () => {
    const supportRunway = {
      sessionEpoch: 'ese_shrinenotready',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, {
          room: room(0, { type: 'shrine' }),
          acceptedActions: ['shrine.choose', 'proceed'],
          actionEffects: { 'shrine.choose': ['partyStats'], proceed: ['ingredients', 'areaProgress'] },
          dependencies: ['partyStats'],
        }),
        // Next room's combat is NOT pre-rolled → offlineReady false.
        preparedRoom(1, {
          room: room(1, { type: 'encounter' }),
          acceptedActions: ['encounter.start', 'combat.cycle'],
          actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
          dependencies: [],
          offlineReady: false,
        }),
      ],
    };
    let proceedCalls = 0;
    const pauses = [];
    initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: supportRunway }),
      apiProceed: async () => { proceedCalls += 1; throw new Error('OFFLINE: apiProceed must not run'); },
      apiSyncExploreSession: async () => { throw new Error('OFFLINE: sync must not run'); },
    });

    getExploreSession().adoptRunway(supportRunway);
    getExploreSession().recordRoomAction('shrine.choose', { rewardType: 'heal_all', creatureKey: null });

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls, 0, 'the legacy (hanging) apiProceed must NOT run for a support room');
    // The session rejected the proceed as not-ready and entered a resumable pause;
    // the cursor stays on the shrine (no local advance) and no legacy call fired.
    assert.equal(getExploreSession().isPaused(), true, 'a resumable session pause is entered (auto-resumes on reconnect drain)');
    assert.equal(result, null, 'proceed returns null (paused), not a legacy hang');
  });

  // Regression: O1 (explore subway rooms/combat tier). A combat room is NOT
  // `proceed`-capable in the runway, so advancing OUT of it (to the next room)
  // goes through the LEGACY /api/game/proceed, which rebuilds the runway for the
  // new room (currentRoom bumped, epoch preserved). If proceedWithRevealBuffer
  // does NOT adopt that fresh runway into the live ExploreSession, the session's
  // internal cursor (localCurrentRoom) stays on the PREVIOUS room. The next
  // room's combat then records `encounter.start` stamped with the STALE roomIndex,
  // and the sync rejects it as room_index_mismatch (a corrected sync — the
  // no-corrected-syncs invariant is broken). The adopt must happen so the next
  // recorded entry carries the advanced roomIndex.
  it('adopts the refreshed runway after a legacy proceed so the next combat records the advanced roomIndex', async () => {
    const combatActions = ['encounter.start', 'combat.cycle'];
    const combatRoom0 = {
      sessionEpoch: 'ese_combatadopt1',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, {
          room: room(0, { type: 'encounter' }),
          acceptedActions: combatActions,
          actionEffects: { 'encounter.start': [], 'combat.cycle': [] },
          interactionPayload: { combatStart: {} },
        }),
        preparedRoom(1, {
          room: room(1, { type: 'encounter' }),
          acceptedActions: combatActions,
          actionEffects: { 'encounter.start': [], 'combat.cycle': [] },
          interactionPayload: { combatStart: {} },
        }),
      ],
    };
    // The runway the server returns AFTER the legacy proceed advances to room 1:
    // same epoch (proceed preserves it), currentRoom bumped to 1, preparedRooms
    // now cover room 1 (and the reveal-ahead room 2).
    const combatRoom1 = {
      sessionEpoch: 'ese_combatadopt1',
      currentRoom: 1,
      roomActionSeq: 101,
      preparedRooms: [
        preparedRoom(1, {
          room: room(1, { type: 'encounter' }),
          acceptedActions: combatActions,
          actionEffects: { 'encounter.start': [], 'combat.cycle': [] },
          interactionPayload: { combatStart: {} },
        }),
        preparedRoom(2),
      ],
    };
    const advancedState = makeState({ currentRoom: 1, exploreRunway: combatRoom1 });

    initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: combatRoom0 }),
      apiProceed: async () => ({ state: advancedState }),
    });

    // Seed the session with the entry runway (mirrors renderExploring's
    // adopt-on-entry). Combat rooms are not session-proceed-capable, so this
    // proceed takes the legacy apiProceed branch.
    getExploreSession().adoptRunway(combatRoom0);

    await proceedWithRevealBuffer();

    // After the legacy proceed advanced the server to room 1, the session must
    // have adopted the refreshed runway: recording the next room's combat start
    // stamps roomIndex 1 (the advanced room), NOT the stale room 0.
    const recorded = getExploreSession().recordRoomAction('encounter.start', {});
    assert.equal(recorded.accepted, true, 'encounter.start should be accepted at the advanced room');
    assert.equal(
      recorded.entry.roomIndex, 1,
      'the next combat start must carry the advanced roomIndex (1), not the stale previous room (0) — '
      + 'otherwise the sync rejects it with room_index_mismatch',
    );
    assert.equal(recorded.entry.roomId, 'room-1', 'the entry roomId must match the advanced room');
  });

  // A checkpoint that carries a committed combat.cycle result with combatEnded ===
  // true must hand that result to finishCombatLoop (the shared victory/defeat path).
  it('finishes session combat when a checkpoint result reports combatEnded', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_combat111111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, {
          room: room(0, { type: 'encounter' }),
          acceptedActions: ['encounter.start', 'combat.cycle'],
          actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
        }),
        preparedRoom(1),
      ],
    };
    const committedResult = {
      seq: 1, actionId: 'run_es_combat_01',
      combatEnded: true, victory: true, turnCount: 3,
      enemies: [{ id: 'mizu', hp: 0, maxHp: 100 }],
      creatureParty: { active: [{ id: 'hi', hp: 80, maxHp: 100 }], reserves: [] },
    };
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      apiSyncExploreSession: async () => ({
        status: 'ok',
        confirmedThroughSeq: 1,
        results: [committedResult],
        state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      }),
    });

    getExploreSession().adoptRunway(combatRunway);
    const queued = getExploreSession().recordRoomAction('combat.cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      predictedHash: 'abc123',
    });
    assert.equal(queued.accepted, true, 'combat.cycle accepted by the prepared combat room');

    await getExploreSession().syncNow();

    assert.equal(harness.finishCombatCalls.length, 1, 'finishCombatLoop fired once from the checkpoint');
    assert.equal(harness.finishCombatCalls[0].victory, true);
    assert.equal(harness.finishCombatCalls[0].combatEnded, true);
    assert.ok(harness.finishCombatCalls[0].state, 'authoritative state rides along to the finish');
  });

  // The client optimistically predicts a plain terminal victory (pendingCombatEnd
  // shell), but the server can divert that terminal turn to a befriend quiz on
  // replay (25% roll; server-only). Such a result carries befriendQuizTriggered
  // and combatEnded === false. The checkpoint must NOT try to finish (there is no
  // combatEnded) — it must resume combat into the befriend quiz, or the client
  // freezes on the victory shell forever (combat-tier subway stall).
  it('resumes into the befriend quiz when a checkpoint reports a server befriend on a terminal turn', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_befriend1111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, {
          room: room(0, { type: 'encounter' }),
          acceptedActions: ['encounter.start', 'combat.cycle'],
          actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
        }),
        preparedRoom(1),
      ],
    };
    const befriendResult = {
      seq: 1, actionId: 'run_es_befriend01',
      befriendQuizTriggered: true,
      combatEnded: false,
      befriendQuiz: { targetIndex: 0, creatureId: 'mizu', creatureName: 'みず', options: [] },
      enemies: [{ id: 'mizu', hp: 1, maxHp: 100 }],
      creatureParty: { active: [{ id: 'hi', hp: 80, maxHp: 100 }], reserves: [] },
    };
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      apiSyncExploreSession: async () => ({
        status: 'ok',
        confirmedThroughSeq: 1,
        results: [befriendResult],
        state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      }),
    });

    getExploreSession().adoptRunway(combatRunway);
    getExploreSession().recordRoomAction('combat.cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      predictedHash: 'abc123',
    });

    await getExploreSession().syncNow();

    assert.equal(harness.finishCombatCalls.length, 0, 'must NOT finish combat — the fight is not over (befriend pending)');
    assert.equal(harness.befriendResumeCalls.length, 1, 'must resume into the befriend quiz exactly once');
    assert.equal(harness.befriendResumeCalls[0].befriendQuizTriggered, true);
    assert.ok(harness.befriendResumeCalls[0].befriendQuiz, 'the befriend quiz payload rides along');
    assert.ok(harness.befriendResumeCalls[0].state, 'authoritative state rides along to the resume');
  });

  // A ledger-replayed combat-end result (replayed === true) was already resolved
  // on the original POST; the checkpoint must NOT re-finish combat for it.
  it('does not re-finish combat for a replayed combat-end checkpoint result', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_replay111111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, {
          room: room(0, { type: 'encounter' }),
          acceptedActions: ['encounter.start', 'combat.cycle'],
          actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
        }),
        preparedRoom(1),
      ],
    };
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      apiSyncExploreSession: async () => ({
        status: 'ok',
        confirmedThroughSeq: 1,
        results: [{ seq: 1, actionId: 'run_es_replay_01', combatEnded: true, victory: true, replayed: true }],
        state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      }),
    });

    getExploreSession().adoptRunway(combatRunway);
    getExploreSession().recordRoomAction('combat.cycle', { actionType: 'attack', moveChoices: [], predictedHash: 'x' });
    await getExploreSession().syncNow();

    assert.equal(harness.finishCombatCalls.length, 0, 'replayed combat-end result must not re-finish combat');
  });
});

// Online stall recovery (first-room spotty deadlock). When a session soft-pause
// fires with an empty-log dead-end reason (noPreparedRoom / *NotReady /
// runwayExhausted / missingPayload) while ONLINE and with no pending entries, the
// pause can never self-heal via the drain (empty log → no drain). exploration.js
// must fire a ONE-SHOT runway refresh (refreshRunwayState → loadGameState) to pull
// a rebuilt runway server-side. An in-flight + cooldown guard keeps repeated taps
// from stacking fetches.
describe('explore session online stall recovery', () => {
  beforeEach(() => {
    actionArea = { innerHTML: '' };
    resetExploreSession();
  });
  afterEach(() => {
    resetExploreSession();
  });

  function initRecoveryHarness({ refreshRunwayState } = {}) {
    let currentState = makeState({ currentRoom: 0, exploreRunway: null });
    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: { clear: () => {}, setContent: () => {} },
      scene: { showNarration: () => {} },
      finishCombatLoop: () => {},
      resumeSessionCombatBefriendQuiz: () => {},
      apiProceed: async () => null,
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 0, results: [] }),
      refreshRunwayState,
    });
  }

  // A runway where proceeding rejects `nextRoomNotReady` on an EMPTY log. That
  // reject calls enterPause('nextRoomNotReady') → onPause (showExploreSoftPause),
  // which is the recovery trigger. navigator.onLine is undefined in node (treated
  // as online), so no offline mock is needed.
  function pausingRunway() {
    return {
      sessionEpoch: 'ese_stallrecover1',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [
        preparedRoom(0, { acceptedActions: ['proceed'], actionEffects: { proceed: ['areaProgress'] } }),
        preparedRoom(1, { acceptedActions: ['proceed'], offlineReady: false }),
      ],
    };
  }

  it('fires refreshRunwayState exactly once (cooldown) when an empty-log soft-pause fires online', async () => {
    let refreshCalls = 0;
    initRecoveryHarness({ refreshRunwayState: () => { refreshCalls += 1; } });

    getExploreSession().adoptRunway(pausingRunway());

    // First proceed pauses (nextRoomNotReady, empty log) → recovery fires once.
    const first = getExploreSession().recordRoomAction('proceed');
    assert.equal(first.accepted, false);
    assert.equal(first.reason, 'nextRoomNotReady');
    await Promise.resolve();
    assert.equal(refreshCalls, 1, 'the first empty-log online soft-pause triggers a runway refresh');

    // A second attempt inside the cooldown window must NOT stack another fetch.
    // (Already paused → reject('paused') short-circuits before onPause; the guard
    // also blocks it. Either way, no second refresh.)
    getExploreSession().recordRoomAction('proceed');
    await Promise.resolve();
    assert.equal(refreshCalls, 1, 'a repeat within the cooldown does not stack a second refresh');
  });
});
