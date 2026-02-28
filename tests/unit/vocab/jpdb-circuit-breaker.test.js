import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

describe('jpdbFetch with circuit breaker', () => {
  it('should trip circuit breaker on 429 error', async () => {
    const { tripCircuitBreaker, getCircuitBreakerState, resetCircuitBreaker } = await import('../../../src/jpdb.js');

    resetCircuitBreaker();
    tripCircuitBreaker(429);

    const state = getCircuitBreakerState();
    assert.strictEqual(state.isOpen, true, 'circuit should be open after 429');
    assert.ok(state.cooldownUntil > Date.now(), 'cooldown should be in future');
  });

  it('should extend cooldown on repeated failures', async () => {
    const { tripCircuitBreaker, getCircuitBreakerState, resetCircuitBreaker } = await import('../../../src/jpdb.js');

    resetCircuitBreaker();
    tripCircuitBreaker(429);
    const firstCooldown = getCircuitBreakerState().cooldownUntil;

    // Simulate retry after cooldown that also fails
    tripCircuitBreaker(429);
    const secondCooldown = getCircuitBreakerState().cooldownUntil;

    assert.ok(secondCooldown > firstCooldown, 'second cooldown should be longer');
  });
});
