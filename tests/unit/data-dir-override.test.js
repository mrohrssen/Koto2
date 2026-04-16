import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getDataDir, setDataDirForTest, resetDataDirForTest, dataPath } from '../../src/data-dir.js';

describe('data-dir override', () => {
  afterEach(() => {
    resetDataDirForTest();
  });

  it('returns default data dir when no override set', () => {
    const dir = getDataDir();
    assert.ok(dir, 'should return a non-empty path');
    assert.ok(!dir.includes('tmp'), 'should not be a temp dir by default');
  });

  it('returns overridden dir after setDataDirForTest', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'koto-data-dir-test-'));
    try {
      setDataDirForTest(tmp);
      assert.equal(getDataDir(), tmp);
      assert.ok(dataPath('test.json').startsWith(tmp));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('reverts to default after resetDataDirForTest', async () => {
    const defaultDir = getDataDir();
    const tmp = await mkdtemp(join(tmpdir(), 'koto-data-dir-test-'));
    try {
      setDataDirForTest(tmp);
      assert.equal(getDataDir(), tmp);
      resetDataDirForTest();
      assert.equal(getDataDir(), defaultDir);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('creates the directory if it does not exist', async () => {
    const tmp = join(tmpdir(), `koto-data-dir-test-${Date.now()}`);
    try {
      setDataDirForTest(tmp);
      assert.equal(getDataDir(), tmp);
      // Directory was auto-created by setDataDirForTest
      const { existsSync } = await import('node:fs');
      assert.ok(existsSync(tmp));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
