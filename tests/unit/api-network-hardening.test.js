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

  it('preserves full error bodies when returnErrorBody is enabled', async () => {
    const api = await import('../../public/js/api.js');
    const state = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 1, opening: false },
        actionCount: 3,
      },
    };
    globalThis.fetch = mock.fn(async () => jsonResponse({
      error: 'Submitted move does not match current action cursor',
      state,
    }, 400));

    const result = await api.__networkTest.apiCall('/creature-combat-cycle', 'POST', {}, null, {
      returnErrorBody: true,
      maxAttempts: 1,
    });

    assert.deepEqual(result, {
      error: 'Submitted move does not match current action cursor',
      state,
    });
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('classifies Explore sync HTTP responses without flattening correction bodies', async () => {
    const api = await import('../../public/js/api.js');
    for (const [status, transient] of [[403, false], [429, true], [500, true]]) {
      globalThis.fetch = mock.fn(async () => jsonResponse({ error: `e${status}` }, status));
      const result = await api.__networkTest.apiCall(
        '/explore/sync',
        'POST',
        { entries: [{}] },
        null,
        {
          returnErrorBody: true,
          classifyHttpErrors: true,
          requireObjectResponse: true,
          maxAttempts: 1,
        },
      );
      assert.deepEqual(result, {
        error: `e${status}`,
        httpStatus: status,
        transient,
      });
    }

    globalThis.fetch = mock.fn(async () => jsonResponse({
      status: 'corrected',
      reason: 'server_correction',
      confirmedThroughSeq: null,
      rejectedSeq: 1,
      results: [],
    }, 409));
    const correction = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    });
    assert.equal(correction.status, 'corrected');
    assert.equal(correction.httpStatus, 409);
    assert.equal(correction.transient, false);
  });

  it('returns permanent auth and malformed-2xx Explore sync responses', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn(async () => jsonResponse({ error: 'expired' }, 401));
    const auth = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    });
    assert.equal(auth.httpStatus, 401);
    assert.equal(auth.transient, false);
    assert.equal(globalThis.window.location.href, '/');

    globalThis.fetch = mock.fn(async () => jsonResponse(null, 200));
    const malformed = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    });
    assert.deepEqual(malformed, {
      error: 'invalid_response',
      httpStatus: 200,
      transient: false,
    });
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

  it('does not dedupe optimistic combat verification envelopes', async () => {
    const api = await import('../../public/js/api.js');
    const bodies = [];
    const pending = [];
    globalThis.fetch = mock.fn(async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Promise(resolve => pending.push(resolve));
    });

    const first = api.verifyCreatureCombatCycle({ actionId: 'act_first_1' });
    const second = api.verifyCreatureCombatCycle({ actionId: 'act_second_2' });

    assert.equal(globalThis.fetch.mock.callCount(), 2);
    assert.deepEqual(bodies, [{ actionId: 'act_first_1' }, { actionId: 'act_second_2' }]);

    pending[0](jsonResponse({ status: 'accepted', stateVersion: 1, nextSeed: 'next_1' }));
    pending[1](jsonResponse({ status: 'accepted', stateVersion: 1, nextSeed: 'next_2' }));

    assert.equal((await first).nextSeed, 'next_1');
    assert.equal((await second).nextSeed, 'next_2');
  });

  it('returns authoritative state from creature combat 400 responses without retrying', async () => {
    const api = await import('../../public/js/api.js');
    const state = {
      phase: 'combat',
      combat: {
        active: true,
        actionCursor: { side: 'ally', index: 1, opening: false },
        actionCount: 3,
      },
    };
    globalThis.fetch = mock.fn(async () => jsonResponse({
      error: 'Submitted move does not match current action cursor',
      state,
    }, 400));

    const result = await api.creatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: 'honoo', targetIndex: 0 },
    ]);

    assert.deepEqual(result, {
      error: 'Submitted move does not match current action cursor',
      state,
    });
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('aborts hung optimistic vocab review requests instead of waiting forever', async () => {
    const api = await import('../../public/js/api.js');
    let sawSignal = false;
    let sawAbort = false;
    globalThis.fetch = mock.fn((_url, options = {}) => {
      sawSignal = !!options.signal;
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          sawAbort = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const result = await Promise.race([
      api.reviewVocabWord('発見', 'again', true, {
        actionId: 'run_word_timeout',
        timeoutMs: 5,
      }),
      new Promise(resolve => setTimeout(() => resolve('hung'), 30)),
    ]);

    assert.equal(result, null);
    assert.equal(sawSignal, true);
    assert.equal(sawAbort, true);
  });

  it('does not dedupe concurrent vocab review posts with different bodies', async () => {
    const api = await import('../../public/js/api.js');
    const bodies = [];
    const pending = [];
    globalThis.fetch = mock.fn(async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Promise(resolve => pending.push(resolve));
    });

    const first = api.reviewVocabWord('明るい', 'good');
    const second = api.reviewVocabWord('暗い', 'again');

    assert.equal(globalThis.fetch.mock.callCount(), 2);
    assert.deepEqual(bodies, [
      { word: '明るい', grade: 'good' },
      { word: '暗い', grade: 'again' },
    ]);

    pending[0](jsonResponse({ ok: true, word: '明るい' }));
    pending[1](jsonResponse({ ok: true, word: '暗い' }));

    assert.equal((await first).word, '明るい');
    assert.equal((await second).word, '暗い');
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
