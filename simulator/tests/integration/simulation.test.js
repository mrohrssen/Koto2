import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-secret';

describe('simulation integration (requires game server)', { skip: !process.env.RUN_SIM_INTEGRATION }, () => {
  let tmpDir, store;

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sim-int-'));
    const { createStore } = await import('../../db/store.js');
    store = createStore(join(tmpDir, 'test.db'));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs a 1-day simulation with 1 run', async () => {
    const { runSimulation } = await import('../../engine/runner.js');

    const profileId = store.createProfile('Integration Test', {
      durationDays: 1,
      runsPerDay: 1,
      speedReviewAccuracy: 0.8,
      wordDiscoveryAccuracy: 1.0,
      combatSkill: 0.8,
      dailyPlayMinutes: 60,
    });
    const simId = store.createSimulation(profileId);
    const config = store.getProfile(profileId).config;

    let errored = false;
    try {
      await runSimulation(config, store, simId, GAME_SERVER_URL, ADMIN_SECRET);
    } catch {
      errored = true;
    }

    const sim = store.getSimulation(simId);
    assert.ok(['complete', 'errored'].includes(sim.status), `Unexpected status: ${sim.status}`);

    const events = store.getEvents(simId, {});
    assert.ok(events.length > 0, 'Should have logged events');

    const snapshots = store.getDailySnapshots(simId);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].day, 1);

    if (sim.status === 'complete') {
      const crestCycleEvents = events.filter(e => e.event_type === 'crest_cycle_summary');
      assert.ok(crestCycleEvents.length >= 1, 'Should log crest cycle summaries when simulation completes');
      assert.ok(
        snapshots[0].words_exposed_today > 0,
        `Expected completed simulation to record exposures, got ${snapshots[0].words_exposed_today}`
      );
    }

    console.log(`Simulation complete: ${events.length} events, ${snapshots[0].total_known_words} words known`);
  });
});
