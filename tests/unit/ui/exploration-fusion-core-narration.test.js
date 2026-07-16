import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedButtons = [];
let domButtons = [];
let speedReviewStartArgs = null;
let speedReviewStartCount = 0;
let speedReviewActive = false;
let clientKnownWords = new Set();
let knownWordMembershipEvents = [];
let wordLevelUpCalls = [];
let flashCardWords = [];
let documentListeners = new Map();

function createDomButton(textContent) {
  const classes = new Set();
  return {
    textContent,
    classList: {
      add: className => classes.add(className),
      contains: className => classes.has(className),
    },
  };
}

function makeRunRoomState({
  phase,
  currentRoom = 0,
  room,
  meta = { pvpTeams: [], tutorialStep: 6 },
}) {
  return {
    phase,
    meta,
    room,
    run: {
      currentRoom,
      totalRooms: currentRoom + 1,
      revealedRooms: [{ index: currentRoom, room }],
    },
  };
}

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
      speedReviewStartCount += 1;
      speedReviewActive = true;
      return true;
    },
    isActive: () => speedReviewActive,
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
    renderButtons: buttons => {
      renderedButtons = buttons;
      domButtons = buttons.map(button => createDomButton(button.label));
    },
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
  namedExports: {
    showIngredientDropPopups: () => {},
    showWordLevelUp: (...args) => { wordLevelUpCalls.push(args); },
  },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(t => t.text || t.base || '').join(''),
    getKnownWords: () => clientKnownWords,
    addKnownWord: word => {
      clientKnownWords.add(word);
      knownWordMembershipEvents.push(['add', word]);
    },
    removeKnownWord: word => {
      clientKnownWords.delete(word);
      knownWordMembershipEvents.push(['remove', word]);
    },
    applyKnownWordReviewMembership: (word, result) => {
      const isKnown = typeof result?.isKnown === 'boolean' ? result.isKnown : result?.mastered;
      if (isKnown === true) {
        clientKnownWords.add(word);
        knownWordMembershipEvents.push(['add', word]);
      } else if (isKnown === false) {
        clientKnownWords.delete(word);
        knownWordMembershipEvents.push(['remove', word]);
      }
    },
    entityToToken: value => value,
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async () => {} },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: step => step === 4 ? ['knowledge review line'] : [],
    getFormationNarration: () => '',
    getPostHinonekoReviewNarration: () => [],
    getFusionCoreNarration: () => ['fusion core line'],
    getPostFusionNarration: () => ['post fusion line'],
  },
});

const {
  init,
  applyExploreSessionKnownWordReviewResults,
  proceedWithRevealBuffer,
  renderHub,
  renderSpeedReviewRoom,
  renderWordDiscovery,
} = await import('../../../public/js/ui/exploration.js');
const { getExploreSession, resetExploreSession } = await import('../../../public/js/ui/explore-session.js');

describe('renderHub fusion core review narration', () => {
  beforeEach(() => {
    resetExploreSession();
    renderedButtons = [];
    domButtons = [];
    speedReviewStartArgs = null;
    speedReviewStartCount = 0;
    speedReviewActive = false;
    clientKnownWords = new Set();
    knownWordMembershipEvents = [];
    wordLevelUpCalls = [];
    flashCardWords = [];
    documentListeners = new Map();
    sceneManagerState.currentScene = null;
    globalThis.document = {
      body: {},
      getElementById: () => null,
      querySelectorAll: () => domButtons,
      addEventListener: (type, listener) => { documentListeners.set(type, listener); },
      removeEventListener: (type, listener) => {
        if (documentListeners.get(type) === listener) documentListeners.delete(type);
      },
      dispatchEvent: event => {
        documentListeners.get(event.type)?.(event);
        return true;
      },
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    };
  });

  it('defers Cid fusion-core narration until the player exits speed review', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: ['hinoneko'],
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

  it('enables romaji annotations when launching knowledge review in kana mode', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        kanaMode: true,
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        creatureCollection: [],
      },
    };

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => ({ count: 1 }),
      apiGetDueWords: async () => ({
        words: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
      }),
    });

    await renderHub();
    const reviewButton = renderedButtons.find(button => button.label.includes('Knowledge Review'));
    assert.ok(reviewButton, 'Knowledge Review button should render');

    await reviewButton.onClick();

    assert.equal(speedReviewStartArgs?.options?.showRomaji, true);
  });

  it('enables romaji annotations when launching knowledge review outside kana mode', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        creatureCollection: [],
      },
    };

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => ({ count: 1 }),
      apiGetDueWords: async () => ({
        words: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
      }),
    });

    await renderHub();
    const reviewButton = renderedButtons.find(button => button.label.includes('Knowledge Review'));
    assert.ok(reviewButton, 'Knowledge Review button should render');

    await reviewButton.onClick();

    assert.equal(speedReviewStartArgs?.options?.showRomaji, true);
  });

  it('launches a session-owned speed review from its prepared snapshot without the legacy start API', async () => {
    const snapshotWords = [
      { word: '水', reading: 'みず', meanings: ['water'] },
      { word: '火', reading: 'ひ', meanings: ['fire'] },
      { word: '土', reading: 'つち', meanings: ['earth'] },
    ];
    let gameState = makeRunRoomState({
      phase: 'speedReviewRoom',
      room: {
        id: 'speed-room-1',
        type: 'speedReviewRoom',
        speedReviewRoom: { completed: false },
      },
    });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    gameState.run.totalRooms = 2;
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_speed_review_test',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: 'speed-room-1',
        room: gameState.room,
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['speedReview.commit', 'speedReview.complete', 'proceed'],
        interactionPayload: {
          kind: 'speedReviewRoom',
          roomId: 'speed-room-1',
          snapshotWords,
          snapshotWordKeys: ['水', '火', '土'],
          reviewedCards: 1,
          snapshotInitialized: true,
        },
      }, {
        index: 1,
        roomId: 'room-after-speed-review',
        actionSeq: 1,
        offlineReady: true,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
        dependencies: [],
        room: { id: 'room-after-speed-review', type: 'room' },
        interactionPayload: { kind: 'room' },
      }],
    };
    let legacyStartCalls = 0;
    let legacyProgressCalls = 0;
    let legacyCompleteCalls = 0;
    let syncCalls = 0;
    let autoProceedPromise = null;
    let online = false;
    let latestSyncResponse = null;

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => {
        if (gameState.phase === 'room' && autoProceedPromise === null) {
          autoProceedPromise = proceedWithRevealBuffer();
        }
      },
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiSyncExploreSession: async ({ entries }) => {
        syncCalls += 1;
        if (!online) throw new Error('offline');
        latestSyncResponse = {
          status: 'ok',
          confirmedThroughSeq: entries.at(-1)?.seq ?? null,
          results: entries
            .filter(entry => entry.kind === 'speedReview.commit')
            .map(entry => ({
              seq: entry.seq,
              actionId: entry.actionId,
              knownWordReview: {
                word: entry.payload.word,
                grade: entry.payload.grade,
                mastered: entry.payload.grade === 'good',
                isKnown: true,
                fusionCoreDrop: entry.payload.grade === 'good'
                  ? { awarded: true, message: 'Obtained 1x Fusion Core!' }
                  : null,
              },
            })),
          exploreRunway: gameState.run.exploreRunway,
        };
        return latestSyncResponse;
      },
      apiStartSpeedReviewRoom: async () => {
        legacyStartCalls += 1;
        return { snapshotWords: [{ word: 'legacy', meanings: ['wrong source'] }] };
      },
      apiProgressSpeedReviewRoom: async () => {
        legacyProgressCalls += 1;
        return {};
      },
      apiCompleteSpeedReviewRoom: async () => {
        legacyCompleteCalls += 1;
        return {};
      },
    });

    await renderSpeedReviewRoom();
    await renderSpeedReviewRoom();

    assert.deepEqual(speedReviewStartArgs?.words, snapshotWords.slice(1));
    assert.equal(speedReviewStartArgs?.options?.showRomaji, true);
    assert.equal(speedReviewStartArgs?.options?.canonicalReviewDelivery, true);
    assert.equal(legacyStartCalls, 0);
    assert.equal(speedReviewStartCount, 1, 'rerender must not duplicate launch ownership');

    const firstCommit = await speedReviewStartArgs.options.onCommittedReview({
      word: snapshotWords[1],
      grade: 4,
      commitIndex: 0,
    });
    const duplicateCommit = await speedReviewStartArgs.options.onCommittedReview({
      word: snapshotWords[1],
      grade: 4,
      commitIndex: 0,
    });
    const secondCommit = await speedReviewStartArgs.options.onCommittedReview({
      word: snapshotWords[2],
      grade: 1,
      commitIndex: 1,
    });
    const pending = getExploreSession().snapshot();
    assert.equal(firstCommit.accepted, true);
    assert.equal(duplicateCommit.accepted, true);
    assert.equal(secondCommit.accepted, true);
    assert.equal(pending.length, 2, 'the same card commit must append once');
    assert.deepEqual(pending[0].payload, {
      roomId: 'speed-room-1',
      word: '火',
      grade: 'good',
      commitIndex: 1,
    });
    assert.deepEqual(pending[1].payload, {
      roomId: 'speed-room-1',
      word: '土',
      grade: 'again',
      commitIndex: 2,
    });
    assert.equal(pending[0].kind, 'speedReview.commit');
    assert.equal(legacyProgressCalls, 0);
    assert.equal(syncCalls, 0, 'offline commit should remain pending without blocking playback');

    await speedReviewStartArgs.options.onComplete();
    await autoProceedPromise;
    const completedKinds = getExploreSession().snapshot().map(entry => entry.kind);
    assert.deepEqual(
      completedKinds,
      ['speedReview.commit', 'speedReview.commit', 'speedReview.complete', 'proceed'],
      'completion should stay canonical and hand room advance to session ownership',
    );
    assert.equal(gameState.run.currentRoom, 1);
    assert.equal(legacyCompleteCalls, 0);
    assert.deepEqual(knownWordMembershipEvents, [],
      'queued offline reviews must not claim membership before confirmation');
    assert.equal(wordLevelUpCalls.length, 0,
      'offline review rewards must wait for their canonical sync result');

    online = true;
    await getExploreSession().syncNow({ reason: 'testReconnect' });
    assert.deepEqual(knownWordMembershipEvents, [
      ['add', '火'],
      ['add', '土'],
    ]);
    assert.equal(clientKnownWords.has('火'), true);
    assert.equal(clientKnownWords.has('土'), true,
      'Again moves a reviewed card to Learning/Relearning, which remains known');
    assert.equal(wordLevelUpCalls.length, 1);
    assert.equal(wordLevelUpCalls[0][2].message, 'Obtained 1x Fusion Core!');

    applyExploreSessionKnownWordReviewResults(latestSyncResponse);
    applyExploreSessionKnownWordReviewResults(latestSyncResponse);
    assert.deepEqual(knownWordMembershipEvents, [
      ['add', '火'],
      ['add', '土'],
    ], 'replayed results must not update known-word membership twice');
    assert.equal(wordLevelUpCalls.length, 1,
      'replayed results must not repeat Fusion Core feedback');
    resetExploreSession();
  });

  it('does not launch a paused standard-session speed review even with a valid payload', async () => {
    const room = {
      id: 'speed-room-paused-valid',
      type: 'speedReviewRoom',
      speedReviewRoom: { completed: false },
    };
    const gameState = makeRunRoomState({ phase: 'speedReviewRoom', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_9999999999999999',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        room,
        offlineReady: true,
        acceptedActions: ['speedReview.commit', 'speedReview.complete', 'proceed'],
        interactionPayload: {
          kind: 'speedReviewRoom',
          roomId: room.id,
          snapshotInitialized: true,
          snapshotWords: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
          snapshotWordKeys: ['火'],
          reviewedCards: 0,
        },
      }],
    };
    let legacyCalls = 0;
    let clearCalls = 0;
    init({
      getGameState: () => gameState,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => { clearCalls += 1; } },
      scene: { showNarration: async () => {} },
      apiSyncExploreSession: async () => ({ status: 'ok', results: [] }),
      apiStartSpeedReviewRoom: async () => { legacyCalls += 1; return null; },
    });
    getExploreSession().adoptRunway(gameState.run.exploreRunway);
    getExploreSession().pause('manual-test');

    await renderSpeedReviewRoom();

    assert.equal(legacyCalls, 0);
    assert.equal(speedReviewStartCount, 0);
    assert.ok(clearCalls > 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('runs a prepared word discovery fully offline without legacy status, words, review, or completion calls', async () => {
    const room = {
      id: 'word-discovery-offline',
      type: 'wordDiscovery',
      wordDiscovery: { completed: false, wordsLearned: 0, wordsToLearn: 2 },
    };
    const words = [
      { word: '火', reading: 'ひ', meanings: ['fire'] },
      { word: '水', reading: 'みず', meanings: ['water'] },
    ];
    let gameState = makeRunRoomState({ phase: 'wordDiscovery', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    gameState.run.totalRooms = 2;
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_word_discovery_offline',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        room,
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'],
        actionEffects: {
          'wordDiscovery.review': [],
          'wordDiscovery.complete': [],
          proceed: [],
        },
        dependencies: [],
        room,
        interactionPayload: {
          kind: 'wordDiscovery',
          roomId: room.id,
          snapshotInitialized: true,
          snapshotWords: words,
          snapshotWordKeys: ['火', '水'],
          todayCount: 0,
          dailyLimit: 2,
          atLimit: false,
          available: true,
          wordsLearned: 0,
        },
      }, {
        index: 1,
        roomId: 'room-after-word-discovery',
        actionSeq: 1,
        offlineReady: true,
        acceptedActions: [],
        actionEffects: {},
        dependencies: [],
        room: { id: 'room-after-word-discovery', type: 'room' },
        interactionPayload: { kind: 'room' },
      }],
    };
    sceneManagerState.currentScene = {
      layers: { npcs: {} },
      discoveryState: {},
    };
    const legacyCalls = { status: 0, words: 0, review: 0, complete: 0 };
    let autoProceedPromise = null;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {
        if (gameState.phase === 'room' && autoProceedPromise === null) {
          autoProceedPromise = proceedWithRevealBuffer();
        }
      },
      actions: {
        setContent: () => {},
        clear: () => {},
        showFlashCards: shown => { flashCardWords = shown; },
      },
      scene: { showNarration: async () => {} },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
      apiGetDiscoveryStatus: async () => { legacyCalls.status += 1; return {}; },
      apiGetDiscoveryWords: async () => { legacyCalls.words += 1; return {}; },
      apiSwipeWord: async () => { legacyCalls.review += 1; return {}; },
      apiCompleteDiscovery: async () => { legacyCalls.complete += 1; return {}; },
    });

    await renderWordDiscovery();
    assert.deepEqual(flashCardWords, [words[0]]);
    await documentListeners.get('discovery-card-swiped')({ detail: { knew: true } });
    assert.deepEqual(flashCardWords, [words[1]]);
    assert.equal(getExploreSession().snapshot().length, 1);
    sceneManagerState.currentScene = { layers: { npcs: {} }, discoveryState: {} };
    await renderWordDiscovery();
    assert.deepEqual(flashCardWords, [words[1]],
      'scene recreation must seed from optimistic room progress, not repeat the first card');
    assert.equal(getExploreSession().snapshot().length, 1);
    await documentListeners.get('discovery-card-swiped')({ detail: { knew: false } });
    await new Promise(resolve => setTimeout(resolve, 0));
    await autoProceedPromise;

    assert.deepEqual(legacyCalls, { status: 0, words: 0, review: 0, complete: 0 });
    assert.deepEqual(getExploreSession().snapshot().map(entry => entry.kind), [
      'wordDiscovery.review',
      'wordDiscovery.review',
      'wordDiscovery.complete',
      'proceed',
    ]);
    assert.deepEqual(getExploreSession().snapshot()[0].payload, {
      roomId: room.id,
      word: '火',
      grade: 'good',
      reviewIndex: 0,
    });
    assert.equal(gameState.run.currentRoom, 1);
  });

  it('soft-pauses malformed prepared word discovery without any legacy GET fallback', async () => {
    const room = {
      id: 'word-discovery-malformed',
      type: 'wordDiscovery',
      wordDiscovery: { completed: false, wordsLearned: 0, wordsToLearn: 1 },
    };
    let gameState = makeRunRoomState({ phase: 'wordDiscovery', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_word_discovery_malformed',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        room,
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'],
        missingPayloadReasons: ['wordDiscovery.snapshotWords'],
        interactionPayload: {
          kind: 'wordDiscovery',
          roomId: room.id,
          snapshotInitialized: true,
          snapshotWords: [{ word: '火', reading: '', meanings: [] }],
          snapshotWordKeys: ['水'],
          todayCount: 0,
          dailyLimit: 2,
          atLimit: false,
          available: true,
          wordsLearned: 0,
        },
      }],
    };
    sceneManagerState.currentScene = { layers: { npcs: {} }, discoveryState: {} };
    let statusCalls = 0;
    let wordsCalls = 0;
    let blankCalls = 0;
    let narrationCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      actions: {
        setContent: () => { blankCalls += 1; },
        clear: () => {},
        showFlashCards: shown => { flashCardWords = shown; },
      },
      scene: { showNarration: async () => { narrationCalls += 1; } },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
      apiGetDiscoveryStatus: async () => { statusCalls += 1; return {}; },
      apiGetDiscoveryWords: async () => { wordsCalls += 1; return {}; },
    });

    await renderWordDiscovery();

    assert.equal(statusCalls, 0);
    assert.equal(wordsCalls, 0);
    assert.equal(blankCalls, 1, 'invalid capability clears any stale playable card');
    assert.deepEqual(flashCardWords, []);
    assert.equal(narrationCalls, 1);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('clears a paused word discovery owner and accepts exactly one swipe after resume', async () => {
    const room = {
      id: 'word-discovery-paused',
      type: 'wordDiscovery',
      wordDiscovery: { completed: false, wordsLearned: 0, wordsToLearn: 2 },
    };
    const words = [
      { word: '火', reading: 'ひ', meanings: ['fire'] },
      { word: '水', reading: 'みず', meanings: ['water'] },
    ];
    let gameState = makeRunRoomState({ phase: 'wordDiscovery', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    const runway = {
      sessionEpoch: 'ese_word_discovery_paused',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        room,
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'],
        actionEffects: { 'wordDiscovery.review': [], 'wordDiscovery.complete': [], proceed: [] },
        dependencies: [],
        room,
        interactionPayload: {
          kind: 'wordDiscovery', roomId: room.id, snapshotInitialized: true,
          snapshotWords: words, snapshotWordKeys: ['火', '水'], wordsLearned: 0,
          todayCount: 0, dailyLimit: 2, atLimit: false, available: true,
        },
      }],
    };
    gameState.run.exploreRunway = runway;
    sceneManagerState.currentScene = { layers: { npcs: {} }, discoveryState: {} };
    let legacyCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      actions: {
        setContent: () => { flashCardWords = []; },
        clear: () => {},
        showFlashCards: shown => { flashCardWords = shown; },
      },
      scene: { showNarration: async () => {} },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
      apiGetDiscoveryStatus: async () => { legacyCalls += 1; return {}; },
      apiGetDiscoveryWords: async () => { legacyCalls += 1; return {}; },
    });

    await renderWordDiscovery();
    const staleHandler = documentListeners.get('discovery-card-swiped');
    const session = getExploreSession();
    session.pause('manual-test');
    await renderWordDiscovery();
    assert.deepEqual(flashCardWords, []);
    assert.equal(documentListeners.has('discovery-card-swiped'), false);

    session.adoptRunway(runway);
    assert.equal(session.isPaused(), false);
    await renderWordDiscovery();
    const liveHandler = documentListeners.get('discovery-card-swiped');
    await staleHandler({ detail: { knew: true } });
    await liveHandler({ detail: { knew: true } });
    await liveHandler({ detail: { knew: true } });

    assert.equal(legacyCalls, 0);
    assert.equal(session.snapshot().length, 1);
    assert.equal(session.snapshot()[0].kind, 'wordDiscovery.review');
    assert.equal(gameState.room.wordDiscovery.wordsLearned, 1);
    assert.deepEqual(flashCardWords, [words[1]]);
  });

  it('keeps no-session word discovery on the legacy status, words, review, and completion APIs', async () => {
    const room = {
      id: 'word-discovery-legacy',
      type: 'wordDiscovery',
      wordDiscovery: { completed: false, wordsLearned: 0, wordsToLearn: 1 },
    };
    let gameState = makeRunRoomState({ phase: 'wordDiscovery', room });
    sceneManagerState.currentScene = { layers: { npcs: {} }, discoveryState: {} };
    const calls = [];
    let updateUiPromise = null;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {
        if (gameState.phase === 'room' && !updateUiPromise) updateUiPromise = Promise.resolve();
      },
      actions: {
        setContent: () => {},
        clear: () => {},
        showFlashCards: shown => { flashCardWords = shown; },
      },
      scene: { showNarration: async () => {} },
      apiGetDiscoveryStatus: async () => {
        calls.push('status');
        return { todayCount: 0, dailyLimit: 2, atLimit: false };
      },
      apiGetDiscoveryWords: async () => {
        calls.push('words');
        return { available: true, words: [{ word: '火', reading: 'ひ', meanings: ['fire'] }] };
      },
      apiSwipeWord: async (word, grade, isDiscovery) => {
        calls.push(['review', word, grade, isDiscovery]);
        return { ok: true, isKnown: true };
      },
      apiCompleteDiscovery: async () => {
        calls.push('complete');
        return { ok: true };
      },
      apiPostCombatRefresh: async words => { calls.push(['refresh', words]); },
    });

    await renderWordDiscovery();
    await documentListeners.get('discovery-card-swiped')({ detail: { knew: true } });
    await new Promise(resolve => setTimeout(resolve, 0));
    await updateUiPromise;

    assert.deepEqual(calls, [
      'status',
      'words',
      ['review', '火', 'good', true],
      'complete',
      ['refresh', ['火']],
    ]);
    assert.equal(getExploreSession(), null);
    assert.equal(gameState.phase, 'room');
  });

  it('canonically auto-completes an initialized zero-card session snapshot', async () => {
    const room = {
      id: 'speed-room-zero',
      type: 'speedReviewRoom',
      speedReviewRoom: { completed: false, reviewedCards: 0 },
    };
    let gameState = makeRunRoomState({ phase: 'speedReviewRoom', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_speed_review_zero',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        room,
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['speedReview.commit', 'speedReview.complete', 'proceed'],
        interactionPayload: {
          kind: 'speedReviewRoom',
          roomId: room.id,
          snapshotWords: [],
          snapshotWordKeys: [],
          reviewedCards: 0,
          snapshotInitialized: true,
        },
      }],
    };
    let legacyStartCalls = 0;
    let legacyCompleteCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
      apiStartSpeedReviewRoom: async () => { legacyStartCalls += 1; return null; },
      apiCompleteSpeedReviewRoom: async () => { legacyCompleteCalls += 1; return {}; },
    });

    await renderSpeedReviewRoom();
    const entries = getExploreSession().snapshot();
    resetExploreSession();

    assert.equal(speedReviewStartCount, 0);
    assert.deepEqual(entries.map(entry => entry.kind), ['speedReview.complete']);
    assert.equal(gameState.phase, 'room');
    assert.equal(gameState.room.interacted, true);
    assert.equal(legacyStartCalls, 0);
    assert.equal(legacyCompleteCalls, 0);
  });

  it('soft-pauses and clears an invalid session payload, then launches after refresh', async () => {
    const room = {
      id: 'speed-room-refresh',
      type: 'speedReviewRoom',
      speedReviewRoom: { completed: false },
    };
    let gameState = makeRunRoomState({ phase: 'speedReviewRoom', room });
    gameState.run.active = true;
    gameState.run.mode = 'standard';
    const prepared = {
      index: 0,
      roomId: room.id,
      room,
      actionSeq: 0,
      offlineReady: false,
      missingPayloadReasons: ['speedReviewRoom.snapshotWords'],
      acceptedActions: ['speedReview.commit', 'speedReview.complete', 'proceed'],
      interactionPayload: {
        kind: 'speedReviewRoom',
        roomId: room.id,
        snapshotInitialized: false,
      },
    };
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_speed_review_refresh',
      currentRoom: 0,
      preparedRooms: [prepared],
    };
    let blankCalls = 0;
    let narrationCalls = 0;
    let legacyStartCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => { blankCalls += 1; } },
      scene: { showNarration: async () => { narrationCalls += 1; } },
      apiSyncExploreSession: async () => { throw new Error('offline'); },
      apiStartSpeedReviewRoom: async () => { legacyStartCalls += 1; return null; },
    });

    await renderSpeedReviewRoom();
    assert.equal(speedReviewStartCount, 0);
    assert.ok(blankCalls > 0, 'invalid payload must clear stale playable controls');
    assert.equal(narrationCalls, 1);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(legacyStartCalls, 0);

    prepared.offlineReady = true;
    prepared.missingPayloadReasons = [];
    prepared.interactionPayload = {
      kind: 'speedReviewRoom',
      roomId: room.id,
      snapshotWords: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
      snapshotWordKeys: ['火'],
      reviewedCards: 0,
      snapshotInitialized: true,
    };
    getExploreSession().adoptRunway(gameState.run.exploreRunway);
    await renderSpeedReviewRoom();
    resetExploreSession();

    assert.equal(speedReviewStartCount, 1, 'a refreshed payload should clear the dead-end and launch');
    assert.equal(legacyStartCalls, 0);
  });

  it('keeps legacy speed review APIs fenced to runs without an active standard session', async () => {
    const room = {
      id: 'speed-room-legacy',
      type: 'speedReviewRoom',
      speedReviewRoom: { completed: false },
    };
    let gameState = makeRunRoomState({ phase: 'speedReviewRoom', room });
    const words = [{ word: '火', reading: 'ひ', meanings: ['fire'] }];
    const calls = [];

    init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiStartSpeedReviewRoom: async roomId => {
        calls.push(['start', roomId]);
        return { snapshotWords: words, reviewedCards: 0 };
      },
      apiProgressSpeedReviewRoom: async (roomId, word, commitIndex) => {
        calls.push(['progress', roomId, word, commitIndex]);
        return {};
      },
      apiCompleteSpeedReviewRoom: async roomId => {
        calls.push(['complete', roomId]);
        return {};
      },
    });

    await renderSpeedReviewRoom();
    await speedReviewStartArgs.options.onCommittedReview({ word: words[0], commitIndex: 0 });
    await speedReviewStartArgs.options.onComplete();

    assert.deepEqual(calls, [
      ['start', room.id],
      ['progress', room.id, '火', 0],
      ['complete', room.id],
    ]);
    assert.equal(getExploreSession(), null);
  });

  it('refreshes the hub after awarding the tutorial Fusion Core', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 4,
        tutorialFusionDataUnlocked: ['hinoneko'],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        fusionCores: 0,
        creatureCollection: [],
      },
    };
    let updateUiCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => { updateUiCalls += 1; },
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => ({ count: 3 }),
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
    await speedReviewStartArgs.options.onComplete();
    assert.equal(updateUiCalls, 0, 'hub should wait until review exits before refreshing');

    await speedReviewStartArgs.options.onExit();

    assert.equal(updateUiCalls, 1);
  });

  it('re-polls the due count when returning to hub from knowledge review', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        creatureCollection: [],
      },
    };
    let dueCountCalls = 0;

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => { void renderHub(); },
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => {
        dueCountCalls += 1;
        return { count: dueCountCalls === 1 ? 3 : 1 };
      },
      apiGetDueWords: async () => ({
        words: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
      }),
    });

    await renderHub();
    const initialReviewButton = renderedButtons.find(button => button.label.includes('Knowledge Review'));
    assert.ok(initialReviewButton, 'Knowledge Review button should render');
    assert.equal(initialReviewButton.label, '📚 Knowledge Review (3)');

    await initialReviewButton.onClick();
    assert.equal(typeof speedReviewStartArgs?.options?.onExit, 'function');

    await speedReviewStartArgs.options.onExit();
    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshedReviewButton = renderedButtons.find(button => button.label.includes('Knowledge Review'));
    assert.ok(refreshedReviewButton, 'Knowledge Review button should render after returning');
    assert.equal(refreshedReviewButton.label, '📚 Knowledge Review (1)');
    assert.equal(dueCountCalls, 2, 'hub should fetch due count again after review exit');
  });

  it('shows the Kanji Kombat due card count in the hub button', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false,
        creatureCollection: ['hi'],
      },
    };

    init({
      getGameState: () => gameState,
      updateGameState: (nextState) => { gameState = nextState; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      startNewRun: () => {},
      apiGetVocabDueCount: async () => ({ count: 0 }),
      apiGetKanjiKombatAvailability: async () => ({ available: true, dueCount: 7 }),
    });

    await renderHub();

    const kanjiKombatButton = renderedButtons.find(button => button.label.includes('Kanji Kombat'));
    assert.ok(kanjiKombatButton, 'Kanji Kombat button should render');
    assert.equal(kanjiKombatButton.label, 'Kanji Kombat (7)');
    assert.equal(kanjiKombatButton.disabled, false);
  });

  it('forces Fusion Lab instead of Knowledge Review after the fusion core is awarded', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 4,
        tutorialFusionDataUnlocked: ['hinoneko'],
        tutorialFusionCoreAwarded: true,
        tutorialFusionComplete: false,
        fusionCores: 1,
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
      apiGetVocabDueCount: async () => ({ count: 3 }),
    });

    await renderHub();

    const reviewButton = domButtons.find(button => button.textContent.includes('Knowledge Review'));
    const fusionButton = domButtons.find(button => button.textContent.includes('Fusion Lab'));

    assert.ok(reviewButton, 'Knowledge Review button should render');
    assert.ok(fusionButton, 'Fusion Lab button should render');
    assert.equal(narrationCalls, 0, 'Knowledge Review tutorial narration should not replay');
    assert.equal(reviewButton.classList.contains('tutorial-highlight'), false);
    assert.equal(reviewButton.classList.contains('tutorial-dimmed'), true);
    assert.equal(fusionButton.classList.contains('tutorial-highlight'), true);
    assert.equal(fusionButton.classList.contains('tutorial-dimmed'), false);
  });

  it('marks post-fusion Cid narration as seen and does not replay it once persisted', async () => {
    let gameState = {
      phase: 'hub',
      meta: {
        pvpTeams: [],
        tutorialStep: 6,
        tutorialFusionDataUnlocked: ['hinoneko'],
        tutorialFusionCoreAwarded: true,
        tutorialFusionComplete: true,
        tutorialPostFusionNarrationShown: false,
        creatureCollection: ['hinoneko'],
      },
    };
    let narrationCalls = 0;
    let markSeenCalls = 0;

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
      apiGetVocabDueCount: async () => ({ count: 0 }),
      apiMarkTutorialPostFusionSeen: async () => {
        markSeenCalls += 1;
        return {
          state: {
            ...gameState,
            meta: {
              ...gameState.meta,
              tutorialPostFusionNarrationShown: true,
            },
          },
        };
      },
    });

    await renderHub();

    assert.equal(narrationCalls, 1, 'post-fusion Cid narration should show the first time');
    assert.equal(markSeenCalls, 1, 'post-fusion Cid narration should be persisted after it is shown');
    assert.equal(gameState.meta.tutorialPostFusionNarrationShown, true);

    await renderHub();

    assert.equal(narrationCalls, 1, 'post-fusion Cid narration should not replay once persisted');
    assert.equal(markSeenCalls, 1, 'post-fusion Cid narration should not be marked twice');
  });
});
