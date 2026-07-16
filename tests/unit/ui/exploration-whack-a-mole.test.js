import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
const roomTransitionCalls = [];
let dialogueCalls = [];
let whackAMoleDeps = null;

globalThis.__wamTest = {
  sceneManagerState,
  renderedButtons,
  roomTransitionCalls,
  get dialogueCalls() { return dialogueCalls; },
  setWhackAMoleDeps: deps => { whackAMoleDeps = deps; },
};

function makeWhackAMoleState(room, {
  nextRoom = null,
  acceptedActions = ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
  interactionPayload = null,
} = {}) {
  const revealedRooms = [{ index: 0, room }];
  const preparedRooms = [{
    index: 0,
    roomId: room.id,
    room,
    actionSeq: 1,
    offlineReady: true,
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

const mockSources = new Map(Object.entries({
  '../scenes/scene-manager.js': 'export const getSceneManager = () => globalThis.__wamTest.sceneManagerState;',
  '../scenes/exploration-scene.js': 'export class ExplorationScene {}',
  './speed-review.js': '',
  './whack-a-mole.js': `
    export class WhackAMoleGame {
      constructor(pool, deps) {
        this.pool = pool;
        globalThis.__wamTest.setWhackAMoleDeps(deps);
      }
      start() {}
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
    export const entityToToken = value => value;
  `,
  './npc-dialogue-card.js': `
    export const showNpcDialogueCard = async options => {
      globalThis.__wamTest.dialogueCalls.push(options);
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
        globalThis.__wamTest.setWhackAMoleDeps(deps);
      }
      start() {}
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
    export const entityToToken = value => value;
  `,
  '../../../public/js/ui/npc-dialogue-card.js': `
    export const showNpcDialogueCard = async options => {
      globalThis.__wamTest.dialogueCalls.push(options);
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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
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
    let currentState = makeWhackAMoleState(whackRoom, { nextRoom });
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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
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

  it('decline rejection leaves state in place and shows retry copy', async () => {
    const whackRoom = {
      id: 'wam-skip-rejected',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-rejected', type: 'empty' };
    let currentState = makeWhackAMoleState(whackRoom, {
      nextRoom,
      acceptedActions: ['whackAMole.complete'],
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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.deepEqual(getExploreSession().snapshot(), []);
    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.run.currentRoom, 0);
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Connection is spotty. Your progress will sync when you reconnect.',
        opts: { autoDismiss: 1800 },
      },
    ]);
    assert.equal(updateUiCalls, 0);
  });

  it('completion shows retry copy when the session rejects the action', async () => {
    const whackRoom = {
      id: 'wam-complete-rejected',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom, {
      acceptedActions: ['whackAMole.skip'],
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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    const result = await whackAMoleDeps.apiCompleteWhackAMole(3);

    assert.equal(result, null);
    assert.deepEqual(getExploreSession().snapshot(), []);
    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Connection is spotty. Your progress will sync when you reconnect.',
        opts: { autoDismiss: 1800 },
      },
    ]);
  });

  it('completion records a session action and marks the room complete locally', async () => {
    const whackRoom = {
      id: 'wam-complete-accepted',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom);

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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
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
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
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
    let currentState = {
      phase: 'whackAMole',
      room: { id: 'wam-start', type: 'whackAMole', interacted: false },
      run: {
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
              interactionPayload: { kind: 'whackAMole' },
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
      apiGetWhackAMolePool: async () => ({ pool: Array.from({ length: 9 }, (_, id) => ({ id })) }),
      apiProceed: async options => {
        proceedCalls.push(options);
        throw new Error('legacy proceed should not run after session whack-a-mole completion');
      },
      apiSyncExploreSession: async () => ({ status: 'ok', confirmedThroughSeq: 1 }),
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
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.room.id, 'after-wam');
    assert.equal(updateUiCalls, 1);
    assert.deepEqual(advanced, {
      status: 'queued',
      actionId: entries[1].actionId,
    });
  });
});
