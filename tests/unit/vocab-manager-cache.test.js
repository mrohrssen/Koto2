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

describe('Full Parse Function', () => {
  it('should export performFullParse function', async () => {
    const vm = await import('../../src/game/vocab-manager.js');
    assert.strictEqual(typeof vm.performFullParse, 'function');
  });

  it('should export FULL_PARSE_CONFIG for testing', async () => {
    const vm = await import('../../src/game/vocab-manager.js');
    assert.ok(vm.FULL_PARSE_CONFIG, 'should export config');
    assert.strictEqual(vm.FULL_PARSE_CONFIG.batchSize, 2000);
    assert.strictEqual(vm.FULL_PARSE_CONFIG.maxWords, 10000);
  });
});
