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
const originalConsoleLog = console.log;
const combatLoopSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/combat-loop.js'), 'utf8');
const combatVfxSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/combat-vfx.js'), 'utf8');

describe('combat network hardening', () => {
  beforeEach(() => {
    actionArea = createActionArea();
    localStorage.clear();
    console.log = () => {};
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(500);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
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
          },
        },
      }),
    });

    const result = combatLoop.__combatNetworkTest.buildOptimisticKanjiKombatRequest('answer-correct');

    assert.equal(result.envelope.actionType, 'kanjiKombat.answer');
    assert.equal(result.envelope.combatId, 'cmb_kanji');
    assert.equal(result.envelope.stateVersion, 4);
    assert.equal(result.envelope.seed, 'seed_kanji');
    assert.equal(result.envelope.payload.answerId, 'answer-correct');
    assert.equal(result.envelope.payload.predictionMode, 'shared-kanji-kombat-v1');
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
    assert.match(combatLoopSource, /syncCreatures\(\{ allies, enemies, initial: true \}\)/);
    assert.match(combatLoopSource, /updateUI\?\.\(\);/);
  });

  it('shows a centered correctness banner for Kanji Kombat answers', () => {
    assert.match(combatLoopSource, /showKanjiKombatAnswerBanner\(result\.kanjiAnswerCorrect, result\.kanjiStreakReward \|\| null\)/);
    assert.match(combatVfxSource, /showKanjiKombatAnswerBanner/);
    assert.match(combatVfxSource, /Correct!/);
    assert.match(combatVfxSource, /Wrong!/);
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
