import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

const TEST_CACHE_DIR = '/tmp/test-vocab-new-words-cache/';
const TEST_USER_ID = 'test-user';

describe('getNewWordsForDiscovery', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
    const cacheFile = `${TEST_CACHE_DIR}vocab-cache-${TEST_USER_ID}.json`;
    if (existsSync(cacheFile)) {
      unlinkSync(cacheFile);
    }
  });

  it('should export getNewWordsForDiscovery function', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    assert.strictEqual(typeof vm.getNewWordsForDiscovery, 'function');
  });

  it('should return words with state "new" sorted by rank', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache(TEST_USER_ID);

    // Manually set up cache with test data
    const testCache = {
      '食べる': { states: ['new'], vid: 1, sid: 0, rank: 100 },
      '飲む': { states: ['new'], vid: 2, sid: 0, rank: 50 },
      '見る': { states: ['learning'], vid: 3, sid: 0, rank: 30 },
      '聞く': { states: ['new'], vid: 4, sid: 0, rank: 200 }
    };

    // Inject test cache (internal function for testing)
    vm.setTestCache(testCache, TEST_USER_ID);

    const result = vm.getNewWordsForDiscovery(2, TEST_USER_ID);

    assert.strictEqual(result.words.length, 2);
    // Should be sorted by rank (lower = higher frequency = first)
    assert.strictEqual(result.words[0].word, '飲む');  // rank 50
    assert.strictEqual(result.words[1].word, '食べる'); // rank 100
    assert.strictEqual(result.available, true);
  });

  it('should return empty array when no new words', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache(TEST_USER_ID);

    const testCache = {
      '見る': { states: ['learning'], vid: 3, sid: 0, rank: 30 }
    };
    vm.setTestCache(testCache, TEST_USER_ID);

    const result = vm.getNewWordsForDiscovery(2, TEST_USER_ID);

    assert.strictEqual(result.words.length, 0);
    assert.strictEqual(result.available, false);
  });

  it('should return fewer words if not enough available', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache(TEST_USER_ID);

    const testCache = {
      '食べる': { states: ['new'], vid: 1, sid: 0, rank: 100 }
    };
    vm.setTestCache(testCache, TEST_USER_ID);

    const result = vm.getNewWordsForDiscovery(5, TEST_USER_ID);

    assert.strictEqual(result.words.length, 1);
    assert.strictEqual(result.available, true);
  });
});
