import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadUsers } from '../../../src/auth/users.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { ensureRankedBotAccounts } from '../../../src/pvp/ranked-bot-seeder.js';

describe('ensureRankedBotAccounts', () => {
  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
  });

  it('creates persistent ranked bot users and team saves once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-ranked-bots-'));
    setDataDirForTest(dir);
    const usersFile = join(dir, '.jrpg-users.json');

    const first = await ensureRankedBotAccounts({ count: 5, usersFile });
    assert.equal(first.created, 5);
    assert.equal(first.totalBots, 5);

    const users = loadUsers(usersFile).users;
    const bots = users.filter(user => user.isBot === true);
    assert.equal(bots.length, 5);
    assert.deepEqual(
      bots.map(user => user.botProfile.seed),
      ['ranked-bots-v1:0', 'ranked-bots-v1:1', 'ranked-bots-v1:2', 'ranked-bots-v1:3', 'ranked-bots-v1:4']
    );

    for (const bot of bots) {
      const gm = getManager(bot.id);
      assert.ok(gm.meta.pvpTeams.some(Boolean));
      assert.ok(gm.meta.pvpRanked);
      assert.equal(existsSync(join(dir, `.jrpg-save-${bot.id}.json`)), true);
    }

    const second = await ensureRankedBotAccounts({ count: 5, usersFile });
    assert.equal(second.created, 0);
    assert.equal(second.totalBots, 5);
    assert.equal(loadUsers(usersFile).users.filter(user => user.isBot === true).length, 5);
  });
});
