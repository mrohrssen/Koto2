import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { join } from 'path';
import { createKnownWordsRoutes } from '../../src/routes/game/known-words.js';
import createFrameAuditRoutes from '../../src/routes/admin-frame-audit.js';

describe('grammar route annotations', () => {
  it('adds grammar hints to known-words parse-text tokens', async () => {
    const app = express();
    app.use(express.json());
    app.use('/known-words', createKnownWordsRoutes());

    const res = await request(app)
      .post('/known-words/parse-text')
      .send({ text: '本を読んでいる。' });

    assert.equal(res.status, 200);
    assert.ok(res.body.tokens.some(t =>
      t.spelling === 'を'
      && Array.isArray(t.grammarHints)
      && t.grammarHints.some(h => h.grammarId === 'n5-wo-object')
    ));
  });

  it('adds grammar hints to admin frame-audit token previews', async () => {
    const previousSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = 'test-secret';
    try {
      const app = express();
      app.use(express.json());
      app.use('/admin', createFrameAuditRoutes({
        framesPath: join(import.meta.dirname, '../../data/dialogue/frames.json'),
        sourcesPath: join(import.meta.dirname, '../../data/dialogue/frame-sources.json'),
      }));

      const res = await request(app)
        .post('/admin/tokenize-frames')
        .set('x-admin-secret', 'test-secret')
        .send({ texts: [{ id: 'line-1', raw: '本を読む。' }] });

      assert.equal(res.status, 200);
      const tokens = res.body.tokens['line-1'];
      assert.ok(tokens.some(t =>
        t.surface === 'を'
        && Array.isArray(t.grammarHints)
        && t.grammarHints.some(h => h.grammarId === 'n5-wo-object')
      ));
    } finally {
      if (previousSecret == null) {
        delete process.env.ADMIN_SECRET;
      } else {
        process.env.ADMIN_SECRET = previousSecret;
      }
    }
  });
});
