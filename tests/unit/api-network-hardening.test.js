import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLORE_TRANSPORT_KEYS, makeExploreTransport } from '../helpers/explore-sync-transport.js';

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

function deferred() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function assertExploreTransportShape(result) {
  assert.deepEqual(Object.keys(result).sort(), [...EXPLORE_TRANSPORT_KEYS].sort());
}

beforeEach(async () => {
  mock.reset();
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.window = { location: { href: '' } };
  const api = await import('../../public/js/api.js');
  api.__networkTest.reset();
  globalThis.localStorage.setItem('authToken', 'api-network-token');
  api.bindExploreSyncAuthPrincipal({
    principalId: 'api-network-user',
    token: 'api-network-token',
  });
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

  it('keeps malformed 2xx generic API responses compatible with the empty-object fallback', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      maxAttempts: 1,
    });

    assert.deepEqual(result, {});
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('keeps malformed generic HTTP errors on the HTTP fallback without marking offline', async () => {
    const api = await import('../../public/js/api.js');
    let offlineCount = 0;
    api.setConnectionCallbacks({ onOffline: () => { offlineCount += 1; }, onOnline: null });
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      returnErrorBody: true,
      maxAttempts: 1,
    });

    assert.deepEqual(result, { error: 'HTTP 500' });
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
    assert.equal(correction.transport, true);
    assert.equal(correction.httpStatus, 409);
    assert.equal(correction.body.status, 'corrected');
    assert.equal(correction.body.reason, 'server_correction');
  });

  it('preserves Explore transport status and JSON parse failures for recovery', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.localStorage.setItem('authToken', 'still-owned-by-reauth-flow');
    api.bindExploreSyncAuthPrincipal({
      principalId: 'api-network-user',
      token: 'still-owned-by-reauth-flow',
    });
    const authRevision = api.captureExploreSyncAuthLease().authRevision;
    globalThis.fetch = mock.fn(async () => jsonResponse({ error: 'expired' }, 401));
    const auth = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    });
    assertExploreTransportShape(auth);
    assert.deepEqual(auth, {
      transport: true,
      httpStatus: 401,
      body: { error: 'expired' },
      parseError: null,
      networkError: null,
      aborted: false,
      clientAuthMismatch: false,
      authRevision,
    });
    assert.equal(globalThis.window.location.href, '', 'Explore transport leaves re-authentication to the session recovery flow');
    assert.equal(globalThis.localStorage.getItem('authToken'), 'still-owned-by-reauth-flow');

    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }));
    const malformed = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    });
    assert.equal(malformed.transport, true);
    assert.equal(malformed.httpStatus, 200);
    assert.equal(malformed.body, null);
    assert.ok(malformed.parseError instanceof SyntaxError);
    assert.equal(malformed.authRevision, authRevision);
  });

  it('retains Explore network and abort faults as transport outcomes', async () => {
    const api = await import('../../public/js/api.js');
    const authRevision = api.captureExploreSyncAuthLease().authRevision;
    globalThis.fetch = mock.fn(async () => { throw new TypeError('lost'); });
    const network = await api.syncExploreSession({ sessionEpoch: 'ese_1111111111111111', entries: [{}] });
    assert.equal(network.transport, true);
    assert.equal(network.httpStatus, 0);
    assert.ok(network.networkError instanceof TypeError);
    assert.equal(api.isExploreSyncResponseAuthCurrent(network), true,
      'same-principal network outcomes must remain eligible for transport retry');

    globalThis.fetch = mock.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const aborted = await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{}],
    }, { timeoutMs: 1 });
    assertExploreTransportShape(aborted);
    assert.deepEqual(aborted, {
      transport: true,
      httpStatus: 0,
      body: null,
      parseError: null,
      networkError: null,
      aborted: true,
      clientAuthMismatch: false,
      authRevision,
    });
    assert.equal(api.isExploreSyncResponseAuthCurrent(aborted), true,
      'same-principal abort outcomes must remain eligible for transport retry');
  });

  it('returns the complete Explore envelope for JSON, server, parse, network, abort, and auth-mismatch paths', async () => {
    const api = await import('../../public/js/api.js');
    const payload = { sessionEpoch: 'ese_1111111111111111', entries: [{}] };
    const authRevision = api.captureExploreSyncAuthLease().authRevision;

    globalThis.fetch = async () => jsonResponse({ status: 'ok', confirmedThroughSeq: 1, results: [] });
    const success = await api.syncExploreSession(payload);

    globalThis.fetch = async () => jsonResponse({ error: 'expired' }, 401);
    const serverAuth = await api.syncExploreSession(payload);

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });
    const parseFailure = await api.syncExploreSession(payload);

    globalThis.fetch = async () => { throw new TypeError('lost'); };
    const networkFailure = await api.syncExploreSession(payload);

    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    const abort = await api.syncExploreSession(payload, { timeoutMs: 1 });

    globalThis.localStorage.setItem('authToken', 'different-token');
    const mismatch = await api.syncExploreSession(payload);

    assertExploreTransportShape(makeExploreTransport({ httpStatus: 418, body: { error: 'fixture' } }));
    for (const result of [success, serverAuth, parseFailure, networkFailure, abort, mismatch]) {
      assertExploreTransportShape(result);
    }
    assert.equal(success.httpStatus, 200);
    assert.equal(success.authRevision, authRevision);
    assert.equal(serverAuth.httpStatus, 401);
    assert.equal(serverAuth.authRevision, authRevision);
    assert.ok(parseFailure.parseError instanceof SyntaxError);
    assert.ok(networkFailure.networkError instanceof TypeError);
    assert.equal(abort.aborted, true);
    assert.equal(parseFailure.authRevision, authRevision);
    assert.equal(networkFailure.authRevision, authRevision);
    assert.equal(abort.authRevision, authRevision);
    assert.deepEqual(mismatch, {
      transport: true,
      httpStatus: 0,
      body: null,
      parseError: null,
      networkError: null,
      aborted: false,
      clientAuthMismatch: true,
      authRevision,
    });
  });

  it('does not serialize a payload timeout into Explore sync requests', async () => {
    const api = await import('../../public/js/api.js');
    let requestBody = null;
    globalThis.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({ status: 'ok', confirmedThroughSeq: 1, results: [] });
    };

    await api.syncExploreSession({
      sessionEpoch: 'ese_1111111111111111',
      entries: [{ seq: 1 }],
      timeoutMs: 1,
    });

    assert.deepEqual(requestBody, {
      sessionEpoch: 'ese_1111111111111111',
      entries: [{ seq: 1 }],
    });
  });

  it('reports auth changes before fetch, during fetch, and during JSON parsing as client mismatches', async () => {
    const api = await import('../../public/js/api.js');
    const payload = { sessionEpoch: 'ese_1111111111111111', entries: [{}] };

    const beforeFetchRevision = api.captureExploreSyncAuthLease().authRevision;
    globalThis.localStorage.setItem('authToken', 'before-fetch-token');
    const beforeFetch = await api.syncExploreSession(payload);
    assert.equal(beforeFetch.clientAuthMismatch, true);
    assert.equal(beforeFetch.httpStatus, 0);
    assert.equal(beforeFetch.authRevision, beforeFetchRevision);

    globalThis.localStorage.setItem('authToken', 'during-fetch-token');
    api.bindExploreSyncAuthPrincipal({ principalId: 'api-network-user', token: 'during-fetch-token' });
    const duringFetchRevision = api.captureExploreSyncAuthLease().authRevision;
    const fetchStarted = deferred();
    const fetchResponse = deferred();
    globalThis.fetch = async () => {
      fetchStarted.resolve();
      return fetchResponse.promise;
    };
    const duringFetchPromise = api.syncExploreSession(payload);
    await fetchStarted.promise;
    globalThis.localStorage.setItem('authToken', 'after-fetch-start-token');
    fetchResponse.resolve(jsonResponse({ status: 'ok', confirmedThroughSeq: 1, results: [] }));
    const duringFetch = await duringFetchPromise;
    assert.equal(duringFetch.clientAuthMismatch, true);
    assert.equal(duringFetch.body, null);
    assert.equal(duringFetch.authRevision, duringFetchRevision);

    globalThis.localStorage.setItem('authToken', 'during-parse-token');
    api.bindExploreSyncAuthPrincipal({ principalId: 'api-network-user', token: 'during-parse-token' });
    const duringParseRevision = api.captureExploreSyncAuthLease().authRevision;
    const parseStarted = deferred();
    const parsedBody = deferred();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: () => {
        parseStarted.resolve();
        return parsedBody.promise;
      },
    });
    const duringParsePromise = api.syncExploreSession(payload);
    await parseStarted.promise;
    globalThis.localStorage.setItem('authToken', 'after-parse-start-token');
    parsedBody.resolve({ status: 'ok', confirmedThroughSeq: 1, results: [] });
    const duringParse = await duringParsePromise;
    assert.equal(duringParse.clientAuthMismatch, true);
    assert.equal(duringParse.body, null);
    assert.equal(duringParse.authRevision, duringParseRevision);

    for (const result of [beforeFetch, duringFetch, duringParse]) {
      assertExploreTransportShape(result);
      assert.equal(result.httpStatus, 0);
      assert.equal(result.clientAuthMismatch, true);
      assert.equal(result.body, null);
      assert.ok(Number.isInteger(result.authRevision));
    }
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
