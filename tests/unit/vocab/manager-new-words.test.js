import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert';
import { State } from 'ts-fsrs';

const TEST_USER_ID = 'test-user';
let getDeckCardsMock;

before(async () => {
  getDeckCardsMock = mock.fn(() => []);
  await mock.module('../../../src/game/internal-srs.js', {
    namedExports: {
      getDeckCards: getDeckCardsMock,
      getDueCards: mock.fn(() => []),
      loadSrsData: () => ({ kana: { cards: [] } }),
      saveSrsData: () => {},
      clearSrsData: () => {},
      clearSrsCache: () => {},
      configureSrs: () => {},
      initKanaDeck: () => {},
      getRowCards: () => [],
      gradeCard: () => ({}),
      createCard: () => ({}),
    }
  });
});

describe('getNewWordsForDiscovery', () => {
  it('should return words with state "new" sorted by rank', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.clearVocabManagerCache(TEST_USER_ID);

    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '食べる', state: State.New, reading: 'たべる', meaning: 'to eat', rank: 100 },
      { id: '飲む', state: State.New, reading: 'のむ', meaning: 'to drink', rank: 50 },
      { id: '見る', state: State.Learning, reading: 'みる', meaning: 'to see', rank: 30 },
      { id: '聞く', state: State.New, reading: 'きく', meaning: 'to listen', rank: 200 }
    ]);

    const result = vm.getNewWordsForDiscovery(2, TEST_USER_ID);

    assert.strictEqual(result.words.length, 2);
    // Should be sorted by rank (lower = higher frequency = first)
    assert.strictEqual(result.words[0].word, '飲む');  // rank 50
    assert.strictEqual(result.words[1].word, '食べる'); // rank 100
    assert.strictEqual(result.available, true);
  });

  it('should return empty array when no new words', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.clearVocabManagerCache(TEST_USER_ID);

    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '見る', state: State.Learning, reading: 'みる', meaning: 'to see', rank: 30 }
    ]);

    const result = vm.getNewWordsForDiscovery(2, TEST_USER_ID);

    assert.strictEqual(result.words.length, 0);
    assert.strictEqual(result.available, false);
  });

  it('should return fewer words if not enough available', async () => {
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.clearVocabManagerCache(TEST_USER_ID);

    getDeckCardsMock.mock.mockImplementation(() => [
      { id: '食べる', state: State.New, reading: 'たべる', meaning: 'to eat', rank: 100 }
    ]);

    const result = vm.getNewWordsForDiscovery(5, TEST_USER_ID);

    assert.strictEqual(result.words.length, 1);
    assert.strictEqual(result.available, true);
  });
});
