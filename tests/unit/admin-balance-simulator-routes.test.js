import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import createAdminRoutes from '../../src/routes/admin.js';

async function withServer({ secret = 'test-secret', manager }, testFn) {
  process.env.ADMIN_SECRET = secret;
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRoutes({ dataDir: process.cwd(), balanceManager: manager }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await testFn(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.ADMIN_SECRET;
  }
}

function fakeManager() {
  let active = null;
  return {
    start(input) {
      if (active?.status === 'running') throw new Error('A balance simulation is already running');
      active = {
        jobId: 'job-1',
        status: 'running',
        battleCount: input.battleCount,
        creatureLevel: input.creatureLevel,
        completedBattles: 0,
        draws: 0,
        results: []
      };
      return active;
    },
    current() {
      return active;
    },
    cancel() {
      if (!active) throw new Error('No active balance simulation');
      active = { ...active, status: 'cancelled' };
      return active;
    }
  };
}

describe('admin balance simulator routes', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
  });

  it('requires admin auth', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/current`);

      assert.equal(res.status, 403);
    });
  });

  it('starts a balance simulation with valid input', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 1000, creatureLevel: 40 })
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'running');
      assert.equal(body.battleCount, 1000);
      assert.equal(body.creatureLevel, 40);
    });
  });

  it('rejects invalid start input', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 0, creatureLevel: 40 })
      });

      assert.equal(res.status, 400);
    });
  });

  it('returns current job progress', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 10, creatureLevel: 5 })
      });

      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/current`, {
        headers: { 'x-admin-secret': 'test-secret' }
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.jobId, 'job-1');
    });
  });

  it('cancels an active job', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 10, creatureLevel: 5 })
      });

      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/cancel`, {
        method: 'POST',
        headers: { 'x-admin-secret': 'test-secret' }
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'cancelled');
    });
  });
});
