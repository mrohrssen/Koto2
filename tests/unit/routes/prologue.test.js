import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import http from 'http';
import { loadDialoguePools } from '../../../src/game/dialogue-loader.js';
import createMiscRoutes from '../../../src/routes/game/misc.js';

const PROLOGUE_PATH = join(process.cwd(), 'data/prologue.json');

describe('prologue.json content', () => {
  it('does not include deprecated filler pages 07–09', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    assert.ok(!ids.includes('prologue-07-world'), 'prologue-07-world should be removed');
    assert.ok(!ids.includes('prologue-08-creatures'), 'prologue-08-creatures should be removed');
    assert.ok(!ids.includes('prologue-09-partners'), 'prologue-09-partners should be removed');
  });

  it('includes the five new translator-demo pages in order between 06 and 10', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    const demoIds = [
      'prologue-translator-try',
      'prologue-translator-how',
      'prologue-translator-demo',
      'prologue-translator-reaction',
      'prologue-translator-click',
    ];
    const idx06 = ids.indexOf('prologue-06-intro');
    const idx10 = ids.indexOf('prologue-10-disruption');
    assert.ok(idx06 >= 0, 'prologue-06-intro must exist');
    assert.ok(idx10 > idx06, 'prologue-10-disruption must follow 06');
    for (let i = 0; i < demoIds.length; i++) {
      const idx = ids.indexOf(demoIds[i]);
      assert.ok(idx > idx06, `${demoIds[i]} must appear after prologue-06-intro`);
      assert.ok(idx < idx10, `${demoIds[i]} must appear before prologue-10-disruption`);
      if (i > 0) {
        const prev = ids.indexOf(demoIds[i - 1]);
        assert.ok(idx === prev + 1, `${demoIds[i]} must immediately follow ${demoIds[i - 1]}`);
      }
    }
  });

  it('the jpDemo entry references tutorial-translator-demo by frameGroup', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const demo = prologue.find(s => s.id === 'prologue-translator-demo');
    assert.ok(demo, 'prologue-translator-demo should exist');
    assert.equal(demo.type, 'jpDemo');
    assert.equal(demo.speaker, 'Cid');
    assert.equal(demo.frameGroup, 'tutorial-translator-demo');
    assert.ok(!demo.tokens, 'tokens should not be inlined — server resolves them');
  });
});

// Helper — spins up the router on an ephemeral port, makes one GET, returns body
async function getJson(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.request(
        { host: '127.0.0.1', port, path, method: 'GET' },
        res => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => {
            server.close();
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        }
      );
      req.on('error', err => { server.close(); reject(err); });
      req.end();
    });
  });
}

describe('prologue route — GET /prologue', () => {
  it('attaches resolved tokens to jpDemo entries', async () => {
    // Dialogue pools must be loaded before the router resolves frame refs
    loadDialoguePools(join(process.cwd(), 'data'));

    const app = express();
    app.use('/', createMiscRoutes({
      getDebugMode: () => false,
      setDebugMode: () => {},
      getAllNpcDialogueCache: () => ({}),
      getAllCreatureDialogueCache: () => ({}),
      clearNpcDialogueCache: () => {},
      clearCreatureDialogueCache: () => {},
    }));

    const body = await getJson(app, '/prologue');
    assert.ok(Array.isArray(body), 'response should be an array of scenes');

    const demo = body.find(s => s.id === 'prologue-translator-demo');
    assert.ok(demo, 'demo entry should be present');
    assert.equal(demo.type, 'jpDemo');
    assert.ok(Array.isArray(demo.tokens), 'tokens should be attached as an array');
    assert.ok(demo.tokens.length >= 1, 'tokens should be non-empty');
    assert.equal(demo.tokens[0].base, 'こんにちは');
    assert.ok(demo.tokens[0].reading, 'token should carry reading');
    // Meaning is resolved at render-time from the dictionary, not baked into the token.
  });

  it('leaves non-jpDemo entries untouched', async () => {
    loadDialoguePools(join(process.cwd(), 'data'));

    const app = express();
    app.use('/', createMiscRoutes({
      getDebugMode: () => false,
      setDebugMode: () => {},
      getAllNpcDialogueCache: () => ({}),
      getAllCreatureDialogueCache: () => ({}),
      clearNpcDialogueCache: () => {},
      clearCreatureDialogueCache: () => {},
    }));

    const body = await getJson(app, '/prologue');
    const translator = body.find(s => s.id === 'prologue-04-translator');
    assert.ok(translator, 'non-demo entry should still be present');
    assert.ok(!translator.tokens, 'non-jpDemo entries should not get tokens');
    assert.ok(translator.narration, 'non-demo entries keep their narration');
  });
});
