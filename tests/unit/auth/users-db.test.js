import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import {
  createUserRecord, findUserById, findUserByUsername, deleteUserById,
  setUserPasswordHash, setUserEncryptedApiKeys, createInviteCode, useInviteCode,
  recordKanjiKombatRun, getKanjiKombatLeaderboard, addReview, getLeaderboard, loadUsers,
} from '../../../src/auth/users.js';

describe('users.js on sqlite', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'users-db-'));
    setDataDirForTest(dir);
    resetDbForTest();
  });
  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and finds users; duplicate username rejected', async () => {
    const user = await createUserRecord({ username: 'alice', password: 'secret123' });
    assert.equal(findUserById(user.id).username, 'alice');
    assert.equal(findUserByUsername('alice').id, user.id);
    await assert.rejects(
      () => createUserRecord({ username: 'alice', password: 'other1234' }),
      /Username already taken/
    );
  });

  it('invite codes are single-use', async () => {
    const code = createInviteCode(process.env.ADMIN_SECRET || 'x');
    const user = await createUserRecord({ username: 'bob', password: 'secret123' });
    assert.equal(useInviteCode(code, user.id), true);
    assert.equal(useInviteCode(code, user.id), false);
  });

  it('KK leaderboard ranks best wave per user, ties by earliest ts', async () => {
    const a = await createUserRecord({ username: 'aya', password: 'secret123' });
    const b = await createUserRecord({ username: 'ben', password: 'secret123' });
    const now = Date.now();
    recordKanjiKombatRun(a.id, { wave: 5, wavesCleared: 4, completedAt: now - 1000 });
    recordKanjiKombatRun(a.id, { wave: 3, wavesCleared: 2, completedAt: now - 500 });
    recordKanjiKombatRun(b.id, { wave: 5, wavesCleared: 4, completedAt: now - 2000 });
    const board = getKanjiKombatLeaderboard('24h', a.id);
    assert.equal(board.entries.length, 2);
    assert.equal(board.entries[0].username, 'ben'); // same wave, earlier ts
    assert.equal(board.entries[1].username, 'aya');
    assert.deepEqual(board.currentUser, { rank: 2, wave: 5 });
  });

  it('review leaderboard counts reviews in window', async () => {
    const a = await createUserRecord({ username: 'cara', password: 'secret123' });
    addReview(a.id);
    addReview(a.id);
    const board = getLeaderboard('daily', a.id);
    assert.equal(board.entries[0].username, 'cara');
    assert.equal(board.entries[0].count, 2);
    assert.deepEqual(board.currentUser, { rank: 1, count: 2 });
  });

  it('targeted mutations work and loadUsers dumps compat shape', async () => {
    const a = await createUserRecord({ username: 'dee', password: 'secret123' });
    setUserPasswordHash(a.id, 'newhash');
    setUserEncryptedApiKeys(a.id, { iv: 'i', data: 'd' });
    const dump = loadUsers();
    const row = dump.users.find(u => u.id === a.id);
    assert.equal(row.passwordHash, 'newhash');
    assert.deepEqual(row.encryptedApiKeys, { iv: 'i', data: 'd' });
    assert.ok(Array.isArray(dump.inviteCodes));
    deleteUserById(a.id);
    assert.equal(findUserById(a.id), null);
  });

  it('bot round-trip: isBot and botProfile survive findUserById and loadUsers', async () => {
    const bot = await createUserRecord({
      username: 'botfriend',
      password: 'secret123',
      isBot: true,
      botProfile: { style: 'aggro' },
    });
    assert.equal(bot.isBot, true);
    assert.deepEqual(bot.botProfile, { style: 'aggro' });

    const byId = findUserById(bot.id);
    assert.equal(byId.isBot, true);
    assert.deepEqual(byId.botProfile, { style: 'aggro' });

    const dump = loadUsers();
    const row = dump.users.find(u => u.id === bot.id);
    assert.equal(row.isBot, true);
    assert.deepEqual(row.botProfile, { style: 'aggro' });
  });
});
