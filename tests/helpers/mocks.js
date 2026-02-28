import { createNewPlayer, createNewRun } from '../../src/game/state.js';

/**
 * Creates a mock AI provider that returns canned responses.
 * Records all calls for assertion.
 */
export function createMockAIProvider(responses = ['{"line":"テスト","emotion":"neutral"}']) {
  let callIndex = 0;
  const calls = [];

  async function chatFn(messages, _opts) {
    calls.push(messages);
    const response = responses[callIndex % responses.length];
    callIndex++;
    return typeof response === 'string' ? response : JSON.stringify(response);
  }

  return { chatFn, calls };
}

/**
 * Creates a mock fetch that intercepts JPDB API calls.
 * Non-JPDB URLs pass through (or throw).
 */
export function createMockJPDB({ vocabList = [], parseResults = [] } = {}) {
  const calls = [];

  function mockFetch(url, opts) {
    calls.push({ url, opts });

    if (url.includes('/api/v1/list-vocabulary')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ vocabulary: vocabList }),
      });
    }
    if (url.includes('/api/v1/parse')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(parseResults.shift() || { tokens: [] }),
      });
    }

    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  }

  return { mockFetch, calls };
}

/**
 * Creates a test player state with optional overrides.
 */
export function createTestPlayer(overrides = {}) {
  const player = createNewPlayer('test-user');
  return { ...player, ...overrides };
}

/**
 * Creates a test run state with optional overrides.
 */
export function createTestRun(overrides = {}) {
  const player = createTestPlayer();
  const run = createNewRun(player, 'okunomori');
  return { ...run, ...overrides };
}

/**
 * Creates a mock Express request object.
 */
export function createMockReq(overrides = {}) {
  return {
    headers: {},
    cookies: {},
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

/**
 * Creates a mock Express response object with spy methods.
 */
export function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    cookies: {},
    _redirectUrl: null,

    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    send(data) { res.body = data; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
    cookie(name, val, opts) { res.cookies[name] = { val, opts }; return res; },
    clearCookie(name) { delete res.cookies[name]; return res; },
    redirect(url) { res._redirectUrl = url; return res; },
  };
  return res;
}
