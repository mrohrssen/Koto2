import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../helpers/tmp.js';
import { simpleGit } from 'simple-git';

describe('admin-dictionary-sync', () => {
  let tmp;
  let originRepo;
  let workingRepo;
  let liveDictPath;

  beforeEach(async () => {
    tmp = await createTestTmpDir();

    // Create a bare "origin" repo
    originRepo = join(tmp.path, 'origin.git');
    mkdirSync(originRepo);
    await simpleGit(originRepo).init(true);

    // Create the working repo that the app will clone
    workingRepo = join(tmp.path, 'app-repo');

    // Live dict path (what the prod volume would hold)
    liveDictPath = join(tmp.path, 'live-dictionary.json');
    writeFileSync(liveDictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] },
    }, null, 2));

    // Seed origin with an initial commit on `dictionary`
    const seedDir = join(tmp.path, 'seed');
    mkdirSync(seedDir);
    const seedGit = simpleGit(seedDir);
    await seedGit.init();
    await seedGit.addConfig('user.email', 'seed@example.com');
    await seedGit.addConfig('user.name', 'seed');
    mkdirSync(join(seedDir, 'data'));
    writeFileSync(join(seedDir, 'data', 'live-dictionary.json'), '{}');
    await seedGit.add('.');
    await seedGit.commit('seed');
    await seedGit.addRemote('origin', originRepo);
    await seedGit.branch(['-M', 'dictionary']);
    await seedGit.push('origin', 'dictionary');
  });

  afterEach(async () => {
    await tmp.cleanup();
  });

  it('runs a sync: clones if missing, writes live dict, commits, pushes', async () => {
    const { runDictionarySync } = await import('../../src/routes/admin-dictionary-sync.js?t=' + Date.now());
    const result = await runDictionarySync({
      liveDictPath,
      workingRepoDir: workingRepo,
      remoteUrl: originRepo,
      branch: 'dictionary',
      word: '火',
      authorName: 'test-bot',
      authorEmail: 'bot@test',
    });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(workingRepo, 'data', 'live-dictionary.json')));

    // Verify origin has the commit
    const verifyDir = join(tmp.path, 'verify');
    mkdirSync(verifyDir);
    await simpleGit(verifyDir).clone(originRepo, verifyDir, ['--branch', 'dictionary']);
    const content = JSON.parse(
      (await import('node:fs')).readFileSync(join(verifyDir, 'data', 'live-dictionary.json'), 'utf-8')
    );
    assert.equal(content['火'].definitions[0].en, 'fire');
    const log = await simpleGit(verifyDir).log();
    assert.match(log.latest.message, /dict: edit 火/);
  });

  it('reports failure when remote url is invalid', async () => {
    const { runDictionarySync } = await import('../../src/routes/admin-dictionary-sync.js?t=' + Date.now());
    const result = await runDictionarySync({
      liveDictPath,
      workingRepoDir: workingRepo,
      remoteUrl: 'file:///nonexistent/origin.git',
      branch: 'dictionary',
      word: '火',
      authorName: 'test-bot',
      authorEmail: 'bot@test',
    });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});
