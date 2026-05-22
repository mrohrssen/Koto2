import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBotUsernameBatch,
  createBotUserRecord,
  listBotUsers
} from '../../../src/pvp/bot-account-service.js';
import { loadUsers } from '../../../src/auth/users.js';

describe('bot-account-service', () => {
  it('generates varied unique usernames', () => {
    const usernames = createBotUsernameBatch({ count: 100, seed: 'ranked-bots-v1', existingUsernames: new Set() });
    assert.equal(usernames.length, 100);
    assert.equal(new Set(usernames).size, 100);
    assert.ok(usernames.some(name => /^[a-z]+(?:19|20)\d\d$/.test(name)));
    assert.ok(usernames.some(name => /^[a-z]+$/.test(name)));
    assert.ok(usernames.some(name => /^[a-z]+\d{1,3}$/.test(name)));
    assert.ok(usernames.some(name => /^[A-Z][a-z]+[A-Z][a-z]+$/.test(name)));
  });

  it('creates users marked as bots without exposing plain passwords', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-bots-'));
    const usersFile = join(dir, 'users.json');
    const user = await createBotUserRecord({
      username: 'taro1995',
      strength: 3,
      seed: 'ranked-bots-v1:001',
      usersFile
    });
    assert.equal(user.username, 'taro1995');
    assert.equal(user.isBot, true);
    assert.equal(user.botProfile.strength, 3);
    assert.ok(user.passwordHash);
    assert.equal(user.password, undefined);

    const data = loadUsers(usersFile);
    assert.equal(data.users.length, 1);
    assert.equal(data.users[0].isBot, true);
    assert.deepStrictEqual(listBotUsers(usersFile).map(u => u.username), ['taro1995']);
  });
});
