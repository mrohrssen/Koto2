import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestTmpDir } from '../../helpers/tmp.js';

const TEST_USER_ID = 'test-user';
let tmp;

describe('Vocab Manager New Cache Format', () => {
  before(async () => {
    tmp = await createTestTmpDir();
  });

  after(async () => {
    await tmp.cleanup();
  });

  it('should support lastFullParse timestamp in cache', async () => {
    const { configureVocabManager, getVocabManagerStats, clearVocabManagerCache } = await import('../../../src/game/vocab-manager.js');

    configureVocabManager({ cacheDir: tmp.path + '/' });
    clearVocabManagerCache(TEST_USER_ID);

    const stats = getVocabManagerStats(TEST_USER_ID);
    assert.ok('lastFullParse' in stats, 'stats should include lastFullParse');
  });
});
