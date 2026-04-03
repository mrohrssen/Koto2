import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestTmpDir } from '../../helpers/tmp.js';

let tmp;
const TEST_USER = 'test-user-vocab';

describe('Vocab SRS — exposure threshold', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('no vocab card created below 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 4; i++) wk.registerExposure(knowledge, 'かいふく');
    const due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);
  });

  it('vocab card created at exactly 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'かいふく');
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    const due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].word, 'かいふく');
  });

  it('card not duplicated on further exposures beyond 5', () => {
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(cards.length, 1);
  });
});

describe('Vocab SRS — review grading', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('grading good marks word as known', () => {
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    srs.gradeCard(TEST_USER, 'vocab', 'かいふく', 'good');
    const knowledge = wk.createWordKnowledge(TEST_USER);
    wk.markKnown(knowledge, 'かいふく');
    assert.ok(wk.isWordKnown(knowledge, 'かいふく'));
  });

  it('grading again removes word from known and resets exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    wk.markKnown(knowledge, 'かいふく');
    for (let i = 0; i < 7; i++) wk.registerExposure(knowledge, 'かいふく');
    wk.unmarkKnown(knowledge, 'かいふく');
    knowledge.seen['かいふく'].exposures = 0;
    assert.ok(!wk.isWordKnown(knowledge, 'かいふく'));
    assert.strictEqual(knowledge.seen['かいふく'].exposures, 0);
  });
});

describe('Vocab SRS — full lifecycle', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('expose 5x → card due → grade good → known → grade again → un-known + reset', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'たたかう');
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 5);
    srs.createCard(TEST_USER, 'vocab', 'たたかう', {
      word: 'たたかう', meaning: 'fight', reading: 'たたかう'
    });
    let due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good');
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good');
    wk.markKnown(knowledge, 'たたかう');
    assert.ok(wk.isWordKnown(knowledge, 'たたかう'));
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    cards[0].due = new Date(Date.now() - 1000);
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'again');
    wk.unmarkKnown(knowledge, 'たたかう');
    knowledge.seen['たたかう'].exposures = 0;
    assert.ok(!wk.isWordKnown(knowledge, 'たたかう'));
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 0);
    const allCards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(allCards.length, 1);
    assert.strictEqual(allCards[0].lapses, 1);
  });
});
