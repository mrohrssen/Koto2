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

  it('defines the shared creature combat playback helper used by attack submissions', () => {
    assert.match(combatLoopSource, /async function playCreatureCombatResult\(/);
    assert.match(combatLoopSource, /await playCreatureCombatResult\(result, turnTiming,/);
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
    assert.match(combatLoopSource, /showKanjiKombatAnswerBanner\(result\.kanjiAnswerCorrect\)/);
    assert.match(combatVfxSource, /showKanjiKombatAnswerBanner/);
    assert.match(combatVfxSource, /Correct!/);
    assert.match(combatVfxSource, /Wrong!/);
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
});
