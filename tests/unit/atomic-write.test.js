import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileAtomicSync } from '../../src/atomic-write.js';

describe('writeFileAtomicSync', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'atomic-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes new file content', () => {
    const file = join(dir, 'out.json');
    writeFileAtomicSync(file, '{"a":1}');
    assert.equal(readFileSync(file, 'utf-8'), '{"a":1}');
  });

  it('replaces existing content and leaves no tmp file', () => {
    const file = join(dir, 'out.json');
    writeFileSync(file, 'old');
    writeFileAtomicSync(file, 'new');
    assert.equal(readFileSync(file, 'utf-8'), 'new');
    assert.equal(existsSync(`${file}.tmp`), false);
  });

  it('cleans up tmp file when rename target dir vanishes mid-write', () => {
    const file = join(dir, 'sub', 'out.json');
    assert.throws(() => writeFileAtomicSync(file, 'x')); // sub/ does not exist
    assert.equal(existsSync(`${file}.tmp`), false);
  });
});
