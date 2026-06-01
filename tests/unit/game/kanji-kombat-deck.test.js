import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearSrsCache, configureSrs, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded, getScriptDailyState, gradeScriptCard } from '../../../src/game/script-srs.js';
import {
  buildQuizForCard,
  chooseNextScriptWork,
  createInitialKanjiKombatState,
  getLocalDateKey,
  NO_DUE_DISCOVERY_CHAIN_LIMIT,
  resolveIntroChoice,
} from '../../../src/game/services/kanji-kombat-service.js';

describe('kanji-kombat deck controller', () => {
  let tempDir;
  const userId = 'kanji-kombat-user';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-deck-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache(userId);
    ensureScriptDeckSeeded(userId);
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('uses local date keys for daily state', () => {
    assert.match(getLocalDateKey(new Date('2026-05-31T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('builds four unique choices from the active script answer pool', () => {
    const data = loadSrsData(userId);
    const card = data.script.cards.find(c => c.id === 'hiragana:あ');
    const quiz = buildQuizForCard(card, data.script.cards.filter(c => c.type === 'hiragana'), () => 0.5);
    assert.equal(quiz.cardId, 'hiragana:あ');
    assert.equal(quiz.prompt, 'あ');
    assert.equal(quiz.choices.length, 4);
    assert.equal(new Set(quiz.choices.map(c => c.answer)).size, 4);
    assert.equal(quiz.choices.some(c => c.correct), true);
  });

  it('chooses a due card before introducing a new card when interval has not fired', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'quiz');
    assert.equal(work.card.type, 'hiragana');
    assert.equal(state.currentQuiz.cardId, work.card.id);
  });

  it('introduces a new card when no due cards exist and daily cap remains', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'intro');
    assert.equal(work.card.type, 'hiragana');
    assert.equal(state.pendingIntro.cardId, work.card.id);
  });

  it('stops for the day when no due cards exist and daily cap is exhausted', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
      card.reps = 1;
    }
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: 20, completed: false };
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'complete');
    assert.equal(state.report.completedDaily, true);
  });

  it('honors completed daily state even if new cards remain', () => {
    const data = loadSrsData(userId);
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: 5, completed: true };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { now: new Date('2026-05-31T00:00:00Z') });

    assert.equal(work.kind, 'complete');
    assert.equal(state.report.completedDaily, true);
  });

  it('intro choice grades the card and increments daily count without returning a quiz for same presentation', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const card = chooseNextScriptWork(userId, state, { now: new Date('2026-05-31T00:00:00Z') }).card;
    const result = resolveIntroChoice(userId, state, card.id, 'known', { now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(result.graded.id, card.id);
    assert.equal(result.next.kind === 'quiz' || result.next.kind === 'intro' || result.next.kind === 'complete', true);
    assert.notEqual(result.next.card?.id, card.id);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 1);
  });

  it('resets intro spacing after a discovery so discoveries do not chain', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    state.reviewsSinceIntro = state.nextIntroAfter;
    const intro = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    assert.equal(intro.kind, 'intro');

    const result = resolveIntroChoice(userId, state, intro.card.id, 'known', {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(state.reviewsSinceIntro, 0);
    assert.equal(state.nextIntroAfter, 3);
    assert.equal(result.next.kind, 'quiz');
  });

  it('chains up to five discoveries when no cards are due, then tests that batch', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const seen = [];
    let work = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    for (let i = 0; i < NO_DUE_DISCOVERY_CHAIN_LIMIT; i++) {
      assert.equal(work.kind, 'intro');
      seen.push(work.card.id);
      const result = resolveIntroChoice(userId, state, work.card.id, 'known', {
        random: () => 0,
        now: new Date('2026-05-31T00:00:00Z'),
      });
      work = result.next;
    }

    assert.equal(work.kind, 'quiz');
    assert.equal(seen.includes(work.quiz.cardId), true);
    assert.equal(state.noDueDiscoveryChainCount, NO_DUE_DISCOVERY_CHAIN_LIMIT);
    assert.equal(new Set(seen).size, NO_DUE_DISCOVERY_CHAIN_LIMIT);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, NO_DUE_DISCOVERY_CHAIN_LIMIT);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  });

  it('starts another no-due discovery batch after testing the previous batch', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    let work = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    for (let i = 0; i < NO_DUE_DISCOVERY_CHAIN_LIMIT; i++) {
      work = resolveIntroChoice(userId, state, work.card.id, 'known', {
        random: () => 0,
        now: new Date('2026-05-31T00:00:00Z'),
      }).next;
    }

    const practiced = [];
    for (let i = 0; i < NO_DUE_DISCOVERY_CHAIN_LIMIT; i++) {
      assert.equal(work.kind, 'quiz');
      practiced.push(work.quiz.cardId);
      gradeScriptCard(userId, work.quiz.cardId, 'good');
      state.currentQuiz = null;
      work = chooseNextScriptWork(userId, state, {
        random: () => 0,
        now: new Date('2026-05-31T00:00:00Z'),
      });
    }

    assert.equal(new Set(practiced).size, NO_DUE_DISCOVERY_CHAIN_LIMIT);
    assert.equal(work.kind, 'intro');
    assert.equal(state.noDueDiscoveryChainCount, 1);
  });

  it('returns to pending no-due practice after an interrupted due review', () => {
    const data = loadSrsData(userId);
    const hiragana = data.script.cards.filter(c => c.type === 'hiragana');
    const practiceIds = hiragana.slice(0, NO_DUE_DISCOVERY_CHAIN_LIMIT).map(card => card.id);
    for (const card of hiragana) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    for (const card of hiragana.slice(0, NO_DUE_DISCOVERY_CHAIN_LIMIT)) {
      card.reps = 1;
    }
    hiragana[NO_DUE_DISCOVERY_CHAIN_LIMIT].reps = 1;
    hiragana[NO_DUE_DISCOVERY_CHAIN_LIMIT].due = new Date('2026-05-30T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    state.noDueDiscoveryChainCount = NO_DUE_DISCOVERY_CHAIN_LIMIT;
    state.noDuePracticeQueue = [...practiceIds];

    const due = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    assert.equal(due.kind, 'quiz');
    assert.equal(due.quiz.cardId, hiragana[NO_DUE_DISCOVERY_CHAIN_LIMIT].id);
    assert.equal(state.noDueDiscoveryChainCount, 0);

    const updated = loadSrsData(userId);
    updated.script.cards.find(card => card.id === due.quiz.cardId).due = new Date('2099-01-01T00:00:00Z');
    saveSrsData(userId, updated);
    state.currentQuiz = null;

    const practice = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    assert.equal(practice.kind, 'quiz');
    assert.equal(practice.quiz.cardId, practiceIds[0]);
  });
});
