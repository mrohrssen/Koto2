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

  it('includes display-mode onboarding before the translator demo', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    const expectedIds = [
      'prologue-display-mode-question',
      'prologue-display-mode-kanji',
      'prologue-display-mode-hiragana',
      'prologue-display-mode-done',
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
    for (let i = 0; i < expectedIds.length; i++) {
      const idx = idx06 + 1 + i;
      assert.equal(ids[idx], expectedIds[i], `${expectedIds[i]} must appear immediately after prologue-06-intro in order`);
      assert.ok(idx < idx10, `${expectedIds[i]} must appear before prologue-10-disruption`);
    }
  });

  it('wires the display-mode choices to hiragana and natural modes', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const question = prologue.find(s => s.id === 'prologue-display-mode-question');
    assert.ok(question, 'display mode question should exist');
    assert.equal(question.speaker, 'Cid');
    assert.equal(question.narration, 'Do you know the Japanese alphabet Hiragana?');
    assert.deepEqual(question.choices, [
      { text: 'Yes, set Kanji mode', id: 'kanji-mode', displayMode: 'natural' },
      { text: 'No, set Hiragana mode until I learn it', id: 'hiragana-mode', displayMode: 'hiragana' },
    ]);

    const kanji = prologue.find(s => s.id === 'prologue-display-mode-kanji');
    assert.equal(kanji.conditional, 'kanji-mode');
    assert.equal(kanji.narration, "Great, I'll set the Translator to Kanji mode.");

    const hiragana = prologue.find(s => s.id === 'prologue-display-mode-hiragana');
    assert.equal(hiragana.conditional, 'hiragana-mode');
    assert.equal(hiragana.narration, "Great, I'll set the Translator to Hiragana mode.");

    const done = prologue.find(s => s.id === 'prologue-display-mode-done');
    assert.equal(done.narration, "You're all set! You can always adjust these settings yourself if you need to.");
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

  it('uses tap language for the word lookup instruction', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const instruction = prologue.find(s => s.id === 'prologue-translator-click');
    assert.ok(instruction, 'prologue-translator-click should exist');
    assert.match(instruction.narration, /tap any Japanese word/);
    assert.doesNotMatch(instruction.narration, /\bclick\b/i);
  });
});

describe('prologue client display-mode wiring', () => {
  it('calls the Japanese display mode API for choices with displayMode', () => {
    const gameJs = readFileSync(join(process.cwd(), 'public/game.js'), 'utf-8');
    assert.match(gameJs, /setJapaneseDisplayMode as apiSetJapaneseDisplayMode/);
    assert.match(gameJs, /chosen\.displayMode/);
    assert.match(gameJs, /apiSetJapaneseDisplayMode\(chosen\.displayMode\)/);
    assert.match(gameJs, /displayResult\?\.state/);
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
    assert.equal(demo.tokens[0].surface, 'こんにちは');
    assert.equal(demo.tokens[0].base, undefined, 'こんにちは is grammar (surface-only) after the allowlist reform');
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
