import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeLayer = layer.route.stack.find(stackLayer => stackLayer.method === method);
      if (routeLayer) return routeLayer.handle;
    }
  }
  return null;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('speed review room run routes', () => {
  let createRunRoutes;

  beforeEach(async () => {
    const mod = await import('../../../src/routes/game/run.js');
    createRunRoutes = mod.default;
  });

  it('POST /speed-review-room/start initializes snapshot and returns state', async () => {
    const gameManager = {
      startSpeedReviewRoomArgs: null,
      async startSpeedReviewRoom(args) {
        this.startSpeedReviewRoomArgs = args;
        return { roomId: 'room-1', reviewedCards: 0 };
      }
    };
    let saveCalls = 0;

    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });

    const handler = getHandler(router, 'post', '/speed-review-room/start');
    assert.ok(handler, 'POST /speed-review-room/start handler should exist');

    const req = {
      body: { roomId: 'room-1' },
      gameManager,
      user: { id: 'user-123' },
      userKeys: { jpdbApiKey: 'jpdb-key' },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'speedReviewRoom' })
    };
    const res = createRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(gameManager.startSpeedReviewRoomArgs, {
      roomId: 'room-1',
      userId: 'user-123',
      jpdbApiKey: 'jpdb-key'
    });
    assert.strictEqual(saveCalls, 1);
    assert.deepStrictEqual(res.body, {
      roomId: 'room-1',
      reviewedCards: 0,
      state: { phase: 'speedReviewRoom' }
    });
  });

  it('POST /speed-review-room/start requires roomId', async () => {
    const gameManager = {
      async startSpeedReviewRoom() {
        throw new Error('should not be called');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/start');
    const req = {
      body: {},
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'roomId is required' });
  });

  it('POST /speed-review-room/progress applies one committed review update', () => {
    const gameManager = {
      progressArgs: null,
      recordSpeedReviewRoomCommit(args) {
        this.progressArgs = args;
        return { roomId: 'room-1', reviewedCards: 1, alreadyCommitted: false };
      }
    };
    let saveCalls = 0;

    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/progress');
    assert.ok(handler, 'POST /speed-review-room/progress handler should exist');

    const req = {
      body: { roomId: 'room-1', vid: 123, sid: 456, commitIndex: 0 },
      gameManager,
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'speedReviewRoom' })
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(gameManager.progressArgs, {
      roomId: 'room-1',
      vid: 123,
      sid: 456,
      commitIndex: 0
    });
    assert.strictEqual(saveCalls, 1);
    assert.deepStrictEqual(res.body, {
      roomId: 'room-1',
      reviewedCards: 1,
      alreadyCommitted: false,
      state: { phase: 'speedReviewRoom' }
    });
  });

  it('POST /speed-review-room/progress enforces payload constraints', () => {
    const gameManager = {
      recordSpeedReviewRoomCommit() {
        throw new Error('should not be called');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/progress');
    const req = {
      body: { roomId: 'room-1', vid: 123, sid: 456, commitIndex: -1 },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'commitIndex must be an integer >= 0' });
  });

  it('POST /speed-review-room/progress returns 409 for invalid room-state transitions', () => {
    const gameManager = {
      recordSpeedReviewRoomCommit() {
        throw new Error('Commit does not match server snapshot order');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/progress');
    const req = {
      body: { roomId: 'room-1', vid: 123, sid: 456, commitIndex: 0 },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { error: 'Commit does not match server snapshot order' });
  });

  it('POST /speed-review-room/progress returns 409 when error code indicates conflict', () => {
    const gameManager = {
      recordSpeedReviewRoomCommit() {
        const error = new Error('unexpected message');
        error.code = 'INVALID_ROOM_STATE';
        throw error;
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/progress');
    const req = {
      body: { roomId: 'room-1', vid: 123, sid: 456, commitIndex: 0 },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { error: 'unexpected message' });
  });

  it('POST /speed-review-room/complete marks room as complete and returns state', () => {
    const gameManager = {
      completeArgs: null,
      completeSpeedReviewRoom(args) {
        this.completeArgs = args;
        return { roomId: 'room-1', completed: true };
      }
    };
    let saveCalls = 0;

    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/complete');
    assert.ok(handler, 'POST /speed-review-room/complete handler should exist');

    const req = {
      body: { roomId: 'room-1' },
      gameManager,
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'room' })
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(gameManager.completeArgs, { roomId: 'room-1' });
    assert.strictEqual(saveCalls, 1);
    assert.deepStrictEqual(res.body, {
      roomId: 'room-1',
      completed: true,
      state: { phase: 'room' }
    });
  });

  it('POST /speed-review-room/complete requires roomId', () => {
    const gameManager = {
      completeSpeedReviewRoom() {
        throw new Error('should not be called');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/complete');
    const req = {
      body: {},
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'roomId is required' });
  });

  it('POST /speed-review-room/start returns 500 for unknown internal errors', async () => {
    const gameManager = {
      async startSpeedReviewRoom() {
        throw new Error('database unavailable');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/start');
    const req = {
      body: { roomId: 'room-1' },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'database unavailable' });
  });

  it('POST /speed-review-room/complete returns 500 for unknown internal errors', () => {
    const gameManager = {
      completeSpeedReviewRoom() {
        throw new Error('storage write failed');
      }
    };
    const router = createRunRoutes({
      generateGameNarration: async () => 'test',
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
    const handler = getHandler(router, 'post', '/speed-review-room/complete');
    const req = {
      body: { roomId: 'room-1' },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = createRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'storage write failed' });
  });
});
