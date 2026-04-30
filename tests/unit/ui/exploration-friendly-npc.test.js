import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;

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
    renderButtons: () => {},
    renderChoices: choices => { renderedChoices = choices; },
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
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const { init, renderFriendlyNpc } = await import('../../../public/js/ui/exploration.js');

describe('renderFriendlyNpc item prompt', () => {
  beforeEach(() => {
    renderedChoices = null;
    sceneManagerState.currentScene = null;
  });

  it('shows the shared English item-choice line only after the NPC greeting', async () => {
    const narrationCalls = [];
    const room = {
      id: 'friendly-npc-test-room',
      type: 'friendlyNpc',
      npc: { name: '案内人', nameEn: 'Guide' },
      friendlyNpc: { completed: false },
    };

    init({
      getGameState: () => ({
        phase: 'friendlyNpc',
        room,
        meta: { tutorialStep: 0 },
        run: { creatureParty: { active: [] } },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: {
        showNarration: async (content, options = {}) => {
          narrationCalls.push({ content, options });
        },
      },
      apiGetFriendlyNpcOffers: async () => ({
        greeting: {
          tokens: [{ text: 'こんにちは！' }],
          overrides: {},
        },
        offered: [
          {
            id: 'test-apple',
            word: 'りんご',
            reading: 'りんご',
            nameToken: { text: 'りんご' },
            effect: { healAllPercent: 0.2 },
          },
        ],
      }),
    });

    await renderFriendlyNpc();

    assert.equal(narrationCalls.length, 2);
    assert.match(narrationCalls[0].content, /こんにちは！/);
    assert.doesNotMatch(narrationCalls[0].content, /Which item would you like\?/);
    assert.equal(narrationCalls[0].options.speaker, 'Guide');
    assert.notEqual(narrationCalls[0].options.persistent, true);
    assert.equal(narrationCalls[1].content, 'Which item would you like?');
    assert.equal(narrationCalls[1].options.speaker, 'Guide');
    assert.equal(narrationCalls[1].options.persistent, true);
    assert.ok(renderedChoices, 'item choices should still render after the prompt');
  });
});
