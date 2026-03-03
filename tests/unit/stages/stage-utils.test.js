import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWordStrictStage, getContentWords, suggestStage, getStageReport, getFullReport } from '../../../language/stage-utils.js';

// ── getWordStrictStage ──────────────────────────────────────────────

describe('getWordStrictStage', () => {
  it('assigns WK level 1-6 words to stage 1', () => {
    // 山 is WK level 1 → Math.ceil(1/6) = 1
    assert.strictEqual(getWordStrictStage('山', 2000), 1);
  });

  it('assigns WK level 7-12 words to stage 2', () => {
    // 魚 is WK level 7 → Math.ceil(7/6) = 2
    assert.strictEqual(getWordStrictStage('魚', 1800), 2);
  });

  it('assigns WK level 55-60 words to stage 10', () => {
    // 蝶 is WK level 56 → Math.ceil(56/6) = 10
    assert.strictEqual(getWordStrictStage('蝶', 8600), 10);
  });

  it('WK lookup takes priority over JPDB rank', () => {
    // 山 is WK level 1, regardless of JPDB rank
    assert.strictEqual(getWordStrictStage('山', 50000), 1);
  });

  it('uses JPDB rank for katakana words not in WaniKani', () => {
    // カエル not in WK, rank 9900 → stage 8 (cap 12000)
    assert.strictEqual(getWordStrictStage('カエル', 9900), 8);
  });

  it('uses JPDB rank for hiragana words not in WaniKani', () => {
    // おにぎり not in WK, rank 9100 → stage 8 (cap 12000)
    assert.strictEqual(getWordStrictStage('おにぎり', 9100), 8);
  });

  it('assigns stage 1 for non-WK word with rank <= 500', () => {
    // ママ not in WK, rank 400 → stage 1 (cap 500)
    assert.strictEqual(getWordStrictStage('ママ', 400), 1);
  });

  it('assigns stage 10 for non-WK word with rank beyond stage 9 cap', () => {
    // ペンギン not in WK, rank 19500 → stage 10 (no cap)
    assert.strictEqual(getWordStrictStage('ペンギン', 19500), 10);
  });

  it('returns null for unknown word with no rank', () => {
    assert.strictEqual(getWordStrictStage('???', null), null);
  });

  it('returns null for unknown word with undefined rank', () => {
    assert.strictEqual(getWordStrictStage('???', undefined), null);
  });

  it('assigns exact boundary rank to correct stage', () => {
    // rank exactly 500 → stage 1 (cap is 500)
    assert.strictEqual(getWordStrictStage('テスト', 500), 1);
    // rank 501 → stage 2 (next cap is 1200)
    assert.strictEqual(getWordStrictStage('テスト', 501), 2);
  });

  it('assigns rank 16001 to stage 10', () => {
    // Above stage 9 cap (16000), stage 10 has null cap
    assert.strictEqual(getWordStrictStage('テスト', 16001), 10);
  });
});

// ── getContentWords ─────────────────────────────────────────────────

describe('getContentWords', () => {
  it('extracts baseWord and modifier from a creature', () => {
    const creature = {
      id: 'nekotto',
      baseWord: '猫', baseMeaning: 'cat', baseRank: 1600,
      modifier: { word: '鉄', meaning: 'Iron', rank: 2200 }
    };
    const words = getContentWords(creature, 'creature');
    assert.strictEqual(words.length, 2);
    assert.deepStrictEqual(words[0], { word: '猫', rank: 1600, source: 'baseWord' });
    assert.deepStrictEqual(words[1], { word: '鉄', rank: 2200, source: 'modifier' });
  });

  it('handles creature with no modifier', () => {
    const creature = {
      id: 'test', baseWord: '犬', baseMeaning: 'dog', baseRank: 1500
    };
    const words = getContentWords(creature, 'creature');
    assert.strictEqual(words.length, 1);
    assert.deepStrictEqual(words[0], { word: '犬', rank: 1500, source: 'baseWord' });
  });

  it('extracts move name', () => {
    const move = { id: 'hashiru', name: '走る', meaning: 'to run', rank: 400 };
    const words = getContentWords(move, 'move');
    assert.strictEqual(words.length, 1);
    assert.deepStrictEqual(words[0], { word: '走る', rank: 400, source: 'name' });
  });

  it('extracts item components', () => {
    const item = {
      id: 'green-tea', word: '緑茶', meaning: 'green tea',
      components: [
        { word: '緑', rank: 2300 },
        { word: '茶', rank: 4100 }
      ]
    };
    const words = getContentWords(item, 'item');
    assert.strictEqual(words.length, 2);
    assert.deepStrictEqual(words[0], { word: '緑', rank: 2300, source: 'component' });
    assert.deepStrictEqual(words[1], { word: '茶', rank: 4100, source: 'component' });
  });

  it('extracts single-component items', () => {
    const item = {
      id: 'sake', word: '酒', meaning: 'sake',
      components: [{ word: '酒', rank: 1600 }]
    };
    const words = getContentWords(item, 'item');
    assert.strictEqual(words.length, 1);
    assert.deepStrictEqual(words[0], { word: '酒', rank: 1600, source: 'component' });
  });

  it('handles item with no components', () => {
    const item = { id: 'empty', word: 'test', meaning: 'test' };
    const words = getContentWords(item, 'item');
    assert.strictEqual(words.length, 0);
  });

  it('extracts area vocabWords', () => {
    const area = {
      id: 'forest',
      vocabWords: [
        { word: '森', rank: 3200 },
        { word: '木', rank: 800 }
      ]
    };
    const words = getContentWords(area, 'area');
    assert.strictEqual(words.length, 2);
    assert.deepStrictEqual(words[0], { word: '森', rank: 3200, source: 'areaVocab' });
    assert.deepStrictEqual(words[1], { word: '木', rank: 800, source: 'areaVocab' });
  });

  it('handles area with no vocabWords', () => {
    const area = { id: 'empty-area' };
    const words = getContentWords(area, 'area');
    assert.strictEqual(words.length, 0);
  });
});

// ── suggestStage ────────────────────────────────────────────────────

describe('suggestStage', () => {
  it('suggests stage 1 for all-stage-1 content', () => {
    // 犬 is WK level 2 = stage 1, 大きい is WK level 1 = stage 1
    const creature = { baseWord: '犬', baseRank: 1500, modifier: { word: '大きい', rank: 700 } };
    const result = suggestStage(creature, 'creature');
    assert.strictEqual(result.stage, 1);
    assert.strictEqual(result.outlierPercent, 0);
  });

  it('suggests higher stage when words span stages', () => {
    // 猫 = WK15 = stage 3, check that result stage is >= 3
    const creature = { baseWord: '猫', baseRank: 1600, modifier: { word: '大きい', rank: 700 } };
    const result = suggestStage(creature, 'creature');
    assert.ok(result.stage >= 3);
    assert.ok(result.outlierPercent <= 20);
  });

  it('returns medianRank and wordStages', () => {
    const creature = { baseWord: '山', baseRank: 2000, modifier: { word: '大きい', rank: 700 } };
    const result = suggestStage(creature, 'creature');
    assert.strictEqual(typeof result.medianRank, 'number');
    assert.ok(result.medianRank > 0);
    assert.ok(Array.isArray(result.wordStages));
    assert.strictEqual(result.wordStages.length, 2);
    assert.ok(result.wordStages[0].strictStage != null);
  });

  it('handles single-word move', () => {
    const move = { name: '走る', rank: 400 };
    const result = suggestStage(move, 'move');
    assert.strictEqual(result.stage, 1); // 走る is WK level 5 = stage 1
    assert.strictEqual(result.outlierPercent, 0);
    assert.strictEqual(result.wordStages.length, 1);
  });

  it('handles content with no scorable words', () => {
    const item = { components: [] };
    const result = suggestStage(item, 'item');
    assert.strictEqual(result.stage, 1);
    assert.strictEqual(result.outlierPercent, 0);
    assert.strictEqual(result.medianRank, 0);
  });
});

// ── getStageReport ──────────────────────────────────────────────────

describe('getStageReport', () => {
  it('returns report with expected shape', () => {
    const report = getStageReport(1);
    assert.strictEqual(report.stage, 1);
    assert.strictEqual(typeof report.totalWords, 'number');
    assert.strictEqual(typeof report.outlierCount, 'number');
    assert.strictEqual(typeof report.outlierPercent, 'number');
    assert.strictEqual(typeof report.medianRank, 'number');
    assert.ok(Array.isArray(report.creatures));
    assert.ok(Array.isArray(report.moves));
    assert.ok(Array.isArray(report.items));
    assert.ok(Array.isArray(report.areas));
  });

  it('returns matching stage number', () => {
    const report = getStageReport(5);
    assert.strictEqual(report.stage, 5);
  });

  it('returns zero outlier percent when no content', () => {
    // Before tagging, no content has stage assigned, so all reports are empty
    const report = getStageReport(1);
    // totalWords should be 0 since nothing is tagged yet
    // outlierPercent should be 0 when no words
    assert.strictEqual(report.outlierPercent, 0);
  });
});

// ── getFullReport ───────────────────────────────────────────────────

describe('getFullReport', () => {
  it('returns array of 10 stage reports', () => {
    const reports = getFullReport();
    assert.strictEqual(reports.length, 10);
    assert.strictEqual(reports[0].stage, 1);
    assert.strictEqual(reports[9].stage, 10);
  });

  it('each report has the expected shape', () => {
    const reports = getFullReport();
    for (const r of reports) {
      assert.ok('stage' in r);
      assert.ok('totalWords' in r);
      assert.ok('outlierCount' in r);
      assert.ok('outlierPercent' in r);
      assert.ok('medianRank' in r);
    }
  });
});
