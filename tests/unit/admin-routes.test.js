// tests/unit/admin-routes.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
