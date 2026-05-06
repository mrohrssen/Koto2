import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../../db/store.js';
import createBalanceRoutes from '../../routes/balance.js';

async function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function withServers(handler, testFn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'koto-balance-routes-'));
  const store = createStore(join(tmpDir, 'test.db'));

  const game = express();
  game.use(express.json());
  game.use(handler);
  const gameServer = await listen(game);
  const gameUrl = `http://127.0.0.1:${gameServer.address().port}`;

  const sim = express();
  sim.use(express.json());
  sim.use('/api/balance', createBalanceRoutes(store, gameUrl, 'secret'));
  const simServer = await listen(sim);
  const simUrl = `http://127.0.0.1:${simServer.address().port}`;

  try {
    await testFn({ simUrl, store });
  } finally {
    await new Promise(resolve => simServer.close(resolve));
    await new Promise(resolve => gameServer.close(resolve));
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('simulator balance routes', () => {
  it('starts a game-server balance job with admin secret', async () => {
    await withServers((req, res) => {
      assert.equal(req.headers['x-admin-secret'], 'secret');
      assert.equal(req.path, '/api/admin/balance-simulations/start');
      res.status(201).json({
        jobId: 'job-start',
        status: 'running',
        battleCount: req.body.battleCount,
        creatureLevel: req.body.creatureLevel,
        completedBattles: 0,
        draws: 0,
        results: []
      });
    }, async ({ simUrl }) => {
      const res = await fetch(`${simUrl}/api/balance/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleCount: 100, creatureLevel: 40 })
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.jobId, 'job-start');
      assert.equal(body.creatureLevel, 40);
    });
  });

  it('mirrors completed current result into SQLite', async () => {
    await withServers((req, res) => {
      res.json({
        jobId: 'job-complete',
        status: 'completed',
        battleCount: 10,
        creatureLevel: 5,
        completedBattles: 10,
        draws: 1,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: []
      });
    }, async ({ simUrl, store }) => {
      const res = await fetch(`${simUrl}/api/balance/current`);

      assert.equal(res.status, 200);
      const rows = store.getBalanceRuns();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].job_id, 'job-complete');
    });
  });

  it('lists mirrored balance runs', async () => {
    await withServers((req, res) => res.json({ status: 'idle', results: [] }), async ({ simUrl, store }) => {
      store.saveBalanceRun({
        jobId: 'saved-job',
        status: 'completed',
        battleCount: 20,
        creatureLevel: 8,
        completedBattles: 20,
        draws: 0,
        results: []
      });

      const res = await fetch(`${simUrl}/api/balance/runs`);

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.length, 1);
      assert.equal(body[0].job_id, 'saved-job');
    });
  });
});
