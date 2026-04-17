// tests/unit/word-knowledge-paths.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../helpers/tmp.js';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';

describe('word-knowledge save/load honors configured data dir', () => {
  let tmp, wk;

  before(async () => {
    tmp = await createTestTmpDir('word-knowledge-paths-');
    setDataDirForTest(tmp.path);
    wk = await import('../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => {
    resetDataDirForTest();
    await tmp.cleanup();
  });

  it('saveWordKnowledge writes into the configured data dir', () => {
    const knowledge = wk.createWordKnowledge('path-test-user');
    wk.registerExposure(knowledge, '森');
    wk.saveWordKnowledge(knowledge);

    const expected = join(tmp.path, 'word-knowledge-path-test-user.json');
    assert.ok(existsSync(expected), `expected file at ${expected}`);

    const parsed = JSON.parse(readFileSync(expected, 'utf-8'));
    assert.equal(parsed.userId, 'path-test-user');
    assert.equal(parsed.seen['森'].exposures, 1);
  });

  it('loadWordKnowledge reads from the configured data dir', () => {
    const loaded = wk.loadWordKnowledge('path-test-user');
    assert.ok(loaded);
    assert.equal(loaded.seen['森'].exposures, 1);
  });

  it('loadWordKnowledge returns null for missing users', () => {
    assert.equal(wk.loadWordKnowledge('nobody-here'), null);
  });
});
