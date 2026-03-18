// tests/unit/game/internal-srs.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestTmpDir } from '../../helpers/tmp.js';

let tmp;
const TEST_USER = 'test-user-kana';

describe('Internal SRS Service', () => {
  let srs;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
  });

  after(async () => {
    await tmp.cleanup();
  });

  beforeEach(() => {
    srs.clearSrsData(TEST_USER);
  });

  describe('initKanaDeck', () => {
    it('creates 71 kana cards for a new user', () => {
      srs.initKanaDeck(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      assert.strictEqual(data.kana.cards.length, 71);
    });

    it('each card has char, romaji, row, and FSRS fields', () => {
      srs.initKanaDeck(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      const card = data.kana.cards[0];
      assert.ok(card.char);
      assert.ok(card.romaji);
      assert.ok(card.row >= 0);
      assert.ok('due' in card);
      assert.ok('stability' in card);
      assert.ok('difficulty' in card);
      assert.ok('state' in card);
    });

    it('does not overwrite existing data', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      srs.reviewKanaCard(TEST_USER, card.char, 'good');
      srs.initKanaDeck(TEST_USER); // second call
      const data = srs.loadSrsData(TEST_USER);
      const reviewed = data.kana.cards.find(c => c.char === card.char);
      assert.ok(reviewed.reps > 0, 'review data should be preserved');
    });
  });

  describe('getNextKanaCard', () => {
    it('returns a card from row 0 for a fresh user', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      assert.ok(card);
      assert.strictEqual(card.row, 0);
    });

    it('always returns a card (never null)', () => {
      srs.initKanaDeck(TEST_USER);
      for (let i = 0; i < 10; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        assert.ok(card, `card ${i} should not be null`);
      }
    });

    it('only returns unlocked cards', () => {
      srs.initKanaDeck(TEST_USER);
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        seen.add(card.row);
      }
      assert.ok(!seen.has(1), 'row 1 should not be unlocked yet');
    });
  });

  describe('reviewKanaCard', () => {
    it('updates card state after "good" review', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      const result = srs.reviewKanaCard(TEST_USER, card.char, 'good');
      assert.ok(result);
      assert.ok(result.reps >= 1);
    });

    it('updates card state after "again" review', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      const result = srs.reviewKanaCard(TEST_USER, card.char, 'again');
      assert.ok(result);
      assert.ok(result.reps >= 1);
    });

    it('persists review data across loads', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      srs.reviewKanaCard(TEST_USER, card.char, 'good');
      srs.clearSrsCache(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      const reviewed = data.kana.cards.find(c => c.char === card.char);
      assert.ok(reviewed.reps >= 1);
    });
  });

  describe('row unlocking', () => {
    it('unlocks row 1 after all row 0 cards reviewed', () => {
      srs.initKanaDeck(TEST_USER);
      const row0 = ['あ', 'い', 'う', 'え', 'お'];
      for (const char of row0) {
        srs.reviewKanaCard(TEST_USER, char, 'good');
      }
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        seen.add(card.row);
      }
      assert.ok(seen.has(1), 'row 1 should now be unlocked');
    });
  });

  describe('getKanaStats', () => {
    it('returns stats for a fresh deck', () => {
      srs.initKanaDeck(TEST_USER);
      const stats = srs.getKanaStats(TEST_USER);
      assert.strictEqual(stats.total, 71);
      assert.strictEqual(stats.unlocked, 5);
      assert.strictEqual(stats.mastered, 0);
    });
  });

  describe('graduation', () => {
    it('isKanaGraduated returns false for a fresh deck', () => {
      srs.initKanaDeck(TEST_USER);
      assert.strictEqual(srs.isKanaGraduated(TEST_USER), false);
    });

    it('getKanaStats includes graduated field', () => {
      srs.initKanaDeck(TEST_USER);
      const stats = srs.getKanaStats(TEST_USER);
      assert.strictEqual(stats.graduated, false);
    });
  });
});
