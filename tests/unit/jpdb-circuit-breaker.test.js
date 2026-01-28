import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// We'll test the circuit breaker by mocking fetch
describe('JPDB Circuit Breaker', () => {
  it('should export circuit breaker state getters', async () => {
    const { getCircuitBreakerState } = await import('../../src/jpdb.js');
    const state = getCircuitBreakerState();
    assert.ok('isOpen' in state, 'should have isOpen property');
    assert.ok('cooldownUntil' in state, 'should have cooldownUntil property');
  });
});
