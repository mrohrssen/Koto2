import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(async () => {
  mock.reset();
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.window = { location: { href: '' } };
  const api = await import('../../public/js/api.js');
  api.__networkTest.reset();
  api.setConnectionCallbacks({ onOffline: null, onOnline: null });
});

describe('api network hardening', () => {
  it('aborts a hung request after the configured timeout', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
    });

    assert.equal(result, null);
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('shows offline after repeated timeout or network failures', async () => {
    const api = await import('../../public/js/api.js');
    let offlineCount = 0;
    api.setConnectionCallbacks({ onOffline: () => offlineCount++, onOnline: null });
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError('Network request failed');
    });

    await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
    });
    await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
      bypassLoadingGate: true,
    });

    assert.equal(offlineCount, 1);
  });

  it('does not mark HTTP 500 as offline because the server responded', async () => {
    const api = await import('../../public/js/api.js');
    let offlineCount = 0;
    api.setConnectionCallbacks({ onOffline: () => offlineCount++, onOnline: null });
    globalThis.fetch = mock.fn(async () => jsonResponse({ error: 'server_error' }, 500));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      returnErrorBody: true,
      maxAttempts: 1,
    });

    assert.deepEqual(result, { error: 'server_error' });
    assert.equal(offlineCount, 0);
  });

  it('does not retry creature combat cycle when the POST fails', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError('Network request failed');
    });

    const result = await api.creatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: 'honoo', targetIndex: 0 },
    ]);

    assert.equal(result, null);
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('returns a transient error when game state cannot be fetched', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError('Network request failed');
    });

    const result = await api.getGameState();

    assert.equal(result.error, 'network_unavailable');
    assert.equal(result.transient, true);
    assert.notEqual(result.phase, 'no_save');
  });

  it('treats transient game state as a blocked boot instead of a no-save state', async () => {
    const api = await import('../../public/js/api.js');

    assert.equal(api.isTransientGameStateFailure({
      error: 'network_unavailable',
      transient: true,
    }), true);
    assert.equal(api.isTransientGameStateFailure({
      phase: 'no_save',
    }), false);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
});
