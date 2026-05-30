import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createKanjiKombatRoutes from '../../../src/routes/game/kanji-kombat.js';

function appWithManager(manager) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'route-user' };
    req.gameManager = manager;
    req.saveGame = () => { manager.saved = true; };
    req.getEnrichedGameState = () => ({ run: manager.run, combat: manager.combat });
    next();
  });
  app.use('/kanji-kombat', createKanjiKombatRoutes());
  return app;
}

describe('Kanji Kombat routes', () => {
  it('starts a run for a selected creature', async () => {
    const manager = {
      meta: { creatureCollection: ['hi'] },
      kanjiKombatService: {
        getAvailability: () => ({ available: true }),
        startRunWithCreatureId: creatureId => ({ started: true, creatureId }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/start')
      .send({ creatureId: 'hi' });
    assert.equal(res.status, 200);
    assert.equal(res.body.started, true);
    assert.equal(res.body.creatureId, 'hi');
    assert.equal(manager.saved, true);
  });

  it('submits an intro choice', async () => {
    const manager = {
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => ({ cardId, choice }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ cardId: 'hiragana:あ', choice: 'known' });
    assert.equal(res.status, 200);
    assert.equal(res.body.cardId, 'hiragana:あ');
    assert.equal(res.body.choice, 'known');
  });

  it('submits a quiz answer', async () => {
    const manager = {
      submitKanjiKombatAnswer: answerId => ({ answerId, actionType: 'kanjiKombat' }),
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/answer')
      .send({ answerId: 'answer-1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.actionType, 'kanjiKombat');
  });
});
