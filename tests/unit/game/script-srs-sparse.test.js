import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  configureSrs, clearSrsCache, clearSrsData, loadSrsData, saveSrsData,
} from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded, getScriptCards, getDueScriptCardsForTypes,
  gradeScriptCard, clearScriptDeckMemo, SCRIPT_DECK,
} from '../../../src/game/script-srs.js';

const USER = 'sparse-test-user';

describe('sparse script SRS storage', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'srs-sparse-'));
    configureSrs({ dataDir: dir });
    clearSrsData(USER);
    clearScriptDeckMemo(USER);
  });
  afterEach(() => {
    clearSrsData(USER);
    clearScriptDeckMemo(USER);
    configureSrs({ dataDir: 'data/' });
    rmSync(dir, { recursive: true, force: true });
  });

  const srsFile = () => join(dir, `srs-${USER}.json`);

  it('reads never write to disk', () => {
    ensureScriptDeckSeeded(USER); // may write once (seed structures)
    const before = statSync(srsFile()).mtimeMs;
    for (let i = 0; i < 20; i++) {
      getScriptCards(USER);
      getDueScriptCardsForTypes(USER);
    }
    assert.equal(statSync(srsFile()).mtimeMs, before);
  });

  it('merged view exposes the full static deck', () => {
    const cards = getScriptCards(USER);
    assert.ok(cards.length >= 4000, `expected full deck, got ${cards.length}`);
  });

  it('persists only graded cards', () => {
    const first = getScriptCards(USER, 'hiragana')[0];
    gradeScriptCard(USER, first.id, 'good');
    const stored = JSON.parse(readFileSync(srsFile(), 'utf-8'));
    assert.equal(stored[SCRIPT_DECK].cards.length, 1);
    assert.equal(stored[SCRIPT_DECK].cards[0].id, first.id);
    assert.ok(stored[SCRIPT_DECK].cards[0].reps > 0);
  });

  it('graded progress survives cache clear via merge', () => {
    const first = getScriptCards(USER, 'hiragana')[0];
    gradeScriptCard(USER, first.id, 'good');
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);
    const reloaded = getScriptCards(USER).find(c => c.id === first.id);
    assert.ok(reloaded.reps > 0);
    assert.equal(getScriptCards(USER).length >= 4000, true);
  });

  it('compacts legacy fat files on first load', () => {
    // Simulate the old format: every static card persisted, one with progress
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);
    const data = loadSrsData(USER);
    const fatCards = getScriptCards(USER).map(c => ({ ...c }));
    fatCards[0] = { ...fatCards[0], reps: 3, state: 2 };
    data[SCRIPT_DECK] = { cards: fatCards };
    saveSrsData(USER, data);
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);

    ensureScriptDeckSeeded(USER); // triggers compaction
    const stored = JSON.parse(readFileSync(srsFile(), 'utf-8'));
    assert.equal(stored[SCRIPT_DECK].cards.length, 1);
    assert.equal(stored[SCRIPT_DECK].cards[0].id, fatCards[0].id);
    // merged view still full and carries the progress
    const merged = getScriptCards(USER).find(c => c.id === fatCards[0].id);
    assert.equal(merged.reps, 3);
  });
});
