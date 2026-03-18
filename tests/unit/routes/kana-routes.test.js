// tests/unit/routes/kana-routes.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestTmpDir } from '../../helpers/tmp.js';

const TEST_USER = 'test-user-kana-routes';
let tmp;

describe('Kana API routes', () => {
  let srs;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    srs.initKanaDeck(TEST_USER);
  });

  after(async () => {
    await tmp.cleanup();
  });

  it('getNextKanaCard returns a valid card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    assert.ok(card.char);
    assert.ok(card.romaji);
  });

  it('reviewKanaCard with "good" updates the card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    const result = srs.reviewKanaCard(TEST_USER, card.char, 'good');
    assert.ok(result.reps >= 1);
  });

  it('reviewKanaCard with "again" updates the card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    const result = srs.reviewKanaCard(TEST_USER, card.char, 'again');
    assert.ok(result.reps >= 1);
  });

  it('getKanaStats returns valid stats after reviews', () => {
    const stats = srs.getKanaStats(TEST_USER);
    assert.strictEqual(stats.total, 71);
    assert.ok(stats.unlocked >= 5);
  });
});
