import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getManager, saveManager, removeManager } from '../../../src/game/manager-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '../..');
const testSaveFile = join(BASE_DIR, '.jrpg-save-u_test123.json');

describe('manager-registry', () => {
  afterEach(() => {
    removeManager('u_test123');
    if (existsSync(testSaveFile)) unlinkSync(testSaveFile);
  });

  it('creates a new GameManager for unknown user', () => {
    const manager = getManager('u_test123');
    assert.ok(manager);
    assert.equal(manager.player, null);
  });

  it('returns same manager on repeated calls', () => {
    const m1 = getManager('u_test123');
    const m2 = getManager('u_test123');
    assert.strictEqual(m1, m2);
  });

  it('loads existing save file', () => {
    const saveData = {
      version: 2,
      player: { name: 'TestPlayer', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, chips: { loadout: [], inventory: [] } },
      meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');
    assert.equal(manager.player.name, 'TestPlayer');
  });

  it('saves manager state to user-specific file', () => {
    const manager = getManager('u_test123');
    manager.createPlayer('SaveTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
    saveManager('u_test123');

    assert.ok(existsSync(testSaveFile));
    const saved = JSON.parse(readFileSync(testSaveFile, 'utf-8'));
    assert.equal(saved.player.name, 'SaveTest');
    assert.equal(saved.version, 2);
  });
});
