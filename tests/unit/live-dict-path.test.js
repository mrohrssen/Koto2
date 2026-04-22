import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../helpers/tmp.js';

describe('live-dict-path', () => {
  let tmp;
  let originalCwd;

  beforeEach(async () => {
    tmp = await createTestTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmp.path);
    mkdirSync(join(tmp.path, 'data'), { recursive: true });
    writeFileSync(join(tmp.path, 'data', 'live-dictionary.json'), '{"repo":true}');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await tmp.cleanup();
  });

  it('returns repo path when volume dir is absent', async () => {
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir: join(tmp.path, 'no-such-dir') });
    const expected = join(tmp.path, 'data', 'live-dictionary.json');
    assert.equal(realpathSync(resolved), realpathSync(expected));
  });

  it('seeds volume file from repo on first boot when volume dir exists but file does not', async () => {
    const volumeDir = join(tmp.path, 'volume');
    mkdirSync(volumeDir);
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir });
    assert.equal(resolved, join(volumeDir, 'live-dictionary.json'));
    assert.ok(existsSync(join(volumeDir, 'live-dictionary.json')), 'volume file should be seeded');
    assert.equal(readFileSync(resolved, 'utf-8'), '{"repo":true}');
  });

  it('returns existing volume file without re-seeding', async () => {
    const volumeDir = join(tmp.path, 'volume');
    mkdirSync(volumeDir);
    writeFileSync(join(volumeDir, 'live-dictionary.json'), '{"volume":true}');
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir });
    assert.equal(resolved, join(volumeDir, 'live-dictionary.json'));
    assert.equal(readFileSync(resolved, 'utf-8'), '{"volume":true}');
  });

  it('throws if neither volume nor repo file exists', async () => {
    const volumeDir = join(tmp.path, 'no-such-dir');
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    // remove repo file
    const fs = await import('node:fs');
    fs.unlinkSync(join(tmp.path, 'data', 'live-dictionary.json'));
    assert.throws(() => resolveLiveDictPath({ volumeDir }), /No live-dictionary/);
  });
});
