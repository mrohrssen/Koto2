// tests/unit/db.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';
import { getDb, resetDbForTest, migrateUsersJsonIfNeeded } from '../../src/db.js';

describe('db.js', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-'));
    setDataDirForTest(dir);
    resetDbForTest();
  });
  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates schema and enables WAL', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    for (const t of ['users', 'invite_codes', 'reviews', 'kanji_kombat_runs']) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  });

  it('imports legacy users JSON exactly once', () => {
    const jsonPath = join(dir, '.jrpg-users.json');
    writeFileSync(jsonPath, JSON.stringify({
      users: [{
        id: 'u_1', username: 'alice', passwordHash: 'h', createdAt: '2026-01-01T00:00:00.000Z',
        encryptedApiKeys: { iv: 'x', data: 'y' },
        reviews: [{ ts: 1000 }],
        kanjiKombatRuns: [{ ts: 2000, wave: 5, wavesCleared: 4 }],
      }],
      inviteCodes: [{ code: 'NEO-TOKYO-abc', usedBy: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    }));

    const first = migrateUsersJsonIfNeeded(jsonPath);
    assert.deepEqual(first, { migrated: true, users: 1 });

    const db = getDb();
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM invite_codes').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM reviews').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM kanji_kombat_runs').get().c, 1);
    assert.equal(JSON.parse(db.prepare('SELECT encrypted_api_keys k FROM users').get().k).iv, 'x');

    const second = migrateUsersJsonIfNeeded(jsonPath);
    assert.equal(second.migrated, false);
  });

  it('no-ops when JSON file is absent', () => {
    assert.deepEqual(migrateUsersJsonIfNeeded(join(dir, 'nope.json')), { migrated: false, users: 0 });
  });
});
