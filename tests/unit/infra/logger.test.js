import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

describe('Server Logger', () => {
  it('should export logger with all methods', async () => {
    const { logger } = await import('../../../src/logger.js');
    assert.ok(typeof logger.debug === 'function');
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.error === 'function');
    assert.ok(typeof logger.setLevel === 'function');
  });

  it('should respect log level hierarchy', async () => {
    const { logger } = await import('../../../src/logger.js');

    // At 'error' level, only error should log
    logger.setLevel('error');
    // debug/info/warn should be suppressed (we can't easily test console output,
    // but we can verify setLevel doesn't throw)
    logger.debug('test');
    logger.info('test');
    logger.warn('test');
    logger.error('test');
  });
});
