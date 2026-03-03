import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import so we get a clear error if module is missing
let discoverWords, getStageGaps;

before(async () => {
  const mod = await import('../../../scripts/forge-discovery.mjs');
  discoverWords = mod.discoverWords;
  getStageGaps = mod.getStageGaps;
});

// ── Module exports ──────────────────────────────────────────────────

describe('forge-discovery module', () => {
  it('exports discoverWords function', () => {
    assert.strictEqual(typeof discoverWords, 'function');
  });

  it('exports getStageGaps function', () => {
    assert.strictEqual(typeof getStageGaps, 'function');
  });
});

// ── discoverWords ───────────────────────────────────────────────────

describe('discoverWords', () => {
  it('returns an array of word objects for creature-base', async () => {
    const results = await discoverWords({ contentType: 'creature-base', targetStage: 5, limit: 10 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results.length <= 10);

    // Each result has the required fields
    for (const r of results) {
      assert.strictEqual(typeof r.word, 'string');
      assert.strictEqual(typeof r.reading, 'string');
      assert.strictEqual(typeof r.meaning, 'string');
      assert.strictEqual(typeof r.rank, 'number');
      assert.strictEqual(typeof r.stage, 'number');
      assert.strictEqual(typeof r.source, 'string');
      // wkLevel is number or null
      assert.ok(r.wkLevel === null || typeof r.wkLevel === 'number');
    }
  });

  it('returns results for creature-modifier', async () => {
    const results = await discoverWords({ contentType: 'creature-modifier', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for move', async () => {
    const results = await discoverWords({ contentType: 'move', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for item-consumable', async () => {
    const results = await discoverWords({ contentType: 'item-consumable', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for item-equipment', async () => {
    const results = await discoverWords({ contentType: 'item-equipment', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for item-crafting', async () => {
    const results = await discoverWords({ contentType: 'item-crafting', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for area', async () => {
    const results = await discoverWords({ contentType: 'area', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('returns results for npc', async () => {
    const results = await discoverWords({ contentType: 'npc', targetStage: 5, limit: 5 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it('excludes words already used in creatures.json (e.g. 亀)', async () => {
    // 亀 is baseWord in creatures.json — should NOT appear in results
    const results = await discoverWords({ contentType: 'creature-base', targetStage: 10, limit: 200 });
    const kameResult = results.find(r => r.word === '亀');
    assert.strictEqual(kameResult, undefined, '亀 should be excluded (already in creatures.json)');
  });

  it('excludes words already used in moves.json (e.g. 走る)', async () => {
    // 走る is name in moves.json — should NOT appear in move results
    const results = await discoverWords({ contentType: 'move', targetStage: 10, limit: 500 });
    const hashiruResult = results.find(r => r.word === '走る');
    assert.strictEqual(hashiruResult, undefined, '走る should be excluded (already in moves.json)');
  });

  it('results are sorted by rank (most common first)', async () => {
    const results = await discoverWords({ contentType: 'creature-base', targetStage: 5, limit: 20 });
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i].rank >= results[i - 1].rank,
        `Results not sorted: rank ${results[i].rank} < ${results[i - 1].rank}`);
    }
  });

  it('respects the limit parameter', async () => {
    const results = await discoverWords({ contentType: 'creature-base', targetStage: 10, limit: 3 });
    assert.ok(results.length <= 3);
  });

  it('no words above target stage appear', async () => {
    const targetStage = 3;
    const results = await discoverWords({ contentType: 'creature-base', targetStage, limit: 50 });
    for (const r of results) {
      assert.ok(r.stage <= targetStage,
        `Word ${r.word} at stage ${r.stage} exceeds target stage ${targetStage}`);
    }
  });

  it('stage 1 returns only stage 1 words', async () => {
    const results = await discoverWords({ contentType: 'move', targetStage: 1, limit: 50 });
    for (const r of results) {
      assert.strictEqual(r.stage, 1,
        `Word ${r.word} at stage ${r.stage} should be stage 1`);
    }
  });

  it('higher stages return more results than lower stages', async () => {
    const stage1 = await discoverWords({ contentType: 'creature-base', targetStage: 1, limit: 500 });
    const stage5 = await discoverWords({ contentType: 'creature-base', targetStage: 5, limit: 500 });
    assert.ok(stage5.length >= stage1.length,
      `Stage 5 (${stage5.length}) should have >= results than stage 1 (${stage1.length})`);
  });

  it('returns empty array for unknown content type', async () => {
    const results = await discoverWords({ contentType: 'unknown-type', targetStage: 5, limit: 10 });
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0);
  });
});

// ── getStageGaps ────────────────────────────────────────────────────

describe('getStageGaps', () => {
  it('returns 10 entries for creatures', () => {
    const gaps = getStageGaps('creature');
    assert.strictEqual(gaps.length, 10);
  });

  it('returns 10 entries for moves', () => {
    const gaps = getStageGaps('move');
    assert.strictEqual(gaps.length, 10);
  });

  it('returns 10 entries for items', () => {
    const gaps = getStageGaps('item');
    assert.strictEqual(gaps.length, 10);
  });

  it('returns 10 entries for areas', () => {
    const gaps = getStageGaps('area');
    assert.strictEqual(gaps.length, 10);
  });

  it('returns 10 entries for npcs', () => {
    const gaps = getStageGaps('npc');
    assert.strictEqual(gaps.length, 10);
  });

  it('each entry has stage/count/target/deficit fields', () => {
    const gaps = getStageGaps('creature');
    for (const entry of gaps) {
      assert.strictEqual(typeof entry.stage, 'number');
      assert.strictEqual(typeof entry.count, 'number');
      assert.strictEqual(typeof entry.target, 'number');
      assert.strictEqual(typeof entry.deficit, 'number');
    }
  });

  it('stages are numbered 1-10', () => {
    const gaps = getStageGaps('creature');
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(gaps[i].stage, i + 1);
    }
  });

  it('deficit = target - count', () => {
    const gaps = getStageGaps('creature');
    for (const entry of gaps) {
      assert.strictEqual(entry.deficit, entry.target - entry.count);
    }
  });

  it('creature target is 50 per stage', () => {
    const gaps = getStageGaps('creature');
    assert.strictEqual(gaps[0].target, 50);
  });

  it('move target is 100 per stage', () => {
    const gaps = getStageGaps('move');
    assert.strictEqual(gaps[0].target, 100);
  });

  it('item target is 25 per stage', () => {
    const gaps = getStageGaps('item');
    assert.strictEqual(gaps[0].target, 25);
  });

  it('area target is 5 per stage', () => {
    const gaps = getStageGaps('area');
    assert.strictEqual(gaps[0].target, 5);
  });

  it('npc target is 14 per stage', () => {
    const gaps = getStageGaps('npc');
    assert.strictEqual(gaps[0].target, 14);
  });
});
