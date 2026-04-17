// tests/unit/admin-word-knowledge-endpoint.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import createAdminRoutes from '../../src/routes/admin.js';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';

describe('GET /api/admin/word-knowledge/:userId reads from flat dataDir', () => {
  let tempDir, app;
  const userId = 'admin-wk-test-user';
  const adminSecret = 'test-secret-123';

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'admin-wk-endpoint-'));
    setDataDirForTest(tempDir);
    process.env.ADMIN_SECRET = adminSecret;

    // Seed a word-knowledge file at the flat dataDir path.
    writeFileSync(
      join(tempDir, `word-knowledge-${userId}.json`),
      JSON.stringify({
        userId,
        seen: {
          '木': { exposures: 3, firstSeen: '2026-01-01T00:00:00Z' },
          '火': { exposures: 2, firstSeen: '2026-01-01T00:00:00Z' },
        },
        known: {},
      })
    );

    app = express();
    app.use('/api/admin', createAdminRoutes({ dataDir: tempDir }));
  });

  after(() => {
    resetDataDirForTest();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ADMIN_SECRET;
  });

  it('returns words with readings and meanings from the committed dictionary', async () => {
    // Use node's native fetch via supertest-less approach: spin up a real ephemeral HTTP server.
    const server = app.listen(0);
    try {
      const { port } = server.address();
      const res = await fetch(
        `http://127.0.0.1:${port}/api/admin/word-knowledge/${userId}`,
        { headers: { 'x-admin-secret': adminSecret } }
      );
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      const body = await res.json();

      assert.ok(Array.isArray(body.words), 'response should have a words array');
      assert.ok(body.words.length > 0, `expected at least one word, got ${body.words.length}`);

      const tree = body.words.find(w => w.word === '木');
      assert.ok(tree, 'expected 木 in response');
      assert.equal(tree.exposures, 3);
      // Dictionary must have loaded — these fields should be populated:
      assert.ok(tree.reading, `expected a non-empty reading for 木, got ${JSON.stringify(tree.reading)}`);
      assert.ok(tree.meaning, `expected a non-empty meaning for 木, got ${JSON.stringify(tree.meaning)}`);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
