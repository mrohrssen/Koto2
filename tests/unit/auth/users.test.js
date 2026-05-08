import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadUsers, saveUsers, createUser, findUserByUsername,
  findUserById, createInviteCode, useInviteCode, updateUserKeys, migrateAiConsentForExistingUsers
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
    assert.equal(result.migratedUsers, 1);
    assert.equal(result.skippedUsers, 0);

    const data = loadUsers(TEST_FILE);
    const noKeys = data.users.find(u => u.id === 'u_no_keys');
    const noKeysPayload = decryptKeys(noKeys.encryptedApiKeys, encryptionKey);
    assert.equal(noKeysPayload.aiDataSharingConsent, true);

    const explicitFalse = data.users.find(u => u.id === 'u_false');
    const explicitFalsePayload = decryptKeys(explicitFalse.encryptedApiKeys, encryptionKey);
    assert.equal(explicitFalsePayload.aiDataSharingConsent, false);
  });
});
