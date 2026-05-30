import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createEmptyCard, State } from 'ts-fsrs';
import {
  clearSrsCache,
  configureSrs,
  getDeckCards,
  loadSrsData,
  saveSrsData,
} from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded,
  getActiveScriptType,
  getDueScriptCards,
  getNewScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  recordScriptIntro,
} from '../../../src/game/script-srs.js';

describe('script-srs', () => {
  let tempDir;
  const userId = 'script-user';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-script-srs-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache(userId);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('seeds a separate script deck without touching vocab', () => {
    ensureScriptDeckSeeded(userId);
    const script = getDeckCards(userId, 'script');
    const vocab = getDeckCards(userId, 'vocab');
    assert.equal(script.some(c => c.type === 'hiragana'), true);
    assert.equal(script.some(c => c.type === 'katakana'), true);
    assert.equal(script.some(c => c.type === 'kanji'), true);
    assert.equal(vocab.length, 0);
  });

  it('migrates legacy kana FSRS state into matching hiragana script cards once', () => {
    const data = loadSrsData(userId);
    const reviewed = { ...createEmptyCard(), char: 'あ', romaji: 'a', row: 0, reps: 3, state: State.Learning };
    data.kana = { cards: [reviewed] };
    saveSrsData(userId, data);

    ensureScriptDeckSeeded(userId);
    const card = getDeckCards(userId, 'script').find(c => c.id === 'hiragana:あ');
    assert.equal(card.reps, 3);
    assert.equal(card.state, State.Learning);
    assert.equal(loadSrsData(userId).scriptMigration?.kanaToScript, true);
  });

  it('selects hiragana until all hiragana script cards are Review', () => {
    ensureScriptDeckSeeded(userId);
    assert.equal(getActiveScriptType(userId), 'hiragana');
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.state = State.Review;
    }
    saveSrsData(userId, data);
    assert.equal(getActiveScriptType(userId), 'katakana');
  });

  it('returns due script cards for active type only', () => {
    ensureScriptDeckSeeded(userId);
    const due = getDueScriptCards(userId);
    assert.ok(due.length > 0);
    assert.equal(due.every(c => c.type === 'hiragana'), true);
  });

  it('tracks daily introduced count by local date', () => {
    ensureScriptDeckSeeded(userId);
    const today = '2026-05-31';
    assert.deepEqual(getScriptDailyState(userId, today), { date: today, introducedCount: 0, completed: false });
    recordScriptIntro(userId, today);
    assert.equal(getScriptDailyState(userId, today).introducedCount, 1);
  });

  it('grades script cards through FSRS', () => {
    ensureScriptDeckSeeded(userId);
    const card = getNewScriptCards(userId, 'hiragana')[0];
    const graded = gradeScriptCard(userId, card.id, 'good');
    assert.equal(graded.id, card.id);
    assert.equal(graded.reps > 0, true);
  });
});
