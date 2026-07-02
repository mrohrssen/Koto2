import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createUserRecord, getKanjiKombatLeaderboard } from '../../../src/auth/users.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import createRunRoutes from '../../../src/routes/game/run.js';

function appWithForfeitSummary({ usersFile, runSummary }) {
  const app = express();
  app.use(express.json());
  app.locals.usersFile = usersFile;
  app.use((req, _res, next) => {
    req.user = { id: 'route-user' };
    req.gameManager = {
      forfeitRun: () => ({ runSummary })
    };
    req.saveGame = () => {};
    req.getEnrichedGameState = () => ({ run: null, combat: null });
    next();
  });
  app.use(createRunRoutes({
    cancelPendingPrefetches() {},
    clearPrefetchCache() {},
  }));
  return app;
}

describe('Kanji Kombat leaderboard recording', () => {
  it('records the reached wave when the end report forfeits the run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-kk-recording-'));
    const usersFile = join(dir, '.jrpg-users.json');
    try {
      setDataDirForTest(dir);
      resetDbForTest();
      await createUserRecord({ id: 'route-user', username: 'me', password: 'secret123' });

      const app = appWithForfeitSummary({
        usersFile,
        runSummary: {
          mode: 'kanjiKombat',
          kanjiKombat: {
            wave: 7,
            wavesCleared: 6,
          }
        }
      });

      const res = await request(app).post('/forfeit').send({ isVictory: false });
      assert.equal(res.status, 200);

      const board = getKanjiKombatLeaderboard('24h', 'route-user');
      assert.equal(board.currentUser.wave, 7);
    } finally {
      resetDbForTest();
      resetDataDirForTest();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
