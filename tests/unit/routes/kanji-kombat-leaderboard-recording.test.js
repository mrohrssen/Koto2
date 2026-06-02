import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadUsers, saveUsers } from '../../../src/auth/users.js';
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
      saveUsers({
        users: [{ id: 'route-user', username: 'me', passwordHash: 'hash' }],
        inviteCodes: []
      }, usersFile);

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

      const user = loadUsers(usersFile).users[0];
      assert.equal(user.kanjiKombatRuns.length, 1);
      assert.equal(user.kanjiKombatRuns[0].wave, 7);
      assert.equal(user.kanjiKombatRuns[0].wavesCleared, 6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
