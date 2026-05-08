import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';

describe('generate-item-icons CLI', () => {
  it('accepts cooking recipes as an icon source in dry-run mode', () => {
    const result = spawnSync('node', [
      'scripts/generate-item-icons.mjs',
      '--source', 'recipes',
      '--background', 'white',
      '--batch', '0',
      '--dry-run',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /Loaded 200 recipes from .*data\/cooking\/recipes\.json/);
    assert.match(result.stderr, /Miso soup/);
    assert.match(result.stderr, /Dashi/);
  });
});
