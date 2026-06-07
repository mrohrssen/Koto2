import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State } from 'ts-fsrs';
import { clearSrsCache, configureSrs, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import { DAILY_NEW_LIMIT, ensureScriptDeckSeeded, getScriptDailyState, gradeScriptCard } from '../../../src/game/script-srs.js';
import {
  buildQuizForCard,
  chooseNextScriptWork,
  consumeKanjiKombatPromptHead,
  createInitialKanjiKombatState,
  fillKanjiKombatPromptBuffer,
  getKanjiKombatActivePrompt,
  getLocalDateKey,
  NO_DUE_DISCOVERY_CHAIN_LIMIT,
  PROMPT_BUFFER_REFILL_THRESHOLD,
  PROMPT_BUFFER_TARGET,
  resolveIntroChoice,
  validateKanjiKombatPromptHead,
} from '../../../src/game/services/kanji-kombat-service.js';

describe('kanji-kombat deck controller', () => {
  let tempDir;
  const userId = 'kanji-kombat-user';

  function summarizePrompts(prompts) {
    return prompts.map(prompt => ({
      kind: prompt.kind,
      cardId: prompt.cardId,
      source: prompt.source,
    }));
  }

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

  it('prompts for a completion choice when no due cards exist and daily cap is exhausted', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
      card.reps = 1;
    }
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: 20, completed: false };
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'completePrompt');
    assert.equal(state.completionChoicePending, true);
    assert.equal(state.report.completedDaily, true);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, true);
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

  it('reviews future cards early after the player chooses endless mode', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
      card.reps = 1;
    }
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: 20, completed: true };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    state.endlessMode = true;
    const work = chooseNextScriptWork(userId, state, {
      random: () => 0.5,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.card.type, 'hiragana');
    assert.equal(state.currentQuiz.cardId, work.card.id);
    assert.equal(state.completionChoicePending, false);
  });

  it('unknown intro choice grades the card and increments daily count without returning a quiz for same presentation', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const card = chooseNextScriptWork(userId, state, { now: new Date('2026-05-31T00:00:00Z') }).card;
    const result = resolveIntroChoice(userId, state, card.id, 'unknown', { now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(result.graded.id, card.id);
    assert.equal(result.next.kind === 'quiz' || result.next.kind === 'intro' || result.next.kind === 'complete', true);
    assert.notEqual(result.next.card?.id, card.id);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 1);
  });

  it('known intro choice grades the card without consuming a daily new-card slot', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const card = chooseNextScriptWork(userId, state, { now: new Date('2026-05-31T00:00:00Z') }).card;
    const result = resolveIntroChoice(userId, state, card.id, 'known', { now: new Date('2026-05-31T00:00:00Z') });

    assert.equal(result.graded.id, card.id);
    assert.equal(result.graded.reps, 1);
    assert.equal(result.graded.state, State.Review);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 0);
    assert.equal(state.report.newCardsIntroduced, 0);
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

  it('chains up to three discoveries when no cards are due, then tests that batch', () => {
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

    assert.equal(NO_DUE_DISCOVERY_CHAIN_LIMIT, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(work.kind, 'intro');
      seen.push(work.card.id);
      const result = resolveIntroChoice(userId, state, work.card.id, 'unknown', {
        random: () => 0,
        now: new Date('2026-05-31T00:00:00Z'),
      });
      work = result.next;
    }

    assert.equal(work.kind, 'quiz');
    assert.equal(seen.includes(work.quiz.cardId), true);
    assert.equal(state.noDueDiscoveryChainCount, 3);
    assert.equal(new Set(seen).size, 3);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 3);
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

  it('introduces the first unlearned kanji by frequency order once kana are graduated', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana' || c.type === 'katakana')) {
      card.state = State.Review;
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const first = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(first.kind, 'intro');
    assert.equal(first.card.id, 'kanji:人');
    assert.equal(first.card.frequencyRank, 1);

    const result = resolveIntroChoice(userId, state, first.card.id, 'unknown', {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 1);
    assert.notEqual(result.next.card?.id, 'kanji:人');
  });

  it('skips learned kanji and introduces the next frequency-ranked kanji', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana' || c.type === 'katakana')) {
      card.state = State.Review;
    }
    const firstKanji = data.script.cards.find(card => card.id === 'kanji:人');
    firstKanji.reps = 1;
    firstKanji.state = State.Learning;
    firstKanji.due = new Date('2099-01-01T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'intro');
    assert.equal(work.card.id, 'kanji:言');
    assert.equal(work.card.frequencyRank, 2);
  });

  it('fills a five-prompt server runway without mutating persistent daily completion', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2026-05-30T00:00:00Z');
      card.reps = 1;
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(PROMPT_BUFFER_TARGET, 5);
    assert.equal(PROMPT_BUFFER_REFILL_THRESHOLD, 3);
    assert.equal(prompts.length, 5);
    assert.equal(state.promptBuffer.length, 5);
    assert.equal(state.currentQuiz.cardId, state.promptBuffer[0].cardId);
    assert.equal(state.pendingIntro, null);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.promptId)).size, 5);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.cardId).filter(Boolean)).size, 5);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  });

  it('builds intro prompts in the buffer without recording daily intro counts', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(prompts[0].kind, 'intro');
    assert.equal(prompts[0].intro.card.id, prompts[0].cardId);
    assert.equal(prompts[0].source, 'noDueBatch');
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 0);
    assert.equal(state.pendingIntro.cardId, prompts[0].cardId);
  });

  it('validates and consumes only the canonical prompt head', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    const head = getKanjiKombatActivePrompt(state);
    assert.equal(validateKanjiKombatPromptHead(state, {
      promptId: head.promptId,
      sequence: head.sequence,
      cardId: head.cardId,
      kind: head.kind,
    }), head);
    assert.throws(
      () => validateKanjiKombatPromptHead(state, {
        promptId: 'kkp_wrong',
        sequence: head.sequence,
        cardId: head.cardId,
        kind: head.kind,
      }),
      /Kanji Kombat prompt mismatch/
    );

    const consumed = consumeKanjiKombatPromptHead(state, head);
    assert.equal(consumed.promptId, head.promptId);
    assert.notEqual(getKanjiKombatActivePrompt(state)?.promptId, head.promptId);
  });

  it('refills by replaying buffered prompts so partial planning matches a fresh full fill', () => {
    const data = loadSrsData(userId);
    const hiragana = data.script.cards.filter(c => c.type === 'hiragana');
    for (const card of hiragana.slice(0, 4)) {
      card.due = new Date('2026-05-30T00:00:00Z');
      card.reps = 1;
    }
    saveSrsData(userId, data);

    const partialState = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    partialState.reviewsSinceIntro = partialState.nextIntroAfter;
    fillKanjiKombatPromptBuffer(userId, partialState, {
      target: 3,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    const refilled = fillKanjiKombatPromptBuffer(userId, partialState, {
      target: 5,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    const freshState = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    freshState.reviewsSinceIntro = freshState.nextIntroAfter;
    const fresh = fillKanjiKombatPromptBuffer(userId, freshState, {
      target: 5,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.deepEqual(summarizePrompts(refilled), summarizePrompts(fresh));
    assert.deepEqual(refilled.map(prompt => prompt.kind), ['intro', 'quiz', 'quiz', 'quiz', 'intro']);
  });

  it('reserves virtual daily intro budget while previewing prompts', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    data.kanjiKombatDaily = {
      date: '2026-05-31',
      introducedCount: DAILY_NEW_LIMIT - 1,
      completed: false,
    };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.deepEqual(prompts.map(prompt => prompt.kind), ['intro', 'quiz', 'completePrompt']);
    assert.equal(prompts.filter(prompt => prompt.kind === 'intro').length, 1);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, DAILY_NEW_LIMIT - 1);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  });

  it('does not append after an existing completion prompt', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
      card.reps = 1;
    }
    data.kanjiKombatDaily = {
      date: '2026-05-31',
      introducedCount: DAILY_NEW_LIMIT,
      completed: false,
    };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.deepEqual(state.promptBuffer.map(prompt => prompt.kind), ['completePrompt']);
  });

  it('validates present prompt reference fields even when their values are falsy', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    fillKanjiKombatPromptBuffer(userId, state, {
      target: 1,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    const head = getKanjiKombatActivePrompt(state);

    assert.throws(
      () => validateKanjiKombatPromptHead(state, {
        promptId: '',
        sequence: head.sequence,
        cardId: head.cardId,
        kind: head.kind,
      }),
      /Kanji Kombat prompt mismatch/
    );
    assert.throws(
      () => validateKanjiKombatPromptHead(state, {
        promptId: head.promptId,
        sequence: head.sequence,
        cardId: null,
        kind: head.kind,
      }),
      /Kanji Kombat prompt mismatch/
    );
    assert.throws(
      () => validateKanjiKombatPromptHead(state, {
        promptId: head.promptId,
        sequence: head.sequence,
        cardId: head.cardId,
        kind: '',
      }),
      /Kanji Kombat prompt mismatch/
    );
  });

  it('continues prompt sequences from the buffered maximum when state sequence is missing', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2026-05-30T00:00:00Z');
      card.reps = 1;
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    fillKanjiKombatPromptBuffer(userId, state, {
      target: 1,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });
    delete state.promptBufferSeq;

    fillKanjiKombatPromptBuffer(userId, state, {
      target: 2,
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.deepEqual(state.promptBuffer.map(prompt => prompt.sequence), [1, 2]);
  });
});
