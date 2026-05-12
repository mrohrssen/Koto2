import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
const roomTransitionCalls = [];
let dialogueCalls = [];

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
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

const { init, renderExploring, renderWhackAMole } = await import('../../../public/js/ui/exploration.js');

describe('renderWhackAMole decline flow', () => {
  beforeEach(() => {
    renderedButtons = [];
    roomTransitionCalls.length = 0;
    sceneManagerState.currentScene = null;
    dialogueCalls = [];
  });

  it('clears the prompt buttons immediately when the player declines', async () => {
    let actionContent = 'buttons visible';
    let resolveSkip;
    const skipPromise = new Promise(resolve => { resolveSkip = resolve; });

    init({
      getGameState: () => ({
        phase: 'whackAMole',
        run: {
          currentRoom: 0,
          rooms: [{ id: 'wam-1', type: 'whackAMole', interacted: false }],
        },
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

  it('shows the Game Master greeting with the standard dialogue card', async () => {
    const prompt = {
      tokens: [{ base: '始める', text: 'はじめる' }],
      overrides: { 始める: 'begin' },
    };
    let showNarrationCalls = 0;

    init({
      getGameState: () => ({
        phase: 'whackAMole',
        run: {
          currentRoom: 0,
          rooms: [{ id: 'wam-dialogue', type: 'whackAMole', interacted: false }],
        },
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
    assert.equal(renderedButtons.length, 2);
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
});
