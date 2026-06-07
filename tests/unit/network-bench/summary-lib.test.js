import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateProfile,
  aggregateRun,
  classifyDelayBuckets,
  percentile,
  rankSlowRequests,
  summarizeCategories,
  summarizeLogLines,
} from '../../../scripts/network-bench/summary-lib.mjs';

test('percentile uses nearest-rank values and returns 0 for empty input', () => {
  const values = [100, 200, 300, 400];

  assert.equal(percentile(values, 0.5), 200);
  assert.equal(percentile(values, 0.95), 400);
  assert.equal(percentile([], 0.95), 0);
});

test('summarizeCategories groups records and counts failures', () => {
  const summary = summarizeCategories([
    { category: 'api', durationMs: 100, status: 200 },
    { category: 'api', durationMs: 300, status: 200, injectedFailure: true },
    { category: 'api', durationMs: 500, status: 503 },
    { category: 'image', durationMs: 80, status: 200 },
    { category: 'image', durationMs: 120, status: 304 },
  ]);

  assert.deepEqual(summary, {
    api: {
      count: 3,
      failures: 2,
      p50Ms: 300,
      p95Ms: 500,
      maxMs: 500,
    },
    image: {
      count: 2,
      failures: 0,
      p50Ms: 80,
      p95Ms: 120,
      maxMs: 120,
    },
  });
});

test('rankSlowRequests sorts requests by duration descending and honors limit', () => {
  const requests = rankSlowRequests([
    { method: 'GET', path: '/fast', category: 'api', status: 200, durationMs: 100 },
    { method: 'POST', path: '/slowest', category: 'api', status: 200, durationMs: 900, injectedDelayMs: 500 },
    { method: 'GET', path: '/middle', category: 'image', status: 200, durationMs: 400, injectedFailure: true },
  ], 2);

  assert.deepEqual(requests, [
    {
      method: 'POST',
      path: '/slowest',
      category: 'api',
      status: 200,
      durationMs: 900,
      injectedDelayMs: 500,
      injectedFailure: false,
    },
    {
      method: 'GET',
      path: '/middle',
      category: 'image',
      status: 200,
      durationMs: 400,
      injectedDelayMs: 0,
      injectedFailure: true,
    },
  ]);
});

test('summarizeCategories normalizes missing, null, and string duration and status fields', () => {
  const summary = summarizeCategories([
    { category: 'api', durationMs: '250', status: '200' },
    { category: 'api', durationMs: null, status: 200 },
    { category: 'api', status: 200 },
    { category: 'api', durationMs: 'bad-number', status: 200 },
    { category: 'image', durationMs: '120' },
  ]);

  assert.deepEqual(summary, {
    api: {
      count: 4,
      failures: 0,
      p50Ms: 0,
      p95Ms: 250,
      maxMs: 250,
    },
    image: {
      count: 1,
      failures: 1,
      p50Ms: 120,
      p95Ms: 120,
      maxMs: 120,
    },
  });
});

test('rankSlowRequests normalizes raw numeric and injected fields', () => {
  const requests = rankSlowRequests([
    { method: 'GET', path: '/missing-duration', category: 'api', status: 200 },
    { method: 'GET', path: '/string-duration', category: 'api', status: '503', durationMs: '300', injectedDelayMs: '40' },
    { method: 'GET', path: '/null-duration', category: 'api', status: null, durationMs: null, injectedFailure: 'truthy' },
  ]);

  assert.deepEqual(requests, [
    {
      method: 'GET',
      path: '/string-duration',
      category: 'api',
      status: 503,
      durationMs: 300,
      injectedDelayMs: 40,
      injectedFailure: false,
    },
    {
      method: 'GET',
      path: '/missing-duration',
      category: 'api',
      status: 200,
      durationMs: 0,
      injectedDelayMs: 0,
      injectedFailure: false,
    },
    {
      method: 'GET',
      path: '/null-duration',
      category: 'api',
      status: 0,
      durationMs: 0,
      injectedDelayMs: 0,
      injectedFailure: true,
    },
  ]);
});

test('summarizeLogLines extracts known timing and connection logs', () => {
  const lines = [
    'debug noise',
    '[API Timing] GET /api/game/state 123ms',
    '[Combat Timing] resolve turn 456ms',
    'Connection lost while polling',
    'socket retrying in 1000ms',
  ];

  assert.deepEqual(summarizeLogLines(lines), {
    apiTiming: ['[API Timing] GET /api/game/state 123ms'],
    combatTiming: ['[Combat Timing] resolve turn 456ms'],
    connection: ['Connection lost while polling', 'socket retrying in 1000ms'],
    combat: {
      requestCount: 0,
      turnCount: 0,
      serverCount: 0,
      failedTurns: 0,
      outcomes: {},
      maxRequestMs: 0,
      maxTurnTotalMs: 0,
      maxServerTotalMs: 0,
      maxServerResolveMs: 0,
      maxServerSaveMs: 0,
    },
  });
});

test('summarizeLogLines extracts structured combat timing buckets', () => {
  const summary = summarizeLogLines([
    '[Combat Timing] request {"actionType":"attack","requestMs":1320,"indicatorShown":true,"failed":false}',
    '[Combat Timing] turn {"actionType":"attack","requestMs":1320,"animationMs":650,"totalMs":1970,"outcome":"optimistic_verified","failed":false}',
    '[Combat Timing] server {"actionType":"attack","statusCode":200,"resolveMs":18,"saveMs":7,"totalMs":25}',
    '[Combat Timing] turn {"actionType":"defend","requestMs":1600,"animationMs":0,"totalMs":1600,"outcome":"recovery_failed","failed":true}',
  ]);

  assert.equal(summary.combatTiming.length, 4);
  assert.equal(summary.combat.requestCount, 1);
  assert.equal(summary.combat.turnCount, 2);
  assert.equal(summary.combat.serverCount, 1);
  assert.equal(summary.combat.failedTurns, 1);
  assert.deepEqual(summary.combat.outcomes, {
    optimistic_verified: 1,
    recovery_failed: 1,
  });
  assert.equal(summary.combat.maxRequestMs, 1600);
  assert.equal(summary.combat.maxTurnTotalMs, 1970);
  assert.equal(summary.combat.maxServerTotalMs, 25);
});

test('classifyDelayBuckets distinguishes combat API and asset pain', () => {
  const records = [
    { path: '/api/game/creature-combat-cycle', category: 'api', durationMs: 1500, status: 200 },
    { path: '/api/game/state', category: 'api', durationMs: 1200, status: 200 },
    { path: '/assets/index.js', category: 'javascript', durationMs: 2300, status: 599, injectedFailure: true },
    { path: '/assets/audio/bgm/battle.mp3', category: 'audio', durationMs: 3100, status: 206 },
  ];
  const logSummary = summarizeLogLines([
    '[Combat Timing] turn {"actionType":"attack","requestMs":1500,"totalMs":1900,"outcome":"optimistic_verified","failed":false}',
    '[Combat Timing] server {"actionType":"attack","totalMs":28}',
  ]);

  const buckets = classifyDelayBuckets(records, logSummary);

  assert.equal(buckets.network_request.count, 2);
  assert.equal(buckets.asset_chunk_media.count, 2);
  assert.equal(buckets.server_resolve_save.maxMs, 28);
  assert.equal(buckets.verification_gap.maxMs, 1500);
});

test('aggregateProfile returns profile counts, summaries, rankings, and app logs', () => {
  const records = [
    { method: 'GET', path: '/api/game/state', category: 'api', status: 200, durationMs: 100 },
    { method: 'POST', path: '/api/game/combat', category: 'api', status: 0, durationMs: 700 },
    { method: 'GET', path: '/assets/sky.webp', category: 'image', status: 200, durationMs: 300 },
  ];
  const logLines = [
    '[API Timing] GET /api/game/state 100ms',
    '[Combat Timing] enemy turn 220ms',
    'Connection lost during combat',
  ];

  assert.deepEqual(aggregateProfile('slow', records, logLines), {
    profile: 'slow',
    requestCount: 3,
    failureCount: 1,
    categories: {
      api: {
        count: 2,
        failures: 1,
        p50Ms: 100,
        p95Ms: 700,
        maxMs: 700,
      },
      image: {
        count: 1,
        failures: 0,
        p50Ms: 300,
        p95Ms: 300,
        maxMs: 300,
      },
    },
    slowestRequests: [
      {
        method: 'POST',
        path: '/api/game/combat',
        category: 'api',
        status: 0,
        durationMs: 700,
        injectedDelayMs: 0,
        injectedFailure: false,
      },
      {
        method: 'GET',
        path: '/assets/sky.webp',
        category: 'image',
        status: 200,
        durationMs: 300,
        injectedDelayMs: 0,
        injectedFailure: false,
      },
      {
        method: 'GET',
        path: '/api/game/state',
        category: 'api',
        status: 200,
        durationMs: 100,
        injectedDelayMs: 0,
        injectedFailure: false,
      },
    ],
    appLog: {
      apiTiming: ['[API Timing] GET /api/game/state 100ms'],
      combatTiming: ['[Combat Timing] enemy turn 220ms'],
      connection: ['Connection lost during combat'],
      combat: {
        requestCount: 0,
        turnCount: 0,
        serverCount: 0,
        failedTurns: 0,
        outcomes: {},
        maxRequestMs: 0,
        maxTurnTotalMs: 0,
        maxServerTotalMs: 0,
        maxServerResolveMs: 0,
        maxServerSaveMs: 0,
      },
    },
    delayBuckets: {
      network_request: { count: 1, maxMs: 100 },
      server_resolve_save: { count: 0, maxMs: 0 },
      verification_gap: { count: 0, maxMs: 0 },
      asset_chunk_media: { count: 1, maxMs: 300 },
      recovery_fetch: { count: 0, maxMs: 0 },
      ui_control_gap: { count: 0, maxMs: 0 },
      unknown: { count: 0, maxMs: 0 },
    },
  });
});

test('aggregateRun preserves profile summaries and emits a parseable generatedAt timestamp', () => {
  const profiles = [
    { profile: 'baseline', requestCount: 1 },
    { profile: 'slow', requestCount: 2 },
  ];

  const summary = aggregateRun(profiles);

  assert.equal(summary.profiles, profiles);
  assert.equal(Number.isNaN(Date.parse(summary.generatedAt)), false);
});
