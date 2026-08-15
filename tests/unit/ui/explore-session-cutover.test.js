import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSessionPauseController } from '../../../public/js/ui/explore-session-pause-controller.js';

const transitionCalls = [];
let actionArea = null;

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toLowerCase();
    this.children = [];
    this.listeners = new Map();
    this.className = '';
    this.disabled = false;
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() { return this._innerHTML; }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }

  click() {
    for (const handler of this.listeners.get('click') || []) handler();
  }
}

function createActionArea(initial = '') {
  const area = new FakeElement('div');
  area.innerHTML = initial;
  return area;
}

function renderedButtons(root) {
  const result = [];
  const visit = node => {
    if (node.tagName === 'button') result.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return result;
}

globalThis.document = {
  getElementById: id => (id === 'action-area' ? actionArea : null),
  createElement: tagName => new FakeElement(tagName),
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
    addKnownWord: () => {},
    removeKnownWord: () => {},
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

function completeTransport(body, overrides = {}) {
  return {
    transport: true,
    httpStatus: 200,
    body,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
    ...overrides,
  };
}

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

function initCutoverHarness({
  initialState,
  apiProceed = async () => null,
  apiSyncExploreSession = async () => completeTransport({ protocolVersion: 1, status: 'ok', confirmedThroughSeq: 0, results: [] }),
  waitForCombatPlaybackIdle = async () => {},
  reconcileCorrectedCombat = () => false,
  reauthenticate = async () => false,
  claimReauthentication,
  releaseReauthentication,
  adoptRecoveryState = async () => false,
  acknowledgeReauthentication = () => {},
  onUpdateUI = () => {},
} = {}) {
  let currentState = initialState;
  let updateUiCalls = 0;
  const actionClears = [];
  const finishCombatCalls = [];
  const befriendResumeCalls = [];
  const correctionReconcileCalls = [];
  init({
    getGameState: () => currentState,
    updateGameState: state => { currentState = state; },
    updateUI: () => {
      updateUiCalls += 1;
      onUpdateUI(currentState);
    },
    actions: {
      clear: () => { actionClears.push('clear'); },
      setContent: () => {},
    },
    scene: { showNarration: () => {} },
    finishCombatLoop: result => { finishCombatCalls.push(result); },
    resumeSessionCombatBefriendQuiz: result => { befriendResumeCalls.push(result); },
    reconcileCorrectedCombat: (previousState, authoritativeState, correction) => {
      correctionReconcileCalls.push({ previousState, authoritativeState, correction });
      return reconcileCorrectedCombat(previousState, authoritativeState);
    },
    waitForCombatPlaybackIdle,
    reauthenticate,
    claimReauthentication,
    releaseReauthentication,
    adoptRecoveryState,
    acknowledgeReauthentication,
    apiProceed,
    apiSyncExploreSession,
  });
  return {
    get currentState() { return currentState; },
    get updateUiCalls() { return updateUiCalls; },
    actionClears,
    finishCombatCalls,
    befriendResumeCalls,
    correctionReconcileCalls,
  };
}

function makeEventTarget() {
  const listeners = new Map();
  const removals = [];
  return {
    listeners,
    removals,
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler]);
    },
    removeEventListener(type, handler) {
      removals.push({ type, handler });
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
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
    actionArea = createActionArea('stale action area');
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

  it('holds response state and runway adoption behind the production playback-idle hook', async () => {
    let releasePlayback;
    const playbackIdle = new Promise(resolve => { releasePlayback = resolve; });
    const initialRunway = makeRunway({
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'shrine' }),
        acceptedActions: ['shrine.choose'],
        actionEffects: { 'shrine.choose': ['partyStats'] },
      })],
    });
    const initialState = makeState({ currentRoom: 0, exploreRunway: initialRunway });
    const nextRunway = makeRunway({
      currentRoom: 1,
      roomActionSeq: 101,
      preparedRooms: [preparedRoom(1, { actionSeq: 101 })],
    });
    const nextState = makeState({ currentRoom: 1, exploreRunway: nextRunway });
    const harness = initCutoverHarness({
      initialState,
      waitForCombatPlaybackIdle: () => playbackIdle,
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'ok',
        confirmedThroughSeq: 1,
        results: [],
        state: nextState,
        exploreRunway: nextRunway,
      }),
    });
    const session = getExploreSession();
    session.adoptRunway(initialRunway);
    assert.equal(session.recordRoomAction('shrine.choose', { rewardType: 'level_up' }).accepted, true);

    const drain = session.syncNow();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(harness.currentState, initialState);
    assert.equal(session.currentPreparedRoom().index, 0);

    releasePlayback();
    await drain;

    assert.equal(harness.currentState, nextState);
    assert.equal(session.currentPreparedRoom().index, 1);
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

  it('uses drained legacy proceed to complete a canonical final room', async () => {
    const finalRoom = room(9, {
      type: 'boss',
      interacted: true,
      roomNumber: 10,
      totalRooms: 10,
    });
    const finalRunway = {
      sessionEpoch: 'ese_finalroom1111',
      currentRoom: 9,
      roomActionSeq: 109,
      preparedRooms: [preparedRoom(9, {
        room: finalRoom,
        acceptedActions: ['proceed'],
      })],
    };
    const initialState = makeState({
      currentRoom: 9,
      roomCount: 10,
      exploreRunway: finalRunway,
    });
    initialState.room = finalRoom;
    initialState.run.rooms[9] = finalRoom;
    const completedState = {
      ...initialState,
      phase: 'area_complete',
      room: null,
      run: {
        ...initialState.run,
        areaCleared: true,
        exploreRunway: null,
      },
    };
    let proceedCalls = 0;
    const harness = initCutoverHarness({
      initialState,
      apiProceed: async () => {
        proceedCalls += 1;
        return { state: completedState };
      },
    });

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls, 1, 'the final room must reach the server area-completion path');
    assert.equal(result.state, completedState);
    assert.equal(harness.currentState.phase, 'area_complete');
    assert.equal(getExploreSession().isPaused(), false);
    assert.equal(getExploreSession().pendingCount(), 0);
  });

  it('keeps a truncated non-final runway fail-closed instead of legacy proceeding', async () => {
    const currentRoom = room(0, {
      type: 'shrine',
      interacted: true,
      roomNumber: 1,
      totalRooms: 3,
    });
    const truncatedRunway = {
      sessionEpoch: 'ese_truncated1111',
      currentRoom: 0,
      roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: currentRoom,
        acceptedActions: ['proceed'],
      })],
    };
    const initialState = makeState({ currentRoom: 0, roomCount: 3, exploreRunway: truncatedRunway });
    initialState.room = currentRoom;
    initialState.run.rooms[0] = currentRoom;
    let proceedCalls = 0;
    initCutoverHarness({
      initialState,
      apiProceed: async () => {
        proceedCalls += 1;
        return null;
      },
    });

    const result = await proceedWithRevealBuffer();

    assert.equal(result, null);
    assert.equal(proceedCalls, 0, 'a missing mid-area buffer must refresh, never race legacy proceed');
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(getExploreSession().getPauseReason(), 'runwayExhausted');
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
    syncRequests[0].resolve(completeTransport({
      protocolVersion: 1, status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: makeState({ currentRoom: 1, roomCount: 4, exploreRunway: checkpointRunway }),
      exploreRunway: checkpointRunway,
    }));
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
    syncRequests[0].resolve(completeTransport({
      protocolVersion: 1, status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: makeState({ currentRoom: 1, roomCount: 4, exploreRunway: refreshedRunway }),
      exploreRunway: refreshedRunway,
    }));
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

  it('re-initialization disposes the previous pause-controller listeners exactly once', () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();
    documentTarget.visibilityState = 'hidden';
    try {
      globalThis.window = windowTarget;
      globalThis.document = { ...previousDocument, ...documentTarget };
      initCutoverHarness({ initialState: makeState({ exploreRunway: makeRunway() }) });
      const firstOnline = windowTarget.listeners.get('online')[0];
      const firstVisibility = documentTarget.listeners.get('visibilitychange')[0];
      initCutoverHarness({ initialState: makeState({ exploreRunway: makeRunway() }) });
      assert.equal(windowTarget.listeners.get('online').length, 1);
      assert.notEqual(windowTarget.listeners.get('online')[0], firstOnline);
      assert.deepEqual(windowTarget.removals, [{ type: 'online', handler: firstOnline }]);
      assert.deepEqual(documentTarget.removals, [{ type: 'visibilitychange', handler: firstVisibility }]);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
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
        events.push('sync:start');
        await Promise.resolve();
        events.push('sync:end');
        return completeTransport({ protocolVersion: 1, status: 'ok', confirmedThroughSeq: 1, results: [] });
      },
    });

    // Queue the support-room choice so the session has a pending action.
    getExploreSession().adoptRunway(supportRunway);
    const queued = getExploreSession().recordRoomAction('shrine.choose', { rewardType: 'heal_all', creatureKey: null });
    assert.equal(queued.accepted, true, 'shrine.choose should be accepted by the prepared support room');
    assert.equal(getExploreSession().pendingCount(), 1);

    await proceedWithRevealBuffer();

    // The drain (sync) must happen, and it must precede the legacy proceed.
    assert.deepEqual(events, ['sync:start', 'sync:end', 'proceed']);
    assert.equal(getExploreSession().pendingCount(), 0, 'session should be flushed after the drain');
  });

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
    requests[0].resolve(completeTransport({
      protocolVersion: 1, status: 'ok',
      confirmedThroughSeq: 2,
      results: [],
      exploreRunway: runway,
    }));
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
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'ok',
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
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'ok',
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

  it('consumes a terminal result from a corrected sync before generic correction recovery', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_correctterm11', currentRoom: 0, roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      })],
    };
    const initialState = {
      ...makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-a' } },
    };
    const correctedState = {
      ...makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      combat: { active: false, optimistic: { combatId: 'cmb-a' } },
    };
    const harness = initCutoverHarness({
      initialState,
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1,
        results: [{ actionId: 'act-terminal', combatEnded: true, victory: true }],
        state: correctedState,
        exploreRunway: combatRunway,
      }),
    });
    getExploreSession().adoptRunway(combatRunway);
    getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'mismatch' });

    await getExploreSession().syncNow();

    assert.equal(harness.finishCombatCalls.length, 1);
    assert.equal(harness.correctionReconcileCalls.length, 0, 'terminal finish owns teardown');
    assert.equal(harness.updateUiCalls, 0, 'terminal finish owns its render transition');
  });

  it('consumes a befriend diversion from a corrected sync before generic correction recovery', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_correctfriend', currentRoom: 0, roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      })],
    };
    const activeState = {
      ...makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-a' } },
    };
    const harness = initCutoverHarness({
      initialState: activeState,
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1,
        results: [{
          actionId: 'act-befriend',
          befriendQuizTriggered: true,
          combatEnded: false,
          befriendQuiz: { targetIndex: 0, creatureId: 'mizu', options: [] },
        }],
        state: activeState,
        exploreRunway: combatRunway,
      }),
    });
    getExploreSession().adoptRunway(combatRunway);
    getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'mismatch' });

    await getExploreSession().syncNow();

    assert.equal(harness.befriendResumeCalls.length, 1);
    assert.equal(harness.finishCombatCalls.length, 0);
    assert.equal(harness.correctionReconcileCalls.length, 0);
    assert.equal(harness.updateUiCalls, 0);
  });

  it('preserves discarded correction evidence for corrected combat reconciliation', async () => {
    const combatRunway = {
      sessionEpoch: 'ese_correctevidence', currentRoom: 0, roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      })],
    };
    const initialState = {
      ...makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-a' } },
    };
    const authoritativeState = {
      ...makeState({ currentRoom: 0, exploreRunway: combatRunway }),
      combat: { active: false, optimistic: { combatId: 'cmb-a' } },
    };
    const correctionBody = {
      status: 'corrected',
      confirmedThroughSeq: null,
      rejectedSeq: 1,
      results: [],
      state: authoritativeState,
      exploreRunway: combatRunway,
    };
    const harness = initCutoverHarness({
      initialState,
      apiSyncExploreSession: async () => completeTransport(correctionBody),
    });
    getExploreSession().adoptRunway(combatRunway);
    const entry = getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'mismatch' }).entry;

    await getExploreSession().syncNow();

    assert.equal(harness.correctionReconcileCalls.length, 1);
    assert.deepEqual(harness.correctionReconcileCalls[0].correction.discardedEntries, [entry]);
    assert.equal(Object.hasOwn(correctionBody, 'discardedEntries'), false);
  });

  it('reconciles corrected ownership before rendering so inactive A releases and active B re-arms', async () => {
    const runwayA = {
      sessionEpoch: 'ese_correctowner1', currentRoom: 0, roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      })],
    };
    const stateA = {
      ...makeState({ currentRoom: 0, exploreRunway: runwayA }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-a' } },
    };
    const inactiveA = {
      ...makeState({ currentRoom: 0, exploreRunway: runwayA }),
      combat: { active: false, optimistic: { combatId: 'cmb-a' } },
    };
    let internalActive = true;
    let internalOwner = 'cmb-a';
    const events = [];
    const harness = initCutoverHarness({
      initialState: stateA,
      reconcileCorrectedCombat: (_previous, authoritative) => {
        events.push('reconcile');
        internalActive = false;
        internalOwner = null;
        return authoritative;
      },
      onUpdateUI: state => {
        events.push('updateUI');
        if (state.phase === 'combat' && !internalActive) {
          internalActive = true;
          internalOwner = state.combat.optimistic.combatId;
        }
      },
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1,
        results: [], state: inactiveA, exploreRunway: runwayA,
      }),
    });
    getExploreSession().adoptRunway(runwayA);
    getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'mismatch' });

    await getExploreSession().syncNow();

    assert.deepEqual(events, ['reconcile', 'updateUI']);
    assert.equal(internalActive, false);
    const startNextCombat = combatId => {
      if (internalActive) return false;
      internalActive = true;
      internalOwner = combatId;
      return true;
    };
    assert.equal(startNextCombat('cmb-b'), true, 'inactive correction must release combat A');
    assert.equal(internalOwner, 'cmb-b');
    assert.equal(harness.correctionReconcileCalls.length, 1);
  });

  it('re-arms an authoritative successor combat instead of leaving private ownership on A', async () => {
    const runway = {
      sessionEpoch: 'ese_correctnext11', currentRoom: 0, roomActionSeq: 100,
      preparedRooms: [preparedRoom(0, {
        room: room(0, { type: 'encounter' }),
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
      })],
    };
    const stateA = {
      ...makeState({ currentRoom: 0, exploreRunway: runway }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-a' } },
    };
    const stateB = {
      ...makeState({ currentRoom: 1, exploreRunway: runway }),
      phase: 'combat',
      combat: { active: true, optimistic: { combatId: 'cmb-b' } },
    };
    let internalActive = true;
    let internalOwner = 'cmb-a';
    const harness = initCutoverHarness({
      initialState: stateA,
      reconcileCorrectedCombat: (previous, authoritative) => {
        if (previous.combat.optimistic.combatId === authoritative.combat.optimistic.combatId) return false;
        internalActive = false;
        internalOwner = null;
        return true;
      },
      onUpdateUI: state => {
        if (state.phase === 'combat' && !internalActive) {
          internalActive = true;
          internalOwner = state.combat.optimistic.combatId;
        }
      },
      apiSyncExploreSession: async () => completeTransport({
        protocolVersion: 1, status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1,
        results: [], state: stateB, exploreRunway: runway,
      }),
    });
    getExploreSession().adoptRunway(runway);
    getExploreSession().recordRoomAction('combat.cycle', { predictedHash: 'mismatch' });

    await getExploreSession().syncNow();

    assert.equal(harness.currentState.combat.optimistic.combatId, 'cmb-b');
    assert.equal(internalActive, true);
    assert.equal(internalOwner, 'cmb-b');
    assert.equal(harness.correctionReconcileCalls.length, 1);
  });

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
        return completeTransport({
          protocolVersion: 1, status: 'ok',
          confirmedThroughSeq: syncCalls,
          results: [terminal],
          state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
          exploreRunway: combatRunway,
        });
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
        return completeTransport({
          protocolVersion: 1, status: 'ok',
          confirmedThroughSeq: syncCalls,
          results: [befriend],
          state: makeState({ currentRoom: 0, exploreRunway: combatRunway }),
          exploreRunway: combatRunway,
        });
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
});

// Online stall recovery (first-room spotty deadlock). When a session soft-pause
// fires with an empty-log dead-end reason (noPreparedRoom / *NotReady /
// runwayExhausted / missingPayload) while ONLINE and with no pending entries, the
// pause can never self-heal via the drain (empty log → no drain). exploration.js
// must fire a serialized runway refresh (refreshRunwayState → loadGameState) to
// pull a rebuilt runway server-side. Failed refreshes retry on bounded delays.
describe('explore session online stall recovery', () => {
  beforeEach(() => {
    actionArea = createActionArea();
    resetExploreSession();
  });
  afterEach(() => {
    resetExploreSession();
  });

  function initRecoveryHarness({
    refreshRunwayState,
    reviewAuthoritativeState,
    reauthenticate,
    claimReauthentication,
    releaseReauthentication,
    adoptRecoveryState,
    acknowledgeReauthentication,
    showToast = () => {},
    onUpdateUI = () => {},
    apiSyncExploreSession = async () => completeTransport({
      protocolVersion: 1,
      status: 'ok',
      confirmedThroughSeq: 0,
      results: [],
    }),
  } = {}) {
    let currentState = makeState({ currentRoom: 0, exploreRunway: null });
    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: onUpdateUI,
      actions: { clear: () => {}, setContent: () => {} },
      scene: { showNarration: () => {}, showToast },
      finishCombatLoop: () => {},
      resumeSessionCombatBefriendQuiz: () => {},
      apiProceed: async () => null,
      apiSyncExploreSession,
      refreshRunwayState,
      reviewAuthoritativeState,
      reauthenticate,
      claimReauthentication,
      releaseReauthentication,
      adoptRecoveryState,
      acknowledgeReauthentication,
    });
  }

  // A runway where proceeding rejects `nextRoomNotReady` on an empty log. The
  // pause controller owns the captured online/visibility recovery path.
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

  it('fires one serialized runway refresh when an empty-log soft-pause fires online', async () => {
    let refreshCalls = 0;
    const stalled = pausingRunway();
    const ready = makeRunway({
      sessionEpoch: stalled.sessionEpoch,
      preparedRooms: [preparedRoom(0), preparedRoom(1)],
    });
    initRecoveryHarness({
      refreshRunwayState: () => {
        refreshCalls += 1;
        getExploreSession().adoptRunway(ready);
      },
    });

    getExploreSession().adoptRunway(stalled);

    // First proceed pauses (nextRoomNotReady, empty log) → recovery fires once.
    const first = getExploreSession().recordRoomAction('proceed');
    assert.equal(first.accepted, false);
    assert.equal(first.reason, 'nextRoomNotReady');
    await waitFor(() => refreshCalls === 1 && !getExploreSession().isPaused());
    assert.equal(refreshCalls, 1, 'the first empty-log online soft-pause triggers a runway refresh');

    assert.equal(getExploreSession().recordRoomAction('proceed').accepted, true);
    assert.equal(refreshCalls, 1);
  });

  it('refreshes and resumes an empty-log pause through the controller online listener', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();

    try {
      let refreshCalls = 0;
      let refreshError = null;
      const recoveryEvents = [];
      const stalled = pausingRunway();
      const ready = makeRunway({
        sessionEpoch: stalled.sessionEpoch,
        preparedRooms: [preparedRoom(0), preparedRoom(1)],
      });
      initRecoveryHarness({
        refreshRunwayState: async ({ capture }) => {
          refreshCalls += 1;
          try {
            capture.fence.commit(
              'test empty runway adoption',
              capture.expectRunwayAdoption(ready, { deferResume: true }),
            );
            recoveryEvents.push('adopt/state');
          } catch (error) {
            refreshError = error;
            throw error;
          }
          return true;
        },
      });
      globalThis.window = windowTarget;
      globalThis.document = { ...previousDocument, ...documentTarget };
      // Re-init after installing the production event targets.
      initRecoveryHarness({
        onUpdateUI: () => recoveryEvents.push('resume/UI'),
        refreshRunwayState: async ({ capture }) => {
          refreshCalls += 1;
          try {
            capture.fence.commit(
              'test empty runway adoption',
              capture.expectRunwayAdoption(ready, { deferResume: true }),
            );
            recoveryEvents.push('adopt/state');
          } catch (error) {
            refreshError = error;
            throw error;
          }
          return true;
        },
      });
      getExploreSession().adoptRunway(stalled);
      assert.equal(getExploreSession().recordRoomAction('proceed').reason, 'nextRoomNotReady');
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(windowTarget.listeners.get('online')?.length, 1);
      assert.equal(refreshCalls, 1, 'the pause itself starts the first controller-owned refresh');
      assert.equal(refreshError, null);
      windowTarget.dispatch('online');
      await waitFor(() => !getExploreSession().isPaused());

      assert.equal(getExploreSession().pendingCount(), 0);
      assert.deepEqual(recoveryEvents, ['adopt/state', 'resume/UI']);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
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
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('keeps pending-log transport retry ownership out of the pause controller', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();
    let refreshCalls = 0;
    let syncCalls = 0;
    try {
      globalThis.window = windowTarget;
      globalThis.document = { ...previousDocument, ...documentTarget, visibilityState: 'visible' };
      initRecoveryHarness({
        refreshRunwayState: async () => { refreshCalls += 1; return true; },
        apiSyncExploreSession: async () => {
          syncCalls += 1;
          return completeTransport({ protocolVersion: 1, status: 'ok', confirmedThroughSeq: 1, results: [] });
        },
      });
      const session = getExploreSession();
      session.adoptRunway(makeRunway({ preparedRooms: [preparedRoom(0, {
        acceptedActions: ['friendlyNpc.choose'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      })] }));
      assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
      session.pause('transportDegraded');
      windowTarget.dispatch('online');
      documentTarget.dispatch('visibilitychange');
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(refreshCalls, 0);
      assert.equal(syncCalls, 0);
      assert.equal(session.pendingCount(), 1);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });

  it('renders exact Retry and drains pending work on one explicit redelivery', async () => {
    let syncCalls = 0;
    initRecoveryHarness({
      apiSyncExploreSession: async ({ entries }) => {
        syncCalls += 1;
        if (syncCalls <= 12) return completeTransport({});
        return completeTransport({ protocolVersion: 1, status: 'ok', confirmedThroughSeq: entries.at(-1).seq, results: [] });
      },
    });
    const session = getExploreSession();
    session.adoptRunway(makeRunway({ preparedRooms: [preparedRoom(0, {
      acceptedActions: ['friendlyNpc.choose'],
      actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
    })] }));
    session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });

    for (let attempt = 0; attempt < 12; attempt += 1) await session.syncNow();

    assert.match(actionArea.innerHTML, /Unsynced progress can be lost if you reload/);
    const retryButton = renderedButtons(actionArea).find(button => button.innerHTML === 'Retry');
    assert.ok(retryButton, 'transport degradation renders the exact Retry control');
    const pendingBeforeClick = session.pendingCount();
    retryButton.click();
    await waitFor(() => syncCalls === 13 && session.pendingCount() === 0);
    assert.equal(pendingBeforeClick, 1);
    assert.equal(session.pendingCount(), 0);
  });

  it('reviews writer conflict through its supplied preserved capture without resuming', async () => {
    let reviewed = 0;
    let suppliedCapture = null;
    let toastCalls = 0;
    let syncCalls = 0;
    initRecoveryHarness({
      apiSyncExploreSession: async ({ entries }) => {
        syncCalls += 1;
        if (syncCalls === 1) {
          return completeTransport(
            { protocolVersion: 2, status: 'conflict', reason: 'writer_lease_mismatch' },
            { httpStatus: 409 },
          );
        }
        return completeTransport({ status: 'ok', confirmedThroughSeq: entries.at(-1).seq, results: [] });
      },
      reviewAuthoritativeState: async ({ capture }) => {
        reviewed += 1;
        suppliedCapture = capture;
        return true;
      },
      showToast: () => { toastCalls += 1; },
    });
    const session = getExploreSession();
    session.adoptRunway(makeRunway({ preparedRooms: [preparedRoom(0, {
      acceptedActions: ['friendlyNpc.choose'],
      actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
    })] }));
    session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
    await session.syncNow();

    assert.deepEqual(renderedButtons(actionArea).map(button => button.innerHTML), [
      'Review latest progress',
      'Keep paused',
    ]);
    renderedButtons(actionArea)[0].click();
    await waitFor(() => reviewed === 1);
    assert.equal(suppliedCapture?.fence != null, true);
    assert.equal(syncCalls, 1);
    assert.equal(session.pendingCount(), 1);
    assert.equal(session.getPauseReason(), 'writerConflict');
    renderedButtons(actionArea)[1].click();
    assert.equal(toastCalls, 1);
  });

  it('keeps writer conflict inert through current online and visible-tab controller events', async () => {
    let syncCalls = 0;
    let refreshCalls = 0;
    let reviewCalls = 0;
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();
    documentTarget.visibilityState = 'visible';
    try {
      globalThis.window = windowTarget;
      globalThis.document = { ...previousDocument, ...documentTarget };
      initRecoveryHarness({
        refreshRunwayState: async () => { refreshCalls += 1; return true; },
        reviewAuthoritativeState: async () => { reviewCalls += 1; return true; },
        apiSyncExploreSession: async () => {
          syncCalls += 1;
          return completeTransport(
            { protocolVersion: 2, status: 'conflict', reason: 'writer_lease_mismatch' },
            { httpStatus: 409 },
          );
        },
      });
      const session = getExploreSession();
      session.adoptRunway(makeRunway({ preparedRooms: [preparedRoom(0, {
        acceptedActions: ['friendlyNpc.choose'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      })] }));
      session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
      await session.syncNow();

      windowTarget.dispatch('online');
      await Promise.resolve();
      await Promise.resolve();
      documentTarget.dispatch('visibilitychange');
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(syncCalls, 1);
      assert.equal(refreshCalls, 0);
      assert.equal(reviewCalls, 0);
      assert.equal(session.getPauseReason(), 'writerConflict');
      assert.deepEqual(renderedButtons(actionArea).map(button => button.innerHTML), [
        'Review latest progress',
        'Keep paused',
      ]);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });

  it('fences one auth recovery through same-epoch adoption and one redelivery without taking auth UI', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowTarget = makeEventTarget();
    const documentTarget = makeEventTarget();
    documentTarget.visibilityState = 'visible';
    let adoptionCalls = 0;
    let reauthenticationCalls = 0;
    let acknowledgements = 0;
    let syncCalls = 0;
    const claim = Object.freeze({});
    actionArea.innerHTML = 'auth-owned actions';
    try {
      globalThis.window = windowTarget;
      globalThis.document = { ...previousDocument, ...documentTarget };
      initRecoveryHarness({
        reauthenticate: async () => { reauthenticationCalls += 1; return true; },
        claimReauthentication: async () => claim,
        releaseReauthentication: () => assert.fail('the successful owned recovery must not release its claim'),
        adoptRecoveryState: async () => { adoptionCalls += 1; return true; },
        acknowledgeReauthentication: suppliedClaim => {
          assert.equal(suppliedClaim, claim);
          acknowledgements += 1;
          return true;
        },
        apiSyncExploreSession: async () => {
          syncCalls += 1;
          if (syncCalls > 1) {
            return completeTransport({ protocolVersion: 1, status: 'ok', confirmedThroughSeq: 1, results: [] });
          }
          return completeTransport({ error: 'expired' }, { httpStatus: 401 });
        },
      });
      const session = getExploreSession();
      session.adoptRunway(makeRunway({ preparedRooms: [preparedRoom(0, {
        acceptedActions: ['friendlyNpc.choose'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      })] }));
      session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
      await session.syncNow();
      windowTarget.dispatch('online');
      documentTarget.dispatch('visibilitychange');
      await waitFor(() => session.pendingCount() === 0 && syncCalls === 2 && acknowledgements === 1);

      assert.equal(session.getPauseReason(), null);
      assert.equal(session.pendingCount(), 0);
      assert.equal(actionArea.innerHTML, 'auth-owned actions');
      assert.equal(reauthenticationCalls, 1);
      assert.equal(adoptionCalls, 1);
      assert.equal(acknowledgements, 1);
      assert.equal(syncCalls, 2);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });

  it('does not render a stale lower pause over authoritative authRequired', () => {
    let currentReason = 'nextRoomNotReady';
    const session = {
      pendingCount: () => 1,
      isPaused: () => true,
      getPauseReason: () => currentReason,
      pause: () => { currentReason = 'authRequired'; },
    };
    const narrations = [];
    const actions = [];
    const controller = createExploreSessionPauseController({
      getSession: () => session,
      refreshRunwayState: async () => assert.fail('auth must not refresh runway'),
      reviewAuthoritativeState: async () => assert.fail('auth must not review'),
      renderNarration: value => narrations.push(value),
      renderActions: value => actions.push(value),
      showToast: () => {},
      schedule: () => 0,
      cancel: () => {},
      windowTarget: makeEventTarget(),
      documentTarget: makeEventTarget(),
    });
    controller.handlePause({ reason: 'nextRoomNotReady' });
    assert.equal(currentReason, 'authRequired');
    assert.deepEqual(narrations, []);
    assert.deepEqual(actions, []);
    controller.dispose();
  });
});
