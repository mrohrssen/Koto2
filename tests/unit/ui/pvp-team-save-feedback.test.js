import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
let renderButtonOptions = [];
let actionContent = '';
let pvpSaveResult = { ok: true };
let pvpTeamsResult = { pvpTeams: [null, null, null] };

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
await mock.module('../../../public/js/ui/campfire.js', {
  namedExports: { init: () => {}, show: async () => {} },
});
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: { playRoomTransition: async () => {} },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderButtons: (buttons, options = {}) => {
      renderedButtons = buttons;
      renderButtonOptions.push(options);
    },
    renderChoices: () => {},
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
  namedExports: {
    savePvpTeam: async () => pvpSaveResult,
    getPvpTeams: async () => pvpTeamsResult,
  },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set(), entityToToken: value => value },
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

const { init, renderRunComplete } = await import('../../../public/js/ui/exploration.js');

describe('PvP team save feedback', () => {
  beforeEach(() => {
    renderedButtons = [];
    renderButtonOptions = [];
    actionContent = '';
    pvpSaveResult = { ok: true };
    pvpTeamsResult = { pvpTeams: [null, null, null] };
    sceneManagerState.currentScene = null;

    init({
      getGameState: () => ({ phase: 'run_complete' }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: html => { actionContent = html; },
        clear: () => { actionContent = ''; },
      },
      scene: { showToast: () => {} },
      showAdventureReport: () => {},
    });
  });

  it('treats a null PvP save response as an unconfirmed save', async () => {
    pvpSaveResult = null;
    const warnMock = mock.method(console, 'warn', () => {});

    try {
      renderRunComplete();
      await renderedButtons.find(button => button.label === 'Save Team for PvP').onClick();
      await renderedButtons[0].onClick();
    } finally {
      warnMock.mock.restore();
    }

    assert.match(actionContent, /Team was not saved\. Your draft is still here\./);
    assert.deepEqual(renderedButtons.map(button => button.label), ['Try Again', 'Cancel']);
    assert.equal(renderButtonOptions.at(-1)?.append, true);
  });
});
