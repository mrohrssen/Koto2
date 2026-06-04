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
    req.saveGame = () => {
      manager.saved = true;
      manager.saveCalls = (manager.saveCalls || 0) + 1;
    };
    req.getEnrichedGameState = () => ({ run: manager.run, combat: manager.combat });
    next();
  });
  app.use('/kanji-kombat', createKanjiKombatRoutes());
  return app;
}

function actionId(suffix) {
  return `kkchoice_m0_${suffix}`;
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

  it('submits onboarding answers and saves game state', async () => {
    const manager = {
      kanjiKombatService: {
        submitOnboarding: answers => ({ onboarding: { completed: true, ...answers } }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/onboarding')
      .send({ knowsHiragana: true, knowsKatakana: false });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.onboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    });
    assert.equal(manager.saved, true);
  });

  it('rejects onboarding answers unless both values are booleans', async () => {
    const manager = {
      kanjiKombatService: {
        submitOnboarding: () => {
          throw new Error('submitOnboarding should not be called');
        },
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/onboarding')
      .send({ knowsHiragana: 'true', knowsKatakana: false });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'knowsHiragana and knowsKatakana booleans required');
    assert.equal(manager.saved, undefined);
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

  it('returns 400 for invalid /intro payload without actionId', async () => {
    const manager = {
      kanjiKombatService: {
        submitIntroChoice: () => {
          throw new Error('submitIntroChoice should not be called');
        },
      },
    };

    const res = await request(appWithManager(manager)).post('/kanji-kombat/intro').send({ choice: 'known' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'cardId and choice (known|unknown) required');
    assert.equal(manager.saved, undefined);
    assert.equal(manager.saveCalls, undefined);
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

  it('returns 400 for invalid /completion-choice payload without actionId', async () => {
    const manager = {
      kanjiKombatService: {
        resolveCompletionChoice: () => {
          throw new Error('resolveCompletionChoice should not be called');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ keepGoing: 'true' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'keepGoing boolean required');
    assert.equal(manager.saved, undefined);
    assert.equal(manager.saveCalls, undefined);
  });

  it('wraps intro choices with accepted optimistic status when actionId is present', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat' },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => ({ cardId, choice, introResolved: true }),
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ actionId: actionId('introok'), cardId: 'hiragana:a', choice: 'known' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('introok'));
    assert.equal(res.body.actionType, 'kanjiKombat.intro');
    assert.equal(res.body.cardId, 'hiragana:a');
    assert.equal(res.body.choice, 'known');
    assert.equal(res.body.introResolved, true);
    assert.deepEqual(res.body.state, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saveCalls, 1);
  });

  it('duplicate intro actionId replays without re-submitting the intro choice', async () => {
    let submitCalls = 0;
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => {
          submitCalls += 1;
          return { cardId, choice, submitCalls };
        },
      },
    };
    const body = { actionId: actionId('introdupe'), cardId: 'katakana:ka', choice: 'unknown' };

    await request(appWithManager(manager)).post('/kanji-kombat/intro').send(body);
    const duplicate = await request(appWithManager(manager)).post('/kanji-kombat/intro').send(body);

    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.status, 'accepted');
    assert.equal(duplicate.body.actionType, 'kanjiKombat.intro');
    assert.equal(duplicate.body.submitCalls, 1);
    assert.equal(submitCalls, 1);
    assert.equal(manager.saveCalls, 1);
  });

  it('optimistic intro errors return corrected authoritative state', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat', kanjiKombat: { pendingIntro: { cardId: 'hiragana:a' } } },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        submitIntroChoice: () => {
          throw new Error('Kanji Kombat intro card mismatch');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ actionId: actionId('introbad'), cardId: 'hiragana:i', choice: 'known' });

    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('introbad'));
    assert.equal(res.body.reason, 'Kanji Kombat intro card mismatch');
    assert.deepEqual(res.body.authoritativeState, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saved, undefined);
  });

  it('wraps completion choices with accepted optimistic status when actionId is present', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat' },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        resolveCompletionChoice: keepGoing => ({ keepGoing, actionType: 'kanjiKombat', completionChoicePending: false }),
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ actionId: actionId('finishok'), keepGoing: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('finishok'));
    assert.equal(res.body.actionType, 'kanjiKombat.completionChoice');
    assert.equal(res.body.keepGoing, true);
    assert.equal(res.body.completionChoicePending, false);
    assert.deepEqual(res.body.state, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saveCalls, 1);
  });

  it('duplicate completion-choice actionId replays without resolving twice', async () => {
    let resolveCalls = 0;
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        resolveCompletionChoice: keepGoing => {
          resolveCalls += 1;
          return { keepGoing, actionType: 'kanjiKombat', resolveCalls };
        },
      },
    };
    const body = { actionId: actionId('finishdupe'), keepGoing: false };

    await request(appWithManager(manager)).post('/kanji-kombat/completion-choice').send(body);
    const duplicate = await request(appWithManager(manager)).post('/kanji-kombat/completion-choice').send(body);

    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.status, 'accepted');
    assert.equal(duplicate.body.actionType, 'kanjiKombat.completionChoice');
    assert.equal(duplicate.body.resolveCalls, 1);
    assert.equal(resolveCalls, 1);
    assert.equal(manager.saveCalls, 1);
  });

  it('optimistic completion-choice errors return corrected authoritative state', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat', kanjiKombat: { completionChoicePending: false } },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        resolveCompletionChoice: () => {
          throw new Error('No Kanji Kombat completion choice is pending');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ actionId: actionId('finishbad'), keepGoing: false });

    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('finishbad'));
    assert.equal(res.body.reason, 'No Kanji Kombat completion choice is pending');
    assert.deepEqual(res.body.authoritativeState, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saved, undefined);
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
