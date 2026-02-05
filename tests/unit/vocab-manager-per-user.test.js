/**
 * Tests for per-user vocab cache isolation
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import * as jpdb from '../../src/jpdb.js';

const TEST_CACHE_DIR = '/tmp/test-vocab-cache/';

describe('Per-user vocab cache', () => {
  // Import fresh module for each test run
  let vm;

  before(async () => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
    // Dynamic import to get fresh module
    vm = await import('../../src/game/vocab-manager.js');
  });

  after(() => {
    ['user1', 'user2'].forEach(userId => {
      const file = `${TEST_CACHE_DIR}vocab-cache-${userId}.json`;
      if (existsSync(file)) unlinkSync(file);
    });
  });

  it('should create separate cache files for different users', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.addUsedWords(['word1', 'word2'], 'user1');
    vm.addUsedWords(['word3', 'word4'], 'user2');

    const user1File = `${TEST_CACHE_DIR}vocab-cache-user1.json`;
    const user2File = `${TEST_CACHE_DIR}vocab-cache-user2.json`;

    assert.ok(existsSync(user1File), 'User 1 cache file should exist');
    assert.ok(existsSync(user2File), 'User 2 cache file should exist');

    const user1Data = JSON.parse(readFileSync(user1File, 'utf-8'));
    const user2Data = JSON.parse(readFileSync(user2File, 'utf-8'));

    assert.ok(user1Data.recentlyUsedWords.includes('word1'));
    assert.ok(!user1Data.recentlyUsedWords.includes('word3'));
    assert.ok(user2Data.recentlyUsedWords.includes('word3'));
    assert.ok(!user2Data.recentlyUsedWords.includes('word1'));
  });

  it('should throw error when userId is missing', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });

    assert.throws(() => {
      vm.addUsedWords(['word'], undefined);
    }, /userId is required/);
  });

  it('should maintain separate word state caches per user', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    // Set up test caches for each user
    vm.setTestCache({
      '食べる': { states: ['due'], vid: 1, sid: 0, rank: 100 }
    }, 'user1');

    vm.setTestCache({
      '飲む': { states: ['learning'], vid: 2, sid: 0, rank: 50 }
    }, 'user2');

    const stats1 = vm.getVocabManagerStats('user1');
    const stats2 = vm.getVocabManagerStats('user2');

    assert.strictEqual(stats1.cachedWordStates, 1);
    assert.strictEqual(stats2.cachedWordStates, 1);
  });

  it('should isolate getRecentlyUsedWords per user', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.addUsedWords(['apple', 'banana'], 'user1');
    vm.addUsedWords(['cherry', 'date'], 'user2');

    const user1Words = vm.getRecentlyUsedWords('user1');
    const user2Words = vm.getRecentlyUsedWords('user2');

    assert.deepStrictEqual(user1Words, ['apple', 'banana']);
    assert.deepStrictEqual(user2Words, ['cherry', 'date']);
  });

  it('should support legacy cacheFile config with warning', () => {
    // This tests backward compatibility
    vm.configureVocabManager({ cacheFile: '/tmp/legacy-cache/vocab.json' });
    // Should not throw, and should extract directory
    // The warning is logged but not testable here
  });

  it('should isolate getNewWordsForDiscovery per user', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.setTestCache({
      '食べる': { states: ['new'], vid: 1, sid: 0, rank: 100 },
      '飲む': { states: ['learning'], vid: 2, sid: 0, rank: 50 }
    }, 'user1');

    vm.setTestCache({
      '見る': { states: ['new'], vid: 3, sid: 0, rank: 30 }
    }, 'user2');

    const result1 = vm.getNewWordsForDiscovery(10, 'user1');
    const result2 = vm.getNewWordsForDiscovery(10, 'user2');

    // User1 should only see their new word (食べる), not user2's
    assert.strictEqual(result1.words.length, 1);
    assert.strictEqual(result1.words[0].word, '食べる');

    // User2 should only see their new word (見る)
    assert.strictEqual(result2.words.length, 1);
    assert.strictEqual(result2.words[0].word, '見る');
  });
});

describe('JPDB per-user cache', () => {
  let vm;

  before(async () => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
    vm = await import('../../src/game/vocab-manager.js');
  });

  after(() => {
    ['user1', 'user2'].forEach(userId => {
      const file = `${TEST_CACHE_DIR}vocab-cache-${userId}.json`;
      if (existsSync(file)) unlinkSync(file);
    });
  });

  it('should invalidate only the specified user cache', () => {
    jpdb.configure({ vocabCacheDir: TEST_CACHE_DIR });
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });

    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.setTestCache({
      'テスト': { vid: 123, sid: 1, states: ['due'], dueAt: Date.now() }
    }, 'user1');
    vm.setTestCache({
      'テスト': { vid: 123, sid: 1, states: ['due'], dueAt: Date.now() }
    }, 'user2');

    // Need to save caches to disk for jpdb to read them
    vm.addUsedWords(['dummy'], 'user1');
    vm.addUsedWords(['dummy'], 'user2');

    // Invalidate for user1 only
    jpdb.invalidateWordStateCache(123, 'user1');

    // Check user2's cache is untouched - word still has 'due'
    const user2File = `${TEST_CACHE_DIR}vocab-cache-user2.json`;
    const user2Data = JSON.parse(readFileSync(user2File, 'utf-8'));
    assert.ok(user2Data.wordStateCache['テスト'].states.includes('due'), 'User2 cache should still have due state');

    // Check user1's cache has 'due' removed
    const user1File = `${TEST_CACHE_DIR}vocab-cache-user1.json`;
    const user1Data = JSON.parse(readFileSync(user1File, 'utf-8'));
    assert.ok(!user1Data.wordStateCache['テスト'].states.includes('due'), 'User1 cache should not have due state');
  });

  it('should throw error when userId is missing for invalidateWordStateCache', () => {
    jpdb.configure({ vocabCacheDir: TEST_CACHE_DIR });

    assert.throws(() => {
      jpdb.invalidateWordStateCache(123, undefined);
    }, /userId is required/);
  });
});
