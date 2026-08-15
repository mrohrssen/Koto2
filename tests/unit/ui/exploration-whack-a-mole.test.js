import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { makeExploreV1OkTransport } from '../../helpers/explore-sync-transport.js';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
const roomTransitionCalls = [];
let dialogueCalls = [];
let whackAMoleDeps = null;
let whackAMolePool = null;
let dialogueGate = null;
let whackAMoleStartCalls = 0;
let whackAMoleCancelCalls = 0;

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

globalThis.__wamTest = {
  sceneManagerState,
  renderedButtons,
  roomTransitionCalls,
  get dialogueCalls() { return dialogueCalls; },
  waitForDialogue: () => dialogueGate?.promise,
  setWhackAMoleDeps: deps => { whackAMoleDeps = deps; },
  setWhackAMolePool: pool => { whackAMolePool = pool; },
  recordWhackAMoleStart: () => { whackAMoleStartCalls += 1; },
  recordWhackAMoleCancel: () => { whackAMoleCancelCalls += 1; },
};

function makeWhackAMoleState(room, {
  nextRoom = null,
  acceptedActions = ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
  interactionPayload = null,
  activeStandard = false,
  offlineReady = true,
  missingPayloadReasons = [],
} = {}) {
  const revealedRooms = [{ index: 0, room }];
  const preparedRooms = [{
    index: 0,
    roomId: room.id,
    room,
    actionSeq: 1,
    offlineReady,
    missingPayloadReasons,
    acceptedActions,
    actionEffects: {
      'whackAMole.complete': ['credits', 'partyStats'],
      'whackAMole.skip': [],
      proceed: ['ingredients', 'areaProgress'],
    },
    interactionPayload: interactionPayload || { kind: 'whackAMole' },
  }];
  if (nextRoom) {
    revealedRooms.push({ index: 1, room: nextRoom });
    preparedRooms.push({
      index: 1,
      roomId: nextRoom.id,
      room: nextRoom,
      actionSeq: 2,
      offlineReady: true,
      acceptedActions: ['proceed'],
      actionEffects: { proceed: ['ingredients', 'areaProgress'] },
      interactionPayload: { kind: nextRoom.type || 'room' },
    });
  }
  return {
    phase: 'whackAMole',
    room,
    run: {
      ...(activeStandard ? { active: true, mode: 'standard' } : {}),
      currentRoom: 0,
      totalRooms: nextRoom ? 2 : 1,
      rooms: nextRoom ? [room, nextRoom] : [room],
      revealedRooms,
      exploreRunway: {
        sessionEpoch: 'wam-test-epoch',
        currentRoom: 0,
        roomActionSeq: 1,
        preparedRooms,
      },
    },
  };
}

function makePreparedWhackPayload(roomId = 'wam-prepared') {
  const tokenFrame = text => ({ tokens: [{ surface: text, text }], words: [] });
  return {
    kind: 'whackAMole',
    roomId,
    dialogue: tokenFrame('遊ぶ？'),
    yesTokens: tokenFrame('はい'),
    noTokens: tokenFrame('いいえ'),
    pool: Array.from({ length: 9 }, (_, index) => ({
      id: `prepared-${index}`,
      type: 'creature',
      word: `語${index}`,
      reading: `ご${index}`,
      meaning: `word ${index}`,
      sprite: `/prepared-${index}.webp`,
    })),
  };
}

const mockSources = new Map(Object.entries({
  '../scenes/scene-manager.js': 'export const getSceneManager = () => globalThis.__wamTest.sceneManagerState;',
  '../scenes/exploration-scene.js': 'export class ExplorationScene {}',
  './speed-review.js': '',
  './whack-a-mole.js': `
    export class WhackAMoleGame {
      constructor(pool, deps) {
        this.pool = pool;
        globalThis.__wamTest.setWhackAMolePool(pool);
        globalThis.__wamTest.setWhackAMoleDeps(deps);
      }
      start() { globalThis.__wamTest.recordWhackAMoleStart(); }
      cancel() { globalThis.__wamTest.recordWhackAMoleCancel(); }
    }
  `,
  '../audio.js': 'export const playSFX = () => {};',
  '../native/index.js': 'export const hapticLight = () => {};',
  './sprite-utils.js': `
    export const creatureBgUrl = () => '';
    export const itemSpriteHtml = () => '';
    export const creatureStaticPath = () => '';
    export const SPRITE_VERSION = 'test';
  `,
  './combat-dom.js': `
    export const hideEnemy = () => {};
    export const showFormation = () => {};
    export const hideFormation = () => {};
  `,
  './exploration-dom.js': 'export const showNpcInDisplay = () => {};',
  './i18n.js': `
    export const t = (...a) => a.join(' ');
    export const isJapanified = () => false;
  `,
  './chests.js': '',
  './crests-equip.js': '',
  './item-effect-pills.js': 'export const buildItemEffectPills = () => "";',
  './room-transition.js': `
    export const playRoomTransition = async (state, opts) => {
      globalThis.__wamTest.roomTransitionCalls.push({ state, opts });
    };
  `,
  './ui-components.js': `
    export const renderButtons = buttons => {
      globalThis.__wamTest.renderedButtons.length = 0;
      globalThis.__wamTest.renderedButtons.push(...buttons);
    };
    export const renderChoices = () => {};
  `,
  './event-popup.js': `
    export const buff = () => {};
    export const itemGained = () => {};
  `,
  './dom-effects.js': `
    export const pop = () => {};
    export const flashElement = () => {};
  `,
  '../api.js': `
    export const savePvpTeam = async () => {};
    export const getPvpTeams = async () => [];
  `,
  './bootstrap-client.js': `
    export const renderJpSentence = tokens => tokens.map(t => t.text || t.base || '').join('');
    export const getKnownWords = () => new Set();
    export const addKnownWord = () => {};
    export const removeKnownWord = () => {};
    export const entityToToken = value => value;
  `,
  './npc-dialogue-card.js': `
    export const showNpcDialogueCard = async options => {
      globalThis.__wamTest.dialogueCalls.push(options);
      await globalThis.__wamTest.waitForDialogue();
    };
  `,
  './tutorial-copy.js': `
    export const getTutorialNarration = () => [];
    export const getFormationNarration = () => '';
    export const getPostHinonekoReviewNarration = () => [];
    export const getFusionCoreNarration = () => [];
    export const getPostFusionNarration = () => [];
  `,
  '../../../public/js/scenes/scene-manager.js': 'export const getSceneManager = () => globalThis.__wamTest.sceneManagerState;',
  '../../../public/js/scenes/exploration-scene.js': 'export class ExplorationScene {}',
  '../../../public/js/ui/speed-review.js': '',
  '../../../public/js/ui/whack-a-mole.js': `
    export class WhackAMoleGame {
      constructor(pool, deps) {
        this.pool = pool;
        globalThis.__wamTest.setWhackAMolePool(pool);
        globalThis.__wamTest.setWhackAMoleDeps(deps);
      }
      start() { globalThis.__wamTest.recordWhackAMoleStart(); }
      cancel() { globalThis.__wamTest.recordWhackAMoleCancel(); }
    }
  `,
  '../../../public/js/audio.js': 'export const playSFX = () => {};',
  '../../../public/js/native/index.js': 'export const hapticLight = () => {};',
  '../../../public/js/ui/sprite-utils.js': `
    export const creatureBgUrl = () => '';
    export const itemSpriteHtml = () => '';
    export const creatureStaticPath = () => '';
    export const SPRITE_VERSION = 'test';
  `,
  '../../../public/js/ui/combat-dom.js': `
    export const hideEnemy = () => {};
    export const showFormation = () => {};
    export const hideFormation = () => {};
  `,
  '../../../public/js/ui/exploration-dom.js': 'export const showNpcInDisplay = () => {};',
  '../../../public/js/ui/i18n.js': `
    export const t = (...a) => a.join(' ');
    export const isJapanified = () => false;
  `,
  '../../../public/js/ui/chests.js': '',
  '../../../public/js/ui/crests-equip.js': '',
  '../../../public/js/ui/item-effect-pills.js': 'export const buildItemEffectPills = () => "";',
  '../../../public/js/ui/room-transition.js': `
    export const playRoomTransition = async (state, opts) => {
      globalThis.__wamTest.roomTransitionCalls.push({ state, opts });
    };
  `,
  '../../../public/js/ui/ui-components.js': `
    export const renderButtons = buttons => {
      globalThis.__wamTest.renderedButtons.length = 0;
      globalThis.__wamTest.renderedButtons.push(...buttons);
    };
    export const renderChoices = () => {};
  `,
  '../../../public/js/ui/event-popup.js': `
    export const buff = () => {};
    export const itemGained = () => {};
  `,
  '../../../public/js/ui/dom-effects.js': `
    export const pop = () => {};
    export const flashElement = () => {};
  `,
  '../../../public/js/api.js': `
    export const savePvpTeam = async () => {};
    export const getPvpTeams = async () => [];
  `,
  '../../../public/js/ui/bootstrap-client.js': `
    export const renderJpSentence = tokens => tokens.map(t => t.text || t.base || '').join('');
    export const getKnownWords = () => new Set();
    export const addKnownWord = () => {};
    export const removeKnownWord = () => {};
    export const entityToToken = value => value;
  `,
  '../../../public/js/ui/npc-dialogue-card.js': `
    export const showNpcDialogueCard = async options => {
      globalThis.__wamTest.dialogueCalls.push(options);
      await globalThis.__wamTest.waitForDialogue();
    };
  `,
  '../../../public/js/ui/tutorial-copy.js': `
    export const getTutorialNarration = () => [];
    export const getFormationNarration = () => '';
    export const getPostHinonekoReviewNarration = () => [];
    export const getFusionCoreNarration = () => [];
    export const getPostFusionNarration = () => [];
  `,
}));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mockSources.has(specifier)) {
      return { url: `mock:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('mock:')) {
      const specifier = decodeURIComponent(url.slice('mock:'.length));
      return { format: 'module', source: mockSources.get(specifier), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { init, renderExploring, renderRunEnded, renderWhackAMole } = await import('../../../public/js/ui/exploration.js');
const { getExploreSession, resetExploreSession } = await import('../../../public/js/ui/explore-session.js');

describe('renderWhackAMole decline flow', () => {
  beforeEach(() => {
    renderedButtons.length = 0;
    roomTransitionCalls.length = 0;
    sceneManagerState.currentScene = null;
    dialogueCalls = [];
    whackAMoleDeps = null;
    whackAMolePool = null;
    dialogueGate = null;
    whackAMoleStartCalls = 0;
    whackAMoleCancelCalls = 0;
    resetExploreSession();
  });

  it('treats completed Kanji Kombat run-ended state as a victory report', () => {
    const reportCalls = [];
    init({
      getGameState: () => ({
        phase: 'run_ended',
        run: {
          mode: 'kanjiKombat',
          kanjiKombat: {
            report: { completedDaily: true },
          },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      showAdventureReport: isVictory => { reportCalls.push(isVictory); },
    });

    renderRunEnded();

    assert.deepEqual(reportCalls, [true]);
  });

  it('clears the prompt buttons immediately when the player declines', async () => {
    let actionContent = 'buttons visible';
    init({
      getGameState: () => makeWhackAMoleState({
        id: 'wam-1',
        type: 'whackAMole',
        interacted: false,
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: html => { actionContent = html; },
        clear: () => { actionContent = ''; },
      },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: null,
        yesTokens: null,
        noTokens: null,
      }),
      // This one-room fixture is canonically final. Production always wires the
      // legacy proceed endpoint that performs area completion; return no state
      // here because this assertion only covers immediate prompt clearing.
      apiProceed: async () => null,
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    assert.equal(renderedButtons.length, 2);

    const decline = renderedButtons[1].onClick();
    assert.equal(actionContent, '');
    await decline;
  });

  it('decline records a session action and advances locally', async () => {
    const whackRoom = {
      id: 'wam-skip-accepted',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-skip', type: 'empty' };
    let currentState = makeWhackAMoleState(whackRoom, {
      nextRoom,
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(whackRoom.id),
    });
    let updateUiCalls = 0;

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: null,
        yesTokens: null,
        noTokens: null,
      }),
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.deepEqual(
      getExploreSession().snapshot().map(entry => entry.kind),
      ['whackAMole.skip', 'proceed'],
    );
    assert.equal(currentState.phase, 'no_save');
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.room.id, 'after-wam-skip');
    assert.equal(currentState.run.revealedRooms[0].room.interacted, true);
    assert.equal(currentState.run.revealedRooms[0].room.whackAMole.completed, true);
    assert.equal(currentState.run.revealedRooms[0].room.whackAMole.skipped, true);
    assert.equal(updateUiCalls, 1);
  });

  it('quietly retires decline controls after their prepared capability changes', async () => {
    const whackRoom = {
      id: 'wam-skip-rejected',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-rejected', type: 'empty' };
    let currentState = makeWhackAMoleState(whackRoom, {
      nextRoom,
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(whackRoom.id),
    });
    let updateUiCalls = 0;
    const narrationCalls = [];

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: {
        showNarration: (text, opts) => {
          narrationCalls.push({ text, opts });
        },
      },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: null,
        yesTokens: null,
        noTokens: null,
      }),
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    currentState.run.exploreRunway.preparedRooms[0].acceptedActions = ['whackAMole.complete'];
    getExploreSession().adoptRunway(currentState.run.exploreRunway);
    await renderedButtons[1].onClick();

    assert.deepEqual(getExploreSession().snapshot(), []);
    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.run.currentRoom, 0);
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, []);
    assert.equal(getExploreSession().isPaused(), false);
    assert.equal(updateUiCalls, 0);
  });

  it('quietly retires Whack completion after its prepared capability changes', async () => {
    const whackRoom = {
      id: 'wam-complete-rejected',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(whackRoom.id),
    });
    const narrationCalls = [];

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: {
        showNarration: (text, opts) => {
          narrationCalls.push({ text, opts });
        },
      },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: null,
        yesTokens: null,
        noTokens: null,
      }),
      apiGetWhackAMolePool: async () => ({ pool: Array.from({ length: 9 }, (_, id) => ({ id })) }),
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();
    currentState.run.exploreRunway.preparedRooms[0].acceptedActions = ['whackAMole.skip'];
    getExploreSession().adoptRunway(currentState.run.exploreRunway);

    assert.ok(whackAMoleDeps);
    const result = await whackAMoleDeps.apiCompleteWhackAMole(3);

    assert.equal(result, null);
    assert.deepEqual(getExploreSession().snapshot(), []);
    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, []);
    assert.equal(getExploreSession().isPaused(), false);
  });

  it('completion records a session action and marks the room complete locally', async () => {
    const whackRoom = {
      id: 'wam-complete-accepted',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(whackRoom.id),
    });

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: {
        showNarration: (text, opts) => {
          narrationCalls.push({ text, opts });
        },
      },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: null,
        yesTokens: null,
        noTokens: null,
      }),
      apiGetWhackAMolePool: async () => ({ pool: Array.from({ length: 9 }, (_, id) => ({ id })) }),
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    const result = await whackAMoleDeps.apiCompleteWhackAMole(3);

    assert.equal(result.accepted, true);
    assert.deepEqual(getExploreSession().snapshot().map(entry => ({
      kind: entry.kind,
      payload: entry.payload,
      roomIndex: entry.roomIndex,
      roomId: entry.roomId,
    })), [{
      kind: 'whackAMole.complete',
      payload: { score: 3 },
      roomIndex: 0,
      roomId: 'wam-complete-accepted',
    }]);
    assert.equal(currentState.phase, 'room');
    assert.equal(currentState.room.interacted, true);
    assert.equal(currentState.room.whackAMole.completed, true);
    assert.equal(currentState.room.whackAMole.score, 3);
  });

  it('keeps completion bound to the session that started the Whack game', async () => {
    const roomA = { id: 'wam-owner-a', type: 'whackAMole', interacted: false };
    let currentState = makeWhackAMoleState(roomA, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(roomA.id),
    });

    const callbacks = state => ({
      getGameState: () => state(),
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });
    init(callbacks(() => currentState));
    await renderWhackAMole();
    await renderedButtons[0].onClick();

    const ownerSession = getExploreSession();
    const ownerCompletion = whackAMoleDeps.apiCompleteWhackAMole;
    const roomB = { id: 'wam-owner-b', type: 'whackAMole', interacted: false };
    currentState = makeWhackAMoleState(roomB, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(roomB.id),
    });
    init(callbacks(() => currentState));
    const replacementSession = getExploreSession();
    replacementSession.adoptRunway(currentState.run.exploreRunway);

    const result = await ownerCompletion(4);

    assert.notEqual(replacementSession, ownerSession);
    assert.equal(result, null);
    assert.deepEqual(ownerSession.snapshot(), []);
    assert.deepEqual(replacementSession.snapshot(), []);
    assert.equal(replacementSession.isPaused(), false);
    assert.equal(currentState.room.id, roomB.id);
    assert.equal(currentState.room.interacted, false);
  });

  it('does not let an old Whack game proceed a same-kind successor room', async () => {
    const roomA = { id: 'wam-proceed-owner-a', type: 'whackAMole', interacted: false };
    let currentState = makeWhackAMoleState(roomA, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(roomA.id),
    });
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      apiProceed: async () => { throw new Error('legacy proceed must remain fenced'); },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();
    const oldProceed = whackAMoleDeps.apiProceed;

    const roomB = { id: 'wam-proceed-owner-b', type: 'whackAMole', interacted: false };
    const afterB = { id: 'after-wam-proceed-owner-b', type: 'empty' };
    currentState = makeWhackAMoleState(roomB, {
      nextRoom: afterB,
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(roomB.id),
    });
    getExploreSession().adoptRunway(currentState.run.exploreRunway);

    const result = await oldProceed();

    assert.equal(result, null);
    assert.deepEqual(getExploreSession().snapshot(), []);
    assert.equal(currentState.run.currentRoom, 0);
    assert.equal(currentState.room.id, roomB.id);
    assert.equal(roomTransitionCalls.length, 0);
  });

  it('replaces same-room Whack payload data and cancels the old live game first', async () => {
    const roomId = 'wam-same-room-owner';
    const roomA = { id: roomId, type: 'whackAMole', interacted: false };
    const payloadA = makePreparedWhackPayload(roomId);
    payloadA.dialogue = { tokens: [{ text: 'Prompt alpha' }], words: [] };
    payloadA.pool = payloadA.pool.map(entry => ({ ...entry, id: `alpha-${entry.id}` }));
    let currentState = makeWhackAMoleState(roomA, {
      activeStandard: true,
      interactionPayload: payloadA,
    });
    let legacyGets = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => { legacyGets += 1; return null; },
      apiGetWhackAMolePool: async () => { legacyGets += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();
    const cancelsBeforeReplacement = whackAMoleCancelCalls;

    const roomB = { id: roomId, type: 'whackAMole', interacted: false };
    const payloadB = makePreparedWhackPayload(roomId);
    payloadB.dialogue = { tokens: [{ text: 'Prompt beta' }], words: [] };
    payloadB.pool = payloadB.pool.map(entry => ({ ...entry, id: `beta-${entry.id}` }));
    currentState = makeWhackAMoleState(roomB, {
      activeStandard: true,
      interactionPayload: payloadB,
    });
    getExploreSession().adoptRunway(currentState.run.exploreRunway);
    await renderWhackAMole();

    assert.equal(whackAMoleCancelCalls, cancelsBeforeReplacement + 1);
    assert.match(dialogueCalls.at(-1).tokens[0].text, /beta/);
    await renderedButtons[0].onClick();
    assert.match(whackAMolePool[0].id, /^beta-/);
    assert.equal(legacyGets, 0);
  });

  it('cancels a live Whack game before a benign same-owner rerender repaints controls', async () => {
    const room = { id: 'wam-same-owner-rerender', type: 'whackAMole', interacted: false };
    const state = makeWhackAMoleState(room, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(room.id),
    });
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();
    const cancelsBeforeRerender = whackAMoleCancelCalls;
    assert.equal(whackAMoleStartCalls, 1);

    await renderWhackAMole();

    assert.equal(whackAMoleCancelCalls, cancelsBeforeRerender + 1);
    assert.equal(whackAMoleStartCalls, 1);
    assert.equal(renderedButtons.length, 2);
  });

  it('shows the Game Master greeting with the standard dialogue card', async () => {
    const prompt = {
      tokens: [{ base: '始める', text: 'はじめる' }],
      overrides: { 始める: 'begin' },
      audio: { userId: 'u1', key: 'gm-intro.wav' },
    };
    let showNarrationCalls = 0;

    init({
      getGameState: () => makeWhackAMoleState({
        id: 'wam-dialogue',
        type: 'whackAMole',
        interacted: false,
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: { showNarration: () => { showNarrationCalls += 1; } },
      apiGetWhackAMoleDialogue: async () => ({
        dialogue: prompt,
        yesTokens: null,
        noTokens: null,
      }),
    });

    await renderWhackAMole();

    assert.equal(showNarrationCalls, 0);
    assert.equal(dialogueCalls.length, 1);
    assert.equal(dialogueCalls[0].speaker, 'Game Master');
    assert.equal(dialogueCalls[0].speakerId, 'game-master');
    assert.equal(dialogueCalls[0].tokens, prompt.tokens);
    assert.equal(dialogueCalls[0].overrides, prompt.overrides);
    assert.equal(dialogueCalls[0].useKanji, false);
    assert.deepEqual(dialogueCalls[0].audio, { userId: 'u1', key: 'gm-intro.wav' });
    assert.equal(renderedButtons.length, 2);
  });

  it('keeps fallback controls when Game Master dialogue is unavailable', async () => {
    init({
      getGameState: () => makeWhackAMoleState({
        id: 'wam-dialogue-unavailable',
        type: 'whackAMole',
        interacted: false,
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => null,
    });

    await renderWhackAMole();

    assert.equal(dialogueCalls.length, 0);
    assert.equal(renderedButtons.length, 2);
    assert.equal(renderedButtons[0].label, 'Yes');
    assert.equal(renderedButtons[1].label, 'No');
  });

  it('routes an incomplete active-standard Whack payload to the passive pause controller', async () => {
    const narrationCalls = [];
    let dialogueGets = 0;
    let poolGets = 0;
    const room = { id: 'wam-incomplete', type: 'whackAMole', interacted: false };

    init({
      getGameState: () => makeWhackAMoleState(room, {
        activeStandard: true,
        offlineReady: true,
        missingPayloadReasons: ['whackAMole.pool'],
        interactionPayload: { kind: 'whackAMole', roomId: room.id },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: (text, opts) => narrationCalls.push({ text, opts }) },
      apiGetWhackAMoleDialogue: async () => {
        dialogueGets += 1;
        throw new Error('legacy dialogue GET must remain fenced');
      },
      apiGetWhackAMolePool: async () => {
        poolGets += 1;
        throw new Error('legacy pool GET must remain fenced');
      },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();

    assert.equal(dialogueGets, 0);
    assert.equal(poolGets, 0);
    assert.equal(renderedButtons.length, 0);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(getExploreSession().getPauseReason(), 'missingPayload');
    assert.equal(narrationCalls.length, 1);
    assert.deepEqual(narrationCalls[0], {
      text: 'Preparing the next room. Please wait…',
      opts: { autoDismiss: 1800 },
    });
  });

  it('requires canonical proceed capability before exposing active-session Whack controls', async () => {
    const room = { id: 'wam-missing-proceed', type: 'whackAMole', interacted: false };
    let legacyGets = 0;

    init({
      getGameState: () => makeWhackAMoleState(room, {
        activeStandard: true,
        acceptedActions: ['whackAMole.complete', 'whackAMole.skip'],
        interactionPayload: makePreparedWhackPayload(room.id),
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => { legacyGets += 1; },
      apiGetWhackAMolePool: async () => { legacyGets += 1; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();

    assert.equal(legacyGets, 0);
    assert.equal(renderedButtons.length, 0);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(getExploreSession().getPauseReason(), 'missingPayload');
  });

  it('keeps a paused valid Whack capability non-playable without legacy GETs', async () => {
    const room = { id: 'wam-paused-valid', type: 'whackAMole', interacted: false };
    const state = makeWhackAMoleState(room, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(room.id),
    });
    let legacyGets = 0;
    let clearCalls = 0;

    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => { clearCalls += 1; } },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => { legacyGets += 1; },
      apiGetWhackAMolePool: async () => { legacyGets += 1; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });
    getExploreSession().adoptRunway(state.run.exploreRunway);
    getExploreSession().pause('missingPayload');

    await renderWhackAMole();

    assert.equal(legacyGets, 0);
    assert.equal(renderedButtons.length, 0);
    assert.ok(clearCalls > 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('does not publish Whack controls when the session pauses during the intro dialogue', async () => {
    const room = { id: 'wam-pause-during-intro', type: 'whackAMole', interacted: false };
    const state = makeWhackAMoleState(room, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(room.id),
    });
    let clearCalls = 0;
    let legacyGets = 0;
    dialogueGate = deferred();

    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => { clearCalls += 1; renderedButtons.length = 0; },
      },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => { legacyGets += 1; return null; },
      apiGetWhackAMolePool: async () => { legacyGets += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    const rendering = renderWhackAMole();
    await Promise.resolve();
    assert.equal(dialogueCalls.length, 1, 'intro dialogue should be awaiting dismissal');

    getExploreSession().pause('missingPayload');
    dialogueGate.resolve();
    await rendering;

    assert.equal(renderedButtons.length, 0);
    assert.ok(clearCalls > 0);
    assert.equal(whackAMoleStartCalls, 0);
    assert.equal(legacyGets, 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('revalidates Whack ownership when Yes is clicked after the session pauses', async () => {
    const room = { id: 'wam-pause-after-render', type: 'whackAMole', interacted: false };
    const state = makeWhackAMoleState(room, {
      activeStandard: true,
      interactionPayload: makePreparedWhackPayload(room.id),
    });
    let clearCalls = 0;
    let legacyGets = 0;

    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => { clearCalls += 1; renderedButtons.length = 0; },
      },
      scene: { showNarration: () => {} },
      apiGetWhackAMoleDialogue: async () => { legacyGets += 1; return null; },
      apiGetWhackAMolePool: async () => { legacyGets += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();
    assert.equal(renderedButtons.length, 2);
    const yes = renderedButtons[0];
    getExploreSession().pause('missingPayload');
    await yes.onClick();

    assert.equal(whackAMoleStartCalls, 0);
    assert.equal(whackAMolePool, null);
    assert.equal(renderedButtons.length, 0);
    assert.ok(clearCalls > 0);
    assert.equal(legacyGets, 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('legacy decline uses its combined skip-and-proceed endpoint exactly once', async () => {
    const room = { id: 'wam-legacy-skip', type: 'whackAMole', interacted: false };
    const nextRoom = { id: 'after-legacy-skip', type: 'empty' };
    let currentState = makeWhackAMoleState(room, { nextRoom });
    let skipCalls = 0;
    let proceedCalls = 0;

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => ({ dialogue: null, yesTokens: null, noTokens: null }),
      apiSkipWhackAMole: async () => {
        skipCalls += 1;
        return {
          state: {
            ...currentState,
            phase: 'room',
            room: nextRoom,
            run: { ...currentState.run, currentRoom: 1 },
          },
        };
      },
      apiProceed: async () => { proceedCalls += 1; },
    });

    assert.equal(getExploreSession(), null, 'legacy fixture has no configured session owner');
    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.equal(skipCalls, 1);
    assert.equal(proceedCalls, 0);
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.room.id, 'after-legacy-skip');
  });

  it('drops a legacy decline response after navigation changes its render owner', async () => {
    const room = { id: 'wam-legacy-stale-skip', type: 'whackAMole', interacted: false };
    const nextRoom = { id: 'after-stale-legacy-skip', type: 'empty' };
    let currentState = makeWhackAMoleState(room, { nextRoom });
    currentState.run.stats = { startTime: 7101 };
    const skipGate = deferred();
    let updateUiCalls = 0;
    let adoptedOldState = false;
    let actionContent = '';

    init({
      getGameState: () => currentState,
      updateGameState: state => { adoptedOldState = true; currentState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: html => { actionContent = html; },
        clear: () => { actionContent = ''; },
      },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => ({ dialogue: null, yesTokens: null, noTokens: null }),
      apiSkipWhackAMole: async () => skipGate.promise,
    });

    await renderWhackAMole();
    const declining = renderedButtons[1].onClick();
    await Promise.resolve();

    const successor = { id: 'combat-after-stale-skip', type: 'encounter' };
    const successorState = {
      phase: 'room_encounter',
      room: successor,
      run: {
        stats: { startTime: 7101 },
        currentRoom: 1,
        rooms: [room, successor],
      },
    };
    currentState = successorState;
    actionContent = 'successor controls';
    skipGate.resolve({
      state: {
        phase: 'room',
        room: nextRoom,
        run: {
          stats: { startTime: 7101 },
          currentRoom: 1,
          rooms: [room, nextRoom],
        },
      },
    });
    await declining;

    assert.equal(currentState, successorState);
    assert.equal(adoptedOldState, false);
    assert.equal(actionContent, 'successor controls');
    assert.equal(updateUiCalls, 0);
    assert.equal(roomTransitionCalls.length, 0);
  });

  it('no-session Yes flow uses legacy dialogue and pool APIs despite stale prepared content', async () => {
    const room = { id: 'wam-legacy-yes', type: 'whackAMole', interacted: false };
    const nextRoom = { id: 'after-legacy-yes', type: 'empty' };
    const stalePrepared = makePreparedWhackPayload(room.id);
    let currentState = makeWhackAMoleState(room, { nextRoom, interactionPayload: stalePrepared });
    let dialogueGets = 0;
    let poolGets = 0;
    let completionCalls = 0;
    let proceedCalls = 0;

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => {
        dialogueGets += 1;
        return {
          dialogue: stalePrepared.dialogue,
          yesTokens: stalePrepared.yesTokens,
          noTokens: stalePrepared.noTokens,
        };
      },
      apiGetWhackAMolePool: async () => {
        poolGets += 1;
        return { pool: stalePrepared.pool };
      },
      apiCompleteWhackAMole: async score => {
        completionCalls += 1;
        return { score };
      },
      apiProceed: async () => {
        proceedCalls += 1;
        return {
          state: {
            ...currentState,
            phase: 'room',
            room: nextRoom,
            run: { ...currentState.run, currentRoom: 1 },
          },
        };
      },
    });

    assert.equal(getExploreSession(), null);
    await renderWhackAMole();
    await renderedButtons[0].onClick();
    await whackAMoleDeps.apiCompleteWhackAMole(5);
    await whackAMoleDeps.apiProceed();

    assert.equal(dialogueGets, 1);
    assert.equal(poolGets, 1);
    assert.equal(completionCalls, 1);
    assert.equal(proceedCalls, 1);
    assert.equal(currentState.room.id, nextRoom.id);
    assert.ok(whackAMoleDeps);
  });

  it('passes normal proceed ingredient drops into the room transition', async () => {
    renderedButtons.length = 0;
    roomTransitionCalls.length = 0;

    const ingredientDrops = [{ ingredient: { nameEn: 'Water' }, quantity: 1 }];
    const advancedState = {
      phase: 'room',
      run: {
        currentRoom: 1,
        rooms: [{ type: 'empty' }, { type: 'empty' }],
        creatureParty: { active: [{ id: 'hi' }] },
      },
    };

    let updatedState = null;
    let updateUiCalls = 0;

    init({
      getGameState: () => ({
        phase: 'exploring',
        run: {
          currentRoom: 0,
          rooms: [{ type: 'empty' }],
        },
      }),
      updateGameState: state => { updatedState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: () => {},
        clear: () => {},
        triggerEquipBots: () => {},
      },
      apiProceed: async () => ({
        state: advancedState,
        ingredientDrops,
      }),
    });

    renderExploring();
    const proceedButton = renderedButtons.find(button => button.label.includes('進む'));
    assert.ok(proceedButton);

    await proceedButton.onClick();

    assert.equal(updatedState, advancedState);
    assert.equal(roomTransitionCalls.length, 1);
    assert.equal(roomTransitionCalls[0].state, advancedState);
    assert.deepEqual(roomTransitionCalls[0].opts, { ingredientDrops });
    assert.equal(updateUiCalls, 1);
  });

  it('gives an already-interacted Whack room one transition and render after recovery', async () => {
    const whackRoom = {
      id: 'wam-recovered',
      type: 'whackAMole',
      interacted: true,
      whackAMole: { completed: true, score: 4 },
    };
    const nextRoom = { id: 'after-wam-recovered', type: 'empty' };
    let currentState = makeWhackAMoleState(whackRoom, {
      nextRoom,
      acceptedActions: ['proceed'],
    });
    let updateUiCalls = 0;

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: { showNarration: async () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    await renderWhackAMole();

    assert.deepEqual(
      getExploreSession().snapshot().map(entry => entry.kind),
      ['proceed'],
    );
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.room.id, 'after-wam-recovered');
    assert.equal(roomTransitionCalls.length, 1);
    assert.equal(roomTransitionCalls[0].state, currentState);
    assert.deepEqual(roomTransitionCalls[0].opts, { ingredientDrops: [] });
    assert.equal(updateUiCalls, 1);
  });

  it('advances locally from the prepared runway after Whack-a-Mole completion', async () => {
    const nextRoom = { id: 'after-wam', type: 'empty' };
    const preparedPayload = makePreparedWhackPayload('wam-start');
    let currentState = {
      phase: 'whackAMole',
      room: { id: 'wam-start', type: 'whackAMole', interacted: false },
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        roomActionSeq: 7,
        rooms: [{ type: 'whackAMole' }, nextRoom],
        revealedRooms: [
          { index: 0, room: { id: 'wam-start', type: 'whackAMole', interacted: false } },
          { index: 1, room: nextRoom },
        ],
        exploreRunway: {
          sessionEpoch: 'wam-complete-runway',
          currentRoom: 0,
          roomActionSeq: 7,
          preparedRooms: [
            {
              index: 0,
              roomId: 'wam-start',
              actionSeq: 7,
              room: { id: 'wam-start', type: 'whackAMole', interacted: false },
              offlineReady: true,
              acceptedActions: ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
              actionEffects: {
                'whackAMole.complete': ['credits', 'partyStats'],
                'whackAMole.skip': [],
                proceed: ['ingredients', 'areaProgress'],
              },
              interactionPayload: preparedPayload,
            },
            {
              index: 1,
              roomId: 'after-wam',
              actionSeq: 8,
              room: nextRoom,
              offlineReady: true,
              acceptedActions: ['proceed'],
              actionEffects: { proceed: ['ingredients', 'areaProgress'] },
              interactionPayload: { kind: 'empty' },
            },
          ],
        },
      },
    };
    let updateUiCalls = 0;
    const proceedCalls = [];
    let dialogueGets = 0;
    let poolGets = 0;

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => { updateUiCalls += 1; },
      actions: {
        setContent: () => {},
        clear: () => {},
      },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => {
        dialogueGets += 1;
        throw new Error('legacy dialogue GET must not run');
      },
      apiGetWhackAMolePool: async () => {
        poolGets += 1;
        throw new Error('legacy pool GET must not run');
      },
      apiProceed: async options => {
        proceedCalls.push(options);
        throw new Error('legacy proceed should not run after session whack-a-mole completion');
      },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    await whackAMoleDeps.apiCompleteWhackAMole(4);
    const advanced = await whackAMoleDeps.apiProceed();

    const entries = getExploreSession().snapshot();
    assert.equal(roomTransitionCalls.length, 1);
    assert.equal(roomTransitionCalls[0].state, currentState);
    assert.deepEqual(roomTransitionCalls[0].opts, { ingredientDrops: [] });
    assert.deepEqual(
      entries.map(entry => entry.kind),
      ['whackAMole.complete', 'proceed'],
    );
    assert.equal(proceedCalls.length, 0);
    assert.equal(dialogueGets, 0);
    assert.equal(poolGets, 0);
    assert.deepEqual(whackAMolePool, preparedPayload.pool);
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.room.id, 'after-wam');
    assert.equal(updateUiCalls, 1);
    assert.deepEqual(advanced, {
      status: 'queued',
      actionId: entries[1].actionId,
    });
    resetExploreSession();
  });
});
