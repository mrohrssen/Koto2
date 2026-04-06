// tests/integration/dialogue-bootstrap.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestTmpDir } from '../helpers/tmp.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('dialogue bootstrap integration', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await createTestTmpDir();
  });

  after(async () => {
    await tmpDir.cleanup();
  });

  it('tokenizer + filter pipeline works end-to-end', async () => {
    const { tokenize } = await import('../../src/tokenizer.js');
    const { isLineEligible, filterEligibleScripts } = await import('../../src/game/dialogue-filter.js');

    // Tokenize a line
    const tokens = tokenize('こんにちは！');
    const contentWords = tokens
      .filter(t => !/^[\p{P}\p{S}\s]+$/u.test(t.surface))
      .map(t => t.baseForm);

    const line = { text: 'こんにちは！', _tokens: tokens, _contentWords: contentWords };

    // At 0 known words, a single-word line should be eligible (i+1)
    assert.equal(isLineEligible(line, new Set()), true);

    // Build a script and filter
    const scripts = [{ id: 'test', lines: [line] }];
    const eligible = filterEligibleScripts(scripts, new Set());
    assert.equal(eligible.length, 1);
  });

  it('word dictionary loads and overlays game data', async () => {
    const { loadWordDictionary } = await import('../../src/game/word-dictionary.js');

    const dataDir = join(tmpDir.path, 'data');
    mkdirSync(dataDir, { recursive: true });

    writeFileSync(join(dataDir, 'dictionary.json'), JSON.stringify({
      '猫': { reading: 'ねこ', definitions: [{ en: 'cat', primary: true }] },
    }));

    writeFileSync(join(dataDir, 'glue-words.json'), JSON.stringify([
      { word: 'わたし', reading: 'わたし', en: 'I/me', priority: 1 },
    ]));

    const dict = loadWordDictionary(dataDir);
    assert.ok(dict.has('猫'), 'should have base dictionary entry');
    assert.ok(dict.has('わたし'), 'should have glue word overlay');
    assert.equal(dict.get('わたし').definitions[0].en, 'I/me');
  });

  it('dialogue filter correctly gates multi-sentence lines', async () => {
    const { tokenize } = await import('../../src/tokenizer.js');
    const { isLineEligible } = await import('../../src/game/dialogue-filter.js');

    // A two-sentence line: "こんにちは！いっしょに いく？"
    const tokens = tokenize('こんにちは！一緒に行く？');
    const line = {
      text: 'こんにちは！一緒に行く？',
      _tokens: tokens,
      _contentWords: tokens.filter(t => !/^[\p{P}\p{S}\s]+$/u.test(t.surface)).map(t => t.baseForm),
    };

    // With only particles known, sentence 1 has 1 unknown (こんにちは) — OK
    // But sentence 2 has 2+ unknowns (一緒, 行く) — NOT OK
    const known = new Set(['に']);
    assert.equal(isLineEligible(line, known), false);

    // With more words known, both sentences pass
    const known2 = new Set(['に', '行く']);
    assert.equal(isLineEligible(line, known2), true);
  });

  it('CID script selection uses FSRS known words', async () => {
    const { getKnownWordsFromFsrs } = await import('../../src/game/bootstrap/word-knowledge.js');
    const { filterEligibleScripts, selectCidScript } = await import('../../src/game/dialogue-filter.js');
    const { loadDialoguePools, getCidScripts } = await import('../../src/game/dialogue-loader.js');

    loadDialoguePools(join(process.cwd(), 'data'));

    // With no FSRS data, getKnownWordsFromFsrs returns empty array
    const known = getKnownWordsFromFsrs('test-user-nonexistent');
    assert.ok(Array.isArray(known), 'returns array');

    const knownSet = new Set(known);
    const scripts = getCidScripts();
    const eligible = filterEligibleScripts(scripts, knownSet);

    // At 0 known words, at least the simplest script should be eligible
    assert.ok(eligible.length > 0, 'at least one script eligible at 0 known words');

    const selected = selectCidScript(eligible, knownSet, []);
    assert.ok(selected, 'a script is selected');
    assert.ok(selected.lines.length > 0, 'selected script has lines');
  });

  it('real dialogue files load and filter correctly', async () => {
    const { loadDialoguePools, getCidScripts } = await import('../../src/game/dialogue-loader.js');
    const { filterEligibleScripts, selectCidScript } = await import('../../src/game/dialogue-filter.js');

    // Load real dialogue data
    loadDialoguePools(join(process.cwd(), 'data'));
    const scripts = getCidScripts();
    assert.ok(scripts.length > 0, 'should have CID scripts loaded');

    // At 0 known words, at least the simplest script should be eligible
    const eligible = filterEligibleScripts(scripts, new Set());
    assert.ok(eligible.length > 0, 'at least one script should be eligible at 0 known words');

    // Select should return the simplest one
    const selected = selectCidScript(eligible, new Set(), []);
    assert.ok(selected, 'should select a CID script');
    assert.ok(selected.id, 'selected script should have an id');
  });
});
