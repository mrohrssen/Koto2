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
    getTutorialNarration: step => (step === 2
      ? ["Here you'll be offered items to power up. Choose wisely!"]
      : []),
    getFormationNarration: () => '',
    getPostHinonekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const { init, renderFriendlyNpc } = await import('../../../public/js/ui/exploration.js');

describe('renderFriendlyNpc item prompt', () => {
  beforeEach(() => {
    renderedChoices = null;
    dialogueCards = [];
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
  });

  it('shows the NPC greeting as a dialogue card before item choices', async () => {
    const narrationCalls = [];
    const actionContent = [];
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
      actions: { setContent: html => { actionContent.push(html); }, clear: () => {} },
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

    assert.equal(narrationCalls.length, 0);
    assert.equal(dialogueCards[0].speaker, 'Guide');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: 'こんにちは！' }]);
    assert.ok(
      actionContent.every(html => !/prologue-continue-hint|Tap here to continue!/i.test(html)),
      'friendly NPC setup should not show a click-to-continue hint before a clickable continuation exists'
    );
    assert.ok(actionContent.every(html => !/Loading/i.test(html)));
    assert.ok(renderedChoices, 'item choices should still render after the prompt');
    assert.equal(renderedChoices.heading, 'Choose an item');
  });

  it('refetches offers and greeting when a new run reuses the same friendly NPC room id', async () => {
    let offerCalls = 0;
    let currentState;
    const makeRoom = () => ({
      id: 'friendly-npc-same-room-id',
      type: 'friendlyNpc',
      npc: { name: '案内人', nameEn: 'Guide' },
      friendlyNpc: { completed: false },
    });

    currentState = {
      phase: 'friendlyNpc',
      room: makeRoom(),
      meta: { tutorialStep: 0 },
      run: {
        stats: { startTime: 1000 },
        creatureParty: { active: [] },
      },
    };

    init({
      getGameState: () => currentState,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetFriendlyNpcOffers: async () => {
        offerCalls += 1;
        const id = offerCalls === 1 ? 'first-run-item' : 'second-run-item';
        const word = offerCalls === 1 ? 'りんご' : 'みず';
        return {
          greeting: {
            tokens: [{ text: `greeting-${offerCalls}` }],
            overrides: {},
          },
          offered: [
            {
              id,
              word,
              reading: word,
              nameToken: { text: id },
              effect: { healAllPercent: 0.2 },
            },
          ],
        };
      },
    });

    await renderFriendlyNpc();

    currentState = {
      phase: 'friendlyNpc',
      room: makeRoom(),
      meta: { tutorialStep: 0 },
      run: {
        stats: { startTime: 2000 },
        creatureParty: { active: [] },
      },
    };

    await renderFriendlyNpc();

    assert.equal(offerCalls, 2);
    assert.equal(dialogueCards.length, 2);
    assert.deepEqual(dialogueCards[1].tokens, [{ text: 'greeting-2' }]);
    assert.equal(renderedChoices.cards[0].title, 'second-run-item');
  });

  it('spawns the room NPC sprite before the greeting dialogue card', async () => {
    const events = [];
    const room = {
      id: 'friendly-npc-sprite-room',
      type: 'friendlyNpc',
      npc: { id: 'kodomo', name: '子供', nameEn: 'Child' },
      friendlyNpc: { completed: false },
    };
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite(spritePath) {
        events.push(['showNpcSprite', spritePath]);
        this.npcSprite = { spritePath };
      },
      async hideNpcSprite() {
        events.push(['hideNpcSprite']);
        this.npcSprite = null;
      },
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
      scene: { showNarration: async () => {} },
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

    assert.equal(events[0][0], 'showNpcSprite');
    assert.match(events[0][1], /\/assets\/sprites\/npcs\/kodomo\.webp\?v=test/);
    assert.equal(dialogueCards[0].speaker, 'Child');
    assert.equal(dialogueCards[0].speakerId, 'kodomo');
  });

  it('does not respawn the NPC sprite when room travel already placed it', async () => {
    const events = [];
    const room = {
      id: 'friendly-npc-existing-sprite-room',
      type: 'friendlyNpc',
      npc: { id: 'kodomo', name: '子供', nameEn: 'Child' },
      friendlyNpc: { completed: false },
    };
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      npcSprite: { spritePath: '/assets/sprites/npcs/kodomo.webp?v=test' },
      async showNpcSprite(spritePath) {
        events.push(['showNpcSprite', spritePath]);
      },
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
      scene: { showNarration: async () => {} },
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

    assert.deepEqual(events, []);
    assert.equal(dialogueCards[0].speaker, 'Child');
    assert.equal(dialogueCards[0].speakerId, 'kodomo');
  });

  it('in tutorial mode lets Cid interrupt after the NPC greeting before item choices', async () => {
    const narrationCalls = [];
    const spriteCalls = [];
    const room = {
      id: 'friendly-npc-tutorial-room',
      type: 'friendlyNpc',
      npc: { id: 'shopkeeper', name: '店員', nameEn: 'Shopkeeper' },
      friendlyNpc: { completed: false },
    };
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite(spritePath) {
        spriteCalls.push(['show', spritePath]);
        this.npcSprite = { spritePath };
      },
      async hideNpcSprite() {
        spriteCalls.push(['hide']);
        this.npcSprite = null;
      },
    };

    init({
      getGameState: () => ({
        phase: 'friendlyNpc',
        room,
        meta: { tutorialStep: 2 },
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
          tokens: [{ text: 'いらっしゃいませ！' }],
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

    assert.equal(dialogueCards[0].speaker, 'Shopkeeper');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: 'いらっしゃいませ！' }]);
    assert.match(spriteCalls[0][1], /shopkeeper\.webp\?v=test/);
    assert.match(spriteCalls[1][1], /cid\.webp\?v=test/);
    assert.equal(spriteCalls[2][0], 'hide');
    assert.match(spriteCalls[3][1], /shopkeeper\.webp\?v=test/);
    assert.equal(narrationCalls.length, 1);
    assert.equal(narrationCalls[0].content, "Here you'll be offered items to power up. Choose wisely!");
    assert.equal(narrationCalls[0].options.speaker, 'Cid');
    assert.ok(renderedChoices, 'item choices should render after tutorial prompt');
    assert.equal(renderedChoices.heading, 'Choose an item');
  });

  it('shows player item request as a You dialogue card before applying the item', async () => {
    let itemApplied = false;
    const room = {
      id: 'friendly-npc-player-request-room',
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
      scene: { showNarration: async () => {} },
      apiGetFriendlyNpcOffers: async () => ({
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
      apiChooseFriendlyNpcItem: async () => {
        itemApplied = true;
        return { state: { updated: true } };
      },
    });

    await renderFriendlyNpc();
    await renderedChoices.onSelect(0);

    const youLine = dialogueCards.find(card => card.speaker === 'You');
    assert.ok(youLine);
    assert.match(youLine.html || youLine.text || '', /ください|りんご/);
    assert.equal(itemApplied, true);
  });

  it('labels friendly NPC item target selection with Choose target', async () => {
    let itemApplied = false;
    const room = {
      id: 'friendly-npc-target-test-room',
      type: 'friendlyNpc',
      npc: { name: '案内人', nameEn: 'Guide' },
      friendlyNpc: { completed: false },
    };

    init({
      getGameState: () => ({
        phase: 'friendlyNpc',
        room,
        meta: { tutorialStep: 0 },
        run: {
          creatureParty: {
            active: [
              { id: 'neko', name: '猫', nameEn: 'Cat', level: 2, hp: 8, maxHp: 10 },
              { id: 'tori', name: '鳥', nameEn: 'Bird', level: 3, hp: 12, maxHp: 12 },
            ],
          },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetFriendlyNpcOffers: async () => ({
        offered: [
          {
            id: 'test-apple',
            word: 'りんご',
            reading: 'りんご',
            nameToken: { text: 'りんご' },
            effect: { healPercent: 0.3 },
          },
        ],
      }),
      apiChooseFriendlyNpcItem: async () => {
        itemApplied = true;
        return {};
      },
    });

    await renderFriendlyNpc();
    await renderedChoices.onSelect(0);

    assert.equal(itemApplied, false);
    assert.equal(renderedChoices?.heading, 'Choose target');
  });
});
