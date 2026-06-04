import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
const roomTransitionCalls = [];
let dialogueCalls = [];
let whackAMoleDeps = null;

function makeWhackAMoleState(room) {
  return {
    phase: 'whackAMole',
    room,
    run: {
      currentRoom: 0,
      totalRooms: 1,
      revealedRooms: [{ index: 0, room }],
    },
  };
}

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', { namedExports: {} });
await mock.module('../../../public/js/ui/whack-a-mole.js', {
  namedExports: {
    WhackAMoleGame: class {
      constructor(pool, deps) {
        this.pool = pool;
        whackAMoleDeps = deps;
      }

      start() {}
    },
  },
});
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/native/index.js', { namedExports: { hapticLight: () => {} } });
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureBgUrl: () => '', itemSpriteHtml: () => '', creatureStaticPath: () => '',
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
  namedExports: { t: (...a) => a.join(' '), isJapanified: () => false },
});
await mock.module('../../../public/js/ui/chests.js', { namedExports: {} });
await mock.module('../../../public/js/ui/crests-equip.js', { namedExports: {} });
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: {
    playRoomTransition: async (state, opts) => {
      roomTransitionCalls.push({ state, opts });
    },
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderButtons: buttons => { renderedButtons = buttons; },
    renderChoices: () => {},
  },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: { buff: () => {}, itemGained: () => {} },
});
await mock.module('../../../public/js/ui/dom-effects.js', {
  namedExports: { pop: () => {}, flashElement: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(t => t.text || t.base || '').join(''),
    getKnownWords: () => new Set(),
    entityToToken: value => value,
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async options => { dialogueCalls.push(options); } },
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

const { init, renderExploring, renderRunEnded, renderWhackAMole } = await import('../../../public/js/ui/exploration.js');

describe('renderWhackAMole decline flow', () => {
  beforeEach(() => {
    renderedButtons = [];
    roomTransitionCalls.length = 0;
    sceneManagerState.currentScene = null;
    dialogueCalls = [];
    whackAMoleDeps = null;
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
    let resolveSkip;
    const skipPromise = new Promise(resolve => { resolveSkip = resolve; });

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
      apiSkipWhackAMole: () => skipPromise,
    });

    await renderWhackAMole();
    assert.equal(renderedButtons.length, 2);

    const decline = renderedButtons[1].onClick();
    assert.equal(actionContent, '');

    resolveSkip({ state: null });
    await decline;
  });

  it('decline sends an optimistic action id and advances from the accepted state', async () => {
    const whackRoom = {
      id: 'wam-skip-accepted',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-skip', type: 'empty' };
    const acceptedState = {
      phase: 'room',
      room: nextRoom,
      run: {
        currentRoom: 1,
        rooms: [whackRoom, nextRoom],
        revealedRooms: [
          { index: 0, room: whackRoom },
          { index: 1, room: nextRoom },
        ],
      },
    };
    let currentState = {
      phase: 'whackAMole',
      room: whackRoom,
      run: {
        currentRoom: 0,
        rooms: [whackRoom, nextRoom],
        revealedRooms: [
          { index: 0, room: whackRoom },
          { index: 1, room: nextRoom },
        ],
      },
    };
    let skipOptions = null;
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
      apiSkipWhackAMole: async options => {
        skipOptions = options;
        return {
          status: 'accepted',
          actionId: options.actionId,
          actionType: 'whackAMole.skip',
          state: acceptedState,
        };
      },
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.ok(skipOptions?.actionId);
    assert.match(skipOptions.actionId, /^run_/);
    assert.deepEqual(currentState, acceptedState);
    assert.equal(updateUiCalls, 1);
  });

  it('decline correction restores authoritative Whack-a-Mole state and shows retry copy', async () => {
    const whackRoom = {
      id: 'wam-skip-corrected',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-corrected', type: 'empty' };
    const authoritativeState = {
      phase: 'whackAMole',
      room: whackRoom,
      run: {
        currentRoom: 0,
        rooms: [whackRoom, nextRoom],
        revealedRooms: [
          { index: 0, room: whackRoom },
          { index: 1, room: nextRoom },
        ],
      },
    };
    let currentState = {
      phase: 'whackAMole',
      room: whackRoom,
      run: {
        currentRoom: 0,
        rooms: [whackRoom, nextRoom],
        revealedRooms: [
          { index: 0, room: whackRoom },
          { index: 1, room: nextRoom },
        ],
      },
    };
    let skipOptions = null;
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
      apiSkipWhackAMole: async options => {
        skipOptions = options;
        return {
          status: 'corrected',
          actionId: options.actionId,
          actionType: 'whackAMole.skip',
          reason: 'No whack-a-mole room here',
          authoritativeState,
        };
      },
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.ok(skipOptions?.actionId);
    assert.match(skipOptions.actionId, /^run_/);
    assert.deepEqual(currentState, authoritativeState);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Game Master choice did not save. Please try again.',
        opts: { autoDismiss: 1800 },
      },
    ]);
    assert.equal(updateUiCalls, 1);
  });

  it('completion shows retry copy when another run action is already pending', async () => {
    const whackRoom = {
      id: 'wam-complete-pending',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom);
    let resolveComplete;
    let firstActionId = null;
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
      apiCompleteWhackAMole: async (_score, options) => {
        firstActionId = options.actionId;
        return new Promise(resolve => { resolveComplete = resolve; });
      },
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    const firstCompletion = whackAMoleDeps.apiCompleteWhackAMole(3);
    const secondCompletion = await whackAMoleDeps.apiCompleteWhackAMole(4);

    assert.equal(secondCompletion, null);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Game Master choice did not save. Please try again.',
        opts: { autoDismiss: 1800 },
      },
    ]);

    resolveComplete({
      status: 'accepted',
      actionId: firstActionId,
      actionType: 'whackAMole.complete',
      state: { phase: 'room', room: whackRoom, run: { currentRoom: 0 } },
    });
    await firstCompletion;
  });

  it('completion rolls back and shows retry copy when accepted response action id does not match', async () => {
    const whackRoom = {
      id: 'wam-complete-mismatch',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    let currentState = makeWhackAMoleState(whackRoom);
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
      apiCompleteWhackAMole: async () => ({
        status: 'accepted',
        actionId: 'run_wrong_action',
        actionType: 'whackAMole.complete',
        state: { phase: 'room', room: whackRoom, run: { currentRoom: 0 } },
      }),
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    const result = await whackAMoleDeps.apiCompleteWhackAMole(3);

    assert.equal(result, null);
    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Game Master choice did not save. Please try again.',
        opts: { autoDismiss: 1800 },
      },
    ]);
  });

  it('decline rolls back and shows retry copy when accepted response action id does not match', async () => {
    const whackRoom = {
      id: 'wam-skip-mismatch',
      type: 'whackAMole',
      interacted: false,
      whackAMole: { completed: false },
    };
    const nextRoom = { id: 'after-wam-mismatch', type: 'empty' };
    let currentState = {
      phase: 'whackAMole',
      room: whackRoom,
      run: {
        currentRoom: 0,
        rooms: [whackRoom, nextRoom],
        revealedRooms: [
          { index: 0, room: whackRoom },
          { index: 1, room: nextRoom },
        ],
      },
    };
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
      apiSkipWhackAMole: async () => ({
        status: 'accepted',
        actionId: 'run_wrong_skip',
        actionType: 'whackAMole.skip',
        state: { phase: 'room', room: nextRoom, run: { currentRoom: 1 } },
      }),
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narrationCalls, [
      {
        text: 'Game Master choice did not save. Please try again.',
        opts: { autoDismiss: 1800 },
      },
    ]);
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
    renderedButtons = [];
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

  it('uses composed proceed without replaying room travel after Whack-a-Mole completion', async () => {
    const nextRoom = { id: 'after-wam', type: 'empty' };
    const serverState = {
      phase: 'room',
      room: nextRoom,
      run: {
        currentRoom: 1,
        roomActionSeq: 8,
        rooms: [{ type: 'whackAMole' }, nextRoom],
        revealedRooms: [
          { index: 0, room: { id: 'wam-start', type: 'whackAMole' } },
          { index: 1, room: nextRoom },
        ],
      },
    };
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
        return {
          actionId: options.actionId,
          actionSeq: options.actionSeq,
          fromRoom: options.fromRoom,
          state: serverState,
        };
      },
    });

    await renderWhackAMole();
    await renderedButtons[0].onClick();

    assert.ok(whackAMoleDeps);
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: () => null };
    let advanced;
    try {
      advanced = await whackAMoleDeps.apiProceed();
      if (advanced?.state) {
        roomTransitionCalls.push({ state: advanced.state, opts: { replayed: true } });
      }
    } finally {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    }
    whackAMoleDeps.updateUI();

    assert.equal(proceedCalls.length, 1);
    assert.equal(roomTransitionCalls.length, 1);
    assert.equal(roomTransitionCalls[0].state.run.currentRoom, 1);
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(updateUiCalls, 1);
    assert.equal(advanced, null);
  });
});
