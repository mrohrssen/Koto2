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

function makeState({ currentRoom = 0, exploreRunway } = {}) {
  const rooms = [room(0), room(1), room(2)];
  return {
    player: { id: 'player-1' },
    phase: 'room',
    room: rooms[currentRoom],
    run: {
      active: true,
      currentRoom,
      roomActionSeq: 100 + currentRoom,
      rooms,
      revealedRooms: rooms.map((entry, index) => ({ index, room: entry })),
      exploreRunway,
    },
  };
}

function makeRunway(overrides = {}) {
  return {
    sessionEpoch: 'ese_cutover111111',
    roomActionSeq: 100,
    currentRoom: 0,
    preparedRooms: [
      preparedRoom(0, { actionSeq: 100 }),
      preparedRoom(1, { actionSeq: 101 }),
      preparedRoom(2, { actionSeq: 102 }),
    ],
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
  init({
    getGameState: () => currentState,
    updateGameState: state => { currentState = state; },
    updateUI: () => { updateUiCalls += 1; },
    actions: {
      clear: () => { actionClears.push('clear'); },
      setContent: () => {},
    },
    scene: { showNarration: () => {} },
    apiProceed,
    apiSyncExploreSession,
  });
  return {
    get currentState() { return currentState; },
    get updateUiCalls() { return updateUiCalls; },
    actionClears,
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
        return { actionId: options.actionId, state: advancedState };
      },
    });

    const result = await proceedWithRevealBuffer();

    assert.equal(proceedCalls.length, 1);
    assert.equal(proceedCalls[0].fromRoom, 0);
    assert.equal(proceedCalls[0].actionSeq, 100);
    assert.equal(harness.currentState, advancedState);
    assert.equal(transitionCalls.length, 1);
    assert.equal(transitionCalls[0].state.run.currentRoom, 1);
    assert.equal(actionArea.innerHTML, '');
    assert.equal(result.state, advancedState);
  });

  it('queues consecutive offline proceeds for the advanced room instead of duplicating the stale runway room', async () => {
    const harness = initCutoverHarness({
      initialState: makeState({ currentRoom: 0, exploreRunway: makeRunway() }),
    });

    const first = await proceedWithRevealBuffer();
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
});
