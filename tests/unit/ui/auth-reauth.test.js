import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor({ id = '', tab = null, classes = [] } = {}) {
    this.id = id;
    this.dataset = tab ? { tab } : {};
    this.classList = new FakeClassList(classes);
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this.autocomplete = '';
  }
  addEventListener(type, handler) { this.listeners.set(type, [...(this.listeners.get(type) || []), handler]); }
  click() { for (const handler of this.listeners.get('click') || []) handler({}); }
  keydown(key) { for (const handler of this.listeners.get('keydown') || []) handler({ key }); }
  prepend() {}
}

function makeStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function makeResponse({ ok = true, status = ok ? 200 : 401, body }) {
  return { ok, status, json: async () => body };
}

function makeExploreRunway(overrides = {}) {
  const preparedRooms = overrides.preparedRooms ?? [{
    index: 0,
    roomId: 'room-0',
    actionSeq: 7,
    room: { id: 'room-0', type: 'friendlyNpc' },
    acceptedActions: ['friendlyNpc.choose'],
    actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
    dependencies: [],
    offlineReady: true,
  }];
  return {
    sessionEpoch: 'ese_auth_binding11',
    roomActionSeq: 7,
    currentRoom: preparedRooms[0]?.index ?? 0,
    preparedRooms,
    ...overrides,
  };
}

function createDom() {
  const loginTab = new FakeElement({ tab: 'login', classes: ['auth-tab', 'active'] });
  const registerTab = new FakeElement({ tab: 'register', classes: ['auth-tab'] });
  const elements = new Map([
    ['auth-screen', new FakeElement({ id: 'auth-screen', classes: ['hidden'] })],
    ['auth-submit', new FakeElement({ id: 'auth-submit' })],
    ['auth-ai-consent', new FakeElement({ id: 'auth-ai-consent', classes: ['hidden'] })],
    ['auth-ai-consent-checkbox', new FakeElement({ id: 'auth-ai-consent-checkbox' })],
    ['auth-password', new FakeElement({ id: 'auth-password' })],
    ['auth-username', new FakeElement({ id: 'auth-username' })],
    ['auth-fields', new FakeElement({ id: 'auth-fields' })],
    ['auth-error', new FakeElement({ id: 'auth-error', classes: ['hidden'] })],
  ]);
  return {
    loginTab,
    registerTab,
    elements,
    document: {
      getElementById: id => elements.get(id) || null,
      querySelectorAll: selector => selector === '.auth-tab' ? [loginTab, registerTab] : [],
      querySelector: () => null,
      createElement: () => new FakeElement(),
      body: new FakeElement(),
    },
  };
}

await mock.module('../../../public/js/analytics.js', {
  namedExports: {
    setAnalyticsUser: async () => {},
    trackEvent: async () => {},
  },
});

const auth = await import('../../../public/js/ui/auth.js');
const api = await import('../../../public/js/api.js');
const { createExploreSession } = await import('../../../public/js/ui/explore-session.js');

describe('auth UI retained-state reauthentication', { concurrency: false }, () => {
  let dom;
  let fetchCalls;
  let authenticatedUsers;

  beforeEach(() => {
    globalThis.localStorage = makeStorage();
    globalThis.sessionStorage = makeStorage();
    dom = createDom();
    globalThis.document = dom.document;
    fetchCalls = [];
    authenticatedUsers = [];
    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      throw new Error(`unexpected fetch: ${url}`);
    };
    auth.logout();
    auth.init({ onAuthenticated: async user => { authenticatedUsers.push(user); } });
    dom.loginTab.click();
  });

  afterEach(() => {
    auth.logout();
    delete globalThis.document;
    delete globalThis.fetch;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  });

  it('captures the initial principal and accepts a same-account login', async () => {
    globalThis.localStorage.setItem('authToken', 'expired-token');
    globalThis.fetch = async (url) => {
      fetchCalls.push({ url });
      if (url.endsWith('/api/auth/me')) return makeResponse({ body: { id: 'user-1', username: 'michi' } });
      return makeResponse({ body: { token: 'fresh-token', user: { id: 'user-1', username: 'michi' } } });
    };
    assert.equal(await auth.checkAuth(), true);
    const recovery = auth.requestReauthentication();
    dom.elements.get('auth-username').value = 'michi';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-submit').click();

    assert.equal(await recovery, true);
    assert.equal(globalThis.localStorage.getItem('authToken'), 'fresh-token');
    assert.equal(dom.elements.get('auth-screen').classList.contains('hidden'), true);
  });

  it('fails an Explore drain before fetch when shared storage no longer matches the verified principal token', async () => {
    globalThis.localStorage.setItem('authToken', 'token-a');
    globalThis.fetch = async url => {
      fetchCalls.push({ url });
      return makeResponse({ body: { id: 'user-1', username: 'michi' } });
    };
    assert.equal(await auth.checkAuth(), true);

    let authRequiredCalls = 0;
    const session = createExploreSession({
      syncRequest: api.syncExploreSession,
      onAuthRequired: async () => { authRequiredCalls += 1; return false; },
    });
    session.adoptRunway(makeExploreRunway());
    assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
    const exactPendingLog = session.snapshot();

    globalThis.localStorage.setItem('authToken', 'token-b');
    let exploreFetches = 0;
    globalThis.fetch = async () => {
      exploreFetches += 1;
      return makeResponse({ body: { status: 'ok', confirmedThroughSeq: 1, results: [] } });
    };
    await session.syncNow();

    assert.equal(exploreFetches, 0);
    assert.equal(authRequiredCalls, 1);
    assert.equal(session.getPauseReason(), 'authRequired');
    assert.deepEqual(session.snapshot(), exactPendingLog);
  });

  it('rejects a V1 checkpoint when the verified binding changes during response-adoption playback', async () => {
    globalThis.localStorage.setItem('authToken', 'token-a');
    globalThis.fetch = async url => {
      fetchCalls.push({ url });
      return makeResponse({ body: { id: 'user-1', username: 'michi' } });
    };
    assert.equal(await auth.checkAuth(), true);

    let releaseAdoption;
    let markAdoptionStarted;
    const adoptionGate = new Promise(resolve => { releaseAdoption = resolve; });
    const adoptionStarted = new Promise(resolve => { markAdoptionStarted = resolve; });
    const callbacks = [];
    let authRequiredCalls = 0;
    const replacementRunway = makeExploreRunway({
      currentRoom: 1,
      preparedRooms: [{
        index: 1,
        roomId: 'room-1',
        actionSeq: 8,
        room: { id: 'room-1', type: 'empty' },
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['areaProgress'] },
        dependencies: [],
        offlineReady: true,
      }],
    });
    globalThis.fetch = async () => makeResponse({
      body: {
        status: 'ok',
        confirmedThroughSeq: 1,
        results: [],
        exploreRunway: replacementRunway,
      },
    });
    const session = createExploreSession({
      syncRequest: api.syncExploreSession,
      isAuthBindingCurrent: api.isExploreSyncResponseAuthCurrent,
      beforeResponseAdoption: async () => {
        markAdoptionStarted();
        await adoptionGate;
      },
      onCheckpoint: () => callbacks.push('checkpoint'),
      onCorrection: () => callbacks.push('correction'),
      onAuthRequired: async () => { authRequiredCalls += 1; return false; },
    });
    session.adoptRunway(makeExploreRunway());
    assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
    const exactPendingLog = session.snapshot();

    const draining = session.syncNow();
    await adoptionStarted;
    globalThis.localStorage.setItem('authToken', 'token-b');
    releaseAdoption();
    await draining;

    assert.deepEqual(session.snapshot(), exactPendingLog);
    assert.equal(session.getPauseReason(), 'authRequired');
    assert.equal(authRequiredCalls, 1);
    assert.deepEqual(callbacks, []);
    assert.equal(session.currentPreparedRoom()?.index, 0);
  });

  it('binds a fresh same-account token so retained Explore work can drain under that token', async () => {
    globalThis.localStorage.setItem('authToken', 'token-a');
    globalThis.fetch = async url => {
      fetchCalls.push({ url });
      return makeResponse({ body: { id: 'user-1', username: 'michi' } });
    };
    assert.equal(await auth.checkAuth(), true);

    const session = createExploreSession({
      syncRequest: api.syncExploreSession,
      onAuthRequired: async () => false,
    });
    session.adoptRunway(makeExploreRunway());
    assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
    globalThis.fetch = async () => makeResponse({
      ok: false,
      status: 401,
      body: { error: 'expired' },
    });
    await session.syncNow();
    assert.equal(session.pendingCount(), 1);

    const recovery = auth.requestReauthentication();
    globalThis.fetch = async url => {
      assert.match(url, /\/api\/auth\/login$/);
      return makeResponse({
        body: { token: 'token-a2', user: { id: 'user-1', username: 'michi' } },
      });
    };
    dom.elements.get('auth-username').value = 'michi';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-submit').click();
    assert.equal(await recovery, true);

    const sentHeaders = [];
    globalThis.fetch = async (_url, options) => {
      sentHeaders.push(options.headers);
      return makeResponse({ body: { status: 'ok', confirmedThroughSeq: 1, results: [] } });
    };
    await session.retryNow();

    assert.equal(sentHeaders.length, 1);
    assert.equal(sentHeaders[0].Authorization, 'Bearer token-a2');
    assert.equal(session.pendingCount(), 0);
  });

  for (const {
    operation,
    invoke,
    expectedResult,
  } of [
    {
      operation: 'checkAuth',
      invoke: () => auth.checkAuth(),
      expectedResult: false,
    },
    {
      operation: 'getCurrentUser',
      invoke: () => auth.getCurrentUser(),
      expectedResult: null,
    },
  ]) {
    it(`${operation} refuses a different verified principal without transferring retained Explore work`, async () => {
      globalThis.localStorage.setItem('authToken', 'token-a');
      globalThis.fetch = async () => makeResponse({
        body: { id: 'user-1', username: 'michi' },
      });
      assert.equal(await auth.checkAuth(), true);

      let authRequiredCalls = 0;
      const session = createExploreSession({
        syncRequest: api.syncExploreSession,
        onAuthRequired: async () => { authRequiredCalls += 1; return false; },
      });
      session.adoptRunway(makeExploreRunway());
      assert.equal(session.recordRoomAction('friendlyNpc.choose', {
        itemId: 'field-tonic',
      }).accepted, true);
      const exactPendingLog = session.snapshot();

      globalThis.localStorage.setItem('authToken', 'token-b');
      globalThis.fetch = async () => makeResponse({
        body: { id: 'user-2', username: 'other' },
      });
      const genericResult = await invoke();

      const exploreHeaders = [];
      globalThis.fetch = async (_url, options) => {
        exploreHeaders.push(options.headers);
        return makeResponse({ body: { status: 'ok', confirmedThroughSeq: 1, results: [] } });
      };
      await session.syncNow();

      assert.deepEqual({
        genericResult,
        exploreHeaders,
        authRequiredCalls,
        pauseReason: session.getPauseReason(),
        pendingLog: session.snapshot(),
      }, {
        genericResult: expectedResult,
        exploreHeaders: [],
        authRequiredCalls: 1,
        pauseReason: 'authRequired',
        pendingLog: exactPendingLog,
      });
    });
  }

  it('rejects a different-principal login before storing its token without an active reauthentication request', async () => {
    globalThis.localStorage.setItem('authToken', 'token-a');
    globalThis.fetch = async () => makeResponse({
      body: { id: 'user-1', username: 'michi' },
    });
    assert.equal(await auth.checkAuth(), true);

    globalThis.fetch = async url => {
      assert.match(url, /\/api\/auth\/login$/);
      return makeResponse({
        body: { token: 'token-b', user: { id: 'user-2', username: 'other' } },
      });
    };
    dom.elements.get('auth-username').value = 'other';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-submit').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(globalThis.localStorage.getItem('authToken'), 'token-a');
    assert.match(dom.elements.get('auth-error').textContent, /same account/i);
    assert.deepEqual(authenticatedUsers, []);
  });

  it('allows a different principal to bind and drain only after explicit logout clears retained ownership', async () => {
    globalThis.localStorage.setItem('authToken', 'token-a');
    globalThis.fetch = async () => makeResponse({
      body: { id: 'user-1', username: 'michi' },
    });
    assert.equal(await auth.checkAuth(), true);

    auth.logout();
    globalThis.localStorage.setItem('authToken', 'token-b');
    globalThis.fetch = async () => makeResponse({
      body: { id: 'user-2', username: 'other' },
    });
    assert.equal(await auth.checkAuth(), true);

    const sentHeaders = [];
    globalThis.fetch = async (_url, options) => {
      sentHeaders.push(options.headers);
      return makeResponse({ body: { status: 'ok', confirmedThroughSeq: 1, results: [] } });
    };
    const session = createExploreSession({ syncRequest: api.syncExploreSession });
    session.adoptRunway(makeExploreRunway());
    assert.equal(session.recordRoomAction('friendlyNpc.choose', {
      itemId: 'field-tonic',
    }).accepted, true);
    await session.syncNow();

    assert.equal(sentHeaders.length, 1);
    assert.equal(sentHeaders[0].Authorization, 'Bearer token-b');
    assert.equal(session.pendingCount(), 0);
  });

  it('refuses a different account without storing its token or resolving recovery', async () => {
    globalThis.localStorage.setItem('authToken', 'expired-token');
    globalThis.fetch = async (url) => {
      fetchCalls.push({ url });
      if (url.endsWith('/api/auth/me')) return makeResponse({ body: { id: 'user-1', username: 'michi' } });
      return makeResponse({ body: { token: 'other-token', user: { id: 'user-2', username: 'other' } } });
    };
    await auth.checkAuth();
    const recovery = auth.requestReauthentication();
    dom.elements.get('auth-username').value = 'other';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-submit').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(globalThis.localStorage.getItem('authToken'), 'expired-token');
    assert.equal(dom.elements.get('auth-screen').classList.contains('hidden'), false);
    assert.match(dom.elements.get('auth-error').textContent, /same account/i);
    assert.equal(await Promise.race([
      recovery.then(() => 'resolved'),
      new Promise(resolve => setImmediate(() => resolve('pending'))),
    ]), 'pending');
    assert.equal(auth.requestReauthentication(), recovery);
  });

  it('refuses registration during reauthentication before issuing a request', async () => {
    globalThis.localStorage.setItem('authToken', 'expired-token');
    globalThis.fetch = async (url) => {
      fetchCalls.push({ url });
      return makeResponse({ body: { id: 'user-1', username: 'michi' } });
    };
    await auth.checkAuth();
    const recovery = auth.requestReauthentication();
    dom.registerTab.click();
    dom.elements.get('auth-username').value = 'new-user';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-ai-consent-checkbox').checked = true;
    dom.elements.get('auth-submit').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(fetchCalls.length, 1);
    assert.match(dom.elements.get('auth-error').textContent, /same account/i);
    assert.equal(await Promise.race([
      recovery.then(() => 'resolved'),
      new Promise(resolve => setImmediate(() => resolve('pending'))),
    ]), 'pending');
    assert.equal(auth.requestReauthentication(), recovery);
  });

  it('coalesces repeated recovery requests without replacing the pending resolver', async () => {
    globalThis.localStorage.setItem('authToken', 'expired-token');
    globalThis.fetch = async () => makeResponse({ body: { id: 'user-1', username: 'michi' } });
    await auth.checkAuth();

    const first = auth.requestReauthentication();
    const second = auth.requestReauthentication();

    assert.equal(second, first);
  });

  it('logout clears the retained principal while normal login keeps existing behavior', async () => {
    globalThis.localStorage.setItem('authToken', 'old-token');
    globalThis.fetch = async (url) => {
      if (url.endsWith('/api/auth/me')) return makeResponse({ body: { id: 'user-1', username: 'michi' } });
      return makeResponse({ body: { token: 'normal-token', user: { id: 'user-2', username: 'other' } } });
    };
    await auth.checkAuth();
    auth.logout();
    const afterLogout = await Promise.race([
      auth.requestReauthentication(),
      new Promise(resolve => setImmediate(() => resolve('still-pending'))),
    ]);
    assert.equal(afterLogout, false);

    dom.elements.get('auth-username').value = 'other';
    dom.elements.get('auth-password').value = 'password';
    dom.elements.get('auth-submit').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(globalThis.localStorage.getItem('authToken'), 'normal-token');
    assert.deepEqual(authenticatedUsers, [{ id: 'user-2', username: 'other' }]);
  });
});
