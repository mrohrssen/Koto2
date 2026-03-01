import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ROOM_TYPES, generateFloorRooms, getRoomEntryNarration, getRoomActions } from '../../../src/game/rooms.js';
import { GameManager } from '../../../src/game/loop.js';

// ============ ROOM GENERATION ============

describe('Whack-a-Mole Room', () => {
  it('should generate whackAMole rooms in floor generation', () => {
    let found = false;
    for (let i = 0; i < 200; i++) {
      const rooms = generateFloorRooms('okunomori', 5);
      const allRooms = rooms.flatMap(r => Array.isArray(r) ? r : [r]);
      if (allRooms.some(r => r.type === 'whackAMole')) {
        found = true;
        break;
      }
    }
    assert.strictEqual(found, true, 'whackAMole room should appear in floor generation');
  });

  it('should create whackAMole room with correct structure', () => {
    const originalRandom = Math.random;
    // shrine=0-10%, quiz=10-20%, wordDiscovery=20-30%, dealer=30-40%, whackAMole=40-45%
    Math.random = () => 0.42;

    try {
      const rooms = generateFloorRooms('okunomori', 2);
      const pair = rooms[1];
      const room = pair.find(r => r.type === 'whackAMole') || pair[0];

      assert.strictEqual(room.type, 'whackAMole');
      assert.deepStrictEqual(room.whackAMole, { score: 0, completed: false });
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should return entry narration for whackAMole room', () => {
    const room = { type: 'whackAMole', roomNumber: 3, totalRooms: 5 };
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('エリア3/5'));
    assert.ok(narration.includes('ゲーム機'));
  });

  it('should show play action when not interacted', () => {
    const room = {
      type: 'whackAMole',
      interacted: false,
      whackAMole: { score: 0, completed: false }
    };
    const actions = getRoomActions(room);
    assert.ok(actions.find(a => a.id === 'play_whack_a_mole'), 'play action should exist');
    assert.strictEqual(actions.find(a => a.id === 'proceed'), undefined, 'proceed should not be available');
  });

  it('should show proceed action after completion', () => {
    const room = {
      type: 'whackAMole',
      interacted: true,
      whackAMole: { score: 5, completed: true }
    };
    const actions = getRoomActions(room);
    assert.ok(actions.find(a => a.id === 'proceed'), 'proceed should be available after completion');
    assert.strictEqual(actions.find(a => a.id === 'play_whack_a_mole'), undefined, 'play should not be available');
  });
});

// ============ POOL ENDPOINT ============

describe('Whack-a-Mole Pool', () => {
  // Import the route factory and test the handler directly
  let createRunRoutes, router;

  beforeEach(async () => {
    const mod = await import('../../../src/routes/game/run.js');
    createRunRoutes = mod.default;
    router = createRunRoutes({
      generateGameNarration: async () => 'test',
      generateDoorHints: async () => [],
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: async () => [],
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
  });

  /**
   * Extract the route handler for a given method+path from an Express router.
   */
  function getHandler(router, method, path) {
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === path) {
        const routeLayer = layer.route.stack.find(s => s.method === method);
        if (routeLayer) return routeLayer.handle;
      }
    }
    return null;
  }

  it('should return a pool with creatures, items, and skills', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-pool');
    assert.ok(handler, 'GET /whack-a-mole-pool handler should exist');

    const req = {};
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; }
    };

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.pool, 'response should have pool');
    assert.ok(Array.isArray(res.body.pool), 'pool should be an array');
    assert.ok(res.body.pool.length >= 9, 'pool should have at least 9 entries for the 3x3 grid');
  });

  it('should include all three pool types: creature, item, skill', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-pool');
    const req = {};
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };

    handler(req, res);

    const types = new Set(res.body.pool.map(p => p.type));
    assert.ok(types.has('creature'), 'pool should contain creatures');
    assert.ok(types.has('item'), 'pool should contain items');
    assert.ok(types.has('skill'), 'pool should contain skills (moves)');
  });

  it('should have skills derived from moves.json (not legacy autoSkill)', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-pool');
    const req = {};
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };

    handler(req, res);

    const skills = res.body.pool.filter(p => p.type === 'skill');
    assert.ok(skills.length > 0, 'skill pool must not be empty — regression: autoSkill/ultimate removed in learnset migration');

    // Verify skill entries have correct shape
    for (const s of skills) {
      assert.ok(s.id, 'skill should have id');
      assert.ok(s.word, 'skill should have word (Japanese name)');
      assert.ok(s.reading, 'skill should have reading');
      assert.ok(s.meaning, 'skill should have meaning (English name)');
      assert.ok(s.sprite, 'skill should have sprite path');
      assert.ok(s.sprite.includes('/assets/sprites/actions/'), 'skill sprite should be an action icon');
    }
  });

  it('every pool entry should have word, reading, meaning, and sprite', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-pool');
    const req = {};
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };

    handler(req, res);

    for (const entry of res.body.pool) {
      assert.ok(entry.id, `entry missing id: ${JSON.stringify(entry)}`);
      assert.ok(entry.word, `entry missing word: ${entry.id}`);
      assert.ok(entry.reading, `entry missing reading: ${entry.id}`);
      assert.ok(entry.meaning, `entry missing meaning: ${entry.id}`);
      assert.ok(entry.sprite, `entry missing sprite: ${entry.id}`);
    }
  });

  it('pool entries should have unique ids', () => {
    const handler = getHandler(router, 'get', '/whack-a-mole-pool');
    const req = {};
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };

    handler(req, res);

    const ids = res.body.pool.map(p => p.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, 'all pool entry ids should be unique');
  });
});

// ============ COMPLETE ENDPOINT ============

describe('Whack-a-Mole Completion', () => {
  it('should award credits equal to score', () => {
    const gm = new GameManager('test-wam-user');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    // Force current room to be whackAMole
    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'whackAMole',
      interacted: false,
      whackAMole: { score: 0, completed: false },
      roomNumber: 1,
      totalRooms: 5
    };

    const creditsBefore = run.player.credits || 0;
    const result = gm.completeWhackAMole(7);

    assert.strictEqual(result.score, 7);
    assert.strictEqual(result.creditsAwarded, 7);
    assert.strictEqual(run.player.credits, creditsBefore + 7);
    assert.strictEqual(run.rooms[roomIdx].interacted, true);
    assert.strictEqual(run.rooms[roomIdx].whackAMole.completed, true);
  });

  it('should clamp negative scores to 0', () => {
    const gm = new GameManager('test-wam-user2');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'whackAMole',
      interacted: false,
      whackAMole: { score: 0, completed: false },
      roomNumber: 1,
      totalRooms: 5
    };

    const result = gm.completeWhackAMole(-5);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.creditsAwarded, 0);
  });

  it('should reject completion for non-whackAMole rooms', () => {
    const gm = new GameManager('test-wam-user3');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'encounter',
      interacted: false,
      roomNumber: 1,
      totalRooms: 5
    };

    assert.throws(() => gm.completeWhackAMole(5), /No whack-a-mole room here/);
  });

  it('should return alreadyComplete for repeated completions', () => {
    const gm = new GameManager('test-wam-user4');
    gm.createPlayer('TestPlayer');
    gm.startRun({ areaId: 'okunomori' });

    const run = gm.run;
    const roomIdx = run.currentRoom;
    run.rooms[roomIdx] = {
      type: 'whackAMole',
      interacted: false,
      whackAMole: { score: 0, completed: false },
      roomNumber: 1,
      totalRooms: 5
    };

    gm.completeWhackAMole(5);
    const result2 = gm.completeWhackAMole(10);
    assert.strictEqual(result2.alreadyComplete, true);
    assert.strictEqual(result2.creditsAwarded, 0);
    assert.strictEqual(result2.score, 5, 'should return original score');
  });
});
