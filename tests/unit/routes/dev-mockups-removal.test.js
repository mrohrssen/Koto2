import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createDevRouter } from '../../../src/routes/dev.js';

const root = process.cwd();

function createApp() {
  const app = express();
  app.use('/dev', createDevRouter({ password: '' }));
  return app;
}

function listPublicHtmlFiles(dir = join(root, 'public')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listPublicHtmlFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

describe('removed dev mockups surface', () => {
  it('does not serve the dev mockups page route', async () => {
    const response = await request(createApp()).get('/dev/mockups');
    assert.equal(response.status, 404);
  });

  it('does not serve the dev mockups API route', async () => {
    const response = await request(createApp()).get('/dev/api/mockups');
    assert.equal(response.status, 404);
  });

  it('removes mockups links from public runtime HTML', () => {
    for (const file of listPublicHtmlFiles()) {
      const html = readFileSync(file, 'utf8');
      assert.equal(html.includes('/dev/mockups'), false, `${file} still links /dev/mockups`);
      assert.equal(/Feature Mockups/i.test(html), false, `${file} still labels Feature Mockups`);
    }
  });
});
