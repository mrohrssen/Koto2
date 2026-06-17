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
import { KANJI_SCRIPT_CARDS } from '../../../src/game/script-decks.js';

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
    const data = loadSrsData(userId);
    const reviewed = data.script.cards.find(c => c.id === 'hiragana:あ');
    reviewed.reps = 1;
    reviewed.due = new Date('2026-05-30T00:00:00Z');
    saveSrsData(userId, data);
    const due = getDueScriptCards(userId);
    assert.ok(due.length > 0);
    assert.equal(due.every(c => c.type === 'hiragana'), true);
    assert.equal(due.some(c => c.reps === 0), false);
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

  it('seeds all 4000 Koto kanji cards in frequency order', () => {
    const cards = ensureScriptDeckSeeded(userId);
    const kanji = cards.filter(card => card.type === 'kanji');

    assert.equal(kanji.length, 4000);
    assert.deepEqual(kanji.map(card => card.id), KANJI_SCRIPT_CARDS.map(card => card.id));
    assert.deepEqual(kanji.slice(0, 4).map(card => card.id), ['kanji:人', 'kanji:言', 'kanji:見', 'kanji:一']);
    assert.deepEqual(kanji.slice(0, 4).map(card => card.frequencyRank), [1, 2, 3, 4]);
    assert.equal(kanji[0].sortIndex, 1);
    assert.equal(kanji[3999].sortIndex, 4000);
  });

  it('refreshes kanji answer and keyword while preserving reviewed SRS progress', () => {
    ensureScriptDeckSeeded(userId);
    const staticCard = KANJI_SCRIPT_CARDS[0];
    const data = loadSrsData(userId);
    const savedCard = data.script.cards.find(card => card.id === staticCard.id);

    savedCard.answer = 'old keyword';
    savedCard.keyword = 'old keyword';
    savedCard.stability = 12.5;
    savedCard.difficulty = 4.25;
    savedCard.elapsed_days = 14;
    savedCard.scheduled_days = 30;
    savedCard.reps = 7;
    savedCard.lapses = 1;
    savedCard.learning_steps = 2;
    savedCard.state = State.Review;
    savedCard.due = new Date('2099-01-01T00:00:00.000Z');
    savedCard.last_review = new Date('2098-12-01T00:00:00.000Z');
    saveSrsData(userId, data);

    ensureScriptDeckSeeded(userId);

    const refreshed = loadSrsData(userId).script.cards.find(card => card.id === staticCard.id);
    assert.equal(refreshed.answer, staticCard.answer);
    assert.equal(refreshed.keyword, staticCard.keyword);
    assert.equal(refreshed.stability, 12.5);
    assert.equal(refreshed.difficulty, 4.25);
    assert.equal(refreshed.elapsed_days, 14);
    assert.equal(refreshed.scheduled_days, 30);
    assert.equal(refreshed.reps, 7);
    assert.equal(refreshed.lapses, 1);
    assert.equal(refreshed.learning_steps, 2);
    assert.equal(refreshed.state, State.Review);
    assert.equal(refreshed.due.toISOString(), '2099-01-01T00:00:00.000Z');
    assert.equal(refreshed.last_review.toISOString(), '2098-12-01T00:00:00.000Z');
  });

  it('refreshes kanji radical metadata while preserving reviewed SRS progress', () => {
    ensureScriptDeckSeeded(userId);
    const staticCard = KANJI_SCRIPT_CARDS[0];
    const data = loadSrsData(userId);
    const savedCard = data.script.cards.find(card => card.id === staticCard.id);

    delete savedCard.radicals;
    savedCard.stability = 8.5;
    savedCard.difficulty = 3.25;
    savedCard.reps = 4;
    savedCard.state = State.Review;
    savedCard.due = new Date('2099-01-01T00:00:00.000Z');
    saveSrsData(userId, data);

    ensureScriptDeckSeeded(userId);

    const refreshed = loadSrsData(userId).script.cards.find(card => card.id === staticCard.id);
    assert.deepEqual(refreshed.radicals, staticCard.radicals);
    assert.equal(refreshed.stability, 8.5);
    assert.equal(refreshed.difficulty, 3.25);
    assert.equal(refreshed.reps, 4);
    assert.equal(refreshed.state, State.Review);
    assert.equal(refreshed.due.toISOString(), '2099-01-01T00:00:00.000Z');
  });

  it('returns new kanji in frequency order after hiragana and katakana graduate', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana' || c.type === 'katakana')) {
      card.state = State.Review;
    }
    saveSrsData(userId, data);

    assert.equal(getActiveScriptType(userId), 'kanji');
    const newKanji = getNewScriptCards(userId);
    assert.equal(newKanji.length, 4000);
    assert.deepEqual(newKanji.slice(0, 6).map(card => card.id), [
      'kanji:人',
      'kanji:言',
      'kanji:見',
      'kanji:一',
      KANJI_SCRIPT_CARDS[4].id,
      KANJI_SCRIPT_CARDS[5].id,
    ]);
  });

  it('uses katakana when hiragana is known without editing hiragana card progress', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    const card = data.script.cards.find(c => c.id === 'hiragana:あ');
    card.reps = 2;
    card.state = State.Learning;
    card.due = new Date('2026-05-30T00:00:00Z');
    card.last_review = new Date('2026-05-29T00:00:00Z');
    saveSrsData(userId, data);

    assert.equal(getActiveScriptType(userId, { knowsHiragana: true, knowsKatakana: false }), 'katakana');

    const savedCard = loadSrsData(userId).script.cards.find(c => c.id === 'hiragana:あ');
    assert.equal(savedCard.reps, 2);
    assert.equal(savedCard.state, State.Learning);
    assert.equal(savedCard.due.toISOString(), '2026-05-30T00:00:00.000Z');
    assert.equal(savedCard.last_review.toISOString(), '2026-05-29T00:00:00.000Z');
  });

  it('uses kanji when both kana scripts are known', () => {
    ensureScriptDeckSeeded(userId);

    assert.equal(getActiveScriptType(userId, { knowsHiragana: true, knowsKatakana: true }), 'kanji');
  });

  it('uses hiragana when kana scripts are not known without restarting progress', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    const card = data.script.cards.find(c => c.id === 'hiragana:あ');
    card.reps = 4;
    card.state = State.Learning;
    card.due = new Date('2026-05-30T00:00:00Z');
    saveSrsData(userId, data);

    assert.equal(getActiveScriptType(userId, { knowsHiragana: false, knowsKatakana: false }), 'hiragana');

    const savedCard = loadSrsData(userId).script.cards.find(c => c.id === 'hiragana:あ');
    assert.equal(savedCard.reps, 4);
    assert.equal(savedCard.state, State.Learning);
    assert.equal(savedCard.due.toISOString(), '2026-05-30T00:00:00.000Z');
  });
});
