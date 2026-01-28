import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Batch Parse', () => {
  it('should export parseWordBatch function', async () => {
    const jpdb = await import('../../src/jpdb.js');
    assert.strictEqual(typeof jpdb.parseWordBatch, 'function');
  });

  it('should export parseWordBatches function', async () => {
    const jpdb = await import('../../src/jpdb.js');
    assert.strictEqual(typeof jpdb.parseWordBatches, 'function');
  });
});
