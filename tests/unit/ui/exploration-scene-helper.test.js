import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Bug #8 regression guard: the helper that resolves which scene owns NPC
// rendering during exploration/skillMaster/prologue must accept any scene with
// an `npcs` layer — NOT just ExplorationScene. The prior `getExplorationScene`
// helper returned null whenever HubScene was active (e.g., during skillMaster
// tutorial for a fresh account, or during prologue), causing Cid's sprite to
// never render. The fix renames the helper and broadens its contract.

const sceneManagerState = { currentScene: null };
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});

// ExplorationScene import isn't needed by the new helper but the module still
// imports it (for back-compat). Stub it minimally so the import doesn't throw.
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});

// Heavy transitive deps pulled in by exploration.js. Stub to the bare minimum
// needed for importing the module; these tests only exercise the helper.
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
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async () => {} },
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

const { getSceneWithNpcs } = await import('../../../public/js/ui/exploration.js');

describe('getSceneWithNpcs (Bug #8 fix)', () => {
  beforeEach(() => {
    sceneManagerState.currentScene = null;
  });

  it('returns null when no scene is mounted', () => {
    sceneManagerState.currentScene = null;
    assert.equal(getSceneWithNpcs(), null);
  });

  it('returns null when the current scene is disposed', () => {
    sceneManagerState.currentScene = {
      disposed: true,
      layers: { npcs: {} },
    };
    assert.equal(getSceneWithNpcs(), null);
  });

  it('returns null when the current scene is exiting', () => {
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: true,
      layers: { npcs: {} },
    };
    assert.equal(getSceneWithNpcs(), null);
  });

  it('returns null when the current scene has no npcs layer', () => {
    sceneManagerState.currentScene = {
      disposed: false,
      layers: { background: {}, creatures: {} },
    };
    assert.equal(getSceneWithNpcs(), null);
  });

  it('returns the scene when it has an npcs layer — regardless of class', () => {
    // This is the core of the Bug #8 fix: HubScene (not ExplorationScene) must
    // be accepted so Cid's sprite renders during skillMaster/prologue/hub.
    const hubScene = {
      constructor: { name: 'HubScene' },
      disposed: false,
      layers: { background: {}, npcs: {}, creatures: {}, labels: {} },
    };
    sceneManagerState.currentScene = hubScene;
    assert.equal(getSceneWithNpcs(), hubScene);
  });

  it('returns the scene for ExplorationScene + BattleScene too', () => {
    for (const sceneName of ['ExplorationScene', 'BattleScene']) {
      const scene = {
        constructor: { name: sceneName },
        disposed: false,
        layers: { npcs: {} },
      };
      sceneManagerState.currentScene = scene;
      assert.equal(getSceneWithNpcs(), scene, `${sceneName} should resolve`);
    }
  });
});
