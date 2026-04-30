import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };

function createElementStub() {
  return {
    className: '',
    tabIndex: 0,
    style: {},
    innerHTML: '',
    children: [],
    classList: {
      add() {},
      remove() {},
    },
    setAttribute() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
    },
    querySelectorAll: () => [],
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
  namedExports: { renderButtons: () => {}, renderChoices: () => {} },
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
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set() },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => ['first Cid line'],
    getFormationNarration: () => '',
    getPostHinekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const { init, renderSkillMaster } = await import('../../../public/js/ui/exploration.js');

describe('renderSkillMaster tutorial Cid narration', () => {
  beforeEach(() => {
    sceneManagerState.currentScene = null;
  });

  it('does not restart Cid entrance narration on same-room rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNpcSpriteCalls = 0;
    let showNarrationCalls = 0;
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {
        showNpcSpriteCalls += 1;
      },
      async hideNpcSprite() {},
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 111 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }

    assert.equal(showNpcSpriteCalls, 1);
    assert.equal(showNarrationCalls, 1);
  });

  it('does not restart tutorial narration when initial skill pick is inferred from server state', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 222 },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 1);
  });
});
