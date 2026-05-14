import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnalyticsClient
} from '../../../public/js/analytics.js';

function env(enabled = true) {
  return enabled ? {
    VITE_FIREBASE_ANALYTICS_ENABLED: 'true',
    VITE_FIREBASE_API_KEY: 'api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'koto-prod',
    VITE_FIREBASE_APP_ID: 'app-id',
    VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST'
  } : {
    VITE_FIREBASE_ANALYTICS_ENABLED: 'false'
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => { map.set(key, String(value)); }
  };
}

describe('analytics facade', () => {
  let transport;

  beforeEach(() => {
    transport = {
      init: mock.fn(async () => {}),
      setUserId: mock.fn(async () => {}),
      setUserProperty: mock.fn(async () => {}),
      logEvent: mock.fn(async () => {}),
      setCrashKey: mock.fn(async () => {}),
      recordException: mock.fn(async () => {})
    };
  });

  it('no-ops when analytics env gate is disabled', async () => {
    const client = createAnalyticsClient({
      env: env(false),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_login', { method: 'password' });

    assert.equal(transport.init.mock.callCount(), 0);
    assert.equal(transport.logEvent.mock.callCount(), 0);
  });

  it('sets user id and safe user properties when configured', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.setAnalyticsUser({ analyticsId: 'ka_abc123' });

    assert.equal(transport.setUserId.mock.callCount(), 1);
    assert.deepEqual(transport.setUserId.mock.calls[0].arguments, ['ka_abc123']);
    assert.equal(transport.setUserProperty.mock.callCount() >= 1, true);
  });

  it('sanitizes event params before logging', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_area_selected', {
      area_id: 'hajimari-no-hiroba',
      username: 'do-not-send'
    });

    assert.deepEqual(transport.logEvent.mock.calls[0].arguments, [
      'koto_area_selected',
      { area_id: 'hajimari-no-hiroba' }
    ]);
  });

  it('logs a milestone only once for the same analytics id', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.setAnalyticsUser({ analyticsId: 'ka_abc123' });
    await client.trackMilestone('koto_first_run_started');
    await client.trackMilestone('koto_first_run_started');

    assert.equal(transport.logEvent.mock.callCount(), 1);
  });

  it('records non-fatal errors without throwing', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: true },
      transportFactory: async () => transport
    });

    await client.init();
    await client.recordNonFatal(new Error('Boom'), { phase: 'combat', dialogue: 'こんにちは' });

    assert.equal(transport.recordException.mock.callCount(), 1);
    assert.equal(transport.setCrashKey.mock.callCount() >= 1, true);
  });

  it('logs auth events through the sanitized event path', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_login', { method: 'password', username: 'nope' });
    await client.trackEvent('koto_sign_up', { method: 'password', username: 'nope' });

    assert.deepEqual(transport.logEvent.mock.calls[0].arguments, [
      'koto_login',
      { method: 'password' }
    ]);
    assert.deepEqual(transport.logEvent.mock.calls[1].arguments, [
      'koto_sign_up',
      { method: 'password' }
    ]);
  });
});
