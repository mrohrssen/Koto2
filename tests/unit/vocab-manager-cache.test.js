import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

const TEST_CACHE_DIR = '/tmp/test-vocab-cache/';
const TEST_USER_ID = 'test-user';

describe('Vocab Manager New Cache Format', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
    const cacheFile = `${TEST_CACHE_DIR}vocab-cache-${TEST_USER_ID}.json`;
    if (existsSync(cacheFile)) {
      unlinkSync(cacheFile);
    }
  });

  it('should support lastFullParse timestamp in cache', async () => {
    const { configureVocabManager, getVocabManagerStats, clearVocabManagerCache } = await import('../../src/game/vocab-manager.js');

    configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    clearVocabManagerCache(TEST_USER_ID);

    const stats = getVocabManagerStats(TEST_USER_ID);
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
    assert.strictEqual(vm.FULL_PARSE_CONFIG.batchSize, 1000);
    assert.strictEqual(vm.FULL_PARSE_CONFIG.maxWords, 10000);
  });
});
