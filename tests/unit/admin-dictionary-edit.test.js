import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTestTmpDir } from './helpers/tmp.js';

describe('admin-dictionary-edit', () => {
  let tmp;
  let app;
  let liveDictPath;
  let jmdictPath;
  const ADMIN_SECRET = 'test-secret';

  beforeEach(async () => {
    tmp = await createTestTmpDir();
    liveDictPath = join(tmp.path, 'live-dictionary.json');
    jmdictPath = join(tmp.path, 'latest-jm-dict.json');
    writeFileSync(liveDictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] },
    }));
    writeFileSync(jmdictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire (JMdict)', primary: true }] },
    }));

    process.env.ADMIN_SECRET = ADMIN_SECRET;
    delete process.env.DICTIONARY_READONLY;

    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now());
    app = express();
    app.use(express.json());
    app.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners: new Map(),
      onChange: () => {},
    }));
  });

  afterEach(async () => {
    await tmp.cleanup();
    delete process.env.ADMIN_SECRET;
    delete process.env.DICTIONARY_READONLY;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/dictionary/火');
    assert.equal(res.status, 403);
  });

  it('GET /:word returns live + jmdict + overlayOwner', async () => {
    const res = await request(app)
      .get('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET);
    assert.equal(res.status, 200);
    assert.equal(res.body.word, '火');
    assert.equal(res.body.live.reading, 'ひ');
    assert.equal(res.body.live.definitions[0].en, 'fire');
    assert.equal(res.body.jmdict.definitions[0].en, 'fire (JMdict)');
    assert.equal(res.body.overlayOwner, null);
  });

  it('PUT /:word writes and triggers onChange', async () => {
    let changed = false;
    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now() + 'a');
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners: new Map(),
      onChange: () => { changed = true; },
    }));
    const res = await request(app2)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({
        reading: 'ひ',
        definitions: [{ en: 'flame', primary: true }, { en: 'Tuesday' }],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.overlayOverridden, false);
    assert.equal(changed, true);

    const disk = JSON.parse(readFileSync(liveDictPath, 'utf-8'));
    assert.equal(disk['火'].definitions[0].en, 'flame');
    assert.equal(disk['火'].definitions[0].primary, true);
    assert.equal(disk['火'].definitions[1].en, 'Tuesday');
  });

  it('PUT invokes onChange (which the caller uses to invalidate caches)', async () => {
    // This test documents the contract: onChange must fire on successful write,
    // so the caller (admin-word-exposures.js) can call invalidateWordDict().
    let callCount = 0;
    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now() + 'c');
    const app4 = express();
    app4.use(express.json());
    app4.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners: new Map(),
      onChange: () => { callCount++; },
    }));
    const res = await request(app4)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 200);
    assert.equal(callCount, 1, 'onChange must fire exactly once per successful save');
  });

  it('PUT returns 400 when no definition is primary', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame' }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /primary/);
  });

  it('PUT returns 400 when multiple definitions are primary', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [
        { en: 'flame', primary: true },
        { en: 'Tuesday', primary: true },
      ] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 400 when reading is empty', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: '', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 400 when any en value is blank', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: '  ', primary: true }] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 403 when DICTIONARY_READONLY=true', async () => {
    process.env.DICTIONARY_READONLY = 'true';
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /disabled/);
  });

  it('PUT response reports overlayOverridden when overlayOwners has the word', async () => {
    const overlayOwners = new Map([['火', 'creatures.json']]);
    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now() + 'b');
    const app3 = express();
    app3.use(express.json());
    app3.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners,
      onChange: () => {},
    }));
    const res = await request(app3)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.overlayOverridden, true);
  });

  it('GET /-export returns JSON download', async () => {
    const res = await request(app)
      .get('/api/admin/dictionary/-export')
      .set('x-admin-secret', ADMIN_SECRET);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'] || '', /attachment/);
    // supertest parses JSON when content-type is application/json; the export endpoint
    // writes the body via res.send() so content-type comes from setHeader above.
    const parsed = JSON.parse(res.text);
    assert.equal(parsed['火'].reading, 'ひ');
  });
});
