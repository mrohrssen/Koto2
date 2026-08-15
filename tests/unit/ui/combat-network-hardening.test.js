import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

function createActionArea() {
  let syncNode = null;
  return {
    innerHTML: '',
    replaceChildren(node) {
      syncNode = node;
      this.innerHTML = node ? `<div class="${node.className}" data-combat-sync-token="${node.dataset.combatSyncToken}">${node.textContent}</div>` : '';
    },
    querySelector(selector) {
      if (!syncNode) return null;
      if (!selector.includes('.combat-syncing-indicator')) return null;
      return syncNode;
    },
  };
}

async function waitForCondition(predicate, message, maxTicks = 250) {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.ok(predicate(), message);
}

let actionArea = createActionArea();

globalThis.window = {
  __intentLog: null,
};
globalThis.localStorage = createStorage();

globalThis.document = {
  getElementById: id => (id === 'action-area' ? actionArea : null),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => {
    const node = {
      style: {},
      className: '',
      dataset: {},
      textContent: '',
      classList: { add() {}, remove() {} },
      appendChild() {},
      remove() {
        if (actionArea.querySelector('.combat-syncing-indicator') === node) {
          actionArea.replaceChildren();
        }
      },
    };
    return node;
  },
};

Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: () => false },
  configurable: true,
});
globalThis.requestAnimationFrame = callback => setImmediate(() => callback(Date.now()));
globalThis.cancelAnimationFrame = id => clearImmediate(id);

const combatLoop = await import('../../../public/js/ui/combat-loop.js');
const { clearSceneManager, setSceneManager } = await import('../../../public/js/scenes/scene-manager.js');
const {
  configureExploreSession,
  resetExploreSession,
} = await import('../../../public/js/ui/explore-session.js');
const {
  configureKanjiKombatSession,
  getKanjiKombatSession,
  resetKanjiKombatSession,
  KK_SESSION_HARD_CAP,
} = await import('../../../public/js/ui/kanji-kombat-session.js');
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const combatLoopSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/combat-loop.js'), 'utf8');
const combatVfxSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/combat-vfx.js'), 'utf8');
const kanjiKombatSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');

function initCombatLoopTestDefaults() {
  combatLoop.init({
    getGameState: () => null,
    updateGameState: () => {},
    updateUI: () => {},
    settings: { getApiKeys: () => ({}) },
    narration: {},
    characterUI: {},
    getEnemyDialogueActive: () => false,
    delay: () => Promise.resolve(),
  });
}

function installRecoveryScene() {
  setSceneManager({
    transitioning: false,
    currentScene: {
      disposed: false,
      _exiting: false,
      syncCreatures: async ({ isCurrent = () => true }) => isCurrent(),
    },
  });
}

describe('combat network hardening', () => {
  beforeEach(() => {
    actionArea = createActionArea();
    localStorage.clear();
    console.log = () => {};
    resetKanjiKombatSession();
    resetExploreSession();
    configureExploreSession({ syncRequest: async () => ({}) });
    initCombatLoopTestDefaults();
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(500);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    resetKanjiKombatSession();
    resetExploreSession();
    clearSceneManager();
  });

  it('uses the injected creature combat API for attack requests', async () => {
    const calls = [];
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async (actionType, choices) => {
      calls.push({ actionType, choices });
      return { ok: true, state: { phase: 'combat' } };
    });

    const result = await combatLoop.__combatNetworkTest.requestCreatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: 'tackle', targetIndex: 0 },
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{
      actionType: 'attack',
      choices: [{ creatureIndex: 0, moveId: 'tackle', targetIndex: 0 }],
    }]);
  });

  it('builds optimistic defend envelopes through the combat-loop state seam', () => {
    const move = {
      id: 'poke',
      name: '突く',
      nameEn: 'Poke',
      reading: 'つく',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 1,
      mpCost: 0,
      accuracy: 100,
    };
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      level: 3,
      attack: 10,
      defense: 5,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [move],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      element: 'water',
    };
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => ({
        phase: 'combat',
        combat: {
          active: true,
          allies: [ally],
          enemies: [enemy],
          optimistic: { combatId: 'cmb_defend', stateVersion: 3, nextTurnSeed: 'seed_defend' },
        },
        run: {
          partySkills: [],
          creatureParty: { active: [ally], reserves: [] },
        },
      }),
    });

    const result = combatLoop.__combatNetworkTest.buildOptimisticCreatureCombatRequest('defend', []);

    assert.equal(result.envelope.combatId, 'cmb_defend');
    assert.equal(result.envelope.stateVersion, 3);
    assert.equal(result.envelope.seed, 'seed_defend');
    assert.equal(result.envelope.payload.actionType, 'defend');
    assert.equal(result.localTranscript.actionType, 'defend');
  });

  it('builds optimistic Kanji Kombat answer envelopes through the combat-loop state seam', () => {
    const move = {
      id: 'poke',
      name: '突く',
      nameEn: 'Poke',
      reading: 'つく',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 1,
      mpCost: 0,
      accuracy: 100,
    };
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      level: 3,
      attack: 10,
      defense: 5,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [move],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      element: 'water',
    };
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => ({
        phase: 'combat',
        combat: {
          active: true,
          mode: 'kanjiKombat',
          allies: [ally],
          enemies: [enemy],
          actionCursor: { side: 'ally', index: 0, opening: false },
          optimistic: { combatId: 'cmb_kanji', stateVersion: 4, nextTurnSeed: 'seed_kanji' },
        },
        run: {
          mode: 'kanjiKombat',
          partySkills: [],
          creatureParty: { active: [ally], reserves: [] },
          kanjiKombat: {
            currentQuiz: {
              cardId: 'hiragana:あ',
              choices: [
                { id: 'answer-correct', answer: 'a', correct: true },
                { id: 'answer-wrong', answer: 'i', correct: false },
              ],
            },
            promptBuffer: [{
              promptId: 'kkp_network',
              sequence: 9,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            }],
          },
        },
      }),
    });

    const result = combatLoop.__combatNetworkTest.buildOptimisticKanjiKombatRequest(
      'answer-correct',
      { promptId: 'kkp_network', sequence: 9, cardId: 'hiragana:あ' },
    );

    assert.equal(result.envelope.actionType, 'kanjiKombat.answer');
    assert.equal(result.envelope.combatId, 'cmb_kanji');
    assert.equal(result.envelope.stateVersion, 4);
    assert.equal(result.envelope.seed, 'seed_kanji');
    assert.equal(result.envelope.payload.answerId, 'answer-correct');
    assert.equal(result.envelope.payload.predictionMode, 'shared-kanji-kombat-v1');
    assert.equal(result.envelope.payload.promptId, 'kkp_network');
    assert.equal(result.envelope.payload.promptSequence, 9);
    assert.equal(result.envelope.payload.cardId, 'hiragana:あ');
    assert.deepEqual(result.envelope.payload.promptRef, {
      promptId: 'kkp_network',
      sequence: 9,
      cardId: 'hiragana:あ',
    });
    assert.equal(result.localTranscript.actionType, 'kanjiKombat');
    assert.equal(result.localTranscript.kanjiAnswerCorrect, true);
  });

  it('defines the shared creature combat playback helper used by attack submissions', () => {
    assert.match(combatLoopSource, /async function playCreatureCombatResult\(/);
    assert.match(combatLoopSource, /await playCreatureCombatResult\(result, turnTiming,/);
  });

  it('defers optimistic next selection until verification reconciles the turn', () => {
    assert.match(combatLoopSource, /deferNextSelection = false/);
    assert.match(combatLoopSource, /if \(deferNextSelection\) \{/);
    assert.match(combatLoopSource, /deferNextSelection: true/);
    assert.match(combatLoopSource, /await handleOptimisticCombatVerification/);
    assert.match(combatLoopSource, /startMoveSelection\(\);/);
    assert.match(combatLoopSource, /actionType: 'defend'/);
    assert.match(combatLoopSource, /playCreatureDefendResult\(localTranscript, turnTiming,/);
  });

  it('threads Explore combat ownership through attack and defend playback finalization', () => {
    assert.match(
      combatLoopSource,
      /await withExploreCombatPlayback\(async \(\) => \{[\s\S]*?await playback\([\s\S]*?optimistic\.localTranscript/,
      'the production session turn must hold checkpoint adoption across the complete playback helper',
    );
    assert.match(
      combatLoopSource,
      /playback: typeof options\.playback === 'function'[\s\S]*?: \(localTranscript, \{ isCurrent, canFinalizeState \} = \{\}\) => playCreatureCombatResult[\s\S]*?isPlaybackCurrent: isCurrent,[\s\S]*?canFinalizePlaybackState: canFinalizeState/,
      'attack playback must receive the captured Explore combat owner guard',
    );
    assert.match(
      combatLoopSource,
      /playback: typeof playback === 'function'[\s\S]*?: \(localTranscript, \{ isCurrent, canFinalizeState \} = \{\}\) => playCreatureDefendResult[\s\S]*?isPlaybackCurrent: isCurrent,[\s\S]*?canFinalizePlaybackState: canFinalizeState/,
      'defend playback must receive the captured Explore combat owner guard',
    );
    assert.match(
      combatLoopSource,
      /async function playCreatureCombatResult[\s\S]*?syncFinalState\(result, \{\s*isCurrent: \(\) => isPlaybackCurrent\(\) && canFinalizePlaybackState\(\),\s*\}\)/,
      'attack playback finalization must fail closed after combat ownership changes',
    );
    assert.match(
      combatLoopSource,
      /async function playCreatureDefendResult[\s\S]*?syncFinalState\(result, \{\s*isCurrent: \(\) => isPlaybackCurrent\(\) && canFinalizePlaybackState\(\),\s*\}\)/,
      'defend playback finalization must fail closed after combat ownership changes',
    );
  });

  it('scopes attack and defend rejection cleanup to the captured Explore owner', () => {
    assert.match(
      combatLoopSource,
      /async function executeCreatureMovesTurn[\s\S]*?captureExploreCombatOperation[\s\S]*?catch \(error\) \{[\s\S]*?handleCreatureTurnFailure\([\s\S]*?exploreOperation/,
      'attack wrapper must route rejection cleanup through captured Explore ownership',
    );
    assert.match(
      combatLoopSource,
      /async function executeCreatureDefendThenPause[\s\S]*?captureExploreCombatOperation[\s\S]*?catch \(error\) \{[\s\S]*?handleCreatureTurnFailure\([\s\S]*?exploreOperation/,
      'defend wrapper must route rejection cleanup through captured Explore ownership',
    );
  });

  it('does not hard-code optimistic creature return-to-selection padding', () => {
    assert.doesNotMatch(
      combatLoopSource,
      /async function runOptimisticCreatureCombatTurn[\s\S]*?nextSelectionDelayMs = 600/,
    );
    assert.doesNotMatch(
      combatLoopSource,
      /runOptimisticCreatureCombatTurn\([\s\S]*?nextSelectionDelayMs:\s*600/,
    );
  });

  it('does not keep dead-air delay before move selection after creature defend playback', () => {
    assert.doesNotMatch(
      combatLoopSource,
      /enemyAttackPending = false;\s*\/\/ Start next turn's move selection\s*await delay\(600\);\s*logCombatTurnTiming/,
    );
  });

  it('does not keep static defend-staging waits before enemy attack playback', () => {
    assert.doesNotMatch(
      combatLoopSource,
      /combat-defend-indicator[\s\S]{0,240}await delay\(600\);/,
    );
  });

  it('skips attack result cards for Kanji Kombat answer playback', () => {
    assert.match(combatLoopSource, /skipAttackCards: actionType === 'kanjiKombat'/);
    assert.match(combatLoopSource, /if \(!skipAttackCards\) \{/);
    assert.match(combatLoopSource, /showOneEnemyAttackAnimated\(result, atk, allyHpMap, false, \{ skipAttackCards \}\)/);
    assert.match(combatVfxSource, /if \(atk\.attackerNameJp && !skipAttackCards\) \{/);
  });

  it('refreshes scene and HUD after Kanji Kombat starts a next wave', () => {
    assert.match(combatLoopSource, /if \(result\.nextWave\) \{/);
    assert.match(combatLoopSource, /playKanjiKombatNextWaveTransition\(result\)/);
    assert.match(combatLoopSource, /result\.nextWaveEnemies/);
    assert.match(combatLoopSource, /ROOM_TRAVEL_DURATION_MS/);
    assert.match(combatLoopSource, /battleScene\.formation\.walkingEnabled = true/);
    assert.match(combatLoopSource, /playKanjiKombatEnemyTravelReveal\(\{ enemies, allies, isBoss \}\)/);
    assert.match(combatLoopSource, /syncCreatures\(\{ allies: revealAllies, enemies, initial: true \}\)/);
    assert.match(combatLoopSource, /updateUI\?\.\(\);/);
  });

  it('shows a centered correctness banner for Kanji Kombat answers', () => {
    assert.match(combatLoopSource, /showKanjiKombatAnswerBanner\(result\.kanjiAnswerCorrect, result\.kanjiStreakReward \|\| null\)/);
    assert.match(combatVfxSource, /showKanjiKombatAnswerBanner/);
    assert.match(combatVfxSource, /Correct!/);
    assert.match(combatVfxSource, /Wrong!/);
  });

  it('syncs authoritative Kanji Kombat streak reward visuals via the session checkpoint handler', () => {
    // Streak visuals now come from the server-confirmed checkpoint, not the optimistic path.
    // The checkpoint handler in kanji-kombat.js calls syncKanjiKombatStreakRewardVisuals when
    // a result carries kanjiStreakReward.
    assert.match(
      kanjiKombatSource,
      /handleSessionCheckpoint[\s\S]*?syncKanjiKombatStreakRewardVisuals/,
    );
    assert.match(
      kanjiKombatSource,
      /api\.syncKanjiKombatStreakRewardVisuals/,
    );
    // The local optimistic path shows the correctness banner immediately (no server wait).
    // For streak milestones it includes a predicted reward with the streak count.
    assert.match(
      combatLoopSource,
      /runOptimisticKanjiKombatAnswer[\s\S]*?willKanjiKombatAnswerTriggerStreakReward[\s\S]*?showKanjiKombatAnswerBanner\(correct, predictedStreakReward\)/,
    );
  });

  it('surfaces authoritative Kanji Kombat XP events via the session checkpoint handler', () => {
    // XP events from the server now arrive through the checkpoint handler in kanji-kombat.js.
    assert.match(
      kanjiKombatSource,
      /handleSessionCheckpoint[\s\S]*?api\.showXpEvents\?.*xpEvents/,
    );
    assert.match(
      kanjiKombatSource,
      /api\.processPendingMoveLearn/,
    );
    // The visual helpers are exported from combat-loop.js so kanji-kombat.js can call them.
    assert.match(combatLoopSource, /export function showXpEvents/);
    assert.match(combatLoopSource, /export async function syncKanjiKombatStreakRewardVisuals/);
    assert.match(combatLoopSource, /export async function playKanjiKombatNextWaveTransition/);
    assert.match(combatLoopSource, /export async function processPendingMoveLearn/);
  });

  it('keeps Kanji Kombat answer submissions wired to the optimistic playback path', () => {
    assert.match(
      combatLoopSource,
      /submitKanjiKombatAnswer[\s\S]*?kanjiAnswerId: answerId/,
    );
  });

  it('throws a clear setup error when the injected API is missing', async () => {
    await assert.rejects(
      () => combatLoop.__combatNetworkTest.requestCreatureCombatCycle('defend', []),
      /Creature combat API is not configured/
    );
  });

  it('dedupes creature combat submissions while one is in flight', async () => {
    let resolveRequest;
    let callCount = 0;
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => {
      callCount++;
      return new Promise(resolve => {
        resolveRequest = resolve;
      });
    });

    const first = combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);
    const second = combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);

    assert.equal(callCount, 1);
    assert.equal(await second, null);

    resolveRequest({ ok: true });
    assert.deepEqual(await first, { ok: true });
  });

  it('does not show syncing indicator for a fast combat request', async () => {
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(20);
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));

    const result = await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);

    assert.deepEqual(result, { ok: true });
    assert.equal(actionArea.innerHTML, '');
  });

  it('shows and clears syncing indicator for a slow combat request', async () => {
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(1);
    let resolveRequest;
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => new Promise(resolve => {
      resolveRequest = resolve;
    }));

    const pending = combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.match(actionArea.innerHTML, /combat-syncing-indicator/);
    assert.match(actionArea.innerHTML, /Syncing turn/);

    resolveRequest({ ok: true });
    assert.deepEqual(await pending, { ok: true });
    assert.equal(actionArea.innerHTML, '');
  });

  it('does not let a stale sync timer overwrite a completed request', async () => {
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(20);
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));

    await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);
    actionArea.innerHTML = '<button>Attack</button>';
    await new Promise(resolve => setTimeout(resolve, 30));

    assert.equal(actionArea.innerHTML, '<button>Attack</button>');
  });

  it('logs request timing when combat timing flag is enabled', async () => {
    const calls = [];
    console.log = (...args) => calls.push(args);
    localStorage.setItem('kotoCombatTiming', '1');
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));

    try {
      await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);
    } finally {
      localStorage.removeItem('kotoCombatTiming');
    }

    assert.equal(calls.some(args => args[0] === '[Combat Timing] request'), true);
  });

  it('logs request timing for every combat request', async () => {
    const calls = [];
    console.log = (...args) => calls.push(args);
    localStorage.removeItem('kotoCombatTiming');
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));

    await combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);

    const timingLog = calls.find(args => args[0] === '[Combat Timing] request');
    assert.ok(timingLog);
    assert.equal(timingLog[1].actionType, 'defend');
    assert.equal(timingLog[1].failed, false);
    assert.equal(timingLog[1].indicatorShown, false);
    assert.equal(typeof timingLog[1].requestMs, 'number');
  });

  it('recovers attack errors by merging authoritative state and restarting selection', async () => {
    const updates = [];
    let restartCount = 0;
    let currentState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 1,
      },
    };
    const authoritativeState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 1, opening: false },
        actionCount: 2,
      },
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => { updates.push(state); currentState = state; },
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.recoverFromCombatErrorState(
      { error: 'Submitted move does not match current action cursor', state: authoritativeState },
      'attack',
      { restartSelection: () => { restartCount += 1; } }
    );

    assert.deepEqual(result, {
      recovered: true,
      outcome: 'stale_error_state_recovered',
      combatActive: true,
    });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].combat.actionCursor, { side: 'ally', index: 1, opening: false });
    assert.equal(restartCount, 1);
  });

  it('recovers defend errors by merging authoritative state and restarting selection', async () => {
    const updates = [];
    let restartCount = 0;
    let currentState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 1,
      },
    };
    const authoritativeState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 1, opening: false },
        actionCount: 2,
      },
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => { updates.push(state); currentState = state; },
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.recoverFromCombatErrorState(
      { error: 'Submitted move does not match current action cursor', state: authoritativeState },
      'defend',
      { restartSelection: () => { restartCount += 1; } }
    );

    assert.deepEqual(result, {
      recovered: true,
      outcome: 'stale_error_state_recovered',
      combatActive: true,
    });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].combat.actionCursor, { side: 'ally', index: 1, opening: false });
    assert.equal(restartCount, 1);
  });

  it('recovers a null combat POST by fetching server state once', async () => {
    const updates = [];
    let fetchCount = 0;
    let restartCount = 0;
    let currentState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 1,
      },
    };
    const fetchedState = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 1, opening: false },
        actionCount: 2,
      },
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => { updates.push(state); currentState = state; },
      fetchServerState: async () => {
        fetchCount += 1;
        return fetchedState;
      },
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack', {
      restartSelection: () => { restartCount += 1; },
    });

    assert.deepEqual(result, {
      recovered: true,
      outcome: 'null_post_state_recovered',
      combatActive: true,
    });
    assert.equal(fetchCount, 1);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].combat.actionCursor, { side: 'ally', index: 1, opening: false });
    assert.equal(restartCount, 1);
  });

  it('does not recover a null combat POST when server state fetch is transient', async () => {
    let fetchCount = 0;
    let updateCount = 0;
    let currentState = { phase: 'combat', combat: { active: true } };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: () => { updateCount += 1; },
      fetchServerState: async () => {
        fetchCount += 1;
        return { error: 'network_unavailable', transient: true };
      },
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack');

    assert.deepEqual(result, {
      recovered: false,
      outcome: 'recovery_failed',
      combatActive: true,
    });
    assert.equal(fetchCount, 1);
    assert.equal(updateCount, 0);
  });

  it('fails closed when standard Explore recovery was not captured before the request', async () => {
    let fetchCount = 0;
    let updateCount = 0;
    const room = { id: 'room-0' };
    const currentState = {
      phase: 'combat',
      room,
      run: { active: true, mode: 'standard', currentRoom: 0, rooms: [room] },
      combat: { active: true, optimistic: { combatId: 'combat-a' } },
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: () => { updateCount += 1; },
      fetchServerState: async () => {
        fetchCount += 1;
        return currentState;
      },
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack');

    assert.deepEqual(result, {
      recovered: false,
      outcome: 'recovery_failed',
      combatActive: true,
    });
    assert.equal(fetchCount, 0);
    assert.equal(updateCount, 0);
  });

  it('does not fetch server state for healthy combat requests', async () => {
    let fetchCount = 0;
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      fetchServerState: async () => {
        fetchCount += 1;
        return { phase: 'combat' };
      },
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const result = await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);

    assert.deepEqual(result, { ok: true });
    assert.equal(fetchCount, 0);
  });

  it('null recovery fetches state without resubmitting the combat action', async () => {
    let combatCallCount = 0;
    let stateFetchCount = 0;
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => {
      combatCallCount += 1;
      return null;
    });
    let currentState = { phase: 'combat', combat: { active: true } };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => { currentState = state; },
      fetchServerState: async () => {
        stateFetchCount += 1;
        return {
          phase: 'combat',
          combat: {
            active: true,
            actionCursor: { side: 'ally', index: 0, opening: false },
          },
        };
      },
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);

    await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);
    const recovery = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack', {
      restartSelection: () => {},
    });

    assert.equal(recovery.recovered, true);
    assert.equal(combatCallCount, 1);
    assert.equal(stateFetchCount, 1);
  });

  it('does not refresh or restart a successor after a rejected append replaces its captured owner', async () => {
    const move = {
      id: 'poke', name: '突く', nameEn: 'Poke', reading: 'つく', element: 'neutral',
      category: 'damage', target: 'single_enemy', power: 1, mpCost: 0, accuracy: 100,
    };
    const ally = {
      id: 'hi', uid: 'ally-hi', name: '火', nameEn: 'Fire', reading: 'ひ', element: 'fire',
      level: 3, attack: 10, defense: 5, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
      moves: [move],
    };
    const enemy = {
      ...ally,
      id: 'mizu', uid: 'enemy-mizu', name: '水', nameEn: 'Water', reading: 'みず',
      element: 'water', moves: [{ ...move, id: 'tap', power: 0 }],
    };
    const room = { id: 'room-0', type: 'encounter' };
    const runway = {
      sessionEpoch: 'ese_rejected_owner',
      currentRoom: 0,
      roomActionSeq: 1,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        actionSeq: 1,
        room,
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
        dependencies: ['partyStats'],
        offlineReady: true,
        interactionPayload: { combatId: 'combat-a' },
      }],
    };
    const makeState = combatId => ({
      phase: 'combat',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        rooms: [room],
        exploreRunway: runway,
        partySkills: [],
        itemBuffs: { xpMultiplier: 1, xpBalanceStacks: 0 },
        crestMults: {},
        creatureParty: { active: [ally], reserves: [] },
      },
      combat: {
        active: true,
        isCreatureCombat: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 0,
        optimistic: {
          combatId,
          stateVersion: 0,
          nextTurnSeed: 'seed-a',
          turnSeeds: ['seed-a', 'seed-b'],
        },
      },
    });
    let currentState = makeState('combat-a');
    const authoritativeState = makeState('combat-b');
    let fetchCount = 0;
    let moveSelectionRendered = false;
    const session = configureExploreSession({
      syncRequest: async () => ({ status: 'ok', confirmedThroughSeq: null, results: [] }),
      schedule: () => null,
      cancel: () => {},
    });
    session.adoptRunway(runway);
    session.recordRoomAction = () => {
      currentState = authoritativeState;
      return { accepted: false, reason: 'hardCap', pendingCount: 50 };
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => { currentState = state; },
      fetchServerState: async ({ adoptSession }) => {
        assert.equal(adoptSession, true);
        fetchCount += 1;
        return authoritativeState;
      },
    });
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => {
      throw new Error('legacy verify must not run');
    });
    installRecoveryScene();
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ enemy: true });

    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'defend',
      moveChoices: [],
      turnTiming: {},
      pendingFlag: 'enemy',
      playback: async () => { throw new Error('rejected append must not play'); },
      startMoveSelection: () => { moveSelectionRendered = true; },
      stopCombatLoop: () => {},
    });

    assert.equal(handled, true);
    assert.equal(fetchCount, 0);
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().enemy, false);
    assert.equal(combatLoop.getExploreCombatPlaybackRecoveryState(), 'none');
    assert.equal(combatLoop.consumeExploreCombatPlaybackRecovery(), false);
    assert.equal(currentState.combat.optimistic.combatId, 'combat-b');
    assert.equal(moveSelectionRendered, false);
  });

  it('does not fetch a recovery response after session replacement supersedes the rejected owner', async () => {
    const move = {
      id: 'poke', name: '突く', nameEn: 'Poke', reading: 'つく', element: 'neutral',
      category: 'damage', target: 'single_enemy', power: 1, mpCost: 0, accuracy: 100,
    };
    const ally = {
      id: 'hi', uid: 'ally-hi', name: '火', nameEn: 'Fire', reading: 'ひ', element: 'fire',
      level: 3, attack: 10, defense: 5, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
      moves: [move],
    };
    const enemy = {
      ...ally,
      id: 'mizu', uid: 'enemy-mizu', name: '水', nameEn: 'Water', reading: 'みず',
      element: 'water', moves: [{ ...move, id: 'tap', power: 0 }],
    };
    const room = { id: 'room-0', type: 'encounter' };
    const makeRunway = combatId => ({
      sessionEpoch: 'ese_delayed_owner',
      currentRoom: 0,
      roomActionSeq: 1,
      preparedRooms: [{
        index: 0,
        roomId: room.id,
        actionSeq: 1,
        room,
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['partyStats'] },
        dependencies: ['partyStats'],
        offlineReady: true,
        interactionPayload: { combatId },
      }],
    });
    const makeState = combatId => ({
      phase: 'combat',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        rooms: [room],
        exploreRunway: makeRunway(combatId),
        partySkills: [],
        itemBuffs: { xpMultiplier: 1, xpBalanceStacks: 0 },
        crestMults: {},
        creatureParty: { active: [ally], reserves: [] },
      },
      combat: {
        active: true,
        isCreatureCombat: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 0,
        optimistic: {
          combatId,
          stateVersion: 0,
          nextTurnSeed: 'seed-a',
          turnSeeds: ['seed-a', 'seed-b'],
        },
      },
    });
    const stateA = makeState('combat-a');
    const stateB = makeState('combat-b');
    let currentState = stateA;
    let updateCount = 0;
    let sceneSyncCount = 0;
    let moveSelectionCount = 0;
    let fetchCount = 0;
    const session = configureExploreSession({
      syncRequest: async () => ({ status: 'ok', confirmedThroughSeq: null, results: [] }),
      schedule: () => null,
      cancel: () => {},
    });
    session.adoptRunway(makeRunway('combat-a'));
    session.recordRoomAction = () => {
      currentState = stateB;
      session.adoptRunway(makeRunway('combat-b'));
      return { accepted: false, reason: 'hardCap', pendingCount: 50 };
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => {
        updateCount += 1;
        currentState = state;
      },
      fetchServerState: async ({ adoptSession }) => {
        assert.equal(adoptSession, true);
        fetchCount += 1;
        return stateB;
      },
    });
    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        syncCreatures: async () => { sceneSyncCount += 1; },
      },
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ enemy: true });

    const turn = combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'defend',
      moveChoices: [],
      turnTiming: {},
      pendingFlag: 'enemy',
      playback: async () => { throw new Error('rejected append must not play'); },
      startMoveSelection: () => { moveSelectionCount += 1; },
      stopCombatLoop: () => {},
    });
    const handled = await turn;

    assert.equal(handled, true);
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().enemy, false);
    assert.equal(currentState.combat.optimistic.combatId, 'combat-b');
    assert.equal(fetchCount, 0, 'a superseded owner must not fetch recovery state');
    assert.equal(updateCount, 0, 'the superseded recovery must not update shared game state');
    assert.equal(sceneSyncCount, 0, 'the superseded recovery must not mutate the current scene');
    assert.equal(moveSelectionCount, 0, 'the superseded recovery must not unlock combat B');
    assert.equal(combatLoop.getExploreCombatPlaybackRecoveryState(), 'none');
  });

  it('session cap blocks a Kanji Kombat answer when the log is at the hard cap', async () => {
    // Configure a never-resolving sync so the log fills without draining.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const session = getKanjiKombatSession();

    // Fill the log to KK_SESSION_HARD_CAP.
    for (let i = 0; i < KK_SESSION_HARD_CAP; i++) {
      session.recordAction({ actionId: `fill_${i}`, kind: 'quiz', promptId: `p_${i}` });
    }
    assert.equal(session.canConsumePrompt(), false);

    const calls = [];
    const ally = { id: 'hi', hp: 100, maxHp: 100, element: 'fire', moves: [] };
    const enemy = { id: 'mizu', hp: 20, maxHp: 20 };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        optimistic: { combatId: 'cmb_cap', stateVersion: 2, nextTurnSeed: 'seed_cap' },
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_cap',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
          }],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => { throw new Error('should not call'); });
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => currentState,
      update: state => calls.push({ type: 'update', state }),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_cap', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => calls.push({ type: 'playback' }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, false);
    assert.equal(calls.filter(c => c.type === 'playback').length, 0);
    assert.equal(calls.filter(c => c.type === 'update').length, 0);
    assert.equal(session.pendingCount(), KK_SESSION_HARD_CAP);
  });

  it('Kanji Kombat answer plays locally, appends to session log, and returns before sync resolves', async () => {
    let syncResolveFn;
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(resolve => { syncResolveFn = resolve; }),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 0); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_local', stateVersion: 2, nextTurnSeed: 'seed_kanji_local', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a', correct: true },
              { id: 'answer-wrong', answer: 'i', correct: false },
            ],
          },
          promptBuffer: [
            {
              promptId: 'kkp_answer_local',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            },
            {
              promptId: 'kkp_next_local',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: {
                cardId: 'hiragana:い',
                prompt: 'い',
                choices: [{ id: 'answer-i', answer: 'i', correct: true }],
              },
            },
          ],
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-correct',
      promptRef: { promptId: 'kkp_answer_local', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push(['playback', localTranscript.kanjiAnswerCorrect]),
      startMoveSelection: () => calls.push(['startMoveSelection']),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    assert.deepEqual(calls, [
      ['playback', true],
      ['startMoveSelection'],
    ]);
    // Session log has one entry for this answer.
    const session = getKanjiKombatSession();
    assert.equal(session.pendingCount(), 1);
    const snap = session.snapshot();
    assert.equal(snap[0].kind, 'quiz');
    assert.equal(snap[0].promptId, 'kkp_answer_local');
    assert.equal(snap[0].answerId, 'answer-correct');
    // Local state was updated: prompt buffer advanced to next prompt.
    assert.equal(updates.at(-1).run.kanjiKombat.promptBuffer[0].promptId, 'kkp_next_local');
    assert.equal(updates.at(-1).run.kanjiKombat.currentQuiz.cardId, 'hiragana:い');
  });

  it('keeps wrong Kanji Kombat answer feedback visible for 200ms while playback starts immediately', async () => {
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void fn; void delay; return setTimeout(() => {}, 99999); },
    });
    const calls = [];
    const updates = [];
    const delays = [];
    let resolveDelay;
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_wrong_hold', stateVersion: 2, nextTurnSeed: 'seed_kanji_wrong_hold', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a', correct: true },
              { id: 'answer-wrong', answer: 'i', correct: false },
            ],
          },
          promptBuffer: [
            {
              promptId: 'kkp_wrong_hold',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            },
            {
              promptId: 'kkp_after_wrong_hold',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: {
                cardId: 'hiragana:い',
                prompt: 'い',
                choices: [{ id: 'answer-i', answer: 'i', correct: true }],
              },
            },
          ],
        },
      },
    };

    combatLoop.init({
      getGameState: () => updates.at(-1) || currentState,
      updateGameState: state => updates.push(state),
      updateUI: () => {},
      settings: { getApiKeys: () => ({}) },
      narration: {},
      characterUI: {},
      getEnemyDialogueActive: () => false,
      delay: ms => new Promise(resolve => {
        delays.push(ms);
        resolveDelay = resolve;
      }),
      apiSubmitKanjiKombatAnswer: async () => ({ status: 'accepted' }),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handledPromise = combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-wrong',
      promptRef: { promptId: 'kkp_wrong_hold', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push(['playback', localTranscript.kanjiAnswerCorrect]),
      startMoveSelection: () => calls.push(['startMoveSelection']),
      getEnemyDialogueActive: () => false,
    });

    await waitForCondition(() => delays.length === 1, 'wrong answer feedback delay should be scheduled');

    try {
      assert.deepEqual(calls, [['playback', false]]);
      assert.equal(delays.length, 1);
      assert.equal(delays[0] > 190 && delays[0] <= 200, true);
      assert.equal(calls.some(call => call[0] === 'startMoveSelection'), false);
    } finally {
      resolveDelay();
    }

    assert.equal(await handledPromise, true);
    assert.deepEqual(calls, [
      ['playback', false],
      ['startMoveSelection'],
    ]);
  });

  function buildLocalStreakState({ streak = 0, allyHp = 50, pendingStreakRewards = null } = {}) {
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      element: 'fire',
      level: 1,
      xp: 0,
      hp: allyHp,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      attack: 5,
      defense: 5,
      dex: 5,
      moves: [],
    };
    const enemy = { ...ally, id: 'mizu', name: '水', nameEn: 'Water', hp: 500, maxHp: 500 };
    const quiz = {
      cardId: 'hiragana:あ',
      choices: [
        { id: 'answer-correct', answer: 'a', correct: true },
        { id: 'answer-wrong', answer: 'i', correct: false },
      ],
    };
    return {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_streak', stateVersion: 2, nextTurnSeed: 'seed_kanji_streak', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          streak,
          highestStreak: streak,
          ...(pendingStreakRewards ? { pendingStreakRewards } : {}),
          currentQuiz: quiz,
          promptBuffer: [
            { promptId: 'kkp_streak_1', sequence: 1, kind: 'quiz', cardId: 'hiragana:あ', quiz },
            {
              promptId: 'kkp_streak_2',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', choices: [{ id: 'answer-i', answer: 'i', correct: true }] },
            },
          ],
        },
      },
    };
  }

  async function runLocalStreakAnswer(currentState, answerId) {
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const updates = [];
    let playbackAllyHp = null;
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId,
      promptRef: { promptId: 'kkp_streak_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => {
        // Post-turn, pre-streak-reward ally HP (the reward applies after the turn)
        playbackAllyHp = localTranscript.allies?.[0]?.hp ?? null;
      },
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    return { finalState: updates.at(-1), playbackAllyHp };
  }

  it('local Kanji Kombat prediction applies the streak-3 heal to the local draft party', async () => {
    const currentState = buildLocalStreakState({ streak: 2, allyHp: 50 });

    const { finalState, playbackAllyHp } = await runLocalStreakAnswer(currentState, 'answer-correct');

    const kk = finalState.run.kanjiKombat;
    assert.equal(kk.streak, 3, 'local streak must advance on a correct answer');
    const finalAlly = finalState.run.creatureParty.active[0];
    assert.ok(Number.isFinite(playbackAllyHp), 'playback transcript should carry post-turn ally hp');
    const expectedHp = Math.min(finalAlly.maxHp, playbackAllyHp + Math.ceil(finalAlly.maxHp * 0.20));
    assert.equal(finalAlly.hp, expectedHp, 'streak-3 heal (20% maxHp) must apply to the local draft');
    assert.equal(finalState.combat.allies[0], finalAlly, 'combat.allies stays aliased to the party');
  });

  it('local Kanji Kombat prediction applies the pre-rolled statUp payload at streak 6', async () => {
    const currentState = buildLocalStreakState({
      streak: 5,
      pendingStreakRewards: {
        6: [{ seq: 1, type: 'statUp', allyRoll: 0, stat: 'def' }],
        12: [],
      },
    });

    const { finalState } = await runLocalStreakAnswer(currentState, 'answer-correct');

    const kk = finalState.run.kanjiKombat;
    assert.equal(kk.streak, 6);
    assert.equal(finalState.run.creatureParty.active[0].statStages?.def, 1,
      'pre-rolled statUp payload must be applied verbatim to the local draft');
    assert.equal(kk.pendingStreakRewards[6].length, 0, 'payload consumed from the local queue');
  });

  it('local Kanji Kombat prediction resets the streak on a wrong answer without rewards', async () => {
    const currentState = buildLocalStreakState({
      streak: 5,
      allyHp: 50,
      pendingStreakRewards: {
        6: [{ seq: 1, type: 'statUp', allyRoll: 0, stat: 'def' }],
        12: [],
      },
    });

    const { finalState, playbackAllyHp } = await runLocalStreakAnswer(currentState, 'answer-wrong');

    const kk = finalState.run.kanjiKombat;
    assert.equal(kk.streak, 0, 'local streak must reset on a wrong answer');
    const finalAlly = finalState.run.creatureParty.active[0];
    assert.equal(finalAlly.hp, playbackAllyHp, 'no heal applied on a wrong answer');
    assert.equal(finalAlly.statStages?.def ?? 0, 0, 'no buff applied on a wrong answer');
    assert.equal(kk.pendingStreakRewards[6].length, 1, 'payload must not be consumed');
  });

  it('local Kanji Kombat prediction applies deferred kill XP for a mid-wave kill', async () => {
    // The server awards deferred kill XP after EVERY answer that defeats an enemy
    // (_collectDeferredKillXpEvents), not just at wave boundaries.  A mid-wave kill
    // in a multi-enemy wave must level/restore the local draft party identically,
    // or the next transcript hash diverges.
    const currentState = buildLocalStreakState({ streak: 0, allyHp: 100 });
    const template = currentState.combat.enemies[0];
    currentState.combat.enemies = [
      { ...template, id: 'mizu', hp: 1, maxHp: 500, level: 2 },
      { ...template, id: 'tetsu', hp: 500, maxHp: 500, level: 2 },
    ];

    const { finalState } = await runLocalStreakAnswer(currentState, 'answer-correct');

    assert.equal(finalState.combat.enemies[0].hp, 0, 'first enemy dies to the strike');
    assert.ok(finalState.combat.enemies[1].hp > 0, 'wave must not be cleared');
    const finalAlly = finalState.run.creatureParty.active[0];
    assert.ok(
      finalAlly.xp > 0 || finalAlly.level > 1,
      'mid-wave kill XP must be applied to the local draft party',
    );
    assert.equal(finalState.combat.allies[0], finalAlly, 'combat.allies stays aliased to the party');
  });

  it('three consecutive Kanji Kombat answers all play locally with a 3-seed chain and all append to the session log', async () => {
    // New contract: with a 3-deep turnSeeds chain, three consecutive answers all return true
    // and all append to the session log without blocking each other.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}), // never resolves
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 30,
      maxHp: 30,
    };
    const baseState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: {
          combatId: 'cmb_chain',
          stateVersion: 2,
          nextTurnSeed: 's1',
          turnSeeds: ['s1', 's2', 's3'],
        },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_chain_1',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
            },
            {
              promptId: 'kkp_chain_2',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', choices: [{ id: 'ans-i', answer: 'i', correct: true }] },
            },
            {
              promptId: 'kkp_chain_3',
              sequence: 3,
              kind: 'quiz',
              cardId: 'hiragana:う',
              quiz: { cardId: 'hiragana:う', choices: [{ id: 'ans-u', answer: 'u', correct: true }] },
            },
          ],
        },
      },
    };
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || baseState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const first = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_chain_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => calls.push('playback1'),
      startMoveSelection: () => calls.push('select1'),
      getEnemyDialogueActive: () => false,
    });
    const second = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-i',
      promptRef: { promptId: 'kkp_chain_2', sequence: 2, cardId: 'hiragana:い' },
      turnTiming: {},
      playback: async () => calls.push('playback2'),
      startMoveSelection: () => calls.push('select2'),
      getEnemyDialogueActive: () => false,
    });
    const third = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-u',
      promptRef: { promptId: 'kkp_chain_3', sequence: 3, cardId: 'hiragana:う' },
      turnTiming: {},
      playback: async () => calls.push('playback3'),
      startMoveSelection: () => calls.push('select3'),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(first, true, 'first answer should be handled');
    assert.equal(second, true, 'second answer should be handled without blocking');
    assert.equal(third, true, 'third answer should be handled without blocking');
    assert.deepEqual(calls, ['playback1', 'select1', 'playback2', 'select2', 'playback3', 'select3']);
    assert.equal(getKanjiKombatSession().pendingCount(), 3);
    const snap = getKanjiKombatSession().snapshot();
    assert.equal(snap[0].promptId, 'kkp_chain_1');
    assert.equal(snap[1].promptId, 'kkp_chain_2');
    assert.equal(snap[2].promptId, 'kkp_chain_3');
  });

  it('submitKanjiKombatAnswer reports handled answers and wires to the session quiz path', () => {
    // Successful submitKanjiKombatAnswer paths return { handledByCombatLoop: true }.
    // The actual session-log append happens through executeCreatureMovesTurn's
    // kanjiKombat path, which calls runOptimisticKanjiKombatAnswer.
    assert.match(
      combatLoopSource,
      /submitKanjiKombatAnswer[\s\S]*?handledByCombatLoop: true/,
    );
    assert.match(
      combatLoopSource,
      /submitKanjiKombatAnswer[\s\S]*?kanjiAnswerId: answerId/,
    );
    // runOptimisticKanjiKombatAnswer uses the session, not the old pending flag.
    assert.match(
      combatLoopSource,
      /runOptimisticKanjiKombatAnswer[\s\S]*?getKanjiKombatSession\(\)/,
    );
    assert.match(
      combatLoopSource,
      /session\.recordAction\(/,
    );
    assert.doesNotMatch(
      combatLoopSource,
      /kanjiKombatQueuedVerificationPending/,
    );
  });

  it('returns false when a Kanji Kombat answer is ignored by an in-flight answer guard', async () => {
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [{ id: 'answer-correct', answer: 'a', correct: true }],
          },
        },
      },
    };
    let apiCalls = 0;
    let resolveRequest;
    configureKanjiKombatSession({
      syncRequest: async () => ({ status: 'ok', confirmedThroughSeq: 0 }),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const submitAnswer = async () => {
      apiCalls += 1;
      return new Promise(resolve => { resolveRequest = resolve; });
    };
    combatLoop.init({
      getGameState: () => currentState,
      updateGameState: () => {},
      updateUI: () => {},
      settings: { getApiKeys: () => ({}) },
      narration: {},
      characterUI: {},
      getEnemyDialogueActive: () => false,
      delay: () => Promise.resolve(),
      apiSubmitKanjiKombatAnswer: submitAnswer,
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const first = combatLoop.submitKanjiKombatAnswer('answer-correct', { cardId: 'hiragana:あ' });
    await Promise.resolve();

    const second = await combatLoop.submitKanjiKombatAnswer('answer-correct', { cardId: 'hiragana:あ' });

    assert.equal(second, false);
    assert.equal(apiCalls, 1, 'guarded duplicate should not submit another answer request');
    resolveRequest({ error: 'No active combat' });
    await first;
  });

  it('clears currentQuiz-only Kanji Kombat state after local answer prediction', async () => {
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_current_only', stateVersion: 2, nextTurnSeed: 'seed_kanji_current_only' },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a', correct: true },
              { id: 'answer-wrong', answer: 'i', correct: false },
            ],
          },
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-correct',
      promptRef: { cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => {},
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
    assert.equal(updates.at(-1).run.kanjiKombat.currentQuiz, null);
  });

  it('Kanji Kombat answer does not consume local prompt when session is at hard cap', async () => {
    // Fill the session log to KK_SESSION_HARD_CAP so canConsumePrompt() returns false.
    const session = configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    for (let i = 0; i < KK_SESSION_HARD_CAP; i++) {
      session.recordAction({ actionId: `fill_${i}`, kind: 'intro', promptId: `kkp_fill_${i}` });
    }
    assert.equal(session.canConsumePrompt(), false);

    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_session_full', stateVersion: 2, nextTurnSeed: 'seed_kanji_session_full' },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_answer_session_full',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            },
          ],
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a', correct: true },
              { id: 'answer-wrong', answer: 'i', correct: false },
            ],
          },
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => {
      calls.push('answerApiCalled');
      return { status: 'accepted' };
    });
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-correct',
      promptRef: { promptId: 'kkp_answer_session_full', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => calls.push('playback'),
      startMoveSelection: () => calls.push('startMoveSelection'),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, false);
    assert.equal(calls.length, 0);
    assert.equal(updates.length, 0);
    // Log count unchanged (still at hard cap — new entry was rejected by the gate).
    assert.equal(session.pendingCount(), KK_SESSION_HARD_CAP);
    assert.equal(
      session.snapshot().some(item => item.promptId === 'kkp_answer_session_full'),
      false,
    );
  });

  it('session correction patches combat state without replaying the answered prompt', async () => {
    // With the session, correction comes through the onCorrection callback which kanji-kombat.js
    // handles by calling updateKanjiKombatGameState(authoritativeState).
    // We test that the session fires the correction callback with the right state.
    const updates = [];
    let correctionPayload = null;
    let resolveSync;
    // Use a manual schedule so the drain fires only when we want it.
    let scheduledFn = null;
    const ally = { id: 'hi', uid: 'ally-hi', hp: 100, maxHp: 100, element: 'fire', moves: [] };
    const localEnemy = { id: 'mizu', uid: 'enemy-local', hp: 5, maxHp: 20 };
    const authoritativeEnemy = { id: 'ishi', uid: 'enemy-server', hp: 20, maxHp: 20 };
    const authoritativeState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [authoritativeEnemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
      },
      run: {
        mode: 'kanjiKombat',
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [],
          currentQuiz: null,
        },
      },
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [localEnemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_corr', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1'] },
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_corr_1',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
          }],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    const session = configureKanjiKombatSession({
      syncRequest: async () => new Promise(resolve => { resolveSync = resolve; }),
      onCorrection: payload => { correctionPayload = payload; },
      // Manual schedule: capture the fn and timer id, don't fire until we trigger it.
      schedule: (fn) => { scheduledFn = fn; return 1; },
      cancel: () => { scheduledFn = null; },
    });

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_corr_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => {},
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
    });

    assert.equal(session.pendingCount(), 1);
    assert.notDeepEqual(updates.at(-1)?.combat?.enemies, [authoritativeEnemy]);

    // Manually trigger the drain by calling the scheduled function.
    assert.ok(scheduledFn, 'session should have scheduled a drain');
    const drainFn = scheduledFn;
    scheduledFn = null;
    // Set up the resolveSync BEFORE firing drain so it's ready when drain calls syncRequest.
    const drainPromise = (async () => {
      drainFn();
      // Wait a microtask for the drain to call syncRequest and capture resolveSync.
      for (let i = 0; i < 5; i++) await Promise.resolve();
    })();
    await drainPromise;

    assert.ok(typeof resolveSync === 'function', 'syncRequest should have been called');

    // Server responds with a correction.
    resolveSync({
      status: 'corrected',
      reason: 'transcript_mismatch',
      confirmedThroughSeq: null,
      results: [],
      authoritativeState,
    });

    await waitForCondition(
      () => correctionPayload !== null,
      'expected session to fire onCorrection callback',
    );

    assert.deepEqual(correctionPayload.authoritativeState.combat.enemies, [authoritativeEnemy]);
    // Session log is cleared after correction.
    assert.equal(session.pendingCount(), 0);
  });

  it('session checkpoint with combatEnded result delivers combat end via onCheckpoint', async () => {
    // When the server confirms a combat-ending answer, the session fires onCheckpoint
    // with the result in results[]. kanji-kombat.js then calls api.finishCombatResult.
    let checkpointPayload = null;
    let resolveSync;
    let scheduledFn = null;
    const session = configureKanjiKombatSession({
      syncRequest: async () => new Promise(resolve => { resolveSync = resolve; }),
      onCheckpoint: payload => { checkpointPayload = payload; },
      schedule: (fn) => { scheduledFn = fn; return 1; },
      cancel: () => { scheduledFn = null; },
    });
    const ally = { id: 'hi', uid: 'ally-hi', hp: 100, maxHp: 100, element: 'fire', moves: [] };
    const authoritativeEnemy = { id: 'ishi', uid: 'enemy-done', hp: 0, maxHp: 20 };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [{ id: 'mizu', uid: 'enemy-live', hp: 1, maxHp: 20 }],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_terminal_session', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1'] },
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_terminal',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
          }],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };
    const updates = [];
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_terminal', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => {},
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
    });

    assert.equal(session.pendingCount(), 1);

    // Manually trigger drain.
    assert.ok(scheduledFn, 'session should have scheduled a drain');
    const snap = session.snapshot();
    const drainFn = scheduledFn;
    scheduledFn = null;
    drainFn();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.ok(typeof resolveSync === 'function', 'syncRequest should have been called by drain');

    // Server confirms combat ended.
    resolveSync({
      status: 'ok',
      confirmedThroughSeq: 1,
      results: [{
        seq: 1,
        actionId: snap[0]?.actionId,
        combatEnded: true,
        victory: true,
        enemies: [authoritativeEnemy],
        creatureParty: { active: [ally], reserves: [] },
      }],
    });

    await waitForCondition(
      () => checkpointPayload !== null,
      'expected session to fire onCheckpoint with the terminal result',
    );

    const terminalResult = (checkpointPayload.results || []).find(r => r.combatEnded);
    assert.ok(terminalResult, 'checkpoint should include the combatEnded result');
    assert.equal(terminalResult.victory, true);
    // Session log should be empty after confirmation.
    assert.equal(session.pendingCount(), 0);
  });

  it('stopCombatLoop is not called optimistically for any Kanji Kombat answer', async () => {
    // In the session-log model, stopCombatLoop is never called from runOptimisticKanjiKombatAnswer.
    // Combat end comes from the server checkpoint via handleSessionCheckpoint → finishCombatResult.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = { id: 'hi', hp: 100, maxHp: 100, element: 'fire', moves: [] };
    const enemy = { id: 'mizu', hp: 30, maxHp: 30 };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_no_stop', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1'] },
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_no_stop',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
          }],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_no_stop', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => calls.push('playback'),
      startMoveSelection: () => calls.push('startMoveSelection'),
      stopCombatLoop: async result => { calls.push({ type: 'stopCombatLoop', result }); },
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    assert.equal(calls.includes('playback'), true);
    // stopCombatLoop should NOT be called — combat end comes from the server checkpoint.
    assert.equal(calls.filter(c => c?.type === 'stopCombatLoop').length, 0);
    // Session log has one entry.
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
  });

  it('local wave-end KO with pre-rolled next wave transitions immediately and resumes selection', async () => {
    // When a correct answer KOs the last enemy, and the pendingNextWaves queue holds
    // a pre-roll, the wave transition is applied locally (no server wait) and
    // startMoveSelection is called.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      attack: 999, // guaranteed KO
      defense: 5,
      dex: 10,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    const enemy = {
      id: 'mizu',
      uid: 'enemy-wave-1',
      name: '水',
      element: 'water',
      hp: 1,
      maxHp: 1,
      attack: 1,
      defense: 0,
      dex: 0,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    // Use empty enemies array so playKanjiKombatNextWaveTransition skips DOM rendering.
    const nextWaveEnemy = { id: 'kaze', uid: 'enemy-wave-2', name: '風', element: 'wind', hp: 30, maxHp: 30 };
    const nextWaveEnemies = []; // empty so no DOM rendering in wave transition
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_wave_local', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          wave: 1,
          pendingNextWaves: [{
            wave: 2,
            isMiniboss: false,
            enemies: nextWaveEnemies, // empty so no DOM rendering in wave transition
            combat: {
              combatId: 'cmb_wave_local',
              stateVersion: 3,
              nextTurnSeed: 's2',
              turnSeeds: ['s2'],
            },
          }],
          promptBuffer: [
            {
              promptId: 'kkp_wave_local_1',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
            },
            {
              promptId: 'kkp_wave_local_2',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', choices: [{ id: 'ans-i', answer: 'i', correct: true }] },
            },
          ],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        formation: { walkingEnabled: false },
        syncCreatures: async () => {},
      },
    });
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_wave_local_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push({ type: 'playback', allEnemiesDefeated: localTranscript.allEnemiesDefeated }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    // Playback should have occurred.
    assert.equal(calls.some(c => c.type === 'playback'), true);
    // With a pre-roll, wave transition happens locally and selection resumes immediately.
    assert.equal(
      calls.filter(c => c.type === 'startMoveSelection').length,
      1,
      'startMoveSelection should be called once after the local wave transition',
    );
    // Wave state was consumed from the head of pendingNextWaves.
    const finalState = updates.at(-1);
    assert.deepEqual(finalState?.run?.kanjiKombat?.pendingNextWaves, []);
    // enemies come from nextWaveEnemies (empty in this test to skip DOM rendering)
    assert.deepEqual(finalState?.combat?.enemies, nextWaveEnemies);
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
  });

  it('local wave-end KO with an empty pre-roll queue pauses gracefully instead of restarting selection', async () => {
    // When a correct answer KOs the last enemy but the pendingNextWaves queue is
    // EMPTY (the offline window outlived the pre-rolled runway), the client must NOT
    // keep serving quiz prompts against the dead wave state — that generates garbage
    // entries the server rejects with transcript_mismatch.  The planned behavior is a
    // graceful pause: leave selection stopped and let the next checkpoint deliver the
    // real wave.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi',
      name: '火',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      attack: 999, // guaranteed KO
      defense: 5,
      dex: 10,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    const enemy = {
      id: 'mizu',
      uid: 'enemy-wave-1',
      name: '水',
      element: 'water',
      hp: 1,
      maxHp: 1,
      attack: 1,
      defense: 0,
      dex: 0,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_wave_nopreroll', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          wave: 2,
          pendingNextWaves: [], // empty queue — checkpoint must deliver the next wave
          promptBuffer: [
            {
              promptId: 'kkp_nopreroll_1',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
            },
            {
              promptId: 'kkp_nopreroll_2',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', choices: [{ id: 'ans-i', answer: 'i', correct: true }] },
            },
          ],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        formation: { walkingEnabled: false },
        syncCreatures: async () => {},
      },
    });
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_nopreroll_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push({ type: 'playback', allEnemiesDefeated: localTranscript.allEnemiesDefeated }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    assert.equal(calls.some(c => c.type === 'playback'), true);
    // No pre-roll → graceful pause: selection must NOT restart against dead wave state.
    assert.equal(
      calls.filter(c => c.type === 'startMoveSelection').length,
      0,
      'startMoveSelection must not be called when the wave cleared without a pre-roll',
    );
    // The answer itself is still recorded for the server to replay.
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
    const finalState = updates.at(-1);
    assert.deepEqual(finalState?.run?.kanjiKombat?.pendingNextWaves, []);
  });

  it('two consecutive offline wave-end answers consume two pre-roll queue entries', async () => {
    // Real cadence clears a wave every 1-3 answers, so a single offline window
    // routinely crosses TWO wave boundaries.  Each boundary must consume the next
    // entry from the pendingNextWaves queue, with selection resuming both times.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi', name: '火', element: 'fire',
      hp: 100, maxHp: 100, attack: 999, defense: 5, dex: 10, mp: 0, maxMp: 0, moves: [],
    };
    const enemy = {
      id: 'mizu', uid: 'enemy-wave-1', name: '水', element: 'water',
      hp: 1, maxHp: 1, attack: 1, defense: 0, dex: 0, mp: 0, maxMp: 0, moves: [],
    };
    // Both queued waves use empty enemies arrays so playKanjiKombatNextWaveTransition
    // skips DOM rendering; an empty wave is also vacuously "all defeated", so the
    // second answer is itself a wave-end answer.
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_two_bound', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          wave: 1,
          pendingNextWaves: [
            {
              wave: 2,
              isMiniboss: false,
              enemies: [],
              combat: { combatId: 'cmb_two_bound_w2', stateVersion: 0, nextTurnSeed: 'w2-s1', turnSeeds: ['w2-s1', 'w2-s2'] },
            },
            {
              wave: 3,
              isMiniboss: false,
              enemies: [],
              combat: { combatId: 'cmb_two_bound_w3', stateVersion: 0, nextTurnSeed: 'w3-s1', turnSeeds: ['w3-s1', 'w3-s2'] },
            },
          ],
          promptBuffer: [
            {
              promptId: 'kkp_two_bound_1',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
            },
            {
              promptId: 'kkp_two_bound_2',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', choices: [{ id: 'ans-i', answer: 'i', correct: true }] },
            },
            {
              promptId: 'kkp_two_bound_3',
              sequence: 3,
              kind: 'quiz',
              cardId: 'hiragana:う',
              quiz: { cardId: 'hiragana:う', choices: [{ id: 'ans-u', answer: 'u', correct: true }] },
            },
          ],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        formation: { walkingEnabled: false },
        syncCreatures: async () => {},
      },
    });
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    // First boundary: KOs the wave-1 enemy, consumes the wave-2 queue head.
    const handledFirst = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_two_bound_1', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => calls.push({ type: 'playback' }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });
    assert.equal(handledFirst, true);
    const afterFirst = updates.at(-1);
    assert.equal(afterFirst?.run?.kanjiKombat?.wave, 2, 'first boundary advances to wave 2');
    assert.deepEqual(
      afterFirst?.run?.kanjiKombat?.pendingNextWaves?.map(w => w.wave),
      [3],
      'first boundary consumes only the queue head',
    );
    assert.equal(afterFirst?.combat?.optimistic?.combatId, 'cmb_two_bound_w2');

    // Second boundary (still offline): consumes the wave-3 queue entry.
    const handledSecond = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-i',
      promptRef: { promptId: 'kkp_two_bound_2', sequence: 2, cardId: 'hiragana:い' },
      turnTiming: {},
      playback: async () => calls.push({ type: 'playback' }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });
    assert.equal(handledSecond, true);
    const afterSecond = updates.at(-1);
    assert.equal(afterSecond?.run?.kanjiKombat?.wave, 3, 'second boundary advances to wave 3');
    assert.deepEqual(afterSecond?.run?.kanjiKombat?.pendingNextWaves, [],
      'second boundary consumes the second queue entry');
    assert.equal(afterSecond?.combat?.optimistic?.combatId, 'cmb_two_bound_w3');
    assert.equal(
      calls.filter(c => c.type === 'startMoveSelection').length,
      2,
      'selection resumes after each locally-played boundary',
    );
    // Both answers are recorded for the server to replay.
    assert.equal(getKanjiKombatSession().pendingCount(), 2);
  });

  it('accepted optimistic verification reconciles committed combat result and next seed', async () => {
    const updates = [];
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        allies: [{ id: 'hi', hp: 20 }],
        enemies: [{ id: 'mizu', hp: 20 }],
        optimistic: { combatId: 'cmb_test', stateVersion: 0, nextTurnSeed: 'seed_old' },
        turnCount: 0,
      },
      run: {
        creatureParty: { active: [{ id: 'hi', hp: 20 }], reserves: [] },
      },
    };
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });

    const result = await combatLoop.__combatNetworkTest.handleOptimisticCombatVerification({
      status: 'accepted',
      stateVersion: 1,
      nextSeed: 'seed_new',
      allies: [{ id: 'hi', hp: 18 }],
      enemies: [{ id: 'mizu', hp: 11 }],
      creatureParty: { active: [{ id: 'hi', hp: 18 }], reserves: [] },
      turnCount: 1,
    });

    assert.equal(result.recovered, true);
    assert.equal(updates.at(-1).combat.optimistic.stateVersion, 1);
    assert.equal(updates.at(-1).combat.optimistic.nextTurnSeed, 'seed_new');
    assert.equal(updates.at(-1).combat.enemies[0].hp, 11);
    assert.equal(updates.at(-1).run.creatureParty.active[0].hp, 18);
    assert.equal(updates.at(-1).combat.turnCount, 1);
  });

  it('syncs the active battle scene after an optimistic Kanji Kombat correction', async () => {
    const updates = [];
    const syncCalls = [];
    const ally = { id: 'hi', uid: 'ally-hi', hp: 100, maxHp: 100 };
    const staleEnemy = { id: 'ishi', uid: 'enemy-ishi-stale', hp: 0, maxHp: 100 };
    const authoritativeEnemy = { id: 'kyojin', uid: 'enemy-kyojin', hp: 80, maxHp: 100 };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [staleEnemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
      },
      run: {
        mode: 'kanjiKombat',
        creatureParty: { active: [ally], reserves: [] },
      },
    };
    const authoritativeState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [authoritativeEnemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
      },
      run: {
        mode: 'kanjiKombat',
        creatureParty: { active: [ally], reserves: [] },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        syncCreatures: async args => syncCalls.push(args),
      },
    });
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });

    const result = await combatLoop.__combatNetworkTest.handleOptimisticCombatVerification({
      status: 'corrected',
      reason: 'Kanji Kombat prompt mismatch',
      authoritativeState,
    });

    assert.equal(result.recovered, true);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].combat.enemies, [authoritativeEnemy]);
    assert.equal(syncCalls.length, 1);
    assert.deepEqual({
      ...syncCalls[0],
      isCurrent: undefined,
    }, {
      allies: [ally],
      enemies: [authoritativeEnemy],
      initial: false,
      isCurrent: undefined,
    });
    assert.equal(syncCalls[0].isCurrent(), true);
  });

  it('stops pending optimistic combat end after accepted terminal verification without restarting selection', async () => {
    const updates = [];
    const calls = [];
    const move = {
      id: 'one-hit',
      name: '一撃',
      nameEn: 'One Hit',
      reading: 'いちげき',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 100,
      mpCost: 0,
      accuracy: 100,
    };
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      level: 3,
      attack: 100,
      defense: 5,
      dex: 10,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [move],
    };
    const enemy = {
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      element: 'water',
      level: 1,
      attack: 1,
      defense: 1,
      dex: 0,
      hp: 1,
      maxHp: 1,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        isBoss: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_terminal', stateVersion: 7, nextTurnSeed: 'seed_terminal' },
        turnCount: 0,
      },
      run: {
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
      },
    };

    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => ({
      status: 'accepted',
      stateVersion: 8,
      nextSeed: 'seed_after',
      combatEnded: true,
      victory: true,
      allies: [{ ...ally, hp: 100 }],
      enemies: [{ ...enemy, hp: 0 }],
      creatureParty: { active: [{ ...ally, hp: 100 }], reserves: [] },
      turnCount: 1,
    }));
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'one-hit', targetIndex: 0 }],
      turnTiming: {},
      playback: async localTranscript => {
        calls.push({ type: 'playback', localTranscript });
      },
      startMoveSelection: () => {
        calls.push({ type: 'startMoveSelection' });
      },
      stopCombatLoop: result => {
        calls.push({ type: 'stopCombatLoop', result });
        combatLoop.__combatNetworkTest.setCombatActive(false);
      },
    });

    assert.equal(handled, true);
    assert.equal(calls[0].type, 'playback');
    assert.deepEqual(calls[0].localTranscript.pendingCombatEnd, { victory: true, defeat: false });
    assert.equal(calls[0].localTranscript.combatEnded, false);
    assert.equal(calls.some(call => call.type === 'startMoveSelection'), false);
    const stopCall = calls.find(call => call.type === 'stopCombatLoop');
    assert.ok(stopCall);
    assert.equal(stopCall.result.combatEnded, true);
    assert.equal(stopCall.result.victory, true);
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), false);
  });

  it('resumes move selection after accepted non-terminal optimistic verification', async () => {
    const updates = [];
    const calls = [];
    const move = {
      id: 'chip',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 1,
      mpCost: 0,
      accuracy: 100,
    };
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      level: 3,
      attack: 10,
      defense: 5,
      dex: 10,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [move],
    };
    const enemy = {
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      element: 'water',
      level: 1,
      attack: 1,
      defense: 1,
      dex: 0,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      moves: [],
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_active', stateVersion: 2, nextTurnSeed: 'seed_active' },
        turnCount: 0,
      },
      run: {
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
      },
    };

    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => ({
      status: 'accepted',
      stateVersion: 3,
      nextSeed: 'seed_next',
      combatEnded: false,
      allies: [{ ...ally, hp: 100 }],
      enemies: [{ ...enemy, hp: 96 }],
      creatureParty: { active: [{ ...ally, hp: 100 }], reserves: [] },
      turnCount: 1,
    }));
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'chip', targetIndex: 0 }],
      turnTiming: {},
      playback: async localTranscript => {
        calls.push({ type: 'playback', localTranscript });
      },
      getEnemyDialogueActive: () => false,
      startMoveSelection: () => {
        calls.push({ type: 'startMoveSelection' });
      },
      stopCombatLoop: result => {
        calls.push({ type: 'stopCombatLoop', result });
      },
    });

    assert.equal(handled, true);
    assert.equal(calls[0].type, 'playback');
    assert.equal(calls[0].localTranscript.pendingCombatEnd, undefined);
    assert.equal(calls.filter(call => call.type === 'startMoveSelection').length, 1);
    assert.equal(calls.some(call => call.type === 'stopCombatLoop'), false);
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), true);
  });

  // ---- Finding 3: daily boundary guard ----

  it('does not consume the pre-rolled next wave when the post-answer state has completionChoicePending', async () => {
    // Arrange a state where answering the last quiz in a wave would clear enemies,
    // but the next buffered prompt is a dailyCompletePrompt (daily boundary).
    // The client must NOT consume the pendingNextWaves head — let the checkpoint
    // deliver truth.
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const calls = [];
    const updates = [];
    const ally = {
      id: 'hi', name: '火', element: 'fire',
      hp: 100, maxHp: 100, attack: 999, defense: 5, dex: 10, mp: 0, maxMp: 0, moves: [],
    };
    const enemy = {
      id: 'mizu', uid: 'enemy-daily', name: '水', element: 'water',
      hp: 1, maxHp: 1, attack: 1, defense: 0, dex: 0, mp: 0, maxMp: 0, moves: [],
    };
    const nextWaveEnemies = [{ id: 'kaze', uid: 'enemy-wave-2', hp: 30, maxHp: 30 }];
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_daily', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          wave: 1,
          pendingNextWaves: [{
            wave: 2,
            isMiniboss: false,
            enemies: nextWaveEnemies,
            combat: { combatId: 'cmb_daily_next', stateVersion: 3, nextTurnSeed: 's2', turnSeeds: ['s2'] },
          }],
          // The next prompt is a dailyCompletePrompt (daily session boundary).
          promptBuffer: [
            {
              promptId: 'kkp_daily_last',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
            },
            {
              promptId: 'kkp_daily_complete',
              sequence: 2,
              kind: 'dailyCompletePrompt',
              cardId: null,
            },
          ],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false, _exiting: false,
        formation: { walkingEnabled: false },
        syncCreatures: async () => {},
      },
    });
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_daily_last', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push({ type: 'playback', allEnemiesDefeated: localTranscript.allEnemiesDefeated }),
      startMoveSelection: () => calls.push({ type: 'startMoveSelection' }),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    // Pre-roll queue must NOT be consumed at the daily boundary.
    const finalState = updates.at(-1);
    assert.equal(finalState?.run?.kanjiKombat?.pendingNextWaves?.length, 1,
      'pendingNextWaves head must not be consumed at the daily boundary');
    // startMoveSelection must NOT have been called from the pre-roll path.
    assert.equal(calls.filter(c => c.type === 'startMoveSelection').length, 0,
      'startMoveSelection must not fire from pre-roll path at daily boundary');
    // Session log should have the answer recorded.
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
  });

  // ---- Finding 5: streak milestone banner on prediction path ----

  it('shows a streak milestone banner with predicted streak count on the local prediction path', async () => {
    // Arrange state with streak=2; answering correctly will be streak+1=3 (milestone).
    configureKanjiKombatSession({
      syncRequest: async () => new Promise(() => {}),
      schedule: (fn, delay) => { void delay; return setTimeout(fn, 99999); },
    });
    const bannerCalls = [];
    const updates = [];
    const ally = {
      id: 'hi', name: '火', element: 'fire',
      hp: 100, maxHp: 100, attack: 10, defense: 5, dex: 10, mp: 0, maxMp: 0, moves: [],
    };
    const enemy = {
      id: 'mizu', name: '水', element: 'water',
      hp: 50, maxHp: 50, attack: 5, defense: 2, dex: 5, mp: 0, maxMp: 0, moves: [],
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_streak', stateVersion: 2, nextTurnSeed: 's1', turnSeeds: ['s1', 's2'] },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          streak: 2, // next correct answer hits milestone 3
          promptBuffer: [{
            promptId: 'kkp_streak_milestone',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            quiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
          }],
          currentQuiz: { cardId: 'hiragana:あ', choices: [{ id: 'ans-a', answer: 'a', correct: true }] },
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => ({ status: 'accepted' }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'ans-a',
      promptRef: { promptId: 'kkp_streak_milestone', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => {},
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
      // Inject a fake vfx.showKanjiKombatAnswerBanner via the combat-loop source seam by
      // testing the source directly — banner calls happen inside the optimistic function.
      // We verify via the session log and source checks instead.
    });

    assert.equal(handled, true);
    // The session should have one entry.
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
  });

  it('streak milestone banner uses predictedStreakReward with the correct streak count', () => {
    // Source-level check: confirm willKanjiKombatAnswerTriggerStreakReward and
    // predictedStreakReward are used in the optimistic path.
    assert.match(
      combatLoopSource,
      /willKanjiKombatAnswerTriggerStreakReward\(getGameState\(\), correct\)/,
    );
    assert.match(
      combatLoopSource,
      /predictedStreakReward.*=.*willKanjiKombatAnswerTriggerStreakReward/,
    );
    assert.match(
      combatLoopSource,
      /showKanjiKombatAnswerBanner\(correct, predictedStreakReward\)/,
    );
  });

  // ---- Finding 6: recordAction before wave transition ----

  it('records the session action before playing the wave transition', () => {
    // Source-level check: session.recordAction appears before playKanjiKombatNextWaveTransition
    // in runOptimisticKanjiKombatAnswer.
    const fnStart = combatLoopSource.indexOf('async function runOptimisticKanjiKombatAnswer');
    const fnEnd = combatLoopSource.indexOf('\nasync function withAnimationActive');
    assert.ok(fnStart >= 0 && fnEnd > fnStart, 'runOptimisticKanjiKombatAnswer should exist');
    const fnBody = combatLoopSource.slice(fnStart, fnEnd);
    const recordIdx = fnBody.indexOf('session.recordAction(');
    const waveIdx = fnBody.indexOf('await playKanjiKombatNextWaveTransition(');
    assert.ok(recordIdx >= 0, 'session.recordAction should appear in runOptimisticKanjiKombatAnswer');
    assert.ok(waveIdx >= 0, 'playKanjiKombatNextWaveTransition should appear in runOptimisticKanjiKombatAnswer');
    assert.ok(recordIdx < waveIdx,
      'session.recordAction must come before playKanjiKombatNextWaveTransition');
  });

  // ---- Finding 7: cruft removal ----

  it('runOptimisticKanjiKombatAnswer does not accept stopCombatLoop/finishCombatLoop param', () => {
    // stopCombatLoop is no longer in the parameter destructuring — combat end
    // is handled exclusively by the server checkpoint.
    assert.doesNotMatch(
      combatLoopSource,
      /runOptimisticKanjiKombatAnswer[\s\S]{0,400}stopCombatLoop: finishCombatLoop/,
    );
  });

  it('executeCreatureMovesTurn does not pass recoveryActionType to the kanjiKombat path', () => {
    // recoveryActionType was deleted from runOptimisticKanjiKombatAnswer params;
    // the caller must not pass it.
    const executeSource = combatLoopSource.slice(
      combatLoopSource.indexOf('async function executeCreatureMovesTurn'),
    ).slice(0, 400);
    assert.doesNotMatch(
      executeSource,
      /runOptimisticKanjiKombatAnswer[\s\S]{0,200}recoveryActionType/,
    );
  });
});
