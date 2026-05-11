// tests/unit/admin-routes.test.js
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import createAdminRoutes from '../../src/routes/admin.js';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';
import { clearManagersForTest, getManager, saveManager } from '../../src/game/manager-registry.js';

describe('shiftFsrsTimestamps', () => {
  let tempDir;
  let shiftFsrsTimestamps;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'admin-test-'));
    const mod = await import('../../src/routes/admin.js');
    shiftFsrsTimestamps = mod.shiftFsrsTimestamps;
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('shifts card due and last_review timestamps backward by 1 day', async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);

    const srsData = {
      vocab: {
        cards: [
          {
            id: 'test-word',
            word: 'テスト',
            due: tomorrow.toISOString(),
            last_review: now.toISOString(),
            stability: 1,
            difficulty: 5,
            reps: 1,
            lapses: 0,
            state: 2,
          },
        ],
      },
    };

    const filePath = join(tempDir, 'srs-test-user.json');
    writeFileSync(filePath, JSON.stringify(srsData, null, 2));

    const result = shiftFsrsTimestamps(filePath, 1);

    assert.equal(result.shifted, 1);

    // Re-read the file and verify timestamps shifted
    const updated = JSON.parse(readFileSync(filePath, 'utf-8'));
    const card = updated.vocab.cards[0];

    const updatedDue = new Date(card.due).getTime();
    const updatedLastReview = new Date(card.last_review).getTime();

    // Due was tomorrow, shifted back 1 day — should be roughly now
    assert.ok(
      Math.abs(updatedDue - now.getTime()) < 1000,
      `Due should be ~now after shifting back 1 day, got diff=${updatedDue - now.getTime()}ms`
    );

    // last_review was now, shifted back 1 day — should be roughly yesterday
    const yesterday = now.getTime() - 86400000;
    assert.ok(
      Math.abs(updatedLastReview - yesterday) < 1000,
      `last_review should be ~yesterday after shifting back 1 day, got diff=${updatedLastReview - yesterday}ms`
    );
  });

  it('handles multiple decks and cards', async () => {
    const now = new Date();
    const srsData = {
      vocab: {
        cards: [
          { id: 'w1', due: now.toISOString(), last_review: now.toISOString() },
          { id: 'w2', due: now.toISOString() },
        ],
      },
      kana: {
        cards: [
          { id: 'k1', due: now.toISOString(), last_review: now.toISOString() },
        ],
      },
    };

    const filePath = join(tempDir, 'srs-multi.json');
    writeFileSync(filePath, JSON.stringify(srsData, null, 2));

    const result = shiftFsrsTimestamps(filePath, 2);
    assert.equal(result.shifted, 3);
  });

  it('returns 0 shifted for empty deck', async () => {
    const srsData = { vocab: { cards: [] } };
    const filePath = join(tempDir, 'srs-empty.json');
    writeFileSync(filePath, JSON.stringify(srsData, null, 2));

    const result = shiftFsrsTimestamps(filePath, 1);
    assert.equal(result.shifted, 0);
  });
});

describe('admin advance-time', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    clearManagersForTest();
    resetDataDirForTest();
  });

  it('moves crystal login date backward for simulated days', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'admin-advance-'));
    try {
      setDataDirForTest(tempDir);
      process.env.ADMIN_SECRET = 'test-secret';

      const manager = getManager('u-crystal');
      manager.getMeta().lastCrystalLoginDate = '2026-05-11';
      saveManager('u-crystal');

      const app = express();
      app.use(express.json());
      app.use('/api/admin', createAdminRoutes({ dataDir: tempDir }));
      const server = await new Promise(resolve => {
        const listener = app.listen(0, () => resolve(listener));
      });

      try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/advance-time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
          body: JSON.stringify({ userId: 'u-crystal', days: 1 })
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.crystalLoginShifted, true);
        assert.equal(body.lastCrystalLoginDate, '2026-05-10');
        assert.equal(manager.getMeta().lastCrystalLoginDate, '2026-05-10');
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
