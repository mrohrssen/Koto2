import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCard, gradeCard, getDeckCards, configureSrs } from '../../src/game/internal-srs.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { State } from 'ts-fsrs';
import { createKnownWordsRoutes } from '../../src/routes/game/known-words.js';

describe('known-words review — auto-create card', () => {
  let tempDir;
  const userId = 'test-user-review';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'srs-test-'));
    configureSrs({ dataDir: tempDir });
  });

  it('gradeCard throws when card does not exist', () => {
    assert.throws(() => {
      gradeCard(userId, 'vocab', '新しい', 'good');
    }, /not found/);
  });

  it('createCard + gradeCard works for a new word', () => {
    createCard(userId, 'vocab', '新しい', {
      word: '新しい', meaning: 'new', reading: 'あたらしい'
    });
    const result = gradeCard(userId, 'vocab', '新しい', 'good');
    assert.ok(result.state !== undefined, 'should return card with state');
  });

  it('createCard is idempotent — does not overwrite existing card', () => {
    createCard(userId, 'vocab', '古い', {
      word: '古い', meaning: 'old', reading: 'ふるい'
    });
    gradeCard(userId, 'vocab', '古い', 'good');
    // Create again — should not reset the card
    createCard(userId, 'vocab', '古い', {
      word: '古い', meaning: 'old', reading: 'ふるい'
    });
    const cards = getDeckCards(userId, 'vocab');
    const card = cards.find(c => c.id === '古い');
    assert.ok(card.reps > 0, 'card should retain review history');
  });
});

function buildKnownWordsApp({
  userId,
  meta = { fusionCores: 0 },
  random = () => 0
} = {}) {
  let saveCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId };
    req.gameManager = {
      getMeta: () => meta
    };
    req.saveGame = () => {
      saveCalls += 1;
    };
    req.getEnrichedGameState = () => ({ meta: { ...meta } });
    req.getSettings = () => ({ dailyWordLimit: 10 });
    next();
  });
  app.use('/known-words', createKnownWordsRoutes({
    reviewFusionCoreRandom: random
  }));
  return { app, meta, getSaveCalls: () => saveCalls };
}

describe('known-words review — Fusion Core drops', () => {
  let tempDir;
  const userId = 'test-user-review-drops';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'srs-drop-test-'));
    configureSrs({ dataDir: tempDir });
  });

  it('awards a Fusion Core for an eligible good review when the roll succeeds', async () => {
    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '知る', grade: 'good' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.fusionCoreDrop, {
      awarded: true,
      fusionCores: 1,
      message: 'Obtained 1x Fusion Core!'
    });
    assert.equal(res.body.state.meta.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
    assert.equal(getSaveCalls(), 1);
  });

  it('does not award for a first-time again review even when the roll succeeds', async () => {
    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '忘れる', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(res.body.state, undefined);
    assert.equal(meta.fusionCores, 0);
    assert.equal(getSaveCalls(), 0);
  });

  it('awards for an again review when the card was already reviewed before the request', async () => {
    createCard(userId, 'vocab', '古い', { word: '古い' });
    const reviewedCard = gradeCard(userId, 'vocab', '古い', 'good');
    assert.equal(reviewedCard.state === State.Learning || reviewedCard.state === State.Review, true);

    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '古い', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop.awarded, true);
    assert.equal(res.body.fusionCoreDrop.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
    assert.equal(getSaveCalls(), 1);
  });

  it('does not award for an again review when the existing card is still New', async () => {
    createCard(userId, 'vocab', '新しい', { word: '新しい' });

    const { app, meta } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '新しい', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(meta.fusionCores, 0);
  });

  it('does not award discovery reviews', async () => {
    const { app, meta } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '発見', grade: 'good', isDiscovery: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(meta.fusionCores, 0);
  });
});
