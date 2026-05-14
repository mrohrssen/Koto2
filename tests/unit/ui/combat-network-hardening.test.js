import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

describe('combat network hardening', () => {
  beforeEach(() => {
    actionArea = createActionArea();
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
    combatLoop.__combatNetworkTest.setSyncIndicatorDelayMs(500);
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
    const originalConsoleLog = console.log;
    const calls = [];
    console.log = (...args) => calls.push(args);
    localStorage.setItem('kotoCombatTiming', '1');
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => ({ ok: true }));

    try {
      await combatLoop.__combatNetworkTest.runCreatureCombatRequest('attack', []);
    } finally {
      console.log = originalConsoleLog;
      localStorage.removeItem('kotoCombatTiming');
    }

    assert.equal(calls.some(args => args[0] === '[Combat Timing] request'), true);
  });
});
