// tests/unit/admin-word-exposures.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let aggregateWordExposures, buildJpdbComparison, buildFrameComparison, loadJpdbCache, saveJpdbCache;

before(async () => {
  const mod = await import('../../src/routes/admin-word-exposures.js');
  aggregateWordExposures = mod.aggregateWordExposures;
  buildJpdbComparison = mod.buildJpdbComparison;
  buildFrameComparison = mod.buildFrameComparison;
  loadJpdbCache = mod.loadJpdbCache;
  saveJpdbCache = mod.saveJpdbCache;
});

describe('aggregateWordExposures', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'word-exp-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('aggregates exposures across multiple user files', () => {
    writeFileSync(join(tempDir, 'word-knowledge-user1.json'), JSON.stringify({
      userId: 'user1',
      seen: {
        '木': { exposures: 10, firstSeen: '2026-01-01T00:00:00Z' },
        '水': { exposures: 5, firstSeen: '2026-01-01T00:00:00Z' },
      },
    }));
    writeFileSync(join(tempDir, 'word-knowledge-user2.json'), JSON.stringify({
      userId: 'user2',
      seen: {
        '木': { exposures: 20, firstSeen: '2026-01-02T00:00:00Z' },
        '火': { exposures: 3, firstSeen: '2026-01-02T00:00:00Z' },
      },
    }));

    const dictionary = new Map();
    dictionary.set('木', { reading: 'き', definitions: [{ en: 'tree', primary: true }] });
    dictionary.set('水', { reading: 'みず', definitions: [{ en: 'water', primary: true }] });

    const result = aggregateWordExposures(tempDir, dictionary);

    assert.equal(result.totalUsers, 2);
    assert.equal(result.totalUniqueWords, 3);
    assert.equal(result.words[0].word, '木');
    assert.equal(result.words[0].totalExposures, 30);
    assert.equal(result.words[0].userCount, 2);
    assert.equal(result.words[0].reading, 'き');
    assert.equal(result.words[0].definition, 'tree');
    assert.equal(result.words[2].word, '火');
    assert.equal(result.words[2].reading, null);
    assert.equal(result.words[2].definition, null);
  });

  it('returns empty result when no files exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'word-exp-empty-'));
    try {
      const result = aggregateWordExposures(emptyDir, new Map());
      assert.equal(result.totalUsers, 0);
      assert.equal(result.totalUniqueWords, 0);
      assert.deepEqual(result.words, []);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('handles malformed JSON files gracefully', () => {
    const mixedDir = mkdtempSync(join(tmpdir(), 'word-exp-mixed-'));
    try {
      writeFileSync(join(mixedDir, 'word-knowledge-bad.json'), 'NOT JSON{{{');
      writeFileSync(join(mixedDir, 'word-knowledge-good.json'), JSON.stringify({
        userId: 'good',
        seen: { '山': { exposures: 7 } },
      }));
      const result = aggregateWordExposures(mixedDir, new Map());
      assert.equal(result.totalUsers, 1);
      assert.equal(result.totalUniqueWords, 1);
      assert.equal(result.words[0].word, '山');
      assert.equal(result.words[0].totalExposures, 7);
    } finally {
      rmSync(mixedDir, { recursive: true, force: true });
    }
  });
});

describe('buildJpdbComparison', () => {
  it('returns isDifferent: false when single token matches our word', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', 123, 456]],
    });
    assert.equal(result.isDifferent, false);
    assert.equal(result.jpdbSpelling, '食べる');
    assert.equal(result.jpdbReading, 'たべる');
  });

  it('returns isDifferent: true when headword differs', () => {
    const result = buildJpdbComparison('いらっしゃいませ', {
      tokens: [[0, 0, 27]],
      vocabulary: [['いらっしゃる', 'いらっしゃる', 100, 200]],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, 'いらっしゃる');
  });

  it('returns isDifferent: true with joined spelling for multi-token split', () => {
    const result = buildJpdbComparison('食べ物', {
      tokens: [[0, 0, 9], [1, 9, 3]],
      vocabulary: [['食べる', 'たべる', 1, 1], ['物', 'もの', 2, 2]],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, '食べる+物');
  });

  it('returns isDifferent: true with null spelling for empty response', () => {
    const result = buildJpdbComparison('テスト', {
      tokens: [],
      vocabulary: [],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, null);
    assert.equal(result.jpdbReading, null);
    assert.equal(result.jpdbDefinition, null);
  });

  it('extracts definition from meanings field (string array shape)', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', ['to eat', 'to consume']]],
    });
    assert.equal(result.jpdbDefinition, 'to eat');
  });

  it('extracts definition from meanings field (object array shape with glosses)', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', [{ glosses: ['to eat', 'to consume'] }]]],
    });
    assert.equal(result.jpdbDefinition, 'to eat, to consume');
  });
});

describe('buildFrameComparison', () => {
  it('detects spelling difference between Sudachi and JPDB tokens', () => {
    const frame = {
      raw: 'テスト',
      tokens: [{ surface: 'すみません', base: 'すみません', reading: 'すみません' }],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 15]],
      vocabulary: [['済みません', 'すみません', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, true);
    assert.ok(result.diffs.length > 0);
    assert.equal(result.diffs[0].type, 'spelling');
  });

  it('returns no diffs when tokens match', () => {
    const frame = {
      raw: 'テスト',
      tokens: [{ surface: '食べる', base: '食べる', reading: 'たべる' }],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, false);
    assert.equal(result.diffs.length, 0);
  });

  it('detects merge diff when Sudachi has more content tokens than JPDB', () => {
    const frame = {
      raw: 'テスト',
      tokens: [
        { surface: '食べ', base: '食べ', reading: 'たべ' },      // extra Sudachi piece
        { surface: '物', base: '物', reading: 'もの' },           // extra Sudachi piece
        { surface: 'する', base: 'する', reading: 'する' },       // matches JPDB's second token
      ],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 9], [1, 9, 6]],
      vocabulary: [['食べ物', 'たべもの', 1, 1], ['する', 'する', 2, 2]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, true);
    const mergeDiffs = result.diffs.filter(d => d.type === 'merge');
    assert.equal(mergeDiffs.length, 1, 'exactly one merge diff should fire via lookahead');
    assert.deepEqual(mergeDiffs[0].sudachi, ['物'], 'merged Sudachi pieces should be captured');
    assert.equal(mergeDiffs[0].jpdb, 'する', 'merge diff should record the JPDB token that triggered merge');
  });

  it('skips slot tokens in comparison', () => {
    const frame = {
      raw: '{item}をください',
      tokens: [
        { slot: 'item' },
        { surface: 'を' },
        { surface: 'ください', base: 'くださる', reading: 'ください' },
      ],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 21]],
      vocabulary: [['くださる', 'くださる', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, false);
    assert.equal(result.diffs.length, 0);
  });
});

describe('JPDB cache', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jpdb-cache-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty object for missing cache file', () => {
    const result = loadJpdbCache(join(tempDir, 'nonexistent.json'));
    assert.deepEqual(result, {});
  });

  it('round-trips write then read', () => {
    const cachePath = join(tempDir, 'test-cache.json');
    const data = { 'word1': { spelling: 'a' }, 'word2': { spelling: 'b' } };
    saveJpdbCache(cachePath, data);
    const loaded = loadJpdbCache(cachePath);
    assert.deepEqual(loaded, data);
  });
});

describe('createWordExposureRoutes dictionary load', () => {
  it('loads the dictionary from the committed repo data dir, not from dataDir', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { default: createWordExposureRoutes } = await import('../../src/routes/admin-word-exposures.js');
    const express = (await import('express')).default;

    const tempDir = mkdtempSync(join(tmpdir(), 'word-exp-dict-'));
    // Seed a word-knowledge file in the tempDir (dataDir) so the aggregator has a user.
    writeFileSync(
      join(tempDir, 'word-knowledge-dict-test-user.json'),
      JSON.stringify({
        userId: 'dict-test-user',
        seen: {
          '水': { exposures: 4, firstSeen: '2026-01-01T00:00:00Z' },
        },
      })
    );

    // Do NOT write a dictionary.json into tempDir — the fix should load the real
    // committed dictionary from process.cwd()/data.

    const adminSecret = 'dict-test-secret';
    process.env.ADMIN_SECRET = adminSecret;

    const app = express();
    app.use('/api/admin', createWordExposureRoutes({
      dataDir: tempDir,
      framesPath: join(tempDir, 'nonexistent-frames.json'),
    }));

    const server = app.listen(0);
    try {
      const { port } = server.address();
      const res = await fetch(
        `http://127.0.0.1:${port}/api/admin/word-exposures`,
        { headers: { 'x-admin-secret': adminSecret } }
      );
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      const body = await res.json();
      assert.equal(body.totalUsers, 1);
      const water = body.words.find(w => w.word === '水');
      assert.ok(water, 'expected 水 in words');
      // The dictionary should have populated these — if not, the fix regressed.
      assert.ok(water.reading, `expected non-null reading for 水, got ${JSON.stringify(water.reading)}`);
      assert.ok(water.definition, `expected non-null definition for 水, got ${JSON.stringify(water.definition)}`);
    } finally {
      await new Promise(resolve => server.close(resolve));
      rmSync(tempDir, { recursive: true, force: true });
      delete process.env.ADMIN_SECRET;
    }
  });
});
