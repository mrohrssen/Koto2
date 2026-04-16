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
  const run = createNewRun(player, 'hajimari-no-hiroba');
  return { ...run, ...overrides };
}

/**
 * Creates a mock TTS cache that returns empty audio.
 */
export function createMockTTS() {
  return {
    load() {},
    generateIfMissing() {},
    get() { return null; },
    set() {},
    has() { return false; }
  };
}

/**
 * Creates a mock TTS dialogue cache.
 */
export function createMockTTSDialogue() {
  const cache = new Map();
  return {
    get(key) { return cache.get(key) || null; },
    set(key, val) { cache.set(key, val); },
    has(key) { return cache.has(key); },
    delete(key) { cache.delete(key); }
  };
}

/**
 * No-op functions for narration engine deps that need AI.
 * Integration tests don't test AI generation — they test route + state logic.
 */
export function createNoOpNarration() {
  return {
    queueMissingCreatureDialoguesFn: async () => {},
    regenCreatureDialogueFn: async () => {},
    queueMissingNpcDialoguesFn: async () => {},
    regenNpcDialogueFn: async () => {},
    getCreatureDialogueFromCache: () => null,
    getAllCreatureDialogueCache: () => ({}),
    getNpcDialogueFromCache: () => null,
    getAllNpcDialogueCache: () => ({}),
    clearNpcDialogueCache: () => {},
    clearCreatureDialogueCache: () => {},
    logNpcEncounterFn: () => {},
    setNpcMemoryFlagFn: () => {},
    updateNpcMemoryBondFn: () => {},
    checkSentenceViolations: () => []
  };
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
