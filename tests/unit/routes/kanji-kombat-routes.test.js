import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveUsers } from '../../../src/auth/users.js';
import createKanjiKombatRoutes from '../../../src/routes/game/kanji-kombat.js';

function appWithManager(manager, { usersFile = null } = {}) {
  const app = express();
  app.use(express.json());
  if (usersFile) app.locals.usersFile = usersFile;
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

  it('submits an optimistic quiz answer envelope to the verifier', async () => {
    const manager = {
      kanjiKombatService: {
        verifyAndCommitOptimisticAnswer: envelope => ({
          status: 'accepted',
          actionType: 'kanjiKombat',
          answerId: envelope.payload.answerId,
        }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/answer')
      .send({
        actionId: 'act_kanji_route',
        actionType: 'kanjiKombat.answer',
        combatId: 'cmb_route',
        stateVersion: 0,
        seed: 'route_seed',
        predictedHash: 'abc123',
        payload: {
          answerId: 'answer-1',
          correct: true,
          predictionMode: 'shared-kanji-kombat-v1',
        },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.answerId, 'answer-1');
    assert.equal(manager.saved, true);
  });

  it('submits a completion choice', async () => {
    const manager = {
      kanjiKombatService: {
        resolveCompletionChoice: keepGoing => ({ keepGoing, actionType: 'kanjiKombat' }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ keepGoing: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.actionType, 'kanjiKombat');
    assert.equal(res.body.keepGoing, true);
    assert.equal(manager.saved, true);
  });

  it('returns Kanji Kombat leaderboard data for 24h and weekly periods', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-kk-leaderboard-route-'));
    const usersFile = join(dir, '.jrpg-users.json');
    const now = Date.now();
    try {
      saveUsers({
        users: [
          {
            id: 'route-user',
            username: 'me',
            passwordHash: 'hash',
            kanjiKombatRuns: [{ ts: now - 60 * 60 * 1000, wave: 4, wavesCleared: 3 }]
          },
          {
            id: 'u_other',
            username: 'other',
            passwordHash: 'hash',
            kanjiKombatRuns: [{ ts: now - 2 * 60 * 60 * 1000, wave: 6, wavesCleared: 5 }]
          }
        ],
        inviteCodes: []
      }, usersFile);

      const manager = { kanjiKombatService: { getAvailability: () => ({ available: true }) } };
      const daily = await request(appWithManager(manager, { usersFile }))
        .get('/kanji-kombat/leaderboard?period=24h');
      assert.equal(daily.status, 200);
      assert.equal(daily.body.period, '24h');
      assert.deepEqual(daily.body.entries, [
        { rank: 1, username: 'other', wave: 6 },
        { rank: 2, username: 'me', wave: 4 }
      ]);
      assert.deepEqual(daily.body.currentUser, { rank: 2, wave: 4 });

      const weekly = await request(appWithManager(manager, { usersFile }))
        .get('/kanji-kombat/leaderboard?period=weekly');
      assert.equal(weekly.status, 200);
      assert.equal(weekly.body.period, 'weekly');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('defaults invalid Kanji Kombat leaderboard periods to 24h', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-kk-leaderboard-period-'));
    const usersFile = join(dir, '.jrpg-users.json');
    try {
      saveUsers({
        users: [{ id: 'route-user', username: 'me', passwordHash: 'hash', kanjiKombatRuns: [] }],
        inviteCodes: []
      }, usersFile);

      const manager = { kanjiKombatService: { getAvailability: () => ({ available: true }) } };
      const res = await request(appWithManager(manager, { usersFile }))
        .get('/kanji-kombat/leaderboard?period=month');
      assert.equal(res.status, 200);
      assert.equal(res.body.period, '24h');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
