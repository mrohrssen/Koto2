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

globalThis.window = {
  __intentLog: null,
};
globalThis.localStorage = createStorage();

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    remove() {},
  }),
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
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
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
});
