import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../../db/store.js';
import createResultRoutes from '../../routes/results.js';

async function withResultServer(testFn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'koto-sim-routes-'));
  const store = createStore(join(tmpDir, 'test.db'));
  const app = express();
  app.use(express.json());
  app.use('/api/results', createResultRoutes(store, 'http://example.test', 'secret'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await testFn({ store, baseUrl });
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('result routes', () => {
  it('returns normalized run-log rows', async () => {
    await withResultServer(async ({ store, baseUrl }) => {
      const profileId = store.createProfile('route-profile', {});
      const simId = store.createSimulation(profileId);
      store.logEvent(simId, 1, 1, 1, 'room_entered', { roomType: 'encounter', outcome: 'cleared', rounds: 2 });
      store.logEvent(simId, 1, 1, 9, 'room_entered', { roomType: 'boss', outcome: 'cleared', rounds: 8 });
      store.logEvent(simId, 1, 1, 0, 'run_summary', {
        areaId: 'wild-plains',
        areaName: 'Wild Plains',
        completed: true,
        creaturesBefriended: 1,
        itemsCollected: 2,
        wordsMastered: [{ word: '猫' }],
        furthestRoomReached: 10
      });

      const response = await fetch(`${baseUrl}/api/results/${simId}/run-log`);
      assert.equal(response.status, 200);
      const rows = await response.json();

      assert.equal(rows.length, 1);
      assert.equal(rows[0].areaName, 'Wild Plains');
      assert.equal(rows[0].combatCount, 1);
      assert.equal(rows[0].avgCombatRounds, 2);
      assert.equal(rows[0].maxCombatRounds, 2);
      assert.equal(rows[0].bossCombatRounds, 8);
      assert.equal(rows[0].furthestRoomReached, 10);
      assert.equal(rows[0].wordsMasteredCount, 1);
    });
  });
});
