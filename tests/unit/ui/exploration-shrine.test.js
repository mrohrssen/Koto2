import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;
let dialogueCards = [];

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
    creatureStaticPath: id => `/assets/sprites/creatures/${id}.webp`,
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
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCards.push(options); },
  },
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
    renderJpSentence: tokens => tokens.map(t => t.text || t.base || '').join(''),
    getKnownWords: () => new Set(),
    entityToToken: value => value,
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

const { init, renderShrine } = await import('../../../public/js/ui/exploration.js');

describe('renderShrine encounter flow', () => {
  beforeEach(() => {
    renderedChoices = null;
    dialogueCards = [];
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
  });

  function initShrine(overrides = {}) {
    init({
      getGameState: () => ({
        phase: 'shrine',
        room: {
          id: overrides.roomId || 'shrine-test-room',
          type: 'shrine',
          interacted: false,
          shrine: { completed: false, used: false }
        },
        run: {
          creatureParty: {
            active: [
              { id: 'hi', uid: 'active-hi', name: '火', nameEn: 'Hi', level: 2, hp: 10, maxHp: 20, mp: 1, maxMp: 10 }
            ],
            reserves: [
              { id: 'mizu', uid: 'reserve-mizu', name: '水', nameEn: 'Mizu', level: 3, hp: 12, maxHp: 30, mp: 2, maxMp: 15 },
              { id: 'ki', uid: 'reserve-ki', name: '木', nameEn: 'Ki', level: 4, hp: 0, maxHp: 40, mp: 0, maxMp: 20 }
            ]
          }
        }
      }),
      updateGameState: overrides.updateGameState || (() => {}),
      updateUI: overrides.updateUI || (() => {}),
      actions: overrides.actions || { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: overrides.apiGetShrineOffers || (async () => ({
        greeting: { tokens: [{ text: 'こんにちは！' }], overrides: {} },
        rewards: [
          { id: 'heal_all', title: 'Heal all creatures', description: 'Restore 50% HP.' },
          { id: 'restore_mp_all', title: 'Restore MP', description: 'Restore MP for all creatures to full.' },
          { id: 'level_up', title: 'Level up one creature', description: 'Choose one creature.' }
        ]
      })),
      apiChooseShrineReward: overrides.apiChooseShrineReward || (async () => ({ state: { updated: true } })),
    });
  }

  it('shows shrine greeting before the three reward choices', async () => {
    const actionContent = [];
    initShrine({
      roomId: 'shrine-greeting-room',
      actions: { setContent: html => { actionContent.push(html); }, clear: () => {} },
    });
    await renderShrine();

    assert.ok(
      actionContent.every(html => !/prologue-continue-hint|Click to continue!/i.test(html)),
      'shrine setup should not show a click-to-continue hint before a clickable continuation exists'
    );
    assert.equal(dialogueCards[0].speaker, 'Shrine Fox');
    assert.equal(dialogueCards[0].speakerId, 'shrine_fox');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: 'こんにちは！' }]);
    assert.equal(renderedChoices.heading, 'Choose shrine blessing');
    assert.deepEqual(renderedChoices.cards.map(card => card.title), [
      'Heal all creatures',
      'Restore MP',
      'Level up one creature'
    ]);
  });

  it('spawns shrine fox sprite in the active scene', async () => {
    const events = [];
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite(spritePath) {
        events.push(spritePath);
        this.npcSprite = { spritePath };
      }
    };
    initShrine({ roomId: 'shrine-sprite-room' });
    await renderShrine();

    assert.match(events[0], /\/assets\/sprites\/shrine_fox\.webp\?v=test/);
  });

  it('does not respawn shrine fox when room travel already placed the sprite', async () => {
    const events = [];
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      npcSprite: { spritePath: '/assets/sprites/shrine_fox.webp?v=test' },
      async showNpcSprite(spritePath) {
        events.push(spritePath);
      }
    };
    initShrine({ roomId: 'shrine-existing-sprite-room' });
    await renderShrine();

    assert.deepEqual(events, []);
  });

  it('chooses party-wide rewards without target selection', async () => {
    let chosen = null;
    initShrine({
      roomId: 'shrine-party-reward-room',
      apiChooseShrineReward: async (rewardType, creatureKey) => {
        chosen = { rewardType, creatureKey };
        return { state: { updated: true } };
      }
    });

    await renderShrine();
    await renderedChoices.onSelect(0);

    assert.deepEqual(chosen, { rewardType: 'heal_all', creatureKey: null });
  });

  it('renders living active and reserve targets for level-up and omits fainted creatures', async () => {
    let chosen = null;
    initShrine({
      roomId: 'shrine-level-target-room',
      apiChooseShrineReward: async (rewardType, creatureKey) => {
        chosen = { rewardType, creatureKey };
        return { state: { updated: true } };
      }
    });

    await renderShrine();
    await renderedChoices.onSelect(2);

    assert.equal(renderedChoices.heading, 'Choose creature to level up');
    assert.deepEqual(renderedChoices.cards.map(card => card.title), ['Hi Lv.2 -> Lv.3', 'Mizu Lv.3 -> Lv.4']);

    await renderedChoices.onSelect(1);
    assert.deepEqual(chosen, { rewardType: 'level_up', creatureKey: 'reserve-mizu' });
  });
});
