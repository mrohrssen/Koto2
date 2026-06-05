import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadUsers, saveUsers, createUser, findUserByUsername,
  findUserById, createInviteCode, useInviteCode, updateUserKeys, migrateAiConsentForExistingUsers,
  recordKanjiKombatRun, getKanjiKombatLeaderboard
} from '../../../src/auth/users.js';
import { decryptKeys, encryptKeys } from '../../../src/auth/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_FILE = join(__dirname, '../../../.jrpg-users-test.json');

describe('auth/users', () => {
  beforeEach(() => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  it('creates a user with hashed password', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    assert.ok(user.id.startsWith('u_'));
    assert.equal(user.username, 'takeshi');
    assert.ok(user.passwordHash.startsWith('$2b$'));
    assert.ok(user.createdAt);
  });

  it('rejects duplicate usernames', async () => {
    await createUser('takeshi', 'pass123', TEST_FILE);
    await assert.rejects(
      () => createUser('takeshi', 'pass456', TEST_FILE),
      { message: 'Username already taken' }
    );
  });

  it('finds user by username', async () => {
    await createUser('takeshi', 'pass123', TEST_FILE);
    const found = findUserByUsername('takeshi', TEST_FILE);
    assert.equal(found.username, 'takeshi');
  });

  it('finds user by id', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    const found = findUserById(user.id, TEST_FILE);
    assert.equal(found.username, 'takeshi');
  });

  it('creates and uses invite codes', () => {
    const code = createInviteCode('secret123', TEST_FILE);
    assert.ok(code.startsWith('NEO-TOKYO-'));

    const result = useInviteCode(code, 'u_abc', TEST_FILE);
    assert.equal(result, true);

    // Can't reuse
    const result2 = useInviteCode(code, 'u_def', TEST_FILE);
    assert.equal(result2, false);
  });

  it('rejects invalid invite codes', () => {
    const result = useInviteCode('FAKE-CODE', 'u_abc', TEST_FILE);
    assert.equal(result, false);
  });

  it('updates user API keys', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    const encryptionKey = 'b'.repeat(64);
    updateUserKeys(user.id, { aiApiKey: 'test-key' }, encryptionKey, TEST_FILE);

    const updated = findUserById(user.id, TEST_FILE);
    assert.ok(updated.encryptedApiKeys);
    assert.notEqual(updated.encryptedApiKeys, 'test-key');
  });

  it('migrates users without aiDataSharingConsent in encrypted keys', async () => {
    const encryptionKey = 'c'.repeat(64);
    const user = await createUser('legacy', 'pass123', TEST_FILE);
    updateUserKeys(user.id, { aiApiKey: 'legacy-key', aiProvider: 'openai' }, encryptionKey, TEST_FILE);

    const result = migrateAiConsentForExistingUsers({ filePath: TEST_FILE, encryptionKey });
    assert.equal(result.totalUsers, 1);
    assert.equal(result.migratedUsers, 1);
    assert.equal(result.skippedUsers, 0);

    const migrated = findUserById(user.id, TEST_FILE);
    const keys = decryptKeys(migrated.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiApiKey, 'legacy-key');
    assert.equal(keys.aiProvider, 'openai');
    assert.equal(keys.aiDataSharingConsent, true);
  });

  it('migrates users without aiConversationsEnabled to disabled by default', async () => {
    const encryptionKey = 'e'.repeat(64);
    const user = await createUser('legacydialogue', 'pass123', TEST_FILE);
    updateUserKeys(user.id, { aiDataSharingConsent: true }, encryptionKey, TEST_FILE);

    const result = migrateAiConsentForExistingUsers({ filePath: TEST_FILE, encryptionKey });
    assert.equal(result.totalUsers, 1);
    assert.equal(result.migratedUsers, 1);

    const migrated = findUserById(user.id, TEST_FILE);
    const keys = decryptKeys(migrated.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiDataSharingConsent, true);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('disables explicit aiConversationsEnabled true for non-debug users during migration', () => {
    const encryptionKey = 'a'.repeat(64);
    saveUsers({
      users: [{
        id: 'u_dialogue_true',
        username: 'dialoguetrue',
        passwordHash: 'hash',
        encryptedApiKeys: encryptKeys({
          aiDataSharingConsent: true,
          aiConversationsEnabled: true
        }, encryptionKey),
        createdAt: '2026-01-04T00:00:00.000Z'
      }],
      inviteCodes: []
    }, TEST_FILE);

    migrateAiConsentForExistingUsers({ filePath: TEST_FILE, encryptionKey });

    const data = loadUsers(TEST_FILE);
    const user = data.users.find(u => u.id === 'u_dialogue_true');
    const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('does not overwrite explicit aiConversationsEnabled false', () => {
    const encryptionKey = 'f'.repeat(64);
    saveUsers({
      users: [{
        id: 'u_dialogue_false',
        username: 'dialoguefalse',
        passwordHash: 'hash',
        encryptedApiKeys: encryptKeys({
          aiDataSharingConsent: true,
          aiConversationsEnabled: false
        }, encryptionKey),
        createdAt: '2026-01-03T00:00:00.000Z'
      }],
      inviteCodes: []
    }, TEST_FILE);

    migrateAiConsentForExistingUsers({ filePath: TEST_FILE, encryptionKey });

    const data = loadUsers(TEST_FILE);
    const user = data.users.find(u => u.id === 'u_dialogue_false');
    const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
    assert.equal(keys.aiConversationsEnabled, false);
  });

  it('migrates users with no encrypted keys and does not overwrite explicit consent', () => {
    const encryptionKey = 'd'.repeat(64);
    saveUsers({
      users: [
        { id: 'u_no_keys', username: 'nokeys', passwordHash: 'hash', encryptedApiKeys: null, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'u_false', username: 'explicitfalse', passwordHash: 'hash', encryptedApiKeys: encryptKeys({ aiDataSharingConsent: false }, encryptionKey), createdAt: '2026-01-02T00:00:00.000Z' }
      ],
      inviteCodes: []
    }, TEST_FILE);

    const result = migrateAiConsentForExistingUsers({ filePath: TEST_FILE, encryptionKey });
    assert.equal(result.totalUsers, 2);
    assert.equal(result.migratedUsers, 2);
    assert.equal(result.skippedUsers, 0);

    const data = loadUsers(TEST_FILE);
    const noKeys = data.users.find(u => u.id === 'u_no_keys');
    const noKeysPayload = decryptKeys(noKeys.encryptedApiKeys, encryptionKey);
    assert.equal(noKeysPayload.aiDataSharingConsent, true);

    const explicitFalse = data.users.find(u => u.id === 'u_false');
    const explicitFalsePayload = decryptKeys(explicitFalse.encryptedApiKeys, encryptionKey);
    assert.equal(explicitFalsePayload.aiDataSharingConsent, false);
    assert.equal(explicitFalsePayload.aiConversationsEnabled, false);
  });

  it('records a Kanji Kombat run wave from waves cleared fallback', () => {
    const now = Date.now();
    saveUsers({
      users: [{ id: 'u_kk', username: 'kombat', passwordHash: 'hash', createdAt: new Date(now).toISOString() }],
      inviteCodes: []
    }, TEST_FILE);

    const recorded = recordKanjiKombatRun('u_kk', {
      wavesCleared: 3,
      completedAt: now
    }, TEST_FILE);

    assert.equal(recorded.wave, 4);
    const user = loadUsers(TEST_FILE).users[0];
    assert.deepEqual(user.kanjiKombatRuns, [{ ts: now, wave: 4, wavesCleared: 3 }]);
  });

  it('ranks each user by best Kanji Kombat wave in rolling periods', () => {
    const now = Date.now();
    saveUsers({
      users: [
        {
          id: 'u_alpha',
          username: 'alpha',
          passwordHash: 'hash',
          kanjiKombatRuns: [
            { ts: now - 2 * 60 * 60 * 1000, wave: 5, wavesCleared: 4 },
            { ts: now - 1 * 60 * 60 * 1000, wave: 2, wavesCleared: 1 }
          ]
        },
        {
          id: 'u_beta',
          username: 'beta',
          passwordHash: 'hash',
          kanjiKombatRuns: [{ ts: now - 1 * 60 * 60 * 1000, wave: 5, wavesCleared: 4 }]
        },
        {
          id: 'u_gamma',
          username: 'gamma',
          passwordHash: 'hash',
          kanjiKombatRuns: [{ ts: now - 25 * 60 * 60 * 1000, wave: 8, wavesCleared: 7 }]
        }
      ],
      inviteCodes: []
    }, TEST_FILE);

    const daily = getKanjiKombatLeaderboard('24h', 'u_beta', TEST_FILE, { now });
    assert.deepEqual(daily.entries, [
      { rank: 1, username: 'alpha', wave: 5 },
      { rank: 2, username: 'beta', wave: 5 }
    ]);
    assert.deepEqual(daily.currentUser, { rank: 2, wave: 5 });

    const weekly = getKanjiKombatLeaderboard('weekly', 'u_gamma', TEST_FILE, { now });
    assert.deepEqual(weekly.entries.map(entry => entry.username), ['gamma', 'alpha', 'beta']);
    assert.deepEqual(weekly.currentUser, { rank: 1, wave: 8 });
  });
});
