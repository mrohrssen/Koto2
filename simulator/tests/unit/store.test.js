import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../../db/store.js';

describe('store', () => {
  let store;
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'koto-sim-test-'));
    store = createStore(join(tmpDir, 'test.db'));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('profiles', () => {
    it('creates and retrieves a profile', () => {
      const config = { totalDays: 30, sessionsPerDay: 2 };
      const id = store.createProfile('test-profile', config);
      assert.ok(id > 0);

      const profile = store.getProfile(id);
      assert.equal(profile.name, 'test-profile');
      assert.deepEqual(profile.config, config);
    });

    it('lists all profiles', () => {
      const profiles = store.getAllProfiles();
      assert.ok(profiles.length >= 1);
    });

    it('updates a profile', () => {
      const id = store.createProfile('updatable', { a: 1 });
      store.updateProfile(id, 'updated-name', { a: 2 });
      const profile = store.getProfile(id);
      assert.equal(profile.name, 'updated-name');
      assert.deepEqual(profile.config, { a: 2 });
    });

    it('deletes a profile and cascades', () => {
      const id = store.createProfile('deletable', { x: 1 });
      const simId = store.createSimulation(id);
      store.logEvent(simId, 1, 1, 0, 'test_event', { foo: 'bar' });
      store.saveDailySnapshot(simId, 1, { total_known_words: 5 });

      store.deleteProfile(id);
      assert.equal(store.getProfile(id), null);
      assert.equal(store.getSimulation(simId), null);
      assert.deepEqual(store.getEvents(simId), []);
      assert.deepEqual(store.getDailySnapshots(simId), []);
    });
  });

  describe('simulations', () => {
    it('creates a simulation for a profile', () => {
      const profileId = store.createProfile('sim-test', { days: 10 });
      const simId = store.createSimulation(profileId);
      assert.ok(simId > 0);

      const sim = store.getSimulation(simId);
      assert.equal(sim.profile_id, profileId);
      assert.equal(sim.status, 'pending');
      assert.equal(sim.current_day, 0);
    });

    it('updates simulation fields', () => {
      const profileId = store.createProfile('sim-update', { days: 5 });
      const simId = store.createSimulation(profileId);

      store.updateSimulation(simId, {
        status: 'running',
        current_day: 3,
        test_user_id: 'user-123',
        jwt_token: 'token-abc',
        invalid_field: 'ignored'
      });

      const sim = store.getSimulation(simId);
      assert.equal(sim.status, 'running');
      assert.equal(sim.current_day, 3);
      assert.equal(sim.test_user_id, 'user-123');
      assert.equal(sim.jwt_token, 'token-abc');
    });

    it('lists simulations for a profile', () => {
      const profileId = store.createProfile('sim-list', { days: 1 });
      store.createSimulation(profileId);
      store.createSimulation(profileId);

      const sims = store.getSimulationsForProfile(profileId);
      assert.equal(sims.length, 2);
    });
  });

  describe('events', () => {
    it('logs and retrieves events', () => {
      const profileId = store.createProfile('event-test', {});
      const simId = store.createSimulation(profileId);

      store.logEvent(simId, 1, 1, 0, 'combat_start', { enemy: 'slime' });
      store.logEvent(simId, 1, 1, 1, 'word_learned', { word: 'neko' });
      store.logEvent(simId, 2, 1, 0, 'combat_start', { enemy: 'dragon' });

      const allEvents = store.getEvents(simId);
      assert.equal(allEvents.length, 3);
      assert.deepEqual(allEvents[0].data, { enemy: 'slime' });
    });

    it('filters events by day', () => {
      const profileId = store.createProfile('event-filter-day', {});
      const simId = store.createSimulation(profileId);

      store.logEvent(simId, 1, 1, 0, 'combat_start', { enemy: 'a' });
      store.logEvent(simId, 2, 1, 0, 'combat_start', { enemy: 'b' });

      const day1Events = store.getEvents(simId, { day: 1 });
      assert.equal(day1Events.length, 1);
      assert.deepEqual(day1Events[0].data, { enemy: 'a' });
    });

    it('filters events by type', () => {
      const profileId = store.createProfile('event-filter-type', {});
      const simId = store.createSimulation(profileId);

      store.logEvent(simId, 1, 1, 0, 'combat_start', {});
      store.logEvent(simId, 1, 1, 0, 'word_learned', {});
      store.logEvent(simId, 1, 1, 0, 'combat_start', {});

      const combatEvents = store.getEvents(simId, { event_type: 'combat_start' });
      assert.equal(combatEvents.length, 2);
    });

    it('respects limit filter', () => {
      const profileId = store.createProfile('event-limit', {});
      const simId = store.createSimulation(profileId);

      store.logEvent(simId, 1, 1, 0, 'a', {});
      store.logEvent(simId, 1, 1, 0, 'b', {});
      store.logEvent(simId, 1, 1, 0, 'c', {});

      const limited = store.getEvents(simId, { limit: 2 });
      assert.equal(limited.length, 2);
    });

    it('counts events by type', () => {
      const profileId = store.createProfile('event-counts', {});
      const simId = store.createSimulation(profileId);

      store.logEvent(simId, 1, 1, 0, 'combat_start', {});
      store.logEvent(simId, 1, 1, 0, 'combat_start', {});
      store.logEvent(simId, 1, 1, 0, 'word_learned', {});

      const counts = store.getEventCounts(simId);
      assert.equal(counts['combat_start'], 2);
      assert.equal(counts['word_learned'], 1);
    });
  });

  describe('snapshots', () => {
    it('saves and retrieves daily snapshots', () => {
      const profileId = store.createProfile('snap-test', {});
      const simId = store.createSimulation(profileId);

      store.saveDailySnapshot(simId, 1, {
        total_known_words: 10,
        new_words_today: 5,
        words_exposed_today: 8,
        runs_completed: 2,
        fusions_performed: 3,
        snapshot_data: { details: 'extra info' }
      });

      store.saveDailySnapshot(simId, 2, {
        total_known_words: 15,
        new_words_today: 5
      });

      const snapshots = store.getDailySnapshots(simId);
      assert.equal(snapshots.length, 2);
      assert.equal(snapshots[0].day, 1);
      assert.equal(snapshots[0].total_known_words, 10);
      assert.equal(snapshots[0].new_words_today, 5);
      assert.equal(snapshots[0].fusions_performed, 3);
      assert.deepEqual(snapshots[0].snapshot_data, { details: 'extra info' });
      assert.equal(snapshots[1].day, 2);
      assert.equal(snapshots[1].total_known_words, 15);
      assert.equal(snapshots[1].fusions_performed, 0);
    });

    it('adds fusions_performed to existing snapshot tables', () => {
      const dbPath = join(tmpDir, 'legacy-snapshot.db');
      const legacyDb = new Database(dbPath);
      legacyDb.exec(`
        CREATE TABLE profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          config TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE simulations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL REFERENCES profiles(id),
          status TEXT NOT NULL DEFAULT 'pending',
          test_user_id TEXT,
          jwt_token TEXT,
          current_day INTEGER DEFAULT 0,
          current_run INTEGER DEFAULT 0,
          current_room INTEGER DEFAULT 0,
          started_at TEXT,
          completed_at TEXT,
          error_message TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE daily_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          simulation_id INTEGER NOT NULL REFERENCES simulations(id),
          day INTEGER NOT NULL,
          total_known_words INTEGER DEFAULT 0,
          new_words_today INTEGER DEFAULT 0,
          words_exposed_today INTEGER DEFAULT 0,
          dialogue_lines_encountered INTEGER DEFAULT 0,
          runs_completed INTEGER DEFAULT 0,
          runs_wiped INTEGER DEFAULT 0,
          rooms_explored INTEGER DEFAULT 0,
          speed_reviews_completed INTEGER DEFAULT 0,
          unknown_words_in_dialogue INTEGER DEFAULT 0,
          snapshot_data TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(simulation_id, day)
        );
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          simulation_id INTEGER NOT NULL REFERENCES simulations(id),
          day INTEGER NOT NULL,
          run INTEGER NOT NULL,
          room INTEGER,
          event_type TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      legacyDb.close();

      const migratedStore = createStore(dbPath);
      migratedStore.close();

      const inspectionDb = new Database(dbPath);
      const columns = inspectionDb.prepare('PRAGMA table_info(daily_snapshots)').all();
      inspectionDb.close();

      assert.ok(columns.some(column => column.name === 'fusions_performed'));
    });

    it('replaces snapshot on same day (INSERT OR REPLACE)', () => {
      const profileId = store.createProfile('snap-replace', {});
      const simId = store.createSimulation(profileId);

      store.saveDailySnapshot(simId, 1, { total_known_words: 5 });
      store.saveDailySnapshot(simId, 1, { total_known_words: 10 });

      const snapshots = store.getDailySnapshots(simId);
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].total_known_words, 10);
    });
  });

  describe('comparison', () => {
    it('returns comparison data for multiple simulations', () => {
      const p1 = store.createProfile('compare-1', {});
      const p2 = store.createProfile('compare-2', {});
      const s1 = store.createSimulation(p1);
      const s2 = store.createSimulation(p2);

      store.saveDailySnapshot(s1, 1, { total_known_words: 10 });
      store.saveDailySnapshot(s2, 1, { total_known_words: 20 });

      const data = store.getComparisonData([s1, s2]);
      assert.equal(data.length, 2);
      assert.ok(data.some(d => d.profile_name === 'compare-1'));
      assert.ok(data.some(d => d.profile_name === 'compare-2'));
    });

    it('returns empty array for empty simIds', () => {
      assert.deepEqual(store.getComparisonData([]), []);
    });
  });

  describe('balance runs', () => {
    it('saves and retrieves completed balance runs as aggregate JSON', () => {
      const result = {
        jobId: 'balance-test-1',
        status: 'completed',
        battleCount: 1000,
        creatureLevel: 40,
        completedBattles: 1000,
        draws: 3,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: [
          { creatureId: 'hi', nameEn: 'Fire', rarity: 'common', appearances: 12, wins: 8, losses: 4, winRate: 0.6667, lossRate: 0.3333 }
        ]
      };

      const id = store.saveBalanceRun(result);
      assert.ok(id > 0);

      const rows = store.getBalanceRuns();
      const saved = rows.find(row => row.job_id === 'balance-test-1');

      assert.ok(saved);
      assert.equal(saved.battle_count, 1000);
      assert.equal(saved.creature_level, 40);
      assert.equal(saved.result_data.jobId, 'balance-test-1');
      assert.equal(saved.result_data.results.length, 1);
    });

    it('upserts balance runs by job id', () => {
      store.saveBalanceRun({
        jobId: 'balance-upsert',
        status: 'completed',
        battleCount: 10,
        creatureLevel: 5,
        completedBattles: 10,
        draws: 0,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: []
      });
      store.saveBalanceRun({
        jobId: 'balance-upsert',
        status: 'completed',
        battleCount: 20,
        creatureLevel: 5,
        completedBattles: 20,
        draws: 1,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:02:00.000Z',
        results: []
      });

      const rows = store.getBalanceRuns().filter(row => row.job_id === 'balance-upsert');

      assert.equal(rows.length, 1);
      assert.equal(rows[0].battle_count, 20);
      assert.equal(rows[0].draws, 1);
    });
  });

});
