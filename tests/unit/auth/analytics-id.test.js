import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAnalyticsId } from '../../../src/auth/analytics-id.js';

describe('analytics ID helper', () => {
  it('returns a stable pseudonymous ID when a secret is configured', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };
    const first = getAnalyticsId('u_abc123', env);
    const second = getAnalyticsId('u_abc123', env);

    assert.equal(first, second);
    assert.match(first, /^ka_[a-f0-9]{32}$/);
    assert.equal(first.includes('u_abc123'), false);
  });

  it('returns different IDs for different users', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };

    assert.notEqual(
      getAnalyticsId('u_one', env),
      getAnalyticsId('u_two', env)
    );
  });

  it('returns null when no secret is configured', () => {
    assert.equal(getAnalyticsId('u_abc123', {}), null);
  });

  it('returns null for missing user IDs', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };

    assert.equal(getAnalyticsId('', env), null);
    assert.equal(getAnalyticsId(null, env), null);
    assert.equal(getAnalyticsId(undefined, env), null);
  });
});
