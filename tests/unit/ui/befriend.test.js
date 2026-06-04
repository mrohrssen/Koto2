import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser-dependent modules before importing befriend.js
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} }
});
await mock.module('../../../public/js/api.js', {
  namedExports: { getAuthHeaders: () => ({}) }
});
await mock.module('../../../public/js/platform.js', {
  namedExports: { PLATFORM: { apiBase: '' } }
});
await mock.module('../../../public/js/logger.js', {
  namedExports: { logger: { error: () => {}, warn: () => {} } }
});
const renderChoicesResults = [];
const renderChoicesCalls = [];
const dialogueCardCalls = [];
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '<jp>',
    renderEnFirst: (s) => s,
    getKnownWords: () => new Set(),
    entityToToken: () => ({}),
  }
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), tPlain: (...a) => a.join(' ') }
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: { burstParticles: () => {}, ELEMENT_COLORS: {} }
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: { getCreatureSpriteForScene: () => null, showActiveGlowForScene: () => {} }
});
await mock.module('../../../public/js/pixi/text.js', {
  namedExports: { popupBuff: () => {} }
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {} }
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} }
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    SPRITE_VERSION: '0',
    replaceWithTextSprite: () => {},
    creatureSpriteHtml: () => '',
    creatureStaticPath: id => `/creatures/${id}.webp`,
  }
});
await mock.module('../../../public/js/ui/romaji.js', {
  namedExports: { toRomaji: (s) => s === 'てつ' ? 'tetsu' : s }
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderChoicesAsync: options => {
      renderChoicesCalls.push(options);
      return Promise.resolve(renderChoicesResults.shift() ?? 0);
    },
  }
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCardCalls.push(options); },
  },
});
await mock.module('../../../public/js/tts.js', {
  namedExports: { playDialogueAudio: () => {}, prefetchWord: () => {}, playWordPair: () => {} }
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: { init: () => {}, showMoves: () => {}, clear: () => {}, setActiveLabel: () => {} }
});
await mock.module('../../../public/js/ui/target-select.js', {
  namedExports: { init: () => {}, showEnemies: () => {}, showAllies: () => {}, clear: () => {} }
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: { getTutorialNarration: () => [], getBefriendWrongNarration: () => '' }
});
await mock.module('../../../public/js/ui/befriend-quiz-state.js', {
  namedExports: { restoreBefriendQuizEnemyUi: () => {} }
});
// Scene-manager mock exposes a mutable holder so individual tests can swap in
// a mock scene (e.g. to assert pauseForNpcInterjection call order).
const sceneManagerState = { currentScene: null };
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState }
});

const {
  init,
  executeBefriendAction,
  isBefriendSlotBlocked,
  isBefriendAvailableForSlot,
  getMoveSelectBefriendOpts,
  renderBefriendQuiz,
} = await import('../../../public/js/ui/befriend.js');

beforeEach(() => {
  renderChoicesResults.length = 0;
  renderChoicesCalls.length = 0;
  dialogueCardCalls.length = 0;
  sceneManagerState.currentScene = null;
});

describe('befriend eligibility', () => {
  describe('isBefriendSlotBlocked', () => {
    it('returns true when slot is recorded in befriendAttemptedSlots', () => {
      const state = { combat: { befriendAttemptedSlots: { 0: true } } };
      assert.equal(isBefriendSlotBlocked(state, 0), true);
    });

    it('returns false when slot is not in befriendAttemptedSlots', () => {
      const state = { combat: { befriendAttemptedSlots: { 1: true } } };
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });

    it('returns false when befriendAttemptedSlots is missing', () => {
      const state = { combat: {} };
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });

    it('returns false when combat is missing', () => {
      const state = {};
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });
  });

  describe('isBefriendAvailableForSlot', () => {
    it('returns true when one living enemy is below 50% HP', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), true);
    });

    it('returns false for NPC combat', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: 'some-npc',
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when not creature combat', () => {
      const state = {
        combat: {
          isCreatureCombat: false,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when slot already attempted', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: { 0: true },
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when enemy HP is above 50%', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 6, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when multiple enemies are alive', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [
            { hp: 4, maxHp: 10, befriended: false },
            { hp: 8, maxHp: 10, befriended: false },
          ],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns true at exactly 50% HP', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 5, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), true);
    });
  });

  describe('getMoveSelectBefriendOpts', () => {
    it('returns disabled befriend options (feature gated)', () => {
      const opts = getMoveSelectBefriendOpts(0);
      assert.equal(opts.befriendAvailable, false);
      assert.equal(opts.onBefriend, undefined);
    });
  });
});

describe('executeBefriendAction creature speaker label', () => {
  it('uses hiragana speaker data without English meaning for creature dialogue', async () => {
    const narrationCalls = [];
    const state = {
      combat: {
        enemies: [{
          id: 'tetsu',
          name: '鉄',
          nameEn: 'Iron',
          reading: 'てつ',
          hp: 5,
          maxHp: 10,
          befriended: false,
        }],
        allies: [],
      },
      run: { creatureParty: { active: [] } },
    };

    const ctx = {
      isCombatActive: () => true,
      withAnimationActive: async (fn) => fn(),
      getGameState: () => state,
      apiGetBefriendConversation: async () => ({
        userId: 'u1',
        targetEnemy: state.combat.enemies[0],
        targetEnemyIndex: 0,
        rounds: [{
          speaker: 'こんにちは',
          speakerTts: 'creature-line.wav',
          options: ['うん', 'いいえ', 'またね']
        }],
      }),
      apiSubmitBefriendAnswer: async () => ({
        correct: true,
        correctIndex: 0,
        conversationComplete: true,
        befriend: { success: true, captured: { id: 'tetsu' } },
        enemies: state.combat.enemies,
      }),
      narration: {
        showNarration: async (text, options = {}) => {
          narrationCalls.push({ text, options });
        },
        forceHideNarration: () => {},
      },
      delay: async () => {},
      updateGameState: () => {},
      updateUI: () => {},
      startMoveSelection: () => {},
      setCurrentCreatureIndex: () => {},
      promptNextCreature: () => {},
      stopCombatLoop: () => {},
      spritePos: () => ({ x: 0, y: 0 }),
      buildAllyHpMap: () => new Map(),
    };
    init(ctx);
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = {
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
      };
    }

    await executeBefriendAction();

    assert.equal(narrationCalls.length, 0);
    assert.equal(dialogueCardCalls[0].speaker, 'てつ');
    assert.equal(dialogueCardCalls[0].speakerReading, 'tetsu');
    assert.equal(dialogueCardCalls[0].speakerPortrait, '/creatures/tetsu.webp');
    assert.equal(dialogueCardCalls[0].portraitKind, 'creature');
    assert.deepEqual(dialogueCardCalls[0].audio, { userId: 'u1', key: 'creature-line.wav' });
  });
});

describe('renderBefriendQuiz tutorial step 1 pause/resume wiring', () => {
  // Provide a minimal document stub for the DOM reads in renderBefriendQuiz
  // (querySelector for enemy formation slot, querySelectorAll for action buttons).
  // Both can safely return null/empty — the tutorial-step-1 scene-API calls
  // don't depend on DOM state.
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }

  // Reset scene-manager mock state before every test so earlier tests can't
  // leak mock scenes into later ones (see Task 8 review M3).
  beforeEach(() => {
    sceneManagerState.currentScene = null;
    renderChoicesResults.length = 0;
    renderChoicesCalls.length = 0;
    dialogueCardCalls.length = 0;
  });

  // Helper to build a mock scene that tracks NPC interjection call order.
  function buildMockScene(callLog) {
    const scene = {
      disposed: false,
      layers: { npcs: { addChild: () => {}, removeChild: () => {} } },
      npcSprite: null,
      async pauseForNpcInterjection(opts) {
        callLog.push(['pauseForNpcInterjection', opts]);
      },
      async showNpcSprite(sprite, opts) {
        callLog.push(['showNpcSprite', sprite, opts]);
        scene.npcSprite = { sprite, opts };
      },
      async hideNpcSprite(opts) {
        callLog.push(['hideNpcSprite', opts]);
        scene.npcSprite = null;
      },
      async resumeFromNpcInterjection(opts) {
        callLog.push(['resumeFromNpcInterjection', opts]);
      },
    };
    return scene;
  }

  it('calls pause -> show -> narrate -> hide -> resume in order on tutorial step 1', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    sceneManagerState.currentScene = scene;

    // Minimal ctx for the code path we want to exercise.
    const ctx = {
      getGameState: () => ({ meta: { tutorialStep: 1 } }),
      narration: {
        showNarration: async (text) => {
          callLog.push(['narration', text]);
        },
      },
      updateGameState: () => {},
      syncFinalState: () => {},
      stopCombatLoop: () => {},
    };
    init(ctx);

    // Stub global fetch so the fight-path follow-up doesn't hit the network
    // (renderChoicesAsync is mocked to resolve 0 = Fight, which triggers a
    // fetch to /api/game/befriend-quiz-answer).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      json: async () => ({ state: {}, combatEnded: true }),
    });

    try {
      const quizData = { targetIndex: 0, creatureName: 'tetsu', options: [] };
      const result = { enemies: [{ hp: 1, maxHp: 10 }] };
      await renderBefriendQuiz(quizData, result);
    } finally {
      globalThis.fetch = originalFetch;
      sceneManagerState.currentScene = null;
    }

    // Extract just the scene-API ordering (drop narration entries which vary
    // with tutorial copy mocks).
    const sceneOps = callLog
      .map(e => e[0])
      .filter(op => op !== 'narration');

    // Order expectation:
    //   pauseForNpcInterjection -> showNpcSprite -> hideNpcSprite -> resumeFromNpcInterjection
    // Narration entries are filtered out above; this assertion covers only
    // the scene-API call ordering.
    assert.deepEqual(sceneOps, [
      'pauseForNpcInterjection',
      'showNpcSprite',
      'hideNpcSprite',
      'resumeFromNpcInterjection',
    ]);

    // Verify the pause call requested fadeEnemies (the key behaviour: fade
    // the enemy formation container so Cid doesn't overlap with tetsu).
    const pauseEntry = callLog.find(e => e[0] === 'pauseForNpcInterjection');
    assert.deepEqual(pauseEntry[1], { fadeEnemies: true });
  });

  it('logs console.error when no scene with npcs layer is available', async () => {
    sceneManagerState.currentScene = null;

    const ctx = {
      getGameState: () => ({ meta: { tutorialStep: 1 } }),
      narration: { showNarration: async () => {} },
      updateGameState: () => {},
      syncFinalState: () => {},
      stopCombatLoop: () => {},
    };
    init(ctx);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      json: async () => ({ state: {}, combatEnded: true }),
    });

    const originalError = console.error;
    const errorCalls = [];
    console.error = (...args) => { errorCalls.push(args); };

    try {
      const quizData = { targetIndex: 0, creatureName: 'tetsu', options: [] };
      const result = { enemies: [{ hp: 1, maxHp: 10 }] };
      await renderBefriendQuiz(quizData, result);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }

    const tutorialErr = errorCalls.find(args =>
      typeof args[0] === 'string' && args[0].includes('[befriend] tutorial step 1: no scene')
    );
    assert.ok(tutorialErr, 'expected console.error for missing scene, got ' + JSON.stringify(errorCalls));
  });

  it('routes Wait -> Talk to the AI befriend conversation path', async () => {
    renderChoicesResults.push(1, 0); // choose Talk, then first AI answer
    let conversationStarted = false;

    const state = {
      meta: { tutorialStep: 0 },
      combat: {
        active: true,
        enemies: [{ id: 'tetsu', name: '鉄', nameEn: 'Iron', reading: 'てつ', hp: 5, maxHp: 10, befriended: false }],
        allies: []
      },
      run: { creatureParty: { active: [] } }
    };

    const ctx = {
      isCombatActive: () => true,
      withAnimationActive: async (fn) => fn(),
      getGameState: () => state,
      apiGetBefriendConversation: async () => {
        conversationStarted = true;
        return {
          userId: 'u1',
          targetEnemy: state.combat.enemies[0],
          targetEnemyIndex: 0,
          rounds: [{
            speaker: {
              raw: '水が好き？',
              tokens: [{ surface: '水', base: '水', reading: 'みず', meaning: 'water' }]
            },
            options: [
              { raw: 'うん', tokens: [{ surface: 'うん', base: 'うん', reading: 'うん', meaning: 'yeah' }] },
              { raw: 'いいえ', tokens: [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', meaning: 'no' }] },
              { raw: 'またね', tokens: [{ surface: 'またね', base: 'またね', reading: 'またね', meaning: 'see you' }] }
            ]
          }]
        };
      },
      apiSubmitBefriendAnswer: async () => ({
        correct: true,
        correctIndex: 0,
        conversationComplete: true,
        befriend: { success: true, captured: { id: 'tetsu' } },
        enemies: state.combat.enemies
      }),
      narration: { showNarration: async () => {}, forceHideNarration: () => {} },
      delay: async () => {},
      updateGameState: () => {},
      updateUI: () => {},
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
      spritePos: () => ({ x: 0, y: 0 }),
      buildAllyHpMap: () => new Map(),
      syncFinalState: () => {}
    };
    init(ctx);

    await renderBefriendQuiz({
      targetIndex: 0,
      creatureId: 'tetsu',
      creatureName: '鉄',
      creatureReading: 'てつ',
      options: [{ id: 'tetsu', name: 'Iron' }],
      waitPrompt: {
        tokens: [{ surface: '待って', base: '待つ', reading: 'まって', meaning: 'wait' }],
        audio: { userId: 'u1', key: 'wait.wav', speakerId: 113 }
      }
    }, { enemies: state.combat.enemies });

    assert.equal(conversationStarted, true);
    assert.equal(renderChoicesCalls[0].heading, 'Choose an action');
  });

  it('falls back to the name quiz when AI befriend conversation is unavailable', async () => {
    renderChoicesResults.push(1, 0); // choose Talk, then first name answer
    const fetchCalls = [];
    const state = {
      meta: { tutorialStep: 0 },
      combat: {
        active: true,
        enemies: [{ id: 'tetsu', name: '鉄', nameEn: 'Iron', reading: 'てつ', hp: 5, maxHp: 10, befriended: false }],
        allies: []
      },
      run: { creatureParty: { active: [] } }
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, body: JSON.parse(options.body) });
      return {
        json: async () => ({
          correct: true,
          befriended: true,
          capturedId: 'tetsu',
          capturedIndex: 0,
          combatEnded: true,
          victory: true,
          enemies: [{ ...state.combat.enemies[0], hp: 0, befriended: true }],
          state: {
            ...state,
            combat: {
              ...state.combat,
              enemies: [{ ...state.combat.enemies[0], hp: 0, befriended: true }]
            }
          }
        })
      };
    };

    const ctx = {
      isCombatActive: () => true,
      withAnimationActive: async (fn) => fn(),
      getGameState: () => state,
      apiGetBefriendConversation: async () => ({
        error: 'AI conversations are unavailable. Enable AI Conversations in Settings, or try again later if server AI is not configured.',
        mode: 'name_quiz',
        fallback: true
      }),
      narration: { showNarration: async () => {}, forceHideNarration: () => {} },
      delay: async () => {},
      updateGameState: () => {},
      updateUI: () => {},
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
      spritePos: () => ({ x: 0, y: 0 }),
      buildAllyHpMap: () => new Map(),
      syncFinalState: () => {}
    };
    init(ctx);

    try {
      await renderBefriendQuiz({
        targetIndex: 0,
        creatureId: 'tetsu',
        creatureName: '鉄',
        creatureReading: 'てつ',
        options: [
          { id: 'tetsu', name: 'Iron' },
          { id: 'wrong-1', name: 'Water' },
          { id: 'wrong-2', name: 'Fire' }
        ],
        waitPrompt: {
          tokens: [{ surface: '待って', base: '待つ', reading: 'まって', meaning: 'wait' }]
        },
        namePrompt: {
          tokens: [{ surface: '名前', base: '名前', reading: 'なまえ', meaning: 'name' }]
        },
        successPrompt: {
          tokens: [{ surface: '友達', base: '友達', reading: 'ともだち', meaning: 'friend' }]
        }
      }, { enemies: state.combat.enemies });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(renderChoicesCalls[1].heading, 'Choose the creature name');
    assert.deepEqual(renderChoicesCalls[1].cards.map(card => card.title), ['Iron', 'Water', 'Fire']);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/api/game/befriend-quiz-answer');
    assert.deepEqual(fetchCalls[0].body, { action: 'talk', answerId: 'tetsu' });
  });

  it('renders AI befriend answer options from tokenized data', async () => {
    renderChoicesResults.push(0);
    const state = {
      combat: {
        enemies: [{ id: 'mizu', name: '水', nameEn: 'Water', reading: 'みず', hp: 5, maxHp: 10, befriended: false }],
        allies: []
      },
      run: { creatureParty: { active: [] } }
    };
    init({
      isCombatActive: () => true,
      withAnimationActive: async (fn) => fn(),
      getGameState: () => state,
      apiGetBefriendConversation: async () => ({
        userId: 'u1',
        targetEnemy: state.combat.enemies[0],
        targetEnemyIndex: 0,
        rounds: [{
          speaker: {
            raw: '水が好き？',
            tokens: [{ surface: '水', base: '水', reading: 'みず', meaning: 'water' }]
          },
          options: [
            { raw: 'うん', tokens: [{ surface: 'うん', base: 'うん', reading: 'うん', meaning: 'yeah' }] },
            { raw: 'いいえ', tokens: [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', meaning: 'no' }] },
            { raw: 'またね', tokens: [{ surface: 'またね', base: 'またね', reading: 'またね', meaning: 'see you' }] }
          ]
        }]
      }),
      apiSubmitBefriendAnswer: async () => ({
        correct: false,
        correctIndex: 1,
        enemyAttacks: [],
        allies: [],
        enemies: state.combat.enemies
      }),
      narration: { showNarration: async () => {}, forceHideNarration: () => {} },
      delay: async () => {},
      updateGameState: () => {},
      updateUI: () => {},
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
      spritePos: () => ({ x: 0, y: 0 }),
      buildAllyHpMap: () => new Map(),
    });

    await executeBefriendAction();

    assert.equal(renderChoicesCalls[0].cards[0].title, '<jp>');
  });
});
