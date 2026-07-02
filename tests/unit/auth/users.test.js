import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createUser, createUserRecord, findUserByUsername,
  findUserById, createInviteCode, useInviteCode, updateUserKeys, migrateAiConsentForExistingUsers,
  recordKanjiKombatRun, getKanjiKombatLeaderboard
} from '../../../src/auth/users.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import { decryptKeys, encryptKeys } from '../../../src/auth/crypto.js';

describe('auth/users', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'koto-auth-users-'));
    setDataDirForTest(dir);
    resetDbForTest();
  });

  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a user with hashed password', async () => {
    const user = await createUser('takeshi', 'pass123');
    assert.ok(user.id.startsWith('u_'));
    assert.equal(user.username, 'takeshi');
    assert.ok(user.passwordHash.startsWith('$2b$'));
    assert.ok(user.createdAt);
  });

  it('rejects duplicate usernames', async () => {
    await createUser('takeshi', 'pass123');
    await assert.rejects(
      () => createUser('takeshi', 'pass456'),
      { message: 'Username already taken' }
    );
  });

  it('finds user by username', async () => {
    await createUser('takeshi', 'pass123');
    const found = findUserByUsername('takeshi');
    assert.equal(found.username, 'takeshi');
  });

  it('finds user by id', async () => {
    const user = await createUser('takeshi', 'pass123');
    const found = findUserById(user.id);
    assert.equal(found.username, 'takeshi');
  });

  it('creates and uses invite codes', () => {
    const code = createInviteCode('secret123');
    assert.ok(code.startsWith('NEO-TOKYO-'));

    const result = useInviteCode(code, 'u_abc');
    assert.equal(result, true);

    // Can't reuse
    const result2 = useInviteCode(code, 'u_def');
    assert.equal(result2, false);
  });

  it('rejects invalid invite codes', () => {
    const result = useInviteCode('FAKE-CODE', 'u_abc');
    assert.equal(result, false);
  });

  it('updates user API keys', async () => {
    const user = await createUser('takeshi', 'pass123');
    const encryptionKey = 'b'.repeat(64);
    updateUserKeys(user.id, { aiApiKey: 'test-key' }, encryptionKey);

    const updated = findUserById(user.id);
    assert.ok(updated.encryptedApiKeys);
    assert.notEqual(updated.encryptedApiKeys, 'test-key');
  });

  it('migrates users without aiDataSharingConsent in encrypted keys', async () => {
    const encryptionKey = 'c'.repeat(64);
    const user = await createUser('legacy', 'pass123');
    updateUserKeys(user.id, { aiApiKey: 'legacy-key', aiProvider: 'openai' }, encryptionKey);

    const result = migrateAiConsentForExistingUsers({ encryptionKey });
    assert.equal(result.totalUsers, 1);
    assert.equal(result.migratedUsers, 1);
    assert.equal(result.skippedUsers, 0);

    const migrated = findUserById(user.id);
    const keys = decryptKeys(migrated.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiApiKey, 'legacy-key');
    assert.equal(keys.aiProvider, 'openai');
    assert.equal(keys.aiDataSharingConsent, true);
  });

  it('migrates users without aiConversationsEnabled to disabled by default', async () => {
    const encryptionKey = 'e'.repeat(64);
    const user = await createUser('legacydialogue', 'pass123');
    updateUserKeys(user.id, { aiDataSharingConsent: true }, encryptionKey);

    const result = migrateAiConsentForExistingUsers({ encryptionKey });
    assert.equal(result.totalUsers, 1);
    assert.equal(result.migratedUsers, 1);

    const migrated = findUserById(user.id);
    const keys = decryptKeys(migrated.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiDataSharingConsent, true);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('disables explicit aiConversationsEnabled true for non-debug users during migration', async () => {
    const encryptionKey = 'a'.repeat(64);
    await createUserRecord({
      id: 'u_dialogue_true',
      username: 'dialoguetrue',
      passwordHash: 'hash',
      encryptedApiKeys: encryptKeys({
        aiDataSharingConsent: true,
        aiConversationsEnabled: true
      }, encryptionKey),
      createdAt: '2026-01-04T00:00:00.000Z'
    });

    migrateAiConsentForExistingUsers({ encryptionKey });

    const user = findUserById('u_dialogue_true');
    const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('does not overwrite explicit aiConversationsEnabled false', async () => {
    const encryptionKey = 'f'.repeat(64);
    await createUserRecord({
      id: 'u_dialogue_false',
      username: 'dialoguefalse',
      passwordHash: 'hash',
      encryptedApiKeys: encryptKeys({
        aiDataSharingConsent: true,
        aiConversationsEnabled: false
      }, encryptionKey),
      createdAt: '2026-01-03T00:00:00.000Z'
    });

    migrateAiConsentForExistingUsers({ encryptionKey });

    const user = findUserById('u_dialogue_false');
    const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('migrates users with no encrypted keys and does not overwrite explicit consent', async () => {
    const encryptionKey = 'd'.repeat(64);
    await createUserRecord({ id: 'u_no_keys', username: 'nokeys', passwordHash: 'hash', encryptedApiKeys: null, createdAt: '2026-01-01T00:00:00.000Z' });
    await createUserRecord({ id: 'u_false', username: 'explicitfalse', passwordHash: 'hash', encryptedApiKeys: encryptKeys({ aiDataSharingConsent: false }, encryptionKey), createdAt: '2026-01-02T00:00:00.000Z' });

    const result = migrateAiConsentForExistingUsers({ encryptionKey });
    assert.equal(result.totalUsers, 2);
    assert.equal(result.migratedUsers, 2);
    assert.equal(result.skippedUsers, 0);

    const noKeys = findUserById('u_no_keys');
    const noKeysPayload = decryptKeys(noKeys.encryptedApiKeys, encryptionKey);
    assert.equal(noKeysPayload.aiDataSharingConsent, true);

    const explicitFalse = findUserById('u_false');
    const explicitFalsePayload = decryptKeys(explicitFalse.encryptedApiKeys, encryptionKey);
    assert.equal(explicitFalsePayload.aiDataSharingConsent, false);
    assert.equal(explicitFalsePayload.aiConversationsEnabled, false);
  });

  it('records a Kanji Kombat run wave from waves cleared fallback', async () => {
    const now = Date.now();
    await createUserRecord({ id: 'u_kk', username: 'kombat', passwordHash: 'hash', createdAt: new Date(now).toISOString() });

    const recorded = recordKanjiKombatRun('u_kk', {
      wavesCleared: 3,
      completedAt: now
    });

    assert.equal(recorded.wave, 4);
    const board = getKanjiKombatLeaderboard('24h', 'u_kk', undefined, { now });
    assert.deepEqual(board.currentUser, { rank: 1, wave: 4 });
  });

  it('ranks each user by best Kanji Kombat wave in rolling periods', async () => {
    const now = Date.now();
    await createUserRecord({ id: 'u_alpha', username: 'alpha', passwordHash: 'hash' });
    await createUserRecord({ id: 'u_beta', username: 'beta', passwordHash: 'hash' });
    await createUserRecord({ id: 'u_gamma', username: 'gamma', passwordHash: 'hash' });

    recordKanjiKombatRun('u_alpha', { wave: 5, wavesCleared: 4, completedAt: now - 2 * 60 * 60 * 1000 });
    recordKanjiKombatRun('u_alpha', { wave: 2, wavesCleared: 1, completedAt: now - 1 * 60 * 60 * 1000 });
    recordKanjiKombatRun('u_beta', { wave: 5, wavesCleared: 4, completedAt: now - 1 * 60 * 60 * 1000 });
    recordKanjiKombatRun('u_gamma', { wave: 8, wavesCleared: 7, completedAt: now - 25 * 60 * 60 * 1000 });

    const daily = getKanjiKombatLeaderboard('24h', 'u_beta', undefined, { now });
    assert.deepEqual(daily.entries, [
      { rank: 1, username: 'alpha', wave: 5 },
      { rank: 2, username: 'beta', wave: 5 }
    ]);
    assert.deepEqual(daily.currentUser, { rank: 2, wave: 5 });

    const weekly = getKanjiKombatLeaderboard('weekly', 'u_gamma', undefined, { now });
    assert.deepEqual(weekly.entries.map(entry => entry.username), ['gamma', 'alpha', 'beta']);
    assert.deepEqual(weekly.currentUser, { rank: 1, wave: 8 });
  });
});
