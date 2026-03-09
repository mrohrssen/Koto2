import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

let createForgeRouter;
const testBase = join(import.meta.dirname, '../../../tmp/test-forge-routes');
const themesDir = join(testBase, 'themes');
const dataDir = join(testBase, 'data');

function mockReq(overrides = {}) {
  return { params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; }
  };
  return res;
}

/** Write a minimal theme JSON file for testing */
function writeTheme(id, words = []) {
  const theme = {
    themeId: id,
    areaWord: '学校',
    areaReading: 'がっこう',
    areaMeaning: 'school',
    computedStage: 3,
    words
  };
  writeFileSync(join(themesDir, `${id}.json`), JSON.stringify(theme, null, 2));
}

before(async () => {
  const mod = await import('../../../src/routes/forge.js');
  createForgeRouter = mod.createForgeRouter;
});

beforeEach(() => {
  mkdirSync(themesDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testBase)) rmSync(testBase, { recursive: true });
});

describe('getThemes', () => {
  it('lists themes with progress stats', async () => {
    writeTheme('school', [
      { word: '教える', reading: 'おしえる', meaning: 'to teach', rank: 300, roles: ['move'], assigned: 'move:oshieru' },
      { word: '覚える', reading: 'おぼえる', meaning: 'to memorize', rank: 300, roles: ['creature'], assigned: null },
      { word: '忘れる', reading: 'わすれる', meaning: 'to forget', rank: 300, roles: ['move'], assigned: null }
    ]);

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq();
    const res = mockRes();

    await router._handlers.getThemes(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.themes));
    assert.strictEqual(res.body.themes.length, 1);

    const theme = res.body.themes[0];
    assert.strictEqual(theme.themeId, 'school');
    assert.strictEqual(theme.totalWords, 3);
    assert.strictEqual(theme.assignedWords, 1);
    assert.strictEqual(theme.progress, 33);
  });
});

describe('getTheme', () => {
  it('returns full theme pool JSON', async () => {
    writeTheme('school', [
      { word: '教える', reading: 'おしえる', meaning: 'to teach', rank: 300, roles: ['move'], assigned: null }
    ]);

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({ params: { id: 'school' } });
    const res = mockRes();

    await router._handlers.getTheme(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.themeId, 'school');
    assert.strictEqual(res.body.words.length, 1);
  });

  it('returns 404 for missing theme', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({ params: { id: 'nonexistent' } });
    const res = mockRes();

    await router._handlers.getTheme(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.ok(res.body.error);
  });
});

describe('postQueue', () => {
  it('appends jobs to queue file', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({
      body: {
        themeId: 'school',
        jobs: [
          { word: '教える', reading: 'おしえる', meaning: 'to teach', rank: 300, role: 'creature', notes: 'test' }
        ]
      }
    });
    const res = mockRes();

    await router._handlers.postQueue(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.jobs);
    assert.strictEqual(res.body.jobs.length, 1);
    assert.ok(res.body.jobs[0].id.startsWith('forge_'));

    // Verify file was created
    const queuePath = join(dataDir, 'forge-queue.json');
    assert.ok(existsSync(queuePath));
    const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
    assert.strictEqual(queue.jobs.length, 1);
  });

  it('returns 400 when themeId is missing', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({ body: { jobs: [{ word: 'x' }] } });
    const res = mockRes();

    await router._handlers.postQueue(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when jobs is missing', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({ body: { themeId: 'school' } });
    const res = mockRes();

    await router._handlers.postQueue(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error);
  });
});

describe('getQueue', () => {
  it('reads queue file', async () => {
    const queuePath = join(dataDir, 'forge-queue.json');
    writeFileSync(queuePath, JSON.stringify({ jobs: [{ id: 'j1', status: 'pending' }] }));

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq();
    const res = mockRes();

    await router._handlers.getQueue(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.jobs.length, 1);
  });
});

describe('getResults', () => {
  it('reads results file', async () => {
    const resultsPath = join(dataDir, 'forge-results.json');
    writeFileSync(resultsPath, JSON.stringify({ results: [{ jobId: 'j1', data: {} }] }));

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq();
    const res = mockRes();

    await router._handlers.getResults(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.results.length, 1);
  });
});

describe('postApprove', () => {
  it('writes to staging file, marks assigned, removes result', async () => {
    // Set up queue with a job
    const queuePath = join(dataDir, 'forge-queue.json');
    writeFileSync(queuePath, JSON.stringify({
      jobs: [{ id: 'j1', themeId: 'school', word: '教える', role: 'creature', status: 'complete' }]
    }));

    // Set up results with a result for this job
    const resultsPath = join(dataDir, 'forge-results.json');
    writeFileSync(resultsPath, JSON.stringify({
      results: [{
        jobId: 'j1',
        role: 'creature',
        themeId: 'school',
        data: { id: 'oshieru', name: '教える' }
      }]
    }));

    // Set up a theme with the word
    writeTheme('school', [
      { word: '教える', reading: 'おしえる', meaning: 'to teach', rank: 300, roles: ['creature'], assigned: null }
    ]);

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({
      body: {
        jobId: 'j1',
        editedData: { id: 'oshieru', name: '教える', nameEn: 'Oshieru' }
      }
    });
    const res = mockRes();

    await router._handlers.postApprove(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.success);
    assert.strictEqual(res.body.role, 'creature');
    assert.strictEqual(res.body.id, 'oshieru');

    // Verify staging file was created
    const stagingPath = join(dataDir, 'new-creatures-staging.json');
    assert.ok(existsSync(stagingPath));
    const staging = JSON.parse(readFileSync(stagingPath, 'utf8'));
    assert.strictEqual(staging.length, 1);
    assert.strictEqual(staging[0].id, 'oshieru');

    // Verify result was removed
    const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
    assert.strictEqual(results.results.length, 0);

    // Verify theme word was marked assigned
    const theme = JSON.parse(readFileSync(join(themesDir, 'school.json'), 'utf8'));
    const word = theme.words.find(w => w.word === '教える');
    assert.strictEqual(word.assigned, 'creature:oshieru');

    // Verify job status was updated
    const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
    assert.strictEqual(queue.jobs[0].status, 'approved');
  });
});

describe('postDiscard', () => {
  it('removes result and updates job status', async () => {
    // Set up queue with a job
    const queuePath = join(dataDir, 'forge-queue.json');
    writeFileSync(queuePath, JSON.stringify({
      jobs: [{ id: 'j1', themeId: 'school', word: '教える', role: 'creature', status: 'complete' }]
    }));

    // Set up results with a result for this job
    const resultsPath = join(dataDir, 'forge-results.json');
    writeFileSync(resultsPath, JSON.stringify({
      results: [{
        jobId: 'j1',
        role: 'creature',
        themeId: 'school',
        data: { id: 'oshieru', name: '教える' }
      }]
    }));

    const router = createForgeRouter({ themesDir, dataDir });
    const req = mockReq({ body: { jobId: 'j1' } });
    const res = mockRes();

    await router._handlers.postDiscard(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.success);

    // Verify result was removed
    const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
    assert.strictEqual(results.results.length, 0);

    // Verify job status was updated
    const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
    assert.strictEqual(queue.jobs[0].status, 'discarded');
  });
});
