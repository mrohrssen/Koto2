import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../public/js/platform.js', {
  namedExports: { PLATFORM: { isNative: false } },
});

await mock.module('../../public/js/analytics-core.js', {
  namedExports: {
    buildFirebaseConfig: () => ({ apiKey: 'test' }),
    extractGameContext: () => ({}),
    sanitizeParams: (p) => p,
    createMilestoneStore: () => ({ has: () => false, mark: () => {} }),
    nextFurthestStep: () => null,
  },
});

const { createAnalyticsClient } = await import('../../public/js/analytics.js');

function makeFailingClient() {
  return createAnalyticsClient({
    env: {},
    storage: null,
    transportFactory: async () => ({
      init: async () => {},
      logEvent: async () => { throw new Error('plugin is not implemented on ios'); },
      setUserProperty: async () => { throw new Error('plugin is not implemented on ios'); },
    }),
  });
}

describe('analytics warn-once', () => {
  let warnings;
  let origWarn;

  beforeEach(() => {
    warnings = [];
    origWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.join(' ')); };
  });

  afterEach(() => {
    console.warn = origWarn;
  });

  it('warns only once per failing operation label', async () => {
    const client = makeFailingClient();
    await client.trackEvent('a');
    await client.trackEvent('b');
    await client.trackEvent('c');
    assert.equal(warnings.filter((w) => w.includes('logEvent failed')).length, 1);
  });

  it('distinct labels each warn once', async () => {
    const client = makeFailingClient();
    await client.trackEvent('a');
    await client.setUserProperty('k', 'v');
    await client.trackEvent('b');
    await client.setUserProperty('k2', 'v2');
    assert.equal(warnings.filter((w) => w.includes('logEvent failed')).length, 1);
    assert.equal(warnings.filter((w) => w.includes('setUserProperty failed')).length, 1);
  });
});
