import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import createMiscRoutes from '../../src/routes/game/misc.js';

function buildRouter(adaptExistingNarrationText) {
  return createMiscRoutes({
    generateGameNarration: async () => '',
    adaptExistingNarrationText,
    cancelPendingPrefetches: () => {},
    clearPrefetchCache: () => {},
    getGameStats: () => ({}),
    setGameStats: () => {},
    getDebugMode: () => false,
    setDebugMode: () => {},
    vocabCacheFile: '/tmp/test-vocab-cache.json',
    staticWordList: []
  });
}

function getRewriteHandler(router) {
  const layer = router.stack.find(l => l.route && l.route.path === '/rewrite-narration');
  assert.ok(layer, 'rewrite-narration route should exist');
  return layer.route.stack[0].handle;
}

function mockReqRes(body = {}, userKeys = {}) {
  const req = {
    body,
    userKeys
  };

  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => responseBody
  };
}

describe('POST /api/game/rewrite-narration', () => {
  it('returns adapted narration text when rewrite succeeds', async () => {
    const router = buildRouter(async (text) => `${text}（適応済み）`);
    const handler = getRewriteHandler(router);
    const { req, res, getStatus, getBody } = mockReqRes({ text: '元の文' }, { userId: 'u1' });

    await handler(req, res);

    assert.equal(getStatus(), 200);
    assert.deepStrictEqual(getBody(), { narration: '元の文（適応済み）' });
  });

  it('falls back to source text when rewrite throws', async () => {
    const router = buildRouter(async () => {
      throw new Error('timeout');
    });
    const handler = getRewriteHandler(router);
    const { req, res, getStatus, getBody } = mockReqRes({ text: '元の文' }, { userId: 'u1' });

    await handler(req, res);

    assert.equal(getStatus(), 200);
    assert.deepStrictEqual(getBody(), { narration: '元の文' });
  });

  it('returns unchanged text when request text is empty', async () => {
    const router = buildRouter(async () => 'SHOULD_NOT_BE_USED');
    const handler = getRewriteHandler(router);
    const { req, res, getStatus, getBody } = mockReqRes({ text: '' }, { userId: 'u1' });

    await handler(req, res);

    assert.equal(getStatus(), 200);
    assert.deepStrictEqual(getBody(), { narration: '' });
  });
});
