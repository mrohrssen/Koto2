import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync } from 'fs';

const TEST_CACHE_FILE = '/tmp/test-vocab-cache.json';

describe('Vocab Manager New Cache Format', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE_FILE)) {
      unlinkSync(TEST_CACHE_FILE);
    }
  });

  it('should support lastFullParse timestamp in cache', async () => {
    const { configureVocabManager, getVocabManagerStats, clearVocabManagerCache } = await import('../../src/game/vocab-manager.js');

    configureVocabManager({ cacheFile: TEST_CACHE_FILE });
    clearVocabManagerCache();

    const stats = getVocabManagerStats();
    assert.ok('lastFullParse' in stats, 'stats should include lastFullParse');
  });
});
