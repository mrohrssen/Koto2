import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { join } from 'path';

// Dynamic import so we get a clear error if module is missing
let discoverWords, getStageGaps, discoverFromTheme, getThemeStatus;
let saveTheme;

const FIXTURE_THEME = {
  themeId: 'test-forge-discovery',
  areaWord: '学校',
  areaReading: 'がっこう',
  areaMeaning: 'school',
  areaRank: 952,
  avgRank: 2340,
  computedStage: 3,
  generatedAt: '2026-03-06',
  words: [
    { word: '先生', reading: 'せんせい', meaning: 'teacher', rank: 452,
      roles: ['creature', 'npc'], source: 'occupations', assigned: null, existingUses: [] },
    { word: '机', reading: 'つくえ', meaning: 'desk', rank: 2100,
      roles: ['item'], source: 'objects', assigned: 'item:tsukue-desk', existingUses: [] },
    { word: '教室', reading: 'きょうしつ', meaning: 'classroom', rank: 3200,
      roles: ['sub-area'], source: 'locations', assigned: null, existingUses: [] },
    { word: '厳しい', reading: 'きびしい', meaning: 'strict', rank: 3400,
      roles: ['modifier'], source: 'ai-generated', assigned: null, existingUses: [] },
    { word: '黒板', reading: 'こくばん', meaning: 'blackboard', rank: 8500,
      roles: ['item'], source: 'objects', assigned: null, existingUses: [] },
  ]
};

before(async () => {
  const mod = await import('../../../scripts/forge-discovery.mjs');
  discoverWords = mod.discoverWords;
  getStageGaps = mod.getStageGaps;
  discoverFromTheme = mod.discoverFromTheme;
  getThemeStatus = mod.getThemeStatus;

  const themeUtils = await import('../../../scripts/lib/theme-utils.mjs');
  saveTheme = themeUtils.saveTheme;

  // Create fixture theme file
  saveTheme(FIXTURE_THEME);
});

after(() => {
  // Clean up fixture theme file
  const fixturePath = join(process.cwd(), 'language', 'themes', 'test-forge-discovery.json');
  try { rmSync(fixturePath); } catch { /* ignore if already gone */ }
});

// ── Module exports ──────────────────────────────────────────────────

describe('forge-discovery module', () => {
  it('exports discoverWords function', () => {
    assert.strictEqual(typeof discoverWords, 'function');
  });

  it('exports getStageGaps function', () => {
    assert.strictEqual(typeof getStageGaps, 'function');
  });

  it('exports discoverFromTheme function', () => {
    assert.strictEqual(typeof discoverFromTheme, 'function');
  });

  it('exports getThemeStatus function', () => {
    assert.strictEqual(typeof getThemeStatus, 'function');
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

  it('excludes words already used in creatures.json (e.g. 火)', async () => {
    // 火 is baseWord in creatures.json — should NOT appear in results
    const results = await discoverWords({ contentType: 'creature-base', targetStage: 10, limit: 200 });
    const hiResult = results.find(r => r.word === '火');
    assert.strictEqual(hiResult, undefined, '火 should be excluded (already in creatures.json)');
  });

  it('excludes words already used in moves.json (e.g. 叩く)', async () => {
    // 叩く is name in moves.json — should NOT appear in move results
    const results = await discoverWords({ contentType: 'move', targetStage: 10, limit: 500 });
    const tatakuResult = results.find(r => r.word === '叩く');
    assert.strictEqual(tatakuResult, undefined, '叩く should be excluded (already in moves.json)');
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

// ── discoverFromTheme ────────────────────────────────────────────────

describe('discoverFromTheme', () => {
  it('returns all unassigned words when no role filter', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery' });
    // 4 of 5 — 机 is assigned
    assert.strictEqual(results.length, 4);
    const words = results.map(r => r.word);
    assert.ok(!words.includes('机'), '机 should be excluded (assigned)');
  });

  it('filters by role (creature returns only 先生)', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery', role: 'creature' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].word, '先生');
  });

  it('respects limit', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery', limit: 2 });
    assert.ok(results.length <= 2);
  });

  it('results are sorted by rank ascending', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery' });
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i].rank >= results[i - 1].rank,
        `Results not sorted: rank ${results[i].rank} < ${results[i - 1].rank}`);
    }
  });

  it('returns empty array for non-existent theme', () => {
    const results = discoverFromTheme({ themeId: 'nonexistent-theme-xyz' });
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0);
  });

  it('includeAssigned: true returns assigned words too', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery', includeAssigned: true });
    assert.strictEqual(results.length, 5);
    const words = results.map(r => r.word);
    assert.ok(words.includes('机'), '机 should be included when includeAssigned is true');
  });
});

// ── getThemeStatus ───────────────────────────────────────────────────

describe('getThemeStatus', () => {
  it('returns an array', () => {
    const statuses = getThemeStatus();
    assert.ok(Array.isArray(statuses));
  });

  it('includes the test theme', () => {
    const statuses = getThemeStatus();
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.ok(testTheme, 'test-forge-discovery theme should be in results');
  });

  it('reports correct totalWords, assignedCount, unassignedCount', () => {
    const statuses = getThemeStatus();
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.strictEqual(testTheme.totalWords, 5);
    assert.strictEqual(testTheme.assignedCount, 1);
    assert.strictEqual(testTheme.unassignedCount, 4);
  });

  it('has computedStage', () => {
    const statuses = getThemeStatus();
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.strictEqual(testTheme.computedStage, 3);
  });

  it('reports areaWord and areaMeaning', () => {
    const statuses = getThemeStatus();
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.strictEqual(testTheme.areaWord, '学校');
    assert.strictEqual(testTheme.areaMeaning, 'school');
  });

  it('has roleBreakdown with correct counts', () => {
    const statuses = getThemeStatus();
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.ok(testTheme.roleBreakdown);
    // 先生 has creature + npc, 机 has item, 教室 has sub-area, 厳しい has modifier, 黒板 has item
    assert.strictEqual(testTheme.roleBreakdown.creature, 1);
    assert.strictEqual(testTheme.roleBreakdown.npc, 1);
    assert.strictEqual(testTheme.roleBreakdown.item, 2);
    assert.strictEqual(testTheme.roleBreakdown['sub-area'], 1);
    assert.strictEqual(testTheme.roleBreakdown.modifier, 1);
  });
});
