import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../../helpers/tmp.js';
import { resetDataDirForTest, setDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { loadUsers } from '../../../src/auth/users.js';
import { verifyPassword } from '../../../src/auth/crypto.js';
import {
  DEV_TEST_CREATURE_IDS,
  DEV_TEST_PASSWORD,
  DEV_TEST_USERNAME,
  seedDevTestUser,
  shouldAutoSeedDevTestUser
} from '../../../src/dev/dev-test-user.js';

let tmp;

describe('dev test user seeder', () => {
  afterEach(async () => {
    clearManagersForTest();
    resetDbForTest();
    resetDataDirForTest();
    if (tmp) {
      await tmp.cleanup();
      tmp = null;
    }
  });

  it('creates a registered devtester account with a progressed hub save', async () => {
    tmp = await createTestTmpDir('koto-dev-user-');
    const usersFile = join(tmp.path, '.jrpg-users.json');
    setDataDirForTest(tmp.path);

    const result = await seedDevTestUser({ dataDir: tmp.path, usersFile });

    assert.equal(result.username, DEV_TEST_USERNAME);
    assert.equal(result.created, true);
    assert.equal(result.saveWritten, true);

    const users = loadUsers(usersFile);
    const user = users.users.find(candidate => candidate.username === DEV_TEST_USERNAME);
    assert.ok(user, 'expected devtester user to be present');
    assert.equal(await verifyPassword(DEV_TEST_PASSWORD, user.passwordHash), true);

    const savePath = join(tmp.path, `.jrpg-save-${user.id}.json`);
    assert.equal(existsSync(savePath), true);

    const save = JSON.parse(readFileSync(savePath, 'utf8'));
    assert.equal(save.version, 2);
    assert.equal(save.player.name, 'DevTester');
    assert.equal(save.meta.prologueComplete, true);
    assert.equal(save.meta.tutorialStep, 6);
    assert.equal(save.meta.levels.highestUnlocked, 2);
    assert.deepEqual(save.meta.bossesDefeated, ['hinoneko']);
    assert.deepEqual(save.meta.creatureCollection, DEV_TEST_CREATURE_IDS);
    assert.deepEqual(Object.keys(save.meta.creatureCounts), DEV_TEST_CREATURE_IDS);
    assert.ok(Object.values(save.meta.creatureCounts).every(count => count === 1));
    assert.equal(save.run, null);
    assert.equal(save.combat, null);

    setDataDirForTest(tmp.path);
    const manager = getManager(user.id);
    assert.deepEqual(manager.meta.creatureCollection, DEV_TEST_CREATURE_IDS);
    assert.deepEqual(Object.keys(manager.meta.creatureCounts), DEV_TEST_CREATURE_IDS);
  });

  it('is idempotent and repairs the fixture save without duplicating users', async () => {
    tmp = await createTestTmpDir('koto-dev-user-');
    const usersFile = join(tmp.path, '.jrpg-users.json');
    setDataDirForTest(tmp.path);

    const first = await seedDevTestUser({ dataDir: tmp.path, usersFile });
    const second = await seedDevTestUser({ dataDir: tmp.path, usersFile });

    assert.equal(second.created, false);
    assert.equal(second.saveWritten, false);
    assert.equal(second.userId, first.userId);

    const users = loadUsers(usersFile);
    assert.equal(users.users.filter(user => user.username === DEV_TEST_USERNAME).length, 1);

    const save = JSON.parse(readFileSync(join(tmp.path, `.jrpg-save-${first.userId}.json`), 'utf8'));
    assert.equal(save.meta.levels.highestUnlocked, 2);
    assert.equal(save.meta.creatureCollection.length, 10);
  });

  it('only auto-seeds in local development', () => {
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: undefined, railwayEnvironment: undefined }), true);
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: 'development', railwayEnvironment: undefined }), true);
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: 'test', railwayEnvironment: undefined }), false);
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: 'production', railwayEnvironment: undefined }), false);
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: 'development', railwayEnvironment: 'dev' }), false);
    assert.equal(shouldAutoSeedDevTestUser({ nodeEnv: 'development', skipSeed: 'true' }), false);
  });
});
