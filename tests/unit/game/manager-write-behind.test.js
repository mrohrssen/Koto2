import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import {
  getManager, saveManager, flushManager, flushAllDirty,
  evictIdleManagers, removeManager, clearManagersForTest, getSaveFilePath,
} from '../../../src/game/manager-registry.js';

const USER = 'wb-user';

describe('write-behind manager saves', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-'));
    setDataDirForTest(dir);
    clearManagersForTest();
  });
  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saveManager marks dirty without writing; flushManager writes', () => {
    getManager(USER);
    saveManager(USER);
    assert.equal(existsSync(getSaveFilePath(USER)), false);
    flushManager(USER);
    assert.equal(existsSync(getSaveFilePath(USER)), true);
  });

  it('flushAllDirty persists every dirty manager once', () => {
    getManager('wb-a'); saveManager('wb-a');
    getManager('wb-b'); saveManager('wb-b');
    flushAllDirty();
    assert.equal(existsSync(getSaveFilePath('wb-a')), true);
    assert.equal(existsSync(getSaveFilePath('wb-b')), true);
  });

  it('removeManager flushes dirty state before deleting', () => {
    const gm = getManager(USER);
    gm.meta.crystals = 42;
    saveManager(USER);
    removeManager(USER);
    const stored = JSON.parse(readFileSync(getSaveFilePath(USER), 'utf-8'));
    assert.equal(stored.meta.crystals, 42);
  });

  it('evictIdleManagers flushes and evicts only idle managers', () => {
    const gm = getManager(USER);
    gm.meta.crystals = 7;
    saveManager(USER);
    const evicted = evictIdleManagers({ now: Date.now() + 31 * 60 * 1000 });
    assert.equal(evicted, 1);
    const stored = JSON.parse(readFileSync(getSaveFilePath(USER), 'utf-8'));
    assert.equal(stored.meta.crystals, 7);
    // fresh access reloads from disk
    const reloaded = getManager(USER);
    assert.equal(reloaded.meta.crystals, 7);
  });

  it('recent activity prevents eviction', () => {
    getManager(USER);
    const evicted = evictIdleManagers({ now: Date.now() + 60 * 1000 });
    assert.equal(evicted, 0);
  });
});
