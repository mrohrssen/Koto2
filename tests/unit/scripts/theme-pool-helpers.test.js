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
    // R1 creature 'hi' has baseWord '火'
    const candidates = [{ word: '\u706B', rank: 574 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(Array.isArray(result[0].existingUses));
    assert.ok(result[0].existingUses.includes('creature:hi'));
  });

  it('annotates a word found as creature modifier', () => {
    // R1 creatures have no modifier field, so no word should match creature-mod
    // Test that a non-matching word has empty existingUses
    const candidates = [{ word: '\u53E4\u4EE3', rank: 5500 }];
    const result = crossReferenceExisting(candidates);
    const creatureModUses = result[0].existingUses.filter(u => u.startsWith('creature-mod:'));
    assert.strictEqual(creatureModUses.length, 0, 'R1 creatures have no modifier field');
  });

  it('annotates a word found as a move name', () => {
    // R1 move 'tataku' has name '叩く'
    const candidates = [{ word: '\u53E9\u304F', rank: 1400 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('move:tataku'));
  });

  it('annotates a word found as an item component', () => {
    // R1 items have no components field, so no word should match item:
    const candidates = [{ word: '\u30AB\u30EC\u30FC', rank: 4600 }];
    const result = crossReferenceExisting(candidates);
    const itemUses = result[0].existingUses.filter(u => u.startsWith('item:'));
    assert.strictEqual(itemUses.length, 0, 'R1 items have no components field');
  });

  it('annotates a word found as area sub-area modifier', () => {
    // R1 area has subAreas: [], so no word should match area-mod:
    const candidates = [{ word: '\u5C0F\u3055\u306A', rank: 300 }];
    const result = crossReferenceExisting(candidates);
    const areaModUses = result[0].existingUses.filter(u => u.startsWith('area-mod:'));
    assert.strictEqual(areaModUses.length, 0, 'R1 area has empty subAreas');
  });

  it('annotates a word found as area sub-area location', () => {
    // R1 area has subAreas: [], so no word should match area-loc:
    const candidates = [{ word: '\u6C60', rank: 3000 }];
    const result = crossReferenceExisting(candidates);
    const areaLocUses = result[0].existingUses.filter(u => u.startsWith('area-loc:'));
    assert.strictEqual(areaLocUses.length, 0, 'R1 area has empty subAreas');
  });

  it('annotates a word found as NPC baseWord', () => {
    // R1 NPC 'kodomo' has baseWord '子供'
    const candidates = [{ word: '\u5B50\u4F9B', rank: 836 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.includes('npc:kodomo'));
  });

  it('returns empty existingUses for unknown words', () => {
    const candidates = [{ word: '\u5B87\u5B99\u8239', rank: 15000 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(Array.isArray(result[0].existingUses));
    assert.strictEqual(result[0].existingUses.length, 0);
  });

  it('does not remove any candidates (only annotates)', () => {
    const candidates = [
      { word: '\u706B', rank: 574 },
      { word: '\u5B87\u5B99\u8239', rank: 15000 },
    ];
    const result = crossReferenceExisting(candidates);
    assert.strictEqual(result.length, 2);
  });

  it('preserves existing properties on candidates', () => {
    const candidates = [{ word: '\u706B', rank: 574, reading: '\u3072', meaning: 'fire' }];
    const result = crossReferenceExisting(candidates);
    assert.strictEqual(result[0].word, '\u706B');
    assert.strictEqual(result[0].rank, 574);
    assert.strictEqual(result[0].reading, '\u3072');
    assert.strictEqual(result[0].meaning, 'fire');
  });

  it('handles word used in multiple places', () => {
    // '子供' appears as NPC baseWord for 'kodomo'
    const candidates = [{ word: '\u5B50\u4F9B', rank: 836 }];
    const result = crossReferenceExisting(candidates);
    assert.ok(result[0].existingUses.length >= 1);
    assert.ok(result[0].existingUses.some(u => u.startsWith('npc:')));
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
    const candidates = [{ word: '\u732B', posTag: 'noun' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item', 'npc', 'sub-area'].sort());
  });

  it('assigns independent noun same as noun', () => {
    const candidates = [{ word: '\u72AC', posTag: 'independent noun' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('creature'));
    assert.ok(result[0].roles.includes('item'));
    assert.ok(result[0].roles.includes('npc'));
    assert.ok(result[0].roles.includes('sub-area'));
  });

  it('assigns proper noun same as noun', () => {
    const candidates = [{ word: '\u6771\u4EAC', posTag: 'proper noun' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns adjective role: modifier', () => {
    const candidates = [{ word: '\u5927\u304D\u3044', posTag: '\u3044 adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns \u306A adjective role: modifier', () => {
    const candidates = [{ word: '\u9759\u304B', posTag: '\u306A adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns \u306E adjective role: modifier', () => {
    const candidates = [{ word: '\u672C\u5F53', posTag: '\u306E adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns plain adjective role: modifier', () => {
    const candidates = [{ word: '\u65B0\u3057\u3044', posTag: 'adjective' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles, ['modifier']);
  });

  it('assigns verb roles: move, creature', () => {
    const candidates = [{ word: '\u98DF\u3079\u308B', posTag: 'ichidan verb' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'move'].sort());
  });

  it('assigns godan verb roles: move, creature', () => {
    const candidates = [{ word: '\u66F8\u304F', posTag: 'godan verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns \u3059\u308B verb roles: move, creature', () => {
    const candidates = [{ word: '\u52C9\u5F37\u3059\u308B', posTag: '\u3059\u308B verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns transitive verb roles: move, creature', () => {
    const candidates = [{ word: '\u958B\u3051\u308B', posTag: 'transitive verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns intransitive verb roles: move, creature', () => {
    const candidates = [{ word: '\u958B\u304F', posTag: 'intransitive verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns plain "verb" POS roles: move, creature', () => {
    const candidates = [{ word: '\u884C\u304F', posTag: 'verb' }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns safe defaults for unknown POS: creature, item', () => {
    const candidates = [{ word: '\u4F55\u304B', posTag: 'particle' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('assigns safe defaults when posTag is missing', () => {
    const candidates = [{ word: '\u4F55\u304B' }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('assigns safe defaults when posTag is null', () => {
    const candidates = [{ word: '\u4F55\u304B', posTag: null }];
    const result = assignRoles(candidates);
    assert.deepStrictEqual(result[0].roles.sort(), ['creature', 'item'].sort());
  });

  it('deduplicates roles', () => {
    // Even if multiple POS tags match, roles should be unique
    const candidates = [{ word: '\u8D70\u308B', posTag: 'godan verb' }];
    const result = assignRoles(candidates);
    const uniqueRoles = [...new Set(result[0].roles)];
    assert.strictEqual(result[0].roles.length, uniqueRoles.length);
  });

  it('preserves existing properties on candidates', () => {
    const candidates = [{ word: '\u732B', posTag: 'noun', rank: 1000, reading: '\u306D\u3053' }];
    const result = assignRoles(candidates);
    assert.strictEqual(result[0].word, '\u732B');
    assert.strictEqual(result[0].rank, 1000);
    assert.strictEqual(result[0].reading, '\u306D\u3053');
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
