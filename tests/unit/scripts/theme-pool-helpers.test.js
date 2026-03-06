import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import so we get a clear error if module is missing
let crossReferenceExisting, filterCandidates, assignRoles, computeThemeStats;

before(async () => {
  const mod = await import('../../../scripts/lib/theme-pool-helpers.mjs');
  crossReferenceExisting = mod.crossReferenceExisting;
  filterCandidates = mod.filterCandidates;
  assignRoles = mod.assignRoles;
  computeThemeStats = mod.computeThemeStats;
});

// ── crossReferenceExisting ──────────────────────────────────────────

describe('crossReferenceExisting', () => {
  it('annotates a word found as creature baseWord', () => {
    const candidates = [{ word: '亀', rank: 9300 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(Array.isArray(result[0].existingUses));
    assert.ok(result[0].existingUses.includes('creature:kamedor'));
  });

  it('annotates a word found as creature modifier', () => {
    const candidates = [{ word: '古代', rank: 5500 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('creature-mod:kamedor'));
  });

  it('annotates a word found as a move name', () => {
    const candidates = [{ word: '走る', rank: 400 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('move:hashiru'));
  });

  it('annotates a word found as an item component', () => {
    const candidates = [{ word: 'カレー', rank: 4600 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('item:curry-bread'));
  });

  it('annotates a word found as area sub-area modifier', () => {
    const candidates = [{ word: '小さな', rank: 300 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('area-mod:okunomori-small-pond'));
  });

  it('annotates a word found as area sub-area location', () => {
    const candidates = [{ word: '池', rank: 3000 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('area-loc:okunomori-small-pond'));
  });

  it('annotates a word found as NPC baseWord', () => {
    const candidates = [{ word: '住人', rank: 3900 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('npc:nagi'));
  });

  it('returns empty existingUses for unknown words', () => {
    const candidates = [{ word: '宇宙船', rank: 15000 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(Array.isArray(result[0].existingUses));
    assert.strictEqual(result[0].existingUses.length, 0);
  });

  it('does not remove any candidates (only annotates)', () => {
    const candidates = [
      { word: '亀', rank: 9300 },
      { word: '宇宙船', rank: 15000 },
    ];
    const result = crossReferenceExisting(candidates);
    assert.strictEqual(result.length, 2);
  });

  it('preserves existing properties on candidates', () => {
    const candidates = [{ word: '亀', rank: 9300, reading: 'かめ', meaning: 'turtle' }];
    const result = crossReferenceExisting(candidates);
    assert.strictEqual(result[0].word, '亀');
    assert.strictEqual(result[0].rank, 9300);
    assert.strictEqual(result[0].reading, 'かめ');
    assert.strictEqual(result[0].meaning, 'turtle');
  });

  it('handles word used in multiple places', () => {
    // '道' appears as area-loc in multiple sub-areas
    const candidates = [{ word: '道', rank: 600 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.length >= 2);
    assert.ok(result[0].existingUses.some(u => u.startsWith('area-loc:')));
  });

  it('handles empty candidates array', () => {
    const result = crossReferenceExisting([]);
    assert.deepStrictEqual(result, []);
  });
});

// ── filterCandidates ────────────────────────────────────────────────

describe('filterCandidates', () => {
  it('removes candidates with rank > 30000', () => {
    const candidates = [
      { word: 'a', rank: 1000 },
      { word: 'b', rank: 31000 },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].word, 'a');
  });

  it('removes candidates with null rank', () => {
    const candidates = [
      { word: 'a', rank: 1000 },
      { word: 'b', rank: null },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].word, 'a');
  });

  it('removes candidates with undefined rank', () => {
    const candidates = [
      { word: 'a', rank: 1000 },
      { word: 'b' },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
  });

  it('deduplicates by word (keeps first occurrence)', () => {
    const candidates = [
      { word: 'dup', rank: 500 },
      { word: 'dup', rank: 600 },
      { word: 'unique', rank: 700 },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 2);
    // After sort by rank, dup(500) comes first
    assert.strictEqual(result[0].word, 'dup');
    assert.strictEqual(result[0].rank, 500);
  });

  it('sorts by rank ascending', () => {
    const candidates = [
      { word: 'c', rank: 3000 },
      { word: 'a', rank: 100 },
      { word: 'b', rank: 1500 },
    ];
    const result = filterCandidates(candidates);
    assert.deepStrictEqual(result.map(c => c.rank), [100, 1500, 3000]);
  });

  it('keeps rank exactly 30000', () => {
    const candidates = [{ word: 'edge', rank: 30000 }];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
  });

  it('handles empty array', () => {
    const result = filterCandidates([]);
    assert.deepStrictEqual(result, []);
  });

  it('does not mutate original array', () => {
    const candidates = [
      { word: 'b', rank: 2000 },
      { word: 'a', rank: 1000 },
    ];
    const original = [...candidates];
    filterCandidates(candidates);
    assert.strictEqual(candidates[0].word, original[0].word);
    assert.strictEqual(candidates[1].word, original[1].word);
  });
});

// ── assignRoles ─────────────────────────────────────────────────────

describe('assignRoles', () => {
  it('assigns noun roles: creature, item, npc, sub-area', () => {
    const candidates = [{ word: '猫', posTag: 'noun' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item', 'npc', 'sub-area'].sort());
  });

  it('assigns independent noun same as noun', () => {
    const candidates = [{ word: '犬', posTag: 'independent noun' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('creature'));
    assert.ok(result[0].roles.includes('item'));
    assert.ok(result[0].roles.includes('npc'));
    assert.ok(result[0].roles.includes('sub-area'));
  });

  it('assigns proper noun same as noun', () => {
    const candidates = [{ word: '東京', posTag: 'proper noun' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns adjective role: modifier', () => {
    const candidates = [{ word: '大きい', posTag: 'い adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns な adjective role: modifier', () => {
    const candidates = [{ word: '静か', posTag: 'な adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns の adjective role: modifier', () => {
    const candidates = [{ word: '本当', posTag: 'の adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns plain adjective role: modifier', () => {
    const candidates = [{ word: '新しい', posTag: 'adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns verb roles: move, creature', () => {
    const candidates = [{ word: '食べる', posTag: 'ichidan verb' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'move'].sort());
  });

  it('assigns godan verb roles: move, creature', () => {
    const candidates = [{ word: '書く', posTag: 'godan verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns する verb roles: move, creature', () => {
    const candidates = [{ word: '勉強する', posTag: 'する verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns transitive verb roles: move, creature', () => {
    const candidates = [{ word: '開ける', posTag: 'transitive verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns intransitive verb roles: move, creature', () => {
    const candidates = [{ word: '開く', posTag: 'intransitive verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns plain "verb" POS roles: move, creature', () => {
    const candidates = [{ word: '行く', posTag: 'verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns safe defaults for unknown POS: creature, item', () => {
    const candidates = [{ word: '何か', posTag: 'particle' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('assigns safe defaults when posTag is missing', () => {
    const candidates = [{ word: '何か' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('assigns safe defaults when posTag is null', () => {
    const candidates = [{ word: '何か', posTag: null }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('deduplicates roles', () => {
    // Even if multiple POS tags match, roles should be unique
    const candidates = [{ word: '走る', posTag: 'godan verb' }];
    const result = assignRoles(candidates);
    const uniqueRoles = [...new Set(result[0].roles)];
    assert.strictEqual(result[0].roles.length, uniqueRoles.length);
  });

  it('preserves existing properties on candidates', () => {
    const candidates = [{ word: '猫', posTag: 'noun', rank: 1000, reading: 'ねこ' }];
    const result = assignRoles(candidates);
    assert.strictEqual(result[0].word, '猫');
    assert.strictEqual(result[0].rank, 1000);
    assert.strictEqual(result[0].reading, 'ねこ');
  });

  it('handles empty array', () => {
    const result = assignRoles([]);
    assert.deepStrictEqual(result, []);
  });
});

// ── computeThemeStats ───────────────────────────────────────────────

describe('computeThemeStats', () => {
  it('computes avgRank as mean of all word ranks', () => {
    const words = [
      { word: 'a', rank: 1000, roles: ['creature'] },
      { word: 'b', rank: 3000, roles: ['item'] },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.avgRank, 2000);
  });

  it('computes computedStage from avgRank', () => {
    const words = [
      { word: 'a', rank: 500, roles: ['creature'] },
      { word: 'b', rank: 500, roles: ['item'] },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(typeof stats.computedStage, 'number');
    assert.ok(stats.computedStage >= 1 && stats.computedStage <= 10);
  });

  it('computes roleCounts correctly', () => {
    const words = [
      { word: 'a', rank: 1000, roles: ['creature', 'npc'] },
      { word: 'b', rank: 2000, roles: ['creature'] },
      { word: 'c', rank: 3000, roles: ['modifier'] },
      { word: 'd', rank: 4000, roles: ['move', 'creature'] },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.roleCounts.creature, 3);
    assert.strictEqual(stats.roleCounts.npc, 1);
    assert.strictEqual(stats.roleCounts.modifier, 1);
    assert.strictEqual(stats.roleCounts.move, 1);
  });

  it('handles empty words array', () => {
    const stats = computeThemeStats([]);
    assert.strictEqual(stats.avgRank, 0);
    assert.strictEqual(stats.computedStage, null);
    assert.deepStrictEqual(stats.roleCounts, {});
  });

  it('handles words without roles', () => {
    const words = [
      { word: 'a', rank: 1000 },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.avgRank, 1000);
    assert.deepStrictEqual(stats.roleCounts, {});
  });

  it('returns stage consistent with computeStageFromAvgRank', async () => {
    const { computeStageFromAvgRank } = await import('../../../language/stage-utils.js');
    const words = [
      { word: 'a', rank: 800, roles: ['creature'] },
      { word: 'b', rank: 1200, roles: ['item'] },
    ];
    const stats = computeThemeStats(words);
    const expectedStage = computeStageFromAvgRank(stats.avgRank);
    assert.strictEqual(stats.computedStage, expectedStage);
  });

  it('avgRank handles non-integer means correctly', () => {
    const words = [
      { word: 'a', rank: 1000, roles: ['creature'] },
      { word: 'b', rank: 2000, roles: ['item'] },
      { word: 'c', rank: 3000, roles: ['npc'] },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.avgRank, 2000);
  });
});
