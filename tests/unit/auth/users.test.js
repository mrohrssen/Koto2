import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadUsers, saveUsers, createUser, findUserByUsername,
  findUserById, createInviteCode, useInviteCode, updateUserKeys
} from '../../../src/auth/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_FILE = join(__dirname, '../../.jrpg-users-test.json');

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
    updateUserKeys(user.id, { jpdbApiKey: 'test-key' }, encryptionKey, TEST_FILE);

    const updated = findUserById(user.id, TEST_FILE);
    assert.ok(updated.encryptedApiKeys);
    assert.notEqual(updated.encryptedApiKeys, 'test-key');
  });
});
