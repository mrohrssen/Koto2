import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';

let tempDir;

async function loadBugReportModule() {
  setDataDirForTest(tempDir);
  return import(`../../src/routes/bug-reports.js?test=${Date.now()}-${Math.random()}`);
}

async function createApp() {
  const { default: createBugReportRoutes } = await loadBugReportModule();
  const app = express();
  app.use(express.json());
  app.use('/api', createBugReportRoutes());
  return app;
}

function seedReport(id = 'report-one-123') {
  const reportDir = join(tempDir, 'bug-reports', id);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify({
    note: 'Seeded report',
    timestamp: '2026-06-02T12:00:00.000Z',
  }));
  return reportDir;
}

describe('bug reports route', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-bug-reports-'));
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    resetDataDirForTest();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('identifies safe bug report ids', async () => {
    const { isSafeBugReportId } = await loadBugReportModule();

    assert.equal(isSafeBugReportId('report-one-123'), true);
    assert.equal(isSafeBugReportId('../outside'), false);
  });

  it('rejects report directories outside the bug report root', async () => {
    const { resolveBugReportDir } = await loadBugReportModule();

    assert.throws(() => resolveBugReportDir(join(tempDir, 'bug-reports'), '../outside'), /Invalid report id/);
  });

  it('returns 403 when deleting without the admin secret header', async () => {
    process.env.ADMIN_SECRET = 'delete-secret';
    seedReport();

    const response = await request(await createApp())
      .delete('/api/bug-reports/report-one-123');

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: 'Forbidden' });
  });

  it('deletes a report with the matching admin secret header', async () => {
    process.env.ADMIN_SECRET = 'delete-secret';
    const reportDir = seedReport();

    const response = await request(await createApp())
      .delete('/api/bug-reports/report-one-123')
      .set('x-admin-secret', 'delete-secret');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true });
    assert.equal(existsSync(reportDir), false);
  });
});
