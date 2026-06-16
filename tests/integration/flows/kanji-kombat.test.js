import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State } from 'ts-fsrs';
import { configureSrs, clearSrsCache, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded, SCRIPT_DECK } from '../../../src/game/script-srs.js';

describe('Kanji Kombat integration flow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-integration-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('kk-integration-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('starts, answers a quiz, and keeps normal room state untouched', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const gm = new GameManager();
    gm.userId = 'kk-integration-user';
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.combat.mode, 'kanjiKombat');

    for (let guard = 0; guard < 6 && activePrompt(gm)?.kind === 'intro'; guard++) {
      submitActiveIntro(gm, 'known');
    }
    const quiz = activeQuiz(gm);
    assert.ok(quiz, 'Kanji Kombat should have a quiz to answer after intro resolution');
    const correct = quiz.choices.find(choice => choice.correct);
    const result = submitActiveQuizAnswer(gm, correct.id);

    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(result.kanjiAnswerCorrect, true);
    assert.equal(Array.isArray(result.actionSegments), true);
    assert.equal(Array.isArray(result.enemies), true);
    if (result.nextWave) {
      assert.equal(Array.isArray(result.nextWaveEnemies), true);
    }
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.areasCompleted, 0);
    assert.equal(gm.run.postCombatShop == null, true);
    if (!result.combatEnded) {
      assert.ok(
        activePrompt(gm),
        'continuing Kanji Kombat combat should queue the next script prompt'
      );
    }
  });

  it('records no-due discoveries in the user script deck and queues them for practice', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    const introCard = activeIntro(gm)?.card;
    assert.ok(introCard, 'fresh no-due run should introduce a script card');
    const before = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === introCard.id);
    assert.ok(before, 'introduced card exists in the persisted script deck');
    assert.equal(before.reps || 0, 0);

    submitActiveIntro(gm, 'known');

    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === introCard.id);
    assert.equal(after.reps, 1);
    assert.ok(after.last_review instanceof Date);
    assert.equal(gm.run.kanjiKombat.noDuePracticeQueue.includes(introCard.id), true);
  });

  it('records correct quiz answers as good FSRS reviews', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map((card, index) => ({
      ...card,
      reps: 1,
      due: index === 0 ? new Date('2000-01-01') : new Date('2100-01-01'),
    }));
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    const quiz = activeQuiz(gm);
    assert.ok(quiz, 'precondition: due script card should produce a quiz');
    const before = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === quiz.cardId);
    const correct = quiz.choices.find(choice => choice.correct);

    submitActiveQuizAnswer(gm, correct.id);

    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === quiz.cardId);
    assert.equal(after.reps, before.reps + 1);
    assert.equal(after.lapses || 0, before.lapses || 0);
    assert.ok(after.last_review instanceof Date);
  });

  it('exposes buffered intro prompt cards to the UI without pendingIntro hydration', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');

    const state = gm.getState();
    const prompt = state.run.kanjiKombat.promptBuffer[0];

    assert.equal(state.run.kanjiKombat.pendingIntro, null);
    assert.equal(prompt.kind, 'intro');
    assert.equal(prompt.intro.card.id, prompt.cardId);
    assert.equal(typeof prompt.intro.card.answer, 'string');
  });

  it('prompts before ending when the script queue is exhausted mid-wave', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map((card, index) => ({
      ...card,
      reps: 1,
      due: index === 0 ? new Date('2000-01-01') : new Date('2100-01-01'),
    }));
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    gm.combat.enemies.forEach(enemy => {
      enemy.hp = 999;
      enemy.maxHp = 999;
    });

    const quiz = activeQuiz(gm);
    assert.ok(quiz, 'precondition: one due quiz should be available');
    const correct = quiz.choices.find(choice => choice.correct);
    const result = submitActiveQuizAnswer(gm, correct.id);

    assert.equal(result.combatEnded, false);
    assert.equal(result.completionChoicePending, true);
    assert.equal(gm.run.active, true);
    assert.equal(gm.combat.active, true);
    assert.equal(activePrompt(gm)?.kind, 'dailyCompletePrompt');
    assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.kind, 'quiz');
    assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.source, 'earlyReview');
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.report.completedDaily, true);

    const finished = resolveActiveCompletionChoice(gm, false);

    assert.equal(finished.combatEnded, true);
    assert.equal(finished.victory, true);
    assert.equal(gm.run.active, false);
    assert.equal(gm.combat.active, false);
    assert.equal(gm.run.kanjiKombat.report.completedDaily, true);
  });

  it('continues with early FSRS reviews after the completion prompt is accepted', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map((card, index) => ({
      ...card,
      reps: 1,
      due: index === 0 ? new Date('2000-01-01') : new Date('2100-01-01'),
    }));
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    gm.combat.enemies.forEach(enemy => {
      enemy.hp = 999;
      enemy.maxHp = 999;
    });

    const firstQuiz = activeQuiz(gm);
    submitActiveQuizAnswer(gm, firstQuiz.choices.find(choice => choice.correct).id);
    assert.equal(activePrompt(gm)?.kind, 'dailyCompletePrompt');
    assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.kind, 'quiz');
    assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.source, 'earlyReview');
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);

    const continued = resolveActiveCompletionChoice(gm, true);

    assert.equal(continued.combatEnded, false);
    assert.equal(gm.run.kanjiKombat.endlessMode, true);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(activePrompt(gm)?.kind, 'quiz', 'endless mode should queue an early review');

    const earlyQuiz = activeQuiz(gm);
    const before = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === earlyQuiz.cardId);
    submitActiveQuizAnswer(gm, earlyQuiz.choices.find(choice => choice.correct).id);
    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === earlyQuiz.cardId);

    assert.equal(after.reps, before.reps + 1);
    assert.ok(after.last_review instanceof Date);
  });

  it('onboarding false answers preserve existing script SRS progress', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    const card = data[SCRIPT_DECK].cards.find(candidate => candidate.id === 'hiragana:あ');
    card.reps = 7;
    card.state = State.Learning;
    card.due = new Date('2026-05-30T00:00:00Z');
    card.last_review = new Date('2026-05-29T00:00:00Z');
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: false, knowsHiragana: null, knowsKatakana: null },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    assert.equal(gm.run.kanjiKombat.onboardingPending, true);

    gm.kanjiKombatService.submitOnboarding({ knowsHiragana: false, knowsKatakana: false });

    const savedCard = loadSrsData(userId)[SCRIPT_DECK].cards.find(candidate => candidate.id === 'hiragana:あ');
    assert.equal(savedCard.reps, 7);
    assert.equal(savedCard.state, State.Learning);
    assert.equal(savedCard.due.toISOString(), '2026-05-30T00:00:00.000Z');
    assert.equal(savedCard.last_review.toISOString(), '2026-05-29T00:00:00.000Z');
    assert.equal(gm.run.kanjiKombat.report.scriptDeck, 'hiragana');
  });
});

function activePrompt(gm) {
  return gm.run?.kanjiKombat?.promptBuffer?.[0] || null;
}

function isDailyCompletePrompt(prompt) {
  return prompt?.kind === 'dailyCompletePrompt' || prompt?.kind === 'completePrompt';
}

function promptRef(prompt) {
  return {
    promptId: prompt.promptId,
    sequence: prompt.sequence,
    cardId: prompt.cardId,
  };
}

function activeIntro(gm) {
  const prompt = activePrompt(gm);
  return prompt?.kind === 'intro' ? prompt.intro : null;
}

function activeQuiz(gm) {
  const prompt = activePrompt(gm);
  return prompt?.kind === 'quiz' ? prompt.quiz : null;
}

function submitActiveIntro(gm, choice) {
  const prompt = activePrompt(gm);
  assert.equal(prompt?.kind, 'intro');
  return gm.kanjiKombatService.submitIntroChoice(prompt.cardId, choice, promptRef(prompt));
}

function submitActiveQuizAnswer(gm, answerId) {
  const prompt = activePrompt(gm);
  assert.equal(prompt?.kind, 'quiz');
  return gm.submitKanjiKombatAnswer(answerId, { promptRef: promptRef(prompt) });
}

function resolveActiveCompletionChoice(gm, keepGoing) {
  const prompt = activePrompt(gm);
  assert.equal(isDailyCompletePrompt(prompt), true);
  return gm.kanjiKombatService.resolveCompletionChoice(keepGoing, promptRef(prompt));
}
