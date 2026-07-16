import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;
let dialogueCards = [];
let dialogueGate = null;
let choiceRenderCalls = 0;

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
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
    renderChoices: choices => { choiceRenderCalls += 1; renderedChoices = choices; },
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => {
      dialogueCards.push(options);
      await dialogueGate?.promise;
    },
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
const { getExploreSession, resetExploreSession } = await import('../../../public/js/ui/explore-session.js');

describe('renderShrine encounter flow', () => {
  beforeEach(() => {
    resetExploreSession();
    renderedChoices = null;
    dialogueCards = [];
    dialogueGate = null;
    choiceRenderCalls = 0;
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
  });

  function makePreparedShrineState(roomId, currentRoom = 0, variant = roomId) {
    const room = {
      id: roomId,
      type: 'shrine',
      interacted: false,
      shrine: { completed: false, used: false },
    };
    const rooms = [];
    rooms[currentRoom] = room;
    return {
      phase: 'shrine',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom,
        roomActionSeq: 40 + currentRoom,
        rooms,
        creatureParty: { active: [], reserves: [] },
        exploreRunway: {
          sessionEpoch: 'ese_shrineownership1',
          currentRoom,
          roomActionSeq: 40 + currentRoom,
          preparedRooms: [{
            index: currentRoom,
            roomId,
            actionSeq: 40 + currentRoom,
            room,
            acceptedActions: ['shrine.choose', 'proceed'],
            offlineReady: true,
            interactionPayload: {
              kind: 'shrine',
              roomId,
              greeting: { tokens: [{ text: `Greeting ${variant}` }], overrides: {} },
              rewards: [{ id: 'heal_all', title: `Heal ${variant}`, description: 'Heal everyone.' }],
              completed: false,
            },
          }],
        },
      },
    };
  }

  it('soft-pauses a malformed active standard shrine without calling legacy offers', async () => {
    const room = {
      id: 'shrine-malformed-standard',
      type: 'shrine',
      shrine: { completed: false, used: false },
    };
    const state = {
      phase: 'shrine',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        rooms: [room],
        creatureParty: { active: [], reserves: [] },
        exploreRunway: {
          sessionEpoch: 'ese_3333333333333333',
          currentRoom: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            room,
            acceptedActions: ['shrine.choose', 'proceed'],
            offlineReady: false,
            missingPayloadReasons: ['shrine.greeting'],
            interactionPayload: {
              kind: 'shrine',
              roomId: room.id,
              rewards: [{ id: 'heal_all', title: 'Heal', description: 'Heal all.' }],
              greeting: null,
              completed: false,
            },
          }],
        },
      },
    };
    let legacyCalls = 0;
    let clearCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => { clearCalls += 1; } },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
    });

    await renderShrine();

    assert.equal(legacyCalls, 0);
    assert.ok(clearCalls > 0);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(renderedChoices, null);
    assert.equal(dialogueCards.length, 0);
  });

  it('does not render shrine rewards when the session pauses during greeting dialogue', async () => {
    const state = makePreparedShrineState('shrine-paused-dialogue');
    let clearCalls = 0;
    let legacyCalls = 0;
    dialogueGate = deferred();
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => { clearCalls += 1; renderedChoices = null; },
      },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
    });

    const rendering = renderShrine();
    for (let i = 0; i < 8 && dialogueCards.length === 0; i += 1) await Promise.resolve();
    assert.equal(dialogueCards.length, 1, 'greeting should be awaiting dismissal');

    getExploreSession().pause('manual-test');
    dialogueGate.resolve();
    await rendering;

    assert.equal(renderedChoices, null);
    assert.ok(clearCalls > 0);
    assert.equal(choiceRenderCalls, 0);
    assert.equal(legacyCalls, 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('quietly retires an old shrine dialogue after a same-kind successor renders', async () => {
    let currentState = makePreparedShrineState('shrine-owner-a', 0);
    let legacyCalls = 0;
    dialogueGate = deferred();
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
    });

    const oldRendering = renderShrine();
    for (let i = 0; i < 8 && dialogueCards.length === 0; i += 1) await Promise.resolve();
    assert.equal(dialogueCards.length, 1);

    const oldGate = dialogueGate;
    dialogueGate = null;
    currentState = makePreparedShrineState('shrine-owner-b', 1);
    await renderShrine();
    assert.equal(choiceRenderCalls, 1);
    assert.match(renderedChoices.cards[0].title, /owner-b/);

    oldGate.resolve();
    await oldRendering;

    assert.equal(choiceRenderCalls, 1, 'old render must not repaint or clear successor controls');
    assert.match(renderedChoices.cards[0].title, /owner-b/);
    assert.equal(getExploreSession().isPaused(), false);
    assert.equal(legacyCalls, 0);
  });

  it('replaces cached shrine rewards and greeting for a new same-room capability', async () => {
    const roomId = 'shrine-same-room-owner';
    let currentState = makePreparedShrineState(roomId, 0, 'alpha');
    let legacyCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
    });

    await renderShrine();
    assert.match(renderedChoices.cards[0].title, /alpha/);

    currentState = makePreparedShrineState(roomId, 0, 'beta');
    getExploreSession().adoptRunway(currentState.run.exploreRunway);
    await renderShrine();

    assert.match(renderedChoices.cards[0].title, /beta/);
    assert.match(dialogueCards.at(-1).tokens[0].text, /beta/);
    assert.equal(legacyCalls, 0);
  });

  it('does not clear a non-support successor when old shrine dialogue settles', async () => {
    let currentState = makePreparedShrineState('shrine-before-combat', 0);
    let clearCalls = 0;
    dialogueGate = deferred();
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => { clearCalls += 1; renderedChoices = null; },
      },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { throw new Error('legacy offers must remain fenced'); },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
    });

    const oldRendering = renderShrine();
    for (let i = 0; i < 8 && dialogueCards.length === 0; i += 1) await Promise.resolve();
    assert.equal(dialogueCards.length, 1);

    const encounter = { id: 'combat-successor', type: 'encounter' };
    currentState = {
      phase: 'room_encounter',
      room: encounter,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 1,
        rooms: [null, encounter],
        exploreRunway: {
          sessionEpoch: 'ese_shrineownership1',
          currentRoom: 1,
          preparedRooms: [{
            index: 1,
            roomId: encounter.id,
            room: encounter,
            acceptedActions: ['encounter.start', 'combat.cycle'],
            offlineReady: true,
            interactionPayload: { kind: 'combat', roomId: encounter.id },
          }],
        },
      },
    };
    const successorControls = { heading: 'Fight' };
    renderedChoices = successorControls;
    const clearsBeforeSettlement = clearCalls;
    dialogueGate.resolve();
    await oldRendering;

    assert.equal(renderedChoices, successorControls);
    assert.equal(clearCalls, clearsBeforeSettlement);
    assert.equal(getExploreSession().isPaused(), false);
  });

  it('quietly drops a legacy shrine fetch after navigation to a non-support room', async () => {
    const room = {
      id: 'legacy-shrine-before-combat',
      type: 'shrine',
      interacted: false,
      shrine: { completed: false, used: false },
    };
    let currentState = {
      phase: 'shrine',
      room,
      run: { currentRoom: 0, rooms: [room], creatureParty: { active: [], reserves: [] } },
    };
    const offersGate = deferred();
    let legacyCalls = 0;
    let adoptedOldState = false;
    let clearCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { adoptedOldState = true; currentState = next; },
      updateUI: () => {},
      actions: {
        setContent: () => {},
        clear: () => { clearCalls += 1; renderedChoices = null; },
      },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => { legacyCalls += 1; return offersGate.promise; },
    });

    const oldRendering = renderShrine();
    await Promise.resolve();
    assert.equal(legacyCalls, 1);

    const encounter = { id: 'legacy-combat-successor', type: 'encounter' };
    currentState = {
      phase: 'room_encounter',
      room: encounter,
      run: { currentRoom: 1, rooms: [room, encounter] },
    };
    const successorControls = { heading: 'Fight' };
    renderedChoices = successorControls;
    const clearsBeforeSettlement = clearCalls;
    offersGate.resolve({
      state: { phase: 'shrine', room, run: { currentRoom: 0, rooms: [room] } },
      greeting: { tokens: [{ text: 'Old greeting' }], overrides: {} },
      rewards: [{ id: 'heal_all', title: 'Old reward', description: 'Old reward.' }],
    });
    await oldRendering;

    assert.equal(adoptedOldState, false);
    assert.equal(currentState.room.id, encounter.id);
    assert.equal(renderedChoices, successorControls);
    assert.equal(clearCalls, clearsBeforeSettlement);
  });

  it('restarts an orphaned same-owner legacy shrine fetch on rerender', async () => {
    const room = {
      id: 'legacy-shrine-overlap',
      type: 'shrine',
      interacted: false,
      shrine: { completed: false, used: false },
    };
    const state = {
      phase: 'shrine',
      room,
      run: {
        currentRoom: 0,
        stats: { startTime: 9101 },
        rooms: [room],
        creatureParty: { active: [], reserves: [] },
      },
    };
    const gates = [];
    let fetchCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: async () => {
        fetchCalls += 1;
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
      },
    });

    const firstRender = renderShrine();
    await Promise.resolve();
    assert.equal(fetchCalls, 1);

    const secondRender = renderShrine();
    await Promise.resolve();
    assert.equal(fetchCalls, 2, 'new render must re-own an unresolved cache load');

    gates[1].resolve({
      greeting: { tokens: [{ text: 'Current greeting' }], overrides: {} },
      rewards: [{ id: 'heal_all', title: 'Current reward', description: 'Current reward.' }],
    });
    await secondRender;
    const currentChoices = renderedChoices;
    assert.match(currentChoices.cards[0].title, /Current/);

    gates[0].resolve({
      greeting: { tokens: [{ text: 'Old greeting' }], overrides: {} },
      rewards: [{ id: 'heal_all', title: 'Old reward', description: 'Old reward.' }],
    });
    await firstRender;
    assert.equal(renderedChoices, currentChoices);
  });

  function initShrine(overrides = {}) {
    const roomId = overrides.roomId || 'shrine-test-room';
    const shrineRoom = {
      id: roomId,
      type: 'shrine',
      interacted: false,
      shrine: { completed: false, used: false }
    };
    init({
      getGameState: () => ({
        phase: 'shrine',
        room: shrineRoom,
        run: {
          currentRoom: 0,
          creatureParty: {
            active: [
              { id: 'hi', uid: 'active-hi', name: '火', nameEn: 'Hi', level: 2, hp: 10, maxHp: 20, mp: 1, maxMp: 10 }
            ],
            reserves: [
              { id: 'mizu', uid: 'reserve-mizu', name: '水', nameEn: 'Mizu', level: 3, hp: 12, maxHp: 30, mp: 2, maxMp: 15 },
              { id: 'ki', uid: 'reserve-ki', name: '木', nameEn: 'Ki', level: 4, hp: 0, maxHp: 40, mp: 0, maxMp: 20 }
            ]
          },
          exploreRunway: {
            sessionEpoch: `ese_${roomId.replace(/[^a-z0-9]/gi, '').slice(0, 12).padEnd(12, '0')}`,
            currentRoom: 0,
            preparedRooms: [{
              index: 0,
              roomId,
              actionSeq: 30,
              room: shrineRoom,
              acceptedActions: ['shrine.choose'],
              actionEffects: { 'shrine.choose': [] },
              dependencies: [],
              offlineReady: true,
            }],
          },
        }
      }),
      updateGameState: overrides.updateGameState || (() => {}),
      updateUI: overrides.updateUI || (() => {}),
      actions: overrides.actions || { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: overrides.apiGetShrineOffers || (async () => ({
        greeting: {
          tokens: [{ text: 'こんにちは！' }],
          overrides: {},
          audio: { userId: 'u1', key: 'shrine.wav' },
        },
        rewards: [
          { id: 'heal_all', title: 'Heal all creatures', description: 'Restore 50% HP.' },
          { id: 'restore_mp_all', title: 'Restore MP', description: 'Restore MP for all creatures to full.' },
          { id: 'level_up', title: 'Level up one creature', description: 'Choose one creature.' }
        ]
      })),
      apiChooseShrineReward: overrides.apiChooseShrineReward || (async () => ({ state: { updated: true } })),
      apiSyncExploreSession: async entries => ({ status: 'ok', confirmedThroughSeq: entries.at(-1)?.seq ?? null }),
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
      actionContent.every(html => !/prologue-continue-hint|Tap here to continue!/i.test(html)),
      'shrine setup should not show a click-to-continue hint before a clickable continuation exists'
    );
    assert.equal(dialogueCards[0].speaker, 'Shrine Fox');
    assert.equal(dialogueCards[0].speakerId, 'shrine_fox');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: 'こんにちは！' }]);
    assert.deepEqual(dialogueCards[0].audio, { userId: 'u1', key: 'shrine.wav' });
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

    assert.match(events[0], /\/assets\/sprites\/shrine_fox\.webp\?v=/);
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
    initShrine({ roomId: 'shrine-party-reward-room' });

    await renderShrine();
    await renderedChoices.onSelect(0);

    const [recordedAction] = getExploreSession().snapshot();
    assert.equal(recordedAction?.kind, 'shrine.choose');
    assert.deepEqual(recordedAction?.payload, { rewardType: 'heal_all', creatureKey: null });
  });

  it('renders living active and reserve targets for level-up and omits fainted creatures', async () => {
    initShrine({ roomId: 'shrine-level-target-room' });

    await renderShrine();
    await renderedChoices.onSelect(2);

    assert.equal(renderedChoices.heading, 'Choose creature to level up');
    assert.deepEqual(renderedChoices.cards.map(card => card.title), ['Hi Lv.2 -> Lv.3', 'Mizu Lv.3 -> Lv.4']);

    await renderedChoices.onSelect(1);
    const [recordedAction] = getExploreSession().snapshot();
    assert.equal(recordedAction?.kind, 'shrine.choose');
    assert.deepEqual(recordedAction?.payload, { rewardType: 'level_up', creatureKey: 'reserve-mizu' });
  });
});
