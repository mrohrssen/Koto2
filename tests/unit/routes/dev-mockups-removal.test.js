import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDevRouter } from '../../../src/routes/dev.js';

const root = process.cwd();

function createApp() {
  const app = express();
  app.use('/dev', createDevRouter({ password: '' }));
  return app;
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

  it('removes mockups links from dev navigation files', () => {
    const navFiles = [
      'public/dev-hub.html',
      'public/dev-sprites.html',
      'public/dev-content.html',
      'public/forge.html',
      'public/creatures-gallery.html',
      'public/regen-review.html',
      'public/assets/sprites/items/review.html',
      'public/mockup-combat-area-header.html',
    ];

    for (const file of navFiles) {
      const html = readFileSync(join(root, file), 'utf8');
      assert.equal(html.includes('/dev/mockups'), false, `${file} still links /dev/mockups`);
      assert.equal(/Feature Mockups/i.test(html), false, `${file} still labels Feature Mockups`);
    }
  });
});
