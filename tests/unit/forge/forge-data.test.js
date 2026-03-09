import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

let forgeData;
const testDir = join(import.meta.dirname, '../../../tmp/test-forge-data');

before(async () => {
  forgeData = await import('../../../src/forge/forge-data.js');
});

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

describe('readQueue', () => {
  it('returns empty jobs array when file does not exist', () => {
    const result = forgeData.readQueue(join(testDir, 'nope.json'));
    assert.deepStrictEqual(result, { jobs: [] });
  });

  it('reads existing queue file', () => {
    const path = join(testDir, 'queue.json');
    const data = { jobs: [{ id: 'test1', status: 'pending' }] };
    writeFileSync(path, JSON.stringify(data));
    const result = forgeData.readQueue(path);
    assert.strictEqual(result.jobs.length, 1);
    assert.strictEqual(result.jobs[0].id, 'test1');
  });
});

describe('appendJobs', () => {
  it('creates file and adds jobs when file does not exist', () => {
    const path = join(testDir, 'queue.json');
    const jobs = [{ word: '教える', role: 'creature', notes: '' }];
    const result = forgeData.appendJobs(path, jobs, 'school');
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].id.startsWith('forge_'));
    assert.strictEqual(result[0].status, 'pending');
    assert.strictEqual(result[0].themeId, 'school');
  });

  it('appends to existing jobs', () => {
    const path = join(testDir, 'queue.json');
    writeFileSync(path, JSON.stringify({ jobs: [{ id: 'existing', status: 'complete' }] }));
    forgeData.appendJobs(path, [{ word: '机', role: 'item', notes: 'desk' }], 'school');
    const queue = forgeData.readQueue(path);
    assert.strictEqual(queue.jobs.length, 2);
  });
});

describe('readResults', () => {
  it('returns empty results array when file does not exist', () => {
    const result = forgeData.readResults(join(testDir, 'nope.json'));
    assert.deepStrictEqual(result, { results: [] });
  });
});

describe('writeResult', () => {
  it('creates file and adds result', () => {
    const path = join(testDir, 'results.json');
    forgeData.writeResult(path, { jobId: 'forge_1', status: 'complete', data: { name: 'test' } });
    const results = forgeData.readResults(path);
    assert.strictEqual(results.results.length, 1);
    assert.strictEqual(results.results[0].jobId, 'forge_1');
  });
});

describe('updateJobStatus', () => {
  it('updates status of a specific job', () => {
    const path = join(testDir, 'queue.json');
    writeFileSync(path, JSON.stringify({ jobs: [{ id: 'j1', status: 'pending' }] }));
    forgeData.updateJobStatus(path, 'j1', 'processing');
    const queue = forgeData.readQueue(path);
    assert.strictEqual(queue.jobs[0].status, 'processing');
  });
});

describe('removeResult', () => {
  it('removes a result by jobId', () => {
    const path = join(testDir, 'results.json');
    const data = { results: [
      { jobId: 'j1', data: {} },
      { jobId: 'j2', data: {} }
    ]};
    writeFileSync(path, JSON.stringify(data));
    forgeData.removeResult(path, 'j1');
    const results = forgeData.readResults(path);
    assert.strictEqual(results.results.length, 1);
    assert.strictEqual(results.results[0].jobId, 'j2');
  });
});
