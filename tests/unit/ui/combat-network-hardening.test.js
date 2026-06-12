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
  configureKanjiKombatSyncQueue,
  REVIEW_SYNC_QUEUE_HARD_LIMIT,
  resetKanjiKombatSyncQueue,
} = await import('../../../public/js/ui/kanji-kombat-sync-queue.js');
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

describe('combat network hardening', () => {
  beforeEach(() => {
    actionArea = createActionArea();
    localStorage.clear();
    console.log = () => {};
    resetKanjiKombatSyncQueue();
    resetKanjiKombatSession();
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(500);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    resetKanjiKombatSyncQueue();
    resetKanjiKombatSession();
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
    assert.match(
      combatLoopSource,
      /runOptimisticKanjiKombatAnswer[\s\S]*?showKanjiKombatAnswerBanner\(optimistic\.localTranscript\.kanjiAnswerCorrect\)/,
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

  it('recovers attack errors by merging authoritative state and restarting selection', () => {
    const updates = [];
    let restartCount = 0;
    const currentState = {
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
      update: state => updates.push(state),
    });

    const result = combatLoop.__combatNetworkTest.recoverFromCombatErrorState(
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

  it('recovers defend errors by merging authoritative state and restarting selection', () => {
    const updates = [];
    let restartCount = 0;
    const currentState = {
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
      update: state => updates.push(state),
    });

    const result = combatLoop.__combatNetworkTest.recoverFromCombatErrorState(
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
    const currentState = {
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
      update: state => updates.push(state),
      fetchServerState: async () => {
        fetchCount += 1;
        return fetchedState;
      },
    });

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
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => ({ phase: 'combat', combat: { active: true } }),
      update: () => { updateCount += 1; },
      fetchServerState: async () => {
        fetchCount += 1;
        return { error: 'network_unavailable', transient: true };
      },
    });

    const result = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack');

    assert.deepEqual(result, {
      recovered: false,
      outcome: 'recovery_failed',
      combatActive: true,
    });
    assert.equal(fetchCount, 1);
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
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => ({ phase: 'combat', combat: { active: true } }),
      update: () => {},
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

    await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);
    const recovery = await combatLoop.__combatNetworkTest.recoverFromNullCombatPost('attack', {
      restartSelection: () => {},
    });

    assert.equal(recovery.recovered, true);
    assert.equal(combatCallCount, 1);
    assert.equal(stateFetchCount, 1);
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

  it('submitKanjiKombatAnswer returns handledByCombatLoop and wires to the session quiz path', () => {
    // submitKanjiKombatAnswer always returns { handledByCombatLoop: true } — the actual
    // session-log append happens through executeCreatureMovesTurn's kanjiKombat path which
    // calls runOptimisticKanjiKombatAnswer. Check the source wiring is in place.
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
    // When a correct answer KOs the last enemy, and a pendingNextWave pre-roll exists,
    // the wave transition is applied locally (no server wait) and startMoveSelection is called.
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
          pendingNextWave: {
            wave: 2,
            isMiniboss: false,
            enemies: nextWaveEnemies, // empty so no DOM rendering in wave transition
            combat: {
              combatId: 'cmb_wave_local',
              stateVersion: 3,
              nextTurnSeed: 's2',
              turnSeeds: ['s2'],
            },
          },
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
    // Wave state was consumed from pendingNextWave.
    const finalState = updates.at(-1);
    assert.equal(finalState?.run?.kanjiKombat?.pendingNextWave, null);
    // enemies come from nextWaveEnemies (empty in this test to skip DOM rendering)
    assert.deepEqual(finalState?.combat?.enemies, nextWaveEnemies);
    assert.equal(getKanjiKombatSession().pendingCount(), 1);
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
    assert.deepEqual(syncCalls[0], {
      allies: [ally],
      enemies: [authoritativeEnemy],
      initial: false,
    });
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
});
