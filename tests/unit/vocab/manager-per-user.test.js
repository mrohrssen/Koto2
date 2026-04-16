/**
 * Tests for per-user vocab manager backed by FSRS (internal-srs.js)
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { State } from 'ts-fsrs';

// We mock getDeckCards so the vocab-manager sees controlled card data
// without needing real FSRS files on disk.
let getDeckCardsMock;
let getDueCardsMock;

// Register the mock before importing vocab-manager
before(async () => {
  getDeckCardsMock = mock.fn(() => []);
  getDueCardsMock = mock.fn(() => []);
  await mock.module('../../../src/game/internal-srs.js', {
    namedExports: {
      getDeckCards: getDeckCardsMock,
      getDueCards: getDueCardsMock,
      // Stubs for other exports that may be imported transitively
      loadSrsData: () => ({ kana: { cards: [] } }),
      saveSrsData: () => {},
      clearSrsData: () => {},
      clearSrsCache: () => {},
      configureSrs: () => {},
      initKanaDeck: () => {},
      getRowCards: () => [],
      gradeCard: () => ({}),
    }
  });
});

describe('Per-user vocab manager (FSRS-backed)', () => {
  let vm;

  before(async () => {
    vm = await import('../../../src/game/vocab-manager.js');
  });

  it('should add and retrieve recently used words per user', () => {
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.addUsedWords(['word1', 'word2'], 'user1');
    vm.addUsedWords(['word3', 'word4'], 'user2');

    const user1Words = vm.getRecentlyUsedWords('user1');
    const user2Words = vm.getRecentlyUsedWords('user2');

    assert.deepStrictEqual(user1Words, ['word1', 'word2']);
    assert.deepStrictEqual(user2Words, ['word3', 'word4']);
  });

  it('should throw error when userId is missing', () => {
    assert.throws(() => {
      vm.addUsedWords(['word'], undefined);
    }, /userId is required/);
  });

  it('should isolate getRecentlyUsedWords per user', () => {
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    vm.addUsedWords(['apple', 'banana'], 'user1');
    vm.addUsedWords(['cherry', 'date'], 'user2');

    const user1Words = vm.getRecentlyUsedWords('user1');
    const user2Words = vm.getRecentlyUsedWords('user2');

    assert.deepStrictEqual(user1Words, ['apple', 'banana']);
    assert.deepStrictEqual(user2Words, ['cherry', 'date']);
  });

  it('should return known words from getNarrationVocabularyForUser via FSRS cards', () => {
    vm.clearVocabManagerCache('user1');

    // Mock getDeckCards to return FSRS card objects
    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '学ぶ', state: State.Relearning, due: new Date(Date.now() - 1000) },
      { id: '食べる', state: State.Learning, due: new Date(Date.now() - 1000) },
      { id: '見る', state: State.Review, due: new Date(Date.now() + 100000) },
      { id: '新語', state: State.New, due: new Date() },
    ]);

    const result = vm.getNarrationVocabularyForUser('user1', ['fallback']);
    assert.ok(result.words, 'result should have words property');
    // Learning, Review, and Relearning cards should be included; New should not
    assert.ok(result.words.includes('学ぶ'));
    assert.ok(result.words.includes('食べる'));
    assert.ok(result.words.includes('見る'));
    assert.ok(!result.words.includes('新語'));
    // No vidSet property in new API
    assert.strictEqual(result.vidSet, undefined);
  });

  it('should fall back to provided vocabulary when user has no known cards', () => {
    vm.clearVocabManagerCache('user1');

    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '新語', state: State.New, due: new Date() },
    ]);

    const result = vm.getNarrationVocabularyForUser('user1', ['fallback', 'fallback', 'known']);
    assert.deepStrictEqual(result.words, ['fallback', 'known']);
  });

  it('should return empty words for null userId with deduped fallback', () => {
    const result = vm.getNarrationVocabularyForUser(null, ['a', 'b', 'a']);
    assert.deepStrictEqual(result.words, ['a', 'b']);
  });

  it('selectSuggestedWords returns due/learning/known mix from FSRS cards', () => {
    const cards = [
      { id: '走る', state: State.Relearning, due: new Date(Date.now() - 5000) },
      { id: '泳ぐ', state: State.Learning, due: new Date(Date.now() - 1000) },
      { id: '読む', state: State.Review, due: new Date(Date.now() - 1000) },
      { id: '書く', state: State.Review, due: new Date(Date.now() + 100000) },
      { id: '聞く', state: State.Learning, due: new Date(Date.now() + 100000) },
      { id: '話す', state: State.New, due: new Date() },
    ];

    const results = vm.selectSuggestedWords(cards, [], 5);
    assert.ok(results.length > 0, 'should return some suggested words');
    // New words should not appear (priority 0)
    const words = results.map(r => r.word);
    assert.ok(!words.includes('話す'), 'New state words should not be suggested');
  });

  it('getNewWordsForDiscovery returns only State.New cards sorted by rank', () => {
    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '食べる', state: State.New, reading: 'たべる', meaning: 'to eat', rank: 100 },
      { id: '飲む', state: State.New, reading: 'のむ', meaning: 'to drink', rank: 50 },
      { id: '見る', state: State.Learning, reading: 'みる', meaning: 'to see', rank: 30 },
      { id: '聞く', state: State.New, reading: 'きく', meaning: 'to listen', rank: 200 },
    ]);

    const result = vm.getNewWordsForDiscovery(2, 'user1');
    assert.strictEqual(result.words.length, 2);
    assert.strictEqual(result.words[0].word, '飲む');  // rank 50 first
    assert.strictEqual(result.words[1].word, '食べる'); // rank 100
    assert.strictEqual(result.available, true);
  });

  it('getNewWordsForDiscovery returns empty when no new words', () => {
    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '見る', state: State.Learning, reading: 'みる', meaning: 'to see', rank: 30 },
    ]);

    const result = vm.getNewWordsForDiscovery(2, 'user1');
    assert.strictEqual(result.words.length, 0);
    assert.strictEqual(result.available, false);
  });

  it('getVocabManagerStats returns card counts from FSRS', () => {
    getDeckCardsMock.mock.mockImplementation(() => [
      { id: 'a', state: State.Learning, due: new Date() },
      { id: 'b', state: State.Review, due: new Date() },
    ]);
    getDueCardsMock.mock.mockImplementation(() => [
      { id: 'a', state: State.Learning, due: new Date(Date.now() - 1000) },
    ]);

    vm.clearVocabManagerCache('user1');
    vm.addUsedWords(['x', 'y'], 'user1');

    const stats = vm.getVocabManagerStats('user1');
    assert.strictEqual(stats.recentWordsCount, 2);
    assert.strictEqual(stats.totalCards, 2);
    assert.strictEqual(stats.dueCards, 1);
  });
});
