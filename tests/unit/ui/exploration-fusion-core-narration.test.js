import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
let speedReviewStartArgs = null;

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', {
  namedExports: {
    start: (words, options) => {
      speedReviewStartArgs = { words, options };
      return true;
    },
  },
});
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
  namedExports: { playRoomTransition: async () => {} },
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
await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: { showWordLevelUp: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(t => t.text || t.base || '').join(''),
    getKnownWords: () => new Set(),
  },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => [],
    getFormationNarration: () => '',
    getPostHinekoReviewNarration: () => [],
    getFusionCoreNarration: () => ['fusion core line'],
    getPostFusionNarration: () => [],
  },
});

const { init, renderHub } = await import('../../../public/js/ui/exploration.js');

describe('renderHub fusion core review narration', () => {
  beforeEach(() => {
    renderedButtons = [];
    speedReviewStartArgs = null;
    sceneManagerState.currentScene = null;
    globalThis.document = {
      body: {},
      getElementById: () => null,
      querySelectorAll: () => [],
    };
  });

  it('defers Cid fusion-core narration until the player exits speed review', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: ['hineko'],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        creatureCollection: [],
      },
    };
    let narrationCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: {
        showNarration: async () => {
          narrationCalls += 1;
        },
      },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => ({ count: 1 }),
      apiGetDueWords: async () => ({
        words: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
      }),
      apiClaimTutorialFusionCore: async () => ({
        message: 'Obtained 1x Fusion Core!',
        state: {
          ...gameState,
          meta: {
            ...gameState.meta,
            tutorialFusionCoreAwarded: true,
            fusionCores: 1,
          },
        },
      }),
    });

    await renderHub();
    const reviewButton = renderedButtons.find(button => button.label.includes('Knowledge Review'));
    assert.ok(reviewButton, 'Knowledge Review button should render');

    await reviewButton.onClick();
    assert.equal(speedReviewStartArgs?.words?.length, 1);

    await speedReviewStartArgs.options.onComplete();
    assert.equal(narrationCalls, 0);

    assert.equal(typeof speedReviewStartArgs.options.onExit, 'function');
    await speedReviewStartArgs.options.onExit();
    assert.equal(narrationCalls, 1);
  });
});
