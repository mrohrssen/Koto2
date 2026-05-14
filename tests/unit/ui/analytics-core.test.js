import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_EVENTS,
  MILESTONE_ORDER,
  buildFirebaseConfig,
  isAnalyticsEnabled,
  sanitizeParams,
  createMilestoneStore,
  extractGameContext,
  extractRunEndContext,
  normalizeCombatOutcome,
  nextFurthestStep
} from '../../../public/js/analytics-core.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); }
  };
}

describe('analytics core helpers', () => {
  let env;

  beforeEach(() => {
    env = {
      VITE_FIREBASE_ANALYTICS_ENABLED: 'true',
      VITE_FIREBASE_API_KEY: 'api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'koto-prod',
      VITE_FIREBASE_APP_ID: 'app-id',
      VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST'
    };
  });

  it('enables analytics only when flag and required Firebase config are present', () => {
    assert.equal(isAnalyticsEnabled(env), true);
    assert.deepEqual(buildFirebaseConfig(env), {
      apiKey: 'api-key',
      authDomain: 'example.firebaseapp.com',
      projectId: 'koto-prod',
      appId: 'app-id',
      measurementId: 'G-TEST'
    });

    assert.equal(isAnalyticsEnabled({ ...env, VITE_FIREBASE_ANALYTICS_ENABLED: 'false' }), false);
    assert.equal(isAnalyticsEnabled({ ...env, VITE_FIREBASE_API_KEY: '' }), false);
  });

  it('sanitizes params to approved primitive keys only', () => {
    assert.deepEqual(sanitizeParams({
      area_id: 'hajimari-no-hiroba',
      room_number: 1,
      is_boss: false,
      username: 'michia',
      dialogue: 'こんにちは',
      nested: { value: true },
      long_value: 'x'.repeat(120)
    }), {
      area_id: 'hajimari-no-hiroba',
      room_number: 1,
      is_boss: false
    });
  });

  it('dedupes milestones per analytics id', () => {
    const storage = createMemoryStorage();
    const store = createMilestoneStore(storage, 'ka_abc');

    assert.equal(store.has('koto_first_run_started'), false);
    store.mark('koto_first_run_started');
    assert.equal(store.has('koto_first_run_started'), true);

    const reloaded = createMilestoneStore(storage, 'ka_abc');
    assert.equal(reloaded.has('koto_first_run_started'), true);
  });

  it('extracts only safe game context fields', () => {
    const context = extractGameContext({
      phase: 'combat',
      run: {
        currentArea: { id: 'hajimari-no-hiroba', name: 'はじまりの広場' },
        currentRoom: 2,
        roomsExplored: 3,
        stats: { startTime: Date.now() - 5000 },
      },
      combat: {
        isBoss: true,
        turnCount: 4
      },
      meta: {
        tutorialStep: 2,
        lifetimeStats: { totalRuns: 1 },
        levels: { highestUnlocked: 3 }
      },
      player: { name: 'Hacker' }
    });

    assert.deepEqual(context, {
      phase: 'combat',
      area_id: 'hajimari-no-hiroba',
      room_number: 3,
      rooms_reached: 3,
      is_boss: true,
      turn_count: 4,
      tutorial_step: 2,
      run_number: 1,
      highest_area: 3
    });
  });

  it('keeps furthest step monotonic', () => {
    assert.equal(nextFurthestStep(null, 'first_run_started'), 'first_run_started');
    assert.equal(nextFurthestStep('first_combat_started', 'first_room_seen'), 'first_combat_started');
    assert.equal(nextFurthestStep('first_room_seen', 'first_combat_started'), 'first_combat_started');
    assert.ok(MILESTONE_ORDER.includes('first_run_ended'));
    assert.equal(ANALYTICS_EVENTS.firstRunStarted, 'koto_first_run_started');
  });

  it('extracts safe run-end context with duration seconds', () => {
    const startedAt = Date.now() - 12_500;
    assert.deepEqual(extractRunEndContext({
      run: {
        currentArea: { id: 'hajimari-no-hiroba' },
        roomsExplored: 4,
        stats: { startTime: startedAt, endTime: startedAt + 12_500 }
      }
    }, 'victory'), {
      outcome: 'victory',
      area_id: 'hajimari-no-hiroba',
      rooms_reached: 4,
      duration_sec: 13
    });
  });

  it('normalizes combat outcomes from server result shape', () => {
    assert.equal(normalizeCombatOutcome({ victory: true, befriend: { success: true } }), 'befriend');
    assert.equal(normalizeCombatOutcome({ victory: true }), 'victory');
    assert.equal(normalizeCombatOutcome({ victory: false, combatEnded: true }), 'defeat');
    assert.equal(normalizeCombatOutcome({}), 'unknown');
  });
});
