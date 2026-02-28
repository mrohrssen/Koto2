// tests/integration/discovery-words.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdirSync } from 'fs';

// We need to test the route handler directly since we don't have supertest
// Import the module and mock the dependency

const TEST_CACHE_DIR = '/tmp/test-discovery-words-integration/';
const TEST_USER_ID = 'test-user';

describe('GET /api/game/discovery-words', () => {
  // Mock request/response helpers
  function mockReqRes(query = {}) {
    const req = {
      query,
      gameManager: { run: { active: true } },
      userKeys: { jpdbApiKey: 'test-key' },
      user: { id: TEST_USER_ID }
    };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseBody = data; }
    };
    return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  it('should return discovery words sorted by rank', async () => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}

    // Import route factory
    const { default: createRunRoutes } = await import('../../../src/routes/game/run.js');

    // Import vocab-manager to set up test data
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache(TEST_USER_ID);

    // Set up test cache with "new" words
    const testCache = {
      '飲む': { states: ['new'], reading: 'のむ', meanings: ['to drink'], vid: 2, sid: 0, rank: 50 },
      '食べる': { states: ['new'], reading: 'たべる', meanings: ['to eat'], vid: 1, sid: 0, rank: 100 }
    };
    vm.setTestCache(testCache, TEST_USER_ID);

    // Create routes
    const router = createRunRoutes({
      generateGameNarration: () => Promise.resolve(''),
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {}
    });

    // Find the discovery-words handler
    const layer = router.stack.find(l => l.route && l.route.path === '/discovery-words');
    assert.ok(layer, 'discovery-words route should exist');

    const handler = layer.route.stack[0].handle;

    // Mock request with limit query param
    const { req, res, getStatus, getBody } = mockReqRes({ limit: '2' });

    // Call handler (async)
    await handler(req, res);

    assert.equal(getStatus(), 200);
    assert.ok(getBody(), 'Response body should exist');
    assert.equal(getBody().words.length, 2);
    assert.equal(getBody().words[0].word, '飲む'); // rank 50 first
    assert.equal(getBody().available, true);
  });

  it('should return available: false when no new words', async () => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}

    // Import route factory
    const { default: createRunRoutes } = await import('../../../src/routes/game/run.js');

    // Import vocab-manager to set up test data
    const vm = await import('../../../src/game/vocab-manager.js');
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache(TEST_USER_ID);

    // Set up test cache with NO "new" words
    const testCache = {
      '見る': { states: ['learning'], vid: 3, sid: 0, rank: 30 }
    };
    vm.setTestCache(testCache, TEST_USER_ID);

    // Create routes
    const router = createRunRoutes({
      generateGameNarration: () => Promise.resolve(''),
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {}
    });

    // Find the discovery-words handler
    const layer = router.stack.find(l => l.route && l.route.path === '/discovery-words');
    assert.ok(layer, 'discovery-words route should exist');

    const handler = layer.route.stack[0].handle;

    // Mock request without limit (use default)
    const { req, res, getStatus, getBody } = mockReqRes({});

    // Call handler (async)
    await handler(req, res);

    assert.equal(getStatus(), 200);
    assert.ok(getBody(), 'Response body should exist');
    assert.equal(getBody().words.length, 0);
    assert.equal(getBody().available, false);
  });
});
